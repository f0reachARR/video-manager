import { Alert, Badge, Grid, Group, Stack, Text, Title } from "@mantine/core";

import { ApiError, type Match } from "../../../lib/api/client";
import { useScoutingNoteByTeam } from "../../scouting-notes/api/queries";
import { ScoutingEditor } from "../../scouting-notes/components/ScoutingEditor";
import { useTeam } from "../../teams/api/queries";

export function ScoutingNotesSection({ match }: { match: Match }) {
  const teamA = useTeam(match.teamAId);
  const teamB = useTeam(match.teamBId);
  const noteA = useScoutingNoteByTeam(match.tournamentId, match.teamAId);
  const noteB = useScoutingNoteByTeam(match.tournamentId, match.teamBId);

  const slots: Array<{
    teamId: string;
    teamName: string;
    note: typeof noteA;
  }> = [
    {
      teamId: match.teamAId,
      teamName: teamA.data?.name ?? "Team A",
      note: noteA,
    },
    {
      teamId: match.teamBId,
      teamName: teamB.data?.name ?? "Team B",
      note: noteB,
    },
  ];

  return (
    <Stack gap="sm" mt="lg">
      <Title order={3}>スカウティングノート</Title>
      <Text size="xs" c="dimmed">
        大会 × 対戦相手チームごとに 1 つ。本文は Hocuspocus 経由でリアルタイム共同編集される。
      </Text>
      <Grid>
        {slots.map(({ teamId, teamName, note }) => (
          <Grid.Col key={teamId} span={{ base: 12, md: 6 }}>
            <Stack gap={4}>
              <Group gap="xs">
                <Badge>{teamName}</Badge>
                {note.data && (
                  <Text size="xs" c="dimmed">
                    更新: {new Date(note.data.updatedAt).toLocaleString()}
                  </Text>
                )}
              </Group>
              {note.data ? (
                <ScoutingEditor noteId={note.data.id} />
              ) : note.isLoading ? (
                <Text size="sm" c="dimmed">
                  読み込み中…
                </Text>
              ) : note.error ? (
                <Alert color="red">
                  {note.error instanceof ApiError
                    ? note.error.body.message
                    : String(note.error)}
                </Alert>
              ) : null}
            </Stack>
          </Grid.Col>
        ))}
      </Grid>
    </Stack>
  );
}
