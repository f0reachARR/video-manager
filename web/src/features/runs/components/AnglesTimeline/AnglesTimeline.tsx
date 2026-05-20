import { Card, Group, Stack, Text } from "@mantine/core";
import { useMemo, useRef } from "react";

import type { Run } from "../../../../lib/api/client";
import { useVideos } from "../../../videos/api/queries";
import { formatTime } from "../../lib/format";
import { useAngleTrackDrag } from "./useAngleTrackDrag";

// The label gutter on the left of each track. The bar area starts after
// this many pixels; everything that maps "Run time -> screen X" has to
// account for it (drag math + playhead positioning).
const LABEL_GUTTER = 84;

// Visual multi-track view of every angle attached to the Run. Each track
// shows the angle as a colored bar at its current runOffsetSec position; the
// bar's length reflects (videoOffsetEndSec - videoOffsetStartSec). Drag the
// bar to change runOffsetSec; drag the left/right edges to retract the
// video_offset_start/end window. Click a bar to seek to its start.
export function AnglesTimeline({
  run,
  currentSec,
  durationSec,
  onSeek,
}: {
  run: Run;
  currentSec: number;
  durationSec: number;
  onSeek: (sec: number) => void;
}) {
  const videos = run.videos ?? [];
  const trackRef = useRef<HTMLDivElement>(null);

  // Source-video duration is the upper bound for videoOffsetEndSec — without
  // it the trim-end drag would happily let the user pin the end past where
  // the actual video has frames.
  const sourceVideos = useVideos({ sessionId: run.sessionId });
  const sourceDurations = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of sourceVideos.data?.data ?? []) {
      if (v.durationSec != null) m.set(v.id, v.durationSec);
    }
    return m;
  }, [sourceVideos.data]);

  // Drag/trim state machine — kept above the early return so the hook count
  // stays stable when toggling videos.length between 0 and >0.
  const drag = useAngleTrackDrag({
    runId: run.id,
    trackRef,
    durationSec,
    sourceDurations,
    labelGutter: LABEL_GUTTER,
  });

  if (videos.length === 0 || durationSec <= 0) return null;

  return (
    <Card withBorder p="xs">
      <Stack gap={4}>
        <Group justify="space-between">
          <Text size="xs" fw={500}>
            タイムライン (Run {formatTime(durationSec)})
          </Text>
          <Text size="xs" c="dimmed">
            バーをドラッグで位置調整 / 左右の端で動画範囲をトリミング
          </Text>
        </Group>
        <div
          ref={trackRef}
          style={{ position: "relative", userSelect: "none" }}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerUp}
        >
          {/* Playhead — spans the whole track stack, positioned inside the
              bar area (after the LABEL_GUTTER), so its X aligns with every
              track's leftPct=0 reference. */}
          <div
            style={{
              position: "absolute",
              left: `calc(${LABEL_GUTTER}px + (100% - ${LABEL_GUTTER}px) * ${Math.min(1, Math.max(0, currentSec / durationSec))})`,
              top: 0,
              bottom: 0,
              width: 2,
              transform: "translateX(-1px)",
              background: "var(--mantine-color-blue-6)",
              opacity: 0.7,
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
          {/* Background grid + scale */}
          <div
            style={{
              position: "relative",
              height: 18,
              borderBottom: "1px solid var(--mantine-color-default-border)",
              paddingLeft: LABEL_GUTTER,
            }}
          >
            <Text
              size="xs"
              c="dimmed"
              style={{ position: "absolute", left: LABEL_GUTTER }}
            >
              0
            </Text>
            <Text
              size="xs"
              c="dimmed"
              style={{ position: "absolute", right: 0 }}
            >
              {formatTime(durationSec)}
            </Text>
          </div>
          {videos.map((rv, idx) => {
            const p = drag.pending.get(rv.id);
            const runOff = p ? p.runOff : rv.runOffsetSec ?? 0;
            const vStart = p ? p.vStart : rv.videoOffsetStartSec;
            const vEnd = p ? p.vEnd : rv.videoOffsetEndSec;
            const len = Math.max(0, vEnd - vStart);
            const leftPct = Math.max(0, (runOff / durationSec) * 100);
            const widthPct = Math.max(
              0,
              Math.min(100 - leftPct, (len / durationSec) * 100),
            );
            // After Run end is visually cut: the bar is clipped to widthPct.
            const color = `hsl(${(idx * 67) % 360} 60% 55%)`;
            return (
              <div
                key={rv.id}
                style={{ position: "relative", height: 28, marginTop: 4 }}
              >
                <Text
                  size="xs"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 6,
                    width: 80,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  c="dimmed"
                >
                  {rv.angleLabel || "(無名)"}
                </Text>
                <div
                  style={{
                    position: "absolute",
                    left: LABEL_GUTTER,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    background: "var(--mantine-color-default-hover)",
                    borderRadius: 4,
                  }}
                >
                  {/* The actual bar */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSeek(runOff)}
                    onPointerDown={drag.onPointerDown(rv, "move")}
                    style={{
                      position: "absolute",
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      top: 2,
                      bottom: 2,
                      background: color,
                      borderRadius: 3,
                      cursor: "grab",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 12px",
                      color: "#fff",
                      fontSize: 11,
                      fontFamily: "monospace",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatTime(runOff)} → {formatTime(runOff + len)} (src {vStart}-{vEnd})
                  </div>
                  {/* Left edge handle */}
                  <div
                    onPointerDown={drag.onPointerDown(rv, "trim-start")}
                    style={{
                      position: "absolute",
                      left: `calc(${leftPct}% - 4px)`,
                      width: 8,
                      top: 0,
                      bottom: 0,
                      cursor: "ew-resize",
                      zIndex: 1,
                    }}
                    aria-label="trim start"
                  />
                  {/* Right edge handle */}
                  <div
                    onPointerDown={drag.onPointerDown(rv, "trim-end")}
                    style={{
                      position: "absolute",
                      left: `calc(${leftPct + widthPct}% - 4px)`,
                      width: 8,
                      top: 0,
                      bottom: 0,
                      cursor: "ew-resize",
                      zIndex: 1,
                    }}
                    aria-label="trim end"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Stack>
    </Card>
  );
}
