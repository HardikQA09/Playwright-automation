import { test, expect } from '@playwright/test';
import { applyCompleteRunEnv } from '../scripts/apply-complete-run-env.js';

// Smoke-only: prove paid fixture login works after cookie clear (the cascade root cause).
// Not part of the inventory — run via explicit path.

test.describe('Paid fixture login smoke', () => {
  test('cleared session can sign in as paid Income fixture and is not Free/no-card', async ({
    page
  }) => {
    // Load flags the same way complete suite does.
    applyCompleteRunEnv(process.cwd());

    const { LoginPage } = await import('../tests/pages/LoginPage');
    const { BillingPage } = await import('../tests/pages/BillingPage');

    const email =
      process.env.SUB_LIFECYCLE_PAID_EMAIL ||
      process.env.BILLING_MANAGEMENT_EMAIL;
    const password =
      process.env.SUB_LIFECYCLE_PAID_PASSWORD ||
      process.env.BILLING_MANAGEMENT_PASSWORD;

    expect(email, 'paid fixture email').toBeTruthy();
    expect(password, 'paid fixture password').toBeTruthy();

    // Simulate the broken pre-condition from the full suite.
    await page.goto(
      process.env.BASE_URL
        ? `${process.env.BASE_URL}/dashboard`
        : 'https://uat.ooltool.com/dashboard',
      { waitUntil: 'domcontentloaded' }
    ).catch(() => undefined);

    await page.context().clearCookies();
    await page.goto('about:blank');

    await new LoginPage(page).login(email!, password!);

    const billing = new BillingPage(page);
    const free = await billing.isFreeOrNoCardPlan();
    const paid = await billing.hasActivePaidSubscriptionManagement();

    console.log(
      JSON.stringify({
        url: page.url(),
        free,
        paid,
        email
      })
    );

    expect(free, 'must not still look Free/no-card after paid login').toBe(
      false
    );
    expect(paid, 'Manage subscription / paid controls should be present').toBe(
      true
    );
  });
});
