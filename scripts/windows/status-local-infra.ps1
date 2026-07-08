. (Join-Path $PSScriptRoot 'local-infra-common.ps1')

Assert-LocalInfraInstalled

$postgresStatus = if (Test-LocalPort -Port 5432) { 'running' } else { 'stopped' }
$redisStatus = if (Test-LocalPort -Port 6379) { 'running' } else { 'stopped' }

Write-Host "PostgreSQL: $postgresStatus (127.0.0.1:5432)"
Write-Host "Memurai:    $redisStatus (127.0.0.1:6379)"
Write-Host "Runtime:    $script:RuntimeRoot"
