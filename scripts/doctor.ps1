[CmdletBinding()]
param(
  [string]$StateDir = (Join-Path $env:LOCALAPPDATA 'RewardTodo\data'),
  [string]$WorkspaceRoot = '',
  [string]$ServerName = 'reward_todo'
)

$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$entryPoint = Join-Path $serviceRoot 'bin\todo-service.js'
$webIndex = Join-Path $serviceRoot 'web\dist\index.html'
$state = [IO.Path]::GetFullPath($StateDir)
$checks = [ordered]@{}

try {
  $node = (Get-Command node -ErrorAction Stop).Source
  $versionText = (& $node --version).Trim().TrimStart('v')
  $checks.node = [ordered]@{ ok = ([version]$versionText -ge [version]'22.5.0'); path = $node; version = $versionText }
} catch {
  $checks.node = [ordered]@{ ok = $false; error = $_.Exception.Message }
}

$checks.entryPoint = [ordered]@{ ok = (Test-Path -LiteralPath $entryPoint -PathType Leaf); path = $entryPoint }
$checks.frontend = [ordered]@{ ok = (Test-Path -LiteralPath $webIndex -PathType Leaf); path = $webIndex }
$checks.state = [ordered]@{ ok = (Test-Path -LiteralPath $state -PathType Container); path = $state }

if (-not [string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
  $configPath = Join-Path ([IO.Path]::GetFullPath($WorkspaceRoot)) '.mcp.json'
  try {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $entry = $config.mcpServers.PSObject.Properties[$ServerName]
    $checks.mcpConfig = [ordered]@{ ok = ($null -ne $entry); path = $configPath; serverName = $ServerName }
  } catch {
    $checks.mcpConfig = [ordered]@{ ok = $false; path = $configPath; error = $_.Exception.Message }
  }
}

if ($checks.node.ok -and $checks.entryPoint.ok) {
  try {
    $previous = $env:TODO_SERVICE_STATE_DIR
    $env:TODO_SERVICE_STATE_DIR = $state
    $statusText = & $checks.node.path $entryPoint status
    if ($LASTEXITCODE -ne 0) { throw 'Todo status command failed' }
    $checks.data = [ordered]@{ ok = $true; status = ($statusText -join "`n" | ConvertFrom-Json) }
  } catch {
    $checks.data = [ordered]@{ ok = $false; error = $_.Exception.Message }
  } finally {
    $env:TODO_SERVICE_STATE_DIR = $previous
  }
}

$ok = @($checks.Values | ForEach-Object { $_.ok }) -notcontains $false
[ordered]@{ ok = $ok; checks = $checks; note = 'No service or CyberBoss process was restarted.' } | ConvertTo-Json -Depth 20
if (-not $ok) { exit 1 }
