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
import { useForm } from "@tanstack/react-form";

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

type FormValues = {
  from: Date | null;
  to: Date | null;
  robotId: string | null;
  scenarioId: string | null;
  tagIds: string[];
  categories: MarkerCategory[];
  q: string;
};

const initial: FormValues = {
  from: null,
  to: null,
  robotId: null,
  scenarioId: null,
  tagIds: [],
  categories: [],
  q: "",
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

  const form = useForm({
    defaultValues: initial,
    onSubmit: ({ value }) => {
      onApply({
        from: value.from?.toISOString(),
        to: value.to?.toISOString(),
        robotId: value.robotId ?? undefined,
        scenarioId: value.scenarioId ?? undefined,
        tagIds: value.tagIds.length > 0 ? value.tagIds : undefined,
        markerCategories:
          value.categories.length > 0 ? value.categories : undefined,
        q: value.q.trim() ? value.q.trim() : undefined,
      });
    },
  });

  return (
    <Card withBorder>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <Stack>
          <Group grow>
            <form.Field name="from">
              {(field) => (
                <DateTimePicker
                  label="開始日時 (から)"
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v ? new Date(v) : null)}
                  clearable
                />
              )}
            </form.Field>
            <form.Field name="to">
              {(field) => (
                <DateTimePicker
                  label="開始日時 (まで)"
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v ? new Date(v) : null)}
                  clearable
                />
              )}
            </form.Field>
          </Group>
          <Group grow>
            <form.Field name="robotId">
              {(field) => (
                <Select
                  label="Robot"
                  data={(robots.data?.data ?? []).map((r) => ({
                    value: r.id,
                    label: r.name,
                  }))}
                  value={field.state.value}
                  onChange={field.handleChange}
                  searchable
                  clearable
                />
              )}
            </form.Field>
            <form.Field name="scenarioId">
              {(field) => (
                <Select
                  label="Scenario"
                  data={(scenarios.data?.data ?? []).map((s) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                  value={field.state.value}
                  onChange={field.handleChange}
                  searchable
                  clearable
                />
              )}
            </form.Field>
          </Group>
          <form.Field name="tagIds">
            {(field) => (
              <MultiSelect
                label="Tag (すべて含む)"
                data={(tags.data?.data ?? []).map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
                value={field.state.value}
                onChange={field.handleChange}
                searchable
                clearable
              />
            )}
          </form.Field>
          <form.Field name="categories">
            {(field) => (
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Marker category (いずれか含む)
                </Text>
                <Chip.Group
                  multiple
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v as MarkerCategory[])}
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
            )}
          </form.Field>
          <form.Field name="q">
            {(field) => (
              <TextInput
                label="Memo を含む"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.currentTarget.value)}
                placeholder="部分一致"
              />
            )}
          </form.Field>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                form.reset();
                onApply({});
              }}
            >
              クリア
            </Button>
            <Button type="submit" loading={isFetching}>
              検索
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}
