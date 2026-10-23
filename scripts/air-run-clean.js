/*
 * Shared helper: is the latest AIR run "clean" (safe to email)?
 *
 * Clean = zero failed tests (and zero interrupted). Skips are allowed.
 */
const fs = require('fs');
const path = require('path');

function readAirSummary(projectRoot = path.resolve(__dirname, '..')) {
  const airPath = path.join(projectRoot, 'execution-report', 'air-results.json');

  if (!fs.existsSync(airPath)) {
    return null;
  }

  try {
    const air = JSON.parse(fs.readFileSync(airPath, 'utf8'));
    return {
      air,
      airPath,
      failed: Number(air.summary?.failed ?? 0),
      interrupted: Number(air.summary?.interrupted ?? 0),
      passed: Number(air.summary?.passed ?? 0),
      skipped: Number(air.summary?.skipped ?? 0),
      executed: Number(air.summary?.executed ?? 0),
      total: Number(air.summary?.total ?? 0)
    };
  } catch {
    return null;
  }
}

function isAirRunClean(projectRoot) {
  const summary = readAirSummary(projectRoot);

  if (!summary) {
    return {
      clean: false,
      reason: 'No execution-report/air-results.json yet.',
      summary: null
    };
  }

  if (summary.failed > 0) {
    return {
      clean: false,
      reason: `${summary.failed} failed test(s) — report email will not be sent.`,
      summary
    };
  }

  if (summary.interrupted > 0) {
    return {
      clean: false,
      reason: `${summary.interrupted} interrupted test(s) — report email will not be sent.`,
      summary
    };
  }

  return {
    clean: true,
    reason: `Clean run: ${summary.passed} passed, ${summary.skipped} skipped, 0 failed.`,
    summary
  };
}

module.exports = {
  readAirSummary,
  isAirRunClean
};
