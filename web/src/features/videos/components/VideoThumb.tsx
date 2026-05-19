import { useRef, useState } from "react";

import { type Video, videosApi } from "../../../lib/api/client";

export function VideoThumb({ video }: { video: Video }) {
  const [url, setUrl] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const requested = useRef(false);

  if (!video.hasThumbnail) {
    return (
      <div
        style={{
          width: 80,
          height: 45,
          background: "var(--mantine-color-gray-2)",
          borderRadius: 4,
        }}
      />
    );
  }
  if (!requested.current) {
    requested.current = true;
    videosApi
      .thumbnailUrl(video.id)
      .then((r) => setUrl(r.url))
      .catch(() => setErrored(true));
  }
  if (errored || !url) {
    return (
      <div
        style={{
          width: 80,
          height: 45,
          background: "var(--mantine-color-gray-3)",
          borderRadius: 4,
        }}
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      style={{
        width: 80,
        height: 45,
        objectFit: "cover",
        borderRadius: 4,
        background: "#000",
      }}
    />
  );
}
