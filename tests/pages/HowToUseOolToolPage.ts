import {
  Page,
  expect
} from '@playwright/test';

import {
  BasePage
} from './BasePage';

import {
  Logger
} from '../utils/logger';

/* =============================================================================
PAGE OBJECT: HowToUseOolToolPage

PURPOSE
-------
Member guide opened from the profile avatar menu ("How to use OolTool").
Tracks a 7-step path (setup book + read portal + help).
============================================================================= */

export const HOW_TO_USE_STEPS = [
  'Your risk profile',
  'Add your holdings',
  'Confirm your accounts',
  'Read your dashboard',
  'Review Opportunities',
  'Look up a symbol',
  'Help when you need it'
] as const;

export class HowToUseOolToolPage
  extends BasePage {

  constructor(
    page: Page
  ) {
    super(
      page
    );
  }

  heading() {
    return this.page.getByRole(
      'heading',
      {
        name: /how to use ooltool/i
      }
    ).or(
      this.page.getByText(
        /how to use ooltool/i
      )
    ).first();
  }

  progressLabel() {
    return this.page.getByText(
      /\d+\s*\n?\s*OF\s*\n?\s*7|^\s*\d+\s*\/\s*7\s*$/i
    ).or(
      this.page.locator(
        'body'
      ).getByText(
        /\d+\s+OF\s+7/i
      )
    ).first();
  }

  finishedBanner() {
    return this.page.getByText(
      /you have finished the path/i
    );
  }

  async validateLoaded() {
    await expect(
      this.page
    ).toHaveURL(
      /\/dashboard\/how-to-use-ooltool/i,
      {
        timeout: 20000
      }
    );

    await expect(
      this.heading()
    ).toBeVisible({
      timeout: 15000
    });

    Logger.success(
      'How to use OolTool guide loaded'
    );
  }

  async readProgress(): Promise<{
    completed: number;
    total: number;
    finished: boolean;
    body: string;
  }> {
    const body =
      (
        await this.page.locator(
          'main, body'
        ).first().innerText({
          timeout: 15000
        })
      ).replace(
        /\s+/g,
        ' '
      );

    const ofSeven =
      body.match(
        /(\d+)\s*OF\s*7/i
      );

    const slashSeven =
      body.match(
        /(\d+)\s*\/\s*7/i
      );

    let completed =
      ofSeven
        ? Number(
            ofSeven[1]
          )
        : slashSeven
          ? Number(
              slashSeven[1]
            )
          : NaN;

    if (
      Number.isNaN(
        completed
      )
    ) {
      // Fall back to counting step cards marked Done.
      completed =
        HOW_TO_USE_STEPS.filter(
          (step) =>
            new RegExp(
              `${step}[\\s\\S]{0,80}\\bDone\\b`,
              'i'
            ).test(
              body
            )
        ).length;
    }

    const finished =
      /you have finished the path/i.test(
        body
      ) ||
      completed >= 7;

    return {
      completed,
      total: 7,
      finished,
      body
    };
  }

  stepCard(
    stepTitle: string
  ) {
    return this.page.getByText(
      stepTitle,
      {
        exact: false
      }
    ).first();
  }

  async validateAllStepsPresent() {
    for (const step of HOW_TO_USE_STEPS) {
      await expect(
        this.stepCard(
          step
        ),
        `Guide should list step "${step}"`
      ).toBeVisible({
        timeout: 10000
      });
    }
  }

  async validateCompletedPath() {
    await this.validateLoaded();
    await this.validateAllStepsPresent();

    const progress =
      await this.readProgress();

    expect(
      progress.completed,
      `Completed account should show 7 of 7 (got ${progress.completed}). Body: ${progress.body.slice(0, 240)}`
    ).toBe(
      7
    );

    await expect(
      this.finishedBanner()
    ).toBeVisible({
      timeout: 10000
    });

    for (const step of HOW_TO_USE_STEPS) {
      expect(
        new RegExp(
          `${step}[\\s\\S]{0,120}\\bDone\\b`,
          'i'
        ).test(
          progress.body
        ),
        `Step "${step}" should be marked Done for a finished guide`
      ).toBeTruthy();
    }

    Logger.success(
      'How to use OolTool shows 7/7 completed path'
    );
  }

  async validatePendingPath() {
    await this.validateLoaded();
    await this.validateAllStepsPresent();

    const progress =
      await this.readProgress();

    expect(
      progress.completed,
      `Pending account should have fewer than 7 completed steps (got ${progress.completed}). Body: ${progress.body.slice(0, 240)}`
    ).toBeLessThan(
      7
    );

    expect(
      progress.finished,
      'Pending account should not show the finished-path banner'
    ).toBeFalsy();

    const pendingAction =
      this.page.getByRole(
        'link',
        {
          name: /open |review |check |look up|add |connect|start/i
        }
      ).or(
        this.page.getByRole(
          'button',
          {
            name: /open |review |check |look up|add |connect|start/i
          }
        )
      ).first();

    await expect(
      pendingAction,
      'Pending guide should still offer at least one next-step action'
    ).toBeVisible({
      timeout: 10000
    });

    Logger.success(
      `How to use OolTool shows pending progress ${progress.completed}/7`
    );
  }
}
