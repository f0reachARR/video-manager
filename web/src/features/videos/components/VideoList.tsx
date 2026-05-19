import { Badge, Checkbox, Stack, Table, Text } from "@mantine/core";
import { useMemo } from "react";

import type { Video } from "../../../lib/api/client";
import { useDevices } from "../../devices/api/queries";
import { useSessions } from "../../sessions/api/queries";
import { formatDateTimeFull, formatDateTimeShort } from "../../../lib/time";
import { VideoActions } from "./VideoActions";
import { VideoNameCell } from "./VideoNameCell";
import { VideoThumb } from "./VideoThumb";

export function VideoList({
  videos,
  selected,
  onSelectedChange,
}: {
  videos: Video[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
}) {
  const devices = useDevices();
  const sessions = useSessions();

  const deviceNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of devices.data?.data ?? []) m.set(d.id, d.name);
    return m;
  }, [devices.data]);
  const sessionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions.data?.data ?? []) m.set(s.id, s.name);
    return m;
  }, [sessions.data]);

  return (
    <Stack>
      <Table striped highlightOnHover withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: 40 }}>
              <Checkbox
                aria-label="全選択"
                checked={videos.length > 0 && selected.size === videos.length}
                indeterminate={
                  selected.size > 0 && selected.size < videos.length
                }
                onChange={(e) => {
                  if (e.currentTarget.checked) {
                    onSelectedChange(new Set(videos.map((x) => x.id)));
                  } else {
                    onSelectedChange(new Set());
                  }
                }}
              />
            </Table.Th>
            <Table.Th style={{ width: 90 }}>Thumb</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th>Device</Table.Th>
            <Table.Th>Recorded At</Table.Th>
            <Table.Th>Duration</Table.Th>
            <Table.Th>Session</Table.Th>
            <Table.Th>作成日時</Table.Th>
            <Table.Th style={{ width: 140 }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {videos.map((v) => (
            <Table.Tr key={v.id}>
              <Table.Td>
                <Checkbox
                  checked={selected.has(v.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.currentTarget?.checked) next.add(v.id);
                    else next.delete(v.id);
                    onSelectedChange(next);
                  }}
                />
              </Table.Td>
              <Table.Td>
                <VideoThumb video={v} />
              </Table.Td>
              <Table.Td>
                <VideoNameCell video={v} />
              </Table.Td>
              <Table.Td>
                {v.deviceId
                  ? (deviceNameById.get(v.deviceId) ?? v.deviceId)
                  : "—"}
              </Table.Td>
              <Table.Td>
                {v.recordedAt ? (
                  <Text size="xs" title={formatDateTimeFull(v.recordedAt)}>
                    {formatDateTimeShort(v.recordedAt)}
                  </Text>
                ) : (
                  "—"
                )}
              </Table.Td>
              <Table.Td>
                {v.durationSec != null ? `${v.durationSec}s` : "—"}
              </Table.Td>
              <Table.Td>
                {v.sessionId ? (
                  <Badge size="sm" variant="light">
                    {sessionNameById.get(v.sessionId) ?? "Session"}
                  </Badge>
                ) : (
                  <Text size="xs" c="dimmed">
                    未割当
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Text size="xs" title={formatDateTimeFull(v.createdAt)}>
                  {formatDateTimeShort(v.createdAt)}
                </Text>
              </Table.Td>
              <Table.Td>
                <VideoActions video={v} />
              </Table.Td>
            </Table.Tr>
          ))}
          {videos.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={9}>
                <Text c="dimmed" ta="center" py="md">
                  まだ動画がありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
