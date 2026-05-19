import { Card, Group, Stack, Text } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "../components/layout/ResourcePage";
import { useEncodingJobs } from "../features/videos/api/queries";
import {
  HLSStatusBadge,
  HLSStatusPanel,
} from "../features/videos/components/HLSStatusPanel";
import { VideoThumb } from "../features/videos/components/VideoThumb";
import { formatDateTimeShort } from "../lib/time";

export const Route = createFileRoute("/encoding")({
  component: EncodingPage,
});

function EncodingPage() {
  const jobs = useEncodingJobs();
  const data = jobs.data?.data ?? [];

  return (
    <ResourcePage
      title="HLS エンコード状況"
      description={
        "encoding / failed の動画と各バリアントの進捗を 3 秒間隔で更新。"
        + " ready になった動画はリストから自動で消える。"
      }
      isLoading={jobs.isLoading}
      error={jobs.error}
      onRetry={() => jobs.refetch()}
    >
      {data.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">
          現在エンコード中の動画はありません。
        </Text>
      ) : (
        <Stack gap="md">
          {data.map((job) => (
            <Card key={job.video.id} withBorder p="md">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Group gap="md" wrap="nowrap">
                    <VideoThumb video={job.video} />
                    <Stack gap={2}>
                      <Text fw={500}>
                        {job.video.displayName || job.video.storageKey.slice(0, 16)}
                      </Text>
                      <Group gap="xs">
                        <HLSStatusBadge status={job.video.hlsStatus} />
                        <Text size="xs" c="dimmed">
                          作成 {formatDateTimeShort(job.video.createdAt)}
                        </Text>
                        {job.video.durationSec != null && (
                          <Text size="xs" c="dimmed">
                            尺 {job.video.durationSec}s
                          </Text>
                        )}
                      </Group>
                    </Stack>
                  </Group>
                </Group>
                <HLSStatusPanel
                  data={{
                    videoId: job.video.id,
                    hlsStatus: job.video.hlsStatus,
                    durationSec: job.video.durationSec ?? null,
                    data: job.renditions,
                  }}
                />
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </ResourcePage>
  );
}
