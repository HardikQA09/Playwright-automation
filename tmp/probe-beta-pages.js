const { chromium } = require('playwright');
const path = require('path');
const { applyCompleteRunEnv } = require('../scripts/apply-complete-run-env');

applyCompleteRunEnv(path.resolve(__dirname, '..'));
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright'
);

const pages = [
  { name: 'Broker transactions', path: '/dashboard/beta/transactions' },
  { name: 'Position P&L', path: '/dashboard/beta/position-pnl' },
  { name: 'Option Overlay P&L', path: '/dashboard/beta/option-overlay-pnl' },
  { name: 'Roll Configuration', path: '/dashboard/roll-config' }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://uat.ooltool.com/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').first().fill('imhardikthanki+e2e@gmail.com');
  await page.locator('input[type=password]').first().fill('H@rdik9944');
  await page.getByRole('button', { name: /sign in|log in|login/i }).first().click();
  await page.waitForTimeout(6000);
  if (/login/i.test(page.url())) {
    // retry once
    await page.locator('input[type=email]').first().fill('imhardikthanki+e2e@gmail.com');
    await page.locator('input[type=password]').first().fill('H@rdik9944');
    await page.getByRole('button', { name: /sign in|log in|login/i }).first().click();
    await page.waitForTimeout(6000);
  }
  console.log('logged url', page.url());

  for (const entry of pages) {
    await page.goto(`https://uat.ooltool.com${entry.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const title = await page.title();
    const h1 = await page.locator('h1').allTextContents().catch(() => []);
    const buttons = await page.getByRole('button').evaluateAll((els) =>
      [...new Set(els.map((el) => (el.textContent || '').trim().replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 25)
    );
    const combos = await page.getByRole('combobox').evaluateAll((els) =>
      els.map((el) => (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80))
    );
    const tabs = await page.getByRole('tab').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim().replace(/\s+/g, ' '))
    );
    const links = await page.locator('main a').evaluateAll((els) =>
      [...new Set(els.map((el) => (el.textContent || '').trim().replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 15)
    );
    const bodySnippet = (await page.locator('main').innerText().catch(() => '')).slice(0, 600);
    console.log('\n====', entry.name, entry.path, '====');
    console.log('url', page.url());
    console.log('title', title);
    console.log('h1', h1);
    console.log('tabs', tabs);
    console.log('combos', combos);
    console.log('buttons', buttons);
    console.log('links', links);
    console.log('main snippet:\n', bodySnippet);
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
