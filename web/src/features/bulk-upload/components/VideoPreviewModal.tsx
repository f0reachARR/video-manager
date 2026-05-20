import { Alert, Center, Loader, Modal, Stack, Text } from "@mantine/core";
import { useCallback, useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { useHlsSource } from "../../../components/player/useHlsSource";
import { useVideo } from "../../videos/api/queries";
import { useVideoPlaybackUrl } from "../../videos/hooks/useVideoPlaybackUrl";

type Props = {
  videoId: string | null;
  onClose: () => void;
};

// Minimal preview modal for the bulk-upload row "▶" affordance. Uses the
// shared useHlsSource hook so playback works for HLS-ready videos and
// falls back to the original MP4 while encoding is still in flight.
export function VideoPreviewModal({ videoId, onClose }: Props) {
  const video = useVideo(videoId);
  const { source, error } = useVideoPlaybackUrl(videoId);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const refCb = useCallback((el: HTMLVideoElement | null) => setVideoEl(el), []);
  useHlsSource(videoEl, source);

  return (
    <Modal
      opened={videoId != null}
      onClose={onClose}
      title={video.data?.displayName ?? "動画プレビュー"}
      size="xl"
    >
      <Stack>
        {video.error && (
          <Alert color="red">
            {video.error instanceof ApiError
              ? video.error.body.message
              : (video.error as Error).message}
          </Alert>
        )}
        {error && <Alert color="red">{error}</Alert>}
        {!source && !error ? (
          <Center p="xl">
            <Loader />
          </Center>
        ) : (
          <video
            ref={refCb}
            controls
            playsInline
            style={{ width: "100%", maxHeight: "70vh", background: "#000" }}
          />
        )}
        {video.data && (
          <Text size="xs" c="dimmed" ff="monospace">
            {video.data.id} · HLS: {video.data.hlsStatus}
            {video.data.durationSec ? ` · ${video.data.durationSec}s` : ""}
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
