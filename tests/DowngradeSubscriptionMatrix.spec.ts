import {
  test
} from '@playwright/test';

import {
  executeStripeMatrixScenario
} from './helpers/stripeMatrixExecution';

test.use({
  screenshot: 'off',
  trace: 'off',
  video: 'off'
});

/* =============================================================================
TEST SUITE: Downgrade Subscription Matrix

PURPOSE
-------
Documents Subscription Management Use Case 4 scenarios in executable Playwright
form. Source of truth: OOLTool_Subscription_FRD_Detailed (1).docx. Automated
rows run billing and downgrade-preview coverage without submitting a plan change.

RUN
---
npx playwright test tests/DowngradeSubscriptionMatrix.spec.ts
============================================================================= */

type DowngradeScenario = {
  id: string;
  sourceIds: string[];
  title: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'automated' | 'blocked' | 'future';
  automation?: string;
  dependency?: string;
};

const downgradeScenarios: DowngradeScenario[] = [
  {
    id: 'SC-113',
    sourceIds: ['SUB-DOWN-001'],
    title: 'Current higher-tier subscription is displayed before downgrade',
    priority: 'Critical',
    status: 'automated',
    automation: 'BillingSubscriptionManagement.spec.ts > Manage subscription opens Stripe portal with subscription details'
  },
  {
    id: 'SC-114',
    sourceIds: ['SUB-DOWN-002'],
    title: 'Eligible lower-tier plans show downgrade action',
    priority: 'Critical',
    status: 'automated',
    automation: 'BillingEdgeValidation.spec.ts > Billing plans expose lifecycle action summary without changing subscription'
  },
  {
    id: 'SC-115',
    sourceIds: ['SUB-DOWN-003'],
    title: 'Current plan does not show downgrade action for itself',
    priority: 'High',
    status: 'automated',
    automation: 'BillingEdgeValidation.spec.ts > Billing plans expose lifecycle action summary without changing subscription'
  },
  {
    id: 'SC-117',
    sourceIds: ['SUB-DOWN-005'],
    title: 'Downgrade from Portfolio Hedger to Overlay Strategists is available',
    priority: 'High',
    status: 'automated',
    automation: 'SubscriptionLifecycleExecution.spec.ts > paid plan ladder availability Portfolio Hedger downgrade to Overlay Strategists'
  },
  {
    id: 'SC-118',
    sourceIds: ['SUB-DOWN-006'],
    title: 'Downgrade from Overlay Strategists to Income Builder is available',
    priority: 'High',
    status: 'automated',
    automation: 'SubscriptionLifecycleExecution.spec.ts > paid plan ladder availability Overlay Strategists downgrade to Income Builder'
  },
  {
    id: 'SC-119',
    sourceIds: ['SUB-DOWN-007'],
    title: 'Downgrade from paid plan to Free is only available when business rules allow it',
    priority: 'High',
    status: 'automated',
    automation: 'PaidToFreeDowngrade.spec.ts > SC-119 - Downgrade from paid plan to Free is only available when business rules allow it'
  },
  {
    id: 'SC-120',
    sourceIds: ['SUB-DOWN-008'],
    title: 'Downgrade confirmation displays current plan and target plan',
    priority: 'Critical',
    status: 'automated',
    automation: 'SubscriptionLifecycleExecution.spec.ts > Prepared paid user can preview downgrade calculations without submitting'
  },
  {
    id: 'SC-121',
    sourceIds: ['SUB-DOWN-009'],
    title: 'Downgrade confirmation displays lost feature warning',
    priority: 'Critical',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:impact-warning'
  },
  {
    id: 'SC-122',
    sourceIds: ['SUB-DOWN-010'],
    title: 'Downgrade confirmation displays account limits after downgrade',
    priority: 'Critical',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:account-limits-shown'
  },
  {
    id: 'SC-123',
    sourceIds: ['SUB-DOWN-011'],
    title: 'Downgrade requires user acknowledgement before confirmation',
    priority: 'Critical',
    status: 'automated',
    automation: 'SubscriptionLifecycleExecution.spec.ts > downgrade preview terms checkbox is required before Confirm & pay'
  },
  {
    id: 'SC-124',
    sourceIds: ['SUB-DOWN-012'],
    title: 'User can cancel downgrade before confirmation',
    priority: 'High',
    status: 'automated',
    automation: 'SubscriptionLifecycleExecution.spec.ts > downgrade preview is closed without submitting'
  },
  {
    id: 'SC-125',
    sourceIds: ['SUB-DOWN-013'],
    title: 'Downgrade is scheduled for end of current billing cycle when applicable',
    priority: 'Critical',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:schedule-at-renewal'
  },
  {
    id: 'SC-126',
    sourceIds: ['SUB-DOWN-014'],
    title: 'Immediate downgrade is blocked or allowed according to business rules',
    priority: 'Critical',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:access-kept-until-effective-date'
  },
  {
    id: 'SC-127',
    sourceIds: ['SUB-DOWN-015'],
    title: 'Downgrade keeps current higher-tier access until effective date',
    priority: 'Critical',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:access-kept-until-effective-date'
  },
  {
    id: 'SC-128',
    sourceIds: ['SUB-DOWN-016'],
    title: 'Downgrade applies lower-tier entitlements after effective date',
    priority: 'Critical',
    status: 'blocked',
    dependency: 'Requires scheduler/time control and entitlement validation after effective date.'
  },
  {
    id: 'SC-129',
    sourceIds: ['SUB-DOWN-017'],
    title: 'Downgrade does not delete user account data immediately',
    priority: 'Critical',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:user-data-preserved'
  },
  {
    id: 'SC-130',
    sourceIds: ['SUB-DOWN-018'],
    title: 'Downgrade handles existing broker connections above new plan limit',
    priority: 'Critical',
    status: 'blocked',
    dependency: 'Requires broker connection seed data above target plan limit.'
  },
  {
    id: 'SC-131',
    sourceIds: ['SUB-DOWN-019'],
    title: 'Downgrade handles portfolio positions above new plan limit',
    priority: 'Critical',
    status: 'blocked',
    dependency: 'Requires portfolio position seed data above target plan limit.'
  },
  {
    id: 'SC-132',
    sourceIds: ['SUB-DOWN-020'],
    title: 'Downgrade handles linked accounts above new plan limit',
    priority: 'Critical',
    status: 'blocked',
    dependency: 'Requires linked-account seed data above target plan limit.'
  },
  {
    id: 'SC-133',
    sourceIds: ['SUB-DOWN-021'],
    title: 'Downgrade warning clearly explains restricted features',
    priority: 'High',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:impact-warning'
  },
  {
    id: 'SC-134',
    sourceIds: ['SUB-DOWN-022'],
    title: 'Downgrade from annual higher plan to annual lower plan is handled correctly',
    priority: 'Critical',
    status: 'blocked',
    dependency: 'Requires annual higher-plan fixture and Stripe subscription schedule validation.'
  },
  {
    id: 'SC-135',
    sourceIds: ['SUB-DOWN-023'],
    title: 'Downgrade from monthly higher plan to monthly lower plan is handled correctly',
    priority: 'Critical',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:schedule-at-renewal'
  },
  {
    id: 'SC-136',
    sourceIds: ['SUB-DOWN-024'],
    title: 'Downgrade from annual higher plan to monthly lower plan follows business rule',
    priority: 'Critical',
    status: 'blocked',
    dependency: 'Requires confirmed interval-change rule and Stripe schedule validation.'
  },
  {
    id: 'SC-137',
    sourceIds: ['SUB-DOWN-025'],
    title: 'Downgrade from monthly higher plan to annual lower plan follows business rule',
    priority: 'Critical',
    status: 'blocked',
    dependency: 'Requires confirmed interval-change rule and Stripe proration/schedule validation.'
  },
  {
    id: 'SC-138',
    sourceIds: ['SUB-DOWN-026'],
    title: 'Downgrade with pending cancellation follows correct precedence',
    priority: 'High',
    status: 'blocked',
    dependency: 'Requires account fixture with scheduled cancellation plus downgrade eligibility rule.'
  },
  {
    id: 'SC-139',
    sourceIds: ['SUB-DOWN-027'],
    title: 'Downgrade with unpaid invoice is blocked or handled correctly',
    priority: 'High',
    status: 'blocked',
    dependency: 'Requires unpaid invoice fixture and expected business rule.'
  },
  {
    id: 'SC-140',
    sourceIds: ['SUB-DOWN-028'],
    title: 'Downgrade with failed payment state is blocked or handled correctly',
    priority: 'High',
    status: 'blocked',
    dependency: 'Requires failed-payment subscription fixture.'
  },
  {
    id: 'SC-141',
    sourceIds: ['SUB-DOWN-029'],
    title: 'Scheduled downgrade appears in billing overview',
    priority: 'Critical',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:scheduled-downgrade-in-overview'
  },
  {
    id: 'SC-142',
    sourceIds: ['SUB-DOWN-030'],
    title: 'Scheduled downgrade appears on the Plans screen',
    priority: 'High',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:scheduled-downgrade-on-plans-screen'
  },
  {
    id: 'SC-143',
    sourceIds: ['SUB-DOWN-031'],
    title: 'Downgrade confirmation email is sent',
    priority: 'Medium',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:confirmation-email'
  },
  {
    id: 'SC-144',
    sourceIds: ['SUB-DOWN-032'],
    title: 'Downgrade audit log is created',
    priority: 'Medium',
    status: 'blocked',
    dependency: 'Requires admin/API/DB access to audit log records.'
  },
  {
    id: 'SC-145',
    sourceIds: ['SUB-DOWN-033'],
    title: 'User can resume or cancel scheduled downgrade before effective date when allowed',
    priority: 'High',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:cancel-scheduled-downgrade'
  },
  {
    id: 'SC-146',
    sourceIds: ['SUB-DOWN-034'],
    title: 'Cancelling scheduled downgrade keeps current plan active',
    priority: 'High',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:cancel-scheduled-downgrade'
  },
  {
    id: 'SC-147',
    sourceIds: ['SUB-DOWN-035'],
    title: 'Double-clicking downgrade confirmation is idempotent',
    priority: 'Critical',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_DOUBLE_CLICK_OVERLAY_TO_INCOME:single-downgrade-request'
  },
  {
    id: 'SC-148',
    sourceIds: ['SUB-DOWN-036'],
    title: 'Browser refresh during downgrade confirmation does not charge or change the plan',
    priority: 'Medium',
    status: 'automated',
    // Must start on Overlay (or higher), not Income — Income has no Downgrade CTA.
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:refresh-leaves-account-unchanged'
  },
  {
    id: 'SC-149',
    sourceIds: ['SUB-DOWN-037'],
    title: 'Browser back from downgrade flow does not change plan',
    priority: 'High',
    status: 'automated',
    automation: 'SubscriptionLifecycleExecution.spec.ts > downgrade preview back does not change plan'
  },
  {
    id: 'SC-150',
    sourceIds: ['SUB-DOWN-038'],
    title: 'Downgrade is not available to users without active paid subscription',
    priority: 'High',
    status: 'automated',
    automation: 'PlanSelectionValidation.spec.ts > unpaid plan catalog has no downgrade action'
  },
  {
    id: 'SC-151',
    sourceIds: ['SUB-DOWN-039'],
    title: 'Downgrade target excludes plans that are not lower tier',
    priority: 'High',
    status: 'automated',
    automation: 'BillingEdgeValidation.spec.ts > downgrade target ladder excludes higher plans'
  },
  {
    id: 'SC-152',
    sourceIds: ['SUB-DOWN-040'],
    title: 'Downgrade preserves billing customer and saved payment method',
    priority: 'Medium',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:saved-card-preserved'
  },
  {
    id: 'SC-153',
    sourceIds: ['SUB-DOWN-041'],
    title: 'Downgrade does not create duplicate subscription records',
    priority: 'Critical',
    status: 'automated',
    automation: 'scenario:DOWNGRADE_OVERLAY_TO_INCOME_MONTHLY:single-active-plan'
  },
  {
    id: 'SC-154',
    sourceIds: ['SUB-DOWN-042'],
    title: 'Downgrade webhook updates subscription status correctly',
    priority: 'Critical',
    status: 'blocked',
    dependency: 'Requires webhook event visibility or backend state API.'
  },
  {
    id: 'SC-155',
    sourceIds: ['SUB-DOWN-043'],
    title: 'Downgrade failure webhook keeps current plan unchanged',
    priority: 'Critical',
    status: 'blocked',
    dependency: 'Requires failed downgrade webhook fixture and entitlement validation.'
  },
  {
    id: 'SC-156',
    sourceIds: ['SUB-DOWN-044'],
    title: 'Downgrade effective-date reminder notification is sent when configured',
    priority: 'Low',
    status: 'blocked',
    dependency: 'Requires scheduler control and notification capture.'
  },
  {
    id: 'SC-157',
    sourceIds: ['SUB-DOWN-045'],
    title: 'Downgrade applies feature limits consistently across dashboard modules',
    priority: 'High',
    status: 'blocked',
    dependency: 'Requires entitlement selectors across dashboard modules.'
  },
  {
    id: 'SC-158',
    sourceIds: ['SUB-DOWN-046'],
    title: 'Downgrade handles broker integration removal or restriction according to rule',
    priority: 'Critical',
    status: 'blocked',
    dependency: 'Requires broker integration data and confirmed retention/removal rule.'
  },
  {
    id: 'SC-159',
    sourceIds: ['SUB-DOWN-047'],
    title: 'Downgrade handles bulk portfolio import availability according to target plan',
    priority: 'High',
    status: 'blocked',
    dependency: 'Requires feature entitlement selectors for bulk portfolio load.'
  },
  {
    id: 'SC-160',
    sourceIds: ['SUB-DOWN-048'],
    title: 'Downgrade handles analytics availability according to target plan',
    priority: 'High',
    status: 'blocked',
    dependency: 'Requires analytics entitlement selectors and target-plan fixture.'
  },
  {
    id: 'SC-161',
    sourceIds: ['SUB-DOWN-049'],
    title: 'Downgrade invoice or credit note is generated when applicable',
    priority: 'High',
    status: 'blocked',
    dependency: 'Requires Stripe invoice/credit-note API visibility and confirmed billing rule.'
  },
  {
    id: 'SC-162',
    sourceIds: ['SUB-DOWN-050'],
    title: 'Downgrade with currency conversion displays correct amount and currency',
    priority: 'Medium',
    status: 'blocked',
    dependency: 'A downgrade is scheduled and collects no payment, so there is no amount to convert unless the product shows one. Needs product confirmation of what amount and currency a downgrade should display.'
  },
  {
    id: 'SC-163',
    sourceIds: ['SUB-DOWN-051'],
    title: 'Downgrade API rejects unauthorized or cross-account downgrade attempts',
    priority: 'Critical',
    status: 'blocked',
    dependency: 'Requires backend/API support for authorization validation.'
  },
  {
    id: 'SC-164',
    sourceIds: ['SUB-DOWN-052'],
    title: 'Downgrade can be reported correctly in AIR evidence and history',
    priority: 'Medium',
    status: 'automated',
    automation: 'air:downgrade-history'
  }
];

test.describe(
  'Downgrade Subscription Use Case 4 Matrix',
  () => {
    test.describe.configure({
      timeout: 20 * 60 * 1000
    });

    for (const scenario of downgradeScenarios) {
      const run = async (
        browser?: Parameters<typeof executeStripeMatrixScenario>[1]
      ) => {
        await executeStripeMatrixScenario(
          scenario,
          browser,
            {
              module: 'Billing',
              journey: 'Downgrade Subscription',
              blockedReason:
                'Scenario requires a downgrade-specific subscription fixture or backend support.'
            }
        );
      };

      if (scenario.status !== 'automated') {
        test(
          `${scenario.id} - ${scenario.title}`,
          async () => {
            await run();
          }
        );
      } else {
        test(
          `${scenario.id} - ${scenario.title}`,
          async ({ browser }) => {
            await run(
              browser
            );
          }
        );
      }
    }
  }
);
