# Stats User Story Assessment

Review of the current Stats surface on UAT (`https://uat.ooltool.com`) as of 19 Oct 2026, plus proposed refinements, KPIs, and follow-up implementation tasks.

There is no dedicated Stats route or Beta > Stats item yet. `/dashboard/stats`, `/stats`, and `/dashboard/beta/stats` all return 404. The closest shipped surface is **Portfolio > Analytics** (`/dashboard/analytics`). This assessment treats Analytics as the current Stats stand-in.

## Current user story (as exercised)

A signed-in subscriber opens Analytics to judge portfolio health: position count, Ools Score, risk alignment, plan status, performance over a chosen range, sector mix, and concentration.

Observed on the shared plantest subscriber:

| Widget | What the user sees today | Usability note |
| --- | --- | --- |
| Total Positions | 23 | Clear, but not linked to Positions |
| Ools Score | 47 with `Profile 15/15 · Portfolio 20/20 · CC util 0/30 · CC pos n/a · CSP alloc 0/10 · CSP pos n/a` | Dense abbreviations; hard to scan |
| Risk Category | Moderate, score 5/100 | Easy to read |
| Plan | Curious, status canceled | Status language competes with the score story |
| Portfolio Performance | Range chips 1W–ALL, value + period returns, area chart | Strong; 1M empty returns show as `-` |
| Sector Allocation | Horizontal bars + % and $ | Cookie banner can cover the first bars |
| Position Concentration | Top 1 / 5 / 10, HHI, Effective N, per-symbol bars | HHI/Effective N need plain-language help |

## Bottlenecks

1. **Findability.** Stats is not in top nav. Users must already know Portfolio > Analytics. Performance was removed from the dashboard and has no Beta home yet.
2. **First paint vs. overlays.** The cookie banner sits on top of Sector Allocation and concentration rows until dismissed.
3. **Score literacy.** CC/CSP shorthand and `n/a` cells force the user to decode the score instead of reading a result.
4. **Jargon density.** HHI 3546, Effective N 2.8, and “Concentrated” appear without a one-line definition or a “what to do next” cue.
5. **Duplicate weight story.** Sector mix and Top 10 holdings both narrate concentration; the page does not say how they relate.
6. **Canceled-plan noise.** Plan status on a metrics page pulls attention away from allocation and score.
7. **Provider copy.** DELAYED explains delayed snapshots but never names the market-data provider. Internal HTML still uses `alpha_vantage`; visible copy must not regress to `AlphaVanatage`.
8. **Color language.** Asset Allocation on the dashboard uses Equity `#16a34a`, Cash `#3b82f6`, Options `#ef4444`. Analytics sector bars are a single green, so asset-type tokens are not reused on this Stats surface.

## Proposed UX refinements

1. Keep Analytics as the production Stats page, or add **Beta > Stats** that routes here until a slimmer Stats view exists.
2. Put a one-line “How to read this page” under the title: score, return, mix, concentration.
3. Expand Ools Score into labeled rows (Covered-call utilization, Cash-secured puts) with a short “why it is 47” sentence.
4. Move HHI/Effective N behind an info tip: “A few holdings drive most of the value.”
5. Dismiss or dock the cookie banner so it never covers charts.
6. Credit **Alpha Vantage** (or the current vendor) next to DELAYED.
7. Reuse the Figma asset-type tokens on any Equity / Cash / Options badges that appear on Stats.
8. Hide or soften canceled plan status unless the user opens Plan details.
9. Link Total Positions to `/dashboard` positions and Sector rows to Research.

## KPIs for the Stats experience

| KPI | Target | How to measure |
| --- | --- | --- |
| Time to first meaningful metric | < 3s after Analytics route | Heading + Ools Score or Total Positions visible |
| Score comprehension | User can name the lowest score component without hovering | Task in usability study; copy test in Playwright |
| Tooltip layout defects | 0 overlapping pie/bar hover labels | `DashboardUiStoryFixes` pie hover check |
| Provider copy accuracy | 0 `AlphaVanatage` strings; visible vendor spelled `Alpha Vantage` when shown | Analytics copy test |
| Asset-type token consistency | Pie fill === legend swatch; no two types share a hex | Palette test |
| Overlay occlusion | 0 chart pixels covered by cookie/announcement after first paint | Screenshot bounding-box check |
| Findability | ≤ 2 clicks from dashboard to Stats/Analytics | Nav test once Beta/Stats ships |
| Range control reliability | 1W, 1M, 3M, YTD, 1Y, ALL all keep the chart | Existing Analytics range test |

## Follow-up implementation sub-tasks

1. **Nav.** Add Beta menu; move OolTool Performance under it; add Stats (or keep Analytics labeled Stats in Beta).
2. **Pie hover.** Stack `value` then `category` then `%`; keep the donut total unobstructed (see failing pie hover test until this lands).
3. **Copy.** Replace any remaining `AlphaVanatage` / `alpha_vantage` user-facing strings with `Alpha Vantage`.
4. **Tokens.** Publish Figma AI asset-type colors as CSS variables and map Equity / Cash / Options on dashboard pie, breakdown bars, and badges.
5. **Stats content.** Spell out CC/CSP, add HHI helper, stop covering charts with the cookie bar.
6. **Perf.** Defer below-fold concentration until the performance chart is interactive; keep the KPI strip in the first response.
7. **QA.** Keep `tests/DashboardUiStoryFixes.spec.ts` in the daily dashboard band; flip remaining failures to passes when UAT ships the items above.

## Validation status on current UAT

| Story item | UAT result |
| --- | --- |
| Pie hover category under value, no overlap | Not met — tooltip lists Equity above `$94,537` and covers `$1.2M` |
| Performance off dashboard | Met |
| Performance under Beta | Not met — no Beta nav; `/dashboard/performance` is 404 |
| Stats assessment | This document; Analytics is the interim surface |
| `AlphaVanatage` removed | Met in visible Analytics copy |
| Visible `Alpha Vantage` label | Not shown; DELAYED tooltip is generic |
| Figma asset-type palette applied | Live tokens still Equity `#16a34a`, Cash `#3b82f6`, Options `#ef4444` (distinct and legend-matched) |
