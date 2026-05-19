import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  type Annotation,
  type Video,
  videosApi,
} from "../../../lib/api/client";
import { useCurrentUserId } from "../../../stores/currentUser";
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
} from "../api/queries";
import {
  AnnotationLayer,
  type Draft,
  drawAnnotation,
} from "../lib/shapes";
import {
  useTopicSubscription,
  useWebSocketPublisher,
} from "../../../lib/realtime";

type Mode = "off" | "point" | "rect" | "arrow" | "text" | "liveInk";

type InkPoint = [number, number];
type InkStrokeMessage = {
  type: "ink.stroke";
  color: string;
  points: InkPoint[];
};
type RemoteStroke = InkStrokeMessage & { receivedAt: number };

const INK_FADE_MS = 4000;
// Random per-tab color so multiple viewers' strokes stay distinguishable.
const myInkColor = `hsl(${Math.floor(Math.random() * 360)} 80% 55%)`;

// Drag threshold below which we treat a pointer interaction as a "click"
// instead of a drag. Used by rect/arrow to ignore accidental taps.
const DRAG_MIN = 0.01;

export function AnnotatedPlayer({ video }: { video: Video }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentSec, setCurrentSec] = useState(0);
  const [mode, setMode] = useState<Mode>("off");
  const [draftLabel, setDraftLabel] = useState("");
  const userId = useCurrentUserId();

  const ann = useAnnotations(video.id);
  const create = useCreateAnnotation(video.id);
  const del = useDeleteAnnotation(video.id);

  const qc = useQueryClient();

  // Live ink: ephemeral strokes broadcast over WS, fade after a few seconds.
  // The same socket also delivers annotation.* events from the server so the
  // editor stays in sync with other viewers without polling.
  const publish = useWebSocketPublisher(`/ws/video/${video.id}`);
  const [strokes, setStrokes] = useState<RemoteStroke[]>([]);
  useTopicSubscription(`/ws/video/${video.id}`, (msg) => {
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
      qc.invalidateQueries({ queryKey: ["annotations", video.id] });
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

  if (!requested.current) {
    requested.current = true;
    videosApi
      .playbackUrl(video.id)
      .then((r) => setUrl(r.url))
      .catch((e) =>
        setError(e instanceof ApiError ? e.body.message : String(e)),
      );
  }

  // Track currentTime via rAF while playing or after a seek.
  useEffect(() => {
    if (!url) return;
    let raf = 0;
    const tick = () => {
      if (videoRef.current) setCurrentSec(videoRef.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [url]);

  const visible = useMemo(() => {
    const arr = ann.data?.data ?? [];
    return arr.filter(
      (a) => currentSec >= a.startOffsetSec && currentSec <= a.endOffsetSec,
    );
  }, [ann.data, currentSec]);

  // --- Shape drawing state ---------------------------------------------
  // draft is the geometry currently being drawn for rect/arrow; null when
  // idle or when mode is point/text/liveInk (those create on a single
  // click instead of a drag).
  const [draft, setDraft] = useState<Draft>(null);
  const draftRef = useRef<Draft>(null);
  draftRef.current = draft;
  const containerRef = useRef<HTMLDivElement>(null);

  const pointToNormalized = (e: React.PointerEvent): InkPoint | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return [x, y];
  };

  // Single-click create for point and text. Same path for both — the only
  // diff is the type tag and that text uses the label as its content.
  const placeClick = (p: InkPoint) => {
    const t = videoRef.current?.currentTime ?? 0;
    if (mode !== "point" && mode !== "text") return;
    if (mode === "text" && !draftLabel.trim()) {
      // Text without a label is invisible, so require one.
      return;
    }
    create.mutate(
      {
        startOffsetSec: t,
        endOffsetSec: t + 3,
        type: mode,
        geometry: { x: p[0], y: p[1] } as never,
        label: draftLabel,
      },
      {
        onSuccess: () => {
          setMode("off");
          setDraftLabel("");
        },
      },
    );
  };

  // --- Live ink ---------------------------------------------------------
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

  // --- Unified pointer handlers ----------------------------------------
  const pointerOriginRef = useRef<InkPoint | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode === "off") return;
    const p = pointToNormalized(e);
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
    } else if (mode === "liveInk") {
      inkDrawingRef.current = true;
      inkBufferRef.current = [p];
    }
    // point/text are handled in pointerUp so a stray click doesn't fire on
    // pointerdown if the user actually meant to drag.
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointToNormalized(e);
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
    } else if (mode === "liveInk" && inkDrawingRef.current) {
      inkBufferRef.current.push(p);
      if (inkBufferRef.current.length >= 8) {
        flushStroke();
        inkBufferRef.current = [p];
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const origin = pointerOriginRef.current;
    pointerOriginRef.current = null;
    const p = pointToNormalized(e) ?? origin;
    const d = draftRef.current;
    const t = videoRef.current?.currentTime ?? 0;

    if (mode === "point" || mode === "text") {
      if (p) placeClick(p);
      return;
    }
    if (d?.kind === "rect") {
      if (d.geom.w >= DRAG_MIN && d.geom.h >= DRAG_MIN) {
        create.mutate(
          {
            startOffsetSec: t,
            endOffsetSec: t + 3,
            type: "rect",
            geometry: d.geom as never,
            label: draftLabel,
          },
          {
            onSuccess: () => {
              setMode("off");
              setDraftLabel("");
              setDraft(null);
            },
          },
        );
      } else {
        setDraft(null);
      }
      return;
    }
    if (d?.kind === "arrow") {
      const dx = d.geom.x2 - d.geom.x1;
      const dy = d.geom.y2 - d.geom.y1;
      if (Math.hypot(dx, dy) >= DRAG_MIN * 2) {
        create.mutate(
          {
            startOffsetSec: t,
            endOffsetSec: t + 3,
            type: "arrow",
            geometry: d.geom as never,
            label: draftLabel,
          },
          {
            onSuccess: () => {
              setMode("off");
              setDraftLabel("");
              setDraft(null);
            },
          },
        );
      } else {
        setDraft(null);
      }
      return;
    }
    if (mode === "liveInk") {
      if (!inkDrawingRef.current) return;
      inkDrawingRef.current = false;
      flushStroke();
    }
  };

  const seekTo = (sec: number) => {
    if (videoRef.current) videoRef.current.currentTime = sec;
  };

  // --- PNG export -------------------------------------------------------
  const [exportError, setExportError] = useState<string | null>(null);
  const exportPng = async () => {
    setExportError(null);
    const el = videoRef.current;
    if (!el || !el.videoWidth) {
      setExportError("動画がまだ準備中です");
      return;
    }
    const w = el.videoWidth;
    const h = el.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      ctx.drawImage(el, 0, 0, w, h);
    } catch (e) {
      setExportError(
        "動画フレームの取得に失敗 (MinIO CORS 設定が必要かも): " + String(e),
      );
      return;
    }
    for (const a of visible) {
      drawAnnotation(ctx, a, w, h);
    }
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch (e) {
      setExportError("PNG 化に失敗 (CORS タインテッド): " + String(e));
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `video-${video.id}-${Math.round(el.currentTime * 10) / 10}s.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const drawing = mode !== "off";
  const cursor = drawing ? "crosshair" : "default";
  // Show the label field whenever a mode that uses a label is active. Text
  // mode requires the label; others optionally use it.
  const showLabelInput =
    mode === "point" || mode === "rect" || mode === "arrow" || mode === "text";
  const labelRequired = mode === "text";

  return (
    <Stack>
      {error && <Alert color="red">{error}</Alert>}
      {!error && !url && <Text>署名 URL を取得中...</Text>}
      {url && (
        <div
          ref={containerRef}
          style={{
            position: "relative",
            background: "#000",
            cursor,
            touchAction: drawing ? "none" : undefined,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <video
            ref={videoRef}
            src={url}
            // Hide native controls while drawing so the toolbar at the
            // bottom doesn't eat our pointerdown events.
            controls={!drawing}
            crossOrigin="anonymous"
            style={{ width: "100%", maxHeight: "60vh", display: "block" }}
          >
            <track kind="captions" />
          </video>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <AnnotationLayer annotations={visible} draft={draft} />
            <LiveInkLayer strokes={strokes} />
          </div>
        </div>
      )}

      <Group>
        <ToolButton
          mode="point"
          current={mode}
          label="📍 Point"
          onClick={setMode}
          color="yellow"
        />
        <ToolButton
          mode="rect"
          current={mode}
          label="▭ Rect"
          onClick={setMode}
          color="red"
        />
        <ToolButton
          mode="arrow"
          current={mode}
          label="➝ Arrow"
          onClick={setMode}
          color="teal"
        />
        <ToolButton
          mode="text"
          current={mode}
          label="🅣 Text"
          onClick={setMode}
          color="blue"
        />
        <ToolButton
          mode="liveInk"
          current={mode}
          label="✏️ ライブインク"
          onClick={setMode}
          color="grape"
        />
        {showLabelInput && (
          <TextInput
            size="xs"
            placeholder={labelRequired ? "テキスト (必須)" : "ラベル (任意)"}
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.currentTarget.value)}
            w={220}
            required={labelRequired}
          />
        )}
        <Text size="xs" c="dimmed">
          現在 {currentSec.toFixed(1)}s · 表示中 {visible.length} / 全{" "}
          {ann.data?.data.length ?? 0}
        </Text>
        {!userId && drawing && (
          <Text size="xs" c="orange">
            ユーザ未選択: authorId は null になります
          </Text>
        )}
        <Button size="xs" variant="default" ml="auto" onClick={exportPng}>
          🖼 PNG エクスポート
        </Button>
      </Group>
      {drawing && (
        <Text size="xs" c="dimmed">
          {modeHint(mode)}
        </Text>
      )}
      {exportError && (
        <Alert color="orange" onClose={() => setExportError(null)} withCloseButton>
          {exportError}
        </Alert>
      )}

      <AnnotationTable
        annotations={ann.data?.data ?? []}
        onSeek={seekTo}
        onDelete={(id) => del.mutate(id)}
        deleting={del.isPending}
      />
    </Stack>
  );
}

function ToolButton({
  mode,
  current,
  label,
  onClick,
  color,
}: {
  mode: Mode;
  current: Mode;
  label: string;
  onClick: (m: Mode) => void;
  color: string;
}) {
  const active = current === mode;
  return (
    <Button
      size="xs"
      variant={active ? "filled" : "default"}
      color={active ? color : undefined}
      onClick={() => onClick(active ? "off" : mode)}
    >
      {label}
    </Button>
  );
}

function modeHint(m: Mode): string {
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

function LiveInkLayer({ strokes }: { strokes: RemoteStroke[] }) {
  if (strokes.length === 0) return null;
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {strokes.map((s, idx) => {
        const age = Date.now() - s.receivedAt;
        const alpha = Math.max(0, 1 - age / INK_FADE_MS);
        const d = pointsToPath(s.points);
        return (
          <path
            key={`${s.receivedAt}-${idx}`}
            d={d}
            stroke={s.color}
            strokeOpacity={alpha}
            strokeWidth={0.005}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        );
      })}
    </svg>
  );
}

function pointsToPath(points: InkPoint[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]} ${points[i][1]}`;
  }
  return d;
}

function AnnotationTable({
  annotations,
  onSeek,
  onDelete,
  deleting,
}: {
  annotations: Annotation[];
  onSeek: (sec: number) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  if (annotations.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        Annotation はありません
      </Text>
    );
  }
  return (
    <Table withRowBorders={false}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: 80 }}>開始</Table.Th>
          <Table.Th style={{ width: 80 }}>終了</Table.Th>
          <Table.Th style={{ width: 80 }}>Type</Table.Th>
          <Table.Th>Label</Table.Th>
          <Table.Th style={{ width: 60 }}></Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {annotations.map((a) => (
          <Table.Tr key={a.id}>
            <Table.Td>
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() => onSeek(a.startOffsetSec)}
              >
                {a.startOffsetSec.toFixed(1)}s
              </Button>
            </Table.Td>
            <Table.Td>
              <Text size="xs" ff="monospace">
                {a.endOffsetSec.toFixed(1)}s
              </Text>
            </Table.Td>
            <Table.Td>
              <Badge size="xs" variant="light">
                {a.type}
              </Badge>
            </Table.Td>
            <Table.Td>
              <Text size="sm">
                {a.label || (
                  <Text component="span" c="dimmed" size="xs">
                    (空)
                  </Text>
                )}
              </Text>
            </Table.Td>
            <Table.Td>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                loading={deleting}
                onClick={() => {
                  if (confirm("Annotation を削除しますか？")) onDelete(a.id);
                }}
                aria-label="削除"
              >
                🗑️
              </ActionIcon>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
