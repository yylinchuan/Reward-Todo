$ErrorActionPreference = "Stop"
$listener = Get-NetTCPConnection -LocalPort 3210 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
  Write-Output "Todo service is not running."
  exit 0
}
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
if (-not $process -or $process.CommandLine -notmatch "todo-service\.js") {
  throw "Port 3210 is owned by another process; refusing to stop it."
}
Stop-Process -Id $listener.OwningProcess
Write-Output "Stopped todo service process $($listener.OwningProcess)."
