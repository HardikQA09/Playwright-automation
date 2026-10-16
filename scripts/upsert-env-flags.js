const fs = require('fs');
const path = require('path');
const flags = require('./complete-run-flags');

const envPath = path.join(process.cwd(), '.env');
const secretKeys = new Set([
  'GMAIL_APP_PASSWORD',
  'GMAIL_USER'
]);

function parseEnv(text) {
  const values = new Map();

  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '').trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    values.set(
      line.slice(0, separator).trim(),
      line.slice(separator + 1)
    );
  }

  return values;
}

const existing = fs.existsSync(envPath)
  ? parseEnv(fs.readFileSync(envPath, 'utf8'))
  : new Map();

for (const [key, value] of Object.entries(flags)) {
  existing.set(key, value);
}

const output = [...existing.entries()]
  .map(([key, value]) => `${key}=${value}`)
  .join('\n') + '\n';

fs.writeFileSync(envPath, output, 'utf8');

const applied = Object.keys(flags).sort().join(', ');
const hasGmailPassword = Boolean(
  (existing.get('GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '')
);

console.log(`Complete-run flags written to .env: ${applied}`);
console.log(
  hasGmailPassword
    ? 'Gmail App Password is present for automatic email verification.'
    : 'Gmail App Password is missing. Disposable-user email verification will skip unless EMAIL_VERIFICATION_PAUSE=true.'
);

for (const key of secretKeys) {
  if (process.env[key]) {
    continue;
  }
}
