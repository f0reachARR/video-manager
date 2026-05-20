import { Box, Stack, Text, TextInput } from "@mantine/core";

import type { Video } from "../../../../lib/api/client";
import { formatDateTimeFull } from "../../../../lib/time";
import { formatTime } from "../../lib/format";
import {
  HEADER_HEIGHT,
  LABEL_GUTTER,
  LANE_HEIGHT,
  type Region,
} from "./types";

export function Timeline({
  videos,
  totalSec,
  t0Ms,
  bandOf,
  regions,
  selectedId,
  previewT,
  pendingStart,
  trackRef,
  angleLabels,
  onAngleLabelChange,
  onTrackPointerDown,
  onPointerMove,
  onPointerUp,
  onRegionPointerDown,
  onSelectRegion,
}: {
  videos: Video[];
  totalSec: number;
  t0Ms: number;
  bandOf: (v: Video) => { startSec: number; endSec: number };
  regions: Region[];
  selectedId: string | null;
  previewT: number;
  pendingStart: number | null;
  trackRef: React.RefObject<HTMLDivElement | null>;
  angleLabels: Record<string, string>;
  onAngleLabelChange: (videoId: string, label: string) => void;
  onTrackPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onRegionPointerDown: (
    region: Region,
    kind: "move" | "resize-start" | "resize-end",
  ) => (e: React.PointerEvent) => void;
  onSelectRegion: (id: string) => void;
}) {
  if (videos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        配置可能な動画がありません。
      </Text>
    );
  }

  const lanesHeight = videos.length * LANE_HEIGHT;

  return (
    <Box
      ref={trackRef}
      onPointerDown={onTrackPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "relative",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {/* Scale header */}
      <Box
        style={{
          position: "relative",
          height: HEADER_HEIGHT,
          paddingLeft: LABEL_GUTTER,
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Text
          size="xs"
          c="dimmed"
          style={{ position: "absolute", left: LABEL_GUTTER, top: 2 }}
        >
          {formatDateTimeFull(new Date(t0Ms))}
        </Text>
        <Text
          size="xs"
          c="dimmed"
          style={{ position: "absolute", right: 4, top: 2 }}
        >
          +{formatTime(totalSec)}
        </Text>
      </Box>

      {/* Preview playhead — always visible since the preview is always-on. */}
      <Box
        style={{
          position: "absolute",
          left: `calc(${LABEL_GUTTER}px + (100% - ${LABEL_GUTTER}px) * ${Math.min(1, Math.max(0, previewT / totalSec))})`,
          top: HEADER_HEIGHT,
          height: videos.length * LANE_HEIGHT,
          width: 2,
          transform: "translateX(-1px)",
          background: "var(--mantine-color-red-6)",
          opacity: 0.85,
          pointerEvents: "none",
          zIndex: 3,
        }}
      />
      {/* Pending-start marker — green dashed line at the remembered
          "ここからスタート" position, until "ここまで" commits it. */}
      {pendingStart != null && (
        <Box
          style={{
            position: "absolute",
            left: `calc(${LABEL_GUTTER}px + (100% - ${LABEL_GUTTER}px) * ${Math.min(1, Math.max(0, pendingStart / totalSec))})`,
            top: HEADER_HEIGHT,
            height: videos.length * LANE_HEIGHT,
            width: 0,
            borderLeft: "2px dashed var(--mantine-color-green-6)",
            transform: "translateX(-1px)",
            pointerEvents: "none",
            zIndex: 3,
          }}
        />
      )}

      {/* Region overlays — drawn over the lanes. zIndex:2 puts them above the
          lane Boxes (which come later in the DOM and would otherwise eat
          pointerdown events meant for region bodies / resize handles). */}
      <Box
        style={{
          position: "absolute",
          left: LABEL_GUTTER,
          right: 0,
          top: HEADER_HEIGHT,
          height: lanesHeight,
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        {regions.map((r, idx) => {
          const leftPct = (r.startSec / totalSec) * 100;
          const widthPct = ((r.endSec - r.startSec) / totalSec) * 100;
          const isSel = r.id === selectedId;
          return (
            <Box
              key={r.id}
              style={{
                position: "absolute",
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                top: 0,
                bottom: 0,
                background: isSel
                  ? "rgba(34,139,230,0.25)"
                  : "rgba(34,139,230,0.12)",
                border: `2px solid ${isSel ? "var(--mantine-color-blue-6)" : "var(--mantine-color-blue-4)"}`,
                borderRadius: 4,
                pointerEvents: "auto",
                cursor: "grab",
                overflow: "visible",
              }}
              onPointerDown={onRegionPointerDown(r, "move")}
              onClick={(e) => {
                e.stopPropagation();
                onSelectRegion(r.id);
              }}
            >
              <Text
                size="xs"
                fw={600}
                style={{
                  position: "absolute",
                  top: 2,
                  left: 4,
                  color: "var(--mantine-color-blue-9)",
                  pointerEvents: "none",
                }}
              >
                Run {idx + 1} ({formatTime(r.endSec - r.startSec)})
              </Text>
              {/* Edge handles */}
              <Box
                onPointerDown={onRegionPointerDown(r, "resize-start")}
                style={{
                  position: "absolute",
                  left: -4,
                  top: 0,
                  bottom: 0,
                  width: 8,
                  cursor: "ew-resize",
                }}
              />
              <Box
                onPointerDown={onRegionPointerDown(r, "resize-end")}
                style={{
                  position: "absolute",
                  right: -4,
                  top: 0,
                  bottom: 0,
                  width: 8,
                  cursor: "ew-resize",
                }}
              />
            </Box>
          );
        })}
      </Box>

      {/* Video lanes */}
      <Stack gap={0} mt={0}>
        {videos.map((v, idx) => {
          const b = bandOf(v);
          const leftPct = (b.startSec / totalSec) * 100;
          const widthPct = ((b.endSec - b.startSec) / totalSec) * 100;
          const color = `hsl(${(idx * 67) % 360} 50% 50%)`;
          return (
            <Box
              key={v.id}
              style={{
                position: "relative",
                height: LANE_HEIGHT,
                paddingLeft: LABEL_GUTTER,
              }}
            >
              <Box
                style={{
                  position: "absolute",
                  left: 0,
                  top: 4,
                  width: LABEL_GUTTER - 8,
                  height: LANE_HEIGHT - 8,
                  paddingRight: 4,
                }}
              >
                <TextInput
                  size="xs"
                  placeholder={
                    v.displayName?.trim() || v.storageKey.slice(0, 12)
                  }
                  value={angleLabels[v.id] ?? ""}
                  onChange={(e) =>
                    onAngleLabelChange(v.id, e.currentTarget.value)
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  title={v.displayName?.trim() || v.storageKey}
                />
              </Box>
              <Box
                style={{
                  position: "absolute",
                  left: LABEL_GUTTER,
                  right: 0,
                  top: 6,
                  bottom: 6,
                  background: "var(--mantine-color-default-hover)",
                  borderRadius: 4,
                }}
              >
                <Box
                  style={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top: 2,
                    bottom: 2,
                    background: color,
                    borderRadius: 3,
                    opacity: 0.85,
                    pointerEvents: "none",
                  }}
                />
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
