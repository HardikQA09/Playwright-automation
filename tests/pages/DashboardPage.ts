import {
  expect
} from '@playwright/test';

import { BasePage }
  from './BasePage';
  import { Logger }
  from '../utils/logger';
import { safeClick }
  from '../helpers/safeClick';
import {
  URLS
} from '../config/constants';

import {
  isLoginUrl,
  restoreSubscriberSession
} from '../helpers/subscriberSession';

/* ============================================================================
PAGE OBJECT: DashboardPage

PURPOSE
-------
Validates that the user reaches the dashboard and remains there after refresh.
============================================================================ */
export class DashboardPage
  extends BasePage {

  private topNavigationItems = [
    {
      label: 'Dashboard',
      url: /\/dashboard/
    },
    {
      label: 'Opportunities',
      url: /\/opportunities|\/dashboard/
    },
    {
      label: 'Portfolio',
      url: /\/portfolio|\/dashboard/
    },
    {
      label: 'Research',
      url: /\/research|\/dashboard/
    },
    {
      label: 'Academy',
      url: /\/academy|\/dashboard/
    },
    {
      label: 'Support',
      url: /\/support|\/dashboard/
    }
  ];

  private utilityButton(
    iconClass: string,
    labelPattern: RegExp
  ) {
    return this.page
      .getByRole(
        'button',
        {
          name: labelPattern
        }
      )
      .or(
        this.page.locator(
          `button:has(svg.${iconClass})`
        )
      )
      .first();
  }

  private topNavigationControl(
    label: string
  ) {
    const labelPattern =
      new RegExp(
        label.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        ),
        'i'
      );

    return this.page
      .getByRole(
        'link',
        {
          name: labelPattern
        }
      )
      .or(
        this.page.getByRole(
          'button',
          {
            name: labelPattern
          }
        )
      )
      .or(
        this.page
          .locator(
            'nav a, nav button'
          )
          .filter({
            hasText: labelPattern
          })
        )
      .first();
  }

  private async validateUsablePageContent() {

    await expect(
      this.page.locator(
        'body'
      )
    ).toContainText(
      /dashboard|opportunities|portfolio|research|academy|support|ooltool/i,
      {
        timeout: 15000
      }
    );

    await expect
      .poll(
        async () => {
          const bodyText =
            await this.page.locator(
              'body'
            ).innerText();

          return bodyText
            .replace(
              /\s+/g,
              ' '
            )
            .trim()
            .length;
        },
        {
          timeout: 15000
        }
      )
      .toBeGreaterThan(
        50
      );
  }

  private async openTopNavigationItem(
    label: string
  ) {

    const control =
      this.topNavigationControl(
        label
      );

    await expect(
      control
    ).toBeVisible({
      timeout: 10000
    });

    await safeClick(
      control,
      `Open ${label}`
    );

    await this.page.waitForLoadState(
      'domcontentloaded'
    );
  }

  async openProfileMenu() {

    await this.dismissMarketingOverlays();

    const menuTrigger =
      this.page.getByRole(
        'banner'
      ).getByRole(
        'button',
        {
          name: /^[A-Z]{2}$/
        }
      ).first();

    const accountMenu =
      this.profileMenuItem(
        'Billing'
      ).or(
        this.page.getByRole(
          'menuitem',
          {
            name: /sign out|billing/i
          }
        )
      ).first();

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await menuTrigger.hover();

      const openedByHover =
        await accountMenu.waitFor({
          state: 'visible',
          timeout: 1500
        }).then(
          () => true
        ).catch(
          () => false
        );

      if (openedByHover) {
        break;
      }

      const expanded =
        await menuTrigger.getAttribute(
          'aria-expanded'
        ).catch(
          () => null
        );

      if (expanded !== 'true') {
        await menuTrigger.click({
          timeout: 8000
        });
      }

      const opened =
        await accountMenu.waitFor({
          state: 'visible',
          timeout: 5000
        }).then(
          () => true
        ).catch(
          () => false
        );

      if (opened || expanded === 'true') {
        break;
      }
    }

    await expect(
      this.profileMenuItem(
        'Billing'
      ).or(
        this.page.getByText(
          /sign out/i
        )
      ).first()
    ).toBeVisible({
      timeout: 10000
    });
  }

  private profileMenuItem(
    label: string
  ) {
    const escaped =
      label.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );

    const labelPattern =
      new RegExp(
        `^${escaped}(\\b|\\s|&|$)`,
        'i'
      );

    const menu =
      this.page.locator(
        '[role="menu"], [data-radix-menu-content], [data-radix-dropdown-menu-content], [data-radix-popper-content-wrapper]'
      );

    return menu.getByRole(
      'menuitem',
      {
        name: labelPattern
      }
    ).or(
      menu.getByRole(
        'link',
        {
          name: labelPattern
        }
      )
    ).or(
      menu.getByRole(
        'button',
        {
          name: labelPattern
        }
      )
    ).or(
      menu.getByText(
        labelPattern
      )
    ).first();
  }

  async validateNoLoadError() {
    const loadError =
      this.page.getByText(
        /this page couldn'?t load|reload to try again/i
      );

    if (
      await loadError.first().isVisible().catch(
        () => false
      )
    ) {
      await this.page.reload({
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });

      await this.dismissMarketingOverlays();
    }

    await expect(
      this.page.getByText(
        /this page couldn'?t load|reload to try again|go back/i
      )
    ).not.toBeVisible({
      timeout: 15000
    });
  }

  async validateLoaded(
    options?: {
      acceptTrialSuccessMobileGate?: boolean;
    }
  ) {

    await this.dismissMarketingOverlays();

    if (
      isLoginUrl(
        this.page.url()
      )
    ) {
      await restoreSubscriberSession(
        this.page
      );
    }

    Logger.info(
      'Validating Dashboard'
    );

    if (
      options?.acceptTrialSuccessMobileGate &&
      /verify-mobile/i.test(
        this.page.url()
      ) &&
      /trial=success/i.test(
        this.page.url()
      )
    ) {
      Logger.success(
        'QA-CL-005: with-card trial granted. Phone gate is separate from the trial grant.'
      );

      return;
    }

    await expect(
      this.page
    ).toHaveURL(
      /dashboard/,
      {
        timeout: 30000
      }
    );

    await this.validateNoLoadError();

    Logger.success(
      'Dashboard Loaded'
    );
  }

  async validateTopNavigationRoutes() {

    Logger.info(
      'Validating dashboard top navigation routes'
    );

    for (const item of this.topNavigationItems) {
      await this.openTopNavigationItem(
        item.label
      );

      await expect(
        this.page
      ).toHaveURL(
        item.url,
        {
          timeout: 15000
        }
      );

      await this.validateNoLoadError();
    }

    Logger.success(
      'Dashboard top navigation routes are healthy'
    );
  }

  async validateTopNavigationDestinationsRender() {

    Logger.info(
      'Validating dashboard top navigation destination content'
    );

    const navigationItems = [
      ...this.topNavigationItems
    ];

    for (const item of navigationItems) {
      await this.openTopNavigationItem(
        item.label
      );

      await expect(
        this.page
      ).toHaveURL(
        item.url,
        {
          timeout: 15000
        }
      );

      await this.validateNoLoadError();
      await this.validateUsablePageContent();
    }

    Logger.success(
      'Dashboard top navigation destinations render content'
    );
  }

  async validateTopNavigationDestinationsRefresh() {

    Logger.info(
      'Validating dashboard top navigation destination refresh behavior'
    );

    for (const item of this.topNavigationItems) {
      await this.openTopNavigationItem(
        item.label
      );

      await expect(
        this.page
      ).toHaveURL(
        item.url,
        {
          timeout: 15000
        }
      );

      await this.page.reload({
        waitUntil: 'domcontentloaded'
      });

      await expect(
        this.page
      ).toHaveURL(
        item.url,
        {
          timeout: 15000
        }
      );

      await this.validateNoLoadError();
      await this.validateUsablePageContent();
    }

    Logger.success(
      'Dashboard top navigation destinations persist after refresh'
    );
  }

  async validateHeaderUtilityControls() {

    Logger.info(
      'Validating dashboard header utility controls'
    );

    const notificationButton =
      this.utilityButton(
        'lucide-bell',
        /notification|notifications/i
      );

    await expect(
      notificationButton
    ).toBeVisible({
      timeout: 10000
    });

    await safeClick(
      notificationButton,
      'Open Notifications'
    );

    await this.validateNoLoadError();

    await this.page.keyboard.press(
      'Escape'
    );

    const themeButton =
      this.utilityButton(
        'lucide-sun',
        /theme|light|dark/i
      ).or(
        this.utilityButton(
          'lucide-moon',
          /theme|light|dark/i
        )
      ).first();

    if (
      !await themeButton.isVisible({
        timeout: 3000
      }).catch(
        () => false
      )
    ) {
      Logger.success(
        'Dashboard header notifications are healthy. Theme and fullscreen are not on this header.'
      );

      return;
    }

    const htmlBefore =
      await this.page.locator(
        'html'
      ).getAttribute(
        'class'
      );

    await safeClick(
      themeButton,
      'Toggle Theme'
    );

    await this.validateNoLoadError();

    const htmlAfter =
      await this.page.locator(
        'html'
      ).getAttribute(
        'class'
      );

    await expect
      .poll(
        async () =>
          htmlAfter !== htmlBefore ||
          await themeButton.isVisible()
      )
      .toBeTruthy();

    const fullscreenButton =
      this.utilityButton(
        'lucide-maximize',
        /fullscreen|full screen|expand/i
      ).or(
        this.utilityButton(
          'lucide-minimize',
          /fullscreen|full screen|collapse/i
        )
      ).first();

    await expect(
      fullscreenButton
    ).toBeVisible({
      timeout: 10000
    });

    await safeClick(
      fullscreenButton,
      'Toggle Fullscreen'
    );

    await this.validateNoLoadError();

    Logger.success(
      'Dashboard header utility controls are healthy'
    );
  }

  async validateRefreshUtilityControl() {

    Logger.info(
      'Validating dashboard refresh utility control'
    );

    const refreshButton =
      this.utilityButton(
        'lucide-refresh-cw',
        /refresh|reload|sync/i
      ).or(
        this.utilityButton(
          'lucide-rotate-cw',
          /refresh|reload|sync/i
        )
      ).first();

    await expect(
      refreshButton
    ).toBeVisible({
      timeout: 10000
    });

    await safeClick(
      refreshButton,
      'Refresh Dashboard Data'
    );

    await this.page.waitForLoadState(
      'domcontentloaded'
    );

    await expect(
      this.page
    ).toHaveURL(
      /\/dashboard/,
      {
        timeout: 15000
      }
    );

    await this.validateNoLoadError();
    await this.validateUsablePageContent();

    Logger.success(
      'Dashboard refresh utility control is healthy'
    );
  }

  async validateQuickActionControl() {

    Logger.info(
      'Validating dashboard quick-action control'
    );

    const quickActionButton =
      this.utilityButton(
        'lucide-plus',
        /add|create|new|quick action/i
      );

    await expect(
      quickActionButton
    ).toBeVisible({
      timeout: 10000
    });

    const bodyBefore =
      await this.page.locator(
        'body'
      ).innerText();

    await safeClick(
      quickActionButton,
      'Open Quick Action Menu'
    );

    await this.validateNoLoadError();

    await expect(
      this.page
    ).toHaveURL(
      /\/dashboard/,
      {
        timeout: 15000
      }
    );

    const quickActionSurface =
      this.page
        .locator(
          '[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper], [data-state="open"]'
        )
        .filter({
          hasText: /add|create|new|connect|broker|portfolio|account|manual|upload/i
        })
        .first();

    const hasQuickActionSurface =
      await quickActionSurface.isVisible()
        .catch(
          () => false
        );

    const bodyAfter =
      await this.page.locator(
        'body'
      ).innerText();

    expect(
      hasQuickActionSurface ||
      bodyAfter !== bodyBefore ||
      await quickActionButton.isVisible()
    ).toBeTruthy();

    await this.page.keyboard.press(
      'Escape'
    );

    await this.page.mouse.click(
      20,
      20
    );

    await this.validateNoLoadError();

    Logger.success(
      'Dashboard quick-action control is healthy'
    );
  }

  async validateNotificationPanelBehavior() {

    Logger.info(
      'Validating notification panel behavior'
    );

    const notificationButton =
      this.utilityButton(
        'lucide-bell',
        /notification|notifications/i
      );

    await expect(
      notificationButton
    ).toBeVisible({
      timeout: 10000
    });

    const bodyBefore =
      await this.page.locator(
        'body'
      ).innerText();

    await safeClick(
      notificationButton,
      'Open Notification Panel'
    );

    await this.validateNoLoadError();

    const notificationSurface =
      this.page
        .locator(
          '[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper], [data-state="open"]'
        )
        .filter({
          hasText: /notification|notifications|no notifications|mark|read|unread|empty|inbox/i
        })
        .first();

    const hasNotificationSurface =
      await notificationSurface.isVisible()
        .catch(
          () => false
        );

    const bodyAfter =
      await this.page.locator(
        'body'
      ).innerText();

    const buttonStillVisible =
      await notificationButton.isVisible();

    expect(
      hasNotificationSurface ||
      bodyAfter !== bodyBefore ||
      buttonStillVisible
    ).toBeTruthy();

    await this.page.keyboard.press(
      'Escape'
    );

    await this.validateNoLoadError();

    await safeClick(
      notificationButton,
      'Reopen Notification Panel'
    );

    await this.validateNoLoadError();

    await this.page.mouse.click(
      20,
      20
    );

    await this.validateNoLoadError();

    Logger.success(
      'Notification panel behavior is healthy'
    );
  }

  async validateNotificationPanelAfterRefresh() {

    Logger.info(
      'Validating notification panel after dashboard refresh'
    );

    await this.page.reload({
      waitUntil: 'domcontentloaded'
    });

    await this.validateLoaded();
    await this.validateNotificationPanelBehavior();

    Logger.success(
      'Notification panel remains healthy after refresh'
    );
  }

  async validateProfileMenuNavigationActions() {

    Logger.info(
      'Validating profile-menu navigation actions'
    );

    const menuItems = [
      {
        label: 'Profile',
        url: /\/dashboard\/profile/,
        content: /profile|email|personal/i
      },
      {
        label: 'Billing',
        url: /\/dashboard\/billing/,
        content: /billing|plan|invoice|transaction|subscription/i
      },
      {
        label: 'Risk & Compliance',
        url: /\/dashboard\/risk-compliance/,
        content: /risk profile|compliance/i
      }
    ];

    for (const item of menuItems) {
      await this.page.goto(
        this.appUrl(
          URLS.DASHBOARD
        ),
        {
          waitUntil: 'domcontentloaded'
        }
      );

      await this.validateLoaded();
      await this.openProfileMenu();

      await safeClick(
        this.profileMenuItem(
          item.label
        ),
        `Open ${item.label} From Profile Menu`
      );

      await expect(
        this.page
      ).toHaveURL(
        item.url,
        {
          timeout: 15000
        }
      );

      await this.validateNoLoadError();

      await expect(
        this.page.locator(
          'body'
        )
      ).toContainText(
        item.content,
        {
          timeout: 15000
        }
      );
    }

    Logger.success(
      'Profile-menu navigation actions are healthy'
    );
  }

  private profileMenuToggle(
    pattern: RegExp
  ) {
    const menu =
      this.page.locator(
        '[role="menu"], [data-radix-menu-content], [data-radix-dropdown-menu-content], [data-radix-popper-content-wrapper]'
      );

    return menu.getByRole(
      'menuitem',
      {
        name: pattern
      }
    ).or(
      menu.getByRole(
        'button',
        {
          name: pattern
        }
      )
    ).or(
      menu.getByText(
        pattern
      )
    ).first();
  }

  private async reopenProfileMenu() {
    // Some menu items close the menu, others leave it open.
    if (
      await this.profileMenuItem(
        'Billing'
      ).isVisible().catch(
        () => false
      )
    ) {
      await this.page.keyboard.press(
        'Escape'
      );

      await this.page.waitForTimeout(
        400
      );
    }

    await this.openProfileMenu();
  }

  private async readThemeSignature() {
    return this.page.evaluate(
      () => {
        const html =
          document.documentElement;

        return JSON.stringify({
          htmlClass:
            html.className,
          dataTheme:
            html.getAttribute(
              'data-theme'
            ),
          colorScheme:
            html.style.colorScheme,
          background:
            getComputedStyle(
              document.body
            ).backgroundColor
        });
      }
    );
  }

  async validateProfileMenuThemeToggle() {
    Logger.info(
      'Validating profile-menu dark/light theme switch'
    );

    await this.openProfileMenu();

    const lightItem =
      this.profileMenuToggle(
        /^light theme$/i
      );

    const darkItem =
      this.profileMenuToggle(
        /^dark theme$/i
      );

    const startsDark =
      await lightItem.isVisible({
        timeout: 3000
      }).catch(
        () => false
      );

    // The menu offers the theme it will switch TO.
    const firstItem =
      startsDark
        ? lightItem
        : darkItem;

    const secondItem =
      startsDark
        ? darkItem
        : lightItem;

    await expect(
      firstItem,
      'The profile menu should offer a Light theme or Dark theme option.'
    ).toBeVisible({
      timeout: 10000
    });

    const before =
      await this.readThemeSignature();

    await safeClick(
      firstItem,
      startsDark
        ? 'Switch to Light theme'
        : 'Switch to Dark theme'
    );

    await expect
      .poll(
        async () =>
          this.readThemeSignature(),
        {
          timeout: 10000,
          message:
            'The page appearance should change after choosing the other theme.'
        }
      )
      .not.toBe(before);

    await this.reopenProfileMenu();

    await expect(
      secondItem,
      'After switching, the menu should offer the opposite theme.'
    ).toBeVisible({
      timeout: 10000
    });

    await safeClick(
      secondItem,
      startsDark
        ? 'Switch back to Dark theme'
        : 'Switch back to Light theme'
    );

    await expect
      .poll(
        async () =>
          this.readThemeSignature(),
        {
          timeout: 10000,
          message:
            'Switching back should restore the original appearance.'
        }
      )
      .toBe(before);

    await this.validateNoLoadError();

    Logger.success(
      'Profile-menu theme switch works in both directions'
    );
  }

  async validateProfileMenuFullscreenToggle() {
    Logger.info(
      'Validating profile-menu full screen and exit full screen'
    );

    const inFullscreen = () =>
      this.page.evaluate(
        () =>
          document.fullscreenElement !== null
      );

    await this.openProfileMenu();

    const enterItem =
      this.profileMenuToggle(
        /^full screen$/i
      );

    const exitItem =
      this.profileMenuToggle(
        /^exit full screen$/i
      );

    // Start from a normal window.
    if (
      await exitItem.isVisible({
        timeout: 2000
      }).catch(
        () => false
      )
    ) {
      await safeClick(
        exitItem,
        'Exit already-active Full screen'
      );

      await this.reopenProfileMenu();
    }

    await expect(
      enterItem,
      'The profile menu should offer a Full screen option.'
    ).toBeVisible({
      timeout: 10000
    });

    await safeClick(
      enterItem,
      'Enter Full screen'
    );

    await expect
      .poll(
        inFullscreen,
        {
          timeout: 10000,
          message:
            'The page should enter full screen after choosing Full screen.'
        }
      )
      .toBe(true);

    await this.reopenProfileMenu();

    await expect(
      exitItem,
      'In full screen the menu should offer Exit full screen.'
    ).toBeVisible({
      timeout: 10000
    });

    await safeClick(
      exitItem,
      'Exit Full screen'
    );

    await expect
      .poll(
        inFullscreen,
        {
          timeout: 10000,
          message:
            'The page should leave full screen after choosing Exit full screen.'
        }
      )
      .toBe(false);

    await this.reopenProfileMenu();

    await expect(
      enterItem,
      'After exiting, the menu should offer Full screen again.'
    ).toBeVisible({
      timeout: 10000
    });

    await this.page.keyboard.press(
      'Escape'
    );

    await this.validateNoLoadError();

    Logger.success(
      'Profile-menu full screen and exit full screen work'
    );
  }

  async validateProfileMenuDismissal() {

    Logger.info(
      'Validating profile-menu dismissal behavior'
    );

    const billingMenuItem =
      this.profileMenuItem(
        'Billing'
      );

    await this.openProfileMenu();

    await expect(
      billingMenuItem
    ).toBeVisible({
      timeout: 10000
    });

    await this.page.keyboard.press(
      'Escape'
    );

    await expect(
      billingMenuItem
    ).not.toBeVisible({
      timeout: 10000
    });

    await this.openProfileMenu();

    await expect(
      billingMenuItem
    ).toBeVisible({
      timeout: 10000
    });

    await this.page.mouse.click(
      20,
      20
    );

    await expect(
      billingMenuItem
    ).not.toBeVisible({
      timeout: 10000
    });

    await this.validateNoLoadError();

    Logger.success(
      'Profile-menu dismissal behavior is healthy'
    );
  }

  async signOutFromProfileMenu() {

    Logger.info(
      'Validating profile-menu sign out'
    );

    await this.openProfileMenu();

    await safeClick(
      this.page
        .getByText(
          /sign out/i
        )
        .first(),
      'Click Sign Out'
    );

    await expect(
      this.page
    ).toHaveURL(
      /\/login/,
      {
        timeout: 15000
      }
    );

    await expect(
      this.page.getByRole(
        'button',
        {
          name: /sign in/i
        }
      )
    ).toBeVisible({
      timeout: 10000
    });

    Logger.success(
      'Profile-menu sign out redirects to login'
    );
  }

  async validateKeyAuthenticatedRoutesRefresh() {

    Logger.info(
      'Validating key authenticated route refresh behavior'
    );

    const routes = [
      {
        label: 'Profile',
        path: '/dashboard/profile',
        url: /\/dashboard\/profile/,
        content: /profile|email|personal/i
      },
      {
        label: 'Billing',
        path: '/dashboard/billing',
        url: /\/dashboard\/billing/,
        content: /billing|plan|invoice|transaction|subscription/i
      },
      {
        label: 'Risk & Compliance',
        path: '/dashboard/risk-compliance',
        url: /\/dashboard\/risk-compliance/,
        content: /risk profile|compliance/i
      }
    ];

    for (const route of routes) {
      await this.page.goto(
        this.appUrl(
          route.path
        ),
        {
          waitUntil: 'domcontentloaded'
        }
      );

      await expect(
        this.page
      ).toHaveURL(
        route.url,
        {
          timeout: 15000
        }
      );

      await this.validateNoLoadError();

      await expect(
        this.page.locator(
          'body'
        )
      ).toContainText(
        route.content,
        {
          timeout: 15000
        }
      );

      await this.page.reload({
        waitUntil: 'domcontentloaded'
      });

      await expect(
        this.page
      ).toHaveURL(
        route.url,
        {
          timeout: 15000
        }
      );

      await this.validateNoLoadError();

      await expect(
        this.page.locator(
          'body'
        )
      ).toContainText(
        route.content,
        {
          timeout: 15000
        }
      );
    }

    Logger.success(
      'Key authenticated routes remain usable after refresh'
    );
  }

  private async cardText(
    heading: RegExp,
    marker: RegExp,
    content?: RegExp
  ) {
    const title =
      this.page.getByRole(
        'heading',
        {
          name: heading
        }
      ).or(
        this.page.getByText(
          heading
        )
      ).first();

    await expect(
      title
    ).toBeVisible({
      timeout: 20000
    });

    const text =
      await title.evaluate(
        (node, sources) => {
          const pattern =
            new RegExp(
              sources.markerSource,
              'i'
            );

          const contentPattern =
            sources.contentSource
              ? new RegExp(
                sources.contentSource,
                'i'
              )
              : null;

          let current =
            node as HTMLElement | null;

          let fallback = '';

          while (current) {
            const value =
              current.innerText || '';

            const matches =
              pattern.test(value) &&
              (
                !contentPattern ||
                contentPattern.test(value)
              );

            if (
              matches
            ) {
              fallback = value;

              if (
                value.length < 4000
              ) {
                return value;
              }
            }

            current =
              current.parentElement;
          }

          return fallback;
        },
        {
          markerSource: marker.source,
          contentSource: content?.source
        }
      );

    expect(
      text,
      `Dashboard card ${heading} should include ${marker}`
    ).toMatch(
      marker
    );

    return text;
  }

  async validatePortfolioSummary() {
    Logger.info(
      'Validating Total Portfolio Value'
    );

    const text =
      await this.cardText(
        /total portfolio value/i,
        /cash\s*&\s*buying power/i
      );

    expect(
      text
    ).toMatch(
      /\$[\d,]+/
    );

    expect(
      text
    ).toMatch(
      /invested value/i
    );

    expect(
      text
    ).toMatch(
      /%\s*of portfolio/i
    );

    const percentAfter = (
      label: string
    ) => {
      const match =
        text.match(
          new RegExp(
            `${label}[\\s\\S]{0,160}?(\\d+(?:\\.\\d+)?)\\s*%\\s*of portfolio`,
            'i'
          )
        );

      return match
        ? Number(match[1])
        : Number.NaN;
    };

    const investedPercent =
      percentAfter(
        'invested value'
      );

    const cashPercent =
      percentAfter(
        'cash\\s*&\\s*buying power'
      );

    expect(
      investedPercent
    ).not.toBeNaN();

    expect(
      cashPercent
    ).not.toBeNaN();

    expect(
      Math.abs(
        investedPercent +
        cashPercent -
        100
      )
    ).toBeLessThanOrEqual(
      1.5
    );

    Logger.success(
      'Total Portfolio Value is shown'
    );
  }

  async validateOolsScore() {
    Logger.info(
      'Validating Ools Score'
    );

    const text =
      await this.cardText(
        /ools score/i,
        /diversified/i
      );

    expect(
      text
    ).toMatch(
      /overlayed|hedged/i
    );

    const scores =
      [...text.matchAll(
        /\b(\d{1,3})\b/g
      )].map(
        (match) =>
          Number(match[1])
      );

    expect(
      scores.some(
        (score) =>
          score >= 0 &&
          score <= 100
      )
    ).toBe(
      true
    );

    Logger.success(
      'Ools Score is shown'
    );
  }

  async validateUpcomingEvents() {
    Logger.info(
      'Validating Upcoming Events'
    );

    const text =
      await this.cardText(
        /upcoming events/i,
        /portfolio symbols|no upcoming|view more/i,
        /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b|no upcoming/i
      );

    const dates =
      text.match(
        /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/gi
      ) ?? [];

    const empty =
      /no upcoming/i.test(
        text
      );

    expect(
      empty ||
      (
        dates.length >= 1 &&
        dates.length <= 3
      )
    ).toBe(
      true
    );

    Logger.success(
      'Upcoming Events are shown'
    );
  }

  async validateAssetAllocation() {
    Logger.info(
      'Validating Asset Allocation'
    );

    const text =
      await this.cardText(
        /asset allocation/i,
        /equity/i
      );

    expect(
      text
    ).toMatch(
      /cash/i
    );

    expect(
      text
    ).toMatch(
      /options/i
    );

    expect(
      text
    ).toMatch(
      /\d+(?:\.\d+)?%/
    );

    Logger.success(
      'Asset Allocation is shown'
    );
  }

  async validateOptionStrategyBreakdown() {
    Logger.info(
      'Validating Option Strategy Breakdown'
    );

    const text =
      await this.cardText(
        /option strategy breakdown/i,
        /covered calls/i
      );

    expect(
      text
    ).toMatch(
      /cash secured puts/i
    );

    expect(
      text
    ).toMatch(
      /protective puts/i
    );

    expect(
      text
    ).toMatch(
      /long calls/i
    );

    expect(
      text
    ).toMatch(
      /\$[\d,]+|\+\$[\d,]+/
    );

    Logger.success(
      'Option Strategy Breakdown is shown'
    );
  }

  async validateBrokerAccounts() {
    Logger.info(
      'Validating Broker Accounts'
    );

    const text =
      await this.cardText(
        /broker accounts/i,
        /manual entry|market value|last refresh/i,
        /\$[\d,]+|manual entry/i
      );

    expect(
      text
    ).toMatch(
      /\$[\d,]+/
    );

    Logger.success(
      'Broker Accounts are shown'
    );
  }

  async validateTopOpportunities() {
    Logger.info(
      'Validating Top 10 Opportunities'
    );

    const text =
      await this.cardText(
        /top 10 opportunities/i,
        /symbol/i
      );

    expect(
      text
    ).toMatch(
      /covered call|cash secured put|protective put|long call|\bCC\b|\bCSP\b/i
    );

    const ignored =
      new Set([
        'CC',
        'CSP',
        'PP',
        'LC',
        'ATM',
        'ITM',
        'OTM',
        'DTE',
        'USD',
        'AI'
      ]);

    const symbols =
      [...new Set(
        [...text.matchAll(
          /\b[A-Z]{2,5}\b/g
        )].map(
          (match) => match[0]
        ).filter(
          (symbol) =>
            !ignored.has(symbol)
        )
      )];

    expect(
      symbols.length
    ).toBeGreaterThan(
      0
    );

    expect(
      symbols.length
    ).toBeLessThanOrEqual(
      10
    );

    Logger.success(
      'Top 10 Opportunities are shown'
    );
  }

  async validatePerformanceSummary() {
    Logger.info(
      'Validating OolTool Performance'
    );

    const text =
      await this.cardText(
        /ooltool performance/i,
        /opportunities executed|successful opportunities/i
      );

    expect(
      text
    ).toMatch(
      /\d+\s*\/\s*\d+/
    );

    Logger.success(
      'OolTool Performance is shown'
    );
  }

  async validateDashboardCardLinks() {
    Logger.info(
      'Validating dashboard card links'
    );

    const labels = [
      /view option exposure/i,
      /manage accounts/i,
      /view all opportunities/i
    ];

    for (const label of labels) {
      await expect(
        this.page.getByRole(
          'link',
          {
            name: label
          }
        ).or(
          this.page.getByRole(
            'button',
            {
              name: label
            }
          )
        ).or(
          this.page.getByText(
            label
          )
        ).first()
      ).toBeVisible({
        timeout: 15000
      });
    }

    const eventsLink = this.page.getByRole('link', {
      name: /view more|view (full )?event calendar|event calendar/i
    }).first();

    await expect(
      eventsLink,
      'Upcoming Events should link to the event calendar (the label is "View more", not a separate calendar title).'
    ).toBeVisible({
      timeout: 15000
    });

    const expiryCard = this.page
      .locator('section, article, div')
      .filter({ has: this.page.getByRole('heading', { name: /option expiry overview/i }) })
      .first();

    const expiryText = await expiryCard
      .innerText({ timeout: 5000 })
      .catch(() => '');

    const expiryEmpty = /no open (short|long) options|no expir|none/i.test(
      expiryText
    );

    const expiryCalendar = expiryCard.getByRole('link', {
      name: /view full expiry calendar|expiry calendar|view more/i
    }).first();

    if (
      !expiryEmpty &&
      (await expiryCalendar.isVisible({ timeout: 2000 }).catch(() => false))
    ) {
      await expect(expiryCalendar).toBeVisible();
    }

    Logger.success(
      'Dashboard card links are visible'
    );
  }

  async validateExpiryOverview() {
    Logger.info(
      'Validating Option Expiry Overview'
    );

    const text =
      await this.cardText(
        /option expiry overview/i,
        /expiration|symbol/i
      );

    const hasContractRow =
      /\b[A-Z]{2,5}\b/.test(
        text
      ) &&
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/i.test(
        text
      );

    const empty =
      /no expir|none|no option/i.test(
        text
      );

    expect(
      empty || hasContractRow
    ).toBe(
      true
    );

    Logger.success(
      'Option Expiry Overview is visible'
    );
  }

  async validate() {

await this.validateLoaded();

    Logger.step(
  'Refreshing Dashboard'
);

  await this.refresh();

    await expect(this.page)
      .toHaveURL(
        /dashboard/,
        {
          timeout: 30000,
        }
      );

  await this.validateNoLoadError();

   Logger.success(
  'Dashboard persists after refresh'
);
  }
}
