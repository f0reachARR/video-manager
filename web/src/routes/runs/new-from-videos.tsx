import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Card,
  Container,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PlaybackUrl, Video } from "../../lib/api/client";
import { videosApi } from "../../lib/api/client";
import { useHlsSource } from "../../components/player/useHlsSource";
import { useCreateRun } from "../../features/runs/api/queries";
import { useRobots } from "../../features/robots/api/queries";
import { useScenarios } from "../../features/scenarios/api/queries";
import { useSessions } from "../../features/sessions/api/queries";
import { useTeams } from "../../features/teams/api/queries";
import { useVideos } from "../../features/videos/api/queries";
import { formatTime } from "../../features/runs/lib/format";
import { formatDateTimeFull } from "../../lib/time";

type Search = {
  sessionId?: string;
  videoIds?: string;
};

export const Route = createFileRoute("/runs/new-from-videos")({
  component: NewFromVideosPage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    sessionId: typeof s.sessionId === "string" ? s.sessionId : undefined,
    videoIds: typeof s.videoIds === "string" ? s.videoIds : undefined,
  }),
});

// Region = one Run-to-be. startSec/endSec are relative to t0 (the earliest
// recordedAt of the selected videos), which is the wall-clock anchor of the
// timeline. Per-region metadata defaults to whatever the user set in the
// "デフォルト" panel; the row can override anything.
type Region = {
  id: string;
  startSec: number;
  endSec: number;
  teamId: string | null;
  robotId: string | null;
  scenarioId: string | null;
  memo: string;
  score: number | "";
};

const LABEL_GUTTER = 120;
const HEADER_HEIGHT = 22;
const LANE_HEIGHT = 32;

let regionCounter = 0;
const newRegionId = () => `r${++regionCounter}-${Date.now()}`;

function NewFromVideosPage() {
  const { sessionId, videoIds } = Route.useSearch();
  const navigate = useNavigate();

  const sessions = useSessions();
  const teams = useTeams();
  const robots = useRobots();
  const scenarios = useScenarios();
  const create = useCreateRun();
  // Fetch all videos in the Session — we then filter by the IDs in search
  // params. This avoids N round-trips and reuses the same list endpoint the
  // Videos page already populated.
  const videosQuery = useVideos(sessionId ? { sessionId } : {});

  const requestedIds = useMemo(
    () => (videoIds ? videoIds.split(",").filter(Boolean) : []),
    [videoIds],
  );
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
  // [0, totalSec]; the preview now spans the full timeline regardless of
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
  // Jump playhead to region start when the user picks one from the list /
  // timeline — makes it easy to fine-tune by playing back.
  useEffect(() => {
    if (!selectedRegion) return;
    setPreviewT(selectedRegion.startSec);
  }, [selectedRegion?.id]);

  const trackRef = useRef<HTMLDivElement>(null);
  type DragKind = "create" | "move" | "resize-start" | "resize-end";
  const dragRef = useRef<{
    kind: DragKind;
    regionId: string;
    startSec: number;
    initStart: number;
    initEnd: number;
  } | null>(null);

  const xToSec = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - LABEL_GUTTER;
    const w = Math.max(1, rect.width - LABEL_GUTTER);
    return (px / w) * totalSec;
  };

  const startTrackDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (placeable.length === 0) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sec = Math.max(0, Math.min(totalSec, xToSec(e.clientX, rect)));
    const id = newRegionId();
    setRegions((rs) => [
      ...rs,
      {
        id,
        startSec: sec,
        endSec: sec,
        teamId: defaultTeam,
        robotId: defaultRobot,
        scenarioId: defaultScenario,
        memo: "",
        score: "",
      },
    ]);
    setSelectedId(id);
    dragRef.current = {
      kind: "create",
      regionId: id,
      startSec: sec,
      initStart: sec,
      initEnd: sec,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const startRegionDrag =
    (region: Region, kind: "move" | "resize-start" | "resize-end") =>
    (e: React.PointerEvent) => {
      e.stopPropagation();
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSelectedId(region.id);
      dragRef.current = {
        kind,
        regionId: region.id,
        startSec: xToSec(e.clientX, rect),
        initStart: region.startSec,
        initEnd: region.endSec,
      };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cur = Math.max(0, Math.min(totalSec, xToSec(e.clientX, rect)));
    setRegions((rs) =>
      rs.map((r) => {
        if (r.id !== drag.regionId) return r;
        let s = drag.initStart;
        let eEnd = drag.initEnd;
        if (drag.kind === "create") {
          s = Math.min(drag.startSec, cur);
          eEnd = Math.max(drag.startSec, cur);
        } else if (drag.kind === "move") {
          const dx = cur - drag.startSec;
          const len = drag.initEnd - drag.initStart;
          s = Math.max(0, Math.min(totalSec - len, drag.initStart + dx));
          eEnd = s + len;
        } else if (drag.kind === "resize-start") {
          s = Math.max(0, Math.min(drag.initEnd - 0.1, cur));
          eEnd = drag.initEnd;
        } else if (drag.kind === "resize-end") {
          s = drag.initStart;
          eEnd = Math.max(drag.initStart + 0.1, Math.min(totalSec, cur));
        }
        return { ...r, startSec: s, endSec: eEnd };
      }),
    );
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === "create") {
      // Tossing off a click without any movement creates a zero-length
      // region; drop those so the table doesn't fill with phantom rows.
      setRegions((rs) =>
        rs.filter(
          (r) => r.id !== drag.regionId || r.endSec - r.startSec >= 0.5,
        ),
      );
    }
  };

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

        <Card withBorder p="sm">
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              デフォルトのメタデータ
            </Text>
            <Text size="xs" c="dimmed">
              ここで設定した値が新しい区間に流し込まれます。区間ごとに下の表で上書き可。
            </Text>
            <Group grow>
              <Select
                label="Team"
                data={(teams.data?.data ?? []).map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
                value={defaultTeam}
                onChange={setDefaultTeam}
                searchable
                clearable
              />
              <Select
                label="Robot"
                data={(robots.data?.data ?? []).map((r) => ({
                  value: r.id,
                  label: r.name,
                }))}
                value={defaultRobot}
                onChange={setDefaultRobot}
                searchable
                clearable
              />
              <Select
                label="Scenario"
                data={(scenarios.data?.data ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                value={defaultScenario}
                onChange={setDefaultScenario}
                searchable
                clearable
              />
            </Group>
          </Stack>
        </Card>

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

        <Card withBorder p="sm">
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Run リスト ({regions.length})
            </Text>
            {regions.length === 0 ? (
              <Text size="sm" c="dimmed">
                まだ区間がありません。上のタイムラインをドラッグして追加してください。
              </Text>
            ) : (
              <Table withRowBorders={false} highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 30 }}>#</Table.Th>
                    <Table.Th>開始時刻</Table.Th>
                    <Table.Th style={{ width: 90 }}>長さ</Table.Th>
                    <Table.Th>Team</Table.Th>
                    <Table.Th>Robot</Table.Th>
                    <Table.Th>Scenario</Table.Th>
                    <Table.Th style={{ width: 90 }}>Score</Table.Th>
                    <Table.Th>Memo</Table.Th>
                    <Table.Th style={{ width: 40 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {regions
                    .map((r, i) => ({ r, i }))
                    .sort((a, b) => a.r.startSec - b.r.startSec)
                    .map(({ r, i }) => {
                      const dur = Math.max(0, r.endSec - r.startSec);
                      const startAbs = new Date(t0Ms + r.startSec * 1000);
                      const isSel = r.id === selectedId;
                      return (
                        <Table.Tr
                          key={r.id}
                          bg={
                            isSel
                              ? "var(--mantine-color-blue-light)"
                              : undefined
                          }
                          onClick={() => setSelectedId(r.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <Table.Td>{i + 1}</Table.Td>
                          <Table.Td>
                            <Text size="xs">{formatDateTimeFull(startAbs)}</Text>
                            <Text size="xs" c="dimmed">
                              t+{formatTime(r.startSec)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" ff="monospace">
                              {formatTime(dur)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Select
                              size="xs"
                              data={(teams.data?.data ?? []).map((t) => ({
                                value: t.id,
                                label: t.name,
                              }))}
                              value={r.teamId}
                              onChange={(v) =>
                                updateRegion(r.id, { teamId: v })
                              }
                              searchable
                            />
                          </Table.Td>
                          <Table.Td>
                            <Select
                              size="xs"
                              data={(robots.data?.data ?? []).map((rb) => ({
                                value: rb.id,
                                label: rb.name,
                              }))}
                              value={r.robotId}
                              onChange={(v) =>
                                updateRegion(r.id, { robotId: v })
                              }
                              searchable
                            />
                          </Table.Td>
                          <Table.Td>
                            <Select
                              size="xs"
                              data={(scenarios.data?.data ?? []).map((s) => ({
                                value: s.id,
                                label: s.name,
                              }))}
                              value={r.scenarioId}
                              onChange={(v) =>
                                updateRegion(r.id, { scenarioId: v })
                              }
                              searchable
                            />
                          </Table.Td>
                          <Table.Td>
                            <NumberInput
                              size="xs"
                              value={r.score}
                              onChange={(v) =>
                                updateRegion(r.id, {
                                  score: typeof v === "number" ? v : "",
                                })
                              }
                              allowDecimal
                            />
                          </Table.Td>
                          <Table.Td>
                            <TextInput
                              size="xs"
                              value={r.memo}
                              onChange={(e) =>
                                updateRegion(r.id, {
                                  memo: e.currentTarget.value,
                                })
                              }
                            />
                          </Table.Td>
                          <Table.Td>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color="red"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeRegion(r.id);
                              }}
                              aria-label="削除"
                            >
                              ✕
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Card>

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

function Timeline({
  videos,
  totalSec,
  t0Ms,
  bandOf,
  regions,
  selectedId,
  previewT,
  pendingStart,
  trackRef,
  angleLabels,
  onAngleLabelChange,
  onTrackPointerDown,
  onPointerMove,
  onPointerUp,
  onRegionPointerDown,
  onSelectRegion,
}: {
  videos: Video[];
  totalSec: number;
  t0Ms: number;
  bandOf: (v: Video) => { startSec: number; endSec: number };
  regions: Region[];
  selectedId: string | null;
  previewT: number;
  pendingStart: number | null;
  trackRef: React.RefObject<HTMLDivElement | null>;
  angleLabels: Record<string, string>;
  onAngleLabelChange: (videoId: string, label: string) => void;
  onTrackPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onRegionPointerDown: (
    region: Region,
    kind: "move" | "resize-start" | "resize-end",
  ) => (e: React.PointerEvent) => void;
  onSelectRegion: (id: string) => void;
}) {
  if (videos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        配置可能な動画がありません。
      </Text>
    );
  }

  const lanesHeight = videos.length * LANE_HEIGHT;

  return (
    <Box
      ref={trackRef}
      onPointerDown={onTrackPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "relative",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {/* Scale header */}
      <Box
        style={{
          position: "relative",
          height: HEADER_HEIGHT,
          paddingLeft: LABEL_GUTTER,
          borderBottom: "1px solid var(--mantine-color-default-border)",
        }}
      >
        <Text
          size="xs"
          c="dimmed"
          style={{ position: "absolute", left: LABEL_GUTTER, top: 2 }}
        >
          {formatDateTimeFull(new Date(t0Ms))}
        </Text>
        <Text
          size="xs"
          c="dimmed"
          style={{ position: "absolute", right: 4, top: 2 }}
        >
          +{formatTime(totalSec)}
        </Text>
      </Box>

      {/* Preview playhead — vertical line at the current preview time.
          Now always visible since the preview is always-on. */}
      <Box
        style={{
          position: "absolute",
          left: `calc(${LABEL_GUTTER}px + (100% - ${LABEL_GUTTER}px) * ${Math.min(1, Math.max(0, previewT / totalSec))})`,
          top: HEADER_HEIGHT,
          height: videos.length * LANE_HEIGHT,
          width: 2,
          transform: "translateX(-1px)",
          background: "var(--mantine-color-red-6)",
          opacity: 0.85,
          pointerEvents: "none",
          zIndex: 3,
        }}
      />
      {/* Pending-start marker — green dashed line at the remembered
          "ここからスタート" position, until "ここまで" commits it. */}
      {pendingStart != null && (
        <Box
          style={{
            position: "absolute",
            left: `calc(${LABEL_GUTTER}px + (100% - ${LABEL_GUTTER}px) * ${Math.min(1, Math.max(0, pendingStart / totalSec))})`,
            top: HEADER_HEIGHT,
            height: videos.length * LANE_HEIGHT,
            width: 0,
            borderLeft: "2px dashed var(--mantine-color-green-6)",
            transform: "translateX(-1px)",
            pointerEvents: "none",
            zIndex: 3,
          }}
        />
      )}

      {/* Region overlays — drawn over the lanes, semi-transparent so videos
          stay visible underneath. zIndex:2 puts them above the lane Boxes
          (which come later in the DOM and would otherwise eat pointerdown
          events meant for region bodies / resize handles). */}
      <Box
        style={{
          position: "absolute",
          left: LABEL_GUTTER,
          right: 0,
          top: HEADER_HEIGHT,
          height: lanesHeight,
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        {regions.map((r, idx) => {
          const leftPct = (r.startSec / totalSec) * 100;
          const widthPct = ((r.endSec - r.startSec) / totalSec) * 100;
          const isSel = r.id === selectedId;
          return (
            <Box
              key={r.id}
              style={{
                position: "absolute",
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                top: 0,
                bottom: 0,
                background: isSel
                  ? "rgba(34,139,230,0.25)"
                  : "rgba(34,139,230,0.12)",
                border: `2px solid ${isSel ? "var(--mantine-color-blue-6)" : "var(--mantine-color-blue-4)"}`,
                borderRadius: 4,
                pointerEvents: "auto",
                cursor: "grab",
                overflow: "visible",
              }}
              onPointerDown={onRegionPointerDown(r, "move")}
              onClick={(e) => {
                e.stopPropagation();
                onSelectRegion(r.id);
              }}
            >
              <Text
                size="xs"
                fw={600}
                style={{
                  position: "absolute",
                  top: 2,
                  left: 4,
                  color: "var(--mantine-color-blue-9)",
                  pointerEvents: "none",
                }}
              >
                Run {idx + 1} ({formatTime(r.endSec - r.startSec)})
              </Text>
              {/* Edge handles */}
              <Box
                onPointerDown={onRegionPointerDown(r, "resize-start")}
                style={{
                  position: "absolute",
                  left: -4,
                  top: 0,
                  bottom: 0,
                  width: 8,
                  cursor: "ew-resize",
                }}
              />
              <Box
                onPointerDown={onRegionPointerDown(r, "resize-end")}
                style={{
                  position: "absolute",
                  right: -4,
                  top: 0,
                  bottom: 0,
                  width: 8,
                  cursor: "ew-resize",
                }}
              />
            </Box>
          );
        })}
      </Box>

      {/* Video lanes */}
      <Stack gap={0} mt={0}>
        {videos.map((v, idx) => {
          const b = bandOf(v);
          const leftPct = (b.startSec / totalSec) * 100;
          const widthPct = ((b.endSec - b.startSec) / totalSec) * 100;
          const color = `hsl(${(idx * 67) % 360} 50% 50%)`;
          return (
            <Box
              key={v.id}
              style={{
                position: "relative",
                height: LANE_HEIGHT,
                paddingLeft: LABEL_GUTTER,
              }}
            >
              <Box
                style={{
                  position: "absolute",
                  left: 0,
                  top: 4,
                  width: LABEL_GUTTER - 8,
                  height: LANE_HEIGHT - 8,
                  paddingRight: 4,
                }}
              >
                <TextInput
                  size="xs"
                  placeholder={
                    v.displayName?.trim() || v.storageKey.slice(0, 12)
                  }
                  value={angleLabels[v.id] ?? ""}
                  onChange={(e) =>
                    onAngleLabelChange(v.id, e.currentTarget.value)
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  title={v.displayName?.trim() || v.storageKey}
                />
              </Box>
              <Box
                style={{
                  position: "absolute",
                  left: LABEL_GUTTER,
                  right: 0,
                  top: 6,
                  bottom: 6,
                  background: "var(--mantine-color-default-hover)",
                  borderRadius: 4,
                }}
              >
                <Box
                  style={{
                    position: "absolute",
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    top: 2,
                    bottom: 2,
                    background: color,
                    borderRadius: 3,
                    opacity: 0.85,
                    pointerEvents: "none",
                  }}
                />
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

// Always-on multi-angle preview spanning the full timeline. Each video is
// steered to its local time (videoOffsetStart + (t - videoStartAbs));
// videos whose band doesn't cover the current t show "NO VIDEO" instead.
//
// The two big actions are "ここからスタート" / "ここまで": they either
// edit the currently-selected region (if any) or fall back to a pending-
// start workflow that commits a fresh region to the list on the second
// button press.
function Preview({
  videos,
  totalSec,
  t0Ms,
  bandOf,
  angleLabels,
  previewT,
  onPreviewTChange,
  selectedRegion,
  pendingStart,
  onSetStart,
  onSetEnd,
  onClearPending,
}: {
  videos: Video[];
  totalSec: number;
  t0Ms: number;
  bandOf: (v: Video) => { startSec: number; endSec: number };
  angleLabels: Record<string, string>;
  previewT: number;
  onPreviewTChange: (t: number) => void;
  selectedRegion: Region | null;
  pendingStart: number | null;
  onSetStart: () => void;
  onSetEnd: () => void;
  onClearPending: () => void;
}) {
  // Lazily fetch playback URLs for every placeable video — the preview
  // now spans the full timeline so any of them might come into view.
  const [urls, setUrls] = useState<Map<string, PlaybackUrl>>(new Map());
  useEffect(() => {
    let canceled = false;
    videos.forEach(async (v) => {
      if (urls.has(v.id)) return;
      try {
        const r = await videosApi.playbackUrl(v.id);
        if (!canceled) setUrls((m) => new Map(m).set(v.id, r));
      } catch {
        // Best-effort; the lane just won't load.
      }
    });
    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [playing, setPlaying] = useState(false);

  // Wall-clock anchored play loop. Decoupled from any single video's
  // currentTime so gaps where one camera isn't recording don't freeze the
  // whole timeline.
  useEffect(() => {
    if (!playing) return;
    const wallStart = performance.now();
    const tStart = previewT;
    let raf = 0;
    const tick = () => {
      const elapsed = (performance.now() - wallStart) / 1000;
      const next = tStart + elapsed;
      if (next >= totalSec) {
        onPreviewTChange(totalSec);
        setPlaying(false);
        return;
      }
      onPreviewTChange(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, totalSec]);

  // Steer each video element whenever t changes.
  useEffect(() => {
    for (const v of videos) {
      const el = videoRefs.current.get(v.id);
      if (!el) continue;
      const b = bandOf(v);
      const inRange = previewT >= b.startSec && previewT <= b.endSec;
      if (!inRange) {
        if (!el.paused) el.pause();
        continue;
      }
      const localT = previewT - b.startSec;
      const drift = Math.abs(el.currentTime - localT);
      const tolerance = playing ? 0.3 : 0.05;
      if (drift > tolerance) {
        try {
          el.currentTime = localT;
        } catch {
          // Some sources reject seeks before metadata; ignore.
        }
      }
      if (playing && el.paused) el.play().catch(() => {});
      if (!playing && !el.paused) el.pause();
    }
  }, [previewT, playing, videos, bandOf]);

  const handleScrubber = useCallback(
    (value: number) => {
      setPlaying(false);
      onPreviewTChange(value);
    },
    [onPreviewTChange],
  );

  // Keyboard shortcuts: space=play/pause, [=set start, ]=set end. Mounted
  // on the document so they work regardless of focus, but skipped while
  // typing in a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable)
        return;
      if (e.key === "[") {
        e.preventDefault();
        onSetStart();
      } else if (e.key === "]") {
        e.preventDefault();
        onSetEnd();
      } else if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onSetStart, onSetEnd]);

  const buttonLabel = selectedRegion
    ? { start: "[ 選択 Run の開始をここに", end: "] 選択 Run の終了をここに" }
    : pendingStart != null
      ? { start: "[ 開始を上書き", end: "] ここまで (Run を追加)" }
      : { start: "[ ここからスタート", end: "] ここまで" };
  const canSetEnd =
    selectedRegion != null || (pendingStart != null && previewT > pendingStart);

  return (
    <Card withBorder p="sm">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            プレビュー
          </Text>
          <Text size="xs" c="dimmed" ff="monospace">
            {formatDateTimeFull(new Date(t0Ms + previewT * 1000))} (t+
            {formatTime(previewT)} / {formatTime(totalSec)})
          </Text>
        </Group>
        {videos.length === 0 ? (
          <Text size="sm" c="dimmed">
            配置可能な動画がありません。
          </Text>
        ) : (
          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 8,
            }}
          >
            {videos.map((v) => {
              const b = bandOf(v);
              const inRange = previewT >= b.startSec && previewT <= b.endSec;
              const url = urls.get(v.id);
              const label =
                angleLabels[v.id]?.trim() ||
                v.displayName?.trim() ||
                v.storageKey.slice(0, 16);
              return (
                <Box
                  key={v.id}
                  style={{
                    position: "relative",
                    aspectRatio: "16 / 9",
                    background: "black",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  {url ? (
                    <PreviewVideoEl
                      source={url}
                      registerRef={(el) => {
                        if (el) videoRefs.current.set(v.id, el);
                        else videoRefs.current.delete(v.id);
                      }}
                    />
                  ) : (
                    <Box
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "rgba(255,255,255,0.5)",
                        fontSize: 12,
                      }}
                    >
                      loading…
                    </Box>
                  )}
                  {!inRange && (
                    <Box
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(0,0,0,0.75)",
                        color: "white",
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: 1,
                      }}
                    >
                      NO VIDEO
                    </Box>
                  )}
                  <Text
                    size="xs"
                    style={{
                      position: "absolute",
                      bottom: 4,
                      left: 6,
                      color: "white",
                      textShadow: "0 0 4px rgba(0,0,0,0.8)",
                      pointerEvents: "none",
                    }}
                  >
                    {label}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}
        <Group gap="xs" align="center">
          <Button
            size="xs"
            variant={playing ? "filled" : "default"}
            onClick={() => {
              if (previewT >= totalSec - 0.05) onPreviewTChange(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? "■ 停止" : "▶ 再生"}
          </Button>
          <input
            type="range"
            min={0}
            max={totalSec}
            step={0.05}
            value={previewT}
            onChange={(e) => handleScrubber(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </Group>
        <Group gap="xs">
          <Button size="xs" variant="light" color="green" onClick={onSetStart}>
            {buttonLabel.start}
          </Button>
          <Button
            size="xs"
            variant="light"
            color="blue"
            onClick={onSetEnd}
            disabled={!canSetEnd}
          >
            {buttonLabel.end}
          </Button>
          {pendingStart != null && !selectedRegion && (
            <>
              <Text size="xs" c="dimmed">
                開始: t+{formatTime(pendingStart)}
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={onClearPending}>
                × キャンセル
              </Button>
            </>
          )}
          <Text size="xs" c="dimmed" ml="auto">
            ショートカット: [ 開始 / ] 終了 / Space 再生
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}

function PreviewVideoEl({
  source,
  registerRef,
}: {
  source: PlaybackUrl;
  registerRef: (el: HTMLVideoElement | null) => void;
}) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  useHlsSource(el, source);
  return (
    <video
      ref={(node) => {
        setEl(node);
        registerRef(node);
      }}
      muted
      playsInline
      preload="metadata"
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
      }}
    />
  );
}
