import {
  Page,
  Locator,
  expect
} from '@playwright/test';

import { safeClick }
  from '../helpers/safeClick';

import { BasePage }
  from './BasePage';

import { Logger }
  from '../utils/logger';

import {
  URLS
} from '../config/constants';

import {
  BASE_URL,
  AUTH_SETTINGS
} from '../config/testData';

import {
  isEmailVerificationPage,
  openFreshLoginPage,
  waitForManualEmailVerification
} from '../helpers/emailVerification';

import {
  isGmailAutomationEnabled,
  waitForGmailUnlockLink
} from '../helpers/gmailImap';

/* =============================================================================
PAGE OBJECT: LoginPage

PURPOSE
-------
Handles login, logout, and locked-account recovery actions.

FEATURES COVERED
----------------
1. User Login
2. Locked Account Detection
3. Unlock Link Request
4. Logout

============================================================================= */

export class LoginPage
  extends BasePage {

  readonly emailInput: Locator;

  readonly passwordInput: Locator;

  readonly submitButton: Locator;

  readonly accountLockedMessage: Locator;

  readonly emailUnlockLinkButton: Locator;

  constructor(page: Page) {

    super(page);

    this.emailInput =
      page.getByLabel(
        /^email$/i
      ).or(
        page.locator(
          'input[type="email"]'
        ).first()
      );

    this.passwordInput =
      page.getByLabel(
        /^password$/i
      ).or(
        page.locator(
          'input[type="password"]'
        ).first()
      );

    this.submitButton =
      page.getByRole(
        'button',
        {
          name: /^(sign in|log in)$/i
        }
      ).or(
        page.locator(
          'form'
        ).filter({
          has: page.locator(
            'input[type="password"]'
          )
        }).locator(
          'button[type="submit"]'
        )
      ).first();

    this.accountLockedMessage =
      page.getByText(
        /your account is temporarily locked/i
      );

    this.emailUnlockLinkButton =
      page.getByRole(
        'button',
        {
          name: /email me an unlock link/i
        }
      );
  }

  private async waitForLoginFormReady() {

    await this.emailInput.waitFor({
      state: 'visible',
      timeout: 15000
    });

    await this.passwordInput.waitFor({
      state: 'visible',
      timeout: 15000
    });

    await expect(
      this.emailInput
    ).toBeEditable({
      timeout: 15000
    });

    await expect(
      this.passwordInput
    ).toBeEditable({
      timeout: 15000
    });

    await expect(
      this.submitButton
    ).toBeVisible({
      timeout: 15000
    });

    await this.page.waitForLoadState(
      'networkidle',
      {
        timeout: 5000
      }
    ).catch(
      () => undefined
    );
  }

  private async fillLoginCredentials(
    email: string,
    password: string
  ) {

    await this.emailInput.fill('');

    await this.emailInput.fill(
      email
    );

    await expect(
      this.emailInput
    ).toHaveValue(
      email,
      {
        timeout: 5000
      }
    );

    await this.passwordInput.fill('');

    await this.passwordInput.fill(
      password
    );

    await expect(
      this.passwordInput
    ).toHaveValue(
      password,
      {
        timeout: 5000
      }
    );

    await expect(
      async () => {
        await expect(
          this.submitButton
        ).toBeEnabled({
          timeout: 3000
        });
      }
    ).toPass({
      timeout: 30000
    });
  }

  private async completePostLoginMobileVerificationIfVisible() {

    const heading =
      this.page.getByRole(
        'heading',
        {
          name: /verify your mobile number/i
        }
      );

    if (
      !await heading.isVisible({
        timeout: 3000
      }).catch(
        () => false
      )
    ) {
      return false;
    }

    Logger.info(
      'Completing post-login mobile verification'
    );

    const otpInput =
      this.page
        .locator(
          'input[inputmode="numeric"], input[name="otp"], input[placeholder="123456"]'
        )
        .first();

    if (
      !await otpInput.isVisible({
        timeout: 3000
      }).catch(
        () => false
      )
    ) {
      const mobileInput =
        this.page
          .locator(
            'input[type="tel"], input[inputmode="tel"]'
          )
          .first();

      if (
        await mobileInput.isVisible()
          .catch(
            () => false
          ) &&
        await mobileInput.isEditable()
          .catch(
            () => false
          )
      ) {
        await mobileInput.fill(
          process.env.SUBSCRIBER_MOBILE ??
            '2015550123'
        );
      }

      const sendCodeButton =
        this.page.getByRole(
          'button',
          {
            name: /send code via sms/i
          }
        ).first();

      if (
        await sendCodeButton.isVisible()
          .catch(
            () => false
          )
      ) {
        await safeClick(
          sendCodeButton,
          'Send Post-login Mobile OTP'
        );
      }
    }

    await expect(
      otpInput
    ).toBeVisible({
      timeout: 15000
    });

    await otpInput.fill(
      AUTH_SETTINGS.otpCode ||
        '111111'
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /^verify$/i
        }
      ).first(),
      'Verify Post-login Mobile OTP'
    );

    await this.page.waitForURL(
      /\/(dashboard|onboarding)/,
      {
        timeout: 30000
      }
    );

    Logger.success(
      'Post-login mobile verification completed'
    );

    return true;
  }

  private async waitForLoginOutcome() {
    const startedAt =
      Date.now();

    while (
      Date.now() - startedAt <
      30000
    ) {
      if (
        isEmailVerificationPage(
          this.page
        )
      ) {
        return 'unverified' as const;
      }

      if (
        /\/(dashboard|onboarding|verify-mobile|mobile-verification)/.test(
          this.page.url()
        )
      ) {
        await this.completePostLoginMobileVerificationIfVisible();

        return 'success' as const;
      }

      await this.page.waitForTimeout(
        250
      );
    }

    throw new Error(
      'Login did not redirect'
    );
  }

  private async readLoginFailureHint() {
    const toast =
      await this.page
        .locator(
          '[role="alert"], [data-sonner-toast], .toast, [class*="toast"]'
        )
        .first()
        .innerText({
          timeout: 1500
        })
        .catch(
          () => ''
        );

    const body =
      await this.page
        .locator(
          'main, body'
        )
        .first()
        .innerText({
          timeout: 1500
        })
        .then(
          (text) =>
            text
              .replace(/\s+/g, ' ')
              .match(
                /invalid|incorrect|wrong password|locked|too many|try again|credentials|unable to (sign|log) in/i
              )?.[0] ??
            ''
        )
        .catch(
          () => ''
        );

    return [
      toast,
      body
    ]
      .map(
        (part) =>
          String(part || '').trim()
      )
      .filter(Boolean)
      .join(' | ')
      .slice(0, 240);
  }

  async handleLockedAccount(
    email: string
  ) {

    if (
      await this.accountLockedMessage.isVisible()
    ) {
      Logger.warning(
        `Account is temporarily locked: ${email}`
      );

      if (
        await this.emailUnlockLinkButton.isVisible()
      ) {
        await safeClick(
          this.emailUnlockLinkButton,
          'Email Unlock Link'
        );
      }

      if (
        isGmailAutomationEnabled()
      ) {
        Logger.info(
          `Waiting for Gmail unlock link for ${email}`
        );

        const unlockLink =
          await waitForGmailUnlockLink(
            email,
            120000
          );

        await this.page.goto(
          unlockLink,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await this.page.waitForTimeout(
          2000
        );

        await openFreshLoginPage(
          this.page
        );

        Logger.success(
          `Unlock link opened for ${email}; login can continue`
        );

        return;
      }

      throw new Error(
        `Account is temporarily locked. Check ${email} for the unlock link, unlock the account, then rerun the test.`
      );
    }
  }

  async requestUnlockLink(
    email: string,
    password: string
  ) {

    Logger.info(
      'Requesting account unlock link'
    );

    await this.page.goto(
      `${BASE_URL}/login`,
      {
        waitUntil: 'domcontentloaded'
      }
    );

    await this.emailInput.fill(
      email
    );

    await this.passwordInput.fill(
      password
    );

    await safeClick(
      this.submitButton,
      'Submit Login'
    );

    await expect(
      this.accountLockedMessage
    ).toBeVisible({
      timeout: 10000
    });

    await safeClick(
      this.emailUnlockLinkButton,
      'Email Unlock Link'
    );

    Logger.success(
      'Unlock Link Requested'
    );
  }

  async login(
    email: string,
    password: string
  ) {

    Logger.info(
      'Logging in'
    );

    // Never treat a leftover /dashboard URL as "already authenticated".
    // Paid-fixture helpers clear cookies while the SPA URL can still be
    // /dashboard, which previously skipped the login form and left Free-session
    // cascades (Free/no-card preview + Login failed after 3 attempts).
    if (
      await this.completePostLoginMobileVerificationIfVisible()
    ) {
      Logger.success(
        'Logged in successfully'
      );

      console.log(
        'Current URL:',
        this.page.url()
      );

      return;
    }

    if (
      isEmailVerificationPage(
        this.page
      ) ||
      !this.page.url().includes(
        URLS.LOGIN
      )
    ) {
      await openFreshLoginPage(
        this.page
      );
    }

    await this.dismissMarketingOverlays();

    await this.waitForLoginFormReady();

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (
        isEmailVerificationPage(
          this.page
        )
      ) {
        Logger.warning(
          'Still on email verification. Waiting for the Gmail link. Not sending a new link.'
        );

        await waitForManualEmailVerification(
          this.page,
          email
        );

        await this.dismissMarketingOverlays();

        await this.waitForLoginFormReady();
      }

      console.log(
        `Login Attempt ${attempt} as ${email}`
      );

      await this.dismissMarketingOverlays();

      await this.fillLoginCredentials(
        email,
        password
      );

      const credentialsResponse =
        this.page.waitForResponse(
          (response) =>
            /\/api\/auth\/callback\/credentials/i.test(
              response.url()
            ) &&
            response.request().method() ===
              'POST',
          {
            timeout: 20000
          }
        ).catch(
          () => null
        );

      await safeClick(
        this.submitButton,
        'Submit Login'
      );

      let authResponse =
        await credentialsResponse;

      if (
        !authResponse
      ) {
        // Click may have been swallowed by an overlay — submit the form directly.
        await this.passwordInput.press(
          'Enter'
        ).catch(
          () => undefined
        );

        authResponse =
          await this.page.waitForResponse(
            (response) =>
              /\/api\/auth\/callback\/credentials/i.test(
                response.url()
              ) &&
              response.request().method() ===
                'POST',
            {
              timeout: 15000
            }
          ).catch(
            () => null
          );
      }

      if (
        !authResponse
      ) {
        throw new Error(
          `Login submit did not reach credentials API for ${email}`
        );
      }

      if (
        authResponse.status() ===
        429
      ) {
        throw new Error(
          `Login rate-limited (429) for ${email}. Wait and rerun; too many sign-in attempts.`
        );
      }

      await this.handleLockedAccount(
        email
      );

      // Wait for redirect first. A prior failed attempt (forgot-password
      // "old password" check) can leave "Invalid email or password" on the
      // page; treating that as THIS submit's rejection aborts a good login.
      const leftLogin =
        await this.page.waitForURL(
          (url) =>
            !url.pathname.includes(
              URLS.LOGIN
            ),
          {
            timeout: 8000
          }
        ).then(
          () => true
        ).catch(
          () => false
        );

      if (
        !leftLogin
      ) {
        const failureHint =
          await this.readLoginFailureHint();

        if (
          /invalid|incorrect|wrong password|credentials|unable to (sign|log) in/i.test(
            failureHint
          )
        ) {
          throw new Error(
            `Login rejected for ${email}: ${failureHint}`
          );
        }
      }

      try {
        const outcome =
          await this.waitForLoginOutcome();

        if (
          outcome ===
          'unverified'
        ) {
          Logger.warning(
            'Sign in bounced to email verification. The Gmail link has not confirmed this account yet.'
          );

          if (
            attempt === 3
          ) {
            throw new Error(
              'Login bounced to email verification. Verify the Gmail link first, then resume. Do not click Send verification link.'
            );
          }

          await waitForManualEmailVerification(
            this.page,
            email
          );

          await this.dismissMarketingOverlays();

          await this.waitForLoginFormReady();

          continue;
        }

        Logger.success(
          'Logged in successfully'
        );

        console.log(
          'Current URL:',
          this.page.url()
        );

        return;
      } catch (
        error
      ) {
        console.log(
          'Current URL:',
          this.page.url()
        );

        if (
          isEmailVerificationPage(
            this.page
          )
        ) {
          if (
            attempt === 3
          ) {
            throw new Error(
              'Login bounced to email verification. Verify the Gmail link first, then resume. Do not click Send verification link.'
            );
          }

          await waitForManualEmailVerification(
            this.page,
            email
          );

          await this.dismissMarketingOverlays();

          await this.waitForLoginFormReady();

          continue;
        }

        if (attempt === 3) {
          if (
            error instanceof Error &&
            error.message.includes(
              'email verification'
            )
          ) {
            throw error;
          }

          const pageHint =
            await this.page
              .locator(
                '[role="alert"], [data-sonner-toast], .toast, [class*="toast"]'
              )
              .first()
              .innerText({
                timeout: 2000
              })
              .catch(
                () => ''
              );

          const bodyHint =
            await this.page
              .locator(
                'main, body'
              )
              .first()
              .innerText({
                timeout: 2000
              })
              .then(
                (text) =>
                  text
                    .replace(/\s+/g, ' ')
                    .match(
                      /invalid|incorrect|wrong password|locked|too many|try again|credentials/i
                    )?.[0] ??
                  ''
              )
              .catch(
                () => ''
              );

          const detail = [
            pageHint,
            bodyHint,
            error instanceof Error
              ? error.message
              : ''
          ]
            .map(
              (part) =>
                String(part || '').trim()
            )
            .filter(Boolean)
            .join(' | ')
            .slice(0, 240);

          throw new Error(
            detail
              ? `Login failed after 3 attempts (${detail}). URL: ${this.page.url()}`
              : `Login failed after 3 attempts. URL: ${this.page.url()}`
          );
        }

        await this.page.waitForTimeout(
          2000
        );

        await openFreshLoginPage(
          this.page
        );

        if (
          await this.completePostLoginMobileVerificationIfVisible()
        ) {
          Logger.success(
            'Logged in successfully'
          );

          console.log(
            'Current URL:',
            this.page.url()
          );

          return;
        }

        await this.dismissMarketingOverlays();

        await this.waitForLoginFormReady();
      }
    }
  }

  async logout() {

    console.log(
      'Logging Out'
    );

    await safeClick(
      this.page.getByRole(
        'banner'
      ).getByRole(
        'button',
        {
          name: /^[A-Z]{2}$/
        }
      ),
      'Open Profile Menu'
    );

    await expect(
      this.page.getByText(
        /sign out/i
      )
    ).toBeVisible({
      timeout: 10000
    });

    await safeClick(
      this.page.getByText(
        /sign out/i
      ),
      'Click Sign Out'
    );

    await expect(
      this.page
    ).toHaveURL(
      /login/,
      {
        timeout: 30000
      }
    );

    await expect(
      this.page.locator(
        'input[type="email"]'
      )
    ).toBeVisible();

    Logger.success(
      'Logout Validation Completed'
    );
  }
}
