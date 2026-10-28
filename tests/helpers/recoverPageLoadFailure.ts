import { Page } from '@playwright/test';

import { Logger } from '../utils/logger';

/* =============================================================================
HELPER: recoverPageLoadFailure

PURPOSE
-------
Chromium / host interstitials ("This page couldn’t load") leave Reload + Back
and no app chrome. Click Reload, or re-goto the target URL, a few times so
flake navigation does not cascade through an entire Positions suite.
============================================================================= */

const LOAD_FAILED =
  /this page couldn[’']t load|reload to try again/i;

export async function isPageLoadFailure(
  page: Page
): Promise<boolean> {
  const body = await page
    .locator('body')
    .innerText({ timeout: 2000 })
    .catch(() => '');
  if (LOAD_FAILED.test(body)) {
    return true;
  }
  const reload = page.getByRole('button', {
    name: /^reload$/i
  });
  const heading = page.getByRole('heading', {
    name: /couldn[’']t load/i
  });
  return (
    (await heading.isVisible().catch(() => false)) ||
    ((await reload.isVisible().catch(() => false)) &&
      (await page
        .getByRole('button', { name: /^back$/i })
        .isVisible()
        .catch(() => false)))
  );
}

export async function recoverPageLoadFailure(
  page: Page,
  url?: string,
  attempts = 3
): Promise<boolean> {
  let recovered = false;
  for (let i = 0; i < attempts; i++) {
    if (!(await isPageLoadFailure(page))) {
      return recovered;
    }
    recovered = true;
    Logger.warning(
      `Page load failure interstitial — recover attempt ${i + 1}/${attempts}`
    );
    const reload = page.getByRole('button', {
      name: /^reload$/i
    });
    if (await reload.isVisible().catch(() => false)) {
      await reload.click({ force: true }).catch(() => undefined);
      await page
        .waitForLoadState('domcontentloaded', { timeout: 30000 })
        .catch(() => undefined);
    } else if (url) {
      await page
        .goto(url, { waitUntil: 'domcontentloaded' })
        .catch(() => undefined);
    } else {
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    }
    await page.waitForTimeout(750);
  }
  return recovered;
}
