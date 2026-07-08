. (Join-Path $PSScriptRoot 'local-infra-common.ps1')

Assert-LocalInfraInstalled
New-Item -ItemType Directory -Force -Path $script:RuntimeRoot | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $script:PostgresData 'PG_VERSION'))) {
  $passwordFile = Join-Path $script:RuntimeRoot 'pg-password.txt'
  try {
    Set-Content -LiteralPath $passwordFile -Value 'jmusic' -NoNewline -Encoding ascii
    & (Join-Path $script:PostgresBin 'initdb.exe') `
      -D $script:PostgresData `
      -U jmusic `
      --pwfile=$passwordFile `
      --encoding=UTF8 `
      --locale=C
    if ($LASTEXITCODE -ne 0) {
      throw 'PostgreSQL initialization failed.'
    }
  } finally {
    Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-LocalPort -Port 5432)) {
  & (Join-Path $script:PostgresBin 'pg_ctl.exe') `
    -D $script:PostgresData `
    -l $script:PostgresLog `
    -o '"-h 127.0.0.1 -p 5432"' `
    start
  if ($LASTEXITCODE -ne 0) {
    throw 'PostgreSQL failed to start.'
  }
}

New-Item -ItemType Directory -Force -Path $script:MemuraiData | Out-Null
$memuraiDataPath = $script:MemuraiData.Replace('\', '/')
$memuraiLogPath = $script:MemuraiLog.Replace('\', '/')
@(
  'bind 127.0.0.1',
  'protected-mode yes',
  'port 6379',
  'appendonly yes',
  "dir `"$memuraiDataPath`"",
  'loglevel notice',
  "logfile `"$memuraiLogPath`""
) | Set-Content -LiteralPath $script:MemuraiConfig -Encoding ascii

if (-not (Test-LocalPort -Port 6379)) {
  Start-Process `
    -FilePath (Join-Path $script:MemuraiRoot 'memurai.exe') `
    -ArgumentList @($script:MemuraiConfig) `
    -WorkingDirectory $script:MemuraiData `
    -WindowStyle Hidden
}

Start-Sleep -Seconds 2
Invoke-PostgresCommand `
  -Executable 'pg_isready.exe' `
  -ArgumentList @('-h', '127.0.0.1', '-p', '5432', '-U', 'jmusic')
& (Join-Path $script:MemuraiRoot 'memurai-cli.exe') -h 127.0.0.1 -p 6379 ping
if ($LASTEXITCODE -ne 0) {
  throw 'Memurai failed to respond to PING.'
}

$databaseExists = & (Join-Path $script:PostgresBin 'psql.exe') `
  -h 127.0.0.1 -p 5432 -U jmusic -d postgres -t -A `
  -c "SELECT 1 FROM pg_database WHERE datname='jmusic'"

if (($databaseExists | Out-String).Trim() -ne '1') {
  Invoke-PostgresCommand `
    -Executable 'createdb.exe' `
    -ArgumentList @('-h', '127.0.0.1', '-p', '5432', '-U', 'jmusic', 'jmusic')
}

Write-Host 'Local PostgreSQL and Memurai are ready.'
Write-Host 'DATABASE_URL=postgres://jmusic:jmusic@127.0.0.1:5432/jmusic'
Write-Host 'REDIS_URL=redis://127.0.0.1:6379'
