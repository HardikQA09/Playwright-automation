const fs = require('fs');
const path = require('path');

function replaceSendEmail(c, flagExpr) {
  return c
    .replace(
      / \* Report email is OFF by default\. Pass --email or SEND_REPORT_EMAIL=true\r?\n \* only when you want REPORT_EMAIL_\* recipients notified\./,
      ' * Report email is OFF by default. Pass --email only when you want it sent.\n * SEND_REPORT_EMAIL in the environment is ignored so scheduled/.env flags\n * cannot accidentally email the whole recipient list.'
    )
    .replace(
      / \* Report email is OFF by default\. Pass --email \(or SEND_REPORT_EMAIL=true\)\r?\n \* when you want recipients notified after the run\./,
      ' * Report email is OFF by default. Pass --email only when you want recipients notified.'
    )
    .replace(
      /const sendEmail =\r?\n  (?:argv\.includes|cliFlags\.has)\('--email'\) \|\|\r?\n  \['1', 'true', 'yes', 'on'\]\.includes\(\r?\n    String\(process\.env\.SEND_REPORT_EMAIL \|\| ''\)\.toLowerCase\(\)\r?\n  \);/,
      `delete process.env.SEND_REPORT_EMAIL;\nconst sendEmail = ${flagExpr};`
    )
    .replace(
      'Pass --email or set SEND_REPORT_EMAIL=true when you want it sent.',
      'Pass --email when you want it sent.'
    );
}

function safeReplace(file, flagExpr) {
  const c = replaceSendEmail(fs.readFileSync(file, 'utf8'), flagExpr);
  const tmp = file + '.email-off.tmp';
  fs.writeFileSync(tmp, c);
  try {
    fs.copyFileSync(tmp, file);
    fs.unlinkSync(tmp);
    console.log('patched in place', file);
  } catch (error) {
    console.warn('locked, left patch at', tmp, String(error.message || error).slice(0, 120));
  }
  console.log('has delete?', /delete process\.env\.SEND_REPORT_EMAIL/.test(c));
}

const root = path.resolve(__dirname, '..');
safeReplace(path.join(root, 'scripts', 'run-complete-suite.js'), "argv.includes('--email')");
safeReplace(path.join(root, 'scripts', 'run-scheduled.js'), "cliFlags.has('--email')");
