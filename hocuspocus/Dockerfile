FROM node:20-alpine

# Use pnpm so the install matches what the rest of the repo uses. The lockfile
# is committed alongside package.json — `pnpm install --frozen-lockfile`
# enforces parity with what was last resolved on the host.
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

# `--ignore-workspace` keeps this directory standalone; the surrounding repo
# has a pnpm-workspace.yaml that only includes ./web.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-workspace

COPY server.js ./

ENV NODE_ENV=production
EXPOSE 1234

CMD ["node", "server.js"]
