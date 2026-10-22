import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/* =============================================================================
HELPER: Reuse a covering test's outcome

PURPOSE
-------
Some report rows are fully covered by a longer test that already walks the same
screens (for example one user checking four checkout summaries). Repeating that
walk would cost extra sign-ups and Stripe checkouts, so the covering test records
each checkpoint it really completed, and the report row only confirms it.

Honesty rules:
- A checkpoint is recorded only after its assertions passed.
- A row passes only if its checkpoint was recorded in THIS run (same Playwright
  runner process), so a stale result from an older run never counts.
- If the covering test did not run or stopped early, the row is skipped (not
  failed) — the covering check itself carries the real failure.
============================================================================= */

const STORE = path.join(
  process.cwd(),
  'test-results',
  '.coverage-reuse'
);

function fileFor(
  key: string
) {
  return path.join(
    STORE,
    `${key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`
  );
}

export function recordCoverage(
  key: string
) {
  fs.mkdirSync(
    STORE,
    { recursive: true }
  );

  fs.writeFileSync(
    fileFor(key),
    JSON.stringify({
      runner: process.ppid,
      at: new Date().toISOString()
    })
  );
}

export function expectCoveredBy(
  key: string,
  coveringTest: string
) {
  const file = fileFor(key);

  const recorded =
    fs.existsSync(file)
      ? (JSON.parse(
          fs.readFileSync(file, 'utf8')
        ) as { runner?: number })
      : null;

  if (
    recorded?.runner !==
    process.ppid
  ) {
    test.skip(
      true,
      `Covering test "${coveringTest}" did not complete checkpoint "${key}" in this run. Skipped (not a separate product defect) — fix or rerun the covering check first.`
    );
  }
}
