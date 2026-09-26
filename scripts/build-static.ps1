[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw 'Node.js is required. Install Node.js or add the existing node executable to PATH.'
}
& $nodeCommand.Source (Join-Path $PSScriptRoot 'build-static.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
