import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../components/ResourcePage";
import type { Session, SessionModeHint } from "../lib/api/client";
import {
  useCreateSession,
  useDeleteSession,
  useSessions,
  useUpdateSession,
} from "../lib/queries";

export const Route = createFileRoute("/sessions")({
  component: SessionsPage,
});

const modeOptions: { value: SessionModeHint; label: string }[] = [
  { value: "practice", label: "練習 (practice)" },
  { value: "pre_match", label: "本番直前 (pre_match)" },
];

function SessionsPage() {
  const sessions = useSessions();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const list = sessions.data?.data ?? [];

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

function toDate(v: string | null | undefined): Date | null {
  return v ? new Date(v) : null;
}

function toIsoOrNull(v: Date | null): string | null {
  return v ? v.toISOString() : null;
}

function SessionEditModal({
  opened,
  onClose,
  session,
}: {
  opened: boolean;
  onClose: () => void;
  session: Session | null;
}) {
  const [name, setName] = useState(session?.name ?? "");
  const [modeHint, setModeHint] = useState<SessionModeHint>(session?.modeHint ?? "practice");
  const [startedAt, setStartedAt] = useState<Date | null>(toDate(session?.startedAt));
  const [endedAt, setEndedAt] = useState<Date | null>(toDate(session?.endedAt));
  const [location, setLocation] = useState(session?.location ?? "");
  const create = useCreateSession();
  const update = useUpdateSession();

  const submit = () => {
    const payload = {
      name,
      modeHint,
      startedAt: toIsoOrNull(startedAt),
      endedAt: toIsoOrNull(endedAt),
      location: location || null,
    };
    if (session) {
      update.mutate({ id: session.id, body: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={session ? "セッション編集" : "セッション新規作成"}
      size="lg"
    >
      <Stack>
        <TextInput label="名前" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <Select
          label="モード"
          data={modeOptions}
          value={modeHint}
          onChange={(v) => v && setModeHint(v as SessionModeHint)}
          allowDeselect={false}
        />
        <Group grow>
          <DateTimePicker
            label="開始"
            value={startedAt}
            onChange={(v) => setStartedAt(v ? new Date(v) : null)}
            clearable
          />
          <DateTimePicker
            label="終了"
            value={endedAt}
            onChange={(v) => setEndedAt(v ? new Date(v) : null)}
            clearable
          />
        </Group>
        <TextInput
          label="場所"
          value={location}
          onChange={(e) => setLocation(e.currentTarget.value)}
          placeholder="例: 体育館 A"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={submit} loading={create.isPending || update.isPending} disabled={!name.trim()}>
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
