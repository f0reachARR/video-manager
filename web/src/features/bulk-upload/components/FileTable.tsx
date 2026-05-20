import { Badge, Group, Loader, Table, Text } from "@mantine/core";

import type { ScannedFile } from "../hooks/useDirectoryScan";

type Props = {
  files: ScannedFile[];
  hashing: boolean;
  checking: boolean;
};

const KIND_LABEL: Record<ScannedFile["mediaKind"], string> = {
  video: "動画",
  image: "画像",
  unknown: "?",
};

const KIND_COLOR: Record<ScannedFile["mediaKind"], string> = {
  video: "grape",
  image: "teal",
  unknown: "gray",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function FileTable({ files, hashing, checking }: Props) {
  if (files.length === 0) {
    return (
      <Text c="dimmed" size="sm" py="md" ta="center">
        ディレクトリを選ぶとここに一覧が出ます。
      </Text>
    );
  }
  return (
    <Table striped withTableBorder verticalSpacing="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>種別</Table.Th>
          <Table.Th>ファイル名</Table.Th>
          <Table.Th style={{ width: 100 }}>サイズ</Table.Th>
          <Table.Th style={{ width: 160 }}>状態</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {files.map((f) => (
          <Table.Tr key={f.key}>
            <Table.Td>
              <Badge color={KIND_COLOR[f.mediaKind]} variant="light">
                {KIND_LABEL[f.mediaKind]}
              </Badge>
            </Table.Td>
            <Table.Td>
              <Text>{f.file.name}</Text>
              {f.knownResult?.videoId && (
                <Text size="xs" c="dimmed" ff="monospace">
                  → video {f.knownResult.videoId}
                </Text>
              )}
              {f.knownResult?.robotImageId && (
                <Text size="xs" c="dimmed" ff="monospace">
                  → image {f.knownResult.robotImageId}
                </Text>
              )}
            </Table.Td>
            <Table.Td>
              <Text size="sm" c="dimmed">
                {formatSize(f.file.size)}
              </Text>
            </Table.Td>
            <Table.Td>
              <StatusCell file={f} hashing={hashing} checking={checking} />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function StatusCell({
  file,
  hashing,
  checking,
}: {
  file: ScannedFile;
  hashing: boolean;
  checking: boolean;
}) {
  if (file.hashState === "pending") {
    return (
      <Group gap={4}>
        <Loader size="xs" />
        <Text size="xs" c="dimmed">
          ハッシュ計算中
        </Text>
      </Group>
    );
  }
  if (file.hashState === "error") {
    return (
      <Badge color="red" variant="light" title={file.hashError}>
        ハッシュ失敗
      </Badge>
    );
  }
  if (file.mediaKind === "unknown") {
    return (
      <Badge color="gray" variant="light">
        未分類
      </Badge>
    );
  }
  if (file.checkState === "known") {
    return (
      <Badge color="gray" variant="light">
        既にアップ済
      </Badge>
    );
  }
  if (file.checkState === "new") {
    return (
      <Badge color="blue" variant="light">
        新規
      </Badge>
    );
  }
  // hash done but check not yet returned
  if (checking || hashing) {
    return (
      <Group gap={4}>
        <Loader size="xs" />
        <Text size="xs" c="dimmed">
          サーバ照合中
        </Text>
      </Group>
    );
  }
  return (
    <Badge color="yellow" variant="light">
      未確認
    </Badge>
  );
}
