const fs = require('fs');
const path = require('path');
const file = path.join('tests', 'DashboardCoverageDepth.spec.ts');
let s = fs.readFileSync(file, 'utf8');

const needle = "\n      'Simulator changes duration and keeps locked risk profiles locked',";
const idx = s.indexOf(needle);
if (idx < 0) {
  console.error('needle missing');
  process.exit(2);
}

// Ensure "    test(" precedes the Simulator title
const before = s.slice(Math.max(0, idx - 30), idx);
if (!before.includes('test(')) {
  s = s.slice(0, idx) + "\n\n    test(" + s.slice(idx);
  console.log('inserted test(');
} else {
  console.log('already has test(', JSON.stringify(before));
}

const dest = path.join('tmp', 'DashboardCoverageDepth.fixed.ts');
fs.writeFileSync(dest, s);
let lastErr;
for (let n = 0; n < 15; n += 1) {
  try {
    fs.copyFileSync(dest, file);
    console.log('ok');
    lastErr = null;
    break;
  } catch (err) {
    lastErr = err;
    require('child_process').execSync('ping -n 2 127.0.0.1 >nul');
  }
}
if (lastErr) throw lastErr;
