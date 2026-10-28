import {
  test
} from './fixtures/subscriberAuth';

import { BillingPage }
  from './pages/BillingPage';

/* =============================================================================
SC-119 — paid → Free is offered when business rules allow anytime downgrade.
Preview only (does not confirm the schedule).

Run alone:
  npx playwright test tests/PaidToFreeDowngrade.spec.ts --reporter=line
============================================================================= */

test.describe(
  'Paid to Free downgrade',
  () => {
    test.describe.configure({
      timeout: 180000
    });

    test(
      'SC-119 - Downgrade from paid plan to Free is only available when business rules allow it',
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
            'Shared subscriber is already Free/no-card — need a paid plantest user for SC-119.'
          );
        }

        await billing.validatePaidToFreeDowngradeAvailable();
      }
    );
  }
);
