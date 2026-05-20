import {
  ActionIcon,
  Avatar,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ResourcePage } from "../../components/layout/ResourcePage";
import { type Robot, robotImagesApi } from "../../lib/api/client";
import {
  useCreateRobot,
  useDeleteRobot,
  useRobots,
  useTeams,
  useUpdateRobot,
} from "../../lib/queries";

export const Route = createFileRoute("/robots/")({
  component: RobotsPage,
});

function RobotsPage() {
  const robots = useRobots();
  const teams = useTeams();
  const navigate = useNavigate();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Robot | null>(null);
  const list = robots.data?.data ?? [];
  const teamsList = teams.data?.data ?? [];

  const teamNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teamsList) m.set(t.id, t.name);
    return m;
  }, [teamsList]);

  return (
    <ResourcePage
      title="ロボット"
      description="チーム配下に登録されるロボット。バージョン違いも別レコードとして扱います。"
      isLoading={robots.isLoading || teams.isLoading}
      error={robots.error ?? teams.error}
      onRetry={() => {
        robots.refetch();
        teams.refetch();
      }}
      actions={
        <Button
          onClick={() => {
            setEditing(null);
            open();
          }}
          disabled={teamsList.length === 0}
        >
          ＋ 新規作成
        </Button>
      }
    >
      <Table striped highlightOnHover withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: 56 }}></Table.Th>
            <Table.Th>名前</Table.Th>
            <Table.Th>バージョン</Table.Th>
            <Table.Th>チーム</Table.Th>
            <Table.Th>作成日時</Table.Th>
            <Table.Th style={{ width: 160 }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>
                <Avatar
                  src={r.primaryImageId ? robotImagesApi.thumbUrl(r.primaryImageId) : undefined}
                  size={40}
                  radius="sm"
                />
              </Table.Td>
              <Table.Td>{r.name}</Table.Td>
              <Table.Td>{r.version || "—"}</Table.Td>
              <Table.Td>{teamNameById.get(r.teamId) ?? r.teamId}</Table.Td>
              <Table.Td>{new Date(r.createdAt).toLocaleString()}</Table.Td>
              <Table.Td>
                <RobotActions
                  robot={r}
                  onEdit={() => {
                    setEditing(r);
                    open();
                  }}
                  onManageImages={() =>
                    navigate({
                      to: "/robots/$robotId/images",
                      params: { robotId: r.id },
                    })
                  }
                />
              </Table.Td>
            </Table.Tr>
          ))}
          {list.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Text c="dimmed" ta="center" py="md">
                  まだロボットがいません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <RobotEditModal
        key={editing?.id ?? "new"}
        opened={opened}
        onClose={close}
        robot={editing}
        teamOptions={teamsList.map((t) => ({ value: t.id, label: t.name }))}
      />
    </ResourcePage>
  );
}

function RobotActions({
  robot,
  onEdit,
  onManageImages,
}: {
  robot: Robot;
  onEdit: () => void;
  onManageImages: () => void;
}) {
  const del = useDeleteRobot();
  return (
    <Group gap={4}>
      <ActionIcon variant="subtle" onClick={onEdit} aria-label="編集">
        ✏️
      </ActionIcon>
      <ActionIcon variant="subtle" onClick={onManageImages} aria-label="画像">
        🖼️
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="red"
        loading={del.isPending}
        onClick={() => {
          if (confirm(`${robot.name} を削除しますか？`)) {
            del.mutate(robot.id);
          }
        }}
        aria-label="削除"
      >
        🗑️
      </ActionIcon>
    </Group>
  );
}

function RobotEditModal({
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
      if (!teamId) return;
      create.mutate(
        { teamId, name, version },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={robot ? "ロボット編集" : "ロボット新規作成"}>
      <Stack>
        <TextInput label="名前" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
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
