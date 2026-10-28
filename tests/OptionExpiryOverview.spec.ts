import {
  ADD_POSITION_OPTION,
  BASE_URL
} from './config/testData';

import { AddPositionPage }
  from './pages/AddPositionPage';

import { DashboardPage }
  from './pages/DashboardPage';

import { OptionExpiryOverviewPage }
  from './pages/OptionExpiryOverviewPage';

import {
  test
} from './fixtures/subscriberAuth';

/* =============================================================================
TEST SUITE: Option Expiry Overview revamp

PURPOSE
-------
Validates the dashboard Option Expiry Overview card against the revamp:
Short/Long tabs, OTM–ITM legend, integer breakdown, footer totals,
and the row drill-down modal with distance formula.
TAB TOTAL is out of scope.

RUN
---
npx playwright test tests/OptionExpiryOverview.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Option Expiry Overview revamp',
  () => {

    test.describe.configure({
      timeout: 120000
    });

    test.use({
      viewport: {
        width: 1440,
        height: 1100
      }
    });

    test.beforeEach(
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
      }
    );

    test(
      'Dashboard expiry overview has Short and Long tabs and OTM to ITM legend',
      async ({ page }) => {
        const expiry =
          new OptionExpiryOverviewPage(
            page
          );

        await expiry.expectMainCardStructure();
      }
    );

    test(
      'Dashboard expiry overview footer lists OTM NTM ATM ITM counts',
      async ({ page }) => {
        const expiry =
          new OptionExpiryOverviewPage(
            page
          );

        await expiry.expectFooterTotals();
      }
    );

    test(
      'Dashboard expiry overview breakdown uses integer contract counts',
      async ({ page }) => {
        const expiry =
          new OptionExpiryOverviewPage(
            page
          );

        await expiry.expectIntegerBreakdown();
      }
    );

    test(
      'Dashboard expiry overview row opens a drill-down modal',
      async ({ page }) => {
        const expiry =
          new OptionExpiryOverviewPage(
            page
          );

        await expiry.expectDrillDownModal();
      }
    );

    test(
      'Dashboard expiry overview call distance matches ((S - K) / K) x 100',
      async ({ page }) => {
        const dashboard =
          new DashboardPage(
            page
          );
        const expiry =
          new OptionExpiryOverviewPage(
            page
          );

        // Seed a Long Call when the overview has no Long Options rows.
        await expiry.openLongOptions();
        const noLongRows =
          await page
            .getByText(/no (open )?long.*(option|expir)/i)
            .first()
            .isVisible()
            .catch(() => false);

        if (noLongRows) {
          await new AddPositionPage(
            page
          ).addOptionPosition({
            ...ADD_POSITION_OPTION,
            right: 'Call'
          });

          await page.goto(
            `${BASE_URL}/dashboard`,
            {
              waitUntil: 'domcontentloaded'
            }
          );
          await dashboard.validateLoaded();
        }

        await expiry.expectCallDistanceMatchesFormula();
      }
    );
  }
);
