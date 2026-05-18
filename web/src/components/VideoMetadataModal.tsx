import { Button, Group, Modal, NumberInput, Select, Stack } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useState } from "react";

import type { Video } from "../lib/api/client";
import { useDevices, useUpdateVideo } from "../lib/queries";

type Props = {
  video: Video;
  onClose: () => void;
};

export function VideoMetadataModal({ video, onClose }: Props) {
  const devices = useDevices();
  const update = useUpdateVideo();
  const [recordedAt, setRecordedAt] = useState<Date | null>(
    video.recordedAt ? new Date(video.recordedAt) : null,
  );
  const [deviceId, setDeviceId] = useState<string | null>(video.deviceId ?? null);
  const [timeOffsetSec, setTimeOffsetSec] = useState<number>(video.timeOffsetSec);

  const submit = () => {
    update.mutate(
      {
        id: video.id,
        body: {
          recordedAt: recordedAt ? recordedAt.toISOString() : null,
          deviceId: deviceId,
          timeOffsetSec,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal opened onClose={onClose} title="動画メタデータ編集" size="md">
      <Stack>
        <DateTimePicker
          label="Recorded At"
          value={recordedAt}
          onChange={(v) => setRecordedAt(v ? new Date(v) : null)}
          clearable
        />
        <Select
          label="Device"
          data={(devices.data?.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          value={deviceId}
          onChange={setDeviceId}
          clearable
        />
        <NumberInput
          label="Time Offset (秒)"
          description="recorded_at に対する個別補正。Device default に追加される"
          value={timeOffsetSec}
          onChange={(v) => setTimeOffsetSec(typeof v === "number" ? v : 0)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={submit} loading={update.isPending}>
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
