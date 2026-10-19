import {
  BASE_URL
} from './config/testData';

import { DashboardPage }
  from './pages/DashboardPage';

import { PositionsDynamicGridPage }
  from './pages/PositionsDynamicGridPage';

import {
  test
} from './fixtures/subscriberAuth';

/* =============================================================================
TEST SUITE: Positions dynamic grid

PURPOSE
-------
Validates Portfolio > Positions as a Community AG Grid: grouped asset rows,
search, expand/collapse, filtered analysis charts, and the position drawer.
Does not require AG Grid Enterprise.

RUN
---
npx playwright test tests/PositionsDynamicGrid.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Positions dynamic grid',
  () => {

    test.describe.configure({
      timeout: 120000
    });

    test.use({
      viewport: {
        width: 1600,
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

        await page.goto(
          `${BASE_URL}/dashboard/positions`,
          {
            waitUntil: 'domcontentloaded'
          }
        );
      }
    );

    test(
      'Dashboard positions grid groups equity options and cash',
      async ({ page }) => {
        const grid =
          new PositionsDynamicGridPage(
            page
          );

        await grid.expectLoaded();
        await grid.expectCommunityGridOnly();
      }
    );

    test(
      'Dashboard positions grid expands collapses and searches',
      async ({ page }) => {
        const grid =
          new PositionsDynamicGridPage(
            page
          );

        await grid.expectLoaded();
        await grid.expectExpandCollapseAndSearch();
      }
    );

    test(
      'Dashboard positions analyze filtered shows allocation value and pnl charts',
      async ({ page }) => {
        const grid =
          new PositionsDynamicGridPage(
            page
          );

        await grid.expectLoaded();
        await grid.expectAnalyzeFilteredCharts();
      }
    );

    test(
      'Dashboard positions row opens the detail drawer',
      async ({ page }) => {
        const grid =
          new PositionsDynamicGridPage(
            page
          );

        await grid.expectLoaded();
        await grid.expectPositionDrawer();
      }
    );
  }
);
