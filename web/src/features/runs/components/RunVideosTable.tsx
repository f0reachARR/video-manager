import {
  ActionIcon,
  NumberInput,
  Table,
  Text,
  TextInput,
} from "@mantine/core";

import type { Run } from "../../../lib/api/client";
import { useRemoveRunVideo, useUpdateRunVideo } from "../api/queries";

export function RunVideosTable({ run }: { run: Run }) {
  const update = useUpdateRunVideo();
  const remove = useRemoveRunVideo();
  const list = run.videos ?? [];

  return (
    <Table striped withRowBorders={false}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Angle</Table.Th>
          <Table.Th>Video</Table.Th>
          <Table.Th>Run Offset (sec)</Table.Th>
          <Table.Th>Video Start (sec)</Table.Th>
          <Table.Th>Video End (sec)</Table.Th>
          <Table.Th style={{ width: 80 }}></Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {list.map((rv) => (
          <Table.Tr key={rv.id}>
            <Table.Td>
              <TextInput
                size="xs"
                defaultValue={rv.angleLabel}
                onBlur={(e) => {
                  const value = e.currentTarget.value;
                  if (value !== rv.angleLabel) {
                    update.mutate({
                      runId: run.id,
                      runVideoId: rv.id,
                      body: { angleLabel: value },
                    });
                  }
                }}
              />
            </Table.Td>
            <Table.Td>
              <Text size="xs" ff="monospace" truncate maw={220}>
                {rv.videoId}
              </Text>
            </Table.Td>
            <Table.Td>
              <NumberInput
                size="xs"
                defaultValue={rv.runOffsetSec ?? 0}
                min={0}
                onBlur={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (Number.isFinite(v) && v !== (rv.runOffsetSec ?? 0)) {
                    update.mutate({
                      runId: run.id,
                      runVideoId: rv.id,
                      body: { runOffsetSec: Math.max(0, v) },
                    });
                  }
                }}
              />
            </Table.Td>
            <Table.Td>
              <NumberInput
                size="xs"
                defaultValue={rv.videoOffsetStartSec}
                onBlur={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (Number.isFinite(v) && v !== rv.videoOffsetStartSec) {
                    update.mutate({
                      runId: run.id,
                      runVideoId: rv.id,
                      body: { videoOffsetStartSec: v },
                    });
                  }
                }}
              />
            </Table.Td>
            <Table.Td>
              <NumberInput
                size="xs"
                defaultValue={rv.videoOffsetEndSec}
                onBlur={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (Number.isFinite(v) && v !== rv.videoOffsetEndSec) {
                    update.mutate({
                      runId: run.id,
                      runVideoId: rv.id,
                      body: { videoOffsetEndSec: v },
                    });
                  }
                }}
              />
            </Table.Td>
            <Table.Td>
              <ActionIcon
                variant="subtle"
                color="red"
                loading={remove.isPending}
                onClick={() => {
                  if (confirm("Run からこのアングルを外しますか？")) {
                    remove.mutate({ runId: run.id, runVideoId: rv.id });
                  }
                }}
                aria-label="外す"
              >
                🗑️
              </ActionIcon>
            </Table.Td>
          </Table.Tr>
        ))}
        {list.length === 0 && (
          <Table.Tr>
            <Table.Td colSpan={6}>
              <Text c="dimmed" ta="center" py="md" size="sm">
                アングルがありません
              </Text>
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );
}
