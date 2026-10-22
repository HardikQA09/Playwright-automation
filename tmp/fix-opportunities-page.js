const fs = require('fs');
const path = require('path');
const src = path.join('tests', 'pages', 'OpportunitiesPage.ts');
const dest = path.join('tmp', 'OpportunitiesPage.fixed.ts');

let s = fs.readFileSync(src, 'utf8');

const bad =
  "const opened =\\n      await dialog.waitFor({\\n        state: 'visible',\\n        timeout: 8000\\n      }).then(\\n        () => true\\n      ).catch(\\n        () => false\\n      );";

const good = [
  'const opened =',
  '      await dialog.waitFor({',
  "        state: 'visible',",
  '        timeout: 8000',
  '      }).then(',
  '        () => true',
  '      ).catch(',
  '        () => false',
  '      );'
].join('\n');

if (!s.includes(bad)) {
  const i = s.indexOf('const opened');
  console.error('bad pattern not found. snippet:', JSON.stringify(s.slice(i, i + 250)));
  process.exit(2);
}

s = s.split(bad).join(good);
s = s.replace(
  /Saved Views panel did not open .{1,8} nothing to delete/,
  'Saved Views panel did not open - nothing to delete'
);

fs.writeFileSync(dest, s);
console.log('wrote', dest, fs.statSync(dest).size);

// Retry copy onto locked target
let lastErr;
for (let n = 0; n < 10; n += 1) {
  try {
    fs.copyFileSync(dest, src);
    console.log('copied to', src);
    lastErr = null;
    break;
  } catch (err) {
    lastErr = err;
    console.log('copy retry', n + 1, err.code);
    require('child_process').execSync('ping -n 2 127.0.0.1 >nul');
  }
}

if (lastErr) {
  console.error('could not overwrite target', lastErr);
  process.exit(1);
}

const i = fs.readFileSync(src, 'utf8').indexOf('const opened =');
console.log('verify:', JSON.stringify(fs.readFileSync(src, 'utf8').slice(i, i + 180)));
