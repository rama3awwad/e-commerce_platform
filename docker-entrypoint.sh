#!/bin/sh
set -eu
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  npm run prisma:deploy
fi
if [ "${RUN_SEED:-false}" = "true" ]; then
  npm run prisma:seed
  npm run init:inventory-stocks
fi
if [ "${MIGRATE_ONLY:-false}" = "true" ]; then
  exit 0
fi
exec node /app/dist/main.js
