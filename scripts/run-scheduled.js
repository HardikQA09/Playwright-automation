/*
 * One command for a scheduled run: tests -> AIR data -> HTML report -> email.
 *
 *   node scripts/run-scheduled.js daily
 *   node scripts/run-scheduled.js every2days
 *   node scripts/run-scheduled.js weekly
 *   node scripts/run-scheduled.js group "Billing pages"
 *
 * Options (after the suite):  --no-email
 * The email is sent even when tests fail, so people hear about failures.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { applyCompleteRunEnv } = require('./apply-complete-run-env');
const { collectConfiguredRecipients } = require('./report-recipients');

const projectRoot = path.resolve(__dirname, '..');
const { hasGmail } = applyCompleteRunEnv(projectRoot);
const lockPath = path.join(projectRoot, '.schedule.lock');
const MAX_LOCK_AGE_MS = 12 * 60 * 60 * 1000;

const argv = process.argv.slice(2);
const cliFlags = new Set(argv.filter((arg) => arg.startsWith('--')));
const positional = argv.filter((arg) => !arg.startsWith('--'));
const [suite, groupName] = positional;

const labels = {
  daily: 'Daily run',
  every2days: 'Every-2-days run',
  weekly: 'Weekly run'
};

if (!suite || (suite === 'group' && !groupName)) {
  console.error(
    'Usage: node scripts/run-scheduled.js <daily|every2days|weekly|group "<name>"> [--no-email]'
  );
  process.exit(1);
}

const label =
  suite === 'group' ? `Group run - ${groupName}` : labels[suite] ?? suite;

if (suite === 'weekly') {
  console.log(
    'Scheduled weekly run: full suite with the Oct 12 554-pass flag profile, then AIR + email.'
  );
}

if (!hasGmail) {
  console.warn(
    'GMAIL_APP_PASSWORD is not set. Disposable-user email verification will skip instead of fail.'
  );
}

if (!cliFlags.has('--no-email')) {
  const { recipients, skipped } = collectConfiguredRecipients();

  if (skipped.length) {
    console.log(`Schedule/report email will skip: ${skipped.join(', ')}`);
  }

  if (!recipients.length) {
    console.warn(
      'No REPORT_EMAIL_TO / REPORT_EMAIL_CC configured. AIR will still generate; the send step needs recipients and SMTP.'
    );
  } else {
    console.log(`Schedule/report email will go to: ${recipients.join(', ')}`);
  }
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);

  return (
    spawnSync(command, args, {
      cwd: projectRoot,
      env: process.env,
      shell: true,
      stdio: 'inherit'
    }).status ?? 1
  );
}

// Two runs share one test account and one test-results folder, so never
// let two scheduled runs overlap.
if (fs.existsSync(lockPath)) {
  const age = Date.now() - fs.statSync(lockPath).mtimeMs;

  if (age < MAX_LOCK_AGE_MS) {
    console.error(
      `Another scheduled run is in progress (${lockPath}). Skipping ${label}.`
    );
    process.exit(2);
  }

  console.warn('Removing stale lock from an earlier run.');
}

fs.writeFileSync(lockPath, `${label}\n${new Date().toISOString()}\n`);

let testStatus = 1;

try {
  const node = process.execPath;
  const q = (value) => `"${value}"`;

  testStatus = suite === 'group'
    ? run(q(node), [q('scripts/run-ordered-tests.js'), 'group', q(groupName)])
    : run(q(node), [q('scripts/run-ordered-tests.js'), suite]);

  // Failing tests give a non-zero status; the report is still needed.
  run(q(node), [q('scripts/generate-air-results.js')]);
  run(q(node), [q('scripts/generate-execution-report.js')]);

  if (!cliFlags.has('--no-email')) {
    run(q(node), [
      q('scripts/send-report-email.js'),
      '--label',
      q(label)
    ]);
  }
} finally {
  fs.rmSync(lockPath, { force: true });
}

process.exit(testStatus);
