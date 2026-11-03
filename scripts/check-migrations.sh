#!/bin/sh
set -eu

: "${SHADOW_DATABASE_URL:?Set SHADOW_DATABASE_URL to an empty PostgreSQL database}"

npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --exit-code
