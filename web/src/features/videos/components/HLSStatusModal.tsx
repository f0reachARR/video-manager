import { Loader, Modal, Stack, Text } from "@mantine/core";

import type { Video } from "../../../lib/api/client";
import { useVideoRenditions } from "../api/queries";
import { HLSStatusPanel } from "./HLSStatusPanel";

export function HLSStatusModal({
  video,
  onClose,
}: {
  video: Video;
  onClose: () => void;
}) {
  const q = useVideoRenditions(video.id);
  return (
    <Modal opened onClose={onClose} title="HLS エンコード状況" size="lg">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {video.displayName || video.storageKey.slice(0, 16)}
        </Text>
        {q.isLoading && <Loader size="sm" />}
        {q.error && (
          <Text size="sm" c="red">
            読み込みに失敗しました。
          </Text>
        )}
        {q.data && <HLSStatusPanel data={q.data} />}
      </Stack>
    </Modal>
  );
}
