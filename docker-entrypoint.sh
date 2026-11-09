#!/bin/sh
set -eu
npm run prisma:deploy
if [ "${RUN_SEED:-false}" = "true" ]; then
  npm run prisma:seed
fi
exec node /app/dist/main.js
