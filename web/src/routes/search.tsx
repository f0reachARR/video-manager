import { Group, Stack, Title } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { useSearchRuns } from "../features/search/api/queries";
import {
  RunSearchForm,
  type RunSearchParams,
} from "../features/search/components/RunSearchForm";
import { RunSearchResults } from "../features/search/components/RunSearchResults";

export const Route = createFileRoute("/search")({
  component: SearchPage,
});

function SearchPage() {
  const [applied, setApplied] = useState<RunSearchParams>({});
  const result = useSearchRuns(applied);

  const rows = result.data?.data ?? [];

  return (
    <Stack maw={1200} mx="auto">
      <Title order={2}>Run を検索</Title>
      <RunSearchForm onApply={setApplied} isFetching={result.isFetching} />

      <Group justify="space-between">
        <Title order={4}>
          結果 ({rows.length}
          {result.data?.pagination.hasMore ? "+" : ""})
        </Title>
      </Group>

      <RunSearchResults rows={rows} isLoading={result.isLoading} />
    </Stack>
  );
}
