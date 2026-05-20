import {
  ActionIcon,
  Alert,
  Anchor,
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
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Video } from "../../../../lib/api/client";
import { formatDateTimeFull } from "../../../../lib/time";
import { useRobots } from "../../../robots/api/queries";
import { useScenarios } from "../../../scenarios/api/queries";
import { useSessions } from "../../../sessions/api/queries";
import { useTeams } from "../../../teams/api/queries";
import { useVideos } from "../../../videos/api/queries";
import { useCreateRun } from "../../api/queries";
import { formatTime } from "../../lib/format";
import { Preview } from "./Preview";
import { Timeline } from "./Timeline";
import { newRegionId, type Region } from "./types";

export function NewFromVideosPage({
  sessionId,
  requestedIds,
}: {
  sessionId: string;
  requestedIds: string[];
}) {
  const navigate = useNavigate();

  const sessions = useSessions();
  const teams = useTeams();
  const robots = useRobots();
  const scenarios = useScenarios();
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
  type DragKind = "create" | "move" | "resize-start" | "resize-end";
  const dragRef = useRef<{
    kind: DragKind;
    regionId: string;
    startSec: number;
    initStart: number;
    initEnd: number;
  } | null>(null);

  const xToSec = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - 120; // LABEL_GUTTER
    const w = Math.max(1, rect.width - 120);
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
                onChange={(v) => {
                  setDefaultTeam(v);
                  setDefaultRobot(null);
                }}
                searchable
                clearable
              />
              <Select
                label="Robot"
                data={(robots.data?.data ?? [])
                  .filter((r) => !defaultTeam || r.teamId === defaultTeam)
                  .map((r) => ({
                    value: r.id,
                    label: r.name,
                  }))}
                value={defaultRobot}
                onChange={setDefaultRobot}
                searchable
                clearable
                disabled={!defaultTeam}
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
                                updateRegion(r.id, {
                                  teamId: v,
                                  robotId: null,
                                })
                              }
                              searchable
                            />
                          </Table.Td>
                          <Table.Td>
                            <Select
                              size="xs"
                              data={(robots.data?.data ?? [])
                                .filter(
                                  (rb) =>
                                    !r.teamId || rb.teamId === r.teamId,
                                )
                                .map((rb) => ({
                                  value: rb.id,
                                  label: rb.name,
                                }))}
                              value={r.robotId}
                              onChange={(v) =>
                                updateRegion(r.id, { robotId: v })
                              }
                              searchable
                              disabled={!r.teamId}
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
