const fs = require('fs');
const p = 'tests/helpers/stripeMatrixExecution.ts';
let s = fs.readFileSync(p, 'utf8');

const start = s.indexOf('if (\n      error instanceof CoverageSkip\n    ) {');
const unpaid = s.indexOf('isPaidSubscriptionFixtureUnavailable', start);
const endNeedle = "cache: 'miss'\n      };\n    }";
const afterUnpaidBlock = s.indexOf(endNeedle, unpaid);
if (start < 0 || unpaid < 0 || afterUnpaidBlock < 0) {
  console.error('anchors not found', { start, unpaid, afterUnpaidBlock });
  process.exit(1);
}
const end = afterUnpaidBlock + endNeedle.length;

const reasonExpr =
  '`The configured billing fixture is not an active paid subscriber. ${error instanceof Error ? error.message : String(error)}`';

const replacement = [
  'if (',
  '      error instanceof CoverageSkip',
  '    ) {',
  '      const skipped: CoverageOutcome = {',
  "        status: 'skipped',",
  '        reason:',
  '          error.reason',
  '      };',
  '',
  '      // Do not cache skips — a Free/unpaid miss must not cascade as',
  '      // "Reused coverage key" across later rows after the paid fixture is ready.',
  '      return {',
  '        ...skipped,',
  "        cache: 'miss'",
  '      };',
  '    }',
  '',
  '    if (',
  '      isPaidSubscriptionFixtureUnavailable(',
  '        error',
  '      )',
  '    ) {',
  '      const skipped: CoverageOutcome = {',
  "        status: 'skipped',",
  '        reason:',
  '          ' + reasonExpr,
  '      };',
  '',
  '      return {',
  '        ...skipped,',
  "        cache: 'miss'",
  '      };',
  '    }'
].join('\n');

s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(p, s);
console.log('ok', s.includes('Do not cache skips'));
