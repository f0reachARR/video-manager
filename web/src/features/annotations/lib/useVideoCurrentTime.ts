import { type RefObject, useEffect, useState } from "react";

// Track a <video>'s currentTime via rAF so React state stays in step with
// playback (HTMLMediaElement doesn't fire a high-frequency "currentTime
// changed" event). Returns 0 until the element mounts.
export function useVideoCurrentTime(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled = true,
): number {
  const [currentSec, setCurrentSec] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = () => {
      const el = videoRef.current;
      if (el) setCurrentSec(el.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, enabled]);
  return currentSec;
}
