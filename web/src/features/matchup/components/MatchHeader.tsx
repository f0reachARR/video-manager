import { Card, Group, Stack, Text } from "@mantine/core";

import { useTournament } from "../../tournaments/api/queries";

export function MatchHeader({
  match,
}: {
  match: { tournamentId: string; scheduledAt?: string | null };
}) {
  const tournament = useTournament(match.tournamentId);
  return (
    <Card withBorder>
      <Group justify="space-between">
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            Tournament
          </Text>
          <Text fw={600}>{tournament.data?.name ?? "…"}</Text>
        </Stack>
        <Stack gap={4} align="flex-end">
          <Text size="sm" c="dimmed">
            予定時刻
          </Text>
          <Text>
            {match.scheduledAt
              ? new Date(match.scheduledAt).toLocaleString()
              : "未定"}
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}
