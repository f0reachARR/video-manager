#!/usr/bin/env bash
# Start infrastructure containers and run app + worker + web in foreground.
# Stops child processes (web dev server, worker) on Ctrl-C.
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

# Dedicated HLS encode worker. Same binary as the API but polls only the
# "encode" queue, so a long-running ffmpeg run can't starve the probe / plan
# / finalize jobs the API node owns. The DEV_WORKER_* vars from .env are
# remapped to the worker process here so they never leak into the API.
HTTP_ADDR="${DEV_WORKER_HTTP_ADDR:-:8081}" \
WORKER_QUEUES="${DEV_WORKER_QUEUES:-encode}" \
WORKER_CONCURRENCY_DEFAULT="${DEV_WORKER_CONCURRENCY_DEFAULT:-4}" \
WORKER_CONCURRENCY_ENCODE="${DEV_WORKER_CONCURRENCY_ENCODE:-1}" \
  go run ./cmd/app &
pids+=("$!")

exec go run ./cmd/app
