import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateSessionRequest,
  type SessionListParams,
  type UpdateSessionRequest,
  sessionsApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";
import { useCurrentTournamentId } from "../../../stores/currentTournament";

export const useSessions = (
  params: Omit<SessionListParams, "tournamentId"> = {},
) => {
  const tournamentId = useCurrentTournamentId();
  return useQuery({
    queryKey: queryKeys.sessions({
      ...params,
      tournamentId: tournamentId ?? "",
    }),
    queryFn: () =>
      sessionsApi.list({ limit: 200, ...params, tournamentId: tournamentId! }),
    enabled: !!tournamentId,
  });
};

export const useCreateSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSessionRequest) => sessionsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
};

export const useUpdateSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSessionRequest }) =>
      sessionsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
};

export const useDeleteSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sessionsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
};
