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
      </Group>

      <AnnotationTable
        annotations={ann.data?.data ?? []}
        onSeek={seekTo}
        onDelete={(id) => del.mutate(id)}
        deleting={del.isPending}
      />
    </Stack>
  );
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
