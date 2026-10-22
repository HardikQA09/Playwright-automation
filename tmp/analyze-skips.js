const fs = require('fs');
const p = 'C:/Users/BAPS/Documents/Oools_paywright/execution-report/air-results.json';
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
const tests = data.tests || [];
const skipped = tests.filter((t) => t.status === 'skipped');

function skipAnnotation(t) {
  return (
    t.annotations?.find((a) => a.type === 'skip')
    || t.attempts?.[0]?.annotations?.find((a) => a.type === 'skip')
  );
}

function normReason(t) {
  const ann = skipAnnotation(t);
  let desc = ann?.description || t.error || '(no reason)';
  desc = desc.replace(/\s+/g, ' ').trim();
  desc = desc.replace(/imhardikthanki\+[^\s]+@gmail\.com/g, '<EMAIL>');
  desc = desc.replace(/\b[0-9a-f]{8,}\b/gi, '<ID>');
  return desc;
}

function loc(t) {
  const ann = skipAnnotation(t);
  if (!ann?.location) return '';
  const f = ann.location.file.replace(/\\/g, '/');
  const m = f.match(/tests\/(.+)$/);
  return `${m ? `tests/${m[1]}` : f}:${ann.location.line}`;
}

const buckets = new Map();
for (const t of skipped) {
  const r = normReason(t);
  if (!buckets.has(r)) {
    buckets.set(r, { count: 0, loc: loc(t), line: skipAnnotation(t)?.location?.line, files: new Set() });
  }
  const b = buckets.get(r);
  b.count += 1;
  b.files.add(t.file);
}

const sorted = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count);
console.log(JSON.stringify({ total: tests.length, skipped: skipped.length, buckets: sorted.length }, null, 2));
for (const [r, b] of sorted) {
  console.log('\n---');
  console.log('COUNT:', b.count);
  console.log('LOC:', b.loc);
  console.log('FILES:', [...b.files].join(', '));
  console.log('REASON:', r.slice(0, 400));
}
