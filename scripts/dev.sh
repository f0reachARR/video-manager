#!/usr/bin/env bash
# Start infrastructure containers and run app + web in foreground.
# Stops child processes (web dev server) on Ctrl-C.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
load_env

docker compose up -d postgres minio tusd

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

exec go run ./cmd/app
