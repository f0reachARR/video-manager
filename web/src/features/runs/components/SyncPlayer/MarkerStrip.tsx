import type { Marker } from "../../../../lib/api/client";
import { markerCategoryColor } from "../../../markers/lib/category";
import { formatTime } from "../../lib/format";

// Overlay layer for the playback slider: one fixed-width vertical tick per
// marker, positioned by runOffsetSec / durationSec. pointer-events: none so
// the underlying slider stays draggable.
export function MarkerStrip({
  markers,
  durationSec,
}: {
  markers: Marker[];
  durationSec: number;
}) {
  if (durationSec <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {markers.map((m) => {
        const pct = Math.max(
          0,
          Math.min(100, (m.runOffsetSec / durationSec) * 100),
        );
        return (
          <div
            key={m.id}
            title={`${formatTime(m.runOffsetSec)} ${m.category}${m.label ? ` — ${m.label}` : ""}`}
            style={{
              position: "absolute",
              left: `${pct}%`,
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 4,
              height: 18,
              background: `var(--mantine-color-${markerCategoryColor[m.category]}-6)`,
              borderRadius: 2,
              boxShadow: "0 0 0 1px rgba(255,255,255,0.6)",
            }}
          />
        );
      })}
    </div>
  );
}
