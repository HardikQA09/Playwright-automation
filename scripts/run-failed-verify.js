/**
 * Re-run only specs that failed in the last artifact set.
 * Does NOT send email. Does NOT run the full suite.
 *
 * Usage:
 *   node scripts/run-failed-verify.js
 *   node scripts/run-failed-verify.js --list
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { applyCompleteRunEnv } = require('./apply-complete-run-env');

const projectRoot = path.resolve(__dirname, '..');
applyCompleteRunEnv(projectRoot);

// Prefer the machine Playwright browser cache when the Cursor sandbox
// cache is missing headless_shell builds.
const localBrowsers = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright'
);
if (
  !process.env.PLAYWRIGHT_BROWSERS_PATH_OVERRIDE &&
  fs.existsSync(localBrowsers)
) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
}

const listOnly = process.argv.includes('--list');
const artifacts = path.join(projectRoot, 'test-results', 'failed-specs.json');

if (!fs.existsSync(artifacts)) {
  spawnSync(process.execPath, [path.join(__dirname, 'list-failed-from-artifacts.js')], {
    cwd: projectRoot,
    stdio: 'inherit'
  });
}

if (!fs.existsSync(artifacts)) {
  console.error('No failed-specs.json — nothing to verify.');
  process.exit(1);
}

const { specs, titles } = JSON.parse(fs.readFileSync(artifacts, 'utf8'));

if (!specs.length) {
  console.error('failed-specs.json has zero specs.');
  process.exit(1);
}

console.log(`[failed-verify] ${specs.length} specs / ${titles.length} titles`);
console.log(`[failed-verify] fixture ${process.env.SUB_LIFECYCLE_PAID_EMAIL}`);

if (listOnly) {
  specs.forEach((s) => console.log(s));
  process.exit(0);
}

const env = {
  ...process.env,
  PLAYWRIGHT_RETRIES: process.env.PLAYWRIGHT_RETRIES ?? '0',
  PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(
    projectRoot,
    'test-results',
    'results-failed-verify.json'
  )
};

// Match only the previously failed titles (not every test in those files).
// Prefer short SC-### tokens so cmd.exe cannot split on spaces.
const titleFragments = [];
for (const full of titles) {
  const leaf = String(full).split('>>').pop().trim();
  const sc = leaf.match(/\bSC-\d+\b/);
  if (sc) {
    titleFragments.push(sc[0]);
    continue;
  }
  titleFragments.push(
    leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
}

const uniqueGrep = [...new Set(titleFragments)].filter(Boolean);
const grep =
  uniqueGrep.length > 0
    ? uniqueGrep.join('|')
    : undefined;

const grepFile = path.join(projectRoot, 'test-results', 'failed-grep.txt');
if (grep) {
  fs.writeFileSync(grepFile, grep, 'utf8');
}

const args = [
  'playwright',
  'test',
  ...specs,
  '--reporter=list,./scripts/run-progress-reporter.js'
];

if (grep) {
  args.push(`--grep=${grep}`);
}

console.log(
  `[failed-verify] grep covers ${uniqueGrep.length} failed titles`
);

// Invoke Playwright via node (avoids Windows npx.cmd EINVAL / shell quoting).
const playwrightCli = path.join(
  projectRoot,
  'node_modules',
  '@playwright',
  'test',
  'cli.js'
);

const result = spawnSync(
  process.execPath,
  [playwrightCli, ...args.slice(1)],
  {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    shell: false
  }
);

process.exit(result.status ?? 1);
