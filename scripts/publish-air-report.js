/*
 * Publish the latest AIR + Playwright HTML reports to the gh-pages branch so
 * anyone with the URL can open them in a browser (no zip / no local file).
 *
 *   node scripts/publish-air-report.js
 *   npm run report:publish
 *
 * Requires:
 *   - execution-report/index.html already generated
 *   - git remote "origin" (GitHub)
 *   - GitHub Pages enabled for this repo, Source = gh-pages / root
 *
 * Public URL (after Pages is on):
 *   https://<owner>.github.io/<repo>/execution-report/
 *
 * Writes that URL to execution-report/published-url.txt and prints it.
 * Set the same value as REPORT_URL in .env so report emails include the link.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.resolve(__dirname, '..');
const siteDir = path.join(projectRoot, '.air-publish-site');
const airDir = path.join(projectRoot, 'execution-report');
const pwDir = path.join(projectRoot, 'playwright-report');
const urlOut = path.join(airDir, 'published-url.txt');

function run(command, args, options = {}) {
  // Do not use shell:true — Windows mangles git -c "user.name=..." args.
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: 'utf8',
    shell: false,
    stdio: options.stdio || 'pipe',
    env: process.env
  });

  if (result.status !== 0) {
    const detail =
      (result.stderr || result.stdout || '').trim() ||
      `exit ${result.status}`;
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }

  return (result.stdout || '').trim();
}

function git(args, options = {}) {
  return run('git', args, options);
}

function copyDir(src, dest, options = {}) {
  const skipNames = new Set(
    options.skipNames || []
  );

  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, {
    withFileTypes: true
  })) {
    if (skipNames.has(entry.name)) {
      continue;
    }

    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(from, to, options);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function resolvePagesUrl() {
  if (process.env.REPORT_URL) {
    return process.env.REPORT_URL.replace(/\/$/, '');
  }

  const remote = git(['remote', 'get-url', 'origin']);
  const match = remote.match(
    /github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+?)(?:\.git)?$/i
  );

  if (!match?.groups) {
    throw new Error(
      `Could not parse GitHub owner/repo from origin (${remote}). Set REPORT_URL instead.`
    );
  }

  const { owner, repo } = match.groups;
  return `https://${owner}.github.io/${repo}/execution-report`;
}

function resolveLatestAirHtml() {
  const rank = (file) => {
    const base = path.basename(file).toLowerCase();
    if (base === 'index.html') return 0;
    if (base === 'index-latest.html') return 1;
    if (base === 'index-current.html') return 2;
    if (base === 'index-updated.html') return 3;
    return 9;
  };

  const files = fs
    .readdirSync(airDir)
    .filter((name) => /^index(-[\w]+)?\.html$/i.test(name))
    .map((name) => path.join(airDir, name))
    .filter((file) => {
      try {
        return fs.statSync(file).isFile() && fs.statSync(file).size > 50_000;
      } catch {
        return false;
      }
    })
    .sort((a, b) => {
      const mt = fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
      if (Math.abs(mt) < 5000) {
        return rank(a) - rank(b);
      }
      return mt;
    });

  return files[0] || null;
}

function stageSite() {
  const latestHtml = resolveLatestAirHtml();

  if (!latestHtml) {
    throw new Error(
      'No execution-report/index*.html. Run the suite (or npm run report:execution) first.'
    );
  }

  fs.rmSync(siteDir, { recursive: true, force: true });
  fs.mkdirSync(siteDir, { recursive: true });

  // Skip bulky / Windows-MAX_PATH evidence dumps. The HTML summary still works;
  // deep screenshot galleries stay on the machine that ran the suite.
  copyDir(airDir, path.join(siteDir, 'execution-report'), {
    skipNames: [
      'annotated-evidence',
      'kept-evidence',
      'playwright-batches',
      'history'
    ]
  });

  // Hosted entrypoint must be the simple overview. Full AIR lives at details.html.
  const siteAir = path.join(siteDir, 'execution-report');
  const overviewCandidates = [
    path.join(airDir, 'index.html'),
    path.join(airDir, 'summary.html'),
    path.join(airDir, 'index-overview.html'),
    path.join(airDir, 'dashboard', 'index.html')
  ];
  let overviewSource = null;
  for (const candidate of overviewCandidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const html = fs.readFileSync(candidate, 'utf8');
      if (/data-air-simple-overview/i.test(html)) {
        overviewSource = candidate;
        break;
      }
    } catch {
      /* try next */
    }
  }

  if (overviewSource) {
    fs.copyFileSync(overviewSource, path.join(siteAir, 'index.html'));
    console.log(
      `Publish entrypoint (overview): ${path.basename(overviewSource)} -> execution-report/index.html`
    );
  } else {
    console.warn(
      'No simple overview found — publishing newest index*.html as entry (run generate-air-dashboard.js).'
    );
    fs.copyFileSync(latestHtml, path.join(siteAir, 'index.html'));
  }

  const detailsSrc = path.join(airDir, 'details.html');
  if (!fs.existsSync(detailsSrc) && latestHtml) {
    fs.copyFileSync(latestHtml, path.join(siteAir, 'details.html'));
    console.log(
      `Publish details fallback: ${path.basename(latestHtml)} -> execution-report/details.html`
    );
  }

  if (fs.existsSync(path.join(pwDir, 'index.html'))) {
    copyDir(pwDir, path.join(siteDir, 'playwright-report'), {
      skipNames: ['data']
    });
  } else {
    console.warn(
      'playwright-report/index.html missing — AIR will publish without the Playwright deep-link target.'
    );
  }

  fs.writeFileSync(
    path.join(siteDir, 'index.html'),
    `<!doctype html><meta http-equiv="refresh" content="0; url=./execution-report/">` +
      `<a href="./execution-report/">Open AIR report</a>\n`
  );
}

function publishGhPages() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'air-gh-pages-'));
  const url = resolvePagesUrl();

  try {
    // Fresh orphan branch with only the staged site — keeps history small.
    git(['init'], { cwd: work });
    git(['config', 'core.longpaths', 'true'], { cwd: work });
    git(['checkout', '-b', 'gh-pages'], { cwd: work });
    fs.cpSync(siteDir, work, { recursive: true });
    // Ignore CRLF warnings from stderr — treat only non-zero status as failure.
    const add = spawnSync(
      'git',
      ['add', '-A'],
      {
        cwd: work,
        encoding: 'utf8',
        shell: false,
        env: process.env
      }
    );

    if (add.status !== 0) {
      throw new Error(
        `git add -A failed: ${(add.stderr || add.stdout || '').trim()}`
      );
    }
    git(
      [
        '-c',
        'user.name=AIR-Publisher',
        '-c',
        'user.email=air-report@local',
        'commit',
        '-m',
        `Publish AIR report ${new Date().toISOString()}`
      ],
      { cwd: work }
    );

    const remote = git(['remote', 'get-url', 'origin']);
    git(['remote', 'add', 'origin', remote], { cwd: work });
    git(['push', '-f', 'origin', 'gh-pages'], {
      cwd: work,
      stdio: 'inherit'
    });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }

  return url;
}

function main() {
  console.log('Staging AIR + Playwright reports for GitHub Pages…');
  stageSite();

  console.log('Pushing gh-pages branch…');
  const url = publishGhPages();

  fs.mkdirSync(airDir, { recursive: true });
  fs.writeFileSync(urlOut, `${url}/\n`);

  console.log('');
  console.log('AIR report (share this link):');
  console.log(`  ${url}/`);
  console.log('');
  console.log('Also saved to execution-report/published-url.txt');
  console.log(
    'Put the same URL in .env as REPORT_URL=... so complete --email includes it.'
  );
  console.log(
    'One-time: GitHub → repo Settings → Pages → Branch: gh-pages / root (repo must allow Pages; public repo = anyone can open).'
  );

  fs.rmSync(siteDir, { recursive: true, force: true });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
