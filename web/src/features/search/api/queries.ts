import { useQuery } from "@tanstack/react-query";

import { type SearchRunsParams, searchApi } from "../../../lib/api/client";

export const useSearchRuns = (params: SearchRunsParams) =>
  useQuery({
    queryKey: ["search", "runs", params] as const,
    queryFn: () => searchApi.runs({ limit: 50, ...params }),
  });
