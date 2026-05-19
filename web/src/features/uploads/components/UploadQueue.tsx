import {
  ActionIcon,
  Button,
  Group,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { formatRate, type UploadItem } from "../hooks/useTusUpload";

export function UploadQueue({
  uploads,
  onCancel,
  onRetry,
  onClearFinished,
}: {
  uploads: UploadItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onClearFinished: () => void;
}) {
  if (uploads.length === 0) return null;
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={5}>アップロード状況 ({uploads.length})</Title>
        <Button size="xs" variant="subtle" onClick={onClearFinished}>
          完了/失敗をクリア
        </Button>
      </Group>
      {uploads.map((u) => (
        <Group key={u.id} gap="md" wrap="nowrap">
          <Text size="sm" flex={1} truncate>
            {u.fileName}
          </Text>
          <Text size="xs" c="dimmed" miw={80} ta="right">
            {(u.size / (1024 * 1024)).toFixed(1)} MB
          </Text>
          <Progress
            value={u.progress}
            color={
              u.state === "error"
                ? "red"
                : u.state === "canceled"
                  ? "gray"
                  : u.state === "done"
                    ? "green"
                    : "blue"
            }
            miw={200}
            size="sm"
            flex={1}
          />
          <Text size="xs" w={130} ta="right">
            {u.state === "uploading" && `${u.progress}% · ${formatRate(u)}`}
            {u.state === "done" && "完了"}
            {u.state === "canceled" && "中止"}
            {u.state === "error" && (u.error ?? "失敗")}
          </Text>
          <Group gap={4} w={70} justify="flex-end">
            {u.state === "uploading" && (
              <ActionIcon
                size="sm"
                variant="subtle"
                color="red"
                onClick={() => onCancel(u.id)}
                aria-label="中止"
              >
                ✕
              </ActionIcon>
            )}
            {(u.state === "error" || u.state === "canceled") && (
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={() => onRetry(u.id)}
                aria-label="再試行"
              >
                ↻
              </ActionIcon>
            )}
          </Group>
        </Group>
      ))}
    </Stack>
  );
}
