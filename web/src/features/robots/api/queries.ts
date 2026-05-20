import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateRobotRequest,
  type RobotListParams,
  type UpdateRobotRequest,
  robotsApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useRobots = (params: RobotListParams = {}) =>
  useQuery({
    queryKey: queryKeys.robots(params),
    queryFn: () => robotsApi.list({ limit: 200, ...params }),
  });

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
