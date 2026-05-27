import {
  ActionIcon,
  Group,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";

import { ResponsiveList } from "../../../components/layout/ResponsiveList";
import type { Run } from "../../../lib/api/client";
import { useRemoveRunVideo, useUpdateRunVideo } from "../api/queries";

type RunVideo = NonNullable<Run["videos"]>[number];

export function RunVideosTable({ run }: { run: Run }) {
  const update = useUpdateRunVideo();
  const remove = useRemoveRunVideo();
  const list = run.videos ?? [];

  const setAngleLabel = (rv: RunVideo, value: string) => {
    if (value !== rv.angleLabel) {
      update.mutate({
        runId: run.id,
        runVideoId: rv.id,
        body: { angleLabel: value },
      });
    }
  };
  const setRunOffset = (rv: RunVideo, raw: string) => {
    const v = Number(raw);
    if (Number.isFinite(v) && v !== (rv.runOffsetSec ?? 0)) {
      update.mutate({
        runId: run.id,
        runVideoId: rv.id,
        body: { runOffsetSec: Math.max(0, v) },
      });
    }
  };
  const setVideoStart = (rv: RunVideo, raw: string) => {
    const v = Number(raw);
    if (Number.isFinite(v) && v !== rv.videoOffsetStartSec) {
      update.mutate({
        runId: run.id,
        runVideoId: rv.id,
        body: { videoOffsetStartSec: v },
      });
    }
  };
  const setVideoEnd = (rv: RunVideo, raw: string) => {
    const v = Number(raw);
    if (Number.isFinite(v) && v !== rv.videoOffsetEndSec) {
      update.mutate({
        runId: run.id,
        runVideoId: rv.id,
        body: { videoOffsetEndSec: v },
      });
    }
  };

  const removeButton = (rv: RunVideo) => (
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
  );

  const emptyNotice = (
    <Text c="dimmed" ta="center" py="md" size="sm">
      アングルがありません
    </Text>
  );

  return (
    <ResponsiveList
      items={list}
      getKey={(rv) => rv.id}
      empty={emptyNotice}
      table={
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
                    onBlur={(e) => setAngleLabel(rv, e.currentTarget.value)}
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
                    onBlur={(e) => setRunOffset(rv, e.currentTarget.value)}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    size="xs"
                    defaultValue={rv.videoOffsetStartSec}
                    onBlur={(e) => setVideoStart(rv, e.currentTarget.value)}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    size="xs"
                    defaultValue={rv.videoOffsetEndSec}
                    onBlur={(e) => setVideoEnd(rv, e.currentTarget.value)}
                  />
                </Table.Td>
                <Table.Td>{removeButton(rv)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      }
      renderCard={(rv) => (
        <Stack gap="xs">
          <Group justify="space-between" align="flex-end" wrap="nowrap">
            <TextInput
              label="Angle"
              size="xs"
              style={{ flex: 1 }}
              defaultValue={rv.angleLabel}
              onBlur={(e) => setAngleLabel(rv, e.currentTarget.value)}
            />
            {removeButton(rv)}
          </Group>
          <Text size="xs" c="dimmed" ff="monospace" truncate>
            {rv.videoId}
          </Text>
          <Group grow gap="xs">
            <NumberInput
              label="Run Offset"
              size="xs"
              defaultValue={rv.runOffsetSec ?? 0}
              min={0}
              onBlur={(e) => setRunOffset(rv, e.currentTarget.value)}
            />
            <NumberInput
              label="Video Start"
              size="xs"
              defaultValue={rv.videoOffsetStartSec}
              onBlur={(e) => setVideoStart(rv, e.currentTarget.value)}
            />
            <NumberInput
              label="Video End"
              size="xs"
              defaultValue={rv.videoOffsetEndSec}
              onBlur={(e) => setVideoEnd(rv, e.currentTarget.value)}
            />
          </Group>
        </Stack>
      )}
    />
  );
}
