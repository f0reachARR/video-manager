import { Alert, Badge, Group, Progress, Stack, Table, Text } from "@mantine/core";

import type { VideoRendition, VideoRenditionList } from "../../../lib/api/client";

const STATUS_COLOR: Record<string, string> = {
  pending: "gray",
  encoding: "blue",
  ready: "green",
  failed: "red",
};

const HLS_STATUS_LABEL: Record<string, string> = {
  pending: "未着手",
  planning: "計画中",
  encoding: "エンコード中",
  ready: "完了",
  failed: "失敗",
};

const KIND_LABEL: Record<string, string> = {
  original: "Original",
  "720p": "720p",
  "480p": "480p",
};

export function HLSStatusBadge({ status }: { status: string }) {
  return (
    <Badge size="sm" color={STATUS_COLOR[status] ?? "gray"} variant="light">
      {HLS_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/**
 * estimateProgress returns 0–1 for a rendition's encode progress.
 * `segments_done * 6s` divided by total duration is a decent proxy because the
 * encode_variant worker writes one ~6s segment at a time.
 */
function estimateProgress(r: VideoRendition, durationSec: number | null) {
  if (r.status === "ready") return 1;
  if (!durationSec || durationSec <= 0) return 0;
  const approxTotal = Math.max(1, Math.ceil(durationSec / 6));
  return Math.min(1, r.segmentsDone / approxTotal);
}

export function HLSStatusPanel({ data }: { data: VideoRenditionList }) {
  const rends = [...data.data].sort((a, b) => {
    // Show "original" first so users see the fastest variant at the top, then
    // 720p, 480p.
    const order = ["original", "720p", "480p"];
    return order.indexOf(a.kind) - order.indexOf(b.kind);
  });
  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Text size="sm" fw={500}>
          全体ステータス:
        </Text>
        <HLSStatusBadge status={data.hlsStatus} />
        {data.durationSec != null && (
          <Text size="xs" c="dimmed">
            尺 {data.durationSec}s
          </Text>
        )}
      </Group>
      {rends.length === 0 ? (
        <Text size="sm" c="dimmed">
          rendition がまだ作成されていません。
        </Text>
      ) : (
        <Table withRowBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 90 }}>バリアント</Table.Th>
              <Table.Th style={{ width: 110 }}>状態</Table.Th>
              <Table.Th>進捗</Table.Th>
              <Table.Th style={{ width: 110 }}>解像度</Table.Th>
              <Table.Th style={{ width: 100 }}>セグメント</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rends.map((r) => {
              const p = estimateProgress(r, data.durationSec ?? null);
              return (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Group gap={6}>
                      <Text size="sm" fw={500}>
                        {KIND_LABEL[r.kind] ?? r.kind}
                      </Text>
                      {r.passthrough && (
                        <Badge size="xs" variant="outline">
                          passthrough
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <HLSStatusBadge status={r.status} />
                  </Table.Td>
                  <Table.Td>
                    {r.status === "failed" ? (
                      <Text size="xs" c="red">
                        {r.error ?? "エンコード失敗"}
                      </Text>
                    ) : (
                      <Progress
                        value={Math.round(p * 100)}
                        color={STATUS_COLOR[r.status] ?? "gray"}
                        size="md"
                        striped={r.status === "encoding"}
                        animated={r.status === "encoding"}
                      />
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">
                      {r.width}×{r.height}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {r.segmentsDone}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
      {data.hlsStatus === "failed" && (
        <Alert color="red" variant="light">
          いずれかのバリアントが失敗しました。River の job を確認して、必要なら
          probe ジョブから再投入してください。
        </Alert>
      )}
    </Stack>
  );
}
