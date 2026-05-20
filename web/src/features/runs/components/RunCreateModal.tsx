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
import { useState } from "react";

import { useRobots } from "../../robots/api/queries";
import { useScenarios } from "../../scenarios/api/queries";
import { useSessions } from "../../sessions/api/queries";
import { useTeams } from "../../teams/api/queries";
import { useCreateRun } from "../api/queries";

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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [robotId, setRobotId] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [durationSec, setDurationSec] = useState<number | "">(90);
  const [score, setScore] = useState<number | "">("");
  const [memo, setMemo] = useState("");

  const submit = () => {
    if (!sessionId || !teamId || !robotId || !scenarioId || !startedAt) {
      return;
    }
    const dur =
      typeof durationSec === "number" && durationSec > 0 ? durationSec : 0;
    create.mutate(
      {
        sessionId,
        teamId,
        robotId,
        scenarioId,
        startedAt: startedAt.toISOString(),
        durationSec: Math.max(0, Math.round(dur)),
        score: score === "" ? null : score,
        memo,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Run を作成" size="lg">
      <Stack>
        <Select
          label="Session"
          data={(sessions.data?.data ?? []).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          value={sessionId}
          onChange={setSessionId}
          searchable
          required
        />
        <Group grow>
          <Select
            label="Team"
            data={(teams.data?.data ?? []).map((t) => ({
              value: t.id,
              label: t.name,
            }))}
            value={teamId}
            onChange={(v) => {
              setTeamId(v);
              setRobotId(null);
            }}
            required
          />
          <Select
            label="Robot"
            data={(robots.data?.data ?? [])
              .filter((r) => !teamId || r.teamId === teamId)
              .map((r) => ({ value: r.id, label: r.name }))}
            value={robotId}
            onChange={setRobotId}
            disabled={!teamId}
            required
          />
        </Group>
        <Select
          label="Scenario"
          data={(scenarios.data?.data ?? []).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          value={scenarioId}
          onChange={setScenarioId}
          required
        />
        <Group grow align="flex-start">
          <DateTimeWithQuickAdjust
            label="開始"
            value={startedAt}
            onChange={setStartedAt}
          />
          <NumberInput
            label="Duration (sec)"
            description="終了時刻は開始 + Duration で自動計算"
            value={durationSec}
            min={0}
            onChange={(v) => setDurationSec(typeof v === "number" ? v : "")}
          />
        </Group>
        <NumberInput
          label="Score"
          value={score}
          onChange={(v) => setScore(typeof v === "number" ? v : "")}
          allowDecimal
        />
        <Textarea
          label="Memo"
          value={memo}
          onChange={(e) => setMemo(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending}
            disabled={
              !sessionId || !teamId || !robotId || !scenarioId || !startedAt
            }
          >
            作成
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
