# Install dependencies once. BuildKit keeps npm's download cache across retries.
FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    set -eu; \
    for attempt in 1 2 3; do \
      if npm ci --prefer-offline --no-audit --fund=false \
        --maxsockets=4 \
        --fetch-retries=3 \
        --fetch-retry-mintimeout=10000 \
        --fetch-retry-maxtimeout=60000 \
        --fetch-timeout=300000; then \
        exit 0; \
      fi; \
      echo "npm ci failed (attempt ${attempt}/3); retrying with the BuildKit npm cache..." >&2; \
      sleep $((attempt * 5)); \
    done; \
    exit 1

FROM dependencies AS builder
COPY . .
RUN npm run prisma:generate \
 && rm -rf dist *.tsbuildinfo \
 && npm run build \
 && test -f dist/main.js

# Reuse the installed tree and remove development-only packages without downloading again.
FROM dependencies AS production-dependencies
ENV NODE_ENV=production
RUN npm prune --omit=dev --no-audit --fund=false --prefer-offline
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node --from=dependencies /app/package.json ./package.json
COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/tsconfig.json ./tsconfig.json
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh \
 && chmod +x /app/docker-entrypoint.sh \
 && chown node:node /app/docker-entrypoint.sh \
 && mkdir -p /app/uploads && chown node:node /app/uploads
USER node
RUN npm run prisma:generate
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]