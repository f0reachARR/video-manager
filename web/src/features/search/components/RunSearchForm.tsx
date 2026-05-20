import {
  Button,
  Card,
  Chip,
  Group,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useState } from "react";

import type { MarkerCategory } from "../../../lib/api/client";
import { markerCategories } from "../../markers/api/queries";
import { useRobots } from "../../robots/api/queries";
import { useScenarios } from "../../scenarios/api/queries";
import { useTags } from "../../tags/api/queries";

const markerCategoryLabel: Record<MarkerCategory, string> = {
  success: "成功",
  failure: "失敗",
  note: "メモ",
};

export type RunSearchParams = {
  from?: string;
  to?: string;
  robotId?: string;
  scenarioId?: string;
  tagIds?: string[];
  markerCategories?: MarkerCategory[];
  q?: string;
};

export function RunSearchForm({
  onApply,
  isFetching,
}: {
  onApply: (params: RunSearchParams) => void;
  isFetching: boolean;
}) {
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

  const apply = () => {
    onApply({
      from: draftFrom?.toISOString(),
      to: draftTo?.toISOString(),
      robotId: draftRobotId ?? undefined,
      scenarioId: draftScenarioId ?? undefined,
      tagIds: draftTagIds.length > 0 ? draftTagIds : undefined,
      markerCategories:
        draftCategories.length > 0 ? draftCategories : undefined,
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
    onApply({});
  };

  return (
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
            data={(robots.data?.data ?? []).map((r) => ({
              value: r.id,
              label: r.name,
            }))}
            value={draftRobotId}
            onChange={setDraftRobotId}
            searchable
            clearable
          />
          <Select
            label="Scenario"
            data={(scenarios.data?.data ?? []).map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            value={draftScenarioId}
            onChange={setDraftScenarioId}
            searchable
            clearable
          />
        </Group>
        <MultiSelect
          label="Tag (すべて含む)"
          data={(tags.data?.data ?? []).map((t) => ({
            value: t.id,
            label: t.name,
          }))}
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
          <Button onClick={apply} loading={isFetching}>
            検索
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
