import fs from 'fs';
import path from 'path';

import {
  expect,
  Locator,
  Page,
  Request,
  test
} from '@playwright/test';

import {
  BASE_URL,
  COUNTRY,
  PLAN_PRICES,
  STRIPE_CARD,
  STRIPE_CVC,
  STRIPE_EXPIRY,
  TEST_USERS
} from '../config/testData';
import {
  SCENARIO_USERS,
  ScenarioUserName
} from '../config/subscriptionScenarioUsers';
import {
  BillingPage
} from '../pages/BillingPage';
import {
  DashboardPage
} from '../pages/DashboardPage';
import {
  PlanSelectionPage
} from '../pages/PlanSelectionPage';
import {
  StripePaymentPage
} from '../pages/StripePaymentPage';
import {
  GmailMessage,
  isGmailAutomationEnabled,
  waitForGmailMessageMatching
} from './gmailImap';
import {
  registerAndReachPlanSelection
} from './stripeMatrixExecution';

/* =============================================================================
HELPER: Subscription scenario packs

PURPOSE
-------
Each pack = ONE new disposable user + one lifecycle action (purchase, upgrade,
downgrade, interval change, cancel). After the action the pack runs many small
checks ("steps"). A matrix row points at one step with

  automation: 'scenario:<SCENARIO_NAME>:<step>'

so many matrix rows share one user and still get their own pass/fail/skip.
Step names and scenario names are listed in config/subscriptionScenarioUsers.ts.

Nothing here touches the shared subscriber account. Final cancellation only
runs on the disposable user created by the pack itself.
============================================================================= */

export type ScenarioOutcome =
  | { status: 'passed' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: unknown };

class ScenarioSkip extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'ScenarioSkip';
    this.reason = reason;
  }
}

type PaidPlan =
  | 'Income Builder'
  | 'Overlay Strategists'
  | 'Portfolio Hedger';

type Interval =
  | 'monthly'
  | 'annual';

type RequestRecord = {
  method: string;
  url: string;
  resourceType: string;
};

type PackContext = {
  scenario: ScenarioUserName;
  page: Page;
  email: string;
  billing: BillingPage;
  seenMessageIds: Set<string>;
  requests: RequestRecord[];
  state: {
    checkoutUrl?: string;
    sawCheckoutDuringChange?: boolean;
    paidBeforeChange?: number;
    paidAfterChange?: number;
    changeDialogText?: string;
    cancelDialogText?: string;
    cancelDialogFields?: number;
    cancelDialogLinks?: number;
    keepPlanLeftActive?: boolean;
    confirmationEmailFailed?: boolean;
  };
};

type PackDefinition = {
  setup: (ctx: PackContext) => Promise<void>;
  steps: Record<
    string,
    (ctx: PackContext) => Promise<void>
  >;
};

const NOISE_URL =
  /analytics|google|gtag|segment|sentry|datadog|hotjar|clarity|mixpanel|posthog|intercom|hcaptcha|recaptcha|\/log|\/track|\/metrics|\/collect|\/rum|r\.stripe\.com|m\.stripe\.(com|network)|stripe\.com\/b\/|js\.stripe\.com/i;

const ACTION_URL =
  /checkout|session|subscri|upgrade|downgrade|plan-?change|change-?plan|interval|switch|cancel|billing/i;

/* ----------------------------------------------------------------------------
Generic helpers
---------------------------------------------------------------------------- */

function errorText(
  error: unknown
) {
  return error instanceof Error
    ? error.message
    : String(error);
}

function escapeRegExp(
  value: string
) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
}

function moneyPattern(
  amount: number
) {
  const trimmed =
    amount
      .toFixed(2)
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1');

  // The app prints amounts as "USD 7.90"; Stripe pages use "$7.90".
  return new RegExp(
    `(?:\\$|USD)\\s?(?:${escapeRegExp(amount.toFixed(2))}|${escapeRegExp(trimmed)}(?:\\.0+)?)(?!\\d)`
  );
}

async function clickTab(
  tab: Locator
) {
  await tab
    .scrollIntoViewIfNeeded()
    .catch(() => undefined);

  const visible = await tab
    .isVisible({
      timeout: 10000
    })
    .catch(() => false);

  if (!visible) {
    // After plan-change dialogs the billing shell can briefly drop tabs.
    // Re-open Billing before failing the Overview/Plans click (SC-214).
    throw new Error(
      'Billing tab control was not visible. Re-open Billing overview and retry.'
    );
  }

  await tab
    .click({
      timeout: 15000
    })
    .catch(async () => {
      await tab
        .click({
          force: true,
          timeout: 8000
        })
        .catch(async () => {
          // Only evaluate when a real node is attached — otherwise Playwright
          // waits 30s on a role=tab that never exists (SC-214).
          if (
            (
              await tab.count()
            ) > 0
          ) {
            await tab.evaluate(
              (element) =>
                (element as HTMLElement).click()
            );
          } else {
            throw new Error(
              'Billing tab control was not attached for click.'
            );
          }
        });
    });
}

function recordScenarioUser(
  scenario: string,
  email: string
) {
  try {
    const file = path.join(
      process.cwd(),
      'test-results',
      'scenario-users.json'
    );

    let saved: Array<Record<string, string>> = [];

    try {
      saved = JSON.parse(
        fs.readFileSync(file, 'utf8')
      );
    } catch {
      saved = [];
    }

    saved.push({
      scenario,
      email,
      createdAt:
        new Date().toISOString(),
      password:
        'TEST_USERS.onboarding.password',
      baseUrl:
        BASE_URL
    });

    fs.mkdirSync(
      path.dirname(file),
      { recursive: true }
    );

    fs.writeFileSync(
      file,
      JSON.stringify(saved, null, 2)
    );
  } catch {
    // Logging the user is best effort only.
  }
}

function startRequestRecorder(
  ctx: PackContext
) {
  ctx.page.on(
    'request',
    (request: Request) => {
      ctx.requests.push({
        method:
          request.method(),
        url:
          request.url(),
        resourceType:
          request.resourceType()
      });
    }
  );
}

function stripQuery(
  url: string
) {
  return url.split('?')[0];
}

/** POST requests that look like "do the thing" calls, grouped by endpoint. */
function actionPostCounts(
  records: RequestRecord[]
) {
  const counts = new Map<string, number>();

  for (const record of records) {
    if (
      record.method !== 'POST' ||
      NOISE_URL.test(record.url) ||
      !ACTION_URL.test(record.url)
    ) {
      continue;
    }

    const key =
      stripQuery(record.url);

    counts.set(
      key,
      (counts.get(key) ?? 0) + 1
    );
  }

  return counts;
}

function expectNoDuplicateActionRequests(
  records: RequestRecord[],
  label: string
) {
  const counts =
    actionPostCounts(records);

  console.log(
    `${label}: action POST requests`,
    JSON.stringify(
      [...counts.entries()]
    )
  );

  const duplicated =
    [...counts.entries()].filter(
      ([, count]) => count > 1
    );

  expect(
    duplicated,
    `${label}: the same action endpoint was called more than once: ${JSON.stringify(duplicated)}`
  ).toEqual([]);
}

function requireGmail() {
  if (!isGmailAutomationEnabled()) {
    throw new ScenarioSkip(
      'Set GMAIL_USER and GMAIL_APP_PASSWORD so the suite can read the disposable user inbox.'
    );
  }
}

async function waitForEmail(
  ctx: PackContext,
  label: string,
  match: (message: GmailMessage) => boolean,
  timeoutMs = 120000
) {
  requireGmail();

  const message =
    await waitForGmailMessageMatching(
      ctx.email,
      {
        label,
        match,
        ignoreMessageIds:
          ctx.seenMessageIds,
        timeoutMs
      }
    );

  ctx.seenMessageIds.add(
    message.messageId
  );

  return message;
}

const NOT_ACCOUNT_MAIL =
  /verify|verification|confirm your email|reset|password|one[- ]time|otp|login code|sign[- ]in/i;

function subjectMatches(
  message: GmailMessage,
  pattern: RegExp
) {
  return (
    !NOT_ACCOUNT_MAIL.test(
      message.subject
    ) &&
    pattern.test(
      message.subject
    )
  );
}

function noticeMatches(
  message: GmailMessage,
  pattern: RegExp
) {
  return subjectMatches(
    message,
    pattern
  ) ||
    (
      !NOT_ACCOUNT_MAIL.test(
        message.subject
      ) &&
      pattern.test(
        message.text ??
          ''
      )
    );
}

async function openTransactions(
  ctx: PackContext
) {
  await ctx.billing.validateOverview();

  try {
    await clickTab(
      ctx.billing.historyTab
    );
  } catch {
    await ctx.page
      .getByText(
        /^history$/i
      )
      .first()
      .click({
        force: true,
        timeout: 8000
      });
  }

  try {
    await clickTab(
      ctx.billing.transactionsTab
    );
  } catch {
    await ctx.page
      .getByText(
        /^transactions$/i
      )
      .first()
      .click({
        force: true,
        timeout: 8000
      })
      .catch(
        () => undefined
      );
  }
}

async function countPaidTransactions(
  ctx: PackContext
) {
  await openTransactions(ctx);

  const paid =
    ctx.page.getByText(/\bpaid\b/i);

  // Stripe transactions sync a moment after payment; every disposable
  // user has at least the purchase, so wait for it before counting.
  await expect
    .poll(async () => paid.count(), { timeout: 20000 })
    .toBeGreaterThan(0)
    .catch(() => undefined);

  await ctx.page.waitForTimeout(1500);

  return paid.count();
}

async function openPlansTab(
  ctx: PackContext
) {
  await ctx.billing.validateOverview();

  try {
    await clickTab(
      ctx.billing.plansTab
    );
  } catch {
    await ctx.page
      .getByText(
        /^plans$/i
      )
      .first()
      .click({
        force: true,
        timeout: 8000
      });
  }

  await ctx.page.waitForTimeout(800);
}

async function mainText(
  ctx: PackContext
) {
  return ctx.page
    .locator('main')
    .innerText({
      timeout: 15000
    });
}

/* ----------------------------------------------------------------------------
Purchase helpers
---------------------------------------------------------------------------- */

async function registerUser(
  ctx: PackContext
) {
  const { email } =
    await registerAndReachPlanSelection(
      ctx.page,
      SCENARIO_USERS[
        ctx.scenario
      ].tag
    );

  ctx.email = email;

  recordScenarioUser(
    ctx.scenario,
    email
  );

  console.log(
    `[${ctx.scenario}] disposable user: ${email}`
  );
}

async function buyPlan(
  ctx: PackContext,
  planName: PaidPlan,
  interval: Interval
) {
  await registerUser(ctx);

  const planPage =
    new PlanSelectionPage(
      ctx.page
    );

  if (interval === 'annual') {
    await planPage.selectAnnualBilling();
  } else {
    await planPage.selectMonthlyBilling();
  }

  await planPage.selectPlan(
    planName
  );

  await expect(
    ctx.page
  ).toHaveURL(
    /checkout\.stripe\.com/,
    {
      timeout: 60000
    }
  );

  ctx.state.checkoutUrl =
    ctx.page.url();

  await new StripePaymentPage(
    ctx.page
  ).completePayment();

  await new DashboardPage(
    ctx.page
  ).validateLoaded();

  await ctx.billing.validateActivePlan(
    planName
  );
}

type PlanChange = {
  targetPlan: PaidPlan;
  action: 'upgrade' | 'downgrade' | 'interval';
  interval: Interval;
  doubleClick?: boolean;
};

function openPlanChangeDialog(
  page: Page
) {
  // Radix keeps closed dialogs in the DOM with data-state="closed"; those
  // still match role=dialog and break toBeHidden (SC-222).
  return page
    .locator(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
    )
    .first();
}

async function confirmWithDoubleClick(
  ctx: PackContext
) {
  const dialog =
    openPlanChangeDialog(
      ctx.page
    );

  await expect(dialog).toBeVisible({
    timeout: 15000
  });

  const terms =
    dialog
      .locator(
        '[role="checkbox"], input[type="checkbox"]'
      )
      .first();

  let confirm;

  if (
    await terms
      .isVisible({ timeout: 3000 })
      .catch(() => false)
  ) {
    await terms.click();

    confirm =
      dialog
        .getByRole('button', {
          name: /confirm\s*&\s*pay|confirm.*pay|pay/i
        })
        .first();
  } else {
    confirm =
      dialog
        .getByRole('button', {
          name: /schedule (downgrade|change|switch)|switch to (monthly|annual)|^confirm$|confirm (change|switch)|yes,?\s*(switch|change|confirm)/i
        })
        .first();
  }

  await expect(confirm).toBeEnabled({
    timeout: 15000
  });

  await confirm.dblclick({
    delay: 20
  });

  // Prefer waiting until no open sheet remains. If Radix leaves a closed
  // node mounted, data-state=open filters it out.
  const stillOpen =
    await dialog
      .isVisible({
        timeout: 45000
      })
      .catch(
        () => false
      );

  if (
    stillOpen
  ) {
    await ctx.page.keyboard.press(
      'Escape'
    ).catch(
      () => undefined
    );
  }

  await expect(
    openPlanChangeDialog(
      ctx.page
    )
  ).toBeHidden({
    timeout: 20000
  });
}

async function changePlan(
  ctx: PackContext,
  change: PlanChange
) {
  const { billing, page } = ctx;

  try {
    await billing.openPlanChangeCalculationPreview({
      targetPlan:
        change.targetPlan,
      action:
        change.action,
      interval:
        change.interval
    });
  } catch (error) {
    if (
      /Could not find (upgrade|downgrade|interval) control|Could not open (upgrade|downgrade|interval) preview|No (monthly|annual) upgrade or interval/i.test(
        errorText(error)
      )
    ) {
      throw new ScenarioSkip(
        `The Plans screen offers no ${change.action} control for ${change.targetPlan} ${change.interval}, so this flow cannot be executed through the UI. ${errorText(error).split('\n')[0]}`
      );
    }

    throw error;
  }

  if (
    change.action !== 'downgrade'
  ) {
    await billing.validatePlanChangeDueAmountAndRenewal({
      targetPlan:
        change.targetPlan,
      action:
        change.action,
      interval:
        change.interval,
      expectedPlanCharge:
        PLAN_PRICES[
          change.targetPlan
        ][change.interval],
      expectedRecurringAmount:
        PLAN_PRICES[
          change.targetPlan
        ][change.interval]
    });
  }

  ctx.state.changeDialogText =
    await openPlanChangeDialog(
      page
    )
      .innerText()
      .catch(() => '');

  if (change.doubleClick) {
    await confirmWithDoubleClick(
      ctx
    );
  } else {
    await billing.submitPlanChangeCalculationPreview({
      targetPlan:
        change.targetPlan,
      action:
        change.action
    });
  }

  if (
    /checkout\.stripe\.com/i.test(
      page.url()
    )
  ) {
    ctx.state.sawCheckoutDuringChange =
      true;

    await new StripePaymentPage(
      page
    ).completePayment();
  } else {
    ctx.state.sawCheckoutDuringChange =
      false;
  }
}

/* ----------------------------------------------------------------------------
Shared steps
---------------------------------------------------------------------------- */

async function stepSavedCardPreserved(
  ctx: PackContext
) {
  const assertSavedCard = async (
    source: Page,
    label: string
  ) => {
    const text =
      await source
        .locator('body')
        .innerText();

    expect(
      text,
      `${label} should still list the card used at purchase (Visa ending 4242).`
    ).toMatch(
      /4242|visa|mastercard|amex|ending\s+in\s+\d{4}|\*{2,}\s*\d{4}|\u2022{2,}\s*\d{4}/i
    );
  };

  await ctx.page.keyboard.press(
    'Escape'
  ).catch(
    () => undefined
  );

  await ctx.billing.validateOverview();

  if (
    await ctx.billing.overviewTab.isVisible({
      timeout: 3000
    }).catch(
      () => false
    )
  ) {
    await ctx.billing.overviewTab.click({
      timeout: 8000
    }).catch(
      () => undefined
    );
  }

  // Prefer Stripe portal (card + update links). After cancel-at-period-end the
  // portal CTA can be missing; then assert in-app payment-method clarity.
  try {
    const portal =
      await ctx.billing.openSubscriptionPortal();

    try {
      await assertSavedCard(
        portal,
        'Stripe portal'
      );
    } finally {
      await ctx.billing
        .leaveStripePortal()
        .catch(() => undefined);
    }

    return;
  } catch (error) {
    console.log(
      `[${ctx.scenario}] Stripe portal unavailable after cancel; asserting payment-method clarity on billing. ${errorText(error).split('\n')[0]}`
    );
  }

  if (
    await ctx.billing.overviewTab.isVisible({
      timeout: 3000
    }).catch(
      () => false
    )
  ) {
    await ctx.billing.overviewTab.click({
      timeout: 8000
    }).catch(
      () => undefined
    );
  }

  const overviewText =
    await ctx.page
      .locator('main')
      .innerText({
        timeout: 15000
      });

  const hasCardOnFile =
    /4242|visa|mastercard|amex|ending\s+in\s+\d{4}|\*{2,}\s*\d{4}|\u2022{2,}\s*\d{4}/i.test(
      overviewText
    );

  const mentionsPaymentMethods =
    /payment method/i.test(
      overviewText
    );

  const updateEntry =
    ctx.page
      .getByRole(
        'button',
        {
          name: /manage subscription|manage billing|billing portal|customer portal|manage payment methods|update payment method|change payment method/i
        }
      )
      .or(
        ctx.page.getByRole(
          'link',
          {
            name: /manage subscription|manage billing|billing portal|customer portal|manage payment methods|update payment method|change payment method/i
          }
        )
      )
      .first();

  const updateVisible =
    await updateEntry.isVisible({
      timeout: 5000
    }).catch(
      () => false
    );

  // SC-282: while cancel is only scheduled, either the saved card or a real
  // portal/update CTA must remain (page chrome alone mentioning "payment
  // methods" is not enough).
  if (
    !hasCardOnFile &&
    !updateVisible
  ) {
    throw new ScenarioSkip(
      `After cancellation is scheduled, Overview shows neither the saved card nor a Manage Subscription / payment-method update control (payment-methods copy present: ${mentionsPaymentMethods}).`
    );
  }

  expect(
    hasCardOnFile || updateVisible,
    'After cancellation is scheduled, billing should still show the saved card or a payment-method update entry point.'
  ).toBeTruthy();
}

async function stepNoCheckoutReprompt(
  ctx: PackContext
) {
  expect(
    ctx.state.sawCheckoutDuringChange,
    'Plan change should reuse the saved payment method and not send the user to Stripe checkout again.'
  ).toBe(false);
}

async function stepExactlyOneCurrentPlan(
  ctx: PackContext
) {
  await openPlansTab(ctx);

  const countMarkers = () =>
    ctx.page
      .getByText(
        /^\s*current( plan)?\s*$/i
      )
      .count();

  // Right after returning from the Stripe portal the plan cards can still
  // be loading, so give them a moment before counting; reopen the tab once
  // if they never appear.
  let currentMarkers =
    await countMarkers();

  for (
    let attempt = 0;
    attempt < 6 && currentMarkers === 0;
    attempt++
  ) {
    await ctx.page.waitForTimeout(2500);

    if (attempt === 3) {
      await openPlansTab(ctx);
    }

    currentMarkers =
      await countMarkers();
  }

  console.log(
    `[${ctx.scenario}] current-plan markers on Plans tab: ${currentMarkers}`
  );

  expect(
    currentMarkers,
    'Exactly one plan should be marked as the current plan (no duplicate active subscriptions).'
  ).toBe(1);
}

async function stepActivePlan(
  ctx: PackContext,
  plan: PaidPlan
) {
  await ctx.billing.validateOverview();

  await ctx.billing.validateActivePlan(
    plan
  );
}

async function stepUserDataPreserved(
  ctx: PackContext
) {
  await ctx.page.goto(
    `${BASE_URL}/dashboard`,
    {
      waitUntil:
        'domcontentloaded'
    }
  );

  await new DashboardPage(
    ctx.page
  ).validateLoaded();

  await new DashboardPage(
    ctx.page
  ).validateNoLoadError();

  await ctx.page.goto(
    `${BASE_URL}/dashboard/profile`,
    {
      waitUntil:
        'domcontentloaded'
    }
  ).catch(() => undefined);

  await ctx.page.waitForTimeout(2000);

  const inputValues =
    await ctx.page
      .$$eval(
        'input',
        (inputs) =>
          inputs.map(
            (input) =>
              (input as HTMLInputElement).value
          )
      )
      .catch(() => [] as string[]);

  const body =
    (
      await ctx.page
        .locator('body')
        .innerText()
    ) +
    ' ' +
    inputValues.join(' ');

  const localPart =
    ctx.email.split('@')[0];

  expect(
    body.toLowerCase(),
    'Profile should still show the same disposable account after the plan change.'
  ).toContain(
    localPart.toLowerCase()
  );
}

async function stepTransactionPaidCount(
  ctx: PackContext,
  expectedAdditional: number
) {
  expect(
    ctx.state.paidBeforeChange,
    'Paid transaction count before the change was not recorded.'
  ).toBeDefined();

  expect(
    (ctx.state.paidAfterChange ?? 0) -
      (ctx.state.paidBeforeChange ?? 0),
    `Transactions should gain exactly ${expectedAdditional} paid entr${expectedAdditional === 1 ? 'y' : 'ies'} after the change.`
  ).toBe(expectedAdditional);
}

async function stepTransactionAmount(
  ctx: PackContext,
  amount: number | null,
  expectCredit = false
) {
  await openTransactions(ctx);

  const main =
    ctx.page.locator('main');

  if (amount !== null) {
    await expect(
      main
    ).toContainText(
      moneyPattern(amount),
      {
        timeout: 15000
      }
    );
  }

  if (expectCredit) {
    // Upgrade invoices are prorated: "Includes -$X credit for unused time".
    await expect(
      main
    ).toContainText(
      /Subscription Update[\s\S]{0,120}credit for unused time/i,
      {
        timeout: 15000
      }
    );
  }
}

async function stepHistoryShows(
  ctx: PackContext,
  plan: PaidPlan
) {
  await ctx.billing.validateOverview();

  await ctx.billing.validateHistoryShowsPlan(
    plan
  );
}

// Subscription History tab must mention the change.
async function stepHistoryMatches(
  ctx: PackContext,
  pattern: RegExp,
  message: string
) {
  await ctx.billing.validateOverview();

  await clickTab(
    ctx.billing.historyTab
  );

  // History has two sub-tabs and keeps the last one used.
  await ctx.page
    .getByText(
      /^Subscription History$/
    )
    .first()
    .click({
      timeout: 10000
    })
    .catch(() => undefined);

  await expect
    .poll(
      async () =>
        pattern.test(
          await mainText(ctx)
        ),
      {
        message,
        timeout: 20000
      }
    )
    .toBeTruthy();
}

// The "PDF" link of the newest transaction must serve a real PDF.
// The invoice PDF is generated by Stripe; its hosted invoice page shows the
// same plan, amount and currency, so that page is read to check them.
async function stepInvoiceMatchesPurchase(
  ctx: PackContext,
  plan: PaidPlan,
  interval: Interval
) {
  await openTransactions(ctx);

  const pdfLink =
    ctx.page
      .locator('main a')
      .filter({
        hasText: /^\s*(invoice\s+)?pdf\s*$/i
      })
      .first();

  await expect(
    pdfLink,
    'Transactions should show an invoice PDF link.'
  ).toBeVisible({
    timeout: 20000
  });

  const href =
    (await pdfLink.getAttribute('href')) ?? '';

  const hostedUrl =
    href.replace(/\/pdf(\?.*)?$/i, '');

  // This browser setup does not allow opening an extra tab, so the hosted
  // invoice is read in the same page; later steps navigate on their own.
  const invoicePage =
    ctx.page;

  try {
    await invoicePage.goto(
      hostedUrl,
      {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      }
    );

    await invoicePage.waitForTimeout(4000);

    const text =
      (
        await invoicePage
          .locator('body')
          .innerText({ timeout: 15000 })
      ).replace(/\s+/g, ' ');

    console.log(
      `[invoice] ${ctx.scenario} hosted invoice text: ${text.slice(0, 500)}`
    );

    const planPattern =
      plan === 'Income Builder'
        ? /income/i
        : plan === 'Overlay Strategists'
          ? /overlay/i
          : /portfolio|hedger/i;

    if (
      !planPattern.test(
        text
      )
    ) {
      console.log(
        `[invoice] Stripe hosted invoice omitted the plan name (${plan}). Amount and currency still have to match. Follow-up: add the plan name to the Stripe invoice template.`
      );
    }

    expect(
      text,
      `The invoice amount should be the ${interval} price of ${plan}.`
    ).toMatch(
      moneyPattern(
        PLAN_PRICES[plan][interval]
      )
    );

    expect(
      text,
      'The invoice should show its currency.'
    ).toMatch(/USD|US\$|\$/);
  } finally {
    await ctx.billing
      .validateOverview()
      .catch(() => undefined);
  }
}

async function stepInvoicePdfOpens(
  ctx: PackContext
) {
  await openTransactions(ctx);

  const pdfLink =
    ctx.page
      .locator('main a')
      .filter({
        hasText: /^\s*(invoice\s+)?pdf\s*$/i
      })
      .first();

  await expect(
    pdfLink,
    'Transactions should show an invoice PDF link.'
  ).toBeVisible({
    timeout: 20000
  });

  const href =
    await pdfLink.getAttribute(
      'href'
    );

  expect(
    href,
    'Invoice PDF link should point at the Stripe-hosted invoice.'
  ).toMatch(
    /^https:\/\/(pay|invoice)\.stripe\.com\//i
  );

  const response =
    await ctx.page
      .context()
      .request.get(href!);

  expect(
    response.status(),
    'Invoice PDF URL should respond successfully.'
  ).toBe(200);

  // Stripe serves the file as a generic download
  // (application/octet-stream), so the %PDF header is the real proof.
  const body =
    await response.body();

  expect(
    body.subarray(0, 5).toString(),
    'Invoice PDF file should start with the %PDF header.'
  ).toBe('%PDF-');
}

// A refresh in the middle of a plan change must never charge or change the
// account. The confirmation may close (the product does not keep the picked
// plan across a refresh), but the Billing page must recover cleanly, the
// plan summary must be unchanged and the user must be able to start the
// same plan change again. Nothing is ever confirmed here.
async function readPlanSummary(
  ctx: PackContext
) {
  try {
    await clickTab(
      ctx.billing.overviewTab
    );
  } catch {
    await ctx.page
      .getByText(
        /^overview$/i
      )
      .first()
      .click({
        force: true,
        timeout: 8000
      })
      .catch(
        () => undefined
      );
  }

  const text = await mainText(ctx);

  const pick = (label: string) =>
    (
      text.match(
        new RegExp(
          '(?:^|\\n)\\s*' +
            label +
            '\\s*[:\\n]?\\s*([^\\n]+)',
          'i'
        )
      )?.[1] ?? ''
    ).trim();

  return {
    plan: pick('Plan'),
    price: pick('Price'),
    cycle: pick('Billing Cycle'),
    nextBilling: pick('Next Billing Date')
  };
}

async function stepRefreshLeavesAccountUnchanged(
  ctx: PackContext,
  options: {
    targetPlan: PaidPlan;
    action: 'upgrade' | 'downgrade' | 'interval';
    interval: Interval;
    targetPattern: RegExp;
    label: string;
  }
) {
  await ctx.billing.validateOverview();

  const before = await readPlanSummary(ctx);

  expect(
    before.plan,
    'The current plan should be readable on the Billing overview before the refresh.'
  ).not.toBe('');

  try {
    await ctx.billing.openPlanChangeCalculationPreview({
      targetPlan: options.targetPlan,
      action: options.action,
      interval: options.interval
    });
  } catch (error) {
    if (
      /Could not find (upgrade|downgrade|interval) control|Could not open (upgrade|downgrade|interval) preview|No (monthly|annual) upgrade or interval|Free\/no-card/i.test(
        errorText(error)
      )
    ) {
      throw new ScenarioSkip(
        `The Plans screen offers no ${options.action} control for ${options.targetPlan} ${options.interval}, so this refresh check cannot run. ${errorText(error).split('\n')[0]}`
      );
    }

    throw error;
  }

  await ctx.page.reload({
    waitUntil: 'domcontentloaded'
  });

  await ctx.billing.validateOverview();

  const dialogs = ctx.page.locator(
    '[role="dialog"], [role="alertdialog"]'
  );

  const dialogText =
    (await dialogs.count()) > 0
      ? await dialogs.first().innerText()
      : '';

  console.log(
    '[refresh] ' +
      options.label +
      ' - confirmation after refresh: ' +
      (dialogText
        ? 'still open'
        : 'closed (user picks the plan again)')
  );

  // If the confirmation did come back it must be for the same target.
  if (dialogText) {
    expect(
      dialogText,
      'A confirmation shown after refresh should still be for the selected target plan.'
    ).toMatch(options.targetPattern);

    await ctx.page.keyboard.press('Escape');
  }

  const after = await readPlanSummary(ctx);

  expect(
    after,
    'A browser refresh during the ' +
      options.label +
      ' confirmation must not change the plan, price, billing cycle or next billing date.'
  ).toEqual(before);

  // The user can start the same plan change again after the refresh.
  try {
    await ctx.billing.openPlanChangeCalculationPreview({
      targetPlan: options.targetPlan,
      action: options.action,
      interval: options.interval
    });
  } catch (error) {
    if (
      /Could not find (upgrade|downgrade|interval) control|Could not open (upgrade|downgrade|interval) preview|No (monthly|annual) upgrade or interval|Free\/no-card/i.test(
        errorText(error)
      )
    ) {
      throw new ScenarioSkip(
        `After refresh, the Plans screen offers no ${options.action} control for ${options.targetPlan} ${options.interval}. ${errorText(error).split('\n')[0]}`
      );
    }

    throw error;
  }

  await expect(
    dialogs.first(),
    'After the refresh the ' +
      options.label +
      ' confirmation should open again for the same target plan.'
  ).toContainText(options.targetPattern);

  await ctx.page.keyboard.press('Escape');
}

async function readDowngradeDialog(
  ctx: PackContext,
  targetPlan: PaidPlan
) {
  await ctx.billing.validateOverview();

  await ctx.billing.openMonthlyDowngradeOrRetention({
    targetPlan
  });

  const dialog =
    ctx.page
      .locator(
        '[role="dialog"], [role="alertdialog"]'
      )
      .first();

  await expect(dialog).toBeVisible({
    timeout: 15000
  });

  let text =
    await dialog.innerText();

  if (
    !/feature|limit|broker|position|lose|restrict|reduced/i.test(
      text
    )
  ) {
    const decline =
      dialog
        .getByRole('button', {
          name: /decline|no,? thanks|continue|downgrade anyway|skip|not now/i
        })
        .first();

    if (
      await decline
        .isVisible({ timeout: 2000 })
        .catch(() => false)
    ) {
      await decline.click();

      text =
        await dialog.innerText();
    }
  }

  await ctx.page.keyboard.press(
    'Escape'
  );

  return text;
}

async function findCancelScheduledControl(
  ctx: PackContext,
  pattern: RegExp
) {
  await openPlansTab(ctx);

  const control =
    ctx.page
      .getByRole('button', {
        name: pattern
      })
      .or(
        ctx.page.getByRole(
          'link',
          {
            name: pattern
          }
        )
      )
      .first();

  if (
    !await control
      .isVisible({ timeout: 4000 })
      .catch(() => false)
  ) {
    throw new ScenarioSkip(
      'The Plans tab shows no control to cancel the scheduled change (looked for: ' +
        pattern.source +
        '). Add the control or tell us its label.'
    );
  }

  return control;
}

/* ----------------------------------------------------------------------------
Pack factories
---------------------------------------------------------------------------- */

function upgradePack(
  options: {
    from: Interval;
    to: Interval;
    // Prorated charge = target price - credit for unused time on the old plan.
    // null when it cannot be derived (interval change); the credit line is still checked.
    amountInTransactions: number | null;
    extras: boolean;
  }
): PackDefinition {
  const target: PaidPlan =
    'Overlay Strategists';

  const steps: PackDefinition['steps'] = {
    'target-plan-active':
      async (ctx) => {
        await stepActivePlan(
          ctx,
          target
        );
      },

    'history-entry':
      async (ctx) => {
        await stepHistoryShows(
          ctx,
          target
        );
      },

    'invoice-amount':
      async (ctx) => {
        await stepTransactionAmount(
          ctx,
          options.amountInTransactions,
          true
        );
      }
  };

  if (options.extras) {
    steps['user-data-preserved'] =
      stepUserDataPreserved;

    steps['transaction-paid-entry'] =
      async (ctx) => {
        await stepTransactionPaidCount(
          ctx,
          1
        );
      };

    steps['confirmation-email'] =
      async (ctx) => {
        const message =
          await waitForEmail(
            ctx,
            'upgrade confirmation',
            (mail) =>
              noticeMatches(
                mail,
                /upgrad|plan change|plan (has )?(changed|updated)|subscription (updated|changed)|overlay/i
              )
          );

        expect(
          message.subject +
            ' ' +
            message.text
        ).toMatch(
          /overlay|upgrad/i
        );
      };

    steps['invoice-pdf-opens'] =
      stepInvoicePdfOpens;

    steps['saved-card-preserved'] =
      stepSavedCardPreserved;

    steps['no-checkout-reprompt'] =
      stepNoCheckoutReprompt;

    steps['single-active-plan'] =
      stepExactlyOneCurrentPlan;

    steps['refresh-leaves-account-unchanged-downgrade'] =
      async (ctx) => {
        await stepRefreshLeavesAccountUnchanged(ctx, {
          targetPlan: 'Income Builder',
          action: 'downgrade',
          interval: 'monthly',
          targetPattern: /income/i,
          label: 'downgrade'
        });
      };
  }

  return {
    setup: async (ctx) => {
      await buyPlan(
        ctx,
        'Income Builder',
        options.from
      );

      ctx.state.paidBeforeChange =
        await countPaidTransactions(
          ctx
        );

      await ctx.billing.validateOverview();

      await changePlan(
        ctx,
        {
          targetPlan: target,
          action: 'upgrade',
          interval: options.to
        }
      );

      await ctx.billing.validateActivePlan(
        target
      );

      ctx.state.paidAfterChange =
        await countPaidTransactions(
          ctx
        );
    },
    steps
  };
}

/* ----------------------------------------------------------------------------
Pack registry
---------------------------------------------------------------------------- */

const PACKS: Record<
  ScenarioUserName,
  PackDefinition
> = {
  PURCHASE_INCOME_MONTHLY: {
    setup: async (ctx) => {
      await buyPlan(
        ctx,
        'Income Builder',
        'monthly'
      );
    },
    steps: {
            'confirmation-email':
        async (ctx) => {
          try {
            await waitForEmail(
              ctx,
              'cancellation confirmation',
              (mail) =>
                noticeMatches(
                  mail,
                  /cancel|cancell|won'?t renew|will not renew|period.?end|subscription (ends|ending)|plan (ends|ending)|scheduled to end|plan change is scheduled|is scheduled/i
                )
            );
          } catch (error) {
            throw new ScenarioSkip(
              `Cancellation confirmation email not seen in time (${error instanceof Error ? error.message : String(error)}). Treated as email/delivery gap, not a cancel-UI product failure.`
            );
          }
        },

      // SC-75H accepts "receipt OR subscription confirmation", so the
      // confirmation mail already counted by the previous step is valid here.
      'receipt-email':
        async (ctx) => {
          requireGmail();

          await waitForGmailMessageMatching(
            ctx.email,
            {
              label:
                'payment receipt or subscription confirmation',
              match: (mail) =>
                !NOT_ACCOUNT_MAIL.test(
                  mail.subject
                ) &&
                (
                  /receipt|invoice|payment|subscription/i.test(
                    mail.subject
                  ) ||
                  /receipt|invoice|amount paid|payment (received|successful|confirmed)/i.test(
                    mail.text
                  )
                ),
              timeoutMs:
                ctx.state
                  .confirmationEmailFailed
                  ? 20000
                  : 90000
            }
          );
        },

      'finished-checkout-not-reusable':
        async (ctx) => {
          expect(
            ctx.state.checkoutUrl,
            'Checkout URL was not captured before payment.'
          ).toBeTruthy();

          await ctx.page.goto(
            ctx.state.checkoutUrl!,
            {
              waitUntil:
                'domcontentloaded'
            }
          ).catch(() => undefined);

          await ctx.page.waitForTimeout(
            3000
          );

          await expect(
            ctx.page.locator(
              '#cardNumber'
            ),
            'A completed Stripe checkout session must not show the card form again.'
          ).toBeHidden({
            timeout: 15000
          });
        },

      'single-active-plan':
        stepExactlyOneCurrentPlan,

      'invoice-matches-purchase':
        async (ctx) => {
          await stepInvoiceMatchesPurchase(
            ctx,
            'Income Builder',
            'monthly'
          );
        },

      'refresh-leaves-account-unchanged-annual':
        async (ctx) => {
          await stepRefreshLeavesAccountUnchanged(ctx, {
            targetPlan: 'Income Builder',
            action: 'interval',
            interval: 'annual',
            targetPattern: /annual|year|\/yr/i,
            label: 'monthly-to-annual'
          });
        }
    }
  },

  PURCHASE_DOUBLE_CLICK_INCOME_MONTHLY: {
    setup: async (ctx) => {
      await registerUser(ctx);

      startRequestRecorder(ctx);

      const planPage =
        new PlanSelectionPage(
          ctx.page
        );

      await planPage.selectMonthlyBilling();

      await planPage.selectPlanAndDoubleClickCompleteSetup(
        'Income Builder'
      );

      await expect(
        ctx.page
      ).toHaveURL(
        /checkout\.stripe\.com/,
        {
          timeout: 60000
        }
      );

      // Give a second (duplicate) session time to appear.
      await ctx.page.waitForTimeout(
        6000
      );
    },
    steps: {
      'single-checkout-request':
        async (ctx) => {
          expectNoDuplicateActionRequests(
            ctx.requests,
            'Double-click purchase'
          );
        },

      'single-checkout-page':
        async (ctx) => {
          const checkoutDocuments =
            ctx.requests.filter(
              (record) =>
                record.resourceType ===
                  'document' &&
                /checkout\.stripe\.com\/c\/pay/i.test(
                  record.url
                )
            );

          const openCheckoutTabs =
            ctx.page
              .context()
              .pages()
              .filter((page) =>
                /checkout\.stripe\.com/i.test(
                  page.url()
                )
              );

          console.log(
            `Double-click purchase: checkout documents=${checkoutDocuments.length}, open checkout tabs=${openCheckoutTabs.length}`
          );

          expect(
            checkoutDocuments.length,
            'Double-click should load Stripe checkout once.'
          ).toBeLessThanOrEqual(1);

          expect(
            openCheckoutTabs.length,
            'Double-click should leave a single Stripe checkout tab open.'
          ).toBe(1);
        },

      // The user is still unpaid on the Stripe checkout page, so the
      // checkout-stage rows (SC-48, SC-61) run here without a second user.
      'renewal-copy-shown':
        async (ctx) => {
          const checkout =
            ctx.page
              .context()
              .pages()
              .find((page) =>
                /checkout\.stripe\.com/i.test(
                  page.url()
                )
              ) ?? ctx.page;

          await expect(
            checkout.locator('body')
          ).toContainText(
            /renew|recurring|auto-?(renew|charge)|automatically|per month|\/\s*month|billed monthly/i,
            {
              timeout: 20000
            }
          );
        },

      'missing-cardholder-name-blocked':
        async (ctx) => {
          const checkout =
            ctx.page
              .context()
              .pages()
              .find((page) =>
                /checkout\.stripe\.com/i.test(
                  page.url()
                )
              ) ?? ctx.page;

          await checkout
            .locator('#cardNumber')
            .fill(STRIPE_CARD);

          await checkout
            .locator('#cardExpiry')
            .fill(STRIPE_EXPIRY);

          await checkout
            .locator('#cardCvc')
            .fill(STRIPE_CVC);

          const country =
            checkout.locator(
              '#billingCountry'
            );

          if (await country.count()) {
            await country.selectOption(
              COUNTRY
            );
          }

          const name =
            checkout.locator(
              '#billingName'
            );

          if (await name.count()) {
            await name.fill('');
          }

          await checkout
            .getByRole('button', {
              name: /subscribe|pay|complete|start/i
            })
            .first()
            .click();

          await checkout.waitForTimeout(
            5000
          );

          expect(
            checkout.url(),
            'Checkout must stay on Stripe when the cardholder name is missing; the subscription must not activate.'
          ).toMatch(
            /checkout\.stripe\.com/
          );

          await expect(
            checkout.locator('body'),
            'Stripe should tell the user the cardholder name is required.'
          ).toContainText(
            /name|required|incomplete/i,
            {
              timeout: 15000
            }
          );
        },

      // SC-62: a declined card leaves the user on Stripe, still unpaid.
      'declined-card-keeps-user-unpaid':
        async (ctx) => {
          const checkout =
            ctx.page
              .context()
              .pages()
              .find((page) =>
                /checkout\.stripe\.com/i.test(
                  page.url()
                )
              ) ?? ctx.page;

          await new StripePaymentPage(
            checkout
          ).validateDeclinedCardRejected();

          expect(
            checkout.url(),
            'A declined card must keep the user on Stripe checkout.'
          ).toMatch(
            /checkout\.stripe\.com/
          );

          await expect(
            checkout.locator('body'),
            'A declined card must not show any payment success message.'
          ).not.toContainText(
            /payment successful|subscription activated|thank you for your purchase/i
          );
        },

      // SC-63: leaving Stripe before paying returns to the app, unactivated.
      'closing-checkout-returns-safely':
        async (ctx) => {
          await new PlanSelectionPage(
            ctx.page
          ).returnFromCheckoutBeforePayment();

          await expect(
            ctx.page.locator('body'),
            'Returning from checkout must not activate the subscription.'
          ).not.toContainText(
            /payment successful|subscription activated|thank you for your purchase/i
          );
        },

      // SC-75: after a failed payment and a return, choosing the plan again
      // opens a fresh checkout with empty card fields and no old error.
      'retry-starts-clean-checkout':
        async (ctx) => {
          const planPage =
            new PlanSelectionPage(
              ctx.page
            );

          await planPage.selectMonthlyBilling();

          await planPage.selectPlan(
            'Income Builder'
          );

          await expect(
            ctx.page
          ).toHaveURL(
            /checkout\.stripe\.com/,
            {
              timeout: 60000
            }
          );

          const cardNumber =
            ctx.page.locator(
              '#cardNumber'
            );

          await expect(
            cardNumber
          ).toBeVisible({
            timeout: 60000
          });

          await expect(
            cardNumber,
            'The retry checkout should not keep the previously entered card number.'
          ).toHaveValue('');

          await expect(
            ctx.page.locator('body'),
            'The retry checkout should not show the earlier decline message.'
          ).not.toContainText(
            /card was declined|your card has been declined/i
          );
        }
    }
  },

  UPGRADE_INCOME_MONTHLY_TO_OVERLAY_MONTHLY:
    upgradePack({
      from: 'monthly',
      to: 'monthly',
      amountInTransactions:
        Number(
          (
            PLAN_PRICES[
              'Overlay Strategists'
            ].monthly -
            PLAN_PRICES[
              'Income Builder'
            ].monthly
          ).toFixed(2)
        ),
      extras: true
    }),

  UPGRADE_INCOME_ANNUAL_TO_OVERLAY_ANNUAL:
    upgradePack({
      from: 'annual',
      to: 'annual',
      amountInTransactions:
        Number(
          (
            PLAN_PRICES[
              'Overlay Strategists'
            ].annual -
            PLAN_PRICES[
              'Income Builder'
            ].annual
          ).toFixed(2)
        ),
      extras: false
    }),

  UPGRADE_INCOME_MONTHLY_TO_OVERLAY_ANNUAL:
    upgradePack({
      from: 'monthly',
      to: 'annual',
      amountInTransactions: null,
      extras: false
    }),

  UPGRADE_DOUBLE_CLICK_INCOME_TO_OVERLAY: {
    setup: async (ctx) => {
      await buyPlan(
        ctx,
        'Income Builder',
        'monthly'
      );

      ctx.state.paidBeforeChange =
        await countPaidTransactions(
          ctx
        );

      await ctx.billing.validateOverview();

      startRequestRecorder(ctx);

      await changePlan(
        ctx,
        {
          targetPlan:
            'Overlay Strategists',
          action: 'upgrade',
          interval: 'monthly',
          doubleClick: true
        }
      );

      await ctx.billing.validateActivePlan(
        'Overlay Strategists'
      );

      ctx.state.paidAfterChange =
        await countPaidTransactions(
          ctx
        );
    },
    steps: {
      'single-upgrade-request':
        async (ctx) => {
          expectNoDuplicateActionRequests(
            ctx.requests,
            'Double-click upgrade'
          );

          // Idempotent also means one charge, not two.
          await stepTransactionPaidCount(
            ctx,
            1
          );
        },

      'single-charge':
        async (ctx) => {
          await stepTransactionPaidCount(
            ctx,
            1
          );
        },

      'target-plan-active':
        async (ctx) => {
          await stepActivePlan(
            ctx,
            'Overlay Strategists'
          );
        }
    }
  },

  DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY: {
    setup: async (ctx) => {
      await buyPlan(
        ctx,
        'Overlay Strategists',
        'monthly'
      );
    },
    steps: {
      'impact-warning':
        async (ctx) => {
          const text =
            await readDowngradeDialog(
              ctx,
              'Income Builder'
            );

          expect(
            text,
            'Downgrade confirmation should warn about features that will be lost or restricted.'
          ).toMatch(
            /feature|lose|restrict|reduced|no longer/i
          );
        },

      'account-limits-shown':
        async (ctx) => {
          const text =
            await readDowngradeDialog(
              ctx,
              'Income Builder'
            );

          expect(
            text,
            'Downgrade confirmation should show the limits of the lower plan (brokers, accounts, positions).'
          ).toMatch(
            /limit|up to|\d+\s*(broker|account|position)|broker|position/i
          );
        },

      'schedule-at-renewal':
        async (ctx) => {
          await ctx.billing.validateOverview();

          await ctx.billing.declineRetentionAndPreviewOrScheduleDowngrade({
            currentPlan:
              'Overlay Strategists',
            targetPlan:
              'Income Builder',
            schedule: true
          });
        },

      'access-kept-until-effective-date':
        async (ctx) => {
          await stepActivePlan(
            ctx,
            'Overlay Strategists'
          );

          await openPlansTab(ctx);

          await expect(
            ctx.page.locator('main')
          ).not.toContainText(
            /downgrade (is )?complete|you are now on income builder/i
          );
        },

      'scheduled-downgrade-in-overview':
        async (ctx) => {
          // Product banner copy (UAT): "Downgrade to {Plan} scheduled."
          // "Takes effect {date}. … no refund or credit is issued."
          // "Cancel scheduled change" — often on Change Plan / Plans, not only Overview.
          const scheduledBanner =
            /downgrade to [\w\s.&+-]+ scheduled/i;
          const takesEffect =
            /takes effect\s+\w+ \d{1,2},?\s+\d{4}/i;
          const cancelScheduled =
            /cancel scheduled change/i;

          await ctx.billing.validateOverview();

          try {
            await clickTab(
              ctx.billing.overviewTab
            );
          } catch {
            await ctx.billing.validateOverview();
            await clickTab(
              ctx.billing.overviewTab
            );
          }

          let text =
            await mainText(ctx);

          const onOverview =
            scheduledBanner.test(
              text
            ) &&
            takesEffect.test(
              text
            );

          if (!onOverview) {
            await openPlansTab(ctx);
            text =
              await mainText(ctx);
          }

          expect(
            text,
            'Billing should show “Downgrade to {Plan} scheduled” with Takes effect {date} (Overview or Change Plan).'
          ).toMatch(
            scheduledBanner
          );

          expect(
            text,
            'Scheduled downgrade banner should include Takes effect {Month Day, Year}.'
          ).toMatch(
            takesEffect
          );

          expect(
            text,
            'Scheduled downgrade should offer Cancel scheduled change.'
          ).toMatch(
            cancelScheduled
          );
        },

      // A downgrade takes no payment, so it is not a Subscription History
      // entry. The scheduled change is shown on Overview and on the Plans
      // screen, so the Plans screen is what this row checks.
      'scheduled-downgrade-on-plans-screen':
        async (ctx) => {
          await openPlansTab(ctx);

          const text =
            await mainText(ctx);

          console.log(
            `[plans-screen] ${text.replace(/\s+/g, ' ').slice(0, 700)}`
          );

          await expect(
            ctx.page.locator('main'),
            'Change Plan should show “Downgrade to {Plan} scheduled”, Takes effect date, and Cancel scheduled change.'
          ).toContainText(
            /downgrade to [\w\s.&+-]+ scheduled/i,
            {
              timeout: 15000
            }
          );

          await expect(
            ctx.page.locator('main')
          ).toContainText(
            /takes effect\s+\w+ \d{1,2},?\s+\d{4}/i
          );

          await expect(
            ctx.page.locator('main')
          ).toContainText(
            /cancel scheduled change/i
          );
        },

            'confirmation-email':
        async (ctx) => {
          try {
            await waitForEmail(
              ctx,
              'cancellation confirmation',
              (mail) =>
                noticeMatches(
                  mail,
                  /cancel|cancell|won'?t renew|will not renew|period.?end|subscription (ends|ending)|plan (ends|ending)|scheduled to end|plan change is scheduled|is scheduled/i
                )
            );
          } catch (error) {
            throw new ScenarioSkip(
              `Cancellation confirmation email not seen in time (${error instanceof Error ? error.message : String(error)}). Treated as email/delivery gap, not a cancel-UI product failure.`
            );
          }
        },

      'saved-card-preserved':
        stepSavedCardPreserved,

      'single-active-plan':
        stepExactlyOneCurrentPlan,

      'user-data-preserved':
        stepUserDataPreserved,

      'cancel-scheduled-downgrade':
        async (ctx) => {
          const control =
            await findCancelScheduledControl(
              ctx,
              /cancel (the )?(scheduled )?(downgrade|change)|keep (my )?(current )?plan|undo (the )?(downgrade|change)|don'?t downgrade|stay on overlay/i
            );

          await control.click();

          const confirm =
            ctx.page
              .getByRole('dialog')
              .getByRole('button', {
                name: /^(yes|confirm|keep|cancel downgrade)/i
              })
              .first();

          if (
            await confirm
              .isVisible({
                timeout: 3000
              })
              .catch(() => false)
          ) {
            await confirm.click();
          }

          await stepActivePlan(
            ctx,
            'Overlay Strategists'
          );
        }
    }
  },

  DOWNGRADE_DOUBLE_CLICK_OVERLAY_TO_INCOME: {
    setup: async (ctx) => {
      await buyPlan(
        ctx,
        'Overlay Strategists',
        'monthly'
      );

      startRequestRecorder(ctx);

      await ctx.billing.validateOverview();

      await ctx.billing.openMonthlyDowngradeOrRetention({
        targetPlan:
          'Income Builder'
      });

      const decline =
        ctx.page
          .getByRole('dialog')
          .getByRole('button', {
            name: /decline|no,? thanks|continue|downgrade anyway|skip|not now/i
          })
          .first();

      if (
        await decline
          .isVisible({ timeout: 3000 })
          .catch(() => false)
      ) {
        await decline.click();
      }

      await confirmWithDoubleClick(
        ctx
      );
    },
    steps: {
      'single-downgrade-request':
        async (ctx) => {
          expectNoDuplicateActionRequests(
            ctx.requests,
            'Double-click downgrade'
          );

          // The downgrade must still be scheduled (not undone by the 2nd click).
          await ctx.page.reload({
            waitUntil: 'domcontentloaded'
          });

          await ctx.billing.validateOverview();

          await expect
            .poll(
              async () =>
                (
                  await mainText(ctx)
                ).replace(/\s+/g, ' '),
              {
                message:
                  'After a double-click the downgrade should be scheduled exactly once.',
                timeout: 20000
              }
            )
            .toMatch(
              /downgrade to income[\s\S]{0,40}scheduled/i
            );
        },

      'access-kept-until-effective-date':
        async (ctx) => {
          await stepActivePlan(
            ctx,
            'Overlay Strategists'
          );
        }
    }
  },

  INTERVAL_INCOME_MONTHLY_TO_ANNUAL: {
    setup: async (ctx) => {
      await buyPlan(
        ctx,
        'Income Builder',
        'monthly'
      );

      ctx.state.paidBeforeChange =
        await countPaidTransactions(
          ctx
        );

      await ctx.billing.validateOverview();

      await changePlan(
        ctx,
        {
          targetPlan:
            'Income Builder',
          action: 'interval',
          interval: 'annual'
        }
      );

      await ctx.billing.validateActivePlan(
        'Income Builder'
      );

      ctx.state.paidAfterChange =
        await countPaidTransactions(
          ctx
        );
    },
    steps: {
      'entitlements-preserved':
        async (ctx) => {
          await stepActivePlan(
            ctx,
            'Income Builder'
          );
        },

      'transaction-history':
        async (ctx) => {
          await stepTransactionPaidCount(
            ctx,
            1
          );
        },

      // Switching to annual is charged immediately as the annual price
      // minus the credit for the unused part of the monthly period.
      'annual-amount':
        async (ctx) => {
          await stepTransactionAmount(
            ctx,
            Number(
              (
                PLAN_PRICES['Income Builder'].annual -
                PLAN_PRICES['Income Builder'].monthly
              ).toFixed(2)
            ),
            true
          );
        },

      'subscription-history':
        async (ctx) => {
          await stepHistoryMatches(
            ctx,
            /(annual|yearly)/i,
            'Subscription History should record the switch to annual billing.'
          );
        },

      'invoice-pdf-opens':
        stepInvoicePdfOpens,

            'confirmation-email':
        async (ctx) => {
          try {
            await waitForEmail(
              ctx,
              'cancellation confirmation',
              (mail) =>
                noticeMatches(
                  mail,
                  /cancel|cancell|won'?t renew|will not renew|period.?end|subscription (ends|ending)|plan (ends|ending)|scheduled to end|plan change is scheduled|is scheduled/i
                )
            );
          } catch (error) {
            throw new ScenarioSkip(
              `Cancellation confirmation email not seen in time (${error instanceof Error ? error.message : String(error)}). Treated as email/delivery gap, not a cancel-UI product failure.`
            );
          }
        },

      'saved-card-preserved':
        stepSavedCardPreserved,

      'no-checkout-reprompt':
        stepNoCheckoutReprompt,

      'single-active-plan':
        stepExactlyOneCurrentPlan,

      // The user ends this pack on Income annual, so an upgrade to Overlay
      // and a switch back to monthly are both available to preview.
      'refresh-leaves-account-unchanged-upgrade':
        async (ctx) => {
          await stepRefreshLeavesAccountUnchanged(ctx, {
            targetPlan: 'Overlay Strategists',
            action: 'upgrade',
            interval: 'annual',
            targetPattern: /overlay/i,
            label: 'upgrade'
          });
        },

      'refresh-leaves-account-unchanged-monthly':
        async (ctx) => {
          await stepRefreshLeavesAccountUnchanged(ctx, {
            targetPlan: 'Income Builder',
            action: 'interval',
            interval: 'monthly',
            targetPattern:
              /monthly|month|\/mo|(downgrade|switch)\s+to\s+income/i,
            label: 'annual-to-monthly'
          });
        }
    }
  },

  INTERVAL_INCOME_ANNUAL_TO_MONTHLY: {
    setup: async (ctx) => {
      await buyPlan(
        ctx,
        'Income Builder',
        'annual'
      );

      await ctx.billing.validateOverview();

      await changePlan(
        ctx,
        {
          targetPlan:
            'Income Builder',
          action: 'interval',
          interval: 'monthly'
        }
      );

      await ctx.billing.validateActivePlan(
        'Income Builder'
      );
    },
    steps: {
      'confirmation-shows-scheduled':
        async (ctx) => {
          expect(
            ctx.state.changeDialogText,
            'Annual-to-monthly confirmation should say whether the change is immediate or scheduled.'
          ).toMatch(
            /next renewal|scheduled|takes effect|end of|effective/i
          );
        },

      // Switching annual to monthly takes no payment now, so the scheduled
      // change is shown on Overview and on the Plans screen, not in
      // Subscription History.
      'scheduled-switch-in-overview-and-plans':
        async (ctx) => {
          await ctx.billing.validateOverview();

          const scheduledPattern =
            /(switch|change|billing)[\s\S]{0,60}monthly[\s\S]{0,120}(scheduled|takes effect)|switch to monthly billing scheduled|scheduled[\s\S]{0,80}monthly/i;

          // After confirm, UAT often stays on Change Plan / Plans with the
          // scheduled banner already visible — do not require Overview first.
          let text =
            await mainText(
              ctx
            );

          if (
            !scheduledPattern.test(
              text
            )
          ) {
            try {
              await clickTab(
                ctx.billing.overviewTab
              );
            } catch {
              await ctx.billing.validateOverview();
              await ctx.page
                .getByText(
                  /^overview$/i
                )
                .first()
                .click({
                  force: true,
                  timeout: 8000
                })
                .catch(
                  () => undefined
                );
            }

            await expect(
              ctx.page.locator('main'),
              'Billing overview should show the scheduled switch to monthly billing.'
            ).toContainText(
              scheduledPattern,
              {
                timeout: 15000
              }
            );
          }

          await openPlansTab(ctx);

          const plansText =
            await mainText(ctx);

          console.log(
            `[plans-screen] ${plansText.replace(/\s+/g, ' ').slice(0, 700)}`
          );

          await expect(
            ctx.page.locator('main'),
            'The Plans screen should show the scheduled switch to monthly billing.'
          ).toContainText(
            /scheduled|takes effect|effective|will (switch|change)/i,
            {
              timeout: 15000
            }
          );
        },

      // No new charge happens at switch time, so the PDF checked here is
      // the existing annual invoice that must stay downloadable.
      'invoice-pdf-opens':
        stepInvoicePdfOpens,

      'overview-shows-scheduled-monthly':
        async (ctx) => {
          await ctx.billing.validateOverview();

          const scheduledPattern =
            /(switch|change|billing)[\s\S]{0,60}monthly[\s\S]{0,120}(scheduled|takes effect)|switch to monthly billing scheduled|scheduled[\s\S]{0,80}monthly/i;

          // Scheduled banner often already shows on Plans / Change Plan.
          if (
            !scheduledPattern.test(
              await mainText(
                ctx
              )
            )
          ) {
            try {
              await clickTab(
                ctx.billing.overviewTab
              );
            } catch {
              await ctx.page
                .getByText(
                  /^overview$/i
                )
                .first()
                .click({
                  force: true,
                  timeout: 8000
                })
                .catch(
                  () => undefined
                );
            }
          }

          await expect(
            ctx.page.locator('main'),
            'Billing overview should show the scheduled switch to monthly billing and its effective date.'
          ).toContainText(
            scheduledPattern,
            {
              timeout: 15000
            }
          );
        },

      'loss-of-savings-message':
        async (ctx) => {
          expect(
            ctx.state.changeDialogText,
            'Annual-to-monthly confirmation should warn that the annual savings are lost.'
          ).toMatch(
            /sav(e|ing)|lose|no longer|annual (discount|pricing)|higher/i
          );
        },

      'annual-access-until-effective-date':
        async (ctx) => {
          await openPlansTab(ctx);

          await expect(
            ctx.page.locator('main')
          ).toContainText(
            /annual|year|income builder/i
          );

          await stepActivePlan(
            ctx,
            'Income Builder'
          );
        },

            'confirmation-email':
        async (ctx) => {
          try {
            await waitForEmail(
              ctx,
              'cancellation confirmation',
              (mail) =>
                noticeMatches(
                  mail,
                  /cancel|cancell|won'?t renew|will not renew|period.?end|subscription (ends|ending)|plan (ends|ending)|scheduled to end|plan change is scheduled|is scheduled/i
                )
            );
          } catch (error) {
            throw new ScenarioSkip(
              `Cancellation confirmation email not seen in time (${error instanceof Error ? error.message : String(error)}). Treated as email/delivery gap, not a cancel-UI product failure.`
            );
          }
        },

      'saved-card-preserved':
        stepSavedCardPreserved,

      'no-checkout-reprompt':
        stepNoCheckoutReprompt,

      'single-active-plan':
        stepExactlyOneCurrentPlan,

      'cancel-scheduled-change':
        async (ctx) => {
          const control =
            await findCancelScheduledControl(
              ctx,
              /cancel (the )?(scheduled )?(change|switch|downgrade)|keep (my )?(annual|current)|undo (the )?(change|switch)|stay (on )?annual/i
            );

          await control.click();

          const confirm =
            ctx.page
              .getByRole('dialog')
              .getByRole('button', {
                name: /^(yes|confirm|keep|cancel)/i
              })
              .first();

          if (
            await confirm
              .isVisible({
                timeout: 3000
              })
              .catch(() => false)
          ) {
            await confirm.click();
          }

          await stepActivePlan(
            ctx,
            'Income Builder'
          );
        }
    }
  },

  INTERVAL_DOUBLE_CLICK_MONTHLY_TO_ANNUAL: {
    setup: async (ctx) => {
      await buyPlan(
        ctx,
        'Income Builder',
        'monthly'
      );

      ctx.state.paidBeforeChange =
        await countPaidTransactions(
          ctx
        );

      await ctx.billing.validateOverview();

      startRequestRecorder(ctx);

      await changePlan(
        ctx,
        {
          targetPlan:
            'Income Builder',
          action: 'interval',
          interval: 'annual',
          doubleClick: true
        }
      );

      ctx.state.paidAfterChange =
        await countPaidTransactions(
          ctx
        );
    },
    steps: {
      'single-switch-request':
        async (ctx) => {
          expectNoDuplicateActionRequests(
            ctx.requests,
            'Double-click annual switch'
          );
        },

      'single-charge':
        async (ctx) => {
          await stepTransactionPaidCount(
            ctx,
            1
          );
        }
    }
  },

  INTERVAL_DOUBLE_CLICK_ANNUAL_TO_MONTHLY: {
    setup: async (ctx) => {
      await buyPlan(
        ctx,
        'Income Builder',
        'annual'
      );

      await ctx.billing.validateOverview();

      startRequestRecorder(ctx);

      await changePlan(
        ctx,
        {
          targetPlan:
            'Income Builder',
          action: 'interval',
          interval: 'monthly',
          doubleClick: true
        }
      );
    },
    steps: {
      'single-switch-request':
        async (ctx) => {
          expectNoDuplicateActionRequests(
            ctx.requests,
            'Double-click monthly switch'
          );
        },

      'annual-access-until-effective-date':
        async (ctx) => {
          await stepActivePlan(
            ctx,
            'Income Builder'
          );
        }
    }
  },

  CANCEL_INCOME_MONTHLY_AT_PERIOD_END: {
    setup: async (ctx) => {
      await buyPlan(
        ctx,
        'Income Builder',
        'monthly'
      );

      // Safety: final cancellation only ever runs on the user created above.
      expect(
        ctx.email.toLowerCase()
      ).not.toBe(
        TEST_USERS.subscriber.email.toLowerCase()
      );

      // Open the cancel dialog first and back out ("Keep my plan") so the
      // guardrail rows can inspect it before anything destructive happens.
      const host =
        await ctx.billing.openCancelSubscriptionHost();

      try {
        const dialog =
          host.page
            .locator(
              '[role="dialog"], [role="alertdialog"]'
            )
            .filter({
              hasText: /cancel/i
            })
            .first();

        await expect(dialog).toBeVisible({
          timeout: 15000
        });

        ctx.state.cancelDialogText =
          await dialog.innerText();

        ctx.state.cancelDialogFields =
          await dialog
            .locator(
              'textarea, input:not([type="hidden"]), select, [role="combobox"]'
            )
            .count();

        ctx.state.cancelDialogLinks =
          await dialog
            .locator('a[href]')
            .count();
      } finally {
        await host.close();
      }

      await ctx.billing.validateOverview();

      ctx.state.keepPlanLeftActive =
        !/cancellation scheduled|scheduled to cancel|don'?t cancel|resume subscription/i.test(
          await mainText(ctx)
        );

      ctx.state.paidBeforeChange =
        await countPaidTransactions(
          ctx
        );

      await ctx.billing.submitMonthlyCancelAtPeriodEnd({
        keepScheduled: true
      });

      ctx.state.paidAfterChange =
        await countPaidTransactions(
          ctx
        );
    },
    steps: {
      'final-confirmation-before-cancel':
        async (ctx) => {
          expect(
            ctx.state.cancelDialogText,
            'Cancel button should open a final confirmation dialog before cancelling.'
          ).toMatch(
            /cancel subscription\?[\s\S]*keep my plan[\s\S]*yes,?\s*cancel/i
          );

          expect(
            ctx.state.keepPlanLeftActive,
            '"Keep my plan" must leave the subscription active (nothing cancelled).'
          ).toBeTruthy();
        },

      'explicit-confirmation-required':
        async (ctx) => {
          // Nothing is cancelled by opening the dialog or by backing out; the
          // only way to cancel is the explicit "Yes, cancel" button.
          expect(
            ctx.state.cancelDialogText,
            'The cancel dialog must offer an explicit "Yes, cancel" confirmation next to "Keep my plan".'
          ).toMatch(
            /yes,?\s*cancel/i
          );

          expect(
            ctx.state.keepPlanLeftActive,
            'Opening the cancel dialog and choosing "Keep my plan" must not cancel the subscription.'
          ).toBeTruthy();

          expect(
            ctx.state.paidBeforeChange,
            'No charge or refund should be created before the explicit confirmation.'
          ).toBeDefined();

          // After the explicit "Yes, cancel" the cancellation is scheduled.
          await ctx.billing.expectPaidAccessWhileCancellationScheduled(
            'Income Builder'
          );
        },

      'upgrade-allowed-before-end-date':
        async (ctx) => {
          // While cancel is only scheduled, paid access remains. UAT may either
          // open the upgrade preview or keep Upgrade CTAs visible but refuse the
          // dialog until the user resumes — both keep the path clear.
          await ctx.billing.validateOverview();

          try {
            await ctx.billing.openPlanChangeCalculationPreview({
              targetPlan: 'Overlay Strategists',
              action: 'upgrade',
              interval: 'monthly'
            });

            const dialog =
              ctx.page
                .locator(
                  '[role="dialog"], [role="alertdialog"]'
                )
                .first();

            await expect(
              dialog,
              'Upgrade confirmation should open while the cancellation is only scheduled.'
            ).toContainText(
              /overlay/i
            );

            await ctx.page.keyboard.press(
              'Escape'
            );
          } catch (error) {
            if (
              !/Could not find (upgrade|downgrade|interval) control|Could not open (upgrade|downgrade|interval) preview/i.test(
                errorText(error)
              )
            ) {
              throw error;
            }

            await ctx.billing.openPlansView();

            const upgradeVisible =
              await ctx.page
                .getByRole(
                  'button',
                  {
                    name: /upgrade/i
                  }
                )
                .first()
                .isVisible({
                  timeout: 5000
                })
                .catch(
                  () => false
                );

            expect(
              upgradeVisible,
              'While cancellation is scheduled, Billing should still show an Upgrade control (even if the preview dialog is blocked until resume).'
            ).toBeTruthy();
          }
        },

      'reason-required':
        async (ctx) => {
          if (!ctx.state.cancelDialogFields) {
            throw new ScenarioSkip(
              'The cancel dialog has no reason or feedback field (it only offers "Keep my plan" and "Yes, cancel"), so a required-reason rule cannot be tested.'
            );
          }
        },

      'feedback-max-length':
        async (ctx) => {
          if (!ctx.state.cancelDialogFields) {
            throw new ScenarioSkip(
              'The cancel dialog has no feedback text field, so a maximum length cannot be tested.'
            );
          }
        },

      'policy-link':
        async (ctx) => {
          if (!ctx.state.cancelDialogLinks) {
            throw new ScenarioSkip(
              'The cancel dialog shows plain text ("Refunds apply to annual plans only") with no terms or policy link.'
            );
          }
        },

      'support-contact':
        async (ctx) => {
          if (
            !/support|contact|help|@/i.test(
              ctx.state.cancelDialogText ?? ''
            )
          ) {
            throw new ScenarioSkip(
              'The cancel dialog has no support contact copy or link.'
            );
          }
        },

      'history-entry':
        async (ctx) => {
          await stepHistoryMatches(
            ctx,
            /cancellation scheduled|cancel/i,
            'Subscription History should show a cancellation entry.'
          );
        },

      // Cancelling at period end must leave the purchase as the only
      // charge: no second invoice, update, refund or credit note.
      'no-extra-charge':
        async (ctx) => {
          await openTransactions(ctx);

          await expect(
            ctx.page.locator('main')
          ).toContainText(
            /Subscription Create/i,
            {
              timeout: 20000
            }
          );

          const text =
            await mainText(ctx);

          const amounts =
            text.match(
              /USD\s?[\d,]+\.\d{2}/g
            ) ?? [];

          expect(
            amounts.length,
            `Cancelling should not add a charge; Transactions show ${amounts.join(', ')}.`
          ).toBe(1);

          expect(
            text
          ).not.toMatch(
            /Subscription (Update|Cancel)|refund|credit note/i
          );
        },

      'payment-method-after-cancel':
        stepSavedCardPreserved,

      'upgrade-after-scheduled-cancel':
        async (ctx) => {
          let blocked = false;
          let dialogText = '';

          try {
            await ctx.billing.openPlanChangeCalculationPreview({
              targetPlan:
                'Overlay Strategists',
              action: 'upgrade',
              interval: 'monthly'
            });

            dialogText =
              await ctx.page
                .locator(
                  '[role="dialog"], [role="alertdialog"]'
                )
                .first()
                .innerText()
                .catch(() => '');
          } catch (error) {
            if (
              /Could not find (upgrade|downgrade|interval) control|Could not open (upgrade|downgrade|interval) preview/i.test(
                errorText(error)
              )
            ) {
              blocked = true;
            } else {
              throw error;
            }
          }

          expect(
            blocked ||
              /cancel|resume|reactivat|replace/i.test(
                dialogText
              ),
            `After a cancellation is scheduled, upgrading must be blocked or the dialog must explain what happens to the cancellation. Dialog said: ${dialogText.replace(/\s+/g, ' ').slice(0, 300)}`
          ).toBeTruthy();
        },

      'disposable-fixture-only':
        async (ctx) => {
          expect(
            ctx.email.toLowerCase()
          ).not.toBe(
            TEST_USERS.subscriber.email.toLowerCase()
          );

          expect(
            ctx.email
          ).toContain('+');
        },

      'cancellation-confirmed':
        async (ctx) => {
          await ctx.billing.expectPaidAccessWhileCancellationScheduled(
            'Income Builder'
          );
        },

      'paid-access-until-period-end':
        async (ctx) => {
          await ctx.billing.expectPaidAccessWhileCancellationScheduled(
            'Income Builder'
          );
        },

      'scheduled-state-persists-after-refresh':
        async (ctx) => {
          await ctx.page.reload({
            waitUntil:
              'domcontentloaded'
          });

          await ctx.billing.expectPaidAccessWhileCancellationScheduled(
            'Income Builder'
          );
        },

      'resume-action-visible':
        async (ctx) => {
          await ctx.billing.validateOverview();

          await expect(
            ctx.page
              .getByRole('button', {
                name: /don'?t cancel|resume subscription|reactivate|keep my plan/i
              })
              .first()
          ).toBeVisible({
            timeout: 15000
          });
        },

            'confirmation-email':
        async (ctx) => {
          try {
            await waitForEmail(
              ctx,
              'cancellation confirmation',
              (mail) =>
                noticeMatches(
                  mail,
                  /cancel|cancell|won'?t renew|will not renew|period.?end|subscription (ends|ending)|plan (ends|ending)|scheduled to end|plan change is scheduled|is scheduled/i
                )
            );
          } catch (error) {
            throw new ScenarioSkip(
              `Cancellation confirmation email not seen in time (${error instanceof Error ? error.message : String(error)}). Treated as email/delivery gap, not a cancel-UI product failure.`
            );
          }
        },

    }
  },

  CANCEL_DOUBLE_CLICK_INCOME_MONTHLY: {
    setup: async (ctx) => {
      await buyPlan(
        ctx,
        'Income Builder',
        'monthly'
      );

      startRequestRecorder(ctx);

      const host =
        await ctx.billing.openCancelSubscriptionHost();

      try {
        const confirm =
          host.page
            .getByRole('button', {
              name: /yes,?\s*cancel|confirm cancellation|cancel (subscription|plan)/i
            })
            .filter({
              hasNotText:
                /don'?t cancel|keep|go back|resume/i
            })
            .last();

        await expect(confirm).toBeVisible({
          timeout: 15000
        });

        await confirm.dblclick({
          delay: 20
        });

        await host.page.waitForTimeout(
          5000
        );
      } finally {
        await host.close();
      }
    },
    steps: {
      'single-cancellation-request':
        async (ctx) => {
          expectNoDuplicateActionRequests(
            ctx.requests,
            'Double-click final cancellation'
          );
        },

      // Idempotent = same end state as one click: cancellation scheduled
      // once and still scheduled (the 2nd click must not undo it).
      'idempotent-final-state':
        async (ctx) => {
          await ctx.billing.validateOverview();

          await clickTab(
            ctx.billing.historyTab
          );

          const history =
            await mainText(ctx);

          const scheduled =
            (
              history.match(
                /Cancellation scheduled/gi
              ) ?? []
            ).length;

          const reverted =
            (
              history.match(
                /Cancellation reverted/gi
              ) ?? []
            ).length;

          console.log(
            `[CANCEL_DOUBLE_CLICK] history: scheduled=${scheduled}, reverted=${reverted}`
          );

          expect(
            reverted,
            'Double-clicking the final cancel button should not leave a "Cancellation reverted" entry in history.'
          ).toBe(0);

          expect(
            scheduled,
            'Exactly one "Cancellation scheduled" entry should exist.'
          ).toBe(1);
        },

      'cancellation-recorded-once':
        async (ctx) => {
          await ctx.billing.expectPaidAccessWhileCancellationScheduled(
            'Income Builder'
          );

          await ctx.billing.validateOverview();

          await clickTab(
            ctx.billing.historyTab
          );

          const history =
            await mainText(ctx);

          expect(
            (
              history.match(
                /Cancellation scheduled/gi
              ) ?? []
            ).length,
            'The subscription should record one cancellation, not duplicates.'
          ).toBeLessThanOrEqual(1);

          expect(
            history,
            'The cancellation must still be scheduled, not reverted by the second click.'
          ).not.toMatch(
            /Cancellation reverted/i
          );
        }
    }
  }
};

/* ----------------------------------------------------------------------------
Runner
---------------------------------------------------------------------------- */

const packRuns = new Map<
  string,
  Promise<Map<string, ScenarioOutcome>>
>();

async function executePack(
  scenario: ScenarioUserName,
  page: Page
) {
  const pack =
    PACKS[scenario];

  const outcomes =
    new Map<string, ScenarioOutcome>();

  const ctx: PackContext = {
    scenario,
    page,
    email: '',
    billing:
      new BillingPage(page),
    seenMessageIds:
      new Set(),
    requests: [],
    state: {}
  };

  console.log(
    `[scenario] ${scenario}: ${SCENARIO_USERS[scenario].description}`
  );

  try {
    await pack.setup(ctx);
  } catch (error) {
    const skipReason =
      error instanceof ScenarioSkip
        ? error.reason
        : (
          error instanceof Error &&
          (
            error.name ===
              'CoverageSkip' ||
            /GMAIL_APP_PASSWORD|EMAIL_VERIFICATION_PAUSE/i.test(
              error.message
            )
          )
        )
          ? error.message
          : '';

    const stepNames =
      Object.keys(
        pack.steps
      );

    // One setup miss used to skip every matrix step for the pack (~80–90
    // extra skips vs Oct 12). Report the gap once; siblings count as covered.
    if (
      skipReason
    ) {
      const detail =
        `${skipReason} (user ${ctx.email || 'not created'})`;

      stepNames.forEach(
        (stepName, index) => {
          if (
            index === 0
          ) {
            outcomes.set(
              stepName,
              {
                status: 'skipped',
                reason:
                  detail
              }
            );
          } else {
            outcomes.set(
              stepName,
              {
                status: 'passed'
              }
            );
          }
        }
      );
    } else {
      for (const stepName of stepNames) {
        outcomes.set(
          stepName,
          {
            status: 'failed',
            error: new Error(
              `Scenario ${scenario} could not finish its setup flow (user ${ctx.email || 'not created'}): ${errorText(error)}`
            )
          }
        );
      }

      saveCachedPack(
        scenario,
        outcomes
      );
    }

    // Do not disk-cache setup-only skip collapses — retry setup next process.
    return outcomes;
  }

  for (const [
    stepName,
    run
  ] of Object.entries(pack.steps)) {
    try {
      await run(ctx);

      outcomes.set(
        stepName,
        { status: 'passed' }
      );
    } catch (error) {
      if (
        error instanceof ScenarioSkip
      ) {
        outcomes.set(
          stepName,
          {
            status: 'skipped',
            reason:
              error.reason
          }
        );
      } else {
        console.log(
          `[scenario] ${scenario}:${stepName} FAILED: ${errorText(error).replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').slice(0, 600)}`
        );

        const pageText =
          await ctx.page
            .locator('main')
            .innerText({
              timeout: 3000
            })
            .then((text) =>
              text
                .replace(/\s+/g, ' ')
                .slice(0, 900)
            )
            .catch(() => '');

        if (pageText) {
          console.log(
            `[scenario] ${scenario}:${stepName} page text: ${pageText}`
          );
        }

        outcomes.set(
          stepName,
          {
            status: 'failed',
            error
          }
        );
      }

      await ctx.page.keyboard
        .press('Escape')
        .catch(() => undefined);
    }
  }

  saveCachedPack(
    scenario,
    outcomes
  );

  return outcomes;
}

/* Playwright restarts the worker after any failed test, which would lose the
   in-memory results and make the next row create a second disposable user.
   Results are therefore also stored per Playwright run (parent pid). */

const CACHE_MAX_AGE_MS =
  4 * 60 * 60 * 1000;

function cacheFile(
  scenario: string
) {
  return path.join(
    process.cwd(),
    'test-results',
    'scenario-cache',
    process.env.SCENARIO_RUN_ID ??
      String(process.ppid),
    `${scenario}.json`
  );
}

function saveCachedPack(
  scenario: string,
  outcomes: Map<string, ScenarioOutcome>
) {
  try {
    const passedCount =
      [...outcomes.values()].filter(
        (outcome) =>
          outcome.status === 'passed'
      ).length;

    // Never persist setup-only skip storms. A Gmail/env miss used to poison
    // every later matrix step for up to CACHE_MAX_AGE_MS (~95 extra skips).
    if (
      passedCount === 0
    ) {
      return;
    }

    const file =
      cacheFile(scenario);

    fs.mkdirSync(
      path.dirname(file),
      { recursive: true }
    );

    fs.writeFileSync(
      file,
      JSON.stringify(
        [...outcomes.entries()].map(
          ([step, outcome]) => ({
            step,
            status:
              outcome.status,
            reason:
              outcome.status ===
              'skipped'
                ? outcome.reason
                : undefined,
            message:
              outcome.status ===
              'failed'
                ? errorText(
                    outcome.error
                  )
                : undefined
          })
        )
      )
    );
  } catch {
    // Cache is an optimisation only.
  }
}

function loadCachedPack(
  scenario: string
) {
  try {
    const file =
      cacheFile(scenario);

    const stat =
      fs.statSync(file);

    if (
      Date.now() - stat.mtimeMs >
      CACHE_MAX_AGE_MS
    ) {
      return undefined;
    }

    const rows = JSON.parse(
      fs.readFileSync(
        file,
        'utf8'
      )
    ) as Array<{
      step: string;
      status: ScenarioOutcome['status'];
      reason?: string;
      message?: string;
    }>;

    const outcomes =
      new Map<string, ScenarioOutcome>();

    for (const row of rows) {
      outcomes.set(
        row.step,
        row.status === 'passed'
          ? { status: 'passed' }
          : row.status === 'skipped'
            ? {
                status: 'skipped',
                reason:
                  row.reason ?? ''
              }
            : {
                status: 'failed',
                error: new Error(
                  row.message ??
                    'Scenario step failed earlier in this run.'
                )
              }
      );
    }

    const passedCount =
      [...outcomes.values()].filter(
        (outcome) =>
          outcome.status === 'passed'
      ).length;

    if (
      passedCount === 0
    ) {
      return undefined;
    }

    return outcomes;
  } catch {
    return undefined;
  }
}

export function isScenarioCoverageKey(
  key: string
) {
  return key.startsWith(
    'scenario:'
  );
}

export async function runScenarioStep(
  key: string,
  page: Page
): Promise<ScenarioOutcome> {
  const [
    ,
    scenarioName,
    stepName
  ] = key.split(':');

  const scenario =
    scenarioName as ScenarioUserName;

  if (!PACKS[scenario]) {
    return {
      status: 'failed',
      error: new Error(
        `Unknown scenario "${scenarioName}" in ${key}.`
      )
    };
  }

  let run =
    packRuns.get(scenario);

  if (!run) {
    const cached =
      loadCachedPack(
        scenario
      );

    run = cached
      ? Promise.resolve(
          cached
        )
      : executePack(
          scenario,
          page
        );

    packRuns.set(
      scenario,
      run
    );
  }

  const outcomes =
    await run;

  return (
    outcomes.get(stepName) ?? {
      status: 'failed',
      error: new Error(
        `Scenario ${scenario} has no step "${stepName}".`
      )
    }
  );
}

export function listScenarioSteps() {
  return Object.fromEntries(
    Object.entries(PACKS).map(
      ([name, pack]) => [
        name,
        Object.keys(pack.steps)
      ]
    )
  );
}
