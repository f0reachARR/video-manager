import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateTournamentRequest,
  type ReplaceTournamentRobotsRequest,
  type ReplaceTournamentTeamsRequest,
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

// ---- Tournament links (teams / robots) ----

export const useTournamentTeams = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["tournaments", "teams", id ?? ""] as const,
    queryFn: () => tournamentsApi.listTeams(id as string),
    enabled: !!id,
  });

export const useReplaceTournamentTeams = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReplaceTournamentTeamsRequest) =>
      tournamentsApi.replaceTeams(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tournaments", "teams", id] });
      // Removing a team may have cascaded to robot links — refresh them too.
      qc.invalidateQueries({ queryKey: ["tournaments", "robots", id] });
    },
  });
};

export const useTournamentRobots = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["tournaments", "robots", id ?? ""] as const,
    queryFn: () => tournamentsApi.listRobots(id as string),
    enabled: !!id,
  });

export const useReplaceTournamentRobots = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReplaceTournamentRobotsRequest) =>
      tournamentsApi.replaceRobots(id, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["tournaments", "robots", id] }),
  });
};
