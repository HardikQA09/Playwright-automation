import { defineConfig, devices } from '@playwright/test';

import './tests/config/loadLocalEnv';

/**
 * Config for one-shot named fixture creation only.
 * Not part of the daily complete / AIR inventory.
 *
 *   npx playwright test -c playwright.prepare.config.ts
 *   npm run fixtures:prepare
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '_PrepareNamedFixtures.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 45 * 60 * 1000,
  reporter: [['line']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 30000,
    navigationTimeout: 30000,
    ...devices['Desktop Chrome']
  }
});
