import {
  Page,
  Locator,
  expect
} from '@playwright/test';

import { safeClick }
from '../helpers/safeClick';

import {
  AUTH_SETTINGS,
  BASE_URL,
  TEST_USERS,
  validatePasswordPolicy
}
from '../config/testData';

import {
  REGISTRATION_CTA_NAME,
  REGISTRATION_SUBMIT_NAME,
  URLS
}
from '../config/constants';

import { BasePage }
from './BasePage';

import { Logger }
from '../utils/logger';

import { generateMobileNumber }
from '../utils/emailGenerator';


/* =============================================================================
PAGE OBJECT: RegistrationPage

PURPOSE
-------
Handles new user registration process.

FLOW COVERED
------------
1. Open Application
2. Open Start 30-Day Free Trial / Create Account
3. Enter User Details
4. Enter Mobile Number
5. Send SMS OTP
6. Verify OTP
7. Submit Registration
8. Validate Verification Message

USED BY
-------
onboarding.spec.ts

============================================================================= */


export class RegistrationPage
extends BasePage {


  readonly createAccountLink: Locator;

  readonly firstNameInput: Locator;

  readonly lastNameInput: Locator;

  readonly emailInput: Locator;

  readonly mobileInput: Locator;

  readonly sendCodeButton: Locator;

  readonly otpInput: Locator;
  readonly verifyOtpButton: Locator;

  readonly passwordInput: Locator;

  readonly confirmPasswordInput: Locator;

  readonly submitButton: Locator;

  private mobileVerifiedByApi = false;

  private mobileNumberTaken = false;

  private lastSendOtpStatus = 0;

  private lastSendOtpBody = '';



  constructor(page: Page) {

    super(page);


    this.createAccountLink =
      page.getByRole(
        'link',
        {
          name: REGISTRATION_CTA_NAME
        }
      ).or(
        page.getByRole(
          'button',
          {
            name: REGISTRATION_CTA_NAME
          }
        )
      ).first();


    this.firstNameInput =
      page.locator(
        'input[name="firstName"]'
      ).or(
        page.getByLabel(
          /first name/i
        )
      ).first();


    this.lastNameInput =
      page.locator(
        'input[name="lastName"]'
      );


    this.emailInput =
      page.locator(
        'input[name="email"]'
      );


    this.mobileInput =
      page.locator(
        'input[type="tel"], input[inputmode="tel"], input[autocomplete="tel-national"], input[autocomplete="tel"]'
      ).first();


    this.sendCodeButton =
      page.getByRole(
        'button',
        {
          name: /send code via sms/i
        }
      ).first();


    this.otpInput =
      page.getByPlaceholder(
        /enter otp|one-time|verification code|123456/i
      ).or(
        page.getByLabel(
          /enter otp|sms code|verification code|one-time code/i
        )
      ).or(
        page.locator(
          'input[autocomplete="one-time-code"], input[name*="otp" i], input[id*="otp" i]'
        )
      ).first();

    this.verifyOtpButton =
      page.getByRole(
        'button',
        {
          name: /^(verify|verify code|verify otp)$/i
        }
      );


    this.passwordInput =
      page.locator(
        'input[name="password"]'
      );


    this.confirmPasswordInput =
      page.locator(
        'input[name="confirmPassword"]'
      );


    this.submitButton =
      page.getByRole(
        'button',
        {
          name: 'Create Account',
          exact: true
        }
      ).or(
        page.getByRole(
          'button',
          {
            name: REGISTRATION_SUBMIT_NAME
          }
        )
      ).or(
        page.locator(
          'button[type="submit"]'
        ).filter({
          hasText: REGISTRATION_SUBMIT_NAME
        })
      ).first();

  }



  private envEnabled(
    name: string
  ) {
    return [
      '1',
      'true',
      'yes',
      'on'
    ].includes(
      (
        process.env[name] ??
        ''
      ).toLowerCase()
    );
  }



  private async collectOtpRequestDiagnostics() {
    const bodyText =
      await this.page
        .locator(
          'body'
        )
        .innerText()
        .catch(
          () => ''
        );

    const relevantLines =
      bodyText
        .split(
          /\r?\n/
        )
        .map(
          line =>
            line.trim()
        )
        .filter(Boolean)
        .filter(
          line =>
            /otp|code|sms|mobile|phone|too many|rate|request|invalid|error|try again|wait/i.test(
              line
            )
        )
        .slice(
          0,
          8
        );

    const mobileValue =
      await this.mobileInput
        .inputValue()
        .catch(
          () => ''
        );

    const sendCodeEnabled =
      await this.sendCodeButton
        .isEnabled()
        .catch(
          () => false
        );

    const stateSummary =
      `mobile="${mobileValue}", sendCodeEnabled=${sendCodeEnabled}`;

    return relevantLines.length > 0
      ? `${stateSummary}; ${relevantLines.join(
        ' | '
      )}`
      : `${stateSummary}; No visible OTP/SMS error text found.`;
  }



  private visibleOtpInput() {
    return this.page.locator(
      [
        'input[autocomplete="one-time-code"]',
        'input[name*="otp" i]',
        'input[id*="otp" i]',
        'input[placeholder*="otp" i]',
        'input[placeholder*="one-time" i]',
        'input[placeholder*="verification" i]',
        'input[placeholder*="code" i]:not([type="tel"])',
        'input[maxlength="6"], input[maxlength="8"]',
        'input[inputmode="numeric"]:not([type="tel"]):not([autocomplete="tel"]):not([autocomplete="tel-national"]):not([name*="mobile" i]):not([name*="phone" i])'
      ].join(', ')
    ).or(
      this.page.getByRole(
        'textbox',
        {
          name: /otp|one-time|verification code|sms code/i
        }
      )
    ).filter({
      visible: true
    }).first();
  }

  private async enterRegistrationOtp() {
    const otpCode =
      AUTH_SETTINGS.otpCode ||
      '111111';
    const field =
      this.visibleOtpInput();

    if (
      !await field.isVisible({
        timeout: 2000
      }).catch(
        () => false
      )
    ) {
      return;
    }

    Logger.info(
      `Entering OTP ${otpCode}`
    );

    await field.click({
      timeout: 5000
    }).catch(
      () => undefined
    );

    await field.fill(
      '',
      {
        timeout: 5000
      }
    );

    await field.pressSequentially(
      otpCode,
      {
        delay: 40,
        timeout: 8000
      }
    );

    await field.blur({
      timeout: 2000
    }).catch(
      () => undefined
    );
  }

  private async clickVerifyWhenReady() {
    if (
      await this.mobileVerifiedBadgeVisible()
    ) {
      return;
    }

    await this.enterRegistrationOtp();

    if (
      !await this.verifyOtpButton.isEnabled().catch(
        () => false
      )
    ) {
      await this.enterRegistrationOtp();
    }

    await expect(
      this.verifyOtpButton
    ).toBeEnabled({
      timeout: 20000
    });

    await this.dismissMarketingOverlays();

    const responsePromise =
      this.page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          /verify-otp/i.test(
            response.url()
          ),
        {
          timeout: 20000
        }
      ).catch(
        () => null
      );

    const requestStarted =
      this.page.waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          /verify-otp/i.test(
            request.url()
          ),
        {
          timeout: 20000
        }
      ).then(
        () => true
      ).catch(
        () => false
      );

    try {
      await this.verifyOtpButton.click({
        noWaitAfter: true,
        timeout: 8000
      });
    } catch {
      await this.dismissMarketingOverlays();
    }

    const started =
      await Promise.race([
        requestStarted,
        this.page.waitForTimeout(
          3000
        ).then(
          () => false
        )
      ]);

    if (
      !started &&
      !await this.mobileVerifiedBadgeVisible()
    ) {
      await this.verifyOtpButton.evaluate(
        (button) => {
          (button as HTMLButtonElement).click();
        }
      ).catch(
        () => undefined
      );
    }

    const response =
      await responsePromise;

    if (response) {
      const body =
        await response.text().catch(
          () => ''
        );

      console.log(
        `Verify OTP ${response.status()} ${body.slice(0, 160)}`
      );

      this.mobileVerifiedByApi =
        response.ok() &&
        /"verified"\s*:\s*true/i.test(
          body
        );

      this.mobileNumberTaken =
        response.status() === 409 ||
        /already registered/i.test(
          body
        );
    }
  }

  private async mobileVerifiedBadgeVisible() {
    return this.page.getByText(
      /^verified$|mobile number verified/i
    ).first().isVisible().catch(
      () => false
    );
  }

  private async mobileVerificationSettled() {
    if (
      this.mobileVerifiedByApi ||
      await this.mobileVerifiedBadgeVisible()
    ) {
      return true;
    }

    const verifyVisible =
      await this.verifyOtpButton.isVisible().catch(
        () => false
      );

    if (verifyVisible) {
      return false;
    }

    return !(
      await this.otpFieldIsVisible()
    );
  }

  private async ensureMobileVerified() {
    const settled =
      await expect.poll(
        async () => this.mobileVerificationSettled(),
        {
          timeout: 20000
        }
      ).toBeTruthy().then(
        () => true
      ).catch(
        () => false
      );

    if (
      settled ||
      this.mobileVerifiedByApi
    ) {
      return;
    }

    const verifyStillVisible =
      await this.verifyOtpButton.isVisible().catch(
        () => false
      );

    if (
      !verifyStillVisible
    ) {
      return;
    }

    if (
      this.mobileNumberTaken
    ) {
      const replacement =
        `201555${Date.now().toString().slice(-4)}`;

      console.log(
        `Mobile number was already registered. Trying ${replacement}`
      );

      this.mobileNumberTaken = false;
      this.mobileVerifiedByApi = false;

      await this.fillMobileNumber(
        replacement
      );

      await this.waitForSendCodeEnabled();

      await this.clickSendCode(
        1
      );

      await this.waitForRegistrationOtpInput();
    } else {
      Logger.info(
        'Mobile code was not accepted. Verifying once more.'
      );
    }

    await this.clickVerifyWhenReady();

    await expect.poll(
      async () => this.mobileVerificationSettled(),
      {
        timeout: 20000
      }
    ).toBeTruthy();
  }

  private async otpFieldIsVisible() {
    return this.visibleOtpInput()
      .isVisible({
        timeout: 1000
      })
      .catch(
        () => this.otpInput.isVisible({
          timeout: 1000
        }).catch(
          () => false
        )
      );
  }

  private async clickSendCode(
    attempt: number
  ) {
    await this.dismissMarketingOverlays();

    const responsePromise =
      this.page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          /send-otp/i.test(
            response.url()
          ),
        {
          timeout: 40000
        }
      ).catch(
        () => null
      );

    const requestStarted =
      this.page.waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          /send-otp/i.test(
            request.url()
          ),
        {
          timeout: 40000
        }
      ).then(
        () => true
      ).catch(
        () => false
      );

    if (attempt <= 1) {
      await safeClick(
        this.sendCodeButton,
        'Send Code via SMS'
      );
    } else {
      console.log(
        '[CLICK] Send Code via SMS (DOM click)'
      );

      await this.sendCodeButton.evaluate(
        (button) => {
          (button as HTMLButtonElement).click();
        }
      );
    }

    const started =
      await Promise.race([
        requestStarted,
        this.page.waitForTimeout(
          8000
        ).then(
          () => false
        )
      ]);

    if (!started) {
      const stillEnabled =
        await this.sendCodeButton.isEnabled().catch(
          () => false
        );

      if (stillEnabled) {
        await this.sendCodeButton.click({
          force: true,
          timeout: 5000
        }).catch(
          () => undefined
        );
      }
    }

    const response =
      await responsePromise;

    this.lastSendOtpStatus =
      response?.status() ?? 0;

    this.lastSendOtpBody =
      response
        ? await response.text().catch(
          () => ''
        )
        : '';

    console.log(
      `Send OTP ${this.lastSendOtpStatus} ${this.lastSendOtpBody.slice(0, 180)}`
    );
  }

  private async waitForRegistrationOtpInput() {
    const manualFallback =
      this.envEnabled(
        'REGISTRATION_OTP_MANUAL_FALLBACK'
      );

    let rateLimitWaits = 0;

    for (
      let attempt = 1;
      attempt <= 4;
      attempt++
    ) {
      await this.visibleOtpInput()
        .waitFor({
          state: 'visible',
          timeout: 15000
        })
        .catch(
          () => undefined
        );

      if (
        await this.otpFieldIsVisible()
      ) {
        return;
      }

      const diagnostics =
        await this.collectOtpRequestDiagnostics();

      Logger.info(
        `OTP input not visible after SMS request. Attempt ${attempt}/4. Send status ${this.lastSendOtpStatus}. Visible diagnostics: ${diagnostics}`
      );

      const waitSeconds =
        Number(
          this.lastSendOtpBody.match(
            /try again in (\d+)\s*s/i
          )?.[1] ?? 0
        );

      if (
        this.lastSendOtpStatus === 429 &&
        waitSeconds > 0 &&
        rateLimitWaits < 3
      ) {
        rateLimitWaits += 1;

        const pauseMs =
          // The server says how long to wait ("Try again in 438s"). Honour it
          // (up to 8 min) instead of retrying early and failing again.
          Math.min(
            waitSeconds + 5,
            480
          ) * 1000;

        const replacement =
          generateMobileNumber();

        Logger.info(
          `OTP rate limit. Waiting ${Math.round(pauseMs / 1000)}s, then sending on ${replacement}.`
        );

        await this.page.waitForTimeout(
          pauseMs
        );

        await this.fillMobileNumber(
          replacement
        );

        await this.waitForSendCodeEnabled();

        await this.clickSendCode(
          attempt + 1
        );

        await this.visibleOtpInput()
          .waitFor({
            state: 'visible',
            timeout: 15000
          })
          .catch(
            () => undefined
          );

        if (
          await this.otpFieldIsVisible()
        ) {
          return;
        }

        continue;
      }

      const sendRejected =
        this.lastSendOtpStatus === 0 ||
        this.lastSendOtpStatus === 409 ||
        this.lastSendOtpStatus === 429 ||
        /already registered|too many|rate limit|try again/i.test(
          this.lastSendOtpBody
        );

      if (sendRejected) {
        const replacement =
          generateMobileNumber();

        console.log(
          `Text code was not sent. Trying mobile ${replacement}`
        );

        await this.fillMobileNumber(
          replacement
        );
      }

      if (
        attempt === 4
      ) {
        if (manualFallback) {
          Logger.info(
            'Manual OTP fallback enabled. Complete the OTP request manually, then resume Playwright.'
          );

          await this.page.pause();

          await expect(
            this.visibleOtpInput()
          ).toBeVisible({
            timeout: 30000
          });

          return;
        }

        throw new Error(
          `Registration OTP input did not appear after requesting SMS code. Send status ${this.lastSendOtpStatus}. ${this.lastSendOtpBody.slice(0, 180)} Visible diagnostics: ${diagnostics}`
        );
      }

      await this.waitForSendCodeEnabled();

      await this.clickSendCode(
        attempt + 1
      );
    }

    throw new Error(
      `Registration OTP input did not appear after requesting SMS code. Send status ${this.lastSendOtpStatus}. ${this.lastSendOtpBody.slice(0, 180)}`
    );
  }



  private registrationExpectedToFail = false;

  private static registeredMobileByEmail =
    new Map<string, string>();

  /**
   * The mobile number that was really verified when this email registered.
   * Falls back to the number the test asked for when none was recorded.
   */
  static registeredMobileFor(
    email: string,
    requested: string
  ) {
    return (
      RegistrationPage.registeredMobileByEmail.get(
        email.toLowerCase()
      ) ?? requested
    );
  }

  private async rememberRegisteredMobile(
    email: string
  ) {
    const digits =
      (
        await this.mobileInput.inputValue().catch(
          () => ''
        )
      ).replace(
        /\D/g,
        ''
      ).slice(-10);

    // A sign-up that is meant to be refused (same email again) must not
    // replace the number of the account that really exists.
    if (
      digits.length === 10 &&
      !this.registrationExpectedToFail
    ) {
      RegistrationPage.registeredMobileByEmail.set(
        email.toLowerCase(),
        digits
      );
    }
  }

  private async fillMobileNumber(
    mobileNumber: string
  ) {
    await this.mobileInput.click();

    await this.mobileInput.fill(
      ''
    );

    await this.mobileInput.fill(
      mobileNumber
    );

    await this.mobileInput.evaluate(
      (input, value) => {
        const setter =
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
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
      mobileNumber
    );

    await this.mobileInput.blur();
  }



  private async fillPasswordFields() {
    await this.passwordInput.fill(
      TEST_USERS.onboarding.password
    );

    await this.passwordInput.blur();

    await this.confirmPasswordInput.fill(
      TEST_USERS.onboarding.password
    );

    await this.confirmPasswordInput.blur();

    const passwordFields =
      this.page.locator(
        'input[type="password"]'
      );

    if (
      await passwordFields.count() >= 2
    ) {
      await passwordFields.nth(
        1
      ).fill(
        TEST_USERS.onboarding.password
      );
    }
  }

  private async acceptVisibleRegistrationConsents() {
    const boxes =
      this.page.locator(
        'input[type="checkbox"], [role="checkbox"]'
      );

    const count =
      await boxes.count();

    for (
      let index = 0;
      index < count;
      index++
    ) {
      const box =
        boxes.nth(
          index
        );

      const checked =
        await box.isChecked().catch(
          async () =>
            (
              await box.getAttribute(
                'aria-checked'
              )
            ) === 'true'
        );

      if (
        checked
      ) {
        continue;
      }

      const id =
        await box.getAttribute(
          'id'
        );

      if (
        id
      ) {
        const label =
          this.page.locator(
            `label[for="${id}"]`
          );

        if (
          await label.isVisible().catch(
            () => false
          )
        ) {
          await label.click({
            force: true
          });
          continue;
        }
      }

      await box.check({
        force: true
      }).catch(
        async () => {
          await box.click({
            force: true
          }).catch(
            () => undefined
          );
        }
      );
    }
  }

  private async waitForPasswordFieldsReady() {
    await expect(
      this.passwordInput
    ).toBeEditable({
      timeout: 5000
    });

    await expect(
      this.confirmPasswordInput
    ).toBeEditable({
      timeout: 5000
    });
  }



  private async waitForSendCodeEnabled() {
    const enabled =
      await expect.poll(
        async () =>
          this.sendCodeButton.isEnabled().catch(
            () => false
          ),
        {
          timeout: 45000
        }
      ).toBe(
        true
      ).then(
        () => true
      ).catch(
        () => false
      );

    if (enabled) {
      return;
    }

    const mobileValue =
      await this.mobileInput
        .inputValue()
        .catch(
          () => ''
        );

    const diagnostics =
      await this.collectOtpRequestDiagnostics();

    throw new Error(
      `Send code via SMS button stayed disabled after entering mobile number "${mobileValue}". Visible diagnostics: ${diagnostics}`
    );
  }



  async open() {


    Logger.info(
      'Opening application'
    );


    await this.page.goto(
      BASE_URL,
      {
        waitUntil:
        'domcontentloaded',

        timeout:
        60000
      }
    );


    await this.dismissMarketingOverlays();


    const registrationCtaVisible =
      await this.createAccountLink.isVisible({
        timeout: 10000
      }).catch(
        () => false
      );

    if (registrationCtaVisible) {
      await safeClick(
        this.createAccountLink,
        'Open Start 30-Day Free Trial'
      );
    }

    const onRegister =
      await this.page.waitForURL(
        /\/register|\/signup|\/sign-up|\/create/,
        {
          timeout: 8000
        }
      ).then(
        () => true
      ).catch(
        () => false
      );

    if (!onRegister) {
      await this.page.goto(
        `${BASE_URL}${URLS.REGISTER}`,
        {
          waitUntil:
          'domcontentloaded',

          timeout:
          60000
        }
      );
    }

    await expect(
      this.page
    ).toHaveURL(
      /\/register|\/signup|\/sign-up|\/create/,
      {
        timeout: 15000
      }
    );

    const firstNameReady =
      await this.firstNameInput
        .isVisible()
        .catch(
          () => false
        );

    if (
      !firstNameReady
    ) {
      await this.page.reload({
        waitUntil: 'commit',
        timeout: 60000
      });
    }

    await expect(
      this.firstNameInput
    ).toBeVisible({
      timeout: 45000
    });

    await expect(
      this.submitButton
    ).toBeVisible({
      timeout: 15000
    });


    Logger.success(
      'Registration page opened'
    );

  }




  async register(
    email: string,
    mobileNumber =
      TEST_USERS.onboarding.mobile
  ) {


    Logger.step(
      `Registering: ${email}`
    );

    validatePasswordPolicy(
      TEST_USERS.onboarding.password
    );


    await this.firstNameInput.fill(
      TEST_USERS.onboarding.firstName
    );


    await this.lastNameInput.fill(
      TEST_USERS.onboarding.lastName
    );


    console.log(
      'Registration Email:',
      email
    );


    await this.emailInput.fill(
      email
    );


    await this.fillMobileNumber(
      mobileNumber
    );


    if (
      AUTH_SETTINGS.registrationMobileOtpEnabled
    ) {
      await this.waitForSendCodeEnabled();

      await this.clickSendCode(
        1
      );

      await this.waitForRegistrationOtpInput();

      await this.clickVerifyWhenReady();


      Logger.success(
        'OTP Verify Clicked'
      );

      await this.ensureMobileVerified();

      await this.waitForPasswordFieldsReady();
    } else {
      Logger.info(
        'Registration mobile OTP is disabled in auth settings'
      );
    }



    // The OTP step can swap in a different number (rate limit, number already
    // registered). Remember the number that was actually verified so later
    // "same mobile" checks use it, not the number the test first asked for.
    await this.rememberRegisteredMobile(
      email
    );

    await this.fillPasswordFields();

    await this.acceptVisibleRegistrationConsents();

    const submitReady =
      await expect(
        this.submitButton
      ).toBeEnabled({
        timeout: 8000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (
      !submitReady
    ) {
      await this.acceptVisibleRegistrationConsents();

      await this.fillPasswordFields();

      await expect(
        this.submitButton
      ).toBeEnabled({
        timeout: 20000
      });
    }

    await safeClick(
      this.submitButton,
      'Submit Registration'
    );

    // A full run is slower than a single test (busy server, long idle wait
    // after an OTP rate limit), so give the first submit longer, then submit
    // once more if the form is still showing.
    let accepted =
      await this.waitForRegistrationAccepted(
        this.registrationExpectedToFail
          ? 20000
          : 40000
      );

    if (
      !accepted &&
      !this.registrationExpectedToFail &&
      await this.submitButton.isEnabled().catch(
        () => false
      )
    ) {
      Logger.info(
        'Registration was not accepted yet. Submitting once more.'
      );

      await safeClick(
        this.submitButton,
        'Submit Registration (retry)'
      );

      accepted =
        await this.waitForRegistrationAccepted(
          40000
        );
    }

    if (!accepted) {
      const visible =
        (
          await this.page
            .locator(
              'body'
            )
            .innerText()
            .catch(
              () => ''
            )
        )
          .replace(
            /\s+/g,
            ' '
          )
          .slice(
            0,
            300
          );

      throw new Error(
        `Waiting for registration success or email-verification screen. URL ${this.page.url()}. Visible: ${visible}`
      );
    }



    Logger.success(
      'Registration successful. Verification email sent.'
    );


  }

  async expectDuplicateEmailBlocked(
    email: string,
    mobileNumber: string
  ) {
    Logger.info(
      `Checking ${email} cannot create another account`
    );

    await this.open();

    // This sign-up is meant to be refused, so do not retry the submit.
    this.registrationExpectedToFail = true;

    try {
      await this.register(
        email,
        mobileNumber
      ).catch(
        () => undefined
      );
    } finally {
      this.registrationExpectedToFail = false;
    }

    await expect(
      this.page.getByText(
        /email.*already|already.*email|already registered|account already exists|email.*exists/i
      ).first()
    ).toBeVisible({
      timeout: 20000
    });

    await expect(
      this.page
    ).toHaveURL(
      /register/i
    );

    Logger.success(
      'Same email cannot create another account'
    );
  }

  async expectDuplicateMobileBlocked(
    email: string,
    mobileNumber: string
  ) {
    Logger.info(
      `Checking ${mobileNumber} cannot verify another account`
    );

    await this.open();

    await this.firstNameInput.fill(
      TEST_USERS.onboarding.firstName
    );

    await this.lastNameInput.fill(
      TEST_USERS.onboarding.lastName
    );

    await this.emailInput.fill(
      email
    );

    await this.fillMobileNumber(
      mobileNumber
    );

    await this.waitForSendCodeEnabled();
    await this.clickSendCode(1);

    const rejectedOnSend =
      this.lastSendOtpStatus === 409 ||
      /already registered/i.test(
        this.lastSendOtpBody
      );

    if (!rejectedOnSend) {
      await this.waitForRegistrationOtpInput();
      await this.clickVerifyWhenReady();
    }

    // The 409 can arrive a moment after the click, so poll for it instead of
    // reading the flag once.
    const rejected =
      rejectedOnSend ||
      await expect.poll(
        async () =>
          this.mobileNumberTaken ||
          await this.page.getByText(
            /already registered|use a different number/i
          ).first().isVisible().catch(
            () => false
          ),
        {
          timeout: 15000
        }
      ).toBeTruthy().then(
        () => true
      ).catch(
        () => false
      );

    expect(
      rejected,
      'A mobile number that already verified an account should be refused.'
    ).toBeTruthy();

    await expect(
      this.submitButton
    ).toBeDisabled();

    Logger.success(
      'Same mobile number cannot create another account'
    );
  }

  private async registrationLooksAccepted() {
    const url =
      this.page.url();

    if (
      /verify-email-sent|\/(verify|onboarding|dashboard|plan|risk|compliance|check-email|confirm)/i.test(
        url
      )
    ) {
      return true;
    }

    const firstNameVisible =
      await this.firstNameInput.isVisible().catch(
        () => false
      );

    const bodyText =
      await this.page
        .locator(
          'body'
        )
        .innerText()
        .catch(
          () => ''
        );

    if (
      !firstNameVisible &&
      /check your email|verification link was sent|verify-email/i.test(
        bodyText
      )
    ) {
      return true;
    }

    return /check your email|a verification link was sent|verification (sent|email|link)|verify your email|confirm your email/i.test(
      bodyText
    );
  }

  private async waitForRegistrationAccepted(
    timeoutMs: number
  ) {
    const started =
      Date.now();

    while (
      Date.now() -
        started <
      timeoutMs
    ) {
      if (
        await this.registrationLooksAccepted()
      ) {
        return true;
      }

      await this.page.waitForTimeout(
        500
      );
    }

    return false;
  }


}
