import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CreateScenarioRequest,
  type UpdateScenarioRequest,
  scenariosApi,
} from "../../../lib/api/client";
import { queryKeys } from "../../../lib/api/queryKeys";

export const useScenarios = () =>
  useQuery({
    queryKey: queryKeys.scenarios,
    queryFn: () => scenariosApi.list({ limit: 200 }),
  });

export const useCreateScenario = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateScenarioRequest) => scenariosApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.scenarios }),
  });
};

export const useUpdateScenario = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateScenarioRequest }) =>
      scenariosApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.scenarios }),
  });
};

export const useDeleteScenario = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => scenariosApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.scenarios }),
  });
};
