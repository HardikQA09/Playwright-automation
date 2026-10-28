#!/usr/bin/env node
/**
 * Build a compact AIR-only JSON from execution-report/air-results.json.
 * Strips heavy Playwright attempt/attachment blobs; keeps AIR decision data.
 *
 * Usage: node scripts/prepare-air-only-json.js
 * Output: execution-report/air-only.json
 */
const fs = require('fs');
const path = require('path');

const reportDir = path.join(
  process.cwd(),
  'execution-report'
);
const sourcePath = path.join(
  reportDir,
  'air-results.json'
);
const outPath = path.join(
  reportDir,
  'air-only.json'
);

if (!fs.existsSync(sourcePath)) {
  console.error(
    `Missing ${path.relative(process.cwd(), sourcePath)}. Run npm run air:parse first.`
  );
  process.exit(1);
}

const air = JSON.parse(
  fs.readFileSync(sourcePath, 'utf8')
);

const slimTest = (test) => ({
  id: test.id ?? test.testId ?? test.canonicalId,
  title: test.title,
  file: test.file,
  module: test.module,
  status: test.status,
  durationMs: test.durationMs,
  critical: test.critical,
  error: test.error
    ? String(test.error).slice(0, 500)
    : undefined,
  flaky: test.flaky || undefined,
  attemptCount: test.attemptCount,
  attachmentCount: Array.isArray(test.attachments)
    ? test.attachments.length
    : 0,
});

const payload = {
  schema: 'air-only/v1',
  preparedAt: new Date().toISOString(),
  source: {
    file: 'execution-report/air-results.json',
    generatedAt: air.generatedAt,
    generatedAtDisplay: air.generatedAtDisplay,
    schemaVersion: air.schemaVersion,
    project: air.project,
    environment: air.environment,
  },
  reportInfo: air.reportInfo,
  provenance: air.provenance,
  execution: air.execution,
  summary: air.summary,
  release: air.releaseDecision || air.release,
  quality: air.quality,
  discovery: air.discovery,
  modules: air.modules,
  businessJourneys:
    air.businessJourneys || air.businessJourney,
  failedTests: (air.failedTests || []).map(slimTest),
  failures: air.failures,
  coverageGaps: {
    summary: air.coverageGaps?.summary,
    items: (air.coverageGaps?.items || []).map(
      (item) => ({
        title: item.title,
        file: item.file,
        status: item.status,
        category: item.category,
        priority: item.priority,
        reason: item.reason,
        nextAction: item.nextAction,
        module: item.module,
        sourceIds: item.sourceIds,
      })
    ),
  },
  evidence: air.evidence,
  recommendations: air.recommendations,
  validationIntelligence: air.validationIntelligence,
  dataIntegrity: air.dataIntegrity,
  validation: air.validation,
  navigation: air.navigation,
  futureValidation: air.futureValidation,
  tests: (air.tests || []).map(slimTest),
  counts: {
    tests: (air.tests || []).length,
    failed: (air.failedTests || []).length,
    coverageGaps: (air.coverageGaps?.items || [])
      .length,
  },
};

fs.writeFileSync(
  outPath,
  `${JSON.stringify(payload, null, 2)}\n`,
  'utf8'
);

const srcKb = (
  fs.statSync(sourcePath).size / 1024
).toFixed(1);
const outKb = (
  fs.statSync(outPath).size / 1024
).toFixed(1);

console.log(
  `AIR-only JSON prepared: ${path.relative(process.cwd(), outPath)}`
);
console.log(
  `Source air-results.json: ${srcKb} KB → air-only.json: ${outKb} KB`
);
console.log(
  `Tests: ${payload.counts.tests}, failed: ${payload.counts.failed}, gaps: ${payload.counts.coverageGaps}`
);
