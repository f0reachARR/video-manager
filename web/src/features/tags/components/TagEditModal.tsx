import { Button, ColorInput, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useState } from "react";

import type { Tag } from "../../../lib/api/client";
import { useCreateTag, useUpdateTag } from "../api/queries";

export function TagEditModal({
  opened,
  onClose,
  tag,
}: {
  opened: boolean;
  onClose: () => void;
  tag: Tag | null;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? "");
  const create = useCreateTag();
  const update = useUpdateTag();

  const submit = () => {
    const payload = { name, color: color || null };
    if (tag) {
      update.mutate({ id: tag.id, body: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={tag ? "タグ編集" : "タグ新規作成"}>
      <Stack>
        <TextInput
          label="名前"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <ColorInput label="色 (任意)" value={color} onChange={setColor} format="hex" />
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
