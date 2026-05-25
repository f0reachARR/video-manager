import { Badge, Card, Group, Stack, Table, Text } from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { useMatches } from "../../matches/api/queries";
import { useTeams } from "../../teams/api/queries";

export function UpcomingMatchesList() {
  const matches = useMatches();
  const teams = useTeams();
  const navigate = useNavigate();

  const teamById = useMemo(() => {
    const m = new Map((teams.data?.data ?? []).map((t) => [t.id, t]));
    return (id: string) => m.get(id);
  }, [teams.data]);

  // Matches are already scoped to the current tournament — just sort by
  // scheduled_at asc, TBD entries last.
  const list = useMemo(() => {
    const sorted = [...(matches.data?.data ?? [])];
    sorted.sort((a, b) => {
      if (!a.scheduledAt && !b.scheduledAt) return 0;
      if (!a.scheduledAt) return 1;
      if (!b.scheduledAt) return -1;
      return (
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      );
    });
    return sorted;
  }, [matches.data]);

  if (list.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        登録されている試合がありません。 [試合] から先に作成してください。
      </Text>
    );
  }

  return (
    <Card withBorder>
      <Stack>
        <Group justify="flex-end">
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
  );
}
