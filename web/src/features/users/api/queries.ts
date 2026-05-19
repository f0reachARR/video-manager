import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  type CreateUserRequest,
  type UpdateUserRequest,
  usersApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useUser = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["users", "detail", id ?? ""] as const,
    queryFn: () => usersApi.get(id as string),
    enabled: !!id,
  });

export const useUsers = () =>
  useQuery({ queryKey: queryKeys.users, queryFn: () => usersApi.list({ limit: 200 }) });

export const useCreateUser = (
  opts?: UseMutationOptions<unknown, Error, CreateUserRequest>,
) => {
  const qc = useQueryClient();
  return useMutation({
    ...opts,
    mutationFn: (body: CreateUserRequest) => usersApi.create(body),
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: queryKeys.users });
      opts?.onSuccess?.(...args);
    },
  });
};

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserRequest }) =>
      usersApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  });
};

export const useDeleteUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  });
};
