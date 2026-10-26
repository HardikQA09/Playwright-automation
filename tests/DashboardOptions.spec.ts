import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from './config/testData';

import { DashboardPage }
  from './pages/DashboardPage';

import { AddPositionPage }
  from './pages/AddPositionPage';

import { test }
  from './fixtures/subscriberAuth';

import { safeClick }
  from './helpers/safeClick';

/* =============================================================================
TEST SUITE: Dashboard options

PURPOSE
-------
Opens every plus-menu and profile-menu choice. Sign out is left unclicked
so the session stays signed in. Dialogs are closed without saving.

RUN
---
npx playwright test tests/DashboardOptions.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Dashboard options',
  () => {

    test.describe.configure({
      timeout: 240000
    });

    async function openDashboard(
      page: Page
    ) {
      const dashboard =
        new DashboardPage(
          page
        );

      let lastError: unknown;

      for (
        let attempt = 0;
        attempt < 3;
        attempt += 1
      ) {
        try {
          await page.goto(
            `${BASE_URL}/dashboard`,
            {
              waitUntil: 'domcontentloaded',
              timeout: 90000
            }
          );

          await dashboard.validateLoaded();

          return;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError;
    }

    function skipOption(
      label: string
    ) {
      return /sign out|log out|disconnect|delete|remove/i.test(
        label
      );
    }

    async function optionNames(
      page: Page
    ) {
      const items =
        page.getByRole(
          'menuitem'
        );

      await expect(
        items.first()
      ).toBeVisible({
        timeout: 10000
      });

      return (
        await items.allInnerTexts()
      ).map(
        (name) =>
          name.replace(
            /\s+/g,
            ' '
          ).trim()
      ).filter(
        Boolean
      );
    }

    async function openOption(
      page: Page,
      label: string
    ) {
      await safeClick(
        page.getByRole(
          'menuitem',
          {
            name: new RegExp(
              `^${label.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
              )}$`,
              'i'
            )
          }
        ).first(),
        label
      );

      const dialog =
        page.getByRole(
          'dialog'
        );

      if (
        await dialog.waitFor({
          state: 'visible',
          timeout: 4000
        }).then(
          () => true
        ).catch(
          () => false
        )
      ) {
        await expect(
          dialog
        ).toContainText(
          /.+/
        );

        await page.keyboard.press(
          'Escape'
        );

        return;
      }

      await expect(
        page.locator(
          'main, body'
        ).first()
      ).toContainText(
        /.+/,
        {
          timeout: 15000
        }
      );
    }

    test(
      'Plus menu opens every add option',
      async ({ page }) => {
        // The + icon now opens a "Connect a broker" popup (broker list plus
        // Bulk Upload and Enter Manually) instead of a menu of items, so each
        // add option is opened from that popup. Dialogs are closed unsaved.
        const addPosition =
          new AddPositionPage(
            page
          );

        await openDashboard(
          page
        );

        await addPosition.openPlusPopup();

        await addPosition.expectPlusPopupOptions();

        await addPosition.closeDialogs();

        await openDashboard(
          page
        );

        await addPosition.openBulkUpload();

        await addPosition.expectBulkUploadDialog();

        await addPosition.closeDialogs();

        await openDashboard(
          page
        );

        await addPosition.openManualEntry();

        await addPosition.expectManualEntryDialog();

        await addPosition.closeDialogs();
      }
    );

    test(
      'Profile menu opens every account option',
      async ({ page }) => {
        await openDashboard(
          page
        );

        const dashboard =
          new DashboardPage(
            page
          );

        await dashboard.openProfileMenu();

        const names =
          await optionNames(
            page
          );

        expect(
          names.length
        ).toBeGreaterThan(
          0
        );

        for (const name of names) {
          if (
            skipOption(
              name
            )
          ) {
            continue;
          }

          await openDashboard(
            page
          );

          await dashboard.openProfileMenu();

          await openOption(
            page,
            name
          );
        }
      }
    );
  }
);
