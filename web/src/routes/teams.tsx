import { ActionIcon, Badge, Button, Group, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import type { Team } from "../lib/api/client";
import { useDeleteTeam, useTeams } from "../features/teams/api/queries";
import { TeamEditModal } from "../features/teams/components/TeamEditModal";

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
