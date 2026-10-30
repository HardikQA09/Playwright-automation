#!/usr/bin/env node
/*
 * Create named fx-* fixture users on UAT and save them into .env for reuse.
 *
 *   npm run fixtures:prepare
 *   npm run fixtures:prepare -- --keys=UPGRADE_CALC_DAILY,CANCEL_MONTHLY_INSPECT
 *   npm run fixtures:prepare -- --headed
 *
 * Then run the full suite (reuses those accounts):
 *   npm run complete
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const resultsPath = path.join(
  projectRoot,
  'test-results',
  'prepared-fixtures.json'
);
const envPath = path.join(projectRoot, '.env');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const rawLine of fs
    .readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
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

loadEnvFile(envPath);
loadEnvFile(path.join(projectRoot, '.env.local'));

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
const keysArg = argv.find((arg) => arg.startsWith('--keys='));
const keys =
  keysArg?.slice('--keys='.length) ||
  process.env.PREPARE_FIXTURE_KEYS ||
  'UPGRADE_CALC_DAILY,CANCEL_MONTHLY_INSPECT,DOWNGRADE_CALC_DAILY';

process.env.PREPARE_FIXTURE_KEYS = keys;
process.env.SUB_FIXTURE_USE_CANONICAL_EMAILS = 'true';
process.env.AUTH_EMAIL_VERIFICATION_REQUIRED =
  process.env.AUTH_EMAIL_VERIFICATION_REQUIRED || 'true';
process.env.SUBSCRIPTION_FIXTURE_PASSWORD =
  process.env.SUBSCRIPTION_FIXTURE_PASSWORD ||
  process.env.ONBOARDING_PASSWORD ||
  'Test@123456';

if (
  /cursor-sandbox-cache/i.test(String(process.env.PLAYWRIGHT_BROWSERS_PATH || '')) ||
  !process.env.PLAYWRIGHT_BROWSERS_PATH
) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
    process.env.LOCALAPPDATA || '',
    'ms-playwright'
  );
}

console.log('Prepare named fx-* fixtures');
console.log('===========================');
console.log(`Keys: ${keys}`);
console.log(
  `Password: ${process.env.SUBSCRIPTION_FIXTURE_PASSWORD ? '(set)' : '(missing)'}`
);
console.log(
  `Gmail IMAP: ${process.env.GMAIL_APP_PASSWORD ? 'configured' : 'MISSING — set GMAIL_APP_PASSWORD'}`
);
console.log('');

const playwrightCli = path.join(
  projectRoot,
  'node_modules',
  'playwright',
  'cli.js'
);
const args = [
  playwrightCli,
  'test',
  '-c',
  'playwright.prepare.config.ts'
];
if (headed) {
  args.push('--headed');
}

const run = spawnSync(process.execPath, args, {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit'
});

function upsertEnv(filePath, updates) {
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (text && !text.endsWith('\n')) {
    text += '\n';
  }

  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(text)) {
      text = text.replace(pattern, line);
    } else {
      text += `${line}\n`;
    }
  }

  fs.writeFileSync(filePath, text);
}

let results = [];
try {
  results = JSON.parse(fs.readFileSync(resultsPath, 'utf8')).results || [];
} catch {
  results = [];
}

const usable = results.filter(
  (row) => row.status === 'created' || row.status === 'reused'
);

if (usable.length) {
  const updates = {
    SUB_FIXTURE_USE_CANONICAL_EMAILS: 'true',
    SUBSCRIPTION_FIXTURE_PASSWORD: process.env.SUBSCRIPTION_FIXTURE_PASSWORD
  };

  for (const row of usable) {
    updates[row.envEmail] = row.email;
    updates[row.envPassword] = row.password;

    if (row.envEmail === 'SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL') {
      updates.CANCEL_MONTHLY_EMAIL = row.email;
      updates.CANCEL_MONTHLY_PASSWORD = row.password;
    }
    if (row.envEmail === 'SUB_LIFECYCLE_YEARLY_CANCEL_EMAIL') {
      updates.CANCEL_YEARLY_EMAIL = row.email;
      updates.CANCEL_YEARLY_PASSWORD = row.password;
    }
  }

  upsertEnv(envPath, updates);
  console.log('');
  console.log(`Saved ${usable.length} fixture(s) into .env:`);
  for (const row of usable) {
    console.log(`  ${row.status.padEnd(7)} ${row.key} → ${row.email}`);
  }
} else {
  console.log('');
  console.log('No fixtures were created/reused — .env not updated.');
}

const failed = results.filter((row) => row.status === 'failed');
if (failed.length) {
  console.log('');
  console.log('Failed:');
  for (const row of failed) {
    console.log(`  ${row.key}: ${row.detail}`);
  }
}

console.log('');
console.log('Next: npm run complete');
console.log('(full suite + AIR will reuse these fx-* accounts)');

process.exit(run.status === 0 && failed.length === 0 ? 0 : run.status || 1);
