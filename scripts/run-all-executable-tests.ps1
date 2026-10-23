<#
Runs the broadest practical OOLTool automation pass by enabling safe controlled
test gates before starting Playwright.

Some tests still require one-time/manual data and will skip unless you provide
the values below before running this script:

- RESET_URL for reset-password page validation.
- STRIPE_CHECKOUT_URL for Stripe Checkout negative validation.
- MFA_LOCAL_TOTP_SECRET for authenticator/trusted-device tests.
- MFA_LOCAL_BACKUP_CODE for backup-code tests.
- PERMISSION_ALLOWED_EMAIL/PASSWORD and PERMISSION_RESTRICTED_EMAIL/PASSWORD
  for permission-access tests.
- ADMIN_EMAIL/PASSWORD can be used to prepare roles, MFA settings, and account
  state before controlled tests.
- A locked account for unlock-account validation.

Usage:
  .\scripts\run-all-executable-tests.ps1 -Headed
  .\scripts\run-all-executable-tests.ps1 -Headed -GenerateAir
#>

param(
  [switch]$Headed,
  [switch]$GenerateAir
)

$ErrorActionPreference = 'Stop'

function Enable-Flag {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  Set-Item -Path "Env:$Name" -Value 'true'
}

function Set-DefaultEnv {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  if (!(Test-Path "Env:$Name") -or [string]::IsNullOrWhiteSpace((Get-Item "Env:$Name").Value)) {
    Set-Item -Path "Env:$Name" -Value $Value
  }
}

Enable-Flag 'RECORD_ALL_ARTIFACTS'

# Controlled validations that are safe to execute with normal prepared users.
Enable-Flag 'ONBOARDING_FIELD_VALIDATION_ENABLED'
Enable-Flag 'ONBOARDING_FIELD_VALIDATION_FULL_ENABLED'
Enable-Flag 'RISK_COMPLIANCE_VALIDATION_ENABLED'
Enable-Flag 'RISK_COMPLIANCE_UPDATE_ENABLED'
Enable-Flag 'PLAN_SELECTION_VALIDATION_ENABLED'
Enable-Flag 'PLAN_SELECTION_FREE_ACTIVATION_ENABLED'
Enable-Flag 'PROFILE_MOBILE_VALIDATION_ENABLED'
Enable-Flag 'PROFILE_UPDATE_VALIDATION_ENABLED'
Enable-Flag 'BILLING_SUBSCRIPTION_MANAGEMENT_ENABLED'
Enable-Flag 'PROFILE_SECURITY_DISPLAY_ENABLED'
Enable-Flag 'SIGNUP_OTP_LENGTH_VALIDATION_ENABLED'
Enable-Flag 'SIGNUP_OTP_RESEND_VALIDATION_ENABLED'
Enable-Flag 'SIGNUP_DUPLICATE_EMAIL_VALIDATION_ENABLED'

# Stripe Overlay is still a phase-controlled area, but these flags allow the
# implemented browser-safe cases to run when the suite includes the file.
Enable-Flag 'OVERLAY_STRATEGISTS_FLOW_ENABLED'
Enable-Flag 'OVERLAY_STRATEGISTS_TERMS_ENABLED'

# Prepared-fixture billing inspect (non-destructive). Cancel form + yearly/monthly
# cancel options always run. Plan-ladder inspect is on (submit flags stay off).
Enable-Flag 'SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED'
Enable-Flag 'SUB_LIFECYCLE_PLAN_CONTROLS_ENABLED'
Enable-Flag 'SUB_LIFECYCLE_UPGRADE_PREVIEW_ENABLED'
Enable-Flag 'SUB_LIFECYCLE_DOWNGRADE_PREVIEW_ENABLED'
Enable-Flag 'SUB_LIFECYCLE_INTERVAL_PREVIEW_ENABLED'
Enable-Flag 'SUB_LIFECYCLE_CANCEL_FORM_ENABLED'
Enable-Flag 'SUB_LIFECYCLE_PLAN_LADDER_ENABLED'

# Prepared fixtures: see tests/config/preparedSubscriptionUsers.data.json
# npm run fixtures:list   |   npm run fixtures:apply-env
# Flip SUB_FIXTURE_USE_CANONICAL_EMAILS=true after creating +sub-* accounts.
Set-DefaultEnv 'AUTH_OTP_CODE' '111111'
Set-DefaultEnv 'SUBSCRIPTION_FIXTURE_PASSWORD' 'Test@123456'
Set-DefaultEnv 'PLAN_SELECTION_EXISTING_EMAIL' 'imhardikthanki+plan-selection-prepared@gmail.com'
Set-DefaultEnv 'PLAN_SELECTION_EXISTING_PASSWORD' 'H@rdik9944'
Set-DefaultEnv 'SUB_LIFECYCLE_PAID_EMAIL' 'imhardikthanki+monthly-to-a-mvjn15yr@gmail.com'
Set-DefaultEnv 'SUB_LIFECYCLE_PAID_PASSWORD' 'Test@123456'
Set-DefaultEnv 'BILLING_MANAGEMENT_EMAIL' 'imhardikthanki+monthly-to-a-mvjn15yr@gmail.com'
Set-DefaultEnv 'BILLING_MANAGEMENT_PASSWORD' 'Test@123456'
Set-DefaultEnv 'SUB_LIFECYCLE_USE_PREPARED_USER' 'true'
Set-DefaultEnv 'CANCEL_YEARLY_EMAIL' 'imhardikthanki+e2e@gmail.com'
Set-DefaultEnv 'CANCEL_YEARLY_PASSWORD' 'H@rdik9944'
Set-DefaultEnv 'CANCEL_MONTHLY_EMAIL' 'imhardikthanki+monthly-to-a-mvjn15yr@gmail.com'
Set-DefaultEnv 'CANCEL_MONTHLY_PASSWORD' 'Test@123456'
Set-DefaultEnv 'AIR_RESTORE_HISTORY' 'true'
Set-DefaultEnv 'AIR_INCLUDE_MANUAL_DEFECTS' 'false'
Set-DefaultEnv 'ADMIN_EMAIL' 'admin@ooltool.com'
Set-DefaultEnv 'ADMIN_PASSWORD' 'Admin@1234!'

# Avoid enabling destructive Stripe and MFA lifecycle flags by default.
# Uncomment only when using dedicated disposable accounts / fresh one-time data.
# Plan-ladder inspect is on. Keep extra submit flags off (monthly cancel submit,
# yearly cancel-at-expiry submit, yearly refund, retention accept, downgrade submit).
# Enable-Flag 'OVERLAY_STRATEGISTS_WITH_CARD_ENABLED'
# Enable-Flag 'OVERLAY_STRATEGISTS_WITHOUT_CARD_ENABLED'
# Enable-Flag 'OVERLAY_STRATEGISTS_STRIPE_NEGATIVE_ENABLED'
# Enable-Flag 'AUTH_CONFIGURATION_LIMITS_ENABLED'
# Enable-Flag 'AUTH_LOCKOUT_LIMIT_VALIDATION_ENABLED'
# Enable-Flag 'AUTH_PASSWORD_RESET_RATE_LIMIT_VALIDATION_ENABLED'
# Enable-Flag 'MFA_USER_FLOW_ENABLED'
# Enable-Flag 'MFA_ALLOW_DESTRUCTIVE_USER_FLOW'
# Enable-Flag 'MFA_MANUAL_OTP_FLOW_ENABLED'
# Enable-Flag 'PERMISSION_TEST_ENABLED'

$playwrightArgs = @('test')

if ($Headed) {
  $playwrightArgs += '--headed'
}

Write-Host 'Running all currently executable tests in one Playwright process.' -ForegroundColor Cyan
Write-Host 'Use run-safe-batched-tests.ps1 for safer multi-batch execution and AIR merge.' -ForegroundColor Cyan
Write-Host 'Running executable automation suite with safe controlled gates enabled...' -ForegroundColor Green
$runStarted = Get-Date
& .\node_modules\.bin\playwright.cmd @playwrightArgs

$stamp = Join-Path (Get-Location) 'test-results\.air-report-opened'
$alreadyOpened = (Test-Path $stamp) -and ((Get-Item $stamp).LastWriteTime) -ge $runStarted.AddSeconds(-5)
if ($GenerateAir -and -not $alreadyOpened) {
  Write-Host 'Generating AIR execution report...' -ForegroundColor Green
  node scripts\generate-air-results.js
  node scripts\generate-execution-report.js
  Start-Process (Join-Path (Get-Location) 'execution-report\index.html')
}
