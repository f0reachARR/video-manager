import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "../components/layout/ResourcePage";
import { useMatches } from "../features/matches/api/queries";
import { useTournaments } from "../features/tournaments/api/queries";
import { UpcomingMatchesList } from "../features/matchup/components/UpcomingMatchesList";

export const Route = createFileRoute("/pre-match")({
  component: PreMatchPage,
});

function PreMatchPage() {
  const matches = useMatches();
  const tournaments = useTournaments();

  return (
    <ResourcePage
      title="本番前モード"
      description="直近の試合からマッチアップビューに入り、対戦相手の傾向を見るためのエントリ。"
      isLoading={matches.isLoading || tournaments.isLoading}
      error={matches.error}
      onRetry={() => matches.refetch()}
    >
      <UpcomingMatchesList />
    </ResourcePage>
  );
}
