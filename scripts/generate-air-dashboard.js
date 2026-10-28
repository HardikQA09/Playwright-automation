/*
 * Local interactive AIR dashboard (repo file — not emailed).
 *
 *   node scripts/generate-air-dashboard.js
 *   node scripts/generate-air-dashboard.js --open
 *   node scripts/generate-air-dashboard.js --prune-only
 *
 * Writes:
 *   execution-report/index.html             simple overview (default for clients)
 *   execution-report/details.html           full AIR (from generate-execution-report)
 *   execution-report/dashboard/index.html   same simple UI (backup path)
 *   execution-report/dashboard/data.json    slim history + latest
 *   execution-report/dashboard/runs/<id>/   per-run snapshot (deletable)
 *
 * Retention (default 14 days):
 *   AIR_DASHBOARD_KEEP_DAYS=14
 *   or --keep-days 14
 *   or --keep-days 0 to disable pruning
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { buildOverviewHtml } = require('./air-overview-html');

const projectRoot = path.resolve(__dirname, '..');
const reportDir = path.join(projectRoot, 'execution-report');
const historyPath = path.join(reportDir, 'history', 'air-history.json');
const resultsPath = path.join(reportDir, 'air-results.json');
const dashDir = path.join(reportDir, 'dashboard');
const runsDir = path.join(dashDir, 'runs');

const argv = process.argv.slice(2);

function argValue(flag, fallback) {
  const i = argv.indexOf(flag);
  if (i < 0 || i + 1 >= argv.length) return fallback;
  return argv[i + 1];
}

function keepDays() {
  const raw =
    argValue('--keep-days', null) ??
    process.env.AIR_DASHBOARD_KEEP_DAYS ??
    '14';
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 14;
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function slimRun(entry) {
  const summary = entry.summary || {};
  const release = entry.release || {};
  const failedTests = Array.isArray(entry.failedTests)
    ? entry.failedTests
    : [];
  const modules = Array.isArray(entry.modules) ? entry.modules : [];

  return {
    id: entry.execution?.id || entry.id || `run-${entry.generatedAt || Date.now()}`,
    at: entry.generatedAtDisplay || entry.generatedAt || '',
    generatedAt: entry.generatedAt || '',
    duration: summary.duration || entry.execution?.duration || '',
    durationMs: summary.durationMs || entry.execution?.durationMs || 0,
    total: summary.total || 0,
    passed: summary.passed || 0,
    failed: summary.failed || 0,
    skipped: summary.skipped || 0,
    // Same meaning as AIR "Not run": skipped only (flaky tests did run).
    notRun: summary.skipped || 0,
    flaky: summary.flaky || 0,
    executed: summary.executed || 0,
    documentedSkipped: summary.documentedSkipped || 0,
    passRate: summary.passRate ?? summary.executedPassRate ?? 0,
    unexpectedSkipped: summary.unexpectedSkipped || 0,
    decision: String(
      release.decision ||
        summary.releaseDecision ||
        entry.releaseDecision ||
        'UNKNOWN'
    ).replace(/_/g, ' '),
    risk: release.risk || summary.estimatedReleaseRisk || '',
    qualityScore: summary.qualityScore ?? release.confidence ?? null,
    failedTitles: failedTests.slice(0, 40).map((t) => {
      const raw = String(t.error || t.message || '')
        .replace(/\u001b\[[0-9;]*m/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      let error = raw;
      if (raw.length > 180) {
        const cut = raw.slice(0, 179);
        const space = cut.lastIndexOf(' ');
        error =
          (space > 90 ? cut.slice(0, space) : cut).replace(
            /[.,;:]+$/g,
            ''
          ) + '…';
      }
      return {
        title: t.title || t.name || t.fullTitle || 'Untitled',
        file: t.file || t.spec || t.location || '',
        status: t.status || t.outcome || 'failed',
        error
      };
    }),
    modules: modules.slice(0, 40).map((m) => ({
      name: m.name,
      passed: m.passed || 0,
      failed: m.failed || 0,
      skipped: m.skipped || 0,
      score: m.score ?? null,
      status: m.status || '',
      critical: !!m.critical
    }))
  };
}

function pruneRuns(days) {
  if (!days || !fs.existsSync(runsDir)) {
    return { removed: 0, kept: 0 };
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let removed = 0;
  let kept = 0;

  for (const name of fs.readdirSync(runsDir)) {
    const full = path.join(runsDir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    const summaryPath = path.join(full, 'summary.json');
    let stamp = st.mtimeMs;
    if (fs.existsSync(summaryPath)) {
      try {
        const s = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        const parsed = Date.parse(s.generatedAt || s.at || '');
        if (Number.isFinite(parsed)) stamp = parsed;
      } catch {
        /* use mtime */
      }
    }

    if (stamp < cutoff) {
      fs.rmSync(full, { recursive: true, force: true });
      removed += 1;
    } else {
      kept += 1;
    }
  }

  return { removed, kept };
}

function writeSafe(filePath, contents) {
  try {
    fs.writeFileSync(filePath, contents);
    return true;
  } catch (error) {
    // Windows often locks index.html while open in a browser. Write beside it
    // then replace via rename, which can succeed when overwrite does not.
    try {
      const tmpPath = `${filePath}.tmp-overview`;
      fs.writeFileSync(tmpPath, contents);
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* still locked */
      }
      fs.renameSync(tmpPath, filePath);
      return true;
    } catch (retryError) {
      console.warn(`Could not write ${filePath}: ${error.message}`);
      try {
        fs.unlinkSync(`${filePath}.tmp-overview`);
      } catch {
        /* ignore */
      }
      return false;
    }
  }
}

function isFullAirHtml(html) {
  if (!html || html.length < 50000) return false;
  return (
    /AIR Execution Report/i.test(html) ||
    /Executive Dashboard/i.test(html) ||
    /data-air-full-report/i.test(html)
  );
}

function isOverviewHtml(html) {
  return /data-air-simple-overview/i.test(html || '');
}

function stripOverviewNavBlocks(html) {
  // Remove every overview banner, including nested markup, by matching balanced divs.
  let result = html;
  const openRe = /<div\b[^>]*\bdata-air-overview-nav\b[^>]*>/i;
  while (true) {
    const match = openRe.exec(result);
    if (!match) break;
    const start = match.index;
    let i = start + match[0].length;
    let depth = 1;
    while (i < result.length && depth > 0) {
      const nextOpen = result.indexOf('<div', i);
      const nextClose = result.indexOf('</div>', i);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + 4;
      } else {
        depth -= 1;
        i = nextClose + 6;
      }
    }
    result = result.slice(0, start) + result.slice(i);
  }
  // Remove orphaned duplicate CTAs left by older broken replacements.
  result = result.replace(
    /(?:\s*<a\b[^>]*href="\.\/index\.html"[^>]*>\s*Back to overview\s*<\/a>)+/gi,
    ''
  );
  return result;
}

function withOverviewBanner(fullHtml) {
  let html = fullHtml;

  // Flat single-row banner. No nested divs, no duplicate CTA (← Simple overview is enough).
  const banner = `<div data-air-overview-nav style="position:sticky;top:0;z-index:99999;display:flex;gap:10px;align-items:center;flex-wrap:nowrap;padding:10px 18px;background:linear-gradient(100deg,#03120c,#07101f 55%,#050914);border-bottom:1px solid rgba(57,231,95,.28);font-family:Manrope,Segoe UI,sans-serif;font-size:13px;color:#e2e8f0;box-sizing:border-box"><a href="./index.html" style="color:#9af7ad;font-weight:800;text-decoration:none;white-space:nowrap">← Simple overview</a><span style="color:#64748b">·</span><span style="color:#94a3b8;white-space:nowrap">Detailed report</span></div>`;

  const guideOffsetStyle = `<style data-air-guide-offset>
body.has-air-guide{--air-guide-h:52px}
body.has-air-guide .sidebar,body.has-air-guide .app:before{top:var(--air-guide-h)!important;height:calc(100vh - var(--air-guide-h))!important;height:calc(100dvh - var(--air-guide-h))!important;min-height:calc(100vh - var(--air-guide-h))!important;min-height:calc(100dvh - var(--air-guide-h))!important}
body.has-air-guide .sidebar{z-index:5!important}
@media(max-width:1100px){body.has-air-guide .sidebar,body.has-air-guide .app:before{top:auto!important;height:auto!important;min-height:0!important}}
</style>
<script data-air-guide-offset>
(function(){
  function syncGuideHeight(){
    var bar=document.querySelector('[data-air-overview-nav]');
    if(!bar)return;
    document.body.classList.add('has-air-guide');
    var h=Math.ceil(bar.getBoundingClientRect().height)||52;
    document.body.style.setProperty('--air-guide-h',h+'px');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',syncGuideHeight);
  else syncGuideHeight();
  window.addEventListener('resize',syncGuideHeight);
})();
</script>`;

  html = stripOverviewNavBlocks(html);
  if (/<body[^>]*>/i.test(html)) {
    html = html.replace(/<body([^>]*)>/i, `<body$1>${banner}`);
  } else {
    html = banner + html;
  }

  // Keep the left rail below the sticky guide so the AIR logo stays visible.
  html = html.replace(/<body([^>]*)>/i, (match, attrs) => {
    if (/\bhas-air-guide\b/.test(attrs)) return match;
    if (/\bclass\s*=\s*"/i.test(attrs)) {
      return `<body${attrs.replace(/\bclass\s*=\s*"/i, 'class="has-air-guide ')}`;
    }
    return `<body class="has-air-guide"${attrs}>`;
  });

  if (!/data-air-guide-offset/i.test(html)) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${guideOffsetStyle}</head>`);
    } else {
      html = guideOffsetStyle + html;
    }
  } else {
    html = html
      .replace(/<style data-air-guide-offset>[\s\S]*?<\/style>/i, guideOffsetStyle.match(/<style[\s\S]*?<\/style>/)[0])
      .replace(/<script data-air-guide-offset>[\s\S]*?<\/script>/i, guideOffsetStyle.match(/<script[\s\S]*?<\/script>/)[0]);
  }

  // Remove legacy howto tips — navigation is now one page chrome bar.
  html = html.replace(/<div data-air-details-howto[\s\S]*?<\/div>/gi, '');

  // Clearer sidebar labels for first-time readers.
  html = html
    .replace(
      /<label for="airSearch">Search Report<\/label>/i,
      `<label for="airSearch">Find a test or area</label>`
    )
    .replace(
      /placeholder="Search the report"/i,
      `placeholder="Type a test, module, or SC- id"`
    )
    .replace(
      /<label for="airGlobalSearch">Search AIR Platform<\/label>/i,
      `<label for="airGlobalSearch">Search this report</label>`
    )
    .replace(
      /placeholder="Search areas, checks, proof\.\.\."/i,
      `placeholder="Search areas, checks, or proof…"`
    );

  return html;
}

function preserveFullDetailsReport() {
  const candidates = [
    'details.html',
    'index-latest.html',
    'index-updated.html',
    'index-current.html',
    'index-spare.html',
    'index-nav.html',
    'index.html'
  ];

  let fullHtml = null;
  let sourceName = null;

  for (const name of candidates) {
    const fullPath = path.join(reportDir, name);
    if (!fs.existsSync(fullPath)) continue;
    let html;
    try {
      html = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }
    if (isOverviewHtml(html)) continue;
    if (!isFullAirHtml(html)) continue;
    fullHtml = html;
    sourceName = name;
    break;
  }

  if (!fullHtml) {
    console.warn(
      'No full AIR HTML found to keep as details.html — run generate-execution-report first.'
    );
    return false;
  }

  const detailsHtml = withOverviewBanner(fullHtml);
  const ok = writeSafe(path.join(reportDir, 'details.html'), detailsHtml);
  if (ok) {
    console.log(
      `Full AIR kept as details.html (from ${sourceName})`
    );
  }
  return ok;
}

function buildHtml(payload, options = {}) {
  return buildOverviewHtml(payload, options);
}

function openHtml(filePath) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', filePath], {
      detached: true,
      stdio: 'ignore'
    }).unref();
    return;
  }
  spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [filePath], {
    detached: true,
    stdio: 'ignore'
  }).unref();
}

function main() {
  const days = keepDays();
  const pruneOnly = argv.includes('--prune-only');

  fs.mkdirSync(runsDir, { recursive: true });

  if (pruneOnly) {
    const result = pruneRuns(days);
    console.log(
      `Pruned dashboard runs older than ${days} day(s): removed ${result.removed}, kept ${result.kept}`
    );
    return;
  }

  const history = readJson(historyPath, { executions: [] });
  const latestResults = readJson(resultsPath, null);
  const executions = Array.isArray(history.executions)
    ? history.executions
    : [];

  const runs = executions.map(slimRun);
  let latest = latestResults ? slimRun(latestResults) : null;

  if (latest) {
    const exists = runs.some((r) => r.id === latest.id);
    if (!exists) runs.push(latest);
  } else if (runs.length) {
    latest = runs[runs.length - 1];
  }

  if (latest) {
    const runFolder = path.join(
      runsDir,
      String(latest.id).replace(/[^\w.-]+/g, '_')
    );
    fs.mkdirSync(runFolder, { recursive: true });
    fs.writeFileSync(
      path.join(runFolder, 'summary.json'),
      JSON.stringify(latest, null, 2)
    );
  }

  const prune = pruneRuns(days);

  const archive = fs
    .readdirSync(runsDir)
    .map((name) => {
      const summaryPath = path.join(runsDir, name, 'summary.json');
      if (!fs.existsSync(summaryPath)) return null;
      try {
        return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const payload = {
    generatedAt: new Date().toISOString(),
    keepDays: days,
    source: {
      history: 'execution-report/history/air-history.json',
      latest: 'execution-report/air-results.json',
      fullReport: 'execution-report/details.html',
      overview: 'execution-report/index.html'
    },
    runs,
    latest,
    archive
  };

  fs.writeFileSync(
    path.join(dashDir, 'data.json'),
    JSON.stringify(payload, null, 2)
  );

  // Keep the large AIR HTML as details.html, then make overview the default index.
  preserveFullDetailsReport();

  const overviewHtml = buildHtml(payload, { detailsHref: './details.html' });
  const dashHtml = buildHtml(payload, { detailsHref: '../details.html' });

  const indexPath = path.join(reportDir, 'index.html');
  const htmlPath = path.join(dashDir, 'index.html');
  const overviewOutputs = [
    indexPath,
    path.join(reportDir, 'summary.html'),
    path.join(reportDir, 'index-overview.html')
  ];

  let overviewPath = null;
  for (const filePath of overviewOutputs) {
    if (writeSafe(filePath, overviewHtml)) {
      overviewPath = overviewPath || filePath;
    }
  }
  writeSafe(htmlPath, dashHtml);

  if (!overviewPath) {
    overviewPath = htmlPath;
  }

  const summaryPath = path.join(reportDir, 'summary.html');

  writeSafe(
    path.join(dashDir, 'HOW-TO.txt'),
    [
      'AIR report layout (same folder for client + detail)',
      '',
      'DEFAULT (clients open this):',
      '  execution-report/index.html     ← simple overview',
      '  npm run report:simple:open',
      '',
      'DETAILED (same place, one click):',
      '  execution-report/details.html   ← full AIR',
      '  Button on overview: "Open detailed report"',
      '  Banner on details: "Back to overview"',
      '',
      'Also available:',
      '  execution-report/summary.html   → redirects to index.html',
      '  execution-report/dashboard/     → same overview UI',
      '',
      'Delete old saved run folders:',
      '  npm run report:dashboard:prune',
      '',
      `Current keep-days: ${days}`,
      `Last prune: removed ${prune.removed}, kept ${prune.kept}`,
      ''
    ].join('\n')
  );

  console.log(`AIR overview (default): ${overviewPath}`);
  if (overviewPath !== indexPath) {
    console.warn(
      'index.html was locked — close it in the browser, then re-run: npm run report:simple'
    );
  }
  console.log(`AIR detailed report:    ${path.join(reportDir, 'details.html')}`);
  console.log(
    `Runs archived: ${archive.length} · pruned ${prune.removed} (keep ${days}d)`
  );

  if (argv.includes('--open')) {
    openHtml(overviewPath);
  }
}

main();
