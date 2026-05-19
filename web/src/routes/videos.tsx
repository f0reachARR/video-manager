import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  FileButton,
  Group,
  Modal,
  NumberInput,
  Paper,
  Progress,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "tus-js-client";

import { AnnotatedPlayer } from "../components/AnnotatedPlayer";
import { ResourcePage } from "../components/ResourcePage";
import { SessionAssignModal } from "../components/SessionAssignModal";
import { VideoMetadataModal } from "../components/VideoMetadataModal";
import { type Video, videosApi } from "../lib/api/client";
import { useCurrentUserId } from "../lib/currentUser";
import { formatDateTimeFull, formatDateTimeShort } from "../lib/datetime";
import {
  useCreateRun,
  useDeleteVideo,
  useDevices,
  useRobots,
  useScenarios,
  useSessions,
  useTeams,
  useUpdateVideo,
  useVideos,
} from "../lib/queries";
import { useNavigate } from "@tanstack/react-router";

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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Multi-select for "選択した動画から Run を作成" flow.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createRunOpened, setCreateRunOpened] = useState(false);

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
    if (sessionId) meta.sessionId = sessionId;
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
        setUploads((u) =>
          u.map((it) => (it.id === id ? { ...it, ...patch } : it)),
        ),
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
    setUploads((u) =>
      u.map((it) => (it.id === id ? { ...it, state: "canceled" } : it)),
    );
  };

  const retryUpload = (id: string) => {
    setUploads((u) =>
      u.map((it) =>
        it.id === id
          ? {
              ...it,
              state: "uploading",
              error: undefined,
              startedAt: Date.now(),
            }
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
            placeholder="Session"
            data={(sessions.data?.data ?? []).map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            value={sessionId}
            onChange={setSessionId}
            clearable
            searchable
            w={200}
            size="sm"
          />
          <Select
            placeholder="Device"
            data={devicesList.map((d) => ({ value: d.id, label: d.name }))}
            value={deviceId}
            onChange={setDeviceId}
            clearable
            w={200}
            size="sm"
          />
          <FileButton
            onChange={(files) => files && startUploadMany(files)}
            accept="video/*"
            multiple
          >
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
            if (e.dataTransfer?.files?.length)
              startUploadMany(e.dataTransfer.files);
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
                    u.state === "error"
                      ? "red"
                      : u.state === "canceled"
                        ? "gray"
                        : u.state === "done"
                          ? "green"
                          : "blue"
                  }
                  miw={200}
                  size="sm"
                  flex={1}
                />
                <Text size="xs" w={130} ta="right">
                  {u.state === "uploading" &&
                    `${u.progress}% · ${formatRate(u)}`}
                  {u.state === "done" && "完了"}
                  {u.state === "canceled" && "中止"}
                  {u.state === "error" && (u.error ?? "失敗")}
                </Text>
                <Group gap={4} w={70} justify="flex-end">
                  {u.state === "uploading" && (
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      onClick={() => cancelUpload(u.id)}
                      aria-label="中止"
                    >
                      ✕
                    </ActionIcon>
                  )}
                  {(u.state === "error" || u.state === "canceled") && (
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      onClick={() => retryUpload(u.id)}
                      aria-label="再試行"
                    >
                      ↻
                    </ActionIcon>
                  )}
                </Group>
              </Group>
            ))}
          </Stack>
        )}

        {selected.size > 0 && (
          <Group
            justify="space-between"
            px="sm"
            py="xs"
            bg="var(--mantine-color-blue-light)"
          >
            <Text size="sm">{selected.size} 件選択中</Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="filled"
                onClick={() => setCreateRunOpened(true)}
              >
                🎬 選択した動画から Run を作成
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => setSelected(new Set())}
              >
                選択解除
              </Button>
            </Group>
          </Group>
        )}

        <Table striped highlightOnHover withRowBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 40 }}>
                <Checkbox
                  aria-label="全選択"
                  checked={list.length > 0 && selected.size === list.length}
                  indeterminate={
                    selected.size > 0 && selected.size < list.length
                  }
                  onChange={(e) => {
                    if (e.currentTarget.checked) {
                      setSelected(new Set(list.map((x) => x.id)));
                    } else {
                      setSelected(new Set());
                    }
                  }}
                />
              </Table.Th>
              <Table.Th style={{ width: 90 }}>Thumb</Table.Th>
              <Table.Th>Name</Table.Th>
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
                  <Checkbox
                    checked={selected.has(v.id)}
                    onChange={(e) => {
                      setSelected((cur) => {
                        const next = new Set(cur);
                        if (e.currentTarget?.checked) next.add(v.id);
                        else next.delete(v.id);
                        return next;
                      });
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <VideoThumb video={v} />
                </Table.Td>
                <Table.Td>
                  <VideoNameCell video={v} />
                </Table.Td>
                <Table.Td>
                  {v.deviceId
                    ? (deviceNameById.get(v.deviceId) ?? v.deviceId)
                    : "—"}
                </Table.Td>
                <Table.Td>
                  {v.recordedAt ? (
                    <Text size="xs" title={formatDateTimeFull(v.recordedAt)}>
                      {formatDateTimeShort(v.recordedAt)}
                    </Text>
                  ) : (
                    "—"
                  )}
                </Table.Td>
                <Table.Td>
                  {v.durationSec != null ? `${v.durationSec}s` : "—"}
                </Table.Td>
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
                <Table.Td>
                  <Text size="xs" title={formatDateTimeFull(v.createdAt)}>
                    {formatDateTimeShort(v.createdAt)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <VideoActions video={v} />
                </Table.Td>
              </Table.Tr>
            ))}
            {list.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={9}>
                  <Text c="dimmed" ta="center" py="md">
                    まだ動画がありません
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Stack>

      {createRunOpened && (
        <CreateRunFromVideosModal
          videos={list.filter((v) => selected.has(v.id))}
          onClose={() => setCreateRunOpened(false)}
          onCreated={() => {
            setCreateRunOpened(false);
            setSelected(new Set());
          }}
        />
      )}
    </ResourcePage>
  );
}

function CreateRunFromVideosModal({
  videos,
  onClose,
  onCreated,
}: {
  videos: Video[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const sessions = useSessions();
  const teams = useTeams();
  const robots = useRobots();
  const scenarios = useScenarios();
  const create = useCreateRun();
  const navigate = useNavigate();

  // Pre-fill: shared session across selection (if any), and duration = longest video.
  const sharedSession = useMemo(() => {
    const ids = new Set(
      videos.map((v) => v.sessionId).filter(Boolean) as string[],
    );
    return ids.size === 1 ? [...ids][0] : null;
  }, [videos]);
  const maxDur = useMemo(
    () => Math.max(0, ...videos.map((v) => v.durationSec ?? 0)),
    [videos],
  );
  // Default startedAt = earliest recording time of the selection (falling
  // back to createdAt when recordedAt isn't set). Lets the timeline line up
  // with when the run actually happened instead of "now".
  const defaultStart = useMemo(() => {
    const stamps = videos
      .map((v) => v.recordedAt ?? v.createdAt)
      .filter(Boolean)
      .map((s) => new Date(s as string).getTime())
      .filter((n) => Number.isFinite(n));
    if (stamps.length === 0) return new Date();
    return new Date(Math.min(...stamps));
  }, [videos]);

  const [sessionId, setSessionId] = useState<string | null>(sharedSession);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [robotId, setRobotId] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(defaultStart);
  const [duration, setDuration] = useState<number | "">(maxDur || "");
  const [memo, setMemo] = useState("");
  const [angleLabels, setAngleLabels] = useState<Record<string, string>>({});
  const [runOffsets, setRunOffsets] = useState<Record<string, number>>({});

  // Whenever the Run start moves, re-derive each video's runOffsetSec from
  // its recording time. This is the headline default: a clip that started 30s
  // after Run start should sit at runOffset=30 on the timeline. Manual edits
  // are intentionally overwritten so the offsets stay consistent with the
  // chosen start; the user re-tweaks afterward if needed.
  useEffect(() => {
    if (!startedAt) return;
    const base = startedAt.getTime();
    const next: Record<string, number> = {};
    for (const v of videos) {
      const ts = v.recordedAt ?? v.createdAt;
      if (!ts) {
        next[v.id] = 0;
        continue;
      }
      const delta = (new Date(ts).getTime() - base) / 1000;
      next[v.id] = Math.max(0, Math.round(delta));
    }
    setRunOffsets(next);
  }, [startedAt, videos]);

  const submit = () => {
    if (!sessionId || !teamId || !robotId || !scenarioId || !startedAt) return;
    const dur =
      typeof duration === "number" && duration > 0 ? duration : maxDur || 0;
    create.mutate(
      {
        sessionId,
        teamId,
        robotId,
        scenarioId,
        startedAt: startedAt.toISOString(),
        durationSec: Math.max(0, Math.round(dur)),
        memo,
        videos: videos.map((v) => ({
          videoId: v.id,
          videoOffsetStartSec: 0,
          videoOffsetEndSec: Math.round(v.durationSec ?? 0),
          runOffsetSec: runOffsets[v.id] ?? 0,
          angleLabel: angleLabels[v.id] ?? "",
        })),
      },
      {
        onSuccess: (run) => {
          onCreated();
          navigate({ to: "/runs/$runId", params: { runId: run.id } });
        },
      },
    );
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title="選択した動画から Run を作成"
      size="xl"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {videos.length} 件の動画から Run
          を作成します。各動画はアングルとして自動で紐付きます。
        </Text>
        <Select
          label="Session"
          data={(sessions.data?.data ?? []).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          value={sessionId}
          onChange={setSessionId}
          searchable
          required
        />
        <Group grow>
          <Select
            label="Team"
            data={(teams.data?.data ?? []).map((t) => ({
              value: t.id,
              label: t.name,
            }))}
            value={teamId}
            onChange={setTeamId}
            required
          />
          <Select
            label="Robot"
            data={(robots.data?.data ?? []).map((r) => ({
              value: r.id,
              label: r.name,
            }))}
            value={robotId}
            onChange={setRobotId}
            required
          />
          <Select
            label="Scenario"
            data={(scenarios.data?.data ?? []).map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            value={scenarioId}
            onChange={setScenarioId}
            required
          />
        </Group>
        <Group grow>
          <DateTimePicker
            label="開始時刻"
            description="選択した動画の最初の録画時刻で初期化"
            value={startedAt}
            onChange={(v) => setStartedAt(v ? new Date(v) : null)}
            withSeconds
          />
          <NumberInput
            label="Duration (sec)"
            description="最も長い動画の長さで初期化"
            value={duration}
            min={0}
            onChange={(v) => setDuration(typeof v === "number" ? v : "")}
          />
        </Group>
        <Textarea
          label="Memo"
          value={memo}
          onChange={(e) => setMemo(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Text size="xs" fw={500} mt="sm">
          アングル設定
        </Text>
        <Table withRowBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Video</Table.Th>
              <Table.Th style={{ width: 130 }}>Run Offset (sec)</Table.Th>
              <Table.Th>Angle Label</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {videos.map((v) => (
              <Table.Tr key={v.id}>
                <Table.Td>
                  <Text size="xs" truncate maw={220}>
                    {v.displayName?.trim() || v.storageKey.slice(0, 16)} ({v.durationSec ?? "?"}s)
                  </Text>
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    size="xs"
                    min={0}
                    value={runOffsets[v.id] ?? 0}
                    onChange={(n) =>
                      setRunOffsets((cur) => ({
                        ...cur,
                        [v.id]: typeof n === "number" ? n : 0,
                      }))
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    size="xs"
                    placeholder="例: 正面"
                    value={angleLabels[v.id] ?? ""}
                    onChange={(e) =>
                      setAngleLabels((cur) => ({
                        ...cur,
                        [v.id]: e.currentTarget.value,
                      }))
                    }
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending}
            disabled={!sessionId || !teamId || !robotId || !scenarioId}
          >
            作成
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// Inline-editable display name. Falls back to a truncated storage_key when
// the row predates the displayName column or upload had no filename meta.
function VideoNameCell({ video }: { video: Video }) {
  const update = useUpdateVideo();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(video.displayName ?? "");
  if (editing) {
    const commit = () => {
      const next = draft.trim();
      if (next !== (video.displayName ?? "")) {
        update.mutate({ id: video.id, body: { displayName: next } });
      }
      setEditing(false);
    };
    return (
      <TextInput
        size="xs"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") {
            setDraft(video.displayName ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }
  const shown = video.displayName?.trim() || video.storageKey;
  return (
    <Text
      size="sm"
      truncate
      maw={220}
      title={`${shown} (${video.storageKey})\nクリックで編集`}
      onClick={() => {
        setDraft(video.displayName ?? "");
        setEditing(true);
      }}
      style={{ cursor: "pointer" }}
    >
      {shown}
    </Text>
  );
}

function VideoThumb({ video }: { video: Video }) {
  const [url, setUrl] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const requested = useRef(false);

  if (!video.hasThumbnail) {
    return (
      <div
        style={{
          width: 80,
          height: 45,
          background: "var(--mantine-color-gray-2)",
          borderRadius: 4,
        }}
      />
    );
  }
  if (!requested.current) {
    requested.current = true;
    videosApi
      .thumbnailUrl(video.id)
      .then((r) => setUrl(r.url))
      .catch(() => setErrored(true));
  }
  if (errored || !url) {
    return (
      <div
        style={{
          width: 80,
          height: 45,
          background: "var(--mantine-color-gray-3)",
          borderRadius: 4,
        }}
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      style={{
        width: 80,
        height: 45,
        objectFit: "cover",
        borderRadius: 4,
        background: "#000",
      }}
    />
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
  const [sessionOpen, { open: openSession, close: closeSession }] =
    useDisclosure(false);
  const del = useDeleteVideo();
  return (
    <Group gap={4}>
      <ActionIcon variant="subtle" onClick={openPlay} aria-label="再生">
        ▶
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        onClick={openMeta}
        aria-label="メタデータ編集"
      >
        ✏️
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        onClick={openSession}
        aria-label="Session 紐付け"
      >
        📁
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="red"
        loading={del.isPending}
        onClick={() => {
          if (
            confirm("削除しますか？ オブジェクトストレージのファイルも消えます")
          ) {
            del.mutate(video.id);
          }
        }}
        aria-label="削除"
      >
        🗑️
      </ActionIcon>
      {playOpen && <PlaybackModal video={video} onClose={closePlay} />}
      {metaOpen && <VideoMetadataModal video={video} onClose={closeMeta} />}
      {sessionOpen && (
        <SessionAssignModal video={video} onClose={closeSession} />
      )}
    </Group>
  );
}

function PlaybackModal({
  video,
  onClose,
}: {
  video: Video;
  onClose: () => void;
}) {
  return (
    <Modal opened onClose={onClose} title="動画再生 + Annotation" size="xl">
      <AnnotatedPlayer video={video} />
    </Modal>
  );
}
