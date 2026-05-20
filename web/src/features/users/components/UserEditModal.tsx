import { Button, ColorInput, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useState } from "react";

import type { User } from "../../../lib/api/client";
import { useCreateUser, useUpdateUser } from "../api/queries";

export function UserEditModal({
  opened,
  onClose,
  user,
}: {
  opened: boolean;
  onClose: () => void;
  user: User | null;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [color, setColor] = useState(user?.color ?? "");
  const create = useCreateUser();
  const update = useUpdateUser();

  const submit = () => {
    const payload = { name, color: color || null };
    if (user) {
      update.mutate({ id: user.id, body: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={user ? "ユーザー編集" : "ユーザー新規作成"}
    >
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
