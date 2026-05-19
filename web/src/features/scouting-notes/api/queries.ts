import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateScoutingNoteRequest,
  scoutingNotesApi,
} from "../../../lib/api/client";

export const useScoutingNotesByMatch = (matchId: string | null | undefined) =>
  useQuery({
    queryKey: ["scouting-notes", "by-match", matchId ?? ""] as const,
    queryFn: () => scoutingNotesApi.listByMatch(matchId as string),
    enabled: !!matchId,
  });

export const useScoutingNote = (noteId: string | null | undefined) =>
  useQuery({
    queryKey: ["scouting-notes", "detail", noteId ?? ""] as const,
    queryFn: () => scoutingNotesApi.get(noteId as string),
    enabled: !!noteId,
  });

export const useCreateScoutingNote = (matchId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateScoutingNoteRequest) =>
      scoutingNotesApi.create(matchId, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["scouting-notes", "by-match", matchId] }),
  });
};

export const useDeleteScoutingNote = (matchId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => scoutingNotesApi.remove(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["scouting-notes", "by-match", matchId] }),
  });
};
