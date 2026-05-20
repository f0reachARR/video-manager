import { useRef, useState } from "react";

import type { RunVideo } from "../../../../lib/api/client";
import { useUpdateRun, useUpdateRunVideo } from "../../api/queries";

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
};

export type PendingPatch = { runOff: number; vStart: number; vEnd: number };

// Drag/trim state machine for the AnglesTimeline track view. Three drag
// kinds:
//   - "move": shift runOffsetSec
//   - "trim-start": extend / retract the left edge (also shifts runOff so
//     the right edge stays put visually)
//   - "trim-end": extend / retract the right edge, clamped to the source
//     video duration when known
//
// Updates are kept in a `pending` Map while dragging and committed on
// pointerup. If the resulting bar extends past the current Run duration,
// the Run's durationSec is bumped to fit so the user doesn't lose the bar.
export function useAngleTrackDrag({
  runId,
  trackRef,
  durationSec,
  sourceDurations,
  labelGutter,
}: {
  runId: string;
  trackRef: React.RefObject<HTMLDivElement | null>;
  durationSec: number;
  sourceDurations: Map<string, number>;
  labelGutter: number;
}) {
  const update = useUpdateRunVideo();
  const updateRun = useUpdateRun();
  const dragRef = useRef<DragState | null>(null);
  const [pending, setPending] = useState<Map<string, PendingPatch>>(
    new Map(),
  );

  const pxPerSec = (rect: DOMRect) =>
    Math.max(0, rect.width - labelGutter) / durationSec;

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

    const clearPending = () =>
      setPending((cur) => {
        const next = new Map(cur);
        next.delete(drag.rvId);
        return next;
      });

    if (Object.keys(body).length > 0) {
      update.mutate(
        { runId, runVideoId: drag.rvId, body },
        { onSettled: clearPending },
      );
      if (needsExtend) {
        updateRun.mutate({
          id: runId,
          body: { durationSec: Math.ceil(newEnd) },
        });
      }
    } else {
      clearPending();
    }
  };

  return { pending, onPointerDown, onPointerMove, onPointerUp };
}
