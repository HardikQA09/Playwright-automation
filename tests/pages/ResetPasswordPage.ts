import {
  Page,
  Locator,
  expect
} from '@playwright/test';

import { BasePage }
  from './BasePage';

import { safeClick }
  from '../helpers/safeClick';

import { Logger }
  from '../utils/logger';

import {
  validatePasswordPolicy
} from '../config/testData';

/* =============================================================================
PAGE OBJECT: ResetPasswordPage

PURPOSE
-------
Handles password reset after clicking reset email link.

FEATURES COVERED
----------------
1. Enter New Password
2. Confirm Password
3. Update Password
4. Navigate Back To Login

============================================================================= */

export class ResetPasswordPage
  extends BasePage {

  readonly newPasswordInput: Locator;

  readonly confirmPasswordInput: Locator;

  readonly updatePasswordButton: Locator;

  readonly backToLoginLink: Locator;

  private pendingPassword = '';

  constructor(page: Page) {

    super(page);

    this.newPasswordInput =
      page.getByRole(
        'textbox',
        {
          name: /^new password$/i
        }
      );

    this.confirmPasswordInput =
      page.getByRole(
        'textbox',
        {
          name: /^confirm password$/i
        }
      );

    this.updatePasswordButton =
      page.getByRole(
        'button',
        {
          name: /update password/i
        }
      );

    this.backToLoginLink =
      page.getByText(
        /back to login/i
      );
  }

  async waitForFormReady() {

    await this.page.waitForLoadState(
      'domcontentloaded'
    );

    await expect(
      this.newPasswordInput
    ).toBeVisible({
      timeout: 30000
    });

    await expect(
      this.confirmPasswordInput
    ).toBeVisible({
      timeout: 30000
    });
  }

  async fillPassword(
    password: string
  ) {

    validatePasswordPolicy(
      password
    );

    this.pendingPassword =
      password;

    await this.dismissMarketingOverlays();

    Logger.info(
      'Updating Password'
    );
    console.log(
  'Current URL:',
  this.page.url()
);

    await this.waitForFormReady();

    for (const input of [
      this.newPasswordInput,
      this.confirmPasswordInput
    ]) {
      await input.click();
      await input.fill(
        ''
      );
      await input.pressSequentially(
        password,
        {
          delay: 15
        }
      );
      await input.blur();
    }

    Logger.success(
      'Password Fields Completed'
    );
  }

  async updatePassword() {
    await this.dismissMarketingOverlays();

    // pressSequentially so React controlled inputs actually receive state.
    // plain fill() can leave the DOM value set while onClick still sees "".
    for (const input of [
      this.newPasswordInput,
      this.confirmPasswordInput
    ]) {
      await input.click();
      await input.fill(
        ''
      );
      await input.pressSequentially(
        this.pendingPassword,
        {
          delay: 15
        }
      );
      await input.blur();
    }

    await expect(
      this.newPasswordInput
    ).toHaveValue(
      this.pendingPassword
    );
    await expect(
      this.confirmPasswordInput
    ).toHaveValue(
      this.pendingPassword
    );

    await expect(
      this.updatePasswordButton
    ).toBeEnabled({
      timeout: 15000
    });

    const isResetPost =
      (response: {
        request: () => {
          method: () => string;
          url: () => string;
          headers: () => Record<string, string>;
        };
        url: () => string;
      }) => {
        const method =
          response.request().method();
        if (
          method !== 'POST' &&
          method !== 'PUT' &&
          method !== 'PATCH'
        ) {
          return false;
        }

        const url =
          response.url();
        const headers =
          response.request().headers();
        const action =
          headers['next-action'] ||
          headers['Next-Action'] ||
          '';

        return (
          /ooltool\.com/i.test(
            url
          ) &&
          (
            /reset-password|resetPassword|password|forgot|set-password|confirm-reset|auth/i.test(
              url
            ) ||
            Boolean(
              action
            )
          )
        );
      };

    const posted: string[] = [];
    const onRequest =
      (request: {
        method: () => string;
        url: () => string;
      }) => {
        if (
          /POST|PUT|PATCH/i.test(
            request.method()
          )
        ) {
          posted.push(
            `${request.method()} ${request.url()}`
          );
        }
      };

    this.page.on(
      'request',
      onRequest
    );

    try {
      const responsePromise =
        this.page.waitForResponse(
          isResetPost,
          {
            timeout: 20000
          }
        ).catch(
          () => null
        );

      await safeClick(
        this.updatePasswordButton,
        'Update Password'
      );

      let response =
        await responsePromise;

      if (
        !response
      ) {
        await this.confirmPasswordInput.press(
          'Enter'
        ).catch(
          () => undefined
        );

        response =
          await this.page.waitForResponse(
            isResetPost,
            {
              timeout: 10000
            }
          ).catch(
            () => null
          );
      }

      if (
        !response
      ) {
        const successVisible =
          await this.page.getByText(
            /password (has been )?(updated|reset|changed)|successfully/i
          ).first().isVisible({
            timeout: 5000
          }).catch(
            () => false
          );

        if (
          successVisible
        ) {
          Logger.success(
            'Update Password Clicked'
          );
          return;
        }

        throw new Error(
          `Password reset submit did not reach a reset API on ${this.page.url()}. POSTs seen: ${posted.slice(-8).join(' | ') || 'none'}`
        );
      }

      const body =
        await response.text().catch(
          () => ''
        );

      console.log(
        `Reset response ${response.status()} ${response.url()} ${body.slice(0, 180)}`
      );

      if (
        response.status() >= 400
      ) {
        throw new Error(
          `Password reset was rejected (${response.status()}). ${body.slice(0, 240)}`
        );
      }

      Logger.success(
        'Update Password Clicked'
      );
    } finally {
      this.page.off(
        'request',
        onRequest
      );
    }
  }

  async validateSuccess() {
    // Require a real success signal. "Back to Login" alone is NOT proof the
    // password changed — clicking it after a failed submit left disposable
    // reset accounts unable to sign in with the new password.
    const confirmed =
      await this.page.getByText(
        /password (has been )?(updated|reset|changed)|successfully/i
      ).first().waitFor({
        state: 'visible',
        timeout: 15000
      }).then(
        () => true
      ).catch(
        () => false
      );

    const leftResetPage =
      !/reset-password/i.test(
        this.page.url()
      ) ||
      await this.page.waitForURL(
        (url) =>
          !/reset-password/i.test(
            url.href
          ),
        {
          timeout: confirmed ? 5000 : 15000
        }
      ).then(
        () => true
      ).catch(
        () => false
      );

    if (
      !confirmed &&
      !leftResetPage
    ) {
      const pageText =
        await this.page.locator(
          'body'
        ).innerText().catch(
          () => ''
        );
      const alertText =
        await this.page.getByRole(
          'alert'
        ).innerText().catch(
          () => ''
        );

      throw new Error(
        `Password reset did not confirm success on ${this.page.url()}. Alert: ${alertText.slice(0, 160)}. Page: ${pageText.replace(/\s+/g, ' ').slice(0, 400)}`
      );
    }

    if (
      confirmed &&
      await this.backToLoginLink.isVisible({
        timeout: 2000
      }).catch(
        () => false
      )
    ) {
      await this.backToLogin();
    }

    Logger.success(
      'Password Updated Successfully'
    );
  }

  async backToLogin() {

    await safeClick(
      this.backToLoginLink,
      'Back To Login'
    );

    Logger.success(
      'Returned To Login'
    );
  }
}
