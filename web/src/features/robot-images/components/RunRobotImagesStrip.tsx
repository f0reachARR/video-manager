import { Group, Image, Modal, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";

import { robotImagesApi, type RobotImage } from "../../../lib/api/client";
import { useRunRobotImages } from "../api/queries";

// RunRobotImagesStrip surfaces photos of the same robot that were taken
// during the run's window. Renders nothing when there are no matches so
// it stays out of the way on runs without scout photos.
export function RunRobotImagesStrip({ runId }: { runId: string }) {
  const { data } = useRunRobotImages(runId);
  const [opened, setOpened] = useState<RobotImage | null>(null);
  const images = data?.data ?? [];
  if (images.length === 0) return null;
  return (
    <Stack gap="xs" mt="lg">
      <Title order={5}>この Run の時間帯のロボット写真 ({images.length})</Title>
      <Group gap="xs" wrap="nowrap" style={{ overflowX: "auto" }}>
        {images.map((img) => (
          <Stack key={img.id} gap={2} style={{ flex: "0 0 auto", cursor: "pointer" }} onClick={() => setOpened(img)}>
            <Image
              src={robotImagesApi.thumbUrl(img.id)}
              alt={img.caption || "robot image"}
              w={120}
              h={120}
              radius="sm"
              fit="cover"
              loading="lazy"
            />
            <Text size="xs" c="dimmed">
              {img.capturedAt ? new Date(img.capturedAt).toLocaleTimeString() : "—"}
            </Text>
          </Stack>
        ))}
      </Group>
      <Modal opened={!!opened} onClose={() => setOpened(null)} size="lg" title="ロボット写真">
        {opened && (
          <Stack>
            <Image src={robotImagesApi.rawUrl(opened.id)} alt={opened.caption} fit="contain" mah="70vh" />
            {opened.caption && <Text size="sm">{opened.caption}</Text>}
            <Text size="xs" c="dimmed">
              {opened.capturedAt ? new Date(opened.capturedAt).toLocaleString() : "撮影日時不明"}
            </Text>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
