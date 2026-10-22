import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { applyCompleteRunEnv } = require(path.join(root, 'scripts', 'apply-complete-run-env.js'));

applyCompleteRunEnv(root);

const email =
  process.env.SUB_LIFECYCLE_PAID_EMAIL ||
  process.env.BILLING_MANAGEMENT_EMAIL;
const password =
  process.env.SUB_LIFECYCLE_PAID_PASSWORD ||
  process.env.BILLING_MANAGEMENT_PASSWORD;
const baseUrl = process.env.BASE_URL || 'https://uat.ooltool.com';

if (!email || !password) {
  console.error('FAIL: paid fixture email/password missing');
  process.exit(2);
}

process.env.PLAYWRIGHT_BROWSERS_PATH =
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');

const { LoginPage } = await import(
  pathToFileURLSafe(path.join(root, 'tests', 'pages', 'LoginPage.ts'))
).catch(async () => {
  // TS pages need playwright test runner; use compiled approach via dynamic register.
  return { LoginPage: null };
});

function pathToFileURLSafe(p) {
  return 'file:///' + p.replace(/\\/g, '/');
}

// Use Playwright test runner for TS page objects instead of raw import.
console.log('Use verify-paid-login via playwright test instead for TS pages.');
console.log({ email, baseUrl, browsers: process.env.PLAYWRIGHT_BROWSERS_PATH });
process.exit(0);
