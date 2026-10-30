import {
  test
} from '@playwright/test';

test.use({
  screenshot: 'off',
  trace: 'off',
  video: 'off'
});

/* =============================================================================
TEST SUITE: User Journey Coverage Matrix

PURPOSE
-------
Documents the full OOLTool user journey coverage in executable Playwright form.
Rows are intentionally skipped so AIR can report traceability, blocked items,
controlled/manual dependencies, and future coverage without failing regression.

RUN
---
npx playwright test tests/UserJourneyCoverageMatrix.spec.ts
============================================================================= */

type MatrixStatus = 'automated' | 'blocked' | 'controlled' | 'future';

type UserJourneyScenario = {
  id: string;
  title: string;
  module: string;
  journey: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: MatrixStatus;
  automation?: string;
  dependency?: string;
  sourceIds?: string[];
};

const userJourneyScenarios: UserJourneyScenario[] = [
  {
    id: 'UJ-001',
    title: 'New user registers with email, password, US mobile, and static OTP',
    module: 'Signup',
    journey: 'Registration',
    priority: 'Critical',
    status: 'automated',
    automation: 'onboarding.spec.ts > Step 1 - Registration'
  },
  {
    id: 'UJ-002',
    title: 'Duplicate registered email is rejected during signup',
    module: 'Signup',
    journey: 'Registration',
    priority: 'Critical',
    status: 'automated',
    automation: 'SignupNegative.spec.ts > duplicate email validation'
  },
  {
    id: 'UJ-003',
    title: 'Registration OTP input does not accept more than six digits',
    module: 'Signup',
    journey: 'Registration',
    priority: 'High',
    status: 'automated',
    automation: 'SignupNegative.spec.ts > OTP length validation'
  },
  {
    id: 'UJ-004',
    title: 'Invalid email, weak password, missing fields, and password mismatch are blocked',
    module: 'Signup',
    journey: 'Registration',
    priority: 'Critical',
    status: 'automated',
    automation: 'SignupNegative.spec.ts and PasswordPolicy.spec.ts'
  },
  {
    id: 'UJ-005',
    title: 'User completes email verification handoff before first login',
    module: 'Signup',
    journey: 'Email Verification',
    priority: 'Critical',
    status: 'automated',
    automation: 'onboarding.spec.ts > Register -> Verify Email -> Login -> Risk -> Compliance'
  },
  {
    id: 'UJ-006',
    title: 'Verified user logs in and reaches dashboard or onboarding continuation',
    module: 'Authentication',
    journey: 'Login',
    priority: 'Critical',
    status: 'automated',
    automation: 'onboarding.spec.ts and Subscriber.spec.ts'
  },
  {
    id: 'UJ-007',
    title: 'Login validates wrong password, unregistered email, empty fields, injection, and XSS input',
    module: 'Authentication',
    journey: 'Login',
    priority: 'Critical',
    status: 'automated',
    automation: 'AuthNegative.spec.ts'
  },
  {
    id: 'UJ-008',
    title: 'Temporarily locked account can request email unlock link',
    module: 'Authentication',
    journey: 'Account Recovery',
    priority: 'High',
    status: 'controlled',
    automation: 'UnlockAccount.spec.ts',
    // Not covered by complete-suite fixtures: needs an already-locked user +
    // manual unlock-email click (RUN_UNLOCK_ACCOUNT_TEST=true + pause).
    dependency: 'Requires UNLOCK_ACCOUNT_EMAIL already locked + RUN_UNLOCK_ACCOUNT_TEST=true and manual email-link handoff (not auto in npm run complete).'
  },
  {
    id: 'UJ-009',
    title: 'Protected dashboard routes redirect unauthenticated users to login',
    module: 'Session Security',
    journey: 'Session Security',
    priority: 'Critical',
    status: 'automated',
    automation: 'SessionSecurity.spec.ts and AuthNegative.spec.ts'
  },
  {
    id: 'UJ-010',
    title: 'Logout prevents browser-back and direct protected URL access',
    module: 'Session Security',
    journey: 'Session Security',
    priority: 'Critical',
    status: 'automated',
    automation: 'SessionSecurity.spec.ts and Subscriber.spec.ts'
  },
  {
    id: 'UJ-011',
    title: 'Forgot password request validates empty, invalid, unregistered, and security input',
    module: 'Password',
    journey: 'Password Recovery',
    priority: 'High',
    status: 'automated',
    automation: 'ResetPasswordNegative.spec.ts'
  },
  {
    id: 'UJ-012',
    title: 'Forgot password sends reset link and reset page accepts valid password update',
    module: 'Password',
    journey: 'Password Recovery',
    priority: 'Critical',
    status: 'automated',
    automation: 'forgotpassword.spec.ts > Disposable user resets password from the email link and signs in with the new password'
  },
  {
    id: 'UJ-013',
    title: 'Reset password validates mismatch, weak password, and back-to-login behavior',
    module: 'Password',
    journey: 'Password Recovery',
    priority: 'High',
    status: 'automated',
    automation: 'ResetPasswordNegative.spec.ts'
  },
  {
    id: 'UJ-014',
    title: 'Risk profile field validation blocks incomplete or invalid profile submission',
    module: 'Risk Profile',
    journey: 'Risk Profile',
    priority: 'Critical',
    status: 'automated',
    automation: 'OnboardingFieldValidation.spec.ts'
  },
  {
    id: 'UJ-015',
    title: 'Risk profile saved progress persists after refresh and can be updated from dashboard',
    module: 'Risk Profile',
    journey: 'Risk Profile',
    priority: 'High',
    status: 'automated',
    automation: 'OnboardingFieldValidation.spec.ts and RiskComplianceUpdate.spec.ts'
  },
  {
    id: 'UJ-016',
    title: 'Compliance required fields, state, broker approval, and accreditation are validated',
    module: 'Compliance',
    journey: 'Compliance',
    priority: 'Critical',
    status: 'automated',
    automation: 'OnboardingFieldValidation.spec.ts'
  },
  {
    id: 'UJ-017',
    title: 'Compliance values persist and can be edited from the dashboard',
    module: 'Compliance',
    journey: 'Compliance',
    priority: 'High',
    status: 'automated',
    automation: 'RiskComplianceUpdate.spec.ts'
  },
  {
    id: 'UJ-018',
    title: 'Plan page displays Monthly and Annual pricing and toggles correctly',
    module: 'Plan Selection',
    journey: 'Plan Selection',
    priority: 'High',
    status: 'automated',
    automation: 'PlanSelectionValidation.spec.ts'
  },
  {
    id: 'UJ-019',
    title: 'Curious Explorer free plan completes onboarding without Stripe checkout',
    module: 'Plan Selection',
    journey: 'Plan Selection',
    priority: 'Critical',
    status: 'automated',
    automation: 'PlanSelectionValidation.spec.ts'
  },
  {
    id: 'UJ-020',
    title: 'Overlay Strategists trial can start without card and route to dashboard',
    module: 'Plan Selection',
    journey: 'Trial Activation',
    priority: 'Critical',
    status: 'automated',
    automation: 'OverlayStrategistsTrial.spec.ts'
  },
  {
    id: 'UJ-021',
    title: 'Overlay Strategists trial can start with card and auto-renew terms are shown',
    module: 'Plan Selection',
    journey: 'Trial Activation',
    priority: 'Critical',
    status: 'automated',
    automation: 'OverlayStrategistsTrial.spec.ts'
  },
  {
    id: 'UJ-022',
    title: 'Paid plan selection redirects to Stripe checkout and accepts sandbox card details',
    module: 'Billing',
    journey: 'Payment',
    priority: 'Critical',
    status: 'automated',
    automation: 'onboarding.spec.ts and DirectSubscriptionPurchase.spec.ts'
  },
  {
    id: 'UJ-023',
    title: 'Stripe checkout validates incomplete, expired, invalid CVC, and declined-card scenarios',
    module: 'Billing',
    journey: 'Payment',
    priority: 'Critical',
    status: 'automated',
    automation: 'PaymentNegative.spec.ts and OverlayStrategistsTrial.spec.ts'
  },
  {
    id: 'UJ-024',
    title: 'New dashboard loads after onboarding and primary dashboard health is verified',
    module: 'Dashboard',
    journey: 'Dashboard',
    priority: 'Critical',
    status: 'automated',
    automation: 'DashboardNavigation.spec.ts and Subscriber.spec.ts'
  },
  {
    id: 'UJ-025',
    title: 'Top navigation routes open without load errors',
    module: 'Dashboard',
    journey: 'Dashboard Navigation',
    priority: 'High',
    status: 'automated',
    automation: 'DashboardNavigation.spec.ts'
  },
  {
    id: 'UJ-026',
    title: 'Dashboard header notification, theme, and fullscreen controls remain healthy',
    module: 'Dashboard',
    journey: 'Dashboard Navigation',
    priority: 'Medium',
    status: 'automated',
    automation: 'DashboardNavigation.spec.ts'
  },
  {
    id: 'UJ-027',
    title: 'Profile page loads saved user details and keeps email read-only',
    module: 'Profile',
    journey: 'Profile',
    priority: 'Critical',
    status: 'automated',
    automation: 'ProfileNegative.spec.ts'
  },
  {
    id: 'UJ-028',
    title: 'Profile change-password form validates mismatch and wrong current password',
    module: 'Profile',
    journey: 'Profile',
    priority: 'Critical',
    status: 'automated',
    automation: 'ProfilePasswordMismatch.spec.ts'
  },
  {
    id: 'UJ-029',
    title: 'Profile mobile number change validation is enforced',
    module: 'Profile',
    journey: 'Profile',
    priority: 'High',
    status: 'automated',
    automation: 'ProfileMobileValidation.spec.ts'
  },
  {
    id: 'UJ-030',
    title: 'User enables authenticator app MFA and saves generated backup codes',
    module: 'MFA',
    journey: 'Account Security',
    priority: 'Critical',
    status: 'controlled',
    automation: 'MfaUserFlow.spec.ts',
    dependency: 'Requires TOTP secret or manual authenticator OTP handoff during enablement.'
  },
  {
    id: 'UJ-031',
    title: 'MFA login accepts valid OTP and rejects invalid OTP',
    module: 'MFA',
    journey: 'Account Security',
    priority: 'Critical',
    status: 'controlled',
    automation: 'MfaUserFlow.spec.ts',
    dependency: 'Requires MFA_LOCAL_TOTP_SECRET or manual OTP fallback.'
  },
  {
    id: 'UJ-032',
    title: 'Backup code login succeeds once and used backup code cannot be reused',
    module: 'MFA',
    journey: 'Account Security',
    priority: 'Critical',
    status: 'controlled',
    automation: 'MfaUserFlow.spec.ts',
    dependency: 'Requires fresh one-time backup code fixture; backup codes are single-use.'
  },
  {
    id: 'UJ-033',
    title: 'Trusted-device checkbox allows remembered device to skip MFA on next login',
    module: 'MFA',
    journey: 'Account Security',
    priority: 'High',
    status: 'controlled',
    automation: 'MfaUserFlow.spec.ts',
    dependency: 'Requires stable browser profile plus MFA_LOCAL_TOTP_SECRET or manual OTP.'
  },
  {
    id: 'UJ-034',
    title: 'Removing trusted device requires MFA again on next login',
    module: 'MFA',
    journey: 'Account Security',
    priority: 'High',
    status: 'controlled',
    automation: 'MfaUserFlow.spec.ts',
    dependency: 'Requires trusted-device fixture and MFA_LOCAL_TOTP_SECRET or manual OTP.'
  },
  {
    id: 'UJ-035',
    title: 'Disabling 2FA removes MFA challenge for future login',
    module: 'MFA',
    journey: 'Account Security',
    priority: 'High',
    status: 'controlled',
    automation: 'MfaUserFlow.spec.ts',
    dependency: 'Requires account with enabled MFA and password/OTP confirmation.'
  },
  {
    id: 'UJ-036',
    title: 'Billing overview displays current plan, active status, billing interval, and next renewal',
    module: 'Billing',
    journey: 'Billing',
    priority: 'Critical',
    status: 'automated',
    automation: 'BillingEdgeValidation.spec.ts'
  },
  {
    id: 'UJ-037',
    title: 'Billing plans show upgrade, downgrade, or current-plan status controls',
    module: 'Billing',
    journey: 'Billing',
    priority: 'High',
    status: 'automated',
    automation: 'BillingEdgeValidation.spec.ts'
  },
  {
    id: 'UJ-038',
    title: 'Subscription history, transaction history, invoice page, and PDF link are available',
    module: 'Billing',
    journey: 'Billing',
    priority: 'High',
    status: 'automated',
    automation: 'BillingEdgeValidation.spec.ts'
  },
  {
    id: 'UJ-039',
    title: 'Manage subscription opens Stripe portal with subscription and payment details',
    module: 'Billing',
    journey: 'Subscription Management',
    priority: 'Critical',
    status: 'automated',
    automation: 'BillingSubscriptionManagement.spec.ts'
  },
  {
    id: 'UJ-040',
    title: 'Stripe portal cancel-subscription form accepts reason and feedback without accidental cancellation',
    module: 'Billing',
    journey: 'Subscription Management',
    priority: 'Critical',
    status: 'automated',
    automation: 'BillingSubscriptionManagement.spec.ts'
  },
  {
    id: 'UJ-041',
    title: 'Cancelled subscription retains access until end of billing cycle',
    module: 'Billing',
    journey: 'Subscription Management',
    priority: 'Critical',
    status: 'automated',
    automation: 'SubscriptionLifecycleExecution.spec.ts > retains access until end of billing cycle'
  },
  {
    id: 'UJ-042',
    title: 'Upgrade and downgrade proration behavior is validated across monthly and annual plans',
    module: 'Billing',
    journey: 'Subscription Management',
    priority: 'Critical',
    status: 'automated',
    automation: 'SubscriptionLifecycleExecution.spec.ts > immediate Stripe proration checkout and monthly-to-annual billing change is immediate'
  },
  {
    id: 'UJ-043',
    title: 'Role-based permissions hide or block unauthorized functionality',
    module: 'Access Control',
    journey: 'Permissions',
    priority: 'High',
    status: 'controlled',
    automation: 'PermissionAccess.spec.ts',
    dependency: 'Requires PERMISSION_TEST_ENABLED plus prepared allowed and restricted users.'
  },
  {
    id: 'UJ-044',
    title: 'Role change from member to admin applies correct MFA policy on next login',
    module: 'Access Control',
    journey: 'Permissions',
    priority: 'High',
    status: 'future',
    dependency: 'Requires confirmed MFA role-policy behavior and admin API/UI fixture.'
  },
  {
    id: 'UJ-045',
    title: 'Notification and email events are captured for signup, trial, billing, unlock, and password reset',
    module: 'Notifications',
    journey: 'Communication',
    priority: 'Medium',
    status: 'blocked',
    dependency: 'Requires email inbox/API access, notification test hooks, or message capture service.'
  },
  {
    id: 'UJ-046',
    title: 'Audit trail records security, billing, trial, and profile changes',
    module: 'Audit',
    journey: 'Audit Trail',
    priority: 'Medium',
    status: 'blocked',
    dependency: 'Requires admin/API/DB access to audit log records.'
  },
  {
    id: 'UJ-047',
    title: 'User can sign out successfully from the application',
    module: 'Authentication',
    journey: 'Logout',
    priority: 'Critical',
    status: 'automated',
    automation: 'Subscriber.spec.ts and DashboardNavigation.spec.ts'
  },
  {
    id: 'UJ-048',
    title: 'Accessibility and keyboard navigation checks cover core auth and dashboard surfaces',
    module: 'Accessibility',
    journey: 'Accessibility',
    priority: 'Medium',
    status: 'automated',
    automation: 'AccessibilityBrowser.spec.ts'
  },
  {
    id: 'UJ-049',
    title: 'Password visibility toggle shows and hides entered password without changing value',
    module: 'Authentication',
    journey: 'Login',
    priority: 'Medium',
    status: 'automated',
    automation: 'AuthUiValidation.spec.ts'
  },
  {
    id: 'UJ-050',
    title: 'Deep link to protected page redirects to login and returns to intended page after authentication',
    module: 'Session Security',
    journey: 'Session Security',
    priority: 'High',
    status: 'automated',
    automation: 'SessionSecurity.spec.ts > Deep link to protected page returns to intended route after login'
  },
  {
    id: 'UJ-051',
    title: 'Expired session redirects to login without exposing protected dashboard data',
    module: 'Session Security',
    journey: 'Session Security',
    priority: 'High',
    status: 'future',
    dependency: 'Requires token/session expiry control or backend test hook.'
  },
  {
    id: 'UJ-052',
    title: 'Multiple browser tabs keep session state consistent after logout',
    module: 'Session Security',
    journey: 'Session Security',
    priority: 'Medium',
    status: 'automated',
    automation: 'SessionSecurity.spec.ts > Login once then logout blocks back refresh tabs and protected routes'
  },
  {
    id: 'UJ-053',
    title: 'Login lockout and unlock-link rate limits follow admin configuration',
    module: 'Authentication',
    journey: 'Account Recovery',
    priority: 'High',
    status: 'future',
    dependency: 'Requires rate-limit configuration API/admin access and safe lockout fixture.'
  },
  {
    id: 'UJ-054',
    title: 'Signup, login, forgot-password, and plan terms links open valid policy pages',
    module: 'Legal Links',
    journey: 'Legal / Terms',
    priority: 'Medium',
    status: 'automated',
    automation: 'AuthUiValidation.spec.ts > Login register and forgot-password expose usable privacy policy links; DashboardNavigation.spec.ts > Dashboard footer legal and support links; PlanSelectionValidation.spec.ts / OverlayStrategistsTrial.spec.ts > trial terms'
  },
  {
    id: 'UJ-055',
    title: 'Email input trims leading and trailing spaces before validation',
    module: 'Authentication',
    journey: 'Login',
    priority: 'Medium',
    status: 'automated',
    automation: 'AuthNegative.spec.ts and SignupNegative.spec.ts'
  },
  {
    id: 'UJ-056',
    title: 'Same mobile number is allowed across multiple accounts when business rule permits it',
    module: 'Signup',
    journey: 'Registration',
    priority: 'Medium',
    status: 'future',
    dependency: 'Requires explicit business-rule confirmation and two-account fixture using same mobile number.'
  },
  {
    id: 'UJ-057',
    title: 'Onboarding step refresh keeps saved progress and does not duplicate submissions',
    module: 'Onboarding',
    journey: 'Onboarding Persistence',
    priority: 'High',
    status: 'automated',
    automation: 'OnboardingFieldValidation.spec.ts'
  },
  {
    id: 'UJ-058',
    title: 'Profile menu displays correct user name and email after login',
    module: 'Profile',
    journey: 'Profile',
    priority: 'Medium',
    status: 'automated',
    automation: 'ProfileNegative.spec.ts and DashboardNavigation.spec.ts'
  },
  {
    id: 'UJ-059',
    title: 'Authenticated dashboard footer exposes legal and support destinations',
    module: 'Legal Links',
    journey: 'Legal / Terms',
    priority: 'Medium',
    status: 'automated',
    automation: 'DashboardNavigation.spec.ts > Dashboard footer legal and support links expose usable targets'
  },
  {
    id: 'UJ-060',
    title: 'Authenticated dashboard routes tolerate trailing slash and unknown query parameters',
    module: 'Dashboard',
    journey: 'Dashboard Navigation',
    priority: 'Medium',
    status: 'automated',
    automation: 'DashboardNavigation.spec.ts > Authenticated direct routes tolerate trailing slash and unknown query parameters'
  },
  {
    id: 'UJ-061',
    title: 'Public login, forgot-password, and registration routes tolerate trailing slash and unknown query parameters',
    module: 'Authentication',
    journey: 'Login',
    priority: 'Medium',
    status: 'automated',
    automation: 'AuthUiValidation.spec.ts > Public auth routes tolerate trailing slash and unknown query parameters'
  },
  {
    id: 'UJ-062',
    title: 'Dashboard notification panel can be opened, dismissed, reopened, and used after refresh',
    module: 'Dashboard',
    journey: 'Dashboard Navigation',
    priority: 'Medium',
    status: 'automated',
    automation: 'DashboardNavigation.spec.ts > Notification panel opens and closes without disrupting dashboard; Notification panel remains usable after dashboard refresh'
  },
  {
    id: 'UJ-063',
    title: 'Overlay Strategists free trial is limited to one verified email and mobile identity',
    module: 'Plan Selection',
    journey: 'Trial Eligibility',
    priority: 'Critical',
    status: 'automated',
    automation: 'OverlayStrategistsTrial.spec.ts > without card trial is limited to one verified email and mobile'
  },
  {
    id: 'UJ-064',
    title: 'Beta menu opens Broker Transactions, Position P&L, Profit & Loss, and Roll Configuration',
    module: 'Beta',
    journey: 'Beta',
    priority: 'High',
    status: 'automated',
    automation: 'BetaSurfaces.spec.ts'
  },
  {
    id: 'UJ-065',
    title: 'Roll Configuration lists Income First, Tax-Aware, Balanced, and Custom benchmark templates',
    module: 'Roll Configuration',
    journey: 'Roll Configuration',
    priority: 'Critical',
    status: 'automated',
    automation: 'RollConfiguration.spec.ts > Benchmark templates Income Tax-Aware Balanced and Custom are listed'
  },
  {
    id: 'UJ-066',
    title: 'Roll Configuration enforces field-level validation for each template including empty and zeroed fields',
    module: 'Roll Configuration',
    journey: 'Roll Configuration',
    priority: 'Critical',
    status: 'automated',
    automation: 'RollConfiguration.spec.ts > Income First / Tax-Aware / Balanced / Custom field-level validation'
  },
  {
    id: 'UJ-067',
    title: 'Roll Configuration can draft, activate, demote, and remove AIR strategies from active',
    module: 'Roll Configuration',
    journey: 'Roll Configuration',
    priority: 'Critical',
    status: 'automated',
    automation: 'RollConfiguration.spec.ts > Clone Income First draft; Clone Tax-Aware activate then demote and remove'
  }
];

function statusReason(scenario: UserJourneyScenario) {
  if (scenario.status === 'automated') {
    return `Covered by ${scenario.automation}. Run the linked executable spec for full UI validation.`;
  }

  if (scenario.status === 'controlled') {
    return scenario.dependency ??
      'Scenario requires controlled credentials, email-link handoff, OTP, backup code, or stable external state.';
  }

  if (scenario.status === 'blocked') {
    return scenario.dependency ??
      'Scenario requires dev, admin, API, scheduler, Stripe, email, or database support before safe automation.';
  }

  return scenario.dependency ??
    'Future coverage item documented for roadmap tracking.';
}

test.describe(
  'OOLTool User Journey Coverage Matrix',
  () => {
    for (const scenario of userJourneyScenarios) {
      test(
        `${scenario.id} - ${scenario.title}`,
        async () => {
          test.info().annotations.push(
            {
              type: 'priority',
              description: scenario.priority
            },
            {
              type: 'automation-status',
              description: scenario.status
            },
            {
              type: 'source-test-id',
              description:
                scenario.sourceIds?.join(
                  ', '
                ) ?? scenario.id
            },
            {
              type: 'module',
              description: scenario.module
            },
            {
              type: 'journey',
              description: scenario.journey
            }
          );

          test.skip(
            scenario.status !== 'automated',
            statusReason(scenario)
          );
        }
      );
    }
  }
);
