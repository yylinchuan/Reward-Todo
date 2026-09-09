[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Apply')]
  [string]$Mode = 'Plan',

  [Parameter(Mandatory = $true)]
  [string]$WorkspaceRoot,

  [string]$CyberBossRoot = '',
  [string]$StateDir = (Join-Path $env:LOCALAPPDATA 'RewardTodo\data'),
  [string]$ServerName = 'reward_todo',
  [string]$UserName = '你',
  [string]$AssistantName = '搭档',
  [string]$AppName = 'REWARD TODO',
  [ValidateRange(1, 65535)]
  [int]$Port = 3210,
  [switch]$CreateDesktopShortcut,
  [switch]$ReplaceExisting
)

$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$entryPoint = Join-Path $serviceRoot 'bin\todo-service.js'
$webIndex = Join-Path $serviceRoot 'web\dist\index.html'
$workspace = [IO.Path]::GetFullPath($WorkspaceRoot)
$state = [IO.Path]::GetFullPath($StateDir)
$configPath = Join-Path $workspace '.mcp.json'
$manifestPath = Join-Path $state 'share-install.json'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Reward-Todo.lnk'

function Normalize-DisplayName([string]$Value, [string]$Fallback) {
  $normalized = ([string]$Value).Trim() -replace '[\r\n\t"]', ' '
  if ([string]::IsNullOrWhiteSpace($normalized)) { return $Fallback }
  if ($normalized.Length -gt 40) { return $normalized.Substring(0, 40) }
  return $normalized
}

function Read-JsonObject([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return [pscustomobject]@{} }
  $raw = Get-Content -LiteralPath $Path -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) { return [pscustomobject]@{} }
  try { return $raw | ConvertFrom-Json }
  catch { throw "Cannot safely merge invalid JSON: $Path" }
}

function Add-Or-ReplaceProperty($Object, [string]$Name, $Value) {
  if ($Object.PSObject.Properties[$Name]) { $Object.$Name = $Value }
  else { $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value }
}

function Test-CyberBossAdapter([string]$Root) {
  if ([string]::IsNullOrWhiteSpace($Root)) {
    return [pscustomobject]@{ status = 'not_checked'; detail = 'CyberBossRoot was not provided' }
  }
  $rootPath = [IO.Path]::GetFullPath($Root)
  $client = Join-Path $rootPath 'src\services\todo-service-client.js'
  $app = Join-Path $rootPath 'src\core\app.js'
  $toolHost = Join-Path $rootPath 'src\tools\tool-host.js'
  $ready = (Test-Path -LiteralPath $client) -and
    (Test-Path -LiteralPath $app) -and
    (Test-Path -LiteralPath $toolHost) -and
    ((Get-Content -LiteralPath $app -Raw) -match 'buildTodoReminderSystemTrigger') -and
    ((Get-Content -LiteralPath $toolHost -Raw) -match 'cyberboss_todo_manage')
  if ($ready) {
    $envFile = Join-Path $rootPath '.env'
    $enabled = (Test-Path -LiteralPath $envFile -PathType Leaf) -and
      ((Get-Content -LiteralPath $envFile -Raw) -match '(?m)^\s*CYBERBOSS_TODO_REMINDER_BRIDGE_ENABLED\s*=\s*true\s*$')
    if ($enabled) { return [pscustomobject]@{ status = 'ready'; detail = 'CyberBoss proactive reminder adapter is present and enabled' } }
    return [pscustomobject]@{ status = 'present_not_enabled'; detail = 'CyberBoss adapter code exists, but its enabled setting was not detected' }
  }
  return [pscustomobject]@{
    status = 'not_installed'
    detail = 'Direct AI CRUD will work; proactive reminder delivery needs a compatible CyberBoss adapter'
  }
}

if (-not (Test-Path -LiteralPath $workspace -PathType Container)) { throw "WorkspaceRoot does not exist: $workspace" }
if (-not (Test-Path -LiteralPath $entryPoint -PathType Leaf)) { throw "Todo MCP entrypoint is missing: $entryPoint" }

$nodeCommand = Get-Command node -ErrorAction Stop
$nodePath = $nodeCommand.Source
$nodeVersionText = (& $nodePath --version).Trim().TrimStart('v')
$nodeVersion = [version]$nodeVersionText
if ($nodeVersion -lt [version]'22.5.0') { throw "Node.js 22.5 or newer is required; found $nodeVersionText" }
$UserName = Normalize-DisplayName $UserName '你'
$AssistantName = Normalize-DisplayName $AssistantName '搭档'
$AppName = Normalize-DisplayName $AppName 'REWARD TODO'

$config = Read-JsonObject $configPath
if (-not $config.PSObject.Properties['mcpServers']) {
  $config | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{})
}
if ($null -eq $config.mcpServers -or $config.mcpServers.GetType().Name -ne 'PSCustomObject') {
  throw "mcpServers must be a JSON object: $configPath"
}

$adapter = Test-CyberBossAdapter $CyberBossRoot
$existing = $config.mcpServers.PSObject.Properties[$ServerName]
$serverConfig = [ordered]@{
  command = $nodePath
  args = @($entryPoint, 'mcp-gateway')
  env = [ordered]@{
    TODO_SERVICE_STATE_DIR = $state
    TODO_SERVICE_TIME_ZONE = 'Asia/Shanghai'
    TODO_SERVICE_PORT = [string]$Port
    TODO_SERVICE_USER_NAME = $UserName
    TODO_SERVICE_ASSISTANT_NAME = $AssistantName
    TODO_SERVICE_APP_NAME = $AppName
    TODO_SERVICE_REMINDER_DELIVERY_MODE = $adapter.status
  }
}

if ($existing -and -not $ReplaceExisting) {
  $existingJson = $existing.Value | ConvertTo-Json -Depth 20 -Compress
  $wantedJson = $serverConfig | ConvertTo-Json -Depth 20 -Compress
  if ($existingJson -ne $wantedJson) {
    throw "MCP server '$ServerName' already exists with a different configuration. Re-run with -ReplaceExisting only after reviewing it."
  }
}

$plan = [ordered]@{
  mode = $Mode
  serviceRoot = $serviceRoot
  workspaceRoot = $workspace
  configPath = $configPath
  stateDir = $state
  node = $nodePath
  nodeVersion = $nodeVersionText
  mcpServer = $ServerName
  displayNames = [ordered]@{ user = $UserName; assistant = $AssistantName; app = $AppName }
  frontendUrl = "http://127.0.0.1:$Port/"
  frontendBuild = if (Test-Path -LiteralPath $webIndex -PathType Leaf) { 'ready' } else { 'missing' }
  desktopShortcut = if ($CreateDesktopShortcut) { $shortcutPath } else { 'not_requested' }
  dataPolicy = 'Create a blank local database if absent; never copy another user database'
  autostart = 'disabled'
  restart = 'not_performed'
  proactiveReminderAdapter = $adapter
}

if ($Mode -eq 'Plan') {
  $plan | ConvertTo-Json -Depth 10
  exit 0
}

if (-not (Test-Path -LiteralPath $webIndex -PathType Leaf)) {
  throw 'The standalone frontend is not built. Run npm --prefix web install and npm run web:build, review the result, then retry Apply.'
}

New-Item -ItemType Directory -Path $state -Force | Out-Null
if (Test-Path -LiteralPath $configPath) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  Copy-Item -LiteralPath $configPath -Destination "$configPath.reward-todo.$stamp.bak"
}
Add-Or-ReplaceProperty $config.mcpServers $ServerName ([pscustomobject]$serverConfig)
$config | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $configPath -Encoding utf8

$manifest = [ordered]@{
  schemaVersion = 1
  installedAt = (Get-Date).ToString('o')
  workspaceRoot = $workspace
  configPath = $configPath
  serverName = $ServerName
  serviceRoot = $serviceRoot
  stateDir = $state
  nodePath = $nodePath
  port = $Port
  userName = $UserName
  assistantName = $AssistantName
  appName = $AppName
  reminderDelivery = $adapter.status
  shortcutPath = if ($CreateDesktopShortcut) { $shortcutPath } else { '' }
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding utf8

if ($CreateDesktopShortcut) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $openScript = Join-Path $PSScriptRoot 'open-reward-todo.ps1'
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$openScript`" -StateDir `"$state`""
  $shortcut.WorkingDirectory = $serviceRoot
  $shortcut.Description = '打开 Reward-Todo 小票'
  $shortcut.Save()
}

$plan.mode = 'Applied'
$plan.manifestPath = $manifestPath
$plan.nextStep = 'Restart the AI workspace yourself, then run doctor.ps1. CyberBoss itself was not restarted.'
$plan | ConvertTo-Json -Depth 10
