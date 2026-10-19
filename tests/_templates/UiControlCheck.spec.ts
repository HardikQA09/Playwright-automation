import {
  expect
} from '@playwright/test';

import {
  BASE_URL
} from '../config/testData';

import { test }
  from '../fixtures/subscriberAuth';

import { DashboardPage }
  from '../pages/DashboardPage';

import { safeClick }
  from '../helpers/safeClick';

/* =============================================================================
TEST SUITE: Ui Control Check (template)

PURPOSE
-------
Minimal pattern for a new menu, button, sub-menu, or navigation control.
Copy this file to tests/, rename it, fill the placeholders, remove test.skip.

CHECKLIST
---------
[ ] Spec renamed out of _templates/
[ ] Title names the user-visible control
[ ] Asserts destination URL and/or heading
[ ] Does not change billing / account / security state
[ ] Title words map to the correct AIR module (see docs/HOW_TO_ADD_A_TEST.md)
[ ] Ran headed locally
[ ] Regenerated AIR: npm run report:execution

RUN
---
npx playwright test tests/YourNewControl.spec.ts --headed
============================================================================= */

test.describe(
  'Ui Control Check (template)',
  () => {

    test.describe.configure({
      timeout: 120000
    });

    test.beforeEach(
      async ({ page }) => {
        const dashboard =
          new DashboardPage(page);

        await page.goto(
          `${BASE_URL}/dashboard`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await dashboard.validateLoaded();
      }
    );

    // Remove .skip when this becomes a real check.
    test.skip(
      'opens REPLACE_CONTROL_NAME and lands on REPLACE_DESTINATION',
      async ({ page }) => {
        // 1) Locate the new menu / button / nav control
        const control = page.getByRole(
          'link',
          {
            // Prefer role + accessible name over brittle CSS.
            name: /REPLACE_CONTROL_LABEL/i
          }
        ).first();

        await expect(control).toBeVisible();

        // 2) Use it
        await safeClick(
          control,
          'Open REPLACE_CONTROL_NAME'
        );

        // 3) Assert the expected screen
        await expect(page).toHaveURL(
          /REPLACE_URL_FRAGMENT/i
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /REPLACE_HEADING/i
            }
          ).first()
        ).toBeVisible();
      }
    );
  }
);
