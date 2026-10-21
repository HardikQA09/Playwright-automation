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
TEST SUITE: Overlay Strategists Trial Matrix

PURPOSE
-------
Documents all 36 FRD Use Case 1 scenarios in executable Playwright form.
Source of truth: OOLTool_Subscription_FRD_Detailed (1).docx.
Automated rows run the linked UI coverage key once per process. Blocked,
future, and known-bug rows stay skipped with their dependency messages.

RUN
---
npx playwright test tests/OverlayStrategistsTrialMatrix.spec.ts
============================================================================= */

type UseCaseScenario = {
  id: string;
  sourceIds?: string[];
  title: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'automated' | 'blocked' | 'future' | 'known-bug' | 'manual-verified';
  automation?: string;
  dependency?: string;
};

const useCaseOneScenarios: UseCaseScenario[] = [
  {
    id: 'SC-01',
    sourceIds: [
      'SUB-TRIAL-001'
    ],
    title: 'Start trial without payment details',
    priority: 'Critical',
    status: 'automated',
    automation:
      'OverlayStrategistsTrial.spec.ts > New user can start Overlay Strategists trial without card'
  },
  {
    id: 'SC-02',
    sourceIds: [
      'SUB-TRIAL-002',
      'SUB-TRIAL-003'
    ],
    title: 'Trial is displayed as available',
    priority: 'High',
    status: 'automated',
    automation:
      'OverlayStrategistsTrial.spec.ts > New user can reach Overlay Strategists trial option after email/mobile onboarding prerequisites; PlanSelectionValidation.spec.ts validates both with-card and without-card lifecycle messaging'
  },
  {
    id: 'SC-03',
    sourceIds: [
      'SUB-TRIAL-004'
    ],
    title: 'Broker account limit is one',
    priority: 'Critical',
    status: 'known-bug',
    dependency:
      'Confirmed product bug: manual entry is currently counted as broker integration. Expected behavior is that manual entry must not consume broker-integration limit.'
  },
  {
    id: 'SC-04',
    sourceIds: [
      'SUB-TRIAL-005'
    ],
    title: 'No-card trial linked-account limit matches the plan card',
    priority: 'Critical',
    status: 'automated',
    automation:
      'OverlayStrategistsTrial.spec.ts > New user can start Overlay Strategists trial without card'
  },
  {
    id: 'SC-05',
    sourceIds: [
      'SUB-TRIAL-006'
    ],
    title: 'No-card trial position limit matches the plan card',
    priority: 'Critical',
    status: 'automated',
    automation:
      'OverlayStrategistsTrial.spec.ts > New user can start Overlay Strategists trial without card'
  },
  {
    id: 'SC-06',
    sourceIds: [
      'SUB-TRIAL-003',
      'SUB-TRIAL-017'
    ],
    title: 'Premium Overlay Strategists features are presented',
    priority: 'High',
    status: 'automated',
    automation:
      'PlanSelectionValidation.spec.ts > Overlay Strategists feature limits and premium benefits are displayed'
  },
  {
    id: 'SC-07',
    sourceIds: [
      'SUB-TRIAL-015'
    ],
    title: 'Start trial with valid card',
    priority: 'Critical',
    status: 'automated',
    automation:
      'OverlayStrategistsTrial.spec.ts > New user can start Overlay Strategists trial with card',
    dependency:
      'QA-CL-005: do not use Stripe test card 4242 for Overlay with-card trial. That fingerprint is already_redeemed and bounces to Plan Selection / Free. Rotate an unused country test card per fresh user. 4242 reuse is a follow-up to clear in Stripe, not a trial-flow defect.'
  },
  {
    id: 'SC-08',
    sourceIds: [
      'SUB-TRIAL-015'
    ],
    title: 'No subscription charge during trial',
    priority: 'Critical',
    status: 'blocked',
    dependency:
      'Requires Stripe test account/API access to verify ledger/payment intent amount.'
  },
  {
    id: 'SC-10',
    sourceIds: [
      'SUB-TRIAL-025'
    ],
    title: 'Existing paid subscriber cannot start trial',
    priority: 'Critical',
    status: 'automated',
    automation:
      'BillingSubscriptionManagement.spec.ts > Paid subscriber is not offered Overlay Strategists trial CTA'
  },
  {
    id: 'SC-11',
    sourceIds: [
      'SUB-TRIAL-023'
    ],
    title: 'Same email cannot receive another trial',
    priority: 'Critical',
    status: 'automated',
    automation:
      'OverlayStrategistsTrial.spec.ts > New user can start Overlay Strategists trial without card'
  },
  {
    id: 'SC-12',
    title: 'Same verified mobile number cannot receive another trial',
    priority: 'Critical',
    status: 'automated',
    automation:
      'OverlayStrategistsTrial.spec.ts > New user can start Overlay Strategists trial without card'
  },
  {
    id: 'SC-13',
    sourceIds: [
      'SUB-TRIAL-024'
    ],
    title: 'Same payment method cannot receive another trial',
    priority: 'Critical',
    status: 'blocked',
    dependency:
      'Requires Stripe payment-method fingerprint visibility through API/admin.'
  },
  {
    id: 'SC-14',
    title: 'Trial lasts exactly 30 days',
    priority: 'Critical',
    status: 'blocked',
    dependency:
      'Requires admin/API time travel or scheduler controls to set trial start/end dates.'
  },
  {
    id: 'SC-15',
    sourceIds: [
      'SUB-TRIAL-007'
    ],
    title: 'Day 25 no-card reminder is sent once',
    priority: 'Medium',
    status: 'blocked',
    dependency:
      'Requires scheduler trigger and email/in-app notification capture.'
  },
  {
    id: 'SC-16',
    sourceIds: [
      'SUB-TRIAL-008'
    ],
    title: 'Day 28 no-card reminder is sent once',
    priority: 'Medium',
    status: 'blocked',
    dependency:
      'Requires scheduler trigger and email/in-app notification capture.'
  },
  {
    id: 'SC-17',
    sourceIds: [
      'SUB-TRIAL-009'
    ],
    title: 'Day 29 no-card final reminder is sent once',
    priority: 'Medium',
    status: 'blocked',
    dependency:
      'Requires scheduler trigger and email/in-app notification capture.'
  },
  {
    id: 'SC-18',
    sourceIds: [
      'SUB-TRIAL-018'
    ],
    title: 'Day 29 with-card final reminder is sent once',
    priority: 'Medium',
    status: 'blocked',
    dependency:
      'Requires scheduler trigger and email/in-app notification capture.'
  },
  {
    id: 'SC-19',
    sourceIds: [
      'SUB-TRIAL-011'
    ],
    title: 'No-card trial downgrades to Free after expiry',
    priority: 'Critical',
    status: 'blocked',
    automation:
      'PlanSelectionValidation.spec.ts > without-card trial explains Free plan fallback after expiry',
    dependency:
      'Requires admin/API expiry control or scheduler trigger for trial expiry.'
  },
  {
    id: 'SC-20',
    sourceIds: [
      'SUB-TRIAL-012'
    ],
    title: 'Broker integrations disconnect after no-card expiry',
    priority: 'Critical',
    status: 'blocked',
    dependency:
      'Requires expired trial fixture plus broker connection data.'
  },
  {
    id: 'SC-21',
    sourceIds: [
      'SUB-TRIAL-013'
    ],
    title: 'Imported portfolio positions are deleted after no-card expiry',
    priority: 'Critical',
    status: 'blocked',
    dependency:
      'Requires portfolio seed data and DB/admin validation of deletion.'
  },
  {
    id: 'SC-22',
    sourceIds: [
      'SUB-TRIAL-014'
    ],
    title: 'Premium features are unavailable after expiry',
    priority: 'Critical',
    status: 'blocked',
    dependency:
      'Requires expired trial fixture and feature entitlement selectors.'
  },
  {
    id: 'SC-23',
    title: 'Subscribe prompt appears after trial expiry',
    priority: 'Medium',
    status: 'blocked',
    dependency:
      'Requires expired trial fixture.'
  },
  {
    id: 'SC-24',
    sourceIds: [
      'SUB-TRIAL-019'
    ],
    title: 'With-card trial converts to paid after expiry',
    priority: 'Critical',
    status: 'blocked',
    automation:
      'PlanSelectionValidation.spec.ts > with-card trial explains auto-renewal after expiry',
    dependency:
      'Requires trial expiry scheduler plus Stripe subscription/invoice validation.'
  },
  {
    id: 'SC-25',
    sourceIds: [
      'SUB-TRIAL-020'
    ],
    title: 'Billing starts automatically after with-card trial expiry',
    priority: 'Critical',
    status: 'blocked',
    dependency:
      'Requires Stripe invoice/payment validation after trial conversion.'
  },
  {
    id: 'SC-26',
    sourceIds: [
      'SUB-TRIAL-026',
      'SUB-TRIAL-027',
      'SUB-TRIAL-028'
    ],
    title: 'Trial user can subscribe before trial ends',
    priority: 'Critical',
    status: 'automated',
    automation:
      'OverlayStrategistsTrial.spec.ts > Trial user can subscribe to a paid plan before the trial ends'
  },
  {
    id: 'SC-27',
    title: 'Billing cycle resets after trial-to-paid subscription',
    priority: 'High',
    status: 'blocked',
    dependency:
      'Requires Stripe/API visibility for billing cycle anchor and renewal date.'
  },
  {
    id: 'SC-28',
    sourceIds: [
      'SUB-TRIAL-022',
      'SUB-TRIAL-029'
    ],
    title: 'Failed payment after trial expiry enters grace period',
    priority: 'Critical',
    status: 'blocked',
    dependency:
      'Requires trial expiry, failed renewal card fixture, scheduler/webhook control, and grace-period config.'
  },
  {
    id: 'SC-29',
    title: 'Failed billing reminder is sent',
    priority: 'High',
    status: 'blocked',
    dependency:
      'Requires failed-payment fixture plus notification capture.'
  },
  {
    id: 'SC-30',
    sourceIds: [
      'SUB-TRIAL-021'
    ],
    title: 'Removing only payment method during trial keeps trial active until expiry',
    priority: 'Medium',
    status: 'future',
    dependency:
      'Requires active with-card trial account and payment-method management UI/API. Business rule: user can cancel any time but keeps plan access until trial expiry.'
  },
  {
    id: 'SC-31',
    sourceIds: [
      'SUB-GEN-006'
    ],
    title: 'Terms must be accepted before activating trial',
    priority: 'Critical',
    status: 'automated',
    automation:
      'OverlayStrategistsTrial.spec.ts / PlanSelectionValidation.spec.ts > trial terms required'
  },
  {
    id: 'SC-32',
    title: 'Communication preference selection is supported',
    priority: 'Low',
    status: 'future',
    dependency:
      'Requires confirmation of communication preference UI location and expected options.'
  },
  {
    id: 'SC-33',
    sourceIds: [
      'SUB-TRIAL-030',
      'SUB-GEN-007'
    ],
    title: 'Trial activation audit log is created',
    priority: 'Medium',
    status: 'automated',
    automation:
      'OverlayStrategistsTrial.spec.ts > New user can start Overlay Strategists trial without card'
  },
  {
    id: 'SC-34',
    sourceIds: [
      'SUB-TRIAL-030',
      'SUB-GEN-007'
    ],
    title: 'Trial conversion audit log is created',
    priority: 'Medium',
    status: 'blocked',
    dependency:
      'Requires admin/API/DB access to audit log records after trial conversion.'
  },
  {
    id: 'SC-35',
    title: 'Reminder analytics are tracked',
    priority: 'Low',
    status: 'blocked',
    dependency:
      'Requires analytics/admin event visibility.'
  },
  {
    id: 'SC-36',
    sourceIds: [
      'SUB-TRIAL-016',
      'SUB-GEN-005'
    ],
    title: 'With-card authorization failure does not start trial',
    priority: 'Critical',
    status: 'automated',
    automation:
      'OverlayStrategistsTrial.spec.ts > Overlay Strategists with-card trial rejects declined Stripe card'
  }
];

test.describe(
  'Overlay Strategists Trial FRD Matrix',
  () => {
    test.describe.configure({
      timeout: 20 * 60 * 1000
    });

    for (const scenario of useCaseOneScenarios) {
      const run = async (
        browser?: Parameters<typeof executeStripeMatrixScenario>[1]
      ) => {
        await executeStripeMatrixScenario(
          scenario,
          browser,
            {
              module: 'Billing',
              journey: 'Overlay Strategists Trial',
              blockedReason:
                'Scenario requires additional test fixture or backend support.'
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
