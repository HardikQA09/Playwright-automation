import fs from 'fs';
import path from 'path';

import {
  expect,
  test
} from '@playwright/test';

import {
  PLAN_PRICES,
  TEST_USERS
} from './config/testData';
import {
  skipUnlessEmailVerificationReady,
  waitForManualEmailVerification
} from './helpers/emailVerification';
import { BillingPage } from './pages/BillingPage';
import { CompliancePage } from './pages/CompliancePage';
import { LoginPage } from './pages/LoginPage';
import { MobileVerificationPage } from './pages/MobileVerificationPage';
import { PlanSelectionPage } from './pages/PlanSelectionPage';
import { RegistrationPage } from './pages/RegistrationPage';
import { RiskProfilePage } from './pages/RiskProfilePage';
import { StripePaymentPage } from './pages/StripePaymentPage';
import { generateMobileNumber } from './utils/emailGenerator';

/* =============================================================================
PrepareNamedFixtures

Creates the named fx-* accounts from preparedSubscriptionUsers.data.json on UAT,
then writes them to test-results/prepared-fixtures.json for .env persistence.

  npm run fixtures:prepare
  npm run fixtures:prepare -- --keys=UPGRADE_CALC_DAILY,CANCEL_MONTHLY_INSPECT

File is prefixed with _ so it is not part of the daily AIR / complete inventory.

Requires GMAIL_APP_PASSWORD (auto verify) and Stripe test mode checkout.
============================================================================= */

type PlanName = 'Income Builder' | 'Overlay Strategists' | 'Portfolio Hedger';
type BillingInterval = 'monthly' | 'annual' | 'none';

type RosterUser = {
  key: string;
  tag: string;
  label?: string;
  plan: string;
  interval: BillingInterval | string;
  safeDaily?: boolean;
  mutateRisk?: string;
  envEmail: string;
  envPassword: string;
};

type PreparedResult = {
  key: string;
  label: string;
  email: string;
  password: string;
  plan: string;
  interval: string;
  envEmail: string;
  envPassword: string;
  status: 'created' | 'reused' | 'skipped' | 'failed';
  detail: string;
};

const rosterPath = path.join(
  __dirname,
  'config',
  'preparedSubscriptionUsers.data.json'
);
const resultsPath = path.join(
  process.cwd(),
  'test-results',
  'prepared-fixtures.json'
);

const roster = JSON.parse(
  fs.readFileSync(rosterPath, 'utf8')
) as {
  emailLocalBase: string;
  emailDomain: string;
  users: RosterUser[];
};

const password =
  process.env.SUBSCRIPTION_FIXTURE_PASSWORD?.trim() ||
  TEST_USERS.onboarding.password;

function canonicalEmail(tag: string) {
  const base =
    (
      process.env.ONBOARDING_EMAIL_BASE ||
      `${roster.emailLocalBase}@${roster.emailDomain}`
    )
      .split('+')[0]
      .split('@')[0];
  const domain =
    (
      process.env.ONBOARDING_EMAIL_BASE ||
      `${roster.emailLocalBase}@${roster.emailDomain}`
    ).split('@')[1] || roster.emailDomain;
  return `${base}+${tag}@${domain}`;
}

function selectedKeys(): string[] {
  const raw =
    process.env.PREPARE_FIXTURE_KEYS?.trim() ||
    'UPGRADE_CALC_DAILY,CANCEL_MONTHLY_INSPECT,DOWNGRADE_CALC_DAILY';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function paidBillingCopy(plan: PlanName, interval: 'monthly' | 'annual') {
  const price = String(PLAN_PRICES[plan][interval]).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ',?'
  );
  return interval === 'monthly'
    ? new RegExp(`${price}|per month|monthly|subscription|total`, 'i')
    : new RegExp(`${price}|per year|annual|subscription|total|due`, 'i');
}

function readResults(): PreparedResult[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    return Array.isArray(parsed?.results) ? parsed.results : [];
  } catch {
    return [];
  }
}

function writeResult(result: PreparedResult) {
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  const existing = readResults().filter((row) => row.key !== result.key);
  existing.push(result);
  fs.writeFileSync(
    resultsPath,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        results: existing
      },
      null,
      2
    )
  );
  console.log(
    `[prepare] ${result.status.toUpperCase()} ${result.key} → ${result.email} (${result.detail})`
  );
}

async function loginWorks(
  page: import('@playwright/test').Page,
  email: string,
  expectedPlan: string,
  interval: string
) {
  await page.context().clearCookies();
  await page.goto('about:blank').catch(() => undefined);

  try {
    await new LoginPage(page).login(email, password);
  } catch (error) {
    return {
      ok: false as const,
      detail: `login failed: ${error instanceof Error ? error.message : String(error)}`.slice(
        0,
        180
      )
    };
  }

  if (interval === 'none' || expectedPlan === 'Curious Explorer') {
    const onPlans = await page
      .getByText(/choose your plan|select a plan|get started/i)
      .first()
      .isVisible({ timeout: 15000 })
      .catch(() => false);
    return onPlans
      ? { ok: true as const, detail: 'already on plan selection / free' }
      : { ok: true as const, detail: 'logged in (free/plan-ready assumed)' };
  }

  const billing = new BillingPage(page);
  try {
    await billing.validateOverview();
    await billing.validateActivePlan(expectedPlan as PlanName);
    return { ok: true as const, detail: `already on ${expectedPlan}` };
  } catch (error) {
    return {
      ok: false as const,
      detail: `logged in but plan mismatch: ${error instanceof Error ? error.message : String(error)}`.slice(
        0,
        180
      )
    };
  }
}

async function registerNamedUser(
  page: import('@playwright/test').Page,
  email: string
) {
  skipUnlessEmailVerificationReady();
  const mobileNumber = generateMobileNumber();

  await new RegistrationPage(page).open();
  await new RegistrationPage(page).register(email, mobileNumber);
  await waitForManualEmailVerification(page, email);
  await new LoginPage(page).login(email, password);
  await new RegistrationPage(page).dismissMarketingOverlays();
  await new MobileVerificationPage(page).completeIfVisible(mobileNumber);
  await new RiskProfilePage(page).fill();
  await new CompliancePage(page).fill();

  await expect(
    page.getByText(/choose your plan|select a plan|get started/i).first()
  ).toBeVisible({ timeout: 30000 });

  return { email, mobileNumber };
}

async function buyPlan(
  page: import('@playwright/test').Page,
  email: string,
  plan: PlanName,
  interval: 'monthly' | 'annual'
) {
  const planPage = new PlanSelectionPage(page);
  if (interval === 'annual') {
    await planPage.selectAnnualBilling();
  } else {
    await planPage.selectMonthlyBilling();
  }
  await planPage.selectPlan(plan);

  await new StripePaymentPage(page).validateSubscriptionCheckoutDetails({
    expectedEmail: email,
    expectedPlan: plan,
    expectedBillingCopy: paidBillingCopy(plan, interval)
  });
  await new StripePaymentPage(page).completePayment();
  await new BillingPage(page).validateActivePlan(plan);
}

const keys = selectedKeys();
const users = roster.users.filter((user) => keys.includes(user.key));

test.describe.configure({ mode: 'serial' });

test.describe('Prepare named fx-* fixtures', () => {
  test.setTimeout(45 * 60 * 1000);

  for (const user of users) {
    test(`Prepare ${user.key} (${user.label || user.tag})`, async ({ page }) => {
      const email = canonicalEmail(user.tag);
      const interval = String(user.interval || 'none');
      const plan = user.plan;

      const existing = await loginWorks(page, email, plan, interval);
      if (existing.ok) {
        writeResult({
          key: user.key,
          label: user.label || user.key,
          email,
          password,
          plan,
          interval,
          envEmail: user.envEmail,
          envPassword: user.envPassword,
          status: 'reused',
          detail: existing.detail
        });
        return;
      }

      console.log(
        `[prepare] ${user.key}: ${existing.detail} — creating ${email}`
      );

      try {
        await registerNamedUser(page, email);

        if (interval !== 'none' && plan !== 'Curious Explorer') {
          await buyPlan(
            page,
            email,
            plan as PlanName,
            interval === 'annual' ? 'annual' : 'monthly'
          );
        }

        writeResult({
          key: user.key,
          label: user.label || user.key,
          email,
          password,
          plan,
          interval,
          envEmail: user.envEmail,
          envPassword: user.envPassword,
          status: 'created',
          detail: `registered + ${interval === 'none' ? 'left on plan selection' : `purchased ${plan} ${interval}`}`
        });
      } catch (error) {
        writeResult({
          key: user.key,
          label: user.label || user.key,
          email,
          password,
          plan,
          interval,
          envEmail: user.envEmail,
          envPassword: user.envPassword,
          status: 'failed',
          detail: (error instanceof Error ? error.message : String(error)).slice(
            0,
            300
          )
        });
        throw error;
      }
    });
  }

  if (users.length === 0) {
    test('No fixture keys selected', async () => {
      test.skip(
        true,
        `No roster keys matched PREPARE_FIXTURE_KEYS=${process.env.PREPARE_FIXTURE_KEYS || ''}`
      );
    });
  }
});
