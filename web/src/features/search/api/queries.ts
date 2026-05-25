import { useQuery } from "@tanstack/react-query";

import { type SearchRunsParams, searchApi } from "../../../lib/api/client";
import { useCurrentTournamentId } from "../../../stores/currentTournament";

export const useSearchRuns = (params: Omit<SearchRunsParams, "tournamentId">) => {
  const tournamentId = useCurrentTournamentId();
  return useQuery({
    queryKey: ["search", "runs", { ...params, tournamentId }] as const,
    queryFn: () =>
      searchApi.runs({ limit: 50, ...params, tournamentId: tournamentId! }),
    enabled: !!tournamentId,
  });
};
