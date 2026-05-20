import { Group, Select, Stack, Text } from "@mantine/core";
import { useMemo } from "react";

import {
  useTournamentRobots,
  useTournamentTeams,
} from "../../tournaments/api/queries";
import { useRobots } from "../../robots/api/queries";

type Props = {
  tournamentId: string | null;
  teamId: string | null;
  robotId: string | null;
  onTeamChange: (v: string | null) => void;
  onRobotChange: (v: string | null) => void;
};

// Per the A2 design: prefer tournament-specific robot list, but if the
// tournament has no robot links for a team, fall back to that team's full
// robot roster so the picker is still usable. The fallback is documented
// in the tournament-detail editor.
export function TeamRobotSelector({
  tournamentId,
  teamId,
  robotId,
  onTeamChange,
  onRobotChange,
}: Props) {
  const teams = useTournamentTeams(tournamentId);
  const tournamentRobots = useTournamentRobots(tournamentId);
  // The fallback list ("team has no tournament robots → show team's
  // whole roster") needs robots scoped to the team. We always issue the
  // query so the hook order is stable; when teamId is null the param
  // simply yields the global page, which we ignore.
  const teamRobots = useRobots(teamId ? { teamId, limit: 200 } : {});

  const teamOptions = useMemo(
    () =>
      (teams.data?.data ?? []).map((t) => ({
        value: t.id,
        label: t.isOwn ? `${t.name} (自チーム)` : t.name,
      })),
    [teams.data],
  );

  const robotOptions = useMemo(() => {
    if (!teamId) return [];
    const tournamentList = (tournamentRobots.data?.data ?? []).filter(
      (r) => r.teamId === teamId,
    );
    if (tournamentList.length > 0) {
      return tournamentList.map((r) => ({
        value: r.id,
        label: r.version ? `${r.name} (${r.version})` : r.name,
      }));
    }
    // Fallback: team's full roster (filter client-side in case the query
    // wasn't scoped, e.g. cached page).
    return (teamRobots.data?.data ?? [])
      .filter((r) => r.teamId === teamId)
      .map((r) => ({
        value: r.id,
        label: r.version ? `${r.name} (${r.version})` : r.name,
      }));
  }, [teamId, tournamentRobots.data, teamRobots.data]);

  return (
    <Stack gap={4}>
      <Group gap="sm" align="flex-end">
        <Select
          label="チーム"
          data={teamOptions}
          value={teamId}
          onChange={(v) => {
            onTeamChange(v);
            // Reset robot when team changes — old robot likely belongs to
            // the previous team.
            onRobotChange(null);
          }}
          disabled={!tournamentId}
          placeholder={tournamentId ? "参加チームを選ぶ" : "先に大会を選択"}
          searchable
          clearable
          w={220}
        />
        <Select
          label="ロボット"
          data={robotOptions}
          value={robotId}
          onChange={onRobotChange}
          disabled={!teamId}
          placeholder={teamId ? "ロボットを選ぶ" : "先にチームを選択"}
          searchable
          clearable
          w={220}
        />
      </Group>
      {tournamentId && (tournamentRobots.data?.data ?? []).length === 0 && (
        <Text size="xs" c="dimmed">
          大会に持ち込みロボットが登録されていないため、各チームの全ロボットを候補にしています。
        </Text>
      )}
    </Stack>
  );
}
