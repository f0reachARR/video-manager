import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type UpdateRobotImageRequest,
  robotImagesApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useRobotImages = (robotId: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.robotImages(robotId ?? ""),
    queryFn: () => robotImagesApi.list(robotId as string),
    enabled: !!robotId,
  });

export const useRunRobotImages = (runId: string | null | undefined) =>
  useQuery({
    queryKey: queryKeys.runRobotImages(runId ?? ""),
    queryFn: () => robotImagesApi.listForRun(runId as string),
    enabled: !!runId,
  });

export const useUploadRobotImages = (robotId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ files, caption }: { files: File[]; caption?: string }) =>
      robotImagesApi.upload(robotId, files, caption),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.robotImages(robotId) });
      // Robot list shows the primary image thumb — invalidate too.
      qc.invalidateQueries({ queryKey: ["robots"] });
    },
  });
};

export const useUpdateRobotImage = (robotId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRobotImageRequest }) =>
      robotImagesApi.update(id, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.robotImages(robotId) }),
  });
};

export const useDeleteRobotImage = (robotId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => robotImagesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.robotImages(robotId) });
      qc.invalidateQueries({ queryKey: ["robots"] });
    },
  });
};

export const useSetPrimaryRobotImage = (robotId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string | null) =>
      robotImagesApi.setPrimary(robotId, imageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.robotImages(robotId) });
      qc.invalidateQueries({ queryKey: ["robots"] });
    },
  });
};
