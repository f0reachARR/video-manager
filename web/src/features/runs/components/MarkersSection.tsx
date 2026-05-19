import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Chip,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
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

      {durationSec > 0 && markers.length > 0 && (
        <Card withBorder p="xs">
          <div style={{ position: "relative", height: 24 }}>
            {markers.map((m) => {
              const pct = Math.max(
                0,
                Math.min(100, (m.runOffsetSec / durationSec) * 100),
              );
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => onSeek(m.runOffsetSec)}
                  title={`${formatTime(m.runOffsetSec)} ${markerCategoryLabel[m.category]}${m.label ? ` — ${m.label}` : ""}`}
                  style={{
                    position: "absolute",
                    left: `${pct}%`,
                    top: 0,
                    transform: "translateX(-50%)",
                    width: 8,
                    height: 24,
                    background: `var(--mantine-color-${markerCategoryColor[m.category]}-6)`,
                    border: 0,
                    borderRadius: 2,
                    cursor: "pointer",
                    padding: 0,
                  }}
                  aria-label={`marker at ${m.runOffsetSec}s`}
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

function MarkerEditModal({
  mode,
  initial,
  durationSec,
  onClose,
  onSubmit,
  saving,
}: {
  mode: "create" | "edit";
  initial: { runOffsetSec: number; label: string; category: MarkerCategory };
  durationSec: number;
  onClose: () => void;
  onSubmit: (body: {
    runOffsetSec: number;
    label: string;
    category: MarkerCategory;
  }) => void;
  saving: boolean;
}) {
  const [offset, setOffset] = useState<number>(initial.runOffsetSec);
  const [label, setLabel] = useState<string>(initial.label);
  const [category, setCategory] = useState<MarkerCategory>(initial.category);
  return (
    <Modal
      opened
      onClose={onClose}
      title={mode === "create" ? "Marker 追加" : "Marker 編集"}
    >
      <Stack>
        <NumberInput
          label="位置 (秒、Run 開始から)"
          value={offset}
          min={0}
          max={durationSec > 0 ? durationSec : undefined}
          onChange={(v) => setOffset(typeof v === "number" ? v : 0)}
        />
        <Select
          label="Category"
          data={markerCategories.map((c) => ({
            value: c,
            label: markerCategoryLabel[c],
          }))}
          value={category}
          onChange={(v) => v && setCategory(v as MarkerCategory)}
        />
        <TextInput
          label="Label"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          placeholder="例: 脱輪 / 完璧"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            loading={saving}
            onClick={() =>
              onSubmit({
                runOffsetSec: Math.max(0, Math.round(offset)),
                label,
                category,
              })
            }
          >
            {mode === "create" ? "追加" : "保存"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
