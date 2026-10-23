const fs = require('fs');
const path = require('path');
const ts = fs.readFileSync('tests/helpers/stripeMatrixExecution.ts', 'utf8');

// Extract inferStripeMatrixCoverageKey body and eval a JS port by using tsx? 
// Simpler: count automation patterns among automated rows.
const files = fs
  .readdirSync('tests')
  .filter((f) => f.endsWith('Matrix.spec.ts'));

let automated = 0;
let scenario = 0;
let air = 0;
let other = 0;
const otherSamples = [];
const scenarioSteps = new Set();

for (const f of files) {
  const s = fs.readFileSync(path.join('tests', f), 'utf8');
  const blocks = s.split(/\{\s*\n\s*id:/).slice(1);
  for (const block of blocks) {
    const status = block.match(/status:\s*'([^']+)'/)?.[1];
    if (status !== 'automated') continue;
    automated += 1;
    const automation = block.match(/automation:\s*'([^']+)'/)?.[1] || '';
    const title = block.match(/title:\s*'([^']+)'/)?.[1] || '';
    if (/^scenario:/.test(automation)) {
      scenario += 1;
      scenarioSteps.add(automation);
    } else if (/^air:/.test(automation)) {
      air += 1;
    } else {
      other += 1;
      if (otherSamples.length < 25) {
        otherSamples.push({ file: f, automation: automation.slice(0, 100), title: title.slice(0, 70) });
      }
    }
  }
}

console.log({ automated, scenario, uniqueScenarioSteps: scenarioSteps.size, air, other });
console.log('other samples:');
for (const s of otherSamples) console.log('-', s.file, '|', s.automation || '(none)', '|', s.title);
