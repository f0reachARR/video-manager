import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Chip,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  type Marker,
  type MarkerCategory,
  type Run,
  type RunVideo,
  videosApi,
} from "../../lib/api/client";
import {
  markerCategories,
  useAddRunVideo,
  useCreateMarker,
  useDeleteMarker,
  useMarkers,
  useRemoveRunVideo,
  useRobots,
  useRun,
  useScenarios,
  useUpdateMarker,
  useUpdateRun,
  useUpdateRunVideo,
  useVideos,
} from "../../lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTopicSubscription,
  useWebSocketPublisher,
} from "../../lib/realtime";
import {
  RunVideoOverlay,
  type OverlayMode,
} from "../../components/RunVideoOverlay";

// Random per-tab id so we can distinguish our own playback.sync echoes from
// other viewers' messages.
const SENDER_ID = `v_${Math.random().toString(36).slice(2, 10)}`;

type PlaybackSyncMsg = {
  type: "playback.sync";
  senderId: string;
  tSec: number;
  playing: boolean;
  ts: number;
};

export const Route = createFileRoute("/runs/$runId")({
  component: RunDetailPage,
});

function RunDetailPage() {
  const { runId } = Route.useParams();
  const run = useRun(runId);
  const updateRun = useUpdateRun();
  const robots = useRobots();
  const scenarios = useScenarios();
  const allMarkers = useMarkers(runId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Subscribe to the Run's realtime topic. Marker events refetch the markers
  // query; non-marker events (e.g. playback.sync from SyncPlayer) are ignored
  // here. Reconnects also refetch.
  useTopicSubscription(
    `/ws/run/${runId}`,
    (msg) => {
      const m = msg as { type?: string };
      if (typeof m.type === "string" && m.type.startsWith("marker.")) {
        qc.invalidateQueries({ queryKey: ["markers", runId] });
      }
    },
    () => qc.invalidateQueries({ queryKey: ["markers", runId] }),
  );
  const [addVideoOpen, { open: openAddVideo, close: closeAddVideo }] =
    useDisclosure(false);
  const [t, setT] = useState(0);
  const [runDurationSec, setRunDurationSec] = useState(0);
  const seekRef = useRef<(sec: number) => void>(() => {});

  if (run.isLoading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }
  if (run.error || !run.data) {
    return (
      <Alert color="red" m="md">
        {run.error instanceof ApiError
          ? run.error.body.message
          : (run.error as Error)?.message}
      </Alert>
    );
  }
  const r = run.data;

  return (
    <Stack maw={1280} mx="auto">
      <Group justify="space-between">
        <Stack gap={4}>
          <Group gap="sm">
            <Button
              size="xs"
              variant="subtle"
              onClick={() => navigate({ to: "/runs" })}
            >
              ← Run 一覧
            </Button>
            <Title order={2}>Run 詳細</Title>
          </Group>
          <Text size="xs" c="dimmed" ff="monospace">
            {r.id}
          </Text>
        </Stack>
        <Button
          size="xs"
          variant="default"
          onClick={() => {
            const url = `${window.location.origin}/share/runs/${r.id}`;
            navigator.clipboard?.writeText(url).catch(() => {});
            window.open(url, "_blank");
          }}
        >
          🔗 共有リンクをコピー
        </Button>
      </Group>

      <SyncPlayer
        run={r}
        t={t}
        onTChange={setT}
        onDurationChange={setRunDurationSec}
        registerSeek={(fn) => {
          seekRef.current = fn;
        }}
        markers={allMarkers.data?.data ?? []}
      />

      <MarkersSection
        runId={r.id}
        currentSec={t}
        durationSec={runDurationSec}
        onSeek={(s) => seekRef.current(s)}
      />

      <Group justify="space-between" mt="lg">
        <Title order={4}>紐づけアングル ({(r.videos ?? []).length})</Title>
        <Button size="xs" onClick={openAddVideo}>
          ＋ アングルを追加
        </Button>
      </Group>
      <RunVideosTable run={r} />

      <Title order={4} mt="lg">
        メタデータ
      </Title>
      <RunMetadataEditor
        run={r}
        robotOptions={(robots.data?.data ?? []).map((x) => ({
          value: x.id,
          label: x.name,
        }))}
        scenarioOptions={(scenarios.data?.data ?? []).map((x) => ({
          value: x.id,
          label: x.name,
        }))}
        onSave={(body) => updateRun.mutate({ id: r.id, body })}
        saving={updateRun.isPending}
      />

      {addVideoOpen && <AddVideoModal run={r} onClose={closeAddVideo} />}
    </Stack>
  );
}

// ---------- Sync player ----------

type LoadedAngle = {
  rv: RunVideo;
  url: string;
};

function SyncPlayer({
  run,
  t,
  onTChange,
  onDurationChange,
  registerSeek,
  markers,
}: {
  run: Run;
  t: number;
  onTChange: (sec: number) => void;
  onDurationChange: (sec: number) => void;
  registerSeek: (fn: (sec: number) => void) => void;
  markers: Marker[];
}) {
  const videos = run.videos ?? [];
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [urlErrors, setUrlErrors] = useState<Map<string, string>>(new Map());
  const [mainAngleId, setMainAngleId] = useState<string | null>(null);
  const [runDurationSec, setRunDurationSec] = useState<number>(0);
  const setT = onTChange;
  const [playing, setPlaying] = useState(false);
  const refs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const animationRef = useRef<number | null>(null);
  const lastPlaybackTime = useRef<number>(0);
  const lastT = useRef<number>(0);

  // Overlay (Annotation 追加 / ライブインク) — applies to the main angle.
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("off");
  // Playback sync — independent from overlay mode. acceptSync controls whether
  // *incoming* sync events nudge our playback. We always broadcast.
  const [acceptSync, setAcceptSync] = useState(true);
  const [lastSyncSender, setLastSyncSender] = useState<string | null>(null);

  // Single bidirectional WS to /ws/run/{runId} for playback.sync messages.
  // (Marker realtime uses a separate read-only subscription at the page level.)
  const wsRef = useRef<{ playing: boolean; t: number }>({
    playing: false,
    t: 0,
  });
  wsRef.current = { playing, t };
  const publishPlayback = useWebSocketPublisher(`/ws/run/${run.id}`, (msg) => {
    const m = msg as Partial<PlaybackSyncMsg>;
    if (m.type !== "playback.sync" || m.senderId === SENDER_ID) return;
    if (!acceptSync) return;
    if (typeof m.tSec !== "number" || typeof m.playing !== "boolean") return;
    // Estimate one-way latency from sender's timestamp, then nudge if drift
    // > 0.5s. Don't fight the sender on every tick — only catch up when we
    // diverge meaningfully.
    const latency = Math.max(0, (Date.now() - (m.ts ?? Date.now())) / 1000);
    const targetT = m.tSec + (m.playing ? latency : 0);
    const drift = Math.abs(targetT - wsRef.current.t);
    setLastSyncSender(m.senderId ?? null);
    if (drift > 0.5) {
      // Don't re-broadcast a seek we just received — that would feedback-loop.
      seek(Math.min(runDurationSec, Math.max(0, targetT)), {
        broadcast: false,
      });
    }
    if (m.playing !== wsRef.current.playing) {
      // Defer to togglePlay so video elements get .play()/.pause() correctly.
      void applyExternalPlaying(m.playing);
    }
  });

  // Resolve playback URLs once per video id.
  useEffect(() => {
    let canceled = false;
    Promise.all(
      videos.map(async (v) => {
        if (urls.has(v.videoId)) return;
        try {
          const r = await videosApi.playbackUrl(v.videoId);
          if (canceled) return;
          setUrls((m) => new Map(m).set(v.videoId, r.url));
        } catch (e) {
          if (canceled) return;
          setUrlErrors((m) =>
            new Map(m).set(
              v.videoId,
              e instanceof ApiError ? e.body.message : String(e),
            ),
          );
        }
      }),
    );
    return () => {
      canceled = true;
    };
    // We intentionally key only on videos identity; urls map updates trigger React state and don't need to retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  // Run duration = max(videoOffsetEndSec - videoOffsetStartSec) across angles.
  useEffect(() => {
    if (videos.length === 0) {
      setRunDurationSec(0);
      onDurationChange(0);
      return;
    }
    const d = Math.max(
      ...videos.map((v) =>
        Math.max(0, v.videoOffsetEndSec - v.videoOffsetStartSec),
      ),
    );
    setRunDurationSec(d);
    onDurationChange(d);
  }, [videos, onDurationChange]);

  // Pick a default main angle.
  useEffect(() => {
    if (videos.length === 0) {
      setMainAngleId(null);
      return;
    }
    if (!mainAngleId || !videos.some((v) => v.id === mainAngleId)) {
      setMainAngleId(videos[0].id);
    }
  }, [videos, mainAngleId]);

  // rAF loop drives the shared timeline from the main video's currentTime.
  useEffect(() => {
    if (!playing) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    const tick = (now: number) => {
      const mainEl = mainAngleId ? refs.current.get(mainAngleId) : null;
      if (mainEl) {
        const mainV = videos.find((v) => v.id === mainAngleId);
        if (mainV) {
          const newT = Math.min(
            runDurationSec,
            Math.max(0, mainEl.currentTime - mainV.videoOffsetStartSec),
          );
          // Only push when changed by >=50ms to avoid floods.
          if (Math.abs(newT - lastT.current) > 0.05) {
            lastT.current = newT;
            setT(newT);
            // Drive other angles
            for (const v of videos) {
              if (v.id === mainAngleId) continue;
              const el = refs.current.get(v.id);
              if (!el) continue;
              const target = v.videoOffsetStartSec + newT;
              if (Math.abs(el.currentTime - target) > 0.25) {
                el.currentTime = target;
              }
            }
            if (newT >= runDurationSec) {
              setPlaying(false);
              return;
            }
          }
        }
      }
      lastPlaybackTime.current = now;
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current !== null)
        cancelAnimationFrame(animationRef.current);
    };
  }, [playing, mainAngleId, runDurationSec, videos]);

  const seek = (newT: number, opts: { broadcast?: boolean } = {}) => {
    lastT.current = newT;
    setT(newT);
    for (const v of videos) {
      const el = refs.current.get(v.id);
      if (!el) continue;
      el.currentTime = v.videoOffsetStartSec + newT;
    }
    if (opts.broadcast !== false) {
      broadcastPlayback({ tSec: newT });
    }
  };

  useEffect(() => {
    registerSeek(seek);
    // seek closes over `videos`; re-register when angles change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, registerSeek]);

  const applyExternalPlaying = async (shouldPlay: boolean) => {
    if (shouldPlay === wsRef.current.playing) return;
    if (shouldPlay) {
      await Promise.all(
        videos.map(async (v) => {
          const el = refs.current.get(v.id);
          if (!el) return;
          try {
            await el.play();
          } catch {
            /* autoplay rejection */
          }
        }),
      );
      setPlaying(true);
    } else {
      for (const v of videos) refs.current.get(v.id)?.pause();
      setPlaying(false);
    }
  };

  const broadcastPlayback = (override?: {
    tSec?: number;
    playing?: boolean;
  }) => {
    publishPlayback({
      type: "playback.sync",
      senderId: SENDER_ID,
      tSec: override?.tSec ?? wsRef.current.t,
      playing: override?.playing ?? wsRef.current.playing,
      ts: Date.now(),
    } satisfies PlaybackSyncMsg);
  };

  // Clear the "他の視聴者から同期中" hint after a moment of silence so the
  // badge reflects fresh activity, not stale state.
  useEffect(() => {
    if (!lastSyncSender) return;
    const id = setTimeout(() => setLastSyncSender(null), 2000);
    return () => clearTimeout(id);
  }, [lastSyncSender]);

  // Periodic broadcast while playing so late joiners catch up; on local seek /
  // play / pause we always send immediately.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => broadcastPlayback(), 500);
    return () => clearInterval(id);
    // broadcastPlayback closes over publishPlayback (stable) and reads via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const togglePlay = async () => {
    if (playing) {
      for (const v of videos) refs.current.get(v.id)?.pause();
      setPlaying(false);
      broadcastPlayback({ playing: false });
      return;
    }
    // Sync to current t and play together.
    for (const v of videos) {
      const el = refs.current.get(v.id);
      if (!el) continue;
      el.currentTime = v.videoOffsetStartSec + t;
    }
    await Promise.all(
      videos.map(async (v) => {
        const el = refs.current.get(v.id);
        if (!el) return;
        try {
          await el.play();
        } catch {
          // ignore autoplay errors
        }
      }),
    );
    setPlaying(true);
    broadcastPlayback({ playing: true });
  };

  if (videos.length === 0) {
    return (
      <Card withBorder>
        <Text c="dimmed" ta="center" py="xl">
          まだアングルが紐づいていません。
        </Text>
      </Card>
    );
  }

  const loaded: LoadedAngle[] = videos
    .map((rv) => ({ rv, url: urls.get(rv.videoId) ?? "" }))
    .filter((a) => a.url);

  const mainAngle = loaded.find((a) => a.rv.id === mainAngleId);
  const others = loaded.filter((a) => a.rv.id !== mainAngleId);

  return (
    <Stack>
      <Grid>
        <Grid.Col span={{ base: 12, md: others.length === 0 ? 12 : 9 }}>
          {mainAngle && (
            <AngleVideo
              angle={mainAngle}
              isMain
              overlayMode={overlayMode}
              registerRef={(el) => {
                if (el) refs.current.set(mainAngle.rv.id, el);
                else refs.current.delete(mainAngle.rv.id);
              }}
            />
          )}
        </Grid.Col>
        {others.length > 0 && (
          <Grid.Col span={{ base: 12, md: 3 }}>
            <SimpleGrid cols={{ base: 2, md: 1 }} spacing="xs">
              {others.map((angle) => (
                <AngleVideo
                  key={angle.rv.id}
                  angle={angle}
                  overlayMode="off"
                  onSelectMain={() => setMainAngleId(angle.rv.id)}
                  registerRef={(el) => {
                    if (el) refs.current.set(angle.rv.id, el);
                    else refs.current.delete(angle.rv.id);
                  }}
                />
              ))}
            </SimpleGrid>
          </Grid.Col>
        )}
      </Grid>

      {urlErrors.size > 0 && (
        <Alert color="orange" title="一部の動画の URL 取得に失敗">
          <Stack gap={2}>
            {[...urlErrors.entries()].map(([k, v]) => (
              <Text key={k} size="xs">
                {k}: {v}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}

      <Group gap="xs" wrap="wrap">
        <Button
          size="xs"
          variant={overlayMode === "addPoint" ? "filled" : "default"}
          color={overlayMode === "addPoint" ? "teal" : undefined}
          onClick={() =>
            setOverlayMode((m) => (m === "addPoint" ? "off" : "addPoint"))
          }
        >
          {overlayMode === "addPoint"
            ? "クリックして配置..."
            : "📍 Annotation を追加"}
        </Button>
        <Button
          size="xs"
          variant={overlayMode === "liveInk" ? "filled" : "default"}
          color={overlayMode === "liveInk" ? "grape" : undefined}
          onClick={() =>
            setOverlayMode((m) => (m === "liveInk" ? "off" : "liveInk"))
          }
        >
          {overlayMode === "liveInk" ? "ライブインク中" : "✏️ ライブインク"}
        </Button>
        <Chip
          checked={acceptSync}
          onChange={setAcceptSync}
          variant="light"
          color="blue"
          size="xs"
        >
          再生位置を同期 (受信)
        </Chip>
        {lastSyncSender && acceptSync && (
          <Badge size="xs" color="blue" variant="dot">
            他の視聴者から同期中
          </Badge>
        )}
      </Group>

      <Group>
        <Button
          onClick={togglePlay}
          size="sm"
          variant={playing ? "outline" : "filled"}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </Button>
        <Text size="sm" ff="monospace" w={120}>
          {formatTime(t)} / {formatTime(runDurationSec)}
        </Text>
        <div style={{ flex: 1, position: "relative" }}>
          <Slider
            value={t}
            min={0}
            max={runDurationSec || 1}
            step={0.1}
            onChange={seek}
            label={(v) => formatTime(v)}
          />
          {/* Marker overlay — pointer-events:none so the slider stays draggable. */}
          {runDurationSec > 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
              }}
            >
              {markers.map((m) => {
                const pct = Math.max(
                  0,
                  Math.min(100, (m.runOffsetSec / runDurationSec) * 100),
                );
                return (
                  <div
                    key={m.id}
                    title={`${formatTime(m.runOffsetSec)} ${m.category}${m.label ? ` — ${m.label}` : ""}`}
                    style={{
                      position: "absolute",
                      left: `${pct}%`,
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      width: 4,
                      height: 18,
                      background: `var(--mantine-color-${markerCategoryColor[m.category]}-6)`,
                      borderRadius: 2,
                      boxShadow: "0 0 0 1px rgba(255,255,255,0.6)",
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </Group>
    </Stack>
  );
}

function AngleVideo({
  angle,
  isMain,
  onSelectMain,
  registerRef,
  overlayMode,
}: {
  angle: LoadedAngle;
  isMain?: boolean;
  onSelectMain?: () => void;
  registerRef: (el: HTMLVideoElement | null) => void;
  overlayMode: OverlayMode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const setVideoEl = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    registerRef(el);
  };

  return (
    <Card withBorder p="xs">
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" fw={500} truncate>
            {angle.rv.angleLabel || "(無名アングル)"}
          </Text>
          <Group gap={4}>
            {isMain && (
              <Badge size="xs" variant="filled">
                Main
              </Badge>
            )}
            {!isMain && onSelectMain && (
              <Button size="compact-xs" variant="subtle" onClick={onSelectMain}>
                Main にする
              </Button>
            )}
          </Group>
        </Group>
        <div
          ref={containerRef}
          style={{
            position: "relative",
            // Live ink mode hides the native controls to free up pointer space.
            touchAction:
              isMain && overlayMode === "liveInk" ? "none" : undefined,
          }}
        >
          <video
            ref={setVideoEl}
            src={angle.url}
            muted={!isMain}
            playsInline
            style={{
              width: "100%",
              maxHeight: isMain ? "60vh" : "150px",
              background: "#000",
              display: "block",
            }}
          >
            <track kind="captions" />
          </video>
          <RunVideoOverlay
            videoId={angle.rv.videoId}
            videoRef={videoRef}
            containerRef={containerRef}
            mode={isMain ? overlayMode : "off"}
            canEdit={!!isMain}
          />
        </div>
      </Stack>
    </Card>
  );
}

function formatTime(sec: number): string {
  if (!isFinite(sec)) return "0:00.0";
  const total = Math.max(0, sec);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

// ---------- Markers ----------

const markerCategoryColor: Record<MarkerCategory, string> = {
  success: "teal",
  failure: "red",
  note: "blue",
};

const markerCategoryLabel: Record<MarkerCategory, string> = {
  success: "成功",
  failure: "失敗",
  note: "メモ",
};

function MarkersSection({
  runId,
  currentSec,
  durationSec,
  onSeek,
}: {
  runId: string;
  currentSec: number;
  durationSec: number;
  onSeek: (sec: number) => void;
}) {
  const [filter, setFilter] = useState<MarkerCategory[]>([]);
  const list = useMarkers(runId, filter.length > 0 ? { category: filter } : {});
  const createMarker = useCreateMarker(runId);
  const updateMarker = useUpdateMarker(runId);
  const deleteMarker = useDeleteMarker(runId);

  // Local state for the add form.
  const [addOpen, { open: openAdd, close: closeAdd }] = useDisclosure(false);
  const [editing, setEditing] = useState<Marker | null>(null);

  const quickAdd = (category: MarkerCategory) => {
    createMarker.mutate({
      runOffsetSec: Math.round(currentSec),
      label: "",
      category,
    });
  };

  const markers = list.data?.data ?? [];

  return (
    <Stack gap="xs">
      <Group justify="space-between" mt="md">
        <Title order={4}>Markers ({markers.length})</Title>
        <Group gap="xs">
          <Chip.Group
            multiple
            value={filter}
            onChange={(v) => setFilter(v as MarkerCategory[])}
          >
            <Group gap={4}>
              {markerCategories.map((c) => (
                <Chip
                  key={c}
                  value={c}
                  size="xs"
                  color={markerCategoryColor[c]}
                >
                  {markerCategoryLabel[c]}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <Button
            size="xs"
            variant="default"
            onClick={openAdd}
            disabled={durationSec === 0}
          >
            ＋ 詳細追加
          </Button>
        </Group>
      </Group>

      <Card withBorder p="sm">
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            現在時刻 {formatTime(currentSec)} に追加:
          </Text>
          <Group gap="xs">
            {markerCategories.map((c) => (
              <Button
                key={c}
                size="xs"
                variant="light"
                color={markerCategoryColor[c]}
                loading={createMarker.isPending}
                disabled={durationSec === 0}
                onClick={() => quickAdd(c)}
              >
                {markerCategoryLabel[c]}
              </Button>
            ))}
          </Group>
        </Stack>
      </Card>

      {durationSec > 0 && markers.length > 0 && (
        <Card withBorder p="xs">
          <div style={{ position: "relative", height: 24 }}>
            {markers.map((m) => {
              const pct = Math.max(
                0,
                Math.min(100, (m.runOffsetSec / durationSec) * 100),
              );
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => onSeek(m.runOffsetSec)}
                  title={`${formatTime(m.runOffsetSec)} ${markerCategoryLabel[m.category]}${m.label ? ` — ${m.label}` : ""}`}
                  style={{
                    position: "absolute",
                    left: `${pct}%`,
                    top: 0,
                    transform: "translateX(-50%)",
                    width: 8,
                    height: 24,
                    background: `var(--mantine-color-${markerCategoryColor[m.category]}-6)`,
                    border: 0,
                    borderRadius: 2,
                    cursor: "pointer",
                    padding: 0,
                  }}
                  aria-label={`marker at ${m.runOffsetSec}s`}
                />
              );
            })}
          </div>
        </Card>
      )}

      <Table striped withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: 80 }}>Time</Table.Th>
            <Table.Th style={{ width: 100 }}>Category</Table.Th>
            <Table.Th>Label</Table.Th>
            <Table.Th style={{ width: 110 }}></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {markers.map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => onSeek(m.runOffsetSec)}
                >
                  {formatTime(m.runOffsetSec)}
                </Button>
              </Table.Td>
              <Table.Td>
                <Badge color={markerCategoryColor[m.category]} variant="light">
                  {markerCategoryLabel[m.category]}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  {m.label || (
                    <Text component="span" c="dimmed" size="xs">
                      （無し）
                    </Text>
                  )}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={4} justify="flex-end">
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setEditing(m)}
                    aria-label="編集"
                  >
                    ✏️
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    loading={deleteMarker.isPending}
                    onClick={() => {
                      if (confirm("Marker を削除しますか？"))
                        deleteMarker.mutate(m.id);
                    }}
                    aria-label="削除"
                  >
                    🗑️
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {markers.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed" ta="center" py="md" size="sm">
                  Marker がありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      {addOpen && (
        <MarkerEditModal
          mode="create"
          initial={{
            runOffsetSec: Math.round(currentSec),
            label: "",
            category: "note",
          }}
          durationSec={durationSec}
          onClose={closeAdd}
          onSubmit={(body) => {
            createMarker.mutate(body, { onSuccess: closeAdd });
          }}
          saving={createMarker.isPending}
        />
      )}

      {editing && (
        <MarkerEditModal
          mode="edit"
          initial={{
            runOffsetSec: editing.runOffsetSec,
            label: editing.label,
            category: editing.category,
          }}
          durationSec={durationSec}
          onClose={() => setEditing(null)}
          onSubmit={(body) =>
            updateMarker.mutate(
              { id: editing.id, body },
              { onSuccess: () => setEditing(null) },
            )
          }
          saving={updateMarker.isPending}
        />
      )}
    </Stack>
  );
}

function MarkerEditModal({
  mode,
  initial,
  durationSec,
  onClose,
  onSubmit,
  saving,
}: {
  mode: "create" | "edit";
  initial: { runOffsetSec: number; label: string; category: MarkerCategory };
  durationSec: number;
  onClose: () => void;
  onSubmit: (body: {
    runOffsetSec: number;
    label: string;
    category: MarkerCategory;
  }) => void;
  saving: boolean;
}) {
  const [offset, setOffset] = useState<number>(initial.runOffsetSec);
  const [label, setLabel] = useState<string>(initial.label);
  const [category, setCategory] = useState<MarkerCategory>(initial.category);
  return (
    <Modal
      opened
      onClose={onClose}
      title={mode === "create" ? "Marker 追加" : "Marker 編集"}
    >
      <Stack>
        <NumberInput
          label="位置 (秒、Run 開始から)"
          value={offset}
          min={0}
          max={durationSec > 0 ? durationSec : undefined}
          onChange={(v) => setOffset(typeof v === "number" ? v : 0)}
        />
        <Select
          label="Category"
          data={markerCategories.map((c) => ({
            value: c,
            label: markerCategoryLabel[c],
          }))}
          value={category}
          onChange={(v) => v && setCategory(v as MarkerCategory)}
        />
        <TextInput
          label="Label"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          placeholder="例: 脱輪 / 完璧"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            loading={saving}
            onClick={() =>
              onSubmit({
                runOffsetSec: Math.max(0, Math.round(offset)),
                label,
                category,
              })
            }
          >
            {mode === "create" ? "追加" : "保存"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ---------- Run videos table ----------

function RunVideosTable({ run }: { run: Run }) {
  const update = useUpdateRunVideo();
  const remove = useRemoveRunVideo();
  const list = run.videos ?? [];

  return (
    <Table striped withRowBorders={false}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Angle</Table.Th>
          <Table.Th>Video</Table.Th>
          <Table.Th>Start (sec)</Table.Th>
          <Table.Th>End (sec)</Table.Th>
          <Table.Th style={{ width: 80 }}></Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {list.map((rv) => (
          <Table.Tr key={rv.id}>
            <Table.Td>
              <TextInput
                size="xs"
                defaultValue={rv.angleLabel}
                onBlur={(e) => {
                  const value = e.currentTarget.value;
                  if (value !== rv.angleLabel) {
                    update.mutate({
                      runId: run.id,
                      runVideoId: rv.id,
                      body: { angleLabel: value },
                    });
                  }
                }}
              />
            </Table.Td>
            <Table.Td>
              <Text size="xs" ff="monospace" truncate maw={220}>
                {rv.videoId}
              </Text>
            </Table.Td>
            <Table.Td>
              <NumberInput
                size="xs"
                defaultValue={rv.videoOffsetStartSec}
                onBlur={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (Number.isFinite(v) && v !== rv.videoOffsetStartSec) {
                    update.mutate({
                      runId: run.id,
                      runVideoId: rv.id,
                      body: { videoOffsetStartSec: v },
                    });
                  }
                }}
              />
            </Table.Td>
            <Table.Td>
              <NumberInput
                size="xs"
                defaultValue={rv.videoOffsetEndSec}
                onBlur={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (Number.isFinite(v) && v !== rv.videoOffsetEndSec) {
                    update.mutate({
                      runId: run.id,
                      runVideoId: rv.id,
                      body: { videoOffsetEndSec: v },
                    });
                  }
                }}
              />
            </Table.Td>
            <Table.Td>
              <ActionIcon
                variant="subtle"
                color="red"
                loading={remove.isPending}
                onClick={() => {
                  if (confirm("Run からこのアングルを外しますか？")) {
                    remove.mutate({ runId: run.id, runVideoId: rv.id });
                  }
                }}
                aria-label="外す"
              >
                🗑️
              </ActionIcon>
            </Table.Td>
          </Table.Tr>
        ))}
        {list.length === 0 && (
          <Table.Tr>
            <Table.Td colSpan={5}>
              <Text c="dimmed" ta="center" py="md" size="sm">
                アングルがありません
              </Text>
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );
}

function AddVideoModal({ run, onClose }: { run: Run; onClose: () => void }) {
  const videos = useVideos({ sessionId: run.sessionId });
  const addRunVideo = useAddRunVideo();
  const [videoId, setVideoId] = useState<string | null>(null);
  const [startSec, setStartSec] = useState<number>(0);
  const [endSec, setEndSec] = useState<number>(0);
  const [angleLabel, setAngleLabel] = useState<string>("");

  const usedIds = useMemo(
    () => new Set((run.videos ?? []).map((rv) => rv.videoId)),
    [run.videos],
  );
  const options = (videos.data?.data ?? [])
    .filter((v) => !usedIds.has(v.id))
    .map((v) => ({
      value: v.id,
      label: `${v.storageKey.slice(0, 8)} (${v.durationSec ?? "?"}s)`,
    }));

  const submit = () => {
    if (!videoId) return;
    addRunVideo.mutate(
      {
        runId: run.id,
        body: {
          videoId,
          videoOffsetStartSec: startSec,
          videoOffsetEndSec: endSec,
          angleLabel,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal opened onClose={onClose} title="アングル動画を追加">
      <Stack>
        <Select
          label="Video"
          data={options}
          value={videoId}
          onChange={(v) => {
            setVideoId(v);
            if (v) {
              const target = (videos.data?.data ?? []).find((x) => x.id === v);
              if (target?.durationSec != null) setEndSec(target.durationSec);
            }
          }}
          searchable
          required
        />
        <Group grow>
          <NumberInput
            label="開始 (秒)"
            value={startSec}
            onChange={(v) => setStartSec(typeof v === "number" ? v : 0)}
          />
          <NumberInput
            label="終了 (秒)"
            value={endSec}
            onChange={(v) => setEndSec(typeof v === "number" ? v : 0)}
          />
        </Group>
        <TextInput
          label="Angle label"
          value={angleLabel}
          onChange={(e) => setAngleLabel(e.currentTarget.value)}
          placeholder="例: 正面 / コート横"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            disabled={!videoId}
            loading={addRunVideo.isPending}
          >
            追加
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ---------- Metadata editor ----------

function RunMetadataEditor({
  run,
  robotOptions,
  scenarioOptions,
  onSave,
  saving,
}: {
  run: Run;
  robotOptions: { value: string; label: string }[];
  scenarioOptions: { value: string; label: string }[];
  onSave: (body: {
    robotId?: string;
    scenarioId?: string;
    score?: number | null;
    memo?: string;
  }) => void;
  saving: boolean;
}) {
  const [robotId, setRobotId] = useState<string>(run.robotId);
  const [scenarioId, setScenarioId] = useState<string>(run.scenarioId);
  const [score, setScore] = useState<number | "">(run.score ?? "");
  const [memo, setMemo] = useState<string>(run.memo);
  const dirty =
    robotId !== run.robotId ||
    scenarioId !== run.scenarioId ||
    (score === "" ? null : score) !== (run.score ?? null) ||
    memo !== run.memo;

  return (
    <Stack>
      <Group grow>
        <Select
          label="Robot"
          data={robotOptions}
          value={robotId}
          onChange={(v) => v && setRobotId(v)}
        />
        <Select
          label="Scenario"
          data={scenarioOptions}
          value={scenarioId}
          onChange={(v) => v && setScenarioId(v)}
        />
      </Group>
      <NumberInput
        label="Score"
        value={score}
        onChange={(v) => setScore(typeof v === "number" ? v : "")}
        allowDecimal
      />
      <Textarea
        label="Memo"
        value={memo}
        onChange={(e) => setMemo(e.currentTarget.value)}
        autosize
        minRows={2}
      />
      <Group justify="flex-end">
        <Button
          disabled={!dirty}
          loading={saving}
          onClick={() =>
            onSave({
              robotId,
              scenarioId,
              score: score === "" ? null : score,
              memo,
            })
          }
        >
          保存
        </Button>
      </Group>
    </Stack>
  );
}
