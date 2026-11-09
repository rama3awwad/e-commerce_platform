#!/bin/sh
set -eu
: "${SHADOW_DATABASE_URL:?Set SHADOW_DATABASE_URL to an empty PostgreSQL database}"
for m in users products orders notifications; do
  npx prisma migrate diff --from-migrations "prisma/$m/migrations" --to-schema-datamodel "prisma/$m/schema.prisma" --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code
done
