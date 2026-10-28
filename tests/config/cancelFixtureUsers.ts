import {
  TEST_USERS
} from './testData';

import {
  resolvePreparedUser
} from './preparedSubscriptionUsers';

/* =============================================================================
Prepared cancel fixtures (non-destructive inspect only).

Resolved from tests/config/preparedSubscriptionUsers.ts so scenario emails stay
identifiable and reusable every day.

  Yearly → CANCEL_YEARLY_INSPECT (cancel-at-expiry / refund option copy)
  Monthly → CANCEL_MONTHLY_INSPECT (cancel form / Keep my plan)

Override with CANCEL_YEARLY_EMAIL / CANCEL_MONTHLY_EMAIL (and passwords) or the
SUB_LIFECYCLE_*_CANCEL_* aliases when needed.

IMPORTANT: +e2e uses TEST_USERS.e2e.password (H@rdik9944), NOT the shared
onboarding / SUB_LIFECYCLE_PAID password (Test@123456). Mixing those locks the
account after a few failed Sign In attempts. +monthly-to-a uses cancelMonthly.
============================================================================= */

function passwordForCancelFixture(
  email: string,
  preparedPassword: string,
  envPasswordName: string
) {
  const fromEnv =
    process.env[envPasswordName]?.trim();

  if (
    fromEnv
  ) {
    return fromEnv;
  }

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
      process.env.CANCEL_YEARLY_PASSWORD?.trim() ||
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

  if (
    /monthly-to-a/i.test(
      email
    )
  ) {
    return (
      process.env.CANCEL_MONTHLY_PASSWORD?.trim() ||
      TEST_USERS.cancelMonthly?.password ||
      'Test@123456'
    );
  }

  return preparedPassword;
}

const yearly =
  resolvePreparedUser(
    'CANCEL_YEARLY_INSPECT'
  );

const monthly =
  resolvePreparedUser(
    'CANCEL_MONTHLY_INSPECT'
  );

function firstEmail(
  ...candidates: Array<string | undefined>
) {
  for (const value of candidates) {
    const trimmed =
      value?.trim();

    if (
      trimmed
    ) {
      return trimmed;
    }
  }

  return '';
}

export const CANCEL_FIXTURE_USERS = {
  yearly: {
    email:
      firstEmail(
        process.env.SUB_LIFECYCLE_YEARLY_CANCEL_EMAIL,
        process.env.CANCEL_YEARLY_EMAIL,
        yearly.email
      ),
    password:
      passwordForCancelFixture(
        firstEmail(
          process.env.SUB_LIFECYCLE_YEARLY_CANCEL_EMAIL,
          process.env.CANCEL_YEARLY_EMAIL,
          yearly.email
        ),
        yearly.password,
        'SUB_LIFECYCLE_YEARLY_CANCEL_PASSWORD'
      )
  },
  monthly: {
    // Prefer a real monthly cancel fixture. Do NOT fall back to plantest
    // (annual Overlay) — that forces monthly cancel rows to skip.
    // When unset, loginCancelFixture buys a disposable monthly user if
    // SUB_LIFECYCLE_CREATE_DISPOSABLE_USER=true.
    email:
      firstEmail(
        process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL,
        process.env.CANCEL_MONTHLY_EMAIL,
        /plantest/i.test(
          monthly.email
        )
          ? ''
          : monthly.email
      ),
    password:
      passwordForCancelFixture(
        firstEmail(
          process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL,
          process.env.CANCEL_MONTHLY_EMAIL,
          monthly.email
        ),
        monthly.password,
        'SUB_LIFECYCLE_MONTHLY_CANCEL_PASSWORD'
      )
  }
};
