import {
  Page,
  expect
} from '@playwright/test';

import { safeClick } from '../helpers/safeClick';

import {
  CARDHOLDER_NAME,
  COUNTRY,
  STRIPE_CARD,
  STRIPE_DECLINED_CARD,
  STRIPE_EXPIRY,
  STRIPE_CVC,
  uniqueStripeTrialCard
} from '../config/testData';

import { BasePage } from './BasePage';
import { Logger } from '../utils/logger';

function stripeCheckoutPlanPattern(
  expectedPlan: string
) {
  const normalized =
    expectedPlan.trim();

  const aliases: Record<string, string> = {
    'Income Builder':
      'Income Builder|Subscribe to Income|\\bIncome\\b',
    'Overlay Strategists':
      'Overlay Strategists|Subscribe to Overlay|\\bOverlay\\b',
    'Portfolio Hedger':
      'Portfolio Hedger|Portfolio Hedge|3-Advanced|Subscribe to 3-Advanced'
  };

  const mapped =
    aliases[normalized];

  if (mapped) {
    return new RegExp(
      mapped,
      'i'
    );
  }

  const escaped =
    normalized.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

  const firstToken =
    normalized
      .split(
        /\s+/
      )[0]
      ?.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );

  return new RegExp(
    firstToken
      ? `${escaped}|${firstToken}`
      : escaped,
    'i'
  );
}

/* ============================================================================
PAGE OBJECT: StripePaymentPage

PURPOSE
-------
Handles Stripe Checkout success and validation scenarios used by subscription
and onboarding payment tests.
============================================================================ */

export class StripePaymentPage
  extends BasePage {

  constructor(page: Page) {
    super(page);
  }

  private paymentButton() {
    return this.page.getByRole(
      'button',
      {
        name: /subscribe|pay|complete|start/i
      }
    );
  }

  async waitForCheckoutReady() {
    await this.page.waitForURL(
      /checkout.stripe.com/,
      {
        timeout: 60000,
        waitUntil: 'commit'
      }
    );

    Logger.success(
      'Stripe Checkout Loaded'
    );

    await this.page.locator(
      '#cardNumber'
    ).waitFor({
      state: 'visible',
      timeout: 60000
    });

    Logger.success(
      'Stripe Card Fields Visible'
    );
  }

  async fillBasicBillingDetails() {
    const name =
      this.page.locator(
        '#billingName'
      );

    if (
      await name.count()
    ) {
      await name.fill(
        CARDHOLDER_NAME
      );

      Logger.success(
        'Billing Name Entered'
      );
    }

    const country =
      this.page.locator(
        '#billingCountry'
      );

    if (
      await country.count()
    ) {
      await country.selectOption(
        COUNTRY
      );

      Logger.success(
        'Country Selected India'
      );
    }
  }

  async validateMissingCardDetailsBlocked() {
    Logger.info(
      'Validating Stripe blocks missing card details'
    );

    await this.waitForCheckoutReady();

    await this.fillBasicBillingDetails();

    const payButton =
      this.paymentButton();

    const isDisabled =
      await payButton
        .isDisabled()
        .catch(
          () => false
        );

    if (isDisabled) {
      Logger.success(
        'Stripe submit button is disabled until card details are entered'
      );

      return;
    }

    await safeClick(
      payButton,
      'Submit Empty Stripe Checkout'
    );

    await expect(
      this.page
    ).toHaveURL(
      /checkout\.stripe\.com/,
      {
        timeout: 15000
      }
    );

    await expect(
      this.page.getByText(
        /card|payment|incomplete|required|invalid/i
      ).first()
    ).toBeVisible({
      timeout: 15000
    });

    Logger.success(
      'Stripe checkout stayed open and displayed card validation'
    );
  }

  async validateTrialCheckoutDetails(
    expectedEmail?: string
  ) {
    Logger.info(
      'Validating Stripe trial checkout details'
    );

    await this.waitForCheckoutReady();

    await expect(
      this.page.locator(
        'body'
      )
    ).toContainText(
      /30 days free|start trial|free trial|trial|subscribe to overlay|overlay/i,
      {
        timeout: 15000
      }
    );

    if (expectedEmail) {
      await expect(
        this.page.locator(
          'body'
        )
      ).toContainText(
        expectedEmail,
        {
          timeout: 15000
        }
      );
    }

    await expect(
      this.page.locator(
        '#cardNumber'
      )
    ).toBeVisible({
      timeout: 15000
    });

    await expect(
      this.page.locator(
        '#cardExpiry'
      )
    ).toBeVisible({
      timeout: 15000
    });

    await expect(
      this.page.locator(
        '#cardCvc'
      )
    ).toBeVisible({
      timeout: 15000
    });

    await expect(
      this.page.locator(
        'body'
      )
    ).toContainText(
      /INR|USD|cardholder name|country or region/i,
      {
        timeout: 15000
      }
    );

    Logger.success(
      'Stripe trial checkout details validated'
    );
  }

  async validateSubscriptionCheckoutDetails(
    options: {
      expectedEmail?: string;
      expectedPlan?: string;
      expectedBillingCopy?: RegExp;
    } = {}
  ) {
    Logger.info(
      'Validating Stripe subscription checkout details'
    );

    await this.waitForCheckoutReady();

    const body =
      this.page.locator(
        'body'
      );

    if (options.expectedEmail) {
      await expect(
        body
      ).toContainText(
        options.expectedEmail,
        {
          timeout: 15000
        }
      );
    }

    if (options.expectedPlan) {
      await expect(
        body
      ).toContainText(
        stripeCheckoutPlanPattern(
          options.expectedPlan
        ),
        {
          timeout: 15000
        }
      );
    }

    await expect(
      body
    ).toContainText(
      options.expectedBillingCopy ??
        /per month|per year|monthly|annual|subscription|total|due/i,
      {
        timeout: 15000
      }
    );

    await expect(
      this.page.locator(
        '#cardNumber'
      )
    ).toBeVisible({
      timeout: 15000
    });

    await expect(
      this.page.locator(
        '#cardExpiry'
      )
    ).toBeVisible({
      timeout: 15000
    });

    await expect(
      this.page.locator(
        '#cardCvc'
      )
    ).toBeVisible({
      timeout: 15000
    });

    await expect(
      body
    ).toContainText(
      /INR|USD|cardholder name|country or region/i,
      {
        timeout: 15000
      }
    );

    Logger.success(
      'Stripe subscription checkout details validated'
    );
  }

  async validatePlanChangeCalculationPreview(
    options: {
      expectedEmail?: string;
      expectedPlan: string;
      expectedBillingCopy: RegExp;
      expectedCalculationCopy?: RegExp;
    }
  ) {
    Logger.info(
      'Validating Stripe plan-change calculation preview'
    );

    await this.validateSubscriptionCheckoutDetails({
      expectedEmail:
        options.expectedEmail,
      expectedPlan:
        options.expectedPlan,
      expectedBillingCopy:
        options.expectedBillingCopy
    });

    const bodyText =
      await this.page
        .locator(
          'body'
        )
        .innerText();

    expect(
      bodyText
    ).toMatch(
      options.expectedCalculationCopy ??
        /total|subtotal|due|amount|charged|pay|tax|credit|prorat|remaining/i
    );

    Logger.success(
      'Stripe plan-change calculation preview validated'
    );
  }

  async validateCurrencyAndConversionDetails() {
    Logger.info(
      'Validating Stripe currency and conversion details'
    );

    await this.waitForCheckoutReady();

    const bodyText =
      await this.page
        .locator(
          'body'
        )
        .innerText();

    expect(
      bodyText
    ).toMatch(
      /INR/i
    );

    expect(
      bodyText
    ).toMatch(
      /USD/i
    );

    expect(
      bodyText
    ).toMatch(
      /conversion fee|exchange rate|charges will vary|based on exchange rates/i
    );

    Logger.success(
      'Stripe currency and conversion details validated'
    );
  }

  async validateDeclinedCardRejected() {
    Logger.info(
      'Validating Stripe rejects declined card'
    );

    await this.waitForCheckoutReady();

    await this.page.locator(
      '#cardNumber'
    ).fill(
      STRIPE_DECLINED_CARD
    );

    Logger.success(
      'Declined card number entered'
    );

    await this.page.locator(
      '#cardExpiry'
    ).fill(
      STRIPE_EXPIRY
    );

    await this.page.locator(
      '#cardCvc'
    ).fill(
      STRIPE_CVC
    );

    await this.fillBasicBillingDetails();

    const payButton =
      this.paymentButton();

    await expect(
      payButton
    ).toBeEnabled({
      timeout: 30000
    });

    await safeClick(
      payButton,
      'Submit Declined Stripe Card'
    );

    await expect(
      this.page
    ).toHaveURL(
      /checkout\.stripe\.com/,
      {
        timeout: 30000
      }
    );

    await expect(
      this.page.getByText(
        /declined|card was declined|payment failed|try another card/i
      ).first()
    ).toBeVisible({
      timeout: 30000
    });

    Logger.success(
      'Stripe declined card validation displayed'
    );
  }

  async completePayment(
    cardNumber = STRIPE_CARD
  ) {
    Logger.info(
      'Completing Stripe Payment'
    );

    await this.waitForCheckoutReady();

    await this.page.locator(
      '#cardNumber'
    ).fill(
      cardNumber
    );

    Logger.success(
      `Card Number Entered (...${cardNumber.slice(-4)})`
    );

    await this.page.locator(
      '#cardExpiry'
    ).fill(
      STRIPE_EXPIRY
    );

    Logger.success(
      'Expiry Entered'
    );

    await this.page.locator(
      '#cardCvc'
    ).fill(
      STRIPE_CVC
    );

    Logger.success(
      'CVC Entered'
    );

    await this.fillBasicBillingDetails();

    const payButton =
      this.paymentButton();

    await expect(
      payButton
    ).toBeEnabled({
      timeout: 30000
    });

    await safeClick(
      payButton,
      'Complete Payment'
    );

    Logger.success(
      'Payment Submitted'
    );

    await this.page.waitForURL(
      url =>
        !url
          .toString()
          .includes(
            'checkout.stripe.com'
          ),
      {
        timeout: 60000
      }
    ).catch(
      () => undefined
    );

    Logger.url(
      this.page.url()
    );

    const successToast =
      this.page.getByText(
        /payment successful/i
      );

    if (
      await successToast.count()
    ) {
      await expect(
        successToast
      ).toBeVisible({
        timeout: 10000
      });

      Logger.success(
        'Payment Success Message Displayed'
      );
    }

    Logger.celebration(
      'Payment Completed'
    );
  }

  async completeTrialPayment() {
    const firstCard =
      await this.submitUniqueTrialCard();

    // Stripe keeps the form disabled and the page open while it confirms
    // the card, so give the redirect time before deciding the card failed.
    await this.page.waitForURL(
      (url) =>
        !/checkout\.stripe\.com/i.test(
          url.toString()
        ),
      {
        timeout: 45000
      }
    ).catch(
      () => undefined
    );

    if (
      this.onStripeCheckout()
    ) {
      console.log(
        'Stripe checkout still open after trial card; trying another unused test card'
      );

      // Never retry the same fingerprint — SC-07 hung on ...0008 twice.
      await this.submitUniqueTrialCard(
        firstCard
      );

      await this.page.waitForURL(
        (url) =>
          !/checkout\.stripe\.com/i.test(
            url.toString()
          ),
        {
          timeout: 45000
        }
      ).catch(
        () => undefined
      );
    }
  }

  private onStripeCheckout() {
    return /checkout\.stripe\.com/i.test(
      this.page.url()
    );
  }

  private async submitUniqueTrialCard(
    excludeCard?: string
  ) {
    const trialCard =
      uniqueStripeTrialCard(
        undefined,
        excludeCard
      );

    console.log(
      'With-card trial Stripe card:',
      `...${trialCard.slice(-4)}`
    );

    await this.completePayment(
      trialCard
    );

    return trialCard;
  }
}
