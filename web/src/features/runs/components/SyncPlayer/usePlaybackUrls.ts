import { useEffect, useState } from "react";

import {
  ApiError,
  type PlaybackUrl,
  type RunVideo,
  videosApi,
} from "../../../../lib/api/client";

// Resolves a playback URL once per RunVideo.videoId, surfacing per-video
// errors instead of failing the whole player. The map is keyed by videoId
// because multiple RunVideo rows can share the same source video, and we
// only want to fetch its URL once.
export function usePlaybackUrls(videos: RunVideo[]) {
  const [urls, setUrls] = useState<Map<string, PlaybackUrl>>(new Map());
  const [urlErrors, setUrlErrors] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let canceled = false;
    Promise.all(
      videos.map(async (v) => {
        if (urls.has(v.videoId)) return;
        try {
          const r = await videosApi.playbackUrl(v.videoId);
          if (canceled) return;
          setUrls((m) => new Map(m).set(v.videoId, r));
        } catch (e) {
          if (canceled) return;
          setUrlErrors((m) =>
            new Map(m).set(
              v.videoId,
              e instanceof ApiError ? e.body.message : String(e),
            ),
          );
        }
      }),
    );
    return () => {
      canceled = true;
    };
    // Intentionally key only on videos identity; urls map updates trigger
    // React state and don't need to retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  return { urls, urlErrors };
}
