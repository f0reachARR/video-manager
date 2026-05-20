import { Alert, Badge, Button, Group, Stack, Text } from "@mantine/core";

import { isFsAccessSupported } from "../lib/fsAccess";

type Props = {
  directoryName: string | null;
  fileCount: number;
  newCount: number;
  knownCount: number;
  busy: boolean;
  onPick: () => void;
  onRescan: () => void;
  onClearCache?: () => void;
  clearing?: boolean;
};

export function DirectoryControls(props: Props) {
  if (!isFsAccessSupported()) {
    return (
      <Alert color="yellow" title="このブラウザはディレクトリ監視に対応していません">
        Chrome/Edge などの File System Access API
        対応ブラウザでアクセスしてください。
      </Alert>
    );
  }
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Text size="sm" c="dimmed">
            監視ディレクトリ
          </Text>
          <Text fw={500}>{props.directoryName ?? "(未選択)"}</Text>
        </Stack>
        <Group gap="xs">
          <Button onClick={props.onPick} variant="light" size="sm">
            {props.directoryName ? "変更…" : "ディレクトリを選ぶ"}
          </Button>
          <Button
            onClick={props.onRescan}
            disabled={!props.directoryName || props.busy}
            loading={props.busy}
            variant="default"
            size="sm"
          >
            再スキャン
          </Button>
          {props.onClearCache && (
            <Button
              onClick={props.onClearCache}
              color="red"
              variant="subtle"
              size="sm"
              loading={!!props.clearing}
            >
              キャッシュをクリア
            </Button>
          )}
        </Group>
      </Group>
      {props.directoryName && (
        <Group gap="xs">
          <Badge variant="light">{props.fileCount} ファイル</Badge>
          <Badge color="blue" variant="light">
            新規 {props.newCount}
          </Badge>
          <Badge color="gray" variant="light">
            既にアップ済 {props.knownCount}
          </Badge>
        </Group>
      )}
    </Stack>
  );
}
