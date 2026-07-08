$ErrorActionPreference = 'Stop'

$script:RuntimeRoot = Join-Path $env:LOCALAPPDATA 'jpopdb-runtime'
$script:PostgresRoot = Join-Path $script:RuntimeRoot 'postgresql-17.10\pgsql'
$script:PostgresBin = Join-Path $script:PostgresRoot 'bin'
$script:PostgresData = Join-Path $script:RuntimeRoot 'postgres-data'
$script:PostgresLog = Join-Path $script:RuntimeRoot 'postgres.log'
$script:MemuraiRoot = Join-Path $script:RuntimeRoot 'memurai\Memurai'
$script:MemuraiData = Join-Path $script:RuntimeRoot 'memurai-data'
$script:MemuraiConfig = Join-Path $script:RuntimeRoot 'memurai-local.conf'
$script:MemuraiLog = Join-Path $script:RuntimeRoot 'memurai.log'

function Assert-LocalInfraInstalled {
  $requiredFiles = @(
    (Join-Path $script:PostgresBin 'postgres.exe'),
    (Join-Path $script:PostgresBin 'pg_ctl.exe'),
    (Join-Path $script:MemuraiRoot 'memurai.exe'),
    (Join-Path $script:MemuraiRoot 'memurai-cli.exe')
  )

  $missingFiles = $requiredFiles | Where-Object { -not (Test-Path -LiteralPath $_) }
  if ($missingFiles) {
    throw "Local infrastructure is not installed. Run npm run local:infra:install first."
  }
}

function Test-LocalPort {
  param([Parameter(Mandatory = $true)][int]$Port)

  return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Invoke-PostgresCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList
  )

  $env:PGPASSWORD = 'jmusic'
  & (Join-Path $script:PostgresBin $Executable) @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$Executable failed with exit code $LASTEXITCODE."
  }
}
