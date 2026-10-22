const { spawnSync } = require('child_process');
const path = require('path');
const { applyCompleteRunEnv } = require('../scripts/apply-complete-run-env');

const root = path.resolve(__dirname, '..');
applyCompleteRunEnv(root);

// Cursor agents often inject an empty sandbox browser cache — always use the
// real local install for verification so we do not false-fail on missing chrome.
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright'
);
process.env.SKIP_AIR_REPORT = 'true';

const node = process.execPath;
const cli = path.join(root, 'node_modules', 'playwright', 'cli.js');

function run(label, args) {
  console.log(`\n=== ${label} ===`);
  console.log(
    `PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH}`
  );
  const status =
    spawnSync(node, [cli, ...args], {
      cwd: root,
      env: process.env,
      stdio: 'inherit'
    }).status ?? 1;
  console.log(`${label} exit: ${status}`);
  return status;
}

const preflight = run('1/2 Preflight paid login', [
  'test',
  '-c',
  'playwright.preflight.config.ts',
  '--reporter=line'
]);

if (preflight !== 0) {
  console.error(
    'PREFLIGHT FAILED — do not start the full suite until paid login is green.'
  );
  process.exit(preflight);
}

const focused = run('2/2 Prior failure titles only', [
  'test',
  'tests/SubscriptionLifecycleExecution.spec.ts',
  'tests/OptionExpiryOverview.spec.ts',
  'tests/PositionsDynamicGrid.spec.ts',
  'tests/Opportunities.spec.ts',
  'tests/DashboardCoverageDepth.spec.ts',
  'tests/DashboardScenarioSweep.spec.ts',
  'tests/UpgradeSubscriptionMatrix.spec.ts',
  'tests/DowngradeSubscriptionMatrix.spec.ts',
  'tests/MonthlyAnnualBillingChangeMatrix.spec.ts',
  'tests/SubscriptionCancellationMatrix.spec.ts',
  'tests/FailedPaymentDunningMatrix.spec.ts',
  'tests/SubscriptionLifecycleE2EMatrix.spec.ts',
  '-g',
  'preview monthly and annual upgrade|preview downgrade|Option Expiry|call filter|Opportunity save view|Support changes ticket|Support walks every|SC-86 |SC-88 |SC-91 |SC-109 |SC-121 |SC-143 |SC-187 |SC-262 |SC-313 |SC-314 |SC-328 |LC-009 |LC-018 |LC-023 |LC-024 |LC-025 |LC-026 |LC-031 |LC-032 |LC-033 |LC-035 |LC-043 ',
  '--reporter=line'
]);

process.exit(focused);
