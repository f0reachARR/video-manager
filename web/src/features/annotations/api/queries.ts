import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateAnnotationRequest,
  type UpdateAnnotationRequest,
  annotationsApi,
} from "../../../lib/api/client";

export const useAnnotations = (videoId: string | null | undefined) =>
  useQuery({
    queryKey: ["annotations", videoId ?? ""] as const,
    queryFn: () => annotationsApi.list(videoId as string),
    enabled: !!videoId,
  });

export const useCreateAnnotation = (videoId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAnnotationRequest) => annotationsApi.create(videoId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annotations", videoId] }),
  });
};

export const useUpdateAnnotation = (videoId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAnnotationRequest }) =>
      annotationsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annotations", videoId] }),
  });
};

export const useDeleteAnnotation = (videoId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => annotationsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annotations", videoId] }),
  });
};
