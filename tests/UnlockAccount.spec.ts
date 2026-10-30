import {
  test
} from '@playwright/test';

import { LoginPage }
  from './pages/LoginPage';

import { DashboardPage }
  from './pages/DashboardPage';

import {
  TEST_USERS
} from './config/testData';

/* =============================================================================
TEST SUITE: Unlock Account

PURPOSE
-------
Requests an unlock link for a temporarily locked account, pauses for the manual
email-link step, then validates the user can log in again.

Run:
$env:RUN_UNLOCK_ACCOUNT_TEST="true"
$env:UNLOCK_ACCOUNT_EMAIL="imhardikthanki+fx-unlock-locked-none@gmail.com"
$env:UNLOCK_ACCOUNT_PASSWORD="your-password"
npx playwright test tests/UnlockAccount.spec.ts --headed

Fixture roster: tests/config/preparedSubscriptionUsers.data.json (UNLOCK_ACCOUNT)
               tests/config/fixture-accounts.env.example

============================================================================= */

const unlockAccountEmail =
  process.env.UNLOCK_ACCOUNT_EMAIL ??
  'imhardikthanki+fx-unlock-locked-none@gmail.com';

const unlockAccountPassword =
  process.env.UNLOCK_ACCOUNT_PASSWORD ??
  TEST_USERS.subscriber.password;

if (
  process.env.RUN_UNLOCK_ACCOUNT_TEST === 'true'
) {
  test(
    'Unlock Account Flow',
    async ({ page }) => {

    test.setTimeout(
      5 * 60 * 1000
    );

    const login =
      new LoginPage(
        page
      );

    await login.requestUnlockLink(
      unlockAccountEmail,
      unlockAccountPassword
    );

    console.log(
      'Open the unlock email link in the Playwright browser, then resume.'
    );

    await page.pause();

    await login.login(
      unlockAccountEmail,
      unlockAccountPassword
    );

    const dashboard =
      new DashboardPage(
        page
      );

    await dashboard.validate();
    }
  );
}
