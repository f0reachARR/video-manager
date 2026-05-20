import { ActionIcon, Button, Group, Table, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import type { Device } from "../lib/api/client";
import {
  useDeleteDevice,
  useDevices,
} from "../features/devices/api/queries";
import { DeviceEditModal } from "../features/devices/components/DeviceEditModal";

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
