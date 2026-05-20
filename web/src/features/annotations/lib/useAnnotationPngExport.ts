import { useState } from "react";

import type { Annotation, Video } from "../../../lib/api/client";
import { drawAnnotation } from "./shapes";

// Snapshots the current <video> frame plus all currently-visible
// annotations into a PNG and triggers a download. Returns the export
// trigger and a sticky `error` string (e.g. CORS / readback failures) so
// the caller can surface it inline.
export function useAnnotationPngExport({
  video,
  videoRef,
  visibleAnnotations,
}: {
  video: Video;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  visibleAnnotations: Annotation[];
}) {
  const [error, setError] = useState<string | null>(null);

  const exportPng = async () => {
    setError(null);
    const el = videoRef.current;
    if (!el || !el.videoWidth) {
      setError("動画がまだ準備中です");
      return;
    }
    const w = el.videoWidth;
    const h = el.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      ctx.drawImage(el, 0, 0, w, h);
    } catch (e) {
      setError(
        "動画フレームの取得に失敗 (MinIO CORS 設定が必要かも): " + String(e),
      );
      return;
    }
    for (const a of visibleAnnotations) {
      drawAnnotation(ctx, a, w, h);
    }
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch (e) {
      setError("PNG 化に失敗 (CORS タインテッド): " + String(e));
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `video-${video.id}-${Math.round(el.currentTime * 10) / 10}s.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return { exportPng, error, dismissError: () => setError(null) };
}
