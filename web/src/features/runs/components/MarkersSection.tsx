import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Chip,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";

import type { Marker, MarkerCategory } from "../../../lib/api/client";
import {
  markerCategories,
  useCreateMarker,
  useDeleteMarker,
  useMarkers,
  useUpdateMarker,
} from "../../markers/api/queries";
import { MarkerEditModal } from "../../markers/components/MarkerEditModal";
import { MarkerTimelineBar } from "../../markers/components/MarkerTimelineBar";
import {
  markerCategoryColor,
  markerCategoryLabel,
} from "../../markers/lib/category";
import { formatTime } from "../lib/format";

export function MarkersSection({
  runId,
  currentSec,
  durationSec,
  onSeek,
}: {
  runId: string;
  currentSec: number;
  durationSec: number;
  onSeek: (sec: number) => void;
}) {
  const [filter, setFilter] = useState<MarkerCategory[]>([]);
  const list = useMarkers(runId, filter.length > 0 ? { category: filter } : {});
  const createMarker = useCreateMarker(runId);
  const updateMarker = useUpdateMarker(runId);
  const deleteMarker = useDeleteMarker(runId);

  const [addOpen, { open: openAdd, close: closeAdd }] = useDisclosure(false);
  const [editing, setEditing] = useState<Marker | null>(null);

  const quickAdd = (category: MarkerCategory) => {
    createMarker.mutate({
      runOffsetSec: Math.round(currentSec),
      label: "",
      category,
    });
  };

  const markers = list.data?.data ?? [];

  return (
    <Stack gap="xs">
      <Group justify="space-between" mt="md">
        <Title order={4}>Markers ({markers.length})</Title>
        <Group gap="xs">
          <Chip.Group
            multiple
            value={filter}
            onChange={(v) => setFilter(v as MarkerCategory[])}
          >
            <Group gap={4}>
              {markerCategories.map((c) => (
                <Chip
                  key={c}
                  value={c}
                  size="xs"
                  color={markerCategoryColor[c]}
                >
                  {markerCategoryLabel[c]}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
          <Button
            size="xs"
            variant="default"
            onClick={openAdd}
            disabled={durationSec === 0}
          >
            ＋ 詳細追加
          </Button>
        </Group>
      </Group>

      <Card withBorder p="sm">
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            現在時刻 {formatTime(currentSec)} に追加:
          </Text>
          <Group gap="xs">
            {markerCategories.map((c) => (
              <Button
                key={c}
                size="xs"
                variant="light"
                color={markerCategoryColor[c]}
                loading={createMarker.isPending}
                disabled={durationSec === 0}
                onClick={() => quickAdd(c)}
              >
                {markerCategoryLabel[c]}
              </Button>
            ))}
          </Group>
        </Stack>
      </Card>

      <MarkerTimelineBar
        markers={markers}
        durationSec={durationSec}
        onSeek={onSeek}
        formatTime={formatTime}
      />

      <Table striped withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: 80 }}>Time</Table.Th>
            <Table.Th style={{ width: 100 }}>Category</Table.Th>
            <Table.Th>Label</Table.Th>
            <Table.Th style={{ width: 110 }}></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {markers.map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => onSeek(m.runOffsetSec)}
                >
                  {formatTime(m.runOffsetSec)}
                </Button>
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
                      （無し）
                    </Text>
                  )}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={4} justify="flex-end">
                  <ActionIcon
                    variant="subtle"
                    onClick={() => setEditing(m)}
                    aria-label="編集"
                  >
                    ✏️
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    loading={deleteMarker.isPending}
                    onClick={() => {
                      if (confirm("Marker を削除しますか？"))
                        deleteMarker.mutate(m.id);
                    }}
                    aria-label="削除"
                  >
                    🗑️
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {markers.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed" ta="center" py="md" size="sm">
                  Marker がありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      {addOpen && (
        <MarkerEditModal
          mode="create"
          initial={{
            runOffsetSec: Math.round(currentSec),
            label: "",
            category: "note",
          }}
          durationSec={durationSec}
          onClose={closeAdd}
          onSubmit={(body) => {
            createMarker.mutate(body, { onSuccess: closeAdd });
          }}
          saving={createMarker.isPending}
        />
      )}

      {editing && (
        <MarkerEditModal
          mode="edit"
          initial={{
            runOffsetSec: editing.runOffsetSec,
            label: editing.label,
            category: editing.category,
          }}
          durationSec={durationSec}
          onClose={() => setEditing(null)}
          onSubmit={(body) =>
            updateMarker.mutate(
              { id: editing.id, body },
              { onSuccess: () => setEditing(null) },
            )
          }
          saving={updateMarker.isPending}
        />
      )}
    </Stack>
  );
}
