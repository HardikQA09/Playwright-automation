import {
  expect,
  Page
} from '@playwright/test';

import {
  callDistancePct,
  expiryBucket,
  parseMoney
} from '../helpers/optionExpiryDistance';
import { safeClick }
  from '../helpers/safeClick';
import { Logger }
  from '../utils/logger';

/* =============================================================================
PAGE OBJECT: OptionExpiryOverviewPage

PURPOSE
-------
Option Expiry Overview revamp: Short/Long tabs, OTM–ITM legend, integer
breakdown bars, footer totals, and the row drill-down modal.
============================================================================= */

export class OptionExpiryOverviewPage {
  constructor(
    private readonly page: Page
  ) {}

  heading() {
    return this.page.getByRole(
      'heading',
      {
        name: /option expiry overview/i
      }
    ).first();
  }

  shortTab() {
    return this.page.getByRole(
      'button',
      {
        name: /^short options$/i
      }
    ).first();
  }

  longTab() {
    return this.page.getByRole(
      'button',
      {
        name: /^long options$/i
      }
    ).first();
  }

  dialog() {
    return this.page
      .getByRole('dialog')
      .or(this.page.getByRole('alertdialog'))
      .or(
        this.page.locator(
          '[role="dialog"], [data-state="open"][class*="modal"], [class*="Modal"]'
        )
      )
      .first();
  }

  card() {
    return this.page
      .locator('section, article, div')
      .filter({
        has: this.heading()
      })
      .first();
  }

  async reveal() {
    await expect(
      this.heading()
    ).toBeVisible({
      timeout: 20000
    });

    await this.heading().scrollIntoViewIfNeeded();
  }

  async expectMainCardStructure() {
    Logger.info(
      'Checking Option Expiry Overview tabs, legend, and columns'
    );

    await this.reveal();

    await safeClick(
      this.longTab(),
      'Long Options'
    );

    await expect(
      this.shortTab()
    ).toBeVisible();

    await expect(
      this.longTab()
    ).toBeVisible();

    for (const label of [
      'OTM',
      'NTM',
      'ATM',
      'ITM'
    ]) {
      await expect(
        this.page.getByText(
          label,
          {
            exact: true
          }
        ).first()
      ).toBeVisible();
    }

    await expect(
      this.page.getByText(
        /symbol\s*\/\s*type/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /^expiration$/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /^qty$/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /^breakdown$/i
      ).first()
    ).toBeVisible();

    Logger.success(
      'Expiry overview tabs, legend, and columns are shown'
    );
  }

  async openLongOptions() {
    await this.reveal();

    await safeClick(
      this.longTab(),
      'Long Options'
    );
  }

  async expectFooterTotals() {
    Logger.info(
      'Checking category footer totals'
    );

    await this.openLongOptions();

    await expect(
      this.page.getByText(
        /otm\s+\d+\s*\|\s*ntm\s+\d+\s*\|\s*atm\s+\d+\s*\|\s*itm\s+\d+/i
      ).first()
    ).toBeVisible({
      timeout: 10000
    });

    Logger.success(
      'Footer lists OTM | NTM | ATM | ITM counts'
    );
  }

  async expectIntegerBreakdown() {
    Logger.info(
      'Checking integer breakdown counts'
    );

    await this.openLongOptions();

    const empty =
      await this.page.getByText(
        /no (open )?(long|short).*(option|expir)/i
      ).first().isVisible().catch(
        () => false
      );

    if (empty) {
      Logger.success(
        'Long options empty — no breakdown bars to count'
      );
      return;
    }

    await expect(
      this.page.getByText(
        /click a row to inspect/i
      ).first()
    ).toBeVisible();

    const cardText =
      await this.page.locator(
        'body'
      ).innerText();

    expect(
      cardText,
      'Breakdown should show integer contract counts, not percent bars'
    ).toMatch(
      /breakdown[\s\S]{0,200}\b\d+\b/i
    );

    Logger.success(
      'Breakdown uses integer contract counts'
    );
  }

  async openFirstLongRowModal() {
    await this.openLongOptions();

    const card = this.card();

    const empty =
      await card
        .getByText(/no (open )?(long|short).*(option|expir)/i)
        .first()
        .isVisible()
        .catch(() => false);

    if (empty) {
      return false;
    }

    // Prefer an actual contract row inside the card, not page-wide ticker text
    // (profile initials like QU/HT used to get clicked by mistake).
    const row =
      card
        .locator('tr, [role="row"], button, [class*="row"]')
        .filter({
          hasText: /\b[A-Z]{1,5}\b/
        })
        .filter({
          hasNotText: /OTM|NTM|ATM|ITM|option expiry overview|short options|long options/i
        })
        .first();

    const symbolInCard =
      card.getByText(/^[A-Z]{1,5}$/).filter({
        hasNotText: /OTM|NTM|ATM|ITM|QTY|DTE/i
      }).first();

    const target =
      (await row.isVisible().catch(() => false))
        ? row
        : symbolInCard;

    if (!(await target.isVisible().catch(() => false))) {
      return false;
    }

    await target.click();

    const dialog = this.dialog();
    const opened = await dialog
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    if (!opened) {
      // Product may use a side panel instead of role=dialog.
      const panel = this.page.getByText(
        /underlying last|call distance|long call|short put|expiration/i
      ).first();

      if (await panel.isVisible({ timeout: 2000 }).catch(() => false)) {
        return true;
      }

      throw new Error(
        'Clicked an Option Expiry Overview row, but no drill-down dialog or detail panel opened within 8s.'
      );
    }

    return true;
  }

  async expectDrillDownModal() {
    Logger.info(
      'Checking expiry row drill-down modal'
    );

    const opened =
      await this.openFirstLongRowModal();

    if (!opened) {
      Logger.success(
        'No long-option rows to open a modal'
      );
      return;
    }

    const dialog =
      this.dialog();

    await expect(
      dialog.getByText(
        /\|\s*(long|short)\s+(call|put)/i
      ).first()
    ).toBeVisible();

    await expect(
      dialog.getByText(
        /expiration/i
      ).first()
    ).toBeVisible();

    await expect(
      dialog.getByText(
        /underlying last/i
      ).first()
    ).toBeVisible();

    await expect(
      dialog.getByText(
        /contract/i
      ).first()
    ).toBeVisible();

    for (const column of [
      /^symbol$/i,
      /^qty$/i,
      /^strike$/i,
      /^last$/i,
      /^distance$/i,
      /^status$/i
    ]) {
      await expect(
        dialog.getByText(
          column
        ).first()
      ).toBeVisible();
    }

    await expect(
      dialog.getByText(
        /[+-]?\d+(?:\.\d+)?%/
      ).first()
    ).toBeVisible();

    await expect(
      dialog.getByText(
        /^(OTM|NTM|ATM|ITM)$/
      ).first()
    ).toBeVisible();

    await expect(
      dialog.getByText(
        /distance\s*=\s*\(\(/i
      ).first()
    ).toBeVisible();

    Logger.success(
      'Drill-down modal shows symbol, type, table, distance, status, and formula'
    );
  }

  async expectCallDistanceMatchesFormula() {
    Logger.info(
      'Checking call distance against ((S - K) / K) x 100'
    );

    const opened =
      await this.openFirstLongRowModal();

    expect(
      opened,
      'Need a long option row to verify the distance formula'
    ).toBe(
      true
    );

    const text =
      await this.dialog().innerText();

    expect(
      text
    ).toMatch(
      /call distance\s*=\s*\(\(\s*last price\s*-\s*strike\s*\)\s*\/\s*strike\s*\)\s*x\s*100/i
    );

    const tableRows =
      [
        ...text.matchAll(
          /\$([\d,.]+)\s+\$([\d,.]+)\s+([+-]?\d+(?:\.\d+)?)\s*%/g
        )
      ];

    expect(
      tableRows.length,
      'Need strike/last/distance rows in the expiry modal'
    ).toBeGreaterThan(
      0
    );

    const underlyingMatch =
      text.match(
        /underlying last\s*(\$[\d,.]+)/i
      );

    const underlyingLast =
      parseMoney(
        underlyingMatch?.[1] ||
        ''
      );

    for (const row of tableRows) {
      const k =
        parseMoney(
          `$${row[1]}`
        );
      const last =
        Number.isFinite(
          underlyingLast
        ) &&
        underlyingLast > 0
          ? underlyingLast
          : parseMoney(
            `$${row[2]}`
          );
      const shown =
        Number(
          row[3]
        );
      const expected =
        callDistancePct(
          last,
          k
        );

      expect(
        last,
        'Last price should parse from the modal table when Underlying last is N/A'
      ).toBeGreaterThan(
        0
      );

      expect(
        k,
        'Strike should parse'
      ).toBeGreaterThan(
        0
      );

      expect(
        Math.abs(
          shown - expected
        ),
        `Distance ${shown}% should match ((${last} - ${k}) / ${k}) x 100 = ${expected.toFixed(2)}%`
      ).toBeLessThan(
        0.05
      );

      const bucket =
        expiryBucket(
          expected
        );

      expect(
        text
      ).toMatch(
        new RegExp(
          `\\b${bucket}\\b`
        )
      );
    }

    Logger.success(
      `Call distance matches ((last - strike) / strike) x 100 for ${tableRows.length} row(s)`
    );
  }
}
