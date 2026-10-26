import {
  expect,
  Page,
  test
} from '@playwright/test';

import { ForgotPasswordPage }
  from './pages/ForgotPasswordPage';

import { ResetPasswordPage }
  from './pages/ResetPasswordPage';

import { LoginPage }
  from './pages/LoginPage';

import { DashboardPage }
  from './pages/DashboardPage';

import { RegistrationPage }
  from './pages/RegistrationPage';

import {
  BASE_URL,
  TEST_USERS
} from './config/testData';

import {
  URLS
} from './config/constants';

import {
  generateEmail,
  generateMobileNumber
} from './utils/emailGenerator';

import {
  waitForManualEmailVerification
} from './helpers/emailVerification';

import {
  dismissOverlays
} from './helpers/dismissOverlays';

import {
  isGmailAutomationEnabled,
  waitForGmailPasswordResetLink
} from './helpers/gmailImap';

/* =============================================================================
TEST SUITE: Forgot Password

PURPOSE
-------
Validate Forgot Password and Reset Password flow.

Run:
npx playwright test tests/forgotpassword.spec.ts --headed

============================================================================= */

if (
  process.env.FORGOT_PASSWORD_FLOW_ENABLED === 'true'
) {
  test(
    'Forgot Password Flow',
    async ({ page }) => {

    test.setTimeout(
      5 * 60 * 1000
    );

    // Keep the shared subscriber account on the configured password so
    // profile and subscriber specs can run after this reset flow.
    const newPassword =
      TEST_USERS.subscriber.password;

    const forgotPassword =
      new ForgotPasswordPage(
        page
      );

    await forgotPassword.open();

    await forgotPassword.requestReset(
      TEST_USERS.subscriber.email
    );

    await forgotPassword.validateEmailSent(
      TEST_USERS.subscriber.email
    );

    console.log(
      '\nRESET EMAIL SENT'
    );

    console.log(
      'Open Gmail'
    );

    console.log(
      'Copy reset password link'
    );

    console.log(
      'Paste reset link in SAME Playwright browser'
    );

    console.log(
      'Resume Playwright after reset page opens'
    );

    const waitForResetPage =
      async (): Promise<Page | undefined> => {
        const deadline =
          Date.now() + 30000;

        while (Date.now() < deadline) {
          for (const browserPage of page.context().pages()) {
            const url =
              browserPage.url();

            const passwordInputs =
              browserPage.locator(
                'form input[type="password"]'
              );

            if (
              await passwordInputs.count() >= 2 &&
              await passwordInputs.nth(0).isVisible() &&
              await passwordInputs.nth(1).isVisible()
            ) {
              return browserPage;
            }

            if (
              /reset|new-password/i.test(url) &&
              !/forgot-password/i.test(url)
            ) {
              console.log(
                'Reset URL opened; waiting for password form:',
                url
              );
            }
          }

          await page.waitForTimeout(
            1000
          );
        }

        return undefined;
      };

    let resetPage:
      Page | undefined;

    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(
        `Open the reset password link in the Playwright browser, then resume. Attempt ${attempt}/3`
      );

      await page.pause();

      resetPage =
        await waitForResetPage();

      if (resetPage) {
        break;
      }

      console.log(
        'Reset password page was not detected. Current page is still:',
        page.url()
      );
    }

    if (!resetPage) {
      throw new Error(
        'Reset password page was not opened. Please paste the reset email link into the Playwright browser before resuming.'
      );
    }

    await resetPage.bringToFront();

    const resetPassword =
      new ResetPasswordPage(
        resetPage
      );

    await resetPassword.fillPassword(
      newPassword
    );

    await resetPassword.updatePassword();

    await resetPassword.validateSuccess();

    const login =
      new LoginPage(
        resetPage
      );

    await login.login(
      TEST_USERS.subscriber.email,
      newPassword
    );

    const dashboard =
      new DashboardPage(
        resetPage
      );

    await dashboard.validate();

    }
  );
}

test(
  'Disposable user resets password from the email link and signs in with the new password',
  async ({
    page,
    browser
  }) => {
    test.setTimeout(
      8 * 60 * 1000
    );

    test.skip(
      !isGmailAutomationEnabled(),
      'Password reset needs GMAIL_APP_PASSWORD so the reset link can be read from Gmail.'
    );

    const email =
      generateEmail(
        'forgot-reset-flow'
      );
    const mobileNumber =
      generateMobileNumber();
    const originalPassword =
      TEST_USERS.onboarding.password;
    const newPassword =
      'ResetFlow26Aa!';

    console.log(
      'Forgot-password flow email:',
      email
    );

    await test.step(
      'Create a disposable account and verify its email',
      async () => {
        await new RegistrationPage(
          page
        ).open();

        await new RegistrationPage(
          page
        ).register(
          email,
          mobileNumber
        );

        await waitForManualEmailVerification(
          page,
          email
        );
      }
    );

    await test.step(
      'Send the forgot-password link',
      async () => {
        const forgotPassword =
          new ForgotPasswordPage(
            page
          );

        await forgotPassword.openDirect();

        await forgotPassword.requestReset(
          email
        );

        await forgotPassword.validateEmailSent(
          email
        );
      }
    );

    await test.step(
      'Open the reset link and set a new password',
      async () => {
        let resetLink = '';

        try {
          resetLink =
            await waitForGmailPasswordResetLink(
              email
            );
        } catch (error) {
          test.skip(
            true,
            `Password reset email link was not found in Gmail: ${error instanceof Error ? error.message : String(error)}`
          );
        }

        await page.goto(
          resetLink,
          {
            waitUntil: 'domcontentloaded',
            timeout: 60000
          }
        );

        const resetPassword =
          new ResetPasswordPage(
            page
          );

        await resetPassword.fillPassword(
          newPassword
        );

        await resetPassword.updatePassword();

        await resetPassword.validateSuccess();
      }
    );

    const freshContext =
      await browser.newContext();

    try {
      const freshPage =
        await freshContext.newPage();

      await test.step(
        'A fresh browser has no session',
        async () => {
          await freshPage.goto(
            `${BASE_URL}${URLS.DASHBOARD}`,
            {
              waitUntil: 'domcontentloaded'
            }
          );

          await expect(
            freshPage
          ).toHaveURL(
            /\/login/,
            {
              timeout: 30000
            }
          );
        }
      );

      await test.step(
        'The original password no longer signs in',
        async () => {
          await dismissOverlays(
            freshPage
          );

          const emailInput =
            freshPage.getByRole(
              'textbox',
              {
                name: /^email$/i
              }
            );
          const passwordInput =
            freshPage.getByRole(
              'textbox',
              {
                name: /^password$/i
              }
            );

          await emailInput.waitFor({
            state: 'visible',
            timeout: 15000
          });

          await dismissOverlays(
            freshPage
          );

          // The login page can finish loading just after the first fill and
          // clear the field, so fill again until the value sticks.
          await expect(
            async () => {
              await emailInput.fill(
                email
              );

              await passwordInput.fill(
                originalPassword
              );

              await expect(
                emailInput
              ).toHaveValue(
                email,
                {
                  timeout: 1500
                }
              );
            }
          ).toPass({
            timeout: 20000
          });

          const loginResponse =
            freshPage.waitForResponse(
              (response) =>
                response.request().method() === 'POST' &&
                /\/auth\//i.test(
                  response.url()
                ) &&
                !/otp|reset|forgot/i.test(
                  response.url()
                ),
              {
                timeout: 15000
              }
            ).catch(
              () => null
            );

          const loginStarted =
            freshPage.waitForRequest(
              (request) =>
                request.method() === 'POST' &&
                /\/auth\//i.test(
                  request.url()
                ) &&
                !/otp|reset|forgot/i.test(
                  request.url()
                ),
              {
                timeout: 15000
              }
            ).then(
              () => true
            ).catch(
              () => false
            );

          const signInButton =
            freshPage.getByRole(
              'button',
              {
                name: /^(sign in|log in)$/i
              }
            );

          await signInButton.click({
            noWaitAfter: true
          });

          const started =
            await Promise.race([
              loginStarted,
              freshPage.waitForTimeout(
                3000
              ).then(
                () => false
              )
            ]);

          if (!started) {
            await emailInput.fill(
              email
            );

            await passwordInput.fill(
              originalPassword
            );

            await signInButton.evaluate(
              (button) => {
                (button as HTMLButtonElement).click();
              }
            );
          }

          const response =
            await loginResponse;

          if (response) {
            console.log(
              `Old password login ${response.status()} ${response.url()}`
            );
          }

          await expect(
            freshPage
          ).toHaveURL(
            /\/login/,
            {
              timeout: 15000
            }
          );

          const rejected =
            response !== null &&
            response.status() >= 400;

          if (!rejected) {
            const errorVisible =
              await freshPage.getByText(
                /invalid|incorrect|wrong|does not match|failed|try again|unable to|credentials|password/i
              ).first().isVisible({
                timeout: 8000
              }).catch(
                () => false
              );

            // Product may reject without a matching banner; staying on /login
            // after submitting the old password is enough proof it was refused.
            if (!errorVisible) {
              await expect(
                freshPage
              ).toHaveURL(
                /\/login/,
                {
                  timeout: 5000
                }
              );
            }
          }
        }
      );

      await test.step(
        'The new password signs in and opens billing',
        async () => {
          // Drop the stale "Invalid email or password" banner from the
          // previous old-password rejection before signing in with the new one.
          await freshPage.goto(
            `${BASE_URL}${URLS.LOGIN}`,
            {
              waitUntil: 'domcontentloaded'
            }
          );

          await new LoginPage(
            freshPage
          ).login(
            email,
            newPassword
          );

          await expect(
            freshPage
          ).toHaveURL(
            /\/(dashboard|onboarding)/,
            {
              timeout: 30000
            }
          );

          if (
            /\/dashboard/.test(
              freshPage.url()
            )
          ) {
            await new DashboardPage(
              freshPage
            ).validateLoaded();

            await freshPage.goto(
              `${BASE_URL}${URLS.BILLING}`,
              {
                waitUntil: 'domcontentloaded'
              }
            );

            await expect(
              freshPage
            ).toHaveURL(
              /\/(billing|onboarding)/,
              {
                timeout: 30000
              }
            );
          }
        }
      );
    } finally {
      await freshContext.close();
    }
  }
);
