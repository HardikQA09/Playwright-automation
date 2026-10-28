/* =============================================================================
Plan entitlement limits (broker / linked accounts / positions).

Source of truth for catalog + Billing Plans UI copy. Keep in sync with the
numbers printed on UAT plan cards (not FRD no-card trial enforcement 100 unless
product aligns them).
============================================================================= */

export type PaidEntitlementPlan =
  | 'Income Builder'
  | 'Overlay Strategists'
  | 'Portfolio Hedger';

export type PlanEntitlementLimits = {
  brokerIntegration: number;
  accountLinked: number;
  positions: number;
};

export const PLAN_ENTITLEMENTS: Record<
  PaidEntitlementPlan,
  PlanEntitlementLimits
> = {
  'Income Builder': {
    brokerIntegration: 1,
    accountLinked: 1,
    positions: 100
  },
  'Overlay Strategists': {
    brokerIntegration: 5,
    accountLinked: 10,
    positions: 500
  },
  'Portfolio Hedger': {
    brokerIntegration: 10,
    accountLinked: 20,
    positions: 1000
  }
};

export const PAID_ENTITLEMENT_PLANS =
  Object.keys(
    PLAN_ENTITLEMENTS
  ) as PaidEntitlementPlan[];

export function planNameMatchPattern(
  plan: PaidEntitlementPlan
) {
  if (
    plan === 'Income Builder'
  ) {
    return '(?:income(?:\\s+builder)?|build your portfolio)';
  }

  if (
    plan === 'Overlay Strategists'
  ) {
    return 'overlay strategists';
  }

  return 'portfolio hedger';
}

export function entitlementNearPlanPattern(
  plan: PaidEntitlementPlan,
  label: 'broker integration' | 'account linked' | 'positions',
  count: number
) {
  return new RegExp(
    `${planNameMatchPattern(plan)}[\\s\\S]{0,800}${label}\\s*\\(${count}\\)`,
    'i'
  );
}

export function positionsLimitPattern(
  count: number
) {
  return new RegExp(
    `positions\\s*\\(${count}\\)`,
    'i'
  );
}
