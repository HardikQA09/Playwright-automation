const fs = require('fs');
const path = require('path');

const historyPath = path.join(
  process.cwd(),
  'test-results',
  '.run-timing.json'
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

class RunProgressReporter {
  onBegin(config, suite) {
    this.startedAt = Date.now();
    this.total = suite.allTests().length;
    this.done = 0;
    this.passed = 0;
    this.failed = 0;
    this.known = 0;
    this.skipped = 0;
    this.lastRun = readLastRun();

    const previous = this.lastRun &&
      this.lastRun.durationMs > 0
      ? ` The previous run took ${formatDuration(this.lastRun.durationMs)} for ${this.lastRun.total} checks.`
      : '';

    console.log(
      `\nTimer on. ${this.total} checks.${previous} Time left appears after the first check.\n`
    );
  }

  onTestBegin(test) {
    console.log(
      `> [${this.done + 1}/${this.total}] ${test.title}`
    );
  }

  onTestEnd(test, result) {
    this.done += 1;

    const knownDefect =
      test.expectedStatus === 'failed' &&
      result.status !== 'passed' &&
      result.status !== 'skipped';

    if (result.status === 'skipped') {
      this.skipped += 1;
    } else if (knownDefect) {
      this.known += 1;
      this.passed += 1;
    } else if (
      result.status === 'passed' &&
      test.expectedStatus !== 'failed'
    ) {
      this.passed += 1;
    } else {
      this.failed += 1;
    }

    const elapsed = Date.now() - this.startedAt;
    const remaining = Math.max(
      this.total - this.done,
      0
    );
    const left = this.done > 0
      ? (elapsed / this.done) * remaining
      : 0;

    const knownNote = this.known > 0
      ? `, ${this.known} known defects`
      : '';

    console.log(
      `[${this.done}/${this.total}] ${this.passed} passed, ${this.failed} failed, ${this.skipped} skipped${knownNote} · ${formatDuration(elapsed)} elapsed · about ${formatDuration(left)} left`
    );
  }

  onEnd() {
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
            done: this.done,
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

    const knownNote = this.known > 0
      ? ` ${this.known} known defects are counted with the passes, same as the report.`
      : '';

    console.log(
      `\nRun timer: ${this.done}/${this.total} checks in ${formatDuration(durationMs)}. ${this.passed} passed, ${this.failed} failed, ${this.skipped} skipped.${knownNote}\n`
    );
  }
}

module.exports = RunProgressReporter;
