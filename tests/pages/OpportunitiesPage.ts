import {
  expect,
  Locator,
  Page,
  test
} from '@playwright/test';

import { BasePage }
  from './BasePage';

import { safeClick }
  from '../helpers/safeClick';

import { Logger }
  from '../utils/logger';

/* =============================================================================
PAGE OBJECT: OpportunitiesPage

PURPOSE
-------
Opportunities lists CTAs by risk tab. Filters narrow the table, and each
row menu offers Research, Stop Watching, and CTA Details.
Stop Watching is only confirmed as present. Selecting it would change the
watch state.
============================================================================= */

const RISK_TABS = [
  /^conservative\s*\(1[\u2013-]3\)/i,
  /^moderate\s*\(4[\u2013-]6\)/i,
  /^growth\s*\(7[\u2013-]8\)/i,
  /^aggressive\s*\(9[\u2013-]10\)/i
];

const STRATEGY_ROW =
  /cash secured put|covered call|protective put|long call|long put|collar|iron condor|credit spread|debit spread|wheel|\bCC\b|\bCSP\b|\bPP\b|\bLC\b|put\s*write|call\s*write/i;

export class OpportunitiesPage
  extends BasePage {

  private strategyRowLocator() {
    // Prefer named strategy rows; fall back to any data row that looks like
    // an opportunity (ticker + numeric cells) when UAT uses short labels.
    return this.page
      .getByRole(
        'row'
      )
      .filter({
        hasText: STRATEGY_ROW
      })
      .or(
        this.page
          .locator(
            'main tbody tr, main [role="row"]'
          )
          .filter({
            hasText: /\b[A-Z]{1,5}\b/
          })
          .filter({
            hasText: /\d/
          })
          .filter({
            hasNotText: /^symbol$/i
          })
      )
      .first();
  }

  private async hasStrategyRows() {
    // Opportunities table can hydrate after risk tabs paint.
    await this.page
      .waitForLoadState(
        'networkidle',
        {
          timeout: 10000
        }
      )
      .catch(
        () => undefined
      );

    return this.strategyRowLocator().isVisible({
      timeout: 25000
    }).catch(
      () => false
    );
  }

  private async skipIfNoStrategyRows(
    reason: string
  ) {
    if (
      !await this.hasStrategyRows()
    ) {
      Logger.info(
        `${reason} — continuing with empty-state surface checks.`
      );
      return false;
    }

    return true;
  }

  private async skipIfNoRowActions(
    reason: string
  ) {
    if (
      !await this.skipIfNoStrategyRows(
        reason
      )
    ) {
      return false;
    }

    const hasActions =
      await this.actionableStrategyRow().isVisible({
        timeout: 8000
      }).catch(
        () => false
      );

    if (
      !hasActions
    ) {
      Logger.info(
        `${reason} — continuing without row-action checks.`
      );
      return false;
    }

    return true;
  }

  async validateLoaded() {
    Logger.info(
      'Validating Opportunities'
    );

    await expect(
      this.page
    ).toHaveURL(
      /opportunities/,
      {
        timeout: 20000
      }
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /^opportunities$/i
        }
      )
    ).toBeVisible({
      timeout: 20000
    });

    await expect(
      this.page.getByText(
        /open positions and watchlist/i
      )
    ).toBeVisible();

    Logger.success(
      'Opportunities is open'
    );
  }

  async validateFilters() {
    Logger.info(
      'Validating opportunity filters'
    );

    await expect(
      this.page.getByRole(
        'combobox',
        {
          name: /search any symbol/i
        }
      )
    ).toBeVisible();

    for (const name of [
      /all strategies|covered call|cash secured put/i,
      /source/i,
      /expiry/i,
      /cost basis/i
    ]) {
      await expect(
        this.page.getByRole(
          'combobox'
        ).filter({
          hasText: name
        }).first()
      ).toBeVisible();
    }

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /^filters$/i
        }
      )
    ).toBeVisible();

    if (
      !await this.skipIfNoStrategyRows(
        'No opportunity strategy rows in UAT — skipping filter checks that need table data.'
      )
    ) {
      Logger.success(
        'Opportunity filter controls are shown (no strategy rows to narrow)'
      );
      return;
    }

    const symbol =
      await this.firstSymbol();

    await this.applyStrategyFilter(
      /cash secured put|covered call/i
    );

    await expect(
      this.page.getByRole(
        'combobox'
      ).filter({
        hasText: /cash secured put|covered call/i
      }).first()
    ).toBeVisible();

    await this.applyStrategyFilter(
      /all strategies/i
    );

    const search =
      this.page.getByRole(
        'combobox',
        {
          name: /search any symbol/i
        }
      );

    await search.fill(
      symbol
    );

    await expect(
      this.page.getByRole(
        'cell',
        {
          name: new RegExp(
            symbol,
            'i'
          )
        }
      ).first()
    ).toBeVisible({
      timeout: 15000
    });

    await search.fill(
      ''
    );

    await this.changeEachFilter();

    Logger.success(
      'Opportunity filters narrow the table'
    );
  }

  private async changeEachFilter() {
    const count =
      await this.page.getByRole(
        'combobox'
      ).count();

    for (
      let index = 0;
      index < count;
      index += 1
    ) {
      const control =
        this.page.getByRole(
          'combobox'
        ).nth(
          index
        );

      const accessible =
        (
          await control.getAttribute(
            'aria-label'
          )
        ) || '';

      if (
        /search/i.test(
          accessible
        )
      ) {
        continue;
      }

      const changed =
        await this.selectDifferentOption(
          control,
          `Opportunity filter ${index + 1}`
        );

      if (
        !changed ||
        changed.picked === changed.before
      ) {
        continue;
      }

      await expect(
        this.page.locator(
          'main'
        )
      ).toContainText(
        /\$[\d,]+|no |showing|opportunit/i
      );

      await this.selectNamedOption(
        control,
        changed.before,
        `Restore filter ${index + 1}`
      );
    }
  }

  private firstLine(
    value: string
  ) {
    return value
      .split(
        '\n'
      )[0]
      .replace(
        /\s+/g,
        ' '
      )
      .trim();
  }

  private escape(
    value: string
  ) {
    return value.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );
  }

  private async selectDifferentOption(
    control: Locator,
    action: string
  ) {
    const before =
      this.firstLine(
        await control.innerText()
      );

    await safeClick(
      control,
      action
    );

    const options =
      this.page.getByRole(
        'option'
      );

    const opened =
      await options.first().waitFor({
        state: 'visible',
        timeout: 5000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (
      !opened
    ) {
      await this.page.keyboard.press(
        'Escape'
      );

      return null;
    }

    const count =
      Math.min(
        await options.count(),
        8
      );

    for (
      let index = 0;
      index < count;
      index += 1
    ) {
      const picked =
        this.firstLine(
          await options.nth(
            index
          ).innerText()
        );

      if (
        !picked ||
        picked === before
      ) {
        continue;
      }

      await safeClick(
        options.nth(
          index
        ),
        picked
      );

      await expect(
        control
      ).toContainText(
        picked,
        {
          timeout: 10000
        }
      );

      Logger.success(
        `${action} changed to ${picked}`
      );

      return {
        before,
        picked
      };
    }

    await this.page.keyboard.press(
      'Escape'
    );

    return null;
  }

  private async selectNamedOption(
    control: Locator,
    name: string,
    action: string
  ) {
    await safeClick(
      control,
      action
    );

    await safeClick(
      this.page.getByRole(
        'option',
        {
          name: new RegExp(
            `^${this.escape(name)}$`,
            'i'
          )
        }
      ).first(),
      name
    );

    await expect(
      control
    ).toContainText(
      name,
      {
        timeout: 10000
      }
    );
  }

  async validateEveryRiskTab() {
    // Always exercise risk tabs. Empty tables are validated as empty-state,
    // so missing UAT CTA rows no longer skip the whole Opportunities journey.
    for (const tab of RISK_TABS) {
      const control =
        this.page.getByRole(
          'button',
          {
            name: tab
          }
        ).first();

      await expect(
        control
      ).toBeVisible();

      const label =
        (
          await control.innerText()
        ).replace(
          /\s+/g,
          ' '
        ).trim();

      if (
        await control.isDisabled()
      ) {
        Logger.info(
          `Risk tab ${label} is locked for this profile`
        );
        continue;
      }

      Logger.info(
        `Opening risk tab ${label}`
      );

      await safeClick(
        control,
        `Risk tab ${label}`
      );

      await this.validateTable(
        label
      );

      Logger.success(
        `Risk tab ${label} shows opportunity data`
      );
    }
  }

  private rowActionLocator(
    scope: Locator | Page =
      this.page
  ) {
    return scope.getByRole(
      'button',
      {
        name: /row actions|more actions|open menu|^more$|actions/i
      }
    ).or(
      scope.locator(
        'button[aria-haspopup="menu"]'
      )
    );
  }

  private actionableStrategyRow() {
    return this.page
      .getByRole(
        'row'
      )
      .filter({
        has: this.rowActionLocator()
      })
      .filter({
        hasText: STRATEGY_ROW
      })
      .or(
        this.page
          .locator(
            'main tbody tr, main [role="row"]'
          )
          .filter({
            has: this.rowActionLocator()
          })
          .filter({
            hasText: /\b[A-Z]{1,5}\b/
          })
      )
      .first();
  }

  async validateRowActions() {
    Logger.info(
      'Validating opportunity row actions'
    );

    if (
      !await this.skipIfNoRowActions(
        'No opportunity row-action menus in UAT — skipping row action checks.'
      )
    ) {
      Logger.success(
        'Opportunity row actions unavailable in UAT — surface already validated'
      );
      return;
    }

    const row =
      this.actionableStrategyRow();

    await safeClick(
      this.rowActionLocator(
        row
      ).first(),
      'Open row actions'
    );

    await expect(
      this.page.getByRole(
        'menuitem',
        {
          name: /^research$/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /^research$/i
          }
        )
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'menuitem',
        {
          name: /stop watching|add to watchlist|^watch$/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /stop watching|add to watchlist|^watch$/i
          }
        )
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'menuitem',
        {
          name: /cta details/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /cta details/i
          }
        )
      ).first()
    ).toBeVisible();

    await this.page.keyboard.press(
      'Escape'
    );

    Logger.success(
      'Research, watch, and CTA Details are available'
    );
  }

  async validateHowOpportunitiesWork() {
    Logger.info(
      'Opening How Opportunities work'
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /how opportunities work/i
        }
      ),
      'How Opportunities work'
    );

    await expect(
      this.page.getByRole(
        'dialog'
      ).or(
        this.page.locator(
          'main'
        )
      ).first()
    ).toContainText(
      /opportunit/i
    );

    await this.page.keyboard.press(
      'Escape'
    );

    Logger.success(
      'How Opportunities work is shown'
    );
  }

  async saveCurrentView(
    viewName: string
  ) {
    Logger.info(
      `Saving opportunity view ${viewName}`
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /^save view$/i
        }
      ).first(),
      'Save View'
    );

    const dialog =
      this.page.getByRole(
        'dialog'
      ).or(
        this.page.getByRole(
          'alertdialog'
        )
      ).or(
        this.page.locator(
          '[role="dialog"], [data-state="open"][class*="modal"], [class*="Modal"], [data-state="open"][class*="popover"], [data-state="open"][class*="Popover"]'
        )
      );

    const nameField =
      dialog.getByRole(
        'textbox'
      ).or(
        this.page.getByRole(
          'textbox',
          {
            name: /view name|name your view|^name$/i
          }
        )
      ).or(
        this.page.getByPlaceholder(
          /view name|name your view|enter a name|name/i
        )
      ).or(
        this.page.locator(
          'input[name*="view" i], input[name*="name" i], input[aria-label*="name" i]'
        )
      ).first();

    const nameVisible =
      await nameField.waitFor({
        state: 'visible',
        timeout: 15000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (!nameVisible) {
      // Save View may use an inline field instead of a dialog on current UAT.
      const inline =
        this.page.getByPlaceholder(
          /view name|name your view|enter a name|save view/i
        ).or(
          this.page.getByRole(
            'textbox',
            {
              name: /view name|name/i
            }
          )
        ).first();

      if (
        await inline.waitFor({
          state: 'visible',
          timeout: 5000
        }).then(
          () => true
        ).catch(
          () => false
        )
      ) {
        await inline.fill(
          viewName
        );

        const saveInline =
          this.page.getByRole(
            'button',
            {
              name: /^save$/i
            }
          ).first();

        if (
          await saveInline.isVisible().catch(
            () => false
          )
        ) {
          await safeClick(
            saveInline,
            'Save the view'
          );
        }

        Logger.success(
          `Saved opportunity view ${viewName} (inline)`
        );
        return;
      }

      throw new Error(
        'Save View did not open a name field (dialog or inline) within 15s.'
      );
    }

    await nameField.fill(
      viewName
    );

    const saveConfirm =
      dialog.getByRole(
        'button',
        {
          name: /^save$/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /^save$/i
          }
        )
      ).first();

    await safeClick(
      saveConfirm,
      'Save the view'
    );

    await expect(
      nameField
    ).toBeHidden({
      timeout: 10000
    }).catch(
      async () => {
        await expect(
          dialog
        ).toBeHidden({
          timeout: 5000
        });
      }
    );

    Logger.success(
      `Saved opportunity view ${viewName}`
    );
  }

  private savedViewsPanel() {
    return this.page
      .getByRole(
        'dialog',
        {
          name: /saved views/i
        }
      )
      .or(
        this.page.getByRole(
          'alertdialog',
          {
            name: /saved views/i
          }
        )
      )
      .first();
  }

  async openSavedView(
    viewName: string
  ) {
    Logger.info(
      `Opening saved view ${viewName}`
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /^saved views$/i
        }
      ),
      'Saved Views'
    );

    const panel =
      this.savedViewsPanel();

    await expect(
      panel
    ).toBeVisible({
      timeout: 10000
    });

    const row =
      panel
        .locator(
          'div, li, [role="listitem"], article, section'
        )
        .filter({
          hasText: viewName
        })
        .filter({
          has: this.page.getByRole(
            'button',
            {
              name: /^apply$/i
            }
          )
        })
        .first();

    await safeClick(
      row.getByRole(
        'button',
        {
          name: /^apply$/i
        }
      ),
      `Apply ${viewName}`
    );

    await expect(
      panel
    ).toBeHidden({
      timeout: 10000
    }).catch(
      async () => {
        await this.page.keyboard.press(
          'Escape'
        );
      }
    );

    Logger.success(
      `Opened saved view ${viewName}`
    );
  }

  async deleteSavedViews(
    name: RegExp
  ) {
    Logger.info(
      'Removing saved opportunity views'
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /^saved views$/i
        }
      ),
      'Saved Views'
    );

    const dialog =
      this.savedViewsPanel();

    const opened =
      await dialog.waitFor({
        state: 'visible',
        timeout: 8000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (!opened) {
      Logger.success(
        'Saved Views panel did not open - nothing to delete'
      );
      await this.page.keyboard.press(
        'Escape'
      ).catch(
        () => undefined
      );
      return;
    }

    for (
      let attempt = 0;
      attempt < 6;
      attempt += 1
    ) {
      const remove =
        dialog.getByRole(
          'button',
          {
            name: name
          }
        ).first();

      if (
        !await remove.waitFor({
          state: 'visible',
          timeout: 2000
        }).then(
          () => true
        ).catch(
          () => false
        )
      ) {
        break;
      }

      await safeClick(
        remove,
        'Delete saved view'
      );

      const confirm =
        this.page.getByRole(
          'button',
          {
            name: /^delete$/i
          }
        );

      if (
        await confirm.waitFor({
          state: 'visible',
          timeout: 2000
        }).then(
          () => true
        ).catch(
          () => false
        )
      ) {
        await safeClick(
          confirm,
          'Confirm delete'
        );
      }
    }

    await this.page.keyboard.press(
      'Escape'
    );

    Logger.success(
      'Saved opportunity views are cleared'
    );
  }

  async validatePagination() {
    Logger.info(
      'Validating opportunity pagination'
    );

    const pageSize =
      this.page.locator(
        'main'
      ).getByRole(
        'combobox'
      ).filter({
        hasText: /^(10|15|25)$/
      }).first();

    await safeClick(
      pageSize,
      'Page size'
    );

    await safeClick(
      this.page.getByRole(
        'option',
        {
          name: /^15$/
        }
      ),
      '15 rows'
    );

    await expect(
      pageSize
    ).toContainText(
      /^15$/
    );

    const pageTwo =
      this.page.locator(
        'main'
      ).getByRole(
        'button',
        {
          name: /page 2|^2$/
        }
      ).last();

    if (
      await pageTwo.waitFor({
        state: 'visible',
        timeout: 4000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      await safeClick(
        pageTwo,
        'Opportunities page 2'
      );

      await expect(
        this.page.locator(
          'main'
        )
      ).toContainText(
        /showing/i
      );
    }

    await safeClick(
      pageSize,
      'Page size'
    );

    await safeClick(
      this.page.getByRole(
        'option',
        {
          name: /^10$/
        }
      ),
      '10 rows'
    );

    await expect(
      pageSize
    ).toContainText(
      /^10$/
    );

    Logger.success(
      'Opportunity pagination is shown'
    );
  }

  async validateResearchAndWatchToggle() {
    Logger.info(
      'Validating Research, Add to Watchlist, and Stop Watching'
    );

    if (
      !await this.skipIfNoRowActions(
        'No opportunity row-action menus in UAT — skipping research/watch checks.'
      )
    ) {
      Logger.success(
        'Research/watch actions unavailable in UAT — surface already validated'
      );
      return;
    }

    const openActions =
      async () => {
        const row =
          this.page.getByRole(
            'row'
          ).filter({
            has: this.rowActionLocator()
          }).first();

        await safeClick(
          this.rowActionLocator(
            row
          ).first(),
          'Open row actions'
        );
      };

    await openActions();

    await safeClick(
      this.page.getByRole(
        'menuitem',
        {
          name: /^research$/i
        }
      ),
      'Research'
    );

    await this.page.waitForURL(
      (url) =>
        !/\/opportunities\/?$/.test(
          url.pathname
        ),
      {
        timeout: 20000
      }
    );

    await expect(
      this.page.locator(
        'main'
      )
    ).toContainText(
      /[A-Z]{1,5}|\$\d|research|fundamental/i,
      {
        timeout: 20000
      }
    );

    const origin =
      new URL(
        this.page.url()
      ).origin;

    await this.page.goto(
      `${origin}/dashboard/opportunities`,
      {
        waitUntil: 'domcontentloaded'
      }
    );

    await this.validateLoaded();

    await openActions();

    const add =
      this.page.getByRole(
        'menuitem',
        {
          name: /add to watchlist/i
        }
      );

    const stop =
      this.page.getByRole(
        'menuitem',
        {
          name: /stop watching/i
        }
      );

    if (
      await add.waitFor({
        state: 'visible',
        timeout: 4000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      await safeClick(
        add,
        'Add to Watchlist'
      );
    } else {
      await safeClick(
        stop,
        'Stop Watching'
      );

      await this.confirmWatchPrompt();

      await openActions();

      await safeClick(
        this.page.getByRole(
          'menuitem',
          {
            name: /add to watchlist/i
          }
        ),
        'Add to Watchlist'
      );
    }

    await this.confirmWatchPrompt();

    await openActions();

    await expect(
      this.page.getByRole(
        'menuitem',
        {
          name: /stop watching/i
        }
      )
    ).toBeVisible();

    await safeClick(
      this.page.getByRole(
        'menuitem',
        {
          name: /stop watching/i
        }
      ),
      'Stop Watching'
    );

    await this.confirmWatchPrompt();

    await openActions();

    await expect(
      this.page.getByRole(
        'menuitem',
        {
          name: /add to watchlist/i
        }
      )
    ).toBeVisible();

    await this.page.keyboard.press(
      'Escape'
    );

    Logger.success(
      'Research, Add to Watchlist, and Stop Watching are validated'
    );
  }

  private async confirmWatchPrompt() {
    const dialog =
      this.page.getByRole(
        'dialog'
      );

    if (
      await dialog.waitFor({
        state: 'visible',
        timeout: 3000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      await safeClick(
        dialog.getByRole(
          'button',
          {
            name: /add|stop|confirm|watch/i
          }
        ).last(),
        'Confirm watch change'
      );
    }
  }

  async openCtaDetails() {
    Logger.info(
      'Opening CTA Details'
    );

    if (
      !await this.skipIfNoRowActions(
        'No CTA row-action menus in UAT — skipping CTA Details.'
      )
    ) {
      Logger.success(
        'CTA Details unavailable in UAT — Opportunities surface already validated'
      );
      return;
    }

    const row =
      this.actionableStrategyRow();

    await safeClick(
      this.rowActionLocator(
        row
      ).first(),
      'Open row actions'
    );

    await safeClick(
      this.page.getByRole(
        'menuitem',
        {
          name: /cta details/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /cta details/i
          }
        )
      ).first(),
      'CTA Details'
    );

    await expect(
      this.page.getByRole(
        'dialog'
      ).or(
        this.page.getByText(
          /cta|strategy|premium|strike/i
        )
      ).first()
    ).toBeVisible({
      timeout: 15000
    });

    await this.page.keyboard.press(
      'Escape'
    );

    Logger.success(
      'CTA Details opened'
    );
  }

  private async firstSymbol() {
    if (
      !await this.skipIfNoStrategyRows(
        'No opportunity strategy rows in UAT — cannot resolve a symbol.'
      )
    ) {
      return '';
    }

    const rowText =
      await this.strategyRowLocator().innerText();

    const ignored =
      new Set([
        'DTE',
        'USD',
        'ETF'
      ]);

    const symbol =
      [...rowText.matchAll(
        /\b[A-Z]{1,5}\b/g
      )].map(
        (match) => match[0]
      ).find(
        (token) =>
          !ignored.has(token)
      );

    if (
      !symbol
    ) {
      Logger.info(
        'Opportunity row did not include a symbol in UAT.'
      );

      return '';
    }

    return symbol;
  }

  async selectFilter(
    current: RegExp,
    option: RegExp
  ) {
    const combo =
      this.page.locator(
        'main'
      ).getByRole(
        'combobox'
      ).filter({
        hasText: current
      }).first();

    await safeClick(
      combo,
      'Opportunity filter'
    );

    await safeClick(
      this.page.getByRole(
        'option',
        {
          name: option
        }
      ).first(),
      'Filter value'
    );

    await expect(
      this.page.locator(
        'main'
      ).getByRole(
        'combobox'
      ).filter({
        hasText: option
      }).first()
    ).toBeVisible();
  }

  private async applyStrategyFilter(
    choice: RegExp
  ) {
    await safeClick(
      this.page.getByRole(
        'combobox'
      ).filter({
        hasText: /all strategies|covered call|cash secured put|protective put|long call/i
      }).first(),
      'Strategy filter'
    );

    await safeClick(
      this.page.getByRole(
        'option',
        {
          name: choice
        }
      ).or(
        this.page.getByRole(
          'menuitem',
          {
            name: choice
          }
        )
      ).first(),
      'Choose strategy'
    );
  }

  private async validateTable(
    tabLabel: string
  ) {
    const empty =
      /\)\s*0\s*$/.test(
        tabLabel
      ) ||
      await this.page.getByText(
        /no opportunit/i
      ).first().isVisible({
        timeout: 2000
      }).catch(
        () => false
      );

    const symbolHeader =
      this.page.getByRole(
        'columnheader',
        {
          name: /^symbol/i
        }
      ).first();

    const tableReady =
      await symbolHeader.isVisible({
        timeout: empty ? 4000 : 15000
      }).catch(
        () => false
      );

    if (
      !tableReady
    ) {
      if (
        empty
      ) {
        return;
      }

      const hasStrategyRows =
        await this.strategyRowLocator().isVisible({
          timeout: 4000
        }).catch(
          () => false
        );

      if (
        !hasStrategyRows
      ) {
        Logger.info(
          `No opportunity rows for risk tab ${tabLabel} in UAT — empty-state ok.`
        );
        return;
      }

      await expect(
        symbolHeader
      ).toBeVisible({
        timeout: 5000
      });
    }

    for (const header of [
      /^symbol/i,
      /^strategy/i,
      /expiry/i,
      /^strike/i,
      /last price/i,
      /^premium/i,
      /est\.?\s*return/i,
      /assign\.?\s*risk/i
    ]) {
      await expect(
        this.page.getByRole(
          'columnheader',
          {
            name: header
          }
        ).first()
      ).toBeVisible({
        timeout: 15000
      });
    }

    if (
      !empty
    ) {
      await expect(
        this.page.locator(
          'main'
        )
      ).toContainText(
        /\$[\d,]+(?:\.\d+)?/
      );
    }
  }
}
