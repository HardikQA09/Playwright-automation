const fs = require('fs');
const path = require('path');
const src = path.join('tests', 'pages', 'OpportunitiesPage.ts');
let s = fs.readFileSync(src, 'utf8');

const start = s.indexOf('  private savedViewsPanel() {');
const end = s.indexOf('  async openSavedView(');
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(2);
}

const replacement = `  private savedViewsPanel() {
    return this.page
      .getByRole(
        'dialog',
        {
          name: /saved views/i
        }
      )
      .or(
        this.page.getByRole(
          'alertdialog',
          {
            name: /saved views/i
          }
        )
      )
      .first();
  }

`;

s = s.slice(0, start) + replacement + s.slice(end);

const openStart = s.indexOf('  async openSavedView(');
const openEnd = s.indexOf('  async deleteSavedViews(');
if (openStart < 0 || openEnd < 0) {
  console.error('open markers not found', openStart, openEnd);
  process.exit(2);
}

const openReplacement = `  async openSavedView(
    viewName: string
  ) {
    Logger.info(
      \`Opening saved view \${viewName}\`
    );

    await safeClick(
      this.page.getByRole(
        'button',
        {
          name: /^saved views$/i
        }
      ),
      'Saved Views'
    );

    const panel =
      this.savedViewsPanel();

    await expect(
      panel
    ).toBeVisible({
      timeout: 10000
    });

    const row =
      panel
        .locator(
          'div, li, [role="listitem"], article, section'
        )
        .filter({
          hasText: viewName
        })
        .filter({
          has: this.page.getByRole(
            'button',
            {
              name: /^apply$/i
            }
          )
        })
        .first();

    await safeClick(
      row.getByRole(
        'button',
        {
          name: /^apply$/i
        }
      ),
      \`Apply \${viewName}\`
    );

    await expect(
      panel
    ).toBeHidden({
      timeout: 10000
    }).catch(
      async () => {
        await this.page.keyboard.press(
          'Escape'
        );
      }
    );

    Logger.success(
      \`Opened saved view \${viewName}\`
    );
  }

`;

s = s.slice(0, openStart) + openReplacement + s.slice(openEnd);

const dest = path.join('tmp', 'OpportunitiesPage.fixed.ts');
fs.writeFileSync(dest, s);

let lastErr;
for (let n = 0; n < 12; n += 1) {
  try {
    fs.copyFileSync(dest, src);
    console.log('patched ok');
    lastErr = null;
    break;
  } catch (err) {
    lastErr = err;
    console.log('retry', n + 1, err.code);
    require('child_process').execSync('ping -n 2 127.0.0.1 >nul');
  }
}

if (lastErr) {
  console.error(lastErr);
  process.exit(1);
}

const check = fs.readFileSync(src, 'utf8');
console.log(
  'panel name?',
  /getByRole\(\s*'dialog',\s*\{\s*name: \/saved views\/i/.test(check)
);
console.log(
  'row filter?',
  check.includes("name: /^apply$/i")
);
