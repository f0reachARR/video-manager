import { Button, Group, Modal, Select, Stack, TextInput } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useState } from "react";

import type {
  Session,
  SessionModeHint,
  UpdateSessionRequest,
} from "../../../lib/api/client";
import { useTournaments } from "../../tournaments/api/queries";
import { useCreateSession, useUpdateSession } from "../api/queries";

const modeOptions: { value: SessionModeHint; label: string }[] = [
  { value: "practice", label: "練習 (practice)" },
  { value: "pre_match", label: "本番直前 (pre_match)" },
];

function toDate(v: string | null | undefined): Date | null {
  return v ? new Date(v) : null;
}

function toIsoOrNull(v: Date | null): string | null {
  return v ? v.toISOString() : null;
}

export function SessionEditModal({
  opened,
  onClose,
  session,
}: {
  opened: boolean;
  onClose: () => void;
  session: Session | null;
}) {
  const [name, setName] = useState(session?.name ?? "");
  const [modeHint, setModeHint] = useState<SessionModeHint>(
    session?.modeHint ?? "practice",
  );
  const [startedAt, setStartedAt] = useState<Date | null>(toDate(session?.startedAt));
  const [endedAt, setEndedAt] = useState<Date | null>(toDate(session?.endedAt));
  const [location, setLocation] = useState(session?.location ?? "");
  const [tournamentId, setTournamentId] = useState<string | null>(
    session?.tournamentId ?? null,
  );
  const create = useCreateSession();
  const update = useUpdateSession();
  const tournaments = useTournaments();

  const submit = () => {
    if (session) {
      // PATCH semantics: `tournamentId: null` clears the link; omit if
      // unchanged. We always send it so the modal can both set and clear
      // — the backend's Optional<string> Pattern accepts JSON null.
      const payload: UpdateSessionRequest = {
        name,
        modeHint,
        startedAt: toIsoOrNull(startedAt),
        endedAt: toIsoOrNull(endedAt),
        location: location || null,
        tournamentId: tournamentId ?? null,
      };
      update.mutate({ id: session.id, body: payload }, { onSuccess: onClose });
    } else {
      create.mutate(
        {
          name,
          modeHint,
          startedAt: toIsoOrNull(startedAt),
          endedAt: toIsoOrNull(endedAt),
          location: location || null,
          tournamentId: tournamentId ?? null,
        },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={session ? "セッション編集" : "セッション新規作成"}
      size="lg"
    >
      <Stack>
        <TextInput
          label="名前"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <Select
          label="モード"
          data={modeOptions}
          value={modeHint}
          onChange={(v) => v && setModeHint(v as SessionModeHint)}
          allowDeselect={false}
        />
        <Group grow>
          <DateTimePicker
            label="開始"
            value={startedAt}
            onChange={(v) => setStartedAt(v ? new Date(v) : null)}
            clearable
          />
          <DateTimePicker
            label="終了"
            value={endedAt}
            onChange={(v) => setEndedAt(v ? new Date(v) : null)}
            clearable
          />
        </Group>
        <TextInput
          label="場所"
          value={location}
          onChange={(e) => setLocation(e.currentTarget.value)}
          placeholder="例: 体育館 A"
        />
        <Select
          label="大会 (任意)"
          placeholder="紐付け無し"
          data={(tournaments.data?.data ?? []).map((t) => ({
            value: t.id,
            label: t.name,
          }))}
          value={tournamentId}
          onChange={setTournamentId}
          searchable
          clearable
          description="一括アップロード画面で、この大会を選んだときに候補に出ます。"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending || update.isPending}
            disabled={!name.trim()}
          >
            保存
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
