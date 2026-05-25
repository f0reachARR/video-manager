import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError, sessionsApi, type Video } from "../../../lib/api/client";
import { useCreateSession } from "../api/queries";
import { useUpdateVideo } from "../../videos/api/queries";

type Props = {
  video: Video;
  onClose: () => void;
};

export function SessionAssignModal({ video, onClose }: Props) {
  const candidates = useQuery({
    queryKey: ["session-candidates", video.id],
    queryFn: () => sessionsApi.candidates(video.id),
  });
  const updateVideo = useUpdateVideo();
  const createSession = useCreateSession();
  const [selected, setSelected] = useState<string>("new");
  const [newName, setNewName] = useState<string>("");

  const candidateList = candidates.data?.data ?? [];
  const newCandidate = candidateList.find((c) => c.type === "new");
  const suggestedName = newCandidate?.suggestedName ?? "新規 Session";

  const isPending = updateVideo.isPending || createSession.isPending;

  const handleAssign = async () => {
    let sessionId: string;
    if (selected === "new") {
      const name = (newName || suggestedName).trim();
      if (!name) return;
      const session = await createSession.mutateAsync({
        name,
        modeHint: "practice",
        startedAt: video.recordedAt ?? null,
        // Sessions are tournament-scoped; reuse the video's tournament so the
        // newly created session lands in the same tournament as the upload.
        tournamentId: video.tournamentId,
      });
      sessionId = session.id;
    } else {
      sessionId = selected;
    }
    await updateVideo.mutateAsync({ id: video.id, body: { sessionId } });
    onClose();
  };

  return (
    <Modal opened onClose={onClose} title="Session に紐づける" size="lg">
      <Stack>
        {candidates.error && (
          <Alert color="red">
            {candidates.error instanceof ApiError
              ? candidates.error.body.message
              : (candidates.error as Error).message}
          </Alert>
        )}
        {!video.recordedAt && (
          <Alert color="yellow">
            recorded_at が未設定です。先に「メタデータ編集」から補正するか、新規 Session を作成してください。
          </Alert>
        )}
        <Radio.Group value={selected} onChange={setSelected}>
          <Stack gap="xs">
            {candidateList
              .filter((c) => c.type === "existing")
              .map((c) =>
                c.session ? (
                  <Card key={c.session.id} withBorder p="xs">
                    <Radio
                      value={c.session.id}
                      label={
                        <Group gap="xs">
                          <Text fw={500}>{c.session.name}</Text>
                          <Badge size="sm" variant="light">
                            {c.session.modeHint}
                          </Badge>
                          <Text size="xs" c="dimmed">
                            gap {c.gapSec ?? 0}s
                          </Text>
                          {c.session.startedAt && (
                            <Text size="xs" c="dimmed">
                              {new Date(c.session.startedAt).toLocaleString()}
                              {c.session.endedAt &&
                                ` 〜 ${new Date(c.session.endedAt).toLocaleString()}`}
                            </Text>
                          )}
                        </Group>
                      }
                    />
                  </Card>
                ) : null,
              )}
            <Card withBorder p="xs">
              <Radio
                value="new"
                label={
                  <Stack gap={4}>
                    <Text fw={500}>新規 Session を作成</Text>
                    <TextInput
                      size="xs"
                      placeholder={suggestedName}
                      value={newName}
                      onChange={(e) => setNewName(e.currentTarget.value)}
                      disabled={selected !== "new"}
                    />
                  </Stack>
                }
              />
            </Card>
          </Stack>
        </Radio.Group>

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleAssign} loading={isPending}>
            紐づける
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
