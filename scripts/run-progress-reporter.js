const fs = require('fs');
const path = require('path');

const historyPath = path.join(
  process.cwd(),
  'test-results',
  '.run-timing.json'
);

const livePath = path.join(
  process.cwd(),
  'tmp',
  'live-progress.json'
);

function formatDuration(ms) {
  const totalSeconds = Math.max(
    0,
    Math.round(ms / 1000)
  );
  const hours = Math.floor(
    totalSeconds / 3600
  );
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function readLastRun() {
  try {
    return JSON.parse(
      fs.readFileSync(
        historyPath,
        'utf8'
      )
    );
  } catch {
    return null;
  }
}

function writeLive(state) {
  try {
    fs.mkdirSync(
      path.dirname(livePath),
      {
        recursive: true
      }
    );
    fs.writeFileSync(
      livePath,
      JSON.stringify(
        state,
        null,
        2
      )
    );
  } catch {
    // Live status is best-effort — never fail the suite for it.
  }
}

class RunProgressReporter {
  onBegin(config, suite) {
    this.startedAt = Date.now();
    this.total = suite.allTests().length;
    this.doneAttempts = 0;
    this.outcomes = new Map();
    this.failures = [];
    this.skips = [];
    this.current = null;
    this.lastRun = readLastRun();

    const previous = this.lastRun &&
      this.lastRun.durationMs > 0
      ? ` The previous run took ${formatDuration(this.lastRun.durationMs)} for ${this.lastRun.total} checks.`
      : '';

    console.log(
      `\nTimer on. ${this.total} checks.${previous} Counts are unique tests (retries that later pass show as flaky, not failed).\n`
    );

    writeLive({
      ts: new Date().toISOString(),
      total: this.total,
      done: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      known: 0,
      current: null,
      failures: [],
      skips: []
    });
  }

  summarize() {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let flaky = 0;
    let known = 0;

    for (const outcome of this.outcomes.values()) {
      if (outcome.kind === 'skipped') skipped += 1;
      else if (outcome.kind === 'known') known += 1;
      else if (outcome.kind === 'flaky') flaky += 1;
      else if (outcome.kind === 'failed') failed += 1;
      else passed += 1;
    }

    // Known defects count with passes in AIR; keep timer aligned.
    return {
      done: this.outcomes.size,
      passed: passed + known,
      failed,
      skipped,
      flaky,
      known
    };
  }

  onTestBegin(test) {
    this.current = test.title;
    const stats = this.summarize();
    console.log(
      `> [${stats.done + 1}/${this.total}] ${test.title}`
    );
    writeLive({
      ts: new Date().toISOString(),
      total: this.total,
      ...stats,
      current: test.title,
      file: test.location?.file,
      failures: this.failures.slice(-10),
      skips: this.skips.slice(-20)
    });
  }

  onTestEnd(test, result) {
    this.doneAttempts += 1;

    const id = test.id;
    const prior = this.outcomes.get(id);
    const knownDefect =
      test.expectedStatus === 'failed' &&
      result.status !== 'passed' &&
      result.status !== 'skipped';

    let kind;
    if (result.status === 'skipped') {
      kind = 'skipped';
      if (!prior || prior.kind !== 'skipped') {
        this.skips.push({
          title: test.title,
          file: path.basename(
            test.location?.file || ''
          ),
          reason: (
            result.errors?.[0]?.message ||
            ''
          ).split('\n')[0].slice(0, 240)
        });
      }
    } else if (knownDefect) {
      kind = 'known';
    } else if (result.status === 'passed') {
      // A pass after an earlier failed attempt is flaky, not a standing failure.
      kind =
        prior &&
        (prior.kind === 'failed' || prior.hadFailedAttempt)
          ? 'flaky'
          : 'passed';
    } else {
      kind = 'failed';
      this.failures = this.failures.filter(
        (entry) => entry.id !== id
      );
      this.failures.push({
        id,
        title: test.title,
        file: path.basename(
          test.location?.file || ''
        ),
        status: result.status,
        retry: result.retry,
        error: (
          result.errors?.[0]?.message ||
          ''
        ).split('\n')[0].slice(0, 400)
      });
    }

    this.outcomes.set(id, {
      kind,
      title: test.title,
      hadFailedAttempt:
        (prior && prior.hadFailedAttempt) ||
        result.status === 'failed' ||
        result.status === 'timedOut' ||
        result.status === 'interrupted'
    });

    // Drop from standing failures once the test recovers.
    if (kind === 'passed' || kind === 'flaky') {
      this.failures = this.failures.filter(
        (entry) => entry.id !== id
      );
    }

    const stats = this.summarize();
    const elapsed = Date.now() - this.startedAt;
    const remaining = Math.max(
      this.total - stats.done,
      0
    );
    const left = stats.done > 0
      ? (elapsed / stats.done) * remaining
      : 0;

    const flakyNote = stats.flaky > 0
      ? `, ${stats.flaky} flaky`
      : '';
    const knownNote = stats.known > 0
      ? `, ${stats.known} known defects`
      : '';

    console.log(
      `[${stats.done}/${this.total}] ${stats.passed} passed, ${stats.failed} failed, ${stats.skipped} skipped${flakyNote}${knownNote} · ${formatDuration(elapsed)} elapsed · about ${formatDuration(left)} left`
    );

    writeLive({
      ts: new Date().toISOString(),
      total: this.total,
      ...stats,
      attempts: this.doneAttempts,
      current: null,
      lastFinished: test.title,
      lastStatus: result.status,
      elapsedMs: elapsed,
      failures: this.failures.slice(-10),
      skips: this.skips.slice(-20)
    });
  }

  onEnd() {
    const stats = this.summarize();
    const durationMs = Date.now() - this.startedAt;

    try {
      fs.mkdirSync(
        path.dirname(historyPath),
        {
          recursive: true
        }
      );
      fs.writeFileSync(
        historyPath,
        JSON.stringify(
          {
            total: this.total,
            done: stats.done,
            durationMs,
            finishedAt: new Date().toISOString()
          },
          null,
          2
        )
      );
    } catch {
      // The timer line already printed. A locked history file should not fail the run.
    }

    writeLive({
      ts: new Date().toISOString(),
      finished: true,
      total: this.total,
      ...stats,
      attempts: this.doneAttempts,
      durationMs,
      failures: this.failures,
      skips: this.skips
    });

    const flakyNote = stats.flaky > 0
      ? ` ${stats.flaky} flaky.`
      : '';
    const knownNote = stats.known > 0
      ? ` ${stats.known} known defects are counted with the passes, same as the report.`
      : '';

    console.log(
      `\nRun timer: ${stats.done}/${this.total} checks in ${formatDuration(durationMs)}. ${stats.passed} passed, ${stats.failed} failed, ${stats.skipped} skipped.${flakyNote}${knownNote}\n`
    );
  }
}

module.exports = RunProgressReporter;
