import { useEffect, useRef, useState } from "react";

import { videosApi } from "../../../lib/api/client";
import { useVideo } from "../../videos/api/queries";

type Props = {
  videoId: string;
  onClick?: () => void;
};

// Resolves a video id to its thumbnail signed URL and renders a compact
// 96x54 preview. Falls back to a gray placeholder while loading, when the
// video lacks a thumbnail (probe not finished yet), or when the signed
// URL fetch fails. Click invokes onClick — typically opens the preview
// modal.
export function UploadedVideoThumb({ videoId, onClick }: Props) {
  const video = useVideo(videoId);
  const [url, setUrl] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (!video.data || !video.data.hasThumbnail) return;
    if (requested.current === video.data.id) return;
    requested.current = video.data.id;
    setUrl(null);
    setErrored(false);
    videosApi
      .thumbnailUrl(video.data.id)
      .then((r) => setUrl(r.url))
      .catch(() => setErrored(true));
  }, [video.data]);

  const base: React.CSSProperties = {
    width: 96,
    height: 54,
    borderRadius: 4,
    cursor: onClick ? "pointer" : "default",
    flex: "0 0 auto",
  };

  if (!video.data || !video.data.hasThumbnail || errored || !url) {
    // Placeholder also acts as the click target so users can preview
    // even when the thumbnail isn't ready yet (ffprobe still running).
    return (
      <button
        type="button"
        onClick={onClick}
        title="プレビュー"
        style={{
          ...base,
          background: "var(--mantine-color-gray-3)",
          border: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--mantine-color-gray-7)",
          fontSize: 22,
        }}
      >
        ▶
      </button>
    );
  }
  return (
    <img
      src={url}
      alt=""
      onClick={onClick}
      style={{ ...base, objectFit: "cover", background: "#000" }}
    />
  );
}
