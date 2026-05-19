import { Alert, Button, Center, Loader, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { ApiError, authApi } from "../../../lib/api/client";
import { setCurrentUserId } from "../../../stores/currentUser";
import { CurrentUserPicker } from "../../../components/ui/CurrentUserPicker";
import { useAuthConfig, useMe } from "../api/queries";

/**
 * AuthGate is the top-level boundary: nothing in the app renders until we
 * know who the caller is. There are two recognized authenticated paths:
 *
 *  - OIDC session cookie set after `/auth/login` → `/auth/callback`
 *  - dev-bypass: the user picked someone from CurrentUserPicker, which sets
 *    `X-User-Id` via the legacy header path
 *
 * On 401 we show whichever login affordance the server reports as available.
 * On 200 we mirror the user.id into the legacy currentUserId store so the
 * dev-bypass-aware code paths (uploads metadata, marker author, etc.) keep
 * working without rewrite.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const cfg = useAuthConfig();

  // Keep the legacy localStorage user id in sync. The header is harmless when
  // the cookie is also present (dev-bypass middleware only reads the header
  // when no session cookie resolves), so this is safe in prod too.
  useEffect(() => {
    if (me.data) setCurrentUserId(me.data.id);
  }, [me.data]);

  if (me.isLoading || cfg.isLoading) {
    return (
      <Center mih="60vh">
        <Loader />
      </Center>
    );
  }

  const unauthorized =
    me.error instanceof ApiError && me.error.status === 401;
  if (unauthorized) {
    return <LoginScreen oidcEnabled={!!cfg.data?.oidcEnabled} devBypass={!!cfg.data?.devBypassEnabled} />;
  }

  if (me.error) {
    return (
      <Center mih="60vh">
        <Alert color="red" title="認証情報の取得に失敗しました">
          {me.error instanceof Error ? me.error.message : String(me.error)}
        </Alert>
      </Center>
    );
  }

  return <>{children}</>;
}

function LoginScreen({
  oidcEnabled,
  devBypass,
}: {
  oidcEnabled: boolean;
  devBypass: boolean;
}) {
  return (
    <Center mih="80vh">
      <Stack w={360} gap="md">
        <Title order={3} ta="center">
          サインインが必要です
        </Title>
        {oidcEnabled && (
          <Button
            component="a"
            href={authApi.loginHref(window.location.pathname + window.location.search)}
            size="md"
          >
            OIDC でサインイン
          </Button>
        )}
        {devBypass && (
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              開発バイパス: ユーザを選ぶと <code>X-User-Id</code> ヘッダで API
              を叩きます。
            </Text>
            <CurrentUserPicker />
            <Text size="xs" c="dimmed">
              選択後にこのページをリロードしてください。
            </Text>
          </Stack>
        )}
        {!oidcEnabled && !devBypass && (
          <Alert color="red" variant="light">
            OIDC も dev-bypass も無効です。サーバ側の `OIDC_*` または
            `AUTH_DEV_BYPASS` を設定してください。
          </Alert>
        )}
      </Stack>
    </Center>
  );
}
