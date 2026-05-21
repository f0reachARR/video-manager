import { useEffect, useRef, useState } from "react";
import { Upload } from "tus-js-client";

import type { ScannedFile } from "./useDirectoryScan";

const TUSD_ENDPOINT =
  (import.meta.env.VITE_TUSD_ENDPOINT as string | undefined) ?? "/files/";

export type BulkVideoUploadItem = {
  // We re-use the scan key so the UI can correlate row → upload state.
  key: string;
  filename: string;
  size: number;
  bytesUploaded: number;
  progress: number;
  state: "uploading" | "done" | "error" | "canceled";
  error?: string;
  upload: Upload;
  // Populated from the tus post-finish response body once the server
  // creates the Video row. Used by the P6 Run-creation shortcut.
  videoId?: string;
};

type UploadParams = {
  tournamentId: string;
  sessionId: string;
  uploaderId: string | null;
};

// useVideoBulkUpload is purpose-built for the bulk-upload screen: each
// file carries its own headHashHex + sizeBytes metadata so the tus
// post-finish hook can record a fingerprint without an extra round trip.
// We don't reuse `useTusUpload` here because that hook reads metadata
// from a global getter and we need per-file values.
export function useVideoBulkUpload(params: UploadParams | null) {
  const [items, setItems] = useState<BulkVideoUploadItem[]>([]);
  const itemsRef = useRef<BulkVideoUploadItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Resume "error" uploads when the network comes back. tus-js-client
  // retries within its own retryDelays window; this catches the case
  // where the delay list is exhausted.
  useEffect(() => {
    const onOnline = () => {
      for (const it of itemsRef.current) {
        if (it.state !== "error") continue;
        setItems((u) =>
          u.map((x) =>
            x.key === it.key
              ? { ...x, state: "uploading", error: undefined }
              : x,
          ),
        );
        it.upload.start();
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Confirm-on-close while uploads are in flight so the user doesn't
  // lose an SD-card transfer to an accidental Cmd+W.
  useEffect(() => {
    const active = items.some((u) => u.state === "uploading");
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      (e as { returnValue: string }).returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [items]);

  const startMany = (files: ScannedFile[]) => {
    if (!params) return;
    for (const sf of files) {
      if (!sf.headHashHex) continue;
      // Avoid double-starting the same key while a previous upload is in
      // flight. Re-uploading a "done" file is allowed (e.g. after a
      // dedup-cache clear), so only block "uploading".
      if (
        itemsRef.current.some(
          (x) => x.key === sf.key && x.state === "uploading",
        )
      ) {
        continue;
      }
      const meta: Record<string, string> = {
        filename: sf.file.name,
        filetype: sf.file.type || "application/octet-stream",
        tournamentId: params.tournamentId,
        sessionId: params.sessionId,
        headHashHex: sf.headHashHex,
        sizeBytes: String(sf.file.size),
      };
      if (params.uploaderId) meta.uploaderId = params.uploaderId;
      const update = (patch: Partial<BulkVideoUploadItem>) =>
        setItems((u) =>
          u.map((x) => (x.key === sf.key ? { ...x, ...patch } : x)),
        );
      // We capture the tus completion response to extract the X-Video-Id
      // header (set by the API's post-finish hook). tus-js-client doesn't
      // give us the final response in `onSuccess`, so we tap each
      // response via `onAfterResponse` and remember the most recent
      // video id for this upload — the final PATCH gets the header.
      let capturedVideoId: string | undefined;
      const upload = new Upload(sf.file, {
        endpoint: TUSD_ENDPOINT,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        chunkSize: 8 * 1024 * 1024,
        removeFingerprintOnSuccess: true,
        metadata: meta,
        onAfterResponse(_req, res) {
          const v = res.getHeader("X-Video-Id");
          if (v) capturedVideoId = v;
        },
        onError(err) {
          update({ state: "error", error: err.message });
        },
        onProgress(sent, total) {
          const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
          update({ progress: pct, bytesUploaded: sent });
        },
        onSuccess() {
          update({
            state: "done",
            progress: 100,
            videoId: capturedVideoId,
          });
        },
      });
      const item: BulkVideoUploadItem = {
        key: sf.key,
        filename: sf.file.name,
        size: sf.file.size,
        bytesUploaded: 0,
        progress: 0,
        state: "uploading",
        upload,
      };
      setItems((u) => [...u.filter((x) => x.key !== sf.key), item]);
      upload.start();
    }
  };

  const cancel = (key: string) => {
    const it = itemsRef.current.find((x) => x.key === key);
    if (!it) return;
    it.upload.abort().catch(() => {});
    setItems((u) =>
      u.map((x) => (x.key === key ? { ...x, state: "canceled" } : x)),
    );
  };

  const retry = (key: string) => {
    const it = itemsRef.current.find((x) => x.key === key);
    if (!it) return;
    setItems((u) =>
      u.map((x) =>
        x.key === key ? { ...x, state: "uploading", error: undefined } : x,
      ),
    );
    it.upload.start();
  };

  const clearFinished = () => {
    setItems((u) =>
      u.filter((x) => x.state === "uploading" || x.state === "error"),
    );
  };

  return { items, startMany, cancel, retry, clearFinished };
}
