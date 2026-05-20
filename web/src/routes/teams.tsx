import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import type { Team } from "../lib/api/client";
import { useCreateRobot } from "../features/robots/api/queries";
import {
  useCreateTeam,
  useDeleteTeam,
  useTeams,
  useUpdateTeam,
} from "../lib/queries";

export const Route = createFileRoute("/teams")({
  component: TeamsPage,
});

function TeamsPage() {
  const teams = useTeams();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const list = teams.data?.data ?? [];

  return (
    <ResourcePage
      title="チーム"
      description="isOwn にチェックを付けたチームが「自チーム」になります。"
      isLoading={teams.isLoading}
      error={teams.error}
      onRetry={() => teams.refetch()}
      actions={
        <Button
          onClick={() => {
            setEditing(null);
            open();
          }}
        >
          ＋ 新規作成
        </Button>
      }
    >
      <Table striped highlightOnHover withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>名前</Table.Th>
            <Table.Th>自チーム</Table.Th>
            <Table.Th>作成日時</Table.Th>
            <Table.Th style={{ width: 120 }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((t) => (
            <Table.Tr key={t.id}>
              <Table.Td>{t.name}</Table.Td>
              <Table.Td>
                {t.isOwn && <Badge color="blue">自チーム</Badge>}
              </Table.Td>
              <Table.Td>{new Date(t.createdAt).toLocaleString()}</Table.Td>
              <Table.Td>
                <TeamActions
                  team={t}
                  onEdit={() => {
                    setEditing(t);
                    open();
                  }}
                />
              </Table.Td>
            </Table.Tr>
          ))}
          {list.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed" ta="center" py="md">
                  まだチームがありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <TeamEditModal
        key={editing?.id ?? "new"}
        opened={opened}
        onClose={close}
        team={editing}
      />
    </ResourcePage>
  );
}

function TeamActions({ team, onEdit }: { team: Team; onEdit: () => void }) {
  const del = useDeleteTeam();
  return (
    <Group gap={4}>
      <ActionIcon variant="subtle" onClick={onEdit} aria-label="編集">
        ✏️
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="red"
        loading={del.isPending}
        onClick={() => {
          if (confirm(`${team.name} を削除しますか？`)) {
            del.mutate(team.id);
          }
        }}
        aria-label="削除"
      >
        🗑️
      </ActionIcon>
    </Group>
  );
}

function TeamEditModal({
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
                    onChange={(e) =>
                      setRobotNames((arr) => {
                        const next = [...arr];
                        next[i] = e.currentTarget.value;
                        return next;
                      })
                    }
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
