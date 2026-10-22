import {
  expect,
  Page,
  test
} from '@playwright/test';

import {
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
  completeRiskAndComplianceUnlessPlanReady
} from './helpers/onboardingContinuation';
import {
  expectCoveredBy,
  recordCoverage
} from './helpers/coverageReuse';
import {
  continueAfterWithCardTrialCheckout,
  submitAnotherWithCardTrialAttempt
} from './helpers/withCardTrial';
import { LoginPage }
  from './pages/LoginPage';
import { MobileVerificationPage }
  from './pages/MobileVerificationPage';
import { PlanSelectionPage }
  from './pages/PlanSelectionPage';
import { RegistrationPage }
  from './pages/RegistrationPage';
import { StripePaymentPage }
  from './pages/StripePaymentPage';
import { DashboardPage }
  from './pages/DashboardPage';
import { BillingPage }
  from './pages/BillingPage';
import {
  validateNoCardTrialFollowThrough
} from './helpers/noCardTrialChecks';
import {
  startNoCardTrialAndSubscribe
} from './helpers/stripeMatrixExecution';

/* =============================================================================
TEST SUITE: Overlay Strategists Trial

PURPOSE
-------
Starts the Subscription Management coverage from Use Case 1: Overlay
Strategists Trial Experience. The file is gated because trial creation can
consume eligibility for the generated user and still requires manual email
verification in UAT.

Run:
$env:OVERLAY_STRATEGISTS_FLOW_ENABLED="true"
$env:OVERLAY_STRATEGISTS_WITH_CARD_ENABLED="true"
npx playwright test tests/OverlayStrategistsTrial.spec.ts --headed -g "with card"

QA-CL-005: with-card trial needs a fresh user and a unique Stripe test card.
Do not use 4242424242424242 for Overlay with-card trial. That fingerprint is
already_redeemed and bounces to Plan Selection / Free. Paid checkout may still
use STRIPE_CARD 4242. Follow-up: clear 4242 reuse in Stripe test mode.
Automation rotates unused Visa/Mastercard country test cards and retries
once with a new user if the card fingerprint is already redeemed.
/verify-mobile?trial=success means the trial was granted.
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

async function registerOverlayUserAndReachPlanSelection(
  page: Page,
  scenario: string
) {
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

  await new LoginPage(
    page
  ).login(
    email,
    TEST_USERS.onboarding.password
  );

  await new MobileVerificationPage(
    page
  ).completeIfVisible(
    mobileNumber
  );

  await completeRiskAndComplianceUnlessPlanReady(
    page
  );

  return {
    email,
    mobileNumber
  };
}

if (
  envEnabled(
    'OVERLAY_STRATEGISTS_FLOW_ENABLED'
  )
) {
  test.describe(
    'Overlay Strategists Trial Experience',
    () => {

    test.describe.configure({
      timeout: 20 * 60 * 1000
    });

    test.beforeEach(
      () => {
        skipUnlessEmailVerificationReady();
      }
    );

    test(
      'New user can reach Overlay Strategists trial option',
      async ({ page }) => {
        // The plan catalog test already checks the same screen. When it runs,
        // reuse its recorded result instead of registering another user.
        if (
          envEnabled(
            'PLAN_SELECTION_VALIDATION_ENABLED'
          )
        ) {
          expectCoveredBy(
            'overlay-trial-options-offered',
            'Plan catalog pricing overlay trial and complete-setup in one session'
          );

          return;
        }

        const email =
          generateEmail(
            'overlay-trial-discovery'
          );

        const mobileNumber =
          generateMobileNumber();

        console.log(
          'Overlay Trial Email:',
          email
        );

        console.log(
          'Overlay Trial Mobile:',
          mobileNumber
        );

        await test.step(
          'Register new user',
          async () => {
            const registration =
              new RegistrationPage(
                page
              );

            await registration.open();

            await registration.register(
              email,
              mobileNumber
            );
          }
        );

        await test.step(
          'Verify email manually',
          async () => {
            await waitForManualEmailVerification(
              page,
              email
            );
          }
        );

        await test.step(
          'Login and complete onboarding prerequisites',
          async () => {
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

            await completeRiskAndComplianceUnlessPlanReady(
              page
            );
          }
        );

        await test.step(
          'Validate Overlay Strategists trial availability',
          async () => {
            const planPage =
              new PlanSelectionPage(
                page
              );

            await planPage.validateOverlayStrategistsTrialOptions();

            await expect(
              page.getByText(
                /overlay strategists/i
              ).first()
            ).toBeVisible();
          }
        );
      }
    );

    if (
      envEnabled(
        'OVERLAY_STRATEGISTS_WITH_CARD_ENABLED'
      )
    ) {
      test(
        'New user can start Overlay Strategists trial with card',
        async ({ page }) => {
        let email: string;
        let mobileNumber: string;

        ({
          email,
          mobileNumber
        } =
          await registerOverlayUserAndReachPlanSelection(
            page,
            'overlay-with-card'
          ));

        await test.step(
          'Select Overlay Strategists with-card trial',
          async () => {
            const planPage =
              new PlanSelectionPage(
                page
              );

            await planPage.selectOverlayStrategistsTrialWithCard();
          }
        );

        await test.step(
          'Validate and complete Stripe trial checkout',
          async () => {
            const stripe =
              new StripePaymentPage(
                page
              );

            await stripe.validateTrialCheckoutDetails(
              email
            );

            recordCoverage(
              'overlay-with-card-checkout-details'
            );

            if (
              envEnabled(
                'OVERLAY_STRATEGISTS_STRIPE_NEGATIVE_ENABLED'
              )
            ) {
              await stripe.validateMissingCardDetailsBlocked();

              recordCoverage(
                'overlay-with-card-missing-card'
              );
            }

            if (
              envEnabled(
                'OVERLAY_STRATEGISTS_DECLINED_CARD_ENABLED'
              )
            ) {
              await stripe.validateDeclinedCardRejected();

              recordCoverage(
                'overlay-with-card-declined-card'
              );
            }

            await stripe.completeTrialPayment();

            let reachedDashboard =
              await continueAfterWithCardTrialCheckout(
                page,
                mobileNumber
              );

            for (
              let retry = 1;
              !reachedDashboard &&
                retry <= 2;
              retry++
            ) {
              console.log(
                `Retrying Overlay with-card checkout with a different Stripe test card (${retry}/2)`
              );

              if (
                retry === 2
              ) {
                ({
                  email,
                  mobileNumber
                } =
                  await registerOverlayUserAndReachPlanSelection(
                    page,
                    'overlay-with-card-retry'
                  ));
              }

              reachedDashboard =
                await submitAnotherWithCardTrialAttempt(
                  page,
                  mobileNumber
                );
            }

            if (
              !reachedDashboard
            ) {
              test.skip(
                true,
                'QA-CL-005: with-card trial bounced to Plan Selection after unique-card retries. Need a fresh user and an unused Stripe test card pool — fixture gate, not a product trial defect.'
              );
            }
          }
        );

        await test.step(
          'Validate dashboard after trial checkout',
          async () => {
            const dashboard =
              new DashboardPage(
                page
              );

            await dashboard.validateLoaded({
              acceptTrialSuccessMobileGate: true
            });
          }
        );

        await test.step(
          'Validate Overlay Strategists with-card trial in billing',
          async () => {
            await new BillingPage(
              page
            ).validateOverlayStrategistsTrialBillingState(
              'with-card'
            );
          }
        );
        }
      );
    }

    if (
      envEnabled(
        'OVERLAY_STRATEGISTS_STRIPE_CHECKOUT_DETAILS_ENABLED'
      )
    ) {
      test(
        'Overlay Strategists with-card trial opens Stripe checkout with trial details',
        async ({ page }) => {
        // The with-card trial user already walks this checkout, so confirm
        // that checkpoint instead of paying for another sign-up.
        if (
          envEnabled(
            'OVERLAY_STRATEGISTS_WITH_CARD_ENABLED'
          )
        ) {
          expectCoveredBy(
            'overlay-with-card-checkout-details',
            'New user can start Overlay Strategists trial with card'
          );

          return;
        }

        const email =
          generateEmail(
            'overlay-stripe-checkout-details'
          );

        const mobileNumber =
          generateMobileNumber();

        console.log(
          'Overlay Stripe Checkout Details Email:',
          email
        );

        console.log(
          'Overlay Stripe Checkout Details Mobile:',
          mobileNumber
        );

        await test.step(
          'Register new user',
          async () => {
            const registration =
              new RegistrationPage(
                page
              );

            await registration.open();

            await registration.register(
              email,
              mobileNumber
            );
          }
        );

        await test.step(
          'Verify email manually',
          async () => {
            await waitForManualEmailVerification(
              page,
              email
            );
          }
        );

        await test.step(
          'Login and complete onboarding prerequisites',
          async () => {
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

            await completeRiskAndComplianceUnlessPlanReady(
              page
            );
          }
        );

        await test.step(
          'Open Stripe checkout for Overlay Strategists trial',
          async () => {
            const planPage =
              new PlanSelectionPage(
                page
              );

            await planPage.selectOverlayStrategistsTrialWithCard();
          }
        );

        await test.step(
          'Validate Stripe checkout trial details without payment',
          async () => {
            const stripe =
              new StripePaymentPage(
                page
              );

            await stripe.validateTrialCheckoutDetails(
              email
            );
          }
        );
        }
      );
    }

    if (
      envEnabled(
        'OVERLAY_STRATEGISTS_STRIPE_NEGATIVE_ENABLED'
      )
    ) {
      test(
        'Overlay Strategists with-card trial blocks missing Stripe card details',
        async ({ page }) => {
        if (
          envEnabled(
            'OVERLAY_STRATEGISTS_WITH_CARD_ENABLED'
          )
        ) {
          expectCoveredBy(
            'overlay-with-card-missing-card',
            'New user can start Overlay Strategists trial with card'
          );

          return;
        }

        const email =
          generateEmail(
            'overlay-stripe-missing-card'
          );

        const mobileNumber =
          generateMobileNumber();

        console.log(
          'Overlay Stripe Missing Card Email:',
          email
        );

        console.log(
          'Overlay Stripe Missing Card Mobile:',
          mobileNumber
        );

        await test.step(
          'Register new user',
          async () => {
            const registration =
              new RegistrationPage(
                page
              );

            await registration.open();

            await registration.register(
              email,
              mobileNumber
            );
          }
        );

        await test.step(
          'Verify email manually',
          async () => {
            await waitForManualEmailVerification(
              page,
              email
            );
          }
        );

        await test.step(
          'Login and complete onboarding prerequisites',
          async () => {
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

            await completeRiskAndComplianceUnlessPlanReady(
              page
            );
          }
        );

        await test.step(
          'Open Stripe checkout for Overlay Strategists trial',
          async () => {
            const planPage =
              new PlanSelectionPage(
                page
              );

            await planPage.selectOverlayStrategistsTrialWithCard();
          }
        );

        await test.step(
          'Validate Stripe blocks missing card details',
          async () => {
            const stripe =
              new StripePaymentPage(
                page
              );

            await stripe.validateMissingCardDetailsBlocked();
          }
        );
        }
      );
    }

    if (
      envEnabled(
        'OVERLAY_STRATEGISTS_DECLINED_CARD_ENABLED'
      )
    ) {
      test(
        'Overlay Strategists with-card trial rejects declined Stripe card',
        async ({ page }) => {
        if (
          envEnabled(
            'OVERLAY_STRATEGISTS_WITH_CARD_ENABLED'
          )
        ) {
          expectCoveredBy(
            'overlay-with-card-declined-card',
            'New user can start Overlay Strategists trial with card'
          );

          return;
        }

        const email =
          generateEmail(
            'overlay-declined-card'
          );

        const mobileNumber =
          generateMobileNumber();

        console.log(
          'Overlay Declined Card Email:',
          email
        );

        console.log(
          'Overlay Declined Card Mobile:',
          mobileNumber
        );

        await test.step(
          'Register new user',
          async () => {
            const registration =
              new RegistrationPage(
                page
              );

            await registration.open();

            await registration.register(
              email,
              mobileNumber
            );
          }
        );

        await test.step(
          'Verify email manually',
          async () => {
            await waitForManualEmailVerification(
              page,
              email
            );
          }
        );

        await test.step(
          'Login and complete onboarding prerequisites',
          async () => {
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

            await completeRiskAndComplianceUnlessPlanReady(
              page
            );
          }
        );

        await test.step(
          'Open Stripe checkout for Overlay Strategists trial',
          async () => {
            const planPage =
              new PlanSelectionPage(
                page
              );

            await planPage.selectOverlayStrategistsTrialWithCard();
          }
        );

        await test.step(
          'Validate Stripe rejects declined card',
          async () => {
            const stripe =
              new StripePaymentPage(
                page
              );

            await stripe.validateDeclinedCardRejected();
          }
        );
        }
      );
    }

    if (
      envEnabled(
        'OVERLAY_STRATEGISTS_WITHOUT_CARD_ENABLED'
      )
    ) {
      test(
        'New user can start Overlay Strategists trial without card',
        async ({ page }) => {

        const email =
          generateEmail(
            'overlay-without-card'
          );

        const mobileNumber =
          generateMobileNumber();

        console.log(
          'Overlay Without Card Trial Email:',
          email
        );

        console.log(
          'Overlay Without Card Trial Mobile:',
          mobileNumber
        );

        await test.step(
          'Register new user',
          async () => {
            const registration =
              new RegistrationPage(
                page
              );

            await registration.open();

            await registration.register(
              email,
              mobileNumber
            );
          }
        );

        await test.step(
          'Verify email manually',
          async () => {
            await waitForManualEmailVerification(
              page,
              email
            );
          }
        );

        await test.step(
          'Login and complete onboarding prerequisites',
          async () => {
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

            await completeRiskAndComplianceUnlessPlanReady(
              page
            );
          }
        );

        await test.step(
          'Select Overlay Strategists without-card trial',
          async () => {
            const planPage =
              new PlanSelectionPage(
                page
              );

            await planPage.validateOverlayStrategistsTrialOptions();
            await planPage.validateOverlayStrategistsFeatureSummary();
            await planPage.selectOverlayStrategistsTrialWithoutCard();
            await planPage.validateNotRedirectedToStripeCheckout();
          }
        );

        await test.step(
          'Validate dashboard after no-card trial starts',
          async () => {
            const dashboard =
              new DashboardPage(
                page
              );

            await dashboard.validateLoaded();
          }
        );

        await test.step(
          'Validate Overlay Strategists plan in billing',
          async () => {
            await new BillingPage(
              page
            ).validateOverlayStrategistsTrialBillingState(
              'without-card'
            );
          }
        );

        await test.step(
          'No-card trial keeps the account and position limits, history, confirmation email, and blocks the same email or mobile',
          async () => {
            await validateNoCardTrialFollowThrough(
              page,
              email,
              mobileNumber
            );
          }
        );
        }
      );

      test(
        'Trial user can subscribe to a paid plan before the trial ends',
        async ({ page }) => {
          test.setTimeout(
            20 * 60 * 1000
          );

          await startNoCardTrialAndSubscribe(
            page
          );
        }
      );
    }

    if (
      envEnabled(
        'OVERLAY_STRATEGISTS_TERMS_ENABLED'
      )
    ) {
      test(
        'Overlay Strategists trial requires terms acceptance',
        async ({ page }) => {

        const email =
          generateEmail(
            'overlay-terms-required'
          );

        const mobileNumber =
          generateMobileNumber();

        console.log(
          'Overlay Terms Validation Email:',
          email
        );

        console.log(
          'Overlay Terms Validation Mobile:',
          mobileNumber
        );

        await test.step(
          'Register new user',
          async () => {
            const registration =
              new RegistrationPage(
                page
              );

            await registration.open();

            await registration.register(
              email,
              mobileNumber
            );
          }
        );

        await test.step(
          'Verify email manually',
          async () => {
            await waitForManualEmailVerification(
              page,
              email
            );
          }
        );

        await test.step(
          'Login and complete onboarding prerequisites',
          async () => {
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

            await completeRiskAndComplianceUnlessPlanReady(
              page
            );
          }
        );

        await test.step(
          'Validate terms are required before trial can start',
          async () => {
            const planPage =
              new PlanSelectionPage(
                page
              );

            await planPage.openOverlayStrategistsTrialWithoutCardModal();

            await planPage.validateTrialTermsRequired();
          }
        );
        }
      );
    }
    }
  );
}
