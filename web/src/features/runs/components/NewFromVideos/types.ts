// Region = one Run-to-be. startSec/endSec are relative to t0 (the earliest
// recordedAt of the selected videos), which is the wall-clock anchor of the
// timeline. Per-region metadata defaults to whatever the user set in the
// "デフォルト" panel; the row can override anything.
export type Region = {
  id: string;
  startSec: number;
  endSec: number;
  teamId: string | null;
  robotId: string | null;
  scenarioId: string | null;
  memo: string;
  score: number | "";
};

export const LABEL_GUTTER = 120;
export const HEADER_HEIGHT = 22;
export const LANE_HEIGHT = 32;

let regionCounter = 0;
export const newRegionId = () => `r${++regionCounter}-${Date.now()}`;
