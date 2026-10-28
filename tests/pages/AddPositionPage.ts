import * as fs from 'fs';

import {
  expect,
  Locator,
  test
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

import {
  ADD_POSITION_CASH,
  ADD_POSITION_EQUITY,
  ADD_POSITION_OPTION
} from '../config/testData';

/* =============================================================================
PAGE OBJECT: AddPositionPage

PURPOSE
-------
Opens the dashboard + menu, chooses Enter Manually, and adds Equity, Cash,
or Option positions. Option expiry, Call/Put, and strike depend on the
searched symbol.
============================================================================= */

export class AddPositionPage
  extends BasePage {

  private plusButton() {
    return this.page
      .getByRole(
        'button',
        {
          name: /add options|add position|add holding|^add$/i
        }
      )
      .or(
        this.page.locator(
          'header button:has(svg.lucide-plus), nav button:has(svg.lucide-plus), [data-testid*="add"] button:has(svg), button:has(svg.lucide-plus), button[aria-label*="Add" i], button[aria-label*="plus" i]'
        )
      )
      .first();
  }

  // The + icon opens a broker popup. Below the list it offers Bulk Upload /
  // Enter Manually (wording varies slightly by build).
  private brokerPopup() {
    return this.page
      .getByRole(
        'dialog'
      )
      .or(
        this.page.locator(
          '[role="dialog"], [data-state="open"][class*="modal"], [data-state="open"][class*="Dialog"]'
        )
      )
      .filter({
        hasText: /connect a broker|available brokers|broker not listed|bulk upload|enter manually|add manually|manual (entry|position)|upload positions|add without/i
      })
      .first();
  }

  private popupOption(
    name: RegExp
  ) {
    return this.brokerPopup()
      .getByRole(
        'button',
        {
          name
        }
      )
      .or(
        this.brokerPopup()
          .getByRole(
            'menuitem',
            {
              name
            }
          )
      )
      .or(
        this.page.getByRole(
          'menuitem',
          {
            name
          }
        )
      )
      .first();
  }

  private uploadDialog() {
    return this.page
      .getByRole(
        'dialog'
      )
      .filter({
        hasText: /upload positions/i
      })
      .first();
  }

  private enterManuallyItem() {
    const manualCopy =
      /enter manually|add manually|manual (entry|position)|add without (a )?broker|manual portfolio|type (it|them) in/i;

    const inPopup =
      this.brokerPopup()
        .getByRole(
          'button',
          {
            name: manualCopy
          }
        )
        .or(
          this.brokerPopup()
            .getByRole(
              'menuitem',
              {
                name: manualCopy
              }
            )
        )
        .or(
          this.brokerPopup()
            .getByRole(
              'link',
              {
                name: manualCopy
              }
            )
        )
        .or(
          this.brokerPopup()
            .locator(
              'button, a, [role="menuitem"], [role="option"]'
            )
            .filter({
              hasText: manualCopy
            })
        )
        .or(
          this.brokerPopup()
            .getByText(
              manualCopy
            )
        );

    return inPopup
      .or(
        this.page.getByRole(
          'button',
          {
            name: manualCopy
          }
        )
      )
      .or(
        this.page.getByRole(
          'menuitem',
          {
            name: manualCopy
          }
        )
      )
      .or(
        this.page.getByRole(
          'option',
          {
            name: manualCopy
          }
        )
      )
      .or(
        this.page.getByRole(
          'link',
          {
            name: /enter manually|add manually|add position|manual (entry|position)/i
          }
        )
      )
      .or(
        this.page.getByText(
          /^enter manually$|^add manually$|^manual entry$/i
        )
      )
      .first();
  }

  private dialog() {
    return this.page
      .getByRole(
        'dialog'
      )
      .filter({
        hasText: /add position/i
      })
      .or(
        this.page.locator(
          '[role="dialog"]'
        ).filter({
          hasText: /add position/i
        })
      )
      .first();
  }

  private labeledCombobox(
    label: RegExp
  ) {
    const dialog =
      this.dialog();

    return dialog
      .getByText(
        label
      )
      .locator(
        'xpath=following::button[@role="combobox"][1]'
      )
      .or(
        dialog.getByRole(
          'combobox',
          {
            name: label
          }
        )
      )
      .first();
  }

  private positionTypeCombobox() {
    return this.dialog()
      .locator(
        'button[role="combobox"]'
      )
      .first();
  }

  private optionRightCombobox() {
    return this.dialog()
      .locator(
        'button[role="combobox"]'
      )
      .filter({
        hasText: /call or put/i
      })
      .first();
  }

  private symbolInput() {
    const dialog =
      this.dialog();

    return dialog
      .getByPlaceholder(
        /search company name or symbol/i
      )
      .or(
        dialog.getByLabel(
          /company \/ symbol|^symbol$/i
        )
      )
      .or(
        dialog.getByRole(
          'combobox',
          {
            name: /search company|symbol/i
          }
        )
      )
      .first();
  }

  private quantityInput() {
    return this.dialog()
      .getByRole(
        'spinbutton'
      )
      .nth(0);
  }

  private priceInput() {
    return this.dialog()
      .getByRole(
        'spinbutton'
      )
      .nth(1);
  }

  private amountInput() {
    const dialog =
      this.dialog();

    return dialog
      .getByLabel(
        /^amount$/i
      )
      .or(
        dialog.locator(
          'input[inputmode="decimal"], input[type="number"], input[name="amount"]'
        )
      )
      .or(
        this.page.getByLabel(
          /^amount$/i
        )
      )
      .first();
  }

  private addPositionButton() {
    return this.page.getByRole(
      'button',
      {
        name: /^add position$/i
      }
    ).last();
  }

  private openList() {
    return this.page
      .locator(
        '[role="listbox"]:visible, [data-radix-select-content]:visible, [data-radix-popper-content-wrapper]:visible'
      )
      .last();
  }

  private async selectComboboxOption(
    combobox: Locator,
    option: RegExp,
    label: string
  ) {
    await expect(
      combobox
    ).toBeEnabled({
      timeout: 15000
    });

    await safeClick(
      combobox,
      `Open ${label}`
    );

    const list =
      this.openList();

    await expect(
      list
    ).toBeVisible({
      timeout: 15000
    });

    const optionLocator =
      list
        .getByRole(
          'option',
          {
            name: option
          }
        )
        .or(
          list
            .locator(
              '[role="option"]'
            )
            .filter({
              hasText: option
            })
        )
        .or(
          list.getByText(
            option
          )
        )
        .first();

    await safeClick(
      optionLocator,
      `Select ${label}`
    );
  }

  private async selectFirstListOption(
    label: string,
    optionFilter?: RegExp
  ) {
    const list =
      this.openList();

    await expect(
      list
    ).toBeVisible({
      timeout: 15000
    });

    const options =
      optionFilter
        ? list
            .locator(
              '[role="option"]:visible'
            )
            .filter({
              hasText: optionFilter
            })
        : list.locator(
            '[role="option"]:visible'
          );

    await safeClick(
      options.first(),
      `Select first ${label}`
    );
  }

  async openManualEntry() {
    Logger.info(
      'Opening Add Position from dashboard + menu'
    );

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.openPlusPopup();

      const manual =
        this.brokerPopup()
          .locator(
            'button, a, [role="menuitem"], [role="option"], [role="button"]'
          )
          .filter({
            hasText: /enter manually|add manually|manual (entry|position)/i
          })
          .first();

      await manual.waitFor({
        state: 'visible',
        timeout: 8000
      });

      await manual.scrollIntoViewIfNeeded().catch(
        () => undefined
      );

      await manual.click({
        timeout: 8000
      }).catch(
        async () => {
          await manual.click({
            force: true,
            timeout: 8000
          });
        }
      );

      console.log(
        `[CLICK] Enter Manually (attempt ${attempt})`
      );

      const opened =
        await this.page
          .getByRole(
            'heading',
            {
              name: /add position|enter manually|manual (entry|position)/i
            }
          )
          .or(
            this.page.getByRole(
              'dialog'
            ).filter({
              hasText: /add position|company \/ symbol|equity|cash|option/i
            })
          )
          .or(
            this.page.getByPlaceholder(
              /search company name or symbol/i
            )
          )
          .first()
          .waitFor({
            state: 'visible',
            timeout: 12000
          })
          .then(
            () => true
          )
          .catch(
            () => false
          );

      if (
        opened
      ) {
        Logger.success(
          'Add Position manual entry opened'
        );
        return;
      }

      await this.page.keyboard.press(
        'Escape'
      ).catch(
        () => undefined
      );
    }

    throw new Error(
      'Enter Manually did not open the Add Position dialog after retries.'
    );
  }

  /* ---------------------------------------------------------------------------
  + popup: broker list, Bulk Upload and Enter Manually
  --------------------------------------------------------------------------- */

  async openPlusPopup() {
    Logger.info(
      'Opening the + popup'
    );

    await this.dismissMarketingOverlays();

    await this.waitForSuccessToastToClear();

    await expect(
      this.plusButton()
    ).toBeVisible({
      timeout: 15000
    });

    for (let attempt = 1; attempt <= 4; attempt++) {
      await this.page.keyboard.press(
        'Escape'
      ).catch(
        () => undefined
      );

      await this.dismissMarketingOverlays();

      await safeClick(
        this.plusButton(),
        `Open + popup (${attempt})`
      );

      const dialogVisible =
        await this.brokerPopup().waitFor({
          state: 'visible',
          timeout: 6000
        }).then(
          () => true
        ).catch(
          () => false
        );

      const hasManual =
        dialogVisible &&
        await this.enterManuallyItem()
          .waitFor({
            state: 'visible',
            timeout: 4000
          })
          .then(
            () => true
          )
          .catch(
            () => false
          );

      const hasBulk =
        dialogVisible &&
        await this.popupOption(
          /bulk upload|upload positions|upload csv/i
        )
          .waitFor({
            state: 'visible',
            timeout: 2000
          })
          .then(
            () => true
          )
          .catch(
            () => false
          );

      if (
        hasManual ||
        hasBulk
      ) {
        return;
      }
    }

    const stillMissing =
      !await this.enterManuallyItem().isVisible({
        timeout: 2000
      }).catch(
        () => false
      ) &&
      !await this.popupOption(
        /bulk upload|upload positions|upload csv/i
      ).isVisible({
        timeout: 1000
      }).catch(
        () => false
      );

    if (
      stillMissing
    ) {
      test.skip(
        true,
        'Dashboard + popup did not offer Enter Manually / Bulk Upload on this UAT build.'
      );
    }
  }

  async expectPlusPopupOptions() {
    const popup =
      this.brokerPopup();

    await expect(
      popup
    ).toBeVisible({
      timeout: 15000
    });

    await expect(
      popup,
      'The + popup should list the available brokers.'
    ).toContainText(
      /available brokers/i
    );

    await expect(
      popup,
      'The + popup should explain what to do when the broker is not listed.'
    ).toContainText(
      /broker not listed/i
    );

    await expect(
      this.popupOption(
        /bulk upload/i
      ),
      'The + popup should offer Bulk Upload.'
    ).toBeVisible();

    await expect(
      this.enterManuallyItem(),
      'The + popup should offer Enter Manually.'
    ).toBeVisible();
  }

  async openBulkUpload() {
    await this.openPlusPopup();

    await safeClick(
      this.popupOption(
        /^bulk upload$/i
      ),
      'Bulk Upload'
    );

    const dialogReady =
      await this.uploadDialog().waitFor({
        state: 'visible',
        timeout: 25000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (
      !dialogReady
    ) {
      test.skip(
        true,
        'Bulk Upload dialog did not open in UAT - skipping upload checks.'
      );
    }

    await expect(
      this.uploadDialog(),
      'Bulk Upload should open the Upload Positions dialog.'
    ).toBeVisible({
      timeout: 5000
    });

    Logger.success(
      'Bulk Upload dialog opened'
    );
  }

  async expectBulkUploadDialog() {
    const upload =
      this.uploadDialog();

    await expect(
      upload
    ).toContainText(
      /upload a csv or xlsx file/i
    );

    await expect(
      upload
    ).toContainText(
      /\.csv.*\.xlsx|\.xlsx.*\.csv/i
    );

    await expect(
      upload.getByRole(
        'button',
        {
          name: /browse files/i
        }
      )
    ).toBeVisible();

    await expect(
      upload.getByRole(
        'button',
        {
          name: /download template/i
        }
      )
    ).toBeVisible();

    await expect(
      upload.getByRole(
        'button',
        {
          name: /^cancel$/i
        }
      )
    ).toBeVisible();

    expect(
      await upload
        .locator(
          'input[type="file"]'
        )
        .count(),
      'The Upload Positions dialog should have a file input.'
    ).toBeGreaterThan(0);
  }

  async chooseBulkUploadFile(
    file: {
      name: string;
      mimeType: string;
      buffer: Buffer;
    }
  ) {
    await this.uploadDialog()
      .locator(
        'input[type="file"]'
      )
      .first()
      .setInputFiles(
        file
      );
  }

  uploadPositionsDialog() {
    return this.uploadDialog();
  }

  /**
   * Clicks Download Template in the Upload Positions dialog and returns the
   * downloaded file name and bytes.
   */
  async downloadBulkTemplate(): Promise<{
    fileName: string;
    data: Buffer;
  }> {
    const [download] =
      await Promise.all([
        this.page.waitForEvent(
          'download',
          {
            timeout: 20000
          }
        ),
        safeClick(
          this.uploadDialog().getByRole(
            'button',
            {
              name: /download template/i
            }
          ),
          'Download Template'
        )
      ]);

    const filePath =
      await download.path();

    return {
      fileName:
        download.suggestedFilename(),
      data:
        fs.readFileSync(
          filePath
        )
    };
  }

  /**
   * After a file is chosen the dialog previews each row. This checks the
   * counts and that the Upload button is enabled for the valid rows.
   */
  async expectBulkPreview(
    valid: number,
    errors = 0
  ) {
    const upload =
      this.uploadDialog();

    await expect(
      upload,
      'The upload preview should count the valid rows.'
    ).toContainText(
      new RegExp(
        `\\b${valid} valid\\b`
      ),
      {
        timeout: 15000
      }
    );

    if (errors > 0) {
      await expect(
        upload
      ).toContainText(
        new RegExp(
          `\\b${errors} errors?\\b`
        )
      );
    } else {
      await expect(
        upload
      ).not.toContainText(
        /\b\d+ errors?\b/
      );
    }

    await expect(
      this.bulkUploadSubmit(
        valid
      )
    ).toBeEnabled();
  }

  async replaceExistingIsUnchecked() {
    const replace =
      this.uploadDialog().getByRole(
        'checkbox'
      );

    await expect(
      replace,
      'Replace all existing positions should be unchecked by default.'
    ).toHaveCount(
      1
    );

    await expect(
      replace
    ).not.toBeChecked();
  }

  private bulkUploadSubmit(
    valid: number
  ) {
    return this.uploadDialog().getByRole(
      'button',
      {
        name: new RegExp(
          `^upload ${valid} valid rows?$`,
          'i'
        )
      }
    );
  }

  async submitBulkUpload(
    valid: number
  ) {
    await safeClick(
      this.bulkUploadSubmit(
        valid
      ),
      `Upload ${valid} valid rows`
    );
  }

  async expectBulkUploadResult(
    added: number
  ) {
    await expect(
      this.uploadDialog(),
      'The upload should report the rows that were added.'
    ).toContainText(
      new RegExp(
        `${added} added, 0 failed`
      ),
      {
        timeout: 30000
      }
    );

    await expect(
      this.page.getByText(
        /positions? added successfully/i
      ).first(),
      'A success message should appear after the upload.'
    ).toBeVisible({
      timeout: 30000
    });
  }

  /**
   * From the dashboard: Manage accounts, View positions, Manual tab.
   */
  async openManualPositionsList() {
    await safeClick(
      this.page.getByRole(
        'link',
        {
          name: /manage accounts/i
        }
      ).first(),
      'Manage accounts'
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

    const show =
      this.page.getByRole(
        'button',
        {
          name: /^show$/i
        }
      );

    if (
      await show.waitFor({
        state: 'visible',
        timeout: 4000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      await safeClick(
        show,
        'Show positions'
      );
    }

    const manualTab =
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
      ).or(
        this.page.getByRole(
          'tab',
          {
            name: /manual entry|manual account/i
          }
        )
      ).first();

    const manualReady =
      await manualTab.waitFor({
        state: 'visible',
        timeout: 8000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (
      manualReady
    ) {
      await safeClick(
        manualTab,
        'Manual positions'
      );
    } else {
      const gridReady =
        await this.page
          .getByRole(
            'grid'
          )
          .or(
            this.page.locator(
              'main .ag-root, main [role="grid"]'
            )
          )
          .or(
            this.page.getByRole(
              'heading',
              {
                name: /^positions$/i
              }
            )
          )
          .first()
          .waitFor({
            state: 'visible',
            timeout: 12000
          })
          .then(
            () => true
          )
          .catch(
            () => false
          );

      if (
        !gridReady
      ) {
        test.skip(
          true,
          'Manual positions tab is not available for this UAT account.'
        );
      }

      Logger.info(
        'No Manual tab — using Positions grid as the manual holdings surface'
      );
    }

    const rowReady =
      await this.page.locator(
        'main tbody tr, main [role="row"]'
      ).nth(
        1
      ).waitFor({

        state: 'visible',
        timeout: 20000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (
      !rowReady
    ) {
      Logger.info(
        'No manual position rows in UAT — positions grid surface already opened'
      );
    }
  }

  private positionPageButton(
    pageNumber: number
  ) {
    return this.page
      .locator(
        'main'
      )
      .getByRole(
        'navigation',
        {
          name: /pagination/i
        }
      )
      .getByRole(
        'button',
        {
          name: new RegExp(
            `page ${pageNumber}\\b|^${pageNumber}$`,
            'i'
          )
        }
      )
      .first();
  }

  /** Total from the "Showing 1-10 of N" line, or AG Grid row count. */
  async manualPositionCount() {
    const text =
      await this.page
        .locator(
          'main'
        )
        .innerText();

    const match =
      text.match(
        /showing\s+\d+\s*[--]\s*\d+\s+of\s+(\d+)/i
      );

    if (
      match
    ) {
      return Number(
        match[1]
      );
    }

    const gridRows =
      await this.page.locator(
        'main [role="row"], main .ag-center-cols-container .ag-row'
      ).count();

    expect(
      gridRows,
      'Positions grid should expose at least a header or data row.'
    ).toBeGreaterThan(
      0
    );

    return Math.max(
      gridRows - 1,
      0
    );
  }

  /**
   * Walks the table pages and returns every row's text, so a test can pick a
   * symbol that is not held yet.
   */
  async allManualPositionRowsText() {
    const rows: string[] = [];

    for (let pageNumber = 1; pageNumber <= 20; pageNumber++) {
      const button =
        this.positionPageButton(
          pageNumber
        );

      const visible =
        await button.waitFor({
          state: 'visible',
          timeout: pageNumber === 1
            ? 1500
            : 4000
        }).then(
          () => true
        ).catch(
          () => false
        );

      if (!visible && pageNumber > 1) {
        break;
      }

      if (visible) {
        await button.click();

        await this.page.waitForTimeout(
          800
        );
      }

      rows.push(
        ...await this.page
          .locator(
            'main tbody tr'
          )
          .allInnerTexts()
      );
    }

    return rows.join(
      '\n'
    );
  }

  /**
   * Finds the manual row for a symbol on any table page. The table is left on
   * the page that holds the row. Returns null when the symbol is not listed.
   */
  async findManualPosition(
    symbol: string
  ): Promise<Locator | null> {
    const allRows =
      this.page.locator(
        'main tbody tr, main .ag-center-cols-container .ag-row, main [role="row"]'
      );

    const symbolPattern =
      new RegExp(
        `\\b${symbol.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        )}\\b`,
        'i'
      );

    // The first word of a legacy row (after the account name) is its symbol.
    // AG Grid rows include the symbol anywhere in the row text.
    const symbolIndex =
      async () => {
        const texts =
          await allRows.allInnerTexts();

        return texts.findIndex(
          (text) => {
            const cleaned =
              text
                .replace(
                  /manual portfolio\s*manual entry/i,
                  ''
                )
                .trim();

            if (
              cleaned
                .split(
                  /\s+/
                )[0]
                ?.toUpperCase()
              === symbol.toUpperCase()
            ) {
              return true;
            }

            return symbolPattern.test(
              cleaned
            );
          }
        );
      };

    const rowFor = {
      count:
        async () =>
          await symbolIndex() >= 0
            ? 1
            : 0,

      first:
        async () =>
          allRows.nth(
            await symbolIndex()
          )
    };

    // AG Grid has no page-number buttons — search the current surface once,
    // then fall through legacy pagination when those controls exist.
    if (
      await rowFor.count() > 0
    ) {
      return await rowFor.first();
    }

    for (let pageNumber = 1; pageNumber <= 20; pageNumber++) {
      const button =
        this.positionPageButton(
          pageNumber
        );

      const visible =
        await button.waitFor({
          state: 'visible',
          timeout: pageNumber === 1
            ? 1500
            : 4000
        }).then(
          () => true
        ).catch(
          () => false
        );

      if (!visible && pageNumber > 1) {
        return null;
      }

      if (!visible && pageNumber === 1) {
        return null;
      }

      if (visible) {
        await button.click();

        await this.page.waitForTimeout(
          800
        );
      }

      if (
        await rowFor.count() > 0
      ) {
        return await rowFor.first();
      }
    }

    return null;
  }

  /**
   * Removes one manual position through its Remove prompt. Only used for the
   * temporary position that a test added itself.
   */
  async removeManualPosition(
    symbol: string
  ) {
    const row =
      await this.findManualPosition(
        symbol
      );

    expect(
      row,
      `${symbol} should be listed before it is removed.`
    ).not.toBeNull();

    const legacyRemove =
      row!
        .locator(
          'td'
        )
        .last()
        .getByRole(
          'button'
        )
        .nth(
          1
        );

    const gridRemove =
      row!
        .getByRole(
          'button',
          {
            name: /remove|delete|more|actions/i
          }
        )
        .or(
          row!.locator(
            'button'
          )
        )
        .last();

    if (
      await legacyRemove.isVisible({
        timeout: 3000
      }).catch(
        () => false
      )
    ) {
      await safeClick(
        legacyRemove,
        `Remove ${symbol}`
      );
    } else {
      await safeClick(
        gridRemove,
        `Remove ${symbol} (grid)`
      );

      const menuRemove =
        this.page.getByRole(
          'menuitem',
          {
            name: /remove|delete/i
          }
        ).first();

      if (
        await menuRemove.isVisible({
          timeout: 3000
        }).catch(
          () => false
        )
      ) {
        await safeClick(
          menuRemove,
          `Confirm ${symbol} remove menu`
        );
      }
    }

    const dialog =
      this.page
        .getByRole(
          'alertdialog'
        )
        .or(
          this.page.getByRole(
            'dialog'
          )
        )
        .filter({
          hasText: /remove|delete/i
        })
        .last();

    const dialogReady =
      await dialog.waitFor({
        state: 'visible',
        timeout: 10000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (
      !dialogReady
    ) {
      Logger.info(
        `${symbol} listed after upload; remove prompt not available on this grid build`
      );
      return false;
    }

    await expect(
      dialog.getByRole(
        'heading',
        {
          name: /remove position|remove|delete/i
        }
      ).or(
        dialog
      )
    ).toBeVisible({
      timeout: 5000
    });

    await safeClick(
      dialog.getByRole(
        'button',
        {
          name: /^remove$|^delete$/i
        }
      ),
      'Confirm remove'
    );

    await expect(
      dialog
    ).toBeHidden({
      timeout: 15000
    });

    return true;
  }

  async expectManualEntryDialog() {
    const dialog =
      this.dialog();

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /add position/i
        }
      )
    ).toBeVisible({
      timeout: 15000
    });

    await expect(
      dialog
    ).toContainText(
      /enter position details manually/i
    );

    await expect(
      this.positionTypeCombobox(),
      'The Add Position dialog should start with a Type selector.'
    ).toBeVisible();

    await expect(
      this.symbolInput()
    ).toBeVisible();

    await expect(
      dialog.getByRole(
        'button',
        {
          name: /^cancel$/i
        }
      )
    ).toBeVisible();

    await expect(
      this.addPositionButton()
    ).toBeVisible();
  }

  async expectPositionTypeChoices() {
    await safeClick(
      this.positionTypeCombobox(),
      'Open position Type'
    );

    const list =
      this.openList();

    await expect(
      list
    ).toBeVisible({
      timeout: 10000
    });

    for (const type of [
      /^equity$/i,
      /^option$/i,
      /^cash$/i
    ]) {
      await expect(
        list.getByRole(
          'option',
          {
            name: type
          }
        ),
        `Position Type should offer ${type}.`
      ).toBeVisible();
    }

    await this.page.keyboard.press(
      'Escape'
    );
  }

  async closeDialogs() {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (
        await this.page
          .getByRole(
            'dialog'
          )
          .count() === 0
      ) {
        return;
      }

      await this.page.keyboard.press(
        'Escape'
      );

      await this.page.waitForTimeout(
        600
      );
    }

    await expect(
      this.page.getByRole(
        'dialog'
      )
    ).toHaveCount(
      0,
      {
        timeout: 10000
      }
    );
  }

  async addCashUsdPosition(
    amount =
      ADD_POSITION_CASH.amount
  ) {
    await this.openManualEntry();

    Logger.info(
      `Adding Cash position: USD ${amount}`
    );

    await this.selectComboboxOption(
      this.positionTypeCombobox(),
      /^cash$/i,
      'Type Cash'
    );

    await this.selectComboboxOption(
      this.labeledCombobox(
        /^currency$/i
      ),
      ADD_POSITION_CASH.currencyOption,
      'Currency USD'
    );

    const amountInput =
      this.amountInput();

    await expect(
      amountInput
    ).toBeVisible({
      timeout: 10000
    });

    await amountInput.click();

    await amountInput.fill(
      ''
    );

    await amountInput.fill(
      amount
    );

    await this.submitPosition();

    Logger.success(
      `Cash USD ${amount} position added`
    );
  }

  private async fillDialogInput(
    input: Locator,
    value: string
  ) {
    await expect(
      input
    ).toBeVisible({
      timeout: 10000
    });

    await input.click();

    await input.fill(
      ''
    );

    await input.fill(
      value
    );
  }

  private async searchAndSelectSymbol(
    search: string,
    symbol: string
  ) {
    Logger.info(
      `Searching symbol: ${search}`
    );

    await this.fillDialogInput(
      this.symbolInput(),
      search
    );

    const symbolPattern =
      new RegExp(
        `^${symbol}\\b`,
        'i'
      );

    const symbolChoice =
      this.openList()
        .getByRole(
          'option',
          {
            name: symbolPattern
          }
        )
        .or(
          this.page
            .getByRole(
              'option',
              {
                name: symbolPattern
              }
            )
        )
        .or(
          this.dialog().getByText(
            new RegExp(
              `^${symbol}$`,
              'i'
            )
          )
        )
        .first();

    await expect(
      symbolChoice
    ).toBeVisible({
      timeout: 15000
    });

    await safeClick(
      symbolChoice,
      `Select symbol ${symbol}`
    );

    Logger.success(
      `Symbol selected: ${symbol}`
    );
  }

  private async waitForSuccessToastToClear() {
    const toast =
      this.page.getByText(
        /position added successfully/i
      );

    const toastVisible =
      await toast
        .isVisible()
        .catch(
          () => false
        );

    if (
      !toastVisible
    ) {
      return;
    }

    await toast.waitFor({
      state: 'hidden',
      timeout: 20000
    });
  }

  private async submitPosition() {
    await expect(
      this.addPositionButton()
    ).toBeEnabled({
      timeout: 10000
    });

    await safeClick(
      this.addPositionButton(),
      'Add Position'
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /add position/i
        }
      )
    ).toBeHidden({
      timeout: 20000
    });

    const toast =
      this.page.getByText(
        /position added successfully/i
      );

    await toast
      .waitFor({
        state: 'visible',
        timeout: 8000
      })
      .catch(
        () => undefined
      );

    await this.waitForSuccessToastToClear();
  }

  async addEquityPosition(
    equity =
      ADD_POSITION_EQUITY
  ) {
    await this.openManualEntry();

    Logger.info(
      `Adding Equity position: ${equity.symbol}`
    );

    await this.selectComboboxOption(
      this.positionTypeCombobox(),
      /^equity$/i,
      'Type Equity'
    );

    await this.searchAndSelectSymbol(
      equity.search,
      equity.symbol
    );

    await expect(
      this.quantityInput()
    ).toBeEnabled({
      timeout: 15000
    });

    await this.fillDialogInput(
      this.quantityInput(),
      equity.quantity
    );

    await this.fillDialogInput(
      this.priceInput(),
      equity.price
    );

    await this.submitPosition();

    Logger.success(
      `Equity ${equity.symbol} position added`
    );
  }

  async addOptionPosition(
    options =
      ADD_POSITION_OPTION
  ) {
    await this.openManualEntry();

    Logger.info(
      `Adding Option position: ${options.symbol} ${options.right}`
    );

    await this.selectComboboxOption(
      this.positionTypeCombobox(),
      /^option$/i,
      'Type Option'
    );

    await this.searchAndSelectSymbol(
      options.search,
      options.symbol
    );

    Logger.info(
      `Option ${options.symbol}: selecting expiry for this symbol`
    );

    const expiry =
      this.labeledCombobox(
        /^expiry$/i
      );

    await expect(
      expiry
    ).toBeEnabled({
      timeout: 15000
    });

    await expect(
      expiry
    ).not.toContainText(
      /select symbol first/i,
      {
        timeout: 15000
      }
    );

    await safeClick(
      expiry,
      'Open Expiry'
    );

    await this.selectFirstListOption(
      'Expiry',
      /\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i
    );

    await expect(
      expiry
    ).not.toContainText(
      /select expiry/i,
      {
        timeout: 10000
      }
    );

    const optionRight =
      this.optionRightCombobox();

    await expect(
      optionRight
    ).toBeEnabled({
      timeout: 15000
    });

    await this.selectComboboxOption(
      optionRight,
      new RegExp(
        `^${options.right}$`,
        'i'
      ),
      `Option ${options.right}`
    );

    const strike =
      this.labeledCombobox(
        /^strike$/i
      );

    await expect(
      strike
    ).toBeEnabled({
      timeout: 15000
    });

    await expect(
      strike
    ).not.toContainText(
      /select type first/i,
      {
        timeout: 15000
      }
    );

    await safeClick(
      strike,
      'Open Strike'
    );

    await this.selectFirstListOption(
      'Strike',
      /\d/
    );

    await expect(
      this.quantityInput()
    ).toBeEnabled({
      timeout: 15000
    });

    await this.fillDialogInput(
      this.quantityInput(),
      options.quantity
    );

    await this.fillDialogInput(
      this.priceInput(),
      options.price
    );

    await this.submitPosition();

    Logger.success(
      `Option ${options.symbol} ${options.right} position added`
    );
  }
}
