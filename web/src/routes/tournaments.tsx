import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import type { Tournament } from "../lib/api/client";
import {
  useCreateTournament,
  useDeleteTournament,
  useTournaments,
  useUpdateTournament,
} from "../lib/queries";

export const Route = createFileRoute("/tournaments")({
  component: TournamentsPage,
});

function TournamentsPage() {
  const tournaments = useTournaments();
  const navigate = useNavigate();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Tournament | null>(null);
  const list = tournaments.data?.data ?? [];

  return (
    <ResourcePage
      title="大会 (Tournament)"
      description="Tournament 配下に Match を作成して試合管理に使う。Phase 2 で導入。"
      isLoading={tournaments.isLoading}
      error={tournaments.error}
      onRetry={() => tournaments.refetch()}
      actions={<Button onClick={open}>＋ 大会を作成</Button>}
    >
      <Table striped highlightOnHover withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>名前</Table.Th>
            <Table.Th>開始日</Table.Th>
            <Table.Th>終了日</Table.Th>
            <Table.Th>作成日時</Table.Th>
            <Table.Th style={{ width: 140 }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((t) => (
            <Table.Tr key={t.id} style={{ cursor: "pointer" }}>
              <Table.Td onClick={() => navigate({ to: "/matches", search: { tournamentId: t.id } as never })}>
                <Text fw={500}>{t.name}</Text>
              </Table.Td>
              <Table.Td>{t.startDate ?? "—"}</Table.Td>
              <Table.Td>{t.endDate ?? "—"}</Table.Td>
              <Table.Td>{new Date(t.createdAt).toLocaleString()}</Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <ActionIcon variant="subtle" onClick={() => setEditing(t)} aria-label="編集">
                    ✏️
                  </ActionIcon>
                  <DeleteButton id={t.id} />
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {list.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text c="dimmed" ta="center" py="md">
                  まだ大会がありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <TournamentFormModal opened={opened} onClose={close} />
      {editing && (
        <TournamentFormModal opened tournament={editing} onClose={() => setEditing(null)} />
      )}
    </ResourcePage>
  );
}

function DeleteButton({ id }: { id: string }) {
  const del = useDeleteTournament();
  return (
    <ActionIcon
      variant="subtle"
      color="red"
      loading={del.isPending}
      onClick={() => {
        if (confirm("削除しますか？ 配下の Match も削除されます")) del.mutate(id);
      }}
      aria-label="削除"
    >
      🗑️
    </ActionIcon>
  );
}

function TournamentFormModal({
  opened,
  onClose,
  tournament,
}: {
  opened: boolean;
  onClose: () => void;
  tournament?: Tournament;
}) {
  const create = useCreateTournament();
  const update = useUpdateTournament();
  const [name, setName] = useState(tournament?.name ?? "");
  const [startDate, setStartDate] = useState<Date | null>(
    tournament?.startDate ? new Date(tournament.startDate) : null,
  );
  const [endDate, setEndDate] = useState<Date | null>(
    tournament?.endDate ? new Date(tournament.endDate) : null,
  );

  const fmtDate = (d: Date | null) =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null;

  const submit = () => {
    const body = { name, startDate: fmtDate(startDate), endDate: fmtDate(endDate) };
    if (tournament) {
      update.mutate({ id: tournament.id, body }, { onSuccess: onClose });
    } else {
      create.mutate(body, { onSuccess: onClose });
    }
  };
  const busy = create.isPending || update.isPending;

  return (
    <Modal opened={opened} onClose={onClose} title={tournament ? "大会を編集" : "大会を作成"}>
      <Stack>
        <TextInput
          label="名前"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <Group grow>
          <DateInput
            label="開始日"
            value={startDate}
            onChange={(v) => setStartDate(v ? new Date(v) : null)}
            clearable
          />
          <DateInput
            label="終了日"
            value={endDate}
            onChange={(v) => setEndDate(v ? new Date(v) : null)}
            clearable
          />
        </Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={submit} loading={busy} disabled={!name}>
            {tournament ? "保存" : "作成"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
