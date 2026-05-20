import type { BulkUploadMediaKind } from "../../../lib/api/client";

// MIME prefix is the primary signal; fall back to the extension because some
// camera-exported files (especially HEIC on Windows) come through without
// a usable file.type. "unknown" is shown in a separate tab so the user can
// decide manually.
export type MediaKind = BulkUploadMediaKind | "unknown";

const VIDEO_EXTS = new Set([
  "mp4",
  "mov",
  "m4v",
  "mkv",
  "webm",
  "avi",
  "mts",
  "m2ts",
  "3gp",
]);
const IMAGE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "heic",
  "heif",
  "bmp",
  "tif",
  "tiff",
]);

export function classifyFile(file: File): MediaKind {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";

  const dot = file.name.lastIndexOf(".");
  if (dot >= 0) {
    const ext = file.name.slice(dot + 1).toLowerCase();
    if (VIDEO_EXTS.has(ext)) return "video";
    if (IMAGE_EXTS.has(ext)) return "image";
  }
  return "unknown";
}
