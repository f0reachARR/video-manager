import { Alert, Card, Group, Stack, Tabs, Text } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import { tournamentsApi } from "../lib/api/client";
import { DirectoryControls } from "../features/bulk-upload/components/DirectoryControls";
import { FileTable } from "../features/bulk-upload/components/FileTable";
import { TournamentSelector } from "../features/bulk-upload/components/TournamentSelector";
import { useDirectoryScan } from "../features/bulk-upload/hooks/useDirectoryScan";
import { pickDirectory } from "../features/bulk-upload/lib/fsAccess";

const LS_TOURNAMENT_KEY = "video-manager.bulk-upload.tournamentId";

export const Route = createFileRoute("/bulk-upload")({
  component: BulkUploadPage,
});

function BulkUploadPage() {
  // Tournament selection persists in localStorage so reopening the tab
  // keeps the operator pointed at the right tournament. Directory handle
  // persistence (IndexedDB) lands in P7.
  const [tournamentId, setTournamentIdState] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? window.localStorage.getItem(LS_TOURNAMENT_KEY)
      : null,
  );
  const setTournamentId = (v: string | null) => {
    setTournamentIdState(v);
    if (typeof window === "undefined") return;
    if (v) window.localStorage.setItem(LS_TOURNAMENT_KEY, v);
    else window.localStorage.removeItem(LS_TOURNAMENT_KEY);
  };

  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(
    null,
  );
  const [clearing, setClearing] = useState(false);

  const scan = useDirectoryScan({ directory, tournamentId });

  const stats = useMemo(() => {
    let videos = 0;
    let images = 0;
    let unknown = 0;
    let known = 0;
    let neu = 0;
    for (const f of scan.files) {
      if (f.mediaKind === "video") videos++;
      else if (f.mediaKind === "image") images++;
      else unknown++;
      if (f.checkState === "known") known++;
      else if (f.checkState === "new") neu++;
    }
    return { videos, images, unknown, known, neu };
  }, [scan.files]);

  const videoFiles = useMemo(
    () => scan.files.filter((f) => f.mediaKind === "video"),
    [scan.files],
  );
  const imageFiles = useMemo(
    () => scan.files.filter((f) => f.mediaKind === "image"),
    [scan.files],
  );
  const unknownFiles = useMemo(
    () => scan.files.filter((f) => f.mediaKind === "unknown"),
    [scan.files],
  );

  const pick = async () => {
    const handle = await pickDirectory();
    if (handle) setDirectory(handle);
  };

  const clearCache = async () => {
    if (!tournamentId) return;
    if (
      !window.confirm(
        "この大会の「既にアップ済」記録を全て消します。再アップロードしたいとき以外は不要です。よろしいですか？",
      )
    )
      return;
    setClearing(true);
    try {
      await tournamentsApi.clearBulkUploadFingerprints(tournamentId);
      await scan.rescan();
    } finally {
      setClearing(false);
    }
  };

  const busy = scan.scanning || scan.hashing || scan.checking;

  return (
    <ResourcePage
      title="現場一括アップロード"
      description="大会会場で、PC のディレクトリにある動画・画像をまとめて選別・アップロードするためのモード。"
    >
      <Stack>
        <Card withBorder padding="md">
          <Group align="flex-end" wrap="wrap">
            <TournamentSelector value={tournamentId} onChange={setTournamentId} />
            <Stack gap={4} flex={1} miw={300}>
              <DirectoryControls
                directoryName={directory?.name ?? null}
                fileCount={scan.files.length}
                newCount={stats.neu}
                knownCount={stats.known}
                busy={busy}
                onPick={pick}
                onRescan={() => void scan.rescan()}
                onClearCache={tournamentId ? clearCache : undefined}
                clearing={clearing}
              />
            </Stack>
          </Group>
        </Card>

        {scan.error && <Alert color="red">{scan.error}</Alert>}

        {!tournamentId && (
          <Alert color="yellow">
            まず大会を選択してください。重複判定は大会単位で行われます。
          </Alert>
        )}

        <Card withBorder padding={0}>
          <Tabs defaultValue="video">
            <Tabs.List>
              <Tabs.Tab value="video">動画 ({videoFiles.length})</Tabs.Tab>
              <Tabs.Tab value="image">画像 ({imageFiles.length})</Tabs.Tab>
              <Tabs.Tab value="unknown">未分類 ({unknownFiles.length})</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="video" p="md">
              <FileTable
                files={videoFiles}
                hashing={scan.hashing}
                checking={scan.checking}
              />
              <Text size="xs" c="dimmed" mt="xs">
                P4 でセッション選択 → アップロード機能を追加予定。
              </Text>
            </Tabs.Panel>
            <Tabs.Panel value="image" p="md">
              <FileTable
                files={imageFiles}
                hashing={scan.hashing}
                checking={scan.checking}
              />
              <Text size="xs" c="dimmed" mt="xs">
                P5 でチーム/ロボット選択 → アップロード機能を追加予定。
              </Text>
            </Tabs.Panel>
            <Tabs.Panel value="unknown" p="md">
              <FileTable
                files={unknownFiles}
                hashing={scan.hashing}
                checking={scan.checking}
              />
              <Text size="xs" c="dimmed" mt="xs">
                拡張子・MIME から動画/画像と判定できなかったファイルです。
              </Text>
            </Tabs.Panel>
          </Tabs>
        </Card>
      </Stack>
    </ResourcePage>
  );
}
