import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "dayjs/locale/ja";

import type { ReactNode } from "react";
import { createTheme, MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Default Mantine date display formats are locale-aware via dayjs but the
// value-label format strings default to `MMMM D, YYYY` / `DD/MM/YYYY HH:mm`,
// which are wrong for our JP users. Force `Y/M/D`-style across the app via
// theme defaultProps. The seconds variants are set per call site because
// Mantine's DateTimePicker normally derives the format from `withSeconds`.
const theme = createTheme({
  components: {
    DateInput: { defaultProps: { valueFormat: "YYYY/MM/DD" } },
    DatePickerInput: { defaultProps: { valueFormat: "YYYY/MM/DD" } },
    MonthPickerInput: { defaultProps: { valueFormat: "YYYY/MM" } },
    YearPickerInput: { defaultProps: { valueFormat: "YYYY" } },
    DateTimePicker: { defaultProps: { valueFormat: "YYYY/MM/DD HH:mm" } },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider defaultColorScheme="auto" theme={theme}>
        <DatesProvider settings={{ locale: "ja", firstDayOfWeek: 0 }}>
          {children}
        </DatesProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}
