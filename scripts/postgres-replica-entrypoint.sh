#!/bin/sh
set -eu

: "${PGDATA:?PGDATA is required}"
: "${PRIMARY_HOST:?PRIMARY_HOST is required}"
: "${PRIMARY_PORT:?PRIMARY_PORT is required}"
: "${REPLICATION_USER:?REPLICATION_USER is required}"
: "${PERF_REPLICATION_PASSWORD:?PERF_REPLICATION_PASSWORD is required}"

escaped_password=$(printf '%s' "$PERF_REPLICATION_PASSWORD" | sed 's/\\/\\\\/g; s/:/\\:/g')
printf '%s:%s:*:%s:%s\n' "$PRIMARY_HOST" "$PRIMARY_PORT" "$REPLICATION_USER" "$escaped_password" > /tmp/replica.pgpass
chmod 0600 /tmp/replica.pgpass

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"
  if [ -n "$(find "$PGDATA" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    echo "Replica data directory is not empty and has no PG_VERSION; refusing to overwrite it." >&2
    exit 1
  fi

  connection="host=$PRIMARY_HOST port=$PRIMARY_PORT user=$REPLICATION_USER application_name=perf-read-replica passfile=/tmp/replica.pgpass"
  pg_basebackup --dbname="$connection" --pgdata="$PGDATA" --format=plain --wal-method=stream --write-recovery-conf --progress
fi

exec postgres -D "$PGDATA" -c hot_standby=on
