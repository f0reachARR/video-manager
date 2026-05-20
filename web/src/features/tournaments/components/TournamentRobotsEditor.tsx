import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import { ApiError, type Robot, type Team } from "../../../lib/api/client";
import { useRobots } from "../../robots/api/queries";
import {
  useReplaceTournamentRobots,
  useTournamentRobots,
  useTournamentTeams,
} from "../api/queries";

type Props = { tournamentId: string };

export function TournamentRobotsEditor({ tournamentId }: Props) {
  const teams = useTournamentTeams(tournamentId);
  const allRobots = useRobots();
  const current = useTournamentRobots(tournamentId);
  const replace = useReplaceTournamentRobots(tournamentId);
  const [selected, setSelected] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!current.data) return;
    setSelected(new Set(current.data.data.map((r) => r.id)));
  }, [current.data]);

  const selectedSet = selected ?? new Set<string>();

  const participatingTeams = teams.data?.data ?? [];
  const robotsByTeam = useMemo(() => {
    const map = new Map<string, Robot[]>();
    for (const r of allRobots.data?.data ?? []) {
      const list = map.get(r.teamId) ?? [];
      list.push(r);
      map.set(r.teamId, list);
    }
    return map;
  }, [allRobots.data]);

  const dirty = useMemo(() => {
    if (!current.data) return false;
    const before = new Set(current.data.data.map((r) => r.id));
    if (before.size !== selectedSet.size) return true;
    for (const id of before) if (!selectedSet.has(id)) return true;
    return false;
  }, [current.data, selectedSet]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = () => {
    if (!selected) return;
    replace.mutate({ robotIds: Array.from(selected) });
  };

  const isLoading = teams.isLoading || allRobots.isLoading || current.isLoading;

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group gap="xs">
          <Title order={4}>持ち込みロボット</Title>
          <Badge variant="light">{selectedSet.size} 件選択</Badge>
        </Group>
        <Button
          size="xs"
          onClick={save}
          loading={replace.isPending}
          disabled={!dirty || isLoading}
        >
          保存
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        参加チーム配下のロボットのみ選択できます。未選択のチームは「team
        の全ロボット候補」として一括アップロード時に fallback されます。
      </Text>
      {replace.error && (
        <Alert color="red">
          {replace.error instanceof ApiError
            ? replace.error.body.message
            : (replace.error as Error).message}
        </Alert>
      )}
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
                  このチームのロボットが未登録です。
                </Text>
              ) : (
                <Stack gap={2} pl="md">
                  {robots.map((r) => (
                    <Checkbox
                      key={r.id}
                      label={
                        <Text>
                          {r.name}
                          {r.version && (
                            <Text component="span" c="dimmed" ml={6}>
                              ({r.version})
                            </Text>
                          )}
                        </Text>
                      }
                      checked={selectedSet.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
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
