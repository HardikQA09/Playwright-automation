function getFailureText(test = {}) {
  return `${test.title ?? ''}\n${test.error ?? ''}`
    .replace(/\u001b\[[0-9;]*m/g, '')
    .toLowerCase();
}

function hasAny(value, patterns) {
  return patterns.some(pattern => value.includes(pattern));
}

function getFailureType(test = {}) {
  if (test.manualDefect) {
    return 'Product';
  }

  const text = getFailureText(test);

  if (
    hasAny(
      text,
      [
        'err_connection_closed',
        'err_connection_reset',
        'err_internet_disconnected',
        'econnreset',
        'epipe',
        'target page, context or browser has been closed',
        'browser has been closed',
        'page.goto: net::',
        'login failed after 3 attempts'
      ]
    )
  ) {
    return 'Environment';
  }

  if (
    hasAny(
      text,
      [
        'stripe portal',
        'billing subscription management',
        'cancel subscription form accepts reason',
        'current subscription',
        'payment method',
        'billing information',
        'already scheduled to cancel',
        'checkout.stripe.com'
      ]
    )
  ) {
    return 'Test Data / External State';
  }

  if (
    hasAny(
      text,
      [
        'password visibility control',
        'expected: not "password"',
        'locator.waitfor: timeout',
        'element(s) not found',
        'strict mode violation',
        'to be visible',
        'tohaveurl'
      ]
    )
  ) {
    return 'Automation';
  }

  return 'Product';
}

function getFailureSeverity(test = {}) {
  const failureType = getFailureType(test);

  if (failureType !== 'Product') {
    return 'Medium';
  }

  if (test.critical) {
    return 'Critical';
  }

  return 'High';
}

function getFailureCategory(test = {}) {
  if (test.category) {
    return test.category;
  }

  const title = String(test.title ?? '').toLowerCase();
  const error = String(test.error ?? '').toLowerCase();

  if (title.includes('payment') || title.includes('billing')) {
    return 'Billing';
  }

  if (
    title.includes('login') ||
    title.includes('auth') ||
    title.includes('session') ||
    title.includes('mfa') ||
    title.includes('2fa') ||
    title.includes('two-factor') ||
    title.includes('backup code') ||
    title.includes('authenticator')
  ) {
    return 'Authentication';
  }

  if (title.includes('password')) {
    return 'Password';
  }

  if (title.includes('signup') || title.includes('register') || title.includes('otp')) {
    return 'Registration';
  }

  if (error.includes('timeout')) {
    return 'Timeout';
  }

  return 'Functional';
}

function getBusinessImpact(test = {}) {
  if (test.businessImpact) {
    return test.businessImpact;
  }

  const failureType = getFailureType(test);

  if (failureType !== 'Product') {
    return 'Execution evidence requires review; product impact is not confirmed.';
  }

  if (test.critical) {
    return 'Critical business flow may be blocked.';
  }

  return 'Module behavior requires review before release confidence is confirmed.';
}

function getRecommendedInvestigationAction(test = {}) {
  if (test.recommendedInvestigationAction) {
    return test.recommendedInvestigationAction;
  }

  const failureType = getFailureType(test);

  if (failureType === 'Environment') {
    return 'Rerun the scenario and review network/session stability before logging a product defect.';
  }

  if (failureType === 'Automation') {
    return 'Review selector, timing, and assertion logic before treating this as a product defect.';
  }

  if (failureType === 'Test Data / External State') {
    return 'Verify account state, external portal state, and prepared test data, then rerun the scenario.';
  }

  const category = getFailureCategory(test);

  if (category === 'Timeout') {
    return 'Review trace, network timing, and page readiness for the failed step.';
  }

  if (category === 'Billing') {
    return 'Review billing evidence, payment state, transaction data, and related service logs.';
  }

  if (category === 'Authentication') {
    return 'Review login/session evidence, auth state, and user account configuration.';
  }

  return 'Open attached evidence, reproduce the scenario, and confirm whether the issue is product, data, or automation related.';
}

function getFailureSummary(test = {}) {
  if (test.failureSummary || test.shortReason || test.whyFailed) {
    return test.failureSummary ?? test.shortReason ?? test.whyFailed;
  }

  const rawError = String(test.error ?? test.errorMessage ?? '').trim();
  const rawText = getFailureText(test);
  const title = String(test.title ?? test.testName ?? '').toLowerCase();

  if (!rawError && test.manualDefect) {
    return 'Confirmed product defect tracked outside the current Playwright execution.';
  }

  if (!rawError) {
    if (title.includes('visible') || title.includes('load') || title.includes('shown')) {
      return 'Expected page content or control was not visible during validation.';
    }

    if (title.includes('initial state') || title.includes('safe before checkout')) {
      return 'The initial screen state did not match the expected safe pre-checkout condition.';
    }

    if (title.includes('plan') || title.includes('billing') || title.includes('subscription')) {
      return 'Billing or plan-selection UI state did not match the expected validation condition.';
    }

    if (title.includes('profile') || title.includes('compliance') || title.includes('risk')) {
      return 'Saved account profile, risk, or compliance data did not match the expected state.';
    }

    return 'No detailed error message was captured. Review the attached screenshot, video, trace, or Playwright report.';
  }

  if (rawText.includes('registration otp input did not appear')) {
    return 'Registration OTP field did not appear after requesting the SMS code.';
  }

  // Prefer product-specific wording so AIR cards are easy to identify.
  if (
    title.includes('yearly cancel')
    || rawText.includes('cancel at expiry')
    || rawText.includes('cancel and refund')
    || title.includes('sees yearly cancel')
  ) {
    return 'Yearly cancel should show Cancel at expiry (no refund) and Cancel and refund — monthly plans must not show a refund option.';
  }

  if (
    title.includes('monthly cancel')
    || rawText.includes('refunds apply to annual')
    || (title.includes('monthly') && title.includes('cancel'))
  ) {
    return 'Monthly cancel should only offer cancel at period end — no Cancel and refund option.';
  }

  if (
    title.includes('roll configuration')
    || title.includes('field-level validation')
    || rawText.includes('same-strike min days')
    || rawText.includes('my balanced roll')
    || rawText.includes('my tax-aware')
  ) {
    return 'Roll Configuration template defaults or field-level min validation messages did not match the template under test.';
  }

  if (title.includes('scheduled downgrade') || title.includes('sc-141') || rawText.includes('downgrade to income')) {
    return 'Billing overview did not show the scheduled downgrade banner with its effective date.';
  }

  if (title.includes('password visibility') || rawText.includes('show password')) {
    return 'Login Show password toggle did not register Show	oHide / type=text in automation (manual toggle works — update detection).';
  }

  if (title.includes('footer legal')) {
    return 'Footer legal check timed out — often a slow /dashboard reload between links, not a broken footer href.';
  }

  if (title.includes('strategy library') && (title.includes('category') || title.includes('filter'))) {
    return 'Strategy library category/filter walk hit the test time limit before every filter finished.';
  }

  if (rawText.includes('tohaveurl') || rawText.includes('expect(page).tohaveurl')) {
    return 'The application did not navigate to the expected page after the action.';
  }

  if (
    rawText.includes('locator.waitfor') ||
    rawText.includes('to be visible') ||
    rawText.includes('element(s) not found')
  ) {
    return 'An expected UI element was not visible or available before the timeout.';
  }

  if (rawText.includes('test timeout') || rawText.includes('timeout') || rawText.includes('timed out')) {
    const scenario = String(test.title ?? test.testName ?? '')
      .split('>')
      .map((part) => part.trim())
      .filter(Boolean)
      .pop();
    return scenario
      ? `“${scenario}” timed out before the expected screen or control appeared.`
      : 'The scenario timed out before the expected screen or control appeared.';
  }

  if (rawText.includes('invalid email or password') || rawText.includes('login failed after')) {
    return 'Login did not complete with the configured test account or account state.';
  }

  if (
    /\bmfa\b|two-factor|backup code/.test(rawText) ||
    (String(test.title ?? test.testName ?? '').toLowerCase().includes('mfa') && rawText.includes('verification code'))
  ) {
    return 'MFA verification did not complete with the current code, device trust, or account state.';
  }

  if (
    rawText.includes('stripe') ||
    rawText.includes('subscription') ||
    rawText.includes('payment method') ||
    rawText.includes('billing portal')
  ) {
    return 'Billing or Stripe subscription state did not match the expected prepared test condition.';
  }

  const usefulLine = rawError
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .find(line =>
      line &&
      !/^at\s/i.test(line) &&
      !/^call log:/i.test(line) &&
      !/^\d+\s*[×x]\s*/.test(line) &&
      !/^[A-Z]:\\/.test(line)
    );

  if (!usefulLine) {
    return 'Failure details require evidence review.';
  }

  return usefulLine.length > 140
    ? `${usefulLine.slice(0, 137).trim()}...`
    : usefulLine;
}

function getPlainFailureExplanation(test = {}) {
  if (test.whatFailed || test.whyFailed) {
    return {
      whatFailed: test.whatFailed ?? 'Scenario did not complete as expected.',
      whyFailed: test.whyFailed ?? getFailureSummary(test),
    };
  }

  const title = String(test.title ?? test.testName ?? '').toLowerCase();
  const rawText = getFailureText(test);

  if (test.manualDefect) {
    return {
      whatFailed: 'A confirmed product defect is linked to this scenario.',
      whyFailed: 'The issue is already known and tracked outside the current Playwright execution.',
    };
  }

  if (rawText.includes('enoent') || rawText.includes('no such file or directory')) {
    return {
      whatFailed: 'Playwright could not attach one of the evidence files.',
      whyFailed: 'A screenshot, video, trace, or report artifact was missing while the test report was being created. This usually points to an automation artifact issue, not a confirmed product defect.',
    };
  }

  if (rawText.includes('registration otp input did not appear')) {
    return {
      whatFailed: 'Registration could not continue to the OTP step.',
      whyFailed: 'After requesting the SMS code, the OTP input did not appear. The SMS handoff, test mobile number, or page response needs review.',
    };
  }

  if (rawText.includes('invalid email or password') || rawText.includes('login failed after')) {
    return {
      whatFailed: 'The configured test user could not log in.',
      whyFailed: 'The account may have the wrong password, may be locked, may not be verified, or may no longer be in the expected prepared state.',
    };
  }

  if (title.includes('signup otp input accepts more than six digits')) {
    return {
      whatFailed: 'Signup OTP field allowed more than six digits.',
      whyFailed: 'The field should restrict input to six digits before submit, but the UI currently accepts a longer value and validates later.',
    };
  }

  if (title.includes('invoice')) {
    return {
      whatFailed: 'Invoice validation did not match the expected paid invoice state.',
      whyFailed: 'The invoice page, paid status, PDF link, or invoice details were not visible in the expected format before the assertion completed.',
    };
  }

  if (
    title.includes('billing') ||
    title.includes('subscription') ||
    title.includes('stripe') ||
    rawText.includes('stripe') ||
    rawText.includes('billing portal')
  ) {
    return {
      whatFailed: 'Billing or subscription validation did not complete as expected.',
      whyFailed: 'The expected billing action, Stripe portal state, trial control, subscription detail, or prepared account state was not available during the run.',
    };
  }

  if (
    title.includes('plan selection') ||
    title.includes('curious explorer') ||
    title.includes('overlay strategists') ||
    title.includes('choose your plan')
  ) {
    return {
      whatFailed: 'Plan-selection validation did not reach the expected result.',
      whyFailed: 'The test could not confirm the expected plan option, trial modal, checkout redirect, or dashboard completion state.',
    };
  }

  if (title.includes('navigates to create account')) {
    return {
      whatFailed: 'Sign up did not open the create-account page.',
      whyFailed: 'The login page stayed on Welcome back after Sign up was clicked.',
    };
  }

  if (rawText.includes('reset-password') && (rawText.includes('tohaveurl') || rawText.includes('/login'))) {
    return {
      whatFailed: 'The new password stayed on the reset page.',
      whyFailed: 'Update Password did not open the sign-in page.',
    };
  }

  if (rawText.includes('keep my plan')) {
    return {
      whatFailed: 'Keep my plan was turned off.',
      whyFailed: 'The cancel box was still open, and the turned-off Keep my plan button could not be clicked.',
    };
  }

  if (
    /\bmfa\b|two-factor|backup code/.test(rawText) ||
    (title.includes('mfa') && rawText.includes('verification code'))
  ) {
    return {
      whatFailed: 'MFA verification did not complete successfully.',
      whyFailed: 'The OTP, backup code, trusted-device state, or MFA account configuration did not match the expected test condition.',
    };
  }

  if (title.includes('risk') || title.includes('compliance')) {
    return {
      whatFailed: 'Risk or compliance validation did not match the expected saved state.',
      whyFailed: 'The page opened, but one or more expected saved fields, dropdowns, or update confirmations were not available before timeout.',
    };
  }

  if (title.includes('profile')) {
    return {
      whatFailed: 'Profile validation did not stay in the expected state.',
      whyFailed: 'The expected profile page, field, validation message, or browser navigation state was not confirmed before timeout.',
    };
  }

  if (title.includes('dashboard') || title.includes('navigation')) {
    return {
      whatFailed: 'Dashboard navigation did not complete as expected.',
      whyFailed: 'One of the dashboard pages, tabs, refresh checks, or header controls did not reach a stable usable state in time.',
    };
  }

  if (rawText.includes('tohaveurl') || rawText.includes('expect(page).tohaveurl')) {
    return {
      whatFailed: 'The application did not navigate to the expected page.',
      whyFailed: 'After the test action, the browser remained on a different URL than expected before the timeout ended.',
    };
  }

  if (
    rawText.includes('locator.waitfor') ||
    rawText.includes('to be visible') ||
    rawText.includes('element(s) not found')
  ) {
    return {
      whatFailed: 'An expected page element was not visible.',
      whyFailed: 'The page did not show the required button, field, message, or status before the automation timeout.',
    };
  }

  if (rawText.includes('test timeout') || rawText.includes('timeout') || rawText.includes('timed out')) {
    return {
      whatFailed: 'The scenario timed out before completion.',
      whyFailed: 'The expected UI state, navigation, or backend response did not arrive within the allowed time.',
    };
  }

  return {
    whatFailed: 'The scenario did not complete as expected.',
    whyFailed: getFailureSummary(test),
  };
}

function getEvidenceLinks(test = {}, evidence = {}) {
  return Object.entries(evidence)
    .filter(([, value]) => Array.isArray(value))
    .flatMap(([type, items]) =>
      items
        .filter(item => item.testId === test.id)
        .map(item => ({
          type: item.type ?? type,
          name: item.name ?? item.type ?? type,
          path: item.path ?? '',
          contentType: item.contentType ?? '',
          attempt: item.attempt,
          retry: item.retry,
          attemptId: item.attemptId,
          attemptStatus: item.attemptStatus,
          previewable: item.previewable,
          boundingBox: item.boundingBox,
          region: item.region,
          metadata: item.metadata,
        }))
    );
}

function summarizeEvidenceLinks(links = []) {
  const summary = links.reduce(
    (counts, item) => {
      const type = item.type ?? 'attachment';
      counts[type] = (counts[type] ?? 0) + 1;
      counts.total += 1;
      return counts;
    },
    { total: 0 }
  );

  return {
    total: summary.total,
    screenshots: summary.screenshot ?? 0,
    videos: summary.video ?? 0,
    traces: summary.trace ?? 0,
    logs: summary.log ?? 0,
    attachments: summary.attachment ?? 0,
  };
}

function buildFailedTests(tests = [], evidence = {}) {
  return tests
    .filter(test => test.status === 'failed')
    .map(test => {
      const evidenceLinks = getEvidenceLinks(test, evidence);
      const failureType = getFailureType(test);
      const failureSummary = getFailureSummary(test);
      const plainFailure = getPlainFailureExplanation(test);

      return {
        testId: test.id,
        testName: test.title,
        title: test.title,
        module: test.module ?? 'General',
        file: test.file ?? '',
        status: test.status,
        severity: getFailureSeverity(test),
        category: getFailureCategory(test),
        failureType,
        failureSummary,
        shortReason: failureSummary,
        whatFailed: plainFailure.whatFailed,
        whyFailed: plainFailure.whyFailed,
        plainDescription: `${plainFailure.whatFailed} ${plainFailure.whyFailed}`,
        releaseImpact: failureType === 'Product'
          ? 'Product Review'
          : 'Automation / Environment Review',
        businessImpact: getBusinessImpact(test),
        errorMessage: test.error ?? '',
        error: test.error ?? '',
        evidence: evidenceLinks,
        evidenceSummary: summarizeEvidenceLinks(evidenceLinks),
        recommendedInvestigationAction: getRecommendedInvestigationAction(test),
      };
    });
}

module.exports = {
  buildFailedTests,
  getBusinessImpact,
  getEvidenceLinks,
  getFailureCategory,
  getFailureSeverity,
  getFailureSummary,
  getFailureType,
  getPlainFailureExplanation,
  getRecommendedInvestigationAction,
  summarizeEvidenceLinks,
};
