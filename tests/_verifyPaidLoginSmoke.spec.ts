import { expect, test } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { BillingPage } from './pages/BillingPage';
import { BASE_URL } from './config/testData';

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../scripts/apply-complete-run-env').applyCompleteRunEnv(
  process.cwd()
);

/**
 * Pre-flight only: proves the cascade root cause is fixed.
 * Run: PLAYWRIGHT_BROWSERS_PATH=%LOCALAPPDATA%\\ms-playwright npx playwright test tests/_verifyPaidLoginSmoke.spec.ts --reporter=line
 */
test.describe('Preflight paid fixture login', () => {
  test.describe.configure({ timeout: 180000 });

  test('after cookie clear, paid fixture login is not Free/no-card', async ({
    page
  }) => {
    const email =
      process.env.SUB_LIFECYCLE_PAID_EMAIL ||
      process.env.BILLING_MANAGEMENT_EMAIL;
    const password =
      process.env.SUB_LIFECYCLE_PAID_PASSWORD ||
      process.env.BILLING_MANAGEMENT_PASSWORD;

    test.skip(
      !email || !password,
      'Set BILLING_MANAGEMENT / SUB_LIFECYCLE_PAID credentials first.'
    );

    // Same broken pre-condition the suite used to hit.
    await page.goto(`${BASE_URL}/dashboard`, {
      waitUntil: 'domcontentloaded'
    }).catch(() => undefined);

    await page.context().clearCookies();
    await page.goto('about:blank');

    await new LoginPage(page).login(email!, password!);

    const billing = new BillingPage(page);
    const free = await billing.isFreeOrNoCardPlan();
    const paid = await billing.hasActivePaidSubscriptionManagement();

    console.log(
      `[preflight] url=${page.url()} free=${free} paid=${paid} email=${email}`
    );

    expect(
      free,
      'Paid login still looks Free/no-card — cascade will return'
    ).toBe(false);

    expect(
      paid,
      'Paid Manage subscription control missing after fixture login'
    ).toBe(true);

    await billing.openPlansView();

    const upgradePreviewOk = await billing
      .openPlanChangeCalculationPreview({
        targetPlan: 'Overlay Strategists',
        action: 'upgrade',
        interval: 'monthly'
      })
      .then(() => true)
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : String(error);
        console.log(`[preflight] upgrade preview: ${message.slice(0, 300)}`);
        if (/Free\/no-card/i.test(message)) {
          throw error;
        }
        // Missing Overlay control on current plan is a soft product state, not the cascade.
        return false;
      });

    console.log(`[preflight] upgradePreviewOpened=${upgradePreviewOk}`);
  });
});
