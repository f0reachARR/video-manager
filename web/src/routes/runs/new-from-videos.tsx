import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { NewFromVideosPage } from "../../features/runs/components/NewFromVideos/NewFromVideosPage";

type Search = {
  sessionId?: string;
  videoIds?: string;
};

export const Route = createFileRoute("/runs/new-from-videos")({
  component: NewFromVideosRoute,
  validateSearch: (s: Record<string, unknown>): Search => ({
    sessionId: typeof s.sessionId === "string" ? s.sessionId : undefined,
    videoIds: typeof s.videoIds === "string" ? s.videoIds : undefined,
  }),
});

function NewFromVideosRoute() {
  const { sessionId, videoIds } = Route.useSearch();
  const requestedIds = useMemo(
    () => (videoIds ? videoIds.split(",").filter(Boolean) : []),
    [videoIds],
  );
  return (
    <NewFromVideosPage
      sessionId={sessionId ?? ""}
      requestedIds={requestedIds}
    />
  );
}
