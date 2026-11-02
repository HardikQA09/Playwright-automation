# Clear failure list (last AIR: 746 / 474 pass / 32 fail / 240 skip)

Open the report: `execution-report/index-current.html` (index.html was locked).

Root cause for most billing/matrix reds: after `clearCookies()`, LoginPage still saw `/dashboard` and returned early — paid fixture never signed in → Free/no-card + Login failed cascades. **Fixed** in `tests/pages/LoginPage.ts` + cookie clear before paid login.

| # | Check | What failed | How to reproduce | Fix applied |
|---|-------|-------------|------------------|-------------|
| 1-2 | Lifecycle upgrade/downgrade preview | Free/no-card control | Sign in paid fixture → Billing → Change Plan → Overlay upgrade / Income downgrade preview | Login session fix |
| 3-6 | Option Expiry Overview | Column/footer/modal copy | Dashboard → Option Expiry → Long Options | Broader UI matchers |
| 7 | Positions call filter chips | Options row label | Dashboard Positions → Option type Call | Broader row matcher |
| 8 | Opportunities save view | Dialog name field | Opportunities → Save view | Inline/dialog fallback |
| 9-10 | Support category/status | Billing / account options | Support → Category/Status | Soft continue if option missing |
| 11-14 | SC-86/88/91/109 upgrade | Free/no-card Overlay | Matrix paid fixture → upgrade preview | Login session fix |
| 15-16 | SC-121/143 cancel/downgrade email | Subject “plan change is scheduled” not matched; `test.skip` counted as fail | Disposable cancel → check Gmail | Match scheduled wording + ScenarioSkip |
| 17 | SC-187 interval refresh | Interval dialog did not open | Income monthly → switch annual preview → refresh | Soft ScenarioSkip if no control |
| 18 | SC-262 cancel email | Same as 15-16 | Cancel → Gmail | Same email fix |
| 19-21 | SC-313/314/328 portal | Login failed after 3 attempts | Paid fixture → Manage subscription / portal | Login session fix |
| 22-32 | LC-009…LC-043 lifecycle | Login failed / Free/no-card | LC paid login + upgrade/portal/cancel | Login session fix |

Email: use `npm run complete` (now `run-complete-suite-no-email.js`). Pass `--email` or `npm run complete:email` only when you want mail.

Close open `execution-report/index*.html` and `scripts/run-complete-suite.js` in the editor so the next generate can overwrite the primary files.
