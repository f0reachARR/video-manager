import { AppShell, Box, Group, NavLink, ScrollArea, Stack, Text, Title } from "@mantine/core";
import type { QueryClient } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useMatchRoute,
  useRouterState,
} from "@tanstack/react-router";

import { AuthGate } from "../features/auth/components/AuthGate";
import { SessionMenu } from "../features/auth/components/SessionMenu";
import { TournamentSelector } from "../features/tournaments/components/TournamentSelector";
import { useCurrentTournamentId } from "../stores/currentTournament";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

// Items that operate against the currently selected tournament. Disabled when
// nothing is selected so the user can't navigate into a screen that will only
// show "tournament required" 400s.
const tournamentScopedItems = [
  { to: "/", label: "ホーム" },
  { to: "/pre-match", label: "本番前モード" },
  { to: "/bulk-upload", label: "現場一括アップロード" },
  { to: "/search", label: "検索" },
  { to: "/matches", label: "試合" },
  { to: "/sessions", label: "セッション" },
  { to: "/runs", label: "Run" },
  { to: "/videos", label: "動画" },
  { to: "/encoding", label: "エンコード状況" },
  { to: "/robots", label: "ロボット" },
] as const;

// Tournament-agnostic masters. Tournament/User/Device/Scenario/Tag are the
// five "universals"; Team rides along because it's M:N with tournaments.
const masterItems = [
  { to: "/tournaments", label: "大会" },
  { to: "/teams", label: "チーム" },
  { to: "/users", label: "ユーザー" },
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
  return (
    <AuthGate>
      <AuthenticatedLayout />
    </AuthGate>
  );
}

function AuthenticatedLayout() {
  const matchRoute = useMatchRoute();
  const tournamentId = useCurrentTournamentId();
  const tournamentSelected = !!tournamentId;
  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: "sm" }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="lg">
            <Title order={4}>Video Manager</Title>
            <TournamentSelector />
          </Group>
          <SessionMenu />
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap={2}>
            <Text size="xs" c="dimmed" px="xs" pt={4}>
              大会
            </Text>
            {tournamentScopedItems.map((item) => {
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
                  disabled={!tournamentSelected}
                />
              );
            })}
            <Text size="xs" c="dimmed" px="xs" pt="sm">
              マスタ管理
            </Text>
            {masterItems.map((item) => {
              const active = !!matchRoute({ to: item.to, fuzzy: true });
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
