#!/usr/bin/env bash
# Lint OpenAPI specs with Redocly CLI. The public spec (openapi.yaml) is the
# source for the SPA's generated client; the internal worker spec is a
# contract for the cmd/hls-worker process and is NOT compiled into the SPA.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

exec pnpm --package=@redocly/cli@1.34.1 dlx redocly lint \
  --config docs/api/redocly.yaml \
  docs/api/openapi.yaml \
  docs/api/internal-worker.yaml
