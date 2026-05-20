# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Robocon test-run video manager. Go API + Vite/React SPA + Postgres + MinIO (S3) + tusd + Hocuspocus, orchestrated via docker compose. Phase 1 (auth, upload, runs, markers, matches, annotations, scouting notes, HLS pipeline) is implemented; see [spec.md](spec.md), [spec-devflow.md](spec-devflow.md), [spec-dir-structure.md](spec-dir-structure.md) for the full design and [docs/development.md](docs/development.md) for the dev guide.

`ffprobe`/`ffmpeg` must be on the host (`brew install ffmpeg`); `heif-convert` (libheif) is optional but required for HEIC photo uploads.

## Common commands

All day-to-day operations go through `scripts/`:

| Task | Command |
| --- | --- |
| Full dev stack (Vite 5173 + API 8080 + encode worker 8081) | `./scripts/dev.sh` |
| Apply migrations | `./scripts/migrate.sh up` (also `down`, `version`) |
| Regenerate sqlc from `internal/db/query/*.sql` | `./scripts/gen-sqlc.sh` |
| Lint OpenAPI contract | `./scripts/lint-openapi.sh` |
| Regenerate TS API client from OpenAPI | `./scripts/gen-api-client.sh` |
| Seed dev master data (idempotent) | `./scripts/seed-dev.sh` |
| Run full Go test suite | `./scripts/test.sh` |
| Run a subset of Go tests | `./scripts/test.sh -run TestRuns ./internal/http/handler/...` |
| Standalone extra encode worker | `./scripts/dev-worker.sh` (override `DEV_WORKER_HTTP_ADDR` to avoid 8081 clash) |
| Web typecheck | `pnpm --filter web typecheck` |
| Web prod build | `pnpm --filter web build` |

`scripts/dev.sh` runs two `cmd/app` processes: the API (default queues: probe/plan/finalize) and a worker scoped to `WORKER_QUEUES=encode` for heavy HLS jobs, plus `pnpm --filter web dev`. The `DEV_WORKER_*` env vars in `.env` are remapped onto the worker process only — they don't leak into the API.

Go and pnpm versions are pinned in [mise.toml](mise.toml); run `mise install`. This repo is pnpm-only — `npm install` is rejected.

## Testing

- Pure unit tests: `go test ./internal/...`.
- Handler-level integration tests live next to handlers (`*_integration_test.go`) and need a real Postgres. `scripts/test.sh` creates `video_manager_test` if missing and sets `TEST_DATABASE_URL`. Each test starts by TRUNCATEing all tables (see [internal/testutil/pgtest/](internal/testutil/pgtest/)), so they are **not** safe to run in parallel — don't add `t.Parallel()` or external shared state.
- Follow existing tests: `setupEnv(t)` returns a test router; use `env.do(t, method, path, body, &out)` to make requests.

## High-level architecture

### Backend (Go)

Single binary at [cmd/app/](cmd/app/) that serves both API and background workers. Whether it accepts HTTP traffic or only runs jobs depends on env (`HTTP_ADDR`, `WORKER_QUEUES`). Layout under [internal/](internal/):

- [config/](internal/config/) — env loading (`caarlos0/env`).
- [auth/](internal/auth/) — OIDC provider + cookie session signer. When `OIDC_ISSUER_URL` is empty OIDC is disabled and `AUTH_DEV_BYPASS=true` makes the legacy `X-User-Id` header work for local dev and integration tests. `SESSION_SECRET` is required as soon as OIDC is on.
- [db/](internal/db/) — pgxpool wrapper. `db/query/*.sql` is hand-written; `db/sqlc/` is generated — regenerate via `./scripts/gen-sqlc.sh` after editing queries. Schema lives in [migrations/](migrations/) (golang-migrate, sequential).
- [http/](internal/http/) — chi router. [route/](internal/http/route/) wires handlers in [handler/](internal/http/handler/), and [middleware/](internal/http/middleware/) handles `LoadUser` (always-on) and `RequireAuth` (gates the authed group). `/health`, `/ready`, `/auth/*`, and `/uploads/tus-hook` sit outside the auth wall.
- [storage/](internal/storage/) — S3 (MinIO) wrapper with presigned URLs (`S3_PRESIGN_TTL`).
- [worker/](internal/worker/) — River queue jobs: `video.probe` (ffprobe + thumbnail), HLS `plan`/`encode`/`finalize`. River shares the same `pgxpool` as the API. Queues are split so a long ffmpeg encode can't starve probe/plan/finalize.
- [realtime/](internal/realtime/) — in-process pub/sub hub backing the WS handler.
- [imageproc/](internal/imageproc/) — robot photo handling, incl. optional HEIC→JPEG via `heif-convert`.
- [testutil/pgtest/](internal/testutil/pgtest/) — Postgres-backed test harness.

The OpenAPI spec at [docs/api/openapi.yaml](docs/api/openapi.yaml) is the source of truth — see "API contract workflow" below.

### Upload + transcode flow

```
Browser ─tus─▶ tusd (1080) ─S3─▶ MinIO (9000) ─key─┐
                                                    ▼
                          post-finish hook ▶ Go API /uploads/tus-hook
                                                    │
                                                    ▼
                                            River jobs ─▶ ffprobe / ffmpeg / HLS
                                                    │
                                                    ▼
                                  videos.recorded_at / duration_sec / thumbnail_key
```

The browser uploads directly to tusd (the API is **not** in the data path). tusd's post-finish hook tells the API to create the `videos` row and enqueue `video.probe`. On Docker-for-Linux, tusd needs `host.docker.internal` resolution to reach the API.

### Frontend ([web/](web/))

Vite 8 + React 19 + TypeScript + Mantine + TanStack Router (`tsr generate` regenerates [routeTree.gen.ts](web/src/routeTree.gen.ts) — run via `pnpm --filter web build`/`typecheck`/`pnpm --filter web routes:gen`) + TanStack Query + TanStack Form. tus-js-client for uploads, hls.js for playback, Tiptap + Yjs + `@hocuspocus/provider` for ScoutingNote collab editing.

- [src/routes/](web/src/routes/) — file-based router entries (page shells only).
- [src/features/](web/src/features/) — per-domain UI, hooks, and forms. Page-specific complexity lives here, not in `routes/`. Recent refactors split large components and moved screen-specific UI from `components/` into `features/` (see recent commits).
- [src/lib/api/generated.ts](web/src/lib/api/generated.ts) — `openapi-typescript` output; **regenerate via `./scripts/gen-api-client.sh` and commit the diff** whenever the OpenAPI spec changes.
- Vite proxies `/api/*` to `HTTP_ADDR` (8080); keep [web/vite.config.ts](web/vite.config.ts) and `.env`'s `HTTP_ADDR` in sync.

### Auth model

`LoadUser` middleware runs on every request and resolves a user from the signed `vm_session` cookie or (when `AUTH_DEV_BYPASS=true`) the `X-User-Id` header. Handlers needing auth read `auth.UserFromContext` and the `/` group above `mountAuthedRoutes` enforces `RequireAuth`. The SPA boots through `AuthGate`, which calls `/auth/me`; with OIDC disabled it falls back to the dev user picker.

## API contract workflow

[docs/api/openapi.yaml](docs/api/openapi.yaml) is authoritative ([spec-devflow.md](spec-devflow.md) §3). Change order:

1. Edit `docs/api/openapi.yaml`.
2. `./scripts/lint-openapi.sh`.
3. `./scripts/gen-api-client.sh` (commit the regenerated `web/src/lib/api/generated.ts`).
4. Update Go handlers + sqlc queries.
5. Consume the new generated types from the SPA.

## Other notes

- Ports: SPA 5173, API 8080, encode worker 8081, Postgres 5432, MinIO API 9000 / console 9001, tusd 1080, Hocuspocus 1234.
- Hocuspocus is a separate Node service in [hocuspocus/](hocuspocus/), started by docker compose for Phase 2 collab editing.
- The `videos.probe` / HLS jobs need `ffprobe`/`ffmpeg` reachable from the host running the worker — not from inside any container.
