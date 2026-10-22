const { spawnSync } = require('child_process');
const path = require('path');
const { applyCompleteRunEnv } = require('../scripts/apply-complete-run-env');

const root = path.resolve(__dirname, '..');
applyCompleteRunEnv(root);
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright'
);
process.env.SKIP_AIR_REPORT = 'true';
process.env.SUB_LIFECYCLE_CREATE_DISPOSABLE_USER = 'false';
process.env.SUB_LIFECYCLE_USE_PREPARED_USER = 'true';

const node = process.execPath;
const cli = path.join(root, 'node_modules', 'playwright', 'cli.js');

function run(label, args) {
  console.log(`\n=== ${label} ===`);
  const status =
    spawnSync(node, [cli, ...args], {
      cwd: root,
      env: process.env,
      stdio: 'inherit'
    }).status ?? 1;
  console.log(`${label} exit: ${status}`);
  return status;
}

let status = run('Preflight paid login', [
  'test',
  '-c',
  'playwright.preflight.config.ts',
  '--reporter=line'
]);
if (status !== 0) process.exit(status);

// Core cascade + UI checks only (no long disposable purchase packs).
status = run('Core prior failures', [
  'test',
  'tests/SubscriptionLifecycleExecution.spec.ts',
  'tests/OptionExpiryOverview.spec.ts',
  'tests/PositionsDynamicGrid.spec.ts',
  'tests/Opportunities.spec.ts',
  'tests/UpgradeSubscriptionMatrix.spec.ts',
  'tests/SubscriptionLifecycleE2EMatrix.spec.ts',
  '-g',
  'preview monthly and annual upgrade|preview downgrade|Option Expiry|call filter|Opportunity save view|SC-86 |SC-88 |SC-91 |LC-009 |LC-023 |LC-024 |LC-025 |LC-026 |LC-031 |LC-032 ',
  '--reporter=line'
]);

process.exit(status);
