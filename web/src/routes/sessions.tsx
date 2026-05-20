import { ActionIcon, Badge, Button, Group, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import type { Session } from "../lib/api/client";
import {
  useDeleteSession,
  useSessions,
} from "../features/sessions/api/queries";
import { SessionEditModal } from "../features/sessions/components/SessionEditModal";
import { useTournaments } from "../features/tournaments/api/queries";

export const Route = createFileRoute("/sessions")({
  component: SessionsPage,
});

function SessionsPage() {
  const sessions = useSessions();
  const tournaments = useTournaments();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const list = sessions.data?.data ?? [];
  const tournamentName = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tournaments.data?.data ?? []) map.set(t.id, t.name);
    return map;
  }, [tournaments.data]);

  return (
    <ResourcePage
      title="セッション"
      description="練習・本番のひとくくり。mode_hint で表示の挙動を切り替えます。"
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
            <Table.Th>大会</Table.Th>
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
              <Table.Td>
                {s.tournamentId ? (
                  <Text size="sm">
                    {tournamentName.get(s.tournamentId) ?? s.tournamentId}
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                )}
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
              <Table.Td colSpan={7}>
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
