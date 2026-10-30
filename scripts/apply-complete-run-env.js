/*
 * Loads .env, then applies the Oct 12 ~550-pass complete-run flags in-process.
 * Used by npm run complete and npm run scheduled:weekly (full suite).
 */
const fs = require('fs');
const path = require('path');
const flags = require('./complete-run-flags');
const { minimizeSkipFlags } = flags;

function wantsMinimizeSkips(argv = process.argv) {
  return (
    ['1', 'true', 'yes', 'on'].includes(
      String(process.env.MINIMIZE_SKIPS || '').toLowerCase()
    ) || argv.includes('--minimize-skips')
  );
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const rawLine of fs
    .readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function setDefaultEnv(name, value) {
  if (!process.env[name]) {
    process.env[name] = value;
  }
}

function applyCompleteRunEnv(projectRoot = path.resolve(__dirname, '..')) {
  loadEnvFile(path.join(projectRoot, '.env'));
  loadEnvFile(path.join(projectRoot, '.env.local'));

  for (const [key, value] of Object.entries(flags)) {
    if (key === 'minimizeSkipFlags') {
      continue;
    }
    process.env[key] = value;
  }

  const minimizeSkips = wantsMinimizeSkips();

  if (minimizeSkips) {
    for (const [key, value] of Object.entries(minimizeSkipFlags || {})) {
      process.env[key] = value;
    }
    console.warn(
      '[complete-run-env] MINIMIZE_SKIPS: lifecycle submit/purchase flags ON + disposable users when fixtures gap'
    );
  }

  setDefaultEnv('AUTH_OTP_CODE', '111111');
  // plantest is an active paid Overlay subscriber — NOT paused on Choose Your
  // Plan. Pointing PLAN_SELECTION_EXISTING_* at plantest makes both plan-
  // selection checks skip, which also skips Overlay "trial option" discovery.
  // Prefer a fresh disposable user (Gmail IMAP) unless .env explicitly sets a
  // user that is truly parked on plan selection.
  const planSelectionEmail = String(
    process.env.PLAN_SELECTION_EXISTING_EMAIL || ''
  ).trim();
  if (
    /plantest|paid-income|paid-fix|monthly-to-a|e2e/i.test(
      planSelectionEmail
    )
  ) {
    console.warn(
      `[complete-run-env] Clearing PLAN_SELECTION_EXISTING_EMAIL (${planSelectionEmail}) — not a plan-selection fixture; will register a fresh user`
    );
    delete process.env.PLAN_SELECTION_EXISTING_EMAIL;
    delete process.env.PLAN_SELECTION_EXISTING_PASSWORD;
    delete process.env.PLAN_SELECTION_EXISTING_MOBILE;
  }
  setDefaultEnv('ADMIN_EMAIL', 'admin@ooltool.com');
  setDefaultEnv('ADMIN_PASSWORD', 'Admin@1234!');

  // Multi-account paid fixtures (renew / downgrade / cancel / interval).
  // Only remap throwaway Stripe tags that cannot Sign In on UAT.
  const workingPaidEmail = 'imhardikthanki+plantest@gmail.com';
  const workingPaidPassword = 'H@rdik9944';
  const yearlyCancelEmail = 'imhardikthanki+e2e@gmail.com';
  const yearlyCancelPassword = 'H@rdik9944';
  const monthlyCancelEmail =
    'imhardikthanki+monthly-to-a-mvjn15yr@gmail.com';
  const monthlyCancelPassword = 'Test@123456';
  const brokenPaidPattern =
    /\+(?:paid-income|paid-fix)(?:-|[.@])/i;

  function remapIfBroken(emailKey, passwordKey, email, password) {
    const current = String(process.env[emailKey] || '').trim();
    if (!current || brokenPaidPattern.test(current)) {
      const previous = current || 'unset';
      process.env[emailKey] = email;
      process.env[passwordKey] = password;
      if (previous !== email) {
        console.warn(
          `[complete-run-env] ${emailKey} → ${email} (was ${previous})`
        );
      }
    }
  }

  function setFixtureDefault(emailKey, passwordKey, email, password) {
    if (!String(process.env[emailKey] || '').trim()) {
      process.env[emailKey] = email;
      process.env[passwordKey] = password;
    }
  }

  // Shared dashboard / portal / generic paid — plantest (Overlay annual).
  process.env.SUBSCRIBER_EMAIL = workingPaidEmail;
  process.env.SUBSCRIBER_PASSWORD = workingPaidPassword;
  process.env.SUB_LIFECYCLE_PAID_EMAIL = workingPaidEmail;
  process.env.SUB_LIFECYCLE_PAID_PASSWORD = workingPaidPassword;
  process.env.BILLING_MANAGEMENT_EMAIL = workingPaidEmail;
  process.env.BILLING_MANAGEMENT_PASSWORD = workingPaidPassword;

  // Per-scenario keys — distinct accounts so renew/downgrade/cancel do not collide.
  // Upgrade calc needs Income (or lower), NOT plantest Overlay — otherwise
  // "Upgrade to Overlay" is missing and the preview row skips.
  if (
    /plantest/i.test(
      String(process.env.SUB_FIXTURE_UPGRADE_CALC_EMAIL || '')
    )
  ) {
    console.warn(
      '[complete-run-env] Clearing SUB_FIXTURE_UPGRADE_CALC_* (was plantest Overlay) — disposable Income monthly will be used for upgrade previews'
    );
    delete process.env.SUB_FIXTURE_UPGRADE_CALC_EMAIL;
    delete process.env.SUB_FIXTURE_UPGRADE_CALC_PASSWORD;
  }
  setFixtureDefault(
    'SUB_FIXTURE_INTERVAL_EMAIL',
    'SUB_FIXTURE_INTERVAL_PASSWORD',
    workingPaidEmail,
    workingPaidPassword
  );
  setFixtureDefault(
    'SUB_FIXTURE_RETENTION_EMAIL',
    'SUB_FIXTURE_RETENTION_PASSWORD',
    workingPaidEmail,
    workingPaidPassword
  );
  // Downgrade confirmation (SC-120/123/124/148): needs Overlay+ (not Income).
  // plantest = Overlay annual. If Income CTA is missing, matrix/lifecycle buys
  // disposable Overlay→Income or Portfolio→Overlay when CREATE_DISPOSABLE_USER=true.
  process.env.SUB_FIXTURE_DOWNGRADE_EMAIL = workingPaidEmail;
  process.env.SUB_FIXTURE_DOWNGRADE_PASSWORD = workingPaidPassword;
  setDefaultEnv('SUB_LIFECYCLE_DOWNGRADE_TARGET_PLAN', 'Income Builder');

  // Yearly cancel / refund-option copy — e2e (annual), not the shared plantest session.
  remapIfBroken(
    'SUB_LIFECYCLE_YEARLY_CANCEL_EMAIL',
    'SUB_LIFECYCLE_YEARLY_CANCEL_PASSWORD',
    yearlyCancelEmail,
    yearlyCancelPassword
  );
  remapIfBroken(
    'CANCEL_YEARLY_EMAIL',
    'CANCEL_YEARLY_PASSWORD',
    yearlyCancelEmail,
    yearlyCancelPassword
  );
  setFixtureDefault(
    'SUB_LIFECYCLE_YEARLY_CANCEL_EMAIL',
    'SUB_LIFECYCLE_YEARLY_CANCEL_PASSWORD',
    yearlyCancelEmail,
    yearlyCancelPassword
  );
  setFixtureDefault(
    'CANCEL_YEARLY_EMAIL',
    'CANCEL_YEARLY_PASSWORD',
    yearlyCancelEmail,
    yearlyCancelPassword
  );

  // Monthly cancel options need a true monthly paid subscriber.
  // +monthly-to-a is often annual/broken on UAT — do not force it. With
  // CREATE_DISPOSABLE_USER, loginCancelFixture buys Income Builder monthly.
  if (
    /monthly-to-a/i.test(
      String(
        process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL ||
          process.env.CANCEL_MONTHLY_EMAIL ||
          ''
      )
    )
  ) {
    console.warn(
      `[complete-run-env] Clearing monthly cancel fixture ${process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL || process.env.CANCEL_MONTHLY_EMAIL} (known annual/login gaps) — disposable monthly will be used`
    );
    delete process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL;
    delete process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_PASSWORD;
    delete process.env.CANCEL_MONTHLY_EMAIL;
    delete process.env.CANCEL_MONTHLY_PASSWORD;
  } else {
    remapIfBroken(
      'SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL',
      'SUB_LIFECYCLE_MONTHLY_CANCEL_PASSWORD',
      monthlyCancelEmail,
      monthlyCancelPassword
    );
    remapIfBroken(
      'CANCEL_MONTHLY_EMAIL',
      'CANCEL_MONTHLY_PASSWORD',
      monthlyCancelEmail,
      monthlyCancelPassword
    );
  }

  // Prefer prepared multi-account roster; disposable fills missing time-state slots.
  process.env.SUB_LIFECYCLE_USE_PREPARED_USER = 'true';
  // AIR matrix self-checks read the previous air:parse output (no browser).
  // Enable on every complete run so SC-164/199/200-style rows execute instead of
  // soft-skipping with "excluded from the live Playwright execution".
  process.env.AIR_SELF_VALIDATION_ENABLED = 'true';
  // Disposable Stripe users fill fixture gaps (time-state / wrong interval).
  process.env.SUB_LIFECYCLE_CREATE_DISPOSABLE_USER = 'true';
  if (!minimizeSkips) {
    console.warn(
      '[complete-run-env] CREATE_DISPOSABLE_USER=true for complete suite (fixture-gap skips become live purchases)'
    );
  }
  console.warn(
    '[complete-run-env] multi-account fixtures: plantest=portal/upgrade/interval/downgrade, e2e=yearly-cancel, monthly-to-a=monthly-cancel'
  );
  console.warn(
    minimizeSkips
      ? '[complete-run-env] MINIMIZE_SKIPS: CREATE_DISPOSABLE_USER=true — wrong/missing fixtures buy a disposable user instead of skipping'
      : '[complete-run-env] prepared users ON with disposable fallback for missing time-state accounts'
  );
  setDefaultEnv(
    'REPORT_EMAIL_TO',
    [
      'pankaj.bhatla@ooltool.com',
      'syesha.sen@ooltool.com',
      'chetan.thumar@quantuminfoway.com',
      'vishal.chauhan@quantuminfoway.com',
      'hardik.thanki@quantuminfoway.com'
    ].join(',')
  );

  if (!process.env.SLOW_MO) {
    process.env.SLOW_MO = '0';
  }

  process.env.AIR_REPORT_SCOPE = process.env.AIR_REPORT_SCOPE || 'latest';
  process.env.AIR_RESTORE_HISTORY = process.env.AIR_RESTORE_HISTORY || 'true';

  return {
    hasGmail: Boolean(
      String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')
    )
  };
}

module.exports = {
  applyCompleteRunEnv,
  loadEnvFile,
  setDefaultEnv,
  wantsMinimizeSkips
};
