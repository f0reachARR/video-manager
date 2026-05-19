import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Title,
} from "@mantine/core";
import type { ReactNode } from "react";

import { ApiError } from "../../lib/api/client";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  children: ReactNode;
};

export function ResourcePage(props: Props) {
  return (
    <Stack maw={1100}>
      <Group justify="space-between" align="flex-end">
        <Stack gap={4}>
          <Title order={2}>{props.title}</Title>
          {props.description && (
            <Title order={6} c="dimmed" fw={400}>
              {props.description}
            </Title>
          )}
        </Stack>
        {props.actions && <Group>{props.actions}</Group>}
      </Group>

      {props.error ? <ErrorAlert error={props.error} onRetry={props.onRetry} /> : null}

      {props.isLoading ? (
        <Group justify="center" p="xl">
          <Loader />
        </Group>
      ) : (
        <Paper withBorder p="md">
          {props.children}
        </Paper>
      )}
    </Stack>
  );
}

function ErrorAlert({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError
      ? `[${error.body.code}] ${error.body.message}`
      : error instanceof Error
        ? error.message
        : "Unknown error";
  return (
    <Alert color="red" title="エラー">
      <Stack gap="xs">
        <span>{message}</span>
        {onRetry && (
          <Button size="xs" variant="light" onClick={onRetry}>
            再試行
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
