import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateMarkerRequest,
  type MarkerCategory,
  type MarkerListParams,
  type UpdateMarkerRequest,
  markersApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useMarkers = (
  runId: string | null | undefined,
  params: MarkerListParams = {},
) =>
  useQuery({
    queryKey: queryKeys.markers(runId ?? "", params),
    queryFn: () => markersApi.list(runId as string, { limit: 200, ...params }),
    enabled: !!runId,
  });

export const useCreateMarker = (runId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMarkerRequest) => markersApi.create(runId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markers", runId] }),
  });
};

export const useUpdateMarker = (runId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMarkerRequest }) =>
      markersApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markers", runId] }),
  });
};

export const useDeleteMarker = (runId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["markers", runId] }),
  });
};

export const useMarker = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["markers", "detail", id ?? ""] as const,
    queryFn: () => markersApi.get(id as string),
    enabled: !!id,
  });

export const markerCategories: MarkerCategory[] = ["success", "failure", "note"];
