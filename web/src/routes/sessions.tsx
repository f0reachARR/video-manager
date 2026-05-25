import { ActionIcon, Badge, Button, Group, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import type { Session } from "../lib/api/client";
import {
  useDeleteSession,
  useSessions,
} from "../features/sessions/api/queries";
import { SessionEditModal } from "../features/sessions/components/SessionEditModal";

export const Route = createFileRoute("/sessions")({
  component: SessionsPage,
});

function SessionsPage() {
  const sessions = useSessions();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const list = sessions.data?.data ?? [];

  return (
    <ResourcePage
      title="セッション"
      description="現在の大会の練習・本番セッション。"
      isLoading={sessions.isLoading}
      error={sessions.error}
      onRetry={() => sessions.refetch()}
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
            <Table.Th>モード</Table.Th>
            <Table.Th>開始</Table.Th>
            <Table.Th>終了</Table.Th>
            <Table.Th>場所</Table.Th>
            <Table.Th style={{ width: 120 }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((s) => (
            <Table.Tr key={s.id}>
              <Table.Td>{s.name}</Table.Td>
              <Table.Td>
                <Badge color={s.modeHint === "pre_match" ? "red" : "blue"} variant="light">
                  {s.modeHint}
                </Badge>
              </Table.Td>
              <Table.Td>{s.startedAt ? new Date(s.startedAt).toLocaleString() : "—"}</Table.Td>
              <Table.Td>{s.endedAt ? new Date(s.endedAt).toLocaleString() : "—"}</Table.Td>
              <Table.Td>{s.location ?? "—"}</Table.Td>
              <Table.Td>
                <SessionActions
                  session={s}
                  onEdit={() => {
                    setEditing(s);
                    open();
                  }}
                />
              </Table.Td>
            </Table.Tr>
          ))}
          {list.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Text c="dimmed" ta="center" py="md">
                  まだセッションがありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <SessionEditModal
        key={editing?.id ?? "new"}
        opened={opened}
        onClose={close}
        session={editing}
      />
    </ResourcePage>
  );
}

function SessionActions({ session, onEdit }: { session: Session; onEdit: () => void }) {
  const del = useDeleteSession();
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
          if (confirm(`${session.name} を削除しますか？`)) {
            del.mutate(session.id);
          }
        }}
        aria-label="削除"
      >
        🗑️
      </ActionIcon>
    </Group>
  );
}
