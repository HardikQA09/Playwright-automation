# OOLTool Playwright Command Reference

Use these commands from:

```powershell
C:\Users\BAPS\Documents\Oools_paywright
```

## Full Automation Suite

Smoke suite:

```powershell
npm run test:smoke -- --headed
```

Smoke suite with AIR report:

```powershell
npm run smoke:report
```

Sanity suite:

```powershell
npm run test:sanity -- --headed
```

Sanity suite with AIR report:

```powershell
npm run sanity:report
```

Regression suite:

```powershell
npm run test:regression -- --headed
```

Regression suite with AIR report:

```powershell
npm run regression:report
```

Recommended stable suite with AIR report:

```powershell
npm run execution:headed
```

Run all tests in headed browser mode:

```powershell
npx playwright test --headed
```

Run all tests in normal/headless mode:

```powershell
npx playwright test
```

Run all tests and then generate AIR execution report:

```powershell
npx playwright test --headed
npm run report:execution
```

Recommended full AIR client run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-safe-batched-tests.ps1 -Headed
start execution-report\index.html
```

Use this when you want the best complete AIR report. It runs the executable
automation in smaller batches, includes controlled/gated specs, includes the
user-journey and Stripe coverage matrices, merges completed batch results, and
then generates AIR. This lets AIR show executed, passed, failed, skipped,
blocked, and not-executed coverage together instead of losing progress if one
long Playwright process gets stuck.

Run the broadest practical suite with safe controlled gates enabled.
Includes Stripe FRD matrix automated rows (`08-stripe-matrix`). The skip-only
user-journey matrix stays out of `npm run test:executable` / executable
headless and remains last in the complete AIR run.

```powershell
npm run executable:headed
```

Complete suite (journey order + the Oct 12 ~550-pass flag profile + AIR + email to every configured address except Rob). Destructive Stripe submits stay off:

```powershell
npm run complete
```

Headed (watch the browser):

```powershell
$env:WATCH="true"
npm run complete:headed
```

Same command without npm:

```powershell
.\scripts\run-all-executable-tests.ps1 -Headed
```

Run the broadest practical suite and generate AIR:

```powershell
.\scripts\run-all-executable-tests.ps1 -Headed -GenerateAir
```

This enables non-destructive controlled validations such as onboarding field
validation, Risk & Compliance update checks, plan-selection validation, profile
mobile display checks, billing management display checks, profile security
display checks, signup OTP length/resend checks, duplicate-email validation,
and the four-user plan-ladder inspect (Users A/B/D: paid upgrades, cancel copy,
retention offer). That ladder creates disposable Stripe test users. Upgrade,
downgrade, and interval calculation previews are also on, so Stripe matrix
automated rows can execute those coverage keys without submitting.

Yearly refund, period-end cancel submit, retention accept, and scheduled
downgrade stay off unless you set their extra flags.

Some tests will still skip until their one-time/manual data is provided:

```text
RESET_URL
STRIPE_CHECKOUT_URL
MFA_LOCAL_TOTP_SECRET
MFA_LOCAL_BACKUP_CODE
PERMISSION_ALLOWED_EMAIL / PERMISSION_ALLOWED_PASSWORD
PERMISSION_RESTRICTED_EMAIL / PERMISSION_RESTRICTED_PASSWORD
locked-account credentials for unlock flow
```

Run tests with full AIR evidence capture:

```powershell
$env:RECORD_ALL_ARTIFACTS="true"
npx playwright test --headed
npm run report:execution
```

Use this when the AIR Evidence page should include screenshots, videos, and
traces for passed tests. Without this flag, Playwright keeps rich artifacts only
for failures by default, but AIR still links the raw Playwright HTML/JSON report.

Run the configured stable suite only:

```powershell
npm run test:stable -- --headed
```

## Complete User Journey

Stable user journey:

```powershell
npm run test:user-journey:stable -- --headed
```

Stable user journey with AIR report:

```powershell
npm run user-journey:report
```

Controlled user journey for forgot-password, account unlock, auth
configuration limits, and MFA:

```powershell
npm run test:user-journey:controlled -- --headed
```

Manual reset-password email links are skipped by default so this suite can keep
running when the reset email is delayed. Enable the reset-link flow only when
you are ready to open Gmail, copy the reset link, paste it into the Playwright
browser, and resume:

```powershell
$env:FORGOT_PASSWORD_FLOW_ENABLED="true"
npm run test:controlled:email -- --headed -g "Forgot Password Flow"
```

If a run is already stuck waiting for the reset email, stop it with `Ctrl + C`
and rerun without the flag, or exclude it explicitly:

```powershell
npx playwright test --headed --grep-invert "Forgot Password|Reset Password"
```

Full core user journey, including controlled/manual-gated tests but excluding
Stripe checkout/customer-portal lifecycle:

```powershell
npm run test:user-journey:full -- --headed
```

Current user journey map:

```text
Register -> Email Verification -> Login -> Risk Profile -> Compliance ->
Plan Selection -> Dashboard -> Profile -> Billing -> Logout ->
Forgot Password -> MFA / Trusted Device
```

Stripe checkout, trial purchase, customer portal, upgrade, downgrade, and
cancellation lifecycle tests are kept in the Stripe phase commands.

## Generate AIR Report From Last Run

Use this after any test execution:

```powershell
npm run report:execution
```

For a smaller controlled run, such as Overlay Strategists or Stripe-only tests,
force AIR to use the latest Playwright result instead of restoring the larger
historical regression snapshot:

```powershell
$env:AIR_REPORT_SCOPE="latest"
npm run report:execution
```

Legacy equivalent:

```powershell
$env:AIR_ALLOW_STALE_REPORT="true"
npm run report:execution
```

If you only want to regenerate files and do not want the browser to open:

```powershell
npm run air:parse
node scripts/generate-execution-report.js
```

Open AIR execution report:

```powershell
start execution-report\index.html
```

AIR report file:

```text
execution-report\index.html
```

AIR normalized data file:

```text
execution-report\air-results.json
```

### Adding tests (developers)

Short guide for new menu / button / nav coverage:

```text
docs/HOW_TO_ADD_A_TEST.md
```

Copyable UI-control template + checklist:

```text
tests/_templates/UiControlCheck.spec.ts
```

After adding a case, run it, then regenerate AIR so **Coverage by area** and
**Product Health** pick it up. Evidence links to the same local package:

```text
playwright-report\index.html
test-results\
```

## Generate Test Inventory Report Without Running Tests

Use this when you want a full test-case inventory and coverage map without
executing the automation suite:

```powershell
npm run report:inventory
start inventory-report\index.html
```

Generate and open it in one command:

```powershell
npm run report:inventory:open
```

This report shows discovered test cases, spec files, AIR module mapping,
business journey mapping, coverage type, and suite membership. It does not show
pass/fail status because no tests are executed.

## Open Playwright HTML Report

```powershell
npx playwright show-report
```

This opens the Playwright report in the browser, usually at:

```text
http://localhost:9323
```

## Run Specific Test Files

Onboarding:

```powershell
npx playwright test tests/onboarding.spec.ts --headed
```

Subscriber billing:

```powershell
npx playwright test tests/Subscriber.spec.ts --headed
```

Dashboard navigation:

```powershell
npx playwright test tests/DashboardNavigation.spec.ts --headed
```

Run through npm script:

```powershell
npm run test:controlled:dashboard-navigation -- --headed
```

Dashboard health / load-error validation:

```powershell
npx playwright test tests/DashboardHealth.spec.ts --headed
```

Run through npm script:

```powershell
npm run test:controlled:dashboard-health -- --headed
```

Billing edge validation:

```powershell
npx playwright test tests/BillingEdgeValidation.spec.ts --headed
```

Run through npm script:

```powershell
npm run test:controlled:billing-edge -- --headed
```

Billing subscription management portal validation:

```powershell
$env:BILLING_SUBSCRIPTION_MANAGEMENT_ENABLED="true"
npx playwright test tests/BillingSubscriptionManagement.spec.ts --headed
```

Billing subscription management with a prepared account:

```powershell
$env:BILLING_SUBSCRIPTION_MANAGEMENT_ENABLED="true"
$env:BILLING_MANAGEMENT_EMAIL="imhardikthanki+completejourney@gmail.com"
$env:BILLING_MANAGEMENT_PASSWORD="H@rdik9944"
npx playwright test tests/BillingSubscriptionManagement.spec.ts --headed
```

Optional stricter Stripe portal expectations:

```powershell
$env:BILLING_EXPECTED_PLAN="3-Advanced"
$env:BILLING_EXPECTED_FREQUENCY="per year"
$env:BILLING_EXPECTED_CARD_LAST4="4242"
```

Overlay Strategists **with-card trial** must not use `4242424242424242`. That Stripe test fingerprint is already redeemed (`already_redeemed`) and returns the user to Plan Selection / Free. Paid checkout may still use `STRIPE_CARD` 4242. Set `STRIPE_TRIAL_CARD` to another Visa/Mastercard test card, or leave it unset so automation rotates `stripe.trialCards`. Follow-up: clear 4242 reuse in Stripe test mode.

```powershell
$env:STRIPE_TRIAL_CARD="4000003560000008"
```

Run through npm script:

```powershell
$env:BILLING_SUBSCRIPTION_MANAGEMENT_ENABLED="true"
npm run test:controlled:billing-management -- --headed
```

Profile:

```powershell
npx playwright test tests/Profile.spec.ts --headed
```

Profile name update and restore validation:

```powershell
$env:PROFILE_UPDATE_VALIDATION_ENABLED="true"
npx playwright test tests/Profile.spec.ts -g "Profile name update" --headed
```

Profile password mismatch:

```powershell
npx playwright test tests/ProfilePasswordMismatch.spec.ts --headed
```

Profile wrong current password:

```powershell
npx playwright test tests/ProfileWrongCurrentPassword.spec.ts --headed
```

Profile mobile number validation:

```powershell
$env:PROFILE_MOBILE_VALIDATION_ENABLED="true"
npx playwright test tests/ProfileMobileValidation.spec.ts --headed
```

Profile mobile number validation with a prepared user:

```powershell
$env:PROFILE_MOBILE_VALIDATION_ENABLED="true"
$env:PROFILE_MOBILE_EMAIL="imhardikthanki+profile-mobile@gmail.com"
$env:PROFILE_MOBILE_PASSWORD="Test@123456"
npx playwright test tests/ProfileMobileValidation.spec.ts --headed
```

Profile mobile OTP request or update flow:

```powershell
$env:PROFILE_MOBILE_VALIDATION_ENABLED="true"
$env:PROFILE_MOBILE_CHANGE_ENABLED="true"
npx playwright test tests/ProfileMobileValidation.spec.ts -g "request OTP" --headed
```

Complete the mobile number change only when you intentionally want to update the
account mobile number:

```powershell
$env:PROFILE_MOBILE_VALIDATION_ENABLED="true"
$env:PROFILE_MOBILE_CHANGE_ENABLED="true"
$env:PROFILE_MOBILE_COMPLETE_ENABLED="true"
npx playwright test tests/ProfileMobileValidation.spec.ts -g "request OTP" --headed
```

Forgot password:

```powershell
npx playwright test tests/forgotpassword.spec.ts --headed
```

Unlock locked account:

```powershell
$env:RUN_UNLOCK_ACCOUNT_TEST="true"
$env:UNLOCK_ACCOUNT_EMAIL="imhardikthanki+8@gmail.com"
$env:UNLOCK_ACCOUNT_PASSWORD="H@rdik9944"
npx playwright test tests/UnlockAccount.spec.ts --headed
```

Auth negative scenarios:

```powershell
npx playwright test tests/AuthNegative.spec.ts --headed
```

Auth UI validation:

```powershell
npx playwright test tests/AuthUiValidation.spec.ts --headed
```

Run through npm script:

```powershell
npm run test:controlled:auth-ui -- --headed
```

Controlled auth configuration limit validation:

These tests intentionally exercise lockout and rate-limit behavior. Use a
dedicated account, then unlock it afterward if needed.

Login lockout after configured failed attempts:

```powershell
$env:AUTH_CONFIGURATION_LIMITS_ENABLED="true"
$env:AUTH_LOCKOUT_LIMIT_VALIDATION_ENABLED="true"
$env:AUTH_LOCKOUT_EMAIL="imhardikthanki+lockout-test@gmail.com"
$env:AUTH_LOCKOUT_PASSWORD="H@rdik9944"
$env:AUTH_MAX_FAILED_LOGIN_ATTEMPTS="5"
npm run test:controlled:auth-limits -- --headed -g "login lockout"
```

Password reset email rate limit:

```powershell
$env:AUTH_CONFIGURATION_LIMITS_ENABLED="true"
$env:AUTH_PASSWORD_RESET_RATE_LIMIT_VALIDATION_ENABLED="true"
$env:AUTH_RATE_LIMIT_EMAIL="imhardikthanki+rate-limit-test@gmail.com"
$env:RATE_PASSWORD_RESETS_PER_WINDOW="5"
npm run test:controlled:auth-limits -- --headed -g "password reset"
```

Permission access validation:

```powershell
$env:PERMISSION_TEST_ENABLED="true"
$env:PERMISSION_ALLOWED_EMAIL="allowed@example.com"
$env:PERMISSION_ALLOWED_PASSWORD="password"
$env:PERMISSION_RESTRICTED_EMAIL="restricted@example.com"
$env:PERMISSION_RESTRICTED_PASSWORD="password"
npm run test:controlled:permissions -- --headed
```

Signup negative scenarios:

```powershell
npx playwright test tests/SignupNegative.spec.ts --headed
```

Signup duplicate email validation:

```powershell
$env:SIGNUP_DUPLICATE_EMAIL_VALIDATION_ENABLED="true"
$env:SIGNUP_DUPLICATE_EMAIL="imhardikthanki+09@gmail.com"
$env:SIGNUP_DUPLICATE_MOBILE="2015550123"
npx playwright test tests/SignupNegative.spec.ts --headed -g "already registered email"
```

Signup OTP length validation:

```powershell
$env:SIGNUP_OTP_LENGTH_VALIDATION_ENABLED="true"
$env:SIGNUP_DUPLICATE_MOBILE="2015550123"
npx playwright test tests/SignupNegative.spec.ts --headed -g "OTP input limits"
```

Signup OTP input boundary validation:

```powershell
$env:SIGNUP_OTP_LENGTH_VALIDATION_ENABLED="true"
$env:SIGNUP_DUPLICATE_MOBILE="2015550123"
npx playwright test tests/SignupNegative.spec.ts --headed -g "OTP input"
```

Signup OTP verify button state validation:

```powershell
$env:SIGNUP_OTP_LENGTH_VALIDATION_ENABLED="true"
$env:SIGNUP_DUPLICATE_MOBILE="2015550123"
npx playwright test tests/SignupNegative.spec.ts --headed -g "verify button"
```

Signup OTP resend or cooldown state validation:

```powershell
$env:SIGNUP_OTP_RESEND_VALIDATION_ENABLED="true"
$env:SIGNUP_DUPLICATE_MOBILE="2015550123"
npx playwright test tests/SignupNegative.spec.ts --headed -g "resend or cooldown"
```

Onboarding Risk Profile and Compliance fast field validation:

```powershell
$env:ONBOARDING_FIELD_VALIDATION_ENABLED="true"
npx playwright test tests/OnboardingFieldValidation.spec.ts --headed
```

Use a prepared onboarding user when fresh registration SMS OTP is rate-limited.
The user should already be verified and still be on the onboarding flow:

```powershell
$env:ONBOARDING_FIELD_VALIDATION_ENABLED="true"
$env:ONBOARDING_FIELD_VALIDATION_EXISTING_EMAIL="imhardikthanki+prepared-onboarding@gmail.com"
$env:ONBOARDING_FIELD_VALIDATION_EXISTING_PASSWORD="Test@123456"
$env:ONBOARDING_FIELD_VALIDATION_EXISTING_MOBILE="2015550123"
npx playwright test tests/OnboardingFieldValidation.spec.ts --headed
```

Onboarding Risk Profile and Compliance full field-level regression:

```powershell
$env:ONBOARDING_FIELD_VALIDATION_ENABLED="true"
$env:ONBOARDING_FIELD_VALIDATION_FULL_ENABLED="true"
npx playwright test tests/OnboardingFieldValidation.spec.ts --headed
```

Risk Profile and Compliance update-before-save validation:

```powershell
$env:ONBOARDING_FIELD_VALIDATION_ENABLED="true"
$env:ONBOARDING_FIELD_VALIDATION_FULL_ENABLED="true"
npx playwright test tests/OnboardingFieldValidation.spec.ts -g "Risk Profile and Compliance selections can be updated before save" --headed
```

Authenticated Risk & Compliance page validation:

```powershell
$env:RISK_COMPLIANCE_VALIDATION_ENABLED="true"
npx playwright test tests/RiskComplianceUpdate.spec.ts --headed
```

Authenticated Risk & Compliance page validation with a prepared user:

```powershell
$env:RISK_COMPLIANCE_VALIDATION_ENABLED="true"
$env:RISK_COMPLIANCE_EMAIL="imhardikthanki+prepared-risk-compliance@gmail.com"
$env:RISK_COMPLIANCE_PASSWORD="Test@123456"
npx playwright test tests/RiskComplianceUpdate.spec.ts --headed
```

Authenticated Risk & Compliance update validation:

```powershell
$env:RISK_COMPLIANCE_VALIDATION_ENABLED="true"
$env:RISK_COMPLIANCE_UPDATE_ENABLED="true"
npx playwright test tests/RiskComplianceUpdate.spec.ts --headed
```

Plan selection validation without Stripe:

```powershell
$env:PLAN_SELECTION_VALIDATION_ENABLED="true"
npx playwright test tests/PlanSelectionValidation.spec.ts --headed
```

Plan selection validation with a prepared user already on the plan-selection step:

```powershell
$env:PLAN_SELECTION_VALIDATION_ENABLED="true"
$env:PLAN_SELECTION_EXISTING_EMAIL="imhardikthanki+prepared-plan-selection@gmail.com"
$env:PLAN_SELECTION_EXISTING_PASSWORD="Test@123456"
$env:PLAN_SELECTION_EXISTING_MOBILE="2015550123"
npx playwright test tests/PlanSelectionValidation.spec.ts --headed
```

Plan selection free-plan activation with a fresh user:

```powershell
$env:PLAN_SELECTION_VALIDATION_ENABLED="true"
$env:PLAN_SELECTION_FREE_ACTIVATION_ENABLED="true"
npx playwright test tests/PlanSelectionValidation.spec.ts -g "Curious Explorer free plan" --headed
```

Plan selection free-plan activation with manual registration OTP fallback:

```powershell
$env:PLAN_SELECTION_VALIDATION_ENABLED="true"
$env:PLAN_SELECTION_FREE_ACTIVATION_ENABLED="true"
$env:REGISTRATION_OTP_MANUAL_FALLBACK="true"
npx playwright test tests/PlanSelectionValidation.spec.ts -g "Curious Explorer free plan" --headed
```

If registration SMS is throttled, use a prepared user that is already on the
plan-selection step:

```powershell
$env:PLAN_SELECTION_VALIDATION_ENABLED="true"
$env:PLAN_SELECTION_FREE_ACTIVATION_ENABLED="true"
$env:PLAN_SELECTION_EXISTING_EMAIL="PASTE_REAL_PREPARED_PLAN_USER_EMAIL"
$env:PLAN_SELECTION_EXISTING_PASSWORD="PASTE_REAL_PREPARED_PLAN_USER_PASSWORD"
$env:PLAN_SELECTION_EXISTING_MOBILE="PASTE_REAL_PREPARED_PLAN_USER_MOBILE"
npx playwright test tests/PlanSelectionValidation.spec.ts -g "Curious Explorer free plan" --headed
```

Reset password negative scenarios:

```powershell
npx playwright test tests/ResetPasswordNegative.spec.ts --headed
```

Payment negative scenarios:

```powershell
npx playwright test tests/PaymentNegative.spec.ts --headed
```

Overlay Strategists trial discovery:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts --headed
```

Overlay Strategists with-card trial checkout:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_WITH_CARD_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts -g "with card" --headed
```

Overlay Strategists without-card trial:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_WITHOUT_CARD_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts -g "without card" --headed
```

Overlay Strategists terms-required validation:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_TERMS_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts -g "terms acceptance" --headed
```

Overlay Strategists Stripe missing-card negative validation:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_STRIPE_NEGATIVE_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts -g "missing Stripe card" --headed
```

Run through npm script:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_WITH_CARD_ENABLED="true"
$env:OVERLAY_STRATEGISTS_WITHOUT_CARD_ENABLED="true"
$env:OVERLAY_STRATEGISTS_TERMS_ENABLED="true"
$env:OVERLAY_STRATEGISTS_STRIPE_NEGATIVE_ENABLED="true"
npm run test:controlled:stripe-overlay -- --headed
```

Stripe FRD matrix files now execute unique coverage keys instead of skip-only
AIR rows. They are included in the executable suite. Blocked/future rows still
skip. Billing-in-app and portal checks use the paid subscriber. Gated keys
follow the same flags as the linked specs:

```powershell
npm run test:executable -- --headed
npm run test:controlled:stripe-use-case-3-matrix -- --headed
npm run test:controlled:coverage-matrix -- --headed
```

Accessibility scenarios:

```powershell
npx playwright test tests/AccessibilityBrowser.spec.ts --headed
```

Session security scenarios:

```powershell
npx playwright test tests/SessionSecurity.spec.ts --headed
```

## Run Controlled Negative Suite

```powershell
npm run test:controlled
npm run report:execution
```

Controlled email flows:

```powershell
npm run test:controlled:email -- --headed
```

Controlled reset-password flows:

```powershell
npm run test:controlled:reset -- --headed
```

Controlled payment flows:

```powershell
npm run test:controlled:payment -- --headed
```

Controlled Stripe Checkout negative validation with a fresh checkout URL:

```powershell
$env:STRIPE_CHECKOUT_URL="https://checkout.stripe.com/c/pay/PASTE_FRESH_SESSION"
npm run test:controlled:payment -- --headed
```

This validates incomplete card, expired card, invalid CVC, and declined-card
behavior without activating a subscription.

Controlled onboarding fast field validation:

```powershell
$env:ONBOARDING_FIELD_VALIDATION_ENABLED="true"
npm run test:controlled:onboarding-fields -- --headed
```

Controlled onboarding fast field validation with a prepared onboarding user:

```powershell
$env:ONBOARDING_FIELD_VALIDATION_ENABLED="true"
$env:ONBOARDING_FIELD_VALIDATION_EXISTING_EMAIL="imhardikthanki+prepared-onboarding@gmail.com"
$env:ONBOARDING_FIELD_VALIDATION_EXISTING_PASSWORD="Test@123456"
$env:ONBOARDING_FIELD_VALIDATION_EXISTING_MOBILE="2015550123"
npm run test:controlled:onboarding-fields -- --headed
```

Controlled onboarding full field-level regression:

```powershell
$env:ONBOARDING_FIELD_VALIDATION_ENABLED="true"
$env:ONBOARDING_FIELD_VALIDATION_FULL_ENABLED="true"
npm run test:controlled:onboarding-fields -- --headed
```

Controlled Risk Profile and Compliance update-before-save validation:

```powershell
$env:ONBOARDING_FIELD_VALIDATION_ENABLED="true"
$env:ONBOARDING_FIELD_VALIDATION_FULL_ENABLED="true"
npm run test:controlled:onboarding-fields -- --headed -g "Risk Profile and Compliance selections can be updated before save"
```

Controlled authenticated Risk & Compliance validation:

```powershell
$env:RISK_COMPLIANCE_VALIDATION_ENABLED="true"
npm run test:controlled:risk-compliance -- --headed
```

Controlled authenticated Risk & Compliance update validation:

```powershell
$env:RISK_COMPLIANCE_VALIDATION_ENABLED="true"
$env:RISK_COMPLIANCE_UPDATE_ENABLED="true"
npm run test:controlled:risk-compliance -- --headed
```

Controlled plan-selection validation without Stripe:

```powershell
$env:PLAN_SELECTION_VALIDATION_ENABLED="true"
npm run test:controlled:plan-selection -- --headed
```

Controlled plan-selection validation with a prepared user:

```powershell
$env:PLAN_SELECTION_VALIDATION_ENABLED="true"
$env:PLAN_SELECTION_EXISTING_EMAIL="imhardikthanki+prepared-plan-selection@gmail.com"
$env:PLAN_SELECTION_EXISTING_PASSWORD="Test@123456"
$env:PLAN_SELECTION_EXISTING_MOBILE="2015550123"
npm run test:controlled:plan-selection -- --headed
```

Controlled profile mobile validation:

```powershell
$env:PROFILE_MOBILE_VALIDATION_ENABLED="true"
npm run test:controlled:profile-mobile -- --headed
```

Controlled Overlay Strategists trial flow:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
npm run test:controlled:stripe-overlay -- --headed
```

Controlled Overlay Strategists with-card checkout:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_WITH_CARD_ENABLED="true"
npm run test:controlled:stripe-overlay -- --headed -g "with card"
```

Controlled Overlay Strategists without-card trial:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_WITHOUT_CARD_ENABLED="true"
npm run test:controlled:stripe-overlay -- --headed -g "without card"
```

Controlled Overlay Strategists terms-required validation:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_TERMS_ENABLED="true"
npm run test:controlled:stripe-overlay -- --headed -g "terms acceptance"
```

Controlled Overlay Strategists Stripe missing-card negative validation:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_STRIPE_NEGATIVE_ENABLED="true"
npm run test:controlled:stripe-overlay -- --headed -g "missing Stripe card"
```

Controlled four-user plan ladder (inspect upgrades, monthly cancel copy, yearly cancel options, retention offer). This is included in `npm run executable:headed`. To run only this slice:

```powershell
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"
$env:SUB_LIFECYCLE_PLAN_LADDER_ENABLED="true"
npm run test:controlled:plan-ladder -- --headed
```

Optional destructive submits. Keep these off for `npm run executable:headed` / `npm run executable:headless` / run-all-executable:

```powershell
$env:SUB_LIFECYCLE_MONTHLY_CANCEL_SUBMIT_ENABLED="true"
$env:SUB_LIFECYCLE_YEARLY_CANCEL_EXPIRY_SUBMIT_ENABLED="true"
$env:SUB_LIFECYCLE_YEARLY_REFUND_SUBMIT_ENABLED="true"
$env:SUB_LIFECYCLE_RETENTION_ACCEPT_ENABLED="true"
$env:SUB_LIFECYCLE_DOWNGRADE_SUBMIT_ENABLED="true"
```

One new user: purchase Income Builder, then upgrade to each next plan and validate the calculation. Email verification is a manual step in the browser:

```powershell
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"
$env:SUB_LIFECYCLE_FREE_LADDER_ENABLED="true"
npx playwright test tests/SubscriptionLifecycleExecution.spec.ts -g "purchase each paid plan and upgrade" --headed
```

Yearly refund is its own disposable user:

```powershell
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"
$env:SUB_LIFECYCLE_YEARLY_REFUND_SUBMIT_ENABLED="true"
npx playwright test tests/SubscriptionLifecycleExecution.spec.ts -g "yearly cancel and refund" --headed
```

Overlay test users are generated with scenario-specific aliases, for example:

```text
imhardikthanki+overlay-without-card-<timestamp>@gmail.com
```

## Run MFA Tests

MFA tests are paused for known product issues unless explicitly enabled.

Set required MFA variables:

```powershell
$env:MFA_USER_FLOW_ENABLED="true"
$env:MFA_LOCAL_EMAIL="imhardikthanki+mfatest@gmail.com"
$env:MFA_LOCAL_PASSWORD="H@rdik9944"
$env:MFA_LOCAL_BACKUP_CODE="PASTE-NEW-CODE-HERE"
```

Run backup-code login test:

```powershell
npx playwright test tests/MfaUserFlow.spec.ts -g "Login using valid backup code" --headed
```

Run profile enable authenticator app flow:

```powershell
$env:MFA_USER_FLOW_ENABLED="true"
$env:MFA_LOCAL_EMAIL="imhardikthanki+mfatest@gmail.com"
$env:MFA_LOCAL_PASSWORD="H@rdik9944"
npx playwright test tests/MfaUserFlow.spec.ts -g "Local user enables MFA successfully" --headed
```

Run complete MFA lifecycle with one local user:

```powershell
$env:MFA_USER_FLOW_ENABLED="true"
$env:MFA_ALLOW_DESTRUCTIVE_USER_FLOW="true"
$env:MFA_MANUAL_OTP_FLOW_ENABLED="true"
$env:MFA_LOCAL_EMAIL="imhardikthanki+mfatest@gmail.com"
$env:MFA_LOCAL_PASSWORD="H@rdik9944"
npx playwright test tests/MfaUserFlow.spec.ts -g "Complete MFA lifecycle enable backup trusted revoke disable" --headed
```

Start this lifecycle with a user that has 2FA disabled. The test enables 2FA,
validates generated backup codes, logs in with a backup code, trusts the device,
revokes the trusted device, verifies MFA is required again, and disables 2FA at
the end.

Run regenerate backup codes and validate generated code format:

```powershell
$env:MFA_USER_FLOW_ENABLED="true"
$env:MFA_ALLOW_DESTRUCTIVE_USER_FLOW="true"
$env:MFA_LOCAL_EMAIL="imhardikthanki+mfatest@gmail.com"
$env:MFA_LOCAL_PASSWORD="H@rdik9944"
$env:MFA_LOCAL_TOTP_SECRET="PASTE_SECRET_HERE"
npx playwright test tests/MfaUserFlow.spec.ts -g "Regenerate backup codes for local user" --headed
```

Run disable 2FA from profile/security:

```powershell
$env:MFA_USER_FLOW_ENABLED="true"
$env:MFA_ALLOW_DESTRUCTIVE_USER_FLOW="true"
$env:MFA_LOCAL_EMAIL="imhardikthanki+mfatest@gmail.com"
$env:MFA_LOCAL_PASSWORD="H@rdik9944"
$env:MFA_LOCAL_TOTP_SECRET="PASTE_SECRET_HERE"
npx playwright test tests/MfaUserFlow.spec.ts -g "Disable MFA for local user" --headed
```

Run trusted-device validation:

```powershell
$env:MFA_USER_FLOW_ENABLED="true"
$env:MFA_LOCAL_EMAIL="imhardikthanki+mfatest@gmail.com"
$env:MFA_LOCAL_PASSWORD="H@rdik9944"
$env:MFA_LOCAL_TOTP_SECRET="PASTE_SECRET_HERE"
npx playwright test tests/MfaUserFlow.spec.ts -g "Remember this device skips OTP" --headed
```

Run trusted-device revoke/delete validation:

```powershell
$env:MFA_USER_FLOW_ENABLED="true"
$env:MFA_ALLOW_DESTRUCTIVE_USER_FLOW="true"
$env:MFA_LOCAL_EMAIL="imhardikthanki+mfatest@gmail.com"
$env:MFA_LOCAL_PASSWORD="H@rdik9944"
$env:MFA_LOCAL_TOTP_SECRET="PASTE_SECRET_HERE"
npx playwright test tests/MfaUserFlow.spec.ts -g "Revoking trusted device requires MFA again" --headed
```

Run MFA user flow file:

```powershell
npx playwright test tests/MfaUserFlow.spec.ts --headed
```

Run configured MFA suite:

```powershell
npm run test:controlled:mfa -- --headed
```

TOTP-based tests need:

```powershell
$env:MFA_LOCAL_TOTP_SECRET="PASTE_SECRET_HERE"
```

If `MFA_LOCAL_TOTP_SECRET` is not configured, TOTP and remember-device tests should skip.

## Manual MFA Fallback

Use this when tester needs to enter OTP manually in browser:

```powershell
$env:MFA_USER_FLOW_ENABLED="true"
$env:MFA_LOCAL_EMAIL="imhardikthanki+mfatest@gmail.com"
$env:MFA_LOCAL_PASSWORD="H@rdik9944"
npx playwright test tests/MfaUserFlow.spec.ts -g "Manual" --headed
```

## Typecheck

```powershell
npm run typecheck
```

## Export PDF Report

Generate AIR HTML report and PDF:

```powershell
npm run report:execution:pdf
```

Generate PDF from the current AIR report:

```powershell
npm run report:pdf
```

## Common Full Validation Flow

Recommended before sharing a report:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-safe-batched-tests.ps1 -Headed
npm run typecheck
start execution-report\index.html
```

## Useful Report Files

AIR execution report:

```text
execution-report\index.html
```

AIR normalized model:

```text
execution-report\air-results.json
```

Playwright HTML report:

```text
playwright-report\index.html
```

Test results and artifacts:

```text
test-results\
```

## Notes

- Use `--headed` when you want to watch the browser.
- Use headless mode when running faster local checks.
- Run `npm run report:execution` after tests to refresh AIR.
- Backup codes are single-use. Always paste a fresh backup code before running backup-code MFA tests.
- If an account is locked, run the unlock account flow before normal login tests.
