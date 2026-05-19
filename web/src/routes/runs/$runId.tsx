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
  type User,
  videosApi,
} from "../../lib/api/client";
import {
  markerCategories,
  useAddRunVideo,
  useCreateMarker,
  useDeleteMarker,
  useMarkers,
  useRecommendedRunVideos,
  useRemoveRunVideo,
  useRobots,
  useRun,
  useScenarios,
  useUpdateMarker,
  useUpdateRun,
  useUpdateRunVideo,
  useUsers,
  useVideos,
} from "../../lib/queries";
import { useCurrentUserId } from "../../lib/currentUser";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTopicSubscription,
  useWebSocketPublisher,
} from "../../lib/realtime";
import {
  RunVideoOverlay,
  type OverlayMode,
} from "../../components/RunVideoOverlay";

// Random per-tab id — distinguishes our own presence echoes from other viewers'.
const SENDER_ID = `v_${Math.random().toString(36).slice(2, 10)}`;

// Per-Run presence wire format. Each viewer emits ticks every 500ms; receivers
// build a Map<senderId, Presence> from them. Stale entries (>3s) are pruned.
type PresenceTick = {
  type: "presence.tick";
  senderId: string;
  userId: string | null;
  tSec: number;
  playing: boolean;
  isBroadcaster: boolean;
  // RunVideo.id of the angle the sender is currently viewing as "main".
  // Followers switch their own main angle to match.
  mainAngleId: string | null;
  ts: number;
};

type Presence = {
  senderId: string;
  userId: string | null;
  tSec: number;
  playing: boolean;
  isBroadcaster: boolean;
  mainAngleId: string | null;
  ts: number;
  lastSeen: number;
};

const PRESENCE_TICK_MS = 500;
const PRESENCE_STALE_MS = 3000;

// Deterministic fallback color when a presence has no associated user (or the
// user has no `color` field set).
function senderColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(h) % 360} 70% 50%)`;
}

function presenceColor(p: { userId: string | null; senderId: string }, users: Map<string, User>): string {
  if (p.userId) {
    const u = users.get(p.userId);
    if (u?.color) return u.color;
  }
  return senderColor(p.senderId);
}

function presenceLabel(p: { userId: string | null; senderId: string }, users: Map<string, User>): string {
  if (p.userId) {
    const u = users.get(p.userId);
    if (u?.name) return u.name;
  }
  return `匿名 (${p.senderId.slice(-4)})`;
}

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

      <RecommendedVideos run={r} />

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

  // Presence + follow state. Each viewer emits a `presence.tick` every
  // PRESENCE_TICK_MS. `presences` is the map of *other* viewers we've seen
  // recently. `myBroadcasting` is whether we've claimed the "follow me" slot.
  // `followTarget` is the senderId we're tracking (null = independent).
  const currentUserId = useCurrentUserId();
  const usersQ = useUsers();
  const usersById = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of usersQ.data?.data ?? []) m.set(u.id, u);
    return m;
  }, [usersQ.data]);

  const [presences, setPresences] = useState<Map<string, Presence>>(new Map());
  const [myBroadcasting, setMyBroadcasting] = useState(false);
  const [followTarget, setFollowTarget] = useState<string | null>(null);
  // "broadcaster" means the follow was auto-set because someone else claimed
  // the slot; we should auto-release when they release. "individual" means the
  // viewer explicitly chose to track this person; it sticks until cleared.
  const followModeRef = useRef<"broadcaster" | "individual" | null>(null);

  // Refs mirror React state so the long-lived WS handler closure can read
  // current values without re-subscribing.
  const myBroadcastingRef = useRef(false);
  myBroadcastingRef.current = myBroadcasting;
  const followTargetRef = useRef<string | null>(null);
  followTargetRef.current = followTarget;
  const playingRef = useRef(false);
  playingRef.current = playing;
  const lastTRef = lastT; // already a ref
  const runDurationRef = useRef(0);
  runDurationRef.current = runDurationSec;
  const mainAngleIdRef = useRef<string | null>(null);
  mainAngleIdRef.current = mainAngleId;

  // Tracks who is currently broadcasting so we can detect "new claim" vs
  // "continuing" ticks. Updated from the WS handler.
  const broadcasterRef = useRef<string | null>(null);

  const publishPresence = useWebSocketPublisher(`/ws/run/${run.id}`, (msg) => {
    const m = msg as Partial<PresenceTick> & { type?: string };
    if (m.type !== "presence.tick") return;
    if (typeof m.senderId !== "string" || m.senderId === SENDER_ID) return;
    if (typeof m.tSec !== "number" || typeof m.playing !== "boolean") return;
    const tick: Presence = {
      senderId: m.senderId,
      userId: m.userId ?? null,
      tSec: m.tSec,
      playing: m.playing,
      isBroadcaster: !!m.isBroadcaster,
      mainAngleId: typeof m.mainAngleId === "string" ? m.mainAngleId : null,
      ts: typeof m.ts === "number" ? m.ts : Date.now(),
      lastSeen: Date.now(),
    };
    setPresences((prev) => {
      const next = new Map(prev);
      next.set(tick.senderId, tick);
      return next;
    });

    // Broadcaster transitions (new claim / release).
    if (tick.isBroadcaster) {
      if (broadcasterRef.current !== tick.senderId) {
        // Someone (else) just claimed the slot.
        broadcasterRef.current = tick.senderId;
        // Yield if we were claiming too — last-write-wins.
        if (myBroadcastingRef.current) setMyBroadcasting(false);
        // Auto-follow the new broadcaster.
        followModeRef.current = "broadcaster";
        setFollowTarget(tick.senderId);
      }
    } else if (broadcasterRef.current === tick.senderId) {
      // The previous broadcaster has released.
      broadcasterRef.current = null;
      if (
        followModeRef.current === "broadcaster" &&
        followTargetRef.current === tick.senderId
      ) {
        followModeRef.current = null;
        setFollowTarget(null);
      }
    }

    // If we're following this sender, nudge our playback + main angle.
    if (followTargetRef.current === tick.senderId) {
      // Switch to whichever main angle the followed user is viewing (if we
      // also have it in our run.videos — RunVideo.id is shared across viewers).
      if (
        tick.mainAngleId &&
        tick.mainAngleId !== mainAngleIdRef.current &&
        videos.some((v) => v.id === tick.mainAngleId)
      ) {
        setMainAngleId(tick.mainAngleId);
      }
      const latency = Math.max(0, (Date.now() - tick.ts) / 1000);
      const targetT = tick.tSec + (tick.playing ? latency : 0);
      const drift = Math.abs(targetT - lastTRef.current);
      if (drift > 0.5) {
        seek(
          Math.min(runDurationRef.current, Math.max(0, targetT)),
          { broadcast: false },
        );
      }
      const mainEl = mainAngleIdRef.current
        ? refs.current.get(mainAngleIdRef.current)
        : null;
      const actuallyPlaying = mainEl ? !mainEl.paused : false;
      if (tick.playing !== actuallyPlaying) {
        void applyExternalPlaying(tick.playing);
      }
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

  // Run timeline length is now an editable field on the Run itself. If the
  // value is 0 (legacy / unset), fall back to "max(angle length)" so existing
  // Runs still play before the user picks a duration.
  useEffect(() => {
    const fromRun = Math.max(0, run.durationSec ?? 0);
    const fromVideos =
      videos.length === 0
        ? 0
        : Math.max(
            ...videos.map((v) =>
              Math.max(0, (v.runOffsetSec ?? 0) + (v.videoOffsetEndSec - v.videoOffsetStartSec)),
            ),
          );
    const d = fromRun > 0 ? fromRun : fromVideos;
    setRunDurationSec(d);
    onDurationChange(d);
  }, [run.durationSec, videos, onDurationChange]);

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
          // Run timeline t = main video's currentTime mapped back through this
          // angle's videoOffsetStartSec + its runOffsetSec.
          const newT = Math.min(
            runDurationSec,
            Math.max(
              0,
              mainEl.currentTime - mainV.videoOffsetStartSec + (mainV.runOffsetSec ?? 0),
            ),
          );
          // Only push when changed by >=50ms to avoid floods.
          if (Math.abs(newT - lastT.current) > 0.05) {
            lastT.current = newT;
            setT(newT);
            // Drive other angles. Each angle's source time is
            //   videoOffsetStartSec + (runT - runOffsetSec)
            // and is only valid when runT is within [runOffset, runOffset+len].
            for (const v of videos) {
              if (v.id === mainAngleId) continue;
              const el = refs.current.get(v.id);
              if (!el) continue;
              const runOff = v.runOffsetSec ?? 0;
              const len = v.videoOffsetEndSec - v.videoOffsetStartSec;
              if (newT < runOff || newT > runOff + len) {
                if (!el.paused) el.pause();
                continue;
              }
              const target = v.videoOffsetStartSec + (newT - runOff);
              if (Math.abs(el.currentTime - target) > 0.25) {
                el.currentTime = target;
              }
              // If main is playing and we're back in range, resume.
              if (el.paused) void el.play().catch(() => {});
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
      const runOff = v.runOffsetSec ?? 0;
      const len = v.videoOffsetEndSec - v.videoOffsetStartSec;
      if (newT < runOff || newT > runOff + len) {
        if (!el.paused) el.pause();
        continue;
      }
      el.currentTime = v.videoOffsetStartSec + (newT - runOff);
    }
    if (opts.broadcast !== false) {
      broadcastPresence();
    }
  };

  useEffect(() => {
    registerSeek(seek);
    // seek closes over `videos`; re-register when angles change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, registerSeek]);

  const applyExternalPlaying = async (shouldPlay: boolean) => {
    if (shouldPlay) {
      // play() is a no-op for an already-playing element, so it's safe to
      // call repeatedly. Track per-video success — if every play() got
      // rejected (autoplay blocked), leave React `playing` false so the next
      // incoming sync ping will retry.
      const results = await Promise.allSettled(
        videos.map(async (v) => {
          const el = refs.current.get(v.id);
          if (!el) throw new Error("video element not mounted");
          await el.play();
        }),
      );
      const anyOk = results.some((r) => r.status === "fulfilled");
      if (anyOk) setPlaying(true);
    } else {
      for (const v of videos) refs.current.get(v.id)?.pause();
      setPlaying(false);
    }
  };

  const broadcastPresence = () => {
    publishPresence({
      type: "presence.tick",
      senderId: SENDER_ID,
      userId: currentUserId,
      tSec: lastTRef.current,
      playing: playingRef.current,
      isBroadcaster: myBroadcastingRef.current,
      mainAngleId: mainAngleIdRef.current,
      ts: Date.now(),
    } satisfies PresenceTick);
  };

  // Periodic presence emission — always on, not just while playing, so other
  // viewers know our position when paused too.
  useEffect(() => {
    const id = setInterval(() => broadcastPresence(), PRESENCE_TICK_MS);
    return () => clearInterval(id);
    // broadcastPresence reads via refs and publishPresence is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Emit immediately when our Main angle changes so followers switch with us
  // instead of waiting for the next periodic tick.
  useEffect(() => {
    broadcastPresence();
    // broadcastPresence reads via refs and publishPresence is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainAngleId]);

  // Prune stale presence entries; clear follow if the followed user vanished.
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - PRESENCE_STALE_MS;
      setPresences((prev) => {
        let dirty = false;
        const next = new Map(prev);
        for (const [k, v] of next) {
          if (v.lastSeen < cutoff) {
            next.delete(k);
            dirty = true;
          }
        }
        return dirty ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // If the user we were following disappeared from `presences`, drop follow.
  useEffect(() => {
    if (!followTarget) return;
    if (!presences.has(followTarget)) {
      followModeRef.current = null;
      setFollowTarget(null);
      if (broadcasterRef.current === followTarget) {
        broadcasterRef.current = null;
      }
    }
  }, [followTarget, presences]);

  const togglePlay = async () => {
    if (playing) {
      for (const v of videos) refs.current.get(v.id)?.pause();
      setPlaying(false);
      // Local play state has changed; emit immediately so other viewers see it.
      playingRef.current = false;
      broadcastPresence();
      return;
    }
    // Sync each angle to (t - runOffset). Angles outside their coverage stay
    // paused; the rAF loop resumes them when t enters their range.
    for (const v of videos) {
      const el = refs.current.get(v.id);
      if (!el) continue;
      const runOff = v.runOffsetSec ?? 0;
      const len = v.videoOffsetEndSec - v.videoOffsetStartSec;
      if (t < runOff || t > runOff + len) continue;
      el.currentTime = v.videoOffsetStartSec + (t - runOff);
    }
    await Promise.all(
      videos.map(async (v) => {
        const el = refs.current.get(v.id);
        if (!el) return;
        const runOff = v.runOffsetSec ?? 0;
        const len = v.videoOffsetEndSec - v.videoOffsetStartSec;
        if (t < runOff || t > runOff + len) return;
        try {
          await el.play();
        } catch {
          // ignore autoplay errors
        }
      }),
    );
    setPlaying(true);
    playingRef.current = true;
    broadcastPresence();
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
              runT={t}
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
                  runT={t}
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
        <SyncControls
          presences={presences}
          usersById={usersById}
          myBroadcasting={myBroadcasting}
          followTarget={followTarget}
          onToggleBroadcast={() => {
            setMyBroadcasting((cur) => {
              const next = !cur;
              myBroadcastingRef.current = next;
              if (next) {
                // We're claiming the slot — drop any prior follow target.
                followModeRef.current = null;
                setFollowTarget(null);
                broadcasterRef.current = SENDER_ID;
              } else if (broadcasterRef.current === SENDER_ID) {
                broadcasterRef.current = null;
              }
              // Send immediately so other viewers see the new state.
              broadcastPresence();
              return next;
            });
          }}
          onUnfollow={() => {
            followModeRef.current = null;
            setFollowTarget(null);
          }}
        />
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
          {/* Presence dots — each other viewer's playback position. Click to follow. */}
          {runDurationSec > 0 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: -18,
                height: 16,
              }}
            >
              {[...presences.values()].map((p) => {
                const pct = Math.max(
                  0,
                  Math.min(100, (p.tSec / runDurationSec) * 100),
                );
                const color = presenceColor(p, usersById);
                const name = presenceLabel(p, usersById);
                const isFollowed = followTarget === p.senderId;
                return (
                  <button
                    type="button"
                    key={p.senderId}
                    onClick={() => {
                      if (isFollowed) {
                        followModeRef.current = null;
                        setFollowTarget(null);
                      } else {
                        followModeRef.current = "individual";
                        setFollowTarget(p.senderId);
                      }
                    }}
                    title={`${name} — ${formatTime(p.tSec)}${p.isBroadcaster ? " (全員に追従させ中)" : ""}${isFollowed ? "（追従中。クリックで解除）" : "（クリックで追従）"}`}
                    style={{
                      position: "absolute",
                      left: `${pct}%`,
                      top: 0,
                      transform: "translateX(-50%)",
                      width: p.isBroadcaster ? 16 : 12,
                      height: p.isBroadcaster ? 16 : 12,
                      borderRadius: "50%",
                      background: color,
                      border: isFollowed
                        ? "2px solid #fff"
                        : p.isBroadcaster
                          ? "2px solid #fff"
                          : "1px solid rgba(255,255,255,0.7)",
                      boxShadow: p.isBroadcaster
                        ? `0 0 0 2px ${color}`
                        : "0 0 0 1px rgba(0,0,0,0.3)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    aria-label={`follow ${name}`}
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

function SyncControls({
  presences,
  usersById,
  myBroadcasting,
  followTarget,
  onToggleBroadcast,
  onUnfollow,
}: {
  presences: Map<string, Presence>;
  usersById: Map<string, User>;
  myBroadcasting: boolean;
  followTarget: string | null;
  onToggleBroadcast: () => void;
  onUnfollow: () => void;
}) {
  // The "current broadcaster" is whoever among visible presences has
  // isBroadcaster=true. If nobody, the slot is free.
  const currentBroadcaster = useMemo(() => {
    for (const p of presences.values()) {
      if (p.isBroadcaster) return p;
    }
    return null;
  }, [presences]);

  const someoneElseBroadcasting =
    currentBroadcaster !== null && !myBroadcasting;
  const followedPresence = followTarget ? presences.get(followTarget) : null;

  return (
    <>
      <Button
        size="xs"
        variant={myBroadcasting ? "filled" : "default"}
        color={myBroadcasting ? "blue" : undefined}
        onClick={onToggleBroadcast}
      >
        {myBroadcasting
          ? "🛰 自分に追従中 (停止)"
          : someoneElseBroadcasting
            ? "🛰 自分に追従させる (奪う)"
            : "🛰 全員に追従させる"}
      </Button>
      {someoneElseBroadcasting && currentBroadcaster && (
        <Badge
          size="xs"
          color="blue"
          variant="dot"
          style={{
            background: presenceColor(currentBroadcaster, usersById),
            color: "#fff",
          }}
        >
          {presenceLabel(currentBroadcaster, usersById)} に全員追従中
        </Badge>
      )}
      {followedPresence && !myBroadcasting && (
        <Badge
          size="xs"
          color="cyan"
          variant="light"
          rightSection={
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={onUnfollow}
              style={{ marginLeft: 4 }}
            >
              ×
            </Button>
          }
        >
          {presenceLabel(followedPresence, usersById)} を追従中
        </Badge>
      )}
    </>
  );
}

function AngleVideo({
  angle,
  isMain,
  onSelectMain,
  registerRef,
  overlayMode,
  runT,
}: {
  angle: LoadedAngle;
  isMain?: boolean;
  onSelectMain?: () => void;
  registerRef: (el: HTMLVideoElement | null) => void;
  overlayMode: OverlayMode;
  runT: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const setVideoEl = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    registerRef(el);
  };

  // This angle covers run time [runOffset, runOffset + (end-start)]. Outside
  // that window the source video has no content for the Run, so we cover the
  // player with a NO VIDEO placeholder instead of showing a frozen / wrong
  // frame. The "before" gap appears when runOffsetSec > 0; the "after" gap
  // appears when the angle's length is less than the Run's duration.
  const runOff = angle.rv.runOffsetSec ?? 0;
  const angleDur = Math.max(
    0,
    angle.rv.videoOffsetEndSec - angle.rv.videoOffsetStartSec,
  );
  const outOfRange = runT < runOff || runT > runOff + angleDur;

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
              visibility: outOfRange ? "hidden" : undefined,
            }}
          >
            <track kind="captions" />
          </video>
          {outOfRange && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "#000",
                color: "#aaa",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "monospace",
                fontSize: isMain ? 20 : 11,
                letterSpacing: 2,
                pointerEvents: "none",
              }}
            >
              NO VIDEO
            </div>
          )}
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
          <Table.Th>Run Offset (sec)</Table.Th>
          <Table.Th>Video Start (sec)</Table.Th>
          <Table.Th>Video End (sec)</Table.Th>
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
                defaultValue={rv.runOffsetSec ?? 0}
                min={0}
                onBlur={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (Number.isFinite(v) && v !== (rv.runOffsetSec ?? 0)) {
                    update.mutate({
                      runId: run.id,
                      runVideoId: rv.id,
                      body: { runOffsetSec: Math.max(0, v) },
                    });
                  }
                }}
              />
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
            <Table.Td colSpan={6}>
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
          runOffsetSec: 0,
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

// ---------- Recommended videos ----------

function RecommendedVideos({ run }: { run: Run }) {
  const rec = useRecommendedRunVideos(run.id);
  const addRunVideo = useAddRunVideo();
  const items = rec.data?.data ?? [];
  if (items.length === 0) return null;

  return (
    <Stack gap="xs" mt="sm">
      <Title order={5} c="dimmed">
        🤖 同セッションで未紐付けの動画 ({items.length})
      </Title>
      <Group gap="xs" wrap="wrap">
        {items.map((v) => {
          const len = v.durationSec ?? 0;
          return (
            <Button
              key={v.id}
              size="xs"
              variant="default"
              loading={addRunVideo.isPending}
              onClick={() => {
                addRunVideo.mutate({
                  runId: run.id,
                  body: {
                    videoId: v.id,
                    videoOffsetStartSec: 0,
                    videoOffsetEndSec: Math.round(len),
                    runOffsetSec: 0,
                    angleLabel: "",
                  },
                });
              }}
            >
              ＋ {v.storageKey.slice(0, 12)} ({len}s)
            </Button>
          );
        })}
      </Group>
    </Stack>
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
    durationSec?: number;
    score?: number | null;
    memo?: string;
  }) => void;
  saving: boolean;
}) {
  const [robotId, setRobotId] = useState<string>(run.robotId);
  const [scenarioId, setScenarioId] = useState<string>(run.scenarioId);
  const [durationSec, setDurationSec] = useState<number | "">(
    run.durationSec ?? 0,
  );
  const [score, setScore] = useState<number | "">(run.score ?? "");
  const [memo, setMemo] = useState<string>(run.memo);
  const dirty =
    robotId !== run.robotId ||
    scenarioId !== run.scenarioId ||
    (durationSec === "" ? 0 : durationSec) !== (run.durationSec ?? 0) ||
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
      <Group grow>
        <NumberInput
          label="Duration (sec)"
          description="Run のタイムライン長"
          value={durationSec}
          min={0}
          onChange={(v) => setDurationSec(typeof v === "number" ? v : "")}
        />
        <NumberInput
          label="Score"
          value={score}
          onChange={(v) => setScore(typeof v === "number" ? v : "")}
          allowDecimal
        />
      </Group>
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
              durationSec: Math.max(
                0,
                Math.round(typeof durationSec === "number" ? durationSec : 0),
              ),
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
