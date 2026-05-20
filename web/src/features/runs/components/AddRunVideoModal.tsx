import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useMemo, useState } from "react";

import type { Run } from "../../../lib/api/client";
import { useVideos } from "../../videos/api/queries";
import { useAddRunVideo } from "../api/queries";

export function AddRunVideoModal({
  run,
  onClose,
}: {
  run: Run;
  onClose: () => void;
}) {
  const videos = useVideos({ sessionId: run.sessionId });
  const addRunVideo = useAddRunVideo();
  const [videoId, setVideoId] = useState<string | null>(null);
  const [startSec, setStartSec] = useState<number>(0);
  const [endSec, setEndSec] = useState<number>(0);
  const [angleLabel, setAngleLabel] = useState<string>("");

  const usedIds = useMemo(
    () => new Set((run.videos ?? []).map((rv) => rv.videoId)),
    [run.videos],
  );
  const options = (videos.data?.data ?? [])
    .filter((v) => !usedIds.has(v.id))
    .map((v) => ({
      value: v.id,
      label: `${v.displayName?.trim() || v.storageKey.slice(0, 8)} (${v.durationSec ?? "?"}s)`,
    }));

  const submit = () => {
    if (!videoId) return;
    addRunVideo.mutate(
      {
        runId: run.id,
        body: {
          videoId,
          videoOffsetStartSec: startSec,
          videoOffsetEndSec: endSec,
          runOffsetSec: 0,
          angleLabel,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal opened onClose={onClose} title="アングル動画を追加">
      <Stack>
        <Select
          label="Video"
          data={options}
          value={videoId}
          onChange={(v) => {
            setVideoId(v);
            if (v) {
              const target = (videos.data?.data ?? []).find((x) => x.id === v);
              if (target?.durationSec != null) setEndSec(target.durationSec);
            }
          }}
          searchable
          required
        />
        <Group grow>
          <NumberInput
            label="開始 (秒)"
            value={startSec}
            onChange={(v) => setStartSec(typeof v === "number" ? v : 0)}
          />
          <NumberInput
            label="終了 (秒)"
            value={endSec}
            onChange={(v) => setEndSec(typeof v === "number" ? v : 0)}
          />
        </Group>
        <TextInput
          label="Angle label"
          value={angleLabel}
          onChange={(e) => setAngleLabel(e.currentTarget.value)}
          placeholder="例: 正面 / コート横"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            disabled={!videoId}
            loading={addRunVideo.isPending}
          >
            追加
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
