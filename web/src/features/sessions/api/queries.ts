import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateSessionRequest,
  type SessionListParams,
  type UpdateSessionRequest,
  sessionsApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useSessions = (params: SessionListParams = {}) =>
  useQuery({
    queryKey: queryKeys.sessions(params),
    queryFn: () => sessionsApi.list({ limit: 200, ...params }),
  });

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
