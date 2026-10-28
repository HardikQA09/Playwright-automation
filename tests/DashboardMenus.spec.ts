import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL,
  TEST_USERS
} from './config/testData';

import { DashboardPage }
  from './pages/DashboardPage';

import { LoginPage }
  from './pages/LoginPage';

import { test }
  from './fixtures/subscriberAuth';

import {
  headerMenuEntries,
  openHeaderMenu,
  safeClick
} from './helpers/safeClick';

import { OptionsResearchPage }
  from './pages/OptionsResearchPage';

import { OpportunitiesPage }
  from './pages/OpportunitiesPage';

import {
  BetaSurfacesPage,
  BETA_DESTINATIONS
} from './pages/BetaSurfacesPage';

/* =============================================================================
TEST SUITE: Dashboard menus

PURPOSE
-------
Every header menu destination (Research, Portfolio, Opportunities, Academy, Support, Beta) opens and shows usable screen content.

RUN
---
npx playwright test tests/DashboardMenus.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Dashboard menus',
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

    async function openMenu(
      page: Page,
      name: RegExp,
      label: string
    ) {
      void label;

      await openHeaderMenu(
        page,
        name
      );
    }

    test(
      'Research menu opens fundamentals finance news calendar and simulator',
      async ({ page }) => {
        const contentFor = (
          label: string
        ) => {
          if (
            /^equity$/i.test(
              label
            )
          ) {
            return /equity|symbol|search|research|analyze/i;
          }

          if (
            /fundamental/i.test(
              label
            )
          ) {
            return /fundamental|symbol|search|company/i;
          }

          if (
            /finance/i.test(
              label
            )
          ) {
            return /finance|statement|symbol|search|income/i;
          }

          if (
            /^news$/i.test(
              label
            )
          ) {
            return /news|headline|article|market/i;
          }

          if (
            /event calendar/i.test(
              label
            )
          ) {
            return /event calendar|earnings|dividend/i;
          }

          if (
            /simulator/i.test(
              label
            )
          ) {
            return /simulator|simulation|scenario|strategy/i;
          }

          if (
            /options research/i.test(
              label
            )
          ) {
            return /options research|analyze|chain|strike/i;
          }

          return /research|symbol|search|company|news|calendar|simulat|equity|finance/i;
        };

        await openDashboard(
          page
        );

        await openMenu(
          page,
          /^research$/i,
          'Research menu'
        );

        const items =
          headerMenuEntries(
            page
          );

        await expect(
          items.first()
        ).toBeVisible({
          timeout: 10000
        });

        const names =
          await items.allInnerTexts();

        expect(
          names.length,
          'Research menu should list destinations'
        ).toBeGreaterThan(
          0
        );

        for (const name of names) {
          const label =
            name.replace(
              /\s+/g,
              ' '
            ).trim();

          if (
            !label
          ) {
            continue;
          }

          await openDashboard(
            page
          );

          await openMenu(
            page,
            /^research$/i,
            'Research menu'
          );

          const itemRe =
            new RegExp(
              `^${label.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
              )}$`,
              'i'
            );

          await safeClick(
            headerMenuEntries(
              page
            ).filter({
              hasText: itemRe
            }).first(),
            label
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            contentFor(
              label
            ),
            {
              timeout: 20000
            }
          );
        }
      }
    );
    test(
      'Portfolio menu opens each holdings destination',
      async ({ page }) => {
        await openDashboard(
          page
        );

        await openMenu(
          page,
          /^portfolio$/i,
          'Portfolio menu'
        );

        const items =
          headerMenuEntries(
            page
          );

        await expect(
          items.first()
        ).toBeVisible({
          timeout: 10000
        });

        const names =
          await items.allInnerTexts();

        expect(
          names.length
        ).toBeGreaterThan(
          0
        );

        for (const name of names) {
          const label =
            name.replace(
              /\s+/g,
              ' '
            ).trim();

          if (
            !label
          ) {
            continue;
          }

          await openDashboard(
            page
          );

          await openMenu(
            page,
            /^portfolio$/i,
            'Portfolio menu'
          );

          const itemRe =
            new RegExp(
              `^${label.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
              )}$`,
              'i'
            );

          await safeClick(
            headerMenuEntries(
              page
            ).filter({
              hasText: itemRe
            }).first(),
            label
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            /portfolio|account|position|holding|broker|connect|watchlist|symbol/i,
            {
              timeout: 20000
            }
          );
        }
      }
    );

    test(
      'Academy and Support header links open their screens',
      async ({ page }) => {
        const destinations = [
          {
            name: /^academy$/i,
            url: /academy/i,
            content: /academy|course|learn|lesson/i
          },
          {
            name: /^support$/i,
            url: /support/i,
            content: /support|help|contact|question/i
          }
        ];

        for (const destination of destinations) {
          await openDashboard(
            page
          );

          await safeClick(
            page.getByRole(
              'link',
              {
                name: destination.name
              }
            ).first(),
            destination.name.source
          );

          await expect(
            page
          ).toHaveURL(
            destination.url,
            {
              timeout: 20000
            }
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            destination.content,
            {
              timeout: 20000
            }
          );
        }
      }
    );

    test(
      'Opportunities header link opens the opportunities page',
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

        await expect(
          page
        ).toHaveURL(
          /opportunities/i,
          {
            timeout: 20000
          }
        );

        await new OpportunitiesPage(
          page
        ).validateLoaded();
      }
    );

    test(
      'Beta menu opens each destination when available',
      async ({ page }) => {
        await openDashboard(
          page
        );

        const betaControl =
          page.getByRole(
            'button',
            {
              name: /^beta$/i
            }
          ).or(
            page.getByRole(
              'link',
              {
                name: /^beta$/i
              }
            )
          ).first();

        let betaVisible =
          await betaControl.isVisible({
            timeout: 5000
          }).catch(
            () => false
          );

        // Plantest / Income fixtures often lack Beta; e2e has the full menu.
        if (
          !betaVisible
        ) {
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

          betaVisible =
            await betaControl.isVisible({
              timeout: 8000
            }).catch(
              () => false
            );
        }

        if (
          !betaVisible
        ) {
          test.skip(
            true,
            'Neither subscriber nor e2e account exposes a Beta menu.'
          );
        }

        const beta =
          new BetaSurfacesPage(
            page
          );

        const labels =
          await beta.listBetaMenuLabels();

        expect(
          labels.length,
          'Beta menu should list at least one destination'
        ).toBeGreaterThan(
          0
        );

        const betaScreens = [
          ...BETA_DESTINATIONS
        ];

        if (
          labels.some(
            (label) =>
              /performance/i.test(
                label
              )
          )
        ) {
          betaScreens.push({
            label: /performance/i,
            path: '/dashboard/beta/performance',
            heading: /performance|ooltool/i
          });
        }

        for (const destination of betaScreens) {
          const listed =
            labels.some(
              (label) =>
                destination.label.test(
                  label
                )
            );

          if (
            !listed
          ) {
            continue;
          }

          await page.goto(
            `${BASE_URL}/dashboard`,
            {
              waitUntil: 'domcontentloaded'
            }
          );

          await new DashboardPage(
            page
          ).validateLoaded();

          try {
            await beta.openDestination(
              destination
            );
          } catch (error) {
            // Performance may live at a non-standard path — fall back to menu click content.
            if (
              !/performance/i.test(
                destination.path
              )
            ) {
              throw error;
            }

            await openHeaderMenu(
              page,
              /^beta$/i
            );

            await safeClick(
              headerMenuEntries(
                page
              ).filter({
                hasText: /performance/i
              }).first(),
              'Beta Performance'
            );

            await expect(
              page.locator(
                'main'
              )
            ).toContainText(
              /performance|ooltool|return|allocation/i,
              {
                timeout: 20000
              }
            );
          }
        }
      }
    );
    test(
      'Direct options research route loads analyze control',
      async ({ page }) => {
        await page.goto(
          `${BASE_URL}/dashboard/options-research`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await new OptionsResearchPage(
          page
        ).validateLoaded();
      }
    );

    test(
      'Direct research and portfolio routes load or redirect safely',
      async ({ page }) => {
        const routes = [
          {
            path: '/dashboard/simulator',
            content: /simulator|simulation|scenario|strategy/i
          },
          {
            path: '/dashboard/company-fundamentals',
            content: /fundamental|symbol|search|company/i
          },
          {
            path: '/dashboard/opportunities',
            content: /opportunit|symbol|filter|score|strategy/i
          },
          {
            path: '/dashboard/watchlist',
            content: /watchlist|symbol|add|search|empty|no symbols/i
          },
          {
            path: '/dashboard/academy',
            content: /academy|course|learn|lesson/i
          },
          {
            path: '/dashboard/accounts',
            content: /account|broker|connect|manage|position|holding/i
          }
        ];

        for (const route of routes) {
          await page.goto(
            `${BASE_URL}${route.path}`,
            {
              waitUntil: 'domcontentloaded'
            }
          );

          const body =
            await page.locator(
              'body'
            ).innerText({
              timeout: 15000
            });

          expect(
            /this page couldn[’']t load|reload to try again/i.test(
              body
            ),
            `${route.path} must not show the app crash interstitial`
          ).toBe(
            false
          );

          if (
            /\b404\b|page not found/i.test(
              body
            )
          ) {
            await expect(
              page.getByRole(
                'link',
                {
                  name: /go home|dashboard|home/i
                }
              ).first()
            ).toBeVisible({
              timeout: 10000
            });

            continue;
          }

          expect(
            page.url()
          ).toMatch(
            /\/(dashboard|support|academy|opportunit)(\/|$)/i
          );

          expect(
            body.length
          ).toBeGreaterThan(
            40
          );

          if (
            page.url().toLowerCase().includes(
              route.path.toLowerCase()
            )
          ) {
            // Some deep links keep the path but render the dashboard shell
            // until the feature page ships — either content or shell is OK.
            const shell =
              /Dashboard[\s\S]{0,40}Opportunities[\s\S]{0,40}Portfolio/i.test(
                body
              );

            expect(
              route.content.test(
                body
              ) ||
                shell,
              `${route.path} should show destination content or an authenticated dashboard shell`
            ).toBe(
              true
            );
          }
        }
      }
    );
  }
);
