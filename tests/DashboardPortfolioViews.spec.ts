import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from './config/testData';

import { DashboardPage }
  from './pages/DashboardPage';

import { EventCalendarPage }
  from './pages/EventCalendarPage';

import { test }
  from './fixtures/subscriberAuth';

import { safeClick, openHeaderMenuItem }
  from './helpers/safeClick';

/* =============================================================================
TEST SUITE: Watchlist, Analytics, and calendar views

PURPOSE
-------
Portfolio menu opens Watchlist and Analytics. Event calendar switches
between Month and Agenda, then moves to the next month and back.

RUN
---
npx playwright test tests/DashboardPortfolioViews.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Watchlist Analytics and calendar views',
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

    async function openPortfolioItem(
      page: Page,
      name: RegExp,
      label: string
    ) {
      await openHeaderMenuItem(
        page,
        /^portfolio$/i,
        name,
        label
      );
    }

    test(
      'Watchlist shows symbols or an empty list',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openPortfolioItem(
          page,
          /^watchlist$/i,
          'Watchlist'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /watchlist/i
            }
          )
        ).toBeVisible({
          timeout: 20000
        });

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /watchlist|symbol|add|search|empty|no symbols/i
        );

        const search =
          page.getByRole(
            'combobox',
            {
              name: /search|symbol/i
            }
          ).or(
            page.getByPlaceholder(
              /search|symbol/i
            )
          ).first();

        if (
          await search.waitFor({
            state: 'visible',
            timeout: 4000
          }).then(
            () => true
          ).catch(
            () => false
          )
        ) {
          await search.fill(
            'AAPL'
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            /AAPL/i
          );
        }
      }
    );

    test(
      'Direct analytics route loads portfolio measures',
      async ({ page }) => {
        await page.goto(
          `${BASE_URL}/dashboard/analytics`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await expect(
          page
        ).toHaveURL(
          /analytics/i,
          {
            timeout: 20000
          }
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /analytics|allocation|performance|return|portfolio|\$[\d,.]+|%/i,
          {
            timeout: 20000
          }
        );
      }
    );
    test(
      'Direct event calendar route loads calendar heading',
      async ({ page }) => {
        await page.goto(
          `${BASE_URL}/dashboard/event-calendar`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await expect(
          page
        ).toHaveURL(
          /event-calendar/i,
          {
            timeout: 20000
          }
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /event calendar/i
            }
          )
        ).toBeVisible({
          timeout: 20000
        });
      }
    );

    test(
      'Analytics shows portfolio measures',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openPortfolioItem(
          page,
          /^analytics$/i,
          'Analytics'
        );

        const failedLoad =
          page.getByText(
            /couldn.?t load|something went wrong|try again/i
          ).first();

        if (
          await failedLoad.isVisible({
            timeout: 3000
          }).catch(
            () => false
          )
        ) {
          const reload =
            page.getByRole(
              'button',
              {
                name: /reload|try again/i
              }
            ).first();

          if (
            await reload.isVisible().catch(
              () => false
            )
          ) {
            await safeClick(
              reload,
              'Reload analytics'
            );
          } else {
            await page.reload({
              waitUntil: 'domcontentloaded'
            });
          }
        }

        await expect(
          page.getByRole(
            'heading',
            {
              name: /analytics/i
            }
          )
        ).toBeVisible({
          timeout: 20000
        });

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /\$[\d,.]+|%|allocation|performance|return|portfolio/i
        );
      }
    );

    test(
      'Event calendar switches between Month and Agenda',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /view more/i
            }
          ).first(),
          'View more upcoming events'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /event calendar/i
            }
          )
        ).toBeVisible({
          timeout: 20000
        });

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /^agenda$/i
            }
          ),
          'Agenda'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /agenda|earnings|dividend|events/i
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /^month$/i
            }
          ),
          'Month'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /20\d{2}/
            }
          )
        ).toBeVisible();
      }
    );

    test(
      'Event calendar changes month',
      async ({ page }) => {
        const calendar =
          new EventCalendarPage(
            page
          );

        await openDashboard(
          page
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /view more/i
            }
          ).first(),
          'View more upcoming events'
        );

        await calendar.validateLoaded();

        const nextMonth =
          await calendar.changeMonth(
            'Next month'
          );

        const returned =
          await calendar.changeMonth(
            'Previous month'
          );

        expect(
          returned
        ).not.toBe(
          nextMonth
        );
      }
    );
  }
);
