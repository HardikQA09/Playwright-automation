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
  RollConfigurationPage
} from './pages/RollConfigurationPage';

/* =============================================================================
TEST SUITE: Roll Configuration (Beta)

PURPOSE
-------
Uses imhardikthanki+e2e@gmail.com to cover Roll Configuration:
- surface / docs
- different templates (Income First, Tax-Aware, Balanced, Custom)
- field-level validation per template (defaults + min rules)
- custom draft from template
- activate strategy
- remove from active (delete AIR strategy)

AIR Roll * rows are cleaned before/after mutating tests.

RUN
---
npx playwright test tests/RollConfiguration.spec.ts --reporter=line
============================================================================= */

function airName(
  tag: string
) {
  return `AIR Roll ${tag} ${Date.now().toString().slice(-5)}`;
}

test.describe(
  'Roll Configuration',
  () => {
    test.describe.configure({
      timeout: 240000
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
      'Roll Configuration opens from Beta with strategy list or presets',
      async ({ page }) => {
        const roll =
          new RollConfigurationPage(
            page
          );

        await roll.openFromPortfolioMenu();
        await roll.validateStrategyPresets();
        await roll.openDocumentationAndClose();

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^roll configuration$/i
            }
          )
        ).toBeVisible();
      }
    );

    test(
      'Benchmark templates Income Tax-Aware Balanced and Custom are listed',
      async ({ page }) => {
        const roll =
          new RollConfigurationPage(
            page
          );

        await roll.openFromPortfolioMenu();
        await roll.validateBenchmarkTemplates();
      }
    );

    test(
      'Income First field-level validation blocks empty and zeroed fields',
      async ({ page }) => {
        const roll =
          new RollConfigurationPage(
            page
          );

        await roll.openFromPortfolioMenu();
        await roll.validateTemplateFieldLevel(
          'income'
        );
      }
    );

    test(
      'Tax-Aware field-level validation blocks empty and zeroed fields',
      async ({ page }) => {
        const roll =
          new RollConfigurationPage(
            page
          );

        await roll.openFromPortfolioMenu();
        await roll.validateTemplateFieldLevel(
          'tax'
        );
      }
    );

    test(
      'Balanced field-level validation blocks empty and zeroed fields',
      async ({ page }) => {
        const roll =
          new RollConfigurationPage(
            page
          );

        await roll.openFromPortfolioMenu();
        await roll.validateTemplateFieldLevel(
          'balanced'
        );
      }
    );

    test(
      'Custom field-level validation blocks empty and zeroed fields',
      async ({ page }) => {
        const roll =
          new RollConfigurationPage(
            page
          );

        await roll.openFromPortfolioMenu();
        await roll.validateTemplateFieldLevel(
          'custom'
        );
      }
    );

    test(
      'Clone Income First saves a custom draft then removes it',
      async ({ page }) => {
        const roll =
          new RollConfigurationPage(
            page
          );

        const name =
          airName(
            'Draft'
          );

        await roll.openFromPortfolioMenu();
        await roll.cleanupAirStrategies();
        await roll.createDraftFromTemplate(
          /income first/i,
          name
        );
        await roll.deleteStrategy(
          name
        );
      }
    );

    test(
      'Clone Tax-Aware activates then demote and remove from active',
      async ({ page }) => {
        const roll =
          new RollConfigurationPage(
            page
          );

        const name =
          airName(
            'Active'
          );

        await roll.openFromPortfolioMenu();
        await roll.cleanupAirStrategies();
        await roll.activateFromTemplate(
          /tax-?aware retention/i,
          name
        );

        await roll.expectStrategyListed(
          name,
          /active live|active/i
        );

        // Active Live cannot delete directly — activate another profile first, then Delete.
        await roll.demoteActiveStrategy(
          name
        );
        await roll.deleteStrategy(
          name
        );

        await expect(
          page.locator(
            'main'
          )
        ).not.toContainText(
          name
        );
      }
    );

    test(
      'Clone Balanced Strategy creates draft with template fields',
      async ({ page }) => {
        const roll =
          new RollConfigurationPage(
            page
          );

        const name =
          airName(
            'Bal'
          );

        await roll.openFromPortfolioMenu();
        await roll.cleanupAirStrategies();
        await roll.cloneTemplate(
          /balanced strategy/i
        );
        await roll.setConfigurationName(
          name
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /evaluation start dte|urgent dte|near-the-money|covered calls|cash secured puts/i
        );

        await roll.saveDraft();
        await roll.expectStrategyListed(
          name,
          /draft|inactive/i
        );
        await roll.deleteStrategy(
          name
        );
      }
    );
  }
);
