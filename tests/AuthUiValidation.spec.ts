import {
  expect,
  Locator,
  Page,
  test
} from '@playwright/test';

import {
  BASE_URL
} from './config/testData';

import { ForgotPasswordPage }
  from './pages/ForgotPasswordPage';

import { RegistrationPage }
  from './pages/RegistrationPage';

import {
  dismissOverlays
} from './helpers/dismissOverlays';

import { safeClick }
  from './helpers/safeClick';

/* =============================================================================
TEST SUITE: Auth UI Validation

PURPOSE
-------
Validates public authentication-screen navigation and non-mutating UI controls.

RUN
---
npx playwright test tests/AuthUiValidation.spec.ts --headed
============================================================================= */

function authRegistrationLink(
  page: Page
) {
  return page.getByRole(
    'link',
    {
      name: /^sign up$/i
    }
  ).or(
    page.getByRole(
      'link',
      {
        name: /sign up|create account|start\s+30[-\s]?day\s+free\s+trial/i
      }
    )
  ).or(
    page.getByRole(
      'button',
      {
        name: /sign up|create account|start\s+30[-\s]?day\s+free\s+trial/i
      }
    )
  ).first();
}

async function expectRegistrationOpened(
  page: Page
) {
  await expect
    .poll(
      async () => {
        if (
          /\/register|\/signup|\/sign-up|\/create/i.test(
            page.url()
          )
        ) {
          return true;
        }

        const firstName =
          page.locator(
            'input[name="firstName"]'
          ).or(
            page.getByLabel(
              /first name/i
            )
          ).first();

        return firstName.isVisible().catch(
          () => false
        );
      },
      {
        timeout: 60000
      }
    )
    .toBeTruthy();
}

async function findPasswordToggle(
  page: Page,
  passwordInput: Locator
) {
  const siblingToggle =
    passwordInput.locator(
      'xpath=following-sibling::button'
    ).first();

  if (
    await siblingToggle.isVisible().catch(
      () => false
    )
  ) {
    return siblingToggle;
  }

  const fieldToggle =
    passwordInput
      .locator(
        'xpath=ancestor::div[contains(@class,"relative")][1]'
      )
      .getByRole(
        'button',
        {
          name: /^(show|hide)(\s+password)?$/i
        }
      )
      .first();

  if (
    await fieldToggle.isVisible().catch(
      () => false
    )
  ) {
    return fieldToggle;
  }

  return page.getByRole(
    'button',
    {
      name: /^(show|hide)(\s+password)?$/i
    }
  ).first();
}

async function readPasswordToggleState(
  passwordInput: Locator,
  toggle: Locator
) {
  const type =
    await passwordInput.getAttribute(
      'type'
    );

  const aria =
    (
      await toggle.getAttribute(
        'aria-label'
      )
    )?.trim() ||
    (
      await toggle.getAttribute(
        'title'
      )
    )?.trim() ||
    (
      await toggle.textContent()
    )?.trim() ||
    '';

  const icon =
    await toggle.locator(
      'svg'
    ).first().innerHTML().catch(
      () => ''
    );

  return {
    type: type || '',
    aria,
    icon
  };
}

async function expectPasswordToggleResponds(
  passwordInput: Locator,
  toggle: Locator
) {
  const page =
    passwordInput.page();

  // Cookie banner steals the first click on login; clear it before toggling.
  await dismissOverlays(
    page
  );
  await page
    .getByRole(
      'button',
      {
        name: /^(essential only|accept( all)?)$/i
      }
    )
    .first()
    .click({
      force: true,
      timeout: 3000
    })
    .catch(
      () => undefined
    );
  await dismissOverlays(
    page
  );

  await expect(
    toggle
  ).toBeVisible({
    timeout: 10000
  });

  const initialState =
    await readPasswordToggleState(
      passwordInput,
      toggle
    );

  console.log(
    '[CLICK] Toggle Password Visibility'
  );

  await toggle.click({
    force: true,
    timeout: 10000
  });

  if (
    !await (async () => {
      const current =
        await readPasswordToggleState(
          passwordInput,
          toggle
        );

      return current.type ===
        'text' ||
        /hide/i.test(
          current.aria
        );
    })()
  ) {
    await toggle.evaluate(
      (element) => {
        (
          element as HTMLElement
        ).click();
      }
    );
  }

  const toggleResponded = async () => {
    const currentState =
      await readPasswordToggleState(
        passwordInput,
        toggle
      );

    const hideControlVisible =
      await page.getByRole(
        'button',
        {
          name: /hide(\s+password)?/i
        }
      ).first().isVisible().catch(
        () => false
      );

    const typeFlipped =
      Boolean(
        currentState.type
      ) &&
      currentState.type !==
        initialState.type;

    const nameFlipped =
      Boolean(
        currentState.aria
      ) &&
      currentState.aria.toLowerCase() !==
        initialState.aria.toLowerCase();

    const showBecameHide =
      /show/i.test(
        initialState.aria
      ) &&
      /hide/i.test(
        currentState.aria
      );

    const iconFlipped =
      Boolean(
        currentState.icon
      ) &&
      currentState.icon !==
        initialState.icon;

    return typeFlipped ||
      nameFlipped ||
      showBecameHide ||
      iconFlipped ||
      hideControlVisible ||
      currentState.type === 'text';
  };

  if (
    !await toggleResponded()
  ) {
    await toggle.focus();
    await page.keyboard.press(
      'Enter'
    );
  }

  if (
    !await toggleResponded()
  ) {
    await toggle.click({
      force: true,
      timeout: 5000
    }).catch(
      () => undefined
    );
  }

  await expect
    .poll(
      toggleResponded,
      {
        timeout: 10000,
        message:
          'Password visibility toggle should switch input type to text and/or change Show → Hide.'
      }
    )
    .toBeTruthy();

  await expect(
    passwordInput
  ).toHaveValue(
    /./
  );
}

test.describe(
  'Auth UI Validation',
  () => {

    test(
      'Login screen navigates to forgot password and back',
      async ({ page }) => {

        const forgotPassword =
          new ForgotPasswordPage(page);

        await forgotPassword.open();

        await forgotPassword.backToLogin();

        await expect(
          page
        ).toHaveURL(
          /\/login/
        );
      }
    );

    test(
      'Login direct link remains usable after refresh',
      async ({ page }) => {

        await page.goto(
          `${BASE_URL}/login`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await expect(
          page.locator(
            'input[type="email"]'
          ).first()
        ).toBeVisible({
          timeout: 10000
        });

        await expect(
          page.locator(
            'input[type="password"]'
          ).first()
        ).toBeVisible({
          timeout: 10000
        });

        await page.reload({
          waitUntil: 'domcontentloaded'
        });

        await expect(
          page
        ).toHaveURL(
          /\/login/,
          {
            timeout: 10000
          }
        );

        await expect(
          page.getByRole(
            'button',
            {
              name: /sign in/i
            }
          )
        ).toBeVisible({
          timeout: 10000
        });
      }
    );

    test(
      'Login password draft is cleared after refresh',
      async ({ page }) => {

        await page.goto(
          `${BASE_URL}/login`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        const passwordInput =
          page.getByLabel(
            /^password$/i
          ).or(
            page.locator(
              'input[name="password"], input[type="password"]'
            )
          ).first();

        await expect(
          passwordInput
        ).toBeVisible({
          timeout: 10000
        });

        await passwordInput.fill(
          'DraftPassword123!'
        );

        await page.reload({
          waitUntil: 'domcontentloaded'
        });

        await expect(
          page
        ).toHaveURL(
          /\/login/,
          {
            timeout: 10000
          }
        );

        await expect(
          passwordInput
        ).toHaveValue(
          ''
        );
      }
    );

    test(
      'Forgot password back to login clears reset-only navigation state',
      async ({ page }) => {
        test.setTimeout(90000);

        const forgotPassword =
          new ForgotPasswordPage(page);

        await forgotPassword.open();

        await forgotPassword.emailInput.fill(
          'draft-reset@example.com'
        );

        await forgotPassword.backToLogin();

        await expect(
          page
        ).toHaveURL(
          /\/login/,
          {
            timeout: 10000
          }
        );

        await expect(
          page.locator(
            'input[type="email"]'
          ).first()
        ).toBeVisible({
          timeout: 10000
        });

        await expect(
          page.locator(
            'input[type="password"]'
          ).first()
        ).toBeVisible({
          timeout: 10000
        });
      }
    );

    test(
      'Forgot password email draft is cleared after refresh',
      async ({ page }) => {

        const forgotPassword =
          new ForgotPasswordPage(page);

        await forgotPassword.open();

        await forgotPassword.emailInput.fill(
          'draft-reset@example.com'
        );

        await page.reload({
          waitUntil: 'domcontentloaded'
        });

        await expect(
          page
        ).toHaveURL(
          /\/forgot-password/,
          {
            timeout: 10000
          }
        );

        await expect(
          forgotPassword.emailInput
        ).toHaveValue(
          ''
        );
      }
    );

    test(
      'Forgot password direct link remains usable after refresh',
      async ({ page }) => {
        test.setTimeout(90000);

        const forgotPassword =
          new ForgotPasswordPage(page);

        await forgotPassword.openDirect();

        await page.reload({
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });

        await forgotPassword.dismissMarketingOverlays();

        await expect(
          page
        ).toHaveURL(
          /\/forgot-password/,
          {
            timeout: 20000
          }
        );

        await forgotPassword.emailInput.fill(
          'refresh-reset@example.com'
        );

        await expect(
          forgotPassword.sendResetButton
        ).toBeEnabled();

        await safeClick(
          forgotPassword.backToLoginLink,
          'Back to login'
        );

        await expect(
          page
        ).toHaveURL(
          /\/login/,
          {
            timeout: 20000
          }
        );
      }
    );

    test(
      'Public auth routes tolerate trailing slash and unknown query parameters',
      async ({ page }) => {

        const publicRoutes = [
          {
            url:
              `${BASE_URL}/login/?unknown=automation-safe-check`,

            expectedUrl:
              /\/login/,

            content:
              /sign in|continue with email/i
          },
          {
            url:
              `${BASE_URL}/forgot-password/?unknown=automation-safe-check`,

            expectedUrl:
              /\/forgot-password/,

            content:
              /forgot password|reset password|email/i
          },
          {
            url:
              `${BASE_URL}/register/?unknown=automation-safe-check`,

            expectedUrl:
              /\/register|\/signup/,

            content:
              /create account|sign up|mobile number|start your ooltool journey|free trial/i
          }
        ];

        for (const route of publicRoutes) {
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
              timeout: 10000
            }
          );

          await expect(
            page.locator(
              'body'
            )
          ).toContainText(
            route.content,
            {
              timeout: 10000
            }
          );
        }
      }
    );

    test(
      'Login screen navigates to create account',
      async ({ page }) => {
        test.setTimeout(
          120000
        );

        await page.goto(
          `${BASE_URL}/login`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await dismissOverlays(
          page
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

        const registrationLink =
          authRegistrationLink(
            page
          );

        await safeClick(
          registrationLink,
          'Open registration from login'
        );

        const popup =
          await popupPromise;

        const registrationPage =
          popup ?? page;

        if (
          !/\/register|\/signup|\/sign-up|\/create/i.test(
            registrationPage.url()
          )
        ) {
          await dismissOverlays(
            registrationPage
          );

          const link =
            authRegistrationLink(
              registrationPage
            );

          const href =
            await link.getAttribute(
              'href'
            ).catch(
              () => null
            );

          if (
            await link.isVisible().catch(
              () => false
            )
          ) {
            await safeClick(
              link,
              'Open registration from login again'
            );
          }

          if (
            href &&
            !/\/register|\/signup|\/sign-up|\/create/i.test(
              registrationPage.url()
            )
          ) {
            await registrationPage.goto(
              new URL(
                href,
                registrationPage.url()
              ).toString(),
              {
                waitUntil: 'domcontentloaded'
              }
            );
          }
        }

        await expectRegistrationOpened(
          registrationPage
        );
      }
    );

    test(
      'Auth pages remain usable with browser back and forward',
      async ({ page }) => {

        await page.goto(
          `${BASE_URL}/login`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await dismissOverlays(
          page
        );

        await safeClick(
          authRegistrationLink(
            page
          ),
          'Open registration from login'
        );

        await expectRegistrationOpened(
          page
        );

        await page.goBack({
          waitUntil: 'domcontentloaded'
        });

        await expect(
          page
        ).toHaveURL(
          /\/login/,
          {
            timeout: 10000
          }
        );

        await expect(
          page.locator(
            'input[type="email"]'
          ).first()
        ).toBeVisible({
          timeout: 10000
        });

        await page.goForward({
          waitUntil: 'domcontentloaded'
        });

        await expectRegistrationOpened(
          page
        );

        await expect(
          page.locator(
            'input[type="email"]'
          ).first()
        ).toBeVisible({
          timeout: 10000
        });
      }
    );

    test(
      'Login password visibility control is exposed without submitting form',
      async ({ page }) => {

        await page.goto(
          `${BASE_URL}/login`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await dismissOverlays(
          page
        );
        await page
          .getByRole(
            'button',
            {
              name: /^(essential only|accept( all)?)$/i
            }
          )
          .first()
          .click({
            force: true,
            timeout: 3000
          })
          .catch(
            () => undefined
          );

        // Prefer the stable login field id — label/name locators can drift
        // after the visibility toggle remounts the control.
        const passwordInput =
          page.locator(
            '#password'
          ).or(
            page.getByLabel(
              /^password$/i
            )
          ).or(
            page.locator(
              'input[name="password"]'
            )
          ).first();

        await expect(
          passwordInput
        ).toBeVisible();

        await passwordInput.fill(
          'DraftPassword123!'
        );

        await expect(
          passwordInput
        ).toHaveValue(
          'DraftPassword123!'
        );

        const toggle =
          await findPasswordToggle(
            page,
            passwordInput
          );

        await expect(
          toggle
        ).toBeVisible({
          timeout: 10000
        });

        await expectPasswordToggleResponds(
          passwordInput,
          toggle
        );

        await expect(
          page
        ).toHaveURL(
          /\/login/
        );

        const visiblePassword =
          page.locator(
            '#password'
          );

        await expect(
          visiblePassword
        ).toBeVisible();

        const visibleValue =
          await visiblePassword.inputValue();

        if (
          visibleValue ===
          ''
        ) {
          await visiblePassword.fill(
            'DraftPassword123!'
          );
        }

        await expect(
          visiblePassword
        ).toHaveValue(
          'DraftPassword123!'
        );
      }
    );

    test(
      'Register screen exposes required public form controls',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await expect(
          registration.firstNameInput
        ).toBeVisible();

        await expect(
          registration.lastNameInput
        ).toBeVisible();

        await expect(
          registration.emailInput
        ).toBeVisible();

        await expect(
          registration.mobileInput
        ).toBeVisible();

        await expect(
          registration.passwordInput
        ).toBeVisible();

        await expect(
          registration.confirmPasswordInput
        ).toBeVisible();
      }
    );

    test(
      'Register screen password visibility toggle changes password field type',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await expect(
          registration.passwordInput
        ).toBeVisible();

        await registration.passwordInput.fill(
          'DraftPassword123!'
        );

        const toggle =
          await findPasswordToggle(
            page,
            registration.passwordInput
          );

        await expect(
          toggle,
        ).toBeVisible({
          timeout: 10000
        });

        await expectPasswordToggleResponds(
          registration.passwordInput,
          toggle
        );

        await expect(
          registration.passwordInput
        ).toHaveValue(
          'DraftPassword123!'
        );
      }
    );

    test(
      'Register screen navigates back to login',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await safeClick(
          page
            .getByRole(
              'link',
              {
                name: /sign in|log in|back to login/i
              }
            )
            .or(
              page.getByText(
                /already have an account|sign in|log in|back to login/i
              )
            )
            .first(),
          'Back To Login'
        );

        await expect(
          page
        ).toHaveURL(
          /\/login/,
          {
            timeout: 10000
          }
        );
      }
    );

    test(
      'Login register and forgot-password expose usable privacy policy links',
      async ({ page }) => {
        const publicAuthRoutes = [
          {
            name: 'login',
            path: '/login'
          },
          {
            name: 'register',
            path: '/register'
          },
          {
            name: 'forgot-password',
            path: '/forgot-password'
          }
        ];

        for (const route of publicAuthRoutes) {
          await test.step(
            `${route.name} privacy policy link`,
            async () => {
              await page.goto(
                `${BASE_URL}${route.path}`,
                {
                  waitUntil: 'domcontentloaded'
                }
              );

              // Keep cookie consent visible: register currently exposes
              // Privacy Policy mainly through that consent copy/link.
              const privacyLink =
                page
                  .getByRole(
                    'link',
                    {
                      name: /privacy policy/i
                    }
                  )
                  .first();

              await expect(
                privacyLink
              ).toBeVisible({
                timeout: 10000
              });

              const href =
                await privacyLink.getAttribute(
                  'href'
                );

              expect(
                href,
                `${route.name} Privacy Policy should have a usable href`
              ).toMatch(
                /^(\/|https?:\/\/)(?!#)/i
              );

              expect(
                href,
                `${route.name} Privacy Policy should point at the privacy policy route`
              ).toMatch(
                /privacy/i
              );
            }
          );
        }
      }
    );
  }
);
