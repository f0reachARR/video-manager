import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import type { Video } from "../../../lib/api/client";
import { useCreateRun } from "../../runs/api/queries";
import { useRobots } from "../../robots/api/queries";
import { useScenarios } from "../../scenarios/api/queries";
import { useSessions } from "../../sessions/api/queries";
import { useTeams } from "../../teams/api/queries";

export function CreateRunFromVideosModal({
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
