import { ActionIcon, Button, Group, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ResourcePage } from "../../components/layout/ResourcePage";
import type { Match } from "../../lib/api/client";
import { useDeleteMatch, useMatches } from "../../features/matches/api/queries";
import { useTeams } from "../../features/teams/api/queries";
import { MatchFormModal } from "../../features/matches/components/MatchFormModal";
import { useCurrentTournamentId } from "../../stores/currentTournament";

export const Route = createFileRoute("/matches/")({
  component: MatchesPage,
});

function MatchesPage() {
  const tournamentId = useCurrentTournamentId();
  const navigate = useNavigate();
  const teams = useTeams();
  const matches = useMatches();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Match | null>(null);

  const teamName = useMemo(() => {
    const m = new Map((teams.data?.data ?? []).map((t) => [t.id, t.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [teams.data]);

  const list = matches.data?.data ?? [];

  return (
    <ResourcePage
      title="試合 (Match)"
      description="現在の大会の対戦一覧。"
      isLoading={matches.isLoading}
      error={matches.error}
      onRetry={() => matches.refetch()}
      actions={
        <Button onClick={open} disabled={!tournamentId}>
          ＋ 試合を作成
        </Button>
      }
    >
      <Table striped highlightOnHover withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>対戦</Table.Th>
            <Table.Th>予定時刻</Table.Th>
            <Table.Th>作成日時</Table.Th>
            <Table.Th style={{ width: 110 }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((m) => (
            <Table.Tr
              key={m.id}
              style={{ cursor: "pointer" }}
              onClick={() =>
                navigate({ to: "/matches/$matchId", params: { matchId: m.id } })
              }
            >
              <Table.Td>
                <Text size="sm">
                  {teamName(m.teamAId)}{" "}
                  <Text component="span" c="dimmed">
                    vs
                  </Text>{" "}
                  {teamName(m.teamBId)}
                </Text>
              </Table.Td>
              <Table.Td>
                {m.scheduledAt
                  ? new Date(m.scheduledAt).toLocaleString()
                  : "—"}
              </Table.Td>
              <Table.Td>{new Date(m.createdAt).toLocaleString()}</Table.Td>
              <Table.Td onClick={(e) => e.stopPropagation()}>
                <Group gap={4}>
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setEditing(m)}
                    aria-label="編集"
                  >
                    ✏️
                  </ActionIcon>
                  <DeleteMatchButton id={m.id} />
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {list.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed" ta="center" py="md">
                  まだ試合がありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <MatchFormModal
        opened={opened}
        onClose={close}
        defaultTournamentId={tournamentId ?? undefined}
      />
      {editing && (
        <MatchFormModal
          opened
          match={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </ResourcePage>
  );
}

function DeleteMatchButton({ id }: { id: string }) {
  const del = useDeleteMatch();
  return (
    <ActionIcon
      variant="subtle"
      color="red"
      loading={del.isPending}
      onClick={() => {
        if (confirm("試合を削除しますか？")) del.mutate(id);
      }}
      aria-label="削除"
    >
      🗑️
    </ActionIcon>
  );
}
