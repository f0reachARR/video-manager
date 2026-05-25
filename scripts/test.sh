#!/usr/bin/env bash
# Run the Go test suite against a dedicated Postgres database
# (soiree_test by default) inside the dev docker compose stack.
# The database is created if missing; schema reset is handled per-process by
# internal/testutil/pgtest.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
load_env

PG_USER="${POSTGRES_USER:-video}"
PG_PASSWORD="${POSTGRES_PASSWORD:-video}"
PG_PORT="${POSTGRES_PORT:-5432}"
TEST_DB="${TEST_DATABASE_NAME:-soiree_test}"

# Ensure the test database exists. Uses docker compose so the host doesn't
# need a psql client installed.
exists=$(docker compose exec -T postgres psql -U "$PG_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$TEST_DB'" 2>/dev/null | tr -d '[:space:]') || true
if [[ "$exists" != "1" ]]; then
  echo "creating $TEST_DB"
  docker compose exec -T postgres psql -U "$PG_USER" -d postgres -c "CREATE DATABASE $TEST_DB"
fi

export TEST_DATABASE_URL="postgres://$PG_USER:$PG_PASSWORD@localhost:$PG_PORT/$TEST_DB?sslmode=disable"

exec go test "$@" ./...
