import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useMemo, useState } from "react";

import type { MarkerCategory } from "../../../lib/api/client";
import { useMarkers } from "../api/queries";
import { useRuns } from "../../runs/api/queries";

const categoryLabel: Record<MarkerCategory, string> = {
  success: "成功",
  failure: "失敗",
  note: "メモ",
};

export function MarkerPickerModal({
  opened,
  onClose,
  onPick,
}: {
  opened: boolean;
  onClose: () => void;
  onPick: (markerId: string) => void;
}) {
  const runs = useRuns();
  const [runId, setRunId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const markers = useMarkers(runId);

  const filteredMarkers = useMemo(() => {
    const all = markers.data?.data ?? [];
    if (!filter) return all;
    const needle = filter.toLowerCase();
    return all.filter((m) => m.label.toLowerCase().includes(needle));
  }, [markers.data, filter]);

  return (
    <Modal opened={opened} onClose={onClose} title="Marker を選択して挿入" size="lg">
      <Stack>
        <Group grow>
          <Select
            label="Run"
            placeholder="どの Run の Marker か"
            data={(runs.data?.data ?? []).map((r) => ({
              value: r.id,
              label: `${new Date(r.startedAt).toLocaleString()} (${r.id.slice(0, 8)})`,
            }))}
            value={runId}
            onChange={setRunId}
            searchable
            clearable
          />
          <TextInput
            label="ラベル絞り込み"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            disabled={!runId}
          />
        </Group>
        {!runId && (
          <Text c="dimmed" ta="center" py="md" size="sm">
            まず Run を選んでください
          </Text>
        )}
        {runId && markers.isLoading && <Loader size="sm" />}
        {runId && !markers.isLoading && (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 70 }}>Time</Table.Th>
                <Table.Th style={{ width: 80 }}>Category</Table.Th>
                <Table.Th>Label</Table.Th>
                <Table.Th style={{ width: 60 }}></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredMarkers.map((m) => (
                <Table.Tr key={m.id}>
                  <Table.Td>
                    <Text size="xs" ff="monospace">
                      {m.runOffsetSec}s
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" variant="light">
                      {categoryLabel[m.category]}
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
                  <Table.Td>
                    <Button size="compact-xs" onClick={() => onPick(m.id)}>
                      挿入
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
              {filteredMarkers.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text c="dimmed" ta="center" py="md" size="sm">
                      該当する Marker がありません
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Modal>
  );
}
