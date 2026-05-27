import { Group, Select, Text } from "@mantine/core";
import { useEffect } from "react";

import {
  setCurrentTournamentId,
  useCurrentTournamentId,
} from "../../../stores/currentTournament";
import { useTournaments } from "../api/queries";

/**
 * TournamentSelector renders the global "currently focused tournament" widget
 * in the app header. The selection is persisted in localStorage and consumed
 * by every tournament-scoped feature.
 *
 * When the list loads and nothing is selected yet we auto-pick the first
 * tournament so users aren't dropped into an empty SPA the first time.
 */
export function TournamentSelector() {
  const currentId = useCurrentTournamentId();
  const { data, isLoading } = useTournaments();
  const tournaments = data?.data ?? [];

  useEffect(() => {
    if (isLoading) return;
    if (tournaments.length === 0) {
      if (currentId !== null) setCurrentTournamentId(null);
      return;
    }
    if (!currentId || !tournaments.some((t) => t.id === currentId)) {
      setCurrentTournamentId(tournaments[0].id);
    }
  }, [isLoading, tournaments, currentId]);

  if (isLoading) {
    return (
      <Text size="sm" c="dimmed">
        大会読み込み中…
      </Text>
    );
  }
  if (tournaments.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        大会未作成
      </Text>
    );
  }

  return (
    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
      <Text size="xs" c="dimmed" visibleFrom="sm">
        大会
      </Text>
      <Select
        size="xs"
        data={tournaments.map((t) => ({ value: t.id, label: t.name }))}
        value={currentId}
        onChange={(v) => setCurrentTournamentId(v)}
        allowDeselect={false}
        searchable
        w={{ base: 150, sm: 220 }}
      />
    </Group>
  );
}
