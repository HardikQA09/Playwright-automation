function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const MATRIX_SPEC_FILES = [
  {
    file: 'tests/UserJourneyCoverageMatrix.spec.ts',
    useCase: 'User Journey Coverage',
    source: 'User Journey Coverage Matrix',
  },
  {
    file: 'tests/OverlayStrategistsTrialMatrix.spec.ts',
    useCase: 'Use Case 1 - Overlay Strategists Trial',
    source: 'Subscription Stripe Matrix',
  },
  {
    file: 'tests/NewSubscriptionPurchaseMatrix.spec.ts',
    useCase: 'Use Case 2 - New Subscription Purchase',
    source: 'Subscription Stripe Matrix',
  },
  {
    file: 'tests/UpgradeSubscriptionMatrix.spec.ts',
    useCase: 'Use Case 3 - Upgrade Subscription',
    source: 'Subscription Stripe Matrix',
  },
  {
    file: 'tests/DowngradeSubscriptionMatrix.spec.ts',
    useCase: 'Use Case 4 - Downgrade Subscription',
    source: 'Subscription Stripe Matrix',
  },
  {
    file: 'tests/MonthlyAnnualBillingChangeMatrix.spec.ts',
    useCase: 'Use Case 5 - Monthly To Annual Billing Change',
    source: 'Subscription Stripe Matrix',
  },
  {
    file: 'tests/AnnualMonthlyBillingChangeMatrix.spec.ts',
    useCase: 'Use Case 6 - Annual To Monthly Billing Change',
    source: 'Subscription Stripe Matrix',
  },
  {
    file: 'tests/SubscriptionCancellationMatrix.spec.ts',
    useCase: 'Use Case 7 - Subscription Cancellation',
    source: 'Subscription Stripe Matrix',
  },
  {
    file: 'tests/FailedPaymentDunningMatrix.spec.ts',
    useCase: 'Use Case 8 - Failed Payment And Dunning',
    source: 'Subscription Stripe Matrix',
  },
];

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getAnnotation(test = {}, type) {
  return asArray(test.annotations)
    .find(annotation => annotation?.type === type)?.description;
}

function getLastTitleSegment(test = {}) {
  return String(test.title ?? test.testName ?? test.id ?? 'Skipped scenario')
    .split(' > ')
    .map(part => part.trim())
    .filter(Boolean)
    .at(-1) ?? 'Skipped scenario';
}

function getMatrixSpecForFile(file = '') {
  const normalizedFile = String(file).replace(/\\/g, '/').toLowerCase();

  return MATRIX_SPEC_FILES.find(matrix =>
    normalizedFile.endsWith(matrix.file.toLowerCase()) ||
    normalizedFile.endsWith(matrix.file.split('/').at(-1).toLowerCase())
  );
}

function inferModule(test = {}) {
  if (test.module) {
    return test.module;
  }

  const annotatedModule = getAnnotation(test, 'module');
  if (annotatedModule) {
    return annotatedModule;
  }

  const value = `${test.title ?? ''} ${test.file ?? ''}`.toLowerCase();

  if (value.includes('stripe') || value.includes('billing') || value.includes('subscription')) return 'Billing';
  if (value.includes('mfa') || value.includes('2fa')) return 'MFA';
  if (value.includes('forgot') || value.includes('reset') || value.includes('password')) return 'Password';
  if (value.includes('risk')) return 'Risk Profile';
  if (value.includes('compliance')) return 'Compliance';
  if (value.includes('onboarding') || value.includes('signup') || value.includes('registration')) return 'Signup';
  if (value.includes('profile')) return 'Profile';
  if (value.includes('broker integration') || value.includes('connect broker') || value.includes('manage accounts')) return 'Broker Integration';
  if (value.includes('dashboard')) return 'Dashboard';

  return 'General';
}

function normalizeReason(value) {
  const reason = String(value ?? '').replace(/\s+/g, ' ').trim();

  if (!reason) {
    return 'Scenario was not executed in this run.';
  }

  if (reason.length <= 180) {
    return reason;
  }

  const budget = 179;
  let cut = reason.slice(0, budget);
  const lastSpace = cut.lastIndexOf(' ');

  if (lastSpace > Math.floor(budget * 0.4)) {
    cut = cut.slice(0, lastSpace);
  } else {
    cut = cut.replace(/[A-Za-z0-9_-]+$/g, '').trim();
  }

  return `${cut.replace(/[.,;:]+$/g, '').trim()}…`;
}

function findScenarioArrayLiteral(content) {
  const match = /const\s+\w*Scenarios\w*\s*(?::[^=]+)?=\s*\[/.exec(content);

  if (!match) {
    return '';
  }

  const start = match.index + match[0].lastIndexOf('[');
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '[') {
      depth += 1;
    }

    if (char === ']') {
      depth -= 1;

      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return '';
}

function readMatrixScenarios(options = {}) {
  const fs = options.fs ?? require('fs');
  const path = options.path ?? require('path');
  const projectRoot = options.projectRoot ?? process.cwd();
  const items = [];

  for (const matrix of MATRIX_SPEC_FILES) {
    const absolutePath = path.join(projectRoot, matrix.file);

    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    const literal = findScenarioArrayLiteral(content);

    if (!literal) {
      continue;
    }

    try {
      const scenarios = Function(`"use strict"; return (${literal});`)();

      for (const scenario of asArray(scenarios)) {
        if (!scenario?.id || !scenario?.title) {
          continue;
        }

        items.push({
          ...scenario,
          useCase: matrix.useCase,
          source: matrix.source,
          file: matrix.file,
        });
      }
    } catch (error) {
      items.push({
        id: `matrix-read-${slug(matrix.file)}`,
        title: `${matrix.useCase} matrix could not be parsed`,
        priority: 'High',
        status: 'blocked',
        dependency: error.message,
        sourceIds: [],
        useCase: matrix.useCase,
        source: matrix.source,
        file: matrix.file,
      });
    }
  }

  return items;
}

function getKnownScenarioKeys(tests = []) {
  const keys = new Set();

  for (const test of asArray(tests)) {
    const value = `${test.id ?? ''} ${test.title ?? ''} ${test.testName ?? ''}`;
    const scenarioIds = value.match(/\b[A-Z]+-\d+\b/g) ?? [];

    for (const id of scenarioIds) {
      keys.add(id.toLowerCase());
    }

    for (const sourceId of String(getAnnotation(test, 'source-test-id') ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)) {
      keys.add(sourceId.toLowerCase());
    }
  }

  return keys;
}

function matrixScenarioToGap(scenario = {}, index = 0) {
  const status = scenario.status ?? 'future';
  const category =
    status === 'automated'
      ? 'Traceability'
      : status === 'blocked' || status === 'known-bug'
        ? 'Blocked'
        : status === 'controlled' || status === 'manual-verified'
          ? 'Controlled'
          : 'Future';
  const reason =
    status === 'automated'
      ? `Documented matrix scenario. Covered by ${scenario.automation ?? 'a linked executable spec'}, but it was not included in this AIR execution.`
      : status === 'known-bug'
        ? scenario.dependency ?? 'Known product bug — tracked separately; not an automation failure.'
        : scenario.dependency ?? 'Scenario is documented but needs fixture, admin, API, scheduler, or third-party support.';
  const nextAction =
    status === 'automated'
      ? `Run linked executable coverage: ${scenario.automation ?? scenario.file ?? 'matrix scenario'}.`
      : status === 'known-bug'
        ? 'Track the product defect to resolution, then re-enable the matrix row as automated coverage.'
        : getNextAction(
        {
          title: scenario.title,
          file: scenario.file,
          annotations: [
            { type: 'automation-status', description: status },
          ],
          error: reason,
        },
        category
      );

  return {
    id: `matrix-${slug(scenario.id ?? index + 1)}`,
    title: `${scenario.id} - ${scenario.title}`,
    fullTitle: `${scenario.useCase} > ${scenario.id} - ${scenario.title}`,
    module: inferModule({ title: `${scenario.useCase} ${scenario.title}`, file: scenario.file }),
    file: scenario.file ?? '',
    status: 'not-executed',
    category,
    priority: scenario.priority ?? 'Review',
    sourceIds: asArray(scenario.sourceIds),
    useCase: scenario.useCase,
    source: scenario.source,
    automation: scenario.automation ?? '',
    reason: normalizeReason(reason),
    nextAction: normalizeReason(nextAction),
  };
}

function appendMatrixCoverageGaps(tests = [], items = [], options = {}) {
  const matrixScenarios = readMatrixScenarios(options);
  const knownKeys = getKnownScenarioKeys(tests);
  const existingGapKeys = new Set(
    asArray(items).flatMap(item => [
      String(item.id ?? '').replace(/^matrix-/, '').toLowerCase(),
      ...asArray(item.sourceIds).map(sourceId => String(sourceId).toLowerCase()),
    ])
  );

  const matrixItems = [];

  for (const scenario of matrixScenarios) {
    const scenarioKeys = [
      String(scenario.id ?? '').toLowerCase(),
      ...asArray(scenario.sourceIds).map(sourceId => String(sourceId).toLowerCase()),
    ].filter(Boolean);

    if (scenarioKeys.some(key => knownKeys.has(key) || existingGapKeys.has(key))) {
      continue;
    }

    matrixItems.push(matrixScenarioToGap(scenario, matrixItems.length));
  }

  return [...items, ...matrixItems];
}

const DOCUMENTED_GAP_CATEGORIES = ['Traceability', 'Blocked', 'Future', 'Controlled'];

function isDocumentedGapCategory(category) {
  return DOCUMENTED_GAP_CATEGORIES.includes(category);
}

function getSkipReasonText(test = {}) {
  return [
    test.error,
    test.reason,
    getAnnotation(test, 'skip'),
    getAnnotation(test, 'fixme'),
    getAnnotation(test, 'dependency'),
  ]
    .filter(Boolean)
    .join(' ');
}

function classifyGap(test = {}) {
  const automationStatus = String(getAnnotation(test, 'automation-status') ?? '').toLowerCase();
  const title = String(test.title ?? '').toLowerCase();
  const reason = getSkipReasonText(test).toLowerCase();

  if (automationStatus === 'blocked' || automationStatus === 'known-bug') return 'Blocked';
  if (automationStatus === 'future') return 'Future';
  if (automationStatus === 'controlled' || automationStatus === 'manual-verified') return 'Controlled';
  if (automationStatus === 'automated') {
    if (
      reason.includes('air coverage-ingestion') ||
      /cover(?:ed|s) by/.test(reason) ||
      reason.includes('already covers')
    ) {
      return 'Traceability';
    }

    return 'Controlled';
  }
  if (
    /cover(?:ed|s) by/.test(reason) ||
    reason.includes('already covers') ||
    (title.includes('matrix') && /cover(?:ed|s) by/.test(reason))
  ) {
    return 'Traceability';
  }
  if (
    /known (?:defect|bug|issue)/.test(reason) ||
    /confirmed product bug/.test(reason) ||
    /product bug:/.test(reason) ||
    /cancel fixture .+ cannot log in/.test(reason) ||
    /no .+ cancel fixture email configured/.test(reason) ||
    /monthly cancel-option checks need a monthly paid subscriber/.test(reason) ||
    /disposable stripe fallback is disabled/.test(reason)
  ) {
    return 'Blocked';
  }
  if (
    /enable [a-z0-9_]+=/.test(reason) ||
    /_enabled/.test(reason) ||
    reason.includes('controlled execution') ||
    reason.includes('env flag') ||
    reason.includes('gated')
  ) {
    return 'Controlled';
  }
  if (title.includes('mfa') || title.includes('forgot') || title.includes('stripe') || title.includes('email')) {
    return 'Controlled';
  }

  return test.status === 'interrupted' ? 'Interrupted' : 'Skipped';
}

function getGapReason(test = {}) {
  const automationStatus = getAnnotation(test, 'automation-status');
  const error = normalizeReason(getSkipReasonText(test));

  if (automationStatus === 'automated' && /cover(?:ed|s) by/i.test(error)) {
    return error;
  }

  if (automationStatus === 'blocked') {
    return error === 'Scenario was not executed in this run.'
      ? 'Requires dev, admin, backend, scheduler, third-party, or fixture support before UI automation can execute it safely.'
      : error;
  }

  if (automationStatus === 'future') {
    return error === 'Scenario was not executed in this run.'
      ? 'Future coverage item documented for roadmap tracking.'
      : error;
  }

  return error;
}

function getNextAction(test = {}, category) {
  const title = String(test.title ?? '').toLowerCase();

  if (category === 'Traceability') {
    return 'Run the linked executable spec for browser validation; keep this row for client traceability.';
  }

  if (category === 'Blocked') {
    const reason = getSkipReasonText(test).toLowerCase();
    if (/known (?:defect|bug|issue)|confirmed product bug|product bug:/.test(reason)) {
      return 'Track the product defect to resolution, then re-enable automated coverage for this scenario.';
    }
    if (/cancel fixture|paid subscriber|monthly cancel-option/.test(reason)) {
      return 'Restore a working paid cancel fixture (monthly/yearly) or remap CANCEL_* credentials; disposable Stripe fallback stays disabled for clean runs.';
    }
    return 'Request the required fixture, admin control, API support, scheduler control, or third-party test hook.';
  }

  if (title.includes('mfa') || title.includes('2fa')) {
    return 'Provide MFA secret, backup code, trusted-device fixture, or manual OTP handoff.';
  }

  if (title.includes('forgot') || title.includes('email') || title.includes('reset')) {
    return 'Provide email-link access or a backend/API test hook for reset and verification links.';
  }

  if (title.includes('stripe') || title.includes('billing') || title.includes('subscription')) {
    return 'Provide Stripe sandbox fixtures, portal state, scheduler control, or API support.';
  }

  return 'Confirm prerequisites and rerun when the scenario is in scope for this execution.';
}

function buildCoverageGaps(tests = [], options = {}) {
  const skippedItems = asArray(tests)
    .filter(test => ['skipped', 'interrupted', 'unknown'].includes(test.status))
    .map((test, index) => {
      const category = classifyGap(test);
      test.gapCategory = category;
      const matrix = getMatrixSpecForFile(test.file);

      return {
        id: test.id ?? `coverage-gap-${index + 1}`,
        title: getLastTitleSegment(test),
        fullTitle: test.title ?? test.id ?? `Coverage gap ${index + 1}`,
        module: inferModule(test),
        file: test.file ?? '',
        status: test.status ?? 'skipped',
        category,
        priority: getAnnotation(test, 'priority') ?? 'Review',
        useCase: matrix?.useCase,
        source: matrix?.source,
        sourceIds: String(getAnnotation(test, 'source-test-id') ?? '')
          .split(',')
          .map(item => item.trim())
          .filter(Boolean),
        reason: getGapReason(test),
        nextAction: getNextAction(test, category),
      };
    });
  const items = appendMatrixCoverageGaps(tests, skippedItems, options);

  const byCategory = items.reduce((groups, item) => {
    groups[item.category] = (groups[item.category] ?? 0) + 1;
    return groups;
  }, {});

  return {
    summary: {
      total: items.length,
      blocked: byCategory.Blocked ?? 0,
      controlled: byCategory.Controlled ?? 0,
      traceability: byCategory.Traceability ?? 0,
      future: byCategory.Future ?? 0,
      interrupted: byCategory.Interrupted ?? 0,
      skipped: byCategory.Skipped ?? 0,
      documented: items.filter(item => item.status === 'not-executed').length,
    },
    items,
  };
}

module.exports = {
  DOCUMENTED_GAP_CATEGORIES,
  buildCoverageGaps,
  classifyGap,
  findScenarioArrayLiteral,
  getGapReason,
  getNextAction,
  getSkipReasonText,
  inferModule,
  isDocumentedGapCategory,
  readMatrixScenarios,
  slug,
};
