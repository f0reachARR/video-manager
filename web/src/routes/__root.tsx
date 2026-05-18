import { AppShell, Group, NavLink, ScrollArea, Stack, Title } from "@mantine/core";
import type { QueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useMatchRoute,
} from "@tanstack/react-router";

import { CurrentUserPicker } from "../components/CurrentUserPicker";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

const navItems = [
  { to: "/", label: "ホーム" },
  { to: "/search", label: "検索" },
  { to: "/sessions", label: "セッション" },
  { to: "/runs", label: "Run" },
  { to: "/videos", label: "動画" },
  { to: "/tournaments", label: "大会" },
  { to: "/matches", label: "試合" },
  { to: "/users", label: "ユーザー" },
  { to: "/teams", label: "チーム" },
  { to: "/robots", label: "ロボット" },
  { to: "/devices", label: "機材" },
  { to: "/scenarios", label: "シナリオ" },
  { to: "/tags", label: "タグ" },
] as const;

function RootLayout() {
  const matchRoute = useMatchRoute();
  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: "sm" }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>Video Manager</Title>
          <CurrentUserPicker />
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={2}>
            {navItems.map((item) => {
              const active =
                item.to === "/"
                  ? !!matchRoute({ to: "/", fuzzy: false })
                  : !!matchRoute({ to: item.to, fuzzy: true });
              return (
                <NavLink
                  key={item.to}
                  component={Link}
                  to={item.to}
                  label={item.label}
                  active={active}
                />
              );
            })}
          </Stack>
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
