import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import { ApiError, type Team } from "../../../lib/api/client";
import { useTeams } from "../../teams/api/queries";
import {
  useReplaceTournamentTeams,
  useTournamentTeams,
} from "../api/queries";

type Props = { tournamentId: string };

export function TournamentTeamsEditor({ tournamentId }: Props) {
  const allTeams = useTeams();
  const current = useTournamentTeams(tournamentId);
  const replace = useReplaceTournamentTeams(tournamentId);
  const [selected, setSelected] = useState<Set<string> | null>(null);

  // Seed selection from the server response on first load / refetch.
  useEffect(() => {
    if (!current.data) return;
    setSelected(new Set(current.data.data.map((t) => t.id)));
  }, [current.data]);

  const list = useMemo<Team[]>(
    () => allTeams.data?.data ?? [],
    [allTeams.data],
  );
  const selectedSet = selected ?? new Set<string>();
  const dirty = useMemo(() => {
    if (!current.data) return false;
    const before = new Set(current.data.data.map((t) => t.id));
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
    replace.mutate({ teamIds: Array.from(selected) });
  };

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group gap="xs">
          <Title order={4}>参加チーム</Title>
          <Badge variant="light">{selectedSet.size} 件選択</Badge>
        </Group>
        <Button
          size="xs"
          onClick={save}
          loading={replace.isPending}
          disabled={!dirty || current.isLoading}
        >
          保存
        </Button>
      </Group>
      {replace.error && (
        <Alert color="red">
          {replace.error instanceof ApiError
            ? replace.error.body.message
            : (replace.error as Error).message}
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        参加から外したチームの「持ち込みロボット」紐付けも自動で外れます。
      </Text>
      <Stack gap={4}>
        {list.map((t) => (
          <Checkbox
            key={t.id}
            label={
              <Group gap="xs">
                <Text>{t.name}</Text>
                {t.isOwn && (
                  <Badge size="xs" color="blue">
                    自チーム
                  </Badge>
                )}
              </Group>
            }
            checked={selectedSet.has(t.id)}
            onChange={() => toggle(t.id)}
          />
        ))}
        {list.length === 0 && !allTeams.isLoading && (
          <Text size="sm" c="dimmed">
            チームがまだ登録されていません。
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
