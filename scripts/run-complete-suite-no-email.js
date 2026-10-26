/*
 * Cross-platform complete suite: journey-ordered Playwright run, AIR.
 *
 *   node scripts/run-complete-suite-no-email.js
 *   node scripts/run-complete-suite-no-email.js --headed
 *   node scripts/run-complete-suite-no-email.js --email
 *   node scripts/run-complete-suite-no-email.js --minimize-skips
 *
 * Applies complete-run-flags to this process (does not rewrite .env).
 * --minimize-skips / MINIMIZE_SKIPS=true turns lifecycle purchase+submit
 * flags ON (fewer skips, slower, more Stripe mutations).
 * Report email is OFF by default. Pass --email to notify REPORT_EMAIL_* /
 * default recipients — but only when the run is clean (0 failed).
 * After the main pass, failed tests are re-run once (--last-failed) and merged
 * into results.json so AIR reflects the healed outcome of this same suite run.
 * Remaining failures → AIR still generates, email is skipped.
 * SEND_REPORT_EMAIL in the environment is ignored so scheduled/.env flags
 * cannot accidentally email the whole recipient list.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { applyCompleteRunEnv } = require('./apply-complete-run-env');
const { collectConfiguredRecipients } = require('./report-recipients');
const { isAirRunClean } = require('./air-run-clean');

const projectRoot = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const minimizeSkips =
  argv.includes('--minimize-skips') ||
  ['1', 'true', 'yes', 'on'].includes(
    String(process.env.MINIMIZE_SKIPS || '').toLowerCase()
  );
if (minimizeSkips) {
  process.env.MINIMIZE_SKIPS = 'true';
}

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
// One automatic retry per test during the main pass (flakes).
process.env.PLAYWRIGHT_RETRIES =
  process.env.PLAYWRIGHT_RETRIES || '1';
const healEnabled = !argv.includes('--no-heal');

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
  minimizeSkips
    ? 'Complete suite: MINIMIZE_SKIPS — lifecycle purchase/submit ON (fewer skips, slower), then AIR.'
    : 'Complete suite: user-journey file order, Oct 12 554-pass flag profile, destructive Stripe submits off, then AIR.'
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

const resultsPath = path.join(projectRoot, 'test-results', 'results.json');
const healPath = path.join(projectRoot, 'test-results', 'results-heal.json');
const resultsBackupPath = path.join(
  projectRoot,
  'test-results',
  'results-pre-heal.json'
);

function preserveMainResults() {
  if (!fs.existsSync(resultsPath)) {
    return false;
  }

  fs.mkdirSync(path.dirname(resultsBackupPath), { recursive: true });
  fs.copyFileSync(resultsPath, resultsBackupPath);
  return true;
}

function restoreMainResultsIfMissing() {
  if (fs.existsSync(resultsPath)) {
    return true;
  }

  if (fs.existsSync(resultsBackupPath)) {
    fs.copyFileSync(resultsBackupPath, resultsPath);
    console.warn(
      'Restored test-results/results.json from pre-heal backup (heal pass wiped outputDir).'
    );
    return true;
  }

  return false;
}

let playwrightExit = run(node, [
  playwrightCli,
  ...playwrightArgs
]);

if (
  playwrightExit !== 0 &&
  healEnabled
) {
  console.log(
    '\n--- Heal pass: re-running failed tests in this same suite run ---'
  );

  // Playwright cleans test-results/ at the start of every run, which deletes
  // the main results.json the AIR builder needs. Snapshot it first.
  const hadMainResults = preserveMainResults();

  if (fs.existsSync(healPath)) {
    fs.rmSync(healPath, { force: true });
  }

  const healEnv = {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_NAME: healPath,
    // Heal pass is a deliberate second attempt; do not stack more retries.
    PLAYWRIGHT_RETRIES: '0'
  };

  const healStatus =
    spawnSync(
      node,
      [
        playwrightCli,
        'test',
        '--last-failed',
        ...(headed ? ['--headed'] : [])
      ],
      {
        cwd: projectRoot,
        env: healEnv,
        stdio: 'inherit'
      }
    ).status ?? 1;

  if (hadMainResults) {
    restoreMainResultsIfMissing();
  }

  if (
    fs.existsSync(resultsPath) &&
    fs.existsSync(healPath)
  ) {
    const mergeStatus = run(node, [
      path.join(projectRoot, 'scripts', 'merge-heal-results.js'),
      '--main',
      resultsPath,
      '--heal',
      healPath,
      '--out',
      resultsPath
    ]);

    if (mergeStatus === 0 && healStatus === 0) {
      playwrightExit = 0;
      console.log(
        'Heal pass cleared remaining failures for this suite run.'
      );
    } else {
      playwrightExit = healStatus !== 0 ? healStatus : 1;
      console.warn(
        'Heal pass finished with remaining failures — final AIR will include them.'
      );
    }
  } else {
    playwrightExit = healStatus;
    console.warn(
      'Heal pass did not produce mergeable results; using heal exit status.'
    );
  }
} else if (
  playwrightExit !== 0 &&
  !healEnabled
) {
  console.log('Heal pass disabled (--no-heal).');
}

if (!fs.existsSync(resultsPath) && fs.existsSync(resultsBackupPath)) {
  restoreMainResultsIfMissing();
}

if (!fs.existsSync(resultsPath)) {
  console.warn(
    'WARNING: test-results/results.json is missing after the suite. AIR may restore history or stay empty — re-run without aborting mid-suite.'
  );
}

run(node, [path.join(projectRoot, 'scripts', 'generate-air-results.js')]);
run(node, [path.join(projectRoot, 'scripts', 'generate-execution-report.js')]);

if (sendEmail) {
  const cleanCheck = isAirRunClean(projectRoot);

  if (!cleanCheck.clean || playwrightExit !== 0) {
    const reason =
      playwrightExit !== 0 && cleanCheck.clean
        ? `Playwright exit code ${playwrightExit} — report email will not be sent.`
        : cleanCheck.reason;

    console.warn(`Report email skipped (run not clean): ${reason}`);
  } else {
    const { recipients, skipped } = collectConfiguredRecipients();

    if (skipped.length) {
      console.log(`Schedule/report email will skip: ${skipped.join(', ')}`);
    }

    if (!recipients.length) {
      console.warn(
        'No REPORT_EMAIL_TO / REPORT_EMAIL_CC configured, so the AIR report was not emailed.'
      );
    } else {
      console.log(
        `Clean run — emailing AIR report to ${recipients.length} configured recipient(s): ${recipients.join(', ')}`
      );

      const emailStatus = run(node, [
        path.join(projectRoot, 'scripts', 'send-report-email.js'),
        '--label',
        'Complete suite',
        '--only-if-clean'
      ]);

      if (emailStatus !== 0) {
        console.warn('Complete suite finished, but the report email did not send.');
      }
    }
  }
} else {
  console.log(
    'Report email skipped (default). Pass --email to send only when the run is clean (0 failed).'
  );
}

if (playwrightExit !== 0) {
  console.log(
    `Playwright finished with exit code ${playwrightExit}. AIR was still generated.`
  );
  process.exit(playwrightExit);
}

console.log('Complete suite finished.');
