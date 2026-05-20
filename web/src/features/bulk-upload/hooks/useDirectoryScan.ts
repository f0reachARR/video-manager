import { useCallback, useEffect, useRef, useState } from "react";

import {
  type BulkUploadCheckResult,
  tournamentsApi,
} from "../../../lib/api/client";
import { hashHeadHex } from "../lib/hash";
import { listDirectoryFiles } from "../lib/fsAccess";
import { type MediaKind, classifyFile } from "../lib/mediaKind";

export type ScannedFile = {
  // Stable per-scan key: filename + size + mtime. We deliberately don't
  // memoize across scans so that a re-pick of the directory re-discovers
  // everything; server-side dedup means the round-trip is cheap.
  key: string;
  file: File;
  mediaKind: MediaKind;
  // Hashing happens in two phases. Until it finishes the file row shows
  // a "hashing" badge and is not yet eligible for upload.
  hashState: "pending" | "done" | "error";
  headHashHex?: string;
  hashError?: string;
  // checkState reflects the result of /bulk-uploads/check. "unknown"
  // initially; flips to "new" or "known" once the server responds.
  checkState: "unknown" | "new" | "known";
  knownResult?: BulkUploadCheckResult;
};

type State = {
  files: ScannedFile[];
  scanning: boolean;
  hashing: boolean;
  checking: boolean;
  error?: string;
};

const HASH_CONCURRENCY = 4;

// useDirectoryScan owns the (rescan → hash all → check all) pipeline.
// Each stage updates `files` in place so the UI can render progressive
// state (file appears immediately, hash badge resolves, then new/known
// badge resolves). The pipeline is keyed on `tournamentId` so changing
// the tournament re-runs the /check against the right dedup bucket.
export function useDirectoryScan(opts: {
  directory: FileSystemDirectoryHandle | null;
  tournamentId: string | null;
}) {
  const { directory, tournamentId } = opts;
  const [state, setState] = useState<State>({
    files: [],
    scanning: false,
    hashing: false,
    checking: false,
  });
  // We bump this token at the start of every scan so stale async tasks
  // from a previous scan can detect they were superseded and bail.
  const scanToken = useRef(0);

  const rescan = useCallback(async () => {
    if (!directory) return;
    const token = ++scanToken.current;
    setState((s) => ({ ...s, scanning: true, error: undefined }));

    // The user gesture that originally granted permission may have expired
    // (e.g. after a browser restart). Re-request quietly here so callers
    // don't have to.
    try {
      const perm = await (
        directory as unknown as {
          queryPermission?: (o: { mode: "read" }) => Promise<PermissionState>;
          requestPermission?: (o: { mode: "read" }) => Promise<PermissionState>;
        }
      ).queryPermission?.({ mode: "read" });
      if (perm && perm !== "granted") {
        const granted = await (
          directory as unknown as {
            requestPermission: (o: { mode: "read" }) => Promise<PermissionState>;
          }
        ).requestPermission({ mode: "read" });
        if (granted !== "granted") {
          throw new Error("ディレクトリの読み取り権限がありません");
        }
      }
    } catch (e) {
      setState((s) => ({
        ...s,
        scanning: false,
        error: e instanceof Error ? e.message : String(e),
      }));
      return;
    }

    let listed: { file: File; key: string }[];
    try {
      listed = await listDirectoryFiles(directory);
    } catch (e) {
      if (scanToken.current !== token) return;
      setState((s) => ({
        ...s,
        scanning: false,
        error: e instanceof Error ? e.message : String(e),
      }));
      return;
    }
    if (scanToken.current !== token) return;

    const next: ScannedFile[] = listed.map((it) => ({
      key: it.key,
      file: it.file,
      mediaKind: classifyFile(it.file),
      hashState: "pending",
      checkState: "unknown",
    }));
    setState((s) => ({ ...s, files: next, scanning: false, hashing: true }));

    // Hash files with bounded concurrency. crypto.subtle is non-blocking
    // and the body sizes are capped at 1 MiB, so a small pool keeps even
    // huge SD cards responsive without saturating CPU.
    const indexes = next.map((_, i) => i);
    let cursor = 0;
    const workers = Array.from({ length: HASH_CONCURRENCY }, async () => {
      while (cursor < indexes.length) {
        const i = cursor++;
        if (scanToken.current !== token) return;
        const sf = next[i];
        try {
          const hex = await hashHeadHex(sf.file);
          if (scanToken.current !== token) return;
          sf.headHashHex = hex;
          sf.hashState = "done";
        } catch (e) {
          sf.hashState = "error";
          sf.hashError = e instanceof Error ? e.message : String(e);
        }
        // Push a snapshot every few completions to avoid a per-file
        // re-render storm on huge directories.
        if (i % 8 === 0 || i === indexes.length - 1) {
          setState((s) =>
            s.files === next ? { ...s, files: [...next] } : s,
          );
        }
      }
    });
    await Promise.all(workers);
    if (scanToken.current !== token) return;
    setState((s) => ({ ...s, files: [...next], hashing: false }));

    if (!tournamentId) return;
    // Only files we could hash and could classify go to /check. Unknown
    // media-kind files stay "unknown" in the UI — the user must categorize
    // or ignore them.
    const checkable = next.filter(
      (f) => f.hashState === "done" && f.mediaKind !== "unknown",
    );
    if (checkable.length === 0) return;
    setState((s) => ({ ...s, checking: true }));
    try {
      const resp = await tournamentsApi.checkBulkUploads(tournamentId, {
        items: checkable.map((f) => ({
          headHashHex: f.headHashHex as string,
          sizeBytes: f.file.size,
          filename: f.file.name,
          mediaKind: f.mediaKind as "video" | "image",
        })),
      });
      if (scanToken.current !== token) return;
      const byKey = new Map<string, BulkUploadCheckResult>();
      for (const r of resp.results) {
        byKey.set(`${r.headHashHex}|${r.sizeBytes}`, r);
      }
      for (const f of next) {
        if (!f.headHashHex) continue;
        const r = byKey.get(`${f.headHashHex}|${f.file.size}`);
        if (!r) continue;
        f.checkState = r.known ? "known" : "new";
        f.knownResult = r;
      }
      setState((s) => ({ ...s, files: [...next], checking: false }));
    } catch (e) {
      if (scanToken.current !== token) return;
      setState((s) => ({
        ...s,
        checking: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, [directory, tournamentId]);

  // Auto-scan when either input changes. This is the main entry point —
  // mounting the route with a remembered directory triggers a scan
  // without an extra click.
  useEffect(() => {
    if (!directory) {
      setState({ files: [], scanning: false, hashing: false, checking: false });
      return;
    }
    void rescan();
  }, [directory, tournamentId, rescan]);

  return { ...state, rescan };
}
