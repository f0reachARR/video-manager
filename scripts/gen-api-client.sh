#!/usr/bin/env bash
# Generate TypeScript types from docs/api/openapi.yaml into web/src/lib/api/generated.ts.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

exec pnpm --filter web exec openapi-typescript ../docs/api/openapi.yaml \
  -o src/lib/api/generated.ts
