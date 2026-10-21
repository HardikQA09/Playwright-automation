/*
 * Loads .env, then applies the Oct 12 ~550-pass complete-run flags in-process.
 * Used by npm run complete and npm run scheduled:weekly (full suite).
 */
const fs = require('fs');
const path = require('path');
const flags = require('./complete-run-flags');

function loadEnvFile(filePath) {
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

function setDefaultEnv(name, value) {
  if (!process.env[name]) {
    process.env[name] = value;
  }
}

function applyCompleteRunEnv(projectRoot = path.resolve(__dirname, '..')) {
  loadEnvFile(path.join(projectRoot, '.env'));
  loadEnvFile(path.join(projectRoot, '.env.local'));

  for (const [key, value] of Object.entries(flags)) {
    process.env[key] = value;
  }

  setDefaultEnv('AUTH_OTP_CODE', '111111');
  setDefaultEnv(
    'PLAN_SELECTION_EXISTING_EMAIL',
    'imhardikthanki+plan-selection-prepared@gmail.com'
  );
  setDefaultEnv('PLAN_SELECTION_EXISTING_PASSWORD', 'H@rdik9944');
  setDefaultEnv('ADMIN_EMAIL', 'admin@ooltool.com');
  setDefaultEnv('ADMIN_PASSWORD', 'Admin@1234!');
  setDefaultEnv(
    'REPORT_EMAIL_TO',
    [
      'pankaj.bhatla@ooltool.com',
      'syesha.sen@ooltool.com',
      'chetan.thumar@quantuminfoway.com',
      'vishal.chauhan@quantuminfoway.com',
      'hardik.thanki@quantuminfoway.com'
    ].join(',')
  );

  if (!process.env.SLOW_MO) {
    process.env.SLOW_MO = '0';
  }

  process.env.AIR_REPORT_SCOPE = process.env.AIR_REPORT_SCOPE || 'latest';
  process.env.AIR_RESTORE_HISTORY = process.env.AIR_RESTORE_HISTORY || 'true';

  return {
    hasGmail: Boolean(
      String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')
    )
  };
}

module.exports = {
  applyCompleteRunEnv,
  loadEnvFile,
  setDefaultEnv
};
