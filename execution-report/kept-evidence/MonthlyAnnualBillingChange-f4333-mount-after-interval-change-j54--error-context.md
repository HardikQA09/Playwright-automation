# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: MonthlyAnnualBillingChangeMatrix.spec.ts >> Monthly To Annual Billing Change Use Case 5 Matrix >> SC-180 - Invoice or receipt shows correct annual amount after interval change
- Location: tests\MonthlyAnnualBillingChangeMatrix.spec.ts:353:13

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('main')
Expected pattern: /(?:\$|USD)\s?(?:287\.10|287\.1(?:\.0+)?)(?!\d)/
Received string:  "Billing & SubscriptionManage your plan, payment methods, and billing history.OverviewPlansHistoryBilling HistorySubscription changes and Stripe invoice transactions.Subscription HistoryTransactionsSync6JE48PQC-0002paidMonthlySubscription Update · Oct 12, 2026, 11:13 AMIncludes -$2.90 credit for unused timeInvoice PDF USD 287.106JE48PQC-0001paidMonthlySubscription Create · Oct 12, 2026, 11:13 AMInvoice PDF USD 2.90Danger ZoneCancelling will end your paid plan at the end of the current billing period. You'll retain access to paid features until then.Cancel Subscription"
Timeout: 15000ms

Call log:
  - Expect "toContainText" with timeout 15000ms
  - waiting for locator('main')
    18 × locator resolved to <main class="container flex-1 px-4 py-8">…</main>
       - unexpected value "Billing & SubscriptionManage your plan, payment methods, and billing history.OverviewPlansHistoryBilling HistorySubscription changes and Stripe invoice transactions.Subscription HistoryTransactionsSync6JE48PQC-0002paidMonthlySubscription Update · Oct 12, 2026, 11:13 AMIncludes -$2.90 credit for unused timeInvoice PDF USD 287.106JE48PQC-0001paidMonthlySubscription Create · Oct 12, 2026, 11:13 AMInvoice PDF USD 2.90Danger ZoneCancelling will end your paid plan at the end of the current billing period. You'll retain access to paid features until then.Cancel Subscription"

```

# Test source

```ts
  3160 | function cacheFile(
  3161 |   scenario: string
  3162 | ) {
  3163 |   return path.join(
  3164 |     process.cwd(),
  3165 |     'test-results',
  3166 |     'scenario-cache',
  3167 |     process.env.SCENARIO_RUN_ID ??
  3168 |       String(process.ppid),
  3169 |     `${scenario}.json`
  3170 |   );
  3171 | }
  3172 | 
  3173 | function saveCachedPack(
  3174 |   scenario: string,
  3175 |   outcomes: Map<string, ScenarioOutcome>
  3176 | ) {
  3177 |   try {
  3178 |     const file =
  3179 |       cacheFile(scenario);
  3180 | 
  3181 |     fs.mkdirSync(
  3182 |       path.dirname(file),
  3183 |       { recursive: true }
  3184 |     );
  3185 | 
  3186 |     fs.writeFileSync(
  3187 |       file,
  3188 |       JSON.stringify(
  3189 |         [...outcomes.entries()].map(
  3190 |           ([step, outcome]) => ({
  3191 |             step,
  3192 |             status:
  3193 |               outcome.status,
  3194 |             reason:
  3195 |               outcome.status ===
  3196 |               'skipped'
  3197 |                 ? outcome.reason
  3198 |                 : undefined,
  3199 |             message:
  3200 |               outcome.status ===
  3201 |               'failed'
  3202 |                 ? errorText(
  3203 |                     outcome.error
  3204 |                   )
  3205 |                 : undefined
  3206 |           })
  3207 |         )
  3208 |       )
  3209 |     );
  3210 |   } catch {
  3211 |     // Cache is an optimisation only.
  3212 |   }
  3213 | }
  3214 | 
  3215 | function loadCachedPack(
  3216 |   scenario: string
  3217 | ) {
  3218 |   try {
  3219 |     const file =
  3220 |       cacheFile(scenario);
  3221 | 
  3222 |     const stat =
  3223 |       fs.statSync(file);
  3224 | 
  3225 |     if (
  3226 |       Date.now() - stat.mtimeMs >
  3227 |       CACHE_MAX_AGE_MS
  3228 |     ) {
  3229 |       return undefined;
  3230 |     }
  3231 | 
  3232 |     const rows = JSON.parse(
  3233 |       fs.readFileSync(
  3234 |         file,
  3235 |         'utf8'
  3236 |       )
  3237 |     ) as Array<{
  3238 |       step: string;
  3239 |       status: ScenarioOutcome['status'];
  3240 |       reason?: string;
  3241 |       message?: string;
  3242 |     }>;
  3243 | 
  3244 |     const outcomes =
  3245 |       new Map<string, ScenarioOutcome>();
  3246 | 
  3247 |     for (const row of rows) {
  3248 |       outcomes.set(
  3249 |         row.step,
  3250 |         row.status === 'passed'
  3251 |           ? { status: 'passed' }
  3252 |           : row.status === 'skipped'
  3253 |             ? {
  3254 |                 status: 'skipped',
  3255 |                 reason:
  3256 |                   row.reason ?? ''
  3257 |               }
  3258 |             : {
  3259 |                 status: 'failed',
> 3260 |                 error: new Error(
       |                        ^ Error: expect(locator).toContainText(expected) failed
  3261 |                   row.message ??
  3262 |                     'Scenario step failed earlier in this run.'
  3263 |                 )
  3264 |               }
  3265 |       );
  3266 |     }
  3267 | 
  3268 |     return outcomes;
  3269 |   } catch {
  3270 |     return undefined;
  3271 |   }
  3272 | }
  3273 | 
  3274 | export function isScenarioCoverageKey(
  3275 |   key: string
  3276 | ) {
  3277 |   return key.startsWith(
  3278 |     'scenario:'
  3279 |   );
  3280 | }
  3281 | 
  3282 | export async function runScenarioStep(
  3283 |   key: string,
  3284 |   page: Page
  3285 | ): Promise<ScenarioOutcome> {
  3286 |   const [
  3287 |     ,
  3288 |     scenarioName,
  3289 |     stepName
  3290 |   ] = key.split(':');
  3291 | 
  3292 |   const scenario =
  3293 |     scenarioName as ScenarioUserName;
  3294 | 
  3295 |   if (!PACKS[scenario]) {
  3296 |     return {
  3297 |       status: 'failed',
  3298 |       error: new Error(
  3299 |         `Unknown scenario "${scenarioName}" in ${key}.`
  3300 |       )
  3301 |     };
  3302 |   }
  3303 | 
  3304 |   let run =
  3305 |     packRuns.get(scenario);
  3306 | 
  3307 |   if (!run) {
  3308 |     const cached =
  3309 |       loadCachedPack(
  3310 |         scenario
  3311 |       );
  3312 | 
  3313 |     run = cached
  3314 |       ? Promise.resolve(
  3315 |           cached
  3316 |         )
  3317 |       : executePack(
  3318 |           scenario,
  3319 |           page
  3320 |         );
  3321 | 
  3322 |     packRuns.set(
  3323 |       scenario,
  3324 |       run
  3325 |     );
  3326 |   }
  3327 | 
  3328 |   const outcomes =
  3329 |     await run;
  3330 | 
  3331 |   return (
  3332 |     outcomes.get(stepName) ?? {
  3333 |       status: 'failed',
  3334 |       error: new Error(
  3335 |         `Scenario ${scenario} has no step "${stepName}".`
  3336 |       )
  3337 |     }
  3338 |   );
  3339 | }
  3340 | 
  3341 | export function listScenarioSteps() {
  3342 |   return Object.fromEntries(
  3343 |     Object.entries(PACKS).map(
  3344 |       ([name, pack]) => [
  3345 |         name,
  3346 |         Object.keys(pack.steps)
  3347 |       ]
  3348 |     )
  3349 |   );
  3350 | }
  3351 | 
```