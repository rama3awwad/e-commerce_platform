param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-zA-Z0-9_-]+$')]
  [string]$Label,
  [int]$DurationSeconds = 290,
  [int]$IntervalSeconds = 5,
  [string]$DbUser = 'postgres',
  [string]$DbName = 'ecommerce_db',
  [switch]$IncludeReadReplica
)

$ErrorActionPreference = 'Stop'
$resultsPath = Join-Path (Get-Location) 'results'
New-Item -ItemType Directory -Force -Path $resultsPath | Out-Null
$composeArgs = @('-f', '.\docker-compose.yml', '-f', '.\docker-compose.perf.yml')
if ($IncludeReadReplica) {
  $composeArgs += @('-f', '.\docker-compose.replica.yml', '--profile', 'replica')
}

$dockerStatsPath = Join-Path $resultsPath "$Label-docker-stats.csv"
$dbConnectionsPath = Join-Path $resultsPath "$Label-db-connections.csv"
$queryCountsPath = Join-Path $resultsPath "$Label-query-counts.log"
$replicationLagPath = Join-Path $resultsPath "$Label-replication-lag.csv"

$resultFiles = @($dockerStatsPath, $dbConnectionsPath, $queryCountsPath)
if ($IncludeReadReplica) { $resultFiles += $replicationLagPath }
foreach ($file in $resultFiles) {
  if (Test-Path $file) { throw "Refusing to overwrite existing results file: $file" }
}

Set-Content -Path $dockerStatsPath -Value 'timestamp,container,cpu_percent,memory_usage,memory_percent,network_io,block_io,pids'
Set-Content -Path $dbConnectionsPath -Value 'timestamp,state,connections'
if ($IncludeReadReplica) {
  Set-Content -Path $replicationLagPath -Value 'timestamp,application_name,state,write_lag_ms,flush_lag_ms,replay_lag_ms,lag_bytes'
}

if ($IncludeReadReplica) {
  $containerIds = @(& docker compose @composeArgs ps -q backend db inventory-service inventory-db read-replica | Where-Object { $_ })
} else {
  $containerIds = @(& docker compose @composeArgs ps -q backend db inventory-service inventory-db | Where-Object { $_ })
}
if ($LASTEXITCODE -ne 0 -or $containerIds.Count -eq 0) {
  throw 'Could not find running backend/database/inventory containers through Docker Compose.'
}

$query = "SELECT COALESCE(state, '(unknown)'), count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY state ORDER BY state"
$replicationQuery = "SELECT application_name, state, COALESCE(round(extract(epoch FROM write_lag) * 1000)::numeric(12,3)::text, ''), COALESCE(round(extract(epoch FROM flush_lag) * 1000)::numeric(12,3)::text, ''), COALESCE(round(extract(epoch FROM replay_lag) * 1000)::numeric(12,3)::text, ''), COALESCE(pg_wal_lsn_diff(sent_lsn, replay_lsn)::bigint::text, '') FROM pg_stat_replication WHERE application_name = 'perf-read-replica'"
$timer = [System.Diagnostics.Stopwatch]::StartNew()
while ($timer.Elapsed.TotalSeconds -lt $DurationSeconds) {
  $timestamp = (Get-Date).ToUniversalTime().ToString('o')
  $stats = @(& docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}},{{.PIDs}}' $containerIds)
  if ($LASTEXITCODE -ne 0) { throw 'docker stats failed while collecting performance measurements.' }
  foreach ($line in $stats) { Add-Content -Path $dockerStatsPath -Value "$timestamp,$line" }

  $connections = @(& docker compose @composeArgs exec -T db psql -U $DbUser -d $DbName -At -F '|' -c $query)
  if ($LASTEXITCODE -ne 0) { throw 'pg_stat_activity query failed while collecting performance measurements.' }
  foreach ($line in $connections) {
    $parts = $line -split '\|'
    if ($parts.Length -eq 2) {
      Add-Content -Path $dbConnectionsPath -Value "$timestamp,$($parts[0]),$($parts[1])"
    }
  }

  if ($IncludeReadReplica) {
    $replication = @(& docker compose @composeArgs exec -T db psql -U $DbUser -d $DbName -At -F '|' -c $replicationQuery)
    if ($LASTEXITCODE -ne 0) { throw 'pg_stat_replication query failed while collecting replica lag.' }
    if ($replication.Count -eq 0) {
      Add-Content -Path $replicationLagPath -Value "$timestamp,missing,,,,,"
    } else {
      foreach ($line in $replication) {
        Add-Content -Path $replicationLagPath -Value "$timestamp,$line"
      }
    }
  }

  Start-Sleep -Seconds $IntervalSeconds
}

$timer.Stop()
$since = "$([Math]::Ceiling($timer.Elapsed.TotalSeconds))s"
$logs = @(& docker compose @composeArgs logs --no-color --since $since backend)
if ($LASTEXITCODE -ne 0) { throw 'Could not retrieve backend logs for per-request Prisma query counts.' }
$logs | Where-Object { $_ -match '\[query-count\]' } | Set-Content -Path $queryCountsPath
Write-Output "Docker stats: $dockerStatsPath"
Write-Output "DB connections: $dbConnectionsPath"
Write-Output "Per-request Prisma counts: $queryCountsPath"
if ($IncludeReadReplica) { Write-Output "Replica lag: $replicationLagPath" }
