const d = require('../execution-report/air-results.json');
const items = d.coverageGaps.items;
const sum = {};
for (const i of items) sum[i.category] = (sum[i.category] || 0) + 1;
console.log('categories', sum);
const re = /not an active paid|Reused coverage|SUBSCRIPTION_LIFECYCLE|PLAN_SELECTION|BILLING_MANAGEMENT|Free\/no-card|AIR self-validation|Prepared plan-selection/i;
const c = items.filter((x) => re.test(x.reason || ''));
console.log('unlock pattern', c.length);
console.log('by cat', c.reduce((a, x) => { a[x.category] = (a[x.category] || 0) + 1; return a; }, {}));
