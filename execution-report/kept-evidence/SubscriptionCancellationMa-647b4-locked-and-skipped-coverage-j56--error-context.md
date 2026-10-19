# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: SubscriptionCancellationMatrix.spec.ts >> Subscription Cancellation Use Case 7 Matrix >> SC-299 - Cancellation matrix coverage appears in AIR blocked and skipped coverage
- Location: tests\SubscriptionCancellationMatrix.spec.ts:553:13

# Error details

```
Error: AIR should list cancellation Controlled coverage gaps; found categories: Traceability, Blocked.

expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  128 |           filePattern
  129 |         ).length > 0
  130 |     ).length;
  131 | 
  132 |   expect(
  133 |     runsWithRows,
  134 |     `${area} should appear as executed in at least two stored AIR executions to show history; found ${runsWithRows}.`
  135 |   ).toBeGreaterThanOrEqual(2);
  136 | }
  137 | 
  138 | function expectSearchable(
  139 |   pattern: RegExp,
  140 |   what: string
  141 | ) {
  142 |   const { latest } = loadAir();
  143 | 
  144 |   const hits =
  145 |     (latest.searchIndex ?? []).filter(
  146 |       (entry) =>
  147 |         entry.type === 'test' &&
  148 |         pattern.test(
  149 |           `${entry.title ?? ''} ${entry.text ?? ''}`
  150 |         )
  151 |     );
  152 | 
  153 |   expect(
  154 |     hits.length,
  155 |     `AIR search index should contain ${what}.`
  156 |   ).toBeGreaterThan(0);
  157 | }
  158 | 
  159 | type CoverageGapItem = {
  160 |   title?: string;
  161 |   file?: string;
  162 |   status?: string;
  163 |   category?: string;
  164 |   reason?: string;
  165 |   nextAction?: string;
  166 | };
  167 | 
  168 | // A matrix file's skipped rows (blocked, controlled, future) must be listed in
  169 | // AIR's coverage gaps with a reason and a next action, so nothing skipped is
  170 | // silently hidden. The AIR data is read only; nothing is written.
  171 | function matrixGapItems(
  172 |   area: string,
  173 |   filePattern: RegExp
  174 | ) {
  175 |   const { latest } = loadAir();
  176 | 
  177 |   const items = (
  178 |     (latest as {
  179 |       coverageGaps?: {
  180 |         items?: CoverageGapItem[];
  181 |       };
  182 |     }).coverageGaps?.items ?? []
  183 |   ).filter(
  184 |     (item) =>
  185 |       filePattern.test(item.file ?? '')
  186 |   );
  187 | 
  188 |   expect(
  189 |     items.length,
  190 |     `AIR coverage gaps should list the ${area} matrix rows that are blocked or skipped.`
  191 |   ).toBeGreaterThan(0);
  192 | 
  193 |   for (const item of items) {
  194 |     expect(
  195 |       (item.reason ?? '').trim().length,
  196 |       `AIR gap "${item.title}" has no reason.`
  197 |     ).toBeGreaterThan(0);
  198 | 
  199 |     expect(
  200 |       (item.nextAction ?? '').trim().length,
  201 |       `AIR gap "${item.title}" has no next action.`
  202 |     ).toBeGreaterThan(0);
  203 |   }
  204 | 
  205 |   return items;
  206 | }
  207 | 
  208 | function expectMatrixCoverageInAir(
  209 |   area: string,
  210 |   filePattern: RegExp,
  211 |   categories: string[]
  212 | ) {
  213 |   const items = matrixGapItems(
  214 |     area,
  215 |     filePattern
  216 |   );
  217 | 
  218 |   const present = new Set(
  219 |     items.map(
  220 |       (item) => item.category ?? ''
  221 |     )
  222 |   );
  223 | 
  224 |   for (const category of categories) {
  225 |     expect(
  226 |       present.has(category),
  227 |       `AIR should list ${area} ${category} coverage gaps; found categories: ${[...present].join(', ')}.`
> 228 |     ).toBeTruthy();
      |       ^ Error: AIR should list cancellation Controlled coverage gaps; found categories: Traceability, Blocked.
  229 |   }
  230 | }
  231 | 
  232 | export function runAirCheck(
  233 |   check: string
  234 | ) {
  235 |   switch (check) {
  236 |     case 'monthly-annual-gap-coverage':
  237 |       expectMatrixCoverageInAir(
  238 |         'monthly-to-annual',
  239 |         /MonthlyAnnualBillingChangeMatrix/,
  240 |         ['Blocked']
  241 |       );
  242 |       return;
  243 | 
  244 |     case 'annual-monthly-gap-coverage':
  245 |       expectMatrixCoverageInAir(
  246 |         'annual-to-monthly',
  247 |         /AnnualMonthlyBillingChangeMatrix/,
  248 |         ['Blocked']
  249 |       );
  250 |       return;
  251 | 
  252 |     case 'cancellation-gap-coverage':
  253 |       expectMatrixCoverageInAir(
  254 |         'cancellation',
  255 |         /SubscriptionCancellationMatrix/,
  256 |         ['Blocked', 'Controlled']
  257 |       );
  258 |       return;
  259 | 
  260 |     case 'failed-payment-gap-coverage':
  261 |       expectMatrixCoverageInAir(
  262 |         'failed-payment and dunning',
  263 |         /FailedPaymentDunningMatrix/,
  264 |         ['Blocked']
  265 |       );
  266 |       return;
  267 | 
  268 |     case 'lifecycle-gap-coverage': {
  269 |       expectMatrixCoverageInAir(
  270 |         'subscription lifecycle',
  271 |         /SubscriptionLifecycleE2EMatrix/,
  272 |         ['Blocked']
  273 |       );
  274 | 
  275 |       const { latest } = loadAir();
  276 | 
  277 |       const executed = executedRows(
  278 |         latest.tests,
  279 |         /SubscriptionLifecycleE2EMatrix/
  280 |       );
  281 | 
  282 |       expect(
  283 |         executed.length,
  284 |         'AIR should show executed lifecycle rows (executable coverage status).'
  285 |       ).toBeGreaterThan(0);
  286 | 
  287 |       // Known bugs surface as failed rows; each must carry its error text.
  288 |       for (const row of executed.filter(
  289 |         (item) => item.status !== 'passed'
  290 |       )) {
  291 |         expect(
  292 |           (row.error ?? '').trim().length,
  293 |           `AIR failed lifecycle row "${row.title}" (known bug) has no error text.`
  294 |         ).toBeGreaterThan(0);
  295 |       }
  296 | 
  297 |       return;
  298 |     }
  299 | 
  300 |     case 'downgrade-history':
  301 |       expectAreaInAirHistory(
  302 |         'downgrade',
  303 |         /DowngradeSubscriptionMatrix/
  304 |       );
  305 |       return;
  306 | 
  307 |     case 'monthly-to-annual-history':
  308 |       expectAreaInAirHistory(
  309 |         'monthly-to-annual',
  310 |         /MonthlyAnnualBillingChangeMatrix/
  311 |       );
  312 |       return;
  313 | 
  314 |     case 'annual-to-monthly-history':
  315 |       expectAreaInAirHistory(
  316 |         'annual-to-monthly',
  317 |         /AnnualMonthlyBillingChangeMatrix/
  318 |       );
  319 |       return;
  320 | 
  321 |     case 'cancellation-history':
  322 |       expectAreaInAirHistory(
  323 |         'cancellation',
  324 |         /SubscriptionCancellationMatrix/
  325 |       );
  326 |       return;
  327 | 
  328 |     case 'cancellation-searchable':
```