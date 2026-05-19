// Mapping helpers between a Run's shared timeline and each angle's source
// video time. A RunVideo at runOffsetSec covers run-time
// [runOff, runOff + (videoEnd - videoStart)]; the corresponding video time
// is videoStart + (runT - runOff).

import type { RunVideo } from "../../../lib/api/client";

export function angleDuration(rv: RunVideo): number {
  return Math.max(0, rv.videoOffsetEndSec - rv.videoOffsetStartSec);
}

export function runTimeToVideoTime(rv: RunVideo, runT: number): number {
  const runOff = rv.runOffsetSec ?? 0;
  return rv.videoOffsetStartSec + (runT - runOff);
}

export function isAngleInRange(rv: RunVideo, runT: number): boolean {
  const runOff = rv.runOffsetSec ?? 0;
  return runT >= runOff && runT <= runOff + angleDuration(rv);
}
