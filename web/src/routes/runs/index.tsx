import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Table,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { ResourcePage } from "../../components/layout/ResourcePage";
import type { Run } from "../../lib/api/client";
import { formatDateTimeFull, formatDateTimeShort } from "../../lib/time";
import { useDeleteRun, useRuns } from "../../features/runs/api/queries";
import { useRobots } from "../../features/robots/api/queries";
import { useScenarios } from "../../features/scenarios/api/queries";
import { useSessions } from "../../features/sessions/api/queries";
import { useTeams } from "../../features/teams/api/queries";
import { RunCreateModal } from "../../features/runs/components/RunCreateModal";

export const Route = createFileRoute("/runs/")({
  component: RunsPage,
});

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
              <Table.Td>
                {nameMaps.robotNames.get(r.robotId) ?? r.robotId}
              </Table.Td>
              <Table.Td>
                {nameMaps.scenarioNames.get(r.scenarioId) ?? r.scenarioId}
              </Table.Td>
              <Table.Td>{nameMaps.teamNames.get(r.teamId) ?? r.teamId}</Table.Td>
              <Table.Td>
                <Text size="xs" title={formatDateTimeFull(r.startedAt)}>
                  {formatDateTimeShort(r.startedAt)}
                </Text>
                <Text size="xs" c="dimmed">
                  +{r.durationSec ?? 0}s
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
        onClick={() =>
          navigate({ to: "/runs/$runId", params: { runId: run.id } })
        }
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
