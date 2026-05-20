import {
  Alert,
  Button,
  Center,
  Grid,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ApiError } from "../../lib/api/client";
import { useMatch } from "../../features/matches/api/queries";
import { MatchHeader } from "../../features/matchup/components/MatchHeader";
import { ScoutingNotesSection } from "../../features/matchup/components/ScoutingNotesSection";
import { TeamPanel } from "../../features/matchup/components/TeamPanel";

export const Route = createFileRoute("/matches/$matchId")({
  component: MatchDetailPage,
});

function MatchDetailPage() {
  const { matchId } = Route.useParams();
  const navigate = useNavigate();
  const match = useMatch(matchId);

  if (match.isLoading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }
  if (match.error || !match.data) {
    return (
      <Alert color="red" m="md">
        {match.error instanceof ApiError
          ? match.error.body.message
          : (match.error as Error)?.message}
      </Alert>
    );
  }
  const m = match.data;

  return (
    <Stack maw={1280} mx="auto">
      <Group justify="space-between">
        <Stack gap={4}>
          <Group gap="sm">
            <Button
              size="xs"
              variant="subtle"
              onClick={() => navigate({ to: "/matches" })}
            >
              ← 試合一覧
            </Button>
            <Title order={2}>マッチアップ</Title>
          </Group>
          <Text size="xs" c="dimmed" ff="monospace">
            {m.id}
          </Text>
        </Stack>
      </Group>

      <MatchHeader match={m} />

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TeamPanel teamId={m.teamAId} role="A" />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TeamPanel teamId={m.teamBId} role="B" />
        </Grid.Col>
      </Grid>

      <ScoutingNotesSection match={m} />
    </Stack>
  );
}
