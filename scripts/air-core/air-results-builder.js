const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadAirConfig, readJsonIfExists } = require('./config/config-loader');
const { loadAutomationResults } = require('./services/parser-service');
const { formatDuration } = require('./services/duration');
const { runEnginePipeline } = require('./engine/engine-orchestrator');
const { buildExecutionSummary } = require('./engine/execution-summary-engine');
const { buildBusinessJourneys } = require('./engine/journey-engine');
const { buildModules } = require('./engine/module-engine');
const { buildHistory } = require('./engine/history-engine');
const { buildReleaseDecision } = require('./engine/release-engine');
const { schemaVersion, createFutureValidation } = require('./model/air-results.schema');
const { validateAirResults } = require('./model/air-results-validator');
const { buildDataIntegrityAudit } = require('./engine/data-integrity-audit');
const { buildValidationSummaryMarkdown } = require('./services/validation-summary-writer');

function readGitValue(projectRoot, command, fallback) {
  try {
    return execSync(command, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function getStoredExecutions(history) {
  if (Array.isArray(history)) {
    return history;
  }

  return Array.isArray(history?.executions) ? history.executions : [];
}

function writeFileRetry(filePath, contents) {
  let lastError;
  const tempPath = `${filePath}.${process.pid}.tmp`;

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      fs.writeFileSync(tempPath, contents);

      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        if (unlinkError?.code !== 'ENOENT') {
          throw unlinkError;
        }
      }

      fs.renameSync(tempPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      const code = error?.code;

      try {
        fs.unlinkSync(tempPath);
      } catch {
        // The temp file may not exist if writeFileSync itself failed.
      }

      if (!['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES'].includes(code) || attempt === 8) {
        throw error;
      }

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * attempt);
    }
  }

  throw lastError;
}

function buildAirResults(projectRoot = path.resolve(__dirname, '..', '..'), options = {}) {
  const config = loadAirConfig(projectRoot);
  const loaded = loadAutomationResults(projectRoot, config);
  const tests = loaded.tests;
  const generatedAt = new Date();
  const initialAirResults = {
    schemaVersion,
    reportInfo: {
      reportName: 'AIR Execution Report',
      productName: config.productName ?? 'AIR',
      productFullName: config.productFullName ?? 'Automation Intelligence Reporting',
      generatedAt: generatedAt.toISOString(),
      generatedAtDisplay: generatedAt.toLocaleString(),
      generatedBy: config.preparedBy ?? 'AIR Platform',
      engine: loaded.framework,
      mode: 'execution',
    },
    generatedAt: generatedAt.toISOString(),
    generatedAtDisplay: generatedAt.toLocaleString(),
    project: {
      name: config.projectName ?? 'Project',
      environment: config.environment ?? 'Environment',
      buildVersion: config.buildVersion ?? 'Unknown',
      branch: process.env.GITHUB_REF_NAME ?? process.env.BRANCH_NAME ?? readGitValue(projectRoot, 'git branch --show-current', 'Local'),
      commit: process.env.GITHUB_SHA?.slice(0, 8) ?? readGitValue(projectRoot, 'git rev-parse --short HEAD', 'Local'),
      trigger: process.env.CI ? 'CI Pipeline' : 'Local Execution',
    },
    environment: {
      name: config.environment ?? 'Environment',
      os: process.platform,
      runtime: 'Node.js',
    },
    execution: {
      id: `air-${generatedAt.getTime()}`,
      startedAt: '',
      endedAt: generatedAt.toISOString(),
      durationMs: 0,
      duration: '0s',
      trigger: process.env.CI ? 'CI Pipeline' : 'Local Execution',
      source: loaded.source,
    },
    source: {
      type: loaded.source,
      hasResults: loaded.hasResults,
      framework: loaded.framework,
      adapterWarning: loaded.adapterWarning,
      rawTestCount: loaded.rawTestCount ?? tests.length,
      duplicateCount: loaded.duplicateCount ?? 0,
      duplicateCanonicalTestIds: loaded.duplicateCanonicalTestIds ?? [],
    },
    provenance: {
      mode: 'CURRENT_EXECUTION',
      sourceArtifact: loaded.source === 'json-reporter'
        ? 'test-results/results.json'
        : loaded.source === 'html-report'
          ? 'playwright-report/index.html'
          : 'missing',
      sourceFramework: loaded.framework,
      generatedAt: generatedAt.toISOString(),
      restoredFromHistory: false,
      warning: '',
    },
    executionContext: {},
    summary: {},
    discovery: {
      summary: {},
      newTests: [],
      mappedTests: [],
      unmappedTests: [],
      suggestions: [],
      configurationIssues: [],
    },
    release: {},
    releaseDecision: {},
    quality: {},
    businessJourneys: [],
    businessJourney: [],
    modules: [],
    tests,
    failedTests: [],
    failures: [],
    coverageGaps: {
      summary: {
        total: 0,
        blocked: 0,
        controlled: 0,
        traceability: 0,
        future: 0,
        interrupted: 0,
        skipped: 0,
      },
      items: [],
    },
    evidence: {},
    recommendations: [],
    searchIndex: [],
    history: {
      executions: [],
      trends: {},
      comparison: {},
      regressions: [],
      improvements: [],
      summary: {},
    },
    futureValidation: createFutureValidation(),
    navigation: config.navigation,
    engineLog: [
      {
        engine: 'History Restore',
        status: 'passed',
        reason: 'AIR restored the strongest valid historical execution snapshot.',
      },
    ],
  };

  const airResults = runEnginePipeline(initialAirResults, {
    projectRoot,
    config,
    loaded,
    existingHistory: options.existingHistory ?? [],
    fs,
    path,
  });

  airResults.dataIntegrity = buildDataIntegrityAudit(airResults, {
    loaded,
    config,
  });
  airResults.validation = validateAirResults(airResults);

  return airResults;
}

function normalizeSavedRelease(snapshot = {}) {
  const status = snapshot.release?.status ?? snapshot.releaseDecision?.status ?? snapshot.summary?.releaseDecision ?? 'NO GO';
  const riskLevel = snapshot.release?.riskLevel ?? snapshot.release?.risk ?? snapshot.releaseDecision?.riskLevel ?? snapshot.summary?.estimatedReleaseRisk ?? 'HIGH';

  return {
    decision: status === 'CONDITIONAL GO' ? 'CONDITIONAL_GO' : status === 'GO' ? 'GO' : 'NO_GO',
    status,
    confidence: snapshot.release?.confidence ?? snapshot.releaseDecision?.confidence ?? snapshot.summary?.qualityScore ?? 0,
    risk: riskLevel,
    riskLevel,
    reasons: snapshot.release?.reasons ?? snapshot.releaseDecision?.reasons ?? ['AIR restored release data from history.'],
    warnings: snapshot.release?.warnings ?? [],
    blockers: snapshot.release?.blockers ?? [],
    requiredActions: snapshot.release?.requiredActions ?? [],
    recommendedAction: snapshot.release?.recommendedAction ?? snapshot.releaseDecision?.recommendedAction ?? 'Run the latest full execution before final approval.',
    explanation: snapshot.release?.explanation ?? 'AIR restored release decision from history.',
  };
}

function buildManualDefectFailures(config = {}) {
  return (config.manualDefects ?? [])
    .filter(defect => defect.enabled !== false)
    .map((defect, index) => ({
      testId: defect.id ?? `manual-defect-${index + 1}`,
      testName: defect.title ?? `Manual defect ${index + 1}`,
      title: defect.title ?? `Manual defect ${index + 1}`,
      module: defect.module ?? 'General',
      file: defect.source ?? 'manual-verification',
      status: 'failed',
      severity: defect.severity ?? 'High',
      category: defect.category ?? 'Functional',
      businessImpact: defect.businessImpact ?? 'Confirmed product defect requires review.',
      errorMessage: defect.errorMessage ?? defect.description ?? 'Manual product defect recorded in AIR.',
      error: defect.errorMessage ?? defect.description ?? 'Manual product defect recorded in AIR.',
      evidence: [],
      recommendedInvestigationAction: defect.recommendedInvestigationAction ?? 'Review the confirmed product defect and attached manual evidence.',
    }));
}

function getDisabledManualDefectMeta(config = {}) {
  const disabledDefects = (config.manualDefects ?? [])
    .filter(defect => defect.enabled === false);

  return {
    ids: new Set(disabledDefects.map(defect => defect.id).filter(Boolean)),
    titles: new Set(disabledDefects.map(defect => defect.title).filter(Boolean)),
    modules: new Set(disabledDefects.map(defect => defect.module).filter(Boolean)),
  };
}

function isDisabledManualDefectItem(item, config = {}) {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const disabled = getDisabledManualDefectMeta(config);
  const identifiers = [
    item.id,
    item.testId,
    item.title,
    item.testName,
    item.name,
  ].filter(Boolean);

  if (identifiers.some(value => disabled.ids.has(value) || disabled.titles.has(value))) {
    return true;
  }

  return item.source === 'manualDefect' && disabled.modules.has(item.module);
}

function sanitizeDisabledManualDefects(value, config = {}) {
  if (Array.isArray(value)) {
    return value
      .map(item => sanitizeDisabledManualDefects(item, config))
      .filter(item => item !== undefined);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (isDisabledManualDefectItem(value, config)) {
    return undefined;
  }

  return Object.entries(value).reduce((next, [key, item]) => {
    const sanitized = sanitizeDisabledManualDefects(item, config);

    if (sanitized !== undefined) {
      next[key] = sanitized;
    }

    return next;
  }, Array.isArray(value) ? [] : {});
}

function sanitizeHistory(history, config = {}) {
  return sanitizeDisabledManualDefects(history, config) ?? [];
}

function applyManualDefectsToRestoredResults(restoredAirResults, config = {}) {
  const existingFailureIds = new Set(
    (restoredAirResults.failedTests ?? [])
      .map(failure => failure.testId ?? failure.id)
      .filter(Boolean)
  );
  const manualFailures = buildManualDefectFailures(config)
    .filter(failure => !existingFailureIds.has(failure.testId));

  if (manualFailures.length === 0) {
    const normalizedFailedTests = (restoredAirResults.failedTests ?? []).map(failure => ({
      ...failure,
      evidence: Array.isArray(failure.evidence) ? failure.evidence : [],
    }));

    return {
      ...restoredAirResults,
      failedTests: normalizedFailedTests,
      failures: normalizedFailedTests,
    };
  }

  const failedTests = [
    ...(restoredAirResults.failedTests ?? []),
    ...manualFailures,
  ].map(failure => ({
    ...failure,
    evidence: Array.isArray(failure.evidence) ? failure.evidence : [],
  }));
  const modules = [...(restoredAirResults.modules ?? [])];

  for (const failure of manualFailures) {
    const moduleIndex = modules.findIndex(module => module.name === failure.module);

    if (moduleIndex >= 0) {
      const module = modules[moduleIndex];
      const total = (module.total ?? 0) + 1;
      const failed = (module.failed ?? 0) + 1;
      const passed = module.passed ?? 0;
      modules[moduleIndex] = {
        ...module,
        total,
        failed,
        testCount: total,
        failedCount: failed,
        score: total === 0 ? 0 : Math.round((passed / total) * 100),
        coverage: total === 0 ? 0 : Math.round((passed / total) * 100),
        status: module.critical ? 'Critical' : 'Warning',
        risk: module.critical ? 'High' : 'Medium',
        recommendation: `Review ${failure.module} confirmed defects before release approval.`,
      };
    } else {
      modules.push({
        name: failure.module,
        critical: failure.severity === 'Critical',
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        interrupted: 0,
        durationMs: 0,
        duration: '0s',
        tests: [failure.testId],
        score: 0,
        coverage: 0,
        testCount: 1,
        failedCount: 1,
        status: failure.severity === 'Critical' ? 'Critical' : 'Warning',
        risk: failure.severity === 'Critical' ? 'High' : 'Medium',
        recommendation: `Review ${failure.module} confirmed defects before release approval.`,
      });
    }
  }

  const summary = {
    ...(restoredAirResults.summary ?? {}),
    total: (restoredAirResults.summary?.total ?? 0) + manualFailures.length,
    failed: (restoredAirResults.summary?.failed ?? 0) + manualFailures.length,
    attemptCount: (restoredAirResults.summary?.attemptCount ?? restoredAirResults.summary?.total ?? 0) + manualFailures.length,
    executed: (restoredAirResults.summary?.executed ?? restoredAirResults.summary?.passed ?? 0) + manualFailures.length,
    passRate: Math.round(((restoredAirResults.summary?.passed ?? 0) / ((restoredAirResults.summary?.total ?? 0) + manualFailures.length)) * 100),
    failureRate: Math.round((((restoredAirResults.summary?.failed ?? 0) + manualFailures.length) / ((restoredAirResults.summary?.total ?? 0) + manualFailures.length)) * 100),
    executionStatus: 'Failed',
    releaseDecision: 'NO GO',
    estimatedReleaseRisk: 'HIGH',
  };

  const release = {
    decision: 'NO_GO',
    status: 'NO GO',
    confidence: Math.min(restoredAirResults.release?.confidence ?? 50, 50),
    risk: 'HIGH',
    riskLevel: 'HIGH',
    reasons: [
      'Full regression baseline passed from restored execution history.',
      `${manualFailures.length} confirmed product defect(s) require resolution before approval.`,
    ],
    reasonTraceability: [
      {
        reason: 'Full regression baseline passed from restored execution history.',
        source: 'summary',
        references: [
          {
            type: 'Execution Summary',
            name: 'Restored execution',
            value: restoredAirResults.summary?.total ?? 0,
          },
        ],
      },
      {
        reason: `${manualFailures.length} confirmed product defect(s) require resolution before approval.`,
        source: 'blockers',
        references: manualFailures.map(failure => ({
          type: 'Manual Defect',
          name: failure.testName,
          detail: failure.businessImpact,
        })),
      },
    ],
    warnings: [],
    blockers: manualFailures.map(failure => ({
      type: 'manual-defect',
      name: failure.testName,
      reason: failure.businessImpact,
    })),
    requiredActions: manualFailures.map(failure => failure.recommendedInvestigationAction),
    recommendedAction: 'Resolve confirmed product defects, then rerun the affected scenarios before release approval.',
    explanation: `AIR recommends NO GO because the restored regression passed, but ${manualFailures.length} confirmed product defect(s) remain open.`,
  };
  const businessJourneys = buildBusinessJourneys({
    modules,
    failedTests,
    executionSummary: summary,
    executionScope: restoredAirResults.executionContext?.type,
    config,
    thresholds: config.releaseThresholds,
  });

  return {
    ...restoredAirResults,
    summary,
    modules,
    businessJourneys,
    businessJourney: businessJourneys.map(journey => journey.name),
    failedTests,
    failures: failedTests,
    tests: [
      ...(restoredAirResults.tests ?? []),
      ...manualFailures.map(failure => ({
        id: failure.testId,
        title: failure.testName,
        file: failure.file,
        status: 'failed',
        durationMs: 0,
        error: failure.errorMessage,
        module: failure.module,
        critical: failure.severity === 'Critical',
      })),
    ],
    release,
    releaseDecision: release,
    recommendations: [
      ...(restoredAirResults.recommendations ?? []),
      ...manualFailures.map(failure => ({
        priority: failure.severity === 'Critical' ? 'P1' : 'P2',
        title: `Resolve ${failure.module} defect`,
        description: failure.recommendedInvestigationAction,
        module: failure.module,
        source: 'manualDefect',
      })),
    ],
  };
}

function emptyEvidence() {
  return {
    playwrightReport: '',
    rawReports: [],
    screenshots: [],
    videos: [],
    traces: [],
    logs: [],
    attachments: [],
    byTest: {},
    byModule: {},
    summary: {},
  };
}

function normalizeEvidenceForRestore(evidence = {}) {
  const normalized = {
    ...emptyEvidence(),
    ...evidence,
    rawReports: Array.isArray(evidence.rawReports) ? evidence.rawReports : [],
    screenshots: Array.isArray(evidence.screenshots) ? evidence.screenshots : [],
    videos: Array.isArray(evidence.videos) ? evidence.videos : [],
    traces: Array.isArray(evidence.traces) ? evidence.traces : [],
    logs: Array.isArray(evidence.logs) ? evidence.logs : [],
    attachments: Array.isArray(evidence.attachments) ? evidence.attachments : [],
    byTest: evidence.byTest ?? {},
    byModule: evidence.byModule ?? {},
  };

  const summary = evidence.summary ?? {};
  normalized.summary = {
    screenshots: summary.screenshots ?? normalized.screenshots.length,
    videos: summary.videos ?? normalized.videos.length,
    traces: summary.traces ?? normalized.traces.length,
    logs: summary.logs ?? normalized.logs.length,
    attachments: summary.attachments ?? normalized.attachments.length,
    rawReports: summary.rawReports ?? normalized.rawReports.length,
  };

  normalized.summary.perTestEvidence =
    summary.perTestEvidence ??
    (
      normalized.summary.screenshots +
      normalized.summary.videos +
      normalized.summary.traces +
      normalized.summary.logs +
      normalized.summary.attachments
    );
  normalized.summary.executionArtifacts = summary.executionArtifacts ?? normalized.summary.rawReports;
  normalized.summary.total =
    summary.total ??
    normalized.summary.perTestEvidence;
  normalized.summary.totalWithRawReports =
    summary.totalWithRawReports ??
    normalized.summary.perTestEvidence + normalized.summary.executionArtifacts;

  normalized.playwrightReport =
    evidence.playwrightReport ??
    normalized.rawReports.find(report => report.type === 'html-report')?.path ??
    '';

  return normalized;
}

function restoreFromBestHistory(projectRoot, outputPath, historyPath, existingHistory, currentEvidence = {}) {
  const config = loadAirConfig(projectRoot);
  const sanitizedHistory = sanitizeHistory(existingHistory, config);
  const existingExecutions = getStoredExecutions(sanitizedHistory);
  const latestValidSnapshot = [...existingExecutions]
    .filter(item => item?.summary?.total > 0)
    .sort((left, right) => {
      const leftComplete = (left.tests?.length ?? 0) >= (left.summary?.total ?? 0);
      const rightComplete = (right.tests?.length ?? 0) >= (right.summary?.total ?? 0);

      if (leftComplete !== rightComplete) {
        return rightComplete ? 1 : -1;
      }

      const totalDifference = (right.summary.total ?? 0) - (left.summary.total ?? 0);

      if (totalDifference !== 0) {
        return totalDifference;
      }

      return new Date(right.generatedAt ?? 0).getTime() - new Date(left.generatedAt ?? 0).getTime();
    })[0];

  if (!latestValidSnapshot) {
    return undefined;
  }

  const sanitizedSnapshot = sanitizeDisabledManualDefects(latestValidSnapshot, config);
  const restoredTests = (sanitizedSnapshot.tests ?? []).map(test => ({ ...test }));
  const restoredModules = restoredTests.length > 0
    ? buildModules(restoredTests, config)
    : (sanitizedSnapshot.modules ?? []).map(module => ({
        ...module,
        coverage: module.coverage ?? module.score ?? 0,
        testCount: module.testCount ?? module.total ?? 0,
        failedCount: module.failedCount ?? module.failed ?? 0,
        durationMs: module.durationMs ?? 0,
        duration: module.duration ?? '0s',
        tests: module.tests ?? [],
      }));
  const restoredFailedTests = sanitizeDisabledManualDefects(
    sanitizedSnapshot.failedTests ?? sanitizedSnapshot.failures ?? [],
    config
  );
  const restoredSummary = {
    ...(sanitizedSnapshot.summary ?? {}),
    ...buildExecutionSummary(restoredTests),
  };
  const restoredBusinessJourneys = buildBusinessJourneys({
    modules: restoredModules,
    failedTests: restoredFailedTests,
    executionSummary: restoredSummary,
    executionScope: sanitizedSnapshot.executionContext?.type,
    config,
    thresholds: config.releaseThresholds,
  });
  const restoredEvidence = normalizeEvidenceForRestore(currentEvidence);
  const restoredQuality = {
    score: sanitizedSnapshot.quality?.score ?? sanitizedSnapshot.summary?.qualityScore ?? restoredSummary.passRate ?? 0,
    confidence: sanitizedSnapshot.quality?.confidence ?? sanitizedSnapshot.summary?.qualityScore ?? restoredSummary.passRate ?? 0,
    grade: sanitizedSnapshot.quality?.grade ?? 'Historical Snapshot',
    factors: sanitizedSnapshot.quality?.factors ?? {},
    weights: sanitizedSnapshot.quality?.weights ?? {},
    explanation: sanitizedSnapshot.quality?.explanation ?? ['AIR restored quality data from history. Run the latest execution for full factor details.'],
  };
  const restoredRelease = buildReleaseDecision({
    summary: restoredSummary,
    failedTests: restoredFailedTests,
    modules: restoredModules,
    businessJourneys: restoredBusinessJourneys,
    evidence: restoredEvidence,
    quality: restoredQuality,
    coverageGaps: sanitizedSnapshot.coverageGaps ?? {},
    config,
  });

  const restoredAirResults = {
    schemaVersion,
    reportInfo: {
      reportName: 'AIR Execution Report',
      productName: config.productName ?? 'AIR',
      productFullName: config.productFullName ?? 'Automation Intelligence Reporting',
      generatedAt: new Date().toISOString(),
      generatedAtDisplay: new Date().toLocaleString(),
      generatedBy: config.preparedBy ?? 'AIR Platform',
      engine: 'AIR History',
      mode: 'execution',
    },
    generatedAt: new Date().toISOString(),
    generatedAtDisplay: new Date().toLocaleString(),
    project: sanitizedSnapshot.project,
    environment: {
      name: sanitizedSnapshot.project?.environment ?? config.environment ?? 'Environment',
      os: process.platform,
      runtime: 'Node.js',
    },
    execution: {
      id: `air-history-${Date.now()}`,
      startedAt: '',
      endedAt: new Date().toISOString(),
      durationMs: restoredSummary.durationMs ?? 0,
      duration: restoredSummary.duration ?? '0s',
      trigger: sanitizedSnapshot.project?.trigger ?? 'Local Execution',
      source: 'air-history',
    },
    source: {
      type: 'air-history',
      hasResults: true,
      framework: sanitizedSnapshot.source?.framework ?? 'AIR History',
      note: 'AIR reused the strongest valid execution snapshot because the available Playwright output was missing or older than history.',
    },
    provenance: {
      mode: 'RESTORED_HISTORY',
      sourceArtifact: 'execution-report/history/air-history.json',
      sourceFramework: sanitizedSnapshot.source?.framework ?? 'AIR History',
      generatedAt: new Date().toISOString(),
      restoredFromHistory: true,
      restoredExecutionId: sanitizedSnapshot.execution?.id ?? sanitizedSnapshot.id ?? '',
      restoredGeneratedAt: sanitizedSnapshot.generatedAt ?? sanitizedSnapshot.reportInfo?.generatedAt ?? '',
      warning: 'AIR restored a previous execution snapshot because current execution data was unavailable or history restore was requested.',
    },
    summary: restoredSummary,
    executionContext: sanitizedSnapshot.executionContext ?? {
      type: 'Historical Snapshot',
      scope: 'Saved execution history',
      executedModules: restoredModules.map(module => module.name).filter(Boolean),
      coverage: 0,
      confidence: restoredSummary.qualityScore ?? restoredQuality.confidence ?? 0,
      validationLevel: 'Historical Snapshot',
    },
    releaseDecision: restoredRelease,
    release: restoredRelease,
    businessJourneys: restoredBusinessJourneys,
    businessJourney: restoredBusinessJourneys.map(journey => journey.name),
    modules: restoredModules,
    tests: restoredTests,
    failedTests: restoredFailedTests,
    failures: restoredFailedTests,
    coverageGaps: sanitizedSnapshot.coverageGaps ?? {
      summary: {
        total: 0,
        blocked: 0,
        controlled: 0,
        traceability: 0,
        future: 0,
        interrupted: 0,
        skipped: 0,
      },
      items: [],
    },
    evidence: restoredEvidence,
    quality: restoredQuality,
    recommendations: [
      {
        priority: 'P2',
        title: 'Run latest full execution',
        description: 'AIR is using history because raw Playwright output is missing or stale.',
      },
    ],
    searchIndex: [],
    discovery: {
      summary: {
        status: 'Historical Restore',
        totalTests: 0,
        mappedTests: 0,
        unmappedTests: 0,
      },
      newTests: [],
      mappedTests: [],
      unmappedTests: [],
      suggestions: [],
      configurationIssues: [],
    },
    history: Array.isArray(sanitizedHistory)
      ? {
          executions: sanitizedHistory,
          trends: {},
          comparison: { status: 'Historical Restore' },
          regressions: [],
          improvements: [],
          summary: {
            status: 'Historical Restore',
            totalExecutions: sanitizedHistory.length,
          },
        }
      : sanitizedHistory,
    futureValidation: createFutureValidation(),
    navigation: config.navigation,
    engineLog: [
      {
        engine: 'History Restore',
        status: 'passed',
        reason: 'AIR restored the strongest valid historical execution snapshot.',
      },
    ],
  };

  const restoredWithManualDefects = applyManualDefectsToRestoredResults(restoredAirResults, config);
  restoredWithManualDefects.history = buildHistory(
    restoredWithManualDefects,
    sanitizedHistory,
    config
  );

  restoredWithManualDefects.validation = validateAirResults(restoredWithManualDefects);
  writeFileRetry(outputPath, `${JSON.stringify(restoredWithManualDefects, null, 2)}\n`);
  writeFileRetry(historyPath, `${JSON.stringify(restoredWithManualDefects.history, null, 2)}\n`);

  return restoredWithManualDefects;
}

function writeAirResults(projectRoot = path.resolve(__dirname, '..', '..')) {
  const config = loadAirConfig(projectRoot);
  const outputDir = path.join(projectRoot, 'execution-report');
  const outputPath = path.join(outputDir, 'air-results.json');
  const historyDir = path.join(outputDir, 'history');
  const historyPath = path.join(historyDir, 'air-history.json');
  const validationSummaryPath = path.join(outputDir, 'validation-summary.md');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(historyDir, { recursive: true });

  const existingHistory = sanitizeHistory(
    readJsonIfExists(historyPath, []),
    config
  );
  const existingExecutions = getStoredExecutions(existingHistory);
  const airResults = buildAirResults(projectRoot, {
    existingHistory,
  });
  const bestHistoryTotal = Math.max(0, ...existingExecutions.map(item => item?.summary?.total ?? 0));
  const reportScope = (
    process.env.AIR_REPORT_SCOPE ??
    ''
  ).toLowerCase();
  const useLatestRunOnly =
    reportScope === 'latest' ||
    process.env.AIR_USE_LATEST_RUN === 'true';
  const forceHistoryRestore =
    process.env.AIR_RESTORE_HISTORY === 'true' ||
    reportScope === 'history';
  const currentRunHasUsableResults =
    airResults.source.hasResults &&
    (airResults.summary.total ?? 0) > 0;

  // Prefer current results.json. If the latest suite left no usable JSON
  // (aborted run / heal wiped outputDir), fall back to history so AIR still
  // generates instead of writing an empty report.
  if (
    existingExecutions.length > 0 &&
    (
      (
        !useLatestRunOnly &&
        (
          forceHistoryRestore ||
          (
            !currentRunHasUsableResults &&
            bestHistoryTotal > 0
          )
        )
      ) ||
      (
        useLatestRunOnly &&
        !currentRunHasUsableResults &&
        bestHistoryTotal > 0
      )
    )
  ) {
    const restoredAirResults = restoreFromBestHistory(
      projectRoot,
      outputPath,
      historyPath,
      existingHistory,
      airResults.evidence
    );

    if (restoredAirResults) {
      restoredAirResults.dataIntegrity = buildDataIntegrityAudit(restoredAirResults, {
        loaded: {
          hasResults: false,
          source: 'air-history',
          raw: {
            suites: [],
          },
        },
        config,
      });
      restoredAirResults.validation = validateAirResults(restoredAirResults);
      writeFileRetry(outputPath, `${JSON.stringify(restoredAirResults, null, 2)}\n`);
      writeFileRetry(
        path.join(outputDir, 'air-data-integrity-audit.json'),
        `${JSON.stringify(restoredAirResults.dataIntegrity, null, 2)}\n`
      );
      writeFileRetry(
        validationSummaryPath,
        buildValidationSummaryMarkdown(restoredAirResults)
      );
      return {
        outputPath,
        airResults: restoredAirResults,
      };
    }
  }

  writeFileRetry(outputPath, `${JSON.stringify(airResults, null, 2)}\n`);
  writeFileRetry(historyPath, `${JSON.stringify(airResults.history, null, 2)}\n`);
  writeFileRetry(
    path.join(outputDir, 'air-data-integrity-audit.json'),
    `${JSON.stringify(airResults.dataIntegrity, null, 2)}\n`
  );
  writeFileRetry(
    validationSummaryPath,
    buildValidationSummaryMarkdown(airResults)
  );

  return {
    outputPath,
    airResults,
  };
}

module.exports = {
  buildAirResults,
  writeAirResults,
  formatDuration,
};
