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

import type { Annotation, Video } from "../../../lib/api/client";
import { useHlsSource } from "../../../components/player/useHlsSource";
import { useCurrentUserId } from "../../../stores/currentUser";
import { useVideoPlaybackUrl } from "../../videos/hooks/useVideoPlaybackUrl";
import {
  useAnnotations,
  useCreateAnnotation,
  useDeleteAnnotation,
} from "../api/queries";
import { AnnotationLayer } from "../lib/shapes";
import { useAnnotationPngExport } from "../lib/useAnnotationPngExport";
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
  const { source, error } = useVideoPlaybackUrl(video.id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<DrawMode>("off");
  const [draftLabel, setDraftLabel] = useState("");
  const userId = useCurrentUserId();

  const ann = useAnnotations(video.id);
  const create = useCreateAnnotation(video.id);
  const del = useDeleteAnnotation(video.id);

  useHlsSource(videoEl, source);

  const currentSec = useVideoCurrentTime(videoRef, !!source);

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

  const png = useAnnotationPngExport({
    video,
    videoRef,
    visibleAnnotations: visible,
  });

  const drawing = mode !== "off";
  const cursor = drawing ? "crosshair" : "default";

  return (
    <Stack>
      {error && <Alert color="red">{error}</Alert>}
      {!error && !source && <Text>再生 URL を取得中...</Text>}
      {source && (
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
            ref={(el) => {
              videoRef.current = el;
              setVideoEl(el);
            }}
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
        <Button size="xs" variant="default" ml="auto" onClick={png.exportPng}>
          🖼 PNG エクスポート
        </Button>
      </Group>
      {drawing && (
        <Text size="xs" c="dimmed">
          {modeHint(mode)}
        </Text>
      )}
      {png.error && (
        <Alert color="orange" onClose={png.dismissError} withCloseButton>
          {png.error}
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
