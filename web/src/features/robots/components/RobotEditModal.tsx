import { Button, Group, Modal, Select, Stack, TextInput } from "@mantine/core";
import { useState } from "react";

import type { Robot } from "../../../lib/api/client";
import { useCurrentTournamentId } from "../../../stores/currentTournament";
import { useCreateRobot, useUpdateRobot } from "../api/queries";

export function RobotEditModal({
  opened,
  onClose,
  robot,
  teamOptions,
}: {
  opened: boolean;
  onClose: () => void;
  robot: Robot | null;
  teamOptions: { value: string; label: string }[];
}) {
  const tournamentId = useCurrentTournamentId();
  const [name, setName] = useState(robot?.name ?? "");
  const [version, setVersion] = useState(robot?.version ?? "");
  const [teamId, setTeamId] = useState<string | null>(
    robot?.teamId ?? teamOptions[0]?.value ?? null,
  );
  const create = useCreateRobot();
  const update = useUpdateRobot();

  const submit = () => {
    if (robot) {
      update.mutate(
        { id: robot.id, body: { name, version } },
        { onSuccess: onClose },
      );
    } else {
      if (!teamId || !tournamentId) return;
      create.mutate(
        { tournamentId, teamId, name, version },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={robot ? "ロボット編集" : "ロボット新規作成"}
    >
      <Stack>
        <TextInput
          label="名前"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <TextInput
          label="バージョン"
          value={version}
          onChange={(e) => setVersion(e.currentTarget.value)}
          placeholder="例: v1"
        />
        {!robot && (
          <Select
            label="チーム"
            data={teamOptions}
            value={teamId}
            onChange={setTeamId}
            required
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending || update.isPending}
            disabled={!name.trim() || (!robot && !teamId)}
          >
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
