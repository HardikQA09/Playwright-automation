import { defineConfig, devices } from '@playwright/test';

import './tests/config/loadLocalEnv';
import {
  watchDelayMs
} from './tests/config/watchMode';
import {
  assertAllSpecsAreListed,
  journeyProjectName,
  playwrightTestMatch
} from './scripts/execution-order';

assertAllSpecsAreListed();

const recordAllArtifacts =
  process.env.RECORD_ALL_ARTIFACTS === 'true';

const recordVideo =
  recordAllArtifacts ||
  process.env.RECORD_VIDEO === 'true';

const watchDelay =
  watchDelayMs();

const listingTests =
  process.argv.includes(
    '--list'
  );

if (watchDelay > 0) {
  console.log(
    `Watch mode: slowing each Playwright action by ${watchDelay}ms. Unset WATCH/SLOW_MO for full speed.`
  );
}

export default defineConfig({
  testDir: './tests',
  globalTeardown: './scripts/open-air-report.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: Number(
    process.env.PLAYWRIGHT_RETRIES ??
      (process.env.CI ? 2 : 0)
  ),
  workers: 1,
  // A single check often finishes inside 30s. The same check in the full
  // suite starts later, when UAT is slower, and the default 30s budget
  // expires before the screen is ready.
  timeout: 90000,

  reporter: listingTests
    ? [['list']]
    : [
      ['./scripts/run-progress-reporter.js'],
      ['dot'],
      ['html', {
        open: 'never',
        title: 'OOLTool UAT Automation Report',
      }],
      ['json', {
        outputFile:
          process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ??
          'test-results/results.json',
      }],
    ],

  use: {
    // Screenshots on every check when RECORD_ALL_ARTIFACTS=true. Full traces
    // on every check OOM/crash Windows after ~50 tests, so keep traces on
    // failure only unless RECORD_TRACE=true.
    trace: process.env.RECORD_TRACE === 'true'
      ? 'on'
      : recordAllArtifacts
        ? 'retain-on-failure'
        : 'on-first-retry',
    screenshot: recordAllArtifacts ? 'on' : 'only-on-failure',
    video: recordVideo ? 'retain-on-failure' : 'off',

    actionTimeout: 30000,
    navigationTimeout: 30000,

    launchOptions: {
      slowMo: watchDelay,
    },
  },

  // Unique names j01, j02, … keep journey order. Names like "01-chromium"
  // are sanitized to "chromium" then suffixed chromium6, which workers
  // cannot resolve. AIR still records these as chromium.
  projects: playwrightTestMatch.map((file, index) => ({
    name: journeyProjectName(index),
    testMatch: file,
    use: {
      ...devices['Desktop Chrome'],
    },
  })),
});
