/**
 * Creates (or reuses) a paid Income Builder monthly UAT user and writes
 * BILLING_MANAGEMENT_* + SUB_LIFECYCLE_PAID_* into .env so matrix Controlled
 * rows stop skipping for "no active paid subscription".
 *
 *   node scripts/provision-paid-billing-fixture.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const outFile = path.join(root, 'test-results', 'paid-billing-fixture.json');
const runnerSpec = path.join(root, 'scripts', '_provision-paid-runner.spec.ts');

function upsertEnv(key, value) {
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  if (!text.endsWith('\n') && text.length) text += '\n';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, line);
  else text += `${line}\n`;
  fs.writeFileSync(envPath, text);
}

function readFixture() {
  if (!fs.existsSync(outFile)) return null;
  return JSON.parse(fs.readFileSync(outFile, 'utf8'));
}

// Tiny Playwright runner (kept under scripts/ so it is not part of npm test).
const runnerSource = `import fs from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { TEST_USERS } from '../tests/config/testData';
import { registerAndReachPlanSelection } from '../tests/helpers/stripeMatrixExecution';
import { BillingPage } from '../tests/pages/BillingPage';
import { LoginPage } from '../tests/pages/LoginPage';
import { PlanSelectionPage } from '../tests/pages/PlanSelectionPage';
import { StripePaymentPage } from '../tests/pages/StripePaymentPage';

const OUT = path.join(process.cwd(), 'test-results', 'paid-billing-fixture.json');

test.describe.configure({ timeout: 8 * 60 * 1000 });

test('provision paid billing fixture', async ({ page }) => {
  const password = TEST_USERS.onboarding.password;
  const { email } = await registerAndReachPlanSelection(page, 'paid-fix');
  const plans = new PlanSelectionPage(page);
  await plans.selectMonthlyBilling();
  await plans.selectPlan('Income Builder');
  await expect(page).toHaveURL(/checkout\\.stripe\\.com/, { timeout: 60000 });
  await new StripePaymentPage(page).completePayment();
  const billing = new BillingPage(page);
  await billing.validateOverview();
  expect(await billing.hasActivePaidSubscriptionManagement()).toBeTruthy();
  await page.context().clearCookies();
  await page.goto('about:blank').catch(() => undefined);
  await new LoginPage(page).login(email, password);
  await billing.validateOverview();
  expect(await billing.hasActivePaidSubscriptionManagement()).toBeTruthy();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ email, password, plan: 'Income Builder', interval: 'monthly', createdAt: new Date().toISOString() }, null, 2));
  console.log('[paid-fixture] ready', email);
});
`;

fs.writeFileSync(runnerSpec, runnerSource);

const configPath = path.join(root, 'scripts', '_provision-paid.playwright.config.ts');
fs.writeFileSync(
  configPath,
  `import { defineConfig, devices } from '@playwright/test';
import '../tests/config/loadLocalEnv';
export default defineConfig({
  testDir: '.',
  testMatch: '_provision-paid-runner.spec.ts',
  timeout: 8 * 60 * 1000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], trace: 'off', video: 'off', screenshot: 'only-on-failure' },
});
`
);

process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright'
);
process.env.SKIP_AIR_REPORT = 'true';

console.log('Provisioning disposable paid Income Builder monthly fixture...');
const result = spawnSync(
  'npx',
  ['playwright', 'test', '-c', configPath, '--workers=1'],
  { cwd: root, env: process.env, stdio: 'inherit', shell: true }
);

if (result.status !== 0) {
  console.error('Provisioning failed.');
  process.exit(result.status ?? 1);
}

const fixture = readFixture();
if (!fixture?.email || !fixture?.password) {
  console.error('Fixture file missing after provision run.');
  process.exit(1);
}

upsertEnv('BILLING_MANAGEMENT_EMAIL', fixture.email);
upsertEnv('BILLING_MANAGEMENT_PASSWORD', fixture.password);
upsertEnv('SUB_LIFECYCLE_PAID_EMAIL', fixture.email);
upsertEnv('SUB_LIFECYCLE_PAID_PASSWORD', fixture.password);
upsertEnv('SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED', 'true');
// Prefer the prepared paid fixture for non-mutating previews (faster, stable).
upsertEnv('SUB_LIFECYCLE_CREATE_DISPOSABLE_USER', 'false');
upsertEnv('SUB_LIFECYCLE_USE_PREPARED_USER', 'true');

console.log('');
console.log('Wrote paid fixture into .env:');
console.log(`  BILLING_MANAGEMENT_EMAIL=${fixture.email}`);
console.log('  BILLING_MANAGEMENT_PASSWORD=***');
console.log(`  SUB_LIFECYCLE_PAID_EMAIL=${fixture.email}`);
console.log('  SUB_LIFECYCLE_PAID_PASSWORD=***');
console.log('  SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED=true');
console.log('  SUB_LIFECYCLE_CREATE_DISPOSABLE_USER=true');
console.log('  SUB_LIFECYCLE_USE_PREPARED_USER=true');
console.log('');
console.log('Next full run should unlock most Controlled paid-billing skips.');
