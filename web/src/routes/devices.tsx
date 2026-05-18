import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../components/ResourcePage";
import type { Device } from "../lib/api/client";
import {
  useCreateDevice,
  useDeleteDevice,
  useDevices,
  useUpdateDevice,
} from "../lib/queries";

export const Route = createFileRoute("/devices")({
  component: DevicesPage,
});

function DevicesPage() {
  const devices = useDevices();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const list = devices.data?.data ?? [];

  return (
    <ResourcePage
      title="機材 (Devices)"
      description="撮影に使うカメラ・スマホなど。time offset は機材の時計ズレ補正。"
      isLoading={devices.isLoading}
      error={devices.error}
      onRetry={() => devices.refetch()}
      actions={
        <Button
          onClick={() => {
            setEditing(null);
            open();
          }}
        >
          ＋ 新規作成
        </Button>
      }
    >
      <Table striped highlightOnHover withRowBorders={false}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>名前</Table.Th>
            <Table.Th>Default Time Offset (秒)</Table.Th>
            <Table.Th>作成日時</Table.Th>
            <Table.Th style={{ width: 120 }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((d) => (
            <Table.Tr key={d.id}>
              <Table.Td>{d.name}</Table.Td>
              <Table.Td>{d.defaultTimeOffsetSec}</Table.Td>
              <Table.Td>{new Date(d.createdAt).toLocaleString()}</Table.Td>
              <Table.Td>
                <DeviceActions
                  device={d}
                  onEdit={() => {
                    setEditing(d);
                    open();
                  }}
                />
              </Table.Td>
            </Table.Tr>
          ))}
          {list.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text c="dimmed" ta="center" py="md">
                  まだ機材がありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <DeviceEditModal
        key={editing?.id ?? "new"}
        opened={opened}
        onClose={close}
        device={editing}
      />
    </ResourcePage>
  );
}

function DeviceActions({ device, onEdit }: { device: Device; onEdit: () => void }) {
  const del = useDeleteDevice();
  return (
    <Group gap={4}>
      <ActionIcon variant="subtle" onClick={onEdit} aria-label="編集">
        ✏️
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="red"
        loading={del.isPending}
        onClick={() => {
          if (confirm(`${device.name} を削除しますか？`)) {
            del.mutate(device.id);
          }
        }}
        aria-label="削除"
      >
        🗑️
      </ActionIcon>
    </Group>
  );
}

function DeviceEditModal({
  opened,
  onClose,
  device,
}: {
  opened: boolean;
  onClose: () => void;
  device: Device | null;
}) {
  const [name, setName] = useState(device?.name ?? "");
  const [offset, setOffset] = useState<number>(device?.defaultTimeOffsetSec ?? 0);
  const create = useCreateDevice();
  const update = useUpdateDevice();

  const submit = () => {
    const payload = { name, defaultTimeOffsetSec: offset };
    if (device) {
      update.mutate({ id: device.id, body: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={device ? "機材編集" : "機材新規作成"}>
      <Stack>
        <TextInput label="名前" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <NumberInput
          label="Default Time Offset (秒)"
          description="プラスなら機材時刻が進んでいる。0 で OK"
          value={offset}
          onChange={(v) => setOffset(typeof v === "number" ? v : 0)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={submit} loading={create.isPending || update.isPending} disabled={!name.trim()}>
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
