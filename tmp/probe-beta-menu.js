const { chromium } = require('playwright');
const path = require('path');
const { applyCompleteRunEnv } = require('../scripts/apply-complete-run-env');

applyCompleteRunEnv(path.resolve(__dirname, '..'));
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright'
);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://uat.ooltool.com/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').first().fill('imhardikthanki+e2e@gmail.com');
  await page.locator('input[type=password]').first().fill('H@rdik9944');
  await page.getByRole('button', { name: /sign in|log in|login/i }).first().click();
  await page.waitForTimeout(5000);
  console.log('url after login', page.url());

  await page.getByRole('button', { name: /^beta$/i }).hover();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^beta$/i }).click().catch(() => undefined);
  await page.waitForTimeout(800);

  const items = await page.locator('[role="menu"] [role="menuitem"], [role="menu"] a, [data-radix-menu-content] a, [data-state="open"] a, [data-state="open"] [role="menuitem"]').evaluateAll((els) =>
    els.map((el) => ({
      text: (el.textContent || '').trim().replace(/\s+/g, ' '),
      href: el.getAttribute('href'),
      role: el.getAttribute('role')
    }))
  );
  console.log('beta items', JSON.stringify(items, null, 2));

  // Also dump any visible menu text
  const menuText = await page.locator('[role="menu"], [data-radix-menu-content], [data-state="open"]').first().innerText().catch(() => '');
  console.log('menu text:\n', menuText);

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
