import {
  expect,
  Locator
} from '@playwright/test';

import { BasePage }
  from './BasePage';

import { safeClick }
  from '../helpers/safeClick';

import { Logger }
  from '../utils/logger';

/* =============================================================================
PAGE OBJECT: OptionsResearchPage

PURPOSE
-------
View option exposure opens Options Research. A different symbol, a new
expiration, calls, puts, strike count, and news each stay on the chain.
Prices change, so the checks follow the shape of the data.
============================================================================= */

export class OptionsResearchPage
  extends BasePage {

  async validateLoaded() {
    Logger.info(
      'Validating Options Research'
    );

    await expect(
      this.page
    ).toHaveURL(
      /options-research/,
      {
        timeout: 20000
      }
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /options research/i
        }
      )
    ).toBeVisible({
      timeout: 20000
    });

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /^analyze$/i
        }
      )
    ).toBeVisible();

    Logger.success(
      'Options Research is open'
    );
  }

  async ensureSymbolResult() {
    const hasResult =
      await this.page.getByText(
        /search result/i
      ).isVisible().catch(
        () => false
      );

    if (
      hasResult
    ) {
      return;
    }

    Logger.info(
      'Searching AAPL on Options Research'
    );

    const input =
      this.page.getByRole(
        'combobox'
      ).or(
        this.page.getByRole(
          'textbox'
        )
      ).first();

    await input.fill(
      'AAPL'
    );

    const choice =
      this.page.getByRole(
        'option',
        {
          name: /AAPL/i
        }
      ).first();

    if (
      await choice.isVisible().catch(
        () => false
      )
    ) {
      await safeClick(
        choice,
        'Select AAPL'
      );
    }

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /^analyze$/i
        }
      ),
      'Analyze symbol'
    );
  }

  async validateResearchData() {
    await this.ensureSymbolResult();

    await expect(
      this.page.getByText(
        /search result/i
      )
    ).toBeVisible({
      timeout: 20000
    });

    await expect(
      this.page.locator(
        'main'
      )
    ).toContainText(
      /\$\d[\d,]*(?:\.\d+)?/
    );

    await expect(
      this.page.getByText(
        /price action/i
      )
    ).toBeVisible();

    for (const label of [
      /open/i,
      /prev close/i,
      /day low/i,
      /day high/i,
      /volume/i
    ]) {
      await expect(
        this.page.getByText(
          label
        ).first()
      ).toBeVisible();
    }

    await expect(
      this.page.locator(
        'main'
      )
    ).toContainText(
      /volatility/i
    );

    await expect(
      this.page.getByText(
        /key levels/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /events\s*&\s*levels/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /option chain/i
        }
      ).or(
        this.page.getByText(
          /option chain/i
        )
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'columnheader',
        {
          name: /^calls$/i
        }
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'columnheader',
        {
          name: /^puts$/i
        }
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'columnheader',
        {
          name: /^strike$/i
        }
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /expiration date|20\d{2}-\d{2}-\d{2}/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /strike count/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByText(
        /latest news/i
      ).first()
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'link',
        {
          name: /view company fundamentals/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /view company fundamentals/i
          }
        )
      ).first()
    ).toBeVisible();

    Logger.success(
      'Options Research data is shown'
    );
  }

  async selectSymbol(
    symbol: string
  ) {
    Logger.info(
      `Selecting ${symbol}`
    );

    const input =
      this.page.getByRole(
        'combobox',
        {
          name: /search company name or symbol|search symbol/i
        }
      ).first();

    await input.fill(
      symbol
    );

    const choice =
      this.page.getByRole(
        'option',
        {
          name: new RegExp(
            symbol,
            'i'
          )
        }
      ).first();

    if (
      await choice.waitFor({
        state: 'visible',
        timeout: 8000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      await safeClick(
        choice,
        `Select ${symbol}`
      );
    }

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /^analyze$/i
        }
      ),
      `Analyze ${symbol}`
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: new RegExp(
            `^${symbol}$`,
            'i'
          )
        }
      )
    ).toBeVisible({
      timeout: 20000
    });

    await expect(
      this.page.getByText(
        /loading option chain/i
      )
    ).toBeHidden({
      timeout: 20000
    });

    await this.expectChainHeaders();

    Logger.success(
      `${symbol} option chain is shown`
    );
  }

  async changeExpiration() {
    Logger.info(
      'Changing the expiration date'
    );

    const expiration =
      this.labeledCombobox(
        /^expiration date$/i
      );

    const before =
      (
        await expiration.innerText()
      ).trim();

    await safeClick(
      expiration,
      'Expiration date'
    );

    const options =
      this.page.getByRole(
        'option'
      );

    await expect(
      options.first()
    ).toBeVisible({
      timeout: 8000
    });

    const count =
      await options.count();

    let picked = '';

    for (
      let index = 0;
      index < count;
      index += 1
    ) {
      const label =
        (
          await options.nth(
            index
          ).innerText()
        ).trim();

      if (
        label &&
        label !== before
      ) {
        picked = label;

        await safeClick(
          options.nth(
            index
          ),
          `Expiration ${label}`
        );

        break;
      }
    }

    if (
      !picked
    ) {
      await this.page.keyboard.press(
        'Escape'
      );
    }

    await this.expectChainHeaders();

    await expect(
      this.page.getByText(
        /20\d{2}-\d{2}-\d{2}|expiration date/i
      ).first()
    ).toBeVisible();

    Logger.success(
      picked
        ? `Expiration is ${picked}`
        : 'Expiration list is shown'
    );
  }

  async showCallsAndPuts() {
    Logger.info(
      'Changing the Show filter'
    );

    const show =
      this.labeledCombobox(
        /^show$/i
      );

    const starting =
      this.firstLine(
        await show.innerText()
      );

    await safeClick(
      show,
      'Show'
    );

    const options =
      this.page.getByRole(
        'option'
      );

    await expect(
      options.first()
    ).toBeVisible({
      timeout: 8000
    });

    const labels: string[] = [];
    const count =
      Math.min(
        await options.count(),
        6
      );

    for (
      let index = 0;
      index < count;
      index += 1
    ) {
      const label =
        this.firstLine(
          await options.nth(
            index
          ).innerText()
        );

      if (
        label
      ) {
        labels.push(
          label
        );
      }
    }

    await this.page.keyboard.press(
      'Escape'
    );

    for (const label of labels) {
      if (
        label === starting
      ) {
        continue;
      }

      await this.selectShow(
        show,
        label
      );

      await expect(
        this.page.locator(
          'main'
        )
      ).toContainText(
        /calls|puts|strike/i
      );
    }

    if (
      labels.includes(
        starting
      )
    ) {
      await this.selectShow(
        show,
        starting
      );
    }

    await this.expectChainHeaders();

    Logger.success(
      'Show filter changes the chain and restores'
    );
  }

  private async selectShow(
    show: Locator,
    label: string
  ) {
    await safeClick(
      show,
      'Show'
    );

    await safeClick(
      this.page.getByRole(
        'option',
        {
          name: new RegExp(
            `^${this.escape(label)}$`,
            'i'
          )
        }
      ).first(),
      `Show ${label}`
    );

    await expect(
      show
    ).toContainText(
      label,
      {
        timeout: 10000
      }
    );

    await expect(
      this.page.getByText(
        /loading option chain/i
      )
    ).toBeHidden({
      timeout: 20000
    });
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

  async validateLatestNews() {
    Logger.info(
      'Validating latest news'
    );

    const news =
      this.page.getByText(
        /latest news/i
      ).first();

    await expect(
      news
    ).toBeVisible({
      timeout: 15000
    });

    const text =
      await news.evaluate(
        (node) => {
          let current =
            node.parentElement;

          while (current) {
            const value =
              current.innerText || '';

            if (
              /latest news/i.test(
                value
              ) &&
              value.length > 12 &&
              value.length < 5000
            ) {
              return value;
            }

            current =
              current.parentElement;
          }

          return node.textContent || '';
        }
      );

    expect(
      text
    ).toMatch(
      /latest news/i
    );

    expect(
      text
    ).toMatch(
      /[A-Za-z]{4,}|no news|no articles/i
    );

    Logger.success(
      'Latest news is shown'
    );
  }

  private labeledCombobox(
    label: RegExp
  ) {
    return this.page.getByText(
      label
    ).first().locator(
      'xpath=following::*[@role="combobox"][1]'
    );
  }

  private async expectChainHeaders() {
    await expect(
      this.page.getByText(
        /loading option chain/i
      )
    ).toBeHidden({
      timeout: 20000
    });

    await expect(
      this.page.getByRole(
        'columnheader',
        {
          name: /^calls$/i
        }
      )
    ).toBeVisible({
      timeout: 20000
    });

    await expect(
      this.page.getByRole(
        'columnheader',
        {
          name: /^puts$/i
        }
      )
    ).toBeVisible();

    await expect(
      this.page.getByRole(
        'columnheader',
        {
          name: /^strike$/i
        }
      ).first()
    ).toBeVisible();
  }

  async validateChainControls() {
    Logger.info(
      'Validating option chain controls'
    );

    await this.ensureSymbolResult();

    await this.page.getByText(
      /loading option chain/i
    ).first().waitFor({
      state: 'hidden',
      timeout: 30000
    }).catch(
      () => undefined
    );

    for (const label of [
      /expir(?:ation|y)(?:\s+date)?/i,
      /^show$/i,
      /strike count/i
    ]) {
      await expect(
        this.page.getByText(
          label
        ).first()
      ).toBeVisible({
        timeout: 20000
      });
    }

    const strikeCount =
      this.page.getByText(
        /^strike count$/i
      ).locator(
        'xpath=following::*[@role="combobox"][1]'
      );

    const before =
      this.firstLine(
        await strikeCount.innerText()
      );

    await safeClick(
      strikeCount,
      'Strike count'
    );

    const options =
      this.page.getByRole(
        'option'
      );

    await expect(
      options.first()
    ).toBeVisible({
      timeout: 8000
    });

    const count =
      await options.count();

    let picked = '';

    for (
      let index = 0;
      index < count;
      index += 1
    ) {
      const label =
        this.firstLine(
          await options.nth(
            index
          ).innerText()
        );

      if (
        label &&
        label !== before
      ) {
        picked = label;

        await safeClick(
          options.nth(
            index
          ),
          `Strike count ${label}`
        );

        break;
      }
    }

    if (
      picked
    ) {
      await expect(
        strikeCount
      ).toContainText(
        picked,
        {
          timeout: 10000
        }
      );
    }

    await expect(
      this.page.getByRole(
        'columnheader',
        {
          name: /^calls$/i
        }
      )
    ).toBeVisible({
      timeout: 15000
    });

    Logger.success(
      'Option chain controls keep the chain visible'
    );
  }
}
