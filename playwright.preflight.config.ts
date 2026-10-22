import { defineConfig, devices } from '@playwright/test';
import './tests/config/loadLocalEnv';

/**
 * Short preflight only — not used by npm run complete.
 *   npx playwright test -c playwright.preflight.config.ts --reporter=line
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '_verifyPaidLoginSmoke.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  reporter: [['line']],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off'
  }
});
