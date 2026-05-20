import { Card, Group, Select, Stack, Text } from "@mantine/core";

import { useRobots } from "../../../robots/api/queries";
import { useScenarios } from "../../../scenarios/api/queries";
import { useTeams } from "../../../teams/api/queries";

// Defaults panel: setting Team/Robot/Scenario here flows into every Region
// whose corresponding field is still null. Per-region overrides happen via
// the Run リスト table below.
export function DefaultMetadataCard({
  defaultTeam,
  defaultRobot,
  defaultScenario,
  onChangeTeam,
  onChangeRobot,
  onChangeScenario,
}: {
  defaultTeam: string | null;
  defaultRobot: string | null;
  defaultScenario: string | null;
  onChangeTeam: (v: string | null) => void;
  onChangeRobot: (v: string | null) => void;
  onChangeScenario: (v: string | null) => void;
}) {
  const teams = useTeams();
  const robots = useRobots();
  const scenarios = useScenarios();

  return (
    <Card withBorder p="sm">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          デフォルトのメタデータ
        </Text>
        <Text size="xs" c="dimmed">
          ここで設定した値が新しい区間に流し込まれます。区間ごとに下の表で上書き可。
        </Text>
        <Group grow>
          <Select
            label="Team"
            data={(teams.data?.data ?? []).map((t) => ({
              value: t.id,
              label: t.name,
            }))}
            value={defaultTeam}
            onChange={(v) => {
              onChangeTeam(v);
              onChangeRobot(null);
            }}
            searchable
            clearable
          />
          <Select
            label="Robot"
            data={(robots.data?.data ?? [])
              .filter((r) => !defaultTeam || r.teamId === defaultTeam)
              .map((r) => ({
                value: r.id,
                label: r.name,
              }))}
            value={defaultRobot}
            onChange={onChangeRobot}
            searchable
            clearable
            disabled={!defaultTeam}
          />
          <Select
            label="Scenario"
            data={(scenarios.data?.data ?? []).map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            value={defaultScenario}
            onChange={onChangeScenario}
            searchable
            clearable
          />
        </Group>
      </Stack>
    </Card>
  );
}
