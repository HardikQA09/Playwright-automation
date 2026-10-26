import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from './config/testData';

import { AccountsPage }
  from './pages/AccountsPage';

import { DashboardPage }
  from './pages/DashboardPage';

import { RiskCompliancePage }
  from './pages/RiskCompliancePage';

import { test }
  from './fixtures/subscriberAuth';

import { safeClick, openHeaderMenuItem }
  from './helpers/safeClick';

async function openDashboard(
  page: Page
) {
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt < 2;
    attempt += 1
  ) {
    try {
      await page.goto(
        `${BASE_URL}/dashboard`,
        {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        }
      );

      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

/* =============================================================================
TEST SUITE: Saved dashboard data

PURPOSE
-------
Create a watchlist and add a symbol, change a holding quantity, and save a
different investing experience. Each value is checked after refresh, then
put back.

RUN
---
npx playwright test tests/DashboardDataChanges.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Saved dashboard data',
  () => {

    test.describe.configure({
      timeout: 240000
    });

    test(
      'A new watchlist can be created, filled, and removed',
      async ({ page }) => {
        const name =
          `AIR ${Date.now()}`;

        await openDashboard(
          page
        );

        await new DashboardPage(
          page
        ).validateLoaded();

        await openHeaderMenuItem(
          page,
          /^portfolio$/i,
          /^watchlist$/i,
          'Watchlist'
        );

        for (
          let leftover = 0;
          leftover < 5;
          leftover += 1
        ) {
          const oldList =
            page.getByRole(
              'tab',
              {
                name: /^AIR /i
              }
            ).first();

          if (
            !await oldList.waitFor({
              state: 'visible',
              timeout: 2000
            }).then(
              () => true
            ).catch(
              () => false
            )
          ) {
            break;
          }

          await safeClick(
            oldList,
            'Old AIR watchlist'
          );

          await safeClick(
            page.getByRole(
              'button',
              {
                name: /delete watchlist/i
              }
            ),
            'Delete old watchlist'
          );

          await safeClick(
            page.getByRole(
              'alertdialog'
            ).or(
              page.getByRole(
                'dialog'
              )
            ).last().getByRole(
              'button',
              {
                name: /^delete$/i
              }
            ),
            'Confirm delete old watchlist'
          );
        }

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /^new$/i
            }
          ),
          'New watchlist'
        );

        const dialog =
          page.getByRole(
            'dialog'
          );

        await dialog.getByRole(
          'textbox'
        ).first().fill(
          name
        );

        await safeClick(
          dialog.getByRole(
            'button',
            {
              name: /create|save/i
            }
          ),
          'Create watchlist'
        );

        await expect(
          dialog
        ).toBeHidden({
          timeout: 15000
        });

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          name,
          {
            timeout: 15000
          }
        );

        const created =
          page.getByRole(
            'tab',
            {
              name: new RegExp(
                name,
                'i'
              )
            }
          );

        await safeClick(
          created,
          'Created watchlist'
        );

        const symbol =
          page.getByRole(
            'textbox',
            {
              name: /add symbol/i
            }
          );

        await symbol.fill(
          'MSFT'
        );

        const choice =
          page.getByRole(
            'option',
            {
              name: /MSFT/i
            }
          ).first();

        if (
          await choice.waitFor({
            state: 'visible',
            timeout: 8000
          }).then(
            () => true
          ).catch(
            () => false
          )
        ) {
          await safeClick(
            choice,
            'Select MSFT'
          );
        } else {
          await symbol.press(
            'Enter'
          );
        }

        const add =
          page.getByRole(
            'button',
            {
              name: /^add$/i
            }
          );

        await expect(
          add
        ).toBeEnabled({
          timeout: 10000
        });

        await safeClick(
          add,
          'Add MSFT'
        );

        await expect(
          created
        ).toContainText(
          '(1)',
          {
            timeout: 15000
          }
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /MSFT/
        );

        await page.reload({
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });

        await safeClick(
          created,
          'Created watchlist again'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /MSFT/,
          {
            timeout: 20000
          }
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /delete watchlist/i
            }
          ),
          'Delete watchlist'
        );

        await safeClick(
          page.getByRole(
            'alertdialog'
          ).or(
            page.getByRole(
              'dialog'
            )
          ).last().getByRole(
            'button',
            {
              name: /^delete$/i
            }
          ),
          'Confirm delete watchlist'
        );

        await expect(
          created
        ).toHaveCount(
          0
        );
      }
    );

    test(
      'A position quantity can be saved and restored',
      async ({ page }) => {
        const dashboard =
          new DashboardPage(
            page
          );

        const accounts =
          new AccountsPage(
            page
          );

        await openDashboard(
          page
        );

        await dashboard.validateLoaded();

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /manage accounts/i
            }
          ).first(),
          'Manage accounts'
        );

        await accounts.validateLoaded();
        await accounts.openPositions();

        const manual =
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
          ).first();

        if (
          await manual.waitFor({
            state: 'visible',
            timeout: 4000
          }).then(
            () => true
          ).catch(
            () => false
          )
        ) {
          await safeClick(
            manual,
            'Manual positions'
          );
        }

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

        const row =
          page.locator(
            'main tbody tr'
          ).first();

        const rowReady =
          await row.waitFor({
            state: 'visible',
            timeout: 15000
          }).then(
            () => true
          ).catch(
            () => false
          );

        if (
          !rowReady
        ) {
          test.skip(
            true,
            'No manual position rows in UAT — skipping quantity save/restore.'
          );
        }

        const symbol =
          (
            await row.getByRole(
              'link'
            ).first().innerText()
          ).trim();

        const editQuantity =
          async (
            target: ReturnType<Page['locator']>,
            value: string
          ) => {
            await safeClick(
              target.locator(
                'td'
              ).last().getByRole(
                'button'
              ).nth(
                0
              ),
              'Edit position'
            );

            const editor =
              target.getByRole(
                'spinbutton'
              ).first();

            await expect(
              editor
            ).toBeVisible({
              timeout: 10000
            });

            await editor.fill(
              value
            );

            await safeClick(
              target.getByRole(
                'button',
                {
                  name: /save|update|confirm/i
                }
              ).or(
                target.locator(
                  'td'
                ).last().getByRole(
                  'button'
                ).nth(
                  0
                )
              ).first(),
              'Save quantity'
            );

            await expect(
              target.getByRole(
                'spinbutton'
              )
            ).toHaveCount(
              0,
              {
                timeout: 15000
              }
            );
          };

        await safeClick(
          row.locator(
            'td'
          ).last().getByRole(
            'button'
          ).nth(
            0
          ),
          'Edit position'
        );

        const editor =
          row.getByRole(
            'spinbutton'
          ).first();

        await expect(
          editor
        ).toBeVisible({
          timeout: 10000
        });

        const original =
          await editor.inputValue();

        await safeClick(
          row.locator(
            'td'
          ).last().getByRole(
            'button'
          ).nth(
            1
          ),
          'Cancel edit'
        );

        const updated =
          String(
            Number(
              original
            ) + 1
          );

        await editQuantity(
          row,
          updated
        );

        await expect(
          row
        ).toContainText(
          updated
        );

        await page.reload({
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^manual\b/i
            }
          ),
          'Manual positions'
        );

        const showAgain =
          page.getByRole(
            'button',
            {
              name: /^show$/i
            }
          );

        if (
          await showAgain.waitFor({
            state: 'visible',
            timeout: 3000
          }).then(
            () => true
          ).catch(
            () => false
          )
        ) {
          await safeClick(
            showAgain,
            'Show positions'
          );
        }

        const savedRow =
          page.getByRole(
            'row'
          ).filter({
            has: page.getByRole(
              'link',
              {
                name: new RegExp(
                  `^${symbol}$`
                )
              }
            )
          }).first();

        await expect(
          savedRow
        ).toContainText(
          updated,
          {
            timeout: 15000
          }
        );

        await editQuantity(
          savedRow,
          original
        );

        await expect(
          savedRow
        ).toContainText(
          original
        );
      }
    );

    test(
      'Investing experience can be saved and restored',
      async ({ page }) => {
        const risk =
          new RiskCompliancePage(
            page
          );

        await risk.open();
        await risk.openRiskProfile();

        const years =
          page.locator(
            'main'
          ).getByRole(
            'combobox'
          ).first();

        const original =
          (
            await years.innerText()
          ).split(
            '\n'
          )[0].trim();

        const next =
          /1-3/.test(
            original
          )
            ? /^5-10 years$/i
            : /^1-3 years$/i;

        await safeClick(
          years,
          'Experience'
        );

        await safeClick(
          page.getByRole(
            'option',
            {
              name: next
            }
          ),
          'Experience value'
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /update risk profile/i
            }
          ),
          'Save experience'
        );

        await expect(
          page.getByText(
            /saved|updated|success/i
          ).first()
        ).toBeVisible({
          timeout: 15000
        });

        await page.reload({
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });

        await risk.openRiskProfile();

        await expect(
          years
        ).toContainText(
          next
        );

        await safeClick(
          years,
          'Experience'
        );

        await safeClick(
          page.getByRole(
            'option',
            {
              name: new RegExp(
                `^${original.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  '\\$&'
                )}$`,
                'i'
              )
            }
          ),
          'Restore experience'
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /update risk profile/i
            }
          ),
          'Restore saved experience'
        );

        await page.reload({
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });

        await risk.openRiskProfile();

        await expect(
          years
        ).toContainText(
          original
        );
      }
    );
  }
);
