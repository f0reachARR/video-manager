import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  FileButton,
  Group,
  Modal,
  Paper,
  Progress,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Upload } from "tus-js-client";

import { ResourcePage } from "../components/ResourcePage";
import { SessionAssignModal } from "../components/SessionAssignModal";
import { VideoMetadataModal } from "../components/VideoMetadataModal";
import { ApiError, type Video, videosApi } from "../lib/api/client";
import { useCurrentUserId } from "../lib/currentUser";
import {
  useDeleteVideo,
  useDevices,
  useSessions,
  useVideos,
} from "../lib/queries";

const TUSD_ENDPOINT =
  (import.meta.env.VITE_TUSD_ENDPOINT as string | undefined) ??
  "http://localhost:1080/files/";

export const Route = createFileRoute("/videos")({
  component: VideosPage,
});

type UploadItem = {
  id: string;
  fileName: string;
  size: number;
  progress: number;
  bytesUploaded: number;
  startedAt: number;
  state: "uploading" | "done" | "error" | "canceled";
  error?: string;
  upload: Upload;
};

function VideosPage() {
  const videos = useVideos();
  const devices = useDevices();
  const sessions = useSessions();
  const currentUserId = useCurrentUserId();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const deviceNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of devices.data?.data ?? []) m.set(d.id, d.name);
    return m;
  }, [devices.data]);
  const sessionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions.data?.data ?? []) m.set(s.id, s.name);
    return m;
  }, [sessions.data]);

  const buildUpload = (
    file: File,
    onState: (patch: Partial<UploadItem>) => void,
  ) => {
    const meta: Record<string, string> = {
      filename: file.name,
      filetype: file.type || "application/octet-stream",
    };
    if (deviceId) meta.deviceId = deviceId;
    if (currentUserId) meta.uploaderId = currentUserId;
    return new Upload(file, {
      endpoint: TUSD_ENDPOINT,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: 8 * 1024 * 1024,
      // urlStorage default (localStorage) + removeFingerprintOnSuccess lets
      // an interrupted upload resume across page reloads.
      removeFingerprintOnSuccess: true,
      metadata: meta,
      onError(err) {
        onState({ state: "error", error: err.message });
      },
      onProgress(sent, total) {
        const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
        onState({ progress: pct, bytesUploaded: sent });
      },
      onSuccess() {
        onState({ state: "done", progress: 100 });
        setTimeout(() => videos.refetch(), 800);
      },
    });
  };

  const startUpload = (file: File) => {
    const id = crypto.randomUUID();
    const item: UploadItem = {
      id,
      fileName: file.name,
      size: file.size,
      progress: 0,
      bytesUploaded: 0,
      startedAt: Date.now(),
      state: "uploading",
      upload: buildUpload(file, (patch) =>
        setUploads((u) => u.map((it) => (it.id === id ? { ...it, ...patch } : it))),
      ),
    };
    setUploads((u) => [...u, item]);
    item.upload.start();
  };

  const startUploadMany = (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      if (f.size === 0) continue;
      startUpload(f);
    }
  };

  const cancelUpload = (id: string) => {
    const target = uploads.find((u) => u.id === id);
    if (!target) return;
    target.upload.abort().catch(() => {});
    setUploads((u) => u.map((it) => (it.id === id ? { ...it, state: "canceled" } : it)));
  };

  const retryUpload = (id: string) => {
    setUploads((u) =>
      u.map((it) =>
        it.id === id
          ? { ...it, state: "uploading", error: undefined, startedAt: Date.now() }
          : it,
      ),
    );
    const target = uploads.find((u) => u.id === id);
    if (!target) return;
    // tus-js-client supports resume by re-running start() on the existing upload.
    target.upload.start();
  };

  const clearFinished = () => {
    setUploads((u) => u.filter((it) => it.state === "uploading"));
  };

  const list = videos.data?.data ?? [];
  const devicesList = devices.data?.data ?? [];

  return (
    <ResourcePage
      title="動画"
      description="ブラウザから tusd 経由でアップロード。完了後に Video レコードが自動作成されます。"
      isLoading={videos.isLoading}
      error={videos.error}
      onRetry={() => videos.refetch()}
      actions={
        <Group>
          <Select
            placeholder="Device"
            data={devicesList.map((d) => ({ value: d.id, label: d.name }))}
            value={deviceId}
            onChange={setDeviceId}
            clearable
            w={200}
            size="sm"
          />
          <FileButton onChange={(files) => files && startUploadMany(files)} accept="video/*" multiple>
            {(props) => <Button {...props}>＋ 動画を選択</Button>}
          </FileButton>
          <MobileCaptureButton onPicked={startUpload} />
        </Group>
      }
    >
      <Stack>
        <Paper
          withBorder
          p="lg"
          style={{
            borderStyle: "dashed",
            background: dragging ? "var(--mantine-color-blue-0)" : undefined,
            transition: "background 120ms",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer?.files?.length) startUploadMany(e.dataTransfer.files);
          }}
        >
          <Text ta="center" c={dragging ? "blue" : "dimmed"}>
            動画ファイルをここにドラッグ&ドロップ
          </Text>
        </Paper>

        {uploads.length > 0 && (
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>アップロード状況 ({uploads.length})</Title>
              <Button size="xs" variant="subtle" onClick={clearFinished}>
                完了/失敗をクリア
              </Button>
            </Group>
            {uploads.map((u) => (
              <Group key={u.id} gap="md" wrap="nowrap">
                <Text size="sm" flex={1} truncate>
                  {u.fileName}
                </Text>
                <Text size="xs" c="dimmed" miw={80} ta="right">
                  {(u.size / (1024 * 1024)).toFixed(1)} MB
                </Text>
                <Progress
                  value={u.progress}
                  color={
                    u.state === "error" ? "red"
                    : u.state === "canceled" ? "gray"
                    : u.state === "done" ? "green"
                    : "blue"
                  }
                  miw={200}
                  size="sm"
                  flex={1}
                />
                <Text size="xs" w={130} ta="right">
                  {u.state === "uploading" && `${u.progress}% · ${formatRate(u)}`}
                  {u.state === "done" && "完了"}
                  {u.state === "canceled" && "中止"}
                  {u.state === "error" && (u.error ?? "失敗")}
                </Text>
                <Group gap={4} w={70} justify="flex-end">
                  {u.state === "uploading" && (
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => cancelUpload(u.id)} aria-label="中止">
                      ✕
                    </ActionIcon>
                  )}
                  {(u.state === "error" || u.state === "canceled") && (
                    <ActionIcon size="sm" variant="subtle" onClick={() => retryUpload(u.id)} aria-label="再試行">
                      ↻
                    </ActionIcon>
                  )}
                </Group>
              </Group>
            ))}
          </Stack>
        )}

        <Table striped highlightOnHover withRowBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Storage Key</Table.Th>
              <Table.Th>Device</Table.Th>
              <Table.Th>Recorded At</Table.Th>
              <Table.Th>Duration</Table.Th>
              <Table.Th>Session</Table.Th>
              <Table.Th>作成日時</Table.Th>
              <Table.Th style={{ width: 140 }}>操作</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {list.map((v) => (
              <Table.Tr key={v.id}>
                <Table.Td>
                  <Text size="xs" ff="monospace" truncate maw={180}>
                    {v.storageKey}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {v.deviceId ? deviceNameById.get(v.deviceId) ?? v.deviceId : "—"}
                </Table.Td>
                <Table.Td>
                  {v.recordedAt ? new Date(v.recordedAt).toLocaleString() : "—"}
                </Table.Td>
                <Table.Td>{v.durationSec != null ? `${v.durationSec}s` : "—"}</Table.Td>
                <Table.Td>
                  {v.sessionId ? (
                    <Badge size="sm" variant="light">
                      {sessionNameById.get(v.sessionId) ?? "Session"}
                    </Badge>
                  ) : (
                    <Text size="xs" c="dimmed">
                      未割当
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>{new Date(v.createdAt).toLocaleString()}</Table.Td>
                <Table.Td>
                  <VideoActions video={v} />
                </Table.Td>
              </Table.Tr>
            ))}
            {list.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed" ta="center" py="md">
                    まだ動画がありません
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Stack>
    </ResourcePage>
  );
}

function MobileCaptureButton({ onPicked }: { onPicked: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) onPicked(f);
          e.currentTarget.value = "";
        }}
      />
      <Button variant="default" onClick={() => inputRef.current?.click()}>
        📷 撮影
      </Button>
    </>
  );
}

function formatRate(u: UploadItem): string {
  const elapsed = (Date.now() - u.startedAt) / 1000;
  if (elapsed <= 0 || u.bytesUploaded <= 0) return "—";
  const mbps = u.bytesUploaded / elapsed / (1024 * 1024);
  return `${mbps.toFixed(1)} MB/s`;
}

function VideoActions({ video }: { video: Video }) {
  const [playOpen, { open: openPlay, close: closePlay }] = useDisclosure(false);
  const [metaOpen, { open: openMeta, close: closeMeta }] = useDisclosure(false);
  const [sessionOpen, { open: openSession, close: closeSession }] = useDisclosure(false);
  const del = useDeleteVideo();
  return (
    <Group gap={4}>
      <ActionIcon variant="subtle" onClick={openPlay} aria-label="再生">
        ▶
      </ActionIcon>
      <ActionIcon variant="subtle" onClick={openMeta} aria-label="メタデータ編集">
        ✏️
      </ActionIcon>
      <ActionIcon variant="subtle" onClick={openSession} aria-label="Session 紐付け">
        📁
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="red"
        loading={del.isPending}
        onClick={() => {
          if (confirm("削除しますか？ オブジェクトストレージのファイルも消えます")) {
            del.mutate(video.id);
          }
        }}
        aria-label="削除"
      >
        🗑️
      </ActionIcon>
      {playOpen && <PlaybackModal video={video} onClose={closePlay} />}
      {metaOpen && <VideoMetadataModal video={video} onClose={closeMeta} />}
      {sessionOpen && <SessionAssignModal video={video} onClose={closeSession} />}
    </Group>
  );
}

function PlaybackModal({ video, onClose }: { video: Video; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  if (!requested.current) {
    requested.current = true;
    videosApi
      .playbackUrl(video.id)
      .then((r) => setUrl(r.url))
      .catch((e) => setError(e instanceof ApiError ? e.body.message : String(e)));
  }

  return (
    <Modal opened onClose={onClose} title="動画再生" size="xl">
      {error && <Alert color="red">{error}</Alert>}
      {!error && !url && <Text>署名 URL を取得中...</Text>}
      {url && (
        <video controls style={{ width: "100%", maxHeight: "70vh" }} src={url}>
          <track kind="captions" />
        </video>
      )}
    </Modal>
  );
}
