import {
  test,
  expect
} from '@playwright/test';

import {
  BASE_URL,
  TEST_USERS
} from './config/testData';

import {
  AccountsPage
} from './pages/AccountsPage';

import {
  DashboardPage
} from './pages/DashboardPage';

import {
  LoginPage
} from './pages/LoginPage';

import {
  safeClick
} from './helpers/safeClick';

/* =============================================================================
TEST SUITE: Broker Integration

PURPOSE
-------
Uses amit.vadgama@quantuminfoway.com to validate Manage Accounts, Connect broker
handoff (SnapTrade → Alpaca login), Disconnect confirmation, and Dashboard
Broker Accounts. Full OAuth connect→disconnect is optional when an Alpaca Paper
login is set (BROKER_ALPACA_* + BROKER_ALPACA_CONNECT=1).

ACCOUNT
-------
BROKER_INTEGRATION_EMAIL / BROKER_INTEGRATION_PASSWORD

AIR
---
Mapped to module + journey "Broker Integration".

RUN
---
npx playwright test tests/BrokerIntegration.spec.ts --reporter=line
============================================================================= */

const alpacaConnectEnabled =
  process.env.BROKER_ALPACA_CONNECT === '1' ||
  process.env.BROKER_ALPACA_CONNECT === 'true';

const alpacaEmail =
  TEST_USERS.brokerAlpacaPaper.email;

const alpacaPassword =
  process.env.BROKER_ALPACA_PASSWORD ??
  '';

test.describe(
  'Broker Integration',
  () => {
    test.describe.configure({
      timeout: 300000
    });

    test.beforeEach(
      async ({ page }) => {
        await page.context().clearCookies();
        await page.goto(
          `${BASE_URL}/login`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await new LoginPage(
          page
        ).login(
          TEST_USERS.brokerIntegration.email,
          TEST_USERS.brokerIntegration.password
        );

        await new DashboardPage(
          page
        ).validateLoaded();
      }
    );

    test(
      'Dashboard Broker Accounts card is visible for the broker integration subscriber',
      async ({ page }) => {
        await new DashboardPage(
          page
        ).validateBrokerAccounts();
      }
    );

    test(
      'Manage Accounts shows connected brokers and Connect broker dialog controls',
      async ({ page }) => {
        const accounts =
          new AccountsPage(
            page
          );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /manage accounts/i
            }
          ).or(
            page.getByRole(
              'button',
              {
                name: /manage accounts/i
              }
            )
          ).first(),
          'Manage accounts'
        );

        await accounts.validateBrokerIntegrationSurface();

        await expect(
          page
        ).toHaveURL(
          /accounts/i
        );
      }
    );

    test(
      'Accounts page opens from /dashboard/accounts and keeps Connect broker available',
      async ({ page }) => {
        await page.goto(
          `${BASE_URL}/dashboard/accounts`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        const accounts =
          new AccountsPage(
            page
          );

        await accounts.validateLoaded();

        await expect(
          page.getByRole(
            'button',
            {
              name: /connect broker/i
            }
          ).or(
            page.getByRole(
              'link',
              {
                name: /connect broker/i
              }
            )
          ).first()
        ).toBeVisible();
      }
    );

    test(
      'Connect broker handoff reaches Alpaca login and Disconnect confirmation can be cancelled',
      async ({ page }) => {
        await page.goto(
          `${BASE_URL}/dashboard/accounts`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        const accounts =
          new AccountsPage(
            page
          );

        await accounts.validateConnectHandoffAndDisconnectConfirmation(
          BASE_URL
        );

        await page.goto(
          `${BASE_URL}/dashboard`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await new DashboardPage(
          page
        ).validateBrokerAccounts();
      }
    );

    test(
      'Connect Alpaca Paper, validate connected broker, disconnect, then validate all Accounts functionality',
      async ({ page }) => {
        test.skip(
          !alpacaConnectEnabled ||
            !alpacaEmail ||
            !alpacaPassword,
          'Optional full OAuth: set BROKER_ALPACA_EMAIL, BROKER_ALPACA_PASSWORD, and BROKER_ALPACA_CONNECT=1'
        );

        await page.goto(
          `${BASE_URL}/dashboard/accounts`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        const accounts =
          new AccountsPage(
            page
          );

        await accounts.connectValidateDisconnectBroker({
          brokerName: /alpaca paper|alpaca/i,
          alpacaEmail,
          alpacaPassword,
          baseUrl: BASE_URL
        });

        await page.goto(
          `${BASE_URL}/dashboard`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        await new DashboardPage(
          page
        ).validateBrokerAccounts();
      }
    );
  }
);
