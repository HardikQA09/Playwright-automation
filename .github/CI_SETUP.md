# GitHub Actions — daily suite setup

Runs the Playwright complete suite every day, emails **Pankaj** + the report list, and publishes AIR when configured.

## 1. Push this repo to GitHub

Workflows live under `.github/workflows/`. Push to the repo that should own the schedule (for example `ooltool/ools-core-playwright` or `HardikQA09/Playwright-automation`).

```powershell
git remote -v
# If needed:
# git remote add ooltool https://github.com/ooltool/ools-core-playwright.git
# git push -u ooltool HEAD:main
```

## 2. Invite Pankaj (GitHub access)

1. Open the repo on GitHub → **Settings** → **Collaborators** (or org **People**).
2. Invite Pankaj’s GitHub username.
3. He can open **Actions** to see daily runs; he already receives report email via `pankaj.bhatla@ooltool.com`.

## 3. Add the `SUITE_ENV_FILE` secret

1. Repo → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**
   - Name: `SUITE_ENV_FILE`
   - Value: paste your full local `.env` (or fill `.github/ci-env.example` with real values).

Must include at least: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, fixture `*_EMAIL` / `*_PASSWORD` vars, and `REPORT_EMAIL_TO` (Pankaj is already defaulted in code).

## 4. Enable GitHub Pages (shareable AIR link)

1. Repo → **Settings** → **Pages**.
2. Source: **Deploy from a branch** → branch `gh-pages` → `/ (root)`.
3. Set in the secret `.env`:

```env
REPORT_URL=https://<owner>.github.io/<repo>/execution-report/
```

Example for the org repo:

```env
REPORT_URL=https://ooltool.github.io/ools-core-playwright/execution-report/
```

## 5. Turn on Actions and test once

1. Repo → **Actions** → enable workflows if prompted.
2. Open **Daily complete suite** → **Run workflow** → suite `complete:email`.
3. Confirm Pankaj receives the report email and the Actions run is green (or failures are real product issues).

## Schedule

| Trigger | When |
|---|---|
| Cron | Every day at **09:00 IST** (`30 3 * * *` UTC) |
| Manual | Actions → **Run workflow** |

## Local PC schedule (optional backup)

If the machine stays on, Windows Task Scheduler can also run daily:

```powershell
npm run schedule:register
```

Tasks call `run-scheduled.js` with `--email` so Pankaj still gets mail when Actions is not used.
