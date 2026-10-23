const fs = require('fs');
const p = 'scripts/run-executable-headless.ps1';
let s = fs.readFileSync(p, 'utf8');

if (s.includes('CANCEL_MONTHLY_EMAIL')) {
  console.log('already patched');
  process.exit(0);
}

const needle = "$env:AIR_RESTORE_HISTORY = 'true'";
const insert = [
  needle,
  "$env:SUB_LIFECYCLE_PAID_EMAIL = 'imhardikthanki+monthly-to-a-mvjn15yr@gmail.com'",
  "$env:SUB_LIFECYCLE_PAID_PASSWORD = 'Test@123456'",
  "$env:SUB_LIFECYCLE_USE_PREPARED_USER = 'true'",
  "$env:CANCEL_YEARLY_EMAIL = 'imhardikthanki+e2e@gmail.com'",
  "$env:CANCEL_YEARLY_PASSWORD = 'H@rdik9944'",
  "$env:CANCEL_MONTHLY_EMAIL = 'imhardikthanki+monthly-to-a-mvjn15yr@gmail.com'",
  "$env:CANCEL_MONTHLY_PASSWORD = 'Test@123456'"
].join('\n');

if (!s.includes(needle)) {
  console.error('needle missing');
  process.exit(1);
}

fs.writeFileSync(p, s.replace(needle, insert));
console.log('patched');
