import { Button, Group, Stack, Title } from "@mantine/core";

import type { Run } from "../../../lib/api/client";
import { useAddRunVideo, useRecommendedRunVideos } from "../api/queries";

export function RecommendedVideos({ run }: { run: Run }) {
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
              ＋ {v.displayName?.trim() || v.storageKey.slice(0, 12)} ({len}s)
            </Button>
          );
        })}
      </Group>
    </Stack>
  );
}
