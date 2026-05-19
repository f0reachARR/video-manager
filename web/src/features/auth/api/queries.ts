import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, authApi } from "../../../lib/api/client";

const ME_KEY = ["auth", "me"] as const;
const CONFIG_KEY = ["auth", "config"] as const;

/**
 * useAuthConfig fetches the server's auth capabilities once. The result tells
 * the SPA which login UI to show (OIDC button vs. dev-bypass picker).
 */
export const useAuthConfig = () =>
  useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => authApi.config(),
    staleTime: Infinity,
  });

/**
 * useMe returns the authenticated user. A 401 surfaces as ApiError with
 * status 401 — the AuthGate inspects that and gates the SPA accordingly.
 */
export const useMe = () =>
  useQuery({
    queryKey: ME_KEY,
    queryFn: () => authApi.me(),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) return false;
      return failureCount < 2;
    },
  });

/**
 * useLogout clears the session cookie server-side and invalidates the SPA's
 * cached /auth/me + dependent queries.
 */
export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      qc.removeQueries({ queryKey: ME_KEY });
    },
  });
};
