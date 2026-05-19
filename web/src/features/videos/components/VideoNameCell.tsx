import { Text, TextInput } from "@mantine/core";
import { useState } from "react";

import type { Video } from "../../../lib/api/client";
import { useUpdateVideo } from "../api/queries";

// Inline-editable display name. Falls back to a truncated storage_key when
// the row predates the displayName column or upload had no filename meta.
export function VideoNameCell({ video }: { video: Video }) {
  const update = useUpdateVideo();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(video.displayName ?? "");
  if (editing) {
    const commit = () => {
      const next = draft.trim();
      if (next !== (video.displayName ?? "")) {
        update.mutate({ id: video.id, body: { displayName: next } });
      }
      setEditing(false);
    };
    return (
      <TextInput
        size="xs"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") {
            setDraft(video.displayName ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }
  const shown = video.displayName?.trim() || video.storageKey;
  return (
    <Text
      size="sm"
      truncate
      maw={220}
      title={`${shown} (${video.storageKey})\nクリックで編集`}
      onClick={() => {
        setDraft(video.displayName ?? "");
        setEditing(true);
      }}
      style={{ cursor: "pointer" }}
    >
      {shown}
    </Text>
  );
}
