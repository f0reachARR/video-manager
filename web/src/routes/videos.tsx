import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  FileButton,
  Group,
  Modal,
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
  state: "uploading" | "done" | "error";
  error?: string;
};

function VideosPage() {
  const videos = useVideos();
  const devices = useDevices();
  const sessions = useSessions();
  const currentUserId = useCurrentUserId();
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

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

  const startUpload = (file: File) => {
    const id = crypto.randomUUID();
    setUploads((u) => [
      ...u,
      { id, fileName: file.name, size: file.size, progress: 0, state: "uploading" },
    ]);
    const meta: Record<string, string> = {
      filename: file.name,
      filetype: file.type || "application/octet-stream",
    };
    if (deviceId) meta.deviceId = deviceId;
    if (currentUserId) meta.uploaderId = currentUserId;
    const upload = new Upload(file, {
      endpoint: TUSD_ENDPOINT,
      retryDelays: [0, 1000, 3000, 5000],
      chunkSize: 8 * 1024 * 1024,
      metadata: meta,
      onError(err) {
        setUploads((u) =>
          u.map((it) => (it.id === id ? { ...it, state: "error", error: err.message } : it)),
        );
      },
      onProgress(sent, total) {
        const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
        setUploads((u) => u.map((it) => (it.id === id ? { ...it, progress: pct } : it)));
      },
      onSuccess() {
        setUploads((u) =>
          u.map((it) => (it.id === id ? { ...it, state: "done", progress: 100 } : it)),
        );
        // Give tusd's hook a brief moment to hit the API, then refresh the list.
        setTimeout(() => videos.refetch(), 800);
      },
    });
    upload.start();
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
          <FileButton onChange={(f) => f && startUpload(f)} accept="video/*">
            {(props) => <Button {...props}>＋ 動画をアップロード</Button>}
          </FileButton>
        </Group>
      }
    >
      <Stack>
        {uploads.length > 0 && (
          <Stack gap="xs">
            <Title order={5}>アップロード状況</Title>
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
                  color={u.state === "error" ? "red" : u.state === "done" ? "green" : "blue"}
                  miw={200}
                  size="sm"
                  flex={1}
                />
                <Text size="xs" w={80} ta="right">
                  {u.state === "uploading" && `${u.progress}%`}
                  {u.state === "done" && "完了"}
                  {u.state === "error" && (u.error ?? "失敗")}
                </Text>
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
