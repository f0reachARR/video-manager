import { Alert, Badge, Button, Group, Paper, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  HocuspocusProviderWebsocketComponent,
  HocuspocusRoom,
  useHocuspocusConnectionStatus,
  useHocuspocusProvider,
  useHocuspocusSyncStatus,
} from "@hocuspocus/provider-react";
import Collaboration from "@tiptap/extension-collaboration";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";

import { MarkerLink } from "./MarkerLink";
import { MarkerPickerModal } from "./MarkerPickerModal";

const HOCUSPOCUS_URL: string =
  (import.meta.env.VITE_HOCUSPOCUS_URL as string | undefined) ??
  (window.location.protocol === "https:" ? "wss://" : "ws://") +
    window.location.hostname +
    ":1234";

export function ScoutingEditor({ noteId }: { noteId: string }) {
  return (
    <HocuspocusProviderWebsocketComponent url={HOCUSPOCUS_URL}>
      <HocuspocusRoom name={noteId}>
        <ScoutingEditorInner />
      </HocuspocusRoom>
    </HocuspocusProviderWebsocketComponent>
  );
}

function ScoutingEditorInner() {
  // The provider-react hooks take care of provider lifecycle (Y.Doc creation,
  // WebSocket connect, status / sync events, cleanup on unmount). We only
  // consume the resulting provider + observed status.
  const provider = useHocuspocusProvider();
  const status = useHocuspocusConnectionStatus();
  const synced = useHocuspocusSyncStatus();

  const editor = useEditor(
    {
      extensions: [
        // The collaboration extension brings its own undo/redo via Y.UndoManager;
        // disable StarterKit's so we don't end up with two stacks.
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: provider.document }),
        MarkerLink,
      ],
    },
    [provider],
  );

  const [pickerOpen, { open: openPicker, close: closePicker }] = useDisclosure(false);

  return (
    <Paper withBorder p="sm">
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
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
          {status === "connected" && !synced && (
            <Badge size="xs" color="yellow" variant="light">
              syncing
            </Badge>
          )}
        </Group>
        <Button size="compact-xs" variant="default" onClick={openPicker} disabled={!editor}>
          📍 Marker を挿入
        </Button>
      </Group>
      {status === "disconnected" && (
        <Alert color="orange" mb="xs">
          Hocuspocus に接続できません。 <code>docker compose up -d hocuspocus</code> で
          コンテナが起動しているか、 {HOCUSPOCUS_URL} に到達できるか確認してください。
        </Alert>
      )}
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
      <MarkerPickerModal
        opened={pickerOpen}
        onClose={closePicker}
        onPick={(markerId) => {
          editor?.chain().focus().insertMarkerLink(markerId).run();
          closePicker();
        }}
      />
    </Paper>
  );
}
