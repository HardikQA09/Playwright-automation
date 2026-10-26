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
Manage Accounts opens the connected broker accounts. Delete and disconnect
open a confirmation and are cancelled. View positions continues to the
portfolio holdings.
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
        /connected broker accounts/i
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
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
      ).first()
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
      this.page.getByRole(
        'alertdialog'
      ).or(
        this.page.getByRole(
          'dialog'
        )
      ).last();

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

  private async closeConnectBroker() {
    Logger.info(
      'Opening Connect broker without connecting'
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /connect broker/i
        }
      ).first(),
      'Connect broker'
    );

    const dialog =
      this.page.getByRole(
        'dialog'
      );

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
