import {
  Drawer,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Link, useMatchRoute } from "@tanstack/react-router";

import { useCurrentTournamentId } from "../../stores/currentTournament";
import {
  isActive,
  masterItems,
  primaryTabs,
  tournamentScopedItems,
} from "./navItems";

export function BottomTabBar() {
  const matchRoute = useMatchRoute();
  const tournamentSelected = !!useCurrentTournamentId();
  const [menuOpened, menu] = useDisclosure(false);

  return (
    <>
      <Group h="100%" gap={0} grow align="stretch" wrap="nowrap">
        {primaryTabs.map((tab) => {
          const active = isActive(matchRoute, tab.to);
          const disabled = tab.tournamentScoped && !tournamentSelected;
          const tabStyle = {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: active
              ? "var(--mantine-color-anchor)"
              : disabled
                ? "var(--mantine-color-dimmed)"
                : "var(--mantine-color-text)",
            opacity: disabled ? 0.5 : 1,
          } as const;
          const label = (
            <Text size="xs" fw={active ? 600 : 400}>
              {tab.label}
            </Text>
          );
          return disabled ? (
            <UnstyledButton key={tab.to} component="button" disabled style={tabStyle}>
              {label}
            </UnstyledButton>
          ) : (
            <UnstyledButton
              key={tab.to}
              component={Link}
              to={tab.to}
              data-active={active || undefined}
              style={tabStyle}
            >
              {label}
            </UnstyledButton>
          );
        })}
        <UnstyledButton
          onClick={menu.open}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--mantine-color-text)",
          }}
        >
          <Text size="xs">メニュー</Text>
        </UnstyledButton>
      </Group>

      <Drawer
        opened={menuOpened}
        onClose={menu.close}
        position="bottom"
        size="80%"
        title="メニュー"
      >
        <ScrollArea>
          <Stack gap={2}>
            <Text size="xs" c="dimmed" px="xs">
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
                onClick={menu.close}
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
                onClick={menu.close}
              />
            ))}
          </Stack>
        </ScrollArea>
      </Drawer>
    </>
  );
}
