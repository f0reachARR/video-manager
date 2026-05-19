import { useEffect, useRef, useState } from "react";
import { Upload } from "tus-js-client";

const TUSD_ENDPOINT =
  (import.meta.env.VITE_TUSD_ENDPOINT as string | undefined) ??
  "http://localhost:1080/files/";

export type UploadItem = {
  id: string;
  fileName: string;
  size: number;
  progress: number;
  bytesUploaded: number;
  startedAt: number;
  state: "uploading" | "done" | "error" | "canceled";
  error?: string;
  upload: Upload;
};

export type UploadMeta = {
  deviceId: string | null;
  sessionId: string | null;
  uploaderId: string | null;
};

export type UseTusUploadResult = {
  uploads: UploadItem[];
  startUpload: (file: File) => void;
  startUploadMany: (files: FileList | File[]) => void;
  cancelUpload: (id: string) => void;
  retryUpload: (id: string) => void;
  clearFinished: () => void;
};

// Manages a list of resumable tus.js uploads with per-item progress.
//
// `getMeta()` is read each time an upload starts so the latest Device /
// Session / uploader selection is captured — callers don't need to remount
// the hook when those change.
//
// `onSuccess` fires per-upload after the server reports completion so the
// caller can refresh the videos list. We don't auto-prune finished items
// from `uploads`; the UI shows them until the user clicks "clear".
export function useTusUpload({
  getMeta,
  onSuccess,
}: {
  getMeta: () => UploadMeta;
  onSuccess?: () => void;
}): UseTusUploadResult {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  // Mirror of `uploads` for event handlers that must read the latest state
  // without being recreated on every change.
  const uploadsRef = useRef<UploadItem[]>([]);
  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  // Resume uploads automatically when the browser regains network. tus-js-client
  // already retries within `retryDelays`, but once the delay list is exhausted
  // the upload sits in `error` until the user retries — fine on a momentary
  // blip, frustrating in a flaky venue. Listening for `online` lets us kick
  // the queue back to life without user action.
  useEffect(() => {
    const onOnline = () => {
      for (const it of uploadsRef.current) {
        if (it.state !== "error") continue;
        setUploads((u) =>
          u.map((x) =>
            x.id === it.id
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

  // Block accidental tab close / reload while uploads are in flight. The
  // browser ignores the custom message but shows its own confirm dialog.
  useEffect(() => {
    const hasActive = uploads.some((u) => u.state === "uploading");
    if (!hasActive) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // preventDefault is the spec-compliant way; older Safari still needs
      // `returnValue` set, so set it via assignment that bypasses the
      // deprecation hint on the typed event.
      e.preventDefault();
      (e as { returnValue: string }).returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [uploads]);

  const buildUpload = (
    file: File,
    onState: (patch: Partial<UploadItem>) => void,
  ) => {
    const m = getMeta();
    const meta: Record<string, string> = {
      filename: file.name,
      filetype: file.type || "application/octet-stream",
    };
    if (m.deviceId) meta.deviceId = m.deviceId;
    if (m.sessionId) meta.sessionId = m.sessionId;
    if (m.uploaderId) meta.uploaderId = m.uploaderId;
    return new Upload(file, {
      endpoint: TUSD_ENDPOINT,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: 8 * 1024 * 1024,
      // urlStorage default (localStorage) + removeFingerprintOnSuccess lets
      // an interrupted upload resume across page reloads.
      removeFingerprintOnSuccess: true,
      metadata: meta,
      onError(err) {
        onState({ state: "error", error: err.message });
      },
      onProgress(sent, total) {
        const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
        onState({ progress: pct, bytesUploaded: sent });
      },
      onSuccess() {
        onState({ state: "done", progress: 100 });
        if (onSuccess) setTimeout(onSuccess, 800);
      },
    });
  };

  const startUpload = (file: File) => {
    const id = crypto.randomUUID();
    const item: UploadItem = {
      id,
      fileName: file.name,
      size: file.size,
      progress: 0,
      bytesUploaded: 0,
      startedAt: Date.now(),
      state: "uploading",
      upload: buildUpload(file, (patch) =>
        setUploads((u) =>
          u.map((it) => (it.id === id ? { ...it, ...patch } : it)),
        ),
      ),
    };
    setUploads((u) => [...u, item]);
    item.upload.start();
  };

  const startUploadMany = (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (f.size === 0) continue;
      startUpload(f);
    }
  };

  const cancelUpload = (id: string) => {
    const target = uploads.find((u) => u.id === id);
    if (!target) return;
    target.upload.abort().catch(() => {});
    setUploads((u) =>
      u.map((it) => (it.id === id ? { ...it, state: "canceled" } : it)),
    );
  };

  const retryUpload = (id: string) => {
    setUploads((u) =>
      u.map((it) =>
        it.id === id
          ? {
              ...it,
              state: "uploading",
              error: undefined,
              startedAt: Date.now(),
            }
          : it,
      ),
    );
    const target = uploads.find((u) => u.id === id);
    if (!target) return;
    // tus-js-client supports resume by re-running start() on the existing upload.
    target.upload.start();
  };

  const clearFinished = () => {
    setUploads((u) => u.filter((it) => it.state === "uploading"));
  };

  return {
    uploads,
    startUpload,
    startUploadMany,
    cancelUpload,
    retryUpload,
    clearFinished,
  };
}

export function formatRate(u: UploadItem): string {
  const elapsed = (Date.now() - u.startedAt) / 1000;
  if (elapsed <= 0 || u.bytesUploaded <= 0) return "—";
  const mbps = u.bytesUploaded / elapsed / (1024 * 1024);
  return `${mbps.toFixed(1)} MB/s`;
}
