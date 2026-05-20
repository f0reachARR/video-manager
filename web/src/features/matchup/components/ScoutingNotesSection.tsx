import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { ApiError, type Match } from "../../../lib/api/client";
import {
  useCreateScoutingNote,
  useDeleteScoutingNote,
  useScoutingNotesByMatch,
} from "../../scouting-notes/api/queries";
import { ScoutingEditor } from "../../scouting-notes/components/ScoutingEditor";
import { useTeam } from "../../teams/api/queries";

export function ScoutingNotesSection({ match }: { match: Match }) {
  const notes = useScoutingNotesByMatch(match.id);
  const create = useCreateScoutingNote(match.id);
  const del = useDeleteScoutingNote(match.id);
  const teamA = useTeam(match.teamAId);
  const teamB = useTeam(match.teamBId);

  const list = notes.data?.data ?? [];

  const teamName = (id: string) =>
    id === match.teamAId
      ? (teamA.data?.name ?? "Team A")
      : id === match.teamBId
        ? (teamB.data?.name ?? "Team B")
        : id.slice(0, 8);

  const noteForTeam = (teamId: string) =>
    list.find((n) => n.targetTeamId === teamId);

  return (
    <Stack gap="sm" mt="lg">
      <Title order={3}>スカウティングノート</Title>
      <Text size="xs" c="dimmed">
        対戦相手チームごとに 1 つ。本文は Hocuspocus 経由でリアルタイム共同編集される。
      </Text>
      <Grid>
        {[match.teamAId, match.teamBId].map((tid) => {
          const note = noteForTeam(tid);
          return (
            <Grid.Col key={tid} span={{ base: 12, md: 6 }}>
              <Stack gap={4}>
                <Group justify="space-between">
                  <Group gap="xs">
                    <Badge>{teamName(tid)}</Badge>
                    {note && (
                      <Text size="xs" c="dimmed">
                        更新: {new Date(note.updatedAt).toLocaleString()}
                      </Text>
                    )}
                  </Group>
                  {note ? (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      loading={del.isPending}
                      onClick={() => {
                        if (confirm("このノートを削除しますか？"))
                          del.mutate(note.id);
                      }}
                    >
                      削除
                    </Button>
                  ) : (
                    <Button
                      size="compact-xs"
                      variant="light"
                      loading={create.isPending}
                      onClick={() => create.mutate({ targetTeamId: tid })}
                    >
                      ノート作成
                    </Button>
                  )}
                </Group>
                {note ? (
                  <ScoutingEditor noteId={note.id} />
                ) : (
                  <EmptyNotePlaceholder />
                )}
              </Stack>
            </Grid.Col>
          );
        })}
      </Grid>
      {notes.error && (
        <Alert color="red">
          {notes.error instanceof ApiError
            ? notes.error.body.message
            : String(notes.error)}
        </Alert>
      )}
    </Stack>
  );
}

function EmptyNotePlaceholder() {
  return (
    <Card withBorder p="md">
      <Text c="dimmed" ta="center" size="sm">
        まだノートがありません
      </Text>
    </Card>
  );
}
