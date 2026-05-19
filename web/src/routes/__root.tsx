import { AppShell, Box, Group, NavLink, ScrollArea, Stack, Title } from "@mantine/core";
import type { QueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useMatchRoute,
  useRouterState,
} from "@tanstack/react-router";

import { CurrentUserPicker } from "../components/ui/CurrentUserPicker";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

const navItems = [
  { to: "/", label: "ホーム" },
  { to: "/pre-match", label: "本番前モード" },
  { to: "/search", label: "検索" },
  { to: "/sessions", label: "セッション" },
  { to: "/runs", label: "Run" },
  { to: "/videos", label: "動画" },
  { to: "/encoding", label: "エンコード状況" },
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // /share/* は read-only 共有ビュー — AppShell サイドバー / ユーザピッカーを
  // 隠して最低限のレイアウトだけ提供する。
  if (pathname.startsWith("/share/")) {
    return (
      <Box p="md">
        <Outlet />
      </Box>
    );
  }
  return <AuthenticatedLayout />;
}

function AuthenticatedLayout() {
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
