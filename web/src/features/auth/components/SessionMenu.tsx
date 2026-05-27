import { Button, Group, Menu, Text } from "@mantine/core";

import { setCurrentUserId } from "../../../stores/currentUser";
import { useLogout, useMe } from "../api/queries";

/**
 * SessionMenu renders the small "logged in as ..." widget in the app header.
 * Clicking it offers logout, which clears both the server-side session cookie
 * and the legacy localStorage user id used by the dev-bypass code paths.
 */
export function SessionMenu() {
  const me = useMe();
  const logout = useLogout();
  if (!me.data) return null;

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button variant="subtle" size="xs" style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <Text size="sm" fw={500} truncate maw={{ base: 90, sm: 200 }}>
              {me.data.name}
            </Text>
            <Text size="xs" c="dimmed">
              ▾
            </Text>
          </Group>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          color="red"
          onClick={() => {
            logout.mutate(undefined, {
              onSettled: () => {
                setCurrentUserId(null);
                // Force a fresh load so the AuthGate re-evaluates and the SPA
                // tears down any user-scoped state.
                window.location.assign("/");
              },
            });
          }}
        >
          サインアウト
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
