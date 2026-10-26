/*
 * Complete-suite gates for the Oct 12 AIR baseline:
 * 726 tests, 554 passed, 15 failed, 157 skipped.
 *
 * Matches scripts/run-executable-headless.ps1:
 *   - onboarding / profile / signup / billing validation ON
 *   - Overlay Strategists + direct checkout + plan-ladder inspect ON
 *   - upgrade / downgrade / interval previews ON (no submit)
 *
 * Extra paid purchases and destructive Stripe submits stay OFF.
 * Turning those on converts the documented skips into executions and
 * drops the suite from ~550 pass / ~10-15 fail to hundreds of failures.
 *
 * Overlay with-card trial must not use Stripe test card 4242
 * (already_redeemed). Paid checkout may still use STRIPE_CARD 4242.
 * Follow-up: clear 4242 reuse in Stripe test mode.
 *
 * npm run weekly:report / test:daily / test:every-2-days now apply this
 * same flag profile so weekly does not skip Overlay, direct checkout, and
 * plan-ladder inspect the way an unflagged weekly run did.
 */
module.exports = {
  AUTH_EMAIL_VERIFICATION_REQUIRED: 'true',
  ONBOARDING_FIELD_VALIDATION_ENABLED: 'true',
  ONBOARDING_FIELD_VALIDATION_FULL_ENABLED: 'true',
  RISK_COMPLIANCE_VALIDATION_ENABLED: 'true',
  RISK_COMPLIANCE_UPDATE_ENABLED: 'true',
  PLAN_SELECTION_VALIDATION_ENABLED: 'true',
  PLAN_SELECTION_FREE_ACTIVATION_ENABLED: 'true',
  PROFILE_MOBILE_VALIDATION_ENABLED: 'true',
  PROFILE_UPDATE_VALIDATION_ENABLED: 'true',
  BILLING_SUBSCRIPTION_MANAGEMENT_ENABLED: 'true',
  PROFILE_SECURITY_DISPLAY_ENABLED: 'true',
  SIGNUP_OTP_LENGTH_VALIDATION_ENABLED: 'true',
  SIGNUP_OTP_RESEND_VALIDATION_ENABLED: 'true',
  SIGNUP_DUPLICATE_EMAIL_VALIDATION_ENABLED: 'true',
  OVERLAY_STRATEGISTS_FLOW_ENABLED: 'true',
  OVERLAY_STRATEGISTS_TERMS_ENABLED: 'true',
  OVERLAY_STRATEGISTS_WITH_CARD_ENABLED: 'true',
  OVERLAY_STRATEGISTS_WITHOUT_CARD_ENABLED: 'true',
  OVERLAY_STRATEGISTS_STRIPE_CHECKOUT_DETAILS_ENABLED: 'true',
  OVERLAY_STRATEGISTS_STRIPE_NEGATIVE_ENABLED: 'true',
  OVERLAY_STRATEGISTS_DECLINED_CARD_ENABLED: 'true',
  DIRECT_SUBSCRIPTION_PURCHASE_ENABLED: 'true',
  SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED: 'true',
  SUB_LIFECYCLE_PLAN_CONTROLS_ENABLED: 'true',
  SUB_LIFECYCLE_UPGRADE_PREVIEW_ENABLED: 'true',
  SUB_LIFECYCLE_DOWNGRADE_PREVIEW_ENABLED: 'true',
  SUB_LIFECYCLE_INTERVAL_PREVIEW_ENABLED: 'true',
  // Cancel form / yearly+monthly cancel options are always-on prepared fixtures.
  SUB_LIFECYCLE_CANCEL_FORM_ENABLED: 'true',
  // Plan-ladder inspect (non-destructive cancel options + upgrade previews).
  // Needed to stay near the Oct 12 ~157-skip baseline; submit flags stay off.
  SUB_LIFECYCLE_PLAN_LADDER_ENABLED: 'true',

  // Explicit false so a leftover .env true cannot re-enable them.
  // Override with MINIMIZE_SKIPS=true / --minimize-skips (see minimizeSkipFlags).
  SUB_LIFECYCLE_TRIAL_WITHOUT_CARD_ENABLED: 'false',
  SUB_LIFECYCLE_TRIAL_WITH_CARD_ENABLED: 'false',
  SUB_LIFECYCLE_INCOME_MONTHLY_ENABLED: 'false',
  SUB_LIFECYCLE_OVERLAY_MONTHLY_ENABLED: 'false',
  SUB_LIFECYCLE_PORTFOLIO_MONTHLY_ENABLED: 'false',
  SUB_LIFECYCLE_MARKETPLACE_MONTHLY_ENABLED: 'false',
  SUB_LIFECYCLE_PAID_ANNUAL_ENABLED: 'false',
  SUB_LIFECYCLE_UPGRADE_SUBMIT_ENABLED: 'false',
  SUB_LIFECYCLE_FREE_LADDER_ENABLED: 'false',
  SUB_LIFECYCLE_MONTHLY_CANCEL_SUBMIT_ENABLED: 'false',
  SUB_LIFECYCLE_YEARLY_CANCEL_EXPIRY_SUBMIT_ENABLED: 'false',
  SUB_LIFECYCLE_YEARLY_REFUND_SUBMIT_ENABLED: 'false',
  SUB_LIFECYCLE_RETENTION_ACCEPT_ENABLED: 'false',
  SUB_LIFECYCLE_DOWNGRADE_SUBMIT_ENABLED: 'false',

  AIR_REPORT_SCOPE: 'latest',
  AIR_RESTORE_HISTORY: 'true'
};

/**
 * Flags forced ON when MINIMIZE_SKIPS=true / --minimize-skips.
 * Converts ~11+ lifecycle skips into live Stripe executions (slower, more failures).
 * Does NOT convert matrix blocked/future/known-bug rows (~140+ intentional AIR skips).
 */
module.exports.minimizeSkipFlags = {
  SUB_LIFECYCLE_TRIAL_WITHOUT_CARD_ENABLED: 'true',
  SUB_LIFECYCLE_TRIAL_WITH_CARD_ENABLED: 'true',
  SUB_LIFECYCLE_INCOME_MONTHLY_ENABLED: 'true',
  SUB_LIFECYCLE_OVERLAY_MONTHLY_ENABLED: 'true',
  SUB_LIFECYCLE_PORTFOLIO_MONTHLY_ENABLED: 'true',
  SUB_LIFECYCLE_MARKETPLACE_MONTHLY_ENABLED: 'true',
  SUB_LIFECYCLE_PAID_ANNUAL_ENABLED: 'true',
  SUB_LIFECYCLE_UPGRADE_SUBMIT_ENABLED: 'true',
  SUB_LIFECYCLE_FREE_LADDER_ENABLED: 'true',
  SUB_LIFECYCLE_MONTHLY_CANCEL_SUBMIT_ENABLED: 'true',
  SUB_LIFECYCLE_YEARLY_CANCEL_EXPIRY_SUBMIT_ENABLED: 'true',
  SUB_LIFECYCLE_YEARLY_REFUND_SUBMIT_ENABLED: 'true',
  SUB_LIFECYCLE_RETENTION_ACCEPT_ENABLED: 'true',
  SUB_LIFECYCLE_DOWNGRADE_SUBMIT_ENABLED: 'true',
  // Fresh Stripe users when prepared fixtures are Free / missing on UAT.
  SUB_LIFECYCLE_CREATE_DISPOSABLE_USER: 'true',
  SUB_LIFECYCLE_USE_PREPARED_USER: 'true'
};
