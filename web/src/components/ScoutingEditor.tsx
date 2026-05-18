import { Badge, Group, Paper, Text } from "@mantine/core";
import { HocuspocusProvider } from "@hocuspocus/provider";
import Collaboration from "@tiptap/extension-collaboration";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";

const HOCUSPOCUS_URL: string =
  (import.meta.env.VITE_HOCUSPOCUS_URL as string | undefined) ??
  (window.location.protocol === "https:" ? "wss://" : "ws://") +
    window.location.hostname +
    ":1234";

type Status = "connecting" | "connected" | "disconnected";

export function ScoutingEditor({ noteId }: { noteId: string }) {
  const [status, setStatus] = useState<Status>("connecting");

  // One Y.Doc + Hocuspocus provider per noteId.
  const { ydoc, provider } = useMemo(() => {
    const doc = new Y.Doc();
    const p = new HocuspocusProvider({
      url: HOCUSPOCUS_URL,
      name: noteId,
      document: doc,
    });
    return { ydoc: doc, provider: p };
  }, [noteId]);

  useEffect(() => {
    const onStatus = (e: { status: string }) => {
      if (e.status === "connected") setStatus("connected");
      else if (e.status === "disconnected") setStatus("disconnected");
      else setStatus("connecting");
    };
    provider.on("status", onStatus);
    return () => {
      provider.off("status", onStatus);
      provider.destroy();
      ydoc.destroy();
    };
  }, [provider, ydoc]);

  const editor = useEditor(
    {
      extensions: [
        // The collaboration extension brings its own undo/redo via Y.UndoManager;
        // disable StarterKit's so we don't end up with two stacks.
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: ydoc }),
      ],
    },
    [ydoc],
  );

  return (
    <Paper withBorder p="sm">
      <Group justify="space-between" mb="xs">
        <Text size="xs" c="dimmed">
          リアルタイム同期 (Hocuspocus)
        </Text>
        <Badge
          size="xs"
          color={status === "connected" ? "teal" : status === "connecting" ? "yellow" : "red"}
          variant="light"
        >
          {status}
        </Badge>
      </Group>
      <div
        style={{
          minHeight: 200,
          padding: "8px 12px",
          border: "1px solid var(--mantine-color-gray-3)",
          borderRadius: 6,
          background: "#fff",
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </Paper>
  );
}
