#!/usr/bin/env bash
# Run a standalone encode worker against the dev Postgres + MinIO.
#
# Usage:
#   scripts/dev-worker.sh                # default: polls "encode" queue
#   DEV_WORKER_QUEUES=default,encode \
#     scripts/dev-worker.sh              # poll both queues
#   DEV_WORKER_HTTP_ADDR=:8082 \
#     scripts/dev-worker.sh              # use a different port (avoids clash
#                                        # with `scripts/dev.sh`'s worker on :8081)
#
# River pulls jobs from PostgreSQL, so multiple instances pointed at the same
# DB automatically share the queue. Useful when you want to test scale-out
# locally (run scripts/dev.sh in one terminal and scripts/dev-worker.sh in
# another with a non-conflicting DEV_WORKER_HTTP_ADDR).

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
load_env

exec env \
  HTTP_ADDR="${DEV_WORKER_HTTP_ADDR:-:8081}" \
  WORKER_QUEUES="${DEV_WORKER_QUEUES:-encode}" \
  WORKER_CONCURRENCY_DEFAULT="${DEV_WORKER_CONCURRENCY_DEFAULT:-4}" \
  WORKER_CONCURRENCY_ENCODE="${DEV_WORKER_CONCURRENCY_ENCODE:-1}" \
  go run ./cmd/app
