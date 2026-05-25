import { Button, FileButton, Group, Select, Stack, Text } from "@mantine/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import { useCurrentTournamentId } from "../stores/currentTournament";
import { useCurrentUserId } from "../stores/currentUser";
import { useDevices } from "../features/devices/api/queries";
import { useSessions } from "../features/sessions/api/queries";
import { useVideos } from "../features/videos/api/queries";
import { useTusUpload } from "../features/uploads/hooks/useTusUpload";
import { UploadDropzone } from "../features/uploads/components/UploadDropzone";
import { UploadQueue } from "../features/uploads/components/UploadQueue";
import { MobileCaptureButton } from "../features/uploads/components/MobileCaptureButton";
import { VideoList } from "../features/videos/components/VideoList";

export const Route = createFileRoute("/videos")({
  component: VideosPage,
});

function VideosPage() {
  // The single Session select serves a dual role: it tags new uploads, and
  // it filters the list. The latter is what makes "選択した動画から Run を作成"
  // safe — a Run is per-Session, so we require the filter to be set before
  // letting the user build one. Otherwise the selection could span sessions
  // and the server would reject it.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const videos = useVideos(sessionId ? { sessionId } : {});
  const devices = useDevices();
  const sessions = useSessions();
  const currentUserId = useCurrentUserId();
  const currentTournamentId = useCurrentTournamentId();
  const navigate = useNavigate();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // useTusUpload's getMeta reads the latest selection at upload start, so we
  // mirror the upload-time meta to refs to avoid resetting the hook when the
  // user picks a different Session/Device between drops.
  const metaRef = useRef({ deviceId, sessionId, currentUserId, currentTournamentId });
  metaRef.current = { deviceId, sessionId, currentUserId, currentTournamentId };

  const upload = useTusUpload({
    getMeta: () => ({
      tournamentId: metaRef.current.currentTournamentId,
      deviceId: metaRef.current.deviceId,
      sessionId: metaRef.current.sessionId,
      uploaderId: metaRef.current.currentUserId,
    }),
    onSuccess: () => videos.refetch(),
  });

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
            placeholder="Session (絞り込み + アップロード先)"
            data={(sessions.data?.data ?? []).map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            value={sessionId}
            onChange={(v) => {
              setSessionId(v);
              // Selection across Sessions is meaningless for Run creation,
              // so clear it whenever the filter changes.
              setSelected(new Set());
            }}
            clearable
            searchable
            w={260}
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
            onChange={(files) => files && upload.startUploadMany(files)}
            accept="video/*"
            multiple
          >
            {(props) => <Button {...props}>＋ 動画を選択</Button>}
          </FileButton>
          <MobileCaptureButton onPicked={upload.startUpload} />
        </Group>
      }
    >
      <Stack>
        <UploadDropzone onFiles={(files) => upload.startUploadMany(files)} />

        <UploadQueue
          uploads={upload.uploads}
          onCancel={upload.cancelUpload}
          onRetry={upload.retryUpload}
          onClearFinished={upload.clearFinished}
        />

        {selected.size > 0 && (
          <Group
            justify="space-between"
            px="sm"
            py="xs"
            bg="var(--mantine-color-blue-light)"
          >
            <Text size="sm">
              {selected.size} 件選択中
              {!sessionId && " — Session で絞り込んでから Run を作成できます"}
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="filled"
                onClick={() =>
                  sessionId &&
                  navigate({
                    to: "/runs/new-from-videos",
                    search: {
                      sessionId,
                      videoIds: [...selected].join(","),
                    },
                  })
                }
                disabled={!sessionId}
                title={
                  sessionId
                    ? undefined
                    : "Run は単一の Session に紐づくため、まず Session で絞り込んでください"
                }
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

        <VideoList
          videos={list}
          selected={selected}
          onSelectedChange={setSelected}
        />
      </Stack>
    </ResourcePage>
  );
}
