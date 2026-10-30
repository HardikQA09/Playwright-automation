import {
  expect,
  Locator
} from '@playwright/test';

import { BasePage }
  from './BasePage';

import {
  PORTFOLIO_OR_POSITIONS_URL
} from '../helpers/portfolioRoutes';

import { safeClick }
  from '../helpers/safeClick';

import { Logger }
  from '../utils/logger';

/* =============================================================================
PAGE OBJECT: AccountsPage

PURPOSE
-------
Manage Accounts opens connected broker accounts. Connect broker can complete a
practice broker OAuth (Alpaca Paper via SnapTrade), then disconnect that
connection and re-validate Accounts / Dashboard surfaces. Manual portfolio
disconnect and remove confirmations stay cancel-only unless a scenario
explicitly submits them.
============================================================================= */

export class AccountsPage
  extends BasePage {

  async validateLoaded() {
    Logger.info(
      'Validating Accounts'
    );

    await expect(
      this.page
    ).toHaveURL(
      /accounts/,
      {
        timeout: 20000
      }
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /^accounts$/i
        }
      )
    ).toBeVisible({
      timeout: 20000
    });

    await expect(
      this.page.getByText(
        /connected broker accounts|manage your connected broker accounts/i
      ).first()
    ).toBeVisible();

    await expect(
      this.connectBrokerControl()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /manual entry/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /manual portfolio/i
      ).first()
    ).toBeVisible();

    for (const label of [
      /invested/i,
      /current value/i,
      /unrealized/i,
      // The column header is "Cash" (it used to read "Cash balance").
      /^cash( balance)?$/i
    ]) {
      await expect(
        this.page.getByRole(
          'columnheader',
          {
            name: label
          }
        ).or(
          this.page.getByText(
            label
          )
        ).first()
      ).toBeVisible();
    }

    await expect(
      this.page.locator(
        'main'
      )
    ).toContainText(
      /\$[\d,.]+/
    );

    Logger.success(
      'Accounts are shown'
    );
  }

  async verifyDeleteAndDisconnect() {
    Logger.info(
      'Opening delete and disconnect confirmations'
    );

    await this.confirmAndCancel(
      this.page.getByRole(
        'button',
        {
          name: /^disconnect$/i
        }
      ),
      /disconnect/i,
      'Disconnect'
    );

    await this.confirmAndCancel(
      this.page.getByRole(
        'button',
        {
          name: /remove manual portfolio/i
        }
      ),
      /remove|delete|portfolio/i,
      'Remove Manual Portfolio'
    );

    await this.closeConnectBroker();

    await expect(
      this.page.getByText(
        /manual portfolio/i
      ).first()
    ).toBeVisible();

    Logger.success(
      'Delete and disconnect were cancelled'
    );
  }

  private async confirmAndCancel(
    trigger: Locator,
    expected: RegExp,
    label: string
  ) {
    await safeClick(
      trigger.first(),
      label
    );

    const dialog =
      this.dialog();

    await expect(
      dialog
    ).toBeVisible({
      timeout: 10000
    });

    await expect(
      dialog
    ).toContainText(
      expected
    );

    await expect(
      dialog.getByRole(
        'button',
        {
          name: /disconnect|remove|delete/i
        }
      )
    ).toBeVisible();

    await safeClick(
      dialog.getByRole(
        'button',
        {
          name: /^cancel$/i
        }
      ),
      `Cancel ${label}`
    );

    await expect(
      dialog
    ).toBeHidden({
      timeout: 10000
    });
  }

  private async confirmAndAccept(
    trigger: Locator,
    expected: RegExp,
    label: string
  ) {
    await safeClick(
      trigger.first(),
      label
    );

    const dialog =
      this.dialog();

    await expect(
      dialog
    ).toBeVisible({
      timeout: 10000
    });

    await expect(
      dialog
    ).toContainText(
      expected
    );

    await safeClick(
      dialog.getByRole(
        'button',
        {
          name: /disconnect|remove|delete|confirm|yes/i
        }
      ).filter({
        hasNotText: /^cancel$/i
      }).first(),
      `Confirm ${label}`
    );

    await expect(
      dialog
    ).toBeHidden({
      timeout: 20000
    });
  }

  async openConnectBrokerAndCancel() {
    await this.closeConnectBroker();
  }

  async validateBrokerIntegrationSurface() {
    Logger.info(
      'Validating broker integration surface on Accounts'
    );

    await this.validateLoaded();

    const main =
      this.page.locator(
        'main'
      );

    await expect(
      main
    ).toContainText(
      /connected broker accounts|manual entry|manual portfolio/i
    );

    await expect(
      this.connectBrokerControl()
    ).toBeVisible();

    await this.openConnectBrokerAndCancel();

    const disconnect =
      this.page.getByRole(
        'button',
        {
          name: /^disconnect$/i
        }
      ).first();

    if (
      await disconnect.isVisible().catch(
        () => false
      )
    ) {
      await this.confirmAndCancel(
        disconnect,
        /disconnect/i,
        'Disconnect'
      );
    }

    Logger.success(
      'Broker integration surface validated'
    );
  }


  /**
   * Runs without external Alpaca credentials:
   * Connect broker → Alpaca Paper → SnapTrade Continue → Alpaca login handoff,
   * return to Accounts, validate surface, open Disconnect confirmation and cancel.
   */
  async validateConnectHandoffAndDisconnectConfirmation(
    baseUrl: string
  ) {
    Logger.info(
      'Validating Connect broker handoff and Disconnect confirmation'
    );

    await this.validateLoaded();
    await this.openConnectBrokerDialog();
    await this.selectBrokerFromDialog(
      /alpaca paper/i
    );

    await this.page.waitForURL(
      /snaptrade\.com/i,
      {
        timeout: 60000
      }
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /authentication|alpaca paper|connect/i
        }
      ).first()
    ).toBeVisible({
      timeout: 30000
    });

    const continueBtn =
      this.page.getByRole(
        'button',
        {
          name: /^continue$/i
        }
      );

    await expect(
      continueBtn
    ).toBeVisible({
      timeout: 20000
    });

    await safeClick(
      continueBtn,
      'SnapTrade Continue'
    );

    await this.page.waitForURL(
      /alpaca\.markets/i,
      {
        timeout: 90000
      }
    );

    await this.acceptAlpacaCookiesIfPresent();

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /login/i
        }
      ).or(
        this.page.getByText(
          /email and password/i
        )
      ).first()
    ).toBeVisible({
      timeout: 30000
    });

    Logger.success(
      'Connect broker handoff reached Alpaca login'
    );

    await this.page.goto(
      `${baseUrl.replace(/\/$/, '')}/dashboard/accounts`,
      {
        waitUntil: 'domcontentloaded'
      }
    );

    await this.validateLoaded();
    await this.validateConnectedBrokerFunctionality();

    const disconnect =
      this.page.getByRole(
        'button',
        {
          name: /^disconnect$/i
        }
      ).first();

    await expect(
      disconnect
    ).toBeVisible();

    await this.confirmAndCancel(
      disconnect,
      /disconnect/i,
      'Disconnect'
    );

    await expect(
      this.page.getByText(
        /manual portfolio/i
      ).first()
    ).toBeVisible();

    await expect(
      this.connectBrokerControl()
    ).toBeVisible();

    Logger.success(
      'Connect handoff and Disconnect confirmation validated'
    );
  }

  /**
   * Full lifecycle: Connect Alpaca Paper via SnapTrade, validate the new
   * connected row, disconnect that broker, then re-validate Accounts.
   */
  async connectValidateDisconnectBroker(options: {
    brokerName?: RegExp | string;
    alpacaEmail: string;
    alpacaPassword: string;
    baseUrl: string;
  }) {
    const brokerName =
      options.brokerName ??
      /alpaca paper/i;

    Logger.info(
      'Connecting practice broker, validating, then disconnecting'
    );

    await this.validateLoaded();
    await this.disconnectConnectedBrokerIfPresent(
      brokerName
    );

    await this.openConnectBrokerDialog();
    await this.selectBrokerFromDialog(
      brokerName
    );
    await this.completeSnapTradeAndAlpacaLogin(
      options.alpacaEmail,
      options.alpacaPassword,
      options.baseUrl
    );

    await this.validateLoaded();
    await this.validateConnectedBroker(
      brokerName
    );
    await this.validateConnectedBrokerFunctionality();

    await this.disconnectConnectedBroker(
      brokerName
    );
    await this.validateBrokerDisconnected(
      brokerName
    );
    await this.validateAllBrokerIntegrationFunctionality();

    Logger.success(
      'Broker connect → validate → disconnect lifecycle completed'
    );
  }

  async openConnectBrokerDialog() {
    Logger.info(
      'Opening Connect broker'
    );

    await safeClick(
      this.connectBrokerControl(),
      'Connect broker'
    );

    const dialog =
      this.dialog();

    await expect(
      dialog
    ).toBeVisible({
      timeout: 15000
    });

    await expect(
      dialog
    ).toContainText(
      /connect a broker|available brokers|search brokers/i
    );

    await expect(
      dialog.getByRole(
        'textbox',
        {
          name: /search brokers/i
        }
      )
    ).toBeVisible();

    await expect(
      dialog.getByRole(
        'button',
        {
          name: /bulk upload/i
        }
      )
    ).toBeVisible();

    await expect(
      dialog.getByRole(
        'button',
        {
          name: /enter manually/i
        }
      )
    ).toBeVisible();

    Logger.success(
      'Connect broker dialog is open'
    );
  }

  async selectBrokerFromDialog(
    brokerName: RegExp | string
  ) {
    const pattern =
      typeof brokerName === 'string'
        ? new RegExp(
            brokerName,
            'i'
          )
        : brokerName;

    Logger.info(
      `Selecting broker ${pattern}`
    );

    const dialog =
      this.dialog();

    const search =
      dialog.getByRole(
        'textbox',
        {
          name: /search brokers/i
        }
      );

    const needle =
      typeof brokerName === 'string'
        ? brokerName
        : 'Alpaca Paper';

    await search.fill(
      needle
    );

    const option =
      dialog.getByRole(
        'button',
        {
          name: pattern
        }
      ).first();

    await expect(
      option
    ).toBeVisible({
      timeout: 15000
    });

    await Promise.all([
      this.page.waitForURL(
        /snaptrade\.com|alpaca\.markets|ooltool\.com/i,
        {
          timeout: 60000
        }
      ).catch(
        () => undefined
      ),
      safeClick(
        option,
        `Select broker ${needle}`
      )
    ]);

    Logger.success(
      `Broker ${needle} selected`
    );
  }

  async completeSnapTradeAndAlpacaLogin(
    email: string,
    password: string,
    baseUrl: string
  ) {
    Logger.info(
      'Completing SnapTrade / Alpaca Paper OAuth'
    );

    await this.page.waitForURL(
      /snaptrade\.com|alpaca\.markets/i,
      {
        timeout: 60000
      }
    );

    if (
      /snaptrade\.com/i.test(
        this.page.url()
      )
    ) {
      await expect(
        this.page.getByRole(
          'heading',
          {
            name: /authentication|alpaca paper|connect/i
          }
        ).first()
      ).toBeVisible({
        timeout: 30000
      });

      const continueBtn =
        this.page.getByRole(
          'button',
          {
            name: /^continue$/i
          }
        );

      await expect(
        continueBtn
      ).toBeVisible({
        timeout: 20000
      });

      await safeClick(
        continueBtn,
        'SnapTrade Continue'
      );
    }

    await this.page.waitForURL(
      /alpaca\.markets|ooltool\.com/i,
      {
        timeout: 90000
      }
    );

    if (
      /alpaca\.markets/i.test(
        this.page.url()
      )
    ) {
      await this.acceptAlpacaCookiesIfPresent();

      await expect(
        this.page.getByRole(
          'heading',
          {
            name: /login/i
          }
        ).or(
          this.page.getByText(
            /email and password/i
          )
        ).first()
      ).toBeVisible({
        timeout: 30000
      });

      const emailBox =
        this.page.locator(
          'input[type="email"], input[name="email"]'
        ).first();

      const passwordBox =
        this.page.locator(
          'input[type="password"], input[name="password"]'
        ).first();

      await emailBox.fill(
        email
      );
      await passwordBox.fill(
        password
      );

      await safeClick(
        this.page.getByRole(
          'button',
          {
            name: /^continue$/i
          }
        ).or(
          this.page.locator(
            'button[type="submit"], input[type="submit"]'
          )
        ).first(),
        'Alpaca login Continue'
      );

      await this.authorizeAlpacaIfPrompted();
    }

    const accountsUrl =
      `${baseUrl.replace(/\/$/, '')}/dashboard/accounts`;

    await this.page.waitForURL(
      /ooltool\.com.*accounts|\/dashboard\/accounts/i,
      {
        timeout: 120000
      }
    ).catch(
      async () => {
        Logger.info(
          'OAuth return did not land on Accounts; navigating back'
        );
        await this.page.goto(
          accountsUrl,
          {
            waitUntil: 'domcontentloaded'
          }
        );
      }
    );

    if (
      !/accounts/i.test(
        this.page.url()
      )
    ) {
      await this.page.goto(
        accountsUrl,
        {
          waitUntil: 'domcontentloaded'
        }
      );
    }

    Logger.success(
      'Returned from broker OAuth to Accounts'
    );
  }

  async validateConnectedBroker(
    brokerName: RegExp | string
  ) {
    const pattern =
      typeof brokerName === 'string'
        ? new RegExp(
            brokerName,
            'i'
          )
        : brokerName;

    Logger.info(
      `Validating connected broker ${pattern}`
    );

    const main =
      this.page.locator(
        'main'
      );

    await expect(
      main
    ).toContainText(
      pattern,
      {
        timeout: 60000
      }
    );

    await expect(
      main
    ).toContainText(
      /active/i
    );

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /^disconnect$/i
        }
      ).first()
    ).toBeVisible();

    Logger.success(
      'Connected broker is visible and active'
    );
  }

  async validateConnectedBrokerFunctionality() {
    Logger.info(
      'Validating connected-broker Accounts functionality'
    );

    await expect(
      this.connectBrokerControl()
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /sync all/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /sync/i
          }
        )
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'link',
        {
          name: /view positions/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /view positions/i
          }
        )
      ).first()
    ).toBeVisible();

    await expect(
      this.page.locator(
        'main'
      )
    ).toContainText(
      /\$[\d,.]+/
    );

    Logger.success(
      'Connected-broker functionality looks healthy'
    );
  }

  async disconnectConnectedBroker(
    brokerName: RegExp | string
  ) {
    const pattern =
      typeof brokerName === 'string'
        ? new RegExp(
            brokerName,
            'i'
          )
        : brokerName;

    Logger.info(
      `Disconnecting connected broker ${pattern}`
    );

    await expect(
      this.page.locator(
        'main'
      )
    ).toContainText(
      pattern,
      {
        timeout: 20000
      }
    );

    const trigger =
      this.page.locator(
        'main'
      ).getByRole(
        'button',
        {
          name: /^disconnect$/i
        }
      ).nth(
        await this.disconnectIndexForBroker(
          pattern
        )
      );

    await this.confirmAndAccept(
      trigger,
      /disconnect/i,
      'Disconnect connected broker'
    );

    Logger.success(
      'Disconnect confirmed for connected broker'
    );
  }

  async disconnectConnectedBrokerIfPresent(
    brokerName: RegExp | string
  ) {
    const pattern =
      typeof brokerName === 'string'
        ? new RegExp(
            brokerName,
            'i'
          )
        : brokerName;

    const mainText =
      await this.page.locator(
        'main'
      ).innerText().catch(
        () => ''
      );

    if (
      !pattern.test(
        mainText
      )
    ) {
      return;
    }

    Logger.info(
      'Existing matching broker found — disconnecting before reconnect'
    );

    await this.disconnectConnectedBroker(
      pattern
    );
    await this.validateBrokerDisconnected(
      pattern
    );
  }

  async validateBrokerDisconnected(
    brokerName: RegExp | string
  ) {
    const pattern =
      typeof brokerName === 'string'
        ? new RegExp(
            brokerName,
            'i'
          )
        : brokerName;

    Logger.info(
      `Validating broker disconnected ${pattern}`
    );

    await expect(
      this.page.locator(
        'main'
      )
    ).not.toContainText(
      pattern,
      {
        timeout: 60000
      }
    );

    await expect(
      this.page.getByText(
        /manual portfolio/i
      ).first()
    ).toBeVisible();

    Logger.success(
      'Broker no longer listed; manual portfolio remains'
    );
  }

  async validateAllBrokerIntegrationFunctionality() {
    Logger.info(
      'Validating full Broker Integration Accounts functionality'
    );

    await this.validateLoaded();

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /sync all/i
        }
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'link',
        {
          name: /view positions/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /view positions/i
          }
        )
      ).first()
    ).toBeVisible();

    await this.openConnectBrokerDialog();

    await expect(
      this.dialog()
    ).toContainText(
      /alpaca paper|interactive brokers|robinhood|available brokers/i
    );

    await safeClick(
      this.dialog().getByRole(
        'button',
        {
          name: /^close$/i
        }
      ).or(
        this.dialog().getByRole(
          'button',
          {
            name: /^cancel$/i
          }
        )
      ).first(),
      'Close Connect broker'
    ).catch(
      async () => {
        await this.page.keyboard.press(
          'Escape'
        );
      }
    );

    await expect(
      this.dialog()
    ).toBeHidden({
      timeout: 15000
    });

    const disconnect =
      this.page.getByRole(
        'button',
        {
          name: /^disconnect$/i
        }
      ).first();

    if (
      await disconnect.isVisible().catch(
        () => false
      )
    ) {
      await this.confirmAndCancel(
        disconnect,
        /disconnect/i,
        'Disconnect (cancel-only)'
      );
    }

    Logger.success(
      'Full Broker Integration functionality validated'
    );
  }

  private connectBrokerControl() {
    return this.page.getByRole(
      'button',
      {
        name: /connect broker/i
      }
    ).or(
      this.page.getByRole(
        'link',
        {
          name: /connect broker/i
        }
      )
    ).first();
  }

  private dialog() {
    return this.page.getByRole(
      'alertdialog'
    ).or(
      this.page.getByRole(
        'dialog'
      )
    ).last();
  }

  private async disconnectIndexForBroker(
    pattern: RegExp
  ): Promise<number> {
    const buttons =
      this.page.getByRole(
        'button',
        {
          name: /^disconnect$/i
        }
      );

    const count =
      await buttons.count();

    for (
      let i = 0;
      i < count;
      i += 1
    ) {
      const btn =
        buttons.nth(
          i
        );

      const nearby =
        await btn.evaluate(
          (el) => {
            const root =
              el.closest(
                'tr, [role="row"], section, article, div'
              ) ??
              el.parentElement;

            return (
              root?.textContent ??
              ''
            );
          }
        ).catch(
          () => ''
        );

      if (
        pattern.test(
          nearby
        ) &&
        !/manual portfolio|manual entry|\bME\b/i.test(
          nearby
        )
      ) {
        return i;
      }
    }

    // Fall back to the last Disconnect (Manual is usually first).
    return Math.max(
      0,
      count - 1
    );
  }

  private async acceptAlpacaCookiesIfPresent() {
    const accept =
      this.page.getByRole(
        'button',
        {
          name: /accept cookies|accept all|i agree/i
        }
      ).first();

    if (
      await accept.isVisible().catch(
        () => false
      )
    ) {
      await safeClick(
        accept,
        'Accept Alpaca cookies'
      );
    }
  }

  private async authorizeAlpacaIfPrompted() {
    for (
      let attempt = 0;
      attempt < 8;
      attempt += 1
    ) {
      if (
        /ooltool\.com/i.test(
          this.page.url()
        )
      ) {
        return;
      }

      const authorize =
        this.page.getByRole(
          'button',
          {
            name: /authorize|allow|approve|confirm|continue|connect/i
          }
        ).filter({
          hasNotText: /create an account|forgot/i
        }).first();

      if (
        await authorize.isVisible().catch(
          () => false
        )
      ) {
        await safeClick(
          authorize,
          'Authorize broker sharing'
        );
      }

      await this.page.waitForTimeout(
        1500
      );
    }
  }

  private async closeConnectBroker() {
    Logger.info(
      'Opening Connect broker without connecting'
    );

    await safeClick(
      this.connectBrokerControl(),
      'Connect broker'
    );

    const dialog =
      this.dialog();

    await expect(
      dialog
    ).toContainText(
      /broker|connect/i
    );

    await this.page.keyboard.press(
      'Escape'
    );

    await expect(
      dialog
    ).toBeHidden({
      timeout: 10000
    });

    Logger.success(
      'Connect broker was closed'
    );
  }

  async openPositions() {
    Logger.info(
      'Opening positions from Accounts'
    );

    await safeClick(
      this.page.getByRole(
        'link',
        {
          name: /view positions/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /view positions/i
          }
        )
      ).first(),
      'View positions'
    );

    await expect(
      this.page
    ).toHaveURL(
      PORTFOLIO_OR_POSITIONS_URL,
      {
        timeout: 20000
      }
    );
  }
}
