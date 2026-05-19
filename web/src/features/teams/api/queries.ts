import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateTeamRequest,
  type UpdateTeamRequest,
  teamsApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useTeams = () =>
  useQuery({ queryKey: queryKeys.teams, queryFn: () => teamsApi.list({ limit: 200 }) });

export const useTeam = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["teams", "detail", id ?? ""] as const,
    queryFn: () => teamsApi.get(id as string),
    enabled: !!id,
  });

export const useTeamMarkerStats = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["teams", "marker-stats", id ?? ""] as const,
    queryFn: () => teamsApi.markerStats(id as string),
    enabled: !!id,
  });

export const useCreateTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTeamRequest) => teamsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teams }),
  });
};

export const useUpdateTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTeamRequest }) =>
      teamsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teams }),
  });
};

export const useDeleteTeam = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => teamsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teams }),
  });
};
