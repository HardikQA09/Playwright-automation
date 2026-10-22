import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from '../config/testData';

import {
  openHeaderMenu,
  safeClick
} from '../helpers/safeClick';

import {
  Logger
} from '../utils/logger';

/* =============================================================================
PAGE OBJECT: BetaSurfacesPage

PURPOSE
-------
Opens Beta menu destinations for the e2e account and runs non-destructive
checks (load, headers, filters, period toggles). Does not activate strategies
or submit broker changes.
============================================================================= */

export type BetaDestination = {
  label: RegExp;
  path: string;
  heading: RegExp;
};

export const BETA_DESTINATIONS: BetaDestination[] = [
  {
    label: /broker transactions/i,
    path: '/dashboard/beta/transactions',
    heading: /^broker transactions$/i
  },
  {
    label: /position p&l|position pnl/i,
    path: '/dashboard/beta/position-pnl',
    heading: /^position p&l$/i
  },
  {
    label: /option overlay p&l|option overlay pnl/i,
    path: '/dashboard/beta/option-overlay-pnl',
    heading: /^option overlay p&l$/i
  },
  {
    label: /roll configuration/i,
    path: '/dashboard/roll-config',
    heading: /roll configuration/i
  }
];

export class BetaSurfacesPage {
  constructor(
    private readonly page: Page
  ) {}

  private betaMenuItem(
    label: RegExp
  ) {
    return this.page
      .getByRole(
        'menuitem',
        {
          name: label
        }
      )
      .or(
        this.page.getByRole(
          'link',
          {
            name: label
          }
        )
      )
      .or(
        this.page.locator(
          '[role="menu"] a, [data-radix-menu-content] a, [data-state="open"] a'
        ).filter({
          hasText: label
        })
      )
      .first();
  }

  async openBetaMenu() {
    await openHeaderMenu(
      this.page,
      /^beta$/i
    );
  }

  async listBetaMenuLabels() {
    await this.openBetaMenu();

    const labels =
      await this.page.locator(
        '[role="menu"] [role="menuitem"], [data-radix-menu-content] [role="menuitem"]'
      ).allTextContents();

    await this.page.keyboard.press(
      'Escape'
    ).catch(
      () => undefined
    );

    return labels.map(
      (text) =>
        text.replace(
          /\s+/g,
          ' '
        ).trim()
    );
  }

  async openDestination(
    destination: BetaDestination
  ) {
    Logger.info(
      `Opening Beta → ${destination.path}`
    );

    try {
      await this.openBetaMenu();

      const item =
        this.betaMenuItem(
          destination.label
        );

      await item.waitFor({
        state: 'visible',
        timeout: 8000
      });

      const href =
        await item.getAttribute(
          'href'
        ).catch(
          () => null
        );

      if (
        href &&
        !href.startsWith(
          '#'
        )
      ) {
        const target =
          href.startsWith(
            'http'
          )
            ? href
            : `${BASE_URL}${href.startsWith('/') ? href : `/${href}`}`;

        await this.page.goto(
          target,
          {
            waitUntil: 'domcontentloaded'
          }
        );
      } else {
        await safeClick(
          item,
          destination.path
        );
      }
    } catch {
      await this.page.goto(
        `${BASE_URL}${destination.path}`,
        {
          waitUntil: 'domcontentloaded'
        }
      );
    }

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: destination.heading
        }
      ).first()
    ).toBeVisible({
      timeout: 20000
    });

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /^404$/i
        }
      )
    ).toHaveCount(
      0
    );

    Logger.success(
      `Opened ${destination.path}`
    );
  }

  async validateBrokerTransactions() {
    await this.openDestination(
      BETA_DESTINATIONS[0]
    );

    const main =
      this.page.locator(
        'main'
      );

    await expect(
      main
    ).toContainText(
      /broker transactions|no broker transactions|checking data flow/i
    );

    for (const column of [
      'Date',
      'Account',
      'Symbol',
      'Asset',
      'Type',
      'Qty',
      'Price'
    ]) {
      await expect(
        main.getByText(
          column,
          {
            exact: true
          }
        ).first()
      ).toBeVisible();
    }

    const pageSize =
      main.getByRole(
        'combobox'
      ).first();

    await expect(
      pageSize
    ).toBeVisible();

    await safeClick(
      pageSize,
      'Broker transactions page size'
    );

    const option =
      this.page.getByRole(
        'option',
        {
          name: /^(10|25|50|100)$/
        }
      ).first();

    if (
      await option.waitFor({
        state: 'visible',
        timeout: 4000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      await safeClick(
        option,
        'Select page size'
      );
    } else {
      await this.page.keyboard.press(
        'Escape'
      ).catch(
        () => undefined
      );
    }

    const dateHeader =
      main.getByText(
        'Date',
        {
          exact: true
        }
      ).first();

    await safeClick(
      dateHeader,
      'Sort Date column'
    );

    Logger.success(
      'Broker transactions surface validated'
    );
  }

  async validatePositionPnl() {
    await this.openDestination(
      BETA_DESTINATIONS[1]
    );

    const main =
      this.page.locator(
        'main'
      );

    await expect(
      main
    ).toContainText(
      /position p&l|no position p&l|checking data flow|unrealized/i
    );

    for (const column of [
      'Symbol',
      'Underlying',
      'Asset',
      'Account',
      'Open qty',
      'Cost basis',
      'Market value',
      'Unrealized P&L'
    ]) {
      await expect(
        main.getByText(
          column,
          {
            exact: true
          }
        ).first()
      ).toBeVisible();
    }

    const pageSize =
      main.getByRole(
        'combobox'
      ).first();

    await expect(
      pageSize
    ).toBeVisible();

    await safeClick(
      main.getByText(
        'Symbol',
        {
          exact: true
        }
      ).first(),
      'Sort Symbol column'
    );

    Logger.success(
      'Position P&L surface validated'
    );
  }

  async validateOptionOverlayPnl() {
    await this.openDestination(
      BETA_DESTINATIONS[2]
    );

    const main =
      this.page.locator(
        'main'
      );

    await expect(
      main
    ).toContainText(
      /total assets|realized option p&l|open \/ unrealized|total option p&l/i
    );

    const accountFilter =
      main.getByRole(
        'combobox'
      ).filter({
        hasText: /all accounts|account/i
      }).or(
        main.getByText(
          /all accounts/i
        )
      ).first();

    await expect(
      accountFilter
    ).toBeVisible();

    for (const period of [
      'MTD',
      'QTD',
      'YTD',
      '1Y'
    ]) {
      const toggle =
        main.getByRole(
          'button',
          {
            name: new RegExp(
              `^${period}$`,
              'i'
            )
          }
        ).first();

      await safeClick(
        toggle,
        `Option Overlay period ${period}`
      );

      await expect(
        main
      ).toContainText(
        /total assets|option p&l|equity|cash/i
      );
    }

    for (const capital of [
      /csp cash/i,
      /cc shares/i
    ]) {
      const control =
        main.getByRole(
          'button',
          {
            name: capital
          }
        ).first();

      if (
        await control.isVisible().catch(
          () => false
        )
      ) {
        await safeClick(
          control,
          `Toggle ${capital}`
        );
      }
    }

    await expect(
      main
    ).toContainText(
      /option p&l timeline|realized|open p&l/i
    );

    Logger.success(
      'Option Overlay P&L surface validated'
    );
  }
}
