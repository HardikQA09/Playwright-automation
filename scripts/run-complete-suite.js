/*
 * Cross-platform complete suite: journey-ordered Playwright run, AIR, email.
 *
 *   node scripts/run-complete-suite.js
 *   node scripts/run-complete-suite.js --headed
 *   node scripts/run-complete-suite.js --no-email
 *
 * Applies complete-run-flags to this process (does not rewrite .env).
 * Emails every configured REPORT_EMAIL_* address except Rob / REPORT_EMAIL_EXCLUDE.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const flags = require('./complete-run-flags');
const { collectConfiguredRecipients } = require('./report-recipients');

const projectRoot = path.resolve(__dirname, '..');

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

loadEnvFile(path.join(projectRoot, '.env'));
loadEnvFile(path.join(projectRoot, '.env.local'));

for (const [key, value] of Object.entries(flags)) {
  process.env[key] = value;
}

if (!process.env.SLOW_MO) {
  process.env.SLOW_MO = '0';
}

const argv = process.argv.slice(2);
const watch = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.WATCH || '').toLowerCase()
);
const headed = argv.includes('--headed') || watch;
const sendEmail = !argv.includes('--no-email');

process.env.HEADED = headed ? 'true' : 'false';
process.env.AIR_REPORT_SCOPE = process.env.AIR_REPORT_SCOPE || 'latest';
process.env.AIR_RESTORE_HISTORY = process.env.AIR_RESTORE_HISTORY || 'true';
process.env.SKIP_AIR_REPORT = 'true';

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

const playwright = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
);
const node = process.execPath;

console.log(
  'Complete suite: user-journey file order, full speed, paid lifecycle flags on, then AIR.'
);
run(node, ['-e', "require('./scripts/execution-order').assertAllSpecsAreListed(); require('./scripts/execution-order').printOrder()"]);

if (headed) {
  console.log('Headed browser. Set SLOW_MO=500 to slow clicks.');
} else {
  console.log('Headless. Pass --headed or WATCH=true only if you need to see the browser.');
}

const playwrightArgs = ['test'];

if (headed) {
  playwrightArgs.push('--headed');
}

const playwrightExit = run(playwright, playwrightArgs);

run(node, [path.join(projectRoot, 'scripts', 'generate-air-results.js')]);
run(node, [path.join(projectRoot, 'scripts', 'generate-execution-report.js')]);

if (sendEmail) {
  const { recipients, skipped } = collectConfiguredRecipients();

  if (skipped.length) {
    console.log(`Schedule/report email will skip: ${skipped.join(', ')}`);
  }

  if (!recipients.length) {
    console.warn(
      'No REPORT_EMAIL_TO / REPORT_EMAIL_CC configured, so the AIR report was not emailed.'
    );
  } else {
    const emailStatus = run(node, [
      path.join(projectRoot, 'scripts', 'send-report-email.js'),
      '--label',
      'Complete suite'
    ]);

    if (emailStatus !== 0) {
      console.warn('Complete suite finished, but the report email did not send.');
    }
  }
}

if (playwrightExit !== 0) {
  console.log(
    `Playwright finished with exit code ${playwrightExit}. AIR was still generated.`
  );
  process.exit(playwrightExit);
}

console.log('Complete suite finished.');
