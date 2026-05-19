import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AddRunVideoRequest,
  type CreateRunRequest,
  type RunListParams,
  type UpdateRunRequest,
  type UpdateRunVideoRequest,
  runsApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useRuns = (params: RunListParams = {}) =>
  useQuery({
    queryKey: queryKeys.runs(params),
    queryFn: () => runsApi.list({ limit: 200, ...params }),
  });

export const useRun = (id: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.run(id ?? ""),
    queryFn: () => runsApi.get(id as string),
    enabled: !!id,
  });

export const useCreateRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRunRequest) => runsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

export const useUpdateRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRunRequest }) =>
      runsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

export const useDeleteRun = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

export const useAddRunVideo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, body }: { runId: string; body: AddRunVideoRequest }) =>
      runsApi.addVideo(runId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

export const useUpdateRunVideo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      runId,
      runVideoId,
      body,
    }: {
      runId: string;
      runVideoId: string;
      body: UpdateRunVideoRequest;
    }) => runsApi.updateVideo(runId, runVideoId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

export const useRemoveRunVideo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, runVideoId }: { runId: string; runVideoId: string }) =>
      runsApi.removeVideo(runId, runVideoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
};

export const useRecommendedRunVideos = (runId: string | null | undefined) =>
  useQuery({
    queryKey: ["runs", runId, "recommended-videos"] as const,
    queryFn: () => runsApi.recommendedVideos(runId as string),
    enabled: !!runId,
  });
