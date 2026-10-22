import {
  TEST_USERS
} from './config/testData';

import { test }
  from './fixtures/subscriberAuth';

import { BillingPage }
  from './pages/BillingPage';

import { LoginPage }
  from './pages/LoginPage';

/* =============================================================================
TEST SUITE: Billing Subscription Management

PURPOSE
-------
One authenticated session opens the Stripe customer portal once and
validates overview, invoices, and return. Mutating-adjacent screens stay
opt-in and do not submit cancellation.

RUN
---
npx playwright test tests/BillingSubscriptionManagement.spec.ts --headed
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

const billingUser = {
  email:
    process.env.BILLING_MANAGEMENT_EMAIL ??
    TEST_USERS.subscriber.email,

  password:
    process.env.BILLING_MANAGEMENT_PASSWORD ??
    TEST_USERS.subscriber.password
};

const usesSharedSubscriber =
  billingUser.email ===
  TEST_USERS.subscriber.email;

test.describe(
  'Billing Subscription Management',
  () => {

    test.describe.configure({
      timeout: 5 * 60 * 1000
    });

    test(
      'Billing portal plans invoices and return in one session',
      async ({ page }) => {
        if (
          !usesSharedSubscriber
        ) {
          // Shared subscriberAuth cookies would keep plantest on /dashboard.
          await page.context().clearCookies();
          await page.goto('about:blank').catch(() => undefined);
          await new LoginPage(
            page
          ).login(
            billingUser.email,
            billingUser.password
          );
        }

        const billing =
          new BillingPage(
            page
          );

        if (
          !await billing.hasActivePaidSubscriptionManagement()
        ) {
          test.skip(
            true,
            'The configured billing account has no active paid subscription. Stripe portal, invoices, cancellation, and payment-method checks require BILLING_MANAGEMENT_EMAIL/PASSWORD for an active paid subscriber.'
          );
        }

        await test.step(
          'Paid subscriber is not offered Overlay Strategists trial CTA',
          async () => {
            await billing.validatePaidSubscriberTrialCtaIsNotOffered();
          }
        );

        await test.step(
          'Stripe portal overview invoices and return in one visit',
          async () => {
            await billing.validateStripePortalSession({
              restore: !envEnabled(
                'BILLING_SUBSCRIPTION_MANAGEMENT_ENABLED'
              )
            });
          }
        );

        if (
          !envEnabled(
            'BILLING_SUBSCRIPTION_MANAGEMENT_ENABLED'
          )
        ) {
          return;
        }

        await test.step(
          'Add payment method opens without saving',
          async () => {
            await billing.validateAddPaymentMethodOpensWithoutSaving();
          }
        );

        await test.step(
          'Payment recovery entry points',
          async () => {
            await billing.validatePaymentRecoveryEntryPointsSummary();
          }
        );

        await test.step(
          'Billing information update opens without saving',
          async () => {
            await billing.validateBillingInformationUpdateOpensWithoutSaving();
          }
        );

        await test.step(
          'Cancel form accepts reason without cancelling',
          async () => {
            await billing.validateCancelSubscriptionFormWithoutCancelling();
          }
        );

        await test.step(
          'Cancellation lifecycle is readable without cancelling',
          async () => {
            await billing.validateSubscriptionPortalCancellationLifecycleSummary();
          }
        );

        await test.step(
          'Return from Stripe portal to the application',
          async () => {
            await billing.leaveStripePortal();
          }
        );
      }
    );
  }
);
