// Shape rendering and geometry helpers for Annotation. Coordinates are
// normalized 0..1 in the source-video space; `AnnotationLayer` overlays
// stretch to fill their container, so a rect drawn at (0.1, 0.2, 0.3, 0.4)
// always covers the same fraction of the displayed video regardless of
// resolution.
//
// One subtlety: the SVG layer uses preserveAspectRatio="none", so straight
// lines/arrows are visually skewed if the container's aspect ratio differs
// from the source video's. We accept that tradeoff for simplicity — the
// PNG exporter renders against the actual videoWidth/videoHeight, so saved
// images are correct.

import type { ReactNode } from "react";

import type { Annotation } from "../../../lib/api/client";

export type PointGeom = { x: number; y: number };
export type RectGeom = { x: number; y: number; w: number; h: number };
export type ArrowGeom = { x1: number; y1: number; x2: number; y2: number };
export type TextGeom = { x: number; y: number };
export type PathGeom = { points: [number, number][] };

export type Draft =
  | { kind: "rect"; startX: number; startY: number; geom: RectGeom }
  | { kind: "arrow"; geom: ArrowGeom }
  | null;

// Per-type defaults. style JSONB can override these later but for now
// shapes pick a fixed palette so they stay visually distinct.
const COLOR = {
  point: "rgba(255,200,0,0.85)",
  rect: { stroke: "rgba(255,80,80,0.95)", fill: "rgba(255,80,80,0.15)" },
  arrow: "rgba(80,255,140,0.95)",
  path: "rgba(120,180,255,0.95)",
  text: { fg: "#fff", bg: "rgba(0,0,0,0.6)" },
} as const;

export function AnnotationLayer({
  annotations,
  draft,
}: {
  annotations: Annotation[];
  draft?: Draft;
}): ReactNode {
  return (
    <>
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <defs>
          <marker
            id="ann-arrowhead"
            markerUnits="strokeWidth"
            markerWidth={5}
            markerHeight={5}
            orient="auto-start-reverse"
            refX={4}
            refY={2.5}
          >
            <path d="M0,0 L5,2.5 L0,5 z" fill={COLOR.arrow} />
          </marker>
          <marker
            id="ann-arrowhead-draft"
            markerUnits="strokeWidth"
            markerWidth={5}
            markerHeight={5}
            orient="auto-start-reverse"
            refX={4}
            refY={2.5}
          >
            <path d="M0,0 L5,2.5 L0,5 z" fill={COLOR.arrow} />
          </marker>
        </defs>
        {annotations.map((a) => {
          switch (a.type) {
            case "rect":
              return <SvgRect key={a.id} geom={readRect(a.geometry)} />;
            case "arrow":
              return <SvgArrow key={a.id} geom={readArrow(a.geometry)} />;
            case "path":
              return <SvgPath key={a.id} geom={readPath(a.geometry)} />;
            default:
              return null;
          }
        })}
        {draft?.kind === "rect" && <SvgRect geom={draft.geom} preview />}
        {draft?.kind === "arrow" && <SvgArrow geom={draft.geom} preview />}
      </svg>
      {annotations.map((a) => {
        switch (a.type) {
          case "point":
            return <DomPoint key={a.id} geom={readPoint(a.geometry)} label={a.label} />;
          case "text":
            return <DomText key={a.id} geom={readPoint(a.geometry)} label={a.label} />;
          default:
            return null;
        }
      })}
    </>
  );
}

function SvgRect({ geom, preview }: { geom: RectGeom; preview?: boolean }) {
  return (
    <rect
      x={geom.x}
      y={geom.y}
      width={geom.w}
      height={geom.h}
      fill={COLOR.rect.fill}
      stroke={COLOR.rect.stroke}
      strokeWidth={2}
      strokeDasharray={preview ? "4 3" : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function SvgArrow({ geom, preview }: { geom: ArrowGeom; preview?: boolean }) {
  return (
    <line
      x1={geom.x1}
      y1={geom.y1}
      x2={geom.x2}
      y2={geom.y2}
      stroke={COLOR.arrow}
      strokeWidth={3}
      strokeDasharray={preview ? "5 4" : undefined}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      markerEnd={`url(#${preview ? "ann-arrowhead-draft" : "ann-arrowhead"})`}
    />
  );
}

function SvgPath({ geom }: { geom: PathGeom }) {
  if (!geom.points || geom.points.length < 2) return null;
  const d =
    "M " +
    geom.points
      .map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`)
      .join(" L ");
  return (
    <path
      d={d}
      stroke={COLOR.path}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function DomPoint({
  geom,
  label,
}: {
  geom: PointGeom;
  label?: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${geom.x * 100}%`,
        top: `${geom.y * 100}%`,
        transform: "translate(-50%, -50%)",
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: COLOR.point,
        border: "2px solid #fff",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
        pointerEvents: "none",
      }}
      title={label}
    />
  );
}

function DomText({
  geom,
  label,
}: {
  geom: TextGeom;
  label?: string;
}) {
  if (!label) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: `${geom.x * 100}%`,
        top: `${geom.y * 100}%`,
        transform: "translate(-50%, -50%)",
        padding: "2px 6px",
        background: COLOR.text.bg,
        color: COLOR.text.fg,
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 3,
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {label}
    </div>
  );
}

// --- Geometry readers -------------------------------------------------
// Tolerant getters so a malformed row doesn't crash the renderer.
function num(v: unknown, def = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}
export function readPoint(g: unknown): PointGeom {
  const o = (g ?? {}) as Record<string, unknown>;
  return { x: num(o.x), y: num(o.y) };
}
export function readRect(g: unknown): RectGeom {
  const o = (g ?? {}) as Record<string, unknown>;
  return { x: num(o.x), y: num(o.y), w: num(o.w), h: num(o.h) };
}
export function readArrow(g: unknown): ArrowGeom {
  const o = (g ?? {}) as Record<string, unknown>;
  return { x1: num(o.x1), y1: num(o.y1), x2: num(o.x2), y2: num(o.y2) };
}
export function readPath(g: unknown): PathGeom {
  const o = (g ?? {}) as Record<string, unknown>;
  const pts = Array.isArray(o.points) ? (o.points as unknown[]) : [];
  return {
    points: pts
      .map((p) => (Array.isArray(p) ? ([num(p[0]), num(p[1])] as [number, number]) : null))
      .filter((p): p is [number, number] => p !== null),
  };
}

// --- Canvas exporter ---------------------------------------------------
// Drawn against the actual videoWidth x videoHeight, so the saved PNG
// represents what the user sees — minus the SVG's non-uniform-aspect skew.
export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  a: Annotation,
  w: number,
  h: number,
) {
  switch (a.type) {
    case "point": {
      const g = readPoint(a.geometry);
      const x = g.x * w;
      const y = g.y * h;
      ctx.fillStyle = COLOR.point;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (a.label) drawLabel(ctx, a.label, x + 14, y + 6, h);
      return;
    }
    case "rect": {
      const g = readRect(a.geometry);
      const x = g.x * w;
      const y = g.y * h;
      const rw = g.w * w;
      const rh = g.h * h;
      ctx.fillStyle = COLOR.rect.fill;
      ctx.strokeStyle = COLOR.rect.stroke;
      ctx.lineWidth = 3;
      ctx.fillRect(x, y, rw, rh);
      ctx.strokeRect(x, y, rw, rh);
      if (a.label) drawLabel(ctx, a.label, x + 4, y + 16, h);
      return;
    }
    case "arrow": {
      const g = readArrow(a.geometry);
      const x1 = g.x1 * w;
      const y1 = g.y1 * h;
      const x2 = g.x2 * w;
      const y2 = g.y2 * h;
      ctx.strokeStyle = COLOR.arrow;
      ctx.fillStyle = COLOR.arrow;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = Math.max(12, Math.min(w, h) * 0.02);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headLen * Math.cos(angle - Math.PI / 7),
        y2 - headLen * Math.sin(angle - Math.PI / 7),
      );
      ctx.lineTo(
        x2 - headLen * Math.cos(angle + Math.PI / 7),
        y2 - headLen * Math.sin(angle + Math.PI / 7),
      );
      ctx.closePath();
      ctx.fill();
      return;
    }
    case "text": {
      const g = readPoint(a.geometry);
      if (!a.label) return;
      const x = g.x * w;
      const y = g.y * h;
      drawLabel(ctx, a.label, x, y, h, { centered: true });
      return;
    }
    case "path": {
      const g = readPath(a.geometry);
      if (g.points.length < 2) return;
      ctx.strokeStyle = COLOR.path;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(g.points[0][0] * w, g.points[0][1] * h);
      for (let i = 1; i < g.points.length; i++) {
        ctx.lineTo(g.points[i][0] * w, g.points[i][1] * h);
      }
      ctx.stroke();
      return;
    }
  }
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  h: number,
  opts: { centered?: boolean } = {},
) {
  const size = Math.max(14, h * 0.025);
  ctx.font = `${size}px sans-serif`;
  ctx.textBaseline = "middle";
  if (opts.centered) ctx.textAlign = "center";
  else ctx.textAlign = "left";
  const m = ctx.measureText(text);
  const pad = 4;
  const tw = m.width + pad * 2;
  const th = size + pad;
  const left = opts.centered ? x - tw / 2 : x - pad;
  const top = y - th / 2;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(left, top, tw, th);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}
