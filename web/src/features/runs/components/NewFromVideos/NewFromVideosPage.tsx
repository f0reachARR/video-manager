import {
  Alert,
  Anchor,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Video } from "../../../../lib/api/client";
import { useSessions } from "../../../sessions/api/queries";
import { useVideos } from "../../../videos/api/queries";
import { useCreateRun } from "../../api/queries";
import { DefaultMetadataCard } from "./DefaultMetadataCard";
import { Preview } from "./Preview";
import { RegionsTable } from "./RegionsTable";
import { Timeline } from "./Timeline";
import { newRegionId, type Region } from "./types";
import { useRegionDrag } from "./useRegionDrag";

export function NewFromVideosPage({
  sessionId,
  requestedIds,
}: {
  sessionId: string;
  requestedIds: string[];
}) {
  const navigate = useNavigate();

  const sessions = useSessions();
  const create = useCreateRun();
  // Fetch all videos in the Session — we then filter by the IDs in search
  // params. Avoids N round-trips and reuses the same list endpoint the
  // Videos page already populated.
  const videosQuery = useVideos(sessionId ? { sessionId } : {});

  const videos = useMemo(() => {
    const all = videosQuery.data?.data ?? [];
    const byId = new Map(all.map((v) => [v.id, v]));
    return requestedIds
      .map((id) => byId.get(id))
      .filter((v): v is Video => !!v);
  }, [videosQuery.data, requestedIds]);

  const sessionName = useMemo(() => {
    const s = (sessions.data?.data ?? []).find((x) => x.id === sessionId);
    return s?.name ?? sessionId ?? "—";
  }, [sessions.data, sessionId]);

  // --- Timeline domain ---------------------------------------------------
  const placeable = useMemo(
    () => videos.filter((v) => v.recordedAt),
    [videos],
  );
  const unplaceable = useMemo(
    () => videos.filter((v) => !v.recordedAt),
    [videos],
  );
  const t0Ms = useMemo(() => {
    const stamps = placeable.map((v) =>
      new Date(v.recordedAt as string).getTime(),
    );
    return stamps.length === 0 ? Date.now() : Math.min(...stamps);
  }, [placeable]);
  const totalSec = useMemo(() => {
    let max = 1;
    for (const v of placeable) {
      const s = (new Date(v.recordedAt as string).getTime() - t0Ms) / 1000;
      max = Math.max(max, s + (v.durationSec ?? 0));
    }
    return Math.max(max, 1);
  }, [placeable, t0Ms]);
  const bandOf = (v: Video) => {
    const startSec =
      (new Date(v.recordedAt as string).getTime() - t0Ms) / 1000;
    return { startSec, endSec: startSec + (v.durationSec ?? 0) };
  };

  // --- Defaults applied to new regions ----------------------------------
  const [defaultTeam, setDefaultTeam] = useState<string | null>(null);
  const [defaultRobot, setDefaultRobot] = useState<string | null>(null);
  const [defaultScenario, setDefaultScenario] = useState<string | null>(null);
  const [angleLabels, setAngleLabels] = useState<Record<string, string>>({});

  // --- Regions ----------------------------------------------------------
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Preview playhead in wall-clock seconds from t0. Always lives in
  // [0, totalSec]; the preview spans the full timeline regardless of
  // selection. Picking a region just jumps the playhead to its start for
  // convenience — no range gating.
  const [previewT, setPreviewT] = useState(0);
  const selectedRegion = useMemo(
    () => regions.find((r) => r.id === selectedId) ?? null,
    [regions, selectedId],
  );
  // "ここからスタート" remembers the current playhead time so a later
  // "ここまで" can finalize a fresh region. Only active when no region is
  // selected (when one is selected, the buttons edit that region instead).
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  // Jump playhead to region start when the user picks one — makes it easy
  // to fine-tune by playing back.
  useEffect(() => {
    if (!selectedRegion) return;
    setPreviewT(selectedRegion.startSec);
  }, [selectedRegion?.id]);

  const trackRef = useRef<HTMLDivElement>(null);
  const { startTrackDrag, startRegionDrag, onPointerMove, endDrag } =
    useRegionDrag({
      trackRef,
      totalSec,
      placeableCount: placeable.length,
      defaults: {
        teamId: defaultTeam,
        robotId: defaultRobot,
        scenarioId: defaultScenario,
      },
      setRegions,
      setSelectedId,
    });

  const updateRegion = (id: string, patch: Partial<Region>) =>
    setRegions((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRegion = (id: string) => {
    setRegions((rs) => rs.filter((r) => r.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  // "ここからスタート" — if a region is selected, edit its start; otherwise
  // remember the playhead for the next "ここまで" to commit.
  const handleSetStart = useCallback(() => {
    if (selectedRegion) {
      updateRegion(selectedRegion.id, {
        startSec: Math.min(previewT, selectedRegion.endSec - 0.5),
      });
    } else {
      setPendingStart(previewT);
    }
  }, [selectedRegion, previewT]);

  // "ここまで" — for the selected region, set its end. With no selection,
  // commit [pendingStart, previewT] as a new region and select it.
  const handleSetEnd = useCallback(() => {
    if (selectedRegion) {
      updateRegion(selectedRegion.id, {
        endSec: Math.max(previewT, selectedRegion.startSec + 0.5),
      });
      return;
    }
    if (pendingStart == null) return;
    const startSec = Math.min(pendingStart, previewT);
    const endSec = Math.max(pendingStart, previewT);
    if (endSec - startSec < 0.5) return;
    const id = newRegionId();
    setRegions((rs) => [
      ...rs,
      {
        id,
        startSec,
        endSec,
        teamId: defaultTeam,
        robotId: defaultRobot,
        scenarioId: defaultScenario,
        memo: "",
        score: "",
      },
    ]);
    setSelectedId(id);
    setPendingStart(null);
  }, [
    selectedRegion,
    previewT,
    pendingStart,
    defaultTeam,
    defaultRobot,
    defaultScenario,
  ]);

  // Newly-changed defaults flow into any region whose field was still null
  // (i.e. never customized). This is the "set once, apply everywhere"
  // ergonomic that makes building N runs tolerable.
  useEffect(() => {
    setRegions((rs) =>
      rs.map((r) => ({
        ...r,
        teamId: r.teamId ?? defaultTeam,
        robotId: r.robotId ?? defaultRobot,
        scenarioId: r.scenarioId ?? defaultScenario,
      })),
    );
  }, [defaultTeam, defaultRobot, defaultScenario]);

  // --- Submit -----------------------------------------------------------
  const allValid =
    regions.length > 0 &&
    regions.every(
      (r) =>
        r.teamId && r.robotId && r.scenarioId && r.endSec - r.startSec >= 0.5,
    );

  const submit = async () => {
    if (!sessionId || !allValid) return;
    for (const r of regions) {
      const dur = Math.max(1, Math.round(r.endSec - r.startSec));
      const startedIso = new Date(t0Ms + r.startSec * 1000).toISOString();
      const attached = placeable
        .map((v) => {
          const b = bandOf(v);
          const ovStart = Math.max(r.startSec, b.startSec);
          const ovEnd = Math.min(r.endSec, b.endSec);
          if (ovEnd <= ovStart) return null;
          return {
            videoId: v.id,
            videoOffsetStartSec: Math.max(0, Math.round(ovStart - b.startSec)),
            videoOffsetEndSec: Math.round(ovEnd - b.startSec),
            runOffsetSec: Math.max(0, Math.round(ovStart - r.startSec)),
            angleLabel: angleLabels[v.id] ?? "",
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      // Sequential so a failure mid-batch leaves earlier Runs intact and
      // makes the failure point obvious.
      await create.mutateAsync({
        sessionId,
        teamId: r.teamId as string,
        robotId: r.robotId as string,
        scenarioId: r.scenarioId as string,
        startedAt: startedIso,
        durationSec: dur,
        score: r.score === "" ? null : (r.score as number),
        memo: r.memo,
        videos: attached,
      });
    }
    navigate({ to: "/runs" });
  };

  // --- Render -----------------------------------------------------------
  if (!sessionId || requestedIds.length === 0) {
    return (
      <Container size="md" py="xl">
        <Alert color="red" title="パラメータ不足">
          Session と動画 ID が必要です。
          <Anchor onClick={() => navigate({ to: "/videos" })}>
            動画一覧へ戻る
          </Anchor>
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      <Stack>
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Group gap="xs">
              <Anchor size="sm" onClick={() => navigate({ to: "/videos" })}>
                ← 動画一覧
              </Anchor>
            </Group>
            <Title order={3}>選択動画から Run を作成</Title>
            <Text size="sm" c="dimmed">
              Session: <b>{sessionName}</b> / 動画 {videos.length} 本
              {unplaceable.length > 0 &&
                ` (うち ${unplaceable.length} 本は recordedAt が無く配置不可)`}
            </Text>
          </Stack>
          <Group>
            <Button variant="default" onClick={() => navigate({ to: "/videos" })}>
              キャンセル
            </Button>
            <Button
              onClick={submit}
              disabled={!allValid}
              loading={create.isPending}
            >
              {regions.length} 本の Run を作成
            </Button>
          </Group>
        </Group>

        <DefaultMetadataCard
          defaultTeam={defaultTeam}
          defaultRobot={defaultRobot}
          defaultScenario={defaultScenario}
          onChangeTeam={setDefaultTeam}
          onChangeRobot={setDefaultRobot}
          onChangeScenario={setDefaultScenario}
        />

        <Card withBorder p="sm">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                タイムライン
              </Text>
              <Text size="xs" c="dimmed">
                空きの帯をドラッグして Run 区間を作成 / 区間をドラッグで移動 / 端で長さ変更
              </Text>
            </Group>
            <Timeline
              videos={placeable}
              totalSec={totalSec}
              t0Ms={t0Ms}
              bandOf={bandOf}
              regions={regions}
              selectedId={selectedId}
              previewT={previewT}
              pendingStart={pendingStart}
              trackRef={trackRef}
              angleLabels={angleLabels}
              onAngleLabelChange={(id, label) =>
                setAngleLabels((c) => ({ ...c, [id]: label }))
              }
              onTrackPointerDown={startTrackDrag}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onRegionPointerDown={startRegionDrag}
              onSelectRegion={setSelectedId}
            />
          </Stack>
        </Card>

        <Preview
          videos={placeable}
          totalSec={totalSec}
          t0Ms={t0Ms}
          bandOf={bandOf}
          angleLabels={angleLabels}
          previewT={previewT}
          onPreviewTChange={setPreviewT}
          selectedRegion={selectedRegion}
          pendingStart={pendingStart}
          onSetStart={handleSetStart}
          onSetEnd={handleSetEnd}
          onClearPending={() => setPendingStart(null)}
        />

        <RegionsTable
          regions={regions}
          selectedId={selectedId}
          t0Ms={t0Ms}
          onSelect={setSelectedId}
          onUpdate={updateRegion}
          onRemove={removeRegion}
        />

        {unplaceable.length > 0 && (
          <Alert color="yellow" title="配置できない動画">
            <Text size="sm">
              recordedAt が無いので壁時計タイムラインに乗せられません。
              動画詳細から recordedAt を設定してから再度この画面を開いてください。
            </Text>
            <Stack gap={2} mt="xs">
              {unplaceable.map((v) => (
                <Text key={v.id} size="xs" c="dimmed">
                  • {v.displayName?.trim() || v.storageKey.slice(0, 24)}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}
      </Stack>
    </Container>
  );
}
