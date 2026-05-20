import { ActionIcon, Button, Group, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import type { User } from "../lib/api/client";
import { useDeleteUser, useUsers } from "../features/users/api/queries";
import { UserEditModal } from "../features/users/components/UserEditModal";

export const Route = createFileRoute("/users")({
  component: UsersPage,
});

function UsersPage() {
  const users = useUsers();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<User | null>(null);

  const list = users.data?.data ?? [];

  return (
    <ResourcePage
      title="ユーザー"
      description="セッション編集者・スカウター。色は UI 上の識別用。"
      isLoading={users.isLoading}
      error={users.error}
      onRetry={() => users.refetch()}
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
            <Table.Th>色</Table.Th>
            <Table.Th>作成日時</Table.Th>
            <Table.Th style={{ width: 120 }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((u) => (
            <Table.Tr key={u.id}>
              <Table.Td>{u.name}</Table.Td>
              <Table.Td>
                {u.color ? (
                  <Group gap={6}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: u.color,
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                    />
                    <Text size="xs" ff="monospace">
                      {u.color}
                    </Text>
                  </Group>
                ) : (
                  <Text size="xs" c="dimmed">
                    —
                  </Text>
                )}
              </Table.Td>
              <Table.Td>{new Date(u.createdAt).toLocaleString()}</Table.Td>
              <Table.Td>
                <RowActions
                  user={u}
                  onEdit={() => {
                    setEditing(u);
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
                  まだユーザーがいません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <UserEditModal
        key={editing?.id ?? "new"}
        opened={opened}
        onClose={close}
        user={editing}
      />
    </ResourcePage>
  );
}

function RowActions({ user, onEdit }: { user: User; onEdit: () => void }) {
  const del = useDeleteUser();
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
          if (confirm(`${user.name} を削除しますか？`)) {
            del.mutate(user.id);
          }
        }}
        aria-label="削除"
      >
        🗑️
      </ActionIcon>
    </Group>
  );
}
