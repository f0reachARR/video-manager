import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Textarea,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useState } from "react";

import type { Run } from "../../../lib/api/client";

export type RunMetadataPayload = {
  robotId?: string;
  scenarioId?: string;
  startedAt?: string;
  durationSec?: number;
  score?: number | null;
  memo?: string;
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
  const [robotId, setRobotId] = useState<string>(run.robotId);
  const [scenarioId, setScenarioId] = useState<string>(run.scenarioId);
  const [startedAt, setStartedAt] = useState<Date | null>(
    new Date(run.startedAt),
  );
  const [durationSec, setDurationSec] = useState<number | "">(
    run.durationSec ?? 0,
  );
  const [score, setScore] = useState<number | "">(run.score ?? "");
  const [memo, setMemo] = useState<string>(run.memo);
  const startedAtIso = startedAt?.toISOString();
  const dirty =
    robotId !== run.robotId ||
    scenarioId !== run.scenarioId ||
    (startedAtIso !== undefined && startedAtIso !== run.startedAt) ||
    (durationSec === "" ? 0 : durationSec) !== (run.durationSec ?? 0) ||
    (score === "" ? null : score) !== (run.score ?? null) ||
    memo !== run.memo;

  return (
    <Stack>
      <Group grow>
        <Select
          label="Robot"
          data={robotOptions}
          value={robotId}
          onChange={(v) => v && setRobotId(v)}
        />
        <Select
          label="Scenario"
          data={scenarioOptions}
          value={scenarioId}
          onChange={(v) => v && setScenarioId(v)}
        />
      </Group>
      <Group grow>
        <DateTimePicker
          label="開始時刻"
          value={startedAt}
          onChange={(v) => setStartedAt(v ? new Date(v) : null)}
          withSeconds
        />
        <NumberInput
          label="Duration (sec)"
          description="終了時刻は開始 + Duration"
          value={durationSec}
          min={0}
          onChange={(v) => setDurationSec(typeof v === "number" ? v : "")}
        />
        <NumberInput
          label="Score"
          value={score}
          onChange={(v) => setScore(typeof v === "number" ? v : "")}
          allowDecimal
        />
      </Group>
      <Textarea
        label="Memo"
        value={memo}
        onChange={(e) => setMemo(e.currentTarget.value)}
        autosize
        minRows={2}
      />
      <Group justify="flex-end">
        <Button
          disabled={!dirty}
          loading={saving}
          onClick={() =>
            onSave({
              robotId,
              scenarioId,
              startedAt: startedAt?.toISOString(),
              durationSec: Math.max(
                0,
                Math.round(typeof durationSec === "number" ? durationSec : 0),
              ),
              score: score === "" ? null : score,
              memo,
            })
          }
        >
          保存
        </Button>
      </Group>
    </Stack>
  );
}
