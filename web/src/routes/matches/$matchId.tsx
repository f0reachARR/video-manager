import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Grid,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  ApiError,
  type Run,
  type TeamMarkerStats,
} from "../../lib/api/client";
import {
  useMatch,
  useRuns,
  useTeam,
  useTeamMarkerStats,
  useTournament,
} from "../../lib/queries";

export const Route = createFileRoute("/matches/$matchId")({
  component: MatchDetailPage,
});

function MatchDetailPage() {
  const { matchId } = Route.useParams();
  const navigate = useNavigate();
  const match = useMatch(matchId);

  if (match.isLoading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }
  if (match.error || !match.data) {
    return (
      <Alert color="red" m="md">
        {match.error instanceof ApiError ? match.error.body.message : (match.error as Error)?.message}
      </Alert>
    );
  }
  const m = match.data;

  return (
    <Stack maw={1280} mx="auto">
      <Group justify="space-between">
        <Stack gap={4}>
          <Group gap="sm">
            <Button size="xs" variant="subtle" onClick={() => navigate({ to: "/matches" })}>
              ← 試合一覧
            </Button>
            <Title order={2}>マッチアップ</Title>
          </Group>
          <Text size="xs" c="dimmed" ff="monospace">
            {m.id}
          </Text>
        </Stack>
      </Group>

      <MatchHeader match={m} />

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TeamPanel teamId={m.teamAId} role="A" />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TeamPanel teamId={m.teamBId} role="B" />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function MatchHeader({ match }: { match: { tournamentId: string; scheduledAt?: string | null } }) {
  const tournament = useTournament(match.tournamentId);
  return (
    <Card withBorder>
      <Group justify="space-between">
        <Stack gap={4}>
          <Text size="sm" c="dimmed">Tournament</Text>
          <Text fw={600}>{tournament.data?.name ?? "…"}</Text>
        </Stack>
        <Stack gap={4} align="flex-end">
          <Text size="sm" c="dimmed">予定時刻</Text>
          <Text>{match.scheduledAt ? new Date(match.scheduledAt).toLocaleString() : "未定"}</Text>
        </Stack>
      </Group>
    </Card>
  );
}

function TeamPanel({ teamId, role }: { teamId: string; role: "A" | "B" }) {
  const team = useTeam(teamId);
  const stats = useTeamMarkerStats(teamId);
  const runs = useRuns({ teamId, limit: 5 });

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="sm">
            <Badge variant="filled" color={role === "A" ? "blue" : "red"} size="lg">
              Team {role}
            </Badge>
            <Title order={4}>{team.data?.name ?? "…"}</Title>
            {team.data?.isOwn && <Badge color="grape">自チーム</Badge>}
          </Group>
        </Group>

        <MarkerStatsRow stats={stats.data} />

        <Stack gap={4}>
          <Text size="sm" fw={500}>直近の Run</Text>
          <RecentRuns runs={runs.data?.data ?? []} loading={runs.isLoading} />
        </Stack>
      </Stack>
    </Card>
  );
}

function MarkerStatsRow({ stats }: { stats?: TeamMarkerStats }) {
  const s = stats ?? { success: 0, failure: 0, note: 0, teamId: "" };
  const total = s.success + s.failure + s.note;
  const successRate = s.success + s.failure > 0 ? Math.round((s.success / (s.success + s.failure)) * 100) : null;
  return (
    <Group>
      <Stat label="成功" value={s.success} color="teal" />
      <Stat label="失敗" value={s.failure} color="red" />
      <Stat label="メモ" value={s.note} color="blue" />
      <Stat label="合計" value={total} />
      {successRate != null && <Stat label="成功率" value={`${successRate}%`} />}
    </Group>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <Stack gap={0} align="center" mih={50} miw={64}>
      <Text fw={700} size="lg" c={color}>
        {value}
      </Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Stack>
  );
}

function RecentRuns({
  runs,
  loading,
}: {
  runs: Run[];
  loading: boolean;
}) {
  const navigate = useNavigate();
  if (loading) {
    return <Loader size="sm" />;
  }
  if (runs.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        Run の記録がありません
      </Text>
    );
  }
  return (
    <Table>
      <Table.Tbody>
        {runs.map((r) => (
          <Table.Tr
            key={r.id}
            style={{ cursor: "pointer" }}
            onClick={() => navigate({ to: "/runs/$runId", params: { runId: r.id } })}
          >
            <Table.Td>
              <Text size="xs" ff="monospace">
                {new Date(r.startedAt).toLocaleString()}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm">{r.score ?? "—"}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="xs" lineClamp={1} maw={200}>
                {r.memo || (
                  <Text component="span" c="dimmed" size="xs">
                    (空)
                  </Text>
                )}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
