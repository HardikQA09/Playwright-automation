import {
  Page,
  expect,
  test
} from '@playwright/test';

import {
  BASE_URL,
  TEST_USERS
} from './config/testData';
import {
  generateEmail,
  generateMobileNumber
} from './utils/emailGenerator';
import {
  skipUnlessEmailVerificationReady,
  waitForManualEmailVerification
} from './helpers/emailVerification';
import { CompliancePage }
  from './pages/CompliancePage';
import { LoginPage }
  from './pages/LoginPage';
import { MobileVerificationPage }
  from './pages/MobileVerificationPage';
import { RegistrationPage }
  from './pages/RegistrationPage';
import { RiskProfilePage }
  from './pages/RiskProfilePage';

/* =============================================================================
TEST SUITE: Onboarding Field Validation

PURPOSE
-------
Validates required-field guardrails for Risk Profile and Compliance onboarding
steps. These tests use fresh users because onboarding state is one-time per
account in UAT.

Run:
$env:ONBOARDING_FIELD_VALIDATION_ENABLED="true"
npx playwright test tests/OnboardingFieldValidation.spec.ts --headed
============================================================================= */

function envEnabled(
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

function getExistingOnboardingUser() {
  const email =
    process.env.ONBOARDING_FIELD_VALIDATION_EXISTING_EMAIL;

  const password =
    process.env.ONBOARDING_FIELD_VALIDATION_EXISTING_PASSWORD;

  const mobile =
    process.env.ONBOARDING_FIELD_VALIDATION_EXISTING_MOBILE;

  if (
    !email ||
    !password
  ) {
    return undefined;
  }

  return {
    email,
    password,
    mobile:
      mobile ??
      TEST_USERS.onboarding.mobile
  };
}

async function registerAndLoginFreshUser(
  page: Page,
  scenario: string
) {
  const existingUser =
    getExistingOnboardingUser();

  if (existingUser) {
    console.log(
      `${scenario} Existing onboarding email:`,
      existingUser.email
    );

    const login =
      new LoginPage(
        page
      );

    await login.login(
      existingUser.email,
      existingUser.password
    );

    await new MobileVerificationPage(
      page
    ).completeIfVisible(
      existingUser.mobile
    );

    if (
      !/\/onboarding/.test(
        page.url()
      )
    ) {
      await page.goto(
        `${BASE_URL}/onboarding`,
        {
          waitUntil: 'domcontentloaded'
        }
      );
    }

    await expect(
      page
    ).toHaveURL(
      /onboarding/,
      {
        timeout: 30000
      }
    );

    return;
  }

  skipUnlessEmailVerificationReady();

  const email =
    generateEmail(
      scenario
    );

  const mobileNumber =
    generateMobileNumber();

  console.log(
    `${scenario} Email:`,
    email
  );

  console.log(
    `${scenario} Mobile:`,
    mobileNumber
  );

  const registration =
    new RegistrationPage(
      page
    );

  await registration.open();

  await registration.register(
    email,
    mobileNumber
  );

  await waitForManualEmailVerification(
    page,
    email
  );

  const login =
    new LoginPage(
      page
    );

  await login.login(
    email,
    TEST_USERS.onboarding.password
  );

  await new MobileVerificationPage(
    page
  ).completeIfVisible(
    mobileNumber
  );

  await expect(
    page
  ).toHaveURL(
    /onboarding/,
    {
      timeout: 30000
    }
  );
}

test.describe(
  'Onboarding Field Validation',
  () => {

    test.describe.configure({
      timeout: 20 * 60 * 1000
    });

    test(
      'Fast Risk and Compliance field validation',
      async ({ page }) => {
        await registerAndLoginFreshUser(
          page,
          'fast-risk-compliance-validation'
        );

        const risk =
          new RiskProfilePage(
            page
          );

        await risk.validateRequiredFieldsBlockSave();

        await risk.validateMissingExperienceBlocksSave();

        await risk.selectInvestingExperience();

        await risk.saveRiskProfile();

        await expect(
          page.getByText(
            /read disclosure/i
          ).first()
        ).toBeVisible({
          timeout: 15000
        });

        const compliance =
          new CompliancePage(
            page
          );

        await compliance.validateRequiredFieldsBlockSave();

        await compliance.validateDisclosureRequiredBlocksSave();

        await compliance.acceptAllDisclosures();

        await compliance.saveCompliance();

        await expect(
          page.getByText(
            /choose your plan|select a plan|get started/i
          ).first()
        ).toBeVisible({
          timeout: 30000
        });
      }
    );

    if (
      envEnabled(
        'ONBOARDING_FIELD_VALIDATION_FULL_ENABLED'
      )
    ) {
      test(
        'Full Risk and Compliance field validation in one session',
        async ({ page }) => {
          await registerAndLoginFreshUser(
            page,
            'full-risk-compliance-validation'
          );

          const risk =
            new RiskProfilePage(
              page
            );

          await test.step(
            'Risk required and missing fields block save',
            async () => {
              await risk.validateRequiredFieldsBlockSave();
              await risk.validateMissingExperienceBlocksSave();
              await risk.validateMissingStrategyBlocksSave();
              await risk.validateMissingAccountTypeBlocksSave();
            }
          );

          await test.step(
            'Risk selections can be updated then saved',
            async () => {
              await risk.validateSelectionsCanBeUpdatedBeforeSave();
            }
          );

          await test.step(
            'Risk progress persists after refresh',
            async () => {
              await page.reload({
                waitUntil: 'domcontentloaded'
              });

              await expect(
                page.getByText(
                  /read disclosure|disclosure|compliance|choose your plan|select a plan/i
                ).first()
              ).toBeVisible({
                timeout: 15000
              });
            }
          );

          const compliance =
            new CompliancePage(
              page
            );

          await test.step(
            'Compliance required fields and disclosures block save',
            async () => {
              await compliance.validateRequiredFieldsBlockSave();
              await compliance.validateDisclosureRequiredBlocksSave();
              await compliance.validateEachDisclosureRequired();
              await compliance.validateDisclosureCancelDoesNotAccept();
              await compliance.validateStateRequiredBlocksSave();
            }
          );

          await test.step(
            'Compliance selections can be updated then saved',
            async () => {
              await compliance.validateSelectionsCanBeUpdatedBeforeSave();
            }
          );

          await test.step(
            'Compliance progress persists after refresh',
            async () => {
              await page.reload({
                waitUntil: 'domcontentloaded'
              });

              await expect(
                page.getByText(
                  /choose your plan|select a plan|get started/i
                ).first()
              ).toBeVisible({
                timeout: 30000
              });
            }
          );
        }
      );
    }
  }
);
