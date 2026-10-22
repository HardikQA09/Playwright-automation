const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/Users/BAPS/Documents/Oools_paywright/execution-report/air-results.json', 'utf8'));
const skipped = (data.tests || []).filter((t) => t.status === 'skipped');

function ann(t) {
  return t.annotations?.find((a) => a.type === 'skip') || t.attempts?.[0]?.annotations?.find((a) => a.type === 'skip');
}

const nonAuto = skipped.filter((t) => ann(t)?.location?.line === 2487);
const buckets = new Map();
for (const t of nonAuto) {
  let d = ann(t)?.description || '';
  const prefix = d.split('.')[0].slice(0, 80);
  buckets.set(prefix, (buckets.get(prefix) || 0) + 1);
}
console.log('non-automated', nonAuto.length);
[...buckets.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(v, k));
