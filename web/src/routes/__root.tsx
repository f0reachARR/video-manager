import {
  AppShell,
  Box,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
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
import { BottomTabBar } from "../components/layout/BottomTabBar";
import {
  isActive,
  masterItems,
  tournamentScopedItems,
} from "../components/layout/navItems";
import { useCurrentTournamentId } from "../stores/currentTournament";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
});

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
  const theme = useMantineTheme();
  // 同じ "sm" ブレークポイントで Navbar が隠れる ⇄ ボトムバーが出る を一致させる。
  const isMobile =
    useMediaQuery(`(max-width: ${theme.breakpoints.sm})`, false, {
      getInitialValueInEffect: true,
    }) ?? false;
  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: "sm" }}
      footer={{ height: 56, collapsed: !isMobile, offset: true }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="lg">
            <Title order={4}>Soiree</Title>
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
            {tournamentScopedItems.map((item) => (
              <NavLink
                key={item.to}
                component={Link}
                to={item.to}
                label={item.label}
                active={isActive(matchRoute, item.to)}
                disabled={!tournamentSelected}
              />
            ))}
            <Text size="xs" c="dimmed" px="xs" pt="sm">
              マスタ管理
            </Text>
            {masterItems.map((item) => (
              <NavLink
                key={item.to}
                component={Link}
                to={item.to}
                label={item.label}
                active={isActive(matchRoute, item.to)}
              />
            ))}
          </Stack>
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
      <AppShell.Footer p={0}>
        <BottomTabBar />
      </AppShell.Footer>
    </AppShell>
  );
}
