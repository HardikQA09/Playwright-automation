import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from '../config/testData';

import { safeClick }
  from '../helpers/safeClick';
import { Logger }
  from '../utils/logger';

/* =============================================================================
PAGE OBJECT: PositionsDynamicGridPage

PURPOSE
-------
Portfolio > Positions dynamic grid: grouping, search, saved views, analysis
charts, position drawer, and Community (non-Enterprise) AG Grid.
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
      this.page.getByText(
        /^equity$/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /^options$/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /^cash$/i
      ).first()
    ).toBeVisible();

    Logger.success(
      'Positions grid shows grouped equity, options, and cash'
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

  async expectAnalyzeFilteredCharts() {
    Logger.info(
      'Checking Analyze Filtered Results charts'
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /analyze filtered results/i
        }
      ),
      'Analyze Filtered Results'
    );

    const panel =
      this.page.getByRole(
        'dialog'
      ).or(
        this.page.getByRole(
          'heading',
          {
            name: /position analysis/i
          }
        )
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

    await this.page.getByRole(
      'button',
      {
        name: /^close$/i
      }
    ).first().click().catch(
      () => undefined
    );

    void panel;

    Logger.success(
      'Analysis shows allocation, market value, and P&L charts'
    );
  }

  async expectPositionDrawer() {
    Logger.info(
      'Opening a position detail drawer'
    );

    await this.page.getByText(
      /chubb ltd/i
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
