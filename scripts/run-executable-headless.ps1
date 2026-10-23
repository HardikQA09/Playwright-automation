<#
Clean headless run of executable specs, including Stripe FRD matrix files.

Automated matrix rows run unique UI coverage keys. UserJourneyCoverageMatrix
stays skip-only AIR. Enables gated executable Stripe/onboarding flags. Does
not open a browser. Does not record video.

Usage:
  powershell -ExecutionPolicy Bypass -File scripts\run-executable-headless.ps1
#>

$ErrorActionPreference = 'Continue'

Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not $env:PLAYWRIGHT_BROWSERS_PATH) {
  $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:USERPROFILE 'AppData\Local\ms-playwright'
}

Write-Host 'Cleaning previous Playwright results...' -ForegroundColor Cyan

foreach ($path in @('test-results', 'playwright-report')) {
  if (Test-Path $path) {
    Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

node scripts\upsert-env-flags.js

$flags = @(
  'AUTH_EMAIL_VERIFICATION_REQUIRED',
  'ONBOARDING_FIELD_VALIDATION_ENABLED',
  'ONBOARDING_FIELD_VALIDATION_FULL_ENABLED',
  'RISK_COMPLIANCE_VALIDATION_ENABLED',
  'RISK_COMPLIANCE_UPDATE_ENABLED',
  'PLAN_SELECTION_VALIDATION_ENABLED',
  'PLAN_SELECTION_FREE_ACTIVATION_ENABLED',
  'PROFILE_MOBILE_VALIDATION_ENABLED',
  'PROFILE_UPDATE_VALIDATION_ENABLED',
  'BILLING_SUBSCRIPTION_MANAGEMENT_ENABLED',
  'PROFILE_SECURITY_DISPLAY_ENABLED',
  'SIGNUP_OTP_LENGTH_VALIDATION_ENABLED',
  'SIGNUP_OTP_RESEND_VALIDATION_ENABLED',
  'SIGNUP_DUPLICATE_EMAIL_VALIDATION_ENABLED',
  'OVERLAY_STRATEGISTS_FLOW_ENABLED',
  'OVERLAY_STRATEGISTS_TERMS_ENABLED',
  'OVERLAY_STRATEGISTS_WITH_CARD_ENABLED',
  'OVERLAY_STRATEGISTS_WITHOUT_CARD_ENABLED',
  'OVERLAY_STRATEGISTS_STRIPE_CHECKOUT_DETAILS_ENABLED',
  'OVERLAY_STRATEGISTS_STRIPE_NEGATIVE_ENABLED',
  'OVERLAY_STRATEGISTS_DECLINED_CARD_ENABLED',
  'DIRECT_SUBSCRIPTION_PURCHASE_ENABLED',
  'SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED',
  'SUB_LIFECYCLE_PLAN_CONTROLS_ENABLED',
  'SUB_LIFECYCLE_UPGRADE_PREVIEW_ENABLED',
  'SUB_LIFECYCLE_DOWNGRADE_PREVIEW_ENABLED',
  'SUB_LIFECYCLE_INTERVAL_PREVIEW_ENABLED',
  'SUB_LIFECYCLE_CANCEL_FORM_ENABLED',
  'SUB_LIFECYCLE_PLAN_LADDER_ENABLED'
)

$offFlags = @(
  'SUB_LIFECYCLE_TRIAL_WITHOUT_CARD_ENABLED',
  'SUB_LIFECYCLE_TRIAL_WITH_CARD_ENABLED',
  'SUB_LIFECYCLE_INCOME_MONTHLY_ENABLED',
  'SUB_LIFECYCLE_OVERLAY_MONTHLY_ENABLED',
  'SUB_LIFECYCLE_PORTFOLIO_MONTHLY_ENABLED',
  'SUB_LIFECYCLE_MARKETPLACE_MONTHLY_ENABLED',
  'SUB_LIFECYCLE_PAID_ANNUAL_ENABLED',
  'SUB_LIFECYCLE_UPGRADE_SUBMIT_ENABLED',
  'RECORD_ALL_ARTIFACTS',
  'RECORD_VIDEO',
  'WATCH'
)

foreach ($flag in $flags) {
  Set-Item -Path "Env:$flag" -Value 'true'
}

foreach ($flag in $offFlags) {
  Set-Item -Path "Env:$flag" -Value 'false'
}

$env:SLOW_MO = '0'
$env:HEADED = 'false'
$env:AIR_REPORT_SCOPE = 'latest'
$env:AIR_RESTORE_HISTORY = 'true'
# Prepared fixtures: npm run fixtures:list | fixtures:apply-env
$env:SUBSCRIPTION_FIXTURE_PASSWORD = 'Test@123456'
$env:SUB_LIFECYCLE_PAID_EMAIL = 'imhardikthanki+monthly-to-a-mvjn15yr@gmail.com'
$env:SUB_LIFECYCLE_PAID_PASSWORD = 'Test@123456'
$env:BILLING_MANAGEMENT_EMAIL = 'imhardikthanki+monthly-to-a-mvjn15yr@gmail.com'
$env:BILLING_MANAGEMENT_PASSWORD = 'Test@123456'
$env:SUB_LIFECYCLE_USE_PREPARED_USER = 'true'
$env:CANCEL_YEARLY_EMAIL = 'imhardikthanki+e2e@gmail.com'
$env:CANCEL_YEARLY_PASSWORD = 'H@rdik9944'
$env:CANCEL_MONTHLY_EMAIL = 'imhardikthanki+monthly-to-a-mvjn15yr@gmail.com'
$env:CANCEL_MONTHLY_PASSWORD = 'Test@123456'

Write-Host 'Clean executable headless run: journey order, Stripe FRD matrix included, SLOW_MO=0.' -ForegroundColor Cyan
node -e "require('./scripts/execution-order').assertAllSpecsAreListed(); require('./scripts/execution-order').printOrder(require('./scripts/execution-order').executableJourneyOrder)"

$runStarted = Get-Date
node scripts\run-ordered-tests.js executable
$playwrightExit = $LASTEXITCODE

$stamp = Join-Path (Get-Location) 'test-results\.air-report-opened'
if ((Test-Path $stamp) -and ((Get-Item $stamp).LastWriteTime) -ge $runStarted.AddSeconds(-5)) {
  Write-Host 'AIR report was generated and opened in the browser.' -ForegroundColor Green
} else {
  $env:AIR_REPORT_SCOPE = 'latest'
  npm run report:execution
}

if ($playwrightExit -ne 0) {
  Write-Host "Executable headless run finished with exit code $playwrightExit. AIR was still generated." -ForegroundColor Yellow
  exit $playwrightExit
}

Write-Host 'Executable headless run finished. AIR opened.' -ForegroundColor Green
