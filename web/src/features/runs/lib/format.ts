// `M:SS.s` — compact playhead label used throughout the Run detail page.
// Pads seconds to two digits and shows tenths regardless of the input fraction.
export function formatTime(sec: number): string {
  if (!isFinite(sec)) return "0:00.0";
  const total = Math.max(0, sec);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
