#!/usr/bin/env bash
# Generate sqlc code into internal/db/sqlc/.
# No queries yet (§2 で追加)。 No-op until then but kept for parity.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

if [[ ! -d internal/db/query ]] || ! ls internal/db/query/*.sql >/dev/null 2>&1; then
  echo "no queries under internal/db/query — skipping sqlc generate"
  exit 0
fi

exec go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0 generate
