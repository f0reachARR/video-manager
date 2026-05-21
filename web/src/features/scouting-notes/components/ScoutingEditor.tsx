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
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";

import { MarkerLink } from "./MarkerLink";
import { MarkerPickerModal } from "../../markers/components/MarkerPickerModal";
import "./ScoutingEditor.css";
import { useCurrentUserId } from "../../../stores/currentUser";
import { useUser } from "../../users/api/queries";

// Same-origin WS endpoint behind nginx — vite proxies /hocuspocus to the
// hocuspocus container in dev (see vite.config.ts).
const HOCUSPOCUS_URL: string =
  (import.meta.env.VITE_HOCUSPOCUS_URL as string | undefined) ??
  (window.location.protocol === "https:" ? "wss://" : "ws://") +
    window.location.host +
    "/hocuspocus";

export function ScoutingEditor({ noteId }: { noteId: string }) {
  return (
    <HocuspocusProviderWebsocketComponent url={HOCUSPOCUS_URL}>
      <HocuspocusRoom name={noteId}>
        <ScoutingEditorInner />
      </HocuspocusRoom>
    </HocuspocusProviderWebsocketComponent>
  );
}

// Deterministic fallback color when the current user has no color attribute.
function fallbackColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360} 70% 45%)`;
}

function ScoutingEditorInner() {
  // The provider-react hooks take care of provider lifecycle (Y.Doc creation,
  // WebSocket connect, status / sync events, cleanup on unmount). We only
  // consume the resulting provider + observed status.
  const provider = useHocuspocusProvider();
  const status = useHocuspocusConnectionStatus();
  const synced = useHocuspocusSyncStatus();

  const userId = useCurrentUserId();
  const userQuery = useUser(userId);
  const me = userQuery.data;
  const userInfo = {
    name: me?.name ?? "匿名",
    color: me?.color ?? fallbackColor(userId ?? "anon"),
  };

  const editor = useEditor(
    {
      extensions: [
        // The collaboration extension brings its own undo/redo via Y.UndoManager;
        // disable StarterKit's so we don't end up with two stacks.
        StarterKit.configure({ undoRedo: false }),
        Collaboration.configure({ document: provider.document }),
        CollaborationCaret.configure({ provider, user: userInfo }),
        MarkerLink,
      ],
    },
    [provider],
  );

  // If the current user changes after the editor mounts, update the awareness
  // metadata in-place rather than recreating the editor.
  if (editor) {
    const ext = editor.extensionManager.extensions.find(
      (e) => e.name === "collaborationCaret",
    );
    if (ext && (ext.options.user?.name !== userInfo.name ||
      ext.options.user?.color !== userInfo.color)) {
      editor.commands.updateUser?.(userInfo);
    }
  }

  const [pickerOpen, { open: openPicker, close: closePicker }] = useDisclosure(false);

  return (
    <Paper withBorder p="sm" className="scouting-editor">
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
