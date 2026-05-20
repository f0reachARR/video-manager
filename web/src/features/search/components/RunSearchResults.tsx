import { Badge, Group, Table, Text } from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import type { Run } from "../../../lib/api/client";
import { useRobots } from "../../robots/api/queries";
import { useScenarios } from "../../scenarios/api/queries";
import { useTags } from "../../tags/api/queries";

export function RunSearchResults({
  rows,
  isLoading,
}: {
  rows: Run[];
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const robots = useRobots();
  const scenarios = useScenarios();
  const tags = useTags();

  const robotName = useMemo(() => {
    const m = new Map((robots.data?.data ?? []).map((r) => [r.id, r.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [robots.data]);
  const scenarioName = useMemo(() => {
    const m = new Map((scenarios.data?.data ?? []).map((s) => [s.id, s.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [scenarios.data]);

  return (
    <Table striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>開始</Table.Th>
          <Table.Th>Robot</Table.Th>
          <Table.Th>Scenario</Table.Th>
          <Table.Th>Score</Table.Th>
          <Table.Th>Memo</Table.Th>
          <Table.Th>Tags</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr
            key={r.id}
            style={{ cursor: "pointer" }}
            onClick={() =>
              navigate({ to: "/runs/$runId", params: { runId: r.id } })
            }
          >
            <Table.Td>
              <Text size="sm" ff="monospace">
                {new Date(r.startedAt).toLocaleString()}
              </Text>
            </Table.Td>
            <Table.Td>{robotName(r.robotId)}</Table.Td>
            <Table.Td>{scenarioName(r.scenarioId)}</Table.Td>
            <Table.Td>{r.score ?? "—"}</Table.Td>
            <Table.Td>
              <Text size="sm" lineClamp={2}>
                {r.memo || (
                  <Text component="span" c="dimmed" size="xs">
                    (空)
                  </Text>
                )}
              </Text>
            </Table.Td>
            <Table.Td>
              <Group gap={2}>
                {(r.tagIds ?? []).slice(0, 4).map((tid) => {
                  const name =
                    (tags.data?.data ?? []).find((x) => x.id === tid)?.name ??
                    tid.slice(0, 6);
                  return (
                    <Badge key={tid} size="xs" variant="light">
                      {name}
                    </Badge>
                  );
                })}
              </Group>
            </Table.Td>
          </Table.Tr>
        ))}
        {!isLoading && rows.length === 0 && (
          <Table.Tr>
            <Table.Td colSpan={6}>
              <Text c="dimmed" ta="center" py="lg">
                該当する Run が見つかりません
              </Text>
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );
}
