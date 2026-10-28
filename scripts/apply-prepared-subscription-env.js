#!/usr/bin/env node
/*
 * Print PowerShell env assignments for prepared subscription fixtures.
 *
 *   npm run fixtures:apply-env
 *   npm run fixtures:apply-env -- --canonical
 *   npm run fixtures:apply-env -- --bash
 *
 * Dot-source / copy into your session before daily upgrade-calc runs.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

try {
  require(path.join(__dirname, '../tests/config/loadLocalEnv'));
} catch {
  // optional
}

const roster = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../tests/config/preparedSubscriptionUsers.data.json'),
    'utf8'
  )
);

const preferCanonical =
  process.argv.includes('--canonical') ||
  ['1', 'true', 'yes', 'on'].includes(
    String(process.env.SUB_FIXTURE_USE_CANONICAL_EMAILS || '').toLowerCase()
  );

const bash = process.argv.includes('--bash');
const includeDestructive = process.argv.includes('--destructive');

const base =
  (process.env.ONBOARDING_EMAIL_BASE || `${roster.emailLocalBase}@${roster.emailDomain}`)
    .split('+')[0]
    .split('@')[0];

const domain =
  (process.env.ONBOARDING_EMAIL_BASE || `${roster.emailLocalBase}@${roster.emailDomain}`)
    .split('@')[1] || roster.emailDomain;

const sharedPassword =
  process.env.SUBSCRIPTION_FIXTURE_PASSWORD ||
  process.env.SUB_LIFECYCLE_PAID_PASSWORD ||
  process.env.ONBOARDING_PASSWORD ||
  'Test@123456';

function passwordForEmail(email) {
  const normalized = String(email || '').toLowerCase();
  if (/(?:^|\+)e2e@/i.test(normalized)) {
    return process.env.E2E_PASSWORD || process.env.CANCEL_YEARLY_PASSWORD || 'H@rdik9944';
  }
  if (/(?:^|\+)plantest@/i.test(normalized)) {
    return process.env.SUBSCRIBER_PASSWORD || 'H@rdik9944';
  }
  if (/monthly-to-a/i.test(normalized)) {
    return process.env.CANCEL_MONTHLY_PASSWORD || 'Test@123456';
  }
  return sharedPassword;
}

function setLine(name, value) {
  if (bash) {
    return `export ${name}=${JSON.stringify(value)}`;
  }

  return `$env:${name}=${JSON.stringify(value)}`;
}

const lines = [];

lines.push(setLine('SUB_LIFECYCLE_USE_PREPARED_USER', 'true'));
lines.push(setLine('SUBSCRIPTION_FIXTURE_PASSWORD', sharedPassword));

if (preferCanonical) {
  lines.push(setLine('SUB_FIXTURE_USE_CANONICAL_EMAILS', 'true'));
}

for (const row of roster.users) {
  if (!includeDestructive && row.mutateRisk === 'destructive') {
    continue;
  }

  const canonicalEmail = `${base}+${row.tag}@${domain}`;
  const email =
    (process.env[row.envEmail] && process.env[row.envEmail].trim()) ||
    (preferCanonical ? canonicalEmail : row.legacyEmail || canonicalEmail);
  const pass =
    (process.env[row.envPassword] && process.env[row.envPassword].trim()) ||
    passwordForEmail(email);

  lines.push(setLine(row.envEmail, email));
  lines.push(setLine(row.envPassword, pass));
}

// Align common aliases with daily upgrade + portal + cancel accounts.
const upgrade = roster.users.find((u) => u.key === 'UPGRADE_CALC_DAILY');
const portal = roster.users.find((u) => u.key === 'BILLING_PORTAL');
const yearly = roster.users.find((u) => u.key === 'CANCEL_YEARLY_INSPECT');
const monthly = roster.users.find((u) => u.key === 'CANCEL_MONTHLY_INSPECT');

function activeEmail(row) {
  const canonicalEmail = `${base}+${row.tag}@${domain}`;
  return (
    (process.env[row.envEmail] && process.env[row.envEmail].trim()) ||
    (preferCanonical ? canonicalEmail : row.legacyEmail || canonicalEmail)
  );
}

if (upgrade) {
  const email = activeEmail(upgrade);
  lines.push(setLine('SUB_LIFECYCLE_PAID_EMAIL', email));
  lines.push(setLine('SUB_LIFECYCLE_PAID_PASSWORD', passwordForEmail(email)));
}

if (portal) {
  const email = activeEmail(portal);
  lines.push(setLine('BILLING_MANAGEMENT_EMAIL', email));
  lines.push(setLine('BILLING_MANAGEMENT_PASSWORD', passwordForEmail(email)));
}

if (yearly) {
  const email = activeEmail(yearly);
  lines.push(setLine('SUB_LIFECYCLE_YEARLY_CANCEL_EMAIL', email));
  lines.push(setLine('SUB_LIFECYCLE_YEARLY_CANCEL_PASSWORD', passwordForEmail(email)));
  lines.push(setLine('CANCEL_YEARLY_EMAIL', email));
  lines.push(setLine('CANCEL_YEARLY_PASSWORD', passwordForEmail(email)));
}

if (monthly) {
  const email = activeEmail(monthly);
  lines.push(setLine('SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL', email));
  lines.push(setLine('SUB_LIFECYCLE_MONTHLY_CANCEL_PASSWORD', passwordForEmail(email)));
  lines.push(setLine('CANCEL_MONTHLY_EMAIL', email));
  lines.push(setLine('CANCEL_MONTHLY_PASSWORD', passwordForEmail(email)));
}

lines.push(setLine('SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED', 'true'));
lines.push(setLine('SUB_LIFECYCLE_UPGRADE_PREVIEW_ENABLED', 'true'));
lines.push(setLine('SUB_LIFECYCLE_DOWNGRADE_PREVIEW_ENABLED', 'true'));
lines.push(setLine('SUB_LIFECYCLE_INTERVAL_PREVIEW_ENABLED', 'true'));
lines.push(setLine('SUB_LIFECYCLE_CANCEL_FORM_ENABLED', 'true'));

if (!process.argv.includes('--quiet')) {
  console.log('# Prepared fixture env — paste into PowerShell (or use --bash)');
  console.log(`# Mode: ${preferCanonical ? 'canonical' : 'legacy'}`);
}

for (const line of lines) {
  console.log(line);
}

if (process.argv.includes('--run-daily-upgrade')) {
  // Apply into current process and spawn the upgrade preview grep.
  for (const line of lines) {
    const match = line.match(/^(?:\$env:|export )([A-Z0-9_]+)=(.+)$/);
    if (!match) continue;
    process.env[match[1]] = JSON.parse(match[2]);
  }

  const args = [
    'test',
    'tests/SubscriptionLifecycleExecution.spec.ts',
    '-g',
    'upgrade calculation|upgrade preview|Upgrade preview'
  ];

  if (process.argv.includes('--headed')) {
    args.push('--headed');
  }

  const result = spawnSync('npx', ['playwright', ...args], {
    stdio: 'inherit',
    shell: true,
    env: process.env
  });

  process.exit(result.status || 0);
}
