#!/usr/bin/env bash
# Insert minimal master data (User / Device / Robot / Scenario / Tag) into the
# development database. Idempotent.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
load_env

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set (copy .env.example to .env)" >&2
  exit 1
fi

exec go run ./cmd/seed-dev
