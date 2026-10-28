import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from './config/testData';

import { BillingPage }
  from './pages/BillingPage';

import { DashboardPage }
  from './pages/DashboardPage';

import { test }
  from './fixtures/subscriberAuth';

import { ProfilePage }
  from './pages/ProfilePage';

import { RiskCompliancePage }
  from './pages/RiskCompliancePage';

import { safeClick }
  from './helpers/safeClick';

/* =============================================================================
TEST SUITE: Dashboard Navigation

PURPOSE
-------
Validates authenticated navigation across core post-login destinations without
changing account, billing, subscription, or security state.

RUN
---
npx playwright test tests/DashboardNavigation.spec.ts --headed
============================================================================= */

test.describe(
  'Dashboard Navigation',
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

    async function expectNoHorizontalOverflow(
      page: Page
    ) {
      await page.getByRole(
        'button',
        {
          name: /accept( all)?|essential only/i
        }
      ).first().click({
        timeout: 2000
      }).catch(
        () => undefined
      );

      await expect
        .poll(
          async () =>
            await page.evaluate(
              () => {
                const main =
                  document.querySelector(
                    'main, [role="main"]'
                  ) as HTMLElement | null;

                const root =
                  main ??
                  document.body;

                return root.scrollWidth -
                  Math.max(
                    root.clientWidth,
                    window.innerWidth
                  );
              }
            ),
          {
            timeout: 5000,
            message:
              'Authenticated page should not create horizontal overflow'
          }
        )
        .toBeLessThanOrEqual(
          48
        );
    }

    test(
      'Authenticated onboarding route resolves without crash',
      async ({ page }) => {
        await page.goto(
          `${BASE_URL}/onboarding`,
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
          '/onboarding must not show the app crash interstitial'
        ).toBe(
          false
        );

        // Finished subscribers usually redirect to dashboard; incomplete
        // accounts may stay on onboarding/plan selection.
        expect(
          page.url()
        ).toMatch(
          /\/(dashboard|onboarding|plan|choose|support|academy)(\/|$|\?)/i
        );

        expect(
          body.length
        ).toBeGreaterThan(
          20
        );
      }
    );

    test(
      'Utility routes settings notifications activity subscription and security load or redirect safely',
      async ({ page }) => {
        const routes = [
          {
            path: '/dashboard/settings',
            content: /setting|preference|account|profile|security|notification/i
          },
          {
            path: '/dashboard/notifications',
            content: /notification|alert|inbox|preference|activity/i
          },
          {
            path: '/dashboard/activity',
            content: /activity|audit|history|session|login|event/i
          },
          {
            path: '/dashboard/subscription',
            content: /subscription|billing|plan|invoice|current plan|overlay|income/i
          },
          {
            path: '/dashboard/security',
            content: /security|password|mfa|two-factor|authenticator|session/i
          },
          {
            path: '/dashboard/profile/security',
            content: /security|password|mfa|two-factor|authenticator|session|profile/i
          },
          {
            path: '/dashboard/account',
            content: /account|profile|setting|billing|subscription|security/i
          },
          {
            path: '/dashboard/account/security',
            content: /security|password|mfa|two-factor|authenticator|session|profile/i
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

          const crashed =
            /this page couldn[’']t load|reload to try again/i.test(
              body
            );

          expect(
            crashed,
            `${route.path} must not show the app crash interstitial`
          ).toBe(
            false
          );

          const notFound =
            /\b404\b|page not found/i.test(
              body
            );

          if (
            notFound
          ) {
            // Product has not shipped this deep link yet — a clean 404 is fine.
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
            /\/(dashboard|support|academy)(\/|$)/i
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
            expect(
              body
            ).toMatch(
              route.content
            );
          }
        }
      }
    );
    test(
      'Authenticated user can open dashboard profile billing and compliance routes',
      async ({ page }) => {
        const dashboard =
          new DashboardPage(page);

        await page.reload({
          waitUntil: 'domcontentloaded'
        });

        await dashboard.validateLoaded();

        const profile =
          new ProfilePage(page);

        const billing =
          new BillingPage(page);

        const riskCompliance =
          new RiskCompliancePage(page);

        await page.goto(
          `${BASE_URL}/dashboard/profile`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await profile.waitForProfileData();

        await expect(
          profile.emailInput
        ).toBeDisabled();

        await page.goto(
          `${BASE_URL}/dashboard/billing`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await billing.validateBillingUrl();

        await expect(
          billing.plansTab
        ).toBeVisible({
          timeout: 15000
        });

        await riskCompliance.open();

        await expect(
          riskCompliance.riskTab
        ).toBeVisible({
          timeout: 10000
        });

        await expect(
          riskCompliance.complianceTab
        ).toBeVisible({
          timeout: 10000
        });
      }
    );

    test(
      'Authenticated dashboard remains usable on mobile viewport',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await page.setViewportSize({
          width: 390,
          height: 844
        });

        await page.goto(
          `${BASE_URL}/dashboard`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await dashboard.validateLoaded();
        await dashboard.dismissMarketingOverlays();
        await expectNoHorizontalOverflow(page);
      }
    );

    test(
      'Authenticated profile billing and compliance routes remain usable on tablet viewport',
      async ({ page }) => {

        await page.setViewportSize({
          width: 1024,
          height: 768
        });

        const routes = [
          {
            path: '/dashboard/profile',
            url: /\/dashboard\/profile/,
            content: /profile|email|personal/i
          },
          {
            path: '/dashboard/billing',
            url: /\/dashboard\/billing/,
            content: /billing|plan|invoice|transaction|subscription/i
          },
          {
            path: '/dashboard/risk-compliance',
            url: /\/dashboard\/risk-compliance/,
            content: /risk profile|compliance/i
          }
        ];

        for (const route of routes) {
          await page.goto(
            `${BASE_URL}${route.path}`,
            {
              waitUntil: 'domcontentloaded'
            }
          );

          await expect(page).toHaveURL(
            route.url,
            {
              timeout: 15000
            }
          );

          await expect(
            page.locator('body')
          ).toContainText(
            route.content,
            {
              timeout: 15000
            }
          );

          await expectNoHorizontalOverflow(page);
        }
      }
    );

    test(
      'Authenticated deep links with query parameters render expected pages',
      async ({ page }) => {

        const deepLinks = [
          {
            url:
              `${BASE_URL}/dashboard/profile?source=automation`,

            expectedUrl:
              /\/dashboard\/profile/,

            content:
              /profile|personal information|email/i
          },
          {
            url:
              `${BASE_URL}/dashboard/billing?tab=overview`,

            expectedUrl:
              /\/dashboard\/billing/,

            content:
              /billing|current plan|current subscription|plans|history/i
          },
          {
            url:
              `${BASE_URL}/dashboard/risk-compliance?section=risk`,

            expectedUrl:
              /\/dashboard\/risk-compliance/,

            content:
              /risk profile|compliance|investment experience/i
          }
        ];

        for (const deepLink of deepLinks) {
          await page.goto(
            deepLink.url,
            {
              waitUntil: 'domcontentloaded'
            }
          );

          await expect(
            page
          ).toHaveURL(
            deepLink.expectedUrl,
            {
              timeout: 15000
            }
          );

          await expect(
            page
          ).not.toHaveURL(
            /\/login/
          );

          await expect(
            page.locator(
              'body'
            )
          ).toContainText(
            deepLink.content,
            {
              timeout: 15000
            }
          );
        }
      }
    );

    test(
      'Authenticated direct routes tolerate trailing slash and unknown query parameters',
      async ({ page }) => {

        const resilientRoutes = [
          {
            url:
              `${BASE_URL}/dashboard/profile/?unknown=automation-safe-check`,

            expectedUrl:
              /\/dashboard\/profile/,

            content:
              /profile|personal information|email/i
          },
          {
            url:
              `${BASE_URL}/dashboard/billing/?unknown=automation-safe-check`,

            expectedUrl:
              /\/dashboard\/billing/,

            content:
              /billing|current plan|current subscription|plans|history/i
          },
          {
            url:
              `${BASE_URL}/dashboard/risk-compliance/?unknown=automation-safe-check`,

            expectedUrl:
              /\/dashboard\/risk-compliance/,

            content:
              /risk profile|compliance|investment experience/i
          }
        ];

        for (const route of resilientRoutes) {
          await page.goto(
            route.url,
            {
              waitUntil: 'domcontentloaded'
            }
          );

          await expect(
            page
          ).toHaveURL(
            route.expectedUrl,
            {
              timeout: 15000
            }
          );

          await expect(
            page.getByText(
              /this page couldn'?t load|reload to try again/i
            )
          ).not.toBeVisible({
            timeout: 5000
          });

          await expect(
            page.locator(
              'body'
            )
          ).toContainText(
            route.content,
            {
              timeout: 15000
            }
          );
        }
      }
    );

    test(
      'Dashboard footer legal and support links expose usable targets',
      async ({ page }) => {

        await page.goto(
          `${BASE_URL}/dashboard`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        const footerLinks = [
          /privacy policy/i,
          /terms of service/i,
          /disclosures/i,
          /risk warning/i,
          /contact/i
        ];

        for (const linkName of footerLinks) {
          const link =
            page
              .getByRole(
                'link',
                {
                  name: linkName
                }
              )
              .first();

          await expect(
            link
          ).toBeVisible({
            timeout: 10000
          });

          const href =
            await link.getAttribute(
              'href'
            );

          expect(
            href,
            `${linkName} should have a usable href`
          ).toMatch(
            /^(\/|https?:\/\/)(?!#)/i
          );
        }
      }
    );

    test(
      'Profile menu exposes billing risk compliance and sign out actions',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.openProfileMenu();

        await expect(
          page.getByRole(
            'menuitem',
            {
              name: /billing/i
            }
          ).or(
            page.getByRole(
              'link',
              {
                name: /billing/i
              }
            )
          ).or(
            page.getByText(
              /billing/i
            )
          ).first()
        ).toBeVisible({
          timeout: 10000
        });

        await expect(
          page.getByText(
            /risk.*compliance/i
          ).first()
        ).toBeVisible({
          timeout: 10000
        });

        await expect(
          page.getByText(
            /sign out/i
          ).first()
        ).toBeVisible({
          timeout: 10000
        });
      }
    );

    test(
      'Profile menu navigation actions open the expected pages',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateProfileMenuNavigationActions();
      }
    );

    test(
      'Profile menu switches between dark and light theme',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateProfileMenuThemeToggle();
      }
    );

    test(
      'Profile menu enters and exits full screen',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateProfileMenuFullscreenToggle();
      }
    );

    test(
      'Profile menu closes with Escape and outside click',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateProfileMenuDismissal();
      }
    );

    test(
      'Dashboard top navigation tabs are visible',
      async ({ page }) => {

        const topNavigationItems = [
          'Dashboard',
          'Opportunities',
          'Portfolio',
          'Research',
          'Academy',
          'Support'
        ];

        for (const item of topNavigationItems) {
          const itemPattern =
            new RegExp(
              item.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
              ),
              'i'
            );

          await expect(
            page
              .getByRole(
                'link',
                {
                  name: itemPattern
                }
              )
              .or(
                page.getByRole(
                  'button',
                  {
                    name: itemPattern
                  }
                )
              )
              .first()
          ).toBeVisible({
            timeout: 10000
          });
        }
      }
    );

    test(
      'Dashboard top navigation links open without load errors',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateTopNavigationRoutes();
      }
    );

    test(
      'Dashboard top navigation destinations render usable content',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateTopNavigationDestinationsRender();
      }
    );

    test(
      'Dashboard top navigation destinations stay usable after refresh',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateTopNavigationDestinationsRefresh();
      }
    );

    test(
      'Dashboard header notification theme and fullscreen controls are healthy',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateHeaderUtilityControls();
      }
    );

    test(
      'Dashboard refresh utility reloads data without ending session',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateRefreshUtilityControl();
      }
    );

    test(
      'Dashboard quick action menu opens without changing session',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateQuickActionControl();
      }
    );

    test(
      'Notification panel opens and closes without disrupting dashboard',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateNotificationPanelBehavior();
      }
    );

    test(
      'Notification panel remains usable after dashboard refresh',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateNotificationPanelAfterRefresh();
      }
    );

    test(
      'Key authenticated routes stay usable after refresh',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateKeyAuthenticatedRoutesRefresh();
      }
    );

    test(
      'Browser back returns from billing to dashboard without ending session',
      async ({ page }) => {

        await page.goto(
          `${BASE_URL}/dashboard`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await page.goto(
          `${BASE_URL}/dashboard/billing`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await page.goBack({
          waitUntil: 'domcontentloaded'
        });

        await expect(
          page
        ).toHaveURL(
          /\/dashboard/,
          {
            timeout: 15000
          }
        );

        await expect(
          page
        ).not.toHaveURL(
          /\/login/
        );
      }
    );

    test(
      'Profile menu sign out blocks direct dashboard access',
      async ({ page }) => {

        const dashboard =
          new DashboardPage(page);

        await dashboard.signOutFromProfileMenu();

        await page.goto(
          `${BASE_URL}/dashboard`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await expect(
          page
        ).toHaveURL(
          /\/login/,
          {
            timeout: 15000
          }
        );
      }
    );

    test(
      'Dashboard theme stays after refresh and can be restored',
      async ({ page }) => {
        await page.goto(
          `${BASE_URL}/dashboard`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        const dashboard =
          new DashboardPage(page);

        await dashboard.validateLoaded();

        const html =
          page.locator(
            'html'
          );

        const before =
          `${await html.getAttribute('class')}|${await html.getAttribute('data-theme')}`;

        const themeButton =
          page.locator(
            'header button:has(svg.lucide-sun), header button:has(svg.lucide-moon)'
          ).first();

        if (
          !await themeButton.isVisible({
            timeout: 3000
          }).catch(
            () => false
          )
        ) {
          await page.reload({
            waitUntil: 'domcontentloaded'
          });

          await expect
            .poll(
              async () =>
                `${await html.getAttribute('class')}|${await html.getAttribute('data-theme')}`
            )
            .toBe(
              before
            );

          return;
        }

        await safeClick(
          themeButton,
          'Toggle theme'
        );

        await expect
          .poll(
            async () =>
              `${await html.getAttribute('class')}|${await html.getAttribute('data-theme')}`
          )
          .not.toBe(
            before
          );

        const changed =
          `${await html.getAttribute('class')}|${await html.getAttribute('data-theme')}`;

        await page.reload({
          waitUntil: 'domcontentloaded'
        });

        await expect
          .poll(
            async () =>
              `${await html.getAttribute('class')}|${await html.getAttribute('data-theme')}`
          )
          .toBe(
            changed
          );

        await safeClick(
          page.locator(
            'header button:has(svg.lucide-sun), header button:has(svg.lucide-moon)'
          ).first(),
          'Restore theme'
        );

        await page.reload({
          waitUntil: 'domcontentloaded'
        });

        await expect
          .poll(
            async () =>
              `${await html.getAttribute('class')}|${await html.getAttribute('data-theme')}`
          )
          .toBe(
            before
          );
      }
    );
  }
);
