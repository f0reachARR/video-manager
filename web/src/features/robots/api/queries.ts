import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateRobotRequest,
  type RobotListParams,
  type UpdateRobotRequest,
  robotsApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";
import { useCurrentTournamentId } from "../../../stores/currentTournament";

export const useRobots = (
  params: Omit<RobotListParams, "tournamentId"> = {},
) => {
  const tournamentId = useCurrentTournamentId();
  return useQuery({
    queryKey: queryKeys.robots({ ...params, tournamentId: tournamentId ?? "" }),
    queryFn: () =>
      robotsApi.list({ limit: 200, ...params, tournamentId: tournamentId! }),
    enabled: !!tournamentId,
  });
};

export const useRobot = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["robots", "detail", id ?? ""] as const,
    queryFn: () => robotsApi.get(id as string),
    enabled: !!id,
  });

export const useCreateRobot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRobotRequest) => robotsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["robots"] }),
  });
};

export const useUpdateRobot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRobotRequest }) =>
      robotsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["robots"] }),
  });
};

export const useDeleteRobot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => robotsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["robots"] }),
  });
};
