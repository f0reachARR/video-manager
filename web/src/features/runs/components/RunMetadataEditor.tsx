import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useForm } from "@tanstack/react-form";

import type { Run } from "../../../lib/api/client";

export type RunMetadataPayload = {
  robotId?: string;
  scenarioId?: string;
  startedAt?: string;
  durationSec?: number;
  score?: number | null;
  memo?: string;
};

type FormValues = {
  robotId: string;
  scenarioId: string;
  startedAt: Date | null;
  durationSec: number;
  score: number | null;
  memo: string;
};

export function RunMetadataEditor({
  run,
  robotOptions,
  scenarioOptions,
  onSave,
  saving,
}: {
  run: Run;
  robotOptions: { value: string; label: string }[];
  scenarioOptions: { value: string; label: string }[];
  onSave: (body: RunMetadataPayload) => void;
  saving: boolean;
}) {
  const form = useForm({
    defaultValues: {
      robotId: run.robotId,
      scenarioId: run.scenarioId,
      startedAt: new Date(run.startedAt),
      durationSec: run.durationSec ?? 0,
      score: run.score ?? null,
      memo: run.memo,
    } as FormValues,
    onSubmit: ({ value }) => {
      onSave({
        robotId: value.robotId,
        scenarioId: value.scenarioId,
        startedAt: value.startedAt?.toISOString(),
        durationSec: Math.max(0, Math.round(value.durationSec)),
        score: value.score,
        memo: value.memo,
      });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <Stack>
        <Group grow>
          <form.Field name="robotId">
            {(field) => (
              <Select
                label="Robot"
                data={robotOptions}
                value={field.state.value}
                onChange={(v) => v && field.handleChange(v)}
              />
            )}
          </form.Field>
          <form.Field name="scenarioId">
            {(field) => (
              <Select
                label="Scenario"
                data={scenarioOptions}
                value={field.state.value}
                onChange={(v) => v && field.handleChange(v)}
              />
            )}
          </form.Field>
        </Group>
        <Group grow>
          <form.Field name="startedAt">
            {(field) => (
              <DateTimePicker
                label="開始時刻"
                value={field.state.value}
                onChange={(v) => field.handleChange(v ? new Date(v) : null)}
                withSeconds
              />
            )}
          </form.Field>
          <form.Field name="durationSec">
            {(field) => (
              <NumberInput
                label="Duration (sec)"
                description="終了時刻は開始 + Duration"
                value={field.state.value}
                min={0}
                onChange={(v) =>
                  field.handleChange(typeof v === "number" ? v : 0)
                }
              />
            )}
          </form.Field>
          <form.Field name="score">
            {(field) => (
              <NumberInput
                label="Score"
                value={field.state.value ?? ""}
                onChange={(v) =>
                  field.handleChange(typeof v === "number" ? v : null)
                }
                allowDecimal
              />
            )}
          </form.Field>
        </Group>
        <form.Field name="memo">
          {(field) => (
            <Textarea
              label="Memo"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.currentTarget.value)}
              autosize
              minRows={2}
            />
          )}
        </form.Field>
        <Group justify="flex-end">
          <form.Subscribe selector={(s) => s.isDirty}>
            {(isDirty) => (
              <Button type="submit" disabled={!isDirty} loading={saving}>
                保存
              </Button>
            )}
          </form.Subscribe>
        </Group>
      </Stack>
    </form>
  );
}
