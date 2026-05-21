#!/usr/bin/env bash
# Run a standalone hls-worker against the dev API.
#
# Usage:
#   scripts/dev-worker.sh                       # default: probe + encode
#   DEV_WORKER_QUEUES=encode scripts/dev-worker.sh
#   DEV_WORKER_CONCURRENCY=2 scripts/dev-worker.sh
#
# The hls-worker connects only to the API (via HTTP) and to S3 (MinIO). It
# does NOT need DB credentials. Multiple workers pointed at the same API
# share the in-memory dispatcher there, so you can run several copies for
# scale-out testing.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
load_env

if [[ -z "${WORKER_AUTH_TOKEN:-}" ]]; then
  echo "WORKER_AUTH_TOKEN is required (set it in .env or the shell)." >&2
  exit 1
fi

exec env \
  WORKER_QUEUES="${DEV_WORKER_QUEUES:-probe,encode}" \
  WORKER_CONCURRENCY="${DEV_WORKER_CONCURRENCY:-1}" \
  go run ./cmd/hls-worker
