#!/usr/bin/env node
/*
 * List prepared (reusable) subscription fixture accounts.
 *
 *   npm run fixtures:list
 *   npm run fixtures:list -- --canonical
 *   npm run fixtures:list -- --json
 */

const fs = require('fs');
const path = require('path');

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

const base =
  (process.env.ONBOARDING_EMAIL_BASE || `${roster.emailLocalBase}@${roster.emailDomain}`)
    .split('+')[0]
    .split('@')[0];

const domain =
  (process.env.ONBOARDING_EMAIL_BASE || `${roster.emailLocalBase}@${roster.emailDomain}`)
    .split('@')[1] || roster.emailDomain;

const password =
  process.env.SUBSCRIPTION_FIXTURE_PASSWORD ||
  process.env.SUB_LIFECYCLE_PAID_PASSWORD ||
  '(set SUBSCRIPTION_FIXTURE_PASSWORD)';

function resolve(row) {
  const canonicalEmail = `${base}+${row.tag}@${domain}`;
  const fromEnv = process.env[row.envEmail];
  const email =
    (fromEnv && fromEnv.trim()) ||
    (preferCanonical ? canonicalEmail : row.legacyEmail || canonicalEmail);

  return {
    ...row,
    canonicalEmail,
    email,
    passwordSet: !password.startsWith('(set'),
    usingLegacyEmail:
      !fromEnv &&
      !preferCanonical &&
      !!row.legacyEmail &&
      email === row.legacyEmail
  };
}

const users = roster.users.map(resolve);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
}

console.log('');
console.log('Prepared subscription users (scenario-named, reusable)');
console.log('======================================================');
console.log(`Mode: ${preferCanonical ? 'CANONICAL (+sub-*)' : 'LEGACY (current runners) until you flip --canonical'}`);
console.log('All +tags share one Gmail inbox → email delivery checks work.');
console.log('');

function printGroup(title, list) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const u of list) {
    const mark = u.usingLegacyEmail
      ? '  << still on legacy email — prepare canonical when ready'
      : '';
    console.log(`  ${u.key}`);
    console.log(`    active:    ${u.email}${mark}`);
    console.log(`    canonical: ${u.canonicalEmail}`);
    console.log(`    state:     ${u.plan} / ${u.interval}`);
    console.log(`    purpose:   ${u.purpose}`);
    console.log(`    validates: ${u.validates.join(', ')}`);
    console.log(`    env:       ${u.envEmail}`);
    console.log('');
  }
}

printGroup(
  'DAILY SAFE — same accounts every day (preview / inspect only)',
  users.filter((u) => u.safeDaily)
);

printGroup(
  'DESTRUCTIVE — dedicated throwaways only (not daily)',
  users.filter((u) => !u.safeDaily)
);

console.log('Prepare each canonical account once');
console.log('-----------------------------------');
console.log('  1. Register with canonical email (tag above)');
console.log('  2. Verify email + mobile; finish Risk/Compliance');
console.log('  3. Buy the listed plan/interval; save Stripe test card');
console.log('  4. Password = SUBSCRIPTION_FIXTURE_PASSWORD (shared)');
console.log('  5. When ready: $env:SUB_FIXTURE_USE_CANONICAL_EMAILS="true"');
console.log('  6. npm run fixtures:apply-env');
console.log('');
console.log('Daily upgrade calculation (same account):');
console.log('  npm run fixtures:apply-env');
console.log('  npm run test:controlled:subscription-lifecycle-execution -- -g "upgrade"');
console.log('');
