# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: MonthlyAnnualBillingChangeMatrix.spec.ts >> Monthly To Annual Billing Change Use Case 5 Matrix >> SC-186 - Double-clicking annual switch confirmation is idempotent
- Location: tests\MonthlyAnnualBillingChangeMatrix.spec.ts:353:13

# Error details

```
Error: Scenario INTERVAL_DOUBLE_CLICK_MONTHLY_TO_ANNUAL could not finish its setup flow (user not created): expect(page).toHaveURL(expected) failed

Expected pattern: /\/register|\/signup|\/sign-up|\/create/
Received string:  "https://uat.ooltool.com/"
Timeout: 15000ms

Call log:
  - Expect "toHaveURL" with timeout 15000ms
    18 × unexpected value "https://uat.ooltool.com/"

```

# Test source

```ts
  2968 |             `[CANCEL_DOUBLE_CLICK] history: scheduled=${scheduled}, reverted=${reverted}`
  2969 |           );
  2970 | 
  2971 |           expect(
  2972 |             reverted,
  2973 |             'Double-clicking the final cancel button should not leave a "Cancellation reverted" entry in history.'
  2974 |           ).toBe(0);
  2975 | 
  2976 |           expect(
  2977 |             scheduled,
  2978 |             'Exactly one "Cancellation scheduled" entry should exist.'
  2979 |           ).toBe(1);
  2980 |         },
  2981 | 
  2982 |       'cancellation-recorded-once':
  2983 |         async (ctx) => {
  2984 |           await ctx.billing.expectPaidAccessWhileCancellationScheduled(
  2985 |             'Income Builder'
  2986 |           );
  2987 | 
  2988 |           await ctx.billing.validateOverview();
  2989 | 
  2990 |           await clickTab(
  2991 |             ctx.billing.historyTab
  2992 |           );
  2993 | 
  2994 |           const history =
  2995 |             await mainText(ctx);
  2996 | 
  2997 |           expect(
  2998 |             (
  2999 |               history.match(
  3000 |                 /Cancellation scheduled/gi
  3001 |               ) ?? []
  3002 |             ).length,
  3003 |             'The subscription should record one cancellation, not duplicates.'
  3004 |           ).toBeLessThanOrEqual(1);
  3005 | 
  3006 |           expect(
  3007 |             history,
  3008 |             'The cancellation must still be scheduled, not reverted by the second click.'
  3009 |           ).not.toMatch(
  3010 |             /Cancellation reverted/i
  3011 |           );
  3012 |         }
  3013 |     }
  3014 |   }
  3015 | };
  3016 | 
  3017 | /* ----------------------------------------------------------------------------
  3018 | Runner
  3019 | ---------------------------------------------------------------------------- */
  3020 | 
  3021 | const packRuns = new Map<
  3022 |   string,
  3023 |   Promise<Map<string, ScenarioOutcome>>
  3024 | >();
  3025 | 
  3026 | async function executePack(
  3027 |   scenario: ScenarioUserName,
  3028 |   page: Page
  3029 | ) {
  3030 |   const pack =
  3031 |     PACKS[scenario];
  3032 | 
  3033 |   const outcomes =
  3034 |     new Map<string, ScenarioOutcome>();
  3035 | 
  3036 |   const ctx: PackContext = {
  3037 |     scenario,
  3038 |     page,
  3039 |     email: '',
  3040 |     billing:
  3041 |       new BillingPage(page),
  3042 |     seenMessageIds:
  3043 |       new Set(),
  3044 |     requests: [],
  3045 |     state: {}
  3046 |   };
  3047 | 
  3048 |   console.log(
  3049 |     `[scenario] ${scenario}: ${SCENARIO_USERS[scenario].description}`
  3050 |   );
  3051 | 
  3052 |   try {
  3053 |     await pack.setup(ctx);
  3054 |   } catch (error) {
  3055 |     for (const stepName of Object.keys(
  3056 |       pack.steps
  3057 |     )) {
  3058 |       outcomes.set(
  3059 |         stepName,
  3060 |         error instanceof ScenarioSkip
  3061 |           ? {
  3062 |               status: 'skipped',
  3063 |               reason:
  3064 |                 `${error.reason} (user ${ctx.email || 'not created'})`
  3065 |             }
  3066 |           : {
  3067 |               status: 'failed',
> 3068 |               error: new Error(
       |                      ^ Error: Scenario INTERVAL_DOUBLE_CLICK_MONTHLY_TO_ANNUAL could not finish its setup flow (user not created): expect(page).toHaveURL(expected) failed
  3069 |                 `Scenario ${scenario} could not finish its setup flow (user ${ctx.email || 'not created'}): ${errorText(error)}`
  3070 |               )
  3071 |             }
  3072 |       );
  3073 |     }
  3074 | 
  3075 |     saveCachedPack(
  3076 |       scenario,
  3077 |       outcomes
  3078 |     );
  3079 | 
  3080 |     return outcomes;
  3081 |   }
  3082 | 
  3083 |   for (const [
  3084 |     stepName,
  3085 |     run
  3086 |   ] of Object.entries(pack.steps)) {
  3087 |     try {
  3088 |       await run(ctx);
  3089 | 
  3090 |       outcomes.set(
  3091 |         stepName,
  3092 |         { status: 'passed' }
  3093 |       );
  3094 |     } catch (error) {
  3095 |       if (
  3096 |         error instanceof ScenarioSkip
  3097 |       ) {
  3098 |         outcomes.set(
  3099 |           stepName,
  3100 |           {
  3101 |             status: 'skipped',
  3102 |             reason:
  3103 |               error.reason
  3104 |           }
  3105 |         );
  3106 |       } else {
  3107 |         console.log(
  3108 |           `[scenario] ${scenario}:${stepName} FAILED: ${errorText(error).replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').slice(0, 600)}`
  3109 |         );
  3110 | 
  3111 |         const pageText =
  3112 |           await ctx.page
  3113 |             .locator('main')
  3114 |             .innerText({
  3115 |               timeout: 3000
  3116 |             })
  3117 |             .then((text) =>
  3118 |               text
  3119 |                 .replace(/\s+/g, ' ')
  3120 |                 .slice(0, 900)
  3121 |             )
  3122 |             .catch(() => '');
  3123 | 
  3124 |         if (pageText) {
  3125 |           console.log(
  3126 |             `[scenario] ${scenario}:${stepName} page text: ${pageText}`
  3127 |           );
  3128 |         }
  3129 | 
  3130 |         outcomes.set(
  3131 |           stepName,
  3132 |           {
  3133 |             status: 'failed',
  3134 |             error
  3135 |           }
  3136 |         );
  3137 |       }
  3138 | 
  3139 |       await ctx.page.keyboard
  3140 |         .press('Escape')
  3141 |         .catch(() => undefined);
  3142 |     }
  3143 |   }
  3144 | 
  3145 |   saveCachedPack(
  3146 |     scenario,
  3147 |     outcomes
  3148 |   );
  3149 | 
  3150 |   return outcomes;
  3151 | }
  3152 | 
  3153 | /* Playwright restarts the worker after any failed test, which would lose the
  3154 |    in-memory results and make the next row create a second disposable user.
  3155 |    Results are therefore also stored per Playwright run (parent pid). */
  3156 | 
  3157 | const CACHE_MAX_AGE_MS =
  3158 |   4 * 60 * 60 * 1000;
  3159 | 
  3160 | function cacheFile(
  3161 |   scenario: string
  3162 | ) {
  3163 |   return path.join(
  3164 |     process.cwd(),
  3165 |     'test-results',
  3166 |     'scenario-cache',
  3167 |     process.env.SCENARIO_RUN_ID ??
  3168 |       String(process.ppid),
```