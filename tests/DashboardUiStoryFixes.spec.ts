import {
  BASE_URL
} from './config/testData';

import { DashboardPage }
  from './pages/DashboardPage';

import { DashboardUiStoryPage }
  from './pages/DashboardUiStoryPage';

import {
  expect,
  test
} from './fixtures/subscriberAuth';

/* =============================================================================
TEST SUITE: Dashboard UI story fixes

PURPOSE
-------
Validates the dashboard UI story against UAT:
- pie hover labels sit under the slice value without overlapping the total
- OolTool Performance is off the home dashboard and lives under Beta
- Analytics no longer uses the AlphaVanatage misspelling
- Equity / Cash / Options colors stay distinct on the pie and legend
- Analytics remains the Stats KPI surface until a dedicated Stats page ships

RUN
---
npx playwright test tests/DashboardUiStoryFixes.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Dashboard UI story fixes',
  () => {

    test.describe.configure({
      timeout: 120000
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
      'Dashboard no longer shows OolTool Performance on the home widgets',
      async ({ page }) => {
        const story =
          new DashboardUiStoryPage(
            page
          );

        await story.expectPerformanceAbsentFromDashboard();
      }
    );

    test(
      'Dashboard Beta menu opens OolTool Performance',
      async ({ page }) => {
        const story =
          new DashboardUiStoryPage(
            page
          );

        await story.openBetaPerformance();
      }
    );

    test(
      'Dashboard pie hover shows the category under the value without overlapping the total',
      async ({ page }) => {
        const story =
          new DashboardUiStoryPage(
            page
          );

        await story.expectPieHoverCategoryUnderValue();
      }
    );

    test(
      'Dashboard asset type colors stay distinct across the allocation pie and legend',
      async ({ page }) => {
        const story =
          new DashboardUiStoryPage(
            page
          );

        await story.expectAssetTypePaletteConsistent();
      }
    );

    test(
      'Dashboard Analytics copy does not use the AlphaVanatage misspelling',
      async ({ page }) => {
        const story =
          new DashboardUiStoryPage(
            page
          );

        await story.expectAnalyticsProviderCopy();
      }
    );

    test(
      'Dashboard Analytics Stats KPIs remain visible',
      async ({ page }) => {
        const story =
          new DashboardUiStoryPage(
            page
          );

        await story.expectAnalyticsStatsKpis();

        await expect(
          page
        ).toHaveURL(
          /\/dashboard\/analytics/
        );
      }
    );
  }
);
