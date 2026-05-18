import { Select, Text } from "@mantine/core";

import { setCurrentUserId, useCurrentUserId } from "../lib/currentUser";
import { useUsers } from "../lib/queries";

export function CurrentUserPicker() {
  const currentUserId = useCurrentUserId();
  const users = useUsers();

  const data = (users.data?.data ?? []).map((u) => ({
    value: u.id,
    label: u.name,
  }));

  return (
    <Select
      size="sm"
      w={220}
      placeholder="現在のユーザー"
      data={data}
      value={currentUserId ?? null}
      onChange={(v) => setCurrentUserId(v)}
      clearable
      searchable
      disabled={users.isLoading}
      nothingFoundMessage={
        <Text size="xs" c="dimmed">
          ユーザーがいません。/users で作成してください
        </Text>
      }
    />
  );
}
