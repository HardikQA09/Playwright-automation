import {
  BASE_URL
} from './config/testData';

import { AccountsPage }
  from './pages/AccountsPage';

import { DashboardPage }
  from './pages/DashboardPage';

import { OptionsResearchPage }
  from './pages/OptionsResearchPage';

import { PortfolioPage }
  from './pages/PortfolioPage';

import {
  expect,
  test
} from './fixtures/subscriberAuth';

import { safeClick }
  from './helpers/safeClick';

/* =============================================================================
TEST SUITE: Options Research and Portfolio Accounts

PURPOSE
-------
View option exposure opens Options Research and its chain.
Manage Accounts opens the broker account, View positions opens holdings,
and every holdings tab shows the positions table.
The dashboard no longer has a View full expiry calendar control.

RUN
---
npx playwright test tests/DashboardResearchPortfolio.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Options Research and Portfolio Accounts',
  () => {

    test.describe.configure({
      timeout: 180000
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
      'View option exposure opens options research data',
      async ({ page }) => {
        const research =
          new OptionsResearchPage(
            page
          );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /view option exposure/i
            }
          ).first(),
          'View option exposure'
        );

        await research.validateLoaded();
        await research.validateResearchData();
      }
    );

    test(
      'Option exposure changes symbol expiration calls puts strike count and news',
      async ({ page }) => {
        const research =
          new OptionsResearchPage(
            page
          );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /view option exposure/i
            }
          ).first(),
          'View option exposure'
        );

        await research.validateLoaded();

        await research.selectSymbol(
          'MSFT'
        );

        await research.selectSymbol(
          'AAPL'
        );

        await research.changeExpiration();
        await research.showCallsAndPuts();
        await research.validateChainControls();
        await research.validateLatestNews();
      }
    );

    test(
      'Option expiry overview toggles short and long options',
      async ({ page }) => {
        const dashboard =
          new DashboardPage(
            page
          );

        await dashboard.validateExpiryOverview();

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /long options/i
            }
          ),
          'Long Options'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /option expiry overview/i
            }
          )
        ).toBeVisible();

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /short options/i
            }
          ),
          'Short Options'
        );

        await dashboard.validateExpiryOverview();
      }
    );

    test(
      'Manage accounts opens positions and every holdings tab',
      async ({ page }) => {
        const accounts =
          new AccountsPage(
            page
          );

        const portfolio =
          new PortfolioPage(
            page
          );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /manage accounts/i
            }
          ).first(),
          'Manage accounts'
        );

        await accounts.validateLoaded();
        await accounts.openPositions();
        await portfolio.validateLoaded();
        await portfolio.validateEveryHoldingsTab();
      }
    );
  }
);
