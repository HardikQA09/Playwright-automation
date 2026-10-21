const { spawnSync } = require('child_process');
const path = require('path');
const { applyCompleteRunEnv } = require('./apply-complete-run-env');

const {
  assertAllSpecsAreListed,
  printOrder,
  printSchedule,
  scheduleGroups,
  suites,
  testPaths
} = require('./execution-order');

const { hasGmail } = applyCompleteRunEnv(
  path.join(__dirname, '..')
);

if (!hasGmail) {
  console.warn(
    'GMAIL_APP_PASSWORD is not set. Disposable-user email verification will skip instead of fail. Overlay, direct checkout, and plan-ladder inspect need Gmail to stay near the Oct 12 skip count.'
  );
}

assertAllSpecsAreListed();

const suiteName = process.argv[2];
const extra = process.argv.slice(3);

if (suiteName === 'schedule') {
  printSchedule();
  process.exit(0);
}

// Run just one named group from the schedule, e.g.
//   node scripts/run-ordered-tests.js group "Billing pages"
//   node scripts/run-ordered-tests.js groups     (lists the group names)
const allGroups = scheduleGroups.flatMap((band) =>
  band.groups.map((group) => ({ ...group, band }))
);

if (suiteName === 'groups') {
  for (const group of allGroups) {
    console.log(
      `${group.name}  (${group.band.cadence}, ${group.files.length} specs)`
    );
  }

  process.exit(0);
}

if (suiteName === 'group') {
  const wanted = (extra[0] ?? '').trim().toLowerCase();
  const group = allGroups.find(
    (item) => item.name.toLowerCase() === wanted
  );

  if (!group) {
    console.error(`Unknown group "${extra[0] ?? ''}". Groups:`);
    allGroups.forEach((item) => console.error(`  ${item.name}`));
    process.exit(1);
  }

  console.log(
    `Group "${group.name}" (${group.band.cadence}): ${group.files.length} spec file(s)`
  );

  const groupResult = spawnSync(
    path.join(
      __dirname,
      '..',
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
    ),
    ['test', ...testPaths(group.files), ...extra.slice(1)],
    {
      cwd: path.join(__dirname, '..'),
      env: process.env,
      shell: true,
      stdio: 'inherit'
    }
  );

  process.exit(groupResult.status ?? 1);
}

if (!suiteName || !suites[suiteName]) {
  console.error(
    'Usage: node scripts/run-ordered-tests.js <suite> [-- playwright args]'
  );
  console.error(`Suites: ${Object.keys(suites).sort().join(', ')}`);
  process.exit(1);
}

const files = testPaths(suites[suiteName]);
const playwright = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
);

const scheduleBand = scheduleGroups.find((band) => band.id === suiteName);

if (scheduleBand) {
  const included = scheduleGroups.filter(
    (band) => band.priority <= scheduleBand.priority
  );

  console.log(
    `Priority ${scheduleBand.priority} (${scheduleBand.cadence}): ${files.length} spec file(s)`
  );

  for (const band of included) {
    console.log(`Priority ${band.priority} — ${band.cadence}`);

    for (const group of band.groups) {
      console.log(`  ${group.name}: ${group.files.length} specs`);
    }
  }
} else {
  console.log(`Journey-ordered suite "${suiteName}": ${files.length} spec file(s)`);
  printOrder(suites[suiteName]);
}

const result = spawnSync(
  playwright,
  ['test', ...files, ...extra],
  {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    shell: true,
    stdio: 'inherit'
  }
);

process.exit(result.status ?? 1);
