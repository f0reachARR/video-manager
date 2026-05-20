import { createFileRoute } from "@tanstack/react-router";

import { SharedRunView } from "../../features/runs/components/SharedRunView";

export const Route = createFileRoute("/share/runs/$runId")({
  component: SharedRunPage,
});

function SharedRunPage() {
  const { runId } = Route.useParams();
  return <SharedRunView runId={runId} />;
}
