import { Badge, Card, Group, Stack, Table, Text, Title } from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import type { Match } from "../../../lib/api/client";
import { useMatches } from "../../matches/api/queries";
import { useTeams } from "../../teams/api/queries";
import { useTournaments } from "../../tournaments/api/queries";

export function UpcomingMatchesList() {
  const matches = useMatches();
  const teams = useTeams();
  const tournaments = useTournaments();
  const navigate = useNavigate();

  const teamById = useMemo(() => {
    const m = new Map((teams.data?.data ?? []).map((t) => [t.id, t]));
    return (id: string) => m.get(id);
  }, [teams.data]);
  const tournamentName = useMemo(() => {
    const m = new Map(
      (tournaments.data?.data ?? []).map((t) => [t.id, t.name]),
    );
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [tournaments.data]);

  // Bucket by tournament, sorted by scheduled_at asc (TBD entries last).
  const byTournament = useMemo(() => {
    const buckets = new Map<string, Match[]>();
    for (const m of matches.data?.data ?? []) {
      const arr = buckets.get(m.tournamentId) ?? [];
      arr.push(m);
      buckets.set(m.tournamentId, arr);
    }
    for (const arr of buckets.values()) {
      arr.sort((a, b) => {
        if (!a.scheduledAt && !b.scheduledAt) return 0;
        if (!a.scheduledAt) return 1;
        if (!b.scheduledAt) return -1;
        return (
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
        );
      });
    }
    return [...buckets.entries()];
  }, [matches.data]);

  if (byTournament.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        登録されている試合がありません。 [大会] / [試合] から先に作成してください。
      </Text>
    );
  }

  return (
    <Stack>
      {byTournament.map(([tid, list]) => (
        <Card withBorder key={tid}>
          <Stack>
            <Group justify="space-between">
              <Title order={4}>{tournamentName(tid)}</Title>
              <Badge variant="light">{list.length} 試合</Badge>
            </Group>
            <Table highlightOnHover withRowBorders={false}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>予定時刻</Table.Th>
                  <Table.Th>対戦</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.map((m) => {
                  const a = teamById(m.teamAId);
                  const b = teamById(m.teamBId);
                  return (
                    <Table.Tr
                      key={m.id}
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        navigate({
                          to: "/matches/$matchId",
                          params: { matchId: m.id },
                        })
                      }
                    >
                      <Table.Td>
                        <Text size="sm" ff="monospace">
                          {m.scheduledAt
                            ? new Date(m.scheduledAt).toLocaleString()
                            : "TBD"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Group gap={4} wrap="nowrap">
                            <Text size="sm" fw={a?.isOwn ? 700 : 400}>
                              {a?.name ?? "?"}
                            </Text>
                            {a?.isOwn && (
                              <Badge size="xs" color="grape">
                                自
                              </Badge>
                            )}
                          </Group>
                          <Text c="dimmed">vs</Text>
                          <Group gap={4} wrap="nowrap">
                            <Text size="sm" fw={b?.isOwn ? 700 : 400}>
                              {b?.name ?? "?"}
                            </Text>
                            {b?.isOwn && (
                              <Badge size="xs" color="grape">
                                自
                              </Badge>
                            )}
                          </Group>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed">
                          マッチアップを見る →
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
