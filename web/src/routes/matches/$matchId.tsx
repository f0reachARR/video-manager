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

import { ScoutingEditor } from "../../features/scouting-notes/components/ScoutingEditor";
import {
  ApiError,
  type Match,
  type Run,
  type TeamMarkerStats,
} from "../../lib/api/client";
import {
  useCreateScoutingNote,
  useDeleteScoutingNote,
  useMatch,
  useRuns,
  useScoutingNotesByMatch,
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

      <ScoutingNotesSection match={m} />
    </Stack>
  );
}

function ScoutingNotesSection({ match }: { match: Match }) {
  const notes = useScoutingNotesByMatch(match.id);
  const create = useCreateScoutingNote(match.id);
  const del = useDeleteScoutingNote(match.id);
  const teamA = useTeam(match.teamAId);
  const teamB = useTeam(match.teamBId);

  const list = notes.data?.data ?? [];

  const teamName = (id: string) =>
    id === match.teamAId
      ? (teamA.data?.name ?? "Team A")
      : id === match.teamBId
      ? (teamB.data?.name ?? "Team B")
      : id.slice(0, 8);

  const noteForTeam = (teamId: string) => list.find((n) => n.targetTeamId === teamId);

  return (
    <Stack gap="sm" mt="lg">
      <Title order={3}>スカウティングノート</Title>
      <Text size="xs" c="dimmed">
        対戦相手チームごとに 1 つ。本文は Hocuspocus 経由でリアルタイム共同編集される。
      </Text>
      <Grid>
        {[match.teamAId, match.teamBId].map((tid) => {
          const note = noteForTeam(tid);
          return (
            <Grid.Col key={tid} span={{ base: 12, md: 6 }}>
              <Stack gap={4}>
                <Group justify="space-between">
                  <Group gap="xs">
                    <Badge>{teamName(tid)}</Badge>
                    {note && (
                      <Text size="xs" c="dimmed">
                        更新: {new Date(note.updatedAt).toLocaleString()}
                      </Text>
                    )}
                  </Group>
                  {note ? (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      loading={del.isPending}
                      onClick={() => {
                        if (confirm("このノートを削除しますか？")) del.mutate(note.id);
                      }}
                    >
                      削除
                    </Button>
                  ) : (
                    <Button
                      size="compact-xs"
                      variant="light"
                      loading={create.isPending}
                      onClick={() => create.mutate({ targetTeamId: tid })}
                    >
                      ノート作成
                    </Button>
                  )}
                </Group>
                {note ? <ScoutingEditor noteId={note.id} /> : <EmptyNotePlaceholder />}
              </Stack>
            </Grid.Col>
          );
        })}
      </Grid>
      {notes.error && (
        <Alert color="red">
          {notes.error instanceof ApiError ? notes.error.body.message : String(notes.error)}
        </Alert>
      )}
    </Stack>
  );
}

function EmptyNotePlaceholder() {
  return (
    <Card withBorder p="md">
      <Text c="dimmed" ta="center" size="sm">
        まだノートがありません
      </Text>
    </Card>
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
