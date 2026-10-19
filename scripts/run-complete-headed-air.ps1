<#
Runs the complete Playwright suite, generates AIR, and emails every configured
report address except Rob.

Usage:
  npm run complete
  npm run complete:headed
  $env:WATCH="true"; npm run complete:headed
#>

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)

$argsList = @()
$watch = @('1', 'true', 'yes', 'on') -contains ([string]$env:WATCH).ToLower()

if ($watch) {
  $argsList += '--headed'
}

& node scripts\run-complete-suite.js @argsList
exit $LASTEXITCODE
