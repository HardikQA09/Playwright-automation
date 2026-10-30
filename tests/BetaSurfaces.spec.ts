import {
  test,
  expect
} from '@playwright/test';

import {
  BASE_URL,
  TEST_USERS
} from './config/testData';

import {
  LoginPage
} from './pages/LoginPage';

import {
  DashboardPage
} from './pages/DashboardPage';

import {
  BetaSurfacesPage,
  BETA_DESTINATIONS
} from './pages/BetaSurfacesPage';

import {
  RollConfigurationPage
} from './pages/RollConfigurationPage';

/* =============================================================================
TEST SUITE: Beta menu surfaces (e2e account)

PURPOSE
-------
Walk every Beta destination available to imhardikthanki+e2e@gmail.com and
run non-destructive scenarios: menu inventory, grid headers/sort/page size,
Portfolio Profit & Loss period toggles, and Roll Configuration presets.

Beta destinations:
- Broker transactions  → /dashboard/beta/transactions
- Position P&L         → /dashboard/beta/position-pnl
- Profit & Loss        → /dashboard/beta/option-overlay-pnl (page title: Portfolio Profit & Loss)
- Roll Configuration   → /dashboard/roll-config

RUN
---
npx playwright test tests/BetaSurfaces.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Beta surfaces',
  () => {
    test.describe.configure({
      timeout: 180000
    });

    test.beforeEach(
      async ({ page }) => {
        await page.context().clearCookies();
        await page.goto(
          `${BASE_URL}/login`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await new LoginPage(
          page
        ).login(
          TEST_USERS.e2e.email,
          TEST_USERS.e2e.password
        );

        await new DashboardPage(
          page
        ).validateLoaded();
      }
    );

    test(
      'Beta menu lists broker Position P&L Profit & Loss and Roll destinations',
      async ({ page }) => {
        const beta =
          new BetaSurfacesPage(
            page
          );

        const labels =
          await beta.listBetaMenuLabels();

        const joined =
          labels.join(
            ' | '
          );

        expect(
          joined
        ).toMatch(
          /broker transactions/i
        );
        expect(
          joined
        ).toMatch(
          /position p&l|position pnl/i
        );
        expect(
          joined
        ).toMatch(
          /profit\s*&\s*loss|option overlay/i
        );
        expect(
          joined
        ).toMatch(
          /roll configuration/i
        );
      }
    );

    test(
      'Broker transactions shows columns sort and page size',
      async ({ page }) => {
        await new BetaSurfacesPage(
          page
        ).validateBrokerTransactions();
      }
    );

    test(
      'Position P&L shows columns and accepts sort',
      async ({ page }) => {
        await new BetaSurfacesPage(
          page
        ).validatePositionPnl();
      }
    );

    test(
      'Portfolio Profit & Loss switches periods and capital toggles',
      async ({ page }) => {
        await new BetaSurfacesPage(
          page
        ).validatePortfolioProfitLoss();
      }
    );

    test(
      'Roll Configuration opens from Beta with presets',
      async ({ page }) => {
        const beta =
          new BetaSurfacesPage(
            page
          );

        await beta.openDestination(
          BETA_DESTINATIONS[3]
        );

        const roll =
          new RollConfigurationPage(
            page
          );

        await roll.validateLoaded();
        await roll.validateStrategyPresets();
      }
    );
  }
);
