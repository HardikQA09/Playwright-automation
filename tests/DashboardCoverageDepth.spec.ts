import {
  expect,
  Locator,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from './config/testData';

import { DashboardPage }
  from './pages/DashboardPage';

import { test }
  from './fixtures/subscriberAuth';

import { safeClick, openHeaderMenuItem }
  from './helpers/safeClick';

/* =============================================================================
TEST SUITE: Deeper controls on research, portfolio, academy, and support

PURPOSE
-------
Change a value on each screen and check the screen follows it. Finance
statements, news tabs, analytics ranges, academy pages, a cancelled
watchlist, support fields, simulator duration, and the fundamentals chart.
Nothing is submitted or saved.

RUN
---
npx playwright test tests/DashboardCoverageDepth.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Deeper dashboard controls',
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

    async function openResearchItem(
      page: Page,
      name: RegExp,
      label: string
    ) {
      await openHeaderMenuItem(
        page,
        /^research$/i,
        name,
        label
      );
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

    async function setLabeledChoice(
      page: Page,
      label: RegExp,
      optionName: string
    ) {
      const optionPattern =
        new RegExp(
          `^${optionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          'i'
        );

      const native =
        page.locator(
          'select'
        ).filter({
          has: page.locator(
            'option'
          ).filter({
            hasText: optionPattern
          })
        }).first();

      if (
        await native.count()
      ) {
        await native.selectOption({
          label: optionName
        }).catch(
          async () => undefined
        );
      }

      const shown =
        await page.locator(
          'main'
        ).getByText(
          optionPattern
        ).first().isVisible({
          timeout: 2000
        }).catch(
          () => false
        );

      if (
        shown
      ) {
        return;
      }

      const combo =
        page.getByLabel(
          label
        ).or(
          page.locator(
            'main'
          ).getByRole(
            'combobox'
          ).filter({
            hasText: label
          })
        ).first();

      await combo.selectOption({
        label: optionName
      }).catch(
        async () => {
          await safeClick(
            combo,
            optionName
          );

          await page.getByRole(
            'option',
            {
              name: optionPattern
            }
          ).click({
            force: true,
            timeout: 8000
          }).catch(
            async () => {
              await page.getByText(
                optionPattern
              ).last().click({
                force: true
              });
            }
          );
        }
      );
    }

    async function searchSymbol(
      page: Page,
      symbol: string,
      expectHeading = true
    ) {
      const input =
        page.locator(
          'main'
        ).getByRole(
          'combobox'
        ).or(
          page.getByPlaceholder(
            /symbol/i
          )
        ).first();

      await input.fill(
        symbol
      );

      const choice =
        page.getByRole(
          'option',
          {
            name: new RegExp(
              symbol,
              'i'
            )
          }
        ).first();

      if (
        await choice.waitFor({
          state: 'visible',
          timeout: 5000
        }).then(
          () => true
        ).catch(
          () => false
        )
      ) {
        await safeClick(
          choice,
          `Select ${symbol}`
        );
      }

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

      if (
        expectHeading
      ) {
        await expect(
          page.getByRole(
            'heading',
            {
              name: new RegExp(
                `^${symbol}$`
              )
            }
          )
        ).toBeVisible({
          timeout: 30000
        });
      }
    }

    function rangeButton(
      page: Page,
      name: string
    ) {
      return page.locator(
        'main'
      ).getByRole(
        'button',
        {
          name: new RegExp(
            `^${name}$`
          )
        }
      );
    }

    async function expectChosen(
      button: Locator
    ) {
      await expect(
        button
      ).toHaveClass(
        /bg-primary/
      );
    }

    test(
      'Company Finance switches statements and period, then resets',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /company finance/i,
          'Company Finance'
        );

        await searchSymbol(
          page,
          'AAPL'
        );

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

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /total revenue/i
        );

        await safeClick(
          rangeButton(
            page,
            'Quarterly'
          ),
          'Quarterly'
        );

        await expectChosen(
          rangeButton(
            page,
            'Quarterly'
          )
        );

        await safeClick(
          rangeButton(
            page,
            'Annual'
          ),
          'Annual'
        );

        await expectChosen(
          rangeButton(
            page,
            'Annual'
          )
        );

        for (const statement of [
          {
            name: /^balance sheet$/i,
            content: /total assets|liabilit/i
          },
          {
            name: /^cash flow$/i,
            content: /operating cash|cash flow/i
          },
          {
            name: /^ratios$/i,
            content: /ratio|margin|return on/i
          }
        ]) {
          await safeClick(
            page.getByRole(
              'tab',
              {
                name: statement.name
              }
            ),
            'Open statement'
          );

          await expect(
            page.getByRole(
              'tab',
              {
                name: statement.name
              }
            )
          ).toHaveAttribute(
            'aria-selected',
            'true'
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            statement.content
          );
        }

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /^reset$/i
            }
          ),
          'Reset finance search'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /search a symbol to view company finance data/i
        );

        await expect(
          page.getByRole(
            'tab',
            {
              name: /^income statement$/i
            }
          )
        ).toHaveCount(
          0
        );
      }
    );

    test(
      'News switches portfolio and watchlist, then searches a symbol',
      async ({ page }) => {
        await openDashboard(
          page
        );

        try {
          await openResearchItem(
            page,
            /^news$/i,
            'News'
          );
        } catch {
          await page.goto(
            `${BASE_URL}/dashboard/news`,
            {
              waitUntil: 'domcontentloaded'
            }
          );
        }

        await expect(
          page
        ).toHaveURL(
          /news/,
          {
            timeout: 20000
          }
        );

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^portfolio\b/i
            }
          ),
          'Portfolio news'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /headline|research|read|AAPL|held/i,
          {
            timeout: 20000
          }
        );

        const symbolFilter =
          page.locator(
            'main'
          ).getByRole(
            'combobox'
          ).first();

        if (
          await symbolFilter.waitFor({
            state: 'visible',
            timeout: 4000
          }).then(
            () => true
          ).catch(
            () => false
          )
        ) {
          await safeClick(
            symbolFilter,
            'News symbol filter'
          );

          await safeClick(
            page.getByRole(
              'option',
              {
                name: /^AAPL\b/i
              }
            ).first(),
            'Filter news to AAPL'
          );

          await expect(
            symbolFilter
          ).toContainText(
            /AAPL/i
          );

          await safeClick(
            symbolFilter,
            'News symbol filter'
          );

          await safeClick(
            page.getByRole(
              'option',
              {
                name: /all symbols/i
              }
            ).first(),
            'Show all news symbols'
          );
        }

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^watchlist$/i
            }
          ),
          'Watchlist news'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /add symbols to your watchlist|watchlist/i
        );

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^all$/i
            }
          ),
          'All news'
        );

        await searchSymbol(
          page,
          'AAPL',
          false
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /results for AAPL/i,
          {
            timeout: 20000
          }
        );

        await safeClick(
          page.getByRole(
            'button',
            {
              name: /^reset$/i
            }
          ),
          'Reset news search'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /search a symbol to see headlines/i
        );
      }
    );

    test(
      'Analytics changes the performance range',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openPortfolioItem(
          page,
          /^analytics$/i,
          'Analytics'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^analytics$/i
            }
          )
        ).toBeVisible({
          timeout: 20000
        });

        for (const range of [
          '1M',
          '3M',
          'YTD',
          '1Y',
          'ALL',
          '1W'
        ]) {
          const button =
            rangeButton(
              page,
              range
            );

          await safeClick(
            button,
            `Analytics ${range}`
          );

          await expectChosen(
            button
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            /portfolio performance|\$[\d,.]+/i
          );
        }
      }
    );

    test(
      'Academy opens glossary, a lesson, and the strategy library',
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

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^glossary$/i
            }
          ).first(),
          'Glossary'
        );

        await expect(
          page
        ).toHaveURL(
          /\/academy\/glossary/
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /assignment|bid\s*\/\s*ask|breakeven/i
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^lessons$/i
            }
          ).first(),
          'Lessons'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /what is a covered call/i,
          {
            timeout: 15000
          }
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /what is a covered call/i
            }
          ).or(
            page.getByRole(
              'button',
              {
                name: /^open$/i
              }
            )
          ).first(),
          'Open covered call lesson'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /covered call|strike|shares/i,
          {
            timeout: 15000
          }
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^strategy library$/i
            }
          ).first(),
          'Strategy library'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /covered call|strateg/i,
          {
            timeout: 15000
          }
        );
      }
    );

    test(
      'Watchlist opens a new list and cancels, then shows opportunities',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openPortfolioItem(
          page,
          /^watchlist$/i,
          'Watchlist'
        );

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

        await expect(
          dialog
        ).toContainText(
          /create watchlist|name/i
        );

        await safeClick(
          dialog.getByRole(
            'button',
            {
              name: /^cancel$/i
            }
          ),
          'Cancel new watchlist'
        );

        await expect(
          dialog
        ).toBeHidden();

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^opportunities\b/i
            }
          ),
          'Watchlist opportunities'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /no watched opportunities|browse opportunities/i
        );

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^my watchlist\b/i
            }
          ),
          'My watchlist'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^watchlist$/i
            }
          )
        ).toBeVisible();
      }
    );

    test(
      'Support changes ticket fields and status without submitting',
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

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^support$/i
            }
          )
        ).toBeVisible({
          timeout: 20000
        });

        await setLabeledChoice(
          page,
          /^category$/i,
          'Billing'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /billing/i
        );

        await setLabeledChoice(
          page,
          /^priority$/i,
          'Low'
        );

        const subject =
          page.getByRole(
            'textbox',
            {
              name: /subject/i
            }
          ).or(
            page.getByPlaceholder(
              /subject/i
            )
          ).first();

        await subject.fill(
          'Coverage check'
        );

        await expect(
          subject
        ).toHaveValue(
          'Coverage check'
        );

        await setLabeledChoice(
          page,
          /status/i,
          'Open'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /\bopen\b/i
        );

        await setLabeledChoice(
          page,
          /status/i,
          'All statuses'
        );

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
      'Simulator changes duration and keeps locked risk profiles locked',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /^simulator$/i,
          'Simulator'
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

        for (const duration of [
          '1M',
          '3M',
          '6M',
          '1Y',
          '1W'
        ]) {
          const button =
            rangeButton(
              page,
              duration
            );

          await safeClick(
            button,
            `Duration ${duration}`
          );

          await expectChosen(
            button
          );
        }

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /simulator|risk profile|duration/i
        );
      }
    );

    test(
      'Company fundamentals chart range changes',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /company fundamentals/i,
          'Company Fundamentals'
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

        for (const range of [
          '1M',
          '1Y',
          '5Y'
        ]) {
          const button =
            rangeButton(
              page,
              range
            );

          await safeClick(
            button,
            `Chart ${range}`
          );

          await expectChosen(
            button
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            /\$\d[\d,]*(?:\.\d+)?/
          );
        }
      }
    );

    test(
      'Company Finance unknown symbol stays empty',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /company finance/i,
          'Company Finance'
        );

        const input =
          page.locator(
            'main'
          ).getByRole(
            'combobox'
          ).or(
            page.getByPlaceholder(
              /symbol/i
            )
          ).first();

        await input.fill(
          'ZZZNOTASYMBOL'
        );

        const choice =
          page.getByRole(
            'option',
            {
              name: /ZZZNOTASYMBOL/i
            }
          ).first();

        await expect(
          choice
        ).toHaveCount(
          0
        );

        const search =
          page.getByRole(
            'button',
            {
              name: /^search$/i
            }
          );

        if (
          await search.isEnabled()
        ) {
          await safeClick(
            search,
            'Search unknown symbol'
          );
        }

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^ZZZNOTASYMBOL$/
            }
          )
        ).toHaveCount(
          0
        );

        await expect(
          page.getByRole(
            'tab',
            {
              name: /^income statement$/i
            }
          )
        ).toHaveCount(
          0
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /search a symbol|no result|not found|no match/i
        );
      }
    );

    test(
      'News opens one headline and returns to the list',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /^news$/i,
          'News'
        );

        const story =
          page.locator(
            'main a[href]'
          ).filter({
            hasText: /[A-Za-z]{8,}/
          }).filter({
            hasNotText:
              /privacy|terms|disclosure|cookie|opportunities|portfolio|academy|support|dashboard/i
          }).first();

        await expect(
          story
        ).toBeVisible({
          timeout: 20000
        });

        const href =
          await story.getAttribute(
            'href'
          );

        const popupPromise =
          page.context().waitForEvent(
            'page',
            {
              timeout: 4000
            }
          ).catch(
            () => null
          );

        await safeClick(
          story,
          'Open news headline'
        );

        const popup =
          await popupPromise;

        const article =
          popup ?? page;

        await expect(
          article
        ).not.toHaveURL(
          /about:blank/
        );

        if (
          !popup
        ) {
          await expect(
            page
          ).not.toHaveURL(
            /\/dashboard\/news\/?$/
          );
        }

        await expect(
          article.locator(
            'main, article, body'
          ).first()
        ).toContainText(
          /[A-Za-z]{8,}/
        );

        if (
          popup
        ) {
          await popup.close();
        } else {
          await page.goto(
            `${BASE_URL}/dashboard/news`,
            {
              waitUntil: 'domcontentloaded'
            }
          );
        }

        await expect(
          page
        ).toHaveURL(
          /\/dashboard\/news/
        );

        expect(
          href || ''
        ).not.toEqual(
          ''
        );
      }
    );

    test(
      'Company Fundamentals opens a second symbol',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /company fundamentals/i,
          'Company Fundamentals'
        );

        await searchSymbol(
          page,
          'AAPL'
        );

        await searchSymbol(
          page,
          'MSFT'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^MSFT$/
            }
          )
        ).toBeVisible({
          timeout: 20000
        });

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^AAPL$/
            }
          )
        ).toHaveCount(
          0
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /\$\d[\d,]*(?:\.\d+)?/
        );
      }
    );

    test(
      'Simulator clears the searched symbol',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /^simulator$/i,
          'Simulator'
        );

        const input =
          page.getByRole(
            'combobox',
            {
              name: /search company name or symbol|search symbol/i
            }
          ).or(
            page.getByPlaceholder(
              /search|symbol/i
            )
          ).first();

        await input.fill(
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
        }

        const analyze =
          page.getByRole(
            'button',
            {
              name: /^analyze$/i
            }
          );

        if (
          await analyze.isEnabled().catch(
            () => false
          )
        ) {
          await safeClick(
            analyze,
            'Analyze MSFT'
          );
        }

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

        const clear =
          page.getByRole(
            'button',
            {
              name: /clear symbol|^reset$|^clear$/i
            }
          ).first();

        await safeClick(
          clear,
          'Clear simulator symbol'
        );

        await expect(
          page.locator(
            'main'
          )
        ).not.toContainText(
          /^MSFT$/
        );

        await expect(
          input
        ).toHaveValue(
          ''
        );
      }
    );

    test(
      'Support keeps an empty ticket from being submitted',
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

        const submit =
          page.getByRole(
            'button',
            {
              name: /submit ticket/i
            }
          );

        await expect(
          submit
        ).toBeVisible();

        await safeClick(
          submit,
          'Submit empty ticket'
        );

        await expect(
          page
        ).toHaveURL(
          /\/dashboard\/support/
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /subject|message|required|enter|describe/i
        );

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
      'News unknown symbol stays on the list',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /^news$/i,
          'News'
        );

        const input =
          page.locator(
            'main'
          ).getByRole(
            'combobox'
          ).or(
            page.getByPlaceholder(
              /symbol/i
            )
          ).first();

        await input.fill(
          'ZZZNOTASYMBOL'
        );

        await expect(
          page.getByRole(
            'option',
            {
              name: /ZZZNOTASYMBOL/i
            }
          )
        ).toHaveCount(
          0
        );

        const search =
          page.getByRole(
            'button',
            {
              name: /^search$/i
            }
          );

        if (
          await search.isEnabled().catch(
            () => false
          )
        ) {
          await safeClick(
            search,
            'Search unknown news symbol'
          );
        }

        await expect(
          page
        ).toHaveURL(
          /\/dashboard\/news/
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /no result|no match|not found|no headlines|search a symbol/i
        );

        await expect(
          page.locator(
            'main'
          )
        ).not.toContainText(
          /results for ZZZNOTASYMBOL/i
        );

        const reset =
          page.getByRole(
            'button',
            {
              name: /^reset$/i
            }
          );

        if (
          await reset.isVisible().catch(
            () => false
          )
        ) {
          await safeClick(
            reset,
            'Reset news search'
          );
        }
      }
    );

    test(
      'Company Fundamentals unknown symbol stays empty',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /company fundamentals/i,
          'Company Fundamentals'
        );

        const input =
          page.locator(
            'main'
          ).getByRole(
            'combobox'
          ).or(
            page.getByPlaceholder(
              /symbol/i
            )
          ).first();

        await input.fill(
          'ZZZNOTASYMBOL'
        );

        await expect(
          page.getByRole(
            'option',
            {
              name: /ZZZNOTASYMBOL/i
            }
          )
        ).toHaveCount(
          0
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^ZZZNOTASYMBOL$/
            }
          )
        ).toHaveCount(
          0
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /search a symbol|no result|not found|no match/i
        );
      }
    );

    test(
      'Support rejects a file that is not an image',
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

        await page.locator(
          'input[type="file"]'
        ).first().setInputFiles({
          name: 'not-an-image.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(
            'this is not an image'
          )
        });

        const rejected =
          page.locator(
            'main'
          ).getByText(
            /jpeg|png|webp|image|invalid|unsupported|not allowed/i
          );

        const attached =
          page.locator(
            'main'
          ).getByText(
            /not-an-image\.txt/i
          );

        if (
          !(
            await rejected.waitFor({
              state: 'visible',
              timeout: 5000
            }).then(
              () => true
            ).catch(
              () => false
            )
          )
        ) {
          await expect(
            attached
          ).toHaveCount(
            0
          );
        }

        await expect(
          page
        ).toHaveURL(
          /\/dashboard\/support/
        );

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
      'Support clears a draft subject without submitting',
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

        const subject =
          page.getByRole(
            'textbox',
            {
              name: /^subject$/i
            }
          );

        await subject.fill(
          'AIR draft check'
        );

        await expect(
          subject
        ).toHaveValue(
          'AIR draft check'
        );

        await subject.fill(
          ''
        );

        await expect(
          subject
        ).toHaveValue(
          ''
        );

        await expect(
          page
        ).toHaveURL(
          /\/dashboard\/support/
        );
      }
    );

    test(
      'Company Fundamentals dividends tab returns to overview',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /company fundamentals/i,
          'Company Fundamentals'
        );

        await searchSymbol(
          page,
          'AAPL'
        );

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^dividends$/i
            }
          ),
          'Dividends'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /dividend/i
        );

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^overview$/i
            }
          ),
          'Overview'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^AAPL$/
            }
          )
        ).toBeVisible();
      }
    );


    test(
      'Company Fundamentals earnings tab returns to overview',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /company fundamentals/i,
          'Company Fundamentals'
        );

        await searchSymbol(
          page,
          'AAPL'
        );

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^earnings$/i
            }
          ),
          'Earnings'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /earnings/i
        );

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^overview$/i
            }
          ),
          'Overview'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^AAPL$/
            }
          )
        ).toBeVisible();
      }
    );

    test(
      'Company Finance ratios hide the period switch',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openResearchItem(
          page,
          /company finance/i,
          'Company Finance'
        );

        await searchSymbol(
          page,
          'AAPL'
        );

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^ratios$/i
            }
          ),
          'Ratios'
        );

        await expect(
          rangeButton(
            page,
            'Annual'
          )
        ).toBeHidden();

        await safeClick(
          page.getByRole(
            'tab',
            {
              name: /^income statement$/i
            }
          ),
          'Income Statement'
        );

        await expect(
          rangeButton(
            page,
            'Annual'
          )
        ).toBeVisible();
      }
    );

    test(
      'Support clears a draft message without submitting',
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

        const message =
          page.getByRole(
            'textbox',
            {
              name: /^message$/i
            }
          );

        await message.fill(
          'AIR draft message'
        );

        await expect(
          message
        ).toHaveValue(
          'AIR draft message'
        );

        await message.fill(
          ''
        );

        await expect(
          message
        ).toHaveValue(
          ''
        );

        await expect(
          page
        ).toHaveURL(
          /\/dashboard\/support/
        );

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

  }
);
