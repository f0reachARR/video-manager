import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  encodingJobsApi,
  type UpdateVideoRequest,
  type VideoListParams,
  videosApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useVideos = (params: VideoListParams = {}) =>
  useQuery({
    queryKey: queryKeys.videos(params),
    queryFn: () => videosApi.list({ limit: 200, ...params }),
  });

export const useVideo = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["videos", "detail", id ?? ""] as const,
    queryFn: () => videosApi.get(id as string),
    enabled: !!id,
  });

export const useUpdateVideo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateVideoRequest }) =>
      videosApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["videos"] }),
  });
};

export const useDeleteVideo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => videosApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["videos"] }),
  });
};

// Per-video HLS rendition state. While `hlsStatus` is in flight we poll
// every 3 s so the UI reflects progress without manual refresh.
export const useVideoRenditions = (videoId: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.videoRenditions(videoId),
    queryFn: () => videosApi.renditions(videoId),
    enabled,
    refetchInterval: (q) => {
      const status = q.state.data?.hlsStatus;
      if (status === "ready" || status === "failed") return false;
      return 3000;
    },
  });

// Dashboard query: all videos currently encoding or recently failed.
// Polled while the page is open.
export const useEncodingJobs = (limit = 50) =>
  useQuery({
    queryKey: [...queryKeys.encodingJobs, limit] as const,
    queryFn: () => encodingJobsApi.list(limit),
    refetchInterval: 3000,
  });
