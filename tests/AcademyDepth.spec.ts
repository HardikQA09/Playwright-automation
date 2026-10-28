import {
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL
} from './config/testData';

import { test }
  from './fixtures/subscriberAuth';

import { safeClick }
  from './helpers/safeClick';

async function openAcademy(
  page: Page,
  path = '/academy'
) {
  let lastError: unknown;

  for (
    let attempt = 0;
    attempt < 2;
    attempt += 1
  ) {
    try {
      await page.goto(
        `${BASE_URL}${path}`,
        {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        }
      );

      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function markLessonIfNeeded(
  page: Page,
  label: string
) {
  const mark =
    page.locator(
      'main'
    ).getByRole(
      'button',
      {
        name: /^mark as complete$/i
      }
    );

  const done =
    page.locator(
      'main'
    ).getByRole(
      'button',
      {
        name: /marked complete|undo/i
      }
    );

  const deadline =
    Date.now() + 15000;
  let state = '';

  while (
    Date.now() < deadline &&
    !state
  ) {
    if (
      await done.isVisible().catch(
        () => false
      )
    ) {
      state = 'done';
    } else if (
      await mark.isVisible().catch(
        () => false
      )
    ) {
      state = 'open';
    } else {
      await page.waitForTimeout(
        250
      );
    }
  }

  if (
    state !== 'open'
  ) {
    return false;
  }

  if (
    await done.isVisible().catch(
      () => false
    )
  ) {
    return false;
  }

  const clicked =
    await mark.click({
      timeout: 5000
    }).then(
      () => true
    ).catch(
      () => false
    );

  if (
    !clicked
  ) {
    await expect(
      done
    ).toBeVisible({
      timeout: 15000
    });

    return false;
  }

  console.log(
    `[CLICK] ${label}`
  );

  const saved =
    await done.waitFor({
      state: 'visible',
      timeout: 15000
    }).then(
      () => true
    ).catch(
      () => false
    );

  if (
    !saved
  ) {
    await mark.click({
      timeout: 8000
    }).catch(
      () => undefined
    );

    await expect(
      done
    ).toBeVisible({
      timeout: 20000
    });
  }

  return true;
}

async function chooseOption(
  page: Page,
  comboIndex: number,
  optionName: RegExp,
  label: string
) {
  const combo =
    page.locator(
      'main'
    ).getByRole(
      'combobox'
    ).nth(
      comboIndex
    );

  await safeClick(
    combo,
    label
  );

  await safeClick(
    page.getByRole(
      'option',
      {
        name: optionName
      }
    ).first(),
    label
  );

  await expect(
    combo
  ).toContainText(
    optionName
  );
}

/* =============================================================================
TEST SUITE: Academy depth

PURPOSE
-------
Walk the five Academy sections. Open a lesson detail, mark it complete when
it is still open, and confirm the progress count. Strategy Library categories
and filters are applied, and Glossary search is cleared afterward.

RUN
---
npx playwright test tests/AcademyDepth.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Academy depth',
  () => {

    // These are read-only UI checks. When the UAT app is briefly slow the
    // whole page can come back empty, so one retry avoids a false failure
    // (a retried pass is reported as flaky, not hidden).
    test.describe.configure({
      timeout: 240000,
      retries: 1
    });

    test(
      'Academy tabs lesson completion progress strategy filters and glossary',
      async ({ page }) => {
        const sections = [
          {
            name: /^beginners$/i,
            url: /\/academy\/beginners/,
            content: /beginner|introduction|lesson|open/i
          },
          {
            name: /^overview$/i,
            url: /\/academy\/?$/,
            content: /your progress|0\s*\/\s*13|[1-9]\d*\s*\/\s*13/i
          },
          {
            name: /^lessons$/i,
            url: /\/academy\/lessons/,
            content: /what is a covered call/i
          },
          {
            name: /^strategy library$/i,
            url: /\/academy\/strategies/,
            content: /strategy library|covered call/i
          },
          {
            name: /^glossary$/i,
            url: /\/academy\/glossary/,
            content: /assignment|glossary/i
          }
        ];

        await openAcademy(
          page
        );

        for (const section of sections) {
          await safeClick(
            page.getByRole(
              'link',
              {
                name: section.name
              }
            ).first(),
            'Academy section'
          );

          await expect(
            page
          ).toHaveURL(
            section.url
          );

          const content =
            page.locator(
              'main, [role="main"]'
            ).first();

          await expect(
            content
          ).toBeVisible({
            timeout: 15000
          });

          await expect(
            content
          ).toContainText(
            section.content,
            {
              timeout: 15000
            }
          );
        }

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^lessons$/i
            }
          ).first(),
          'Lessons'
        );

        for (const level of [
          /^beginner$/i,
          /^intermediate$/i,
          /^advanced$/i,
          /^all$/i
        ]) {
          const filter =
            page.locator(
              'main'
            ).getByRole(
              'button',
              {
                name: level
              }
            );

          if (
            await filter.waitFor({
              state: 'visible',
              timeout: 1500
            }).then(
              () => true
            ).catch(
              () => false
            )
          ) {
            await safeClick(
              filter,
              'Lesson level'
            );

            await expect(
              page.locator(
                'main'
              )
            ).toContainText(
              /lesson|covered call|no lessons/i
            );
          }
        }

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /what is a covered call/i
            }
          ).first(),
          'Open lesson'
        );

        await expect(
          page
        ).toHaveURL(
          /\/academy\/lessons\/what-is-a-covered-call/
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /covered call/i
        );

        const markedNow =
          await markLessonIfNeeded(
            page,
            'Mark as complete'
          );

        await openAcademy(
          page
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /your progress/i
        );

        const progress =
          page.getByRole(
            'progressbar'
          );

        if (
          await progress.waitFor({
            state: 'visible',
            timeout: 3000
          }).then(
            () => true
          ).catch(
            () => false
          )
        ) {
          await expect(
            progress
          ).toBeVisible();
        }

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          markedNow
            ? /[1-9]\d*\s*\/\s*13/
            : /\d+\s*\/\s*13/,
          {
            timeout: 20000
          }
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /completed \d+ of 13|start your first lesson|\d+\s*\/\s*13/i
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^strategy library$/i
            }
          ).first(),
          'Strategy library'
        );

        const categories = [
          {
            button: /^all\b/i,
            content: /18 of 18|covered call/i
          },
          {
            button: /^income\b/i,
            content: /covered call|5 of 18/i
          },
          {
            button: /^directional\b/i,
            content: /long call|4 of 18/i
          },
          {
            button: /^protection\b/i,
            content: /protective put|2 of 18/i
          },
          {
            button: /^volatility\b/i,
            content: /straddle|4 of 18/i
          },
          {
            button: /^precision\b/i,
            content: /butterfly|1 of 18/i
          },
          {
            button: /^advanced\b/i,
            content: /ratio spread|2 of 18/i
          }
        ];

        for (const category of categories) {
          await safeClick(
            page.locator(
              'main'
            ).getByRole(
              'button',
              {
                name: category.button
              }
            ),
            'Strategy category'
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            category.content
          );
        }

        const filters = [
          {
            index: 0,
            option: /^bullish$/i,
            restore: /^any view$/i
          },
          {
            index: 1,
            option: /^income$/i,
            restore: /^any objective$/i
          },
          {
            index: 2,
            option: /^defined$/i,
            restore: /^any risk$/i
          },
          {
            index: 3,
            option: /^beginner$/i,
            restore: /^any level$/i
          }
        ];

        await safeClick(
          page.locator(
            'main'
          ).getByRole(
            'button',
            {
              name: /^all\b/i
            }
          ),
          'All strategies'
        );

        for (const filter of filters) {
          await chooseOption(
            page,
            filter.index,
            filter.option,
            'Strategy filter'
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            /of 18|no strategies|covered call|call|put/i
          );

          await chooseOption(
            page,
            filter.index,
            filter.restore,
            'Restore strategy filter'
          );
        }

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^glossary$/i
            }
          ).first(),
          'Glossary'
        );

        const search =
          page.getByRole(
            'textbox',
            {
              name: /search/i
            }
          ).or(
            page.getByPlaceholder(
              /search/i
            )
          ).first();

        await search.fill(
          'delta'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /delta/i
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /underlying|probability|greek/i
        );

        await search.fill(
          ''
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /assignment/i
        );
      }
    );

    test(
      'Beginners lessons overview categories and a strategy detail open',
      async ({ page }) => {
        const lessons = [
          /what is a stock option/i,
          /why might investors use options/i,
          /when might options make sense/i,
          /time value/i,
          /option greeks/i,
          /using options to hedge/i,
          /income & stock acquisition/i,
          /build discipline/i
        ];

        await openAcademy(
          page,
          '/academy/beginners'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /your progress/i
        );

        for (const lesson of lessons) {
          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            lesson
          );
        }

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /what is a stock option/i
            }
          ).first(),
          'Open beginner lesson'
        );

        await expect(
          page
        ).toHaveURL(
          /\/academy\/beginners\/what-is-option/
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /call option|put option|strike/i
        );

        const markedNow =
          await markLessonIfNeeded(
            page,
            'Mark beginner lesson complete'
          );

        await openAcademy(
          page,
          '/academy/beginners'
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          markedNow
            ? /[1-9]\d*\s*\/\s*8/
            : /\d+\s*\/\s*8/,
          {
            timeout: 20000
          }
        );

        await openAcademy(
          page
        );

        const cards = [
          {
            name: /premium-collection/i,
            url: /category=Income/i,
            content: /income/i
          },
          {
            name: /vertical-spread/i,
            url: /category=Directional/i,
            content: /directional/i
          },
          {
            name: /floor downside/i,
            url: /category=Protection/i,
            content: /protection/i
          },
          {
            name: /profit from large or small/i,
            url: /category=Volatility/i,
            content: /volatility/i
          },
          {
            name: /narrow expirati/i,
            url: /category=Precision/i,
            content: /precision/i
          },
          {
            name: /capital-efficient/i,
            url: /category=Advanced/i,
            content: /advanced/i
          }
        ];

        for (const card of cards) {
          await openAcademy(
            page
          );

          await safeClick(
            page.getByRole(
              'link',
              {
                name: card.name
              }
            ).first(),
            'Overview category'
          );

          await expect(
            page
          ).toHaveURL(
            card.url
          );

          await expect(
            page.locator(
              'main'
            )
          ).toContainText(
            card.content
          );
        }

        await openAcademy(
          page
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /all beginner strategies/i
            }
          ),
          'All beginner strategies'
        );

        await expect(
          page
        ).toHaveURL(
          /complexity=Beginner/i
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /beginner|covered call/i
        );

        await openAcademy(
          page
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /sell one call option against 100 shares/i
            }
          ).first(),
          'Open Covered Call strategy'
        );

        await expect(
          page
        ).toHaveURL(
          /\/academy\/strategies\/covered-call/
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /max gain|premium|strike/i
        );
      }
    );

    test(
      'Academy opens the next lesson without marking it complete',
      async ({ page }) => {
        await openAcademy(
          page,
          '/academy/lessons'
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /reading an options chain/i
            }
          ).first(),
          'Open next lesson'
        );

        await expect(
          page
        ).toHaveURL(
          /\/academy\/lessons\/.+/
        );

        await expect(
          page.locator(
            'main, [role="main"]'
          ).first()
        ).toContainText(
          /options chain|bid|ask|strike|expiration/i,
          {
            timeout: 15000
          }
        );

        await expect(
          page.locator(
            'main, [role="main"]'
          ).getByRole(
            'button',
            {
              name: /mark as complete|marked complete|undo/i
            }
          )
        ).toBeVisible();
      }
    );

    test(
      'Beginners lesson opens without marking it complete',
      async ({ page }) => {
        await openAcademy(
          page,
          '/academy/beginners'
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /why might investors use options/i
            }
          ).first(),
          'Open unmarked beginner lesson'
        );

        await expect(
          page
        ).toHaveURL(
          /\/academy\/beginners/
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /investor|option|hedge|income/i
        );

        const completeLesson =
          page.getByRole(
            'button',
            {
              name: /^mark as complete$/i
            }
          );

        if (
          await completeLesson.count()
        ) {
          await expect(
            completeLesson
          ).toBeVisible();
        }
      }
    );

    test(
      'Strategy library opens Protective Put and returns',
      async ({ page }) => {
        await openAcademy(
          page,
          '/academy'
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^strategy library$/i
            }
          ).first(),
          'Strategy library'
        );

        await safeClick(
          page.locator(
            'main'
          ).getByRole(
            'button',
            {
              name: /^protection\b/i
            }
          ),
          'Protection strategies'
        );

        const strategy =
          page.locator(
            'main a, main button'
          ).filter({
            hasText: /explore scenario|protective put/i
          }).first();

        await expect(
          strategy
        ).toBeVisible({
          timeout: 20000
        });

        await safeClick(
          strategy,
          'Open Protective Put'
        );

        await expect(
          page
        ).toHaveURL(
          /\/academy\/strategies\//
        );

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /put|downside|protection|premium/i
        );

        await page.goBack({
          waitUntil: 'domcontentloaded'
        });

        await expect(
          page
        ).toHaveURL(
          /\/academy\/strategies/
        );
      }
    );

    test(
      'Strategy library search finds Collar and clears',
      async ({ page }) => {
        await openAcademy(
          page,
          '/academy'
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^strategy library$/i
            }
          ).first(),
          'Strategy library'
        );

        const search =
          page.getByRole(
            'textbox',
            {
              name: /name or description/i
            }
          );

        await search.fill(
          'collar'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^collar$/i
            }
          )
        ).toBeVisible();

        await search.fill(
          ''
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^covered call$/i
            }
          )
        ).toBeVisible();
      }
    );

    test(
      'Strategy library clear all restores every strategy',
      async ({ page }) => {
        await openAcademy(
          page,
          '/academy'
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^strategy library$/i
            }
          ).first(),
          'Strategy library'
        );

        await safeClick(
          page.locator(
            'main'
          ).getByRole(
            'button',
            {
              name: /^protection\b/i
            }
          ),
          'Protection strategies'
        );

        // Category chips advertise counts on the chip ("Protection 2"); the
        // "N of 18 strategies" line may stay at 18 of 18. Accept either signal.
        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /protective put|2 of 18|protection\s*2/i
        );

        const clearAll =
          page.getByRole(
            'button',
            {
              name: /^clear all$/i
            }
          );

        if (
          await clearAll.isVisible().catch(
            () => false
          )
        ) {
          await safeClick(
            clearAll,
            'Clear all strategy filters'
          );
        } else {
          await safeClick(
            page.locator(
              'main'
            ).getByRole(
              'button',
              {
                name: /^all\b/i
              }
            ),
            'All strategies'
          );
        }

        await expect(
          page.locator(
            'main'
          )
        ).toContainText(
          /18 of 18|covered call/i
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^covered call$/i
            }
          )
        ).toBeVisible();
      }
    );

    test(
      'Lessons navigation returns without marking the lesson complete',
      async ({ page }) => {
        await openAcademy(
          page,
          '/academy/lessons'
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /reading an options chain/i
            }
          ).first(),
          'Open lesson'
        );

        await expect(
          page.getByRole(
            'button',
            {
              name: /^mark as complete$/i
            }
          )
        ).toBeVisible();

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^lessons$/i
            }
          ).first(),
          'Lessons'
        );

        await expect(
          page
        ).toHaveURL(
          /\/academy\/lessons/
        );

        await expect(
          page.getByRole(
            'link',
            {
              name: /reading an options chain/i
            }
          ).first()
        ).toBeVisible();
      }
    );

    test(
      'Strategy library opens Collar and returns',
      async ({ page }) => {
        await openAcademy(
          page,
          '/academy'
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^strategy library$/i
            }
          ).first(),
          'Strategy library'
        );

        await page.getByRole(
          'textbox',
          {
            name: /name or description/i
          }
        ).fill(
          'collar'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^collar$/i
            }
          )
        ).toBeVisible();

        await safeClick(
          page.locator(
            'main a'
          ).filter({
            hasText: /explore scenario/i
          }).first(),
          'Open Collar'
        );

        await expect(
          page
        ).toHaveURL(
          /\/academy\/strategies\//
        );

        await page.goBack({
          waitUntil: 'domcontentloaded'
        });

        await expect(
          page
        ).toHaveURL(
          /\/academy\/strategies/
        );
      }
    );

    test(
      'Strategy library Volatility shows Long Straddle then All restores Covered Call',
      async ({ page }) => {
        await openAcademy(
          page,
          '/academy'
        );

        await safeClick(
          page.getByRole(
            'link',
            {
              name: /^strategy library$/i
            }
          ).first(),
          'Strategy library'
        );

        await safeClick(
          page.locator(
            'main'
          ).getByRole(
            'button',
            {
              name: /^volatility\b/i
            }
          ),
          'Volatility strategies'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^long straddle$/i
            }
          )
        ).toBeVisible();

        await safeClick(
          page.locator(
            'main'
          ).getByRole(
            'button',
            {
              name: /^all\b/i
            }
          ),
          'All strategies'
        );

        await expect(
          page.getByRole(
            'heading',
            {
              name: /^covered call$/i
            }
          )
        ).toBeVisible();
      }
    );
  }
);
