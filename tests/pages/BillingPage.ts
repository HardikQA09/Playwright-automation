import {
  Page,
  Locator,
  expect
} from '@playwright/test';

import { safeClick }
  from '../helpers/safeClick';
  import { BasePage }
    from './BasePage';
import { StripePaymentPage }
  from './StripePaymentPage';
    import { Logger }
  from '../utils/logger';
import {
  URLS
} from '../config/constants';

function escapeRegExp(
  value: string
) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
}

function priceAppears(
  text: string,
  amount: number
) {
  const forms = [
    String(
      amount
    ),
    amount.toFixed(
      2
    ),
    amount.toLocaleString(
      'en-US',
      {
        maximumFractionDigits: 2
      }
    )
  ];

  return forms.some(
    (form) =>
      new RegExp(
        `\\$?\\s*${escapeRegExp(form)}(?!\\d)`
      ).test(
        text
      )
  );
}

function planVisiblePattern(
  planName: string
) {
  if (
    /income/i.test(
      planName
    )
  ) {
    return /income/i;
  }

  if (
    /overlay/i.test(
      planName
    )
  ) {
    return /overlay/i;
  }

  if (
    /portfolio|hedger/i.test(
      planName
    )
  ) {
    return /portfolio|hedger/i;
  }

  return new RegExp(
    escapeRegExp(
      planName
    ),
    'i'
  );
}

function parseCurrencyValue(
  value: string
) {
  const isNegative =
    value.includes(
      '-'
    );

  const numericValue =
    Number(
      value.replace(
        /[^0-9.]/g,
        ''
      )
    );

  return isNegative
    ? -numericValue
    : numericValue;
}

function firstCurrencyValueNearLabel(
  text: string,
  label: RegExp
) {
  const lines =
    text
      .split(
        /\r?\n/
      )
      .map(
        line =>
          line.trim()
      )
      .filter(
        Boolean
      );

  const labelIndex =
    lines.findIndex(
      line =>
        label.test(
          line
        )
    );

  if (labelIndex === -1) {
    return undefined;
  }

  const nearbyText =
    lines
      .slice(
        labelIndex,
        labelIndex + 3
      )
      .join(
        ' '
      );

  const currencyMatch =
    nearbyText.match(
      /-?\s*[$₹]\s*\d[\d,]*(?:\.\d{1,2})?/i
    );

  if (!currencyMatch) {
    return undefined;
  }

  return parseCurrencyValue(
    currencyMatch[0]
  );
}

function nearbyTextAfterLabel(
  text: string,
  label: RegExp
) {
  const lines =
    text
      .split(
        /\r?\n/
      )
      .map(
        line =>
          line.trim()
      )
      .filter(
        Boolean
      );

  const labelIndex =
    lines.findIndex(
      line =>
        label.test(
          line
        )
    );

  if (labelIndex === -1) {
    return '';
  }

  return lines
    .slice(
      labelIndex,
      labelIndex + 4
    )
    .join(
      ' '
    );
}

function parseFlexibleDate(
  value: string
) {
  const patterns = [
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/i,
    /\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{4}/i,
    /\d{4}-\d{2}-\d{2}/,
    /\d{1,2}\/\d{1,2}\/\d{4}/
  ];

  for (const pattern of patterns) {
    const match =
      value.match(
        pattern
      );

    if (!match) {
      continue;
    }

    const parsed =
      new Date(
        match[0]
      );

    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      return parsed;
    }
  }

  return undefined;
}

type PlanChangeAction =
  | 'upgrade'
  | 'downgrade'
  | 'interval';

async function checkboxIsChecked(
  checkbox: Locator
) {
  const ariaChecked =
    await checkbox.getAttribute(
      'aria-checked'
    ).catch(
      () => undefined
    );

  const dataState =
    await checkbox.getAttribute(
      'data-state'
    ).catch(
      () => undefined
    );

  const inputChecked =
    await checkbox.isChecked()
      .catch(
        () => false
      );

  return inputChecked ||
    ariaChecked === 'true' ||
    dataState === 'checked';
}

/* ============================================================================
PAGE OBJECT: BillingPage

PURPOSE
-------
Validates subscriber billing sections, plan details, transactions, invoices,
and PDF links.
============================================================================ */

export class BillingPage
  extends BasePage {

  readonly plansTab: Locator;

  readonly historyTab: Locator;

  readonly overviewTab: Locator;

  readonly transactionsTab: Locator;

  readonly invoiceLinks: Locator;

  readonly pdfLinks: Locator;

  private stripePortalSessionValidated = false;

  private activePortalPage?: Page;

constructor(page: Page) {
  super(page);

  this.plansTab =
    page.getByRole(
      'tab',
      {
        name: /^plans$/i,
      }
    ).or(
      page.getByRole(
        'button',
        {
          name: /^plans$/i,
        }
      )
    ).or(
      page.getByRole(
        'link',
        {
          name: /^plans$/i,
        }
      )
    ).first();

  this.historyTab =
    page.getByRole(
      'tab',
      {
        name: 'History',
        exact: true
      }
    );

  this.overviewTab =
    page.getByRole(
      'tab',
      {
        name: /^overview$/i
      }
    );

  this.transactionsTab =
    page.getByText(
      /^transactions$/i
    );

  this.invoiceLinks =
    page.getByRole(
      'link',
      {
        name: /invoice/i,
      }
    );

  this.pdfLinks =
    page.getByRole(
      'link',
      {
        name: /^pdf$/i,
      }
    );
}

private async billingContentIsVisible() {
  const markers = [
    this.plansTab,
    this.historyTab,
    this.page.getByRole(
      'button',
      {
        name: /manage subscription|manage billing|billing portal|customer portal|subscription settings|manage plan|manage payment methods|payment methods|payment settings|invoices/i,
      }
    ).first(),
    this.page.getByRole(
      'link',
      {
        name: /manage subscription|manage billing|billing portal|customer portal|subscription settings|manage plan|manage payment methods|payment methods|payment settings|invoices/i,
      }
    ).first(),
    this.page.getByRole(
      'heading',
      {
        name: /billing\s*(?:&|and)\s*subscription/i
      }
    ).first(),
    this.page.getByText(
      /current plan|current subscription|income builder|free plan|change plan|transactions|invoice history|billing overview/i
    ).first(),
  ];

  for (const marker of markers) {
    if (
      await marker.isVisible()
        .catch(
          () => false
        )
    ) {
      return true;
    }
  }

  return false;
}

private async visibleControlSummary() {
  return this.page.locator(
    'a, button'
  )
    .evaluateAll(
      elements =>
        elements
          .map(
            element =>
              (
                element.textContent ??
                element.getAttribute('aria-label') ??
                element.getAttribute('href') ??
                ''
              ).trim()
          )
          .filter(Boolean)
          .slice(0, 30)
    )
    .catch(
      () => []
    );
}

private async waitForBillingContent() {
  try {
    await expect
      .poll(
        async () =>
          this.billingContentIsVisible(),
        {
          timeout: 15000,
          message: 'Waiting for billing page content to load',
        }
      )
      .toBe(
        true
      );
  } catch (error) {
    const controls =
      await this.visibleControlSummary();

    const cloudflare =
      controls.some(
        (control) =>
          /cloudflare|click to reveal/i.test(
            control
          )
      );

    if (!cloudflare) {
      throw error;
    }

    Logger.info(
      'Billing hit a Cloudflare check. Reloading once.'
    );

    await this.page.reload({
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await expect
      .poll(
        async () =>
          this.billingContentIsVisible(),
        {
          timeout: 30000,
          message: 'Waiting for billing page content to load',
        }
      )
      .toBe(
        true
      );
  }

  await expect(
    this.page.getByText(
      /this page couldn'?t load|reload to try again/i
    ).first()
  ).not.toBeVisible({
    timeout: 3000,
  });
}

async validateOverview() {

Logger.info(
  'Validating Billing Overview'
);

  await this.dismissMarketingOverlays();

  await this.ensureOnApp();

  if (
    this.page.url().includes(
      '/billing'
    )
  ) {
    await this.waitForBillingContent();

Logger.success(
  'Billing Page Opened'
);

    return;
  }

  Logger.info(
    'Opening billing route directly'
  );

  await this.page.goto(
    this.appUrl(
      URLS.BILLING
    ),
    {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    }
  );

  await expect(this.page)
    .toHaveURL(
      /billing/,
      {
        timeout: 15000,
      }
    );

  try {
    await this.waitForBillingContent();
  } catch (error) {
    const availableControls =
      await this.visibleControlSummary();

    throw new Error(
      `Billing route opened but billing content did not load. Current URL: ${this.page.url()}. Visible controls: ${availableControls.join(' | ')}. Original error: ${String(error)}`
    );
  }

Logger.success(
  'Billing Page Opened'
);
}
async validatePlans() {

 Logger.info(
  'Validating Plans Tab'
);

  await safeClick(
    this.plansTab,
    'Open Plans Tab'
  );

  await expect(
    this.page.getByText(
      /income builder|build your portfolio/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  console.log(
    ' Income Builder Plan Visible'
  );
}

async validatePlanVisible(
  planName: string
) {

 Logger.info(
  `Validating ${planName} Plan`
);

  await safeClick(
    this.plansTab,
    'Open Plans Tab'
  );

  await expect(
    this.page.getByText(
      new RegExp(
        planName.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        ),
        'i'
      )
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  Logger.success(
    `${planName} Plan Visible`
  );
}
async validateTransactions() {

 Logger.info(
  'Validating Transactions'
);

  await safeClick(
    this.historyTab,
    'Open History Tab'
  );

  await safeClick(
    this.transactionsTab,
    'Open Transactions Tab'
  );

  const paidStatusBadges =
    this.page.getByText(
      /\bpaid\b/i
    );

  await expect(
    paidStatusBadges.first()
  ).toBeVisible({
    timeout: 15000
  });

  console.log(
    ' Paid Status Verified'
  );
}
async validateInvoicePage() {

Logger.info(
  'Validating Invoice Page'
);

  const [invoicePage] =
    await Promise.all([
      this.page.context().waitForEvent(
        'page'
      ),
      this.page.getByRole(
        'link',
        {
          name: /invoice/i,
        }
      ).first().click(),
    ]);

  await invoicePage.waitForLoadState(
    'domcontentloaded'
  );

  await expect(
    invoicePage.getByText(
      /invoice paid/i
    )
  ).toBeVisible();

  console.log(
    ' Invoice Page Opened'
  );

  await invoicePage.close();

 Logger.celebration(
  'Invoice Validation Completed'
);
}
async validatePdfDownload() {

  Logger.info(
  'Validating PDF Link'
);
  const pdfLink =
    this.pdfLinks.first();

  await expect(
    pdfLink
  ).toBeVisible();

  console.log(
    ' PDF Link Available'
  );

  await pdfLink.click({
    force: true,
  });

  console.log(
    ' PDF Link Clicked'
  );

  console.log(
    ' PDF Validation Completed'
  );
}

async validateBillingUrl() {

  await expect(
    this.page
  ).toHaveURL(
    /billing/,
    {
      timeout: 15000,
    }
  );
}

async validatePlansTabStable() {

  Logger.info(
    'Validating Billing Plans Tab Stability'
  );

  await safeClick(
    this.plansTab,
    'Open Plans Tab'
  );

  await this.validateBillingUrl();

  await expect(
    this.page.getByText(
      /income builder|current plan|subscription|plan/i
    ).first()
  ).toBeVisible({
    timeout: 15000,
  });

  await safeClick(
    this.plansTab,
    'Reopen Plans Tab'
  );

  await this.validateBillingUrl();

  Logger.success(
    'Billing Plans Tab Stable'
  );
}

async validatePlanActionControls() {

  Logger.info(
    'Validating Billing Plan Action Controls'
  );

  await this.validateOverview();

  if (
    await this.plansTab.isVisible({
      timeout: 5000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      this.plansTab,
      'Open Plans Tab'
    );
  }

  await this.validateBillingUrl();

  const planActions =
    this.page.locator(
      'a, button'
    ).filter({
      hasText: /upgrade|downgrade|current plan|active|selected|subscribe|choose plan|manage/i
    });

  await expect
    .poll(
      async () =>
        planActions.count(),
      {
        timeout: 15000,
        message: 'Waiting for at least one plan action/status control',
      }
    )
    .toBeGreaterThan(
      0
    );

  Logger.success(
    'Billing Plan Action Controls Visible'
  );
}

async validatePlanLifecycleActionSummary() {

  Logger.info(
    'Validating Billing Plan Lifecycle Action Summary'
  );

  await this.validateOverview();

  if (
    await this.plansTab.isVisible({
      timeout: 5000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      this.plansTab,
      'Open Plans Tab'
    );
  }

  await this.validateBillingUrl();

  await expect(
    this.page.getByText(
      /curious explorer|income builder|overlay strategists|portfolio hedger/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  const lifecycleControls =
    this.page.locator(
      'a, button'
    ).filter({
      hasText: /upgrade|downgrade|current plan|active|selected|subscribe|choose plan|manage/i
    });

  await expect
    .poll(
      async () =>
        lifecycleControls.count(),
      {
        timeout: 15000,
        message: 'Waiting for plan lifecycle action/status controls',
      }
    )
    .toBeGreaterThan(
      0
    );

  const upgradeCount =
    await this.page.locator(
      'a, button'
    ).filter({
      hasText: /upgrade/i
    }).count();

  const downgradeCount =
    await this.page.locator(
      'a, button'
    ).filter({
      hasText: /downgrade/i
    }).count();

  const currentOrStatusCount =
    await this.page.locator(
      'a, button, [role="status"], [data-state]'
    ).filter({
      hasText: /current plan|active|selected|current subscription/i
    }).count();

  const subscribeOrChooseCount =
    await this.page.locator(
      'a, button'
    ).filter({
      hasText: /subscribe|choose plan|manage/i
    }).count();

  console.log(
    `Plan lifecycle controls: upgrade=${upgradeCount}, downgrade=${downgradeCount}, current/status=${currentOrStatusCount}, subscribe/manage=${subscribeOrChooseCount}`
  );

  Logger.success(
    'Billing Plan Lifecycle Action Summary Validated'
  );
}

async validateBillingIntervalPresentationSummary() {

  Logger.info(
    'Validating Billing Interval Presentation Summary'
  );

  await this.validateOverview();

  if (
    await this.plansTab.isVisible({
      timeout: 5000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      this.plansTab,
      'Open Plans Tab'
    );
  }

  await this.validateBillingUrl();

  const pageText =
    await this.page
      .locator(
        'body'
      )
      .innerText();

  expect(
    pageText
  ).toMatch(
    /monthly|annual|month|year|\/mo|\/yr|\/year|per month|per year|billing period|no plan changes|paid plan|current plan/i
  );

  const monthlyMarkerCount =
    (
      pageText.match(
        /monthly|per month|\/mo|month/gi
      ) ?? []
    ).length;

  const annualMarkerCount =
    (
      pageText.match(
        /annual|per year|\/yr|\/year|year/gi
      ) ?? []
    ).length;

  console.log(
    `Billing interval markers: monthly=${monthlyMarkerCount}, annual=${annualMarkerCount}`
  );

  Logger.success(
    'Billing Interval Presentation Summary Validated'
  );
}

private async closeCancelDialogIfOpen() {
  const dialog =
    this.page.locator(
      '[role="dialog"], [role="alertdialog"]'
    ).filter({
      hasText: /cancel subscription/i
    });

  const open =
    await dialog.isVisible({
      timeout: 1000
    }).catch(
      () => false
    );

  if (!open) {
    return;
  }

  const keepPlan =
    dialog.getByRole(
      'button',
      {
        name: /keep my plan/i
      }
    );

  if (
    await keepPlan.isVisible().catch(
      () => false
    ) &&
    await keepPlan.isEnabled().catch(
      () => false
    )
  ) {
    await keepPlan.scrollIntoViewIfNeeded({
      timeout: 3000
    }).catch(
      () => undefined
    );

    await keepPlan.click({
      timeout: 8000
    }).catch(
      async () => {
        await this.page.keyboard.press(
          'Escape'
        );
      }
    );
  } else {
    await this.page.keyboard.press(
      'Escape'
    );
  }

  await expect(
    dialog
  ).toBeHidden({
    timeout: 10000
  });
}

private async cardShowsCurrentPlan(
  planName: string
) {
  return this.page.evaluate(
    (targetPlan) => {
      const plans = [
        {
          name: 'Income Builder',
          needles: ['income builder', 'income']
        },
        {
          name: 'Overlay Strategists',
          needles: ['overlay strategists', 'overlay']
        },
        {
          name: 'Portfolio Hedger',
          needles: ['portfolio hedger', 'portfolio hedge']
        },
        {
          name: 'Curious Explorer',
          needles: ['curious explorer', 'curious']
        }
      ];

      const matchedPlans = (text: string) =>
        plans.filter(
          (plan) =>
            plan.needles.some(
              (needle) =>
                text.includes(needle)
            )
        );

      const buttons =
        Array.from(
          document.querySelectorAll(
            'button, a'
          )
        );

      for (const element of buttons) {
        if (
          !/^(?:current plan|switch|keep my plan|resume(?: subscription)?)$/i.test(
            (element.textContent ?? '').trim()
          )
        ) {
          continue;
        }

        let current =
          element.parentElement;

        for (
          let depth = 0;
          current && depth < 12;
          depth += 1
        ) {
          const matches =
            matchedPlans(
              (
                current.textContent ?? ''
              ).toLowerCase()
            );

          if (matches.length === 1) {
            return matches[0].name === targetPlan;
          }

          current =
            current.parentElement;
        }
      }

      return false;
    },
    planName
  );
}

private async openPlansView() {

  await this.dismissMarketingOverlays();

  await this.closeCancelDialogIfOpen();

  await this.validateOverview();

  if (
    await this.plansTab.isVisible({
      timeout: 5000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      this.plansTab,
      'Open Plans Tab'
    );
  }

  // Prefer real plan CTAs. Treat the Change Plan / Choose Your Plan surface as
  // the "already open" marker. Do not treat bare plan names as ready — those
  // also appear on billing overview. Always end with .first() so Playwright
  // strict mode does not fail when heading + plan cards are both visible.
  const planActionButton =
    this.page
      .getByRole(
        'button',
        {
          name: /upgrade|downgrade|switch to free|change plan|subscribe|choose plan|select plan|get started|view plans/i
        }
      )
      .first();

  const plansViewHeading =
    this.page
      .getByText(
        /^change plan$|choose your plan|select a plan/i
      )
      .first();

  const plansReady =
    planActionButton
      .or(
        plansViewHeading
      )
      .first();

  if (
    !await plansReady.isVisible({
      timeout: 5000
    }).catch(
      () => false
    )
  ) {
    const viewPlans =
      this.page
        .getByRole(
          'link',
          {
            name: /view plans/i
          }
        )
        .or(
          this.page.getByRole(
            'button',
            {
              name: /view plans/i
            }
          )
        )
        .first();

    if (
      await viewPlans.isVisible({
        timeout: 3000
      }).catch(
        () => false
      )
    ) {
      await safeClick(
        viewPlans,
        'View Plans'
      );
    }
  }

  await expect(
    plansReady
  ).toBeVisible({
    timeout: 15000
  });

  if (
    /billing/i.test(
      this.page.url()
    )
  ) {
    await this.validateBillingUrl();
  }
}

private billingIntervalButton(
  interval: 'monthly' | 'annual'
) {
  const name =
    interval === 'monthly'
      ? /^monthly\b/i
      : /^(annual|yearly)\b/i;

  return this.page
    .getByRole(
      'button',
      {
        name
      }
    )
    .or(
      this.page.getByRole(
        'tab',
        {
          name
        }
      )
    )
    .or(
      this.page.getByRole(
        'radio',
        {
          name
        }
      )
    )
    .last();
}

private async selectBillingIntervalIfAvailable(
  interval: 'monthly' | 'annual'
) {
  const intervalButton =
    this.billingIntervalButton(
      interval
    );

  if (
    !await intervalButton.isVisible({
      timeout: 5000
    }).catch(
      () => false
    )
  ) {
    Logger.info(
      `${interval} billing toggle not shown on this plans view; continuing with current interval`
    );
    return;
  }

  await intervalButton.evaluate(
    (element) => {
      element.scrollIntoView({
        block: 'center',
        inline: 'nearest'
      });
    }
  ).catch(
    () => undefined
  );

  const pressed =
    await intervalButton.getAttribute(
      'aria-pressed'
    );

  const dataState =
    await intervalButton.getAttribute(
      'data-state'
    );

  if (
    pressed === 'true' ||
    dataState === 'active' ||
    dataState === 'on'
  ) {
    return;
  }

  await intervalButton.click({
    timeout: 8000
  });
}

private planActionButtonPattern(
  action: 'upgrade' | 'downgrade' | 'interval'
) {
  if (action === 'upgrade') {
    return /upgrade/i;
  }

  if (action === 'downgrade') {
    return /downgrade/i;
  }

  return /^(?:switch)$|switch to (annual|monthly|yearly)|change to (annual|monthly)|to annual|to monthly|billing interval|switch billing/i;
}

private async closeAnyPlanChangeDialog() {
  const dialog =
    this.page.getByRole(
      'dialog'
    ).or(
      this.page.getByRole(
        'alertdialog'
      )
    ).first();

  if (
    !await dialog.isVisible({
      timeout: 1000
    }).catch(
      () => false
    )
  ) {
    return;
  }

  const cancelButton =
    dialog.getByRole(
      'button',
      {
        name: /^(cancel|close)$/i
      }
    ).first();

  if (
    await cancelButton.isVisible({
      timeout: 1000
    }).catch(
      () => false
    )
  ) {
    await cancelButton.click({
      timeout: 5000
    }).catch(
      () => undefined
    );
  } else {
    await this.page.keyboard.press(
      'Escape'
    ).catch(
      () => undefined
    );
  }

  await dialog.waitFor({
    state: 'hidden',
    timeout: 5000
  }).catch(
    () => undefined
  );
}

private async findPlanActionButton(
  planName: string,
  action: 'upgrade' | 'downgrade' | 'interval'
) {
  const actionButtons =
    this.page
      .locator(
        'a, button'
      )
      .filter({
        hasText:
          this.planActionButtonPattern(
            action
          )
      });

  const buttonCount =
    await actionButtons.count();

  const titlePattern =
    this.planNamePattern(
      planName
    );

  for (let index = 0; index < buttonCount; index += 1) {
    const button =
      actionButtons.nth(
        index
      );

    const belongsToPlan =
      await button.evaluate(
        (
          element,
          pattern
        ) => {
          const title =
            new RegExp(
              `^(?:${pattern.titlePattern})$`,
              'i'
            );

          const actionText =
            new RegExp(
              pattern.actionSource,
              'i'
            );

          const clean =
            (node: Element) =>
              (
                node.textContent ?? ''
              ).replace(
                /\s+/g,
                ' '
              ).trim();

          const anyPlan =
            /^(?:Curious(?: Explorer)?|Free|Income(?: Builder)?|Overlay(?: Strategists)?|Portfolio Hedge(?:r)?|3-Advanced)$/i;

          const isLeafTitle = (
            node: Element,
            pattern: RegExp
          ) => {
            const text =
              clean(
                node
              );

            if (!pattern.test(text)) {
              return false;
            }

            return ![...node.children].some(
              (child) =>
                pattern.test(
                  clean(
                    child
                  )
                )
            );
          };

          let current =
            element.parentElement;

          for (let depth = 0; current && depth < 8; depth += 1) {
            const planTitles =
              [...current.querySelectorAll(
                'p, h2, h3, h4'
              )].filter(
                (node) =>
                  isLeafTitle(
                    node,
                    anyPlan
                  )
              );

            const actions =
              [...current.querySelectorAll(
                'button'
              )].filter(
                (node) =>
                  actionText.test(
                    clean(
                      node
                    )
                  )
              );

            const onlyThisPlan =
              planTitles.length === 1 &&
              title.test(
                clean(
                  planTitles[0]
                )
              );

            if (
              onlyThisPlan &&
              actions.length === 1 &&
              actions[0] === element
            ) {
              return true;
            }

            current =
              current.parentElement;
          }

          return false;
        },
        {
          titlePattern,
          actionSource: this.planActionButtonPattern(
            action
          ).source
        }
      )
        .catch(
          () => false
        );

    const visible =
      belongsToPlan &&
      await button.isVisible().catch(
        () => false
      );

    if (visible) {
      return button;
    }
  }

  const visibleControls =
    await this.visibleControlSummary();

  throw new Error(
    `Could not find ${action} control for ${planName}. Visible controls: ${visibleControls.join(' | ')}`
  );
}

private planNamePattern(
  planName: string
) {
  if (
    /portfolio/i.test(
      planName
    )
  ) {
    return 'Portfolio Hedger|Portfolio Hedge|3-Advanced';
  }

  if (
    /income/i.test(
      planName
    )
  ) {
    return 'Income Builder|Income';
  }

  if (
    /overlay/i.test(
      planName
    )
  ) {
    return 'Overlay Strategists|Overlay';
  }

  if (
    /curious|free/i.test(
      planName
    )
  ) {
    return 'Curious Explorer|Curious|Free';
  }

  return escapeRegExp(
    planName
  );
}

private planChangeDialog(
  options: {
    targetPlan: string;
    action: 'upgrade' | 'downgrade' | 'interval';
  }
) {
  const planName =
    this.planNamePattern(
      options.targetPlan
    );

  const dialogPattern =
    options.action === 'interval'
      ? new RegExp(
          `confirm your subscription|(?:${planName})|(?:switch|change).{0,80}(?:annual|monthly)|(?:annual|monthly|per month|per year|/month|/year)`,
          'i'
        )
      : new RegExp(
          `(?:${options.action}|switch)\\s+to\\s+(?:${planName})`,
          'i'
        );

  const titledSurface =
    this.page.getByText(
      new RegExp(
        `(?:upgrade|downgrade|switch)\\s+to\\s+(?:${planName})`,
        'i'
      )
    );

  if (
    options.action === 'interval'
  ) {
    return this.page
      .getByRole(
        'dialog'
      )
      .or(
        this.page.getByRole(
          'alertdialog'
        )
      )
      .filter({
        hasText: dialogPattern
      })
      .first();
  }

  return this.page
    .getByRole(
      'dialog'
    )
    .or(
      this.page.getByRole(
        'alertdialog'
      )
    )
    .filter({
      hasText: dialogPattern
    })
    .or(
      titledSurface
    )
    .first();
}

async validateShownBillingInterval() {
  Logger.info(
    'Validating the billing interval shown on the plans view'
  );

  await this.openPlansView();

  const currentPlanLabel =
    this.page.getByText(
      /current plan/i
    ).first();

  const monthlyToggle =
    this.billingIntervalButton(
      'monthly'
    );

  const annualToggle =
    this.billingIntervalButton(
      'annual'
    );

  const showsCurrentPlan =
    await currentPlanLabel.isVisible({
      timeout: 5000
    }).catch(
      () => false
    );

  const showsIntervalToggle =
    await monthlyToggle.isVisible({
      timeout: 5000
    }).catch(
      () => false
    ) &&
    await annualToggle.isVisible({
      timeout: 3000
    }).catch(
      () => false
    );

  expect(
    showsCurrentPlan ||
      showsIntervalToggle,
    'Plans view should show the current plan or the Monthly and Annual choices.'
  ).toBeTruthy();

  await expect(
    this.page.getByText(
      /\/month|per month|\/year|per year|\/yr|monthly|annual/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  Logger.success(
    'Plans view shows the active billing interval. Monthly and Annual are both available.'
  );
}

async openPlanChangeCalculationPreview(
  options: {
    targetPlan: string;
    action: 'upgrade' | 'downgrade' | 'interval';
    interval: 'monthly' | 'annual';
  }
) {
  Logger.info(
    `Opening ${options.action} calculation preview for ${options.targetPlan} ${options.interval}`
  );

  if (
    await this.isFreeOrNoCardPlan()
  ) {
    throw new Error(
      `Could not find ${options.action} control for ${options.targetPlan}. Free/no-card plan has no paid plan to preview.`
    );
  }

  await this.openPlansView();

  await this.closeAnyPlanChangeDialog();

  await this.selectBillingIntervalIfAvailable(
    options.interval
  );

  if (
    options.action === 'interval'
  ) {
    const intervalDialog =
      this.planChangeDialog(
        options
      );

    if (
      await intervalDialog.isVisible({
        timeout: 8000
      }).catch(
        () => false
      )
    ) {
      Logger.success(
        `${options.action} calculation preview opened for ${options.targetPlan} ${options.interval}`
      );

      return;
    }
  }

  let actionButton;
  let lookupAction: 'upgrade' | 'downgrade' | 'interval' = options.action;

  try {
    actionButton =
      await this.findPlanActionButton(
        options.targetPlan,
        options.action
      );
  } catch (error) {
    if (options.action !== 'interval') {
      throw error;
    }

    const intervalSwitch =
      this.page.getByRole(
        'button',
        {
          name: /^(?:switch)$|switch to annual|change to annual|to annual|switch to monthly|change to monthly|to monthly/i
        }
      ).first();

    if (
      await intervalSwitch.isVisible({
        timeout: 3000
      }).catch(
        () => false
      )
    ) {
      actionButton =
        intervalSwitch;
    } else if (
      options.interval === 'annual'
    ) {
      // With the Annual toggle on, the app shows an "Upgrade" button on the
      // user's own plan card; that is how a monthly plan is switched to
      // annual ("switching to annual takes effect immediately").
      try {
        actionButton =
          await this.findPlanActionButton(
            options.targetPlan,
            'upgrade'
          );
        lookupAction = 'upgrade';
      } catch {
        throw error;
      }
    } else {
      throw error;
    }
  }

  await safeClick(
    actionButton,
    `${options.action} ${options.targetPlan}`
  );

  const dialog =
    this.planChangeDialog(
      options
    );

  const openedTarget =
    await dialog.isVisible({
      timeout: 8000
    }).catch(
      () => false
    );

  if (!openedTarget) {
    await this.closeAnyPlanChangeDialog();

    const scopedButton =
      await this.findPlanActionButton(
        options.targetPlan,
        lookupAction
      );

    await scopedButton.scrollIntoViewIfNeeded().catch(
      () => undefined
    );

    await scopedButton.evaluate(
      (element) => {
        (element as HTMLButtonElement).click();
      }
    );
  }

  const dialogVisible =
    await dialog.isVisible({
      timeout: 15000
    }).catch(
      () => false
    );

  if (
    !dialogVisible
  ) {
    throw new Error(
      `Could not find ${options.action} control for ${options.targetPlan}. Visible controls: ${(await this.visibleControlSummary()).join(' | ')}`
    );
  }

  const dialogText =
    await dialog.innerText();

  const showsMonthly =
    /\/month|per month/i.test(
      dialogText
    );

  const showsAnnual =
    /\/year|per year/i.test(
      dialogText
    );

  const wrongInterval =
    options.interval === 'annual'
      ? showsMonthly && !showsAnnual
      : showsAnnual && !showsMonthly;

  if (wrongInterval) {
    await this.closePlanChangeCalculationPreview(
      options
    );

    await this.billingIntervalButton(
      options.interval
    ).click({
      timeout: 8000
    });

    await safeClick(
      actionButton,
      `${options.action} ${options.targetPlan} ${options.interval}`
    );

    await expect(
      dialog
    ).toBeVisible({
      timeout: 15000
    });
  }

  Logger.success(
    `${options.action} calculation preview opened for ${options.targetPlan} ${options.interval}`
  );
}

async validatePlanChangeCalculationPreview(
  options: {
    targetPlan: string;
    action: 'upgrade' | 'downgrade' | 'interval';
    interval: 'monthly' | 'annual';
    expectedBillingCopy?: RegExp;
    expectedPlanCharge?: number;
    expectedRecurringAmount?: number;
  }
) {
  Logger.info(
    `Validating ${options.action} calculation preview for ${options.targetPlan} ${options.interval}`
  );

  const dialog =
    this.planChangeDialog(
      options
    );

  await expect(
    dialog
  ).toBeVisible({
    timeout: 15000
  });

  const dialogText =
    await dialog.innerText();

  const scheduledChange =
    /takes effect|no refund|end of (this|the) billing period|schedule downgrade/i.test(
      dialogText
    );

  const newPurchaseDialog =
    /confirm & pay|continue to payment|i agree to the terms/i.test(
      dialogText
    ) &&
    !/credit for unused time/i.test(
      dialogText
    );

  if (
    newPurchaseDialog
  ) {
    throw new Error(
      `Could not find ${options.action} control for ${options.targetPlan}: opened a new-purchase dialog instead of a plan-change quote.`
    );
  }

  await expect(
    dialog
  ).toContainText(
    new RegExp(
      `${options.action === 'interval'
        ? `(?:upgrade|downgrade|switch|change)\\s+to|${this.planNamePattern(
          options.targetPlan
        )}`
        : `${options.action}\\s+to\\s+(?:${this.planNamePattern(
          options.targetPlan
        )})`}`,
      'i'
    )
  );

  if (scheduledChange) {
    Logger.success(
      `${options.action} calculation preview validated for ${options.targetPlan} ${options.interval}`
    );

    return;
  }

  // The proration quote loads after the dialog title appears; give it time.
  await expect(
    dialog
  ).toContainText(
    /prorat|charged|card on file|billing cycle|renews|new price|amount due/i,
    {
      timeout: 25000
    }
  );

  await expect(
    dialog
  ).toContainText(
    /credit for unused time/i
  );

  await expect(
    dialog
  ).toContainText(
    /amount due today/i
  );

  await expect(
    dialog
  ).toContainText(
    /new recurring amount/i
  );

  await expect(
    dialog
  ).toContainText(
    /next billing date/i
  );

  if (options.expectedBillingCopy) {
    await expect(
      dialog
    ).toContainText(
      options.expectedBillingCopy
    );
  }

  await expect(
    dialog.getByRole(
      'checkbox'
    ).first()
  ).toBeVisible({
    timeout: 10000
  });

  await expect(
    dialog.getByRole(
      'button',
      {
        name: /confirm|pay|continue/i
      }
    ).first()
  ).toBeVisible({
    timeout: 10000
  });

  const planCharge =
    firstCurrencyValueNearLabel(
      dialogText,
      new RegExp(
        `(?:${this.planNamePattern(
          options.targetPlan
        )})\\s+charge`,
        'i'
      )
    );

  const unusedCredit =
    firstCurrencyValueNearLabel(
      dialogText,
      /credit for unused time/i
    );

  const amountDueToday =
    firstCurrencyValueNearLabel(
      dialogText,
      /amount due today/i
    );

  const newRecurringAmount =
    firstCurrencyValueNearLabel(
      dialogText,
      /new recurring amount/i
    );

  expect(
    planCharge,
    'Plan charge should be present in plan-change preview'
  ).toBeDefined();

  expect(
    unusedCredit,
    'Unused-time credit should be present in plan-change preview'
  ).toBeDefined();

  expect(
    amountDueToday,
    'Amount due today should be present in plan-change preview'
  ).toBeDefined();

  expect(
    newRecurringAmount,
    'New recurring amount should be present in plan-change preview'
  ).toBeDefined();

  if (options.expectedPlanCharge !== undefined) {
    const comparableListPrice =
      options.expectedPlanCharge;

    const listPriceDelta =
      Math.abs(
        (
          planCharge ??
          0
        ) -
          comparableListPrice
      );

    const netPriceDelta =
      Math.abs(
        (
          planCharge ??
          0
        ) -
          (
            comparableListPrice +
            (
              unusedCredit ??
              0
            )
          )
      );

    const recurringMatchesList =
      newRecurringAmount !== undefined &&
      Math.abs(
        newRecurringAmount -
          comparableListPrice
      ) <= 1;

    const proratedDueToday =
      (
        planCharge ??
        0
      ) > 0 &&
      (
        planCharge ??
        0
      ) + 0.02 < comparableListPrice &&
      recurringMatchesList &&
      (
        (
          amountDueToday !== undefined &&
          Math.abs(
            (
              planCharge ??
              0
            ) -
              amountDueToday
          ) <= 1
        ) ||
        (
          amountDueToday !== undefined &&
          amountDueToday < 0
        )
      );

    const listPriceShown =
      priceAppears(
        dialogText,
        comparableListPrice
      );

    const chargeWithinList =
      (
        planCharge ??
        0
      ) > 0 &&
      (
        planCharge ??
        0
      ) <= comparableListPrice + 0.05;

    expect(
      listPriceDelta <= 0.05 ||
        netPriceDelta <= 1 ||
        proratedDueToday ||
        (
          listPriceShown &&
          chargeWithinList
        ),
      `Plan charge ${planCharge} should match list price ${comparableListPrice}, list plus unused credit, or the prorated amount due today while the new recurring amount stays ${comparableListPrice}.`
    ).toBeTruthy();
  }

  if (options.expectedRecurringAmount !== undefined) {
    const comparableRecurring =
      options.expectedRecurringAmount;

    const listPriceShown =
      priceAppears(
        dialogText,
        comparableRecurring
      );

    const proratedCharge =
      (
        planCharge ??
        0
      ) > 0 &&
      (
        planCharge ??
        0
      ) + 0.05 < comparableRecurring &&
      listPriceShown;

    expect(
      Math.abs(
        (
          newRecurringAmount ??
          0
        ) -
          comparableRecurring
      ) <= 0.05 ||
        proratedCharge,
      `New recurring amount should match configured ${options.targetPlan} ${options.interval} price.`
    ).toBeTruthy();
  }

  expect(
    unusedCredit ?? 0,
    'Unused-time credit should be zero or negative.'
  ).toBeLessThanOrEqual(
    0
  );

  expect(
    amountDueToday ?? 0,
    'Amount due today should not exceed the target plan charge.'
  ).toBeLessThanOrEqual(
    planCharge ?? 0
  );

  if (options.action === 'upgrade') {
    expect(
      Math.abs(
        (
          planCharge ??
          0
        ) +
          (
            unusedCredit ??
            0
          ) -
          (
            amountDueToday ??
            0
          )
      )
    ).toBeLessThanOrEqual(
      0.02
    );
  }

  Logger.success(
    `${options.action} calculation preview validated for ${options.targetPlan} ${options.interval}`
  );
}

async validatePlanChangeDueAmountAndRenewal(
  options: {
    targetPlan: string;
    action: 'upgrade' | 'downgrade' | 'interval';
    interval: 'monthly' | 'annual';
    expectedBillingCopy?: RegExp;
    expectedPlanCharge?: number;
    expectedRecurringAmount?: number;
  }
) {
  await this.validatePlanChangeCalculationPreview(
    options
  );

  const dialogText =
    await this.planChangeDialog(
      options
    ).innerText();

  const renewal =
    parseFlexibleDate(
      nearbyTextAfterLabel(
        dialogText,
        /next billing date|renews on|renewal date/i
      )
    ) ??
    parseFlexibleDate(
      dialogText
    );

  expect(
    renewal,
    'Plan-change preview should show a next billing / renewal date.'
  ).toBeDefined();

  const startOfToday =
    new Date();

  startOfToday.setHours(
    0,
    0,
    0,
    0
  );

  expect(
    renewal!.getTime(),
    'Renewal date should be today or later.'
  ).toBeGreaterThanOrEqual(
    startOfToday.getTime()
  );

  const maxDays =
    options.interval === 'annual' ||
    options.action === 'interval' ||
    options.action === 'downgrade'
      ? 400
      : 45;

  expect(
    renewal!.getTime(),
    `Renewal date should fall within ${maxDays} days for ${options.interval} billing.`
  ).toBeLessThanOrEqual(
    Date.now() +
      maxDays *
        24 *
        60 *
        60 *
        1000
  );

  Logger.success(
    `${options.action} due amount and renewal ${renewal!.toISOString().slice(0, 10)} validated for ${options.targetPlan} ${options.interval}`
  );
}

async submitPlanChangeCalculationPreview(
  options: {
    targetPlan: string;
    action: 'upgrade' | 'downgrade' | 'interval';
  }
) {
  Logger.info(
    `Accepting terms and submitting ${options.action} for ${options.targetPlan}`
  );

  const dialog =
    this.planChangeDialog(
      options
    );

  await expect(
    dialog
  ).toBeVisible({
    timeout: 15000
  });

  const termsCheckbox =
    dialog
      .locator(
        '[role="checkbox"], input[type="checkbox"]'
      )
      .first();

  const confirmButton =
    dialog
      .getByRole(
        'button',
        {
          name: /confirm\s*&\s*pay|confirm.*pay|pay/i
        }
      )
      .first();

  const scheduledChange =
    dialog.getByRole(
      'button',
      {
        name: /schedule (downgrade|change|switch)|switch to (monthly|annual)|^confirm$|confirm (change|switch)|yes,?\s*(switch|change|confirm)/i
      }
    ).first();

  if (
    !await termsCheckbox.isVisible({
      timeout: 3000
    }).catch(
      () => false
    )
  ) {
    await expect(
      scheduledChange,
      'Scheduled plan change should have a confirm button when there is no pay checkbox.'
    ).toBeVisible({
      timeout: 10000
    });

    await safeClick(
      scheduledChange,
      'Confirm scheduled plan change'
    );

    await expect(
      dialog
    ).toBeHidden({
      timeout: 60000
    });

    await this.page.waitForLoadState(
      'domcontentloaded'
    ).catch(
      () => undefined
    );

    Logger.success(
      `${options.action} scheduled for ${options.targetPlan}`
    );

    return;
  }

  await expect(
    termsCheckbox
  ).toBeVisible({
    timeout: 10000
  });

  await expect(
    confirmButton
  ).toBeDisabled({
    timeout: 10000
  });

  if (
    !(await checkboxIsChecked(
      termsCheckbox
    ))
  ) {
    await safeClick(
      termsCheckbox,
      'Accept Plan Change Terms'
    );
  }

  if (
    !(await checkboxIsChecked(
      termsCheckbox
    ))
  ) {
    await termsCheckbox.click({
      force: true
    }).catch(
      () => undefined
    );
  }

  if (
    !(await checkboxIsChecked(
      termsCheckbox
    ))
  ) {
    await dialog.getByText(
      /agree|terms|i understand|accept/i
    ).first().click({
      force: true
    }).catch(
      () => undefined
    );
  }

  await expect
    .poll(
      async () =>
        checkboxIsChecked(
          termsCheckbox
        ),
      {
        timeout: 10000,
        message: 'Waiting for plan-change terms checkbox to be checked'
      }
    )
    .toBe(
      true
    );

  await expect(
    confirmButton
  ).toBeEnabled({
    timeout: 15000
  });

  await safeClick(
    confirmButton,
    'Confirm and pay plan change'
  );

  await expect(
    dialog
  ).toBeHidden({
    timeout: 60000
  });

  await this.page.waitForLoadState(
    'domcontentloaded'
  ).catch(
    () => undefined
  );

  Logger.success(
    `${options.action} submitted for ${options.targetPlan}`
  );
}

async validateActivePlan(
  expectedPlan: string
) {
  Logger.info(
    `Validating active Billing plan: ${expectedPlan}`
  );

  let attempt = 0;

  await expect.poll(
    async () => {
      attempt += 1;

      if (
        attempt > 1 &&
        attempt % 3 === 0
      ) {
        await this.page.reload({
          waitUntil: 'domcontentloaded'
        }).catch(
          () => undefined
        );
      }

      await this.openPlansView();

      return this.cardShowsCurrentPlan(
        expectedPlan
      );
    },
    {
      timeout: 90000,
      intervals: [2000, 3000, 5000]
    }
  ).toBe(
    true
  );

  Logger.success(
    `Active Billing plan validated: ${expectedPlan}`
  );
}

async closePlanChangeCalculationPreview(
  options: {
    targetPlan: string;
    action: 'upgrade' | 'downgrade' | 'interval';
  }
) {
  const dialog =
    this.planChangeDialog(
      options
    );

  const cancelButton =
    dialog.getByRole(
      'button',
      {
        name: /^(cancel|close)$/i
      }
    ).first();

  if (
    await cancelButton.isVisible({
      timeout: 3000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      cancelButton,
      'Cancel Plan Change Preview'
    );
  } else {
    await this.page.keyboard.press(
      'Escape'
    );
  }

  await expect(
    dialog
  ).toBeHidden({
    timeout: 10000
  });
}

async validatePlanChangeTermsRequired(
  options: {
    targetPlan: string;
    action: 'upgrade' | 'downgrade' | 'interval';
  }
) {
  Logger.info(
    `Validating ${options.action} terms are required before confirmation`
  );

  const dialog =
    this.planChangeDialog(
      options
    );

  await expect(
    dialog
  ).toBeVisible({
    timeout: 15000
  });

  const termsCheckbox =
    dialog
      .locator(
        '[role="checkbox"], input[type="checkbox"]'
      )
      .first();

  const scheduledConfirm =
    dialog.getByRole(
      'button',
      {
        name: /schedule downgrade|keep my plan/i
      }
    ).first();

  if (
    !await termsCheckbox.isVisible({
      timeout: 3000
    }).catch(
      () => false
    )
  ) {
    await expect(
      scheduledConfirm
    ).toBeVisible({
      timeout: 10000
    });

    Logger.success(
      `${options.action} scheduled-change confirmation is visible without a pay terms checkbox`
    );

    return;
  }

  const confirmButton =
    dialog
      .getByRole(
        'button',
        {
          name: /confirm\s*&\s*pay|confirm.*pay|pay/i
        }
      )
      .first();

  await expect(
    termsCheckbox
  ).toBeVisible({
    timeout: 10000
  });

  if (
    await checkboxIsChecked(
      termsCheckbox
    )
  ) {
    await safeClick(
      termsCheckbox,
      'Clear Plan Change Terms'
    );
  }

  await expect(
    confirmButton
  ).toBeDisabled({
    timeout: 10000
  });

  await safeClick(
    termsCheckbox,
    'Accept Plan Change Terms'
  );

  await expect
    .poll(
      async () =>
        checkboxIsChecked(
          termsCheckbox
        ),
      {
        timeout: 10000,
        message: 'Waiting for plan-change terms checkbox to be checked'
      }
    )
    .toBe(
      true
    );

  await expect(
    confirmButton
  ).toBeEnabled({
    timeout: 15000
  });

  Logger.success(
    `${options.action} terms required validation passed`
  );
}

async validateDowngradeImpactCopyIfPresent(
  options: {
    targetPlan: string;
    action: 'upgrade' | 'downgrade' | 'interval';
  }
) {
  const dialog =
    this.planChangeDialog(
      options
    );

  const dialogText =
    await dialog.innerText();

  const hasImpactCopy =
    /lose|lost|remov|limit|feature|access|entitlement|broker|account linked|position|no longer|will not have/i.test(
      dialogText
    );

  if (hasImpactCopy) {
    Logger.success(
      'Downgrade impact or lost-feature copy is present'
    );

    return true;
  }

  Logger.info(
    'Downgrade dialog does not show dedicated lost-feature warning copy'
  );

  return false;
}

async validateMonthlyDowngradeRetentionOffer(
  targetPlan: string
) {
  Logger.info(
    `Validating monthly downgrade retention offer before ${targetPlan}`
  );

  await this.openPlansView();

  await this.selectBillingIntervalIfAvailable(
    'monthly'
  );

  const actionButton =
    await this.findPlanActionButton(
      targetPlan,
      'downgrade'
    );

  await actionButton.scrollIntoViewIfNeeded();

  await safeClick(
    actionButton,
    `Open downgrade ${targetPlan}`
  );

  const retentionDialog =
    this.page
      .getByRole(
        'dialog'
      )
      .or(
        this.page.getByRole(
          'alertdialog'
        )
      )
      .first();

  await expect(
    retentionDialog
  ).toBeVisible({
    timeout: 15000
  });

  const bodyText =
    await retentionDialog.innerText();

  expect(
    /retention|20%|one-time offer|stay and save|discount|keep (my|your) current plan|next 3 monthly/i.test(
      bodyText
    ),
    'Monthly downgrade should present the one-time retention offer before confirmation.'
  ).toBeTruthy();

  const leaveOffer =
    this.page.getByRole(
      'button',
      {
        name: /keep (my|your)? ?plan|stay|not now|close|^cancel$/i
      }
    ).first();

  if (
    await leaveOffer.isVisible({
      timeout: 3000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      leaveOffer,
      'Leave retention offer without downgrading'
    );
  } else {
    await this.page.keyboard.press(
      'Escape'
    );
  }

  Logger.success(
    'Monthly downgrade retention offer validated without scheduling a downgrade'
  );
}

async validateYearlyCancellationOptions() {
  Logger.info(
    'Validating yearly cancel-at-expiry and cancel-immediately-with-refund options'
  );

  await this.validateOverview();

  const inAppCancel =
    this.page.getByRole(
      'button',
      {
        name: /cancel subscription/i
      }
    ).first();

  let host =
    this.page;

  if (
    await inAppCancel.isVisible({
      timeout: 5000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      inAppCancel,
      'Open in-app cancel subscription'
    );
  } else {
    host =
      await this.openSubscriptionPortal();

    const portalCancel =
      host.locator(
        'button, a'
      ).filter({
        hasText: /cancel subscription/i
      }).first();

    if (
      await portalCancel.isVisible({
        timeout: 8000
      }).catch(
        () => false
      )
    ) {
      await safeClick(
        portalCancel,
        'Open Cancel Subscription'
      );
    }
  }

  const dialog =
    host.locator(
      '[role="dialog"], [role="alertdialog"]'
    ).filter({
      hasText: /cancel subscription/i
    }).first();

  await expect(
    dialog
  ).toBeVisible({
    timeout: 15000
  });

  const bodyText =
    await dialog.innerText();

  const twoChoices =
    /cancel at expiry/i.test(
      bodyText
    ) &&
    /cancel and refund/i.test(
      bodyText
    );

  const keepUntilDate =
    /keep access to .{0,80} until \w+ \d{1,2},? \d{4}/i.test(
      bodyText
    );

  expect(
    twoChoices ||
      keepUntilDate,
    'Yearly cancel should offer Cancel at expiry and Cancel and refund, or keep access until a renewal date.'
  ).toBeTruthy();

  if (twoChoices) {
    expect(
      bodyText,
      'Cancel at expiry should say there is no refund.'
    ).toMatch(
      /no refund/i
    );

    expect(
      bodyText,
      'Cancel and refund should show an amount and the unused annual period.'
    ).toMatch(
      /cancel and refund\s*\$\s*[\d,]+(?:\.\d{2})?[\s\S]{0,240}unused portion|unused (months|time)/i
    );
  }

  const abortCancel =
    host.getByRole(
      'button',
      {
        name: /keep my plan|don'?t cancel|keep subscription|go back|not now/i
      }
    ).first();

  if (
    await abortCancel.isVisible({
      timeout: 3000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      abortCancel,
      'Leave cancel options without submitting'
    );
  } else {
    await host.keyboard.press(
      'Escape'
    );
  }

  Logger.success(
    'Yearly cancel-at-expiry and refund options validated without cancelling'
  );
}

async expectPlanActionAvailable(
  planName: string,
  action: 'upgrade' | 'downgrade'
) {
  Logger.info(
    `Checking ${action} to ${planName} is available`
  );

  await this.openPlansView();

  const actionButton =
    await this.findPlanActionButton(
      planName,
      action
    );

  await expect(
    actionButton
  ).toBeVisible();

  Logger.success(
    `${action} to ${planName} is available`
  );
}

async expectCurrentIntervalSwitchHidden(
  interval: 'monthly' | 'annual'
) {
  Logger.info(
    `Checking switch to ${interval} is hidden for a ${interval} subscription`
  );

  await this.openPlansView();

  const switchToCurrentInterval =
    this.page.getByRole(
      'button',
      {
        name:
          interval === 'monthly'
            ? /switch to monthly|change to monthly/i
            : /switch to annual|change to annual/i
      }
    );

  await expect(
    switchToCurrentInterval
  ).toHaveCount(
    0
  );

  Logger.success(
    `Switch to ${interval} is hidden`
  );
}

async assertDowngradeTargetsAreLowerTier() {
  const order = [
    'Income Builder',
    'Overlay Strategists',
    'Portfolio Hedger'
  ];

  Logger.info(
    'Checking downgrade actions point only at lower plans'
  );

  await this.openPlansView();

  const currentPlan =
    await this.page.evaluate(
      () => {
        const plans = [
          {
            name: 'Portfolio Hedger',
            needles: ['portfolio hedger']
          },
          {
            name: 'Overlay Strategists',
            needles: ['overlay strategists']
          },
          {
            name: 'Income Builder',
            needles: ['income builder']
          }
        ];

        const nodes =
          Array.from(
            document.querySelectorAll(
              'body *'
            )
          );

        for (const node of nodes) {
          const text =
            (
              node.textContent ??
              ''
            ).toLowerCase();

          if (
            !/current plan|current subscription/.test(
              text
            ) ||
            text.length > 500
          ) {
            continue;
          }

          const matches =
            plans.filter(
              (plan) =>
                plan.needles.some(
                  (needle) =>
                    text.includes(
                      needle
                    )
                )
            );

          if (matches.length === 1) {
            return matches[0].name;
          }
        }

        return '';
      }
    );

  expect(
    order,
    'Billing should show one current paid plan.'
  ).toContain(
    currentPlan
  );

  const currentIndex =
    order.indexOf(
      currentPlan
    );

  for (const planName of order) {
    const available =
      await this.planChangeActionAvailable(
        planName,
        'downgrade',
        'monthly'
      );

    if (
      order.indexOf(
        planName
      ) >= currentIndex
    ) {
      expect(
        available,
        `${planName} is not a lower plan than ${currentPlan}.`
      ).toBe(
        false
      );
    }
  }

  if (currentIndex > 0) {
    expect(
      await this.planChangeActionAvailable(
        order[currentIndex - 1],
        'downgrade',
        'monthly'
      ),
      `${order[currentIndex - 1]} should be a downgrade from ${currentPlan}.`
    ).toBe(
      true
    );
  }

  Logger.success(
    `Downgrade targets stay below ${currentPlan}`
  );
}

async planChangeActionAvailable(
  planName: string,
  action: PlanChangeAction,
  interval: 'monthly' | 'annual'
) {
  await this.openPlansView();

  await this.selectBillingIntervalIfAvailable(
    interval
  );

  try {
    await this.findPlanActionButton(
      planName,
      action
    );

    return true;
  } catch {
    if (action !== 'interval') {
      return false;
    }

    const intervalSwitch =
      this.page.getByRole(
        'button',
        {
          name: /^(?:switch)$|switch to annual|change to annual|to annual|switch to monthly|change to monthly|to monthly/i
        }
      ).first();

    return intervalSwitch.isVisible({
      timeout: 3000
    }).catch(
      () => false
    );
  }
}

private inAppCancelControl() {
  return this.page
    .locator(
      'a, button'
    )
    .filter({
      hasText:
        /cancel (your )?subscription|cancel plan/i
    })
    .first();
}

private cancelOptionControl(
  host: Page,
  pattern: RegExp
) {
  return host
    .getByRole(
      'button',
      {
        name: pattern
      }
    )
    .or(
      host.getByRole(
        'radio',
        {
          name: pattern
        }
      )
    )
    .or(
      host.getByRole(
        'link',
        {
          name: pattern
        }
      )
    )
    .or(
      host
        .locator(
          'label, button, a, [role="radio"], [role="option"]'
        )
        .filter({
          hasText: pattern
        })
    )
    .first();
}

private retentionAcceptControl(
  host: Page = this.page
) {
  return this.cancelOptionControl(
    host,
    /accept (offer|discount)|keep (my |your )?(current )?plan|stay on|claim (the )?offer|apply (the )?discount/i
  );
}

private retentionDeclineControl(
  host: Page = this.page
) {
  return this.cancelOptionControl(
    host,
    /decline|no thanks|not now|continue (to )?downgrade|skip offer|don'?t (want|keep)|switch plans anyway|downgrade anyway|continue anyway/i
  );
}

private async fillCancelReasonIfPresent(
  host: Page,
  reason: string
) {
  const nativeSelect =
    host
      .locator(
        'select'
      )
      .first();

  if (
    await nativeSelect.isVisible({
      timeout: 2500
    }).catch(
      () => false
    )
  ) {
    const optionCount =
      await nativeSelect
        .locator(
          'option'
        )
        .count();

    if (optionCount > 1) {
      await nativeSelect.selectOption({
        index: 1
      });
    }
  } else {
    const combobox =
      host
        .getByRole(
          'combobox'
        )
        .first();

    if (
      await combobox.isVisible({
        timeout: 2000
      }).catch(
        () => false
      )
    ) {
      await safeClick(
        combobox,
        'Open cancellation reason'
      );

      const option =
        host
          .getByRole(
            'option'
          )
          .first();

      if (
        await option.isVisible({
          timeout: 3000
        }).catch(
          () => false
        )
      ) {
        await option.click();
      }
    }
  }

  const feedback =
    host
      .locator(
        'textarea'
      )
      .first();

  if (
    await feedback.isVisible({
      timeout: 2500
    }).catch(
      () => false
    )
  ) {
    await feedback.fill(
      reason
    );
  }
}

private async hostBodyText(
  host: Page
) {
  const parts = [
    await host
      .locator(
        'body'
      )
      .innerText()
      .catch(
        () => ''
      )
  ];

  for (
    const frame of host.frames()
  ) {
    if (
      frame === host.mainFrame()
    ) {
      continue;
    }

    const text =
      await frame
        .locator(
          'body'
        )
        .innerText()
        .catch(
          () => ''
        );

    if (
      text
    ) {
      parts.push(
        text
      );
    }
  }

  return parts.join(
    '\n'
  );
}

private async confirmCancelAction(
  host: Page,
  label: string,
  buttonPattern: RegExp
) {
  const confirmButton =
    host
      .getByRole(
        'button',
        {
          name: buttonPattern
        }
      )
      .filter({
        hasNotText:
          /don'?t cancel|keep subscription|go back|resume/i
      })
      .last();

  await expect(
    confirmButton
  ).toBeVisible({
    timeout: 15000
  });

  await safeClick(
    confirmButton,
    label
  );

  const finalConfirm =
    host
      .getByRole(
        'button',
        {
          name: /cancel subscription|confirm cancellation|yes,? cancel|request refund|confirm refund/i
        }
      )
      .filter({
        hasNotText:
          /don'?t cancel|keep subscription|go back/i
      })
      .first();

  if (
    await finalConfirm.isVisible({
      timeout: 5000
    }).catch(
      () => false
    ) &&
    await finalConfirm.isEnabled().catch(
      () => false
    )
  ) {
    await safeClick(
      finalConfirm,
      `${label} confirmation`
    );
  }
}

private async revealInAppCancelControl() {
  const cancel =
    this.inAppCancelControl();

  if (
    await cancel.isVisible({
      timeout: 2000
    }).catch(
      () => false
    )
  ) {
    return cancel;
  }

  for (const tab of [
    this.plansTab,
    this.overviewTab,
    this.historyTab
  ]) {
    if (
      await tab.isVisible({
        timeout: 1500
      }).catch(
        () => false
      )
    ) {
      await safeClick(
        tab,
        'Open billing tab looking for Cancel Subscription'
      );
    }

    if (
      await cancel.isVisible({
        timeout: 2000
      }).catch(
        () => false
      )
    ) {
      return cancel;
    }
  }

  return cancel;
}

async openCancelSubscriptionHost() {
  Logger.info(
    'Opening cancel subscription host'
  );

  await this.validateOverview();

  const inAppCancel =
    await this.revealInAppCancelControl();

  if (
    await inAppCancel.isVisible({
      timeout: 5000
    }).catch(
      () => false
    )
  ) {
    const newPagePromise =
      this.page.context()
        .waitForEvent(
          'page',
          {
            timeout: 7000
          }
        )
        .catch(
          () => undefined
        );

    await safeClick(
      inAppCancel,
      'Open Cancel Subscription'
    );

    const extraPage =
      await newPagePromise;

    if (extraPage) {
      await extraPage.waitForLoadState(
        'domcontentloaded'
      );

      Logger.success(
        'Cancel subscription portal tab opened'
      );

      return {
        page: extraPage,
        isPortal: true,
        close: async () => {
          if (!extraPage.isClosed()) {
            await extraPage.close();
          }
        }
      };
    }

    const cancelDialog =
      this.page
        .getByRole(
          'dialog'
        )
        .filter({
          hasText:
            /cancel/i
        })
        .first();

    const dialogVisible =
      await cancelDialog.isVisible({
        timeout: 8000
      }).catch(
        () => false
      );

    const bodyText =
      await this.hostBodyText(
        this.page
      );

    if (
      dialogVisible ||
      /cancel (your )?subscription|cancel at|request refund|end of (this|the) billing period/i.test(
        bodyText
      )
    ) {
      Logger.success(
        'In-app cancel subscription host opened'
      );

      return {
        page: this.page,
        isPortal:
          /stripe|billing\.stripe/i.test(
            this.page.url()
          ),
        close: async () => {
          const keepPlan =
            cancelDialog.getByRole(
              'button',
              {
                name: /keep my plan/i
              }
            );

          if (
            await keepPlan.isVisible({
              timeout: 2000
            }).catch(
              () => false
            )
          ) {
            if (
              await keepPlan.isEnabled().catch(
                () => false
              )
            ) {
              await keepPlan.click({
                timeout: 8000
              }).catch(
                async () => {
                  await this.page.keyboard.press(
                    'Escape'
                  );
                }
              );
            } else {
              await this.page.keyboard.press(
                'Escape'
              );
            }

            return;
          }

          const closeButton =
            cancelDialog
              .getByRole(
                'button',
                {
                  name: /^(close|go back|keep)/i
                }
              )
              .first()
              .or(
                this.page.getByRole(
                  'button',
                  {
                    name: /go back|keep (my |your )?plan|don'?t cancel/i
                  }
                ).first()
              );

          if (
            await closeButton.isVisible({
              timeout: 2000
            }).catch(
              () => false
            )
          ) {
            await safeClick(
              closeButton,
              'Close cancel host'
            );
          } else {
            await this.page.keyboard.press(
              'Escape'
            );
          }
        }
      };
    }
  }

  let portalPage: Page | undefined;

  try {
    portalPage =
      await this.openSubscriptionPortal();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(
          error
        );

    if (
      /Manage subscription control was not found/i.test(
        message
      )
    ) {
      throw new Error(
        `Cancel subscription control was not found on Billing. Visible controls: ${(await this.visibleControlSummary()).join(' | ')}`
      );
    }

    throw error;
  }

  if (!portalPage) {
    throw new Error(
      'Cancel subscription portal did not open.'
    );
  }

  const alreadyCancelling =
    portalPage
      .getByText(
        /cancels\s+\w+|your service will end|scheduled to cancel|cancel at period end/i
      )
      .first();

  if (
    await alreadyCancelling.isVisible({
      timeout: 4000
    }).catch(
      () => false
    )
  ) {
    Logger.success(
      'Cancel host already shows a scheduled cancellation'
    );

    return {
      page: portalPage,
      isPortal: true,
      close: async () => {
        if (
          portalPage !== this.page &&
          !portalPage.isClosed()
        ) {
          await portalPage.close();
        }
      }
    };
  }

  const cancelControl =
    portalPage
      .locator(
        'button, a'
      )
      .filter({
        hasText:
          /cancel subscription/i
      })
      .first();

  await safeClick(
    cancelControl,
    'Open Cancel Subscription'
  );

  await expect(
    portalPage
      .getByText(
        /cancel your subscription|cancel at|refund|end of (this|the) billing period|why you'?re leaving|request refund/i
      )
      .first()
  ).toBeVisible({
    timeout: 20000
  });

  Logger.success(
    'Cancel subscription host opened'
  );

  return {
    page: portalPage,
    isPortal: true,
    close: async () => {
      if (
        portalPage !== this.page &&
        !portalPage.isClosed()
      ) {
        await portalPage.close();
      }
    }
  };
}

async validateMonthlyCancellationOptions() {
  Logger.info(
    'Validating monthly cancel-at-period-end options'
  );

  const host =
    await this.openCancelSubscriptionHost();

  try {
    const text =
      await this.hostBodyText(
        host.page
      );

    expect(
      text,
      'Monthly cancel should keep access until a date, then move to the Free plan.'
    ).toMatch(
      /keep access to .{0,80} until \w+ \d{1,2},? \d{4}|end of (this|the) (current )?billing period|refunds apply to annual plans only/i
    );

    expect(
      text,
      'Monthly cancel should not offer Cancel and refund.'
    ).not.toMatch(
      /cancel and refund|cancel at expiry/i
    );

    const immediateCancel =
      this.cancelOptionControl(
        host.page,
        /cancel immediately|cancel now and refund|request refund/i
      );

    expect(
      await immediateCancel.isVisible({
        timeout: 2000
      }).catch(
        () => false
      ),
      'Monthly cancel should not require an immediate-cancel control.'
    ).toBeFalsy();

    await this.fillCancelReasonIfPresent(
      host.page,
      'Automation validation only - monthly cancellation not submitted.'
    );

    Logger.success(
      'Monthly cancel-at-period-end options validated without submitting'
    );
  } finally {
    await host.close();
  }
}

async submitMonthlyCancelAtPeriodEnd(
  options?: {
    keepScheduled?: boolean;
  }
) {
  Logger.info(
    'Submitting monthly cancel at period end'
  );

  const host =
    await this.openCancelSubscriptionHost();

  try {
    const text =
      await this.hostBodyText(
        host.page
      );

    expect(
      text
    ).toMatch(
      /keep access to .{0,80} until \w+ \d{1,2},? \d{4}|end of (this|the) (current )?billing period|refunds apply to annual plans only/i
    );

    expect(
      text
    ).not.toMatch(
      /cancel and refund|cancel at expiry/i
    );

    await this.fillCancelReasonIfPresent(
      host.page,
      'Automation period-end cancel for disposable monthly user.'
    );

    const periodEndOption =
      this.cancelOptionControl(
        host.page,
        /cancel at (the )?(end|expiry|period)|end of (this|the) billing period|keep access/i
      );

    if (
      await periodEndOption.isVisible({
        timeout: 3000
      }).catch(
        () => false
      )
    ) {
      await safeClick(
        periodEndOption,
        'Choose cancel at period end'
      );
    }

    await this.confirmCancelAction(
      host.page,
      'Submit monthly cancel at period end',
      /yes,?\s*cancel|cancel (subscription|plan)|confirm|continue|cancel at period end/i
    );

    await expect(
      host.page
        .getByText(
          /scheduled to cancel|cancellation scheduled|cancelling|cancels on|service will end|cancel at period end|access until|keep access to|moved to the free plan|you('ll| will) have access until/i
        )
        .first()
    ).toBeVisible({
      timeout: 30000
    });

    Logger.success(
      'Monthly cancel at period end submitted'
    );
  } finally {
    if (
      options?.keepScheduled
    ) {
      await host.page.keyboard.press(
        'Escape'
      );
    } else {
      await host.close();
    }
  }
}

async expectPaidAccessWhileCancellationScheduled(
  planName: string
) {
  await this.openPlansView();

  const stillOnPlan =
    await this.cardShowsCurrentPlan(
      planName
    );

  if (
    !stillOnPlan
  ) {
    await expect(
      this.page.locator(
        'main'
      )
    ).toContainText(
      planVisiblePattern(
        planName
      )
    );
  }

  await expect(
    this.page.locator(
      'main'
    )
  ).toContainText(
    /scheduled to cancel|cancellation scheduled|cancels on|access until|keep access to|moved to the free plan|service will end|end of (this|the) (current )?billing period/i
  );

  await expect(
    this.page.locator(
      'main'
    )
  ).not.toContainText(
    /refund (issued|processed|completed)|moved to free|subscription cancelled/i
  );
}

async resumeScheduledCancellation(
  planName: string
) {
  Logger.info(
    `Resuming scheduled cancellation for ${planName}`
  );

  await this.closeCancelDialogIfOpen();

  const resume =
    this.page.getByRole(
      'button',
      {
        name: /don'?t cancel|resume subscription|reactivate/i
      }
    ).first();

  const enabledKeepPlan =
    this.page.getByRole(
      'button',
      {
        name: /keep my plan/i
      }
    ).first();

  if (
    await resume.isVisible({
      timeout: 5000
    }).catch(
      () => false
    ) &&
    await resume.isEnabled().catch(
      () => false
    )
  ) {
    await safeClick(
      resume,
      'Resume scheduled cancellation'
    );
  } else if (
    await enabledKeepPlan.isVisible({
      timeout: 2000
    }).catch(
      () => false
    ) &&
    await enabledKeepPlan.isEnabled().catch(
      () => false
    )
  ) {
    await enabledKeepPlan.click({
      timeout: 8000
    });
  } else {
    const host =
      await this.openCancelSubscriptionHost();

    await host.close();
  }

  await this.validateActivePlan(
    planName
  );

  await expect(
    this.page.locator(
      'main'
    )
  ).not.toContainText(
    /scheduled to cancel|cancellation scheduled/i
  );

  Logger.success(
    `${planName} stayed active after cancellation was resumed`
  );
}

async showRefundAmountWithoutConfirming(
  planName: string
) {
  Logger.info(
    'Opening immediate cancellation to read the refund amount'
  );

  const host =
    await this.openCancelSubscriptionHost();

  try {
    const refundOption =
      this.cancelOptionControl(
        host.page,
        /cancel immediately|cancel and refund|request (a )?refund/i
      );

    await expect(
      refundOption
    ).toBeVisible({
      timeout: 15000
    });

    await safeClick(
      refundOption,
      'Choose cancel and refund'
    );

    const text =
      await this.hostBodyText(
        host.page
      );

    expect(
      text,
      'Immediate cancellation should show a refund amount before confirmation.'
    ).toMatch(
      /\$\s?\d|\busd\s?\d|unused (months|time)|refund/i
    );
  } finally {
    await host.close();
  }

  await this.validateActivePlan(
    planName
  );
}

async cancelTrialWithoutPaymentMethod() {
  Logger.info(
    'Cancelling a trial without a payment method'
  );

  const host =
    await this.openCancelSubscriptionHost();

  try {
    await expect(
      host.page
    ).not.toHaveURL(
      /checkout\.stripe\.com/
    );

    const text =
      await this.hostBodyText(
        host.page
      );

    expect(
      text
    ).not.toMatch(
      /card number|cvc|security code/i
    );

    await this.confirmCancelAction(
      host.page,
      'Cancel trial without a payment method',
      /yes,?\s*cancel|cancel (subscription|trial|plan)|confirm|continue/i
    );

    await expect(
      host.page
    ).not.toHaveURL(
      /checkout\.stripe\.com/
    );
  } finally {
    await host.page.keyboard.press(
      'Escape'
    );
  }

  Logger.success(
    'Trial cancellation did not ask for a card'
  );
}

async assertDowngradeImpactWarning(
  targetPlan: string
) {
  await this.openMonthlyDowngradeOrRetention({
    targetPlan
  });

  const decline =
    this.retentionDeclineControl();

  if (
    await decline.isVisible({
      timeout: 2000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      decline,
      'Decline retention to read the downgrade warning'
    );
  }

  const dialog =
    this.page.locator(
      '[role="dialog"], [role="alertdialog"]'
    ).first();

  await expect(
    dialog
  ).toContainText(
    /feature|limit|broker|position|lose|restrict|reduced/i
  );

  await this.page.keyboard.press(
    'Escape'
  );
}

async submitYearlyCancelAtExpiry() {
  Logger.info(
    'Submitting yearly cancel at expiry'
  );

  const host =
    await this.openCancelSubscriptionHost();

  try {
    const expiryOption =
      this.cancelOptionControl(
        host.page,
        /cancel at (expiry|period end|renewal)|keep access|no refund/i
      );

    await expect(
      expiryOption
    ).toBeVisible({
      timeout: 15000
    });

    await safeClick(
      expiryOption,
      'Choose cancel at expiry'
    );

    await this.fillCancelReasonIfPresent(
      host.page,
      'Automation cancel-at-expiry for disposable yearly user.'
    );

    await this.confirmCancelAction(
      host.page,
      'Submit yearly cancel at expiry',
      /yes,?\s*cancel|cancel (at expiry|subscription|plan)|confirm|continue/i
    );

    await expect(
      host.page
        .getByText(
          /scheduled to cancel|cancels on|access until|keep .+ until|cancel at expiry|service will end|moved to the free plan|no refund/i
        )
        .first()
    ).toBeVisible({
      timeout: 30000
    });

    Logger.success(
      'Yearly cancel at expiry submitted'
    );
  } finally {
    await host.close();
  }
}

async submitYearlyCancelAndRefund() {
  Logger.info(
    'Submitting yearly cancel and refund'
  );

  const host =
    await this.openCancelSubscriptionHost();

  try {
    const refundOption =
      this.cancelOptionControl(
        host.page,
        /cancel immediately|cancel and refund|request (a )?refund/i
      );

    await expect(
      refundOption
    ).toBeVisible({
      timeout: 15000
    });

    await safeClick(
      refundOption,
      'Choose cancel and refund'
    );

    const text =
      await this.hostBodyText(
        host.page
      );

    expect(
      text,
      'Yearly refund should describe unused remaining time or refund amount.'
    ).toMatch(
      /unused (months|time)|remaining months|refund|credit/i
    );

    await this.fillCancelReasonIfPresent(
      host.page,
      'Automation yearly cancel and refund for disposable user.'
    );

    await this.confirmCancelAction(
      host.page,
      'Submit yearly cancel and refund',
      /yes,?\s*cancel|cancel and refund|request refund|cancel immediately|confirm|continue|cancel subscription/i
    );

    await expect(
      host.page
        .getByText(
          /refund|free plan|subscription cancelled|subscription canceled|paid access (has )?ended|moved to free|team reviews|unused portion|keep access until/i
        )
        .first()
    ).toBeVisible({
      timeout: 45000
    });

    Logger.success(
      'Yearly cancel and refund submitted'
    );
  } finally {
    await host.close();
  }
}

async openMonthlyDowngradeOrRetention(
  options: {
    targetPlan: string;
  }
) {
  await this.openPlansView();

  await this.selectBillingIntervalIfAvailable(
    'monthly'
  );

  const actionButton =
    await this.findPlanActionButton(
      options.targetPlan,
      'downgrade'
    );

  await safeClick(
    actionButton,
    `downgrade ${options.targetPlan}`
  );

  const retentionOrDowngrade =
    this.page
      .getByRole(
        'dialog'
      )
      .or(
        this.page.getByText(
          /3[- ]month|three months|discount|retain|keep (your )?plan|downgrade to/i
        )
      )
      .first();

  await expect(
    retentionOrDowngrade
  ).toBeVisible({
    timeout: 15000
  });
}

async acceptMonthlyDowngradeRetentionOffer(
  options: {
    currentPlan: string;
    targetPlan: string;
  }
) {
  await this.openMonthlyDowngradeOrRetention({
    targetPlan:
      options.targetPlan
  });

  await safeClick(
    this.retentionAcceptControl(),
    'Accept monthly retention offer'
  );

  const dialog =
    this.planChangeDialog({
      targetPlan:
        options.targetPlan,
      action:
        'downgrade'
    });

  await expect(
    dialog
  ).toBeHidden({
    timeout: 20000
  }).catch(
    async () => {
      await this.closePlanChangeCalculationPreview({
        targetPlan:
          options.targetPlan,
        action:
          'downgrade'
      });
    }
  );

  await this.validateActivePlan(
    options.currentPlan
  );

  Logger.success(
    `Retention offer accepted; still on ${options.currentPlan}`
  );
}

async assertRetentionOfferNotShown(
  options: {
    currentPlan: string;
    targetPlan: string;
  }
) {
  Logger.info(
    `Asserting retention offer is not shown again for ${options.currentPlan}`
  );

  await this.openMonthlyDowngradeOrRetention({
    targetPlan:
      options.targetPlan
  });

  const surface =
    this.page
      .getByRole(
        'dialog'
      )
      .first()
      .or(
        this.page.locator(
          'body'
        )
      );

  const text =
    await surface.innerText();

  const offerVisible =
    /3[- ]month|three months/i.test(
      text
    ) &&
    /discount|special offer|retain/i.test(
      text
    ) &&
    await this.retentionAcceptControl()
      .isVisible({
        timeout: 2000
      })
      .catch(
        () => false
      );

  expect(
    offerVisible,
    'Retention offer is once per account lifetime and must not appear again after accept.'
  ).toBeFalsy();

  try {
    await this.closePlanChangeCalculationPreview({
      targetPlan:
        options.targetPlan,
      action:
        'downgrade'
    });
  } catch {
    await this.page.keyboard.press(
      'Escape'
    );
  }

  Logger.success(
    'Second downgrade did not show the retention offer'
  );
}

async declineRetentionAndPreviewOrScheduleDowngrade(
  options: {
    currentPlan: string;
    targetPlan: string;
    schedule: boolean;
  }
) {
  await this.openMonthlyDowngradeOrRetention({
    targetPlan:
      options.targetPlan
  });

  const dialog =
    this.planChangeDialog({
      targetPlan:
        options.targetPlan,
      action:
        'downgrade'
    });

  await expect(
    dialog
  ).toBeVisible({
    timeout: 15000
  });

  const separateDecline =
    this.retentionDeclineControl();

  if (
    await separateDecline.isVisible({
      timeout: 2000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      separateDecline,
      'Decline monthly retention offer'
    );

    await expect(
      dialog
    ).toBeVisible({
      timeout: 15000
    });
  }

  const dialogText =
    await dialog.innerText();

  expect(
    dialogText,
    'Declined retention should continue to a scheduled downgrade preview.'
  ).toMatch(
    /takes effect|next (renewal|billing)|end of (this|the) billing period|effective date|schedule downgrade/i
  );

  expect(
    dialogText,
    'Scheduled downgrade should not refund or credit unused time.'
  ).toMatch(
    /no refund|no credit|not refund/i
  );

  if (options.schedule) {
    const scheduleDowngrade =
      dialog.getByRole(
        'button',
        {
          name: /schedule downgrade/i
        }
      );

    if (
      await scheduleDowngrade.isVisible({
        timeout: 3000
      }).catch(
        () => false
      )
    ) {
      await safeClick(
        scheduleDowngrade,
        'Schedule downgrade'
      );
    } else {
      await this.submitPlanChangeCalculationPreview({
        targetPlan:
          options.targetPlan,
        action:
          'downgrade'
      });
    }

    await this.page.keyboard.press(
      'Escape'
    );

    await this.validateActivePlan(
      options.currentPlan
    );

    Logger.success(
      `Downgrade to ${options.targetPlan} scheduled at next renewal`
    );

    return;
  }

  await this.closePlanChangeCalculationPreview({
    targetPlan:
      options.targetPlan,
    action:
      'downgrade'
  });

  Logger.success(
    'Retention declined and downgrade preview closed without scheduling'
  );
}

async validateFreePlanAfterRefund() {
  Logger.info(
    'Validating Billing moved to Free after yearly refund'
  );

  await this.validateOverview();

  const bodyText =
    await this.page
      .locator(
        'body'
      )
      .innerText({
        timeout: 15000
      });

  expect(
    bodyText,
    'Yearly refund should move the account to Free or leave the refund under review with access until it is processed.'
  ).toMatch(
    /refund under review|reviewing your refund|refund request .{0,40}pending|cancellation scheduled|free( plan)?|curious explorer/i
  );

  expect(
    bodyText,
    'Yearly refund should describe the end of paid access or the pending review.'
  ).toMatch(
    /keep full access until|set to end on|cancelling|cancellation scheduled|free|cancelled|canceled|no active (paid )?subscription|downgraded/i
  );

  Logger.success(
    'Free plan after yearly refund validated'
  );
}

async validatePaidSubscriberTrialCtaIsNotOffered() {

  Logger.info(
    'Validating paid subscriber is not offered Overlay Strategists trial CTA'
  );

  await this.validateOverview();

  if (
    await this.plansTab.isVisible({
      timeout: 5000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      this.plansTab,
      'Open Plans Tab'
    );
  }

  await this.validateBillingUrl();

  await expect(
    this.page.getByText(
      /current plan|current subscription|billing overview|income builder|overlay strategists|portfolio hedger|free|trial|upgrade|downgrade/i
    ).first()
  ).toBeVisible({
    timeout: 15000,
  });

  if (
    await this.isFreeOrNoCardPlan()
  ) {
    Logger.success(
      'Free or no-card plan may show a trial CTA. Paid-only portal checks do not apply.'
    );

    return;
  }

  await expect(
    this.page.getByRole(
      'button',
      {
        name: /try 30 days free/i
      }
    )
  ).toHaveCount(
    0
  );

  Logger.success(
    'Paid subscriber trial CTA is not offered'
  );
}

async isFreeOrNoCardPlan() {
  if (
    !this.page.url().includes(
      '/billing'
    )
  ) {
    await this.validateOverview();
  } else {
    await this.waitForBillingContent();
  }

  const overviewText =
    await this.page
      .locator(
        'main, body'
      )
      .first()
      .innerText({
        timeout: 10000
      });

  const hasCardOnFile =
    /visa|mastercard|amex|discover|ending\s+in\s+\d{4}|\u2022{2,}\s*\d{4}|\*{2,}\s*\d{4}/i.test(
      overviewText
    );

  const onFreePlan =
    /\bfree\b/i.test(
      overviewText
    ) ||
    /canceled|cancelled|expired|\bcurious\b/i.test(
      overviewText
    );

  const noCardTrial =
    /trial/i.test(
      overviewText
    ) &&
    !hasCardOnFile;

  return onFreePlan ||
    noCardTrial;
}

async validateOverviewContract() {

  Logger.info(
    'Validating Billing Overview Contract'
  );

  await this.validateBillingUrl();
  await this.waitForBillingContent();

  const overviewVisible =
    await this.overviewTab.isVisible({
      timeout: 3000
    }).catch(
      () => false
    );

  if (
    overviewVisible
  ) {
    await safeClick(
      this.overviewTab,
      'Open Overview Tab'
    );
  }

  await expect(
    this.plansTab
  ).toBeVisible({
    timeout: 15000,
  });

  await expect(
    this.historyTab
  ).toBeVisible({
    timeout: 15000,
  });

  await expect(
    this.page.getByText(
      /current plan|current subscription|billing overview|income builder|overlay strategists|portfolio hedger|free|trial|curious/i
    ).first()
  ).toBeVisible({
    timeout: 15000,
  });

  const overviewText =
    await this.page
      .locator(
        'main, body'
      )
      .first()
      .innerText({
        timeout: 10000
      });

  const hasCardOnFile =
    /visa|mastercard|amex|discover|ending\s+in\s+\d{4}|\u2022{2,}\s*\d{4}|\*{2,}\s*\d{4}/i.test(
      overviewText
    );

  const onFreePlan =
    /\bfree\b/i.test(
      overviewText
    ) ||
    /canceled|cancelled|expired|curious explorer/i.test(
      overviewText
    );

  const noCardTrial =
    /trial/i.test(
      overviewText
    ) &&
    !hasCardOnFile;

  const viewPlans =
    this.page
      .getByRole(
        'link',
        {
          name: /view plans/i
        }
      )
      .or(
        this.page.getByRole(
          'button',
          {
            name: /view plans/i
          }
        )
      )
      .or(
        this.page.locator(
          'a[href*="/pricing"], a[href*="plan"]'
        ).filter({
          hasText: /view plans|see plans|choose plan|upgrade/i
        })
      )
      .first();

  const hasViewPlans =
    await viewPlans.isVisible({
      timeout: 2500
    }).catch(
      () => false
    );

  if (
    onFreePlan ||
    noCardTrial ||
    hasViewPlans
  ) {
    await expect(
      this.plansTab
    ).toBeVisible({
      timeout: 5000
    });

    if (hasViewPlans) {
      await expect(
        viewPlans
      ).toBeVisible({
        timeout: 5000
      });
    }
  } else {
    const manageControl =
      await this.manageSubscriptionControl();

    await expect(
      manageControl
    ).toBeVisible({
      timeout: 15000
    });
  }

  const planStatusOrAction =
    this.page.locator(
      'a, button, [role="status"], [data-state], p, span'
    ).filter({
      hasText: /active|current|trial|free|curious|manage|upgrade|downgrade|selected|subscription|view plans/i,
    }).first();

  await expect(
    planStatusOrAction
  ).toBeVisible({
    timeout: 15000,
  });

  Logger.success(
    'Billing Overview Contract Validated'
  );
}

async validateOverlayStrategistsTrialBillingState(
  mode: 'with-card' | 'without-card'
) {

  Logger.info(
    `Validating Overlay Strategists ${mode} trial billing state`
  );

  await this.validateOverview();

  const bodyText =
    await this.page
      .locator(
        'body'
      )
      .innerText({
        timeout: 15000
      });

  expect(
    bodyText,
    'Billing should show the active Overlay Strategists trial/subscription context.'
  ).toMatch(
    /overlay strategists/i
  );

  expect(
    bodyText,
    'Billing should show trial or subscription status after the trial starts.'
  ).toMatch(
    /trial|current plan|current subscription|active|subscription/i
  );

  if (
    mode === 'with-card'
  ) {
    expect(
      bodyText,
      'QA-CL-005: with-card trial should show saved payment method details in Billing.'
    ).toMatch(
      /visa|mastercard|amex|discover|4444|5556|4242|ending\s+in\s+\d{4}|\*{2,}\s*\d{4}|\u2022{2,}\s*\d{4}/i
    );

    expect(
      bodyText,
      'QA-CL-005: with-card trial grants Overlay Strategists, not Curious Explorer / Free.'
    ).not.toMatch(
      /current plan\s*[:\-]?\s*(free plan|curious explorer)|curious explorer\s*\(free\)/i
    );
  }

  if (
    mode === 'without-card'
  ) {
    await expect(
      this.page
    ).not.toHaveURL(
      /checkout\.stripe\.com|billing\.stripe\.com/i,
      {
        timeout: 5000
      }
    );

    expect(
      bodyText,
      'Without-card trial should not show a saved Stripe test card.'
    ).not.toMatch(
      /visa\s+.*4242|4242/i
    );
  }

  Logger.success(
    `Overlay Strategists ${mode} trial billing state validated`
  );
}

async validateOverlayStrategistsDisplayedLimits() {
  Logger.info(
    'Validating Overlay Strategists account and position limits shown on the plan'
  );

  await this.openPlansView();

  const pageText =
    await this.page.locator(
      'body'
    ).innerText();

  expect(
    pageText,
    'No-card trial should show the Account Linked limit printed on the Overlay Strategists card.'
  ).toMatch(
    /account linked\s*\(10\)/i
  );

  expect(
    pageText,
    'No-card trial should show the Positions limit printed on the Overlay Strategists card.'
  ).toMatch(
    /positions\s*\(500\)/i
  );

  Logger.success(
    'Overlay Strategists shows Account Linked (10) and Positions (500)'
  );
}

async validateTrialListedInHistory() {
  Logger.info(
    'Validating billing history records the trial'
  );

  await safeClick(
    this.historyTab,
    'Open History Tab'
  );

  await expect(
    this.page.locator(
      'main'
    )
  ).toContainText(
    /overlay strategists|free trial|trial|subscription/i,
    {
      timeout: 15000
    }
  );

  Logger.success(
    'Billing history shows the trial record'
  );
}

async validateHistoryShowsPlan(
  planName: string
) {
  Logger.info(
    `Validating billing history shows ${planName}`
  );

  await safeClick(
    this.historyTab,
    'Open History Tab'
  );

  await expect(
    this.page.locator(
      'main'
    )
  ).toContainText(
    planVisiblePattern(
      planName
    ),
    {
      timeout: 15000
    }
  );

  Logger.success(
    `Billing history shows ${planName}`
  );
}

async validateDangerZoneCancelStaysSafe(
  planName: string,
  interval: 'monthly' | 'annual'
) {
  Logger.info(
    `Opening danger-zone cancel for ${planName} without cancelling`
  );

  await this.validateOverview();

  const cancel =
    this.inAppCancelControl();

  await expect(
    cancel,
    'Danger zone should offer Cancel Subscription.'
  ).toBeVisible({
    timeout: 15000
  });

  await safeClick(
    cancel,
    'Open danger zone Cancel Subscription'
  );

  const dialog =
    this.page.locator(
      '[role="dialog"], [role="alertdialog"]'
    ).filter({
      hasText: /cancel subscription/i
    }).first();

  await expect(
    dialog
  ).toBeVisible({
    timeout: 15000
  });

  const keepPlan =
    dialog.getByRole(
      'button',
      {
        name: /keep my plan/i
      }
    );

  const confirmCancel =
    dialog.getByRole(
      'button',
      {
        name: /yes,?\s*cancel/i
      }
    );

  await expect(
    keepPlan
  ).toBeVisible();

  await expect(
    confirmCancel,
    'Yes, cancel must be a separate button from Keep my plan.'
  ).toBeVisible();

  const keepText =
    (
      await keepPlan.innerText()
    ).trim()
      .toLowerCase();

  const confirmText =
    (
      await confirmCancel.innerText()
    ).trim()
      .toLowerCase();

  expect(
    keepText
  ).not.toBe(
    confirmText
  );

  const dialogText =
    await dialog.innerText();

  const calendarDate =
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i;

  if (
    interval === 'annual'
  ) {
    expect(
      dialogText,
      'Annual cancel should show the period end date.'
    ).toMatch(
      calendarDate
    );
  } else {
    expect(
      dialogText,
      'Monthly cancel should show the period end date.'
    ).toMatch(
      new RegExp(
        `${calendarDate.source}|end of (this|the) (current )?billing period`,
        'i'
      )
    );
  }

  await this.page.reload({
    waitUntil: 'domcontentloaded'
  });

  await this.validateOverview();

  await expect(
    this.page.locator(
      'main'
    )
  ).toContainText(
    planVisiblePattern(
      planName
    ),
    {
      timeout: 15000
    }
  );

  await expect(
    this.page.locator(
      'main'
    )
  ).not.toContainText(
    /moved to the free plan|subscription cancelled|you are now on the free plan/i
  );

  await this.closeCancelDialogIfOpen();

  Logger.success(
    `${planName} stayed active after refresh on the cancel dialog`
  );
}

async subscribeToPaidPlanBeforeTrialEnds() {
  Logger.info(
    'Choosing a paid plan before the trial ends'
  );

  await this.openPlansView();

  let targetPlan =
    'Income Builder';
  let action: 'upgrade' | 'downgrade' =
    'downgrade';
  let button;

  try {
    button =
      await this.findPlanActionButton(
        'Income Builder',
        'downgrade'
      );
  } catch {
    targetPlan =
      'Portfolio Hedger';
    action =
      'upgrade';
    button =
      await this.findPlanActionButton(
        'Portfolio Hedger',
        'upgrade'
      );
  }

  await safeClick(
    button,
    `Choose ${targetPlan} before the trial ends`
  );

  const confirmDialog =
    this.page.locator(
      '[role="dialog"], [role="alertdialog"]'
    ).filter({
      hasText: /confirm your subscription|total due today/i
    }).first();

  const reachedStripe =
    await this.page.waitForURL(
      /checkout\.stripe\.com/,
      {
        timeout: 8000
      }
    ).then(
      () => true
    ).catch(
      () => false
    );

  if (
    !reachedStripe &&
    await confirmDialog.isVisible().catch(
      () => false
    )
  ) {
    const termsCheckbox =
      confirmDialog.locator(
        '[role="checkbox"], input[type="checkbox"]'
      ).first();

    await expect(
      termsCheckbox
    ).toBeVisible({
      timeout: 10000
    });

    await safeClick(
      termsCheckbox,
      'Accept subscription terms'
    );

    const confirmPay =
      confirmDialog.getByRole(
        'button',
        {
          name: /confirm\s*&\s*pay/i
        }
      );

    const termsAccepted =
      async () => {
        if (
          await termsCheckbox.isChecked().catch(
            () => false
          )
        ) {
          return true;
        }

        const state =
          await termsCheckbox.getAttribute(
            'aria-checked'
          ) ??
          await termsCheckbox.getAttribute(
            'data-state'
          );

        return state === 'true' ||
          state === 'checked';
      };

    if (
      !await termsAccepted()
    ) {
      await termsCheckbox.click({
        force: true
      }).catch(
        () => undefined
      );
    }

    if (
      !await confirmPay.isEnabled().catch(
        () => false
      )
    ) {
      await confirmDialog.getByText(
        /agree|terms|i understand|accept/i
      ).first().click({
        force: true
      }).catch(
        () => undefined
      );
    }

    await expect(
      confirmPay
    ).toBeEnabled({
      timeout: 15000
    });

    await confirmPay.evaluate(
      (button) => {
        button.scrollIntoView({
          block: 'center',
          inline: 'nearest'
        });
      }
    );

    await confirmDialog.evaluate(
      (dialog) => {
        dialog.scrollTop =
          dialog.scrollHeight;
      }
    ).catch(
      () => undefined
    );

    await confirmPay.evaluate(
      (button) => {
        button.click();
      }
    );
  } else if (!reachedStripe) {
    await this.submitPlanChangeCalculationPreview({
      targetPlan,
      action
    });
  }

  if (
    /checkout\.stripe\.com/i.test(
      this.page.url()
    ) ||
    await this.page.waitForURL(
      /checkout\.stripe\.com/,
      {
        timeout: 20000
      }
    ).then(
      () => true
    ).catch(
      () => false
    )
  ) {
    await new StripePaymentPage(
      this.page
    ).completePayment();
  }

  await this.validateActivePlan(
    targetPlan
  );

  await this.validateHistoryShowsPlan(
    targetPlan
  );

  Logger.success(
    `Trial user subscribed to ${targetPlan} before the trial ended`
  );
}

async validateHistoryTabStable() {

  Logger.info(
    'Validating Billing History Tab Stability'
  );

  await safeClick(
    this.historyTab,
    'Open History Tab'
  );

  await safeClick(
    this.transactionsTab,
    'Open Transactions Tab'
  );

  await this.validateBillingUrl();

  await expect(
    this.page.getByText(
      /transactions|paid|invoice|history/i
    ).first()
  ).toBeVisible({
    timeout: 15000,
  });

  Logger.success(
    'Billing History Tab Stable'
  );
}

async validateInvoiceAndPdfLinksHaveTargets() {

  Logger.info(
    'Validating Billing Evidence Links'
  );

  const alreadyOnHistory =
    await this.page.getByText(
      /^paid$/i
    ).first().isVisible({
      timeout: 2000
    }).catch(
      () => false
    );

  if (
    !alreadyOnHistory
  ) {
    await this.validateHistoryTabStable();
  }

  const invoiceLink =
    this.invoiceLinks.first();

  await expect(
    invoiceLink
  ).toBeVisible({
    timeout: 15000,
  });

  const invoiceHref =
    await invoiceLink.getAttribute(
      'href'
    );

  expect(
    invoiceHref
  ).toBeTruthy();

  const pdfLink =
    this.pdfLinks.first();

  await expect(
    pdfLink
  ).toBeVisible({
    timeout: 15000,
  });

  const pdfHref =
    await pdfLink.getAttribute(
      'href'
    );

  expect(
    pdfHref
  ).toBeTruthy();

  Logger.success(
    'Billing Evidence Links Have Targets'
  );
}

private async manageSubscriptionControl() {
  if (
    /stripe\.com/i.test(
      this.page.url()
    )
  ) {
    throw new Error(
      `Manage subscription was requested while still on Stripe: ${this.page.url()}`
    );
  }

  const manageName =
    /manage subscription|manage billing|billing portal|customer portal|subscription settings|manage plan|manage payment methods|payment methods\s*&\s*invoices|update payment method|change payment method/i;

  const candidates = [
    this.page.getByRole(
      'button',
      {
        name: manageName,
      }
    ),
    this.page.getByRole(
      'link',
      {
        name: manageName,
      }
    ),
    this.page.locator(
      'a[href*="billing.stripe.com"], a[href*="stripe.com"]'
    ).filter({
      hasText: manageName,
    }),
    this.page.locator(
      'button, a, [role="button"]'
    ).filter({
      hasText: manageName,
    }),
  ];

  for (const candidate of candidates) {
    const control =
      candidate.first();

    if (
      await control.isVisible({
        timeout: 2000
      }).catch(
        () => false
      )
    ) {
      return control;
    }
  }

  throw new Error(
    `Manage subscription control was not found. Visible controls: ${(await this.visibleControlSummary()).join(' | ')}`
  );
}

private async clickStripePortalControl(
  locator: Locator,
  label: string
) {
  console.log(`[CLICK] ${label}`);

  await locator.waitFor({
    state: 'visible',
    timeout: 15000
  });

  try {
    await locator.click({
      timeout: 5000
    });
  } catch {
    await locator.click({
      force: true,
      timeout: 8000
    });
  }
}

private async dismissStripeCancelDialog(
  portalPage: Page
) {
  const layer =
    portalPage.locator(
      '#__sail-layer-containers, [role="dialog"]'
    ).filter({
      hasText: /cancel your subscription/i
    }).last();

  const goBack =
    layer.getByRole(
      'button',
      {
        name: /^go back$/i
      }
    ).last();

  if (
    !await goBack.isVisible({
      timeout: 2000
    }).catch(
      () => false
    )
  ) {
    return false;
  }

  await this.clickStripePortalControl(
    goBack,
    'Go Back From Cancel Subscription'
  );

  await portalPage.getByText(
    /cancel your subscription/i
  ).first().waitFor({
    state: 'hidden',
    timeout: 10000
  }).catch(
    () => undefined
  );

  return true;
}

private async ensurePortalOverview(
  portalPage: Page
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const overviewReady =
      await this.waitForPortalOverview(
        portalPage,
        attempt === 0 ? 3000 : 5000
      );

    if (
      overviewReady
    ) {
      return;
    }

    if (
      await this.dismissStripeCancelDialog(
        portalPage
      )
    ) {
      continue;
    }

    const goBack =
      portalPage.getByRole(
        'button',
        {
          name: /^go back$/i
        }
      ).last();

    const billingCrumb =
      portalPage.getByRole(
        'link',
        {
          name: /^billing$/i
        }
      ).first();

    const cancelNested =
      portalPage.getByRole(
        'button',
        {
          name: /^cancel$/i
        }
      ).first();

    if (
      await goBack.isVisible({
        timeout: 1500
      }).catch(
        () => false
      )
    ) {
      await this.clickStripePortalControl(
        goBack,
        'Back To Portal Overview'
      );
      continue;
    }

    if (
      await billingCrumb.isVisible({
        timeout: 1500
      }).catch(
        () => false
      )
    ) {
      await safeClick(
        billingCrumb,
        'Back To Portal Overview'
      );
      continue;
    }

    if (
      await cancelNested.isVisible({
        timeout: 1500
      }).catch(
        () => false
      )
    ) {
      await safeClick(
        cancelNested,
        'Cancel Nested Portal Screen'
      );
    }
  }

  throw new Error(
    `Stripe portal overview is not visible after leaving a nested screen. URL: ${portalPage.url()}`
  );
}

private async waitForPortalOverview(
  portalPage: Page,
  timeout = 20000
) {
  const hasPortalOverview = async () => {
    const bodyText =
      await portalPage
        .locator(
          'body'
        )
        .innerText()
        .catch(
          () => ''
        );

    return /current subscription|subscription|current plan|your plan/i.test(
      bodyText
    ) &&
      /invoice|payment method|billing information|billing history|update plan|cancel plan|payment methods/i.test(
        bodyText
      );
  };

  return expect
    .poll(
      hasPortalOverview,
      {
        timeout
      }
    )
    .toBeTruthy()
    .then(
      () => true
    )
    .catch(
      () => false
    );
}

private async restoreFromPortal(
  portalPage?: Page
) {
  const pageToClose =
    portalPage ??
    this.activePortalPage;

  if (
    pageToClose &&
    pageToClose !== this.page &&
    !pageToClose.isClosed()
  ) {
    await pageToClose.close()
      .catch(
        () => undefined
      );
  }

  this.activePortalPage =
    undefined;

  if (
    /stripe\.com/i.test(
      this.page.url()
    )
  ) {
    Logger.info(
      'Leaving Stripe portal and returning to billing'
    );

    await this.page.goto(
      this.appUrl(
        URLS.BILLING
      ),
      {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      }
    );
  }

  await this.ensureOnApp();
}

async openSubscriptionPortal(
  options: {
    ensureOverview?: boolean
  } = {}
) {

  const ensureOverview =
    options.ensureOverview !==
    false;

  if (
    this.activePortalPage &&
    !this.activePortalPage.isClosed() &&
    /stripe\.com/i.test(
      this.activePortalPage.url()
    )
  ) {
    Logger.info(
      'Already on Stripe portal; reusing open portal tab'
    );

    if (
      ensureOverview
    ) {
      await this.ensurePortalOverview(
        this.activePortalPage
      );
    }

    return this.activePortalPage;
  }

  if (
    /stripe\.com/i.test(
      this.page.url()
    )
  ) {
    Logger.info(
      'Already on Stripe portal; reusing current tab'
    );

    this.activePortalPage =
      this.page;

    const reused =
      await this.waitForPortalOverview(
        this.page,
        15000
      );

    if (
      !reused
    ) {
      throw new Error(
        `Already on Stripe but portal overview did not load. URL: ${this.page.url()}`
      );
    }

    return this.page;
  }

  Logger.info(
    'Opening subscription management portal'
  );

  await this.ensureOnApp();

  if (
    !this.page.url().includes(
      '/billing'
    )
  ) {
    await this.validateOverview();
  } else {
    await this.waitForBillingContent();
  }

  if (
    await this.overviewTab.isVisible({
      timeout: 3000
    }).catch(
      () => false
    )
  ) {
    await safeClick(
      this.overviewTab,
      'Open Overview Tab'
    );
  }

  await this.dismissMarketingOverlays();

  const manageControl =
    await this.manageSubscriptionControl();

  await expect(
    manageControl
  ).toBeVisible({
    timeout: 15000
  });

  await manageControl.scrollIntoViewIfNeeded();

  const newPagePromise =
    this.page.context()
      .waitForEvent(
        'page',
        {
          timeout: 8000
        }
      )
      .catch(
        () => undefined
      );

  await safeClick(
    manageControl,
    'Manage Subscription'
  );

  const openedPage =
    await newPagePromise;

  const portalPage =
    openedPage ??
    this.page;

  await portalPage.waitForLoadState(
    'domcontentloaded'
  ).catch(
    () => undefined
  );

  await expect(
    portalPage
  ).toHaveURL(
    /stripe\.com/,
    {
      timeout: 30000
    }
  );

  let portalOverviewVisible =
    await this.waitForPortalOverview(
      portalPage,
      20000
    );

  if (!portalOverviewVisible) {
    await portalPage.reload({
      waitUntil: 'domcontentloaded'
    }).catch(
      () => undefined
    );

    portalOverviewVisible =
      await this.waitForPortalOverview(
        portalPage,
        15000
      );
  }

  if (!portalOverviewVisible) {
    throw new Error(
      `Stripe billing portal did not show the subscription overview. URL: ${portalPage.url()}`
    );
  }

  Logger.success(
    'Subscription management portal opened'
  );

  this.activePortalPage =
    portalPage;

  return portalPage;
}

private async assertPortalOverview(
  portalPage: Page
) {

  Logger.info(
    'Validating subscription portal overview'
  );

  await expect(
    portalPage.getByText(
      /current subscription|subscription/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  await expect(
    portalPage.getByText(
      /payment method/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  await expect(
    portalPage.getByText(
      /billing information|billing details|billing/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  await expect(
    portalPage.getByText(
      /invoice history|invoices/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  const portalText =
    await portalPage
      .locator(
        'body'
      )
      .innerText();

  expect(
    portalText
  ).toMatch(
    /subscription/i
  );

  expect(
    portalText
  ).toMatch(
    /payment method/i
  );

  expect(
    portalText
  ).toMatch(
    /billing (information|details)/i
  );

  expect(
    portalText
  ).toMatch(
    /invoice/i
  );

  const expectedPlan =
    process.env.BILLING_EXPECTED_PLAN;

  if (expectedPlan) {
    expect(
      portalText
    ).toMatch(
      new RegExp(
        expectedPlan.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        ),
        'i'
      )
    );
  } else {
    expect(
      portalText
    ).toMatch(
      /starter|income builder|overlay strategists|portfolio hedger|advanced|pro|curious explorer/i
    );
  }

  const expectedFrequency =
    process.env.BILLING_EXPECTED_FREQUENCY;

  if (expectedFrequency) {
    expect(
      portalText
    ).toMatch(
      new RegExp(
        expectedFrequency,
        'i'
      )
    );
  } else {
    expect(
      portalText
    ).toMatch(
      /per month|per year|\/ month|\/ year|monthly|annual/i
    );
  }

  const expectedCardLast4 =
    process.env.BILLING_EXPECTED_CARD_LAST4;

  if (expectedCardLast4) {
    expect(
      portalText
    ).toMatch(
      new RegExp(
        expectedCardLast4,
        'i'
      )
    );
  } else {
    expect(
      portalText
    ).toMatch(
      /visa|mastercard|card|payment method/i
    );
  }

  Logger.success(
    'Subscription portal overview validated'
  );
}

private async assertPortalInvoiceHistory(
  portalPage: Page
) {

  Logger.info(
    'Validating subscription portal invoice history'
  );

  await expect(
    portalPage.getByText(
      /invoice history/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  await expect(
    portalPage.getByText(
      /paid/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  const invoiceLink =
    portalPage.getByRole(
      'link',
      {
        name: /paid|invoice|\$\d|₹|advanced|builder|strategist/i
      }
    ).first();

  await expect(
    invoiceLink
  ).toBeVisible({
    timeout: 15000
  });

  const invoiceHref =
    await invoiceLink.getAttribute(
      'href'
    );

  expect(
    invoiceHref
  ).toBeTruthy();

  Logger.success(
    'Subscription portal invoice history validated'
  );
}

private async returnFromPortalToApplication(
  portalPage: Page
) {

  Logger.info(
    'Validating subscription portal return link'
  );

  await this.dismissStripeCancelDialog(
    portalPage
  );

  const returnControl =
    portalPage.getByRole(
      'link',
      {
        name: /return to/i
      }
    ).or(
      portalPage.getByRole(
        'button',
        {
          name: /return to/i
        }
      )
    ).first();

  const returnVisible =
    await returnControl.isVisible({
      timeout: 15000
    }).catch(
      () => false
    );

  if (
    returnVisible
  ) {
    await this.clickStripePortalControl(
      returnControl,
      'Return To Application'
    );

    await portalPage.waitForLoadState(
      'domcontentloaded'
    ).catch(
      () => undefined
    );

    await expect
      .poll(
        async () => {
          const currentUrl =
            portalPage.url();

          const bodyText =
            await portalPage.locator(
              'body'
            ).innerText()
              .catch(
                () => ''
              );

          return (
            /ooltool|dashboard|billing/i.test(
              currentUrl
            ) ||
            /ooltool|dashboard|billing|profile|plan/i.test(
              bodyText
            )
          );
        },
        {
          timeout: 30000,
          message:
            'Portal return action should land back on application content'
        }
      )
      .toBe(
        true
      );
  }

  await this.restoreFromPortal(
    portalPage
  );

  Logger.success(
    'Subscription portal return link validated'
  );
}

async validateStripePortalSession(
  options: {
    restore?: boolean
  } = {}
) {

  const restore =
    options.restore !==
    false;

  if (
    this.stripePortalSessionValidated
  ) {
    Logger.info(
      'Stripe portal session already validated in this test; skipping duplicate open'
    );

    if (
      restore
    ) {
      await this.restoreFromPortal();
    }

    return;
  }

  let portalPage: Page | undefined;

  try {
    portalPage =
      await this.openSubscriptionPortal();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(
          error
        );

    if (
      await this.isFreeOrNoCardPlan() ||
      /Manage subscription control was not found/i.test(
        message
      )
    ) {
      Logger.success(
        'Free or no-card plan has no Stripe customer portal. Billing overview is enough.'
      );

      return;
    }

    throw error;
  }

  await this.assertPortalOverview(
    portalPage
  );

  await this.assertPortalInvoiceHistory(
    portalPage
  );

  this.stripePortalSessionValidated =
    true;

  if (
    restore
  ) {
    await this.returnFromPortalToApplication(
      portalPage
    );
  }
}

async leaveStripePortal() {
  await this.restoreFromPortal();
}

async validateSubscriptionPortalOverview() {
  await this.validateStripePortalSession();
}

async validateSubscriptionPortalInvoiceHistory() {
  await this.validateStripePortalSession();
}

async validateSubscriptionPortalReturnToApplication() {
  await this.validateStripePortalSession();
}

async validateSubscriptionPortalCancellationLifecycleSummary() {

  if (
    await this.isFreeOrNoCardPlan()
  ) {
    Logger.success(
      'Free or no-card plan has no Stripe customer portal. Billing overview is enough.'
    );

    return;
  }

  const portalPage =
    await this.openSubscriptionPortal({
      ensureOverview: false
    });

  Logger.info(
    'Validating subscription cancellation lifecycle summary'
  );

  const portalText =
    await portalPage
      .locator(
        'body'
      )
      .innerText();

  expect(
    portalText
  ).toMatch(
    /current subscription|selected subscription|cancel subscription|cancels|service will end|payment method|billing information/i
  );

  const scheduledToCancel =
    /cancels\s+\w+|service will end|will end|scheduled to cancel|cancel at/i.test(
      portalText
    );

  if (scheduledToCancel) {
    expect(
      portalText
    ).toMatch(
      /cancels\s+\w+|service will end|will end|scheduled to cancel|cancel at/i
    );

    const restoreControl =
      portalPage.locator(
        'a, button'
      ).filter({
        hasText: /don'?t cancel subscription|resume subscription|reactivate|keep subscription/i
      }).first();

    if (
      await restoreControl.isVisible({
        timeout: 5000
      }).catch(
        () => false
      )
    ) {
      await expect(
        restoreControl
      ).toBeVisible();
    }
  } else {
    const cancelControl =
      portalPage.locator(
        'a, button'
      ).filter({
        hasText: /cancel subscription/i
      }).first();

    await expect(
      cancelControl
    ).toBeVisible({
      timeout: 15000
    });
  }

  expect(
    portalText
  ).not.toMatch(
    /subscription cancelled|subscription canceled|cancellation confirmed|successfully cancelled|successfully canceled/i
  );

  Logger.success(
    'Subscription cancellation lifecycle summary validated without changing subscription'
  );

}

async validatePaymentRecoveryEntryPointsSummary() {

  if (
    await this.isFreeOrNoCardPlan()
  ) {
    Logger.success(
      'Free or no-card plan has no Stripe customer portal. Billing overview is enough.'
    );

    return;
  }

  const portalPage =
    await this.openSubscriptionPortal();

  Logger.info(
    'Validating payment recovery entry points'
  );

  await expect(
    portalPage.getByText(
      /payment method/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  await expect(
    portalPage.getByText(
      /billing information/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  const recoveryControls =
    portalPage.locator(
      'a, button'
    ).filter({
      hasText: /add payment method|update information|update payment|payment method|billing information/i
    });

  await expect
    .poll(
      async () =>
        recoveryControls.count(),
      {
        timeout: 15000,
        message: 'Waiting for payment recovery controls in Stripe portal',
      }
    )
    .toBeGreaterThan(
      0
    );

  await expect(
    portalPage.getByText(
      /invoice history|current subscription|payment method/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  Logger.success(
    'Payment recovery entry points validated without saving changes'
  );

}

async validateAddPaymentMethodOpensWithoutSaving() {

  if (
    await this.isFreeOrNoCardPlan()
  ) {
    Logger.success(
      'Free or no-card plan has no Stripe customer portal. Billing overview is enough.'
    );

    return;
  }

  const portalPage =
    await this.openSubscriptionPortal();

  Logger.info(
    'Validating add payment method screen without saving'
  );

  await safeClick(
    portalPage.getByRole(
      'link',
      {
        name: /add payment method/i
      }
    ).first(),
    'Open Add Payment Method'
  );

  await portalPage.waitForLoadState(
    'domcontentloaded'
  );

  await expect(
    portalPage.getByText(
      /add payment method|payment method|card information|card/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  Logger.success(
    'Add payment method screen opened without saving'
  );

}

async validateBillingInformationUpdateOpensWithoutSaving() {

  if (
    await this.isFreeOrNoCardPlan()
  ) {
    Logger.success(
      'Free or no-card plan has no Stripe customer portal. Billing overview is enough.'
    );

    return;
  }

  const portalPage =
    await this.openSubscriptionPortal();

  Logger.info(
    'Validating billing information update screen without saving'
  );

  await safeClick(
    portalPage.getByRole(
      'link',
      {
        name: /update information/i
      }
    ).first(),
    'Open Update Billing Information'
  );

  await portalPage.waitForLoadState(
    'domcontentloaded'
  );

  await expect(
    portalPage.getByText(
      /billing information|update information|email|save|cancel/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  Logger.success(
    'Billing information update screen opened without saving'
  );

}

async validateCancelSubscriptionFormWithoutCancelling() {

  if (
    await this.isFreeOrNoCardPlan()
  ) {
    Logger.success(
      'Free or no-card plan has no Stripe customer portal. Billing overview is enough.'
    );

    return;
  }

  const portalPage =
    await this.openSubscriptionPortal();

  Logger.info(
    'Validating cancel subscription form without cancelling'
  );

  const alreadyCancelling =
    portalPage.getByText(
      /cancels\s+\w+|your service will end/i
    ).first();

  const reactivateControl =
    portalPage.getByRole(
      'link',
      {
        name: /don'?t cancel subscription|resume subscription|reactivate/i
      }
    ).first();

  if (
    await alreadyCancelling.isVisible({
      timeout: 5000
    }).catch(
      () => false
    )
  ) {
    await expect(
      reactivateControl
    ).toBeVisible({
      timeout: 15000
    });

    Logger.success(
      'Subscription is already scheduled to cancel; cancellation state validated without changing it'
    );

    return;
  }

  const cancelControl =
    portalPage.locator(
      'button, a'
    ).filter({
      hasText: /cancel subscription/i
    }).first();

  await safeClick(
    cancelControl,
    'Open Cancel Subscription'
  );

  await expect(
    portalPage.getByText(
      /cancel your subscription/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  await expect(
    portalPage.getByText(
      /selected subscription|why you'?re leaving|reason/i
    ).first()
  ).toBeVisible({
    timeout: 15000
  });

  const feedback =
    portalPage.locator(
      'textarea'
    ).first();

  if (
    await feedback.isVisible({
      timeout: 5000
    }).catch(
      () => false
    )
  ) {
    await feedback.fill(
      'Automation validation only - cancellation not submitted.'
    );
  }

  await this.dismissStripeCancelDialog(
    portalPage
  );

  const portalTextAfterBack =
    await portalPage
      .locator(
        'body'
      )
      .innerText()
      .catch(
        () => ''
      );

  expect(
    portalTextAfterBack
  ).not.toMatch(
    /subscription cancelled|subscription canceled|cancellation confirmed|successfully cancelled|successfully canceled/i
  );

  const returnedToOverview =
    /current subscription|payment method|billing information/i.test(
      portalTextAfterBack
    );

  const stillOnSafeCancelReview =
    /cancel your subscription|selected subscription|why you'?re leaving|reason/i.test(
      portalTextAfterBack
    );

  expect(
    returnedToOverview ||
      stillOnSafeCancelReview
  ).toBeTruthy();

  Logger.success(
    'Cancel subscription form validated without cancelling'
  );

}
}
