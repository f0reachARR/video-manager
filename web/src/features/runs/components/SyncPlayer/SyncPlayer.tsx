import {
  Alert,
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
import { useQueryClient } from "@tanstack/react-query";

import type { Marker, Run, User } from "../../../../lib/api/client";
import { useTopicSubscription } from "../../../../lib/realtime";
import { useCurrentUserId } from "../../../../stores/currentUser";
import { useUsers } from "../../../users/api/queries";
import {
  AnnotationToolbar,
} from "../../../annotations/components/AnnotationToolbar";
import type { OverlayMode } from "../../../annotations/components/RunVideoOverlay";
import { formatTime } from "../../lib/format";
import {
  angleDuration,
  isAngleInRange,
  runTimeToVideoTime,
} from "../../lib/timeMap";
import {
  usePresence,
  type LocalPresenceSnapshot,
  type RemoteFollowTick,
} from "../../hooks/usePresence";
import { AngleVideo, type LoadedAngle } from "./AngleVideo";
import { MarkerStrip } from "./MarkerStrip";
import { PresenceStrip } from "./PresenceStrip";
import { SyncControls } from "./SyncControls";
import { usePlaybackUrls } from "./usePlaybackUrls";

// How far the followed presence can drift from us before we forcibly re-seek.
// Smaller than the WS tick latency on purpose — half a second of drift is
// already audibly out of sync.
const SYNC_DRIFT_THRESHOLD_SEC = 0.5;

// How far a <video>'s currentTime can drift from the wall-clock target before
// we snap it back. Larger than SYNC_DRIFT_THRESHOLD_SEC because the rAF tick
// only nudges every frame and steady-state drift of ~100ms is expected.
const VIDEO_DRIFT_SNAP_SEC = 0.25;

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
  const { urls, urlErrors } = usePlaybackUrls(videos);
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
  // Label / text content for the shape that's about to be created (used by
  // point as an optional label, by text as the required content).
  const [overlayLabel, setOverlayLabel] = useState("");

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
              Math.max(0, (v.runOffsetSec ?? 0) + angleDuration(v)),
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
        if (!isAngleInRange(v, newT)) {
          if (!el.paused) el.pause();
          continue;
        }
        const target = runTimeToVideoTime(v, newT);
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
      if (!isAngleInRange(v, newT)) {
        if (!el.paused) el.pause();
        continue;
      }
      el.currentTime = runTimeToVideoTime(v, newT);
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
      if (!isAngleInRange(v, t)) continue;
      el.currentTime = runTimeToVideoTime(v, t);
    }
    await Promise.all(
      videos.map(async (v) => {
        const el = refs.current.get(v.id);
        if (!el) return;
        if (!isAngleInRange(v, t)) return;
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
    .map((rv) => {
      const source = urls.get(rv.videoId);
      return source ? { rv, source } : null;
    })
    .filter((a): a is LoadedAngle => a !== null);

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
              overlayLabel={overlayLabel}
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
        <AnnotationToolbar
          mode={overlayMode}
          onModeChange={setOverlayMode}
          label={overlayLabel}
          onLabelChange={setOverlayLabel}
        />
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
          <MarkerStrip markers={markers} durationSec={runDurationSec} />
          <PresenceStrip
            presences={presence.presences}
            usersById={usersById}
            durationSec={runDurationSec}
            followTarget={presence.followTarget}
            onToggleFollow={(id) => presence.followIndividual(id)}
          />
        </div>
      </Group>
    </Stack>
  );
}
