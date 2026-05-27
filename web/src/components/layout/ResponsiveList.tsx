import { Card, Stack, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";

/** True when below the `sm` breakpoint — matches the AppShell navbar/footer toggle. */
export function useIsMobile(): boolean {
  const theme = useMantineTheme();
  return (
    useMediaQuery(`(max-width: ${theme.breakpoints.sm})`, false, {
      getInitialValueInEffect: true,
    }) ?? false
  );
}

type ResponsiveListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  /** Existing desktop table, rendered as-is on wide viewports. */
  table: ReactNode;
  /** Mobile card body for a single item. */
  renderCard: (item: T) => ReactNode;
  empty?: ReactNode;
};

/**
 * Shows the existing `table` on desktop and a stacked card list on mobile.
 * The desktop table is left untouched; this only decides which to render.
 */
export function ResponsiveList<T>({
  items,
  getKey,
  table,
  renderCard,
  empty,
}: ResponsiveListProps<T>) {
  const isMobile = useIsMobile();
  if (!isMobile) return <>{table}</>;
  if (items.length === 0) return <>{empty ?? null}</>;
  return (
    <Stack gap="xs">
      {items.map((item) => (
        <Card key={getKey(item)} withBorder padding="sm">
          {renderCard(item)}
        </Card>
      ))}
    </Stack>
  );
}
