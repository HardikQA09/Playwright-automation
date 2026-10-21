# Subscription And Stripe Coverage Matrix

This matrix maps the Subscription Management FRD to automation status.
`OOLTool_Subscription_FRD_Detailed (1).docx` is the source of truth for
subscription coverage. Browser-safe validations are automated first; lifecycle
validations that require Stripe/admin state, billing time travel, scheduler
jobs, broker fixtures, or audit-log access remain documented until those
controls are available.

## Current Inputs

- Source of truth FRD: `OOLTool_Subscription_FRD_Detailed (1).docx`
- Supporting test plan: `Test Plan_stripe.docx`
- Supporting test matrix: pasted Subscription Management test cases
- Dedicated fixture plan: `docs/SUBSCRIPTION_TEST_FIXTURES.md`
- Environment: UAT Stripe test mode
- User strategy: create a new user for every safe trial/purchase run
- Email validation: manual or deferred until mailbox automation is confirmed
- Stripe/Admin dashboard access: not available

## Source Authority

The FRD owns the subscription lifecycle rules. If a manual observation, pasted
test matrix, or current product behavior conflicts with the FRD, the FRD should
be treated as the expected requirement until the business approves a documented
requirement change.

Key FRD rules currently driving coverage:

- Trial is available once per user lifetime.
- Overlay Strategists trial duration is 30 days.
- The no-card trial uses the limits printed on the Overlay Strategists card:
  Account Linked (10) and Positions (500).
- The same email or mobile number cannot open a second account, so it cannot
  start another trial. A subscription confirmation email is read from Gmail.
  Billing history is the trial record this suite can open.
- With-card trial provides full Overlay Strategists access and converts to
  paid Overlay Strategists monthly billing after expiry.
- Users may subscribe to any paid plan during trial; the selected plan becomes
  active immediately and starts a new billing cycle.
- Upgrades are immediate and use Stripe proration.
- Downgrades become effective on the next renewal date.
- Monthly to annual billing change is immediate.
- Annual to monthly billing change is effective on the next renewal date.
- Refunds are manual and admin-approved only.

## Automation Status Legend

| Status | Meaning |
| --- | --- |
| Ready | Can be automated with current UI and test data |
| Started | Initial automation added, may need selector confirmation |
| Blocked | Needs admin, Stripe, database, scheduler, broker, or time-control access |
| Manual | Better handled as manual validation until access is available |
| Future | Valid scenario, but not part of the first automation slice |

## Full FRD Coverage By Use Case

| Use Case | Scenario Range | Current Automation | Status | Dependency For Full Coverage |
| --- | --- | --- | --- | --- |
| Overlay Strategists Trial Experience | SC 1-36 | Trial availability, with-card checkout, Stripe checkout details, declined-card authorization failure, without-card trial, terms guardrail, missing-card validation, paid-subscriber eligibility guard | Started | Email handoff, Stripe/admin validation, scheduler/time travel, broker fixtures |
| New Subscription Purchase | SC 36-75 | Income Builder purchase through onboarding, paid-plan selection switching, paid-plan entitlement presentation, Stripe successful checkout, multi-plan checkout-summary validation, checkout refresh/back safety before payment, currency/conversion-fee presentation, invoice/PDF evidence, and controlled checkout-negative validation | Started | Dedicated plan fixtures, Stripe ledger/API, duplicate checkout session visibility |
| Upgrade Subscription | SC 76-112 | Full matrix documented in AIR; safe plan lifecycle action/status summary is detected without changing subscription | Started | Dedicated lower-tier paid account, Stripe checkout/payment fixture, proration visibility |
| Downgrade Subscription | SC 113-164 | Full matrix documented in AIR; safe plan lifecycle action/status summary is detected without changing subscription | Started | Dedicated higher-tier paid account, downgrade confirmation UI, data-limit fixture |
| Monthly To Annual Billing Change | SC 165-200 | Full matrix documented in AIR; monthly/annual plan toggle, paid-plan pricing, and billing interval presentation are validated without changing subscription | Started | Dedicated monthly paid account, Stripe proration checkout, invoice validation |
| Annual To Monthly Billing Change | SC 201-240 | Full matrix documented in AIR; annual/monthly plan presentation, paid-plan pricing, and interval-change expectations are traceable without changing subscription | Started | Dedicated annual paid account, scheduled-change UI, renewal-date fixture |
| Subscription Cancellation | SC 241-300 | Full matrix documented in AIR; Stripe portal cancellation form, reason, feedback, cancellation lifecycle state, and already-scheduled state are validated without final cancellation | Started | Dedicated cancellable account, destructive cancellation approval, refund/admin workflow |
| Failed Payment And Dunning Management | SC 301-352 | Full matrix documented in AIR; checkout payment failures, authentication-required checkout context, and Stripe portal payment-recovery entry points are validated without saving payment changes | Started | Stripe dunning configuration, failed renewal fixture, scheduler/webhook/admin access |

## Automation Boundary

The current automation can safely validate browser behavior, page content,
checkout validation, portal access, invoices, and non-destructive forms. It
should not validate final cancellation, real upgrade/downgrade submission, trial
expiry, retry schedules, refunds, audit logs, or data deletion until dedicated
test accounts and backend controls are available.

## End-to-End Subscription Lifecycle Coverage

The high-level lifecycle is now captured in
`tests/SubscriptionLifecycleE2EMatrix.spec.ts`. This matrix ties the detailed
FRD use cases together into one client-readable journey:

1. New user completes onboarding prerequisites and reaches plan selection.
2. Overlay Strategists trial is offered with both without-card and with-card
   paths.
3. Without-card trial redirects to the product and should move to Free after
   expiry.
4. With-card trial reaches Stripe Checkout and should auto-renew after expiry.
5. Paid plan subscription paths remain covered across plan selection, Stripe
   checkout, billing overview, and invoice evidence.
6. Upgrade and billing-cycle-change rules are documented with blocked Stripe
   proration dependencies.
7. Downgrade, cancel-at-period-end, immediate cancellation, and refund rules are
   documented with explicit destructive-test dependencies.
8. Renewal, dunning, audit, and AIR reporting coverage gaps remain visible in
   AIR until backend/admin validation support exists.

This lifecycle matrix does not replace the detailed Use Case 1-8 matrices. It
gives AIR one end-to-end view of what is validated now and what is blocked by
external billing, scheduler, refund, or audit dependencies.

## AIR Traceability Matrix Files

`npm run executable:headed`, `npm run executable:headless`, and
`npm run test:executable` include the nine Stripe FRD matrix specs. Automated
rows run unique coverage keys once per process. `UserJourneyCoverageMatrix`
stays skip-only AIR and is not part of the executable suite.

| Area | File | Rows |
| --- | --- | --- |
| User journey coverage | `tests/UserJourneyCoverageMatrix.spec.ts` | 63 |
| Use Case 1 - Overlay Strategists Trial | `tests/OverlayStrategistsTrialMatrix.spec.ts` | 36 |
| Use Case 2 - New Subscription Purchase | `tests/NewSubscriptionPurchaseMatrix.spec.ts` | 52 |
| Use Case 3 - Upgrade Subscription | `tests/UpgradeSubscriptionMatrix.spec.ts` | 37 |
| Use Case 4 - Downgrade Subscription | `tests/DowngradeSubscriptionMatrix.spec.ts` | 52 |
| Use Case 5 - Monthly To Annual Billing Change | `tests/MonthlyAnnualBillingChangeMatrix.spec.ts` | 36 |
| Use Case 6 - Annual To Monthly Billing Change | `tests/AnnualMonthlyBillingChangeMatrix.spec.ts` | 40 |
| Use Case 7 - Subscription Cancellation | `tests/SubscriptionCancellationMatrix.spec.ts` | 60 |
| Use Case 8 - Failed Payment And Dunning | `tests/FailedPaymentDunningMatrix.spec.ts` | 52 |
| End-to-End Subscription Lifecycle | `tests/SubscriptionLifecycleE2EMatrix.spec.ts` | 45 |

Total documented matrix coverage: 473 rows.

Automated Stripe matrix rows share coverage keys from
`tests/helpers/stripeMatrixExecution.ts`. The first row for a key runs the UI;
later rows reuse that result in the same Playwright process.

| Coverage key | What it executes | Gate |
| --- | --- | --- |
| `billing-inapp` | Billing overview, plans, history, invoices, trial CTA | Paid subscriber login |
| `billing-portal` | Stripe portal overview, invoices, cancel form, recovery | `BILLING_SUBSCRIPTION_MANAGEMENT_ENABLED` for cancel/recovery extras |
| `plan-catalog` | Onboarding plan catalog, pricing toggle, trial terms | `PLAN_SELECTION_VALIDATION_ENABLED` or prepared plan-selection user |
| `direct-checkout` | Income Builder checkout summary, currency, refresh/back; no payment | `DIRECT_SUBSCRIPTION_PURCHASE_ENABLED` |
| `overlay-without-card` | Start Overlay Strategists trial without card | `OVERLAY_STRATEGISTS_FLOW_ENABLED` and `OVERLAY_STRATEGISTS_WITHOUT_CARD_ENABLED` |
| `overlay-with-card-checkout` | With-card trial checkout details; declined card when that flag is on; no successful payment | Overlay flow plus checkout-details, with-card, or declined-card flag |
| `upgrade-preview` | Upgrade calculation preview, then close | `SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED` and `SUB_LIFECYCLE_UPGRADE_PREVIEW_ENABLED` |
| `downgrade-preview` | Downgrade calculation preview, then close | `SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED` and `SUB_LIFECYCLE_DOWNGRADE_PREVIEW_ENABLED` |
| `interval-preview` | Billing-interval calculation preview, then close | `SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED` and `SUB_LIFECYCLE_INTERVAL_PREVIEW_ENABLED` |
| `payment-negative` | Stripe Checkout card-field guardrails | `STRIPE_CHECKOUT_URL` |

## Use Case 1 - Overlay Strategists Trial Experience

Full traceability for all 36 Use Case 1 automation rows is captured in
`tests/OverlayStrategistsTrialMatrix.spec.ts`. That matrix spec lists every
FRD case as a Playwright test title and marks blocked/future scenarios with the
exact dev/admin dependency. Browser-executable scenarios remain in
`OverlayStrategistsTrial.spec.ts`, `PlanSelectionValidation.spec.ts`, and
`BillingSubscriptionManagement.spec.ts`.

| SC | Scenario | Priority | Automation Status | Blocker / Dependency | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Start trial without payment details | Critical | Started | Manual email verification | Controlled without-card activation test validates dashboard redirect and Overlay Strategists in Billing |
| 2 | Trial is displayed as available | High | Started | Manual email verification | `OverlayStrategistsTrial.spec.ts` validates both with-card and without-card trial CTAs after email/mobile onboarding prerequisites. `PlanSelectionValidation.spec.ts` validates both customer-facing lifecycle messages |
| 3 | Broker account limit is one | Critical | Known Bug | Product fix required | Confirmed issue: manual entry is currently counted as broker integration. Expected behavior is that manual entry should not consume broker integration limit |
| 4 | No-card trial linked-account limit requires confirmation | Critical | Blocked | Business clarification and broker linked account data | FRD says no-card trial has 5 linked accounts, but paid Overlay Strategists UI displays Account Linked (10). Confirm whether no-card trial should remain reduced at 5 or match paid-plan limit of 10 before automating enforcement |
| 5 | No-card trial portfolio position limit is 100 | Critical | Blocked | Portfolio import/API seed fixture | FRD expected limit is 100 positions for no-card trial. Enforcement needs a safe portfolio import/API seed fixture |
| 6 | Premium Overlay Strategists features available | High | Started | Runtime entitlement checks need feature-specific pages | Plan-selection validation confirms the Overlay Strategists premium benefit and limit summary is displayed before trial activation |
| 7 | Start trial with valid card | Critical | Started | Fresh user plus unique Stripe test card | QA-CL-005: trial grants Overlay Strategists (`trialing`), not Free. Do not use Stripe test card `4242` for this path; that fingerprint is already_redeemed and bounces to Plan Selection / Free. Follow-up: clear 4242 reuse in Stripe. Automation rotates unused country test cards per user. `/verify-mobile?trial=success` means the trial succeeded. |
| 7A | Authorization failure handling | Critical | Started | Manual email verification and Stripe test checkout | Declined-card authorization failure is automated behind `OVERLAY_STRATEGISTS_DECLINED_CARD_ENABLED`; trial is not activated and Stripe displays a failure message |
| 8 | No subscription charge during trial | Critical | Blocked | Stripe/Admin access | Cannot verify payment ledger without Stripe/API access |
| 9 | Card information securely saved | High | Started | Stripe/API validation still needed | QA-CL-005: with-card trial persists a Stripe subscription. UI Billing should show payment-method evidence. Remaining gap is Stripe/API confirmation of the stored fingerprint. |
| 10 | Existing paid subscriber cannot start trial | Critical | Started | Existing paid account fixture | Billing plans validation confirms paid subscriber is not offered the Overlay Strategists trial CTA |
| 11 | Same verified email cannot receive another trial | Critical | Blocked | Repeat-trial fixture | Business rule confirmed: free trial is allowed only once for a verified email identity. Needs deterministic previously-used trial account |
| 12 | Same verified mobile number cannot receive another trial | Critical | Blocked | Repeat phone fixture | Business rule confirmed: free trial is allowed only once for a verified mobile identity. Needs safe repeat-phone trial fixture |
| 13 | Same payment method cannot receive another trial | Critical | Started | Unique card per user; silent UI reason still dropped | QA-CL-005: `offer_verify_failed` reason `already_redeemed` is the once-per-lifetime card fingerprint gate. Reusing `4242` across users refuses the trial and bounces to Plan Selection without a message. Automation uses a unique test card per fresh user. |
| 14 | Trial lasts exactly 30 days | Critical | Blocked | Time travel/scheduler/admin controls | Cannot wait 30 real days in automation |
| 15 | Day 25 reminder no-card | Medium | Blocked | Scheduler/time control and email access | Manual until scheduler hooks exist |
| 16 | Day 28 reminder no-card | Medium | Blocked | Scheduler/time control and email access | Manual until scheduler hooks exist |
| 17 | Day 29 final reminder no-card | Medium | Blocked | Scheduler/time control and email access | Manual until scheduler hooks exist |
| 18 | Day 29 reminder with card | Medium | Blocked | Scheduler/time control and email access | Manual until scheduler hooks exist |
| 19 | No-card trial downgrades to Free | Critical | Blocked | Trial expiry/time control | UI message is automated: without-card trial moves to Free plan after expiry. Actual expiry transition needs admin/API time control |
| 20 | Broker integrations disconnected after expiry | Critical | Blocked | Trial expiry + broker data | Needs broker fixture and scheduler |
| 21 | Imported positions deleted after expiry | Critical | Blocked | Trial expiry + portfolio fixture | Needs data seed and DB/admin validation |
| 22 | Premium features unavailable after expiry | Critical | Blocked | Trial expiry/time control | Needs expired trial fixture |
| 23 | Subscribe prompt after expiry | Medium | Blocked | Trial expiry/time control | Needs expired trial fixture |
| 24 | With-card trial converts to paid | Critical | Blocked | Trial expiry + Stripe validation | UI message is automated: with-card trial auto-renews after trial unless cancelled. Actual conversion needs scheduler and Stripe/API access |
| 25 | Billing starts automatically | Critical | Blocked | Stripe/Admin access | Needs Stripe/API validation |
| 26 | Upgrade before trial ends | Critical | Future | Active trial fixture | Business rule confirmed: user can upgrade any time. Automate after active trial fixture and controlled plan-change path are available |
| 27 | Billing cycle resets after upgrade | High | Blocked | Stripe/Admin access | Needs billing date validation source |
| 28 | Failed payment enters grace period | Critical | Blocked | Trial expiry + declined card at renewal | Declined-card authorization is covered during checkout; renewal grace-period validation still needs scheduler and Stripe test control |
| 29 | Failed billing reminder | High | Blocked | Email/in-app notification access | Needs notification validation strategy |
| 30 | Cannot remove only payment method during trial | Medium | Future | Active card-trial fixture | Needs payment method management UI |
| 31 | Terms must be accepted | Critical | Started | Manual email verification | Controlled terms-required validation added behind `OVERLAY_STRATEGISTS_TERMS_ENABLED` |
| 32 | Communication preference selection | Low | Future | Confirm UI placement | Low priority |
| 33 | Trial activation audit log | Medium | Blocked | Admin/audit access | Needs admin/API/DB validation |
| 34 | Trial conversion audit log | Medium | Blocked | Admin/audit access | Needs admin/API/DB validation |
| 35 | Reminder analytics tracked | Low | Blocked | Analytics/admin access | Needs analytics validation source |

## Use Case 2 - New Subscription Purchase

| SC | Scenario Group | Automation Status | Current Coverage | Gap / Dependency |
| --- | --- | --- | --- | --- |
| 36-40 | New paid subscription purchase | Started | `onboarding.spec.ts` completes Income Builder Stripe checkout; `DirectSubscriptionPurchase.spec.ts` opens direct paid-plan checkout summaries before payment across Income Builder and Portfolio Hedger monthly/annual combinations; Overlay Strategists trial checkout is covered under Use Case 1; `SubscriptionLifecycleExecution.spec.ts` has gated Overlay Strategists and Portfolio Hedger monthly completions plus an optional annual paid purchase | Stripe ledger/API and duplicate checkout session visibility |
| 41-44 | Purchase entry points | Started | Onboarding plan-selection entry point and safe plan switching are covered before checkout | Pricing, expired-trial upgrade prompt, and deeper settings entry points need selectors/fixtures |
| 45-49 | Subscription summary before payment | Started | Stripe checkout loads selected plan/payment page, validates selected plan/email/billing copy/card fields across direct paid monthly/annual combinations, currency/conversion-fee copy, plan-selection billing toggle, paid-plan pricing across billing periods, and paid-plan entitlement limits before checkout | Exact renewal/auto-renew summary needs stable Stripe copy expectations |
| 50-51 | Terms acceptance | Started | Overlay trial terms guardrail is automated | Paid plan terms guardrail needs confirmation if separate modal exists |
| 52-56 | Successful payment activation and invoice | Started | Checkout success, dashboard redirect, billing invoice/PDF links, and portal invoice history are automated | Email receipt needs mailbox strategy |
| 57-62 | Payment failure and retry | Started | Checkout-negative validation is automated with `PaymentNegative.spec.ts` for incomplete card data, declined card, insufficient funds, processing error, stolen-card decline, and authentication-required checkout context | Retry from same/different method needs a fresh checkout recovery fixture |
| 63-66 | Auto-renew and reminders | Blocked | Portal can show current subscription details | Renewal reminders require scheduler/time travel/email validation |
| 67-72 | Cancellation/audit logging | Started | Non-destructive portal cancellation form/state is automated | Final cancellation and audit logging require controlled admin access |
| 73-75 | Duplicate/expired checkout protection | Started | Missing-card, declined-card, checkout refresh, and browser-back safety validation exist | Duplicate checkout/session expiry need backend/session observability |

## Use Cases 3-8 - Lifecycle Coverage Strategy

### Use Case 3 - Upgrade Subscription Business Rule

Confirmed behavior:

- User can upgrade to any plan at any time while subscription access is active.
- On upgrade, a new billing cycle starts.
- User pays the prorated amount at upgrade time.
- Final validation of prorated invoice amount and billing-cycle anchor requires
  Stripe API/admin visibility or a deterministic Stripe fixture.

| Use Case | Browser-Safe Tests To Add Next | Blocked Until |
| --- | --- | --- |
| Upgrade Subscription | Matrix completed; current coverage validates plan lifecycle action/status summary, monthly/annual in-app upgrade calculation previews including target price, unused-time credit, amount due, recurring price, controlled one-time upgrade submission after terms acceptance, cancel-before-submit in upgrade preview, and a gated four-user plan ladder that asserts amount due today, unused credit, recurring amount, and renewal date on each upgrade | Stripe API/billing-cycle visibility for exact invoice/proration reconciliation |
| Downgrade Subscription | Matrix completed; executable slice validates downgrade calculation preview, terms required, cancel-before-submit, and gated monthly retention inspect/accept/schedule-downgrade | Dedicated higher-tier accounts, data-limit fixtures, and scheduled-downgrade effective-date validation |
| Monthly To Annual | Matrix completed; executable slice opens interval preview, validates yearly amount, UI proration, next billing date, and close without confirm | Dedicated monthly accounts for preview; Stripe proration/API for submitted interval change |
| Annual To Monthly | Matrix completed; executable slice reuses interval preview with `SUB_LIFECYCLE_INTERVAL_TO=monthly` | Dedicated annual accounts and renewal-date fixtures for submitted change |
| Subscription Cancellation | Matrix completed; safe portal form and cancellation lifecycle-state validation exists; gated monthly period-end cancel, yearly cancel-at-expiry, and yearly refund submits stay behind extra flags | Dedicated destructive cancellation account and refund/admin workflow |
| Dunning Management | Matrix completed; checkout negatives, authentication-required checkout context, and payment-recovery portal entry points exist; renewal/dunning remains blocked | Stripe dunning test fixture, webhook/scheduler/admin controls |

## First Automation Slice

1. Validate Overlay Strategists trial option is shown to a newly onboarded user.
2. Confirm the trial CTA and terms UI from a headed run.
3. Add no-card trial activation once the CTA selectors are confirmed.
4. Add terms-required negative validation.
5. Add with-card trial validation by reusing `StripePaymentPage`.
6. Add Stripe checkout details validation for Overlay Strategists with-card checkout.
7. Add Stripe missing-card validation for Overlay Strategists with-card checkout.
8. Add declined-card authorization failure validation for Overlay Strategists with-card checkout.
9. Add paid-subscriber trial eligibility guardrail validation.

## Current Command

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts --headed
```

Run the with-card trial checkout:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_WITH_CARD_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts -g "with card" --headed
$env:AIR_ALLOW_STALE_REPORT="true"
npm run report:execution
```

Run the Use Case 1 traceability matrix:

```powershell
npm run test:controlled:stripe-use-case-1-matrix
$env:AIR_REPORT_SCOPE="latest"
npm run report:execution
```

Run all AIR coverage matrix rows:

```powershell
npm run test:controlled:coverage-matrix
$env:AIR_REPORT_SCOPE="latest"
npm run report:execution
```

Run only the end-to-end subscription lifecycle matrix:

```powershell
npm run test:controlled:subscription-lifecycle-matrix
$env:AIR_REPORT_SCOPE="latest"
npm run report:execution
```

Run controlled end-to-end lifecycle execution slices:

```powershell
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"

# Enable only the slice you want to execute:
$env:SUB_LIFECYCLE_TRIAL_WITHOUT_CARD_ENABLED="true"
$env:SUB_LIFECYCLE_TRIAL_WITH_CARD_ENABLED="true"
$env:SUB_LIFECYCLE_INCOME_MONTHLY_ENABLED="true"
$env:SUB_LIFECYCLE_PLAN_CONTROLS_ENABLED="true"
$env:SUB_LIFECYCLE_UPGRADE_PREVIEW_ENABLED="true"
$env:SUB_LIFECYCLE_UPGRADE_SUBMIT_ENABLED="false"
$env:SUB_LIFECYCLE_DOWNGRADE_PREVIEW_ENABLED="true"
$env:SUB_LIFECYCLE_INTERVAL_PREVIEW_ENABLED="true"
$env:SUB_LIFECYCLE_CANCEL_FORM_ENABLED="true"
$env:SUB_LIFECYCLE_PLAN_LADDER_ENABLED="true"
$env:SUB_LIFECYCLE_MONTHLY_CANCEL_SUBMIT_ENABLED="false"
$env:SUB_LIFECYCLE_YEARLY_CANCEL_EXPIRY_SUBMIT_ENABLED="false"
$env:SUB_LIFECYCLE_YEARLY_REFUND_SUBMIT_ENABLED="false"
$env:SUB_LIFECYCLE_RETENTION_ACCEPT_ENABLED="false"
$env:SUB_LIFECYCLE_DOWNGRADE_SUBMIT_ENABLED="false"

# Prepared paid-user slices need:
$env:SUB_LIFECYCLE_PAID_EMAIL="imhardikthanki+sub-income-monthly@gmail.com"
$env:SUB_LIFECYCLE_PAID_PASSWORD="PASTE_TEST_PASSWORD"
$env:SUB_LIFECYCLE_UPGRADE_TARGET_PLAN="Portfolio Hedger"
$env:SUB_LIFECYCLE_UPGRADE_INTERVALS="monthly,annual"
$env:SUB_LIFECYCLE_SUBMIT_UPGRADE_TARGET_PLAN="Overlay Strategists"
$env:SUB_LIFECYCLE_SUBMIT_UPGRADE_INTERVAL="monthly"
$env:SUB_LIFECYCLE_DOWNGRADE_TARGET_PLAN="Income Builder"
$env:SUB_LIFECYCLE_INTERVAL_TARGET_PLAN="Income Builder"
$env:SUB_LIFECYCLE_INTERVAL_TO="annual"

npm run test:controlled:subscription-lifecycle-execution -- --headed
$env:AIR_REPORT_SCOPE="latest"
npm run report:execution
```

Enable one lifecycle slice at a time when creating disposable users. Do not run
with-card, paid purchase, or cancellation-form flows against shared accounts.

Run the without-card trial:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_WITHOUT_CARD_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts -g "without card" --headed
$env:AIR_ALLOW_STALE_REPORT="true"
npm run report:execution
```

Run the with-card missing-card negative validation:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_STRIPE_NEGATIVE_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts -g "missing Stripe card" --headed
$env:AIR_ALLOW_STALE_REPORT="true"
npm run report:execution
```

Run the with-card checkout details validation without submitting payment:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_STRIPE_CHECKOUT_DETAILS_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts -g "Stripe checkout with trial details" --headed
$env:AIR_ALLOW_STALE_REPORT="true"
npm run report:execution
```

Run the with-card declined-card authorization failure validation:

```powershell
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_DECLINED_CARD_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts -g "declined Stripe card" --headed
$env:AIR_ALLOW_STALE_REPORT="true"
npm run report:execution
```

Run generic Stripe Checkout negative validation with a fresh checkout URL:

```powershell
$env:STRIPE_CHECKOUT_URL="https://checkout.stripe.com/c/pay/PASTE_FRESH_SESSION"
npx playwright test tests/PaymentNegative.spec.ts --headed
$env:AIR_REPORT_SCOPE="latest"
npm run report:execution
```

Run direct subscription checkout-summary validation without submitting payment:

```powershell
$env:DIRECT_SUBSCRIPTION_PURCHASE_ENABLED="true"
npm run test:controlled:direct-subscription -- --headed
$env:AIR_REPORT_SCOPE="latest"
npm run report:execution
```

Run subscription portal validations with a prepared paid account:

```powershell
$env:BILLING_SUBSCRIPTION_MANAGEMENT_ENABLED="true"
$env:BILLING_MANAGEMENT_EMAIL="imhardikthanki+completejourney@gmail.com"
$env:BILLING_MANAGEMENT_PASSWORD="H@rdik9944"
npm run test:controlled:billing-management -- --headed
$env:AIR_REPORT_SCOPE="latest"
npm run report:execution
```

Optional stricter portal expectations:

```powershell
$env:BILLING_EXPECTED_PLAN="3-Advanced"
$env:BILLING_EXPECTED_FREQUENCY="per year"
$env:BILLING_EXPECTED_CARD_LAST4="4242"
```

The test is intentionally skipped unless `OVERLAY_STRATEGISTS_FLOW_ENABLED` is
enabled, so the stable suite remains unchanged.
