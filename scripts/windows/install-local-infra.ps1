. (Join-Path $PSScriptRoot 'local-infra-common.ps1')

$postgresArchiveUrl = 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260307'
$memuraiInstallerUrl = 'https://dist.memurai.com/releases/Memurai-Developer/4.1.2/Memurai-Developer-v4.1.2.msi'
$postgresArchive = Join-Path $script:RuntimeRoot 'postgresql-17.10-windows-x64.zip'
$postgresExtractRoot = Join-Path $script:RuntimeRoot 'postgresql-17.10'
$memuraiInstaller = Join-Path $script:RuntimeRoot 'Memurai-Developer-v4.1.2.msi'
$memuraiExtractRoot = Join-Path $script:RuntimeRoot 'memurai'

New-Item -ItemType Directory -Force -Path $script:RuntimeRoot | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $script:PostgresBin 'postgres.exe'))) {
  Write-Host 'Downloading PostgreSQL 17.10 Windows binaries...'
  if (-not (Test-Path -LiteralPath $postgresArchive)) {
    Invoke-WebRequest -Uri $postgresArchiveUrl -OutFile $postgresArchive -UseBasicParsing
  }

  if (Test-Path -LiteralPath $postgresExtractRoot) {
    $resolvedRuntime = [IO.Path]::GetFullPath($script:RuntimeRoot)
    $resolvedTarget = [IO.Path]::GetFullPath($postgresExtractRoot)
    if (-not $resolvedTarget.StartsWith($resolvedRuntime, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'Refusing to remove a PostgreSQL directory outside the runtime root.'
    }
    Remove-Item -LiteralPath $postgresExtractRoot -Recurse -Force
  }

  New-Item -ItemType Directory -Force -Path $postgresExtractRoot | Out-Null
  tar.exe -xf $postgresArchive -C $postgresExtractRoot
}

if (-not (Test-Path -LiteralPath (Join-Path $script:MemuraiRoot 'memurai.exe'))) {
  Write-Host 'Downloading Memurai Developer 4.1.2...'
  if (-not (Test-Path -LiteralPath $memuraiInstaller)) {
    Invoke-WebRequest -Uri $memuraiInstallerUrl -OutFile $memuraiInstaller -UseBasicParsing
  }

  New-Item -ItemType Directory -Force -Path $memuraiExtractRoot | Out-Null
  $logPath = Join-Path $script:RuntimeRoot 'memurai-extract.log'
  $process = Start-Process msiexec.exe -ArgumentList @(
    '/a',
    ('"' + $memuraiInstaller + '"'),
    '/qn',
    ('TARGETDIR="' + $memuraiExtractRoot + '"'),
    '/L*v',
    ('"' + $logPath + '"')
  ) -Wait -PassThru

  if ($process.ExitCode -ne 0) {
    throw "Memurai extraction failed with exit code $($process.ExitCode). See $logPath."
  }
}

Assert-LocalInfraInstalled
Write-Host "Local PostgreSQL and Memurai binaries are installed under $script:RuntimeRoot"
Write-Host 'Run npm run local:infra:start to initialize and start them.'
