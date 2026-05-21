# Builds the SPA and bakes the static bundle into an nginx image that also
# acts as the public reverse proxy for the API, tusd, and hocuspocus.
#
# The nginx config (deploy/compose/nginx.conf) is mounted at runtime via
# docker-compose, not baked in — that way iterating on routing doesn't
# require a rebuild.

FROM node:22-alpine AS web-build

ENV CI=true \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
RUN corepack enable

WORKDIR /src

# Cache pnpm install: copy lockfile + workspace manifests first.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY web/package.json ./web/package.json
RUN pnpm install --frozen-lockfile

# Build the SPA. Vite reads VITE_* at build time; the in-code defaults
# already use relative paths (see web/src/...), so no env injection needed
# for the standard nginx-fronted deployment.
COPY web ./web
RUN pnpm --filter web build

FROM nginx:1.27-alpine

# Replace the default site config with our routing rules. The full
# nginx.conf is provided by the compose file as a bind mount, but we also
# ship a sane default so the image is usable on its own.
COPY deploy/compose/nginx.conf /etc/nginx/nginx.conf

COPY --from=web-build /src/web/dist/ /usr/share/nginx/html/
