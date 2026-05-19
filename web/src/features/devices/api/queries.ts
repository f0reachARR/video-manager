import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateDeviceRequest,
  type UpdateDeviceRequest,
  devicesApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useDevices = () =>
  useQuery({ queryKey: queryKeys.devices, queryFn: () => devicesApi.list({ limit: 200 }) });

export const useCreateDevice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDeviceRequest) => devicesApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices }),
  });
};

export const useUpdateDevice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateDeviceRequest }) =>
      devicesApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices }),
  });
};

export const useDeleteDevice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => devicesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.devices }),
  });
};
