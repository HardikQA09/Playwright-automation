import { Page } from '@playwright/test';

import { URLS }
  from '../config/constants';
import { BASE_URL }
  from '../config/testData';
import {
  dismissOverlays
} from '../helpers/dismissOverlays';

/* ============================================================================
PAGE OBJECT: BasePage

PURPOSE
-------
Parent class for all page objects. Provides shared page navigation,
refresh, wait, and URL helper methods.

============================================================================ */

export class BasePage {

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async wait(ms: number) {
    await this.page.waitForTimeout(ms);
  }

  async refresh() {
    const currentUrl =
      this.page.url();

    try {
      await this.page.reload({
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      return;
    } catch {
      // Dashboard widgets can keep reload from reaching
      // domcontentloaded during a long suite.
    }

    try {
      await this.page.reload({
        waitUntil: 'commit',
        timeout: 10000
      });
      return;
    } catch {
      // Fall through to a fresh navigation.
    }

    if (
      /^https?:\/\//i.test(
        currentUrl
      )
    ) {
      await this.page.goto(
        currentUrl,
        {
          waitUntil: 'domcontentloaded',
          timeout: 20000
        }
      ).catch(
        () => undefined
      );
    }
  }

  async navigate(url: string) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        return;
      } catch (error) {
        lastError = error;
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        if (
          !/ERR_CONNECTION_RESET|ERR_CONNECTION_TIMED_OUT|ERR_NETWORK|Timeout|net::ERR_/i.test(
            message
          ) ||
          attempt === 3
        ) {
          throw error;
        }

        await this.page.waitForTimeout(
          1500 * attempt
        );
      }
    }

    throw lastError;
  }

  async gotoWithRetry(
    url: string,
    options: {
      waitUntil?: 'domcontentloaded' | 'load' | 'commit';
      timeout?: number;
    } = {}
  ) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.page.goto(url, {
          waitUntil: options.waitUntil ?? 'domcontentloaded',
          timeout: options.timeout ?? 60000
        });
        return;
      } catch (error) {
        lastError = error;
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        if (
          !/ERR_CONNECTION_RESET|ERR_CONNECTION_TIMED_OUT|ERR_NETWORK|Timeout|net::ERR_/i.test(
            message
          ) ||
          attempt === 3
        ) {
          throw error;
        }

        await this.page.waitForTimeout(
          1500 * attempt
        );
      }
    }

    throw lastError;
  }

  async dismissMarketingOverlays() {
    await dismissOverlays(
      this.page
    );
  }

  getCurrentUrl() {
    return this.page.url();
  }

  appUrl(
    path: string
  ) {
    try {
      const currentUrl =
        new URL(
          this.page.url()
        );
      const appUrlBase =
        new URL(
          BASE_URL
        );

      if (
        currentUrl.origin ===
        appUrlBase.origin
      ) {
        return new URL(
          path,
          currentUrl
        ).toString();
      }
    } catch {
      // Fall through to BASE_URL when the current tab is about:blank or Stripe.
    }

    return new URL(
      path,
      BASE_URL
    ).toString();
  }

  async ensureOnApp() {
    const currentUrl =
      this.page.url();

    if (
      /^https?:\/\//i.test(
        currentUrl
      ) &&
      !/stripe\.com/i.test(
        currentUrl
      )
    ) {
      return;
    }

    await this.gotoWithRetry(
      this.appUrl(
        URLS.DASHBOARD
      )
    );
  }
}
