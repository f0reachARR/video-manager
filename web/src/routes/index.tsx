import { Alert, Badge, Card, Group, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { fetchHealth, fetchReady } from "../lib/api/client";
import { useCurrentUserId } from "../stores/currentUser";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: fetchHealth });
  const ready = useQuery({ queryKey: ["ready"], queryFn: fetchReady });
  const currentUserId = useCurrentUserId();

  return (
    <Stack maw={720}>
      <Title order={2}>Hello, Video Manager</Title>
      <Text c="dimmed">
        Phase 1 §4 までの管理 UI が動きます。左のナビからマスタとセッションを操作してください。
      </Text>

      <Card withBorder>
        <Stack gap="xs">
          <Title order={4}>現在のユーザー</Title>
          {currentUserId ? (
            <Text size="sm">
              X-User-Id: <code>{currentUserId}</code>
            </Text>
          ) : (
            <Alert color="yellow">
              ヘッダーの「現在のユーザー」が未設定です。/users
              でユーザーを作成して選択してください。
            </Alert>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={4}>/health</Title>
            <StatusBadge state={health} />
          </Group>
          {health.data && (
            <Text size="sm">
              status: <code>{health.data.status}</code>, version:{" "}
              <code>{health.data.version}</code>
            </Text>
          )}
          {health.error && <Alert color="red">{(health.error as Error).message}</Alert>}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={4}>/ready</Title>
            <StatusBadge state={ready} />
          </Group>
          {ready.data && (
            <Text size="sm">
              DB ping OK ({ready.data.status} / v{ready.data.version})
            </Text>
          )}
          {ready.error && <Alert color="red">{(ready.error as Error).message}</Alert>}
        </Stack>
      </Card>
    </Stack>
  );
}

type QueryLike = { isLoading: boolean; isError: boolean; isSuccess: boolean };

function StatusBadge({ state }: { state: QueryLike }) {
  if (state.isLoading) return <Badge color="gray">loading</Badge>;
  if (state.isError) return <Badge color="red">error</Badge>;
  if (state.isSuccess) return <Badge color="green">ok</Badge>;
  return <Badge color="gray">idle</Badge>;
}
