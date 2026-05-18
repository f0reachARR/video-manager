FROM node:20-alpine

WORKDIR /app

# Install deps. Lock file is generated on first build inside the image — for
# Phase 2 we keep this lightweight rather than pinning every dep here.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./

ENV NODE_ENV=production
EXPOSE 1234

CMD ["node", "server.js"]
