import { Button } from "@mantine/core";
import { Link, createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "../components/layout/ResourcePage";
import { useMatches } from "../features/matches/api/queries";
import { UpcomingMatchesList } from "../features/matchup/components/UpcomingMatchesList";

export const Route = createFileRoute("/pre-match")({
  component: PreMatchPage,
});

function PreMatchPage() {
  const matches = useMatches();

  return (
    <ResourcePage
      title="本番前モード"
      description="直近の試合からマッチアップビューに入り、対戦相手の傾向を見るためのエントリ。"
      isLoading={matches.isLoading}
      error={matches.error}
      onRetry={() => matches.refetch()}
      actions={
        <Button
          component={Link}
          to="/bulk-upload"
          variant="light"
          size="sm"
        >
          現場一括アップロードを開く →
        </Button>
      }
    >
      <UpcomingMatchesList />
    </ResourcePage>
  );
}
