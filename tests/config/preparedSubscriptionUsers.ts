import fs from 'fs';
import path from 'path';

import {
  TEST_USERS
} from './testData';

/* =============================================================================
CONFIG: Prepared (reusable) subscription users

Stable, scenario-named Gmail plus-addresses you prepare ONCE and reuse every day
for non-destructive checks (upgrade calc, downgrade, cancel, retention, email).

Source of truth: preparedSubscriptionUsers.data.json
  imhardikthanki+sub-<scenario-tag>@gmail.com

Disposable / one-shot packs stay in subscriptionScenarioUsers.ts.
============================================================================= */

export type PreparedPlan =
  | 'Curious Explorer'
  | 'Income Builder'
  | 'Overlay Strategists'
  | 'Portfolio Hedger';

export type PreparedInterval =
  | 'none'
  | 'monthly'
  | 'annual';

export type PreparedMutateRisk =
  | 'none'
  | 'preview-only'
  | 'destructive';

export type PreparedSubscriptionUserDefinition = {
  key: string;
  tag: string;
  label?: string;
  canonicalEmail: string;
  legacyEmail?: string;
  plan: PreparedPlan;
  interval: PreparedInterval;
  purpose: string;
  tests?: string[];
  validates: string[];
  safeDaily: boolean;
  mutateRisk: PreparedMutateRisk;
  envEmail: string;
  envPassword: string;
};

type RawRoster = {
  emailLocalBase: string;
  emailDomain: string;
  naming?: Record<string, unknown>;
  users: Array<{
    key: string;
    tag: string;
    label?: string;
    legacyEmail?: string;
    plan: PreparedPlan;
    interval: PreparedInterval;
    purpose: string;
    tests?: string[];
    validates: string[];
    safeDaily: boolean;
    mutateRisk: PreparedMutateRisk;
    envEmail: string;
    envPassword: string;
  }>;
};

const rosterPath =
  path.join(
    __dirname,
    'preparedSubscriptionUsers.data.json'
  );

const roster =
  JSON.parse(
    fs.readFileSync(
      rosterPath,
      'utf8'
    )
  ) as RawRoster;

function emailBaseLocal() {
  const fromEnv =
    process.env.ONBOARDING_EMAIL_BASE ??
    TEST_USERS.onboarding.emailBase;

  if (
    fromEnv
  ) {
    return fromEnv
      .split('+')[0]
      .split('@')[0];
  }

  return roster.emailLocalBase;
}

function emailDomain() {
  const fromEnv =
    process.env.ONBOARDING_EMAIL_BASE ??
    TEST_USERS.onboarding.emailBase;

  if (
    fromEnv?.includes(
      '@'
    )
  ) {
    return fromEnv.split('@')[1];
  }

  return roster.emailDomain;
}

function plusAddress(
  tag: string
) {
  return `${emailBaseLocal()}+${tag}@${emailDomain()}`;
}

function sharedPassword() {
  return (
    process.env.SUBSCRIPTION_FIXTURE_PASSWORD ??
    process.env.SUB_LIFECYCLE_PAID_PASSWORD ??
    TEST_USERS.onboarding.password ??
    'Test@123456'
  );
}

function passwordForEmail(
  email: string
) {
  const normalized =
    email.toLowerCase();

  if (
    normalized ===
      TEST_USERS.e2e.email.toLowerCase() ||
    /(?:^|\+)e2e@/i.test(
      email
    )
  ) {
    return (
      process.env.E2E_PASSWORD?.trim() ||
      TEST_USERS.e2e.password
    );
  }

  if (
    normalized ===
      TEST_USERS.subscriber.email.toLowerCase() ||
    /(?:^|\+)plantest@/i.test(
      email
    )
  ) {
    return (
      process.env.SUBSCRIBER_PASSWORD?.trim() ||
      TEST_USERS.subscriber.password
    );
  }

  // Known monthly paid fixture from test-data.json cancelMonthly.
  // Do NOT fall through to SUB_LIFECYCLE_PAID_PASSWORD (plantest / H@rdik9944).
  if (
    /monthly-to-a/i.test(
      email
    )
  ) {
    return (
      process.env.CANCEL_MONTHLY_PASSWORD?.trim() ||
      process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_PASSWORD?.trim() ||
      TEST_USERS.cancelMonthly?.password ||
      'Test@123456'
    );
  }

  return sharedPassword();
}

function preferCanonicalEmails() {
  return [
    '1',
    'true',
    'yes',
    'on'
  ].includes(
    (
      process.env.SUB_FIXTURE_USE_CANONICAL_EMAILS ??
      ''
    ).toLowerCase()
  );
}

function buildDefinitions() {
  const map: Record<
    string,
    PreparedSubscriptionUserDefinition
  > = {};

  for (const row of roster.users) {
    const legacy =
      row.legacyEmail &&
      row.legacyEmail.trim()
        ? row.legacyEmail.trim()
        : undefined;

    map[row.key] = {
      key:
        row.key,
      tag:
        row.tag,
      label:
        row.label,
      canonicalEmail:
        plusAddress(
          row.tag
        ),
      legacyEmail:
        legacy,
      plan:
        row.plan,
      interval:
        row.interval,
      purpose:
        row.purpose,
      tests:
        row.tests,
      validates:
        row.validates,
      safeDaily:
        row.safeDaily,
      mutateRisk:
        row.mutateRisk,
      envEmail:
        row.envEmail,
      envPassword:
        row.envPassword
    };
  }

  return map;
}

export const PREPARED_SUBSCRIPTION_USERS =
  buildDefinitions();

export type PreparedSubscriptionUserKey =
  string;

export type ResolvedPreparedUser =
  PreparedSubscriptionUserDefinition & {
    email: string;
    password: string;
    usingLegacyEmail: boolean;
  };

function envValue(
  name: string
) {
  const value =
    process.env[name];

  return value &&
    value.trim()
    ? value.trim()
    : undefined;
}

export function resolvePreparedUser(
  key: string
): ResolvedPreparedUser {
  const definition =
    PREPARED_SUBSCRIPTION_USERS[key];

  if (
    !definition
  ) {
    throw new Error(
      `Unknown prepared subscription user "${key}". See tests/config/preparedSubscriptionUsers.data.json`
    );
  }

  const fromEnv =
    envValue(
      definition.envEmail
    );

  const email =
    fromEnv ??
    (
      preferCanonicalEmails()
        ? definition.canonicalEmail
        : (
          definition.legacyEmail ??
          definition.canonicalEmail
        )
    );

  return {
    ...definition,
    email,
    password:
      envValue(
        definition.envPassword
      ) ??
      passwordForEmail(
        email
      ),
    usingLegacyEmail:
      !fromEnv &&
      !preferCanonicalEmails() &&
      !!definition.legacyEmail &&
      email ===
        definition.legacyEmail
  };
}

export function listPreparedUsers() {
  return Object.keys(
    PREPARED_SUBSCRIPTION_USERS
  ).map(
    (key) =>
      resolvePreparedUser(
        key
      )
  );
}

export function preparedUserEnvDefaults(
  options: {
    includeDestructive?: boolean;
    preferCanonical?: boolean;
  } = {}
) {
  const previous =
    process.env.SUB_FIXTURE_USE_CANONICAL_EMAILS;

  if (
    options.preferCanonical
  ) {
    process.env.SUB_FIXTURE_USE_CANONICAL_EMAILS =
      'true';
  }

  try {
    const env: Record<string, string> = {
      SUB_LIFECYCLE_USE_PREPARED_USER:
        'true',
      SUBSCRIPTION_FIXTURE_PASSWORD:
        sharedPassword()
    };

    for (const user of listPreparedUsers()) {
      if (
        !options.includeDestructive &&
        user.mutateRisk ===
          'destructive'
      ) {
        continue;
      }

      env[user.envEmail] =
        user.email;
      env[user.envPassword] =
        user.password;
    }

    const upgrade =
      resolvePreparedUser(
        'UPGRADE_CALC_DAILY'
      );
    const portal =
      resolvePreparedUser(
        'BILLING_PORTAL'
      );
    const yearlyCancel =
      resolvePreparedUser(
        'CANCEL_YEARLY_INSPECT'
      );
    const monthlyCancel =
      resolvePreparedUser(
        'CANCEL_MONTHLY_INSPECT'
      );

    env.SUB_LIFECYCLE_PAID_EMAIL =
      upgrade.email;
    env.SUB_LIFECYCLE_PAID_PASSWORD =
      upgrade.password;
    env.BILLING_MANAGEMENT_EMAIL =
      portal.email;
    env.BILLING_MANAGEMENT_PASSWORD =
      portal.password;
    env.SUB_LIFECYCLE_YEARLY_CANCEL_EMAIL =
      yearlyCancel.email;
    env.SUB_LIFECYCLE_YEARLY_CANCEL_PASSWORD =
      yearlyCancel.password;
    env.CANCEL_YEARLY_EMAIL =
      yearlyCancel.email;
    env.CANCEL_YEARLY_PASSWORD =
      yearlyCancel.password;
    env.SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL =
      monthlyCancel.email;
    env.SUB_LIFECYCLE_MONTHLY_CANCEL_PASSWORD =
      monthlyCancel.password;
    env.CANCEL_MONTHLY_EMAIL =
      monthlyCancel.email;
    env.CANCEL_MONTHLY_PASSWORD =
      monthlyCancel.password;

    return env;
  } finally {
    if (
      previous === undefined
    ) {
      delete process.env.SUB_FIXTURE_USE_CANONICAL_EMAILS;
    } else {
      process.env.SUB_FIXTURE_USE_CANONICAL_EMAILS =
        previous;
    }
  }
}
