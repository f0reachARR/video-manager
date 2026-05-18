import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ResourcePage } from "../../components/ResourcePage";
import type { Run } from "../../lib/api/client";
import {
  useCreateRun,
  useDeleteRun,
  useRobots,
  useRuns,
  useScenarios,
  useSessions,
  useTeams,
} from "../../lib/queries";

export const Route = createFileRoute("/runs/")({
  component: RunsPage,
});

function DateTimeWithQuickAdjust({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | null;
  onChange: (v: Date | null) => void;
}) {
  const adjust = (deltaSec: number) => {
    const base = value ?? new Date();
    onChange(new Date(base.getTime() + deltaSec * 1000));
  };
  return (
    <Stack gap={4}>
      <DateTimePicker
        label={label}
        value={value}
        onChange={(v) => onChange(v ? new Date(v) : null)}
        required
        withSeconds
      />
      <Group gap={4}>
        <Button size="compact-xs" variant="default" onClick={() => onChange(new Date())}>
          現在
        </Button>
        <Button size="compact-xs" variant="default" onClick={() => adjust(-60)}>
          -1m
        </Button>
        <Button size="compact-xs" variant="default" onClick={() => adjust(60)}>
          +1m
        </Button>
        <Button size="compact-xs" variant="default" onClick={() => adjust(-10)}>
          -10s
        </Button>
        <Button size="compact-xs" variant="default" onClick={() => adjust(10)}>
          +10s
        </Button>
      </Group>
    </Stack>
  );
}

function RunsPage() {
  const runs = useRuns();
  const sessions = useSessions();
  const scenarios = useScenarios();
  const robots = useRobots();
  const teams = useTeams();
  const [opened, { open, close }] = useDisclosure(false);

  const list = runs.data?.data ?? [];

  const nameMaps = useMemo(() => {
    const sessionNames = new Map<string, string>();
    for (const s of sessions.data?.data ?? []) sessionNames.set(s.id, s.name);
    const scenarioNames = new Map<string, string>();
    for (const s of scenarios.data?.data ?? []) scenarioNames.set(s.id, s.name);
    const robotNames = new Map<string, string>();
    for (const r of robots.data?.data ?? []) robotNames.set(r.id, r.name);
    const teamNames = new Map<string, string>();
    for (const t of teams.data?.data ?? []) teamNames.set(t.id, t.name);
    return { sessionNames, scenarioNames, robotNames, teamNames };
  }, [sessions.data, scenarios.data, robots.data, teams.data]);

  return (
    <ResourcePage
      title="Run"
      description="練習の1本。動画を紐づけて Marker と同期再生する単位。"
      isLoading={runs.isLoading}
      error={runs.error}
      onRetry={() => runs.refetch()}
      actions={<Button onClick={open}>＋ Run を作成</Button>}
    >
      <Table striped highlightOnHover withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Session</Table.Th>
            <Table.Th>Robot</Table.Th>
            <Table.Th>Scenario</Table.Th>
            <Table.Th>Team</Table.Th>
            <Table.Th>区間</Table.Th>
            <Table.Th>Score</Table.Th>
            <Table.Th style={{ width: 160 }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>
                <Badge size="sm" variant="light">
                  {nameMaps.sessionNames.get(r.sessionId) ?? r.sessionId}
                </Badge>
              </Table.Td>
              <Table.Td>{nameMaps.robotNames.get(r.robotId) ?? r.robotId}</Table.Td>
              <Table.Td>{nameMaps.scenarioNames.get(r.scenarioId) ?? r.scenarioId}</Table.Td>
              <Table.Td>{nameMaps.teamNames.get(r.teamId) ?? r.teamId}</Table.Td>
              <Table.Td>
                <Text size="xs">
                  {new Date(r.startedAt).toLocaleString()}
                </Text>
                <Text size="xs" c="dimmed">
                  〜 {new Date(r.endedAt).toLocaleString()}
                </Text>
              </Table.Td>
              <Table.Td>{r.score != null ? r.score : "—"}</Table.Td>
              <Table.Td>
                <RunActions run={r} />
              </Table.Td>
            </Table.Tr>
          ))}
          {list.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={7}>
                <Text c="dimmed" ta="center" py="md">
                  まだ Run がありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <RunCreateModal opened={opened} onClose={close} />
    </ResourcePage>
  );
}

function RunActions({ run }: { run: Run }) {
  const del = useDeleteRun();
  const navigate = useNavigate();
  return (
    <Group gap={4}>
      <Button
        size="xs"
        variant="light"
        onClick={() => navigate({ to: "/runs/$runId", params: { runId: run.id } })}
      >
        詳細
      </Button>
      <ActionIcon
        variant="subtle"
        color="red"
        loading={del.isPending}
        onClick={() => {
          if (confirm("Run を削除しますか？")) del.mutate(run.id);
        }}
        aria-label="削除"
      >
        🗑️
      </ActionIcon>
    </Group>
  );
}

function RunCreateModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const sessions = useSessions();
  const scenarios = useScenarios();
  const robots = useRobots();
  const teams = useTeams();
  const create = useCreateRun();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [robotId, setRobotId] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);
  const [score, setScore] = useState<number | "">("");
  const [memo, setMemo] = useState("");

  const submit = () => {
    if (!sessionId || !teamId || !robotId || !scenarioId || !startedAt || !endedAt) {
      return;
    }
    create.mutate(
      {
        sessionId,
        teamId,
        robotId,
        scenarioId,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        score: score === "" ? null : score,
        memo,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Run を作成" size="lg">
      <Stack>
        <Select
          label="Session"
          data={(sessions.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          value={sessionId}
          onChange={setSessionId}
          searchable
          required
        />
        <Group grow>
          <Select
            label="Team"
            data={(teams.data?.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
            value={teamId}
            onChange={setTeamId}
            required
          />
          <Select
            label="Robot"
            data={(robots.data?.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
            value={robotId}
            onChange={setRobotId}
            required
          />
        </Group>
        <Select
          label="Scenario"
          data={(scenarios.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          value={scenarioId}
          onChange={setScenarioId}
          required
        />
        <Group grow align="flex-start">
          <DateTimeWithQuickAdjust
            label="開始"
            value={startedAt}
            onChange={setStartedAt}
          />
          <DateTimeWithQuickAdjust
            label="終了"
            value={endedAt}
            onChange={setEndedAt}
          />
        </Group>
        <NumberInput
          label="Score"
          value={score}
          onChange={(v) => setScore(typeof v === "number" ? v : "")}
          allowDecimal
        />
        <Textarea
          label="Memo"
          value={memo}
          onChange={(e) => setMemo(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending}
            disabled={!sessionId || !teamId || !robotId || !scenarioId || !startedAt || !endedAt}
          >
            作成
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
