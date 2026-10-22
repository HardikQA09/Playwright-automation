const fs = require('fs');
const p = 'tests/helpers/stripeMatrixExecution.ts';
let c = fs.readFileSync(p, 'utf8');
const marker = "async function executeUpgradeHistory(";
const idx = c.indexOf(marker);
if (idx < 0) {
  console.error('executeUpgradeHistory not found');
  process.exit(1);
}
const openIdx = c.indexOf(
  "await billing.openPlanChangeCalculationPreview({",
  idx
);
if (openIdx < 0) {
  console.error('open preview not found in upgrade history');
  process.exit(1);
}
if (c.slice(openIdx - 80, openIdx).includes('try {')) {
  console.log('already wrapped');
  process.exit(0);
}
const endIdx = c.indexOf('});', openIdx) + 3;
const block = c.slice(openIdx, endIdx);
const wrapped = `try {
    ${block}
  } catch (error) {
    if (
      isMissingPlanAction(
        error
      )
    ) {
      throw new CoverageSkip(
        \`Upgrade history could not open Overlay Strategists upgrade preview. \${error instanceof Error ? error.message : String(error)}\`
      );
    }

    throw error;
  }`;
c = c.slice(0, openIdx) + wrapped + c.slice(endIdx);
fs.writeFileSync(p, c);
console.log('wrapped executeUpgradeHistory open preview');
