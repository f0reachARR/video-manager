// Overlay placed on top of a single AngleVideo in the Run detail page.
// Handles both Annotation (persisted) and LiveInk (transient) rendering,
// and — when `canEdit` is true and a mode is active — captures pointer
// events to create new annotations / strokes.
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAnnotations, useCreateAnnotation } from "../api/queries";
import { AnnotationLayer } from "../lib/shapes";
import { useWebSocketPublisher } from "../../../lib/realtime";

export type OverlayMode = "off" | "addPoint" | "liveInk";

type InkPoint = [number, number];
type InkStrokeMessage = {
  type: "ink.stroke";
  color: string;
  points: InkPoint[];
};
type RemoteStroke = InkStrokeMessage & { receivedAt: number };

const INK_FADE_MS = 4000;
// Per-tab color so each viewer's strokes look different.
const myInkColor = `hsl(${Math.floor(Math.random() * 360)} 80% 55%)`;

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

  // Track the underlying video's currentTime so we can decide which
  // annotations are visible right now.
  const [currentSec, setCurrentSec] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (videoRef.current) setCurrentSec(videoRef.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  const visibleAnnotations = useMemo(() => {
    const all = ann.data?.data ?? [];
    return all.filter(
      (a) => currentSec >= a.startOffsetSec && currentSec <= a.endOffsetSec,
    );
  }, [ann.data, currentSec]);

  const qc = useQueryClient();

  // Live ink — same wire format as AnnotatedPlayer so a /videos modal and a
  // Run detail tab can co-view strokes on the same video.
  const [strokes, setStrokes] = useState<RemoteStroke[]>([]);
  const publish = useWebSocketPublisher(`/ws/video/${videoId}`, (msg) => {
    const m = msg as Partial<InkStrokeMessage> & { type?: string };
    if (
      m.type === "ink.stroke" &&
      Array.isArray(m.points) &&
      typeof m.color === "string"
    ) {
      setStrokes((cur) => [
        ...cur,
        {
          type: "ink.stroke",
          color: m.color!,
          points: m.points!,
          receivedAt: Date.now(),
        },
      ]);
    } else if (typeof m.type === "string" && m.type.startsWith("annotation.")) {
      // Server-side broadcast for Annotation CRUD — refetch authoritative state.
      qc.invalidateQueries({ queryKey: ["annotations", videoId] });
    }
  });
  useEffect(() => {
    if (strokes.length === 0) return;
    const t = setTimeout(() => {
      const cutoff = Date.now() - INK_FADE_MS;
      setStrokes((cur) => cur.filter((s) => s.receivedAt > cutoff));
    }, 250);
    return () => clearTimeout(t);
  }, [strokes]);

  // Pointer handling — only active when this overlay both has a mode and the
  // user is allowed to edit (main angle).
  const interactive = canEdit && mode !== "off";

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (mode !== "addPoint" || !canEdit) return;
    const containerEl = containerRef.current;
    const videoEl = videoRef.current;
    if (!containerEl || !videoEl) return;
    const rect = containerEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const t = videoEl.currentTime;
    create.mutate({
      startOffsetSec: t,
      endOffsetSec: t + 3,
      type: "point",
      geometry: { x, y } as never,
      label: draftLabel,
    });
  };

  const inkBufferRef = useRef<InkPoint[]>([]);
  const inkDrawingRef = useRef(false);
  const flushStroke = () => {
    const pts = inkBufferRef.current;
    if (pts.length < 2) {
      inkBufferRef.current = [];
      return;
    }
    publish({ type: "ink.stroke", color: myInkColor, points: pts });
    setStrokes((cur) => [
      ...cur,
      {
        type: "ink.stroke",
        color: myInkColor,
        points: pts,
        receivedAt: Date.now(),
      },
    ]);
    inkBufferRef.current = [];
  };
  const pointToNormalized = (e: React.PointerEvent): InkPoint | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return [x, y];
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (mode !== "liveInk" || !canEdit) return;
    const p = pointToNormalized(e);
    if (!p) return;
    inkDrawingRef.current = true;
    inkBufferRef.current = [p];
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (mode !== "liveInk" || !canEdit || !inkDrawingRef.current) return;
    const p = pointToNormalized(e);
    if (!p) return;
    inkBufferRef.current.push(p);
    if (inkBufferRef.current.length >= 8) {
      flushStroke();
      inkBufferRef.current = [
        inkBufferRef.current[inkBufferRef.current.length - 1] ?? p,
      ];
    }
  };
  const onPointerUp = () => {
    if (!inkDrawingRef.current) return;
    inkDrawingRef.current = false;
    flushStroke();
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        // pointer-events:none unless this overlay is actively capturing — that
        // way the underlying <video> controls keep working.
        pointerEvents: interactive ? "auto" : "none",
        touchAction: interactive ? "none" : undefined,
        cursor:
          mode === "addPoint"
            ? "crosshair"
            : mode === "liveInk"
              ? "crosshair"
              : "default",
      }}
      onClick={handleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <AnnotationLayer annotations={visibleAnnotations} />
      <LiveInkLayer strokes={strokes} />
    </div>
  );
}

function LiveInkLayer({ strokes }: { strokes: RemoteStroke[] }) {
  if (strokes.length === 0) return null;
  const now = Date.now();
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
    >
      {strokes.map((s, i) => {
        const age = now - s.receivedAt;
        const opacity = Math.max(0, 1 - age / INK_FADE_MS);
        const d =
          "M " +
          s.points
            .map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`)
            .join(" L ");
        return (
          <path
            key={i}
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
