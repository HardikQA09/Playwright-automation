#!/usr/bin/env node
/*
 * List prepared (reusable) subscription fixture accounts.
 *
 *   npm run fixtures:list
 *   npm run fixtures:list -- --canonical
 *   npm run fixtures:list -- --json
 *   npm run fixtures:list -- --cheat
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
  const legacy =
    row.legacyEmail && String(row.legacyEmail).trim()
      ? String(row.legacyEmail).trim()
      : '';
  const fromEnv = process.env[row.envEmail];
  const email =
    (fromEnv && fromEnv.trim()) ||
    (preferCanonical ? canonicalEmail : legacy || canonicalEmail);

  return {
    ...row,
    canonicalEmail,
    email,
    passwordSet: !password.startsWith('(set'),
    usingLegacyEmail:
      !fromEnv &&
      !preferCanonical &&
      !!legacy &&
      email === legacy
  };
}

const users = roster.users.map(resolve);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
}

const cheat = process.argv.includes('--cheat') || !process.argv.includes('--full');

console.log('');
console.log('AIR fixture accounts — readable emails');
console.log('======================================');
console.log(`Pattern:  ${base}+fx-<purpose>-<plan>-<interval>@${domain}`);
console.log(`Mode:     ${preferCanonical ? 'CANONICAL (fx-* tags)' : 'LEGACY when set, else canonical'}`);
console.log('Inbox:    all +tags land in the same Gmail (plus-addressing)');
console.log('');

if (roster.naming?.purposeCodes) {
  console.log('Purpose codes');
  console.log('-------------');
  for (const [code, meaning] of Object.entries(roster.naming.purposeCodes)) {
    console.log(`  ${code.padEnd(10)} ${meaning}`);
  }
  console.log('');
}

console.log(
  `${'Label'.padEnd(42)} ${'Canonical email'.padEnd(52)} Plan`
);
console.log(`${'-'.repeat(42)} ${'-'.repeat(52)} ${'-'.repeat(28)}`);

for (const u of users) {
  const label = String(u.label || u.key).slice(0, 41).padEnd(42);
  const email = u.canonicalEmail.padEnd(52);
  const state = `${u.plan} / ${u.interval}`;
  const flag = u.safeDaily ? '' : ' [MUTATES]';
  console.log(`${label} ${email} ${state}${flag}`);
}

console.log('');
console.log('Which tests use which account');
console.log('-----------------------------');
for (const u of users) {
  const tests = Array.isArray(u.tests) ? u.tests : [];
  console.log(`\n${u.label || u.key}`);
  console.log(`  email:  ${u.canonicalEmail}`);
  console.log(`  active: ${u.email}${u.usingLegacyEmail ? '  (legacy until --canonical)' : ''}`);
  console.log(`  env:    ${u.envEmail}`);
  if (tests.length) {
    for (const t of tests) {
      console.log(`  test:   ${t}`);
    }
  } else {
    console.log(`  purpose:${u.purpose}`);
  }
}

if (!cheat) {
  console.log('\nFull purpose text');
  console.log('-----------------');
  for (const u of users) {
    console.log(`\n${u.key}: ${u.purpose}`);
  }
}

console.log('');
console.log('Prepare once (per canonical email)');
console.log('----------------------------------');
console.log('  1. Register that exact +fx-…@gmail.com on UAT');
console.log('  2. Verify email/mobile; finish Risk/Compliance');
console.log('  3. Buy the listed plan + interval; save a Stripe test card');
console.log('  4. Password = SUBSCRIPTION_FIXTURE_PASSWORD (shared for new fx-* accounts)');
console.log('  5. Enable:  $env:SUB_FIXTURE_USE_CANONICAL_EMAILS="true"');
console.log('  6. Wire:    npm run fixtures:apply-env -- --canonical');
console.log('');
console.log('Until an fx-* account is prepared, complete-run may buy a disposable Stripe user for that slot.');
console.log('');
