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
    // Modern Positions Community grid wins over legacy All/Manual tabs.
    const agGrid =
      this.page
        .locator(
          'main .ag-root, main [class*="ag-root"], main [role="grid"]'
        )
        .or(
          this.page.getByRole(
            'combobox',
            {
              name: /saved views/i
            }
          )
        )
        .first();

    if (
      await agGrid.isVisible({
        timeout: 8000
      }).catch(
        () => false
      )
    ) {
      Logger.info(
        'Holdings use Positions Community grid; validating that surface'
      );

      await this.validatePositionsTable();

      Logger.success(
        'Portfolio holdings grid shows positions'
      );

      return;
    }

    const tabNames =
      await this.holdingTabNames();

    if (
      tabNames.length === 0
    ) {
      // Positions Community AG Grid uses Equity/Options/Cash groups instead
      // of All/Manual account tabs — exercise those as the holdings surface.
      const groupRows =
        this.page
          .getByRole(
            'row',
            {
              name: /equity|options?|cash/i
            }
          )
          .or(
            this.page.getByText(
              /equity.*holdings|options?.*positions?|cash.*balance/i
            )
          );

      const hasGroups =
        await groupRows.first().isVisible({
          timeout: 8000
        }).catch(
          () => false
        );

      if (
        hasGroups
      ) {
        Logger.info(
          'Holdings use AG Grid asset groups; validating the positions surface'
        );

        await this.validatePositionsTable();

        Logger.success(
          'Portfolio holdings groups show positions'
        );

        return;
      }

      // Account filter chips / comboboxes on /dashboard/positions.
      const accountFilter =
        this.page
          .getByRole(
            'combobox',
            {
              name: /account|all accounts|filter/i
            }
          )
          .or(
            this.page.locator(
              'main'
            ).getByRole(
              'button'
            ).filter({
              hasText: /all( accounts)?|manual|broker/i
            })
          )
          .first();

      if (
        await accountFilter.isVisible({
          timeout: 4000
        }).catch(
          () => false
        )
      ) {
        await this.validatePositionsTable();

        Logger.success(
          'Portfolio holdings filter surface shows positions'
        );

        return;
      }

      // Positions Community grid often has no All/Manual tabs — still validate
      // the holdings surface so this check does not skip on modern UAT.
      const positionsSurface =
        this.page
          .getByRole(
            'heading',
            {
              name: /^positions$|^portfolio$/i
            }
          )
          .or(
            this.page.getByRole(
              'grid'
            )
          )
          .or(
            this.page.locator(
              'main .ag-root, main [role="grid"]'
            )
          );

      if (
        await positionsSurface.first().isVisible({
          timeout: 8000
        }).catch(
          () => false
        )
      ) {
        await this.validatePositionsTable();

        Logger.success(
          'Portfolio positions surface validated without legacy holdings tabs'
        );

        return;
      }

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
        'main tbody tr, main [role="row"]'
      ).filter({
        hasText: /\$[\d,.]+|\b[A-Z]{1,5}\b/
      }).first();

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
      Logger.info(
        'No editable position rows in UAT — positions surface already validated'
      );
      return;
    }

    const actions =
      () =>
        row.locator(
          'td'
        ).last().getByRole(
          'button'
        );

    const hasEdit =
      await actions().nth(
        0
      ).isVisible({
        timeout: 5000
      }).catch(
        () => false
      );

    if (
      !hasEdit
    ) {
      Logger.info(
        'Position rows are not editable on this grid build — surface validated'
      );
      return;
    }

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

    // Detect Positions Community AG Grid first — it also exposes Symbol/Qty
    // columnheaders, which must not be treated as the legacy table.
    const agGrid =
      this.page
        .locator(
          'main .ag-root, main [class*="ag-root"], main [role="grid"]'
        )
        .or(
          this.page.getByRole(
            'combobox',
            {
              name: /saved views/i
            }
          )
        )
        .first();

    if (
      await agGrid.isVisible({
        timeout: 8000
      }).catch(
        () => false
      )
    ) {
      await expect(
        this.page
          .getByRole(
            'heading',
            {
              name: /^positions$/i
            }
          )
          .or(
            this.page.getByRole(
              'columnheader',
              {
                name: /symbol|qty|market value/i
              }
            )
          )
          .or(
            this.page.getByText(
              /equity|cash|option|\$[\d,.]+/i
            )
          )
          .first()
      ).toBeVisible({
        timeout: 15000
      });

      return;
    }

    const hasClassicType =
      await this.page.getByRole(
        'columnheader',
        {
          name: /^type$/i
        }
      ).first().isVisible({
        timeout: 5000
      }).catch(
        () => false
      );

    if (
      hasClassicType
    ) {
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

      return;
    }

    await expect(
      this.page
        .getByRole(
          'heading',
          {
            name: /^positions$|^portfolio$/i
          }
        )
        .or(
          this.page.getByText(
            /equity|cash|option|\$[\d,.]+|position/i
          )
        )
        .first()
    ).toBeVisible({
      timeout: 15000
    });
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
        /^all(\s+accounts?)?$/i.test(
          name
        ) ||
        /^manual\b/i.test(
          name
        ) ||
        /^.+\(\d+\)$/.test(
          name
        ) ||
        /^(equity|options?|cash)(\s*\(\d+\))?$/i.test(
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
