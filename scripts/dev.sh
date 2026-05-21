#!/usr/bin/env bash
# Start infrastructure containers and run app + hls-worker + web in foreground.
# Stops child processes on Ctrl-C.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
load_env

docker compose up -d postgres minio tusd hocuspocus

pids=()
cleanup() {
  for pid in "${pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT INT TERM

pnpm --filter web dev &
pids+=("$!")

# External HLS worker. Connects to the API over HTTP — no DB access. It needs
# its own S3 creds and a shared bearer token (WORKER_AUTH_TOKEN). The worker
# auto-generates a unique WORKER_ID when unset.
if [[ -n "${WORKER_AUTH_TOKEN:-}" ]]; then
  WORKER_QUEUES="${DEV_WORKER_QUEUES:-probe,encode}" \
  WORKER_CONCURRENCY="${DEV_WORKER_CONCURRENCY:-1}" \
    go run ./cmd/hls-worker &
  pids+=("$!")
else
  echo "[dev.sh] WORKER_AUTH_TOKEN is not set — skipping cmd/hls-worker."
  echo "[dev.sh] Encode/probe jobs will queue but never run. Set the token in .env to enable."
fi

exec go run ./cmd/app
