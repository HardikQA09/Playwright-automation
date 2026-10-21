import {
  Locator,
  Page
} from '@playwright/test';

import {
  dismissOverlays
} from './dismissOverlays';
import {
  watchDelayMs
} from '../config/watchMode';

/* =============================================================================
HELPER: safeClick

PURPOSE
-------
Waits for a locator to become visible, scrolls it into view, then clicks it.
Overlays are dismissed first. Real clicks are used so cookie/announcement
layers cannot swallow Create Account, Sign up, profile, or Plans actions.
============================================================================= */

export async function safeClick(
  locator: Locator,
  label: string
) {
  console.log(`[CLICK] ${label}`);

  const page =
    locator.page();

  await dismissOverlays(
    page
  );

  try {
    await locator.waitFor({
      state: 'visible',
      timeout: 15000,
    });
  } catch {
    // A survey or cookie layer often appears a moment after the first
    // dismiss during a long run. Clear it and wait for the target again.
    await dismissOverlays(
      page
    );

    await locator.waitFor({
      state: 'visible',
      timeout: 15000,
    });
  }

  await locator.scrollIntoViewIfNeeded({
    timeout: 5000,
  }).catch(
    () => undefined
  );

  try {
    await locator.click({
      timeout: 8000,
    });
  } catch {
    await dismissOverlays(
      page
    );

    await locator.scrollIntoViewIfNeeded({
      timeout: 5000,
    }).catch(
      () => undefined
    );

    await locator.click({
      timeout: 8000,
    }).catch(
      async () => {
        await locator.click({
          force: true,
          timeout: 8000
        });
      }
    );
  }

  const watchDelay =
    watchDelayMs();

  if (watchDelay > 0) {
    await locator.page().waitForTimeout(
      watchDelay
    );
  }
}

export async function openHeaderMenu(
  page: Page,
  menuName: RegExp
) {
  const menuButton =
    page.getByRole(
      'button',
      {
        name: menuName
      }
    ).first();

  const anyItem =
    page.getByRole(
      'menuitem'
    ).first();

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await menuButton.hover();

    const openedByHover =
      await anyItem.waitFor({
        state: 'visible',
        timeout: 1500
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (openedByHover) {
      return;
    }

    const expanded =
      await menuButton.getAttribute(
        'aria-expanded'
      ).catch(
        () => null
      );

    if (expanded !== 'true') {
      await menuButton.click({
        timeout: 8000
      });
    }

    const opened =
      await anyItem.waitFor({
        state: 'visible',
        timeout: 5000
      }).then(
        () => true
      ).catch(
        () => false
      );

    if (opened) {
      return;
    }

    await page.keyboard.press(
      'Escape'
    ).catch(
      () => undefined
    );
  }

  await anyItem.waitFor({
    state: 'visible',
    timeout: 15000
  });
}

export async function openHeaderMenuItem(
  page: Page,
  menuName: RegExp,
  itemName: RegExp,
  label: string
) {
  const menuItem =
    page.getByRole(
      'menuitem',
      {
        name: itemName
      }
    ).or(
      page.getByRole(
        'option',
        {
          name: itemName
        }
      )
    ).or(
      page.getByRole(
        'link',
        {
          name: itemName
        }
      )
    ).or(
      page.locator(
        '[role="menu"] a, [data-radix-menu-content] a, [data-state="open"] a, [data-state="open"] button'
      ).filter({
        hasText: itemName
      })
    ).first();

  const fallbackPath =
    itemName.test(
      'News'
    )
      ? '/dashboard/news'
      : itemName.test(
        'Simulator'
      )
        ? '/dashboard/simulator'
        : itemName.test(
          'Options Research'
        )
          ? '/dashboard/options-research'
          : null;

  try {
    await openHeaderMenu(
      page,
      menuName
    );

    await menuItem.waitFor({
      state: 'visible',
      timeout: 15000
    });

    await menuItem.click({
      timeout: 15000
    });
  } catch (error) {
    if (
      !fallbackPath
    ) {
      throw error;
    }

    const origin =
      new URL(
        page.url()
      ).origin;

    await page.goto(
      `${origin}${fallbackPath}`,
      {
        waitUntil: 'domcontentloaded'
      }
    );
  }

  void label;
}
