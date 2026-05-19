// Shared shape-drawing pointer logic for the Annotation overlays. Both
// AnnotatedPlayer (single-video page) and RunVideoOverlay (multi-angle
// player in Run detail) wire this up to their container ref and a
// `create` mutation; the hook handles the rect/arrow drag, point/text
// click, and exposes the in-progress draft so the renderer can preview
// it.
//
// liveInk is intentionally not handled here — the websocket-driven
// transient stroke flow is different enough that the caller manages it
// directly. The hook simply ignores liveInk mode so calling onPointer*
// in that mode is a no-op (the caller's own handlers take over).

import { type RefObject, useRef, useState } from "react";

import { pointerToNormalized } from "./coords";
import { type Draft } from "./shapes";

export type DrawMode =
  | "off"
  | "point"
  | "rect"
  | "arrow"
  | "text"
  | "liveInk";

// Minimum drag distance (in normalized 0..1 coords) before we treat a
// rect/arrow pointer-down → pointer-up as a real drag. Stops accidental
// taps from creating zero-size shapes.
const DRAG_MIN = 0.01;

export type CreateShapeBody = {
  startOffsetSec: number;
  endOffsetSec: number;
  type: "point" | "rect" | "arrow" | "text";
  geometry: unknown;
  label: string;
};

export function useShapeDrawing({
  mode,
  containerRef,
  videoRef,
  label,
  onCreate,
  defaultDuration = 3,
}: {
  mode: DrawMode;
  containerRef: RefObject<HTMLElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  label: string;
  onCreate: (body: CreateShapeBody) => void;
  defaultDuration?: number;
}): {
  draft: Draft;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
} {
  const [draft, setDraft] = useState<Draft>(null);
  const draftRef = useRef<Draft>(null);
  draftRef.current = draft;
  const pointerOriginRef = useRef<[number, number] | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode === "off" || mode === "liveInk") return;
    const p = pointerToNormalized(containerRef.current, e);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointerOriginRef.current = p;
    if (mode === "rect") {
      setDraft({
        kind: "rect",
        startX: p[0],
        startY: p[1],
        geom: { x: p[0], y: p[1], w: 0, h: 0 },
      });
    } else if (mode === "arrow") {
      setDraft({
        kind: "arrow",
        geom: { x1: p[0], y1: p[1], x2: p[0], y2: p[1] },
      });
    }
    // point / text are finalized on pointerup so a real drag doesn't
    // accidentally create a stray point on pointerdown.
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (mode === "off" || mode === "liveInk") return;
    const p = pointerToNormalized(containerRef.current, e);
    if (!p) return;
    const d = draftRef.current;
    if (d?.kind === "rect") {
      const x = Math.min(p[0], d.startX);
      const y = Math.min(p[1], d.startY);
      const w = Math.abs(p[0] - d.startX);
      const h = Math.abs(p[1] - d.startY);
      setDraft({ ...d, geom: { x, y, w, h } });
    } else if (d?.kind === "arrow") {
      setDraft({ ...d, geom: { ...d.geom, x2: p[0], y2: p[1] } });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (mode === "off" || mode === "liveInk") return;
    const origin = pointerOriginRef.current;
    pointerOriginRef.current = null;
    const p = pointerToNormalized(containerRef.current, e) ?? origin;
    const d = draftRef.current;
    const t = videoRef.current?.currentTime ?? 0;
    const end = t + defaultDuration;

    if (mode === "point") {
      if (p) {
        onCreate({
          startOffsetSec: t,
          endOffsetSec: end,
          type: "point",
          geometry: { x: p[0], y: p[1] },
          label,
        });
      }
      return;
    }
    if (mode === "text") {
      if (!label.trim()) return; // text without text is invisible
      if (p) {
        onCreate({
          startOffsetSec: t,
          endOffsetSec: end,
          type: "text",
          geometry: { x: p[0], y: p[1] },
          label,
        });
      }
      return;
    }
    if (d?.kind === "rect") {
      if (d.geom.w >= DRAG_MIN && d.geom.h >= DRAG_MIN) {
        onCreate({
          startOffsetSec: t,
          endOffsetSec: end,
          type: "rect",
          geometry: d.geom,
          label,
        });
      }
      setDraft(null);
      return;
    }
    if (d?.kind === "arrow") {
      const dx = d.geom.x2 - d.geom.x1;
      const dy = d.geom.y2 - d.geom.y1;
      if (Math.hypot(dx, dy) >= DRAG_MIN * 2) {
        onCreate({
          startOffsetSec: t,
          endOffsetSec: end,
          type: "arrow",
          geometry: d.geom,
          label,
        });
      }
      setDraft(null);
      return;
    }
  };

  return { draft, onPointerDown, onPointerMove, onPointerUp };
}

export function modeHint(m: DrawMode): string {
  switch (m) {
    case "point":
      return "動画上をクリックして点を配置";
    case "rect":
      return "対角線をドラッグして矩形を作成";
    case "arrow":
      return "矢印の根元から先端へドラッグ";
    case "text":
      return "テキストを入力して動画上をクリック";
    case "liveInk":
      return "ドラッグで一時的なストロークを描画 (数秒で消える)";
    default:
      return "";
  }
}
