# Subscription Test Fixture Users

## Daily reusable roster (remember these)

Source of truth: [`tests/config/preparedSubscriptionUsers.data.json`](../tests/config/preparedSubscriptionUsers.data.json)

```powershell
npm run fixtures:list
npm run fixtures:list -- --canonical   # target +sub-* emails
npm run fixtures:apply-env             # print $env: lines for this session
```

| Key | Canonical email (easy to spot) | Legacy (until canonical ready) | Daily use |
| --- | --- | --- | --- |
| `UPGRADE_CALC_DAILY` | `+sub-upg-calc-daily` | `+plantest` | Upgrade / due / renewal-date preview |
| `DOWNGRADE_CALC_DAILY` | `+sub-dng-calc-daily` | `+plantest` | Downgrade + schedule-at-renewal preview |
| `INTERVAL_CALC_DAILY` | `+sub-int-calc-daily` | `+plantest` | Monthly↔annual interval preview |
| `CANCEL_MONTHLY_INSPECT` | `+sub-cx-mo-inspect` | `+monthly-to-a-mvjn15yr` | Monthly cancel / period-end copy |
| `CANCEL_YEARLY_INSPECT` | `+sub-cx-yr-inspect` | `+e2e` | Yearly cancel-at-expiry vs refund options |
| `RETENTION_INSPECT` | `+sub-retention-inspect` | `+plantest` | Retention offer inspect (decline/close) |
| `BILLING_PORTAL` | `+sub-billing-portal` | `+plantest` | Portal / payment method / invoices |
| `CANCEL_SCHEDULED` | `+sub-cancel-scheduled` | *(prepare)* | Already cancel-at-period-end state |
| `RENEWAL_READY` | `+sub-renewal-ready` | *(prepare)* | Near-renewal / auto-renew evidence |
| `PAST_DUE_DUNNING` | `+sub-past-due` | *(prepare)* | Dunning / payment recovery |
| `EXPIRED_TRIAL_NO_CARD` | `+sub-expired-no-card` | *(prepare)* | Trial expiry → Free |
| `PLAN_SELECTION` | `+sub-plan-ready` | `+plan-selection-prepared` | Catalog / trial CTA |

Each key has its **own** env vars (`SUB_FIXTURE_*` / `SUB_LIFECYCLE_*_CANCEL_*`) so renew, downgrade, and cancel do not share one plantest session.

Until those canonical accounts exist on UAT, runners keep using the **legacy** emails listed in the JSON (`plantest`, `e2e`, `monthly-to-a-mvjn15yr`, `plan-selection-prepared`). After you prepare each `+sub-*` account:

```powershell
$env:SUB_FIXTURE_USE_CANONICAL_EMAILS="true"
$env:SUBSCRIPTION_FIXTURE_PASSWORD="YourSharedPassword"
npm run fixtures:apply-env
```

**Email delivery:** every `+sub-*` alias lands in the same Gmail inbox — IMAP checks do not need a separate mailbox per scenario.

**Daily upgrade calculation (same account):**

```powershell
npm run fixtures:apply-env
npm run test:controlled:subscription-lifecycle-execution -- -g "upgrade"
# or: npm run fixtures:daily-upgrade
```

Destructive keys (`UPGRADE_SUBMIT`, `REFUND_SUBMIT`) are separate throwaways — never point daily preview at them.

## Purpose

This document defines the dedicated subscription users needed to safely expand
Stripe and subscription lifecycle automation.

The goal is to maximize coverage while avoiding accidental mutation of shared
accounts. Each fixture user should represent one known billing state and should
be used only for the scenarios assigned to that state.

## Naming Convention

Use scenario-specific Gmail aliases. Include the source use case or scenario ID
when it is available from the test-case file.

```text
imhardikthanki+sub-<use-case>-<scenario-name>@gmail.com
imhardikthanki+sub-<scenario-id>-<scenario-name>@gmail.com
```

Examples:

```text
imhardikthanki+sub-plan-ready@gmail.com
imhardikthanki+sub-income-monthly@gmail.com
imhardikthanki+sub-overlay-trial-card@gmail.com
imhardikthanki+sub-sc-007-trial-with-card@gmail.com
imhardikthanki+sub-uc3-upgrade-preview@gmail.com
```

Disposable users created by automation should keep the timestamp suffix added by
`generateEmail(scenarioTag)` so repeated runs never collide:

```text
imhardikthanki+sub-sc-007-trial-with-card-1783421974329@gmail.com
```

Reusable fixture users should not use a timestamp because they represent a known
billing state that may be used again later.

Do not hardcode passwords in test files. Store fixture credentials in local
environment variables only.

## Fixture Strategy

| Fixture Key | Suggested Email | Required State | Used For | Safe By Default |
| --- | --- | --- | --- | --- |
| `PLAN_SELECTION_READY` | `imhardikthanki+sub-plan-ready@gmail.com` | Email/mobile verified, Risk Profile complete, Compliance complete, waiting on Choose Your Plan | Plan catalog, pricing, trial CTA, complete-setup guardrails | Yes |
| `TRIAL_NO_CARD_ACTIVE` | `imhardikthanki+sub-trial-no-card@gmail.com` | Overlay Strategists trial active without card | No-card trial billing state, plan access, trial messaging | Yes |
| `TRIAL_WITH_CARD_ACTIVE` | `imhardikthanki+sub-trial-card@gmail.com` | Overlay Strategists trial active with saved Stripe test card | Card-backed trial, auto-renew messaging, payment-method display | Yes, read-only |
| `TRIAL_USED_EMAIL` | `imhardikthanki+sub-trial-used-email@gmail.com` | User has already consumed Overlay Strategists trial | Trial once-per-email validation | Yes |
| `TRIAL_USED_MOBILE` | `imhardikthanki+sub-trial-used-mobile@gmail.com` | User has already consumed trial with a known mobile number | Trial once-per-mobile validation | Yes |
| `INCOME_MONTHLY_ACTIVE` | `imhardikthanki+sub-income-monthly@gmail.com` | Income Builder monthly subscription active | Upgrade from lower tier, billing overview, invoice history | Yes, read-only |
| `INCOME_ANNUAL_ACTIVE` | `imhardikthanki+sub-income-annual@gmail.com` | Income Builder annual subscription active | Annual-to-monthly change, billing interval presentation | Yes, read-only |
| `OVERLAY_MONTHLY_ACTIVE` | `imhardikthanki+sub-overlay-monthly@gmail.com` | Overlay Strategists monthly subscription active | Upgrade/downgrade rules and billing portal validation | Yes, read-only |
| `OVERLAY_ANNUAL_ACTIVE` | `imhardikthanki+sub-overlay-annual@gmail.com` | Overlay Strategists annual subscription active | Annual interval behavior and downgrade scheduling | Yes, read-only |
| `PORTFOLIO_MONTHLY_ACTIVE` | `imhardikthanki+sub-portfolio-monthly@gmail.com` | Portfolio Hedger monthly subscription active | Downgrade to a lower plan | Yes, read-only |
| `PORTFOLIO_ANNUAL_ACTIVE` | `imhardikthanki+sub-portfolio-annual@gmail.com` | Portfolio Hedger annual subscription active | Annual downgrade and annual-to-monthly scenarios | Yes, read-only |
| `CANCEL_FORM_READY` | `imhardikthanki+sub-cancel-form@gmail.com` | Active paid subscription; cancellation form can be opened but not submitted | Cancellation reason and feedback validation | Yes |
| `CANCEL_SCHEDULED` | `imhardikthanki+sub-cancel-scheduled@gmail.com` | Subscription already scheduled to cancel at period end | Scheduled cancellation state and access-until-expiry validation | Yes, read-only |
| `IMMEDIATE_CANCEL_REFUND_READY` | `imhardikthanki+sub-refund-ready@gmail.com` | Disposable paid subscription approved for destructive cancellation/refund | Immediate cancel, refund amount, refund history | No |
| `PAST_DUE_DUNNING` | `imhardikthanki+sub-past-due@gmail.com` | Subscription in failed-payment or past-due state | Dunning, payment recovery, grace-period behavior | Yes, read-only |
| `RENEWAL_READY` | `imhardikthanki+sub-renewal-ready@gmail.com` | Subscription close to renewal or controlled by time-travel/scheduler | Auto-renewal, renewal invoice, renewal notifications | No without scheduler control |
| `EXPIRED_TRIAL_NO_CARD` | `imhardikthanki+sub-expired-no-card@gmail.com` | No-card trial expired and moved to Free plan | Expiry downgrade, paid-feature removal, upgrade prompt | Yes, read-only |
| `EXPIRED_TRIAL_WITH_CARD` | `imhardikthanki+sub-expired-card@gmail.com` | Card-backed trial expired and converted to paid subscription | Trial conversion, automatic billing, renewal evidence | Yes, read-only |

## Environment Variables

Use local PowerShell variables when running controlled tests.

```powershell
$env:SUBSCRIPTION_FIXTURE_PASSWORD="PASTE_TEST_PASSWORD"

$env:PLAN_SELECTION_EXISTING_EMAIL="imhardikthanki+sub-plan-ready@gmail.com"
$env:PLAN_SELECTION_EXISTING_PASSWORD=$env:SUBSCRIPTION_FIXTURE_PASSWORD

$env:BILLING_MANAGEMENT_EMAIL="imhardikthanki+sub-income-monthly@gmail.com"
$env:BILLING_MANAGEMENT_PASSWORD=$env:SUBSCRIPTION_FIXTURE_PASSWORD
```

Controlled lifecycle execution uses these flags:

```powershell
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"

# Turn on only the slice being validated.
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
$env:SUB_LIFECYCLE_OVERLAY_MONTHLY_ENABLED="false"
$env:SUB_LIFECYCLE_PORTFOLIO_MONTHLY_ENABLED="false"
$env:SUB_LIFECYCLE_MARKETPLACE_MONTHLY_ENABLED="false"
$env:SUB_LIFECYCLE_PAID_ANNUAL_ENABLED="false"

# Prepared paid-user slices:
$env:SUB_LIFECYCLE_PAID_EMAIL="imhardikthanki+sub-income-monthly@gmail.com"
$env:SUB_LIFECYCLE_PAID_PASSWORD=$env:SUBSCRIPTION_FIXTURE_PASSWORD
$env:SUB_LIFECYCLE_UPGRADE_TARGET_PLAN="Portfolio Hedger"
$env:SUB_LIFECYCLE_UPGRADE_INTERVALS="monthly,annual"
$env:SUB_LIFECYCLE_SUBMIT_UPGRADE_TARGET_PLAN="Overlay Strategists"
$env:SUB_LIFECYCLE_SUBMIT_UPGRADE_INTERVAL="monthly"
$env:SUB_LIFECYCLE_DOWNGRADE_TARGET_PLAN="Income Builder"
$env:SUB_LIFECYCLE_DOWNGRADE_INTERVALS="monthly"
$env:SUB_LIFECYCLE_INTERVAL_TARGET_PLAN="Income Builder"
$env:SUB_LIFECYCLE_INTERVAL_TO="annual"
$env:SUB_LIFECYCLE_PAID_ANNUAL_PLAN="Overlay Strategists"
```

## Use Case 1 Trial Execution Commands

Run the no-card Overlay Strategists trial first. This creates a disposable user,
starts the trial without Stripe Checkout, confirms the user reaches the
dashboard, and validates Billing shows Overlay Strategists trial context.

```powershell
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"
$env:SUB_LIFECYCLE_TRIAL_WITHOUT_CARD_ENABLED="true"
$env:SUB_LIFECYCLE_TRIAL_WITH_CARD_ENABLED="false"

npm run test:controlled:subscription-lifecycle-execution -- --headed -g "without card"
```

Run the with-card Overlay Strategists trial second. This creates a disposable
user, validates Stripe Checkout trial details, submits the Stripe test card, and
validates Billing shows Overlay Strategists trial plus saved payment method
evidence.

```powershell
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"
$env:SUB_LIFECYCLE_TRIAL_WITHOUT_CARD_ENABLED="false"
$env:SUB_LIFECYCLE_TRIAL_WITH_CARD_ENABLED="true"

npm run test:controlled:subscription-lifecycle-execution -- --headed -g "with card"
```

Run downgrade preview against a prepared higher-tier paid user. This opens the
in-app calculation dialog, checks terms, and closes without submitting.

```powershell
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"
$env:SUB_LIFECYCLE_DOWNGRADE_PREVIEW_ENABLED="true"
$env:SUB_LIFECYCLE_PAID_EMAIL="imhardikthanki+sub-overlay-monthly@gmail.com"
$env:SUB_LIFECYCLE_PAID_PASSWORD=$env:SUBSCRIPTION_FIXTURE_PASSWORD
$env:SUB_LIFECYCLE_DOWNGRADE_TARGET_PLAN="Income Builder"

npm run test:controlled:subscription-lifecycle-execution -- --headed -g "downgrade"
```

Run billing-interval preview without submitting the change:

```powershell
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"
$env:SUB_LIFECYCLE_INTERVAL_PREVIEW_ENABLED="true"
$env:SUB_LIFECYCLE_PAID_EMAIL="imhardikthanki+sub-income-monthly@gmail.com"
$env:SUB_LIFECYCLE_PAID_PASSWORD=$env:SUBSCRIPTION_FIXTURE_PASSWORD
$env:SUB_LIFECYCLE_INTERVAL_TARGET_PLAN="Income Builder"
$env:SUB_LIFECYCLE_INTERVAL_TO="annual"

npm run test:controlled:subscription-lifecycle-execution -- --headed -g "interval"
```

Generate AIR from the latest run:

```powershell
$env:AIR_REPORT_SCOPE="latest"
npm run report:execution
```

Future fixture-specific variables can follow this pattern:

```powershell
$env:SUB_FIXTURE_INCOME_MONTHLY_EMAIL="imhardikthanki+sub-income-monthly@gmail.com"
$env:SUB_FIXTURE_OVERLAY_TRIAL_CARD_EMAIL="imhardikthanki+sub-trial-card@gmail.com"
$env:SUB_FIXTURE_CANCEL_SCHEDULED_EMAIL="imhardikthanki+sub-cancel-scheduled@gmail.com"
```

## Fixture Creation Checklist

For every fixture user, record:

- Email address.
- Password stored locally, not committed.
- Mobile number used.
- Current plan.
- Billing interval: monthly or annual.
- Trial type: none, no-card, or with-card.
- Subscription status: active, trialing, scheduled cancellation, past due,
  expired, or cancelled.
- Stripe customer ID if available.
- Stripe subscription ID if available.
- Next billing date or trial end date.
- Whether the account is safe for destructive testing.
- Which automated test owns the account.

## Destructive Test Rules

The following scenarios must never run against shared accounts:

- Final cancellation.
- Immediate cancellation.
- Refund submission.
- Real upgrade payment.
- Real downgrade confirmation.
- Billing interval change confirmation.
- Renewal or expiry simulation without scheduler/time-control support.

Only run destructive lifecycle tests when:

1. The account is disposable.
2. The scenario is explicitly enabled by env flag.
3. Stripe/admin state can be validated.
4. The expected cleanup or final account state is documented.

## Current Known Product Issues

- With-card Overlay Strategists trial grants correctly for a fresh user and a
  unique Stripe test card (QA-CL-005 DEF-250-02). Billing showing Free, or a
  bounce back to Plan Selection, is the silent `already_redeemed` card-reuse
  gate — not a failed trial grant. Use a different test card per user
  (`4242…4242`, `5555…4444`, `4000 0566 5566 5556`). `/verify-mobile?trial=success`
  means the trial succeeded; the phone gate is separate.
- The genuine remaining defect is that `trial=already_redeemed` is dropped when
  the dashboard bounces the user to onboarding, so the member sees no reason.
- No-card trial broker integration limit needs clarification because current
  product behavior counts manual entry as broker integration.
- FRD no-card trial linked-account limit needs business confirmation because the
  paid Overlay Strategists UI displays Account Linked (10), while the FRD notes
  a lower no-card trial limit.

## What These Fixtures Unlock

Dedicated users allow automation to safely validate:

- Trial once-per-user rules.
- With-card and without-card trial state.
- Paid plan billing overview.
- Upgrade and downgrade eligibility.
- Monthly and annual in-app upgrade calculation previews, including target
  price, unused-time credit, amount-due, and recurring-price checks.
- Downgrade calculation preview, terms required, and cancel-before-submit
  without changing the subscription.
- Monthly-to-annual and annual-to-monthly interval previews without submitting.
- Gated Overlay Strategists and Portfolio Hedger paid purchases
  with disposable users.
- One-time upgrade submission after terms acceptance, using a dedicated
  lower-tier paid user with a saved card.
- Monthly-to-annual and annual-to-monthly behavior.
- Cancel-at-period-end state.
- Expiry behavior.
- Renewal and notification behavior.
- Dunning and payment recovery.
- Refund visibility and transaction history.

They also make AIR clearer because blocked/skipped lifecycle rows can reference
real missing fixture state instead of generic dependency notes.

## One-Time Upgrade Submission

This command accepts the plan-change terms checkbox, confirms the button is
enabled, clicks `Confirm & pay`, and validates Billing shows the upgraded plan.
Run it only on a dedicated lower-tier paid user because it changes the
subscription.

```powershell
$env:BASE_URL="https://uat.ooltool.com"
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"
$env:SUB_LIFECYCLE_UPGRADE_SUBMIT_ENABLED="true"
$env:SUB_LIFECYCLE_PAID_EMAIL="imhardikthanki+plantest@gmail.com"
$env:SUB_LIFECYCLE_PAID_PASSWORD=$env:SUBSCRIPTION_FIXTURE_PASSWORD
$env:SUB_LIFECYCLE_SUBMIT_UPGRADE_TARGET_PLAN="Overlay Strategists"
$env:SUB_LIFECYCLE_SUBMIT_UPGRADE_INTERVAL="monthly"

npm run test:controlled:subscription-lifecycle-execution -- --headed -g "submit upgrade payment"
```

## Four disposable plan-ladder users

Do not put upgrade, yearly refund, and monthly retention on one account.
Retention is once per lifetime. Yearly refund ends paid access immediately.

```powershell
$env:BASE_URL="https://uat.ooltool.com"
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"
$env:SUB_LIFECYCLE_PLAN_LADDER_ENABLED="true"
npm run test:controlled:plan-ladder -- --headed
```

That inspect pass uses four tracks only as needed:

- User A: Income monthly, upgrade Overlay then Hedger monthly, assert amount due / unused credit / recurring amount / renewal, inspect period-end cancel (no refund).
- User B: Income monthly, switch to annual, upgrade remaining yearly plans with the same due/renewal checks, inspect cancel-at-expiry and cancel-and-refund options. Do not submit refund here.
- User D inspect: Overlay monthly, open downgrade, assert 3-month retention on the current plan, decline and close without scheduling.

Keep these off unless a throwaway account is approved:

```powershell
$env:SUB_LIFECYCLE_MONTHLY_CANCEL_SUBMIT_ENABLED="true"
$env:SUB_LIFECYCLE_YEARLY_CANCEL_EXPIRY_SUBMIT_ENABLED="true"
$env:SUB_LIFECYCLE_YEARLY_REFUND_SUBMIT_ENABLED="true"
$env:SUB_LIFECYCLE_RETENTION_ACCEPT_ENABLED="true"
$env:SUB_LIFECYCLE_DOWNGRADE_SUBMIT_ENABLED="true"
```

User C yearly refund is a separate disposable Overlay annual purchase:

```powershell
$env:SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED="true"
$env:SUB_LIFECYCLE_YEARLY_REFUND_SUBMIT_ENABLED="true"
npx playwright test tests/SubscriptionLifecycleExecution.spec.ts -g "yearly cancel and refund" --headed
```
