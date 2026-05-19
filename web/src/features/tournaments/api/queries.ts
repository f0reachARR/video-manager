import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateTournamentRequest,
  type UpdateTournamentRequest,
  tournamentsApi,
} from "../../../lib/api/client";

export const useTournaments = () =>
  useQuery({
    queryKey: ["tournaments"] as const,
    queryFn: () => tournamentsApi.list({ limit: 200 }),
  });

export const useTournament = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["tournaments", "detail", id ?? ""] as const,
    queryFn: () => tournamentsApi.get(id as string),
    enabled: !!id,
  });

export const useCreateTournament = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTournamentRequest) => tournamentsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tournaments"] }),
  });
};

export const useUpdateTournament = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTournamentRequest }) =>
      tournamentsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tournaments"] }),
  });
};

export const useDeleteTournament = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tournamentsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tournaments"] }),
  });
};
