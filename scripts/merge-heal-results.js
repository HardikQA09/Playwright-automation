/*
 * Merge a --last-failed heal JSON into the full-suite results.json so AIR
 * reflects the final outcome of the same complete-suite run.
 *
 *   node scripts/merge-heal-results.js
 *   node scripts/merge-heal-results.js --main path --heal path --out path
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    main: path.join(projectRoot, 'test-results', 'results.json'),
    heal: path.join(projectRoot, 'test-results', 'results-heal.json'),
    out: path.join(projectRoot, 'test-results', 'results.json')
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--main') args.main = path.resolve(argv[++i] ?? args.main);
    else if (argv[i] === '--heal') args.heal = path.resolve(argv[++i] ?? args.heal);
    else if (argv[i] === '--out') args.out = path.resolve(argv[++i] ?? args.out);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walkSpecs(suite, visit) {
  for (const child of suite.suites || []) {
    walkSpecs(child, visit);
  }

  for (const spec of suite.specs || []) {
    visit(spec, suite);
  }
}

function specKey(spec) {
  // Prefer file+title+project — Playwright assigns fresh spec ids on each
  // invocation, so heal JSON cannot be matched by id across the same suite run.
  const projects = (spec.tests || [])
    .map((test) => test.projectName || '')
    .join(',');

  return [spec.file || '', spec.title || '', projects].join('::');
}

function latestStatus(spec) {
  const statuses = (spec.tests || []).flatMap((test) =>
    (test.results || []).map((result) => result.status)
  );

  if (!statuses.length) {
    return spec.ok ? 'passed' : 'failed';
  }

  if (statuses.some((status) => status === 'failed' || status === 'timedOut' || status === 'interrupted')) {
    // Retries that eventually pass are flaky/passed in Playwright JSON via ok=true.
    if (spec.ok) {
      return 'flaky';
    }

    return 'failed';
  }

  if (statuses.every((status) => status === 'skipped')) {
    return 'skipped';
  }

  return 'passed';
}

function recountStats(root) {
  const stats = {
    startTime: root.stats?.startTime || new Date().toISOString(),
    duration: root.stats?.duration || 0,
    expected: 0,
    skipped: 0,
    unexpected: 0,
    flaky: 0
  };

  for (const suite of root.suites || []) {
    walkSpecs(suite, (spec) => {
      const status = latestStatus(spec);

      if (status === 'failed') stats.unexpected += 1;
      else if (status === 'skipped') stats.skipped += 1;
      else if (status === 'flaky') stats.flaky += 1;
      else stats.expected += 1;
    });
  }

  return stats;
}

function mergeHealIntoMain(main, heal) {
  const healByKey = new Map();
  let healed = 0;
  let stillFailed = 0;

  for (const suite of heal.suites || []) {
    walkSpecs(suite, (spec) => {
      healByKey.set(specKey(spec), spec);

      if (latestStatus(spec) === 'failed') {
        stillFailed += 1;
      } else if (spec.ok) {
        healed += 1;
      }
    });
  }

  for (const suite of main.suites || []) {
    walkSpecs(suite, (spec, parent) => {
      const key = specKey(spec);
      const replacement = healByKey.get(key);

      if (!replacement || !parent.specs) {
        return;
      }

      const index = parent.specs.indexOf(spec);

      if (index >= 0) {
        parent.specs[index] = replacement;
        healByKey.delete(key);
      }
    });
  }

  main.stats = recountStats(main);
  main.errors = [...(main.errors || []), ...(heal.errors || [])];

  return {
    merged: main,
    healed,
    stillFailed,
    unusedHealSpecs: healByKey.size
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.main)) {
    throw new Error(`Missing main results: ${args.main}`);
  }

  if (!fs.existsSync(args.heal)) {
    throw new Error(`Missing heal results: ${args.heal}`);
  }

  const mainResults = readJson(args.main);
  const healResults = readJson(args.heal);
  const { merged, healed, stillFailed, unusedHealSpecs } = mergeHealIntoMain(
    mainResults,
    healResults
  );

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(`Heal merge written: ${args.out}`);
  console.log(
    `Healed/replaced specs: ${healed}, still failed in heal: ${stillFailed}, unmatched heal specs: ${unusedHealSpecs}`
  );
  console.log(
    `Merged stats: ${merged.stats.expected} passed, ${merged.stats.unexpected} failed, ${merged.stats.skipped} skipped, ${merged.stats.flaky} flaky`
  );

  return stillFailed;
}

if (require.main === module) {
  try {
    const stillFailed = main();
    process.exit(stillFailed > 0 ? 1 : 0);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  mergeHealIntoMain,
  recountStats,
  latestStatus
};
