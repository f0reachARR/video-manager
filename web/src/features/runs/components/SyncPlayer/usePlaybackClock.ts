import { useEffect, useRef, useState } from "react";

import type { RunVideo } from "../../../../lib/api/client";
import { isAngleInRange, runTimeToVideoTime } from "../../lib/timeMap";

// How far a <video>'s currentTime can drift from the wall-clock target before
// we snap it back. Larger than network-level drift thresholds because the rAF
// tick only nudges every frame and steady-state drift of ~100ms is expected.
const VIDEO_DRIFT_SNAP_SEC = 0.25;

export type PlaybackClockOptions = {
  videos: RunVideo[];
  runDurationSec: number;
  refs: React.RefObject<Map<string, HTMLVideoElement>>;
  onTChange: (sec: number) => void;
  // Fires after each user-initiated seek / play state change so the caller
  // can broadcast presence to other viewers. Skipped when the caller asks
  // for it via opts (e.g. when the change came from a remote follow tick).
  onAfterUserChange: () => void;
};

// Wall-clock anchored playback for a stack of synchronised <video> elements.
// Owns: the rAF loop that walks `t` forward from a (t, performance.now())
// anchor, the seek / togglePlay handlers, and the "apply external playing"
// path used when a remote presence tells us to follow.
//
// We DON'T derive `t` from the main video's currentTime — gaps where no
// camera is in range would freeze the clock. The hook itself is the source
// of truth for `t`, and per-frame it steers each <video> to (t - runOffset).
export function usePlaybackClock({
  videos,
  runDurationSec,
  refs,
  onTChange,
  onAfterUserChange,
}: PlaybackClockOptions) {
  const [t, setTState] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Refs mirror state so the rAF tick and async handlers see fresh values.
  const lastT = useRef(0);
  const playingRef = useRef(false);
  playingRef.current = playing;

  const animationRef = useRef<number | null>(null);
  const playAnchorT = useRef(0);
  const playAnchorWall = useRef(0);

  const setT = (next: number) => {
    lastT.current = next;
    setTState(next);
    onTChange(next);
  };

  useEffect(() => {
    if (!playing) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    const tick = (now: number) => {
      const elapsed = (now - playAnchorWall.current) / 1000;
      const newT = Math.min(
        runDurationSec,
        Math.max(0, playAnchorT.current + elapsed),
      );

      // Steer every video to (newT - runOffset). Out-of-range angles get
      // paused; the next tick that lands inside their window will re-play
      // them. Includes the main angle — the wall clock is the ground truth.
      for (const v of videos) {
        const el = refs.current.get(v.id);
        if (!el) continue;
        if (!isAngleInRange(v, newT)) {
          if (!el.paused) el.pause();
          continue;
        }
        const target = runTimeToVideoTime(v, newT);
        if (Math.abs(el.currentTime - target) > VIDEO_DRIFT_SNAP_SEC) {
          el.currentTime = target;
        }
        if (el.paused) void el.play().catch(() => {});
      }

      if (Math.abs(newT - lastT.current) > 0.05) {
        setT(newT);
      }
      if (newT >= runDurationSec) {
        setPlaying(false);
        return;
      }
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current !== null)
        cancelAnimationFrame(animationRef.current);
    };
    // setT closes over onTChange but lastT is a ref, so we don't depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, runDurationSec, videos]);

  const seek = (newT: number, opts: { broadcast?: boolean } = {}) => {
    setT(newT);
    // Reset the wall-clock anchor so the rAF tick keeps walking forward from
    // the new position rather than jumping back.
    playAnchorT.current = newT;
    playAnchorWall.current = performance.now();
    for (const v of videos) {
      const el = refs.current.get(v.id);
      if (!el) continue;
      if (!isAngleInRange(v, newT)) {
        if (!el.paused) el.pause();
        continue;
      }
      el.currentTime = runTimeToVideoTime(v, newT);
    }
    if (opts.broadcast !== false) onAfterUserChange();
  };

  const applyExternalPlaying = async (shouldPlay: boolean) => {
    if (shouldPlay) {
      // play() is a no-op for an already-playing element, so it's safe to
      // call repeatedly. Track per-video success — if every play() got
      // rejected (autoplay blocked), leave React `playing` false so the next
      // incoming sync ping will retry.
      const results = await Promise.allSettled(
        videos.map(async (v) => {
          const el = refs.current.get(v.id);
          if (!el) throw new Error("video element not mounted");
          await el.play();
        }),
      );
      const anyOk = results.some((r) => r.status === "fulfilled");
      if (anyOk) setPlaying(true);
    } else {
      for (const v of videos) refs.current.get(v.id)?.pause();
      setPlaying(false);
    }
  };

  const togglePlay = async () => {
    if (playing) {
      for (const v of videos) refs.current.get(v.id)?.pause();
      setPlaying(false);
      playingRef.current = false;
      onAfterUserChange();
      return;
    }
    // Anchor the wall clock to the current t. The rAF loop will then walk
    // forward from here even if no video is in range yet (pre-video gap).
    playAnchorT.current = lastT.current;
    playAnchorWall.current = performance.now();
    for (const v of videos) {
      const el = refs.current.get(v.id);
      if (!el) continue;
      if (!isAngleInRange(v, lastT.current)) continue;
      el.currentTime = runTimeToVideoTime(v, lastT.current);
    }
    await Promise.all(
      videos.map(async (v) => {
        const el = refs.current.get(v.id);
        if (!el) return;
        if (!isAngleInRange(v, lastT.current)) return;
        try {
          await el.play();
        } catch {
          // ignore autoplay errors
        }
      }),
    );
    setPlaying(true);
    playingRef.current = true;
    onAfterUserChange();
  };

  return {
    t,
    playing,
    playingRef,
    lastT,
    seek,
    togglePlay,
    applyExternalPlaying,
  };
}
