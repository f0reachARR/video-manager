import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "src/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
    }),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Soiree",
        short_name: "Soiree",
        description: "ロボコン テストラン動画整理アプリ",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#228be6",
        orientation: "any",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // App shell precache. Skip large files that don't belong in cache.
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        // SPA fallback for offline navigation.
        navigateFallback: "/index.html",
        // Don't intercept API, tus, or websocket — those need the network and
        // have their own retry semantics. Also skip the dev SW endpoint.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/files\//,
          /^\/ws/,
          /^\/hocuspocus/,
        ],
        runtimeCaching: [
          {
            // Cache API GETs so list views work briefly when offline. The app
            // still hits the network first; the cache is a fallback only.
            urlPattern: ({ url, request }) =>
              request.method === "GET" && url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-get",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Enable SW in `vite dev` for local testing of offline behavior.
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      // tusd runs on :1080 in dev (docker compose). The SPA uses the same
      // /files/ path it sees in production behind nginx.
      "/files": {
        target: "http://localhost:1080",
        changeOrigin: true,
      },
      // Hocuspocus collab WS server. Same-origin in production via nginx.
      "/hocuspocus": {
        target: "ws://localhost:1234",
        ws: true,
        rewriteWsOrigin: true,
        rewrite: (p) => p.replace(/^\/hocuspocus/, ""),
      },
    },
  },
});
