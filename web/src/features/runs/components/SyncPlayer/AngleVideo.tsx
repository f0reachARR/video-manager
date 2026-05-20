import { Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
import { useRef, useState } from "react";

import type { PlaybackUrl, RunVideo } from "../../../../lib/api/client";
import { useHlsSource } from "../../../../components/player/useHlsSource";
import {
  RunVideoOverlay,
  type OverlayMode,
} from "../../../annotations/components/RunVideoOverlay";
import { isAngleInRange } from "../../lib/timeMap";

export type LoadedAngle = {
  rv: RunVideo;
  source: PlaybackUrl;
};

export function AngleVideo({
  angle,
  isMain,
  onSelectMain,
  registerRef,
  overlayMode,
  overlayLabel,
  runT,
}: {
  angle: LoadedAngle;
  isMain?: boolean;
  onSelectMain?: () => void;
  registerRef: (el: HTMLVideoElement | null) => void;
  overlayMode: OverlayMode;
  overlayLabel?: string;
  runT: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoElState] = useState<HTMLVideoElement | null>(null);
  const setVideoEl = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoElState(el);
    registerRef(el);
  };
  useHlsSource(videoEl, angle.source);

  // This angle covers run time [runOffset, runOffset + (end-start)]. Outside
  // that window the source video has no content for the Run, so we cover the
  // player with a NO VIDEO placeholder instead of showing a frozen / wrong
  // frame. The "before" gap appears when runOffsetSec > 0; the "after" gap
  // appears when the angle's length is less than the Run's duration.
  const outOfRange = !isAngleInRange(angle.rv, runT);

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
            // Live ink hides native controls to free up pointer space.
            touchAction:
              isMain && overlayMode === "liveInk" ? "none" : undefined,
          }}
        >
          <video
            ref={setVideoEl}
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
            draftLabel={overlayLabel}
          />
        </div>
      </Stack>
    </Card>
  );
}
