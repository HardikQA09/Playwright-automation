const DECISION_DISPLAY = {
  GO: 'GO',
  CONDITIONAL_GO: 'CONDITIONAL GO',
  NO_GO: 'NO GO',
};

const RISK_BY_DECISION = {
  GO: 'LOW',
  CONDITIONAL_GO: 'MEDIUM',
  NO_GO: 'HIGH',
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeDecision(value, fallback = 'NO_GO') {
  const normalized = String(value ?? fallback)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  return Object.prototype.hasOwnProperty.call(DECISION_DISPLAY, normalized)
    ? normalized
    : fallback;
}

function includesConfiguredValue(configuredValues = [], value) {
  const normalizedValue = String(value ?? '').trim().toLowerCase();

  return asArray(configuredValues)
    .map(item => String(item).trim().toLowerCase())
    .includes(normalizedValue);
}

function getReleaseRules(config = {}) {
  return config.releaseRules ?? {};
}

function getSeverityGroups(rules = {}) {
  return rules.failureSeverity ?? {};
}

function getJourneyStatusGroups(rules = {}) {
  return rules.journeyStatus ?? {};
}

function getModuleRiskGroups(rules = {}) {
  return rules.moduleRisk ?? {};
}

function getCriticalFailures(failedTests = [], rules = {}) {
  const severities = getSeverityGroups(rules);
  const criticalSeverities = [
    ...asArray(severities.blocker),
    ...asArray(severities.critical),
  ];

  return asArray(failedTests).filter(failure =>
    includesConfiguredValue(criticalSeverities, failure.severity)
  );
}

function getBlockerFailures(failedTests = [], rules = {}) {
  const blockerSeverities = getSeverityGroups(rules).blocker ?? [];

  return asArray(failedTests).filter(failure =>
    includesConfiguredValue(blockerSeverities, failure.severity)
  );
}

function getWarningFailures(failedTests = [], rules = {}) {
  const warningSeverities = getSeverityGroups(rules).warning ?? [];

  return asArray(failedTests).filter(failure =>
    includesConfiguredValue(warningSeverities, failure.severity)
  );
}

function getCriticalJourneys(businessJourneys = [], rules = {}) {
  const criticalStatuses = getJourneyStatusGroups(rules).critical ?? [];

  return asArray(businessJourneys).filter(journey =>
    journey.critical && includesConfiguredValue(criticalStatuses, journey.status)
  );
}

function getWarningJourneys(businessJourneys = [], rules = {}) {
  const warningStatuses = getJourneyStatusGroups(rules).warning ?? [];

  return asArray(businessJourneys).filter(journey =>
    journey.critical && includesConfiguredValue(warningStatuses, journey.status)
  );
}

function getRiskyModules(modules = [], rules = {}) {
  const criticalRisks = getModuleRiskGroups(rules).critical ?? [];

  return asArray(modules).filter(module =>
    module.critical && includesConfiguredValue(criticalRisks, module.risk)
  );
}

function getWarningModules(modules = [], rules = {}) {
  const warningRisks = getModuleRiskGroups(rules).warning ?? [];

  return asArray(modules).filter(module =>
    includesConfiguredValue(warningRisks, module.risk)
  );
}

function hasPartialExecution(summary = {}, businessJourneys = [], rules = {}, coverageGaps = {}) {
  if (summary.total === 0 || summary.executionStatus === 'No Data Available') {
    return true;
  }

  if (summary.interrupted > 0 || (summary.unexpectedSkipped ?? 0) > 0) {
    return true;
  }

  if ((coverageGaps.summary?.blocked ?? 0) > 0) {
    return true;
  }

  return getWarningJourneys(businessJourneys, rules).some(journey =>
    includesConfiguredValue(['Partial', 'Not Executed', 'No Data Available'], journey.status)
  );
}

function meetsRuleSet({ summary = {}, quality = {}, failedTests = [], businessHealth = 0 }, ruleSet = {}, rules = {}) {
  const criticalFailures = getCriticalFailures(failedTests, rules);
  const blockerFailures = getBlockerFailures(failedTests, rules);

  return (
    (summary.passRate ?? 0) >= (ruleSet.minimumPassRate ?? 0) &&
    businessHealth >= (ruleSet.minimumBusinessHealth ?? 0) &&
    (quality.score ?? 0) >= (ruleSet.minimumQualityScore ?? 0) &&
    (quality.confidence ?? 0) >= (ruleSet.minimumConfidence ?? 0) &&
    (summary.failed ?? 0) <= (ruleSet.maximumFailedTests ?? Number.POSITIVE_INFINITY) &&
    blockerFailures.length <= (ruleSet.maximumBlockerFailures ?? Number.POSITIVE_INFINITY) &&
    criticalFailures.length <= (ruleSet.maximumCriticalFailures ?? Number.POSITIVE_INFINITY)
  );
}

function buildBlockers({ criticalFailures, blockerFailures, failedCriticalJourneys, riskyModules }) {
  return [
    ...blockerFailures.map(failure => ({
      type: 'Failure',
      name: failure.testName,
      reason: 'Blocker failure severity matched release rules.',
    })),
    ...criticalFailures.map(failure => ({
      type: 'Failure',
      name: failure.testName,
      reason: 'Critical failure severity matched release rules.',
    })),
    ...failedCriticalJourneys.map(journey => ({
      type: 'Business Journey',
      name: journey.name,
      reason: `Critical journey status is ${journey.status}.`,
    })),
    ...riskyModules.map(module => ({
      type: 'Module',
      name: module.name,
      reason: `Critical module risk is ${module.risk}.`,
    })),
  ];
}

function buildWarnings({ warningFailures, warningJourneys, warningModules, partialExecution, coverageGaps = {}, summary = {} }) {
  const warnings = [
    ...warningFailures.map(failure => ({
      type: 'Failure',
      name: failure.testName,
      reason: `Warning severity is ${failure.severity}.`,
    })),
    ...warningJourneys.map(journey => ({
      type: 'Business Journey',
      name: journey.name,
      reason: `Journey status is ${journey.status}.`,
    })),
    ...warningModules.map(module => ({
      type: 'Module',
      name: module.name,
      reason: `Module risk is ${module.risk}.`,
    })),
  ];

  const blocked = coverageGaps.summary?.blocked ?? 0;
  const unexpectedSkipped = summary.unexpectedSkipped ?? 0;

  if (blocked > 0) {
    warnings.push({
      type: 'Coverage',
      name: 'Blocked scenarios',
      reason: `${blocked} blocked scenario(s) still need fixtures, admin, API, or third-party support before GO.`,
    });
  }

  if (unexpectedSkipped > 0) {
    warnings.push({
      type: 'Coverage',
      name: 'Unexpected skips',
      reason: `${unexpectedSkipped} skipped check(s) were not documented as blocked, controlled, future, or traceability.`,
    });
  }

  const flaky = summary.flaky ?? 0;
  if (flaky > 0) {
    warnings.push({
      type: 'Reliability',
      name: 'Flaky checks',
      reason: `${flaky} check(s) passed only after retry — treat release confidence as provisional until reliability stabilizes.`,
    });
  }

  if (partialExecution) {
    warnings.push({
      type: 'Execution',
      name: 'Partial execution',
      reason: 'Execution contains unexpected skips, blocked coverage, interrupted tests, or not-executed critical journeys.',
    });
  }

  return warnings;
}

function getConfiguredReasons(decision, rules = {}, generatedReasons = []) {
  const messages = rules.messages ?? {};

  if (decision === 'GO') {
    return messages.goReasons ?? generatedReasons;
  }

  if (decision === 'CONDITIONAL_GO') {
    return messages.conditionalReasons ?? generatedReasons;
  }

  return messages.noGoReasons ?? generatedReasons;
}

function getConfiguredAction(decision, rules = {}) {
  const messages = rules.messages ?? {};

  if (decision === 'GO') {
    return messages.goAction ?? 'Proceed with release monitoring.';
  }

  if (decision === 'CONDITIONAL_GO') {
    return messages.conditionalAction ?? 'Review warnings and evidence before approval.';
  }

  return messages.noGoAction ?? 'Do not release until blockers are resolved.';
}

function buildExplanation(decision, { summary = {}, quality = {}, businessHealth = 0, blockers = [], warnings = [] }) {
  if (decision === 'GO') {
    return `AIR recommends GO because executed pass rate is ${summary.executedPassRate ?? summary.passRate ?? 0}%, business health is ${businessHealth}%, quality score is ${quality.score ?? 0}, and no configured release blockers were detected.`;
  }

  if (decision === 'CONDITIONAL_GO') {
    return `AIR recommends CONDITIONAL GO because executed tests did not produce release blockers, but ${warnings.length} warning signal(s) or incomplete coverage require review before approval. Executed pass rate is ${summary.executedPassRate ?? summary.passRate ?? 0}%; inventory coverage is ${summary.inventoryPassRate ?? 0}%.`;
  }

  return `AIR recommends NO GO because ${blockers.length} blocker signal(s) or configured release threshold gaps require resolution before approval.`;
}

function calculateReleaseConfidence(decision, quality = {}, summary = {}) {
  if (typeof quality.confidence === 'number') {
    return quality.confidence;
  }

  if (typeof quality.score === 'number') {
    return quality.score;
  }

  return summary.passRate ?? 0;
}

function buildReasonTraceability(reasons = [], { blockers = [], warnings = [], summary = {}, quality = {}, evidence = {} }) {
  return asArray(reasons).map(reason => {
    if (blockers.length > 0) {
      return {
        reason,
        source: 'blockers',
        references: blockers.map(blocker => ({
          type: blocker.type,
          name: blocker.name,
          detail: blocker.reason,
        })),
      };
    }

    if (warnings.length > 0) {
      return {
        reason,
        source: 'warnings',
        references: warnings.map(warning => ({
          type: warning.type,
          name: warning.name,
          detail: warning.reason,
        })),
      };
    }

    return {
      reason,
      source: 'summary',
      references: [
        {
          type: 'Execution Summary',
          name: 'Pass rate',
          value: summary.passRate ?? 0,
        },
        {
          type: 'Quality',
          name: 'Quality score',
          value: quality.score ?? 0,
        },
        {
          type: 'Evidence',
          name: 'Per-test evidence',
          value: evidence.summary?.perTestEvidence ?? evidence.summary?.total ?? 0,
        },
      ],
    };
  });
}

function buildReleaseDecision({
  summary = {},
  failedTests = [],
  modules = [],
  businessJourneys = [],
  evidence = {},
  quality = {},
  config = {},
  coverageGaps = {},
  releaseRules,
  thresholds,
} = {}) {
  const mergedConfig = {
    ...config,
    releaseRules: releaseRules ?? config.releaseRules,
    releaseThresholds: thresholds ?? config.releaseThresholds,
  };
  const rules = getReleaseRules(mergedConfig);
  const legacyThresholds = mergedConfig.releaseThresholds ?? {};
  const goRules = {
    minimumPassRate: legacyThresholds.goPassRate,
    minimumBusinessHealth: legacyThresholds.goBusinessHealth,
    maximumFailedTests: legacyThresholds.criticalFailureLimitForGo,
    maximumBlockerFailures: legacyThresholds.blockerFailureLimitForGo,
    ...(rules.go ?? {}),
  };
  const conditionalRules = {
    minimumPassRate: legacyThresholds.conditionalGoPassRate,
    minimumBusinessHealth: legacyThresholds.conditionalGoBusinessHealth,
    ...(rules.conditionalGo ?? {}),
  };
  const businessHealth = summary.businessHealth ?? 0;
  const failedCriticalJourneys = getCriticalJourneys(businessJourneys, rules);
  const warningJourneys = getWarningJourneys(businessJourneys, rules);
  const criticalFailures = getCriticalFailures(failedTests, rules);
  const blockerFailures = getBlockerFailures(failedTests, rules);
  const warningFailures = getWarningFailures(failedTests, rules);
  const riskyModules = getRiskyModules(modules, rules);
  const warningModules = getWarningModules(modules, rules);
  const partialExecution = hasPartialExecution(summary, businessJourneys, rules, coverageGaps);
  const blockers = buildBlockers({
    criticalFailures,
    blockerFailures,
    failedCriticalJourneys,
    riskyModules,
  });
  const warnings = buildWarnings({
    warningFailures,
    warningJourneys,
    warningModules,
    partialExecution,
    coverageGaps,
    summary,
  });
  const goPassed = meetsRuleSet({ summary, quality, failedTests, businessHealth }, goRules, rules);
  const conditionalPassed = meetsRuleSet({ summary, quality, failedTests, businessHealth }, conditionalRules, rules);
  const decisions = rules.decisions ?? {};

  let decision = normalizeDecision(decisions.allRulesPassed, 'GO');

  if (failedCriticalJourneys.length > 0) {
    decision = normalizeDecision(decisions.criticalJourneyFailed, 'NO_GO');
  } else if (criticalFailures.length > 0 || blockerFailures.length > 0 || riskyModules.length > 0) {
    decision = normalizeDecision(decisions.criticalFailureFound, 'NO_GO');
  } else if (partialExecution && rules.allowPartialRelease !== true) {
    decision = normalizeDecision(decisions.partialExecution, 'CONDITIONAL_GO');
  } else if (!goPassed && conditionalPassed) {
    decision = normalizeDecision(decisions.warningsOnly, 'CONDITIONAL_GO');
  } else if (!goPassed) {
    decision = 'NO_GO';
  } else if (warnings.length > 0) {
    decision = normalizeDecision(decisions.warningsOnly, 'CONDITIONAL_GO');
  }

  const generatedReasons = [
    `Executed pass rate: ${summary.executedPassRate ?? summary.passRate ?? 0}%`,
    `Inventory coverage: ${summary.inventoryPassRate ?? 0}% (${summary.executed ?? 0} of ${summary.total ?? 0} tests ran)`,
    `Business health: ${businessHealth}%`,
    `Quality score: ${quality.score ?? 0}`,
    `Evidence items: ${evidence.summary?.total ?? 0}`,
  ];
  const reasons = getConfiguredReasons(decision, rules, generatedReasons);
  const requiredAction = getConfiguredAction(decision, rules);
  const confidence = calculateReleaseConfidence(decision, quality, summary);
  const risk = RISK_BY_DECISION[decision] ?? 'HIGH';
  const reasonTraceability = buildReasonTraceability(reasons, {
    blockers,
    warnings,
    summary,
    quality,
    evidence,
  });

  return {
    decision,
    status: DECISION_DISPLAY[decision] ?? 'NO GO',
    confidence,
    risk,
    riskLevel: risk,
    reasons,
    reasonTraceability,
    warnings,
    blockers,
    requiredActions: decision === 'GO' ? [] : [requiredAction],
    recommendedAction: requiredAction,
    explanation: buildExplanation(decision, {
      summary,
      quality,
      businessHealth,
      blockers,
      warnings,
    }),
  };
}

module.exports = {
  buildReleaseDecision,
  calculateReleaseConfidence,
  getBlockerFailures,
  getCriticalFailures,
  getCriticalJourneys,
  getReleaseRules,
  hasPartialExecution,
  normalizeDecision,
  buildReasonTraceability,
};
