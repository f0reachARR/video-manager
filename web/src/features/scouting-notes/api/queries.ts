import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { scoutingNotesApi } from "../../../lib/api/client";

export const useScoutingNotesByTournament = (
  tournamentId: string | null | undefined,
) =>
  useQuery({
    queryKey: [
      "scouting-notes",
      "by-tournament",
      tournamentId ?? "",
    ] as const,
    queryFn: () => scoutingNotesApi.listByTournament(tournamentId as string),
    enabled: !!tournamentId,
  });

// Idempotent upsert-on-read against the API. Returns the note for (tournament,
// team) — auto-creating it the first time so the SPA can mount the editor
// immediately.
export const useScoutingNoteByTeam = (
  tournamentId: string | null | undefined,
  teamId: string | null | undefined,
) =>
  useQuery({
    queryKey: [
      "scouting-notes",
      "by-team",
      tournamentId ?? "",
      teamId ?? "",
    ] as const,
    queryFn: () =>
      scoutingNotesApi.getByTeam(tournamentId as string, teamId as string),
    enabled: !!tournamentId && !!teamId,
  });

export const useScoutingNote = (noteId: string | null | undefined) =>
  useQuery({
    queryKey: ["scouting-notes", "detail", noteId ?? ""] as const,
    queryFn: () => scoutingNotesApi.get(noteId as string),
    enabled: !!noteId,
  });

export const useDeleteScoutingNote = (tournamentId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => scoutingNotesApi.remove(id),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["scouting-notes", "by-tournament", tournamentId],
      }),
  });
};
