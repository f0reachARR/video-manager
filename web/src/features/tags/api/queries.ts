import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateTagRequest,
  type UpdateTagRequest,
  tagsApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useTags = () =>
  useQuery({ queryKey: queryKeys.tags, queryFn: () => tagsApi.list({ limit: 200 }) });

export const useCreateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTagRequest) => tagsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
};

export const useUpdateTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTagRequest }) =>
      tagsApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
};

export const useDeleteTag = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tagsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags }),
  });
};
