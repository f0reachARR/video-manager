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

import {
  ApiError,
  type Annotation,
  type Video,
  videosApi,
} from "../lib/api/client";
import { useCurrentUserId } from "../lib/currentUser";
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
} from "../lib/queries";

type Mode = "off" | "addPoint";

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

  if (!requested.current) {
    requested.current = true;
    videosApi
      .playbackUrl(video.id)
      .then((r) => setUrl(r.url))
      .catch((e) => setError(e instanceof ApiError ? e.body.message : String(e)));
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

  const onCanvasClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (mode !== "addPoint" || !videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const t = videoRef.current.currentTime;
    create.mutate(
      {
        startOffsetSec: t,
        endOffsetSec: t + 3,
        type: "point",
        geometry: { x, y } as never,
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

  const seekTo = (sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = sec;
    }
  };

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
      setExportError("動画フレームの取得に失敗 (MinIO CORS 設定が必要かも): " + String(e));
      return;
    }
    // Draw visible annotations in source-pixel coords.
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

  return (
    <Stack>
      {error && <Alert color="red">{error}</Alert>}
      {!error && !url && <Text>署名 URL を取得中...</Text>}
      {url && (
        <div
          style={{
            position: "relative",
            background: "#000",
            cursor: mode === "addPoint" ? "crosshair" : "default",
          }}
          onClick={onCanvasClick}
        >
          <video
            ref={videoRef}
            src={url}
            controls
            crossOrigin="anonymous"
            style={{ width: "100%", maxHeight: "60vh", display: "block" }}
          >
            <track kind="captions" />
          </video>
          {/* Annotation overlay (above video, but pointer-events:none so
              controls + clicks pass through unless we want them). */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
            }}
          >
            {visible.map((a) => (
              <AnnotationOverlay key={a.id} a={a} />
            ))}
          </div>
        </div>
      )}

      <Group>
        <Button
          size="xs"
          variant={mode === "addPoint" ? "filled" : "default"}
          color={mode === "addPoint" ? "teal" : undefined}
          onClick={() => setMode((m) => (m === "addPoint" ? "off" : "addPoint"))}
        >
          {mode === "addPoint" ? "クリックして配置..." : "📍 Point を追加"}
        </Button>
        {mode === "addPoint" && (
          <TextInput
            size="xs"
            placeholder="ラベル (任意)"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.currentTarget.value)}
            w={220}
          />
        )}
        <Text size="xs" c="dimmed">
          現在 {currentSec.toFixed(1)}s · 表示中 {visible.length} / 全 {ann.data?.data.length ?? 0}
        </Text>
        {!userId && mode === "addPoint" && (
          <Text size="xs" c="orange">
            ユーザ未選択: authorId は null になります
          </Text>
        )}
        <Button size="xs" variant="default" ml="auto" onClick={exportPng}>
          🖼 PNG エクスポート
        </Button>
      </Group>
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

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  a: Annotation,
  w: number,
  h: number,
) {
  const geom = a.geometry as Record<string, number>;
  switch (a.type) {
    case "point": {
      const x = Number(geom.x ?? 0) * w;
      const y = Number(geom.y ?? 0) * h;
      ctx.fillStyle = "rgba(255, 200, 0, 0.8)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (a.label) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.font = `${Math.max(14, h * 0.025)}px sans-serif`;
        ctx.fillText(a.label, x + 14, y + 6);
        ctx.fillStyle = "#fff";
        ctx.fillText(a.label, x + 12, y + 4);
      }
      return;
    }
    case "rect": {
      const x = Number(geom.x ?? 0) * w;
      const y = Number(geom.y ?? 0) * h;
      const rw = Number(geom.w ?? 0) * w;
      const rh = Number(geom.h ?? 0) * h;
      ctx.fillStyle = "rgba(255, 80, 80, 0.15)";
      ctx.strokeStyle = "rgba(255, 80, 80, 0.9)";
      ctx.lineWidth = 3;
      ctx.fillRect(x, y, rw, rh);
      ctx.strokeRect(x, y, rw, rh);
      return;
    }
    default:
      return;
  }
}

function AnnotationOverlay({ a }: { a: Annotation }) {
  const geom = a.geometry as Record<string, number>;
  switch (a.type) {
    case "point": {
      const x = Number(geom.x ?? 0);
      const y = Number(geom.y ?? 0);
      return (
        <div
          style={{
            position: "absolute",
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            transform: "translate(-50%, -50%)",
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "rgba(255, 200, 0, 0.8)",
            border: "2px solid #fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
          }}
          title={a.label}
        />
      );
    }
    case "rect": {
      const x = Number(geom.x ?? 0);
      const y = Number(geom.y ?? 0);
      const w = Number(geom.w ?? 0);
      const h = Number(geom.h ?? 0);
      return (
        <div
          style={{
            position: "absolute",
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            width: `${w * 100}%`,
            height: `${h * 100}%`,
            border: "2px solid rgba(255, 80, 80, 0.9)",
            background: "rgba(255, 80, 80, 0.15)",
          }}
          title={a.label}
        />
      );
    }
    default:
      // arrow / path / text not rendered yet in this minimal cut.
      return null;
  }
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
              <Button size="compact-xs" variant="subtle" onClick={() => onSeek(a.startOffsetSec)}>
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
