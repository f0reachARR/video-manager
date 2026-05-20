import { Box, Button, Card, Group, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PlaybackUrl, Video } from "../../../../lib/api/client";
import { videosApi } from "../../../../lib/api/client";
import { useHlsSource } from "../../../../components/player/useHlsSource";
import { formatDateTimeFull } from "../../../../lib/time";
import { formatTime } from "../../lib/format";
import type { Region } from "./types";

// Always-on multi-angle preview spanning the full timeline. Each video is
// steered to its local time (videoOffsetStart + (t - videoStartAbs));
// videos whose band doesn't cover the current t show "NO VIDEO" instead.
//
// The two big actions are "ここからスタート" / "ここまで": they either
// edit the currently-selected region (if any) or fall back to a pending-
// start workflow that commits a fresh region to the list on the second
// button press.
export function Preview({
  videos,
  totalSec,
  t0Ms,
  bandOf,
  angleLabels,
  previewT,
  onPreviewTChange,
  selectedRegion,
  pendingStart,
  onSetStart,
  onSetEnd,
  onClearPending,
}: {
  videos: Video[];
  totalSec: number;
  t0Ms: number;
  bandOf: (v: Video) => { startSec: number; endSec: number };
  angleLabels: Record<string, string>;
  previewT: number;
  onPreviewTChange: (t: number) => void;
  selectedRegion: Region | null;
  pendingStart: number | null;
  onSetStart: () => void;
  onSetEnd: () => void;
  onClearPending: () => void;
}) {
  // Lazily fetch playback URLs for every placeable video — the preview
  // now spans the full timeline so any of them might come into view.
  const [urls, setUrls] = useState<Map<string, PlaybackUrl>>(new Map());
  useEffect(() => {
    let canceled = false;
    videos.forEach(async (v) => {
      if (urls.has(v.id)) return;
      try {
        const r = await videosApi.playbackUrl(v.id);
        if (!canceled) setUrls((m) => new Map(m).set(v.id, r));
      } catch {
        // Best-effort; the lane just won't load.
      }
    });
    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos]);

  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [playing, setPlaying] = useState(false);

  // Wall-clock anchored play loop. Decoupled from any single video's
  // currentTime so gaps where one camera isn't recording don't freeze the
  // whole timeline.
  useEffect(() => {
    if (!playing) return;
    const wallStart = performance.now();
    const tStart = previewT;
    let raf = 0;
    const tick = () => {
      const elapsed = (performance.now() - wallStart) / 1000;
      const next = tStart + elapsed;
      if (next >= totalSec) {
        onPreviewTChange(totalSec);
        setPlaying(false);
        return;
      }
      onPreviewTChange(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, totalSec]);

  // Steer each video element whenever t changes.
  useEffect(() => {
    for (const v of videos) {
      const el = videoRefs.current.get(v.id);
      if (!el) continue;
      const b = bandOf(v);
      const inRange = previewT >= b.startSec && previewT <= b.endSec;
      if (!inRange) {
        if (!el.paused) el.pause();
        continue;
      }
      const localT = previewT - b.startSec;
      const drift = Math.abs(el.currentTime - localT);
      const tolerance = playing ? 0.3 : 0.05;
      if (drift > tolerance) {
        try {
          el.currentTime = localT;
        } catch {
          // Some sources reject seeks before metadata; ignore.
        }
      }
      if (playing && el.paused) el.play().catch(() => {});
      if (!playing && !el.paused) el.pause();
    }
  }, [previewT, playing, videos, bandOf]);

  const handleScrubber = useCallback(
    (value: number) => {
      setPlaying(false);
      onPreviewTChange(value);
    },
    [onPreviewTChange],
  );

  // Keyboard shortcuts: space=play/pause, [=set start, ]=set end. Mounted
  // on the document so they work regardless of focus, but skipped while
  // typing in a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable)
        return;
      if (e.key === "[") {
        e.preventDefault();
        onSetStart();
      } else if (e.key === "]") {
        e.preventDefault();
        onSetEnd();
      } else if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onSetStart, onSetEnd]);

  const buttonLabel = selectedRegion
    ? { start: "[ 選択 Run の開始をここに", end: "] 選択 Run の終了をここに" }
    : pendingStart != null
      ? { start: "[ 開始を上書き", end: "] ここまで (Run を追加)" }
      : { start: "[ ここからスタート", end: "] ここまで" };
  const canSetEnd =
    selectedRegion != null ||
    (pendingStart != null && previewT > pendingStart);

  return (
    <Card withBorder p="sm">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            プレビュー
          </Text>
          <Text size="xs" c="dimmed" ff="monospace">
            {formatDateTimeFull(new Date(t0Ms + previewT * 1000))} (t+
            {formatTime(previewT)} / {formatTime(totalSec)})
          </Text>
        </Group>
        {videos.length === 0 ? (
          <Text size="sm" c="dimmed">
            配置可能な動画がありません。
          </Text>
        ) : (
          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 8,
            }}
          >
            {videos.map((v) => {
              const b = bandOf(v);
              const inRange = previewT >= b.startSec && previewT <= b.endSec;
              const url = urls.get(v.id);
              const label =
                angleLabels[v.id]?.trim() ||
                v.displayName?.trim() ||
                v.storageKey.slice(0, 16);
              return (
                <Box
                  key={v.id}
                  style={{
                    position: "relative",
                    aspectRatio: "16 / 9",
                    background: "black",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  {url ? (
                    <PreviewVideoEl
                      source={url}
                      registerRef={(el) => {
                        if (el) videoRefs.current.set(v.id, el);
                        else videoRefs.current.delete(v.id);
                      }}
                    />
                  ) : (
                    <Box
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "rgba(255,255,255,0.5)",
                        fontSize: 12,
                      }}
                    >
                      loading…
                    </Box>
                  )}
                  {!inRange && (
                    <Box
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(0,0,0,0.75)",
                        color: "white",
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: 1,
                      }}
                    >
                      NO VIDEO
                    </Box>
                  )}
                  <Text
                    size="xs"
                    style={{
                      position: "absolute",
                      bottom: 4,
                      left: 6,
                      color: "white",
                      textShadow: "0 0 4px rgba(0,0,0,0.8)",
                      pointerEvents: "none",
                    }}
                  >
                    {label}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}
        <Group gap="xs" align="center">
          <Button
            size="xs"
            variant={playing ? "filled" : "default"}
            onClick={() => {
              if (previewT >= totalSec - 0.05) onPreviewTChange(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? "■ 停止" : "▶ 再生"}
          </Button>
          <input
            type="range"
            min={0}
            max={totalSec}
            step={0.05}
            value={previewT}
            onChange={(e) => handleScrubber(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </Group>
        <Group gap="xs">
          <Button size="xs" variant="light" color="green" onClick={onSetStart}>
            {buttonLabel.start}
          </Button>
          <Button
            size="xs"
            variant="light"
            color="blue"
            onClick={onSetEnd}
            disabled={!canSetEnd}
          >
            {buttonLabel.end}
          </Button>
          {pendingStart != null && !selectedRegion && (
            <>
              <Text size="xs" c="dimmed">
                開始: t+{formatTime(pendingStart)}
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={onClearPending}>
                × キャンセル
              </Button>
            </>
          )}
          <Text size="xs" c="dimmed" ml="auto">
            ショートカット: [ 開始 / ] 終了 / Space 再生
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}

function PreviewVideoEl({
  source,
  registerRef,
}: {
  source: PlaybackUrl;
  registerRef: (el: HTMLVideoElement | null) => void;
}) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  useHlsSource(el, source);
  return (
    <video
      ref={(node) => {
        setEl(node);
        registerRef(node);
      }}
      muted
      playsInline
      preload="metadata"
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
      }}
    />
  );
}
