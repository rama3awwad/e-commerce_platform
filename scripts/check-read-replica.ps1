param(
  [int]$TimeoutSeconds = 30,
  [string]$DbUser = 'postgres',
  [string]$DbName = 'ecommerce_db'
)

$ErrorActionPreference = 'Stop'
$composeArgs = @('-f', '.\docker-compose.yml', '-f', '.\docker-compose.perf.yml', '-f', '.\docker-compose.replica.yml', '--profile', 'replica')
$outputPath = Join-Path (Get-Location) ("results\read-replica-check-{0}.json" -f (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'))

function Invoke-Psql([string]$Service, [string]$Sql) {
  $result = @(& docker compose @composeArgs exec -T $Service psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -At -c $Sql)
  if ($LASTEXITCODE -ne 0) {
    throw "Read-replica check query failed on Compose service '$Service'."
  }
  return ($result -join "`n").Trim()
}

$standby = Invoke-Psql 'read-replica' 'SELECT pg_is_in_recovery()'
if ($standby -ne 't') {
  throw 'The read-replica service is reachable but is not in recovery/read-only standby mode.'
}

$replicationState = Invoke-Psql 'db' "SELECT application_name || '|' || state FROM pg_stat_replication WHERE application_name = 'perf-read-replica'"
if (-not $replicationState) {
  throw 'The primary does not report an active perf-read-replica connection.'
}

$probeId = [Guid]::NewGuid().ToString()
$insertSql = "CREATE SCHEMA IF NOT EXISTS perf_tools; CREATE TABLE IF NOT EXISTS perf_tools.replica_probe (probe_id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT clock_timestamp()); INSERT INTO perf_tools.replica_probe (probe_id) VALUES ('$probeId');"
[void](Invoke-Psql 'db' $insertSql)

$timer = [System.Diagnostics.Stopwatch]::StartNew()
$visible = $false
try {
  while ($timer.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    $probeTableExists = (Invoke-Psql 'read-replica' "SELECT to_regclass('perf_tools.replica_probe') IS NOT NULL") -eq 't'
    if ($probeTableExists) {
      $visible = (Invoke-Psql 'read-replica' "SELECT EXISTS (SELECT 1 FROM perf_tools.replica_probe WHERE probe_id = '$probeId'::uuid)") -eq 't'
      if ($visible) { break }
    }
    Start-Sleep -Milliseconds 500
  }
} finally {
  $timer.Stop()
  [void](Invoke-Psql 'db' "DELETE FROM perf_tools.replica_probe WHERE probe_id = '$probeId'::uuid")
}

if (-not $visible) {
  throw "The primary write did not become visible on the read replica within $TimeoutSeconds seconds."
}

$result = [ordered]@{
  checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  replicationState = $replicationState
  standbyInRecovery = $true
  probeVisibleOnReplica = $visible
  writeToReplicaMilliseconds = [Math]::Round($timer.Elapsed.TotalMilliseconds, 2)
  probeId = $probeId
}
New-Item -ItemType Directory -Force -Path (Split-Path $outputPath) | Out-Null
$result | ConvertTo-Json | Set-Content -LiteralPath $outputPath -Encoding utf8
Write-Output "Read-replica probe passed: $outputPath"
