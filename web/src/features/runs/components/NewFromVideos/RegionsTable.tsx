import {
  ActionIcon,
  Card,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";

import { useRobots } from "../../../robots/api/queries";
import { useScenarios } from "../../../scenarios/api/queries";
import { useTeams } from "../../../teams/api/queries";
import { formatTime } from "../../lib/format";
import { formatDateTimeFull } from "../../../../lib/time";
import type { Region } from "./types";

// Per-region editable table. Rows are sorted by startSec; per-cell selects
// override the defaults set in DefaultMetadataCard. Selection mirrors the
// timeline so clicking either keeps the playhead/region in sync.
export function RegionsTable({
  regions,
  selectedId,
  t0Ms,
  onSelect,
  onUpdate,
  onRemove,
}: {
  regions: Region[];
  selectedId: string | null;
  t0Ms: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Region>) => void;
  onRemove: (id: string) => void;
}) {
  const teams = useTeams();
  const robots = useRobots();
  const scenarios = useScenarios();

  return (
    <Card withBorder p="sm">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Run リスト ({regions.length})
        </Text>
        {regions.length === 0 ? (
          <Text size="sm" c="dimmed">
            まだ区間がありません。上のタイムラインをドラッグして追加してください。
          </Text>
        ) : (
          <Table withRowBorders={false} highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 30 }}>#</Table.Th>
                <Table.Th>開始時刻</Table.Th>
                <Table.Th style={{ width: 90 }}>長さ</Table.Th>
                <Table.Th>Team</Table.Th>
                <Table.Th>Robot</Table.Th>
                <Table.Th>Scenario</Table.Th>
                <Table.Th style={{ width: 90 }}>Score</Table.Th>
                <Table.Th>Memo</Table.Th>
                <Table.Th style={{ width: 40 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {regions
                .map((r, i) => ({ r, i }))
                .sort((a, b) => a.r.startSec - b.r.startSec)
                .map(({ r, i }) => {
                  const dur = Math.max(0, r.endSec - r.startSec);
                  const startAbs = new Date(t0Ms + r.startSec * 1000);
                  const isSel = r.id === selectedId;
                  return (
                    <Table.Tr
                      key={r.id}
                      bg={
                        isSel ? "var(--mantine-color-blue-light)" : undefined
                      }
                      onClick={() => onSelect(r.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <Table.Td>{i + 1}</Table.Td>
                      <Table.Td>
                        <Text size="xs">{formatDateTimeFull(startAbs)}</Text>
                        <Text size="xs" c="dimmed">
                          t+{formatTime(r.startSec)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" ff="monospace">
                          {formatTime(dur)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          data={(teams.data?.data ?? []).map((t) => ({
                            value: t.id,
                            label: t.name,
                          }))}
                          value={r.teamId}
                          onChange={(v) =>
                            onUpdate(r.id, { teamId: v, robotId: null })
                          }
                          searchable
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          data={(robots.data?.data ?? [])
                            .filter(
                              (rb) => !r.teamId || rb.teamId === r.teamId,
                            )
                            .map((rb) => ({ value: rb.id, label: rb.name }))}
                          value={r.robotId}
                          onChange={(v) => onUpdate(r.id, { robotId: v })}
                          searchable
                          disabled={!r.teamId}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          data={(scenarios.data?.data ?? []).map((s) => ({
                            value: s.id,
                            label: s.name,
                          }))}
                          value={r.scenarioId}
                          onChange={(v) => onUpdate(r.id, { scenarioId: v })}
                          searchable
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          size="xs"
                          value={r.score}
                          onChange={(v) =>
                            onUpdate(r.id, {
                              score: typeof v === "number" ? v : "",
                            })
                          }
                          allowDecimal
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          size="xs"
                          value={r.memo}
                          onChange={(e) =>
                            onUpdate(r.id, { memo: e.currentTarget.value })
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove(r.id);
                          }}
                          aria-label="削除"
                        >
                          ✕
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Card>
  );
}
