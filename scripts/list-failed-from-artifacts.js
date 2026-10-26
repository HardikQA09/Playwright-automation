// Build failed-spec list from test-results/*/error-context.md
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'test-results');
const specs = new Set();
const titles = new Set();

if (!fs.existsSync(root)) {
  console.error('No test-results directory');
  process.exit(1);
}

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.') || /retry/i.test(entry.name)) {
    continue;
  }

  const file = path.join(root, entry.name, 'error-context.md');
  if (!fs.existsSync(file)) {
    continue;
  }

  const text = fs.readFileSync(file, 'utf8');
  const loc = text.match(/Location:\s*([^\n]+)/);
  const name = text.match(/Name:\s*([^\n]+)/);

  if (loc) {
    let filePath = loc[1].trim().replace(/\\/g, '/').split(':')[0];
    if (!filePath.startsWith('tests/')) {
      filePath = `tests/${filePath.replace(/^tests\//, '')}`;
    }
    if (filePath.includes('.spec.')) {
      specs.add(filePath);
    }
  }

  if (name) {
    titles.add(name[1].trim());
  }
}

const uniqueSpecs = [...specs].sort();
fs.writeFileSync(
  path.join(root, 'failed-specs.json'),
  JSON.stringify({ specs: uniqueSpecs, titles: [...titles].sort() }, null, 2)
);
console.log(uniqueSpecs.join('\n'));
console.error(`Found ${uniqueSpecs.length} unique failed specs, ${titles.size} titles`);
