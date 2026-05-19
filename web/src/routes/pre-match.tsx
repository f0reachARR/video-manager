import {
  Badge,
  Card,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import type { Match } from "../lib/api/client";
import { useMatches, useTeams, useTournaments } from "../lib/queries";

export const Route = createFileRoute("/pre-match")({
  component: PreMatchPage,
});

function PreMatchPage() {
  const matches = useMatches();
  const teams = useTeams();
  const tournaments = useTournaments();
  const navigate = useNavigate();

  const teamName = useMemo(() => {
    const m = new Map((teams.data?.data ?? []).map((t) => [t.id, t]));
    return (id: string) => m.get(id);
  }, [teams.data]);
  const tournamentName = useMemo(() => {
    const m = new Map((tournaments.data?.data ?? []).map((t) => [t.id, t.name]));
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
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });
    }
    return [...buckets.entries()];
  }, [matches.data]);

  return (
    <ResourcePage
      title="本番前モード"
      description="直近の試合からマッチアップビューに入り、対戦相手の傾向を見るためのエントリ。"
      isLoading={matches.isLoading || tournaments.isLoading}
      error={matches.error}
      onRetry={() => matches.refetch()}
    >
      <Stack>
        {byTournament.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">
            登録されている試合がありません。 [大会] / [試合] から先に作成してください。
          </Text>
        )}
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
                    const a = teamName(m.teamAId);
                    const b = teamName(m.teamBId);
                    return (
                      <Table.Tr
                        key={m.id}
                        style={{ cursor: "pointer" }}
                        onClick={() =>
                          navigate({ to: "/matches/$matchId", params: { matchId: m.id } })
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
                            <Text size="sm" fw={a?.isOwn ? 700 : 400}>
                              {a?.name ?? "?"}
                              {a?.isOwn && (
                                <Badge ml={4} size="xs" color="grape">
                                  自
                                </Badge>
                              )}
                            </Text>
                            <Text c="dimmed">vs</Text>
                            <Text size="sm" fw={b?.isOwn ? 700 : 400}>
                              {b?.name ?? "?"}
                              {b?.isOwn && (
                                <Badge ml={4} size="xs" color="grape">
                                  自
                                </Badge>
                              )}
                            </Text>
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
    </ResourcePage>
  );
}
