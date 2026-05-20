import { ActionIcon, Button, Group, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import type { Tag } from "../lib/api/client";
import { useDeleteTag, useTags } from "../features/tags/api/queries";
import { TagEditModal } from "../features/tags/components/TagEditModal";

export const Route = createFileRoute("/tags")({
  component: TagsPage,
});

function TagsPage() {
  const tags = useTags();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const list = tags.data?.data ?? [];

  return (
    <ResourcePage
      title="タグ"
      description="Run・Video に付ける汎用フラグ。色は UI 表示用。"
      isLoading={tags.isLoading}
      error={tags.error}
      onRetry={() => tags.refetch()}
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
          {list.map((t) => (
            <Table.Tr key={t.id}>
              <Table.Td>{t.name}</Table.Td>
              <Table.Td>
                {t.color ? (
                  <Group gap={6}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: t.color,
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                    />
                    <Text size="xs" ff="monospace">
                      {t.color}
                    </Text>
                  </Group>
                ) : (
                  <Text size="xs" c="dimmed">
                    —
                  </Text>
                )}
              </Table.Td>
              <Table.Td>{new Date(t.createdAt).toLocaleString()}</Table.Td>
              <Table.Td>
                <TagActions
                  tag={t}
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
                  まだタグがありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <TagEditModal
        key={editing?.id ?? "new"}
        opened={opened}
        onClose={close}
        tag={editing}
      />
    </ResourcePage>
  );
}

function TagActions({ tag, onEdit }: { tag: Tag; onEdit: () => void }) {
  const del = useDeleteTag();
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
          if (confirm(`${tag.name} を削除しますか？`)) {
            del.mutate(tag.id);
          }
        }}
        aria-label="削除"
      >
        🗑️
      </ActionIcon>
    </Group>
  );
}
