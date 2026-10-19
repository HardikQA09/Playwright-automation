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

    await this.newPasswordInput.fill(
      password
    );

    await this.confirmPasswordInput.fill(
      password
    );

    Logger.success(
      'Password Fields Completed'
    );
  }

  async updatePassword() {
    const cookieButton =
      this.page.getByRole(
        'button',
        {
          name: /^(essential only|accept( all)?)$/i
        }
      );

    if (
      await cookieButton.first().waitFor({
        state: 'visible',
        timeout: 3000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      await cookieButton.first().click({
        timeout: 3000
      }).catch(
        () => undefined
      );
    }

    const submitReset =
      async () => {
        await this.dismissMarketingOverlays();

        await this.page.waitForTimeout(
          1000
        );

        await this.newPasswordInput.fill(
          this.pendingPassword
        );

        await this.confirmPasswordInput.fill(
          this.pendingPassword
        );

        await expect(
          this.newPasswordInput
        ).toHaveValue(
          this.pendingPassword
        );

        await this.newPasswordInput.evaluate(
          (input, value) => {
            const setter =
              Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              )?.set;

            setter?.call(
              input,
              value
            );

            input.dispatchEvent(
              new Event(
                'input',
                {
                  bubbles: true
                }
              )
            );

            input.dispatchEvent(
              new Event(
                'change',
                {
                  bubbles: true
                }
              )
            );
          },
          this.pendingPassword
        );

        await this.confirmPasswordInput.evaluate(
          (input, value) => {
            const setter =
              Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              )?.set;

            setter?.call(
              input,
              value
            );

            input.dispatchEvent(
              new Event(
                'input',
                {
                  bubbles: true
                }
              )
            );

            input.dispatchEvent(
              new Event(
                'change',
                {
                  bubbles: true
                }
              )
            );
          },
          this.pendingPassword
        );

        const resetRequest =
          /reset-password|resetPassword|password\/reset|forgot-password|update-password|change-password/i;

        const responsePromise =
          this.page.waitForResponse(
            (response) =>
              response.request().method() === 'POST' &&
              resetRequest.test(
                response.url()
              ),
            {
              timeout: 15000
            }
          ).catch(
            () => null
          );

        const requestStarted =
          this.page.waitForRequest(
            (request) =>
              request.method() === 'POST' &&
              resetRequest.test(
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

        await this.updatePasswordButton.click({
          noWaitAfter: true,
          timeout: 8000
        });

        const started =
          await Promise.race([
            requestStarted,
            this.page.waitForTimeout(
              3000
            ).then(
              () => false
            )
          ]);

        if (!started) {
          await this.page.locator(
            'form'
          ).first().evaluate(
            (form) => {
              (form as HTMLFormElement).requestSubmit();
            }
          ).catch(
            () => undefined
          );

          await this.updatePasswordButton.evaluate(
            (button) => {
              (button as HTMLButtonElement).click();
            }
          ).catch(
            () => undefined
          );
        }

        return responsePromise;
      };

    let response =
      await submitReset();

    for (
      let attempt = 1;
      attempt < 3 &&
      !response;
      attempt++
    ) {
      response =
        await submitReset();
    }

    if (response) {
      const body =
        await response.text().catch(
          () => ''
        );

      console.log(
        `Reset response ${response.status()} ${body.slice(0, 180)}`
      );

      if (
        response.status() >= 400
      ) {
        throw new Error(
          `Password reset was rejected (${response.status()}). ${body.slice(0, 240)}`
        );
      }
    }

    Logger.success(
      'Update Password Clicked'
    );
  }

  async validateSuccess() {

    const confirmed =
      await this.page.getByText(
        /password (has been )?(updated|reset|changed)|successfully/i
      ).first().waitFor({
        state: 'visible',
        timeout: 8000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (!confirmed) {
      const leftResetPage =
        await this.page.waitForURL(
          (url) =>
            !/reset-password/i.test(
              url.href
            ),
          {
            timeout: 15000
          }
        ).then(
          () => true
        ).catch(
          () => false
        );

      if (!leftResetPage) {
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

        if (
          /invalid|incorrect|do not match|too weak|could not reset/i.test(
            alertText
          )
        ) {
          throw new Error(
            `Password reset stayed on ${this.page.url()}. Page text: ${pageText.replace(/\s+/g, ' ').slice(0, 400)}`
          );
        }

        if (
          await this.backToLoginLink.isVisible({
            timeout: 3000
          }).catch(
            () => false
          )
        ) {
          await this.backToLogin();
        } else {
          throw new Error(
            `Password reset stayed on ${this.page.url()}. Page text: ${pageText.replace(/\s+/g, ' ').slice(0, 400)}`
          );
        }
      }
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
