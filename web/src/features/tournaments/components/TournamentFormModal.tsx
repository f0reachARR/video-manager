import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useState } from "react";

import type { Tournament } from "../../../lib/api/client";
import { useCreateTournament, useUpdateTournament } from "../api/queries";

const fmtDate = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : null;

export function TournamentFormModal({
  opened,
  onClose,
  tournament,
}: {
  opened: boolean;
  onClose: () => void;
  tournament?: Tournament;
}) {
  const create = useCreateTournament();
  const update = useUpdateTournament();
  const [name, setName] = useState(tournament?.name ?? "");
  const [startDate, setStartDate] = useState<Date | null>(
    tournament?.startDate ? new Date(tournament.startDate) : null,
  );
  const [endDate, setEndDate] = useState<Date | null>(
    tournament?.endDate ? new Date(tournament.endDate) : null,
  );

  const submit = () => {
    const body = {
      name,
      startDate: fmtDate(startDate),
      endDate: fmtDate(endDate),
    };
    if (tournament) {
      update.mutate({ id: tournament.id, body }, { onSuccess: onClose });
    } else {
      create.mutate(body, { onSuccess: onClose });
    }
  };
  const busy = create.isPending || update.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={tournament ? "大会を編集" : "大会を作成"}
    >
      <Stack>
        <TextInput
          label="名前"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <Group grow>
          <DateInput
            label="開始日"
            value={startDate}
            onChange={(v) => setStartDate(v ? new Date(v) : null)}
            clearable
          />
          <DateInput
            label="終了日"
            value={endDate}
            onChange={(v) => setEndDate(v ? new Date(v) : null)}
            clearable
          />
        </Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={submit} loading={busy} disabled={!name}>
            {tournament ? "保存" : "作成"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
