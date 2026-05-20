import { useEffect, useState } from "react";

import {
  ApiError,
  type PlaybackUrl,
  videosApi,
} from "../../../lib/api/client";

// Single-video playback URL resolution. Returns `{ source, error }` where
// `source` is null until the API responds and `error` is the human-readable
// message when the fetch fails. Re-fires when `videoId` changes.
export function useVideoPlaybackUrl(videoId: string | null) {
  const [source, setSource] = useState<PlaybackUrl | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId) {
      setSource(null);
      setError(null);
      return;
    }
    let canceled = false;
    setSource(null);
    setError(null);
    videosApi
      .playbackUrl(videoId)
      .then((r) => {
        if (!canceled) setSource(r);
      })
      .catch((e) => {
        if (canceled) return;
        setError(e instanceof ApiError ? e.body.message : String(e));
      });
    return () => {
      canceled = true;
    };
  }, [videoId]);

  return { source, error };
}
