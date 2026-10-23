const fs = require('fs');
const path = require('path');

const files = fs
  .readdirSync('tests')
  .filter((f) => f.endsWith('Matrix.spec.ts'));

const totals = {};
const controllable = [];

for (const f of files) {
  const s = fs.readFileSync(path.join('tests', f), 'utf8');
  // Match scenario objects roughly: id/title/status/automation/dependency blocks
  const blocks = s.split(/\{\s*\n\s*id:/).slice(1);
  const by = {};
  for (const block of blocks) {
    const statusMatch = block.match(/status:\s*'([^']+)'/);
    const titleMatch = block.match(/title:\s*'([^']+)'/);
    const autoMatch = block.match(/automation:\s*'([^']+)'/);
    const depMatch = block.match(/dependency:\s*'([^']+)'/);
    const status = statusMatch?.[1] || 'unknown';
    by[status] = (by[status] || 0) + 1;
    totals[status] = (totals[status] || 0) + 1;
    if (
      (status === 'controlled' || status === 'blocked' || status === 'future') &&
      autoMatch
    ) {
      controllable.push({
        file: f,
        status,
        title: titleMatch?.[1] || '',
        automation: autoMatch[1],
        dependency: depMatch?.[1] || ''
      });
    }
  }
  console.log(f, by);
}

console.log('TOTALS', totals);
console.log('WITH_AUTOMATION_NON_AUTO', controllable.length);

// Group by automation prefix/key
const keys = {};
for (const row of controllable) {
  const key = row.automation.split(':').slice(0, 2).join(':');
  keys[key] = (keys[key] || 0) + 1;
}
console.log(
  'TOP_KEYS',
  Object.entries(keys)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
);
