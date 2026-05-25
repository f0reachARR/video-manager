import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useForm } from "@tanstack/react-form";

import { useRobots } from "../../robots/api/queries";
import { useScenarios } from "../../scenarios/api/queries";
import { useSessions } from "../../sessions/api/queries";
import { useTeams } from "../../teams/api/queries";
import { useCreateRun } from "../api/queries";

type FormValues = {
  sessionId: string | null;
  teamId: string | null;
  robotId: string | null;
  scenarioId: string | null;
  startedAt: Date | null;
  durationSec: number;
  score: number | null;
  memo: string;
};

function DateTimeWithQuickAdjust({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | null;
  onChange: (v: Date | null) => void;
}) {
  const adjust = (deltaSec: number) => {
    const base = value ?? new Date();
    onChange(new Date(base.getTime() + deltaSec * 1000));
  };
  return (
    <Stack gap={4}>
      <DateTimePicker
        label={label}
        value={value}
        onChange={(v) => onChange(v ? new Date(v) : null)}
        required
        withSeconds
        valueFormat="YYYY/MM/DD HH:mm:ss"
      />
      <Group gap={4}>
        <Button size="compact-xs" variant="default" onClick={() => onChange(new Date())}>
          現在
        </Button>
        <Button size="compact-xs" variant="default" onClick={() => adjust(-60)}>
          -1m
        </Button>
        <Button size="compact-xs" variant="default" onClick={() => adjust(60)}>
          +1m
        </Button>
        <Button size="compact-xs" variant="default" onClick={() => adjust(-10)}>
          -10s
        </Button>
        <Button size="compact-xs" variant="default" onClick={() => adjust(10)}>
          +10s
        </Button>
      </Group>
    </Stack>
  );
}

export function RunCreateModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const sessions = useSessions();
  const scenarios = useScenarios();
  const robots = useRobots();
  const teams = useTeams();
  const create = useCreateRun();

  const form = useForm({
    defaultValues: {
      sessionId: null,
      teamId: null,
      robotId: null,
      scenarioId: null,
      startedAt: null,
      durationSec: 90,
      score: null,
      memo: "",
    } as FormValues,
    onSubmit: ({ value }) => {
      if (
        !value.sessionId ||
        !value.teamId ||
        !value.robotId ||
        !value.scenarioId ||
        !value.startedAt
      ) {
        return;
      }
      create.mutate(
        {
          sessionId: value.sessionId,
          teamId: value.teamId,
          robotId: value.robotId,
          scenarioId: value.scenarioId,
          startedAt: value.startedAt.toISOString(),
          durationSec: Math.max(0, Math.round(value.durationSec || 0)),
          score: value.score,
          memo: value.memo,
        },
        { onSuccess: onClose },
      );
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Run を作成" size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <Stack>
          <form.Field name="sessionId">
            {(field) => (
              <Select
                label="Session"
                data={(sessions.data?.data ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                value={field.state.value}
                onChange={field.handleChange}
                searchable
                required
              />
            )}
          </form.Field>
          <Group grow>
            <form.Field name="teamId">
              {(field) => (
                <Select
                  label="Team"
                  data={(teams.data?.data ?? []).map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                  value={field.state.value}
                  onChange={(v) => {
                    field.handleChange(v);
                    form.setFieldValue("robotId", null);
                  }}
                  required
                />
              )}
            </form.Field>
            <form.Subscribe selector={(s) => s.values.teamId}>
              {(teamId) => (
                <form.Field name="robotId">
                  {(field) => (
                    <Select
                      label="Robot"
                      data={(robots.data?.data ?? [])
                        .filter((r) => !teamId || r.teamId === teamId)
                        .map((r) => ({ value: r.id, label: r.name }))}
                      value={field.state.value}
                      onChange={field.handleChange}
                      disabled={!teamId}
                      required
                    />
                  )}
                </form.Field>
              )}
            </form.Subscribe>
          </Group>
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
                required
              />
            )}
          </form.Field>
          <Group grow align="flex-start">
            <form.Field name="startedAt">
              {(field) => (
                <DateTimeWithQuickAdjust
                  label="開始"
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
            <form.Field name="durationSec">
              {(field) => (
                <NumberInput
                  label="Duration (sec)"
                  description="終了時刻は開始 + Duration で自動計算"
                  value={field.state.value}
                  min={0}
                  onChange={(v) =>
                    field.handleChange(typeof v === "number" ? v : 0)
                  }
                />
              )}
            </form.Field>
          </Group>
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
            <Button variant="default" onClick={onClose}>
              キャンセル
            </Button>
            <form.Subscribe
              selector={(s) => [
                s.values.sessionId,
                s.values.teamId,
                s.values.robotId,
                s.values.scenarioId,
                s.values.startedAt,
              ]}
            >
              {([sessionId, teamId, robotId, scenarioId, startedAt]) => (
                <Button
                  type="submit"
                  loading={create.isPending}
                  disabled={
                    !sessionId || !teamId || !robotId || !scenarioId || !startedAt
                  }
                >
                  作成
                </Button>
              )}
            </form.Subscribe>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
