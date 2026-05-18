#!/usr/bin/env bash
# Run golang-migrate against $DATABASE_URL. Uses `go run` so no host install needed.
# Examples:
#   ./scripts/migrate.sh up
#   ./scripts/migrate.sh down 1
#   ./scripts/migrate.sh create -ext sql -dir migrations -seq add_videos
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
load_env

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set (copy .env.example to .env)" >&2
  exit 1
fi

exec go run -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.18.1 \
  -path migrations -database "$DATABASE_URL" "$@"
