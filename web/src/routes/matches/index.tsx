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
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ResourcePage } from "../../components/layout/ResourcePage";
import type { Match } from "../../lib/api/client";
import {
  useCreateMatch,
  useDeleteMatch,
  useMatches,
  useTeams,
  useTournaments,
  useUpdateMatch,
} from "../../lib/queries";

type MatchesSearch = { tournamentId?: string };

export const Route = createFileRoute("/matches/")({
  component: MatchesPage,
  validateSearch: (search: Record<string, unknown>): MatchesSearch => ({
    tournamentId: typeof search.tournamentId === "string" ? search.tournamentId : undefined,
  }),
});

function MatchesPage() {
  const { tournamentId } = Route.useSearch();
  const searchNavigate = Route.useNavigate();
  const navigate = useNavigate();
  const tournaments = useTournaments();
  const teams = useTeams();
  const matches = useMatches(tournamentId ? { tournamentId } : {});
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Match | null>(null);

  const teamName = useMemo(() => {
    const m = new Map((teams.data?.data ?? []).map((t) => [t.id, t.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [teams.data]);
  const tournamentName = useMemo(() => {
    const m = new Map((tournaments.data?.data ?? []).map((t) => [t.id, t.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [tournaments.data]);

  const list = matches.data?.data ?? [];

  return (
    <ResourcePage
      title="試合 (Match)"
      description="Tournament 配下の対戦。Phase 2 で導入。"
      isLoading={matches.isLoading}
      error={matches.error}
      onRetry={() => matches.refetch()}
      actions={
        <Group>
          <Select
            placeholder="Tournament で絞り込み"
            data={(tournaments.data?.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
            value={tournamentId ?? null}
            onChange={(v) => searchNavigate({ search: { tournamentId: v ?? undefined } })}
            clearable
            w={260}
            size="sm"
          />
          <Button onClick={open} disabled={(tournaments.data?.data ?? []).length === 0}>
            ＋ 試合を作成
          </Button>
        </Group>
      }
    >
      <Table striped highlightOnHover withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>大会</Table.Th>
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
              onClick={() => navigate({ to: "/matches/$matchId", params: { matchId: m.id } })}
            >
              <Table.Td>
                <Badge variant="light">{tournamentName(m.tournamentId)}</Badge>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  {teamName(m.teamAId)} <Text component="span" c="dimmed">vs</Text> {teamName(m.teamBId)}
                </Text>
              </Table.Td>
              <Table.Td>{m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : "—"}</Table.Td>
              <Table.Td>{new Date(m.createdAt).toLocaleString()}</Table.Td>
              <Table.Td onClick={(e) => e.stopPropagation()}>
                <Group gap={4}>
                  <ActionIcon variant="subtle" onClick={() => setEditing(m)} aria-label="編集">
                    ✏️
                  </ActionIcon>
                  <DeleteMatchButton id={m.id} />
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {list.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text c="dimmed" ta="center" py="md">
                  まだ試合がありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <MatchFormModal opened={opened} onClose={close} defaultTournamentId={tournamentId} />
      {editing && (
        <MatchFormModal opened match={editing} onClose={() => setEditing(null)} />
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

function MatchFormModal({
  opened,
  onClose,
  match,
  defaultTournamentId,
}: {
  opened: boolean;
  onClose: () => void;
  match?: Match;
  defaultTournamentId?: string;
}) {
  const tournaments = useTournaments();
  const teams = useTeams();
  const create = useCreateMatch();
  const update = useUpdateMatch();

  const [tournamentId, setTournamentId] = useState<string | null>(
    match?.tournamentId ?? defaultTournamentId ?? null,
  );
  const [teamAId, setTeamAId] = useState<string | null>(match?.teamAId ?? null);
  const [teamBId, setTeamBId] = useState<string | null>(match?.teamBId ?? null);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(
    match?.scheduledAt ? new Date(match.scheduledAt) : null,
  );

  const submit = () => {
    if (match) {
      update.mutate(
        {
          id: match.id,
          body: {
            teamAId: teamAId ?? undefined,
            teamBId: teamBId ?? undefined,
            scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
          },
        },
        { onSuccess: onClose },
      );
    } else {
      if (!tournamentId || !teamAId || !teamBId) return;
      create.mutate(
        {
          tournamentId,
          teamAId,
          teamBId,
          scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
        },
        { onSuccess: onClose },
      );
    }
  };
  const busy = create.isPending || update.isPending;
  const teamOpts = (teams.data?.data ?? []).map((t) => ({ value: t.id, label: t.name }));

  return (
    <Modal opened={opened} onClose={onClose} title={match ? "試合を編集" : "試合を作成"}>
      <Stack>
        {!match && (
          <Select
            label="Tournament"
            data={(tournaments.data?.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
            value={tournamentId}
            onChange={setTournamentId}
            required
          />
        )}
        <Group grow>
          <Select label="Team A" data={teamOpts} value={teamAId} onChange={setTeamAId} required searchable />
          <Select label="Team B" data={teamOpts} value={teamBId} onChange={setTeamBId} required searchable />
        </Group>
        <DateTimePicker
          label="予定時刻 (任意)"
          value={scheduledAt}
          onChange={(v) => setScheduledAt(v ? new Date(v) : null)}
          clearable
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            loading={busy}
            disabled={
              !teamAId ||
              !teamBId ||
              teamAId === teamBId ||
              (!match && !tournamentId)
            }
          >
            {match ? "保存" : "作成"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
