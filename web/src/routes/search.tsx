import {
  Badge,
  Button,
  Card,
  Chip,
  Group,
  MultiSelect,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import type { MarkerCategory } from "../lib/api/client";
import {
  markerCategories,
  useRobots,
  useScenarios,
  useSearchRuns,
  useTags,
} from "../lib/queries";

export const Route = createFileRoute("/search")({
  component: SearchPage,
});

const markerCategoryLabel: Record<MarkerCategory, string> = {
  success: "成功",
  failure: "失敗",
  note: "メモ",
};

function SearchPage() {
  const navigate = useNavigate();
  const robots = useRobots();
  const scenarios = useScenarios();
  const tags = useTags();

  // Draft state — only applied on "検索"
  const [draftFrom, setDraftFrom] = useState<Date | null>(null);
  const [draftTo, setDraftTo] = useState<Date | null>(null);
  const [draftRobotId, setDraftRobotId] = useState<string | null>(null);
  const [draftScenarioId, setDraftScenarioId] = useState<string | null>(null);
  const [draftTagIds, setDraftTagIds] = useState<string[]>([]);
  const [draftCategories, setDraftCategories] = useState<MarkerCategory[]>([]);
  const [draftQ, setDraftQ] = useState("");

  // Applied params — drive the query
  const [applied, setApplied] = useState<{
    from?: string;
    to?: string;
    robotId?: string;
    scenarioId?: string;
    tagIds?: string[];
    markerCategories?: MarkerCategory[];
    q?: string;
  }>({});

  const result = useSearchRuns(applied);

  const robotName = useMemo(() => {
    const m = new Map((robots.data?.data ?? []).map((r) => [r.id, r.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [robots.data]);
  const scenarioName = useMemo(() => {
    const m = new Map((scenarios.data?.data ?? []).map((s) => [s.id, s.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [scenarios.data]);

  const apply = () => {
    setApplied({
      from: draftFrom?.toISOString(),
      to: draftTo?.toISOString(),
      robotId: draftRobotId ?? undefined,
      scenarioId: draftScenarioId ?? undefined,
      tagIds: draftTagIds.length > 0 ? draftTagIds : undefined,
      markerCategories: draftCategories.length > 0 ? draftCategories : undefined,
      q: draftQ.trim() ? draftQ.trim() : undefined,
    });
  };

  const clear = () => {
    setDraftFrom(null);
    setDraftTo(null);
    setDraftRobotId(null);
    setDraftScenarioId(null);
    setDraftTagIds([]);
    setDraftCategories([]);
    setDraftQ("");
    setApplied({});
  };

  const rows = result.data?.data ?? [];

  return (
    <Stack maw={1200} mx="auto">
      <Title order={2}>Run を検索</Title>
      <Card withBorder>
        <Stack>
          <Group grow>
            <DateTimePicker
              label="開始日時 (から)"
              value={draftFrom}
              onChange={(v) => setDraftFrom(v ? new Date(v) : null)}
              clearable
            />
            <DateTimePicker
              label="開始日時 (まで)"
              value={draftTo}
              onChange={(v) => setDraftTo(v ? new Date(v) : null)}
              clearable
            />
          </Group>
          <Group grow>
            <Select
              label="Robot"
              data={(robots.data?.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
              value={draftRobotId}
              onChange={setDraftRobotId}
              searchable
              clearable
            />
            <Select
              label="Scenario"
              data={(scenarios.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
              value={draftScenarioId}
              onChange={setDraftScenarioId}
              searchable
              clearable
            />
          </Group>
          <MultiSelect
            label="Tag (すべて含む)"
            data={(tags.data?.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
            value={draftTagIds}
            onChange={setDraftTagIds}
            searchable
            clearable
          />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Marker category (いずれか含む)
            </Text>
            <Chip.Group
              multiple
              value={draftCategories}
              onChange={(v) => setDraftCategories(v as MarkerCategory[])}
            >
              <Group gap={4}>
                {markerCategories.map((c) => (
                  <Chip key={c} value={c} size="sm">
                    {markerCategoryLabel[c]}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </Stack>
          <TextInput
            label="Memo を含む"
            value={draftQ}
            onChange={(e) => setDraftQ(e.currentTarget.value)}
            placeholder="部分一致"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={clear}>
              クリア
            </Button>
            <Button onClick={apply} loading={result.isFetching}>
              検索
            </Button>
          </Group>
        </Stack>
      </Card>

      <Group justify="space-between">
        <Title order={4}>結果 ({rows.length}{result.data?.pagination.hasMore ? "+" : ""})</Title>
      </Group>

      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>開始</Table.Th>
            <Table.Th>Robot</Table.Th>
            <Table.Th>Scenario</Table.Th>
            <Table.Th>Score</Table.Th>
            <Table.Th>Memo</Table.Th>
            <Table.Th>Tags</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr
              key={r.id}
              style={{ cursor: "pointer" }}
              onClick={() =>
                navigate({ to: "/runs/$runId", params: { runId: r.id } })
              }
            >
              <Table.Td>
                <Text size="sm" ff="monospace">
                  {new Date(r.startedAt).toLocaleString()}
                </Text>
              </Table.Td>
              <Table.Td>{robotName(r.robotId)}</Table.Td>
              <Table.Td>{scenarioName(r.scenarioId)}</Table.Td>
              <Table.Td>{r.score ?? "—"}</Table.Td>
              <Table.Td>
                <Text size="sm" lineClamp={2}>
                  {r.memo || (
                    <Text component="span" c="dimmed" size="xs">
                      (空)
                    </Text>
                  )}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={2}>
                  {(r.tagIds ?? []).slice(0, 4).map((tid) => {
                    const name = (tags.data?.data ?? []).find((x) => x.id === tid)?.name ?? tid.slice(0, 6);
                    return (
                      <Badge key={tid} size="xs" variant="light">
                        {name}
                      </Badge>
                    );
                  })}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {!result.isLoading && rows.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Text c="dimmed" ta="center" py="lg">
                  該当する Run が見つかりません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
