import {
  expect,
  test
} from '@playwright/test';

import { BasePage }
  from './BasePage';

import {
  isPositionsHoldingsUrl,
  PORTFOLIO_OR_POSITIONS_URL
} from '../helpers/portfolioRoutes';

import { safeClick }
  from '../helpers/safeClick';

import { Logger }
  from '../utils/logger';

export {
  PORTFOLIO_OR_POSITIONS_URL
};

/* =============================================================================
PAGE OBJECT: PortfolioPage

PURPOSE
-------
Portfolio holdings show an overview and one tab per account source.
Each tab keeps the positions table. Edit and delete open a prompt and are
cancelled, so the holding stays.
============================================================================= */

export class PortfolioPage
  extends BasePage {

  async validateLoaded() {
    Logger.info(
      'Validating Portfolio'
    );

    await expect(
      this.page
    ).toHaveURL(
      PORTFOLIO_OR_POSITIONS_URL,
      {
        timeout: 20000
      }
    );

    const onPositions =
      isPositionsHoldingsUrl(
        this.page.url()
      );

    if (
      onPositions
    ) {
      await expect(
        this.page.getByRole(
          'heading'
        ).filter({
          hasText: /^positions$|^portfolio$/i
        }).first()
      ).toBeVisible({
        timeout: 20000
      });

      await expect(
        this.page.locator(
          'main'
        )
      ).toContainText(
        /position|showing|equity|cash|option|\$[\d,.]+/i
      );
    } else {
      await expect(
        this.page.getByRole(
          'heading',
          {
            name: /^portfolio$/i
          }
        )
      ).toBeVisible({
        timeout: 20000
      });

      await expect(
        this.page.getByText(
          /portfolio overview/i
        )
      ).toBeVisible();

      await expect(
        this.page.getByText(
          /^accounts$/i
        ).first()
      ).toBeVisible();

      await expect(
        this.page.getByText(
          /^positions$/i
        ).first()
      ).toBeVisible();

      await expect(
        this.page.locator(
          'main'
        )
      ).toContainText(
        /\$[\d,.]+/
      );
    }

    Logger.success(
      'Portfolio overview is shown'
    );
  }

  async validateEveryHoldingsTab() {
    const tabNames =
      await this.holdingTabNames();

    if (
      tabNames.length === 0
    ) {
      test.skip(
        true,
        'No portfolio holdings tabs in UAT — skipping tab checks.'
      );
    }

    for (const name of tabNames) {
      Logger.info(
        `Opening portfolio tab ${name}`
      );

      const pattern =
        new RegExp(
          `^${this.escape(name)}$`,
          'i'
        );

      await safeClick(
        this.page.getByRole(
          'button',
          {
            name: pattern
          }
        ).or(
          this.page.getByRole(
            'tab',
            {
              name: pattern
            }
          )
        ).first(),
        `Portfolio tab ${name}`
      );

      await this.validatePositionsTable();

      Logger.success(
        `Portfolio tab ${name} shows positions`
      );
    }
  }

  async verifyEditAndDelete() {
    Logger.info(
      'Opening edit and delete for a position'
    );

    await this.showPositions();

    const manual =
      this.page.getByRole(
        'tab',
        {
          name: /^manual\b/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /^manual\b/i
          }
        )
      ).first();

    if (
      await manual.waitFor({
        state: 'visible',
        timeout: 4000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      await safeClick(
        manual,
        'Manual positions'
      );

      await this.showPositions();
    }

    const row =
      this.page.locator(
        'main tbody tr'
      ).first();

    const rowReady =
      await row.waitFor({
        state: 'visible',
        timeout: 15000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (
      !rowReady
    ) {
      test.skip(
        true,
        'No editable position rows in UAT — skipping edit/delete prompt checks.'
      );
    }

    const actions =
      () =>
        row.locator(
          'td'
        ).last().getByRole(
          'button'
        );

    await safeClick(
      actions().nth(
        0
      ),
      'Edit position'
    );

    await expect(
      row.getByRole(
        'spinbutton'
      )
    ).toHaveCount(
      2,
      {
        timeout: 10000
      }
    );

    await safeClick(
      actions().nth(
        1
      ),
      'Cancel edit'
    );

    await expect(
      row.getByRole(
        'spinbutton'
      )
    ).toHaveCount(
      0
    );

    await safeClick(
      actions().nth(
        1
      ),
      'Remove position'
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
      dialog.getByRole(
        'heading',
        {
          name: /remove position/i
        }
      )
    ).toBeVisible({
      timeout: 10000
    });

    await expect(
      dialog
    ).toContainText(
      /cannot be undone|remove/i
    );

    await expect(
      dialog.getByRole(
        'button',
        {
          name: /^remove$/i
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
      'Cancel remove'
    );

    await expect(
      dialog
    ).toBeHidden({
      timeout: 10000
    });

    await expect(
      row
    ).toBeVisible();

    await expect(
      this.page.locator(
        'main'
      )
    ).toContainText(
      /showing/i
    );

    Logger.success(
      'Edit and delete were cancelled'
    );
  }

  private async showPositions() {
    const showPositions =
      this.page.getByRole(
        'button',
        {
          name: /^show$/i
        }
      );

    if (
      await showPositions.waitFor({
        state: 'visible',
        timeout: 4000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      await safeClick(
        showPositions,
        'Show positions'
      );
    }
  }

  private async validatePositionsTable() {
    await this.showPositions();

    for (const header of [
      /position/i,
      /type/i,
      /qty/i,
      /avg\.?\s*price/i,
      /last price/i,
      /market value/i
    ]) {
      await expect(
        this.page.getByRole(
          'columnheader',
          {
            name: header
          }
        )
      ).toBeVisible({
        timeout: 15000
      });
    }

    await expect(
      this.page.getByText(
        /equity|cash|option/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.locator(
        'main'
      )
    ).toContainText(
      /showing/i
    );
  }

  private async holdingTabNames() {
    const controls =
      this.page.locator(
        'main'
      ).getByRole(
        'button'
      ).or(
        this.page.locator(
          'main'
        ).getByRole(
          'tab'
        )
      );

    const count =
      await controls.count();

    const names: string[] = [];

    for (
      let index = 0;
      index < count;
      index++
    ) {
      const name =
        (
          await controls.nth(
            index
          ).innerText()
        ).replace(
          /\s+/g,
          ' '
        ).trim();

      if (
        /^all$/i.test(
          name
        ) ||
        /^manual\b/i.test(
          name
        ) ||
        /^.+\(\d+\)$/.test(
          name
        )
      ) {
        names.push(
          name
        );
      }
    }

    return [...new Set(names)];
  }

  private escape(
    value: string
  ) {
    return value.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );
  }
}
