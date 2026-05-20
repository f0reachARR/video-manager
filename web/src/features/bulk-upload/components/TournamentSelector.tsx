import { Select } from "@mantine/core";

import { useTournaments } from "../../tournaments/api/queries";

type Props = {
  value: string | null;
  onChange: (v: string | null) => void;
};

export function TournamentSelector({ value, onChange }: Props) {
  const tournaments = useTournaments();
  const data = (tournaments.data?.data ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));
  return (
    <Select
      label="大会"
      placeholder="大会を選択"
      data={data}
      value={value}
      onChange={onChange}
      searchable
      clearable={false}
      w={260}
    />
  );
}
