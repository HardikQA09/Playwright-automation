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
import {
  recordCoverage
} from './helpers/coverageReuse';
import { CompliancePage }
  from './pages/CompliancePage';
import { DashboardPage }
  from './pages/DashboardPage';
import { LoginPage }
  from './pages/LoginPage';
import { MobileVerificationPage }
  from './pages/MobileVerificationPage';
import { PlanSelectionPage }
  from './pages/PlanSelectionPage';
import { RegistrationPage }
  from './pages/RegistrationPage';
import { RiskProfilePage }
  from './pages/RiskProfilePage';

/* =============================================================================
TEST SUITE: Plan Selection Validation

PURPOSE
-------
Validates onboarding plan-selection UI behavior without starting Stripe checkout
or consuming a trial. Stripe payment/lifecycle scenarios remain separate.

RUN
---
$env:PLAN_SELECTION_VALIDATION_ENABLED="true"
npx playwright test tests/PlanSelectionValidation.spec.ts --headed

Use PLAN_SELECTION_EXISTING_EMAIL/PASSWORD for a prepared user already on the
onboarding plan-selection step when registration SMS is throttled.
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

function getExistingPlanSelectionUser() {
  const email =
    process.env.PLAN_SELECTION_EXISTING_EMAIL;

  const password =
    process.env.PLAN_SELECTION_EXISTING_PASSWORD;

  const mobile =
    process.env.PLAN_SELECTION_EXISTING_MOBILE;

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

const planSelectionValidationEnabled =
  envEnabled(
    'PLAN_SELECTION_VALIDATION_ENABLED'
  );

const planSelectionHasPreparedUser =
  Boolean(
    getExistingPlanSelectionUser()
  );

const planSelectionReadOnlyEnabled =
  planSelectionValidationEnabled ||
  planSelectionHasPreparedUser;

const planSelectionFreeActivationEnabled =
  envEnabled(
    'PLAN_SELECTION_FREE_ACTIVATION_ENABLED'
  );

async function openPlanSelection(
  page: Page,
  scenario: string,
  options: {
    useExistingUser?: boolean;
  } = {}
) {
  const existingUser =
    options.useExistingUser === false
      ? undefined
      : getExistingPlanSelectionUser();

  if (existingUser) {
    console.log(
      `${scenario} Existing plan-selection email:`,
      existingUser.email
    );

    const login =
      new LoginPage(
        page
      );

    let preparedReady = false;

    try {
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

      const planSelectionHeading =
        page.getByText(
          /choose your plan|select a plan|get started/i
        ).first();

      preparedReady =
        await planSelectionHeading.isVisible({
          timeout: 10000
        }).catch(
          () => false
        );

      if (
        !preparedReady
      ) {
        console.warn(
          `${scenario}: prepared user ${existingUser.email} is not on Choose Your Plan (URL: ${page.url()}). Falling back to a fresh disposable user.`
        );
      }
    } catch (error) {
      console.warn(
        `${scenario}: prepared plan-selection login failed (${error instanceof Error ? error.message : String(error)}). Falling back to a fresh disposable user.`
      );
    }

    if (
      preparedReady
    ) {
      return;
    }

    await page.context().clearCookies();
    await page.goto('about:blank').catch(() => undefined);
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

  await new RiskProfilePage(
    page
  ).fill();

  await new CompliancePage(
    page
  ).fill();

  await expect(
    page.getByText(
      /choose your plan|select a plan|get started/i
    ).first()
  ).toBeVisible({
    timeout: 30000
  });
}

if (
  planSelectionReadOnlyEnabled ||
  planSelectionFreeActivationEnabled
) {
  test.describe(
    'Plan Selection Validation',
    () => {

    test.describe.configure({
      timeout: 20 * 60 * 1000
    });

    if (planSelectionReadOnlyEnabled) {
      test(
        'Plan catalog pricing overlay trial and complete-setup in one session',
        async ({ page }) => {
          await openPlanSelection(
            page,
            'plan-selection-read-only'
          );

          const planPage =
            new PlanSelectionPage(
              page
            );

          await test.step(
            'Catalog and billing toggle',
            async () => {
              await planPage.validatePlanCatalog();
              await planPage.validateBillingToggle();
            }
          );

          await test.step(
            'Paid plan prices across billing periods',
            async () => {
              await planPage.validatePaidPlanPricingAcrossBillingPeriods();
            }
          );

          await test.step(
            'Complete Setup requires a plan',
            async () => {
              await planPage.validateCompleteSetupRequiresPlanSelection();
            }
          );

          await test.step(
            'Overlay Strategists feature summary',
            async () => {
              await planPage.validateOverlayStrategistsFeatureSummary();
            }
          );

          await test.step(
            'Overlay Strategists trial options are offered',
            async () => {
              await planPage.validateOverlayStrategistsTrialOptions();

              await expect(
                page.getByText(
                  /overlay strategists/i
                ).first()
              ).toBeVisible();

              // Reused by the Overlay Strategists trial discovery row.
              recordCoverage(
                'overlay-trial-options-offered'
              );
            }
          );

          await test.step(
            'Paid plan entitlement limits',
            async () => {
              await planPage.validatePaidPlanEntitlementSummaries();
            }
          );

          await test.step(
            'Switch plans without checkout',
            async () => {
              await planPage.validatePlanSelectionCanSwitchWithoutCheckout();
            }
          );

          await test.step(
            'With-card trial modal',
            async () => {
              await planPage.openOverlayStrategistsTrialWithCardModal();

              await planPage.validateOverlayStrategistsTrialModalContent(
                'with-card'
              );

              await planPage.cancelTrialModal();

              await planPage.validatePlanVisible(
                'Overlay Strategists'
              );
            }
          );

          await test.step(
            'Without-card trial modal',
            async () => {
              await planPage.openOverlayStrategistsTrialWithoutCardModal();

              await planPage.validateOverlayStrategistsTrialModalContent(
                'without-card'
              );

              await planPage.closeTrialModal();

              await planPage.validatePlanVisible(
                'Overlay Strategists'
              );
            }
          );

          await test.step(
            'Trial start requires terms',
            async () => {
              await planPage.openOverlayStrategistsTrialWithoutCardModal();

              await planPage.validateTrialTermsRequired();
            }
          );
        }
      );
    }

    if (planSelectionFreeActivationEnabled) {
      test(
        'Curious Explorer free plan completes onboarding without Stripe',
        async ({ page }) => {
        const hasPreparedUser =
          Boolean(
            getExistingPlanSelectionUser()
          );

        await openPlanSelection(
          page,
          'plan-free-activation',
          {
            useExistingUser:
              hasPreparedUser
          }
        );

        const planPage =
          new PlanSelectionPage(
            page
          );

        await planPage.selectPlan(
          'Curious Explorer'
        );

        await expect(
          page
        ).not.toHaveURL(
          /checkout\.stripe\.com/
        );

        await new DashboardPage(
          page
        ).validateLoaded();
        }
      );
    }
    }
  );
}
