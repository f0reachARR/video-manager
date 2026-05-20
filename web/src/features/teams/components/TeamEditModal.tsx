import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Stack,
  TextInput,
} from "@mantine/core";
import { useState } from "react";

import type { Team } from "../../../lib/api/client";
import { useCreateRobot } from "../../robots/api/queries";
import { useCreateTeam, useUpdateTeam } from "../api/queries";

export function TeamEditModal({
  opened,
  onClose,
  team,
}: {
  opened: boolean;
  onClose: () => void;
  team: Team | null;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [isOwn, setIsOwn] = useState(team?.isOwn ?? false);
  const [robotVersion, setRobotVersion] = useState("");
  const [robotNames, setRobotNames] = useState<string[]>([""]);
  const create = useCreateTeam();
  const update = useUpdateTeam();
  const createRobot = useCreateRobot();

  const isCreate = team === null;
  const robotsPending = createRobot.isPending;

  const submit = async () => {
    const payload = { name, isOwn };
    if (team) {
      update.mutate({ id: team.id, body: payload }, { onSuccess: onClose });
      return;
    }
    const created = await create.mutateAsync(payload);
    const trimmed = robotNames.map((n) => n.trim()).filter((n) => n !== "");
    for (const n of trimmed) {
      await createRobot.mutateAsync({
        teamId: created.id,
        name: n,
        version: robotVersion,
      });
    }
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={team ? "チーム編集" : "チーム新規作成"}
    >
      <Stack>
        <TextInput
          label="名前"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <Checkbox
          label="自チーム (isOwn)"
          checked={isOwn}
          onChange={(e) => setIsOwn(e.currentTarget?.checked ?? false)}
        />
        {isCreate && (
          <>
            <Divider label="ロボット一括登録 (任意)" labelPosition="left" />
            <TextInput
              label="バージョン"
              description="登録するロボット全員に同じバージョン文字列を付与します。空でも可。"
              value={robotVersion}
              onChange={(e) => setRobotVersion(e.currentTarget.value)}
            />
            <Stack gap="xs">
              {robotNames.map((rn, i) => (
                <Group key={i} gap="xs" wrap="nowrap">
                  <TextInput
                    style={{ flex: 1 }}
                    placeholder={`ロボット名 ${i + 1}`}
                    value={rn}
                    onChange={(e) => {
                      // React reuses synthetic events; snapshot the value
                      // before the state updater runs or currentTarget may
                      // already be null.
                      const v = e.currentTarget.value;
                      setRobotNames((arr) => {
                        const next = [...arr];
                        next[i] = v;
                        return next;
                      });
                    }}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="削除"
                    disabled={robotNames.length <= 1}
                    onClick={() =>
                      setRobotNames((arr) => arr.filter((_, j) => j !== i))
                    }
                  >
                    🗑️
                  </ActionIcon>
                </Group>
              ))}
              <Button
                variant="subtle"
                size="xs"
                onClick={() => setRobotNames((arr) => [...arr, ""])}
              >
                ＋ ロボット追加
              </Button>
            </Stack>
          </>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending || update.isPending || robotsPending}
            disabled={!name.trim()}
          >
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
