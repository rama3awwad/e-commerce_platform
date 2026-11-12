#!/bin/sh
# Requirement 3 — Read Replica.
# First start: clone the primary with pg_basebackup (-R writes the standby config so it keeps
# streaming WAL from the primary). Every start: run PostgreSQL as a read-only hot standby.
set -eu

: "${PGDATA:?}" "${PRIMARY_HOST:?}" "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[replica] waiting for primary $PRIMARY_HOST ..."
  until pg_isready -h "$PRIMARY_HOST" -p 5432 -U "$POSTGRES_USER" >/dev/null 2>&1; do sleep 1; done

  echo "[replica] cloning primary (pg_basebackup) ..."
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
  su-exec postgres env PGPASSWORD="$POSTGRES_PASSWORD" \
    pg_basebackup -h "$PRIMARY_HOST" -p 5432 -U "$POSTGRES_USER" -D "$PGDATA" -Fp -Xs -R -P
  echo "[replica] clone finished"
fi

chown -R postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"
exec su-exec postgres postgres -D "$PGDATA" -c hot_standby=on
