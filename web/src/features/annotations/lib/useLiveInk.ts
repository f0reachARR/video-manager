// Live ink: ephemeral stroke broadcast over WebSocket that fades away
// after a few seconds. Same hook backs the AnnotatedPlayer (single-video
// page) and the Run detail overlay so a /videos modal and a Run tab
// co-viewing the same source video share strokes.
//
// The same socket also receives server-side `annotation.*` broadcasts so
// the editor stays in sync with other viewers without polling.

import { type RefObject, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useWebSocketPublisher } from "../../../lib/realtime";
import { pointerToNormalized, type NormalizedPoint } from "./coords";

export const INK_FADE_MS = 4000;
const FLUSH_AT = 8;

// Per-tab random color so each viewer's strokes look different.
const myInkColor = `hsl(${Math.floor(Math.random() * 360)} 80% 55%)`;

type InkStrokeMessage = {
  type: "ink.stroke";
  color: string;
  points: NormalizedPoint[];
};

export type RemoteStroke = InkStrokeMessage & { receivedAt: number };

export function useLiveInk({
  videoId,
  containerRef,
  enabled,
}: {
  videoId: string;
  containerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
}): {
  strokes: RemoteStroke[];
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
} {
  const qc = useQueryClient();
  const [strokes, setStrokes] = useState<RemoteStroke[]>([]);

  // Single socket: publishes our strokes and receives others'. Server-side
  // `annotation.*` events arrive on this same channel.
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
      qc.invalidateQueries({ queryKey: ["annotations", videoId] });
    }
  });

  // Fade old strokes.
  useEffect(() => {
    if (strokes.length === 0) return;
    const t = setTimeout(() => {
      const cutoff = Date.now() - INK_FADE_MS;
      setStrokes((cur) => cur.filter((s) => s.receivedAt > cutoff));
    }, 250);
    return () => clearTimeout(t);
  }, [strokes]);

  const bufferRef = useRef<NormalizedPoint[]>([]);
  const drawingRef = useRef(false);

  const flushStroke = () => {
    const pts = bufferRef.current;
    if (pts.length < 2) {
      bufferRef.current = [];
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
    bufferRef.current = [];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    const p = pointerToNormalized(containerRef.current, e);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    bufferRef.current = [p];
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled || !drawingRef.current) return;
    const p = pointerToNormalized(containerRef.current, e);
    if (!p) return;
    bufferRef.current.push(p);
    if (bufferRef.current.length >= FLUSH_AT) {
      // Keep the last point as the seed of the next stroke so the rendered
      // path stays continuous across flush boundaries.
      const last = bufferRef.current[bufferRef.current.length - 1] ?? p;
      flushStroke();
      bufferRef.current = [last];
    }
  };

  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    flushStroke();
  };

  return { strokes, onPointerDown, onPointerMove, onPointerUp };
}
