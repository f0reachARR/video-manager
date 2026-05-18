#!/usr/bin/env bash
# Lint OpenAPI spec with Redocly CLI.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

exec pnpm --package=@redocly/cli@1.34.1 dlx redocly lint \
  --config docs/api/redocly.yaml docs/api/openapi.yaml
