/*
 * Cross-platform complete suite: journey-ordered Playwright run, AIR.
 *
 *   node scripts/run-complete-suite.js
 *   node scripts/run-complete-suite.js --headed
 *   node scripts/run-complete-suite.js --email
 *
 * Applies complete-run-flags to this process (does not rewrite .env).
 * Report email is OFF by default. Pass --email only when you want it sent.
 * SEND_REPORT_EMAIL in the environment is ignored so scheduled/.env flags
 * cannot accidentally email the whole recipient list.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { applyCompleteRunEnv } = require('./apply-complete-run-env');
const { collectConfiguredRecipients } = require('./report-recipients');

const projectRoot = path.resolve(__dirname, '..');
const { hasGmail } = applyCompleteRunEnv(projectRoot);

// If an agent/sandbox left PLAYWRIGHT_BROWSERS_PATH pointing at an empty cache,
// force the real local install so the suite does not fail before any test runs.
if (
  /cursor-sandbox-cache/i.test(
    String(process.env.PLAYWRIGHT_BROWSERS_PATH || '')
  ) ||
  !process.env.PLAYWRIGHT_BROWSERS_PATH
) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
    process.env.LOCALAPPDATA || '',
    'ms-playwright'
  );
}

const argv = process.argv.slice(2);
const watch = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.WATCH || '').toLowerCase()
);
const headed = argv.includes('--headed') || watch;
delete process.env.SEND_REPORT_EMAIL;
const sendEmail = argv.includes('--email');

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
      stdio: 'inherit'
    }).status ?? 1
  );
}

const node = process.execPath;
const playwrightCli = path.join(
  projectRoot,
  'node_modules',
  'playwright',
  'cli.js'
);

console.log(
  'Complete suite: user-journey file order, Oct 12 554-pass flag profile, destructive Stripe submits off, then AIR.'
);

if (!hasGmail) {
  console.warn(
    'GMAIL_APP_PASSWORD is not set. Disposable-user email verification will skip instead of fail. Overlay, direct checkout, and plan-ladder inspect need Gmail to reach the ~550 pass / ~10 fail baseline.'
  );
}
require('./execution-order').assertAllSpecsAreListed();
require('./execution-order').printOrder();

if (headed) {
  console.log('Headed browser. Set SLOW_MO=500 to slow clicks.');
} else {
  console.log('Headless. Pass --headed or WATCH=true only if you need to see the browser.');
}

const playwrightArgs = ['test'];

if (headed) {
  playwrightArgs.push('--headed');
}

const playwrightExit = run(node, [
  playwrightCli,
  ...playwrightArgs
]);

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
} else {
  console.log(
    'Report email skipped (default). Pass --email when you want it sent.'
  );
}

if (playwrightExit !== 0) {
  console.log(
    `Playwright finished with exit code ${playwrightExit}. AIR was still generated.`
  );
  process.exit(playwrightExit);
}

console.log('Complete suite finished.');
