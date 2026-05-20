import { Card } from "@mantine/core";

import type { Marker } from "../../../lib/api/client";
import { markerCategoryColor, markerCategoryLabel } from "../lib/category";

// Static (non-slider) horizontal bar showing one tick per marker.
// Clicking a tick seeks to that marker's offset. Used in run detail view
// outside the playback slider — the slider has its own MarkerStrip in
// SyncPlayer that has to coexist with the Mantine Slider thumb.
export function MarkerTimelineBar({
  markers,
  durationSec,
  onSeek,
  formatTime,
}: {
  markers: Marker[];
  durationSec: number;
  onSeek: (sec: number) => void;
  formatTime: (sec: number) => string;
}) {
  if (durationSec <= 0 || markers.length === 0) return null;
  return (
    <Card withBorder p="xs">
      <div style={{ position: "relative", height: 24 }}>
        {markers.map((m) => {
          const pct = Math.max(
            0,
            Math.min(100, (m.runOffsetSec / durationSec) * 100),
          );
          return (
            <button
              type="button"
              key={m.id}
              onClick={() => onSeek(m.runOffsetSec)}
              title={`${formatTime(m.runOffsetSec)} ${markerCategoryLabel[m.category]}${m.label ? ` — ${m.label}` : ""}`}
              style={{
                position: "absolute",
                left: `${pct}%`,
                top: 0,
                transform: "translateX(-50%)",
                width: 8,
                height: 24,
                background: `var(--mantine-color-${markerCategoryColor[m.category]}-6)`,
                border: 0,
                borderRadius: 2,
                cursor: "pointer",
                padding: 0,
              }}
              aria-label={`marker at ${m.runOffsetSec}s`}
            />
          );
        })}
      </div>
    </Card>
  );
}
