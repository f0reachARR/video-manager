import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../../../lib/api/client";
import { useRobots } from "../../robots/api/queries";
import { useScenarios } from "../../scenarios/api/queries";
import { useAddRunVideo, useCreateRun } from "../../runs/api/queries";
import {
  useTournamentRobots,
  useTournamentTeams,
} from "../../tournaments/api/queries";
import { useVideo } from "../../videos/api/queries";

type Props = {
  videoId: string | null;
  tournamentId: string | null;
  defaultSessionId: string | null;
  // Localstorage-backed default team/robot so the operator can shoot
  // through a string of Runs without re-picking each time.
  defaultTeamId: string | null;
  defaultRobotId: string | null;
  onClose: () => void;
};

// CreateRunFromVideoModal: the P6 shortcut. 1 video → 1 Run with sensible
// defaults (full-length 0..durationSec, no match, no markers). Multi-angle
// or partial-clip Runs go through the regular /runs UI; this modal
// optimizes for the live-event "tap, type, ship" path.
export function CreateRunFromVideoModal({
  videoId,
  tournamentId,
  defaultSessionId,
  defaultTeamId,
  defaultRobotId,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const video = useVideo(videoId);
  const teams = useTournamentTeams(tournamentId);
  const tournamentRobots = useTournamentRobots(tournamentId);
  const scenarios = useScenarios();
  const createRun = useCreateRun();
  const addRunVideo = useAddRunVideo();

  const [teamId, setTeamId] = useState<string | null>(defaultTeamId);
  const [robotId, setRobotId] = useState<string | null>(defaultRobotId);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [memo, setMemo] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fallback robot list — see TeamRobotSelector for the same rule.
  const teamRobots = useRobots(teamId ? { teamId, limit: 200 } : {});

  useEffect(() => {
    setTeamId(defaultTeamId);
    setRobotId(defaultRobotId);
    setScenarioId(null);
    setMemo("");
    setError(null);
  }, [videoId, defaultTeamId, defaultRobotId]);

  const teamOptions = useMemo(
    () =>
      (teams.data?.data ?? []).map((t) => ({
        value: t.id,
        label: t.isOwn ? `${t.name} (自チーム)` : t.name,
      })),
    [teams.data],
  );

  const robotOptions = useMemo(() => {
    if (!teamId) return [];
    const tournamentList = (tournamentRobots.data?.data ?? []).filter(
      (r) => r.teamId === teamId,
    );
    if (tournamentList.length > 0) {
      return tournamentList.map((r) => ({
        value: r.id,
        label: r.version ? `${r.name} (${r.version})` : r.name,
      }));
    }
    return (teamRobots.data?.data ?? [])
      .filter((r) => r.teamId === teamId)
      .map((r) => ({
        value: r.id,
        label: r.version ? `${r.name} (${r.version})` : r.name,
      }));
  }, [teamId, tournamentRobots.data, teamRobots.data]);

  const scenarioOptions = useMemo(
    () =>
      (scenarios.data?.data ?? []).map((s) => ({
        value: s.id,
        label: s.name,
      })),
    [scenarios.data],
  );

  const submit = async () => {
    if (!videoId || !video.data) return;
    const sessionId = video.data.sessionId ?? defaultSessionId;
    if (!sessionId) {
      setError(
        "動画にセッションが紐付いていません。先にセッションを設定してください。",
      );
      return;
    }
    if (!teamId || !robotId || !scenarioId) {
      setError("チーム / ロボット / シナリオ を選んでください。");
      return;
    }
    const startedAt = video.data.recordedAt ?? new Date().toISOString();
    const durationSec = video.data.durationSec ?? 0;
    setSubmitting(true);
    setError(null);
    try {
      const run = await createRun.mutateAsync({
        sessionId,
        teamId,
        robotId,
        scenarioId,
        startedAt,
        memo: memo.trim(),
      });
      await addRunVideo.mutateAsync({
        runId: run.id,
        body: {
          videoId,
          videoOffsetStartSec: 0,
          // duration may be unknown if probe hasn't finished yet; tolerate
          // and let the user adjust later from the Run editor.
          videoOffsetEndSec: durationSec,
          runOffsetSec: 0,
          angleLabel: "",
        },
      });
      onClose();
      navigate({ to: "/runs/$runId", params: { runId: run.id } });
    } catch (e) {
      setError(
        e instanceof ApiError ? e.body.message : (e as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={videoId != null} onClose={onClose} title="動画から Run を作成">
      <Stack>
        {video.isLoading && <Text c="dimmed">動画情報を読み込み中…</Text>}
        {video.data && (
          <Stack gap={2}>
            <Text size="sm" fw={500}>
              {video.data.displayName}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">
              {video.data.id}
            </Text>
            <Text size="xs" c="dimmed">
              {video.data.durationSec
                ? `尺 ${video.data.durationSec}s`
                : "尺未取得 (probe 完了後に確定)"}
            </Text>
          </Stack>
        )}
        <Select
          label="チーム"
          data={teamOptions}
          value={teamId}
          onChange={(v) => {
            setTeamId(v);
            setRobotId(null);
          }}
          searchable
          required
        />
        <Select
          label="ロボット"
          data={robotOptions}
          value={robotId}
          onChange={setRobotId}
          disabled={!teamId}
          searchable
          required
        />
        <Select
          label="シナリオ"
          data={scenarioOptions}
          value={scenarioId}
          onChange={setScenarioId}
          searchable
          required
        />
        <Textarea
          label="メモ (任意)"
          value={memo}
          onChange={(e) => setMemo(e.currentTarget.value)}
          minRows={2}
          autosize
        />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            キャンセル
          </Button>
          <Button onClick={submit} loading={submitting}>
            Run を作成して開く
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
