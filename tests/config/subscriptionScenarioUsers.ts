/* =============================================================================
CONFIG: Named subscription scenario users (DISPOSABLE)

PURPOSE
-------
Matrix packs that need a fresh purchase / submit create ONE disposable user
per scenario per Playwright process (plus-tag + timestamp). Run log:
test-results/scenario-users.json.

For DAILY reusable accounts (upgrade calc, cancel inspect, retention, email
on the same inbox), use preparedSubscriptionUsers.data.json instead:
  npm run fixtures:list
  imhardikthanki+sub-<scenario>@gmail.com

HOW MATRIX ROWS USE THESE
-------------------------
A matrix row sets   automation: 'scenario:<NAME>:<step>'
Example             automation: 'scenario:UPGRADE_INCOME_MONTHLY_TO_OVERLAY_MONTHLY:confirmation-email'

NAMING
------
<ACTION>_<FROM PLAN>_<FROM INTERVAL>_TO_<TARGET PLAN>_<TARGET INTERVAL>
Emails are plus-addressed with the short `tag` (max 12 characters).
============================================================================= */

export type ScenarioUserDefinition = {
  tag: string;
  description: string;
};

export const SCENARIO_USERS = {
  PURCHASE_INCOME_MONTHLY: {
    tag: 'buy-inc-mo',
    description:
      'New user buys Income Builder monthly with a valid Stripe test card; checks purchase emails and reuse of the finished checkout session.'
  },
  PURCHASE_DOUBLE_CLICK_INCOME_MONTHLY: {
    tag: 'buy-dbl',
    description:
      'New user double-clicks Complete Setup for Income Builder monthly; never pays. Checks only one checkout session is created.'
  },
  UPGRADE_INCOME_MONTHLY_TO_OVERLAY_MONTHLY: {
    tag: 'up-inc-ovl-m',
    description:
      'Paid Income Builder monthly user upgrades to Overlay Strategists monthly using the saved card.'
  },
  UPGRADE_INCOME_ANNUAL_TO_OVERLAY_ANNUAL: {
    tag: 'up-inc-ovl-a',
    description:
      'Paid Income Builder annual user upgrades to Overlay Strategists annual using the saved card.'
  },
  UPGRADE_INCOME_MONTHLY_TO_OVERLAY_ANNUAL: {
    tag: 'up-m2a-ovl',
    description:
      'Paid Income Builder monthly user upgrades to Overlay Strategists annual using the saved card.'
  },
  UPGRADE_DOUBLE_CLICK_INCOME_TO_OVERLAY: {
    tag: 'up-dbl',
    description:
      'Paid Income Builder monthly user double-clicks the upgrade confirmation; expects one upgrade and one charge.'
  },
  DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY: {
    tag: 'dn-ovl-inc-m',
    description:
      'Paid Overlay Strategists monthly user schedules a downgrade to Income Builder monthly and keeps access until renewal.'
  },
  DOWNGRADE_DOUBLE_CLICK_OVERLAY_TO_INCOME: {
    tag: 'dn-dbl',
    description:
      'Paid Overlay Strategists monthly user double-clicks the downgrade confirmation; expects one scheduled downgrade.'
  },
  INTERVAL_INCOME_MONTHLY_TO_ANNUAL: {
    tag: 'iv-m2a',
    description:
      'Paid Income Builder monthly user switches to annual billing (immediate change).'
  },
  INTERVAL_INCOME_ANNUAL_TO_MONTHLY: {
    tag: 'iv-a2m',
    description:
      'Paid Income Builder annual user switches to monthly billing (scheduled at renewal).'
  },
  INTERVAL_DOUBLE_CLICK_MONTHLY_TO_ANNUAL: {
    tag: 'iv-m2a-dbl',
    description:
      'Paid Income Builder monthly user double-clicks the annual switch confirmation.'
  },
  INTERVAL_DOUBLE_CLICK_ANNUAL_TO_MONTHLY: {
    tag: 'iv-a2m-dbl',
    description:
      'Paid Income Builder annual user double-clicks the monthly switch confirmation.'
  },
  CANCEL_INCOME_MONTHLY_AT_PERIOD_END: {
    tag: 'cx-inc-m',
    description:
      'Paid Income Builder monthly user cancels at period end; access stays until the end date and the cancellation can be resumed.'
  },
  CANCEL_DOUBLE_CLICK_INCOME_MONTHLY: {
    tag: 'cx-dbl',
    description:
      'Paid Income Builder monthly user double-clicks the final cancellation confirmation; expects one cancellation.'
  }
} satisfies Record<string, ScenarioUserDefinition>;

export type ScenarioUserName =
  keyof typeof SCENARIO_USERS;
