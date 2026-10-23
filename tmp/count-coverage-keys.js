const fs = require('fs');
const path = require('path');

// Minimal port of infer key logic for scenario: and common patterns
function inferKey(automation = '', title = '') {
  const text = `${automation} ${title}`.toLowerCase();
  const scenarioMatch = automation.trim().match(/^scenario:([A-Z0-9_]+):([a-z0-9-]+)$/);
  if (scenarioMatch) return `scenario:${scenarioMatch[1]}:${scenarioMatch[2]}`;
  const airMatch = automation.trim().match(/^air:([a-z0-9-]+)$/);
  if (airMatch) return `air:${airMatch[1]}`;
  if (/matrix\.spec\.ts$/i.test(automation) && !automation.includes('>')) return 'air-traceability';
  if (/blockedscenarioexecution/i.test(automation)) return 'blocked-scenario';
  if (text.includes('danger zone keep my plan')) return 'cancel-guard';
  if (text.includes('upgrade')) return 'upgrade-related:' + automation.slice(0, 60);
  if (text.includes('downgrade')) return 'downgrade-related:' + automation.slice(0, 60);
  if (text.includes('cancel')) return 'cancel-related:' + automation.slice(0, 60);
  return 'other:' + (automation || title).slice(0, 80);
}

const files = fs
  .readdirSync('tests')
  .filter((f) => f.endsWith('Matrix.spec.ts') && !f.startsWith('UserJourney'));

const automated = [];
for (const f of files) {
  const s = fs.readFileSync(path.join('tests', f), 'utf8');
  const blocks = s.split(/\{\s*\n\s*id:/).slice(1);
  for (const block of blocks) {
    const status = block.match(/status:\s*'([^']+)'/)?.[1];
    if (status !== 'automated') continue;
    const title = block.match(/title:\s*'([^']+)'/)?.[1] || '';
    const id = ('id:' + block).match(/id:\s*'([^']+)'/)?.[1];
    const automation = block.match(/automation:\s*'([^']+)'/)?.[1] || '';
    automated.push({
      file: f,
      id,
      title,
      automation,
      key: inferKey(automation, title)
    });
  }
}

const keyCounts = {};
for (const row of automated) {
  keyCounts[row.key] = (keyCounts[row.key] || 0) + 1;
}

const unique = Object.keys(keyCounts).length;
const dupes = Object.entries(keyCounts)
  .filter(([, n]) => n > 1)
  .sort((a, b) => b[1] - a[1]);

console.log('automated rows', automated.length);
console.log('unique keys (approx)', unique);
console.log('would soft-skip as shared coverage ~', automated.length - unique);
console.log('top duplicate keys:');
for (const [k, n] of dupes.slice(0, 30)) {
  console.log(n, k);
}

const scenarioKeys = automated.filter((r) => r.automation.startsWith('scenario:'));
const scenarioUnique = new Set(scenarioKeys.map((r) => r.automation));
console.log('scenario automated rows', scenarioKeys.length, 'unique steps', scenarioUnique.size);
