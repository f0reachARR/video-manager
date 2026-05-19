import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ResourcePage } from "../components/layout/ResourcePage";
import type { Scenario } from "../lib/api/client";
import {
  useCreateScenario,
  useDeleteScenario,
  useScenarios,
  useUpdateScenario,
} from "../lib/queries";

export const Route = createFileRoute("/scenarios")({
  component: ScenariosPage,
});

function ScenariosPage() {
  const scenarios = useScenarios();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Scenario | null>(null);
  const list = scenarios.data?.data ?? [];

  return (
    <ResourcePage
      title="シナリオ"
      description="Run に紐づく走行シナリオ（例: 本走フル、序盤のみ など）。"
      isLoading={scenarios.isLoading}
      error={scenarios.error}
      onRetry={() => scenarios.refetch()}
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
            <Table.Th>説明</Table.Th>
            <Table.Th>作成日時</Table.Th>
            <Table.Th style={{ width: 120 }}>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {list.map((s) => (
            <Table.Tr key={s.id}>
              <Table.Td>{s.name}</Table.Td>
              <Table.Td>
                <Text size="sm" lineClamp={2}>
                  {s.description}
                </Text>
              </Table.Td>
              <Table.Td>{new Date(s.createdAt).toLocaleString()}</Table.Td>
              <Table.Td>
                <ScenarioActions
                  scenario={s}
                  onEdit={() => {
                    setEditing(s);
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
                  まだシナリオがありません
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <ScenarioEditModal
        key={editing?.id ?? "new"}
        opened={opened}
        onClose={close}
        scenario={editing}
      />
    </ResourcePage>
  );
}

function ScenarioActions({ scenario, onEdit }: { scenario: Scenario; onEdit: () => void }) {
  const del = useDeleteScenario();
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
          if (confirm(`${scenario.name} を削除しますか？`)) {
            del.mutate(scenario.id);
          }
        }}
        aria-label="削除"
      >
        🗑️
      </ActionIcon>
    </Group>
  );
}

function ScenarioEditModal({
  opened,
  onClose,
  scenario,
}: {
  opened: boolean;
  onClose: () => void;
  scenario: Scenario | null;
}) {
  const [name, setName] = useState(scenario?.name ?? "");
  const [description, setDescription] = useState(scenario?.description ?? "");
  const create = useCreateScenario();
  const update = useUpdateScenario();

  const submit = () => {
    const payload = { name, description };
    if (scenario) {
      update.mutate({ id: scenario.id, body: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={scenario ? "シナリオ編集" : "シナリオ新規作成"}
    >
      <Stack>
        <TextInput label="名前" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <Textarea
          label="説明"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending || update.isPending}
            disabled={!name.trim()}
          >
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
