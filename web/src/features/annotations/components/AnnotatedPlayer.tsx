import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useMemo, useRef, useState } from "react";

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
import { AnnotationLayer, drawAnnotation } from "../lib/shapes";
import {
  type DrawMode,
  modeHint,
  useShapeDrawing,
} from "../lib/useShapeDrawing";
import { useVideoCurrentTime } from "../lib/useVideoCurrentTime";
import { useLiveInk } from "../lib/useLiveInk";
import { LiveInkLayer } from "./LiveInkLayer";
import { AnnotationToolbar } from "./AnnotationToolbar";

export function AnnotatedPlayer({ video }: { video: Video }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<DrawMode>("off");
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
      .catch((e) =>
        setError(e instanceof ApiError ? e.body.message : String(e)),
      );
  }

  const currentSec = useVideoCurrentTime(videoRef, !!url);

  const visible = useMemo(() => {
    const arr = ann.data?.data ?? [];
    return arr.filter(
      (a) => currentSec >= a.startOffsetSec && currentSec <= a.endOffsetSec,
    );
  }, [ann.data, currentSec]);

  // Persistent shape modes (point / rect / arrow / text) go through the
  // shared hook so AnnotatedPlayer and the Run-detail overlay stay aligned.
  const shape = useShapeDrawing({
    mode,
    containerRef,
    videoRef,
    label: draftLabel,
    onCreate: (body) => {
      create.mutate(body as never, {
        onSuccess: () => {
          setMode("off");
          setDraftLabel("");
        },
      });
    },
  });

  const ink = useLiveInk({
    videoId: video.id,
    containerRef,
    enabled: mode === "liveInk",
  });

  // Dispatch to shape drawing or live ink depending on the active mode.
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

  const seekTo = (sec: number) => {
    if (videoRef.current) videoRef.current.currentTime = sec;
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
            <AnnotationLayer annotations={visible} draft={shape.draft} />
            <LiveInkLayer strokes={ink.strokes} />
          </div>
        </div>
      )}

      <Group>
        <AnnotationToolbar
          mode={mode}
          onModeChange={setMode}
          label={draftLabel}
          onLabelChange={setDraftLabel}
          labelWidth={220}
        />
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
