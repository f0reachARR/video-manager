import {
  Badge,
  Box,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMemo } from "react";

import { type Robot, type Team } from "../../../lib/api/client";
import { useTournamentRobots, useTournamentTeams } from "../api/queries";

type Props = { tournamentId: string };

// Robots are (tournament, team) scoped — there's no longer a "register"
// step. This panel just shows what robots exist in this tournament, grouped
// by team. Robot creation happens on the /robots page (filtered by current
// tournament) or inline in the "新規チーム" flow.
export function TournamentRobotsEditor({ tournamentId }: Props) {
  const teams = useTournamentTeams(tournamentId);
  const current = useTournamentRobots(tournamentId);

  const participatingTeams = teams.data?.data ?? [];
  const robotsByTeam = useMemo(() => {
    const map = new Map<string, Robot[]>();
    for (const r of current.data?.data ?? []) {
      const list = map.get(r.teamId) ?? [];
      list.push(r);
      map.set(r.teamId, list);
    }
    return map;
  }, [current.data]);

  const isLoading = teams.isLoading || current.isLoading;

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Title order={4}>持ち込みロボット</Title>
        <Badge variant="light">{current.data?.data.length ?? 0} 件</Badge>
      </Group>
      <Text size="xs" c="dimmed">
        ロボットは (大会, チーム) ごとに別レコード。追加はマスタ管理の「ロボット」または
        「チーム」新規作成ダイアログから。
      </Text>
      {isLoading && (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            読み込み中…
          </Text>
        </Group>
      )}
      {!isLoading && participatingTeams.length === 0 && (
        <Text size="sm" c="dimmed">
          先に「参加チーム」を保存してください。
        </Text>
      )}
      <Stack gap="md">
        {participatingTeams.map((t: Team) => {
          const robots = robotsByTeam.get(t.id) ?? [];
          return (
            <Box key={t.id}>
              <Group gap="xs" mb={4}>
                <Text fw={500}>{t.name}</Text>
                {t.isOwn && (
                  <Badge size="xs" color="blue">
                    自チーム
                  </Badge>
                )}
                <Text size="xs" c="dimmed">
                  {robots.length} 機
                </Text>
              </Group>
              {robots.length === 0 ? (
                <Text size="xs" c="dimmed" pl="md">
                  このチームのロボットがこの大会にまだ登録されていません。
                </Text>
              ) : (
                <Stack gap={2} pl="md">
                  {robots.map((r) => (
                    <Text key={r.id} size="sm">
                      {r.name}
                      {r.version && (
                        <Text component="span" c="dimmed" ml={6}>
                          ({r.version})
                        </Text>
                      )}
                    </Text>
                  ))}
                </Stack>
              )}
              <Divider mt="xs" />
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
