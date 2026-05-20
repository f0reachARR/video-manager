import { Button, Group, Modal, NumberInput, Stack, TextInput } from "@mantine/core";
import { useState } from "react";

import type { Device } from "../../../lib/api/client";
import { useCreateDevice, useUpdateDevice } from "../api/queries";

export function DeviceEditModal({
  opened,
  onClose,
  device,
}: {
  opened: boolean;
  onClose: () => void;
  device: Device | null;
}) {
  const [name, setName] = useState(device?.name ?? "");
  const [offset, setOffset] = useState<number>(device?.defaultTimeOffsetSec ?? 0);
  const create = useCreateDevice();
  const update = useUpdateDevice();

  const submit = () => {
    const payload = { name, defaultTimeOffsetSec: offset };
    if (device) {
      update.mutate({ id: device.id, body: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={device ? "機材編集" : "機材新規作成"}>
      <Stack>
        <TextInput
          label="名前"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <NumberInput
          label="Default Time Offset (秒)"
          description="プラスなら機材時刻が進んでいる。0 で OK"
          value={offset}
          onChange={(v) => setOffset(typeof v === "number" ? v : 0)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending || update.isPending}
            disabled={!name.trim()}
          >
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
