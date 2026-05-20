import { Badge, Button, Checkbox, Group, Loader, Progress, Table, Text } from "@mantine/core";

import type { ScannedFile } from "../hooks/useDirectoryScan";
import type { BulkImageUploadItem } from "../hooks/useImageBulkUpload";
import type { BulkVideoUploadItem } from "../hooks/useVideoBulkUpload";

type Props = {
  files: ScannedFile[];
  hashing: boolean;
  checking: boolean;
  // Selection state lifted into the parent so the action bar can
  // act on the same set. Pass null to render without checkboxes.
  selection?: {
    selected: Set<string>;
    onToggle: (key: string) => void;
    onToggleAll: () => void;
  } | null;
  uploads?: Map<string, BulkVideoUploadItem>;
  imageUploads?: Record<string, BulkImageUploadItem>;
  // P6: clicking 「Run作成」 invokes this with the resolved video id.
  // Only rendered on video rows whose status has yielded a video id
  // (either freshly uploaded or already-known via the dedup check).
  onCreateRun?: (videoId: string) => void;
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

// A file is selectable when (1) we know what it is, (2) the hash is
// done, and (3) the server-side dedup says it's new. Known/uploading
// rows expose informational badges but are skipped.
export function isSelectable(
  f: ScannedFile,
  uploadState?: BulkVideoUploadItem,
  imageUploadState?: BulkImageUploadItem,
): boolean {
  if (f.hashState !== "done") return false;
  if (f.mediaKind === "unknown") return false;
  if (f.checkState === "known") return false;
  if (uploadState && uploadState.state === "uploading") return false;
  if (imageUploadState && imageUploadState.state === "uploading") return false;
  return true;
}

export function FileTable({
  files,
  hashing,
  checking,
  selection,
  uploads,
  imageUploads,
  onCreateRun,
}: Props) {
  if (files.length === 0) {
    return (
      <Text c="dimmed" size="sm" py="md" ta="center">
        ディレクトリを選ぶとここに一覧が出ます。
      </Text>
    );
  }
  const selectableKeys = files
    .filter((f) => isSelectable(f, uploads?.get(f.key), imageUploads?.[f.key]))
    .map((f) => f.key);
  const allSelected =
    selection != null &&
    selectableKeys.length > 0 &&
    selectableKeys.every((k) => selection.selected.has(k));
  const someSelected =
    selection != null && selectableKeys.some((k) => selection.selected.has(k));

  return (
    <Table striped withTableBorder verticalSpacing="xs">
      <Table.Thead>
        <Table.Tr>
          {selection && (
            <Table.Th style={{ width: 36 }}>
              <Checkbox
                checked={allSelected}
                indeterminate={!allSelected && someSelected}
                onChange={selection.onToggleAll}
                aria-label="すべて選択"
              />
            </Table.Th>
          )}
          <Table.Th style={{ width: 70 }}>種別</Table.Th>
          <Table.Th>ファイル名</Table.Th>
          <Table.Th style={{ width: 100 }}>サイズ</Table.Th>
          <Table.Th style={{ width: 220 }}>状態</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {files.map((f) => {
          const up = uploads?.get(f.key);
          const imgUp = imageUploads?.[f.key];
          const selectable = isSelectable(f, up, imgUp);
          return (
            <Table.Tr key={f.key}>
              {selection && (
                <Table.Td>
                  <Checkbox
                    checked={selection.selected.has(f.key)}
                    onChange={() => selection.onToggle(f.key)}
                    disabled={!selectable}
                    aria-label={`${f.file.name} を選択`}
                  />
                </Table.Td>
              )}
              <Table.Td>
                <Badge color={KIND_COLOR[f.mediaKind]} variant="light">
                  {KIND_LABEL[f.mediaKind]}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Group gap="xs" wrap="nowrap" justify="space-between">
                  <Text>{f.file.name}</Text>
                  {(() => {
                    const vid = up?.videoId ?? f.knownResult?.videoId;
                    if (!onCreateRun || !vid || f.mediaKind !== "video") return null;
                    return (
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => onCreateRun(vid)}
                      >
                        + Run
                      </Button>
                    );
                  })()}
                </Group>
                {f.knownResult?.videoId && (
                  <Text size="xs" c="dimmed" ff="monospace">
                    → video {f.knownResult.videoId}
                  </Text>
                )}
                {up?.videoId && !f.knownResult?.videoId && (
                  <Text size="xs" c="dimmed" ff="monospace">
                    → video {up.videoId}
                  </Text>
                )}
                {f.knownResult?.robotImageId && (
                  <Text size="xs" c="dimmed" ff="monospace">
                    → image {f.knownResult.robotImageId}
                  </Text>
                )}
                {imgUp?.imageId && (
                  <Text size="xs" c="dimmed" ff="monospace">
                    → image {imgUp.imageId}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {formatSize(f.file.size)}
                </Text>
              </Table.Td>
              <Table.Td>
                <StatusCell
                  file={f}
                  hashing={hashing}
                  checking={checking}
                  upload={up}
                  imageUpload={imgUp}
                />
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

function StatusCell({
  file,
  hashing,
  checking,
  upload,
  imageUpload,
}: {
  file: ScannedFile;
  hashing: boolean;
  checking: boolean;
  upload?: BulkVideoUploadItem;
  imageUpload?: BulkImageUploadItem;
}) {
  if (imageUpload) {
    if (imageUpload.state === "uploading") {
      return (
        <Group gap={4}>
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            送信中
          </Text>
        </Group>
      );
    }
    if (imageUpload.state === "done") {
      return (
        <Badge color="green" variant="filled">
          完了
        </Badge>
      );
    }
    if (imageUpload.state === "error") {
      return (
        <Badge color="red" variant="light" title={imageUpload.error}>
          失敗
        </Badge>
      );
    }
  }
  // Upload state outranks everything else: once an upload starts the
  // dedup outcome becomes "this file is already going up".
  if (upload) {
    if (upload.state === "uploading") {
      return (
        <Group gap={6} wrap="nowrap">
          <Progress value={upload.progress} w={100} size="sm" />
          <Text size="xs" c="dimmed">
            {upload.progress}%
          </Text>
        </Group>
      );
    }
    if (upload.state === "done") {
      return (
        <Badge color="green" variant="filled">
          完了
        </Badge>
      );
    }
    if (upload.state === "error") {
      return (
        <Badge color="red" variant="light" title={upload.error}>
          失敗
        </Badge>
      );
    }
    if (upload.state === "canceled") {
      return (
        <Badge color="gray" variant="light">
          キャンセル
        </Badge>
      );
    }
  }

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
