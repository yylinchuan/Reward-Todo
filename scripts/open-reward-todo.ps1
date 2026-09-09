[CmdletBinding()]
param(
  [string]$StateDir = (Join-Path $env:LOCALAPPDATA 'RewardTodo\data'),
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$state = [IO.Path]::GetFullPath($StateDir)
$manifestPath = Join-Path $state 'share-install.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Install manifest not found: $manifestPath"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$entryPoint = Join-Path $manifest.serviceRoot 'bin\todo-service.js'
if (-not (Test-Path -LiteralPath $entryPoint -PathType Leaf)) { throw "Reward-Todo entrypoint not found: $entryPoint" }
$url = "http://127.0.0.1:$($manifest.port)/"

$healthy = $false
try {
  $health = Invoke-RestMethod -Uri "${url}health" -TimeoutSec 2
  $healthy = $health.ok -eq $true -and $health.service -eq 'reward-todo'
} catch { $healthy = $false }

if (-not $healthy) {
  $listener = Get-NetTCPConnection -LocalPort $manifest.port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) { throw "Port $($manifest.port) is already occupied by another service." }
  $logDir = Join-Path $state 'logs'
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $saved = @{
    TODO_SERVICE_STATE_DIR = $env:TODO_SERVICE_STATE_DIR
    TODO_SERVICE_PORT = $env:TODO_SERVICE_PORT
    TODO_SERVICE_USER_NAME = $env:TODO_SERVICE_USER_NAME
    TODO_SERVICE_ASSISTANT_NAME = $env:TODO_SERVICE_ASSISTANT_NAME
    TODO_SERVICE_APP_NAME = $env:TODO_SERVICE_APP_NAME
    TODO_SERVICE_REMINDER_DELIVERY_MODE = $env:TODO_SERVICE_REMINDER_DELIVERY_MODE
  }
  try {
    $env:TODO_SERVICE_STATE_DIR = $state
    $env:TODO_SERVICE_PORT = [string]$manifest.port
    $env:TODO_SERVICE_USER_NAME = $manifest.userName
    $env:TODO_SERVICE_ASSISTANT_NAME = $manifest.assistantName
    $env:TODO_SERVICE_APP_NAME = $manifest.appName
    $env:TODO_SERVICE_REMINDER_DELIVERY_MODE = $manifest.reminderDelivery
    Start-Process -FilePath $manifest.nodePath -ArgumentList @($entryPoint, 'serve') -WorkingDirectory $manifest.serviceRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'service.out.log') -RedirectStandardError (Join-Path $logDir 'service.err.log') | Out-Null
  } finally {
    foreach ($key in $saved.Keys) {
      if ($null -eq $saved[$key]) { Remove-Item -Path "Env:$key" -ErrorAction SilentlyContinue }
      else { Set-Item -Path "Env:$key" -Value $saved[$key] }
    }
  }
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Milliseconds 250
    try {
      $health = Invoke-RestMethod -Uri "${url}health" -TimeoutSec 1
      if ($health.ok -eq $true -and $health.service -eq 'reward-todo') { $healthy = $true; break }
    } catch { }
  }
}

if (-not $healthy) { throw 'Reward-Todo did not become ready. Check the logs folder in the data directory.' }
if (-not $NoOpen) { Start-Process $url }
[ordered]@{ ok = $true; url = $url; browserOpened = (-not $NoOpen) } | ConvertTo-Json
