import { Card, Group, Stack, Text } from "@mantine/core";

export function MatchHeader({
  match,
}: {
  match: { scheduledAt?: string | null };
}) {
  return (
    <Card withBorder>
      <Group justify="flex-end">
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
