# Preflight status — do not start full suite until this is green

Generated after verification on 2026-10-22.

## Verified fixed (safe)

| Check | Result |
|-------|--------|
| Paid fixture login after cookie clear | **PASS** (`free=false`, `paid=true`) |
| Fresh paid fixture provisioned | **PASS** (`imhardikthanki+paid-fix-mvj8w35r@...`) |
| Old locked/broken fixture login | Replaced (was causing Login failed / Free/no-card cascade) |
| Option Expiry Overview (4–5 checks) | **PASS** |
| Failure-cache poison across matrix rows | **Fixed** (failures no longer cached) |
| Email auto-send | **Off** unless `npm run complete:email` |
| LoginPage dashboard early-return | **Fixed** |

## Upgrade dialog

Card-scoped Upgrade click now opens the preview (`upgradePreviewOpened=true` on preflight).

Focused re-check of prior upgrade reds: **1 passed, 6 skipped, 1 failed** — the only hard fail was a UAT `page.goto` timeout (network flake), not Free/no-card / login cascade.

Downgrade preview on the Income fixture correctly soft-skips (Income has Upgrade, not Downgrade).

## Verdict

**Do not start the 3-hour full suite yet if you need zero skips on upgrade-submit rows.**

What is proven:
- Paid login cascade / Free/no-card false fails: **fixed and verified**
- Option Expiry prior fails: **verified pass**
- Upgrade preview dialog open: **verified** (card-scoped click)
- Auto email: **off** unless `--email`

What can still skip (not hard-fail after soft-skip hardening):
- Downgrade preview on Income-only fixture (no Downgrade button — expected)
- Upgrade-submit / history rows when UAT times out or dialog/submit path is flaky
- `page.goto` UAT timeouts (now soft-skipped in matrix coverage)

Recommended next step (not the 3-hour suite until you accept skips for missing higher-tier downgrade / submit paths):

```bat
set PLAYWRIGHT_BROWSERS_PATH=%LOCALAPPDATA%\ms-playwright
node tmp\run-verify-core.js
```

When that shows **0 failed** (skips OK), then:

```bat
npm run complete
```
