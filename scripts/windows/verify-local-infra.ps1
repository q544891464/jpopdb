. (Join-Path $PSScriptRoot 'local-infra-common.ps1')

Assert-LocalInfraInstalled

if (-not (Test-LocalPort -Port 5432) -or -not (Test-LocalPort -Port 6379)) {
  throw 'Local infrastructure is not running. Run npm run local:infra:start first.'
}

Invoke-PostgresCommand `
  -Executable 'pg_isready.exe' `
  -ArgumentList @('-h', '127.0.0.1', '-p', '5432', '-U', 'jmusic', '-d', 'jmusic')

$redisPing = & (Join-Path $script:MemuraiRoot 'memurai-cli.exe') -h 127.0.0.1 -p 6379 ping
if (($redisPing | Out-String).Trim() -ne 'PONG') {
  throw 'Memurai PING check failed.'
}

$env:DATABASE_URL = 'postgres://jmusic:jmusic@127.0.0.1:5432/jmusic'
$env:REDIS_URL = 'redis://127.0.0.1:6379'
npm run db:migrate
if ($LASTEXITCODE -ne 0) {
  throw 'Database migration failed.'
}

$tableCount = & (Join-Path $script:PostgresBin 'psql.exe') `
  -h 127.0.0.1 -p 5432 -U jmusic -d jmusic -t -A `
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"

Write-Host "PostgreSQL public tables: $(($tableCount | Out-String).Trim())"
Write-Host 'Memurai PING: PONG'
Write-Host 'Local infrastructure verification passed.'
