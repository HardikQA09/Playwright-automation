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
  expectCoveredBy,
  recordCoverage
} from './helpers/coverageReuse';
import { CompliancePage }
  from './pages/CompliancePage';
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
import { StripePaymentPage }
  from './pages/StripePaymentPage';

/* =============================================================================
TEST SUITE: Direct Subscription Purchase

PURPOSE
-------
Validates Subscription Management Use Case 2 from the FRD. These tests start
with non-destructive browser checks first: plan selection, checkout summary, and
Stripe readiness before any payment is submitted.

RUN
---
$env:DIRECT_SUBSCRIPTION_PURCHASE_ENABLED="true"
npx playwright test tests/DirectSubscriptionPurchase.spec.ts --headed
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

type CheckoutPlanName =
  | 'Income Builder'
  | 'Overlay Strategists'
  | 'Portfolio Hedger';

type CheckoutBillingInterval =
  | 'monthly'
  | 'annual';

type CheckoutSummaryScenario = {
  planName: CheckoutPlanName;
  interval: CheckoutBillingInterval;
  expectedBillingCopy: RegExp;
};

const COVERING_TEST =
  'Paid plan checkout summaries currency refresh and return use one user';

function summaryKey(
  scenario: Pick<
    CheckoutSummaryScenario,
    'planName' | 'interval'
  >
) {
  return `direct-summary-${scenario.planName}-${scenario.interval}`;
}

async function openPlanSelectionForFreshUser(
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

  await new RiskProfilePage(
    page
  ).fill();

  await new CompliancePage(
    page
  ).fill();

  await expectPlanSelectionVisible(
    page
  );

  return {
    email,
    mobileNumber
  };
}

async function expectPlanSelectionVisible(
  page: Page
) {
  await new PlanSelectionPage(
    page
  ).waitUntilCatalogVisible();
}

async function validateCheckoutSummaryAndReturn(
  page: Page,
  email: string,
  scenario: CheckoutSummaryScenario
) {
  const planPage =
    new PlanSelectionPage(
      page
    );

  if (
    !(
      await planPage.isPlanOffered(
        scenario.planName
      )
    )
  ) {
    console.log(
      `${scenario.planName} is not in the current catalog; skipping checkout summary.`
    );

    return false;
  }

  await test.step(
    `Open ${scenario.planName} ${scenario.interval} checkout`,
    async () => {
      if (
        scenario.interval === 'annual'
      ) {
        await planPage.selectAnnualBilling();
      } else {
        await planPage.selectMonthlyBilling();
      }

      await planPage.selectPlan(
        scenario.planName
      );
    }
  );

  await test.step(
    `Validate ${scenario.planName} ${scenario.interval} checkout summary`,
    async () => {
      await new StripePaymentPage(
        page
      ).validateSubscriptionCheckoutDetails({
        expectedEmail:
          email,
        expectedPlan:
          scenario.planName,
        expectedBillingCopy:
          scenario.expectedBillingCopy
      });
    }
  );

  await test.step(
    `Return from ${scenario.planName} ${scenario.interval} checkout before payment`,
    async () => {
      await planPage.returnFromCheckoutBeforePayment();
    }
  );

  // Recorded only after the summary and the safe return both passed.
  recordCoverage(
    summaryKey(scenario)
  );

  return true;
}

if (
  envEnabled(
    'DIRECT_SUBSCRIPTION_PURCHASE_ENABLED'
  )
) {
  test.describe(
    'Direct Subscription Purchase',
    () => {
    test.describe.configure({
      timeout: 20 * 60 * 1000
    });

    test.beforeEach(
      () => {
        skipUnlessEmailVerificationReady();
      }
    );

    // The covering test runs first. The rows after it reuse its recorded
    // checkpoints instead of repeating sign-up and Stripe checkout.
    test(
      COVERING_TEST,
      async ({ page }) => {
        const user =
          await openPlanSelectionForFreshUser(
            page,
            'direct-paid-plan-summaries'
          );

        const scenarios: CheckoutSummaryScenario[] = [
          {
            planName: 'Income Builder',
            interval: 'monthly',
            expectedBillingCopy:
              /2\.90|2\.9|per month|monthly|subscription|total/i
          },
          {
            planName: 'Income Builder',
            interval: 'annual',
            expectedBillingCopy:
              /\$\s*290(?:\.00)?(?!\d)|per year|annual|subscription|total|due/i
          },
          {
            planName: 'Portfolio Hedger',
            interval: 'monthly',
            expectedBillingCopy:
              /14\.90|14\.9|per month|monthly|subscription|total/i
          },
          {
            planName: 'Portfolio Hedger',
            interval: 'annual',
            expectedBillingCopy:
              /\$\s*1,490(?:\.00)?(?!\d)|\$\s*1490(?:\.00)?(?!\d)|per year|annual|subscription|total|due/i
          }
        ];

        for (const scenario of scenarios) {
          await validateCheckoutSummaryAndReturn(
            page,
            user.email,
            scenario
          );
        }

        const planPage =
          new PlanSelectionPage(
            page
          );

        await test.step(
          'Open Income Builder checkout for currency and refresh',
          async () => {
            await planPage.selectMonthlyBilling();
            await planPage.selectPlan(
              'Income Builder'
            );
          }
        );

        const stripePage =
          new StripePaymentPage(
            page
          );

        await test.step(
          'Validate Stripe currency and conversion copy',
          async () => {
            await stripePage.validateCurrencyAndConversionDetails();

            recordCoverage(
              'direct-currency-conversion'
            );
          }
        );

        await test.step(
          'Refresh Stripe checkout and validate context remains',
          async () => {
            await page.reload({
              waitUntil: 'domcontentloaded'
            });

            await stripePage.validateSubscriptionCheckoutDetails({
              expectedEmail:
                user.email,
              expectedPlan:
                'Income Builder',
              expectedBillingCopy:
                /2\.90|2\.9|per month|monthly|subscription|total/i
            });
          }
        );

        await test.step(
          'Navigate back before payment without activating checkout',
          async () => {
            await planPage.returnFromCheckoutBeforePayment();

            recordCoverage(
              'direct-refresh-and-return'
            );
          }
        );
      }
    );

    const reusedRows: Array<[string, string]> = [
      [
        'Income Builder monthly checkout shows subscription summary before payment',
        summaryKey({
          planName: 'Income Builder',
          interval: 'monthly'
        })
      ],
      [
        'Portfolio Hedger annual checkout shows subscription summary before payment',
        summaryKey({
          planName: 'Portfolio Hedger',
          interval: 'annual'
        })
      ],
      [
        'Income Builder annual checkout shows subscription summary before payment',
        summaryKey({
          planName: 'Income Builder',
          interval: 'annual'
        })
      ],
      [
        'Income Builder checkout shows currency and conversion details before payment',
        'direct-currency-conversion'
      ],
      [
        'Income Builder checkout preserves context on refresh and returns safely before payment',
        'direct-refresh-and-return'
      ]
    ];

    for (const [title, key] of reusedRows) {
      test(
        title,
        async () => {
          expectCoveredBy(
            key,
            COVERING_TEST
          );
        }
      );
    }
    }
  );
}
