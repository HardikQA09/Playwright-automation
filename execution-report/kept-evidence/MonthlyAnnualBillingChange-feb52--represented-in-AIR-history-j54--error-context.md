# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: MonthlyAnnualBillingChangeMatrix.spec.ts >> Monthly To Annual Billing Change Use Case 5 Matrix >> SC-199 - Monthly-to-annual change can be represented in AIR history
- Location: tests\MonthlyAnnualBillingChangeMatrix.spec.ts:353:13

# Error details

```
Error: AIR's latest execution has no executed monthly-to-annual rows (rows that only skip leave nothing to report). Run the monthly-to-annual rows and air:parse again.

expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Test source

```ts
  16  | AIR files read (never written):
  17  | - execution-report/air-results.json            latest parsed execution
  18  | - execution-report/history/air-history.json    stored earlier executions
  19  | ============================================================================= */
  20  | 
  21  | type AirTest = {
  22  |   title?: string;
  23  |   file?: string;
  24  |   status?: string;
  25  |   error?: string;
  26  |   attempts?: unknown[];
  27  |   attachments?: unknown[];
  28  | };
  29  | 
  30  | type AirExecution = {
  31  |   tests?: AirTest[];
  32  | };
  33  | 
  34  | const REPORT_DIR = path.join(
  35  |   process.cwd(),
  36  |   'execution-report'
  37  | );
  38  | 
  39  | function readJson<T>(
  40  |   relativePath: string
  41  | ): T {
  42  |   const file = path.join(
  43  |     REPORT_DIR,
  44  |     relativePath
  45  |   );
  46  | 
  47  |   expect(
  48  |     fs.existsSync(file),
  49  |     `AIR data file is missing: ${path.relative(process.cwd(), file)}. Run the suite and npm run air:parse first.`
  50  |   ).toBeTruthy();
  51  | 
  52  |   return JSON.parse(
  53  |     fs.readFileSync(file, 'utf8')
  54  |   ) as T;
  55  | }
  56  | 
  57  | const EXECUTED = new Set([
  58  |   'passed',
  59  |   'failed',
  60  |   'timedOut',
  61  |   'interrupted'
  62  | ]);
  63  | 
  64  | function executedRows(
  65  |   tests: AirTest[] | undefined,
  66  |   filePattern: RegExp,
  67  |   titlePattern?: RegExp
  68  | ) {
  69  |   return (tests ?? []).filter(
  70  |     (row) =>
  71  |       filePattern.test(row.file ?? '') &&
  72  |       (!titlePattern ||
  73  |         titlePattern.test(row.title ?? '')) &&
  74  |       EXECUTED.has(row.status ?? '')
  75  |   );
  76  | }
  77  | 
  78  | function loadAir() {
  79  |   const latest = readJson<{
  80  |     tests?: AirTest[];
  81  |     searchIndex?: Array<{
  82  |       type?: string;
  83  |       title?: string;
  84  |       text?: string;
  85  |     }>;
  86  |   }>('air-results.json');
  87  | 
  88  |   const history = readJson<{
  89  |     executions?: AirExecution[];
  90  |   }>('history/air-history.json');
  91  | 
  92  |   return {
  93  |     latest,
  94  |     executions: history.executions ?? []
  95  |   };
  96  | }
  97  | 
  98  | // Matrix rows for one area are present in the latest AIR run, were really
  99  | // executed, and AIR keeps earlier runs so the area can be compared over time.
  100 | function expectAreaInAirHistory(
  101 |   area: string,
  102 |   filePattern: RegExp
  103 | ) {
  104 |   const { latest, executions } =
  105 |     loadAir();
  106 | 
  107 |   const latestExecuted =
  108 |     executedRows(
  109 |       latest.tests,
  110 |       filePattern
  111 |     );
  112 | 
  113 |   expect(
  114 |     latestExecuted.length,
  115 |     `AIR's latest execution has no executed ${area} rows (rows that only skip leave nothing to report). Run the ${area} rows and air:parse again.`
> 116 |   ).toBeGreaterThan(0);
      |     ^ Error: AIR's latest execution has no executed monthly-to-annual rows (rows that only skip leave nothing to report). Run the monthly-to-annual rows and air:parse again.
  117 | 
  118 |   expect(
  119 |     executions.length,
  120 |     `AIR history should keep at least two executions to compare ${area}; it has ${executions.length}.`
  121 |   ).toBeGreaterThanOrEqual(2);
  122 | 
  123 |   const runsWithRows =
  124 |     executions.filter(
  125 |       (execution) =>
  126 |         executedRows(
  127 |           execution.tests,
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
```