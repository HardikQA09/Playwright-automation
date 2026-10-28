import {
  Locator
} from '@playwright/test';

import {
  expect,
  test
} from './fixtures/subscriberAuth';

import {
  BASE_URL,
  TEST_USERS
} from './config/testData';

import { ProfilePage }
  from './pages/ProfilePage';

/* =============================================================================
TEST SUITE: Profile Negative Scenarios

PURPOSE
-------
One authenticated session validates profile guardrails without saving account
changes.

Run:
npx playwright test tests/ProfileNegative.spec.ts --headed
============================================================================= */

async function findLocalPasswordToggle(
  passwordInput: Locator
) {
  return passwordInput.locator(
    'xpath=ancestor::div[contains(@class,"relative")][1]//button'
  ).first();
}

test.describe(
  'Profile Negative Scenarios',
  () => {

    test.describe.configure({
      timeout: 180000
    });

    test(
      'Profile identity drafts password toggles and navigation in one session',
      async ({ page }) => {
        const profile =
          new ProfilePage(
            page
          );

        await profile.open();
        await profile.validateProfileLoaded();

        await test.step(
          'Email is read-only and matches subscriber',
          async () => {
            const originalEmail =
              await profile.emailInput.inputValue();

            await expect(
              profile.emailInput
            ).toBeDisabled();

            await expect(
              profile.emailInput
            ).toHaveValue(
              originalEmail
            );

            await expect(
              profile.emailInput
            ).toHaveValue(
              TEST_USERS.subscriber.email,
              {
                timeout: 10000
              }
            );
          }
        );

        await test.step(
          'Personal information controls are populated',
          async () => {
            await profile.validatePersonalInfoControls();

            await expect(
              profile.firstNameInput
            ).not.toHaveValue(
              '',
              {
                timeout: 15000
              }
            );

            await expect(
              profile.lastNameInput
            ).not.toHaveValue(
              '',
              {
                timeout: 15000
              }
            );
          }
        );

        await test.step(
          'Empty name drafts are not persisted',
          async () => {
            const originalFirstName =
              await profile.firstNameInput.inputValue();

            const originalLastName =
              await profile.lastNameInput.inputValue();

            await profile.firstNameInput.fill(
              ''
            );

            await page.reload({
              waitUntil: 'domcontentloaded'
            });

            await profile.waitForProfileData();

            await expect(
              profile.firstNameInput
            ).toHaveValue(
              originalFirstName
            );

            await profile.lastNameInput.fill(
              ''
            );

            await page.reload({
              waitUntil: 'domcontentloaded'
            });

            await profile.waitForProfileData();

            await expect(
              profile.lastNameInput
            ).toHaveValue(
              originalLastName
            );
          }
        );

        await test.step(
          'Profile data remains after refresh',
          async () => {
            const originalFirstName =
              await profile.firstNameInput.inputValue();

            const originalLastName =
              await profile.lastNameInput.inputValue();

            const originalEmail =
              await profile.emailInput.inputValue();

            await page.reload({
              waitUntil: 'domcontentloaded'
            });

            await profile.waitForProfileData();

            await expect(
              profile.firstNameInput
            ).toHaveValue(
              originalFirstName
            );

            await expect(
              profile.lastNameInput
            ).toHaveValue(
              originalLastName
            );

            await expect(
              profile.emailInput
            ).toHaveValue(
              originalEmail
            );
          }
        );

        await test.step(
          'Empty password fields stay on profile',
          async () => {
            await expect(
              profile.currentPasswordInput
            ).toBeVisible();

            await expect(
              profile.newPasswordInput
            ).toBeVisible();

            await expect(
              profile.confirmPasswordInput
            ).toBeVisible();

            await profile.changePasswordButton.click();

            await expect(
              page
            ).toHaveURL(
              /\/dashboard\/profile/
            );
          }
        );

        await test.step(
          'Password visibility toggles without saving',
          async () => {
            const passwordInputs = [
              page.getByLabel(
                /^current password$/i
              ),
              page.getByLabel(
                /^new password$/i
              ),
              page.getByLabel(
                /^confirm new password$/i
              )
            ];

            await profile.currentPasswordInput.fill(
              'DraftCurrentPassword1!'
            );

            await profile.newPasswordInput.fill(
              'DraftNewPassword1!'
            );

            await profile.confirmPasswordInput.fill(
              'DraftNewPassword1!'
            );

            for (
              let index = 0;
              index < passwordInputs.length;
              index += 1
            ) {
              const input =
                passwordInputs[index];

              await expect(
                input
              ).toHaveAttribute(
                'type',
                'password'
              );

              const toggle =
                await findLocalPasswordToggle(
                  input
                );

              await expect(
                toggle
              ).toBeVisible({
                timeout: 10000
              });

              await toggle.click();

              await expect(
                input
              ).not.toHaveValue(
                ''
              );

              await toggle.click();

              await expect(
                input
              ).not.toHaveValue(
                ''
              );
            }

            await expect(
              page
            ).toHaveURL(
              /\/dashboard\/profile/
            );
          }
        );

        await test.step(
          'Password drafts clear after refresh',
          async () => {
            await page.reload({
              waitUntil: 'domcontentloaded'
            });

            await profile.waitForProfileData();

            await expect(
              profile.currentPasswordInput
            ).toHaveValue(
              ''
            );

            await expect(
              profile.newPasswordInput
            ).toHaveValue(
              ''
            );

            await expect(
              profile.confirmPasswordInput
            ).toHaveValue(
              ''
            );
          }
        );

        await test.step(
          'Delete account dialog closes without deleting the account',
          async () => {
            await profile.validateDeleteAccountDialogWithoutDeleting();

            await expect(
              profile.emailInput
            ).toHaveValue(
              TEST_USERS.subscriber.email
            );
          }
        );

        await test.step(
          'Direct route survives back and forward',
          async () => {
            await page.goto(
              `${BASE_URL}/dashboard`,
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
              /\/dashboard\/profile/,
              {
                timeout: 15000
              }
            );

            await profile.waitForProfileData();

            await page.goForward({
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
          }
        );

        if (
          process.env.PROFILE_UPDATE_VALIDATION_ENABLED ===
          'true'
        ) {
          await test.step(
            'Name update persists and is restored',
            async () => {
              await profile.open();

              const originalFirstName =
                await profile.firstNameInput.inputValue();

              const originalLastName =
                await profile.lastNameInput.inputValue();

              const uniqueSuffix =
                Date.now()
                  .toString()
                  .slice(-4);

              try {
                await profile.updateProfileAndValidatePersistence(
                  `QA${uniqueSuffix}`,
                  `User${uniqueSuffix}`
                );
              } finally {
                await profile.updateProfileAndValidatePersistence(
                  originalFirstName,
                  originalLastName
                );
              }
            }
          );
        }
      }
    );
  }
);
