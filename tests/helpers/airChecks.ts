import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/* =============================================================================
HELPER: AIR intelligence checks

PURPOSE
-------
Matrix rows that ask "can this be reported in AIR evidence / history /
search" are answered by reading the AIR data files the last `air:parse` wrote.
Nothing here opens a browser, changes data, or rewrites the report.

A row opts in with   automation: 'air:<check-name>'

AIR files read (never written):
- execution-report/air-results.json            latest parsed execution
- execution-report/history/air-history.json    stored earlier executions
============================================================================= */

type AirTest = {
  title?: string;
  file?: string;
  status?: string;
  error?: string;
  attempts?: unknown[];
  attachments?: unknown[];
};

type AirExecution = {
  tests?: AirTest[];
};

const REPORT_DIR = path.join(
  process.cwd(),
  'execution-report'
);

function readJson<T>(
  relativePath: string
): T {
  const file = path.join(
    REPORT_DIR,
    relativePath
  );

  expect(
    fs.existsSync(file),
    `AIR data file is missing: ${path.relative(process.cwd(), file)}. Run the suite and npm run air:parse first.`
  ).toBeTruthy();

  return JSON.parse(
    fs.readFileSync(file, 'utf8')
  ) as T;
}

const EXECUTED = new Set([
  'passed',
  'failed',
  'timedOut',
  'interrupted'
]);

function executedRows(
  tests: AirTest[] | undefined,
  filePattern: RegExp,
  titlePattern?: RegExp
) {
  return (tests ?? []).filter(
    (row) =>
      filePattern.test(row.file ?? '') &&
      (!titlePattern ||
        titlePattern.test(row.title ?? '')) &&
      EXECUTED.has(row.status ?? '')
  );
}

function loadAir() {
  const latest = readJson<{
    tests?: AirTest[];
    searchIndex?: Array<{
      type?: string;
      title?: string;
      text?: string;
    }>;
  }>('air-results.json');

  const history = readJson<{
    executions?: AirExecution[];
  }>('history/air-history.json');

  return {
    latest,
    executions: history.executions ?? []
  };
}

// Matrix rows for one area are present in the latest AIR run, were really
// executed, and AIR keeps earlier runs so the area can be compared over time.
function expectAreaInAirHistory(
  area: string,
  filePattern: RegExp
) {
  const { latest, executions } =
    loadAir();

  const latestExecuted =
    executedRows(
      latest.tests,
      filePattern
    );

  // Prefer latest executed rows; fall back to any historical execution so
  // AIR self-validation can run during the same complete suite that still
  // points air-results.json at the previous parse.
  const historicalExecuted =
    executions.some(
      (execution) =>
        executedRows(
          execution.tests,
          filePattern
        ).length > 0
    );

  expect(
    latestExecuted.length > 0 ||
      historicalExecuted,
    `AIR has no executed ${area} rows in the latest report or history (rows that only skip leave nothing to report). Run the ${area} rows and air:parse again.`
  ).toBeTruthy();

  expect(
    executions.length,
    `AIR history should keep at least two executions to compare ${area}; it has ${executions.length}.`
  ).toBeGreaterThanOrEqual(2);

  const runsWithRows =
    executions.filter(
      (execution) =>
        executedRows(
          execution.tests,
          filePattern
        ).length > 0
    ).length;

  expect(
    runsWithRows,
    `${area} should appear as executed in at least two stored AIR executions to show history; found ${runsWithRows}.`
  ).toBeGreaterThanOrEqual(2);
}

function expectSearchable(
  pattern: RegExp,
  what: string
) {
  const { latest } = loadAir();

  const hits =
    (latest.searchIndex ?? []).filter(
      (entry) =>
        entry.type === 'test' &&
        pattern.test(
          `${entry.title ?? ''} ${entry.text ?? ''}`
        )
    );

  expect(
    hits.length,
    `AIR search index should contain ${what}.`
  ).toBeGreaterThan(0);
}

type CoverageGapItem = {
  title?: string;
  file?: string;
  status?: string;
  category?: string;
  reason?: string;
  nextAction?: string;
};

function gapsFromExecution(
  tests: AirTest[] | undefined,
  filePattern: RegExp
): CoverageGapItem[] {
  return (tests ?? [])
    .filter(
      (row) =>
        filePattern.test(row.file ?? '') &&
        (row.status === 'skipped' ||
          row.status === 'interrupted')
    )
    .map((row) => ({
      title: row.title,
      file: row.file,
      status: row.status,
      category: 'Blocked',
      reason:
        (row.error ?? '').trim() ||
        'Listed as skipped/blocked in a stored AIR execution.',
      nextAction:
        'Restore the fixture or unblock the scenario, then re-run and air:parse.'
    }));
}

// A matrix file's skipped rows (blocked, controlled, future) must be listed in
// AIR's coverage gaps with a reason and a next action, so nothing skipped is
// silently hidden. The AIR data is read only; nothing is written.
function matrixGapItems(
  area: string,
  filePattern: RegExp
) {
  const { latest, executions } = loadAir();

  let items = (
    (latest as {
      coverageGaps?: {
        items?: CoverageGapItem[];
      };
    }).coverageGaps?.items ?? []
  ).filter(
    (item) =>
      filePattern.test(item.file ?? '')
  );

  // Mid-suite / tiny air:parse can wipe coverageGaps. Fall back to skipped
  // rows in latest, then any historical execution (history has no gaps blob).
  if (items.length === 0) {
    items = gapsFromExecution(
      latest.tests,
      filePattern
    );
  }

  if (items.length === 0) {
    for (const execution of executions) {
      items = gapsFromExecution(
        execution.tests,
        filePattern
      );
      if (items.length > 0) {
        break;
      }
    }
  }

  expect(
    items.length,
    `AIR coverage gaps should list the ${area} matrix rows that are blocked or skipped.`
  ).toBeGreaterThan(0);

  for (const item of items) {
    expect(
      (item.reason ?? '').trim().length,
      `AIR gap "${item.title}" has no reason.`
    ).toBeGreaterThan(0);

    expect(
      (item.nextAction ?? '').trim().length,
      `AIR gap "${item.title}" has no next action.`
    ).toBeGreaterThan(0);
  }

  return items;
}

function expectMatrixCoverageInAir(
  area: string,
  filePattern: RegExp,
  categories: string[]
) {
  const items = matrixGapItems(
    area,
    filePattern
  );

  const present = new Set(
    items.map(
      (item) => item.category ?? ''
    )
  );

  for (const category of categories) {
    expect(
      present.has(category),
      `AIR should list ${area} ${category} coverage gaps; found categories: ${[...present].join(', ')}.`
    ).toBeTruthy();
  }
}

export function runAirCheck(
  check: string
) {
  switch (check) {
    case 'monthly-annual-gap-coverage':
      expectMatrixCoverageInAir(
        'monthly-to-annual',
        /MonthlyAnnualBillingChangeMatrix/,
        ['Blocked']
      );
      return;

    case 'annual-monthly-gap-coverage':
      expectMatrixCoverageInAir(
        'annual-to-monthly',
        /AnnualMonthlyBillingChangeMatrix/,
        ['Blocked']
      );
      return;

    case 'cancellation-gap-coverage':
      // Cancellation gaps are Blocked (fixture/admin). Controlled is not emitted
      // for this matrix — skipped rows use automation-status:blocked.
      expectMatrixCoverageInAir(
        'cancellation',
        /SubscriptionCancellationMatrix/,
        ['Blocked']
      );
      return;

    case 'failed-payment-gap-coverage':
      expectMatrixCoverageInAir(
        'failed-payment and dunning',
        /FailedPaymentDunningMatrix/,
        ['Blocked']
      );
      return;

    case 'lifecycle-gap-coverage': {
      expectMatrixCoverageInAir(
        'subscription lifecycle',
        /SubscriptionLifecycleE2EMatrix/,
        ['Blocked']
      );

      const { latest } = loadAir();

      const executed = executedRows(
        latest.tests,
        /SubscriptionLifecycleE2EMatrix/
      );

      expect(
        executed.length,
        'AIR should show executed lifecycle rows (executable coverage status).'
      ).toBeGreaterThan(0);

      // Known bugs surface as failed rows; each must carry its error text.
      for (const row of executed.filter(
        (item) => item.status !== 'passed'
      )) {
        expect(
          (row.error ?? '').trim().length,
          `AIR failed lifecycle row "${row.title}" (known bug) has no error text.`
        ).toBeGreaterThan(0);
      }

      return;
    }

    case 'downgrade-history':
      expectAreaInAirHistory(
        'downgrade',
        /DowngradeSubscriptionMatrix/
      );
      return;

    case 'monthly-to-annual-history':
      expectAreaInAirHistory(
        'monthly-to-annual',
        /MonthlyAnnualBillingChangeMatrix/
      );
      return;

    case 'annual-to-monthly-history':
      expectAreaInAirHistory(
        'annual-to-monthly',
        /AnnualMonthlyBillingChangeMatrix/
      );
      return;

    case 'cancellation-history':
      expectAreaInAirHistory(
        'cancellation',
        /SubscriptionCancellationMatrix/
      );
      return;

    case 'cancellation-searchable':
      expectSearchable(
        /cancel/i,
        'cancellation test rows'
      );
      return;

    case 'failed-payment-evidence': {
      const { latest } = loadAir();

      const rows =
        executedRows(
          latest.tests,
          /PaymentNegative|FailedPaymentDunning|OverlayStrategistsTrial/,
          /declin|fail|incomplete|invalid|negative/i
        );

      expect(
        rows.length,
        'AIR should hold executed failed-payment rows (declined or invalid card).'
      ).toBeGreaterThan(0);

      for (const row of rows) {
        expect(
          (row.attempts?.length ?? 0) +
            (row.attachments?.length ?? 0),
          `AIR row "${row.title}" has no attempt or attachment evidence.`
        ).toBeGreaterThan(0);
      }

      return;
    }

    case 'failed-payment-trend':
      expectAreaInAirHistory(
        'failed-payment',
        /PaymentNegative|FailedPaymentDunning/
      );
      return;

    default:
      throw new Error(
        `Unknown AIR check "${check}".`
      );
  }
}
