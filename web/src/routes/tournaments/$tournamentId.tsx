import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
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
import { useTournament } from "../../features/tournaments/api/queries";
import { TournamentRobotsEditor } from "../../features/tournaments/components/TournamentRobotsEditor";
import { TournamentTeamsEditor } from "../../features/tournaments/components/TournamentTeamsEditor";

export const Route = createFileRoute("/tournaments/$tournamentId")({
  component: TournamentDetailPage,
});

function TournamentDetailPage() {
  const { tournamentId } = Route.useParams();
  const navigate = useNavigate();
  const tournament = useTournament(tournamentId);

  if (tournament.isLoading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }
  if (tournament.error || !tournament.data) {
    return (
      <Alert color="red" m="md">
        {tournament.error instanceof ApiError
          ? tournament.error.body.message
          : (tournament.error as Error)?.message}
      </Alert>
    );
  }
  const t = tournament.data;

  return (
    <Stack maw={1100} mx="auto" p="md">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Group gap="sm">
            <Button
              size="xs"
              variant="subtle"
              onClick={() => navigate({ to: "/tournaments" })}
            >
              ← 大会一覧
            </Button>
            <Title order={2}>{t.name}</Title>
          </Group>
          <Group gap="xs">
            <Badge variant="light">
              {t.startDate ?? "?"} — {t.endDate ?? "?"}
            </Badge>
            <Text size="xs" c="dimmed" ff="monospace">
              {t.id}
            </Text>
          </Group>
        </Stack>
        <Anchor
          component="button"
          onClick={() =>
            navigate({
              to: "/matches",
              search: { tournamentId: t.id } as never,
            })
          }
        >
          試合一覧へ →
        </Anchor>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder padding="md">
            <TournamentTeamsEditor tournamentId={t.id} />
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder padding="md">
            <TournamentRobotsEditor tournamentId={t.id} />
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
