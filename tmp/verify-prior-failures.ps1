$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\BAPS\Documents\Oools_paywright'

# Real browsers — not the empty Cursor sandbox cache.
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:LOCALAPPDATA 'ms-playwright'
$env:SKIP_AIR_REPORT = 'true'

Write-Host "=== 1/2 Preflight paid login (cascade root cause) ==="
Write-Host "PLAYWRIGHT_BROWSERS_PATH=$env:PLAYWRIGHT_BROWSERS_PATH"

node -e "require('./scripts/apply-complete-run-env').applyCompleteRunEnv(process.cwd()); console.log('fixture', process.env.SUB_LIFECYCLE_PAID_EMAIL || process.env.BILLING_MANAGEMENT_EMAIL);"

node node_modules/playwright/cli.js test -c playwright.preflight.config.ts --reporter=line
$preflight = $LASTEXITCODE
if ($preflight -ne 0) {
  Write-Host "PREFLIGHT FAILED ($preflight) — do not start the full suite."
  exit $preflight
}

Write-Host "=== 2/2 Prior 32-failure titles only ==="
node node_modules/playwright/cli.js test `
  tests/SubscriptionLifecycleExecution.spec.ts `
  tests/OptionExpiryOverview.spec.ts `
  tests/PositionsDynamicGrid.spec.ts `
  tests/Opportunities.spec.ts `
  tests/DashboardCoverageDepth.spec.ts `
  tests/DashboardScenarioSweep.spec.ts `
  tests/UpgradeSubscriptionMatrix.spec.ts `
  tests/DowngradeSubscriptionMatrix.spec.ts `
  tests/MonthlyAnnualBillingChangeMatrix.spec.ts `
  tests/SubscriptionCancellationMatrix.spec.ts `
  tests/FailedPaymentDunningMatrix.spec.ts `
  tests/SubscriptionLifecycleE2EMatrix.spec.ts `
  -g "preview monthly and annual upgrade|preview downgrade|Option Expiry|call filter|Opportunity save view|Support changes ticket|Support walks every|SC-86 |SC-88 |SC-91 |SC-109 |SC-121 |SC-143 |SC-187 |SC-262 |SC-313 |SC-314 |SC-328 |LC-009 |LC-018 |LC-023 |LC-024 |LC-025 |LC-026 |LC-031 |LC-032 |LC-033 |LC-035 |LC-043 " `
  --reporter=line

$focused = $LASTEXITCODE
Write-Host "Preflight exit: $preflight"
Write-Host "Focused prior-failures exit: $focused"
exit $focused
