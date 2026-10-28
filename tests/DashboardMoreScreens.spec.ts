import {
  expect
} from '@playwright/test';

import {
  BASE_URL
} from './config/testData';

import { DashboardPage }
  from './pages/DashboardPage';

import { OpportunitiesPage }
  from './pages/OpportunitiesPage';

import { OptionsResearchPage }
  from './pages/OptionsResearchPage';

import { test }
  from './fixtures/subscriberAuth';

import {
  openHeaderMenu,
  safeClick
} from './helpers/safeClick';

/* =============================================================================
TEST SUITE: More dashboard screens

PURPOSE
-------
Research, Academy, Support, the option-chain controls, and CTA Details.

RUN
---
npx playwright test tests/DashboardMoreScreens.spec.ts --reporter=line
============================================================================= */

test.describe(
  'More dashboard screens',
  () => {

    // Read-only UI checks: one retry absorbs a briefly slow UAT page and a
    // retried pass is reported as flaky rather than hidden.
    test.describe.configure({
      timeout: 180000,
      retries: 1
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
      'Research menu opens equity research for a symbol',
      async ({ page }) => {
        await openHeaderMenu(
          page,
          /^research$/i
        );

        for (const item of [
          /^equity$/i,
          /company fundamentals/i,
          /company finance/i,
          /^news$/i,
          /event calendar/i,
          /^simulator$/i
        ]) {
          await expect(
            page.getByRole(
              'menuitem',
              {
                name: item
              }
            )
          ).toBeVisible();
        }

        await safeClick(
          page.getByRole(
            'menuitem',
            {
              name: /^equity$/i
            }
          ),
          'Equity research'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /equity research|options research/i
            }
          )
        ).toBeVisible({
          timeout: 20000
        });

        const input =
          page.getByRole(
            'combobox',
            {
              name: /search company name or symbol|search symbol/i
            }
          ).first();

        await input.fill(
          'AAPL'
        );

        const choice =
          page.getByRole(
            'option',
            {
              name: /AAPL/i
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
            'Select AAPL'
          );
        }

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /^analyze$/i
            }
          ),
          'Analyze AAPL'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /equity research|analyzing|AAPL|\$\d[\d,]*(?:\.\d+)?/i
        );
      }
    );

    test(
      'Academy and Support pages show their content',
      async ({ page }) => {
        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^academy$/i
            }
          ).first(),
          'Academy'
        );

        await expect(
          page
        ).toHaveURL(
          /academy/,
          {
            timeout: 20000
          }
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /academy|course|learn|lesson/i
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^support$/i
            }
          ).first(),
          'Support'
        );

        await expect(
          page
        ).toHaveURL(
          /support/,
          {
            timeout: 20000
          }
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /support|help|contact|question/i
        );

        await page.goto(
          `${BASE_URL}/dashboard/support`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await expect(
          page
        ).toHaveURL(
          /support/,
          {
            timeout: 20000
          }
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /support|help|contact|question/i
        );
      }
    );

    test(
      'Option chain strike count keeps calls and puts',
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
        await research.validateChainControls();
      }
    );

    test(
      'CTA Details opens without changing watch status',
      async ({ page }) => {
        const opportunities =
          new OpportunitiesPage(
            page
          );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^opportunities$/i
            }
          ).first(),
          'Open Opportunities'
        );

        await opportunities.validateLoaded();

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /^moderate\s*\(4[\u2013-]6\)/i
            }
          ).first(),
          'Moderate opportunities'
        );

        await opportunities.openCtaDetails();
      }
    );
  }
);
