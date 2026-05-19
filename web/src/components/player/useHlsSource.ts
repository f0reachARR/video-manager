import Hls from "hls.js";
import { useEffect } from "react";

import type { PlaybackUrl } from "../../lib/api/client";

/**
 * Attach a playback source to a video element. `kind === 'hls'` triggers
 * hls.js (or native HLS in Safari); `kind === 'mp4'` sets `video.src`
 * directly. The hook tears down any prior hls.js instance when the source
 * changes or the component unmounts.
 *
 * `videoEl` is typically the result of a callback ref so the effect re-runs
 * once the <video> mounts.
 */
export function useHlsSource(
  videoEl: HTMLVideoElement | null,
  source: PlaybackUrl | null | undefined,
) {
  useEffect(() => {
    if (!videoEl || !source) return;
    const url = source.url;
    if (!url) return;

    // Native HLS (Safari, iOS) — assign directly. Avoids the hls.js polyfill
    // overhead and lets Safari pick its preferred quality.
    if (
      source.kind === "hls" &&
      videoEl.canPlayType("application/vnd.apple.mpegurl")
    ) {
      videoEl.src = url;
      return () => {
        videoEl.removeAttribute("src");
        videoEl.load();
      };
    }

    if (source.kind === "hls" && Hls.isSupported()) {
      const hls = new Hls({
        // Workers are nice on encode-heavy desktops but break inside some
        // test runners; leave default (enabled).
      });
      hls.loadSource(url);
      hls.attachMedia(videoEl);
      return () => {
        hls.destroy();
        videoEl.removeAttribute("src");
        videoEl.load();
      };
    }

    // Fallback path: direct MP4, or HLS on a browser that supports neither
    // native nor MSE (rare; the <video> tag will probably fail too).
    videoEl.src = url;
    return () => {
      videoEl.removeAttribute("src");
      videoEl.load();
    };
  }, [videoEl, source?.url, source?.kind]);
}
