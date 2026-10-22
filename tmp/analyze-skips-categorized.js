const fs = require('fs');
const p = 'C:/Users/BAPS/Documents/Oools_paywright/execution-report/air-results.json';
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
const skipped = (data.tests || []).filter((t) => t.status === 'skipped');

function skipAnnotation(t) {
  return (
    t.annotations?.find((a) => a.type === 'skip')
    || t.attempts?.[0]?.annotations?.find((a) => a.type === 'skip')
  );
}

function classify(t) {
  const ann = skipAnnotation(t);
  const desc = (ann?.description || t.error || '').replace(/\s+/g, ' ').trim();
  const line = ann?.location?.line;
  const file = (ann?.location?.file || '').replace(/\\/g, '/');

  if (line === 2527 || desc.includes('AIR self-validation')) return 'gate:AIR_SELF_VALIDATION';
  if (file.includes('SubscriptionLifecycleExecution') && line === 164) return 'gate:SUB_LIFECYCLE_ENV';
  if (file.includes('PlanSelectionValidation') && line === 144) return 'gate:PLAN_SELECTION_LOGIN';
  if (file.includes('UserJourneyCoverageMatrix') && line === 669) return 'gate:USER_JOURNEY_FIXTURE';
  if (file.includes('BillingSubscriptionManagement')) return 'gate:BILLING_MANAGEMENT';
  if (line === 2487) return 'gate:MATRIX_NON_AUTOMATED';
  if (line === 2590) {
    if (/Reused coverage key/i.test(desc)) return 'gate:MATRIX_COVERAGE_REUSED';
    if (/not an active paid subscriber|Free\/no-card plan/i.test(desc)) return 'gate:MATRIX_FREE_OR_UNPAID_FIXTURE';
    if (/Paid subscriber fixture has no|offers no (upgrade|downgrade|interval)/i.test(desc)) return 'gate:MATRIX_UI_CONTROL_OR_WRONG_PLAN';
    if (/cancel dialog has no|shows plain text|no support contact/i.test(desc)) return 'gate:MATRIX_UI_PRODUCT_GAP';
    return 'gate:MATRIX_COVERAGE_OTHER';
  }
  if (line === 652) return 'gate:SUB_LIFECYCLE_OTHER';
  return 'gate:OTHER';
}

function unlockable(cat, desc) {
  const d = desc.toLowerCase();
  switch (cat) {
    case 'gate:AIR_SELF_VALIDATION':
      return { unlock: true, why: 'Set AIR_SELF_VALIDATION_ENABLED=true for dedicated run only' };
    case 'gate:SUB_LIFECYCLE_ENV':
      return { unlock: true, why: 'Set SUBSCRIPTION_LIFECYCLE_EXECUTION_ENABLED=true + per-flow SUB_LIFECYCLE_* (non-destructive flags only for bulk unlock)' };
    case 'gate:PLAN_SELECTION_LOGIN':
      return { unlock: true, why: 'Refresh PLAN_SELECTION_EXISTING_EMAIL/PASSWORD or fix login' };
    case 'gate:MATRIX_FREE_OR_UNPAID_FIXTURE':
      return { unlock: true, why: 'Paid fixture now in BILLING_MANAGEMENT_EMAIL / SUB_LIFECYCLE_PAID_* — re-run matrix' };
    case 'gate:MATRIX_COVERAGE_REUSED':
      return { unlock: true, why: 'False cascade: clear coverage cache or run with fresh paid fixture so first sibling executes' };
    case 'gate:MATRIX_UI_CONTROL_OR_WRONG_PLAN':
      if (/portfolio hedger|income builder|overlay strategists/i.test(d) && /no upgrade|no downgrade|no interval/i.test(d)) {
        return { unlock: 'partial', why: 'Need fixture on correct plan/interval (paid-fix may be wrong tier); not just env' };
      }
      return { unlock: false, why: 'UI/plan state mismatch — provision scenario-specific subscriber' };
    case 'gate:BILLING_MANAGEMENT':
      return { unlock: true, why: 'BILLING_MANAGEMENT_EMAIL/PASSWORD paid user provisioned' };
    default:
      return { unlock: false, why: '' };
  }
}

const cats = new Map();
for (const t of skipped) {
  const ann = skipAnnotation(t);
  const desc = ann?.description || t.error || '';
  const cat = classify(t);
  if (!cats.has(cat)) cats.set(cat, { count: 0, unlockable: 0, partial: 0, samples: [], line: ann?.location?.line, file: ann?.location?.file });
  const c = cats.get(cat);
  c.count++;
  const u = unlockable(cat, desc);
  if (u.unlock === true) c.unlockable++;
  if (u.unlock === 'partial') c.partial++;
  if (c.samples.length < 3) c.samples.push({ file: t.file, title: t.title?.slice(0, 70) });
}

const sorted = [...cats.entries()].sort((a, b) => b[1].count - a[1].count);
let unlockEst = 0;
let partialEst = 0;
for (const [, c] of sorted) {
  unlockEst += c.unlockable;
  partialEst += c.partial;
}

console.log(JSON.stringify({ skipped: skipped.length, categories: sorted.length, unlockEst, partialEst }, null, 2));
for (const [cat, c] of sorted) {
  console.log(`\n${cat} | count=${c.count} unlock=${c.unlockable} partial=${c.partial}`);
  console.log(`  loc: ${c.file ? c.file.replace(/.*tests/, 'tests') : ''}:${c.line}`);
}

// SUB_LIFECYCLE breakdown
const subLife = skipped.filter((t) => classify(t) === 'gate:SUB_LIFECYCLE_ENV');
const flags = new Map();
for (const t of subLife) {
  const m = (skipAnnotation(t)?.description || '').match(/SUB_LIFECYCLE_[A-Z_]+/g);
  const key = m ? m[m.length - 1] : '?';
  flags.set(key, (flags.get(key) || 0) + 1);
}
console.log('\nSUB_LIFECYCLE flags:', [...flags.entries()].sort((a, b) => b[1] - a[1]));
