$ErrorActionPreference = "Stop"

$ServiceRoot = Split-Path -Parent $PSScriptRoot
$LegacyStateDir = Join-Path (Split-Path -Parent $ServiceRoot) ".todo-service"
$PortableStateDir = Join-Path $env:LOCALAPPDATA "RewardTodo\data"
$StateDir = if ($env:TODO_SERVICE_STATE_DIR) {
  $env:TODO_SERVICE_STATE_DIR
} elseif (Test-Path -LiteralPath $LegacyStateDir -PathType Container) {
  $LegacyStateDir
} else {
  $PortableStateDir
}
$env:TODO_SERVICE_STATE_DIR = $StateDir
$LogDir = Join-Path $StateDir "logs"
$OutLog = Join-Path $LogDir "service.out.log"
$ErrLog = Join-Path $LogDir "service.err.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

while ($true) {
  $listener = Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    Start-Sleep -Seconds 15
    continue
  }

  try {
    $process = Start-Process -FilePath "node" `
      -ArgumentList @("bin\todo-service.js", "serve") `
      -WorkingDirectory $ServiceRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $OutLog `
      -RedirectStandardError $ErrLog `
      -PassThru
    $process.WaitForExit()
  } catch {
    Add-Content -LiteralPath $ErrLog -Value "$(Get-Date -Format o) watchdog: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 5
}
