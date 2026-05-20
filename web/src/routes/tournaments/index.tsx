import { ActionIcon, Button, Group, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../../components/layout/ResourcePage";
import type { Tournament } from "../../lib/api/client";
import {
  useDeleteTournament,
  useTournaments,
} from "../../features/tournaments/api/queries";
import { TournamentFormModal } from "../../features/tournaments/components/TournamentFormModal";

export const Route = createFileRoute("/tournaments/")({
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
            <Table.Th style={{ width: 200 }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((t) => (
            <Table.Tr key={t.id} style={{ cursor: "pointer" }}>
              <Table.Td
                onClick={() =>
                  navigate({
                    to: "/tournaments/$tournamentId",
                    params: { tournamentId: t.id },
                  })
                }
              >
                <Text fw={500}>{t.name}</Text>
              </Table.Td>
              <Table.Td>{t.startDate ?? "—"}</Table.Td>
              <Table.Td>{t.endDate ?? "—"}</Table.Td>
              <Table.Td>{new Date(t.createdAt).toLocaleString()}</Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() =>
                      navigate({
                        to: "/matches",
                        search: { tournamentId: t.id } as never,
                      })
                    }
                  >
                    試合一覧
                  </Button>
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setEditing(t)}
                    aria-label="編集"
                  >
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
        <TournamentFormModal
          opened
          tournament={editing}
          onClose={() => setEditing(null)}
        />
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
