import {
  test
} from './fixtures/subscriberAuth';

import { BillingPage }
  from './pages/BillingPage';

import {
  PLAN_ENTITLEMENTS
} from './config/planEntitlements';

/* =============================================================================
Plan entitlements — Billing Plans copy vs selected/active plan.

Source of truth: tests/config/planEntitlements.ts
  Income Builder      → Broker (1), Account Linked (1), Positions (100)
  Overlay Strategists → Broker (5), Account Linked (10), Positions (500)
  Portfolio Hedger    → Broker (10), Account Linked (20), Positions (1000)

Does NOT seed over-cap broker/account/position enforcement (LC-012 / SC-131).
Validates the plan card limits the member sees for their selected plan.

Run alone:
  npx playwright test tests/PlanPositionLimits.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Plan position limits',
  () => {
    test.describe.configure({
      timeout: 180000
    });

    test(
      'Billing Plans tab shows broker, account linked, and position limits for every paid plan',
      async ({ page }) => {
        const billing =
          new BillingPage(
            page
          );

        await billing.validateOverview();
        await billing.validatePaidPlanEntitlementsOnPlansTab();
      }
    );

    test(
      'Active subscription plan shows matching broker, account linked, and position entitlements',
      async ({ page }) => {
        const billing =
          new BillingPage(
            page
          );

        await billing.validateOverview();

        if (
          await billing.isFreeOrNoCardPlan()
        ) {
          test.skip(
            true,
            'Shared subscriber is Free/no-card — need a paid plan to assert entitlements against the active plan.'
          );
        }

        await billing.validateActivePlanEntitlements();

        const active =
          await billing.detectActivePaidEntitlementPlan();

        if (
          active
        ) {
          const limits =
            PLAN_ENTITLEMENTS[active];

          console.log(
            `[INFO] Active plan ${active} → Broker (${limits.brokerIntegration}), Account Linked (${limits.accountLinked}), Positions (${limits.positions})`
          );
        }
      }
    );
  }
);
