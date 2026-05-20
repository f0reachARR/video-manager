import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import { tournamentsApi } from "../lib/api/client";
import { DirectoryControls } from "../features/bulk-upload/components/DirectoryControls";
import {
  FileTable,
  canCreateRun,
  canUpload,
  isSelectable,
  rowVideoId,
} from "../features/bulk-upload/components/FileTable";
import { TournamentSelector } from "../features/bulk-upload/components/TournamentSelector";
import { TeamRobotSelector } from "../features/bulk-upload/components/TeamRobotSelector";
import { VideoPreviewModal } from "../features/bulk-upload/components/VideoPreviewModal";
import { useDirectoryScan } from "../features/bulk-upload/hooks/useDirectoryScan";
import { useImageBulkUpload } from "../features/bulk-upload/hooks/useImageBulkUpload";
import { useVideoBulkUpload } from "../features/bulk-upload/hooks/useVideoBulkUpload";
import { pickDirectory } from "../features/bulk-upload/lib/fsAccess";
import {
  clearDirectoryHandle,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from "../features/bulk-upload/lib/handleStore";
import { useSessions } from "../features/sessions/api/queries";
import { useCurrentUserId } from "../stores/currentUser";

const LS_TOURNAMENT_KEY = "video-manager.bulk-upload.tournamentId";
const LS_SESSION_KEY = "video-manager.bulk-upload.sessionId";
const LS_TEAM_KEY = "video-manager.bulk-upload.teamId";
const LS_ROBOT_KEY = "video-manager.bulk-upload.robotId";

export const Route = createFileRoute("/bulk-upload")({
  component: BulkUploadPage,
});

function BulkUploadPage() {
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

  const [sessionId, setSessionIdState] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? window.localStorage.getItem(LS_SESSION_KEY)
      : null,
  );
  const setSessionId = (v: string | null) => {
    setSessionIdState(v);
    if (typeof window === "undefined") return;
    if (v) window.localStorage.setItem(LS_SESSION_KEY, v);
    else window.localStorage.removeItem(LS_SESSION_KEY);
  };

  const [directory, setDirectoryState] = useState<FileSystemDirectoryHandle | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    void loadDirectoryHandle().then((h) => {
      if (!cancelled && h) setDirectoryState(h);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const setDirectory = (h: FileSystemDirectoryHandle | null) => {
    setDirectoryState(h);
    if (h) void saveDirectoryHandle(h);
    else void clearDirectoryHandle();
  };
  const [clearing, setClearing] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [teamId, setTeamIdState] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? window.localStorage.getItem(LS_TEAM_KEY)
      : null,
  );
  const setTeamId = (v: string | null) => {
    setTeamIdState(v);
    if (typeof window === "undefined") return;
    if (v) window.localStorage.setItem(LS_TEAM_KEY, v);
    else window.localStorage.removeItem(LS_TEAM_KEY);
  };
  const [robotId, setRobotIdState] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? window.localStorage.getItem(LS_ROBOT_KEY)
      : null,
  );
  const setRobotId = (v: string | null) => {
    setRobotIdState(v);
    if (typeof window === "undefined") return;
    if (v) window.localStorage.setItem(LS_ROBOT_KEY, v);
    else window.localStorage.removeItem(LS_ROBOT_KEY);
  };

  const scan = useDirectoryScan({ directory, tournamentId });
  const sessions = useSessions(
    tournamentId ? { tournamentId, limit: 200 } : { limit: 200 },
  );
  const currentUserId = useCurrentUserId();
  const videoUpload = useVideoBulkUpload(
    tournamentId && sessionId
      ? { tournamentId, sessionId, uploaderId: currentUserId }
      : null,
  );
  const imageUpload = useImageBulkUpload();
  const uploadsMap = useMemo(() => {
    const m = new Map<string, (typeof videoUpload.items)[number]>();
    for (const it of videoUpload.items) m.set(it.key, it);
    return m;
  }, [videoUpload.items]);

  // Auto-rescan after the last in-flight upload settles. The transition
  // detector compares the "anything uploading right now?" boolean against
  // the previous tick — going true→false triggers a fresh scan so newly
  // created videos pick up their server-side check result (and known/new
  // badges reflect the new state without manual intervention). We don't
  // re-fire while still busy, and we don't fire on initial mount when
  // there's never been anything in flight.
  const wasUploadingRef = useRef(false);
  useEffect(() => {
    const videoActive = videoUpload.items.some((u) => u.state === "uploading");
    const imageActive = Object.values(imageUpload.items).some(
      (u) => u.state === "uploading",
    );
    const active = videoActive || imageActive;
    if (wasUploadingRef.current && !active) {
      // Defer one tick so the tus hook has a chance to finish writing
      // the fingerprint row before /check is re-issued.
      const t = window.setTimeout(() => {
        void scan.rescan();
      }, 300);
      wasUploadingRef.current = false;
      return () => window.clearTimeout(t);
    }
    wasUploadingRef.current = active;
  }, [videoUpload.items, imageUpload.items, scan]);

  useEffect(() => {
    if (!sessionId || !sessions.data) return;
    if (!sessions.data.data.some((s) => s.id === sessionId)) setSessionId(null);
  }, [sessionId, sessions.data]);

  const stats = useMemo(() => {
    let known = 0;
    let neu = 0;
    for (const f of scan.files) {
      if (f.checkState === "known") known++;
      else if (f.checkState === "new") neu++;
    }
    return { known, neu };
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

  const toggle = useCallback(
    (key: string) =>
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );

  const makeToggleAll = (subset: typeof scan.files) => () =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const eligible = subset.filter((f) =>
        isSelectable(f, uploadsMap.get(f.key), imageUpload.items[f.key]),
      );
      const allOn = eligible.every((f) => next.has(f.key));
      if (allOn) for (const f of eligible) next.delete(f.key);
      else for (const f of eligible) next.add(f.key);
      return next;
    });

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

  const sessionOptions = useMemo(
    () =>
      (sessions.data?.data ?? []).map((s) => ({
        value: s.id,
        label:
          (s.name ?? "(無題)") +
          (s.startedAt
            ? ` — ${new Date(s.startedAt).toLocaleString()}`
            : ""),
      })),
    [sessions.data],
  );

  // Selected-video buckets: rows the user could upload vs. rows the user
  // could turn into a Run. They overlap freely — a freshly-uploaded video
  // is upload-able no longer but Run-able now; a "known" video is the
  // mirror image.
  const selectedVideoUploadFiles = useMemo(
    () =>
      videoFiles.filter(
        (f) =>
          selectedKeys.has(f.key) && canUpload(f, uploadsMap.get(f.key)),
      ),
    [videoFiles, selectedKeys, uploadsMap],
  );
  const selectedVideoRunIds = useMemo(() => {
    const ids: string[] = [];
    for (const f of videoFiles) {
      if (!selectedKeys.has(f.key)) continue;
      const up = uploadsMap.get(f.key);
      if (!canCreateRun(f, up)) continue;
      const vid = rowVideoId(f, up);
      if (vid) ids.push(vid);
    }
    return ids;
  }, [videoFiles, selectedKeys, uploadsMap]);
  const selectedImageFiles = useMemo(
    () =>
      imageFiles.filter(
        (f) =>
          selectedKeys.has(f.key) &&
          canUpload(f, undefined, imageUpload.items[f.key]),
      ),
    [imageFiles, selectedKeys, imageUpload.items],
  );

  const startVideoUpload = () => {
    if (
      !sessionId ||
      !tournamentId ||
      selectedVideoUploadFiles.length === 0
    )
      return;
    videoUpload.startMany(selectedVideoUploadFiles);
    setSelectedKeys(
      (prev) =>
        new Set(
          [...prev].filter(
            (k) => !selectedVideoUploadFiles.some((f) => f.key === k),
          ),
        ),
    );
  };

  const openRunBulkCreate = () => {
    if (selectedVideoRunIds.length === 0) return;
    const params = new URLSearchParams({
      videoIds: selectedVideoRunIds.join(","),
    });
    if (sessionId) params.set("sessionId", sessionId);
    // Open in a new tab so the operator can continue uploading on this
    // tab while the Run-creation page handles classification.
    window.open(`/runs/new-from-videos?${params.toString()}`, "_blank", "noopener");
  };

  const startImageUpload = () => {
    if (!tournamentId || !robotId || selectedImageFiles.length === 0) return;
    void imageUpload.startBatch({
      tournamentId,
      robotId,
      files: selectedImageFiles,
    });
    setSelectedKeys(
      (prev) =>
        new Set(
          [...prev].filter(
            (k) => !selectedImageFiles.some((f) => f.key === k),
          ),
        ),
    );
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
              <Stack gap="sm">
                <Group align="flex-end" wrap="wrap">
                  <Select
                    label="アップロード先セッション"
                    placeholder={
                      tournamentId
                        ? "この大会のセッションを選ぶ"
                        : "先に大会を選択"
                    }
                    data={sessionOptions}
                    value={sessionId}
                    onChange={setSessionId}
                    disabled={!tournamentId}
                    searchable
                    clearable
                    w={360}
                  />
                  <Group gap="xs">
                    <Badge variant="light">
                      アップロード可 {selectedVideoUploadFiles.length} /
                      Run化可 {selectedVideoRunIds.length}
                    </Badge>
                    <Button
                      size="sm"
                      onClick={startVideoUpload}
                      disabled={
                        !sessionId ||
                        !tournamentId ||
                        selectedVideoUploadFiles.length === 0
                      }
                    >
                      選択した動画をアップロード
                    </Button>
                    <Button
                      size="sm"
                      variant="light"
                      onClick={openRunBulkCreate}
                      disabled={
                        selectedVideoRunIds.length === 0 || !sessionId
                      }
                      title={
                        !sessionId
                          ? "Run 一括作成画面は Session 指定が必須です"
                          : undefined
                      }
                    >
                      選択動画から Run を作成 (別タブ)
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={videoUpload.clearFinished}
                      disabled={
                        !videoUpload.items.some((u) => u.state === "done")
                      }
                    >
                      完了行を片付ける
                    </Button>
                  </Group>
                </Group>
                <FileTable
                  files={videoFiles}
                  hashing={scan.hashing}
                  checking={scan.checking}
                  uploads={uploadsMap}
                  selection={{
                    selected: selectedKeys,
                    onToggle: toggle,
                    onToggleAll: makeToggleAll(videoFiles),
                  }}
                  onPreviewVideo={setPreviewVideoId}
                />
                <Text size="xs" c="dimmed">
                  ハッシュ済の動画は選択できます。新規ファイルはアップロード対象に、アップロード済 / 既にアップ済の行は Run 作成対象になります。アップロード完了後は自動で再スキャンします。
                </Text>
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="image" p="md">
              <Stack gap="sm">
                <Group align="flex-end" wrap="wrap">
                  <TeamRobotSelector
                    tournamentId={tournamentId}
                    teamId={teamId}
                    robotId={robotId}
                    onTeamChange={setTeamId}
                    onRobotChange={setRobotId}
                  />
                  <Group gap="xs">
                    <Badge variant="light">
                      選択 {selectedImageFiles.length} 件
                    </Badge>
                    <Button
                      size="sm"
                      onClick={startImageUpload}
                      disabled={
                        !robotId ||
                        !tournamentId ||
                        selectedImageFiles.length === 0
                      }
                    >
                      選択した画像をアップロード
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={imageUpload.clearFinished}
                      disabled={
                        !Object.values(imageUpload.items).some(
                          (u) => u.state === "done",
                        )
                      }
                    >
                      完了行を片付ける
                    </Button>
                  </Group>
                </Group>
                <FileTable
                  files={imageFiles}
                  hashing={scan.hashing}
                  checking={scan.checking}
                  imageUploads={imageUpload.items}
                  selection={{
                    selected: selectedKeys,
                    onToggle: toggle,
                    onToggleAll: makeToggleAll(imageFiles),
                  }}
                />
                <Text size="xs" c="dimmed">
                  選択したロボットの写真として記録します。HEIC は JPEG
                  に自動変換されます。
                </Text>
              </Stack>
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
      <VideoPreviewModal
        videoId={previewVideoId}
        onClose={() => setPreviewVideoId(null)}
      />
    </ResourcePage>
  );
}
