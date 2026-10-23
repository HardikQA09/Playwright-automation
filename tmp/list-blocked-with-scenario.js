const fs = require('fs');
const path = require('path');

const files = fs
  .readdirSync('tests')
  .filter((f) => f.endsWith('Matrix.spec.ts') && f !== 'UserJourneyCoverageMatrix.spec.ts');

const rows = [];
for (const f of files) {
  const s = fs.readFileSync(path.join('tests', f), 'utf8');
  const blocks = s.split(/\{\s*\n\s*id:/).slice(1);
  for (const block of blocks) {
    const status = block.match(/status:\s*'([^']+)'/)?.[1];
    const title = block.match(/title:\s*'([^']+)'/)?.[1] || '';
    const id = block.match(/^\s*'?(SC-[^',\s]+)/)?.[1] || block.match(/id:\s*'([^']+)'/)?.[1];
    // id is first line after split - recover from start
    const idLine = ('id:' + block).match(/id:\s*'([^']+)'/)?.[1];
    const automation = block.match(/automation:\s*'([^']+)'/)?.[1];
    const dependency = block.match(/dependency:\s*'([^']+)'/)?.[1] || '';
    if (!status || status === 'automated') continue;
    rows.push({
      file: f,
      id: idLine,
      status,
      title,
      automation: automation || '',
      dependency: dependency.slice(0, 120),
      hasScenario: /^scenario:/.test(automation || '')
    });
  }
}

const withScenario = rows.filter((r) => r.hasScenario);
const without = rows.filter((r) => !r.hasScenario);

console.log('blocked/future/etc', rows.length);
console.log('with scenario automation', withScenario.length);
console.log('without scenario automation', without.length);

const byScenario = {};
for (const r of withScenario) {
  const name = r.automation.split(':')[1];
  byScenario[name] = byScenario[name] || { n: 0, steps: new Set(), statuses: {} };
  byScenario[name].n += 1;
  byScenario[name].steps.add(r.automation.split(':')[2]);
  byScenario[name].statuses[r.status] = (byScenario[name].statuses[r.status] || 0) + 1;
}

console.log('\nSCENARIO PACKS ON NON-AUTO ROWS:');
for (const [name, info] of Object.entries(byScenario).sort((a, b) => b[1].n - a[1].n)) {
  console.log(name, info.n, info.statuses, [...info.steps].join(','));
}

console.log('\nSAMPLE blocked WITH scenario (first 40):');
for (const r of withScenario.slice(0, 40)) {
  console.log(`${r.id} [${r.status}] ${r.automation} :: ${r.title.slice(0, 70)}`);
}

console.log('\nSAMPLE blocked WITHOUT scenario (deps):');
const depCounts = {};
for (const r of without) {
  const key = r.dependency.split('.')[0].slice(0, 80) || '(no dep)';
  depCounts[key] = (depCounts[key] || 0) + 1;
}
console.log(
  Object.entries(depCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
);
