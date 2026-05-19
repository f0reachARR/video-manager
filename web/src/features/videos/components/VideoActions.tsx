import { ActionIcon, Group, Modal, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import type { Video } from "../../../lib/api/client";
import { useDeleteVideo } from "../api/queries";
import { VideoMetadataModal } from "./VideoMetadataModal";
import { SessionAssignModal } from "../../sessions/components/SessionAssignModal";
import { AnnotatedPlayer } from "../../annotations/components/AnnotatedPlayer";
import { HLSStatusModal } from "./HLSStatusModal";

const HLS_TOOLTIP: Record<string, string> = {
  pending: "HLS 未着手",
  planning: "HLS 計画中",
  encoding: "HLS エンコード中",
  ready: "HLS 完了",
  failed: "HLS 失敗",
};

const HLS_DOT_COLOR: Record<string, string> = {
  pending: "gray",
  planning: "blue",
  encoding: "blue",
  ready: "green",
  failed: "red",
};

export function VideoActions({ video }: { video: Video }) {
  const [playOpen, { open: openPlay, close: closePlay }] = useDisclosure(false);
  const [metaOpen, { open: openMeta, close: closeMeta }] = useDisclosure(false);
  const [sessionOpen, { open: openSession, close: closeSession }] =
    useDisclosure(false);
  const [hlsOpen, { open: openHls, close: closeHls }] = useDisclosure(false);
  const del = useDeleteVideo();
  return (
    <Group gap={4}>
      <ActionIcon variant="subtle" onClick={openPlay} aria-label="再生">
        ▶
      </ActionIcon>
      <Tooltip label={HLS_TOOLTIP[video.hlsStatus] ?? "HLS 状態"} withinPortal>
        <ActionIcon
          variant="subtle"
          onClick={openHls}
          aria-label="HLS エンコード状況"
          style={{ position: "relative" }}
        >
          🎞
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: `var(--mantine-color-${HLS_DOT_COLOR[video.hlsStatus] ?? "gray"}-6)`,
              border: "1px solid var(--mantine-color-body)",
            }}
          />
        </ActionIcon>
      </Tooltip>
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
      {hlsOpen && <HLSStatusModal video={video} onClose={closeHls} />}
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
