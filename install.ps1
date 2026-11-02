# One-line installer for Windows (PowerShell):
#   irm https://raw.githubusercontent.com/njfamirm/vscode-antigravity-rtl/main/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$Dir = Join-Path $env:LOCALAPPDATA 'vscode-antigravity-rtl'
$Node = (Get-Command node -ErrorAction Stop).Source

if (Test-Path "$Dir\.git") { git -C $Dir pull -q --ff-only } else { git clone -q https://github.com/njfamirm/vscode-antigravity-rtl.git $Dir }
& $Node "$Dir\patch.js"

# Re-patch at every logon, in case the extension updated.
$Action = New-ScheduledTaskAction -Execute $Node -Argument "`"$Dir\patch.js`" --quiet"
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
Register-ScheduledTask -TaskName 'vscode-antigravity-rtl' -Action $Action -Trigger $Trigger -Force | Out-Null

Write-Host 'Done. Fully restart VS Code.'
