# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: FailedPaymentDunningMatrix.spec.ts >> Failed Payment And Dunning Use Case 8 Matrix >> SC-349 - AIR records failed payment evidence when available
- Location: tests\FailedPaymentDunningMatrix.spec.ts:490:13

# Error details

```
Error: AIR should hold executed failed-payment rows (declined or invalid card).

expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Test source

```ts
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
  329 |       expectSearchable(
  330 |         /cancel/i,
  331 |         'cancellation test rows'
  332 |       );
  333 |       return;
  334 | 
  335 |     case 'failed-payment-evidence': {
  336 |       const { latest } = loadAir();
  337 | 
  338 |       const rows =
  339 |         executedRows(
  340 |           latest.tests,
  341 |           /PaymentNegative|FailedPaymentDunning|OverlayStrategistsTrial/,
  342 |           /declin|fail|incomplete|invalid|negative/i
  343 |         );
  344 | 
  345 |       expect(
  346 |         rows.length,
  347 |         'AIR should hold executed failed-payment rows (declined or invalid card).'
> 348 |       ).toBeGreaterThan(0);
      |         ^ Error: AIR should hold executed failed-payment rows (declined or invalid card).
  349 | 
  350 |       for (const row of rows) {
  351 |         expect(
  352 |           (row.attempts?.length ?? 0) +
  353 |             (row.attachments?.length ?? 0),
  354 |           `AIR row "${row.title}" has no attempt or attachment evidence.`
  355 |         ).toBeGreaterThan(0);
  356 |       }
  357 | 
  358 |       return;
  359 |     }
  360 | 
  361 |     case 'failed-payment-trend':
  362 |       expectAreaInAirHistory(
  363 |         'failed-payment',
  364 |         /PaymentNegative|FailedPaymentDunning/
  365 |       );
  366 |       return;
  367 | 
  368 |     default:
  369 |       throw new Error(
  370 |         `Unknown AIR check "${check}".`
  371 |       );
  372 |   }
  373 | }
  374 | 
```