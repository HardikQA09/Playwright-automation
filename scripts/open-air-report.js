const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function resultsAreTheMainFile() {
  const custom =
    process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;

  if (!custom) {
    return true;
  }

  return custom.replace(
    /\\/g,
    '/'
  ).endsWith(
    'test-results/results.json'
  );
}

function runNode(script) {
  return spawnSync(
    process.execPath,
    [
      path.join(
        projectRoot,
        'scripts',
        script
      )
    ],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env
    }
  );
}

function newestReport() {
  const names = [
    'index.html',
    'index-updated.html',
    'index-nav.html',
    'index-spare.html'
  ];

  const fresh = names
    .map((name) => {
      const full = path.join(
        projectRoot,
        'execution-report',
        name
      );

      return {
        full,
        mtime: fs.existsSync(full)
          ? fs.statSync(full).mtimeMs
          : 0
      };
    })
    .filter((file) =>
      Date.now() - file.mtime < 120000
    )
    .sort((left, right) =>
      right.mtime - left.mtime
    );

  return fresh.find((file) =>
    file.full.endsWith(
      `${path.sep}index.html`
    )
  ) || fresh[0];
}

function openInBrowser(reportPath) {
  if (process.env.CI) {
    console.log(
      `AIR report written: ${reportPath}`
    );
    return;
  }

  console.log(
    `Opening AIR report: ${reportPath}`
  );

  if (process.platform === 'win32') {
    spawn(
      'cmd.exe',
      [
        '/c',
        'start',
        '',
        reportPath
      ],
      {
        cwd: projectRoot,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }
    ).unref();
    return;
  }

  if (process.platform === 'darwin') {
    spawn(
      'open',
      [
        reportPath
      ],
      {
        detached: true,
        stdio: 'ignore'
      }
    ).unref();
    return;
  }

  spawn(
    'xdg-open',
    [
      reportPath
    ],
    {
      detached: true,
      stdio: 'ignore'
    }
  ).unref();
}

async function globalTeardown() {
  if (
    process.env.SKIP_AIR_REPORT === 'true' ||
    process.argv.includes('--list')
  ) {
    return;
  }

  if (!resultsAreTheMainFile()) {
    console.log(
      'This run wrote results to a separate file. The AIR report was left unchanged.'
    );
    return;
  }

  const resultsPath = path.join(
    projectRoot,
    'test-results',
    'results.json'
  );

  if (!fs.existsSync(resultsPath)) {
    const backupPath = path.join(
      projectRoot,
      'test-results',
      'results-pre-heal.json'
    );

    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, resultsPath);
      console.warn(
        'Restored test-results/results.json from results-pre-heal.json before AIR generation.'
      );
    } else {
      console.log(
        'No test-results/results.json. AIR report was not generated.'
      );
      return;
    }
  }

  const stats = JSON.parse(
    fs.readFileSync(
      resultsPath,
      'utf8'
    )
  ).stats || {};

  const ran =
    (stats.expected || 0) +
    (stats.unexpected || 0) +
    (stats.flaky || 0);

  if (
    ran === 0 &&
    (stats.duration || 0) < 5000
  ) {
    console.log(
      'This was a test list, not a run. The AIR report was left unchanged.'
    );
    return;
  }

  const parsed = runNode(
    'generate-air-results.js'
  );

  if (parsed.status !== 0) {
    console.log(
      'AIR results were not parsed, so the report was not opened.'
    );
    return;
  }

  const rendered = runNode(
    'generate-execution-report.js'
  );

  if (rendered.status !== 0) {
    console.log(
      'AIR report generation failed, so it was not opened.'
    );
    return;
  }

  const report = newestReport();

  if (!report) {
    console.log(
      'AIR HTML was not written, so it was not opened.'
    );
    return;
  }

  openInBrowser(
    report.full
  );

  fs.mkdirSync(
    path.dirname(resultsPath),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    path.join(
      projectRoot,
      'test-results',
      '.air-report-opened'
    ),
    report.full
  );
}

module.exports = globalTeardown;
