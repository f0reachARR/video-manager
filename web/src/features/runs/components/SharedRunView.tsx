import {
  Alert,
  Badge,
  Card,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";

import { ApiError, type Marker, type Run } from "../../../lib/api/client";
import { useMarkers } from "../../markers/api/queries";
import { useRobots } from "../../robots/api/queries";
import { useScenarios } from "../../scenarios/api/queries";
import { useRun } from "../api/queries";

const markerCategoryColor: Record<Marker["category"], string> = {
  success: "teal",
  failure: "red",
  note: "blue",
};

const markerCategoryLabel: Record<Marker["category"], string> = {
  success: "成功",
  failure: "失敗",
  note: "メモ",
};

export function SharedRunView({ runId }: { runId: string }) {
  const run = useRun(runId);
  const markers = useMarkers(runId);
  const robots = useRobots();
  const scenarios = useScenarios();

  if (run.isLoading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }
  if (run.error || !run.data) {
    return (
      <Alert color="red">
        {run.error instanceof ApiError
          ? run.error.body.message
          : String(run.error)}
      </Alert>
    );
  }
  const r = run.data;
  const robotName =
    (robots.data?.data ?? []).find((x) => x.id === r.robotId)?.name ??
    r.robotId.slice(0, 8);
  const scenarioName =
    (scenarios.data?.data ?? []).find((x) => x.id === r.scenarioId)?.name ??
    r.scenarioId.slice(0, 8);

  return (
    <Stack maw={960} mx="auto">
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Run 共有ビュー</Title>
          <Text size="xs" c="dimmed">
            このページは閲覧専用です。
          </Text>
        </Stack>
        <Badge color="grape" variant="light">
          read-only
        </Badge>
      </Group>

      <Card withBorder>
        <Stack>
          <Group justify="space-between">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Robot
              </Text>
              <Text fw={500}>{robotName}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Scenario
              </Text>
              <Text fw={500}>{scenarioName}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Score
              </Text>
              <Text fw={500}>{r.score ?? "—"}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                期間
              </Text>
              <Text size="sm" ff="monospace">
                {new Date(r.startedAt).toLocaleString()}
                <br />〜 {new Date(r.endedAt).toLocaleString()}
              </Text>
            </Stack>
          </Group>
          {r.memo && (
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Memo
              </Text>
              <Text style={{ whiteSpace: "pre-wrap" }}>{r.memo}</Text>
            </Stack>
          )}
        </Stack>
      </Card>

      <SharedMarkers run={r} markers={markers.data?.data ?? []} />
    </Stack>
  );
}

function SharedMarkers({ run, markers }: { run: Run; markers: Marker[] }) {
  const durationSec = Math.max(
    1,
    (run.videos ?? []).reduce(
      (max, v) => Math.max(max, v.videoOffsetEndSec - v.videoOffsetStartSec),
      0,
    ),
  );

  return (
    <Stack gap="xs">
      <Title order={4}>Markers ({markers.length})</Title>
      {durationSec > 0 && markers.length > 0 && (
        <Card withBorder p="xs">
          <div style={{ position: "relative", height: 24 }}>
            {markers.map((m) => {
              const pct = Math.max(
                0,
                Math.min(100, (m.runOffsetSec / durationSec) * 100),
              );
              return (
                <div
                  key={m.id}
                  title={`${m.runOffsetSec}s ${markerCategoryLabel[m.category]}${m.label ? ` — ${m.label}` : ""}`}
                  style={{
                    position: "absolute",
                    left: `${pct}%`,
                    top: 0,
                    transform: "translateX(-50%)",
                    width: 8,
                    height: 24,
                    background: `var(--mantine-color-${markerCategoryColor[m.category]}-6)`,
                    borderRadius: 2,
                  }}
                />
              );
            })}
          </div>
        </Card>
      )}
      <Table striped withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: 80 }}>Time</Table.Th>
            <Table.Th style={{ width: 100 }}>Category</Table.Th>
            <Table.Th>Label</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {markers.map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td>
                <Text size="sm" ff="monospace">
                  {m.runOffsetSec}s
                </Text>
              </Table.Td>
              <Table.Td>
                <Badge color={markerCategoryColor[m.category]} variant="light">
                  {markerCategoryLabel[m.category]}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  {m.label || (
                    <Text component="span" c="dimmed" size="xs">
                      (空)
                    </Text>
                  )}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
          {markers.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Text c="dimmed" ta="center" py="md" size="sm">
                  Marker はありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
