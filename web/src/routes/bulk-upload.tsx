import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Select,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import { tournamentsApi } from "../lib/api/client";
import { DirectoryControls } from "../features/bulk-upload/components/DirectoryControls";
import {
  FileTable,
  isSelectable,
  rowVideoId,
} from "../features/bulk-upload/components/FileTable";
import { TournamentSelector } from "../features/bulk-upload/components/TournamentSelector";
import { TeamRobotSelector } from "../features/bulk-upload/components/TeamRobotSelector";
import { VideoPreviewModal } from "../features/bulk-upload/components/VideoPreviewModal";
import type { ScannedFile } from "../features/bulk-upload/hooks/useDirectoryScan";
import { useDirectoryScan } from "../features/bulk-upload/hooks/useDirectoryScan";
import type { BulkImageUploadItem } from "../features/bulk-upload/hooks/useImageBulkUpload";
import { useImageBulkUpload } from "../features/bulk-upload/hooks/useImageBulkUpload";
import type { BulkVideoUploadItem } from "../features/bulk-upload/hooks/useVideoBulkUpload";
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

// Each row falls in exactly one bucket per tab: 未アップロード (no
// server-side artifact yet) or アップロード済 (the server has a row for
// it). Selecting one bucket can't pollute the other — that's the whole
// point of splitting.
function videoBucket(f: ScannedFile, up?: BulkVideoUploadItem) {
  return rowVideoId(f, up) ? "uploaded" : "unuploaded";
}
function imageBucket(f: ScannedFile, imgUp?: BulkImageUploadItem) {
  if (imgUp?.imageId) return "uploaded";
  if (f.knownResult?.robotImageId) return "uploaded";
  return "unuploaded";
}

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
  // Four independent selection sets, one per (tab × bucket). This is the
  // structural guarantee that 未アップロード and アップロード済 selections
  // never mix even if the user keyboards through them quickly.
  const [selUnupVideo, setSelUnupVideo] = useState<Set<string>>(new Set());
  const [selUpVideo, setSelUpVideo] = useState<Set<string>>(new Set());
  const [selUnupImage, setSelUnupImage] = useState<Set<string>>(new Set());
  const [selUpImage, setSelUpImage] = useState<Set<string>>(new Set());
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
    const m = new Map<string, BulkVideoUploadItem>();
    for (const it of videoUpload.items) m.set(it.key, it);
    return m;
  }, [videoUpload.items]);

  // Auto-rescan after the last in-flight upload settles.
  const wasUploadingRef = useRef(false);
  useEffect(() => {
    const videoActive = videoUpload.items.some((u) => u.state === "uploading");
    const imageActive = Object.values(imageUpload.items).some(
      (u) => u.state === "uploading",
    );
    const active = videoActive || imageActive;
    if (wasUploadingRef.current && !active) {
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

  // Bucket rows. Rebuild on every scan / upload state change — when a
  // file flips buckets (e.g. an upload completes) we also prune its
  // selection from the now-stale set so the action bars don't claim it.
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

  const videoUnup = useMemo(
    () => videoFiles.filter((f) => videoBucket(f, uploadsMap.get(f.key)) === "unuploaded"),
    [videoFiles, uploadsMap],
  );
  const videoUp = useMemo(
    () => videoFiles.filter((f) => videoBucket(f, uploadsMap.get(f.key)) === "uploaded"),
    [videoFiles, uploadsMap],
  );
  const imageUnup = useMemo(
    () => imageFiles.filter((f) => imageBucket(f, imageUpload.items[f.key]) === "unuploaded"),
    [imageFiles, imageUpload.items],
  );
  const imageUp = useMemo(
    () => imageFiles.filter((f) => imageBucket(f, imageUpload.items[f.key]) === "uploaded"),
    [imageFiles, imageUpload.items],
  );

  // When a row migrates from "unuploaded" to "uploaded" we drop its key
  // from selUnupVideo (and vice-versa) so the action bars don't keep a
  // stale count.
  useEffect(() => {
    const upKeys = new Set(videoUp.map((f) => f.key));
    setSelUnupVideo((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (upKeys.has(k)) {
          changed = true;
          continue;
        }
        next.add(k);
      }
      return changed ? next : prev;
    });
    const unupKeys = new Set(videoUnup.map((f) => f.key));
    setSelUpVideo((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (unupKeys.has(k)) {
          changed = true;
          continue;
        }
        next.add(k);
      }
      return changed ? next : prev;
    });
  }, [videoUnup, videoUp]);
  useEffect(() => {
    const upKeys = new Set(imageUp.map((f) => f.key));
    setSelUnupImage((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (upKeys.has(k)) {
          changed = true;
          continue;
        }
        next.add(k);
      }
      return changed ? next : prev;
    });
    const unupKeys = new Set(imageUnup.map((f) => f.key));
    setSelUpImage((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (unupKeys.has(k)) {
          changed = true;
          continue;
        }
        next.add(k);
      }
      return changed ? next : prev;
    });
  }, [imageUnup, imageUp]);

  // Selection helpers factor out the toggle / toggle-all logic per bucket.
  type Setter = (updater: (prev: Set<string>) => Set<string>) => void;
  const makeToggle = useCallback(
    (setter: Setter) => (key: string) =>
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  const makeToggleAll = useCallback(
    (
      setter: Setter,
      subset: ScannedFile[],
      eligible: (f: ScannedFile) => boolean,
    ) =>
      () =>
        setter((prev) => {
          const next = new Set(prev);
          const elig = subset.filter(eligible);
          const allOn = elig.every((f) => next.has(f.key));
          if (allOn) for (const f of elig) next.delete(f.key);
          else for (const f of elig) next.add(f.key);
          return next;
        }),
    [],
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

  const stats = useMemo(() => {
    let known = 0;
    let neu = 0;
    for (const f of scan.files) {
      if (f.checkState === "known") known++;
      else if (f.checkState === "new") neu++;
    }
    return { known, neu };
  }, [scan.files]);

  // Action computations per section.
  const videoUnupSelectedFiles = useMemo(
    () => videoUnup.filter((f) => selUnupVideo.has(f.key)),
    [videoUnup, selUnupVideo],
  );
  const videoUpSelectedIds = useMemo(() => {
    const ids: string[] = [];
    for (const f of videoUp) {
      if (!selUpVideo.has(f.key)) continue;
      const vid = rowVideoId(f, uploadsMap.get(f.key));
      if (vid) ids.push(vid);
    }
    return ids;
  }, [videoUp, selUpVideo, uploadsMap]);
  const imageUnupSelectedFiles = useMemo(
    () => imageUnup.filter((f) => selUnupImage.has(f.key)),
    [imageUnup, selUnupImage],
  );

  const startVideoUpload = () => {
    if (!sessionId || !tournamentId || videoUnupSelectedFiles.length === 0) return;
    videoUpload.startMany(videoUnupSelectedFiles);
    // The trailing-edge effect drops the keys when their bucket flips,
    // but clear now so the action bar count zeros immediately.
    setSelUnupVideo(new Set());
  };

  const openRunBulkCreate = () => {
    if (videoUpSelectedIds.length === 0) return;
    const params = new URLSearchParams({
      videoIds: videoUpSelectedIds.join(","),
    });
    if (sessionId) params.set("sessionId", sessionId);
    window.open(`/runs/new-from-videos?${params.toString()}`, "_blank", "noopener");
  };

  const startImageUpload = () => {
    if (!tournamentId || !robotId || imageUnupSelectedFiles.length === 0) return;
    void imageUpload.startBatch({
      tournamentId,
      robotId,
      files: imageUnupSelectedFiles,
    });
    setSelUnupImage(new Set());
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
              <Stack gap="lg">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Title order={5}>未アップロード ({videoUnup.length})</Title>
                    <Group align="flex-end" wrap="wrap" gap="xs">
                      <Select
                        label="アップロード先セッション"
                        placeholder={
                          tournamentId ? "この大会のセッションを選ぶ" : "先に大会を選択"
                        }
                        data={sessionOptions}
                        value={sessionId}
                        onChange={setSessionId}
                        disabled={!tournamentId}
                        searchable
                        clearable
                        w={320}
                      />
                      <Badge variant="light">
                        選択 {videoUnupSelectedFiles.length} 件
                      </Badge>
                      <Button
                        size="sm"
                        onClick={startVideoUpload}
                        disabled={
                          !sessionId ||
                          !tournamentId ||
                          videoUnupSelectedFiles.length === 0
                        }
                      >
                        選択した動画をアップロード
                      </Button>
                    </Group>
                  </Group>
                  <FileTable
                    files={videoUnup}
                    hashing={scan.hashing}
                    checking={scan.checking}
                    uploads={uploadsMap}
                    selection={{
                      selected: selUnupVideo,
                      onToggle: makeToggle(setSelUnupVideo),
                      onToggleAll: makeToggleAll(setSelUnupVideo, videoUnup, (f) =>
                        isSelectable(f, uploadsMap.get(f.key)),
                      ),
                    }}
                  />
                </Stack>

                <Divider />

                <Stack gap="sm">
                  <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Title order={5}>アップロード済 ({videoUp.length})</Title>
                    <Group align="flex-end" wrap="wrap" gap="xs">
                      <Badge variant="light">
                        選択 {videoUpSelectedIds.length} 件
                      </Badge>
                      <Button
                        size="sm"
                        variant="light"
                        onClick={openRunBulkCreate}
                        disabled={
                          videoUpSelectedIds.length === 0 || !sessionId
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
                    files={videoUp}
                    hashing={scan.hashing}
                    checking={scan.checking}
                    uploads={uploadsMap}
                    selection={{
                      selected: selUpVideo,
                      onToggle: makeToggle(setSelUpVideo),
                      onToggleAll: makeToggleAll(setSelUpVideo, videoUp, (f) =>
                        isSelectable(f, uploadsMap.get(f.key)),
                      ),
                    }}
                    onPreviewVideo={setPreviewVideoId}
                  />
                </Stack>

                <Text size="xs" c="dimmed">
                  アップロード完了後は自動で再スキャンが走り、行はアップロード済セクションに移ります。
                </Text>
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="image" p="md">
              <Stack gap="lg">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Title order={5}>未アップロード ({imageUnup.length})</Title>
                    <Group align="flex-end" wrap="wrap" gap="xs">
                      <TeamRobotSelector
                        tournamentId={tournamentId}
                        teamId={teamId}
                        robotId={robotId}
                        onTeamChange={setTeamId}
                        onRobotChange={setRobotId}
                      />
                      <Badge variant="light">
                        選択 {imageUnupSelectedFiles.length} 件
                      </Badge>
                      <Button
                        size="sm"
                        onClick={startImageUpload}
                        disabled={
                          !robotId ||
                          !tournamentId ||
                          imageUnupSelectedFiles.length === 0
                        }
                      >
                        選択した画像をアップロード
                      </Button>
                    </Group>
                  </Group>
                  <FileTable
                    files={imageUnup}
                    hashing={scan.hashing}
                    checking={scan.checking}
                    imageUploads={imageUpload.items}
                    selection={{
                      selected: selUnupImage,
                      onToggle: makeToggle(setSelUnupImage),
                      onToggleAll: makeToggleAll(setSelUnupImage, imageUnup, (f) =>
                        isSelectable(f, undefined, imageUpload.items[f.key]),
                      ),
                    }}
                  />
                </Stack>

                <Divider />

                <Stack gap="sm">
                  <Group justify="space-between" align="flex-end" wrap="wrap">
                    <Title order={5}>アップロード済 ({imageUp.length})</Title>
                    <Group gap="xs">
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
                    files={imageUp}
                    hashing={scan.hashing}
                    checking={scan.checking}
                    imageUploads={imageUpload.items}
                    selection={{
                      selected: selUpImage,
                      onToggle: makeToggle(setSelUpImage),
                      onToggleAll: makeToggleAll(setSelUpImage, imageUp, (f) =>
                        isSelectable(f, undefined, imageUpload.items[f.key]),
                      ),
                    }}
                  />
                </Stack>

                <Text size="xs" c="dimmed">
                  HEIC は JPEG に自動変換されます。アップロード完了後は自動で再スキャンします。
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
