import {
  BASE_URL
} from './config/testData';

import { DashboardPage }
  from './pages/DashboardPage';

import {
  expect,
  test
} from './fixtures/subscriberAuth';

import { safeClick }
  from './helpers/safeClick';

/* =============================================================================
TEST SUITE: Dashboard Widgets

PURPOSE
-------
Confirms the signed-in dashboard shows portfolio, score, events, allocation,
strategy, broker, opportunity, and expiry cards. Amounts and symbols are
checked by shape, because those values change with the account.
There is no View full expiry calendar control and no OolTool Performance card.
Short Options and Long Options are filters on Option Expiry Overview (below
Top 10 Opportunities), not a separate calendar button.

RUN
---
npx playwright test tests/DashboardWidgets.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Dashboard Widgets',
  () => {

    test.describe.configure({
      timeout: 120000
    });

    test(
      'Dashboard shows portfolio score events allocation and opportunities',
      async ({ page }) => {
        const dashboard =
          new DashboardPage(
            page
          );

        await page.goto(
          `${BASE_URL}/dashboard`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await dashboard.validateLoaded();

        await test.step(
          'Portfolio value',
          async () => {
            await dashboard.validatePortfolioSummary();
          }
        );

        await test.step(
          'Ools score',
          async () => {
            await dashboard.validateOolsScore();
          }
        );

        await test.step(
          'Upcoming events',
          async () => {
            await dashboard.validateUpcomingEvents();
          }
        );

        await test.step(
          'Asset allocation',
          async () => {
            await dashboard.validateAssetAllocation();
          }
        );

        await test.step(
          'Option strategy breakdown',
          async () => {
            await dashboard.validateOptionStrategyBreakdown();
          }
        );

        await test.step(
          'Broker accounts',
          async () => {
            await dashboard.validateBrokerAccounts();
          }
        );

        await test.step(
          'Top 10 opportunities',
          async () => {
            await dashboard.validateTopOpportunities();
          }
        );

        await test.step(
          'Option expiry overview',
          async () => {
            await dashboard.validateExpiryOverview();
          }
        );

        await test.step(
          'Card links',
          async () => {
            await dashboard.validateDashboardCardLinks();
          }
        );
      }
    );

    test(
      'View all opportunities opens the list and returns',
      async ({ page }) => {
        const dashboard =
          new DashboardPage(
            page
          );

        await page.goto(
          `${BASE_URL}/dashboard`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await dashboard.validateLoaded();

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /view all opportunities/i
            }
          ).first(),
          'View all opportunities'
        );

        await expect(
          page
        ).toHaveURL(
          /\/dashboard\/opportunities/
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^opportunities$/i
            }
          )
        ).toBeVisible();

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^dashboard$/i
            }
          ).first(),
          'Dashboard'
        );

        await expect(
          page
        ).toHaveURL(
          /\/dashboard\/?$/
        );

        await dashboard.validateLoaded();
      }
    );
  }
);
