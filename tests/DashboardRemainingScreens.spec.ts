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

import {
  dismissOverlays
} from './helpers/dismissOverlays';

import {
  openHeaderMenu,
  safeClick
} from './helpers/safeClick';

/* =============================================================================
TEST SUITE: Remaining dashboard screens

PURPOSE
-------
Footer pages, the Opportunities filter and sort lists, Bulk Upload, and
Connect broker. Nothing is saved or submitted.

RUN
---
npx playwright test tests/DashboardRemainingScreens.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Remaining dashboard screens',
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

    test(
      'Footer legal pages open',
      async ({ page }) => {
        // Product footer works; prior fail was reloading /dashboard
        // between each link (goto timed out on slow UAT).
        await openDashboard(
          page
        );

        const footerNav =
          page.getByRole(
            'contentinfo'
          ).getByRole(
            'navigation',
            {
              name: /legal and support/i
            }
          );

        const pages = [
          {
            name: /privacy policy/i,
            content: /privacy/i
          },
          {
            name: /terms of service/i,
            content: /terms/i
          },
          {
            name: /^disclosures$/i,
            content: /disclos/i
          },
          {
            name: /risk warning/i,
            content: /risk/i
          },
          {
            name: /occ options disclosure/i,
            content: null as RegExp | null,
            external: true
          },
          {
            name: /^contact$/i,
            content: /contact|email|support/i
          }
        ];

        for (const item of pages) {
          let link =
            footerNav.getByRole(
              'link',
              {
                name: item.name
              }
            ).first();

          const footerReady =
            await link.isVisible({
              timeout: 8000
            }).catch(
              () => false
            );

          if (!footerReady) {
            await page.goto(
              `${BASE_URL}/dashboard`,
              {
                waitUntil: 'domcontentloaded',
                timeout: 60000
              }
            );

            link =
              footerNav.getByRole(
                'link',
                {
                  name: item.name
                }
              ).first();

            await expect(
              link
            ).toBeVisible({
              timeout: 30000
            });
          }

          const href =
            await link.getAttribute(
              'href'
            );

          expect(
            href,
            `${String(item.name)} should have a usable href`
          ).toMatch(
            /^(\/|https?:\/\/)/i
          );

          if (
            item.external ||
            /^https?:\/\//i.test(
              href || ''
            )
          ) {
            expect(
              href
            ).toMatch(
              /^https?:\/\//i
            );
            continue;
          }

          await dismissOverlays(
            page
          );

          await link.scrollIntoViewIfNeeded({
            timeout: 5000
          }).catch(
            () => undefined
          );

          const clicked =
            await link.click({
              timeout: 8000
            }).then(
              () => true
            ).catch(
              async () => {
                await dismissOverlays(
                  page
                );

                return link.click({
                  force: true,
                  timeout: 8000
                }).then(
                  () => true
                ).catch(
                  () => false
                );
              }
            );

          if (
            !clicked &&
            href &&
            href.startsWith(
              '/'
            )
          ) {
            await page.goto(
              `${BASE_URL}${href}`,
              {
                waitUntil: 'domcontentloaded',
                timeout: 60000
              }
            );
          }

          await expect(
            page.locator(
              'main, body'
            ).first()
          ).toContainText(
            item.content as RegExp,
            {
              timeout: 30000
            }
          );
        }
      }
    );

    test(
      'Opportunities filter panel and sort list open',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^opportunities$/i
            }
          ).first(),
          'Opportunities'
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /^filters$/i
            }
          ),
          'Filters'
        );

        await expect(
          page.getByRole(
            'dialog'
          ).or(
            page.getByText(
              /strategy|source|expiry|cost basis|apply|reset/i
            )
          ).first()
        ).toBeVisible({
          timeout: 10000
        });

        await page.keyboard.press(
          'Escape'
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /save view/i
            }
          ).first(),
          'Save View'
        );

        const saveDialog =
          page.getByRole(
            'dialog'
          );

        if (
          await saveDialog.waitFor({
            state: 'visible',
            timeout: 4000
          }).then(
            () => true
          ).catch(
            () => false
          )
        ) {
          await page.keyboard.press(
            'Escape'
          );
        }

        await safeClick(
          page.getByText(
            /sort by/i
          ).locator(
            'xpath=following::*[@role="combobox" or self::button][1]'
          ).or(
            page.getByRole(
              'combobox'
            ).filter({
              hasText: /expiry|sort/i
            })
          ).first(),
          'Sort by'
        );

        const sortChoice =
          page.getByRole(
            'option'
          ).nth(
            1
          );

        await expect(
          sortChoice
        ).toBeVisible({
          timeout: 10000
        });

        const sortLabel =
          (
            await sortChoice.innerText()
          ).split(
            '\n'
          )[0].trim();

        await safeClick(
          sortChoice,
          `Sort ${sortLabel}`
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          new RegExp(
            sortLabel.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&'
            ),
            'i'
          )
        );
      }
    );

    test(
      'Bulk upload explains the file and connect broker opens',
      async ({ page }) => {
        await openDashboard(
          page
        );

        // The + icon opens the "Connect a broker" popup, which has Bulk
        // Upload and Enter Manually buttons. Bulk Upload then opens the
        // "Upload Positions" dialog (a second dialog sits behind it).
        const addPosition =
          new AddPositionPage(
            page
          );

        await addPosition.openBulkUpload();

        const upload =
          addPosition.uploadPositionsDialog();

        await expect(
          upload
        ).toBeVisible({
          timeout: 10000
        });

        await expect(
          upload
        ).toContainText(
          /upload|csv|file|import|position/i
        );

        await page.keyboard.press(
          'Escape'
        );

        await openDashboard(
          page
        );

        await openHeaderMenu(
          page,
          /^portfolio$/i
        );

        await safeClick(
          page.getByRole(
            'menuitem',
            {
              name: /^accounts$/i
            }
          ),
          'Accounts'
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /connect broker/i
            }
          ).or(
            page.getByRole(
              'link',
              {
                name: /connect broker/i
              }
            )
          ).first(),
          'Connect broker'
        );

        await expect(
          page.locator(
            'main, [role="dialog"]'
          ).first()
        ).toContainText(
          /broker|connect|institution|account/i,
          {
            timeout: 15000
          }
        );

        await page.keyboard.press(
          'Escape'
        );
      }
    );

    test(
      'Connect broker keeps an empty form from submitting',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openHeaderMenu(
          page,
          /^portfolio$/i
        );

        await safeClick(
          page.getByRole(
            'menuitem',
            {
              name: /^accounts$/i
            }
          ),
          'Accounts'
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /connect broker/i
            }
          ).or(
            page.getByRole(
              'link',
              {
                name: /connect broker/i
              }
            )
          ).first(),
          'Connect broker'
        );

        const surface =
          page.locator(
            'main, [role="dialog"]'
          ).first();

        await expect(
          surface
        ).toContainText(
          /broker|institution|account/i,
          {
            timeout: 15000
          }
        );

        const submit =
          surface.getByRole(
            'button',
            {
              name: /^(connect|continue|submit|link account)$/i
            }
          );

        if (
          await submit.count()
        ) {
          await expect(
            submit.first()
          ).toBeDisabled();
        }

        const cancel =
          surface.getByRole(
            'button',
            {
              name: /cancel|close/i
            }
          ).first();

        if (
          await cancel.isVisible().catch(
            () => false
          )
        ) {
          await safeClick(
            cancel,
            'Cancel connect broker'
          );
        } else {
          await page.keyboard.press(
            'Escape'
          );
        }

        await expect(
          page
        ).not.toHaveURL(
          /stripe|plaid|broker-connected/i
        );
      }
    );

    test(
      'Bulk upload rejects a file that is not a spreadsheet',
      async ({ page }) => {
        await openDashboard(
          page
        );

        // The + icon opens the "Connect a broker" popup, which has Bulk
        // Upload and Enter Manually buttons. Bulk Upload then opens the
        // "Upload Positions" dialog (a second dialog sits behind it).
        const addPosition =
          new AddPositionPage(
            page
          );

        await addPosition.openBulkUpload();

        const upload =
          addPosition.uploadPositionsDialog();

        await expect(
          upload
        ).toBeVisible({
          timeout: 10000
        });

        const fileInDialog =
          upload.locator(
            'input[type="file"]'
          );

        const file =
          await fileInDialog.count()
            ? fileInDialog
            : page.locator(
              'input[type="file"]'
            ).first();

        await file.setInputFiles({
          name: 'not-a-sheet.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(
            'this is not a spreadsheet'
          )
        });

        const importButton =
          upload.getByRole(
            'button',
            {
              name: /import|upload|continue/i
            }
          ).first();

        const rejected =
          // The dialog always says "Supports .csv, .xlsx, .xls", so that hint
          // must not count as a rejection message.
          await upload.getByText(
            /csv|xlsx|spreadsheet|invalid|unsupported|not allowed/i
          ).filter({
            hasNotText: /supports \.csv/i
          }).first().waitFor({
            state: 'visible',
            timeout: 5000
          }).then(
            () => true
          ).catch(
            () => false
          );

        if (
          !rejected &&
          await importButton.count()
        ) {
          await expect(
            importButton
          ).toBeDisabled();
        }

        await page.keyboard.press(
          'Escape'
        );
      }
    );
  }
);
