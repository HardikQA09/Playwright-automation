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
  // plan-selection-prepared is rejected by UAT (CredentialsSignin).
  // Use the working plantest account so plan-selection login can proceed.
  setDefaultEnv(
    'PLAN_SELECTION_EXISTING_EMAIL',
    'imhardikthanki+plantest@gmail.com'
  );
  setDefaultEnv('PLAN_SELECTION_EXISTING_PASSWORD', 'H@rdik9944');
  setDefaultEnv('ADMIN_EMAIL', 'admin@ooltool.com');
  setDefaultEnv('ADMIN_PASSWORD', 'Admin@1234!');

  // UAT accounts that currently fail Sign In (no credentials POST / lockout).
  // Always remap these patterns — .env still points at paid-income for many keys.
  const workingPaidEmail = 'imhardikthanki+plantest@gmail.com';
  const workingPaidPassword = 'H@rdik9944';
  const brokenPaidPattern =
    /\+(?:paid-income|paid-fix|monthly-to-a|e2e)(?:-|[.@])/i;

  function forceWorkingPaidFixture(emailKey, passwordKey) {
    const email = String(process.env[emailKey] || '').trim();
    if (!email || brokenPaidPattern.test(email)) {
      const previous = email || 'unset';
      process.env[emailKey] = workingPaidEmail;
      process.env[passwordKey] = workingPaidPassword;
      console.warn(
        `[complete-run-env] ${emailKey} remapped to plantest (was ${previous})`
      );
    }
  }

  forceWorkingPaidFixture('SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL', 'SUB_LIFECYCLE_MONTHLY_CANCEL_PASSWORD');
  forceWorkingPaidFixture('SUB_LIFECYCLE_YEARLY_CANCEL_EMAIL', 'SUB_LIFECYCLE_YEARLY_CANCEL_PASSWORD');
  forceWorkingPaidFixture('CANCEL_MONTHLY_EMAIL', 'CANCEL_MONTHLY_PASSWORD');
  forceWorkingPaidFixture('CANCEL_YEARLY_EMAIL', 'CANCEL_YEARLY_PASSWORD');
  forceWorkingPaidFixture('SUB_FIXTURE_DOWNGRADE_EMAIL', 'SUB_FIXTURE_DOWNGRADE_PASSWORD');
  forceWorkingPaidFixture('SUB_FIXTURE_RETENTION_EMAIL', 'SUB_FIXTURE_RETENTION_PASSWORD');
  forceWorkingPaidFixture('SUB_FIXTURE_INTERVAL_EMAIL', 'SUB_FIXTURE_INTERVAL_PASSWORD');

  // Always pin the primary paid fixtures for complete suite — .env paid-income
  // currently cannot complete Sign In on UAT (no credentials POST).
  process.env.SUB_LIFECYCLE_PAID_EMAIL = workingPaidEmail;
  process.env.SUB_LIFECYCLE_PAID_PASSWORD = workingPaidPassword;
  process.env.BILLING_MANAGEMENT_EMAIL = workingPaidEmail;
  process.env.BILLING_MANAGEMENT_PASSWORD = workingPaidPassword;
  process.env.SUBSCRIBER_EMAIL = workingPaidEmail;
  process.env.SUBSCRIBER_PASSWORD = workingPaidPassword;
  // Prefer prepared plantest over registering a new Stripe user every run.
  process.env.SUB_LIFECYCLE_USE_PREPARED_USER = 'true';
  if (!minimizeSkips) {
    process.env.SUB_LIFECYCLE_CREATE_DISPOSABLE_USER = 'false';
  }
  console.warn(
    '[complete-run-env] SUB_LIFECYCLE_PAID / BILLING_MANAGEMENT / SUBSCRIBER pinned to plantest'
  );
  console.warn(
    minimizeSkips
      ? '[complete-run-env] MINIMIZE_SKIPS: CREATE_DISPOSABLE_USER=true (slower; fewer fixture skips)'
      : '[complete-run-env] prepared users ON (CREATE_DISPOSABLE_USER=false) for faster runs'
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
