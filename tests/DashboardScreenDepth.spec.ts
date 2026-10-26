import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from './config/testData';

import { DashboardPage }
  from './pages/DashboardPage';

import { test }
  from './fixtures/subscriberAuth';

import {
  PORTFOLIO_OR_POSITIONS_URL
} from './helpers/portfolioRoutes';

import { safeClick, openHeaderMenuItem }
  from './helpers/safeClick';

/* =============================================================================
TEST SUITE: Deeper dashboard screens

PURPOSE
-------
Company Finance, News, and Simulator show a searched symbol or their own
controls. Portfolio positions can be sorted, paged, and opened in Add.
Nothing is saved.

RUN
---
npx playwright test tests/DashboardScreenDepth.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Deeper dashboard screens',
  () => {

    test.describe.configure({
      timeout: 180000
    });

    async function openDashboard(
      page: Page
    ) {
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

    async function openResearchItem(
      page: Page,
      name: RegExp,
      label: string
    ) {
      await openHeaderMenuItem(
        page,
        /^research$/i,
        name,
        label
      );
    }

    async function analyzeSymbol(
      page: Page,
      symbol: string
    ) {
      const input =
        page.getByRole(
          'combobox',
          {
            name: /search company name or symbol|search symbol/i
          }
        ).or(
          page.getByPlaceholder(
            /search|symbol/i
          )
        ).first();

      await input.fill(
        symbol
      );

      const choice =
        page.getByRole(
          'option',
          {
            name: new RegExp(
              symbol,
              'i'
            )
          }
        ).first();

      if (
        await choice.waitFor({
          state: 'visible',
          timeout: 4000
        }).then(
          () => true
        ).catch(
          () => false
        )
      ) {
        await safeClick(
          choice,
          `Select ${symbol}`
        );
      }

      const analyze =
        page.getByRole(
          'button',
          {
            name: /^analyze$/i
          }
        );

      if (
        await analyze.waitFor({
          state: 'visible',
          timeout: 4000
        }).then(
          () => true
        ).catch(
          () => false
        )
      ) {
        await safeClick(
          analyze,
          `Analyze ${symbol}`
        );
      }
    }

    test(
      'Company Finance shows statements for a symbol',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /company finance/i,
          'Company Finance'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /finance|financial/i
            }
          ).first()
        ).toBeVisible({
          timeout: 20000
        });

        await analyzeSymbol(
          page,
          'AAPL'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /AAPL|income|balance|cash flow|revenue|asset/i,
          {
            timeout: 20000
          }
        );
      }
    );

    test(
      'News shows headlines',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /^news$/i,
          'News'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /news/i
            }
          ).first()
        ).toBeVisible({
          timeout: 20000
        });

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /headline|article|story|market|today|20\d{2}/i
        );
      }
    );

    test(
      'Simulator shows a scenario form',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /^simulator$/i,
          'Simulator'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /simulator|simulation|scenario/i,
          {
            timeout: 20000
          }
        );

        await analyzeSymbol(
          page,
          'AAPL'
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /^1W$/
            }
          ),
          'Duration 1W'
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /conservative\s*\(1/i
            }
          ),
          'Conservative profile'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /AAPL|opportunit|premium|strategy|no matching|no results/i,
          {
            timeout: 20000
          }
        );
      }
    );

    test(
      'Portfolio positions sort, page, and open Add without saving',
      async ({ page }) => {
        await openDashboard(
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

        const viewPositions =
          page.getByRole(
            'link',
            {
              name: /view positions/i
            }
          ).or(
            page.getByRole(
              'button',
              {
                name: /view positions/i
              }
            )
          ).first();

        if (
          await viewPositions.waitFor({
            state: 'visible',
            timeout: 8000
          }).then(
            () => true
          ).catch(
            () => false
          )
        ) {
          await safeClick(
            viewPositions,
            'View positions'
          );
        } else {
          await page.goto(
            `${BASE_URL}/dashboard/positions`,
            {
              waitUntil: 'domcontentloaded',
              timeout: 60000
            }
          );
        }

        await expect(
          page
        ).toHaveURL(
          PORTFOLIO_OR_POSITIONS_URL,
          {
            timeout: 20000
          }
        );

        const show =
          page.getByRole(
            'button',
            {
              name: /^show$/i
            }
          );

        if (
          await show.waitFor({
            state: 'visible',
            timeout: 4000
          }).then(
            () => true
          ).catch(
            () => false
          )
        ) {
          await safeClick(
            show,
            'Show positions'
          );
        }

        const manualTab =
          page.getByRole(
            'tab',
            {
              name: /^manual\b/i
            }
          ).or(
            page.getByRole(
              'button',
              {
                name: /^manual\b/i
              }
            )
          ).or(
            page.getByRole(
              'tab',
              {
                name: /manual entry|manual account/i
              }
            )
          ).first();

        const manualReady =
          await manualTab.waitFor({
            state: 'visible',
            timeout: 12000
          }).then(
            () => true
          ).catch(
            () => false
          );

        if (
          !manualReady
        ) {
          test.skip(
            true,
            'Manual positions tab is not available for this UAT account.'
          );
        }

        await safeClick(
          manualTab,
          'Manual positions'
        );

        await safeClick(
          page.locator(
            'main'
          ).getByRole(
            'button',
            {
              name: /sort by position|^position$/i
            }
          ).first(),
          'Sort by position'
        );

        await expect(
          page.locator(
            'main tbody tr'
          ).first()
        ).toBeVisible({
          timeout: 15000
        });

        const nextPage =
          page.locator(
            'main'
          ).getByRole(
            'navigation',
            {
              name: /pagination/i
            }
          ).getByRole(
            'button',
            {
              name: /page 2|^2$/i
            }
          );

        if (
          await nextPage.waitFor({
            state: 'visible',
            timeout: 4000
          }).then(
            () => true
          ).catch(
            () => false
          )
        ) {
          await safeClick(
            nextPage,
            'Positions page 2'
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            /showing/i
          );
        }

        await safeClick(
          page.locator(
            'main'
          ).getByRole(
            'button',
            {
              name: /^add( options)?$/i
            }
          ).first(),
          'Add position'
        );

        const enterManually =
          page.getByRole(
            'button',
            {
              name: /^enter manually$/i
            }
          ).or(
            page.getByRole(
              'menuitem',
              {
                name: /enter manually/i
              }
            )
          ).first();

        await safeClick(
          enterManually,
          'Enter Manually'
        );

        const dialog =
          page.getByRole(
            'dialog'
          );

        await expect(
          dialog
        ).toContainText(
          /add position|symbol|equity|option|cash/i,
          {
            timeout: 10000
          }
        );

        await page.keyboard.press(
          'Escape'
        );

        await expect(
          dialog
        ).toBeHidden({
          timeout: 10000
        });
      }
    );
  }
);
