import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { ApiError } from "../../lib/api/client";
import { useRun, useUpdateRun } from "../../features/runs/api/queries";
import { useMarkers } from "../../features/markers/api/queries";
import { useRobots } from "../../features/robots/api/queries";
import { useScenarios } from "../../features/scenarios/api/queries";
import { formatDateTimeFull, formatDateTimeShort } from "../../lib/time";
import { SyncPlayer } from "../../features/runs/components/SyncPlayer";
import { MarkersSection } from "../../features/runs/components/MarkersSection";
import { AnglesTimeline } from "../../features/runs/components/AnglesTimeline";
import {
  AddVideoModal,
  RunVideosTable,
} from "../../features/runs/components/RunVideosTable";
import { RecommendedVideos } from "../../features/runs/components/RecommendedVideos";
import { RunMetadataEditor } from "../../features/runs/components/RunMetadataEditor";

export const Route = createFileRoute("/runs/$runId")({
  component: RunDetailPage,
});

function RunDetailPage() {
  const { runId } = Route.useParams();
  const run = useRun(runId);
  const updateRun = useUpdateRun();
  const robots = useRobots();
  const scenarios = useScenarios();
  const allMarkers = useMarkers(runId);
  const navigate = useNavigate();

  const [addVideoOpen, { open: openAddVideo, close: closeAddVideo }] =
    useDisclosure(false);
  const [t, setT] = useState(0);
  const [runDurationSec, setRunDurationSec] = useState(0);
  const seekRef = useRef<(sec: number) => void>(() => {});

  if (run.isLoading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }
  if (run.error || !run.data) {
    return (
      <Alert color="red" m="md">
        {run.error instanceof ApiError
          ? run.error.body.message
          : (run.error as Error)?.message}
      </Alert>
    );
  }
  const r = run.data;

  return (
    <Stack maw={1280} mx="auto">
      <Group justify="space-between">
        <Stack gap={4}>
          <Group gap="sm">
            <Button
              size="xs"
              variant="subtle"
              onClick={() => navigate({ to: "/runs" })}
            >
              ← Run 一覧
            </Button>
            <Title order={2}>Run 詳細</Title>
          </Group>
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              <span title={formatDateTimeFull(r.startedAt)}>
                ▶ {formatDateTimeShort(r.startedAt)}
              </span>
              {" / "}
              {r.durationSec ?? 0}s
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">
              {r.id}
            </Text>
          </Group>
        </Stack>
        <Button
          size="xs"
          variant="default"
          onClick={() => {
            const url = `${window.location.origin}/share/runs/${r.id}`;
            navigator.clipboard?.writeText(url).catch(() => {});
            window.open(url, "_blank");
          }}
        >
          🔗 共有リンクをコピー
        </Button>
      </Group>

      <SyncPlayer
        run={r}
        t={t}
        onTChange={setT}
        onDurationChange={setRunDurationSec}
        registerSeek={(fn) => {
          seekRef.current = fn;
        }}
        markers={allMarkers.data?.data ?? []}
      />

      <MarkersSection
        runId={r.id}
        currentSec={t}
        durationSec={runDurationSec}
        onSeek={(s) => seekRef.current(s)}
      />

      <Group justify="space-between" mt="lg">
        <Title order={4}>紐づけアングル ({(r.videos ?? []).length})</Title>
        <Button size="xs" onClick={openAddVideo}>
          ＋ アングルを追加
        </Button>
      </Group>
      <AnglesTimeline
        run={r}
        currentSec={t}
        durationSec={runDurationSec}
        onSeek={(s) => seekRef.current(s)}
      />
      <RunVideosTable run={r} />

      <RecommendedVideos run={r} />

      <Title order={4} mt="lg">
        メタデータ
      </Title>
      <RunMetadataEditor
        run={r}
        robotOptions={(robots.data?.data ?? []).map((x) => ({
          value: x.id,
          label: x.name,
        }))}
        scenarioOptions={(scenarios.data?.data ?? []).map((x) => ({
          value: x.id,
          label: x.name,
        }))}
        onSave={(body) => updateRun.mutate({ id: r.id, body })}
        saving={updateRun.isPending}
      />

      {addVideoOpen && <AddVideoModal run={r} onClose={closeAddVideo} />}
    </Stack>
  );
}
