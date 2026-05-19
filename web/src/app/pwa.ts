import { registerSW } from "virtual:pwa-register";

// `autoUpdate` mode: vite-plugin-pwa precaches the new build and the
// returned `updateSW(true)` swaps to it. We reload immediately so users
// don't sit on a stale shell — the app is small and there's no editor
// state that survives a reload anyway.
export function setupPWA() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW(true);
    },
    onRegisterError(err) {
      console.warn("[pwa] sw registration failed", err);
    },
  });
}
