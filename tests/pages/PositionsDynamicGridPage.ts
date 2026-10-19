import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from '../config/testData';

import {
  dismissOverlays
} from '../helpers/dismissOverlays';
import {
  classHasHex,
  ROB_POSITION_COLORS
} from '../helpers/positionAssetColors';
import { safeClick }
  from '../helpers/safeClick';
import { Logger }
  from '../utils/logger';

/* =============================================================================
PAGE OBJECT: PositionsDynamicGridPage

PURPOSE
-------
Portfolio > Positions Community AG Grid: grouping, filters, saved views,
selection charts, position drawer, and Rob asset-type colors.
Does not require AG Grid Enterprise.
============================================================================= */

export class PositionsDynamicGridPage {
  constructor(
    private readonly page: Page
  ) {}

  async open() {
    await this.page.goto(
      `${BASE_URL}/dashboard/positions`,
      {
        waitUntil: 'domcontentloaded'
      }
    );
  }

  savedViewSelect() {
    return this.page.getByRole(
      'combobox',
      {
        name: /saved views/i
      }
    );
  }

  equityGroupRow() {
    return this.page.getByRole(
      'row',
      {
        name: /equity.*\d+\s+holdings/i
      }
    );
  }

  optionsGroupRow() {
    return this.page.getByRole(
      'row',
      {
        name: /options.*\d+\s+positions/i
      }
    );
  }

  cashGroupRow() {
    return this.page.getByRole(
      'row',
      {
        name: /cash.*\d+\s+balance/i
      }
    );
  }

  analysisPanel() {
    return this.page.locator(
      'aside[aria-label="Position analysis"]'
    );
  }

  async closePanels() {
    await this.page.keyboard.press(
      'Escape'
    ).catch(
      () => undefined
    );

    if (
      await this.analysisPanel().isVisible().catch(
        () => false
      )
    ) {
      await this.analysisPanel().getByRole(
        'button',
        {
          name: /^close$/i
        }
      ).click({
        force: true
      }).catch(
        () => undefined
      );
    }

    const dialogClose =
      this.page.getByRole(
        'dialog'
      ).getByRole(
        'button',
        {
          name: /^(close|cancel)$/i
        }
      );

    if (
      await dialogClose.first().isVisible().catch(
        () => false
      )
    ) {
      await dialogClose.first().click({
        force: true
      }).catch(
        () => undefined
      );
    }
  }

  async scrollGrid(
    to: 'top' | 'bottom'
  ) {
    await this.page.locator(
      '.ag-body-viewport, .ag-center-cols-viewport, .ag-body-vertical-scroll-viewport'
    ).evaluateAll(
      (nodes, edge) => {
        for (const node of nodes) {
          node.scrollTop =
            edge === 'bottom'
              ? node.scrollHeight
              : 0;
        }
      },
      to
    );
  }

  async restoreDefaultView() {
    await dismissOverlays(
      this.page
    );

    await this.closePanels();

    await this.page.getByRole(
      'button',
      {
        name: /^reset$/i
      }
    ).click({
      force: true
    }).catch(
      () => undefined
    );

    await this.savedViewSelect().selectOption({
      label: 'All Positions'
    }).catch(
      () => undefined
    );
  }

  async expectLoaded() {
    Logger.info(
      'Checking Positions dynamic grid'
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /^positions$/i
        }
      )
    ).toBeVisible({
      timeout: 20000
    });

    await this.restoreDefaultView();

    await expect(
      this.page.getByText(
        /consolidated view of all your positions/i
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'searchbox',
        {
          name: /search positions/i
        }
      ).or(
        this.page.getByPlaceholder(
          /search symbol/i
        )
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /^group by$/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /expand all/i
        }
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /collapse all/i
        }
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'columnheader',
        {
          name: /symbol/i
        }
      ).or(
        this.page.getByText(
          /^symbol$/i
        )
      ).first()
    ).toBeVisible();

    await expect(
      this.equityGroupRow().first()
    ).toBeVisible({
      timeout: 20000
    });

    await expect(
      this.optionsGroupRow().first()
    ).toBeVisible();

    await this.scrollGrid(
      'bottom'
    );

    await expect(
      this.cashGroupRow().first()
    ).toBeVisible({
      timeout: 8000
    });

    await this.scrollGrid(
      'top'
    );

    await expect(
      this.page.getByText(
        /\$[\d,.]+(?:\s+call|\s+put)\s*·\s*\d+\s*dte/i
      ).first()
    ).toBeVisible();

    Logger.success(
      'Positions grid shows grouped equity, options, and cash'
    );
  }

  async expectToolbar() {
    Logger.info(
      'Checking Positions toolbar filters and grouping'
    );

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /all brokers/i
        }
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /all accounts/i
        }
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /all assets/i
        }
      )
    ).toBeVisible();

    await expect(
      this.page.getByLabel(
        /option type/i
      )
    ).toBeVisible();

    await expect(
      this.page.getByLabel(
        /^expiry$/i
      )
    ).toBeVisible();

    await expect(
      this.page.getByLabel(
        /^p&l$/i
      )
    ).toBeVisible();

    await expect(
      this.page.getByPlaceholder(
        /dte/i
      )
    ).toBeVisible();

    await expect(
      this.page.getByPlaceholder(
        /mv/i
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /add group/i
        }
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /^columns$/i
        }
      )
    ).toBeVisible();

    await expect(
      this.savedViewSelect()
    ).toBeVisible();

    Logger.success(
      'Filter bar, group-by, columns, and saved views are present'
    );
  }

  async expectExpandCollapseAndSearch() {
    Logger.info(
      'Checking expand/collapse and search'
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /collapse all/i
        }
      ),
      'Collapse All'
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /expand all/i
        }
      ),
      'Expand All'
    );

    const search =
      this.page.getByRole(
        'searchbox',
        {
          name: /search positions/i
        }
      ).or(
        this.page.getByPlaceholder(
          /search symbol/i
        )
      ).first();

    await search.fill(
      'AAPL'
    );

    await expect(
      this.page.getByText(
        /AAPL/i
      ).first()
    ).toBeVisible({
      timeout: 8000
    });

    await search.fill(
      ''
    );

    Logger.success(
      'Expand/collapse and symbol search work'
    );
  }

  async expectCallFilterChips() {
    Logger.info(
      'Checking option-type filter chips'
    );

    await this.page.getByLabel(
      /option type/i
    ).selectOption({
      label: 'Call'
    });

    await expect(
      this.page.getByText(
        /^active filters$/i
      )
    ).toBeVisible({
      timeout: 8000
    });

    await expect(
      this.page.getByText(
        /^calls$/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /clear all/i
        }
      )
    ).toBeVisible();

    await expect(
      this.optionsGroupRow().first()
    ).toBeVisible();

    await expect(
      this.equityGroupRow()
    ).toHaveCount(
      0
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /clear all/i
        }
      ),
      'Clear All'
    );

    await expect(
      this.equityGroupRow().first()
    ).toBeVisible({
      timeout: 8000
    });

    Logger.success(
      'Call filter chips reduce the grid and Clear All restores it'
    );
  }

  async expectByBrokerSavedView() {
    Logger.info(
      'Checking By Broker system view'
    );

    await this.savedViewSelect().selectOption({
      label: 'By Broker'
    });

    await expect(
      this.page.getByText(
        /\d+\s+positions/i
      ).first()
    ).toBeVisible({
      timeout: 8000
    });

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /add group/i
        }
      ),
      'Add Group'
    );

    const groupMenu =
      this.page.getByRole(
        'menu'
      ).or(
        this.page.locator(
          '[data-radix-popper-content-wrapper]'
        )
      ).first();

    await expect(
      groupMenu.getByText(
        /^account type$/i
      )
    ).toBeVisible({
      timeout: 8000
    });

    await expect(
      groupMenu.getByText(
        /^expiry$/i
      )
    ).toBeVisible();

    await expect(
      groupMenu.getByText(
        /^option type$/i
      )
    ).toBeVisible();

    await this.page.keyboard.press(
      'Escape'
    );

    await this.savedViewSelect().selectOption({
      label: 'All Positions'
    });

    Logger.success(
      'By Broker view groups positions and Add Group lists remaining fields'
    );
  }

  async expectAnalyzeFilteredCharts() {
    Logger.info(
      'Checking Analyze Filtered Results charts'
    );

    await this.closePanels();

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /analyze filtered results/i
        }
      ),
      'Analyze Filtered Results'
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /position analysis/i
        }
      )
    ).toBeVisible({
      timeout: 10000
    });

    await expect(
      this.page.getByText(
        /asset allocation/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /market value by position/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /unrealized p&l/i
      ).first()
    ).toBeVisible();

    await this.closePanels();

    Logger.success(
      'Analysis shows allocation, market value, and P&L charts'
    );
  }

  async expectSelectionAnalysis() {
    Logger.info(
      'Selecting a leaf position for analysis metrics'
    );

    const leafCheckbox =
      this.page.getByRole(
        'checkbox',
        {
          name: /^select cb$/i
        }
      );

    await expect(
      leafCheckbox
    ).toBeVisible({
      timeout: 10000
    });

    await leafCheckbox.click();

    const analyzeSelected =
      this.page.getByRole(
        'button',
        {
          name: /analyze selected/i
        }
      );

    if (
      !await this.analysisPanel().isVisible().catch(
        () => false
      )
    ) {
      if (
        await analyzeSelected.isVisible().catch(
          () => false
        )
      ) {
        await safeClick(
          analyzeSelected,
          'Analyze Selected'
        );
      }
    }

    await expect(
      this.analysisPanel()
    ).toBeVisible({
      timeout: 10000
    });

    await expect(
      this.analysisPanel().getByText(
        /\d+\s+positions selected/i
      )
    ).toBeVisible();

    await expect(
      this.analysisPanel().getByText(
        /^market value$/i
      ).first()
    ).toBeVisible();

    await expect(
      this.analysisPanel().getByText(
        /^cost basis$/i
      ).first()
    ).toBeVisible();

    await expect(
      this.analysisPanel().getByText(
        /unrealized p&l/i
      ).first()
    ).toBeVisible();

    await expect(
      this.analysisPanel().getByText(
        /asset allocation/i
      )
    ).toBeVisible();

    await expect(
      this.analysisPanel().getByText(
        /market value by position/i
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'checkbox',
        {
          name: /^select equity$/i
        }
      )
    ).not.toBeChecked();

    await this.closePanels();

    Logger.success(
      'Selected leaf rows open analysis with MV, cost basis, and P&L'
    );
  }

  async expectPositionDrawer() {
    Logger.info(
      'Opening a position detail drawer'
    );

    await this.closePanels();

    await this.page.getByRole(
      'button',
      {
        name: /chubb ltd/i
      }
    ).first().click();

    await expect(
      this.page.getByText(
        /across accounts/i
      ).first()
    ).toBeVisible({
      timeout: 8000
    });

    await expect(
      this.page.getByText(
        /ooltool overlay/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /view opportunities/i
      ).first()
    ).toBeVisible();

    await this.page.keyboard.press(
      'Escape'
    ).catch(
      () => undefined
    );

    Logger.success(
      'Position drawer shows overlay and account breakdown'
    );
  }

  async expectColumnPickerAndSaveView() {
    Logger.info(
      'Checking column picker and Save View dialog'
    );

    await this.closePanels();

    await this.page.getByRole(
      'button',
      {
        name: /^columns$/i
      }
    ).click({
      force: true
    });

    const columnDialog =
      this.page.getByRole(
        'dialog'
      );

    await expect(
      columnDialog.getByText(
        /^symbol$/i
      )
    ).toBeVisible({
      timeout: 8000
    });

    for (const label of [
      /^p&l\s*%$/i,
      /^cost basis$/i,
      /^strike$/i,
      /^option type$/i,
      /allocation\s*%/i
    ]) {
      const item =
        columnDialog.getByText(
          label
        ).first();

      await item.scrollIntoViewIfNeeded();

      await expect(
        item
      ).toBeVisible();
    }

    await this.page.keyboard.press(
      'Escape'
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /save view/i
        }
      ),
      'Save View'
    );

    const saveDialog =
      this.page.getByRole(
        'dialog'
      );

    await expect(
      saveDialog.getByText(
        /saves grouping, filters, sort, columns/i
      )
    ).toBeVisible({
      timeout: 8000
    });

    await expect(
      saveDialog.getByLabel(
        /view name/i
      ).or(
        saveDialog.getByRole(
          'textbox'
        )
      ).first()
    ).toBeVisible();

    await safeClick(
      saveDialog.getByRole(
        'button',
        {
          name: /^cancel$/i
        }
      ),
      'Cancel Save View'
    );

    Logger.success(
      'Column picker and Save View dialog are available without persisting a view'
    );
  }

  async expectRobPalette() {
    Logger.info(
      'Checking Rob asset-type colors on position badges'
    );

    await this.restoreDefaultView();

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /expand all/i
        }
      ),
      'Expand All'
    );

    const required = [
      ROB_POSITION_COLORS.longEquity,
      ROB_POSITION_COLORS.longCall,
      ROB_POSITION_COLORS.longPut
    ];

    for (const entry of required) {
      const badge =
        this.page.locator(
          'span.inline-flex'
        ).filter({
          hasText: entry.label
        }).first();

      await badge.scrollIntoViewIfNeeded().catch(
        () => undefined
      );

      await expect(
        badge,
        `Badge ${entry.label} should be visible`
      ).toBeVisible({
        timeout: 15000
      });

      const className =
        await badge.getAttribute(
          'class'
        );

      expect(
        classHasHex(
          className,
          entry.hex
        ),
        `${String(entry.label)} badge class should include ${entry.hex}: ${className}`
      ).toBe(
        true
      );
    }

    await this.scrollGrid(
      'bottom'
    );

    const cashBadge =
      this.page.locator(
        'span.inline-flex'
      ).filter({
        hasText: ROB_POSITION_COLORS.cash.label
      }).first();

    await cashBadge.scrollIntoViewIfNeeded().catch(
      () => undefined
    );

    await expect(
      cashBadge,
      'CASH badge should be visible'
    ).toBeVisible({
      timeout: 15000
    });

    const cashClass =
      await cashBadge.getAttribute(
        'class'
      );

    expect(
      classHasHex(
        cashClass,
        ROB_POSITION_COLORS.cash.hex
      ),
      `CASH badge class should include ${ROB_POSITION_COLORS.cash.hex}: ${cashClass}`
    ).toBe(
      true
    );

    const optional = [
      ROB_POSITION_COLORS.shortEquity,
      ROB_POSITION_COLORS.shortCall,
      ROB_POSITION_COLORS.shortPut,
      ROB_POSITION_COLORS.bond,
      ROB_POSITION_COLORS.unclassified
    ];

    for (const entry of optional) {
      const badge =
        this.page.locator(
          'span.inline-flex'
        ).filter({
          hasText: entry.label
        });

      if (
        await badge.count()
      ) {
        const className =
          await badge.first().getAttribute(
            'class'
          );

        expect(
          classHasHex(
            className,
            entry.hex
          ),
          `${String(entry.label)} badge class should include ${entry.hex}: ${className}`
        ).toBe(
          true
        );
      }
    }

    Logger.success(
      'Present position badges use the Rob asset-type hex values'
    );
  }

  async expectCommunityGridOnly() {
    const html =
      await this.page.content();

    expect(
      html,
      'Positions grid must not load AG Grid Enterprise'
    ).not.toMatch(
      /ag-grid-enterprise/i
    );

    expect(
      html
    ).toMatch(
      /ag-theme|ag-root/i
    );

    Logger.success(
      'Grid is AG Community, not Enterprise'
    );
  }
}
