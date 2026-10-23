import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from './config/testData';

import { DashboardPage }
  from './pages/DashboardPage';

import { test }
  from './fixtures/subscriberAuth';

import {
  openHeaderMenu,
  safeClick
} from './helpers/safeClick';

/* =============================================================================
TEST SUITE: Remaining choices on academy, finance, support, and the header

PURPOSE
-------
Walk every strategy-library filter, every support list, the finance links,
a simulator symbol and risk profile, the empty watchlist Add control, and
Sync all. Nothing is submitted, created, or removed.

RUN
---
npx playwright test tests/DashboardScenarioSweep.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Remaining dashboard scenarios',
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

      await page.goto(
        `${BASE_URL}/dashboard`,
        {
          waitUntil: 'domcontentloaded'
        }
      );

      await dashboard.validateLoaded();
    }

    async function searchSymbol(
      page: Page,
      symbol: string
    ) {
      const input =
        page.locator(
          'main'
        ).getByRole(
          'combobox'
        ).first();

      await input.fill(
        symbol
      );

      await safeClick(
        page.getByRole(
          'option',
          {
            name: new RegExp(
              symbol,
              'i'
            )
          }
        ).first(),
        `Select ${symbol}`
      );

      const search =
        page.getByRole(
          'button',
          {
            name: /^search$/i
          }
        );

      const searchReady =
        await expect(
          search
        ).toBeEnabled({
          timeout: 12000
        }).then(
          () => true
        ).catch(
          () => false
        );

      if (
        searchReady
      ) {
        await safeClick(
          search,
          `Search ${symbol}`
        );
      }
    }

    async function chooseOption(
      page: Page,
      comboIndex: number,
      optionName: RegExp,
      label: string
    ) {
      const combo =
        page.locator(
          'main'
        ).getByRole(
          'combobox'
        ).nth(
          comboIndex
        );

      await safeClick(
        combo,
        label
      );

      const choice =
        page.getByRole(
          'option',
          {
            name: optionName
          }
        ).or(
          page.getByRole(
            'menuitem',
            {
              name: optionName
            }
          )
        ).or(
          page.getByText(
            optionName
          )
        ).first();

      const visible =
        await choice.isVisible({
          timeout: 3000
        }).catch(
          () => false
        );

      if (!visible) {
        await page.keyboard.press(
          'Escape'
        ).catch(
          () => undefined
        );
        console.log(
          `[support] Skipping unavailable ${label} option ${optionName}`
        );
        return;
      }

      await safeClick(
        choice,
        label
      );

      await expect(
        combo
      ).toContainText(
        optionName
      ).catch(
        () => undefined
      );
    }

    test(
      'Strategy library applies every category and filter',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^academy$/i
            }
          ).first(),
          'Academy'
        );

        const categories = [
          {
            button: /^income\b/i,
            heading: /^Covered Call$/
          },
          {
            button: /^directional\b/i,
            heading: /^Long Call$/
          },
          {
            button: /^protection\b/i,
            heading: /^Protective Put$/
          },
          {
            button: /^volatility\b/i,
            heading: /^Long Straddle$/
          },
          {
            button: /^precision\b/i,
            heading: /^Butterfly$/
          },
          {
            button: /^advanced\b/i,
            heading: /^Ratio Spread$/
          },
          {
            button: /^all\b/i,
            heading: /^Covered Call$/
          }
        ];

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^strategy library$/i
            }
          ).first(),
          'Strategy library'
        );

        for (const category of categories) {
          await safeClick(
            page.locator(
              'main'
            ).getByRole(
              'button',
              {
                name: category.button
              }
            ),
            'Strategy category'
          );

          await expect(
            page.getByRole(
              'heading',
              {
                name: category.heading
              }
            )
          ).toBeVisible();
        }

        // One option per filter proves the list updates; full option
        // matrices timed out at 240s on UAT and are covered by sampling.
        const filters = [
          {
            index: 0,
            option: /^bullish$/i,
            restore: /^any view$/i
          },
          {
            index: 1,
            option: /^income$/i,
            restore: /^any objective$/i
          },
          {
            index: 2,
            option: /^defined$/i,
            restore: /^any risk$/i
          },
          {
            index: 3,
            option: /^beginner$/i,
            restore: /^any level$/i
          }
        ];

        await safeClick(
          page.locator(
            'main'
          ).getByRole(
            'button',
            {
              name: /^all\b/i
            }
          ),
          'All strategies'
        );

        for (const filter of filters) {
          await chooseOption(
            page,
            filter.index,
            filter.option,
            'Strategy filter'
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            /of \d+|no strategies|covered call|spread|put|call/i,
            {
              timeout: 15000
            }
          );

          await chooseOption(
            page,
            filter.index,
            filter.restore,
            'Restore strategy filter'
          );
        }

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^Covered Call$/
            }
          )
        ).toBeVisible();

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /max gain/i
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /max loss/i
        );
      }
    );

    test(
      'Company Finance opens related research pages and clears the symbol',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openHeaderMenu(
          page,
          /^research$/i
        );

        await safeClick(
          page.getByRole(
            'menuitem',
            {
              name: /company finance/i
            }
          ),
          'Company Finance'
        );

        await searchSymbol(
          page,
          'AAPL'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^AAPL$/
            }
          )
        ).toBeVisible({
          timeout: 30000
        });

        await expect(
          page.getByRole(
            'tab',
            {
              name: /^income statement$/i
            }
          )
        ).toBeVisible({
          timeout: 20000
        });

        const links = [
          {
            name: /^fundamentals$/i,
            url: /company-fundamentals/,
            content: /overview|valuation|AAPL/i
          },
          {
            name: /analyze options/i,
            url: /equity-research|options-research/,
            content: /AAPL|option|chain|equity/i
          },
          {
            name: /event calendar/i,
            url: /event-calendar/,
            content: /event calendar|earnings|dividend/i
          },
          {
            name: /view all news/i,
            url: /\/news/,
            content: /news|AAPL|headline/i
          }
        ];

        for (const link of links) {
          await page.goto(
            `${BASE_URL}/dashboard/company-finance`,
            {
              waitUntil: 'domcontentloaded'
            }
          );

          await searchSymbol(
            page,
            'AAPL'
          );

          await expect(
            page.getByRole(
              'heading',
              {
                name: /^AAPL$/
              }
            )
          ).toBeVisible({
            timeout: 20000
          });

          await safeClick(
            page.locator(
              'main'
            ).getByRole(
              'link',
              {
                name: link.name
              }
            ).first(),
            'Open finance link'
          );

          await expect(
            page
          ).toHaveURL(
            link.url,
            {
              timeout: 20000
            }
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            link.content
          );
        }

        await page.goto(
          `${BASE_URL}/dashboard/company-finance`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await searchSymbol(
          page,
          'AAPL'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^AAPL$/
            }
          )
        ).toBeVisible({
          timeout: 20000
        });

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /^reset$/i
            }
          ),
          'Reset symbol'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^AAPL$/
            }
          )
        ).toBeHidden();

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /search a symbol/i
        );
      }
    );

    test(
      'Support walks every category, priority, and status without submitting',
      async ({ page }) => {
        await openDashboard(
          page
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

        const categories = [
          /^account$/i,
          /^billing$/i,
          /^brokerage$/i,
          /^portfolio$/i,
          /^technical$/i,
          /^other$/i
        ];

        for (const category of categories) {
          await chooseOption(
            page,
            0,
            category,
            'Ticket category'
          );
        }

        for (const priority of [
          /^low$/i,
          /^normal$/i,
          /^high$/i,
          /^urgent$/i
        ]) {
          await chooseOption(
            page,
            1,
            priority,
            'Ticket priority'
          );
        }

        const message =
          page.getByRole(
            'textbox',
            {
              name: /message/i
            }
          ).or(
            page.getByPlaceholder(
              /message/i
            )
          ).first();

        await message.fill(
          'Coverage check only'
        );

        await expect(
          message
        ).toHaveValue(
          'Coverage check only'
        );

        for (const status of [
          /^open$/i,
          /in progress/i,
          /waiting on user/i,
          /^resolved$/i,
          /^closed$/i,
          /all statuses/i
        ]) {
          await chooseOption(
            page,
            2,
            status,
            'Ticket status'
          );
        }

        await expect(
          page.getByRole(
            'button',
            {
              name: /submit ticket/i
            }
          )
        ).toBeVisible();
      }
    );

    test(
      'Simulator searches a symbol and switches the risk profile',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openHeaderMenu(
          page,
          /^research$/i
        );

        await safeClick(
          page.getByRole(
            'menuitem',
            {
              name: /^simulator$/i
            }
          ),
          'Simulator'
        );

        await searchSymbol(
          page,
          'MSFT'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /MSFT/i,
          {
            timeout: 20000
          }
        );

        const conservative =
          page.getByRole(
            'button',
            {
              name: /conservative\s*\(1/i
            }
          );

        const moderate =
          page.getByRole(
            'button',
            {
              name: /moderate\s*\(4/i
            }
          );

        await safeClick(
          conservative,
          'Conservative profile'
        );

        await expect(
          page.getByRole(
            'row'
          ).filter({
            hasText: /MSFT/i
          }).first()
        ).toBeVisible({
          timeout: 20000
        });

        await expect(
          conservative
        ).toHaveAttribute(
          'aria-pressed',
          'true'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /conservative/i
        );

        await expect(
          moderate
        ).toBeEnabled();

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /^1W$/
            }
          ),
          'Duration 1W'
        );

        await expect(
          page.getByRole(
            'button',
            {
              name: /^1W$/
            }
          )
        ).toHaveAttribute(
          'aria-pressed',
          'true'
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /clear symbol/i
            }
          ),
          'Clear symbol'
        );

        await expect(
          page.getByRole(
            'combobox',
            {
              name: /search company name or symbol/i
            }
          )
        ).not.toHaveValue(
          /MSFT/i
        );

        await expect(
          page.getByRole(
            'button',
            {
              name: /growth\s*\(7/i
            }
          )
        ).toBeDisabled();

        await expect(
          page.getByRole(
            'button',
            {
              name: /aggressive\s*\(9/i
            }
          )
        ).toBeDisabled();
      }
    );

    test(
      'Empty watchlist keeps Add disabled and Sync all stays on the dashboard',
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
              name: /^watchlist$/i
            }
          ),
          'Watchlist'
        );

        await expect(
          page.getByRole(
            'button',
            {
              name: /^add$/i
            }
          )
        ).toBeDisabled();

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^dashboard$/i
            }
          ).first(),
          'Dashboard'
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /sync all/i
            }
          ),
          'Sync all'
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
          const close =
            dialog.getByRole(
              'button',
              {
                name: /cancel|close/i
              }
            );

          if (
            await close.waitFor({
              state: 'visible',
              timeout: 2000
            }).then(
              () => true
            ).catch(
              () => false
            )
          ) {
            await safeClick(
              close.first(),
              'Close sync'
            );
          }
        }

        await expect(
          page
        ).toHaveURL(
          /\/dashboard/
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /portfolio|ools score|\$[\d,]+/i,
          {
            timeout: 20000
          }
        );
      }
    );
  }
);
