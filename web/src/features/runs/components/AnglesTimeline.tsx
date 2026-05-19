import { Card, Group, Stack, Text } from "@mantine/core";
import { useMemo, useRef, useState } from "react";

import type { Run, RunVideo } from "../../../lib/api/client";
import { useUpdateRun, useUpdateRunVideo } from "../api/queries";
import { useVideos } from "../../videos/api/queries";
import { formatTime } from "../lib/format";

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
  const update = useUpdateRunVideo();
  const updateRun = useUpdateRun();
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

  type DragKind = "move" | "trim-start" | "trim-end";
  type DragState = {
    rvId: string;
    kind: DragKind;
    startX: number;
    initRunOff: number;
    initVStart: number;
    initVEnd: number;
    // Captured at pointerdown so the drag math can clamp vEnd. undefined if
    // the source duration isn't loaded yet — in that case we don't clamp,
    // matching the pre-fix behavior. Legacy data already past the source
    // length keeps initVEnd as a floor so we never silently shrink it.
    vEndMax: number | undefined;
  } | null;
  // These hooks must come before the early-return below; otherwise toggling
  // videos.length between 0 and >0 changes the hook count and React throws
  // "Rendered more hooks than during the previous render."
  const dragRef = useRef<DragState>(null);
  // Pending offsets while dragging — committed on pointerup.
  const [pending, setPending] = useState<
    Map<string, { runOff: number; vStart: number; vEnd: number }>
  >(new Map());

  if (videos.length === 0 || durationSec <= 0) return null;

  // The label gutter on the left of each track. The bar area starts after
  // this many pixels; everything that maps "Run time -> screen X" has to
  // account for it (drag math + playhead positioning).
  const LABEL_GUTTER = 84;

  const pxPerSec = (rect: DOMRect) =>
    Math.max(0, rect.width - LABEL_GUTTER) / durationSec;

  const onPointerDown =
    (rv: RunVideo, kind: DragKind) => (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const srcDur = sourceDurations.get(rv.videoId);
      dragRef.current = {
        rvId: rv.id,
        kind,
        startX: e.clientX,
        initRunOff: rv.runOffsetSec ?? 0,
        initVStart: rv.videoOffsetStartSec,
        initVEnd: rv.videoOffsetEndSec,
        vEndMax:
          srcDur == null ? undefined : Math.max(srcDur, rv.videoOffsetEndSec),
      };
    };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pps = pxPerSec(rect);
    if (pps <= 0) return;
    const dx = (e.clientX - drag.startX) / pps;
    let runOff = drag.initRunOff;
    let vStart = drag.initVStart;
    let vEnd = drag.initVEnd;
    if (drag.kind === "move") {
      runOff = Math.max(0, Math.round(drag.initRunOff + dx));
    } else if (drag.kind === "trim-start") {
      vStart = Math.max(0, Math.round(drag.initVStart + dx));
      if (vStart > vEnd - 1) vStart = vEnd - 1;
      // Trimming the start visually keeps the right edge fixed at the
      // (runOff + (end - start)) position, so runOff shifts to compensate.
      runOff = Math.max(0, drag.initRunOff + (vStart - drag.initVStart));
    } else if (drag.kind === "trim-end") {
      vEnd = Math.max(vStart + 1, Math.round(drag.initVEnd + dx));
      if (drag.vEndMax != null) vEnd = Math.min(drag.vEndMax, vEnd);
    }
    setPending((cur) => {
      const next = new Map(cur);
      next.set(drag.rvId, { runOff, vStart, vEnd });
      return next;
    });
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const p = pending.get(drag.rvId);
    if (!p) return;
    const body: {
      runOffsetSec?: number;
      videoOffsetStartSec?: number;
      videoOffsetEndSec?: number;
    } = {};
    if (p.runOff !== drag.initRunOff) body.runOffsetSec = p.runOff;
    if (p.vStart !== drag.initVStart) body.videoOffsetStartSec = p.vStart;
    if (p.vEnd !== drag.initVEnd) body.videoOffsetEndSec = p.vEnd;

    // If the new bar extends past the current Run duration, bump it so the
    // user doesn't have to manually grow durationSec to keep the angle visible.
    const newEnd = p.runOff + (p.vEnd - p.vStart);
    const needsExtend = newEnd > durationSec;

    if (Object.keys(body).length > 0) {
      update.mutate(
        { runId: run.id, runVideoId: drag.rvId, body },
        {
          onSettled: () => {
            setPending((cur) => {
              const next = new Map(cur);
              next.delete(drag.rvId);
              return next;
            });
          },
        },
      );
      if (needsExtend) {
        updateRun.mutate({
          id: run.id,
          body: { durationSec: Math.ceil(newEnd) },
        });
      }
    } else {
      setPending((cur) => {
        const next = new Map(cur);
        next.delete(drag.rvId);
        return next;
      });
    }
  };

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
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
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
            const p = pending.get(rv.id);
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
                    left: 84,
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
                    onPointerDown={onPointerDown(rv, "move")}
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
                    onPointerDown={onPointerDown(rv, "trim-start")}
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
                    onPointerDown={onPointerDown(rv, "trim-end")}
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
