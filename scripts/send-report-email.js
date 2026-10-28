/*
 * Emails the latest AIR execution report to the people who need it.
 *
 *   node scripts/send-report-email.js [--label "Daily run"] [--dry-run]
 *                                     [--to a@x.com,b@y.com]
 *
 * Attaches the AIR report (execution-report/index.html) and the Playwright
 * HTML report (playwright-report/, zipped).
 *
 * Settings come from .env / .env.local (see .env.example):
 *   REPORT_EMAIL_TO, REPORT_EMAIL_CC, REPORT_EMAIL_FROM
 *   REPORT_EMAIL_TO_<LABEL> / REPORT_EMAIL_CC_<LABEL>
 *     added to the same send, they do not replace the other lists
 *   REPORT_EMAIL_EXCLUDE     never send here (Rob is always excluded)
 *   REPORT_SMTP_HOST / REPORT_SMTP_PORT / REPORT_SMTP_USER / REPORT_SMTP_PASS
 *     (default to Gmail using GMAIL_USER and GMAIL_APP_PASSWORD)
 *   REPORT_URL               optional link to the hosted report
 */
const fs = require('fs');
const path = require('path');
const { collectConfiguredRecipients } = require('./report-recipients');

const projectRoot = path.resolve(__dirname, '..');
const reportDir = path.join(projectRoot, 'execution-report');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const rawLine of fs
    .readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv(path.join(projectRoot, '.env'));
loadEnv(path.join(projectRoot, '.env.local'));

function parseArgs(argv) {
  const args = { label: 'Execution report', dryRun: false, to: '', onlyIfClean: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--only-if-clean') args.onlyIfClean = true;
    else if (arg === '--label') args.label = argv[++i] ?? args.label;
    else if (arg === '--to') args.to = argv[++i] ?? '';
  }

  return args;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function recipientsFor(args) {
  if (args.to) {
    const { recipients, skipped } = collectConfiguredRecipients({
      REPORT_EMAIL_TO: args.to,
      REPORT_EMAIL_EXCLUDE: process.env.REPORT_EMAIL_EXCLUDE
    });

    return { to: recipients.join(', '), skipped };
  }

  const { recipients, skipped } = collectConfiguredRecipients();
  return { to: recipients.join(', '), skipped };
}

function buildMessage(air, args) {
  const s = air.summary ?? {};
  const decision = s.releaseDecision ?? air.releaseDecision?.status ?? 'n/a';
  const passing = Number(s.failed ?? 0) === 0;

  const subject =
    `[${air.environment?.name ?? 'UAT'}] ${args.label}: ` +
    `${passing ? 'PASSED' : `${s.failed} FAILED`} ` +
    `(${s.passed}/${s.executed} executed) - ${decision}`;

  const rows = [
    ['Run', args.label],
    ['Finished', air.generatedAtDisplay ?? air.generatedAt],
    ['Duration', s.duration],
    ['Total tests', s.total],
    ['Passed', s.passed],
    ['Failed', s.failed],
    ['Skipped', s.skipped],
    ['Pass rate', `${s.passRate}%`],
    ['Quality score', s.qualityScore],
    ['Release decision', decision]
  ];

  const publishedPath = path.join(reportDir, 'published-url.txt');
  const airJsonPath = path.join(reportDir, 'air-results.json');
  let hostedUrl =
    process.env.REPORT_URL ||
    (fs.existsSync(publishedPath)
      ? fs.readFileSync(publishedPath, 'utf8').trim()
      : '');

  // Stale GitHub Pages URL is worse than no link — body/attachment can say
  // 579/0 while the hosted page is still an older 505/7 run.
  if (
    hostedUrl &&
    fs.existsSync(publishedPath) &&
    fs.existsSync(airJsonPath)
  ) {
    const publishedAge = fs.statSync(publishedPath).mtimeMs;
    const airAge = fs.statSync(airJsonPath).mtimeMs;
    if (airAge - publishedAge > 5 * 60 * 1000) {
      console.warn(
        'Hosted REPORT_URL / published-url.txt is older than air-results.json — omitting the link so the email does not open a previous run. Run: npm run report:publish'
      );
      hostedUrl = '';
    }
  }

  const link = hostedUrl
    ? `<p><a href="${escapeHtml(hostedUrl)}">Open the hosted AIR report</a> (same run as this email)</p>`
    : `<p><b>Open the attached AIR HTML</b> for this run’s numbers. The hosted web link was omitted because it was not republished after this run (or was stale).</p>`;

  const env = air.environment?.name ?? 'UAT';
  const intro =
    `Hello,\n\nPlease find the OolTool QA automation execution report for the ${env} ` +
    `environment (${args.label.toLowerCase()}).`;
  const verdict = passing
    ? `All executed tests passed. Release decision: ${decision}.`
    : `${s.failed} test(s) failed out of ${s.executed} executed. Release decision: ${decision}. ` +
      `Failed-test detail, screenshots and traces are in the attached reports.`;
  const closing =
    'Attachments:\n' +
    '1. AIR execution report (.html) — open this file in a browser for the full AIR report, including the release decision and evidence.\n' +
    '2. Playwright report (.zip) — unzip the file and open index.html for step details, screenshots and traces.\n\n' +
    'Please review the attached reports and reply to this email if anything needs a closer look.\n\n' +
    'Regards,\nOolTool QA Automation';

  const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222">
  <p>Hi team,</p>
  <p>Please find the OolTool automation execution report for the <b>${escapeHtml(
    env
  )}</b> environment (${escapeHtml(args.label.toLowerCase())}).</p>
  <p>${escapeHtml(verdict)}</p>
  <h2 style="margin:16px 0 8px">${escapeHtml(subject)}</h2>
  <table style="border-collapse:collapse">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 12px 4px 0;color:#666">${escapeHtml(
            k
          )}</td><td style="padding:4px 0"><b>${escapeHtml(v)}</b></td></tr>`
      )
      .join('')}
  </table>
  ${link}
  <p>Attached: the <b>AIR execution report</b> (open the .html file in a browser) and the <b>Playwright report</b> (unzip it and open index.html). Please reply to this email if anything needs a closer look.</p>
  <p>Regards,<br>OolTool QA Automation</p>
</div>`;

  const text =
    `${intro}\n\n${verdict}\n\n${subject}\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\n${closing}`;

  return { subject, html, text };
}

async function main() {
  const skipEmailFlag = path.join(
    projectRoot,
    'tmp',
    'SKIP_REPORT_EMAIL'
  );

  // Hold email after a live run while failures are still being fixed.
  if (fs.existsSync(skipEmailFlag)) {
    console.warn(
      `Report email skipped (flag present: ${path.relative(projectRoot, skipEmailFlag)}). Remove the flag when ready to send.`
    );
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const airPath = path.join(reportDir, 'air-results.json');

  if (!fs.existsSync(airPath)) {
    throw new Error(
      `No ${airPath}. Run "npm run air:parse" (after a test run) first.`
    );
  }

  const air = JSON.parse(fs.readFileSync(airPath, 'utf8'));

  if (args.onlyIfClean) {
    const failed = Number(air.summary?.failed ?? 0);
    const interrupted = Number(air.summary?.interrupted ?? 0);

    if (failed > 0 || interrupted > 0) {
      console.warn(
        `Report email skipped (--only-if-clean): ${failed} failed, ${interrupted} interrupted.`
      );
      return;
    }
  }

  const { subject, html, text } = buildMessage(air, args);
  const { to, skipped } = recipientsFor(args);

  if (skipped.length) {
    console.log(`Not sending to excluded addresses: ${skipped.join(', ')}`);
  }

  const attachments = [];
  const today = new Date().toISOString().slice(0, 10);

  // 1. The AIR execution report (a single self-contained HTML file).
  // When index.html is locked open, the generator writes index-latest.html /
  // index-current.html / index-spare.html instead. Always attach the newest
  // candidate so the download matches the email body counts from air-results.json.
  const htmlRank = (file) => {
    const base = path.basename(file).toLowerCase();
    if (base === 'index.html') return 0;
    if (base === 'index-latest.html') return 1;
    if (base === 'index-current.html') return 2;
    if (base === 'index-updated.html') return 3;
    return 9;
  };

  const htmlPath = fs
    .readdirSync(reportDir)
    .filter(
      (name) =>
        /^index(-[\w]+)?\.html$/i.test(name) ||
        /^AIR-Execution-Report.*\.html$/i.test(name)
    )
    .map((name) => path.join(reportDir, name))
    .filter((file) => {
      try {
        return fs.statSync(file).isFile() && fs.statSync(file).size > 50_000;
      } catch {
        return false;
      }
    })
    .sort((a, b) => {
      const mt = fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
      // Same write burst — prefer canonical names over index-nav/spare.
      if (Math.abs(mt) < 5000) {
        return htmlRank(a) - htmlRank(b);
      }
      return mt;
    })[0];

  if (htmlPath) {
    console.log(
      `Attaching AIR HTML: ${path.basename(htmlPath)} (mtime ${fs.statSync(htmlPath).mtime.toISOString()})`
    );
    attachments.push({
      filename: `AIR-Execution-Report-${today}.html`,
      path: htmlPath
    });
  } else {
    console.warn('No AIR HTML report found under execution-report/.');
  }

  // 2. The Playwright HTML report. It is a folder (index.html plus the
  //    screenshots and traces in data/), so it is zipped; the recipient
  //    unzips it and opens index.html.
  const playwrightDir = path.join(projectRoot, 'playwright-report');

  if (fs.existsSync(path.join(playwrightDir, 'index.html'))) {
    const zipPath = path.join(
      require('os').tmpdir(),
      `Playwright-Report-${today}.zip`
    );

    fs.rmSync(zipPath, { force: true });

    const zipped = require('child_process').spawnSync(
      'tar',
      ['-a', '-c', '-f', zipPath, '-C', playwrightDir, '.'],
      { encoding: 'utf8' }
    );

    const MAX_ZIP_BYTES = 15 * 1024 * 1024;

    if (zipped.status === 0 && fs.existsSync(zipPath)) {
      if (fs.statSync(zipPath).size <= MAX_ZIP_BYTES) {
        attachments.push({
          filename: `Playwright-Report-${today}.zip`,
          path: zipPath
        });
      } else {
        // Too big for most mailboxes: send the report page without the
        // attached evidence rather than failing the email.
        console.warn('Playwright report zip is over 15 MB; sending index.html only.');
        attachments.push({
          filename: `Playwright-Report-${today}.html`,
          path: path.join(playwrightDir, 'index.html')
        });
      }
    } else {
      console.warn(`Could not zip the Playwright report: ${zipped.stderr}`);
    }
  } else {
    console.warn('No playwright-report/index.html found; Playwright report not attached.');
  }

  if (args.dryRun) {
    console.log('DRY RUN - nothing sent.');
    console.log(`To: ${to || '(not set - set REPORT_EMAIL_TO)'}`);
    console.log('Cc: (folded into To so every remaining configured address is included)');
    console.log(`Subject: ${subject}`);
    console.log(`Attachments: ${attachments.map((a) => a.filename).join(', ')}`);
    console.log(`\n${text}`);
    return;
  }

  if (!to) {
    throw new Error(
      'No recipients. Set REPORT_EMAIL_TO / REPORT_EMAIL_CC (comma separated) or pass --to.'
    );
  }

  const user = process.env.REPORT_SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.REPORT_SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      'No SMTP login. Set REPORT_SMTP_USER/REPORT_SMTP_PASS, or GMAIL_USER/GMAIL_APP_PASSWORD.'
    );
  }

  const nodemailer = require('nodemailer');
  const port = Number(process.env.REPORT_SMTP_PORT || 465);

  const transport = nodemailer.createTransport({
    host: process.env.REPORT_SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  const info = await transport.sendMail({
    from: process.env.REPORT_EMAIL_FROM || user,
    to,
    subject: args.to ? `[TEST] ${subject}` : subject,
    text,
    html,
    attachments
  });

  console.log(`Report emailed to ${to} (${info.messageId})`);
}

main().catch((error) => {
  console.error(`Email not sent: ${error.message}`);
  process.exit(1);
});
