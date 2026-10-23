const fs = require('fs');
const md = fs.readFileSync('execution-report/validation-summary.md', 'utf8');
const rows = [...md.matchAll(/\| (SKIPPED|Controlled|Blocked|Future) \| [^|]+ \| ([^|]+) \| ([^|]+) \|/g)];
const reasons = {};
for (const m of rows) {
  const kind = m[1];
  const title = m[2].trim().slice(0, 60);
  const reason = m[3].trim().slice(0, 100);
  const key = `${kind}::${reason.slice(0, 80)}`;
  reasons[key] = (reasons[key] || 0) + 1;
}
console.log('skip-like rows in summary', rows.length);
console.log(
  Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([k, n]) => `${n} ${k}`)
    .join('\n')
);
