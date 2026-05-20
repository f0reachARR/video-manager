import { Button, Group, Modal, Stack, Textarea, TextInput } from "@mantine/core";
import { useState } from "react";

import type { Scenario } from "../../../lib/api/client";
import { useCreateScenario, useUpdateScenario } from "../api/queries";

export function ScenarioEditModal({
  opened,
  onClose,
  scenario,
}: {
  opened: boolean;
  onClose: () => void;
  scenario: Scenario | null;
}) {
  const [name, setName] = useState(scenario?.name ?? "");
  const [description, setDescription] = useState(scenario?.description ?? "");
  const create = useCreateScenario();
  const update = useUpdateScenario();

  const submit = () => {
    const payload = { name, description };
    if (scenario) {
      update.mutate({ id: scenario.id, body: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={scenario ? "シナリオ編集" : "シナリオ新規作成"}
    >
      <Stack>
        <TextInput
          label="名前"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <Textarea
          label="説明"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          autosize
          minRows={2}
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
