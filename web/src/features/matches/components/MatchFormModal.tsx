import { Button, Group, Modal, Select, Stack } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useState } from "react";

import type { Match } from "../../../lib/api/client";
import { useTeams } from "../../teams/api/queries";
import { useTournaments } from "../../tournaments/api/queries";
import { useCreateMatch, useUpdateMatch } from "../api/queries";

export function MatchFormModal({
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
  const teamOpts = (teams.data?.data ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));

  return (
    <Modal opened={opened} onClose={onClose} title={match ? "試合を編集" : "試合を作成"}>
      <Stack>
        {!match && (
          <Select
            label="Tournament"
            data={(tournaments.data?.data ?? []).map((t) => ({
              value: t.id,
              label: t.name,
            }))}
            value={tournamentId}
            onChange={setTournamentId}
            required
          />
        )}
        <Group grow>
          <Select
            label="Team A"
            data={teamOpts}
            value={teamAId}
            onChange={setTeamAId}
            required
            searchable
          />
          <Select
            label="Team B"
            data={teamOpts}
            value={teamBId}
            onChange={setTeamBId}
            required
            searchable
          />
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
