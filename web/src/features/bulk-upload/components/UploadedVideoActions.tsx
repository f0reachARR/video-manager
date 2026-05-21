import { Loader, Text } from "@mantine/core";

import { ApiError } from "../../../lib/api/client";
import { useVideo } from "../../videos/api/queries";
import { VideoActions } from "../../videos/components/VideoActions";

// Thin wrapper that defers to the /videos page's VideoActions once the
// Video row is loaded. Used in the bulk-upload アップロード済 section so
// each row exposes the same playback / HLS status / metadata edit /
// session assign / delete operations the standalone video list offers,
// without rebuilding any of that UI here.
export function UploadedVideoActions({ videoId }: { videoId: string }) {
  const video = useVideo(videoId);
  if (video.isLoading) return <Loader size="xs" />;
  if (video.error || !video.data) {
    return (
      <Text size="xs" c="dimmed">
        {video.error instanceof ApiError
          ? video.error.body.message
          : (video.error as Error | undefined)?.message ?? "—"}
      </Text>
    );
  }
  return <VideoActions video={video.data} />;
}
