import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateMatchRequest,
  type MatchListParams,
  type UpdateMatchRequest,
  matchesApi,
} from "../../../lib/api/client";
import { useCurrentTournamentId } from "../../../stores/currentTournament";

export const useMatch = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["matches", "detail", id ?? ""] as const,
    queryFn: () => matchesApi.get(id as string),
    enabled: !!id,
  });

export const useMatches = (
  params: Omit<MatchListParams, "tournamentId"> = {},
) => {
  const tournamentId = useCurrentTournamentId();
  return useQuery({
    queryKey: ["matches", { ...params, tournamentId }] as const,
    queryFn: () =>
      matchesApi.list({ limit: 200, ...params, tournamentId: tournamentId! }),
    enabled: !!tournamentId,
  });
};

export const useCreateMatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMatchRequest) => matchesApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["matches"] }),
  });
};

export const useUpdateMatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMatchRequest }) =>
      matchesApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["matches"] }),
  });
};

export const useDeleteMatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => matchesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["matches"] }),
  });
};
