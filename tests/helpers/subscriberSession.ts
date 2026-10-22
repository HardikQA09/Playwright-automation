import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL,
  TEST_USERS
} from '../config/testData';

import { LoginPage }
  from '../pages/LoginPage';

export function isLoginUrl(
  url: string
) {
  return /\/login(?:\?|$)/.test(
    url
  );
}

export async function restoreSubscriberSession(
  page: Page
) {
  await new LoginPage(
    page
  ).login(
    TEST_USERS.subscriber.email,
    TEST_USERS.subscriber.password
  );
}

async function gotoWithNetworkRetry(
  page: Page,
  url: string
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(
        url,
        {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        }
      );
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

      await page.waitForTimeout(
        1500 * attempt
      );
    }
  }

  throw lastError;
}

export async function openAuthenticatedPath(
  page: Page,
  path: string,
  urlPattern: RegExp
) {
  await gotoWithNetworkRetry(
    page,
    `${BASE_URL}${path}`
  );

  if (
    isLoginUrl(
      page.url()
    )
  ) {
    await restoreSubscriberSession(
      page
    );

    await gotoWithNetworkRetry(
      page,
      `${BASE_URL}${path}`
    );
  }

  await expect(
    page
  ).toHaveURL(
    urlPattern,
    {
      timeout: 30000
    }
  );
}
