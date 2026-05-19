import { INK_FADE_MS, type RemoteStroke } from "../lib/useLiveInk";

export function LiveInkLayer({ strokes }: { strokes: RemoteStroke[] }) {
  if (strokes.length === 0) return null;
  const now = Date.now();
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {strokes.map((s, idx) => {
        const age = now - s.receivedAt;
        const opacity = Math.max(0, 1 - age / INK_FADE_MS);
        const d = pointsToPath(s.points);
        return (
          <path
            key={`${s.receivedAt}-${idx}`}
            d={d}
            stroke={s.color}
            strokeWidth={0.005}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

function pointsToPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0][0].toFixed(4)} ${points[0][1].toFixed(4)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0].toFixed(4)} ${points[i][1].toFixed(4)}`;
  }
  return d;
}
