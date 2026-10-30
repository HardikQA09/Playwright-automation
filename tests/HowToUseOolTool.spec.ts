import {
  test,
  expect,
  Page
} from '@playwright/test';

import {
  BASE_URL,
  TEST_USERS
} from './config/testData';

import {
  generateEmail,
  generateMobileNumber
} from './utils/emailGenerator';

import {
  skipUnlessEmailVerificationReady,
  waitForManualEmailVerification
} from './helpers/emailVerification';

import {
  LoginPage
} from './pages/LoginPage';

import {
  DashboardPage
} from './pages/DashboardPage';

import {
  HowToUseOolToolPage
} from './pages/HowToUseOolToolPage';

import {
  RegistrationPage
} from './pages/RegistrationPage';

import {
  MobileVerificationPage
} from './pages/MobileVerificationPage';

import {
  RiskProfilePage
} from './pages/RiskProfilePage';

import {
  CompliancePage
} from './pages/CompliancePage';

import {
  PlanSelectionPage
} from './pages/PlanSelectionPage';

/* =============================================================================
TEST SUITE: How to use OolTool (profile menu)

PURPOSE
-------
Open "How to use OolTool" from the profile avatar menu and validate the
7-step member guide for:

1. Completed: imhardikthanki+e2e@gmail.com → 7 of 7 / finished path
2. Pending: first prepared candidate that is not 7/7; otherwise create a
   disposable Curious Explorer (free) user who still has incomplete steps

RUN
---
npx playwright test tests/HowToUseOolTool.spec.ts --reporter=line
============================================================================= */

type FixtureUser = {
  email: string;
  password: string;
  label: string;
};

function pendingCandidates(): FixtureUser[] {
  const fromEnvEmail =
    process.env.HOW_TO_USE_PENDING_EMAIL?.trim();
  const fromEnvPassword =
    process.env.HOW_TO_USE_PENDING_PASSWORD?.trim();

  const list: FixtureUser[] = [];

  if (
    fromEnvEmail &&
    fromEnvPassword
  ) {
    list.push({
      email: fromEnvEmail,
      password: fromEnvPassword,
      label: 'env-pending'
    });
  }

  list.push(
    {
      email: TEST_USERS.subscriber.email,
      password: TEST_USERS.subscriber.password,
      label: 'plantest'
    }
  );

  return list.filter(
    (user) =>
      user.email.toLowerCase() !==
      TEST_USERS.e2e.email.toLowerCase()
  );
}

async function loginAs(
  page: Page,
  email: string,
  password: string
) {
  await page.context().clearCookies();
  await page.goto(
    `${BASE_URL}/login`,
    {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    }
  );

  await new LoginPage(
    page
  ).login(
    email,
    password
  );

  await new DashboardPage(
    page
  ).validateLoaded();
}

async function openGuideProgress(
  page: Page
) {
  const dashboard =
    new DashboardPage(
      page
    );

  await dashboard.openHowToUseOolToolFromProfileMenu();

  const guide =
    new HowToUseOolToolPage(
      page
    );

  await guide.validateLoaded();

  return {
    guide,
    progress: await guide.readProgress()
  };
}

async function createDisposablePendingUser(
  page: Page
) {
  skipUnlessEmailVerificationReady();

  const email =
    generateEmail(
      'how-to-use-pending'
    );

  const mobileNumber =
    generateMobileNumber();

  console.warn(
    `[how-to-use] creating disposable pending fixture ${email}`
  );

  await page.context().clearCookies();
  await page.goto(
    'about:blank'
  ).catch(
    () => undefined
  );

  const registration =
    new RegistrationPage(
      page
    );

  await registration.open();
  await registration.register(
    email,
    mobileNumber
  );

  await waitForManualEmailVerification(
    page,
    email
  );

  await new LoginPage(
    page
  ).login(
    email,
    TEST_USERS.onboarding.password
  );

  await new MobileVerificationPage(
    page
  ).completeIfVisible(
    mobileNumber
  );

  await new RiskProfilePage(
    page
  ).fill();

  await new CompliancePage(
    page
  ).fill();

  await expect(
    page.getByText(
      /choose your plan|select a plan|get started/i
    ).first()
  ).toBeVisible({
    timeout: 30000
  });

  await new PlanSelectionPage(
    page
  ).selectPlan(
    'Curious Explorer'
  );

  await expect(
    page
  ).not.toHaveURL(
    /checkout\.stripe\.com/
  );

  await new DashboardPage(
    page
  ).validateLoaded();

  return email;
}

test.describe(
  'How to use OolTool',
  () => {
    test.describe.configure({
      timeout: 20 * 60 * 1000
    });

    test(
      'Completed e2e account shows 7 of 7 finished path from profile menu',
      async ({ page }) => {
        test.setTimeout(
          180000
        );

        await loginAs(
          page,
          TEST_USERS.e2e.email,
          TEST_USERS.e2e.password
        );

        const dashboard =
          new DashboardPage(
            page
          );

        await dashboard.openHowToUseOolToolFromProfileMenu();

        await new HowToUseOolToolPage(
          page
        ).validateCompletedPath();
      }
    );

    test(
      'Pending account shows incomplete steps out of 7 from profile menu',
      async ({ page }) => {
        let usedLabel =
          'unknown';
        let foundPending =
          false;

        for (const candidate of pendingCandidates()) {
          try {
            await loginAs(
              page,
              candidate.email,
              candidate.password
            );

            const {
              guide,
              progress
            } =
              await openGuideProgress(
                page
              );

            if (
              progress.completed < 7 &&
              !progress.finished
            ) {
              usedLabel =
                candidate.label;
              test.info().annotations.push({
                type: 'fixture',
                description: `Pending How-to-use fixture: ${candidate.email} (${progress.completed}/7)`
              });
              await guide.validatePendingPath();
              foundPending = true;
              break;
            }

            console.warn(
              `[how-to-use] ${candidate.email} is already ${progress.completed}/7 — trying next fixture`
            );
          } catch (error) {
            console.warn(
              `[how-to-use] ${candidate.email} unavailable (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`
            );
          }
        }

        if (
          foundPending
        ) {
          expect(
            usedLabel.length
          ).toBeGreaterThan(
            0
          );
          return;
        }

        // Prepared paid fixtures are often already 7/7. Create a free disposable
        // user so holdings/accounts steps stay pending.
        const email =
          await createDisposablePendingUser(
            page
          );

        test.info().annotations.push({
          type: 'fixture',
          description: `Disposable pending How-to-use fixture: ${email}`
        });

        const {
          guide,
          progress
        } =
          await openGuideProgress(
            page
          );

        expect(
          progress.completed,
          `Disposable free user should not be 7/7 (got ${progress.completed}).`
        ).toBeLessThan(
          7
        );

        await guide.validatePendingPath();
      }
    );
  }
);
