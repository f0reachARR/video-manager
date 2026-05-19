// Overlay placed on top of a single AngleVideo in the Run detail page.
// Handles both Annotation (persisted) and LiveInk (transient) rendering,
// and — when `canEdit` is true and a mode is active — captures pointer
// events to create new annotations / strokes.
import { type RefObject, useMemo } from "react";

import { useAnnotations, useCreateAnnotation } from "../api/queries";
import { AnnotationLayer } from "../lib/shapes";
import { useShapeDrawing, type DrawMode } from "../lib/useShapeDrawing";
import { useVideoCurrentTime } from "../lib/useVideoCurrentTime";
import { useLiveInk } from "../lib/useLiveInk";
import { LiveInkLayer } from "./LiveInkLayer";

export type OverlayMode = DrawMode;

export function RunVideoOverlay({
  videoId,
  videoRef,
  containerRef,
  mode,
  canEdit,
  draftLabel = "",
}: {
  videoId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  mode: OverlayMode;
  canEdit: boolean;
  draftLabel?: string;
}) {
  const ann = useAnnotations(videoId);
  const create = useCreateAnnotation(videoId);

  const currentSec = useVideoCurrentTime(videoRef);

  const visibleAnnotations = useMemo(() => {
    const all = ann.data?.data ?? [];
    return all.filter(
      (a) => currentSec >= a.startOffsetSec && currentSec <= a.endOffsetSec,
    );
  }, [ann.data, currentSec]);

  // Overlay only captures pointers when the user is allowed to edit AND a
  // mode is active — otherwise we keep pointer-events:none so the
  // underlying <video> controls keep working.
  const interactive = canEdit && mode !== "off";

  const shape = useShapeDrawing({
    mode: canEdit ? mode : "off",
    containerRef,
    videoRef,
    label: draftLabel,
    onCreate: (body) => {
      create.mutate(body as never);
    },
  });

  const ink = useLiveInk({
    videoId,
    containerRef,
    enabled: canEdit && mode === "liveInk",
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode === "liveInk") ink.onPointerDown(e);
    else shape.onPointerDown(e);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (mode === "liveInk") ink.onPointerMove(e);
    else shape.onPointerMove(e);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (mode === "liveInk") ink.onPointerUp();
    else shape.onPointerUp(e);
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: interactive ? "auto" : "none",
        touchAction: interactive ? "none" : undefined,
        cursor: interactive ? "crosshair" : "default",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <AnnotationLayer annotations={visibleAnnotations} draft={shape.draft} />
      <LiveInkLayer strokes={ink.strokes} />
    </div>
  );
}
