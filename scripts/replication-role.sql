SELECT format(
  'CREATE ROLE perf_replica WITH LOGIN REPLICATION PASSWORD %L',
  :'replication_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'perf_replica')
\gexec

ALTER ROLE perf_replica WITH LOGIN REPLICATION PASSWORD :'replication_password';
