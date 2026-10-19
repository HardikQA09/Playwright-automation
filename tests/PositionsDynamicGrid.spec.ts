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
Validates Portfolio > Positions as a Community AG Grid: Asset→Symbol groups,
filters and chips, system views, selection charts, Rob asset-type colors,
and the position drawer. Does not require AG Grid Enterprise.

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
        await grid.expectToolbar();
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
      'Dashboard positions call filter shows active filter chips',
      async ({ page }) => {
        const grid =
          new PositionsDynamicGridPage(
            page
          );

        await grid.expectLoaded();
        await grid.expectCallFilterChips();
      }
    );

    test(
      'Dashboard positions by broker view groups and can add a level',
      async ({ page }) => {
        const grid =
          new PositionsDynamicGridPage(
            page
          );

        await grid.expectLoaded();
        await grid.expectByBrokerSavedView();
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
      'Dashboard positions selected rows open analysis metrics and charts',
      async ({ page }) => {
        const grid =
          new PositionsDynamicGridPage(
            page
          );

        await grid.expectLoaded();
        await grid.expectSelectionAnalysis();
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

    test(
      'Dashboard positions columns and save view stay on the community grid',
      async ({ page }) => {
        const grid =
          new PositionsDynamicGridPage(
            page
          );

        await grid.expectLoaded();
        await grid.expectColumnPickerAndSaveView();
      }
    );

    test(
      'Dashboard positions badges use the Rob asset type colors',
      async ({ page }) => {
        const grid =
          new PositionsDynamicGridPage(
            page
          );

        await grid.expectLoaded();
        await grid.expectRobPalette();
      }
    );
  }
);
