import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Slider,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  type Marker,
  type Run,
  type RunVideo,
  type User,
  videosApi,
} from "../../../lib/api/client";
import { useTopicSubscription } from "../../../lib/realtime";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserId } from "../../../stores/currentUser";
import { useUsers } from "../../users/api/queries";
import {
  RunVideoOverlay,
  type OverlayMode,
} from "../../annotations/components/RunVideoOverlay";
import { markerCategoryColor } from "../../markers/lib/category";
import { formatTime } from "../lib/format";
import {
  presenceColor,
  presenceLabel,
  type Presence,
} from "../lib/presence";
import {
  usePresence,
  type LocalPresenceSnapshot,
  type RemoteFollowTick,
} from "../hooks/usePresence";

// How far the followed presence can drift from us before we forcibly re-seek.
// Smaller than the WS tick latency on purpose — half a second of drift is
// already audibly out of sync.
const SYNC_DRIFT_THRESHOLD_SEC = 0.5;

// How far a <video>'s currentTime can drift from the wall-clock target before
// we snap it back. Larger than SYNC_DRIFT_THRESHOLD_SEC because the rAF tick
// only nudges every frame and steady-state drift of ~100ms is expected.
const VIDEO_DRIFT_SNAP_SEC = 0.25;

type LoadedAngle = {
  rv: RunVideo;
  url: string;
};

export function SyncPlayer({
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

  const currentUserId = useCurrentUserId();
  const usersQ = useUsers();
  const usersById = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of usersQ.data?.data ?? []) m.set(u.id, u);
    return m;
  }, [usersQ.data]);

  // Refs mirror React state so callbacks closed over by presence can read
  // current values without re-binding.
  const playingRef = useRef(false);
  playingRef.current = playing;
  const runDurationRef = useRef(0);
  runDurationRef.current = runDurationSec;
  const mainAngleIdRef = useRef<string | null>(null);
  mainAngleIdRef.current = mainAngleId;

  const presence = usePresence({
    runId: run.id,
    getLocalSnapshot: () => ({
      userId: currentUserId,
      tSec: lastT.current,
      playing: playingRef.current,
      mainAngleId: mainAngleIdRef.current,
    } satisfies LocalPresenceSnapshot),
    onFollowTick: (tick: RemoteFollowTick) => {
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
      const drift = Math.abs(targetT - lastT.current);
      if (drift > SYNC_DRIFT_THRESHOLD_SEC) {
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
    },
  });

  // Subscribe to the Run's realtime topic. Marker events refetch the markers
  // query; presence ticks are handled by usePresence's publisher socket.
  const qc = useQueryClient();
  useTopicSubscription(
    `/ws/run/${run.id}`,
    (msg) => {
      const m = msg as { type?: string };
      if (typeof m.type === "string" && m.type.startsWith("marker.")) {
        qc.invalidateQueries({ queryKey: ["markers", run.id] });
      }
    },
    () => qc.invalidateQueries({ queryKey: ["markers", run.id] }),
  );

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
    // We intentionally key only on videos identity; urls map updates trigger
    // React state and don't need to retrigger this effect.
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
              Math.max(
                0,
                (v.runOffsetSec ?? 0) + (v.videoOffsetEndSec - v.videoOffsetStartSec),
              ),
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

  // Wall-clock anchor for the playhead. We DON'T derive `t` from the main
  // video's currentTime anymore because that breaks during gaps (no video
  // means nothing to drive the clock). Instead the rAF loop walks the clock
  // forward from a known (t, wall-time) anchor and steers each <video> to
  // match. togglePlay / seek reset the anchor.
  const playAnchorT = useRef(0);
  const playAnchorWall = useRef(0);

  // rAF loop drives the shared timeline from a wall clock anchor.
  useEffect(() => {
    if (!playing) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    const tick = (now: number) => {
      const elapsed = (now - playAnchorWall.current) / 1000;
      const newT = Math.min(
        runDurationSec,
        Math.max(0, playAnchorT.current + elapsed),
      );

      // Steer every video to (newT - runOffset). Out-of-range angles get
      // paused; the next tick that lands inside their window will re-play
      // them. Includes the main angle — the wall clock is the ground truth.
      for (const v of videos) {
        const el = refs.current.get(v.id);
        if (!el) continue;
        const runOff = v.runOffsetSec ?? 0;
        const len = v.videoOffsetEndSec - v.videoOffsetStartSec;
        if (newT < runOff || newT > runOff + len) {
          if (!el.paused) el.pause();
          continue;
        }
        const target = v.videoOffsetStartSec + (newT - runOff);
        if (Math.abs(el.currentTime - target) > VIDEO_DRIFT_SNAP_SEC) {
          el.currentTime = target;
        }
        if (el.paused) void el.play().catch(() => {});
      }

      if (Math.abs(newT - lastT.current) > 0.05) {
        lastT.current = newT;
        setT(newT);
      }
      if (newT >= runDurationSec) {
        setPlaying(false);
        return;
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
    // Reset the wall-clock anchor so the rAF tick keeps walking forward from
    // the new position rather than jumping back.
    playAnchorT.current = newT;
    playAnchorWall.current = performance.now();
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
      presence.broadcastNow();
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

  // Emit immediately when our Main angle changes so followers switch with us
  // instead of waiting for the next periodic tick.
  useEffect(() => {
    presence.broadcastNow();
    // broadcastNow reads everything via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainAngleId]);

  const togglePlay = async () => {
    if (playing) {
      for (const v of videos) refs.current.get(v.id)?.pause();
      setPlaying(false);
      // Local play state has changed; emit immediately so other viewers see it.
      playingRef.current = false;
      presence.broadcastNow();
      return;
    }
    // Anchor the wall clock to the current t. The rAF loop will then walk
    // forward from here even if no video is in range yet (pre-video gap).
    playAnchorT.current = t;
    playAnchorWall.current = performance.now();
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
    presence.broadcastNow();
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
          presences={presence.presences}
          usersById={usersById}
          myBroadcasting={presence.myBroadcasting}
          followTarget={presence.followTarget}
          onToggleBroadcast={() =>
            presence.setMyBroadcasting(!presence.myBroadcasting)
          }
          onUnfollow={() => presence.followIndividual(null)}
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
              {[...presence.presences.values()].map((p) => {
                const pct = Math.max(
                  0,
                  Math.min(100, (p.tSec / runDurationSec) * 100),
                );
                const color = presenceColor(p, usersById);
                const name = presenceLabel(p, usersById);
                const isFollowed = presence.followTarget === p.senderId;
                return (
                  <button
                    type="button"
                    key={p.senderId}
                    onClick={() => {
                      presence.followIndividual(isFollowed ? null : p.senderId);
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
