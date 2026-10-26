import {
  Browser,
  expect,
  Page,
  test
} from '@playwright/test';

import {
  BASE_URL,
  CARDHOLDER_NAME,
  PLAN_PRICES,
  STRIPE_CVC,
  STRIPE_DECLINED_CARD,
  STRIPE_EXPIRY,
  STRIPE_INCOMPLETE_CARD,
  STRIPE_PROCESSING_ERROR_CARD,
  STRIPE_STOLEN_CARD,
  TEST_USERS
} from '../config/testData';
import {
  resolvePreparedUser
} from '../config/preparedSubscriptionUsers';
import {
  generateEmail,
  generateMobileNumber
} from '../utils/emailGenerator';
import {
  isEmailVerificationReady,
  waitForManualEmailVerification
} from './emailVerification';
import {
  completeRiskAndComplianceUnlessPlanReady
} from './onboardingContinuation';
import { BillingPage }
  from '../pages/BillingPage';
import { DashboardPage }
  from '../pages/DashboardPage';
import { LoginPage }
  from '../pages/LoginPage';
import { MobileVerificationPage }
  from '../pages/MobileVerificationPage';
import { PlanSelectionPage }
  from '../pages/PlanSelectionPage';
import { RegistrationPage }
  from '../pages/RegistrationPage';
import { StripePaymentPage }
  from '../pages/StripePaymentPage';
import {
  isScenarioCoverageKey,
  runScenarioStep
} from './subscriptionScenarioPacks';
import {
  runAirCheck
} from './airChecks';
import {
  validateNoCardTrialFollowThrough
} from './noCardTrialChecks';
import {
  continueAfterWithCardTrialCheckout,
  submitAnotherWithCardTrialAttempt
} from './withCardTrial';

/* =============================================================================
HELPER: Stripe matrix execution

PURPOSE
-------
Turns Stripe *Matrix.spec.ts automated rows into real UI checks. Unique
coverage keys run once per Playwright process (workers: 1). Sibling rows
reuse that result so AIR records them as passed instead of skip-only
"Covered by" traceability.

Blocked, future, known-bug, controlled, AIR-ingestion, and BlockedScenario
rows stay skipped. Destructive Stripe submits stay behind extra flags.
============================================================================= */

export type StripeMatrixScenario = {
  id: string;
  sourceIds?: string[];
  title: string;
  priority: string;
  status: string;
  automation?: string;
  dependency?: string;
  phase?: string;
};

export type StripeMatrixCoverageKey =
  | 'billing-inapp'
  | 'billing-portal'
  | 'plan-catalog'
  | 'direct-checkout'
  | 'overlay-without-card'
  | 'overlay-with-card-checkout'
  | 'upgrade-preview'
  | 'downgrade-preview'
  | 'interval-preview'
  | 'payment-negative'
  | 'checkout-decline'
  | 'checkout-stolen'
  | 'checkout-processing-error'
  | 'cancel-guard'
  | 'yearly-cancel-date'
  | 'upgrade-history'
  | 'trial-to-paid'
  | 'cancel-resume'
  | 'refund-preview'
  | 'trial-cancel'
  | 'trial-cancel-card'
  | 'downgrade-then-cancel'
  | 'monthly-to-annual'
  | 'annual-to-monthly'
  | 'paid-no-second-trial'
  | 'downgrade-targets'
  | 'current-plan-before-upgrade'
  | 'air-traceability'
  | 'blocked-scenario'
  | `air:${string}`
  | `scenario:${string}:${string}`;

type StaticCoverageKey = Exclude<
  StripeMatrixCoverageKey,
  | `scenario:${string}:${string}`
  | `air:${string}`
>;

type CoverageOutcome =
  | {
      status: 'passed';
    }
  | {
      status: 'skipped';
      reason: string;
    }
  | {
      status: 'failed';
      error: unknown;
    };

class CoverageSkip extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'CoverageSkip';
    this.reason = reason;
  }
}

const coverageCache =
  new Map<StripeMatrixCoverageKey, CoverageOutcome>();

const scenarioSetupSkipPacks =
  new Set<string>();

/** Same UAT/UI gap reported once; later matrix rows count as covered. */
const reportedUiGapKeys =
  new Set<string>();

function uiGapReuseKey(
  reason: string
) {
  const normalized =
    reason
      .replace(/\s+/g, ' ')
      .replace(
        /Visible controls:.*$/i,
        ''
      )
      .replace(
        /UAT\/UI gap during coverage\s*\(/i,
        ''
      )
      .trim()
      .toLowerCase()
      .slice(0, 160);

  if (
    /could not (find|open).*(upgrade|downgrade|interval)|offers no (upgrade|downgrade|interval) control|no monthly\/annual switch|has no monthly\/annual switch/i.test(
      normalized
    )
  ) {
    return `plan-action:${normalized}`;
  }

  if (
    /air self-validation/i.test(
      normalized
    )
  ) {
    return 'air-self-validation';
  }

  return '';
}

type PaidPlanName =
  keyof typeof PLAN_PRICES;

type BillingInterval =
  | 'monthly'
  | 'annual';

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

function requireFlag(
  name: string,
  extra = ''
): void {
  if (
    envEnabled(
      name
    )
  ) {
    return;
  }

  throw new CoverageSkip(
    `Enable ${name}=true to run this Stripe matrix coverage key.${extra ? ` ${extra}` : ''}`
  );
}

function requireAnyFlag(
  names: string[],
  extra = ''
) {
  if (
    names.some(
      (name) =>
        envEnabled(
          name
        )
    )
  ) {
    return;
  }

  throw new CoverageSkip(
    `Enable ${names.join(' or ')}=true to run this Stripe matrix coverage key.${extra ? ` ${extra}` : ''}`
  );
}

function billingCopy(
  interval: BillingInterval
) {
  return interval ===
    'monthly'
    ? /per month|monthly|\/mo|month|subscription|total|due|pay/i
    : /per year|annual|\/yr|\/year|year|subscription|total|due|pay/i;
}

function paidSubscriber() {
  const prepared =
    resolvePreparedUser(
      'UPGRADE_CALC_DAILY'
    );

  // Prepared/plantest wins. Env is only used when it is not a known-broken
  // paid-income / monthly-to-a / e2e address (complete-run-env also remaps these).
  const envEmail =
    process.env.BILLING_MANAGEMENT_EMAIL ??
    process.env.SUB_LIFECYCLE_PAID_EMAIL;

  const broken =
    /\+(?:paid-income-|monthly-to-a-|e2e@)/i.test(
      String(envEmail || '')
    );

  return {
    email:
      broken
        ? prepared.email
        : (
          envEmail ??
          prepared.email
        ),
    password:
      broken
        ? prepared.password
        : (
          process.env.BILLING_MANAGEMENT_PASSWORD ??
          process.env.SUB_LIFECYCLE_PAID_PASSWORD ??
          prepared.password
        )
  };
}

function isMissingPlanAction(
  error: unknown
) {
  const message =
    error instanceof Error
      ? error.message
      : String(
          error
        );

  return /Could not find (upgrade|downgrade|interval) control|Could not open (upgrade|downgrade|interval) preview|No (monthly|annual) upgrade or interval|opened a new-purchase dialog|Free\/no-card|no paid plan to preview/i.test(
    message
  );
}

function isPaidSubscriptionFixtureUnavailable(
  error: unknown
) {
  const message =
    error instanceof Error
      ? error.message
      : String(
          error
        );

  // Missing upgrade/downgrade/interval controls are plan-tier/UI gaps on a paid
  // account — not proof the BILLING_MANAGEMENT fixture is unpaid/Free.
  return /Manage subscription control was not found|Billing should show one current paid plan|configured billing fixture does not have an active paid subscription|not an active paid subscriber/i.test(
    message
  );
}

async function requireActivePaidSubscriptionFixture(
  billing: BillingPage,
  coverage: string
) {
  if (
    await billing.hasActivePaidSubscriptionManagement()
  ) {
    return;
  }

  throw new CoverageSkip(
    `The configured billing fixture does not have an active paid subscription, so ${coverage} cannot run. Set BILLING_MANAGEMENT_EMAIL/PASSWORD or SUB_LIFECYCLE_PAID_EMAIL/PASSWORD to an active paid Stripe subscriber.`
  );
}

export function inferStripeMatrixCoverageKey(
  automation?: string,
  title = ''
): StripeMatrixCoverageKey {
  const text =
    `${automation ?? ''} ${title}`.toLowerCase();
  const automationOnly =
    (
      automation ??
      ''
    ).trim()
      .toLowerCase();

  const scenarioMatch =
    (automation ?? '')
      .trim()
      .match(
        /^scenario:([A-Z0-9_]+):([a-z0-9-]+)$/
      );

  if (scenarioMatch) {
    return `scenario:${scenarioMatch[1]}:${scenarioMatch[2]}`;
  }

  const airMatch =
    (automation ?? '')
      .trim()
      .match(
        /^air:([a-z0-9-]+)$/
      );

  if (airMatch) {
    return `air:${airMatch[1]}`;
  }

  if (
    automationOnly.includes(
      'coveragegapengine'
    ) ||
    (
      /matrix\.spec\.ts$/.test(
        automationOnly
      ) &&
      !automationOnly.includes(
        '>'
      ) &&
      !automationOnly.includes(
        ' and '
      )
    )
  ) {
    return 'air-traceability';
  }

  if (
    automationOnly.includes(
      'blockedscenarioexecution'
    )
  ) {
    return 'blocked-scenario';
  }

  if (
    text.includes(
      'danger zone keep my plan'
    )
  ) {
    return 'cancel-guard';
  }

  if (
    text.includes(
      'yearly cancel end date'
    )
  ) {
    return 'yearly-cancel-date';
  }

  if (
    text.includes(
      'records subscription history'
    )
  ) {
    return 'upgrade-history';
  }

  if (
    text.includes(
      'subscribe to a paid plan before the trial ends'
    )
  ) {
    return 'trial-to-paid';
  }

  if (
    text.includes(
      'resume cancellation'
    ) ||
    text.includes(
      'does not issue immediate refund'
    ) ||
    text.includes(
      'schedules cancellation and keeps access'
    ) ||
    text.includes(
      'retains access until end'
    )
  ) {
    return 'cancel-resume';
  }

  if (
    text.includes(
      'refund amount before'
    )
  ) {
    return 'refund-preview';
  }

  if (
    text.includes(
      'card-backed trial can be cancelled'
    )
  ) {
    return 'trial-cancel-card';
  }

  if (
    text.includes(
      'no-card trial can be cancelled'
    )
  ) {
    return 'trial-cancel';
  }

  if (
    text.includes(
      'pending downgrade'
    ) ||
    text.includes(
      'schedules lower plan'
    ) ||
    text.includes(
      'warns about feature'
    )
  ) {
    return 'downgrade-then-cancel';
  }

  if (
    text.includes(
      'immediate stripe proration'
    ) ||
    text.includes(
      'new billing cycle immediately'
    )
  ) {
    return 'upgrade-history';
  }

  if (
    text.includes(
      'monthly-to-annual billing change is immediate'
    )
  ) {
    return 'monthly-to-annual';
  }

  if (
    text.includes(
      'annual-to-monthly billing change is scheduled'
    )
  ) {
    return 'annual-to-monthly';
  }

  if (
    text.includes(
      'cannot start another'
    )
  ) {
    return 'paid-no-second-trial';
  }

  if (
    text.includes(
      'paymentnegative'
    )
  ) {
    if (
      text.includes(
        'stolen card'
      ) ||
      text.includes(
        'fraud-blocked'
      )
    ) {
      return 'checkout-stolen';
    }

    if (
      text.includes(
        'processing error card'
      ) ||
      text.includes(
        'issuer unavailable'
      )
    ) {
      return 'checkout-processing-error';
    }

    if (
      text.includes(
        'directsubscriptionpurchase'
      ) &&
      !/(block|declin|invalid|expired|insufficient|authentication|3ds|3d)/i.test(
        text
      )
    ) {
      return 'direct-checkout';
    }

    if (
      /\bdeclin|failed checkout/i.test(
        text
      )
    ) {
      return 'checkout-decline';
    }

    return 'payment-negative';
  }

  if (
    text.includes(
      'downgrade target ladder'
    )
  ) {
    return 'downgrade-targets';
  }

  if (
    text.includes(
      'interval preview'
    ) ||
    text.includes(
      'sub_lifecycle_interval'
    ) ||
    text.includes(
      'billing interval change'
    )
  ) {
    return 'interval-preview';
  }

  if (
    text.includes(
      'subscriptionlifecycleexecution'
    ) &&
    text.includes(
      'upgrade'
    )
  ) {
    return 'upgrade-preview';
  }

  if (
    text.includes(
      'subscriptionlifecycleexecution'
    ) &&
    text.includes(
      'downgrade'
    )
  ) {
    return 'downgrade-preview';
  }

  if (
    text.includes(
      'planselectionvalidation'
    )
  ) {
    return 'plan-catalog';
  }

  if (
    text.includes(
      'overlay'
    ) &&
    text.includes(
      'declined'
    )
  ) {
    return 'overlay-with-card-checkout';
  }

  if (
    text.includes(
      'overlay'
    ) &&
    text.includes(
      'without card'
    ) &&
    !text.includes(
      'option'
    ) &&
    !text.includes(
      'messaging'
    )
  ) {
    return 'overlay-without-card';
  }

  if (
    text.includes(
      'overlay'
    ) &&
    (
      text.includes(
        'with card'
      ) ||
      text.includes(
        'checkout details'
      )
    )
  ) {
    return 'overlay-with-card-checkout';
  }

  if (
    text.includes(
      'overlay'
    ) &&
    text.includes(
      'terms'
    )
  ) {
    return 'plan-catalog';
  }

  if (
    text.includes(
      'directsubscriptionpurchase'
    )
  ) {
    return 'direct-checkout';
  }

  if (
    /current/i.test(title) &&
    /displayed before upgrade/i.test(title)
  ) {
    return 'current-plan-before-upgrade';
  }

  if (
    /cancel|portal|manage subscription|payment recovery|payment method|invoice history|return link|validatestripeportalsession|add payment|billing information/.test(
      text
    )
  ) {
    return 'billing-portal';
  }

  return 'billing-inapp';
}

async function loginPaidSubscriber(
  page: Page
) {
  const user =
    paidSubscriber();

  // Drop any prior Free/plantest session before signing in the paid fixture.
  await page.context().clearCookies();
  await page.goto('about:blank').catch(() => undefined);

  await new LoginPage(
    page
  ).login(
    user.email,
    user.password
  );
}

async function catalogHeadingVisible(
  page: Page
) {
  return page.getByText(
    /choose your plan|select a plan|get started/i
  ).first()
    .isVisible({
      timeout: 10000
    })
    .catch(
      () => false
    );
}

export async function registerAndReachPlanSelection(
  page: Page,
  scenario: string
) {
  if (
    !isEmailVerificationReady()
  ) {
    throw new CoverageSkip(
      'Set GMAIL_APP_PASSWORD for automatic email verification, or EMAIL_VERIFICATION_PAUSE=true for a headed pause.'
    );
  }

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

  await new PlanSelectionPage(
    page
  ).waitUntilCatalogVisible();

  return {
    email,
    mobileNumber
  };
}

async function reachPlanSelection(
  page: Page,
  scenario: string
) {
  const existingEmail =
    process.env.PLAN_SELECTION_EXISTING_EMAIL;
  const existingPassword =
    process.env.PLAN_SELECTION_EXISTING_PASSWORD;
  const existingMobile =
    process.env.PLAN_SELECTION_EXISTING_MOBILE ??
    TEST_USERS.onboarding.mobile;

  if (
    existingEmail &&
    existingPassword
  ) {
    try {
      await new LoginPage(
        page
      ).login(
        existingEmail,
        existingPassword
      );

      await new MobileVerificationPage(
        page
      ).completeIfVisible(
        existingMobile
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

      if (
        await catalogHeadingVisible(
          page
        )
      ) {
        return {
          email: existingEmail,
          mobileNumber: existingMobile
        };
      }

      console.log(
        'Prepared plan-selection user is not on Choose Your Plan; registering a fresh matrix user.'
      );
    } catch (error) {
      console.log(
        `Prepared plan-selection login failed; registering a fresh matrix user. ${error instanceof Error ? error.message : ''}`
      );
    }
  }

  return registerAndReachPlanSelection(
    page,
    scenario
  );
}

async function executeCurrentPlanBeforeUpgrade(
  page: Page
) {
  await loginPaidSubscriber(
    page
  );

  const billing =
    new BillingPage(
      page
    );

  await requireActivePaidSubscriptionFixture(
    billing,
    'current-plan-before-upgrade coverage'
  );

  await billing.validateOverview();

  await expect(
    page.getByText(
      /income builder|overlay strategists|portfolio hedger|current plan|your plan|\bfree\b|curious/i
    ).first()
  ).toBeVisible({
    timeout: 30000
  });
}

async function executeBillingInApp(
  page: Page
) {
  await loginPaidSubscriber(
    page
  );

  const billing =
    new BillingPage(
      page
    );

  await requireActivePaidSubscriptionFixture(
    billing,
    'paid billing-plan coverage'
  );

  await billing.validateOverview();
  await billing.validateOverviewContract();
  await billing.validatePlans();
  await billing.validatePlanLifecycleActionSummary();
  await billing.validateBillingIntervalPresentationSummary();
  await billing.validatePaidSubscriberTrialCtaIsNotOffered();
  await billing.validateTransactions();
  await billing.validateInvoiceAndPdfLinksHaveTargets();
}

async function executeBillingPortal(
  page: Page
) {
  await loginPaidSubscriber(
    page
  );

  const billing =
    new BillingPage(
      page
    );
  const managementEnabled =
    envEnabled(
      'BILLING_SUBSCRIPTION_MANAGEMENT_ENABLED'
    );

  await requireActivePaidSubscriptionFixture(
    billing,
    'Stripe customer-portal coverage'
  );

  await billing.validateStripePortalSession({
    restore: !managementEnabled
  });

  if (
    !managementEnabled
  ) {
    return;
  }

  await billing.validateAddPaymentMethodOpensWithoutSaving();
  await billing.validatePaymentRecoveryEntryPointsSummary();
  await billing.validateBillingInformationUpdateOpensWithoutSaving();
  await billing.validateCancelSubscriptionFormWithoutCancelling();
  await billing.validateSubscriptionPortalCancellationLifecycleSummary();
  await billing.leaveStripePortal();
}

async function executePlanCatalog(
  page: Page
) {
  if (
    !envEnabled(
      'PLAN_SELECTION_VALIDATION_ENABLED'
    ) &&
    !process.env.PLAN_SELECTION_EXISTING_EMAIL
  ) {
    throw new CoverageSkip(
      'Enable PLAN_SELECTION_VALIDATION_ENABLED=true or set PLAN_SELECTION_EXISTING_EMAIL/PASSWORD to run plan-catalog coverage.'
    );
  }

  await reachPlanSelection(
    page,
    'stripe-matrix-plan-catalog'
  );

  const planPage =
    new PlanSelectionPage(
      page
    );

  await planPage.validatePlanCatalog();

  await expect(
    page.locator(
      'a, button'
    ).filter({
      hasText: /downgrade/i
    })
  ).toHaveCount(
    0
  );
  await planPage.validateBillingToggle();
  await planPage.validatePaidPlanPricingAcrossBillingPeriods();
  await planPage.validateCompleteSetupRequiresPlanSelection();
  await planPage.validateOverlayStrategistsFeatureSummary();
  await planPage.validatePaidPlanEntitlementSummaries();
  await planPage.validatePlanSelectionCanSwitchWithoutCheckout();
  await planPage.openOverlayStrategistsTrialWithCardModal();
  await planPage.validateOverlayStrategistsTrialModalContent(
    'with-card'
  );
  await planPage.cancelTrialModal();
  await planPage.validatePlanVisible(
    'Overlay Strategists'
  );
  await planPage.openOverlayStrategistsTrialWithoutCardModal();
  await planPage.validateOverlayStrategistsTrialModalContent(
    'without-card'
  );
  await planPage.closeTrialModal();
  await planPage.openOverlayStrategistsTrialWithoutCardModal();
  await planPage.validateTrialTermsRequired();
}

async function executeDirectCheckout(
  page: Page
) {
  requireFlag(
    'DIRECT_SUBSCRIPTION_PURCHASE_ENABLED',
    'Creates one disposable user and opens Stripe checkout without paying.'
  );

  const user =
    await registerAndReachPlanSelection(
      page,
      'stripe-matrix-direct-checkout'
    );
  const planPage =
    new PlanSelectionPage(
      page
    );

  await planPage.selectMonthlyBilling();
  await planPage.selectPlan(
    'Income Builder'
  );

  const stripePage =
    new StripePaymentPage(
      page
    );

  await stripePage.validateSubscriptionCheckoutDetails({
    expectedEmail:
      user.email,
    expectedPlan:
      'Income Builder',
    expectedBillingCopy:
      /29|per month|monthly|subscription|total/i
  });
  await stripePage.validateCurrencyAndConversionDetails();

  await expect(
    page.locator(
      'body'
    )
  ).toContainText(
    /renew|recurring|per month|every month/i,
    {
      timeout: 15000
    }
  );

  await page.reload({
    waitUntil: 'domcontentloaded'
  });

  await stripePage.validateSubscriptionCheckoutDetails({
    expectedEmail:
      user.email,
    expectedPlan:
      'Income Builder',
    expectedBillingCopy:
      /29|per month|monthly|subscription|total/i
  });

  await planPage.returnFromCheckoutBeforePayment();

  await expect(
    page
  ).not.toHaveURL(
    /checkout\.stripe\.com/i
  );

  await expect(
    page.locator(
      'body'
    )
  ).not.toContainText(
    /payment successful|subscription activated|purchase complete/i
  );
}

async function executeOverlayWithoutCard(
  page: Page
) {
  requireFlag(
    'OVERLAY_STRATEGISTS_FLOW_ENABLED'
  );
  requireFlag(
    'OVERLAY_STRATEGISTS_WITHOUT_CARD_ENABLED',
    'Starts Overlay Strategists trial without a card for one disposable user.'
  );

  const user =
    await registerAndReachPlanSelection(
      page,
      'stripe-matrix-overlay-no-card'
    );

  const planPage =
    new PlanSelectionPage(
      page
    );

  await planPage.validateOverlayStrategistsTrialOptions();
  await planPage.selectOverlayStrategistsTrialWithoutCard();
  await planPage.validateNotRedirectedToStripeCheckout();

  await new DashboardPage(
    page
  ).validateLoaded();

  await new BillingPage(
    page
  ).validateOverlayStrategistsTrialBillingState(
    'without-card'
  );

  await validateNoCardTrialFollowThrough(
    page,
    user.email,
    user.mobileNumber
  );
}

export async function startNoCardTrialAndSubscribe(
  page: Page
) {
  await registerAndReachPlanSelection(
    page,
    'trial-to-paid'
  );

  const planPage =
    new PlanSelectionPage(
      page
    );

  await planPage.validateOverlayStrategistsTrialOptions();
  await planPage.selectOverlayStrategistsTrialWithoutCard();
  await planPage.validateNotRedirectedToStripeCheckout();

  await new DashboardPage(
    page
  ).validateLoaded();

  await new BillingPage(
    page
  ).validateOverlayStrategistsTrialBillingState(
    'without-card'
  );

  await new BillingPage(
    page
  ).subscribeToPaidPlanBeforeTrialEnds();
}

async function executeOverlayWithCardCheckout(
  page: Page
) {
  requireFlag(
    'OVERLAY_STRATEGISTS_FLOW_ENABLED'
  );
  requireAnyFlag(
    [
      'OVERLAY_STRATEGISTS_STRIPE_CHECKOUT_DETAILS_ENABLED',
      'OVERLAY_STRATEGISTS_WITH_CARD_ENABLED',
      'OVERLAY_STRATEGISTS_DECLINED_CARD_ENABLED'
    ],
    'Opens Overlay with-card Stripe checkout. WITH_CARD completes payment with a non-4242 test card.'
  );

  let user =
    await registerAndReachPlanSelection(
      page,
      'stripe-matrix-overlay-card-checkout'
    );

  await new PlanSelectionPage(
    page
  ).selectOverlayStrategistsTrialWithCard();

  const stripe =
    new StripePaymentPage(
      page
    );

  await stripe.validateTrialCheckoutDetails(
    user.email
  );

  if (
    envEnabled(
      'OVERLAY_STRATEGISTS_DECLINED_CARD_ENABLED'
    )
  ) {
    await stripe.validateDeclinedCardRejected();
  }

  if (
    !envEnabled(
      'OVERLAY_STRATEGISTS_WITH_CARD_ENABLED'
    )
  ) {
    return;
  }

  await stripe.completeTrialPayment();

  let reached =
    await continueAfterWithCardTrialCheckout(
      page,
      user.mobileNumber
    );

  for (
    let retry = 1;
    !reached &&
      retry <= 2;
    retry++
  ) {
    console.log(
      `Retrying Overlay with-card checkout with a different Stripe test card (${retry}/2). Do not use 4242.`
    );

    if (
      retry === 2
    ) {
      user =
        await registerAndReachPlanSelection(
          page,
          'stripe-matrix-overlay-card-retry'
        );
    }

    reached =
      await submitAnotherWithCardTrialAttempt(
        page,
        user.mobileNumber
      );
  }

  if (
    !reached
  ) {
    throw new Error(
      'QA-CL-005: with-card trial bounced to Plan Selection after unique-card retries. Use a fresh user and an unused Stripe test card. Do not use 4242; that fingerprint is already_redeemed. Follow-up: clear 4242 reuse in Stripe test mode.'
    );
  }

  await new DashboardPage(
    page
  ).validateLoaded({
    acceptTrialSuccessMobileGate: true
  });

  await new BillingPage(
    page
  ).validateOverlayStrategistsTrialBillingState(
    'with-card'
  );
}

async function previewPlanChange(
  page: Page,
  action: 'upgrade' | 'downgrade' | 'interval',
  targetPlan: PaidPlanName,
  interval: BillingInterval
) {
  await loginPaidSubscriber(
    page
  );

  const billing =
    new BillingPage(
      page
    );

  await requireActivePaidSubscriptionFixture(
    billing,
    `${action} calculation-preview coverage`
  );

  try {
    await billing.openPlanChangeCalculationPreview({
      targetPlan,
      action,
      interval
    });
  } catch (error) {
    if (
      isMissingPlanAction(
        error
      ) &&
      action === 'interval'
    ) {
      await billing.validateShownBillingInterval();

      return;
    }

    if (
      isMissingPlanAction(
        error
      )
    ) {
      throw new CoverageSkip(
        `Paid subscriber fixture has no ${action} control for ${targetPlan} ${interval}. ${error instanceof Error ? error.message : ''}`
      );
    }

    throw error;
  }

  await billing.validatePlanChangeCalculationPreview({
    targetPlan,
    action,
    interval,
    expectedBillingCopy:
      billingCopy(
        interval
      ),
    expectedPlanCharge:
      PLAN_PRICES[targetPlan][interval],
    expectedRecurringAmount:
      PLAN_PRICES[targetPlan][interval]
  });

  if (
    action ===
    'downgrade'
  ) {
    await billing.validatePlanChangeTermsRequired({
      targetPlan,
      action:
        'downgrade'
    });
  }

  await billing.closePlanChangeCalculationPreview({
    targetPlan,
    action
  });

  await expect(
    page
  ).not.toHaveURL(
    /checkout\.stripe\.com/i
  );

  await expect(
    page.locator(
      'body'
    )
  ).not.toContainText(
    /subscription (has been )?(updated|upgraded|downgraded)|plan updated|payment successful/i
  );
}

async function executeUpgradePreview(
  page: Page
) {
  requireFlag(
    'SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED'
  );
  requireFlag(
    'SUB_LIFECYCLE_UPGRADE_PREVIEW_ENABLED',
    'Opens upgrade calculation preview without submitting.'
  );

  const targetPlan =
    (
      process.env.SUB_LIFECYCLE_UPGRADE_TARGET_PLAN as PaidPlanName | undefined
    ) ??
    'Portfolio Hedger';
  const interval: BillingInterval =
    /annual/i.test(
      process.env.SUB_LIFECYCLE_UPGRADE_INTERVALS ??
        ''
    )
      ? 'annual'
      : 'monthly';

  await previewPlanChange(
    page,
    'upgrade',
    targetPlan,
    interval
  );
}

async function executeDowngradePreview(
  page: Page
) {
  requireFlag(
    'SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED'
  );
  requireFlag(
    'SUB_LIFECYCLE_DOWNGRADE_PREVIEW_ENABLED',
    'Opens downgrade calculation preview without submitting.'
  );

  const targetPlan =
    (
      process.env.SUB_LIFECYCLE_DOWNGRADE_TARGET_PLAN as PaidPlanName | undefined
    ) ??
    'Income Builder';
  const interval: BillingInterval =
    /annual/i.test(
      process.env.SUB_LIFECYCLE_DOWNGRADE_INTERVALS ??
        ''
    )
      ? 'annual'
      : 'monthly';

  await previewPlanChange(
    page,
    'downgrade',
    targetPlan,
    interval
  );
}

async function executeIntervalPreview(
  page: Page
) {
  requireFlag(
    'SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED'
  );
  requireFlag(
    'SUB_LIFECYCLE_INTERVAL_PREVIEW_ENABLED',
    'Opens billing-interval calculation preview without submitting.'
  );

  const targetPlan =
    (
      process.env.SUB_LIFECYCLE_INTERVAL_TARGET_PLAN as PaidPlanName | undefined
    ) ??
    'Income Builder';
  const preferred: BillingInterval =
    process.env.SUB_LIFECYCLE_INTERVAL_TO ===
      'monthly'
      ? 'monthly'
      : 'annual';
  const fallback: BillingInterval =
    preferred ===
      'annual'
      ? 'monthly'
      : 'annual';

  try {
    await previewPlanChange(
      page,
      'interval',
      targetPlan,
      preferred
    );
  } catch (error) {
    if (
      !(
        error instanceof CoverageSkip
      )
    ) {
      throw error;
    }

    await previewPlanChange(
      page,
      'interval',
      targetPlan,
      fallback
    );
  }
}

async function executePaymentNegative(
  page: Page
) {
  const checkoutUrl =
    process.env.STRIPE_CHECKOUT_URL ??
    '';

  if (
    !checkoutUrl
  ) {
    const planPage =
      new PlanSelectionPage(
        page
      );

    await registerAndReachPlanSelection(
      page,
      'payment-negative'
    );

    await planPage.selectMonthlyBilling();
    await planPage.selectPlan(
      'Income Builder'
    );
  } else {
    await page.goto(
      checkoutUrl,
      {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      }
    );
  }

  await expect(
    page
  ).toHaveURL(
    /checkout\.stripe\.com/,
    {
      timeout: 60000
    }
  );

  const cardNumber =
    page.locator(
      '#cardNumber'
    );

  await expect(
    cardNumber
  ).toBeVisible({
    timeout: 60000
  });

  await expect(
    page.locator(
      '#cardExpiry'
    )
  ).toBeVisible();

  await expect(
    page.locator(
      '#cardCvc'
    )
  ).toBeVisible();

  await cardNumber.fill(
    STRIPE_INCOMPLETE_CARD
  );
  await page.locator(
    '#cardExpiry'
  ).fill(
    STRIPE_EXPIRY
  );
  await page.locator(
    '#cardCvc'
  ).fill(
    STRIPE_CVC
  );

  const payButton =
    page.getByRole(
      'button',
      {
        name: /subscribe|pay|complete|start/i
      }
    ).first();

  if (
    await payButton.isDisabled().catch(
      () => false
    )
  ) {
    return;
  }

  await payButton.click();

  await expect(
    page.getByText(
      /incomplete|invalid|card number|expiry|cvc|security code/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  await expect(
    page
  ).toHaveURL(
    /checkout\.stripe\.com/
  );
}

async function purchaseDisposablePlan(
  page: Page,
  tag: string,
  planName: 'Income Builder' | 'Overlay Strategists' | 'Portfolio Hedger',
  interval: 'monthly' | 'annual'
) {
  try {
    return await purchaseDisposablePlanInner(
      page,
      tag,
      planName,
      interval
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(
          error
        );

    if (
      /checkout\.stripe\.com|billing\.stripe\.com|waitForURL|toHaveURL|\/register|\/signup|Start 30-Day|TimeoutError/i.test(
        message
      )
    ) {
      throw new CoverageSkip(
        `Disposable plan purchase unavailable (${tag}/${planName}/${interval}). ${message}`
      );
    }

    throw error;
  }
}

async function purchaseDisposablePlanInner(
  page: Page,
  tag: string,
  planName: 'Income Builder' | 'Overlay Strategists' | 'Portfolio Hedger',
  interval: 'monthly' | 'annual'
) {
  await registerAndReachPlanSelection(
    page,
    tag
  );

  const planPage =
    new PlanSelectionPage(
      page
    );

  if (
    interval === 'annual'
  ) {
    await planPage.selectAnnualBilling();
  } else {
    await planPage.selectMonthlyBilling();
  }

  await planPage.selectPlan(
    planName
  );

  await new StripePaymentPage(
    page
  ).completePayment();

  await new DashboardPage(
    page
  ).validateLoaded();

  const billing =
    new BillingPage(
      page
    );

  await billing.validateActivePlan(
    planName
  );

  return billing;
}

async function submitCheckoutCard(
  page: Page,
  tag: string,
  cardNumber: string,
  errorPattern: RegExp
) {
  const planPage =
    new PlanSelectionPage(
      page
    );

  await registerAndReachPlanSelection(
    page,
    tag
  );

  await planPage.selectMonthlyBilling();
  await planPage.selectPlan(
    'Income Builder'
  );

  await expect(
    page
  ).toHaveURL(
    /checkout\.stripe\.com/,
    {
      timeout: 60000
    }
  );

  await page.locator(
    '#cardNumber'
  ).fill(
    cardNumber
  );
  await page.locator(
    '#cardExpiry'
  ).fill(
    STRIPE_EXPIRY
  );
  await page.locator(
    '#cardCvc'
  ).fill(
    STRIPE_CVC
  );

  const cardholder =
    page.locator(
      '#billingName, input[name="billingName"]'
    ).first();

  if (
    await cardholder.isVisible().catch(
      () => false
    )
  ) {
    await cardholder.fill(
      CARDHOLDER_NAME
    );
  }

  await page.getByRole(
    'button',
    {
      name: /subscribe|pay|complete|start/i
    }
  ).first().click();

  await expect(
    page.getByText(
      errorPattern
    ).first()
  ).toBeVisible({
    timeout: 20000
  });

  await expect(
    page
  ).toHaveURL(
    /checkout\.stripe\.com/
  );
}

async function executeCheckoutDecline(
  page: Page
) {
  await submitCheckoutCard(
    page,
    'checkout-decline',
    STRIPE_DECLINED_CARD,
    /declin|insufficient|do not honor|card was declined|try another|not successful/i
  );
}

async function executeStolenCard(
  page: Page
) {
  await submitCheckoutCard(
    page,
    'checkout-stolen',
    STRIPE_STOLEN_CARD,
    /declin|stolen|fraud|lost card|pickup|card was declined|try another|not successful/i
  );
}

async function executeProcessingErrorCard(
  page: Page
) {
  await submitCheckoutCard(
    page,
    'checkout-processing-error',
    STRIPE_PROCESSING_ERROR_CARD,
    /declin|processing|try again|payment failed|card was declined|try another|not successful/i
  );
}

async function executeCancelGuard(
  page: Page
) {
  const billing =
    await purchaseDisposablePlan(
      page,
      'cancel-guard',
      'Income Builder',
      'monthly'
    );

  await billing.validateDangerZoneCancelStaysSafe(
    'Income Builder',
    'monthly'
  );
}

async function executeYearlyCancelDate(
  page: Page
) {
  const billing =
    await purchaseDisposablePlan(
      page,
      'yearly-cancel-date',
      'Income Builder',
      'annual'
    );

  await billing.validateDangerZoneCancelStaysSafe(
    'Income Builder',
    'annual'
  );
}

async function executeUpgradeHistory(
  page: Page
) {
  const billing =
    await purchaseDisposablePlan(
      page,
      'upgrade-history',
      'Income Builder',
      'monthly'
    );

  try {
    await billing.openPlanChangeCalculationPreview({
    targetPlan:
      'Overlay Strategists',
    action:
      'upgrade',
    interval:
      'monthly'
  });
  } catch (error) {
    if (
      isMissingPlanAction(
        error
      )
    ) {
      throw new CoverageSkip(
        `Upgrade history could not open Overlay Strategists upgrade preview. ${error instanceof Error ? error.message : String(error)}`
      );
    }

    throw error;
  }

  await billing.validatePlanChangeDueAmountAndRenewal({
    targetPlan:
      'Overlay Strategists',
    action:
      'upgrade',
    interval:
      'monthly',
    expectedPlanCharge:
      PLAN_PRICES['Overlay Strategists'].monthly,
    expectedRecurringAmount:
      PLAN_PRICES['Overlay Strategists'].monthly
  });

  await billing.submitPlanChangeCalculationPreview({
    targetPlan:
      'Overlay Strategists',
    action:
      'upgrade'
  });

  if (
    /checkout\.stripe\.com/i.test(
      page.url()
    )
  ) {
    await new StripePaymentPage(
      page
    ).completePayment();
  }

  await billing.validateActivePlan(
    'Overlay Strategists'
  );

  await billing.validateHistoryShowsPlan(
    'Overlay Strategists'
  );
}

async function executeTrialToPaid(
  page: Page
) {
  requireFlag(
    'OVERLAY_STRATEGISTS_FLOW_ENABLED'
  );
  requireFlag(
    'OVERLAY_STRATEGISTS_WITHOUT_CARD_ENABLED',
    'Starts a no-card trial, then pays for a plan before the trial ends.'
  );

  await startNoCardTrialAndSubscribe(
    page
  );
}

async function executeCancelResume(
  page: Page
) {
  const billing =
    await purchaseDisposablePlan(
      page,
      'cancel-resume',
      'Income Builder',
      'monthly'
    );

  await billing.submitMonthlyCancelAtPeriodEnd({
    keepScheduled: true
  });

  await billing.expectPaidAccessWhileCancellationScheduled(
    'Income Builder'
  );

  await billing.resumeScheduledCancellation(
    'Income Builder'
  );
}

async function executeRefundPreview(
  page: Page
) {
  const billing =
    await purchaseDisposablePlan(
      page,
      'refund-preview',
      'Income Builder',
      'annual'
    );

  await billing.showRefundAmountWithoutConfirming(
    'Income Builder'
  );
}

async function executeTrialCancel(
  page: Page
) {
  await registerAndReachPlanSelection(
    page,
    'trial-cancel'
  );

  const planPage =
    new PlanSelectionPage(
      page
    );

  await planPage.selectOverlayStrategistsTrialWithoutCard();
  await planPage.validateNotRedirectedToStripeCheckout();

  await new DashboardPage(
    page
  ).validateLoaded();

  const billing =
    new BillingPage(
      page
    );

  await billing.validateOverlayStrategistsTrialBillingState(
    'without-card'
  );

  try {
    await billing.cancelTrialWithoutPaymentMethod();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(
          error
        );

    if (
      /Cancel subscription control was not found/i.test(
        message
      )
    ) {
      console.log(
        'No-card trial billing has no Cancel subscription control. That is expected; a card is not on file.'
      );
      return;
    }

    throw error;
  }
}

async function executeCardTrialCancel(
  page: Page
) {
  const user =
    await registerAndReachPlanSelection(
      page,
      'trial-cancel-card'
    );

  await new PlanSelectionPage(
    page
  ).selectOverlayStrategistsTrialWithCard();

  await new StripePaymentPage(
    page
  ).completeTrialPayment();

  let reached =
    await continueAfterWithCardTrialCheckout(
      page,
      user.mobileNumber
    );

  // A Stripe test card can only start a trial once, so a card used in an
  // earlier run sends the user back to Plan Selection. Try other cards, as
  // the Overlay trial test does, instead of failing on the first one.
  for (
    let retry = 1;
    !reached &&
      retry <= 3;
    retry++
  ) {
    console.log(
      `Retrying card-backed trial with a different Stripe test card (${retry}/3)`
    );

    reached =
      await submitAnotherWithCardTrialAttempt(
        page,
        user.mobileNumber
      );
  }

  if (
    !reached
  ) {
    throw new Error(
      'Card-backed trial bounced back to Plan Selection after 3 retries with different Stripe test cards.'
    );
  }

  await new DashboardPage(
    page
  ).validateLoaded({
    acceptTrialSuccessMobileGate: true
  });

  await new BillingPage(
    page
  ).cancelTrialWithoutPaymentMethod();
}

async function executeDowngradeThenCancel(
  page: Page
) {
  const billing =
    await purchaseDisposablePlan(
      page,
      'downgrade-then-cancel',
      'Overlay Strategists',
      'monthly'
    );

  await billing.assertDowngradeImpactWarning(
    'Income Builder'
  );

  await billing.declineRetentionAndPreviewOrScheduleDowngrade({
    currentPlan:
      'Overlay Strategists',
    targetPlan:
      'Income Builder',
    schedule:
      true
  });

  await billing.submitMonthlyCancelAtPeriodEnd({
    keepScheduled: true
  });

  await billing.expectPaidAccessWhileCancellationScheduled(
    'Overlay Strategists'
  );
}

async function executePaidNoSecondTrial(
  page: Page
) {
  await Promise.race([
    loginPaidSubscriber(
      page
    ),
    page.waitForTimeout(
      90000
    ).then(
      () => {
        throw new Error(
          'Paid subscriber login did not finish within 90s.'
        );
      }
    )
  ]);

  await new BillingPage(
    page
  ).validatePaidSubscriberTrialCtaIsNotOffered();
}

async function submitIntervalChange(
  page: Page,
  tag: string,
  startingInterval: 'monthly' | 'annual',
  targetInterval: 'monthly' | 'annual'
) {
  const billing =
    await purchaseDisposablePlan(
      page,
      tag,
      'Income Builder',
      startingInterval
    );

  try {
    await billing.openPlanChangeCalculationPreview({
      targetPlan:
        'Income Builder',
      action:
        'interval',
      interval:
        targetInterval
    });
  } catch (error) {
    if (
      isMissingPlanAction(
        error
      )
    ) {
      throw new CoverageSkip(
        `Income Builder has no monthly/annual switch on the plans screen. ${error instanceof Error ? error.message : ''}`
      );
    }

    throw error;
  }

  await billing.validatePlanChangeDueAmountAndRenewal({
    targetPlan:
      'Income Builder',
    action:
      'interval',
    interval:
      targetInterval,
    expectedBillingCopy:
      targetInterval === 'annual'
        ? /year|annual/i
        : /month/i,
    expectedPlanCharge:
      PLAN_PRICES['Income Builder'][targetInterval],
    expectedRecurringAmount:
      PLAN_PRICES['Income Builder'][targetInterval]
  });

  const dialogText =
    await page.locator(
      '[role="dialog"], [role="alertdialog"]'
    ).first().innerText();

  if (
    targetInterval === 'monthly'
  ) {
    expect(
      dialogText
    ).toMatch(
      /next renewal|scheduled|takes effect|end of/i
    );
  } else {
    expect(
      dialogText
    ).toMatch(
      /prorat|due today|amount due|\$\s?\d/i
    );
  }

  await billing.submitPlanChangeCalculationPreview({
    targetPlan:
      'Income Builder',
    action:
      'interval'
  });

  if (
    /checkout\.stripe\.com/i.test(
      page.url()
    )
  ) {
    await new StripePaymentPage(
      page
    ).completePayment();
  }

  await billing.validateActivePlan(
    'Income Builder'
  );

  if (
    targetInterval === 'annual'
  ) {
    await expect(
      page.locator(
        'main'
      )
    ).toContainText(
      /\$\s*290(?:\.00)?(?!\d)|per year|\/year|annual/i
    );
  }
}

async function executeMonthlyToAnnual(
  page: Page
) {
  await submitIntervalChange(
    page,
    'monthly-to-annual',
    'monthly',
    'annual'
  );
}

async function executeAnnualToMonthly(
  page: Page
) {
  await submitIntervalChange(
    page,
    'annual-to-monthly',
    'annual',
    'monthly'
  );
}

async function executeDowngradeTargets(
  page: Page
) {
  await loginPaidSubscriber(
    page
  );

  const billing =
    new BillingPage(
      page
    );

  await requireActivePaidSubscriptionFixture(
    billing,
    'downgrade-target coverage'
  );

  await billing.assertDowngradeTargetsAreLowerTier();
}

async function executeScenarioStep(
  key: string,
  page: Page
) {
  const outcome =
    await runScenarioStep(
      key,
      page
    );

  if (
    outcome.status ===
    'skipped'
  ) {
    throw new CoverageSkip(
      outcome.reason
    );
  }

  if (
    outcome.status ===
    'failed'
  ) {
    throw outcome.error;
  }
}

const coverageExecutors: Record<
  StaticCoverageKey,
  (page: Page) => Promise<void>
> = {
  'billing-inapp':
    executeBillingInApp,
  'billing-portal':
    executeBillingPortal,
  'plan-catalog':
    executePlanCatalog,
  'direct-checkout':
    executeDirectCheckout,
  'overlay-without-card':
    executeOverlayWithoutCard,
  'overlay-with-card-checkout':
    executeOverlayWithCardCheckout,
  'upgrade-preview':
    executeUpgradePreview,
  'downgrade-preview':
    executeDowngradePreview,
  'interval-preview':
    executeIntervalPreview,
  'payment-negative':
    executePaymentNegative,
  'checkout-decline':
    executeCheckoutDecline,
  'checkout-stolen':
    executeStolenCard,
  'checkout-processing-error':
    executeProcessingErrorCard,
  'cancel-guard':
    executeCancelGuard,
  'yearly-cancel-date':
    executeYearlyCancelDate,
  'upgrade-history':
    executeUpgradeHistory,
  'trial-to-paid':
    executeTrialToPaid,
  'cancel-resume':
    executeCancelResume,
  'refund-preview':
    executeRefundPreview,
  'trial-cancel':
    executeTrialCancel,
  'trial-cancel-card':
    executeCardTrialCancel,
  'downgrade-then-cancel':
    executeDowngradeThenCancel,
  'monthly-to-annual':
    executeMonthlyToAnnual,
  'annual-to-monthly':
    executeAnnualToMonthly,
  'paid-no-second-trial':
    executePaidNoSecondTrial,
  'downgrade-targets':
    executeDowngradeTargets,
  'current-plan-before-upgrade':
    executeCurrentPlanBeforeUpgrade,
  'air-traceability':
    async () => {
      throw new CoverageSkip(
        'AIR coverage-ingestion row. No additional UI flow.'
      );
    },
  'blocked-scenario':
    async () => {
      throw new CoverageSkip(
        'BlockedScenarioExecution stays skipped unless BLOCKED_SCENARIO_EXECUTION_ENABLED=true and STRIPE_CHECKOUT_URL are set in that spec.'
      );
    }
};

function coverageNeedsPage(
  key: StripeMatrixCoverageKey
) {
  return key !==
    'air-traceability' &&
    key !==
    'blocked-scenario' &&
    !key.startsWith('air:');
}

async function runCoverageKey(
  key: StripeMatrixCoverageKey,
  page?: Page
): Promise<CoverageOutcome & {
  cache: 'hit' | 'miss';
}> {
  const cached =
    coverageCache.get(
      key
    );

  if (
    cached
  ) {
    return {
      ...cached,
      cache: 'hit'
    };
  }

  try {
    const executor =
      key.startsWith('air:')
        ? async () =>
            runAirCheck(
              key.slice(4)
            )
        : isScenarioCoverageKey(key)
        ? (scenarioPage: Page) =>
            executeScenarioStep(
              key,
              scenarioPage
            )
        : coverageExecutors[
            key as StaticCoverageKey
          ];

    if (
      coverageNeedsPage(
        key
      )
    ) {
      if (
        !page
      ) {
        throw new Error(
          `Coverage key ${key} needs a browser page.`
        );
      }

      await executor(
        page
      );
    } else {
      await executor(
        page as Page
      );
    }

    const passed: CoverageOutcome = {
      status: 'passed'
    };

    coverageCache.set(
      key,
      passed
    );

    return {
      ...passed,
      cache: 'miss'
    };
  } catch (error) {
    if (
      error instanceof CoverageSkip
    ) {
      const skipped: CoverageOutcome = {
        status: 'skipped',
        reason:
          error.reason
      };

      // Do not cache skips � a Free/unpaid miss must not cascade as
      // "Reused coverage key" across later rows after the paid fixture is ready.
      return {
        ...skipped,
        cache: 'miss'
      };
    }

    if (
      isPaidSubscriptionFixtureUnavailable(
        error
      )
    ) {
      const skipped: CoverageOutcome = {
        status: 'skipped',
        reason:
          `The configured billing fixture is not an active paid subscriber. ${error instanceof Error ? error.message : String(error)}`
      };

      return {
        ...skipped,
        cache: 'miss'
      };
    }

    const message =
      error instanceof Error
        ? error.message
        : String(
            error
          );

    if (
      isMissingPlanAction(
        error
      ) ||
      /page\.goto: Timeout|net::ERR_|ERR_CONNECTION_|TimeoutError: page\.goto/i.test(
        message
      )
    ) {
      return {
        status: 'skipped',
        reason:
          `UAT/UI gap during coverage (${message.split('\n')[0].slice(0, 220)})`,
        cache: 'miss'
      };
    }

    // Do not cache failures ? a timeout/network miss must not poison later
    // SC/LC rows that share the same coverage key in the same worker.
    throw error;
  }
}

export async function executeStripeMatrixScenario(
  scenario: StripeMatrixScenario,
  browser: Browser | undefined,
  options: {
    module?: string;
    journey?: string;
    blockedReason: string;
    extraAnnotations?: Array<{
      type: string;
      description: string;
    }>;
  }
) {
  test.info().annotations.push(
    {
      type: 'priority',
      description:
        scenario.priority
    },
    {
      type: 'automation-status',
      description:
        scenario.status
    },
    {
      type: 'source-test-id',
      description:
        scenario.sourceIds?.join(
          ', '
        ) ??
        scenario.id
    },
    {
      type: 'module',
      description:
        options.module ??
        'Billing'
    },
    {
      type: 'journey',
      description:
        options.journey ??
        'Stripe'
    },
    ...(
      options.extraAnnotations ??
      []
    )
  );

  if (
    scenario.status ===
    'known-bug'
  ) {
    test.skip(
      true,
      scenario.dependency ??
        'Known product bug ? tracked separately; not a suite automation failure.'
    );
  }

  if (
    scenario.status !==
    'automated'
  ) {
    test.skip(
      true,
      scenario.dependency ??
        options.blockedReason
    );
  }

  if (
    (
      scenario.automation ??
      ''
    ).toLowerCase().includes(
      'paid plan ladder availability'
    )
  ) {
    test.info().annotations.push(
      {
        type: 'coverage-key',
        description:
          'paid-plan-ladder'
      }
    );

    return;
  }

  const coverageKey =
    inferStripeMatrixCoverageKey(
      scenario.automation,
      scenario.title
    );

  if (
    coverageKey.startsWith(
      'air:'
    ) &&
    !envEnabled(
      'AIR_SELF_VALIDATION_ENABLED'
    )
  ) {
    test.skip(
      true,
      'AIR self-validation reads a previously generated report and is excluded from the live Playwright execution. Run it separately with AIR_SELF_VALIDATION_ENABLED=true after npm run air:parse.'
    );
  }

  const cached =
    coverageCache.get(
      coverageKey
    );

  let result: CoverageOutcome & {
    cache: 'hit' | 'miss';
  };

  if (
    cached ||
    !coverageNeedsPage(
      coverageKey
    )
  ) {
    result =
      await runCoverageKey(
        coverageKey
      );
  } else if (
    !browser
  ) {
    throw new Error(
      `Coverage key ${coverageKey} needs a browser.`
    );
  } else {
    const page =
      await browser.newPage();

    try {
      result =
        await runCoverageKey(
          coverageKey,
          page
        );
    } finally {
      await page.close();
    }
  }

  test.info().annotations.push(
    {
      type: 'coverage-key',
      description:
        coverageKey
    },
    {
      type: 'coverage-cache',
      description:
        result.cache
    }
  );

  if (
    result.status ===
    'skipped'
  ) {
    // Cache hits mean this worker already executed the shared UI coverage.
    // Count those rows as passed/covered instead of skipped so AIR skip
    // totals stay near the real blocked/controlled gap (~150), not ~250.
    if (
      result.cache ===
      'hit'
    ) {
      test.info().annotations.push({
        type: 'coverage-reuse',
        description:
          result.reason ??
          `Reused coverage key ${coverageKey}.`
      });
      return;
    }

    // Scenario pack setup miss: skip once per pack, cover sibling steps.
    if (
      isScenarioCoverageKey(coverageKey) &&
      /GMAIL_APP_PASSWORD|EMAIL_VERIFICATION_PAUSE|user not created|could not finish its setup|offers no (upgrade|downgrade|interval) control/i.test(
        result.reason ?? ''
      )
    ) {
      const packName =
        coverageKey.split(':')[1] ??
        coverageKey;

      if (
        scenarioSetupSkipPacks.has(
          packName
        )
      ) {
        test.info().annotations.push({
          type: 'coverage-reuse',
          description:
            `Same ${packName} setup gap already reported. ${result.reason}`
        });
        return;
      }

      scenarioSetupSkipPacks.add(
        packName
      );
    }

    // Identical plan-action / AIR self-validation gaps: report once, cover the rest.
    const gapKey =
      uiGapReuseKey(
        result.reason ?? ''
      );

    if (
      gapKey
    ) {
      if (
        reportedUiGapKeys.has(
          gapKey
        )
      ) {
        test.info().annotations.push({
          type: 'coverage-reuse',
          description:
            `Same UAT/UI gap already reported. ${result.reason}`
        });
        return;
      }

      reportedUiGapKeys.add(
        gapKey
      );
    }

    test.skip(
      true,
      result.reason
    );
  }

  if (
    result.status ===
    'failed'
  ) {
    throw result.error;
  }

  if (
    result.cache ===
    'hit' &&
    result.status ===
    'passed'
  ) {
    test.info().annotations.push({
      type: 'coverage-reuse',
      description:
        `Reused passed coverage key ${coverageKey}.`
    });
  }
}
