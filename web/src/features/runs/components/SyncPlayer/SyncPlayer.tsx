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
import { angleDuration } from "../../lib/timeMap";
import {
  usePresence,
  type LocalPresenceSnapshot,
  type RemoteFollowTick,
} from "../../hooks/usePresence";
import { AngleVideo, type LoadedAngle } from "./AngleVideo";
import { MarkerStrip } from "./MarkerStrip";
import { PresenceStrip } from "./PresenceStrip";
import { SyncControls } from "./SyncControls";
import { usePlaybackClock } from "./usePlaybackClock";
import { usePlaybackUrls } from "./usePlaybackUrls";

// How far the followed presence can drift from us before we forcibly re-seek.
// Smaller than the WS tick latency on purpose — half a second of drift is
// already audibly out of sync.
const SYNC_DRIFT_THRESHOLD_SEC = 0.5;

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
  const refs = useRef<Map<string, HTMLVideoElement>>(new Map());

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

  // Refs mirror state so callbacks closed over by presence can read current
  // values without re-binding.
  const runDurationRef = useRef(0);
  runDurationRef.current = runDurationSec;
  const mainAngleIdRef = useRef<string | null>(null);
  mainAngleIdRef.current = mainAngleId;

  // Owns the rAF clock, per-video element steering, and seek/togglePlay.
  // We pass a no-op for onAfterUserChange initially and rewire it below
  // once `presence` is available — presence.broadcastNow reads state via
  // refs so the late binding is safe.
  const onAfterUserChangeRef = useRef<() => void>(() => {});
  const clock = usePlaybackClock({
    videos,
    runDurationSec,
    refs,
    onTChange,
    onAfterUserChange: () => onAfterUserChangeRef.current(),
  });

  const presence = usePresence({
    runId: run.id,
    getLocalSnapshot: () => ({
      userId: currentUserId,
      tSec: clock.lastT.current,
      playing: clock.playingRef.current,
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
      const drift = Math.abs(targetT - clock.lastT.current);
      if (drift > SYNC_DRIFT_THRESHOLD_SEC) {
        clock.seek(
          Math.min(runDurationRef.current, Math.max(0, targetT)),
          { broadcast: false },
        );
      }
      const mainEl = mainAngleIdRef.current
        ? refs.current.get(mainAngleIdRef.current)
        : null;
      const actuallyPlaying = mainEl ? !mainEl.paused : false;
      if (tick.playing !== actuallyPlaying) {
        void clock.applyExternalPlaying(tick.playing);
      }
    },
  });
  onAfterUserChangeRef.current = presence.broadcastNow;

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

  useEffect(() => {
    registerSeek(clock.seek);
    // clock.seek closes over `videos`; re-register when angles change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, registerSeek]);

  // Emit immediately when our Main angle changes so followers switch with us
  // instead of waiting for the next periodic tick.
  useEffect(() => {
    presence.broadcastNow();
    // broadcastNow reads everything via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainAngleId]);

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
          onClick={clock.togglePlay}
          size="sm"
          variant={clock.playing ? "outline" : "filled"}
        >
          {clock.playing ? "⏸ Pause" : "▶ Play"}
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
            onChange={clock.seek}
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
