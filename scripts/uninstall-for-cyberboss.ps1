[CmdletBinding()]
param(
  [string]$StateDir = (Join-Path $env:LOCALAPPDATA 'RewardTodo\data'),
  [string]$WorkspaceRoot = '',
  [string]$ServerName = 'reward_todo'
)

$ErrorActionPreference = 'Stop'
$state = [IO.Path]::GetFullPath($StateDir)
$manifestPath = Join-Path $state 'share-install.json'
$manifest = $null
if (Test-Path -LiteralPath $manifestPath) {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
}
if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
  if ($manifest -and $manifest.workspaceRoot) { $WorkspaceRoot = $manifest.workspaceRoot }
  else { throw 'WorkspaceRoot is required when no install manifest is available.' }
}
if ($manifest -and $manifest.serverName) { $ServerName = $manifest.serverName }

$configPath = Join-Path ([IO.Path]::GetFullPath($WorkspaceRoot)) '.mcp.json'
if (Test-Path -LiteralPath $configPath) {
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  if ($config.mcpServers -and $config.mcpServers.PSObject.Properties[$ServerName]) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Copy-Item -LiteralPath $configPath -Destination "$configPath.reward-todo-uninstall.$stamp.bak"
    $config.mcpServers.PSObject.Properties.Remove($ServerName)
    $config | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $configPath -Encoding utf8
  }
}

if ($manifest) {
  if ($manifest.shortcutPath -and (Test-Path -LiteralPath $manifest.shortcutPath -PathType Leaf)) {
    Remove-Item -LiteralPath $manifest.shortcutPath
  }
  $manifest | Add-Member -NotePropertyName uninstalledAt -NotePropertyValue ((Get-Date).ToString('o')) -Force
  $manifest | Add-Member -NotePropertyName installed -NotePropertyValue $false -Force
  $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding utf8
}

[ordered]@{
  ok = $true
  removedMcpServer = $ServerName
  configPath = $configPath
  preservedData = $state
  note = 'Local checklist data was preserved. No process was stopped or restarted.'
} | ConvertTo-Json -Depth 10
