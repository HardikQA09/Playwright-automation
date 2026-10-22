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
PAGE OBJECT: RollConfigurationPage

PURPOSE
-------
Opens Beta → Roll Configuration (/dashboard/roll-config). Covers templates,
custom field validation, Save Draft, Save & Activate, and Delete Strategy
(remove from active). Prefixed AIR Roll * strategies are cleaned up safely.
============================================================================= */

const ROLL_PATH_CANDIDATES = [
  '/dashboard/roll-config',
  '/dashboard/roll-configuration',
  '/dashboard/portfolio/roll-configuration',
  '/dashboard/beta/roll-configuration'
];

type RollTemplateKey =
  | 'income'
  | 'tax'
  | 'balanced'
  | 'custom';

type RollTemplateProfile = {
  key: RollTemplateKey;
  label: string;
  match?: RegExp;
  defaultName?: RegExp;
  defaults: Array<{
    placeholder: RegExp;
    value: string;
  }>;
  moneyness?: {
    ccItm: string;
    cspItm: string;
  };
};

const ROLL_FIELD_LABELS = [
  /evaluation start dte/i,
  /urgent dte/i,
  /near-the-money \(ntm\)/i,
  /at-the-money \(atm\)/i,
  /covered calls \(cc\)/i,
  /cash secured puts \(csp\)/i,
  /max roll out horizon/i,
  /min roll forward distance/i,
  /max candidates returned/i,
  /target annualized roi/i,
  /min credit floor per share/i,
  /max debit % of strike gain/i,
  /same-strike min days/i,
  /same-strike max days/i,
  /min open interest/i,
  /min daily volume/i,
  /max bid-ask spread/i,
  /max quote staleness/i
] as const;

const ROLL_MIN_VALIDATION_MESSAGES = [
  /configuration name is required/i,
  /evaluation start dte must be at least 1 day/i,
  /urgent dte must be at least 1 day/i,
  /ntm threshold must be at least 0\.01%/i,
  /atm threshold must be at least 0\.01%/i,
  /max roll out dte must be at least 1 day/i,
  /min roll days must be at least 1 day/i,
  /max results must be at least 1/i,
  /max spread % must be at least 0\.1%/i,
  /max quote age must be at least 1 second/i
] as const;

const ROLL_CLEARABLE_PLACEHOLDERS = [
  /e\.g\. 14/i,
  /e\.g\. 5/i,
  /e\.g\. 3\.0/i,
  /e\.g\. 0\.5/i,
  /e\.g\. 45/i,
  /e\.g\. 7/i,
  /e\.g\. 3$/i,
  /e\.g\. 12/i,
  /e\.g\. 0\.01/i,
  /e\.g\. 100/i,
  /e\.g\. 25/i,
  /e\.g\. 10\.0/i,
  /e\.g\. 300/i
] as const;

const ROLL_TEMPLATE_PROFILES: Record<
  RollTemplateKey,
  RollTemplateProfile
> = {
  income: {
    key: 'income',
    label: 'Income First',
    match: /income first/i,
    defaultName: /my income first strategy/i,
    defaults: [
      {
        placeholder: /e\.g\. 14/i,
        value: '15'
      },
      {
        placeholder: /e\.g\. 5/i,
        value: '5'
      },
      {
        placeholder: /e\.g\. 3\.0/i,
        value: '3'
      },
      {
        placeholder: /e\.g\. 0\.5/i,
        value: '0.5'
      },
      {
        placeholder: /e\.g\. 45/i,
        value: '45'
      },
      {
        placeholder: /e\.g\. 7/i,
        value: '7'
      }
    ],
    moneyness: {
      ccItm: 'CREDIT',
      cspItm: 'CREDIT'
    }
  },
  tax: {
    key: 'tax',
    label: 'Tax-Aware Retention',
    match: /tax-?aware retention/i,
    defaultName: /my tax-?aware retention strategy/i,
    defaults: [
      {
        placeholder: /e\.g\. 14/i,
        value: '28'
      },
      {
        placeholder: /e\.g\. 5/i,
        value: '10'
      },
      {
        placeholder: /e\.g\. 3\.0/i,
        value: '5'
      },
      {
        placeholder: /e\.g\. 0\.5/i,
        value: '1'
      },
      {
        placeholder: /e\.g\. 45/i,
        value: '90'
      },
      {
        placeholder: /e\.g\. 7/i,
        value: '21'
      }
    ],
    moneyness: {
      ccItm: 'BUY_TIME',
      cspItm: 'BUY_TIME'
    }
  },
  balanced: {
    key: 'balanced',
    label: 'Balanced Strategy',
    match: /balanced strategy/i,
    defaultName: /my balanced roll strategy/i,
    defaults: [
      {
        placeholder: /e\.g\. 14/i,
        value: '18'
      },
      {
        placeholder: /e\.g\. 5/i,
        value: '3'
      },
      {
        placeholder: /e\.g\. 3\.0/i,
        value: '3.5'
      },
      {
        placeholder: /e\.g\. 0\.5/i,
        value: '0.72'
      },
      {
        placeholder: /e\.g\. 45/i,
        value: '60'
      },
      {
        placeholder: /e\.g\. 7/i,
        value: '8'
      }
    ],
    moneyness: {
      ccItm: 'CREDIT',
      cspItm: 'CREDIT'
    }
  },
  custom: {
    key: 'custom',
    label: 'My Custom Strategy',
    defaults: [
      {
        placeholder: /e\.g\. 14/i,
        value: ''
      },
      {
        placeholder: /e\.g\. 5/i,
        value: ''
      },
      {
        placeholder: /e\.g\. 3\.0/i,
        value: ''
      },
      {
        placeholder: /e\.g\. 0\.5/i,
        value: ''
      },
      {
        placeholder: /e\.g\. 45/i,
        value: ''
      },
      {
        placeholder: /e\.g\. 7/i,
        value: ''
      }
    ]
  }
};

export class RollConfigurationPage {
  constructor(
    private readonly page: Page
  ) {}

  private rollMenuItem() {
    return this.page
      .getByRole(
        'menuitem',
        {
          name: /roll configuration/i
        }
      )
      .or(
        this.page.getByRole(
          'link',
          {
            name: /roll configuration/i
          }
        )
      )
      .or(
        this.page.locator(
          '[role="menu"] a, [data-radix-menu-content] a, [data-state="open"] a, [data-state="open"] button, nav a'
        ).filter({
          hasText: /roll configuration/i
        })
      )
      .first();
  }

  async openFromPortfolioMenu() {
    Logger.info(
      'Opening Roll Configuration from nav'
    );

    const menus = [
      /^portfolio$/i,
      /^beta$/i
    ] as const;

    let openedViaMenu = false;
    let href: string | null = null;

    for (const menu of menus) {
      try {
        await openHeaderMenu(
          this.page,
          menu
        );

        const item =
          this.rollMenuItem();

        const visible =
          await item.waitFor({
            state: 'visible',
            timeout: 4000
          }).then(
            () => true
          ).catch(
            () => false
          );

        if (!visible) {
          await this.page.keyboard.press(
            'Escape'
          ).catch(
            () => undefined
          );
          continue;
        }

        href =
          await item.getAttribute(
            'href'
          ).catch(
            () => null
          );

        Logger.info(
          `Roll Configuration under ${menu} href=${href ?? '(none)'}`
        );

        if (
          href &&
          !href.startsWith(
            '#'
          ) &&
          !href.startsWith(
            'javascript:'
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
            'Roll Configuration'
          );
        }

        openedViaMenu = true;
        break;
      } catch {
        await this.page.keyboard.press(
          'Escape'
        ).catch(
          () => undefined
        );
      }
    }

    if (!openedViaMenu) {
      Logger.info(
        'Roll Configuration menu item not found; trying known routes'
      );

      let opened = false;

      for (const path of ROLL_PATH_CANDIDATES) {
        await this.page.goto(
          `${BASE_URL}${path}`,
          {
            waitUntil: 'domcontentloaded'
          }
        );

        const is404 =
          await this.page.getByRole(
            'heading',
            {
              name: /^404$/i
            }
          ).or(
            this.page.getByText(
              /page not found/i
            )
          ).first().isVisible({
            timeout: 1500
          }).catch(
            () => false
          );

        if (!is404) {
          opened = true;
          Logger.info(
            `Opened Roll Configuration via ${path}`
          );
          break;
        }
      }

      if (!opened) {
        throw new Error(
          'Roll Configuration is not available under Portfolio/Beta for this account, and known routes returned 404.'
        );
      }
    }

    Logger.info(
      `After Roll Configuration open: ${this.page.url()}`
    );

    if (
      await this.page.getByRole(
        'heading',
        {
          name: /^404$/i
        }
      ).or(
        this.page.getByText(
          /page not found/i
        )
      ).first().isVisible({
        timeout: 2000
      }).catch(
        () => false
      )
    ) {
      throw new Error(
        `Roll Configuration landed on 404 (href=${href}, url=${this.page.url()}).`
      );
    }

    await this.validateLoaded();
  }

  async validateLoaded() {
    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /roll configuration/i
        }
      ).or(
        this.page.getByText(
          /institutional engine/i
        )
      ).first()
    ).toBeVisible({
      timeout: 20000
    });

    await expect(
      this.page.locator(
        'body'
      )
    ).not.toContainText(
      /page not found|^404$/i
    );

    await expect(
      this.page.locator(
        'main'
      ).or(
        this.page.locator(
          'body'
        )
      ).first()
    ).toContainText(
      /institutional engine|roll-forward|roll strategy|income first|choose your first roll|my roll strategies/i
    );

    Logger.success(
      'Roll Configuration is open'
    );
  }

  private main() {
    return this.page.locator(
      'main'
    );
  }

  private nameInput() {
    return this.page.getByPlaceholder(
      /custom growth strategy|configuration name|e\.g\. my/i
    ).or(
      this.page.getByRole(
        'textbox'
      ).first()
    ).first();
  }

  async openCreateFlow() {
    Logger.info(
      'Opening Create New Strategy'
    );

    const create =
      this.main().getByRole(
        'button',
        {
          name: /create new strategy|create custom from scratch/i
        }
      ).first();

    await safeClick(
      create,
      'Create New Strategy'
    );

    await expect(
      this.main()
    ).toContainText(
      /select a strategy benchmark|income first|tax-?aware|balanced strategy|my custom strategy/i,
      {
        timeout: 15000
      }
    );
  }

  async backToStrategies() {
    const back =
      this.main().getByRole(
        'button',
        {
          name: /back to strategies/i
        }
      ).first();

    if (
      await back.isVisible().catch(
        () => false
      )
    ) {
      await safeClick(
        back,
        'Back to Strategies'
      );
    }

    await expect(
      this.main()
    ).toContainText(
      /my roll strategies|choose your first roll strategy|create new strategy|create custom from scratch/i,
      {
        timeout: 15000
      }
    );
  }

  async validateBenchmarkTemplates() {
    Logger.info(
      'Validating roll benchmark templates'
    );

    await this.openCreateFlow();

    for (const template of [
      {
        name: /income first/i,
        detail: /high cash flow|shorter dte|credit income/i
      },
      {
        name: /tax-?aware retention/i,
        detail: /capital gains|assignment|defer/i
      },
      {
        name: /balanced strategy/i,
        detail: /income \+ defense|credit capture|strike/i
      },
      {
        name: /my custom strategy/i,
        detail: /customizable|personalized|from scratch/i
      }
    ]) {
      await expect(
        this.main().getByText(
          template.name
        ).first()
      ).toBeVisible();

      await expect(
        this.main()
      ).toContainText(
        template.detail
      );
    }

    await expect(
      this.main().getByRole(
        'button',
        {
          name: /clone to edit/i
        }
      ).first()
    ).toBeVisible();

    await expect(
      this.main().getByRole(
        'button',
        {
          name: /save draft/i
        }
      )
    ).toBeVisible();

    await expect(
      this.main().getByRole(
        'button',
        {
          name: /save & activate/i
        }
      )
    ).toBeVisible();

    await this.backToStrategies();

    Logger.success(
      'Benchmark templates are shown'
    );
  }

  async openCustomTemplate() {
    Logger.info(
      'Opening My Custom Strategy template'
    );

    await this.openCreateFlow();

    const custom =
      this.main().getByText(
        /^my custom strategy$/i
      ).or(
        this.main().getByText(
          /my custom strategy/i
        )
      ).first();

    if (
      await custom.isVisible().catch(
        () => false
      )
    ) {
      await custom.click();
    }

    await expect(
      this.nameInput()
    ).toBeVisible({
      timeout: 10000
    });
  }

  private async assertTemplateDefaults(
    profile: RollTemplateProfile
  ) {
    await expect(
      this.main()
    ).toContainText(
      /profile & moneyness|evaluation start dte|covered calls|cash secured puts/i
    );

    for (const label of ROLL_FIELD_LABELS) {
      await expect(
        this.main()
      ).toContainText(
        label
      );
    }

    if (
      profile.defaultName
    ) {
      await expect(
        this.nameInput()
      ).toHaveValue(
        profile.defaultName
      );
    } else if (
      profile.key === 'custom'
    ) {
      await expect(
        this.nameInput()
      ).toHaveValue(
        ''
      );
    }

    for (const field of profile.defaults) {
      const input =
        this.page.getByPlaceholder(
          field.placeholder
        ).first();

      await expect(
        input
      ).toBeVisible();

      await expect(
        input
      ).toHaveValue(
        field.value
      );
    }

    if (
      profile.moneyness
    ) {
      const selects =
        this.main().locator(
          'select'
        );

      // CC ITM, CC NTM, CSP ITM, CSP NTM — assert ITM defaults per template.
      await expect(
        selects.nth(
          0
        )
      ).toHaveValue(
        profile.moneyness.ccItm
      );
      await expect(
        selects.nth(
          2
        )
      ).toHaveValue(
        profile.moneyness.cspItm
      );
    }
  }

  private async clearRollNumericFields() {
    for (const placeholder of ROLL_CLEARABLE_PLACEHOLDERS) {
      const fields =
        this.page.getByPlaceholder(
          placeholder
        );
      const count =
        await fields.count();

      for (
        let i = 0;
        i < count;
        i++
      ) {
        const field =
          fields.nth(
            i
          );

        if (
          await field.isVisible().catch(
            () => false
          )
        ) {
          await field.fill(
            ''
          );
        }
      }
    }
  }

  private async expectMinFieldValidations() {
    await expect(
      this.main()
    ).toContainText(
      /configuration name is required/i,
      {
        timeout: 10000
      }
    );

    for (const message of ROLL_MIN_VALIDATION_MESSAGES) {
      await expect(
        this.main()
      ).toContainText(
        message
      );
    }
  }

  async validateTemplateFieldLevel(
    templateKey: RollTemplateKey
  ) {
    const profile =
      ROLL_TEMPLATE_PROFILES[
        templateKey
      ];

    Logger.info(
      `Validating ${profile.label} field-level defaults and min rules`
    );

    if (
      profile.key === 'custom'
    ) {
      await this.openCustomTemplate();
    } else {
      await this.cloneTemplate(
        profile.match!
      );
    }

    await this.assertTemplateDefaults(
      profile
    );

    await this.nameInput().fill(
      ''
    );
    await this.clearRollNumericFields();

    await safeClick(
      this.main().getByRole(
        'button',
        {
          name: /save draft/i
        }
      ),
      `Save Draft (${profile.label} expect field validation)`
    );

    await this.expectMinFieldValidations();

    // Named draft with zeroed core DTE/NTM fields still blocks save per-field.
    await this.nameInput().fill(
      `AIR Roll Val ${profile.key}`
    );

    for (const zero of [
      {
        placeholder: /e\.g\. 14/i,
        value: '0'
      },
      {
        placeholder: /e\.g\. 5/i,
        value: '0'
      },
      {
        placeholder: /e\.g\. 3\.0/i,
        value: '0'
      },
      {
        placeholder: /e\.g\. 0\.5/i,
        value: '0'
      }
    ]) {
      const field =
        this.page.getByPlaceholder(
          zero.placeholder
        ).first();

      if (
        await field.isVisible().catch(
          () => false
        )
      ) {
        await field.fill(
          zero.value
        );
      }
    }

    await safeClick(
      this.main().getByRole(
        'button',
        {
          name: /save draft/i
        }
      ),
      `Save Draft (${profile.label} zeroed core fields)`
    );

    await expect(
      this.main()
    ).toContainText(
      /evaluation start dte must be at least 1 day/i
    );
    await expect(
      this.main()
    ).toContainText(
      /urgent dte must be at least 1 day/i
    );
    await expect(
      this.main()
    ).toContainText(
      /ntm threshold must be at least 0\.01%/i
    );
    await expect(
      this.main()
    ).toContainText(
      /atm threshold must be at least 0\.01%/i
    );

    await expect(
      this.main().getByRole(
        'button',
        {
          name: /back to strategies/i
        }
      )
    ).toBeVisible();

    await this.backToStrategies();

    Logger.success(
      `${profile.label} field-level validation is shown`
    );
  }

  async validateRequiredFieldsOnSave() {
    await this.validateTemplateFieldLevel(
      'custom'
    );
  }

  async cloneTemplate(
    template: RegExp
  ) {
    Logger.info(
      `Cloning template ${template}`
    );

    await this.openCreateFlow();

    // Cards share a parent region; pick Clone by known benchmark order.
    const cloneIndex =
      /income/i.test(
        template.source
      )
        ? 0
        : /tax/i.test(
          template.source
        )
          ? 1
          : /balanced/i.test(
            template.source
          )
            ? 2
            : 0;

    await safeClick(
      this.main().getByRole(
        'button',
        {
          name: /clone to edit/i
        }
      ).nth(
        cloneIndex
      ),
      `Clone to Edit ${template}`
    );

    await expect(
      this.nameInput()
    ).not.toHaveValue(
      '',
      {
        timeout: 10000
      }
    );
  }

  async setConfigurationName(
    name: string
  ) {
    const input =
      this.nameInput();

    await input.fill(
      name
    );

    await expect(
      input
    ).toHaveValue(
      name
    );
  }

  async saveDraft() {
    await safeClick(
      this.main().getByRole(
        'button',
        {
          name: /save draft/i
        }
      ),
      'Save Draft'
    );

    await this.main().getByRole(
      'button',
      {
        name: /back to strategies/i
      }
    ).waitFor({
      state: 'hidden',
      timeout: 15000
    }).catch(
      async () => {
        await this.backToStrategies();
      }
    );

    await expect(
      this.main()
    ).toContainText(
      /my roll strategies|create new strategy/i,
      {
        timeout: 20000
      }
    );
  }

  async saveAndActivate() {
    await safeClick(
      this.main().getByRole(
        'button',
        {
          name: /save & activate/i
        }
      ),
      'Save & Activate'
    );

    await this.main().getByRole(
      'button',
      {
        name: /back to strategies/i
      }
    ).waitFor({
      state: 'hidden',
      timeout: 20000
    }).catch(
      async () => {
        await this.backToStrategies();
      }
    );

    await expect(
      this.main()
    ).toContainText(
      /my roll strategies|active/i,
      {
        timeout: 20000
      }
    );
  }

  strategyRow(
    name: string | RegExp
  ) {
    const pattern =
      typeof name === 'string'
        ? new RegExp(
          name.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
          ),
          'i'
        )
        : name;

    return this.main()
      .getByRole(
        'row'
      )
      .filter({
        hasText: pattern
      })
      .or(
        this.main().locator(
          'tbody tr, [role="row"]'
        ).filter({
          hasText: pattern
        })
      )
      .first();
  }

  async expectStrategyListed(
    name: string,
    status?: RegExp
  ) {
    const row =
      this.strategyRow(
        name
      );

    await expect(
      row
    ).toBeVisible({
      timeout: 20000
    });

    if (
      status
    ) {
      await expect(
        row
      ).toContainText(
        status
      );
    }
  }

  async openStrategyActions(
    name: string
  ) {
    const row =
      this.strategyRow(
        name
      );

    await expect(
      row
    ).toBeVisible({
      timeout: 15000
    });

    await safeClick(
      row.getByRole(
        'button',
        {
          name: /actions/i
        }
      ).or(
        row.locator(
          'button[title="Actions"]'
        )
      ).first(),
      `Actions ${name}`
    );
  }

  private async clickDeleteMenuitem(
    label: string
  ) {
    const deleteItem =
      this.page.getByRole(
        'menuitem',
        {
          name: /delete strategy/i
        }
      );

    const visible =
      await deleteItem.waitFor({
        state: 'visible',
        timeout: 3000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (!visible) {
      return false;
    }

    await safeClick(
      deleteItem,
      `Delete ${label}`
    );

    const confirm =
      this.page.getByRole(
        'button',
        {
          name: /^delete$|confirm|yes|remove/i
        }
      ).last();

    if (
      await confirm.waitFor({
        state: 'visible',
        timeout: 5000
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

    return true;
  }

  async activateExistingStrategy(
    name: string | RegExp
  ) {
    Logger.info(
      `Activating existing strategy ${name}`
    );

    const row =
      this.strategyRow(
        name
      );

    await expect(
      row
    ).toBeVisible({
      timeout: 15000
    });

    await safeClick(
      row.getByRole(
        'button',
        {
          name: /actions/i
        }
      ).or(
        row.locator(
          'button[title="Actions"]'
        )
      ).first(),
      `Actions ${name}`
    );

    const activateItem =
      this.page.getByRole(
        'menuitem',
        {
          name: /activate/i
        }
      );

    if (
      await activateItem.waitFor({
        state: 'visible',
        timeout: 2500
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      await safeClick(
        activateItem,
        `Activate ${name}`
      );
      await expect(
        row
      ).toContainText(
        /active/i,
        {
          timeout: 20000
        }
      );
      return;
    }

    await safeClick(
      this.page.getByRole(
        'menuitem',
        {
          name: /configure/i
        }
      ),
      `Configure ${name}`
    );

    await this.saveAndActivate();
  }

  async demoteActiveStrategy(
    name: string
  ) {
    Logger.info(
      `Removing ${name} from active by activating another strategy`
    );

    await this.page.keyboard.press(
      'Escape'
    ).catch(
      () => undefined
    );

    // Active Live cannot be deleted; activate a different profile first.
    const fallback =
      this.main()
        .getByRole(
          'row'
        )
        .filter({
          hasText: /inactive|draft/i
        })
        .filter({
          hasNotText: name
        })
        .first();

    if (
      await fallback.waitFor({
        state: 'visible',
        timeout: 5000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      const fallbackLabel =
        (
          await fallback.innerText()
        ).split(
          '\n'
        ).map(
          (line) =>
            line.trim()
        ).find(
          (line) =>
            line.length > 0 &&
            !/active|inactive|draft|custom strategy|actions/i.test(
              line
            )
        ) ||
        'MY stretegy';

      await this.page.keyboard.press(
        'Escape'
      ).catch(
        () => undefined
      );

      await this.activateExistingStrategy(
        fallbackLabel
      );
    } else {
      // No other profile — Save Draft may keep engine active; still try.
      await this.openStrategyActions(
        name
      );

      await safeClick(
        this.page.getByRole(
          'menuitem',
          {
            name: /configure/i
          }
        ),
        `Configure ${name}`
      );

      await this.saveDraft();
    }

    await this.expectStrategyListed(
      name,
      /inactive|draft/i
    ).catch(
      () => undefined
    );
  }

  async deleteStrategy(
    name: string
  ) {
    Logger.info(
      `Deleting strategy ${name}`
    );

    await this.openStrategyActions(
      name
    );

    let deleted =
      await this.clickDeleteMenuitem(
        name
      );

    if (!deleted) {
      // Active Live rows only expose Configure / Clone — demote first.
      await this.page.keyboard.press(
        'Escape'
      ).catch(
        () => undefined
      );

      await this.demoteActiveStrategy(
        name
      );

      await this.openStrategyActions(
        name
      );

      deleted =
        await this.clickDeleteMenuitem(
          name
        );
    }

    if (!deleted) {
      throw new Error(
        `Could not delete strategy ${name} (Delete Strategy unavailable after demote).`
      );
    }

    await expect(
      this.strategyRow(
        name
      )
    ).toHaveCount(
      0,
      {
        timeout: 20000
      }
    ).catch(
      async () => {
        await expect(
          this.main()
        ).not.toContainText(
          name,
          {
            timeout: 10000
          }
        );
      }
    );

    Logger.success(
      `Deleted strategy ${name}`
    );
  }

  async cleanupAirStrategies() {
    Logger.info(
      'Cleaning leftover AIR Roll strategies'
    );

    for (
      let attempt = 0;
      attempt < 8;
      attempt += 1
    ) {
      const row =
        this.strategyRow(
          /AIR Roll /i
        );

      if (
        !await row.waitFor({
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

      const labelMatch =
        (
          await row.innerText()
        ).match(
          /AIR Roll [A-Za-z]+ \d+/i
        );

      const label =
        labelMatch?.[0] ||
        'AIR Roll';

      await this.deleteStrategy(
        label
      );
    }
  }

  async createDraftFromTemplate(
    template: RegExp,
    name: string
  ) {
    await this.cloneTemplate(
      template
    );
    await this.setConfigurationName(
      name
    );
    await this.saveDraft();
    await this.expectStrategyListed(
      name,
      /draft|inactive/i
    );
  }

  async activateFromTemplate(
    template: RegExp,
    name: string
  ) {
    await this.cloneTemplate(
      template
    );
    await this.setConfigurationName(
      name
    );
    await this.saveAndActivate();
    await this.expectStrategyListed(
      name,
      /active/i
    );
  }

  async validateStrategyPresets() {
    Logger.info(
      'Validating roll strategy surface'
    );

    const main =
      this.page.locator(
        'main'
      );

    const hasGettingStarted =
      await main.getByText(
        /choose your first roll strategy|getting started/i
      ).first().isVisible({
        timeout: 3000
      }).catch(
        () => false
      );

    if (
      hasGettingStarted
    ) {
      await expect(
        main
      ).toContainText(
        /create custom from scratch|activate strategy/i
      );

      for (const preset of [
        {
          name: /income first/i,
          detail: /high cash flow|14 dte|net credit/i
        },
        {
          name: /tax-?aware retention/i,
          detail: /capital gains|assignment avoidance|28 dte/i
        },
        {
          name: /balanced strategy/i,
          detail: /income \+ defense|gold-standard|14 dte/i
        }
      ]) {
        await expect(
          main.getByText(
            preset.name
          ).first()
        ).toBeVisible({
          timeout: 15000
        });

        await expect(
          main
        ).toContainText(
          preset.detail
        );
      }

      await expect(
        main.getByRole(
          'button',
          {
            name: /activate strategy|view details|inspect & customize|create custom/i
          }
        ).first()
      ).toBeVisible();

      Logger.success(
        'Roll strategy presets are shown'
      );
      return;
    }

    // Account already has strategies — validate managed list instead of empty presets.
    await expect(
      main
    ).toContainText(
      /my roll strategies|total strategy profiles|create new strategy/i
    );

    await expect(
      main.getByRole(
        'button',
        {
          name: /create new strategy|documentation/i
        }
      ).first()
    ).toBeVisible();

    for (const column of [
      'Strategy Name',
      'Template Model',
      'Status',
      'Actions'
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

    await expect(
      main
    ).toContainText(
      /draft|active|inactive|custom strategy/i
    );

    Logger.success(
      'Roll strategy list is shown'
    );
  }

  async openDocumentationAndClose() {
    const docs =
      this.page.getByRole(
        'button',
        {
          name: /documentation|& guide/i
        }
      ).or(
        this.page.getByRole(
          'link',
          {
            name: /documentation|& guide/i
          }
        )
      ).first();

    if (
      !await docs.waitFor({
        state: 'visible',
        timeout: 5000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      return;
    }

    await safeClick(
      docs,
      'Documentation & Guide'
    );

    const panel =
      this.page.getByRole(
        'dialog'
      ).or(
        this.page.getByRole(
          'heading',
          {
            name: /documentation|guide|roll/i
          }
        )
      ).first();

    await expect(
      panel
    ).toBeVisible({
      timeout: 10000
    }).catch(
      () => undefined
    );

    await this.page.keyboard.press(
      'Escape'
    ).catch(
      () => undefined
    );

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /^roll configuration$/i
        }
      )
    ).toBeVisible();
  }

  async openIncomeFirstDetailsAndClose() {
    const card =
      this.page.locator(
        'main'
      ).locator(
        'div, article, section'
      ).filter({
        hasText: /income first/i
      }).filter({
        has: this.page.getByRole(
          'button',
          {
            name: /view details|activate strategy/i
          }
        )
      }).first();

    const viewDetails =
      card.getByRole(
        'button',
        {
          name: /view details/i
        }
      ).or(
        card.getByRole(
          'link',
          {
            name: /view details/i
          }
        )
      ).first();

    if (
      !await viewDetails.waitFor({
        state: 'visible',
        timeout: 5000
      }).then(
        () => true
      ).catch(
        () => false
      )
    ) {
      return;
    }

    await safeClick(
      viewDetails,
      'View Details — Income First'
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
      /income first|eval trigger|ntm|credit|dte/i,
      {
        timeout: 10000
      }
    );

    await this.page.keyboard.press(
      'Escape'
    ).catch(
      () => undefined
    );

    const close =
      this.page.getByRole(
        'button',
        {
          name: /^close$/i
        }
      ).first();

    if (
      await close.isVisible().catch(
        () => false
      )
    ) {
      await safeClick(
        close,
        'Close details'
      );
    }

    await expect(
      this.page.getByRole(
        'heading',
        {
          name: /^roll configuration$/i
        }
      )
    ).toBeVisible();
  }
}
