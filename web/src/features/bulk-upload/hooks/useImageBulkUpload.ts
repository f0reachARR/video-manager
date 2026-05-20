import { useCallback, useState } from "react";

import { ApiError, robotImagesApi } from "../../../lib/api/client";
import type { ScannedFile } from "./useDirectoryScan";

export type BulkImageUploadItem = {
  key: string;
  filename: string;
  state: "uploading" | "done" | "error";
  error?: string;
  // robot_image_id on success, populated from the response.
  imageId?: string;
};

// Images go through the existing multipart endpoint, not tus, so the
// model here is simpler than the video uploader: one batch POST per
// click. Per-file errors come back in the response body and we project
// them into per-item state so the UI matches the video table layout.
export function useImageBulkUpload() {
  const [items, setItems] = useState<Record<string, BulkImageUploadItem>>({});

  const startBatch = useCallback(
    async (params: {
      tournamentId: string;
      robotId: string;
      files: ScannedFile[];
    }) => {
      const ready = params.files.filter((f) => f.headHashHex);
      if (ready.length === 0) return;
      setItems((prev) => {
        const next = { ...prev };
        for (const f of ready) {
          next[f.key] = {
            key: f.key,
            filename: f.file.name,
            state: "uploading",
          };
        }
        return next;
      });
      try {
        const resp = await robotImagesApi.uploadBulk(
          params.robotId,
          ready.map((f) => ({
            file: f.file,
            headHashHex: f.headHashHex as string,
            sizeBytes: f.file.size,
          })),
          { tournamentId: params.tournamentId },
        );
        // Map response rows back to scan keys by filename. Filename
        // collisions within one batch are unlikely (filesystem can't
        // produce two siblings with the same name) but if they happen
        // we'll just match the first one and surface "unknown" for the
        // dupe — acceptable for the live-event use case.
        const byFilename = new Map<string, ScannedFile>();
        for (const f of ready) byFilename.set(f.file.name, f);
        setItems((prev) => {
          const next = { ...prev };
          for (const row of resp.data) {
            const f = byFilename.get(row.filename);
            if (!f) continue;
            if (row.image) {
              next[f.key] = {
                key: f.key,
                filename: row.filename,
                state: "done",
                imageId: row.image.id,
              };
            } else {
              next[f.key] = {
                key: f.key,
                filename: row.filename,
                state: "error",
                error: row.error ?? "upload failed",
              };
            }
          }
          return next;
        });
      } catch (e) {
        const msg =
          e instanceof ApiError ? e.body.message : (e as Error).message;
        setItems((prev) => {
          const next = { ...prev };
          for (const f of ready) {
            next[f.key] = {
              key: f.key,
              filename: f.file.name,
              state: "error",
              error: msg,
            };
          }
          return next;
        });
      }
    },
    [],
  );

  const clearFinished = useCallback(() => {
    setItems((prev) => {
      const next: Record<string, BulkImageUploadItem> = {};
      for (const k of Object.keys(prev)) {
        const it = prev[k];
        if (it.state === "uploading" || it.state === "error") next[k] = it;
      }
      return next;
    });
  }, []);

  return { items, startBatch, clearFinished };
}
