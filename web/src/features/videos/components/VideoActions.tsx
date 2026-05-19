import { ActionIcon, Group, Modal } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import type { Video } from "../../../lib/api/client";
import { useDeleteVideo } from "../api/queries";
import { VideoMetadataModal } from "./VideoMetadataModal";
import { SessionAssignModal } from "../../sessions/components/SessionAssignModal";
import { AnnotatedPlayer } from "../../annotations/components/AnnotatedPlayer";

export function VideoActions({ video }: { video: Video }) {
  const [playOpen, { open: openPlay, close: closePlay }] = useDisclosure(false);
  const [metaOpen, { open: openMeta, close: closeMeta }] = useDisclosure(false);
  const [sessionOpen, { open: openSession, close: closeSession }] =
    useDisclosure(false);
  const del = useDeleteVideo();
  return (
    <Group gap={4}>
      <ActionIcon variant="subtle" onClick={openPlay} aria-label="再生">
        ▶
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        onClick={openMeta}
        aria-label="メタデータ編集"
      >
        ✏️
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        onClick={openSession}
        aria-label="Session 紐付け"
      >
        📁
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="red"
        loading={del.isPending}
        onClick={() => {
          if (
            confirm("削除しますか？ オブジェクトストレージのファイルも消えます")
          ) {
            del.mutate(video.id);
          }
        }}
        aria-label="削除"
      >
        🗑️
      </ActionIcon>
      {playOpen && <PlaybackModal video={video} onClose={closePlay} />}
      {metaOpen && <VideoMetadataModal video={video} onClose={closeMeta} />}
      {sessionOpen && (
        <SessionAssignModal video={video} onClose={closeSession} />
      )}
    </Group>
  );
}

function PlaybackModal({
  video,
  onClose,
}: {
  video: Video;
  onClose: () => void;
}) {
  return (
    <Modal opened onClose={onClose} title="動画再生 + Annotation" size="xl">
      <AnnotatedPlayer video={video} />
    </Modal>
  );
}
