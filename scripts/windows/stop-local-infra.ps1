. (Join-Path $PSScriptRoot 'local-infra-common.ps1')

Assert-LocalInfraInstalled

if (Test-LocalPort -Port 6379) {
  & (Join-Path $script:MemuraiRoot 'memurai-cli.exe') -h 127.0.0.1 -p 6379 shutdown
}

if (Test-LocalPort -Port 5432) {
  & (Join-Path $script:PostgresBin 'pg_ctl.exe') -D $script:PostgresData stop -m fast
  if ($LASTEXITCODE -ne 0) {
    throw 'PostgreSQL failed to stop.'
  }
}

Write-Host 'Local PostgreSQL and Memurai are stopped.'
