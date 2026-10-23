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
account after a few failed Sign In attempts.
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

  const e2eEmail =
    TEST_USERS.e2e.email.toLowerCase();

  if (
    email.toLowerCase() ===
      e2eEmail ||
    /(?:^|\+)e2e@/i.test(
      email
    )
  ) {
    return (
      process.env.E2E_PASSWORD?.trim() ||
      TEST_USERS.e2e.password
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

export const CANCEL_FIXTURE_USERS = {
  yearly: {
    email:
      process.env.SUB_LIFECYCLE_YEARLY_CANCEL_EMAIL ??
      yearly.email,
    password:
      passwordForCancelFixture(
        process.env.SUB_LIFECYCLE_YEARLY_CANCEL_EMAIL ??
          yearly.email,
        yearly.password,
        'SUB_LIFECYCLE_YEARLY_CANCEL_PASSWORD'
      )
  },
  monthly: {
    email:
      process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL ??
      process.env.SUB_LIFECYCLE_PAID_EMAIL ??
      monthly.email,
    password:
      process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_PASSWORD ??
      process.env.SUB_LIFECYCLE_PAID_PASSWORD ??
      passwordForCancelFixture(
        process.env.SUB_LIFECYCLE_MONTHLY_CANCEL_EMAIL ??
          process.env.SUB_LIFECYCLE_PAID_EMAIL ??
          monthly.email,
        monthly.password,
        'SUB_LIFECYCLE_MONTHLY_CANCEL_PASSWORD'
      )
  }
};
