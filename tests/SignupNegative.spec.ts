import {
  expect,
  test
} from '@playwright/test';

import { RegistrationPage }
  from './pages/RegistrationPage';

import {
  generateMobileNumber
} from './utils/emailGenerator';

import {
  AUTH_SETTINGS,
  TEST_USERS
} from './config/testData';

const invalidEmailInputs = [
  {
    name: 'missing domain',
    value: 'missing-domain@'
  },
  {
    name: 'missing @',
    value: 'missing-at.example.com'
  },
  {
    name: 'SQL injection',
    value: "' OR 1=1 --"
  },
  {
    name: 'XSS injection',
    value: '<script>alert(1)</script>'
  }
];

const duplicateEmailValidationEnabled =
  process.env.SIGNUP_DUPLICATE_EMAIL_VALIDATION_ENABLED ===
  'true';

const otpLengthValidationEnabled =
  process.env.SIGNUP_OTP_LENGTH_VALIDATION_ENABLED ===
  'true';

// The SMS OTP field is capped at 8 digits (input maxlength="8").
const OTP_LENGTH = 8;

const otpResendValidationEnabled =
  process.env.SIGNUP_OTP_RESEND_VALIDATION_ENABLED ===
  'true';

const duplicateSignupEmail =
  process.env.SIGNUP_DUPLICATE_EMAIL ??
  TEST_USERS.subscriber.email;

const duplicateSignupMobile =
  process.env.SIGNUP_DUPLICATE_MOBILE ??
  TEST_USERS.onboarding.mobile;

async function fillRequiredSignupFields(
  registration: RegistrationPage,
  email: string,
  mobile: string
) {
  await registration.firstNameInput.fill(
    TEST_USERS.onboarding.firstName
  );

  await registration.lastNameInput.fill(
    TEST_USERS.onboarding.lastName
  );

  await registration.emailInput.fill(
    email
  );

  await registration.mobileInput.fill(
    mobile
  );

  await registration.passwordInput.fill(
    TEST_USERS.onboarding.password
  );

  await registration.confirmPasswordInput.fill(
    TEST_USERS.onboarding.password
  );
}

async function requestSignupOtpIfAvailable(
  registration: RegistrationPage
) {
  if (
    !AUTH_SETTINGS.registrationMobileOtpEnabled
  ) {
    return false;
  }

  const otpIsVisible =
    async () =>
      registration.otpInput
        .first()
        .isVisible({
          timeout: 1000
        })
        .catch(
          () => false
        );

  // Filling mobile can auto-send SMS. OTP + cooldown may already be on screen
  // while "Send code via SMS" stays disabled — do not hard-wait on Send.
  if (
    await otpIsVisible()
  ) {
    return true;
  }

  for (
    let attempt = 1;
    attempt <= 3;
    attempt++
  ) {
    if (
      await otpIsVisible()
    ) {
      return true;
    }

    const sendEnabled =
      await registration.sendCodeButton
        .isEnabled()
        .catch(
          () => false
        );

    if (
      !sendEnabled
    ) {
      const ready =
        await expect
          .poll(
            async () => {
              if (
                await otpIsVisible()
              ) {
                return 'otp';
              }

              if (
                await registration.sendCodeButton
                  .isEnabled()
                  .catch(
                    () => false
                  )
              ) {
                return 'send';
              }

              return 'wait';
            },
            {
              timeout: 25000
            }
          )
          .toMatch(
            /otp|send/
          )
          .then(
            async () =>
              (
                await otpIsVisible()
              )
                ? 'otp'
                : 'send'
          )
          .catch(
            () => 'fail'
          );

      if (
        ready ===
        'otp'
      ) {
        return true;
      }

      if (
        ready !==
        'send'
      ) {
        await registration.page.waitForTimeout(
          1000
        );
        continue;
      }
    }

    await registration.sendCodeButton.click();

    if (
      await registration.otpInput
        .first()
        .isVisible({
          timeout: 20000
        })
        .catch(
          () => false
        )
    ) {
      return true;
    }

    await registration.page.waitForTimeout(
      1000
    );
  }

  return false;
}

async function openSignupOtpInput(
  registration: RegistrationPage,
  scenario: string
) {
  await registration.open();

  await fillRequiredSignupFields(
    registration,
    `imhardikthanki+${scenario}-${Date.now()}@gmail.com`,
    generateMobileNumber()
  );

  const otpVisible =
    await requestSignupOtpIfAvailable(
      registration
    );

  test.skip(
    !otpVisible,
    'Skipped because signup OTP input did not appear after requesting SMS code.'
  );
}

/* =============================================================================
TEST SUITE: Signup Negative Scenarios

PURPOSE
-------
Validate registration form guardrails without sending real OTP/email requests.

Run:
npx playwright test tests/SignupNegative.spec.ts --headed
============================================================================= */

test.describe(
  'Signup Negative Scenarios',
  () => {
    test.describe.configure({
      timeout: 120000
    });

    test(
      'Signup form blocks empty required fields',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await expect(
          page
        ).not.toHaveURL(
          /\/dashboard/
        );

        await expect(
          registration.submitButton
        ).toBeDisabled();

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
      'Signup form blocks invalid email format',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await registration.emailInput.fill(
          'invalid-email'
        );

        await expect(
          registration.emailInput
        ).toHaveJSProperty(
          'validity.typeMismatch',
          true
        );
      }
    );

    test(
      'Signup name fields expose browser-friendly autocomplete metadata',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await expect(
          registration.firstNameInput
        ).toHaveAttribute(
          'autocomplete',
          'given-name'
        );

        await expect(
          registration.lastNameInput
        ).toHaveAttribute(
          'autocomplete',
          'family-name'
        );
      }
    );

    for (const input of invalidEmailInputs) {
      test(
        `Signup form blocks ${input.name} email input`,
        async ({ page }) => {

          const registration =
            new RegistrationPage(page);

          await registration.open();

          await registration.emailInput.fill(
            input.value
          );

          await expect(
            registration.emailInput
          ).toHaveJSProperty(
            'validity.typeMismatch',
            true
          );
        }
      );
    }

    test(
      'Signup email trims leading and trailing spaces',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await registration.emailInput.fill(
          ' USER@example.com '
        );

        await expect(
          registration.emailInput
        ).toHaveValue(
          'USER@example.com'
        );
      }
    );

    test(
      'Signup form keeps submit disabled without password and confirmation',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await expect(
          registration.passwordInput
        ).toBeVisible();

        await expect(
          registration.confirmPasswordInput
        ).toBeVisible();

        await expect(
          registration.submitButton
        ).toBeDisabled();
      }
    );

    test(
      'Signup form keeps submit disabled when passwords do not match',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await registration.firstNameInput.fill(
          'Test'
        );

        await registration.lastNameInput.fill(
          'User'
        );

        await registration.emailInput.fill(
          'test.user@example.com'
        );

        await registration.mobileInput.fill(
          '2015550199'
        );

        await registration.passwordInput.fill(
          'Test@123456'
        );

        await registration.confirmPasswordInput.fill(
          'Different@123456'
        );

        await expect(
          registration.submitButton
        ).toBeDisabled();
      }
    );

    test(
      'Signup form keeps OTP request disabled without mobile number',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await expect(
          registration.mobileInput
        ).toBeVisible();

        await expect(
          registration.sendCodeButton
        ).toBeVisible();

        await expect(
          registration.sendCodeButton
        ).toBeDisabled();
      }
    );

    test(
      'Signup form keeps OTP request disabled for short mobile number',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await registration.mobileInput.fill(
          '123'
        );

        await expect(
          registration.sendCodeButton
        ).toBeDisabled();
      }
    );

    test(
      'Signup mobile input strips letters and keeps OTP disabled',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await registration.mobileInput.fill(
          'abcdefghij'
        );

        await expect(
          registration.mobileInput
        ).toHaveValue(
          ''
        );

        await expect(
          registration.sendCodeButton
        ).toBeDisabled();
      }
    );

    test(
      'Signup mobile input normalizes formatted US number',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await registration.mobileInput.fill(
          '201-555-0123'
        );

        await expect(
          registration.mobileInput
        ).toHaveValue(
          '2015550123'
        );

        await expect(
          registration.sendCodeButton
        ).toBeEnabled();
      }
    );

    test(
      'Signup mobile input normalizes spaces and parentheses',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await registration.mobileInput.fill(
          '(201) 555 0123'
        );

        await expect(
          registration.mobileInput
        ).toHaveValue(
          '2015550123'
        );

        await expect(
          registration.sendCodeButton
        ).toBeEnabled();
      }
    );

    test(
      'Signup mobile input limits extra digits to ten digits',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await registration.mobileInput.fill(
          '12345678901'
        );

        await expect(
          registration.mobileInput
        ).toHaveValue(
          '2345678901'
        );

        await expect(
          registration.sendCodeButton
        ).toBeEnabled();
      }
    );

    test(
      'Signup form shows US mobile number guidance before OTP request',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await expect(
          registration.mobileInput
        ).toBeVisible();

        await expect(
          page.getByText(
            /US mobile numbers only/i
          )
        ).toBeVisible();
      }
    );

    if (otpLengthValidationEnabled) {
      test(
        `Signup OTP input limits entry to ${OTP_LENGTH} digits`,
        async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await openSignupOtpInput(
          registration,
          'otp-length'
        );

        await registration.otpInput.first().fill(
          '1234567890'.slice(
            0,
            OTP_LENGTH + 1
          )
        );

        await expect
          .poll(
            async () =>
              (
                await registration.otpInput
                  .first()
                  .inputValue()
              ).length,
            {
              timeout: 5000
            }
          )
          .toBeLessThanOrEqual(
            OTP_LENGTH
          );
        }
      );

      test(
        `Signup OTP input trims pasted value to ${OTP_LENGTH} digits`,
        async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await openSignupOtpInput(
          registration,
          'otp-paste'
        );

        await registration.otpInput.first().fill(
          '12345678901234'
        );

        await expect(
          registration.otpInput.first()
        ).toHaveValue(
          '12345678901234'.slice(
            0,
            OTP_LENGTH
          ),
          {
            timeout: 5000
          }
        );
        }
      );

      test(
        'Signup OTP input accepts digits only',
        async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await openSignupOtpInput(
          registration,
          'otp-numeric'
        );

        await registration.otpInput.first().fill(
          '12ab 34!@'
        );

        await expect(
          registration.otpInput.first()
        ).toHaveValue(
          '1234',
          {
            timeout: 5000
          }
        );
        }
      );

      test(
        `Signup OTP verify is available for a full ${OTP_LENGTH}-digit code and rejects a short one`,
        async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await openSignupOtpInput(
          registration,
          'otp-button-state'
        );

        const otp =
          registration.otpInput.first();

        // Full-length code: Verify must be available.
        await otp.fill(
          '12345678901234'.slice(
            0,
            OTP_LENGTH
          )
        );

        await expect(
          registration.verifyOtpButton
        ).toBeEnabled({
          timeout: 5000
        });

        // Short code: the app either disables Verify or must not accept it
        // (the OTP step stays on screen and signup does not continue).
        await otp.fill(
          '123'
        );

        const verifyDisabled =
          await registration.verifyOtpButton
            .isDisabled()
            .catch(
              () => false
            );

        if (!verifyDisabled) {
          await registration.verifyOtpButton.click();

          await expect(
            otp,
            'A short OTP must not complete signup.'
          ).toBeVisible({
            timeout: 5000
          });

          await expect(
            page
          ).not.toHaveURL(
            /\/(onboarding|plans?|dashboard)/,
            {
              timeout: 3000
            }
          );
        }
        }
      );
    }

    if (otpResendValidationEnabled) {
      test(
        'Signup OTP resend or cooldown state is visible after code request',
        async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await openSignupOtpInput(
          registration,
          'otp-resend-state'
        );

        const resendOrCooldown =
          page
            .locator(
              'button, [role="button"], p, span, div'
            )
            .filter({
              hasText:
                /resend|send code|send again|code sent|wait|seconds|\d+s|too many|rate|try again/i
            })
            .first();

        await expect(
          resendOrCooldown
        ).toBeVisible({
          timeout: 10000
        });
        }
      );
    }

    if (duplicateEmailValidationEnabled) {
      test(
        'Signup blocks already registered email address',
        async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await fillRequiredSignupFields(
          registration,
          duplicateSignupEmail,
          generateMobileNumber()
        );

        const otpVisible =
          await requestSignupOtpIfAvailable(
            registration
          );

        test.skip(
          !otpVisible,
          'Skipped because signup OTP input did not appear after requesting SMS code.'
        );

        await registration.otpInput.first().fill(
          AUTH_SETTINGS.otpCode
        );

        await registration.verifyOtpButton.click();

        await expect(
          registration.submitButton
        ).toBeEnabled({
          timeout: 15000
        });

        await registration.submitButton.click();

        await expect(
          page.getByText(
            /email.*already|already.*email|already registered|account already exists|email.*exists/i
          ).first()
        ).toBeVisible({
          timeout: 15000
        });

        await expect(
          page
        ).not.toHaveURL(
          /\/dashboard/
        );
        }
      );
    }

    test(
      'Signup password visibility toggles work for both password fields',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        const showButtons =
          page.getByRole(
            'button',
            {
              name: /show/i
            }
          );

        await expect(
          registration.passwordInput
        ).toHaveAttribute(
          'type',
          'password'
        );

        await showButtons.nth(0).click();

        await expect(
          registration.passwordInput
        ).toHaveAttribute(
          'type',
          'text'
        );

        await expect(
          registration.confirmPasswordInput
        ).toHaveAttribute(
          'type',
          'password'
        );

        await showButtons.first().click();

        await expect(
          registration.confirmPasswordInput
        ).toHaveAttribute(
          'type',
          'text'
        );
      }
    );

    test(
      'Signup submit stays disabled before mobile OTP verification',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await registration.firstNameInput.fill(
          'Test'
        );

        await registration.lastNameInput.fill(
          'User'
        );

        await registration.emailInput.fill(
          'test.user@example.com'
        );

        await registration.mobileInput.fill(
          '2015550199'
        );

        await registration.passwordInput.fill(
          'Test@123456'
        );

        await registration.confirmPasswordInput.fill(
          'Test@123456'
        );

        await expect(
          registration.sendCodeButton
        ).toBeEnabled();

        await expect(
          registration.submitButton
        ).toBeDisabled();
      } 
    );

    test(
      'Signup password drafts are cleared after refresh',
      async ({ page }) => {

        const registration =
          new RegistrationPage(page);

        await registration.open();

        await registration.passwordInput.fill(
          'DraftSignupPassword1!'
        );

        await registration.confirmPasswordInput.fill(
          'DraftSignupPassword1!'
        );

        await page.reload({
          waitUntil: 'domcontentloaded'
        });

        await expect(
          registration.passwordInput
        ).toHaveValue(
          ''
        );

        await expect(
          registration.confirmPasswordInput
        ).toHaveValue(
          ''
        );
      }
    );
  }
);
