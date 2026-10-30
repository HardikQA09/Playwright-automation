const { formatDuration } = require('../services/duration');
const { classifyGap, isDocumentedGapCategory } = require('./coverage-gap-engine');

function countByStatus(tests, status) {
  return tests.filter(test => test.status === status).length;
}

function calculateRate(part, total) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

function hasFlakySignal(test) {
  if (typeof test.flaky === 'boolean') {
    return test.flaky;
  }

  if (typeof test.retry === 'number') {
    return test.retry > 0 && test.status === 'passed';
  }

  return false;
}

function getExecutionStatus({ total, failed, interrupted }) {
  if (total === 0) {
    return 'No Data Available';
  }

  if (interrupted > 0) {
    return 'Interrupted';
  }

  if (failed > 0) {
    return 'Failed';
  }

  return 'Passed';
}

function classifySkippedTests(tests = []) {
  return tests
    .filter(test => test.status === 'skipped' || test.status === 'interrupted')
    .reduce((counts, test) => {
      const category = test.gapCategory ?? classifyGap(test);
      test.gapCategory = category;

      if (test.status === 'interrupted' || category === 'Interrupted') {
        counts.interruptedGaps += 1;
      } else if (isDocumentedGapCategory(category)) {
        counts.documentedSkipped += 1;
      } else {
        counts.unexpectedSkipped += 1;
      }

      return counts;
    }, {
      documentedSkipped: 0,
      unexpectedSkipped: 0,
      interruptedGaps: 0,
    });
}

function buildExecutionSummary(tests = []) {
  const total = tests.length;
  const passedFinal = countByStatus(tests, 'passed') + countByStatus(tests, 'flaky');
  const failed = countByStatus(tests, 'failed');
  const skipped = countByStatus(tests, 'skipped');
  const interrupted = countByStatus(tests, 'interrupted');
  const skipClassification = classifySkippedTests(tests);
  const flaky = tests.filter(test => test.status === 'flaky' || hasFlakySignal(test)).length;
  const attemptCount = tests.reduce((sum, test) => sum + Math.max(1, test.attemptCount ?? test.attempts?.length ?? 1), 0);
  const retryCount = tests.reduce((sum, test) => sum + Math.max(0, (test.attemptCount ?? test.attempts?.length ?? 1) - 1), 0);
  const durationMs = tests.reduce((sum, test) => sum + (test.durationMs ?? 0), 0);
  // Flaky rows already passed on retry — include them in executed/pass totals.
  const passed = passedFinal;
  const executed = passed + failed + interrupted;
  const inventoryPassRate = calculateRate(passed, total);
  const executedPassRate = calculateRate(passed, executed);
  const failureRate = calculateRate(failed, executed);
  const executionHealth = calculateRate(passed, executed);
  const executionCoverage = calculateRate(executed, total);

  return {
    total,
    passed,
    failed,
    skipped,
    flaky,
    interrupted,
    attemptCount,
    retryCount,
    executed,
    documentedSkipped: skipClassification.documentedSkipped,
    unexpectedSkipped: skipClassification.unexpectedSkipped,
    durationMs,
    duration: formatDuration(durationMs),
    passRate: executedPassRate,
    executedPassRate,
    inventoryPassRate,
    failureRate,
    executionHealth,
    executionCoverage,
    executionStatus: getExecutionStatus({ total, failed, interrupted }),
  };
}

module.exports = {
  buildExecutionSummary,
  calculateRate,
  classifySkippedTests,
  countByStatus,
  getExecutionStatus,
  hasFlakySignal,
};
