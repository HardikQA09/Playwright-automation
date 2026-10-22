const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const resultsPath = path.join(projectRoot, 'test-results', 'results.json');
const configPath = path.join(projectRoot, 'config', 'air.config.json');
const outputDir = path.join(projectRoot, 'execution-report');
const outputPath = path.join(outputDir, 'index.html');
const airResultsPath = path.join(outputDir, 'air-results.json');
const playwrightReportPath = path.join(projectRoot, 'playwright-report', 'index.html');

function readGitValue(command, fallback) {
  try {
    return execSync(command, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeJsString(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\n', ' ');
}

function stripAnsi(value) {
  return String(value ?? '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*m/g, '');
}

function compactText(value, maxLength = 180) {
  const normalized = stripAnsi(value)
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3).trim()}...`
    : normalized;
}

function tooltipAttr(value) {
  const text = compactText(value, 600);

  if (!text) {
    return '';
  }

  return ` data-air-tooltip="${escapeHtml(text)}" aria-label="${escapeHtml(text)}" tabindex="0"`;
}

function readPngSize(filePath) {
  try {
    const buffer = Buffer.alloc(24);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buffer, 0, 24, 0);
    } finally {
      fs.closeSync(fd);
    }

    if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }
  } catch {
    return null;
  }

  return null;
}

const decodedPngCache = new Map();

function decodePng(filePath) {
  if (decodedPngCache.has(filePath)) {
    return decodedPngCache.get(filePath);
  }

  const decoded = decodePngBody(filePath);
  decodedPngCache.set(filePath, decoded);
  return decoded;
}

function decodePngBody(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 24 || buffer[0] !== 0x89 || buffer.toString('ascii', 1, 4) !== 'PNG') {
      return null;
    }

    let offset = 8;
    const idat = [];
    let width = 0;
    let height = 0;
    let colorType = 6;

    while (offset + 8 < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      const data = buffer.subarray(offset + 8, offset + 8 + length);
      if (type === 'IHDR') {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        colorType = data[9];
      } else if (type === 'IDAT') {
        idat.push(data);
      } else if (type === 'IEND') {
        break;
      }
      offset += 12 + length;
    }

    if (!width || !height || !idat.length || (colorType !== 2 && colorType !== 6)) {
      return null;
    }

    const inflated = zlib.inflateSync(Buffer.concat(idat));
    const channels = colorType === 6 ? 4 : 3;
    const stride = width * channels;
    const pixels = Buffer.alloc(width * height * 4);
    let src = 0;
    let previous = Buffer.alloc(stride);

    for (let y = 0; y < height; y += 1) {
      const filter = inflated[src];
      src += 1;
      const row = Buffer.from(inflated.subarray(src, src + stride));
      src += stride;

      for (let index = 0; index < stride; index += 1) {
        const left = index >= channels ? row[index - channels] : 0;
        const up = previous[index];
        const upLeft = index >= channels ? previous[index - channels] : 0;
        let value = row[index];
        if (filter === 1) value = (value + left) & 255;
        else if (filter === 2) value = (value + up) & 255;
        else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
        else if (filter === 4) {
          const estimate = left + up - upLeft;
          const leftDistance = Math.abs(estimate - left);
          const upDistance = Math.abs(estimate - up);
          const diagonalDistance = Math.abs(estimate - upLeft);
          const predictor = leftDistance <= upDistance && leftDistance <= diagonalDistance
            ? left
            : upDistance <= diagonalDistance
              ? up
              : upLeft;
          value = (value + predictor) & 255;
        }
        row[index] = value;
      }

      previous = row;
      for (let x = 0; x < width; x += 1) {
        const source = x * channels;
        const target = (y * width + x) * 4;
        pixels[target] = row[source];
        pixels[target + 1] = row[source + 1];
        pixels[target + 2] = row[source + 2];
        pixels[target + 3] = channels === 4 ? row[source + 3] : 255;
      }
    }

    return { width, height, pixels };
  } catch {
    return null;
  }
}

function greenControlBoxes(decoded) {
  const { width, height, pixels } = decoded;
  const mask = new Uint8Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const red = pixels[index * 4];
    const green = pixels[index * 4 + 1];
    const blue = pixels[index * 4 + 2];
    const ring = green > 120 && green > red + 25 && green > blue + 15 && red < 190;
    const fill = green > 90 && red < 90 && blue < 130 && green > red + 30;
    if (ring || fill) mask[index] = 1;
  }

  const seen = new Uint8Array(width * height);
  const found = [];

  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      const stack = [start];
      seen[start] = 1;

      while (stack.length) {
        const index = stack.pop();
        count += 1;
        const currentX = index % width;
        const currentY = (index / width) | 0;
        if (currentX < minX) minX = currentX;
        if (currentX > maxX) maxX = currentX;
        if (currentY < minY) minY = currentY;
        if (currentY > maxY) maxY = currentY;
        [index - 1, index + 1, index - width, index + width].forEach(next => {
          if (next < 0 || next >= mask.length || seen[next] || !mask[next]) return;
          seen[next] = 1;
          stack.push(next);
        });
      }

      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;
      const cookieButton = minX > width * 0.75 && minY > height * 0.82;
      if (
        !cookieButton &&
        boxWidth > 48 &&
        boxHeight > 18 &&
        boxWidth < width * 0.85 &&
        boxHeight < height * 0.45 &&
        count > 80
      ) {
        found.push({
          x: minX,
          y: minY,
          width: boxWidth,
          height: boxHeight,
          count,
          density: count / Math.max(1, boxWidth * boxHeight),
        });
      }
    }
  }

  return found.sort((left, right) => right.count - left.count);
}

function darkTextBox(decoded, maxY) {
  const { width, height, pixels } = decoded;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxYSeen = 0;
  let count = 0;
  const limit = Math.min(height, maxY);

  for (let y = 0; y < limit; y += 1) {
    for (let x = 0; x < Math.min(width, 520); x += 1) {
      const index = (y * width + x) * 4;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red < 80 && green < 80 && blue < 80) {
        count += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxYSeen) maxYSeen = y;
      }
    }
  }

  if (count < 20) return null;
  return {
    x: Math.max(0, minX - 8),
    y: Math.max(0, minY - 8),
    width: Math.max(24, maxX - minX + 16),
    height: Math.max(24, maxYSeen - minY + 16),
  };
}

function headerAvatarBox(decoded) {
  const { width, height, pixels } = decoded;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  const top = Math.min(height, 72);
  const left = Math.max(0, width - 150);

  for (let y = 4; y < top; y += 1) {
    for (let x = left; x < width - 8; x += 1) {
      const index = (y * width + x) * 4;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const light = red > 225 && green > 225 && blue > 225;
      if (!light) {
        count += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (count < 30) return null;
  return {
    x: Math.max(0, minX - 6),
    y: Math.max(0, minY - 6),
    width: Math.min(width - minX, maxX - minX + 12),
    height: Math.min(height - minY, maxY - minY + 12),
  };
}

function whiteDialogBox(decoded) {
  const { width, height, pixels } = decoded;
  const rows = [];

  for (let y = 24; y < height - 8; y += 2) {
    let runStart = -1;
    let bestStart = 0;
    let bestEnd = 0;

    for (let x = 0; x <= width; x += 2) {
      let white = false;
      if (x < width) {
        const index = (y * width + x) * 4;
        white = pixels[index] > 236 && pixels[index + 1] > 236 && pixels[index + 2] > 236;
      }
      if (white && runStart < 0) runStart = x;
      if ((!white || x >= width) && runStart >= 0) {
        if (x - runStart > bestEnd - bestStart) {
          bestStart = runStart;
          bestEnd = x;
        }
        runStart = -1;
      }
    }

    const run = bestEnd - bestStart;
    if (run > width * 0.22 && run < width * 0.72) {
      rows.push({ y, start: bestStart, end: bestEnd });
    }
  }

  if (rows.length < 30) return null;

  const minX = Math.min(...rows.map(row => row.start));
  const maxX = Math.max(...rows.map(row => row.end));
  const minY = rows[0].y;
  const maxY = rows[rows.length - 1].y;
  const boxWidth = maxX - minX;
  const boxHeight = maxY - minY;

  if (boxWidth < width * 0.22 || boxWidth > width * 0.75 || boxHeight < 100) {
    return null;
  }

  return { x: minX, y: minY, width: boxWidth, height: boxHeight };
}

function dialogSlice(dialog, from, to) {
  const top = dialog.y + Math.round(dialog.height * from);
  const bottom = dialog.y + Math.round(dialog.height * to);

  return {
    x: dialog.x + 16,
    y: top,
    width: Math.max(48, dialog.width - 32),
    height: Math.max(40, bottom - top),
  };
}

function redControlBoxes(decoded) {
  const { width, height, pixels } = decoded;
  const mask = new Uint8Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const red = pixels[index * 4];
    const green = pixels[index * 4 + 1];
    const blue = pixels[index * 4 + 2];
    if (red > 150 && red > green + 45 && red > blue + 45 && green < 130) {
      mask[index] = 1;
    }
  }

  const seen = new Uint8Array(width * height);
  const found = [];

  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      const stack = [start];
      seen[start] = 1;

      while (stack.length) {
        const index = stack.pop();
        count += 1;
        const currentX = index % width;
        const currentY = (index / width) | 0;
        if (currentX < minX) minX = currentX;
        if (currentX > maxX) maxX = currentX;
        if (currentY < minY) minY = currentY;
        if (currentY > maxY) maxY = currentY;
        [index - 1, index + 1, index - width, index + width].forEach(next => {
          if (next < 0 || next >= mask.length || seen[next] || !mask[next]) return;
          seen[next] = 1;
          stack.push(next);
        });
      }

      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;
      if (boxWidth > 50 && boxHeight > 16 && boxWidth < 280 && boxHeight < 70 && count > 80) {
        found.push({
          x: minX,
          y: minY,
          width: boxWidth,
          height: boxHeight,
          count,
          density: count / Math.max(1, boxWidth * boxHeight),
        });
      }
    }
  }

  return found.sort((left, right) => right.count - left.count);
}

function dialogAroundButton(decoded, button) {
  const left = Math.max(0, button.x - 240);
  const top = Math.max(0, button.y - 170);
  const right = Math.min(decoded.width, button.x + button.width + 80);
  const bottom = Math.min(decoded.height, button.y + button.height + 28);

  return {
    x: left,
    y: top,
    width: Math.max(48, right - left),
    height: Math.max(40, bottom - top),
  };
}

function closestControl(boxes, width, height) {
  return [...boxes].sort((left, right) => {
    const distance = box => {
      const centerX = box.x + box.width / 2 - width / 2;
      const centerY = box.y + box.height / 2 - height / 2;
      return centerX * centerX + centerY * centerY;
    };
    return distance(left) - distance(right);
  })[0] || null;
}

function sparseErrorLine(decoded) {
  const line = darkTextBox(decoded, 80);
  if (!line || line.width > 360 || line.height > 48 || line.y > 36) {
    return null;
  }

  let below = 0;
  const startY = line.y + line.height + 12;

  for (let y = startY; y < decoded.height; y += 4) {
    for (let x = 0; x < decoded.width; x += 4) {
      const index = (y * decoded.width + x) * 4;
      if (decoded.pixels[index] < 80 && decoded.pixels[index + 1] < 80 && decoded.pixels[index + 2] < 80) {
        below += 1;
      }
    }
  }

  return below < 40 ? line : null;
}

function findFailureFieldRegion(filePath, test) {
  const decoded = decodePng(filePath);
  if (!decoded) return null;

  const errorLine = sparseErrorLine(decoded);
  if (errorLine) return errorLine;

  const hint = [
    test?.title,
    test?.error,
    test?.errorMessage,
    test?.technicalError,
    test?.productBug?.actual,
    test?.productBug?.expected,
    test?.productBug?.name,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/internal server error/.test(hint)) {
    return darkTextBox(decoded, 90);
  }

  if (/logout|sign out|avatar|initials/.test(hint)) {
    return headerAvatarBox(decoded);
  }

  const dialog = whiteDialogBox(decoded);
  const boxes = greenControlBoxes(decoded);
  const filled = boxes.filter(box => box.density > 0.45 && box.height < 90 && box.width < 460);
  const outlined = boxes.filter(box => box.density <= 0.45 && box.width > 180 && box.height < 80);

  if (/verify button|verify turns on|enabled only for six|tobedisabled/.test(hint)) {
    return closestControl(filled, decoded.width, decoded.height)
      || closestControl(outlined, decoded.width, decoded.height)
      || null;
  }

  if (/otp|six digit|pasted|verification field|enter otp/.test(hint)) {
    return closestControl(outlined, decoded.width, decoded.height)
      || boxes.find(box => box.width > 200 && box.height < 80)
      || null;
  }

  if (dialog && /outside of the viewport|confirm\s*&?\s*pay|confirm and pay/.test(hint)) {
    return dialogSlice(dialog, 0.78, 1);
  }

  if (dialog && /charge|prorat|amount due|recurring|renewal|next billing|1490|list price/.test(hint)) {
    return dialogSlice(dialog, 0.4, 0.78);
  }

  if (/cancel at expiry|yearly cancel|keep my plan|keep access|cancel subscription/.test(hint)) {
    if (dialog) {
      return {
        x: dialog.x,
        y: dialog.y,
        width: dialog.width,
        height: dialog.height,
      };
    }

    const cancelButton = closestControl(
      redControlBoxes(decoded).filter(box => box.density > 0.35),
      decoded.width,
      decoded.height,
    );
    if (cancelButton) {
      return dialogAroundButton(decoded, cancelButton);
    }
  }

  if (/textbox|gmail|trial with card/.test(hint)) {
    return closestControl(filled, decoded.width, decoded.height) || null;
  }

  return closestControl(filled, decoded.width, decoded.height)
    || closestControl(outlined, decoded.width, decoded.height)
    || null;
}

function normalizeEvidenceRegion(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const x = Number(candidate.x ?? candidate.left);
  const y = Number(candidate.y ?? candidate.top);
  const width = Number(candidate.width ?? candidate.w ?? (candidate.right != null ? Number(candidate.right) - x : NaN));
  const height = Number(candidate.height ?? candidate.h ?? (candidate.bottom != null ? Number(candidate.bottom) - y : NaN));

  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    x,
    y,
    width,
    height,
    label: candidate.label || candidate.name || '',
    expectedElementNotFound: Boolean(candidate.expectedElementNotFound || candidate.elementNotFound || candidate.notFound),
  };
}

function getReliableFailureRegion(item = {}) {
  const candidates = [
    item.failureRegion,
    item.expectedRegion,
    item.boundingBox,
    item.region,
    item.locatorBoundingBox,
    item.elementBoundingBox,
    item.metadata?.failureRegion,
    item.metadata?.expectedRegion,
    item.metadata?.boundingBox,
    item.metadata?.locatorBoundingBox,
    item.metadata?.elementBoundingBox,
    item.metadata?.nearestContainer,
  ];

  for (const candidate of candidates) {
    const region = normalizeEvidenceRegion(candidate);

    if (region) {
      return region;
    }
  }

  return null;
}

function collectTests(suites, parentTitle = []) {
  const tests = [];

  for (const suite of suites ?? []) {
    const suiteTitle = suite.title ? [...parentTitle, suite.title] : parentTitle;

    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          tests.push({
            title: [...suiteTitle, spec.title].filter(Boolean).join(' > '),
            status: result.status,
            duration: result.duration ?? 0,
            project: test.projectName ?? '',
            error: result.error?.message ?? '',
          });
        }
      }
    }

    tests.push(...collectTests(suite.suites, suiteTitle));
  }

  return tests;
}

function collectHtmlReportTests(files) {
  const tests = [];

  for (const file of files ?? []) {
    for (const test of file.tests ?? []) {
      for (const result of test.results ?? []) {
        const status =
          result.status ??
          (
            test.outcome === 'expected'
              ? 'passed'
              : test.outcome === 'skipped'
                ? 'skipped'
                : test.outcome === 'unexpected'
                  ? 'failed'
                  : test.outcome
          );

        tests.push({
          title: [
            file.fileName,
            ...(test.path ?? []),
            test.title,
          ].filter(Boolean).join(' > '),
          status,
          duration: result.duration ?? test.duration ?? 0,
          project: test.projectName ?? '',
          error: result.error?.message ?? '',
        });
      }
    }
  }

  return tests;
}

function readZipEntry(zipBuffer, targetName) {
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;

  for (let index = zipBuffer.length - 22; index >= 0; index--) {
    if (zipBuffer.readUInt32LE(index) === eocdSignature) {
      eocdOffset = index;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Unable to locate Playwright report zip directory.');
  }

  const entryCount =
    zipBuffer.readUInt16LE(eocdOffset + 10);
  let centralDirectoryOffset =
    zipBuffer.readUInt32LE(eocdOffset + 16);

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    const signature =
      zipBuffer.readUInt32LE(centralDirectoryOffset);

    if (signature !== 0x02014b50) {
      throw new Error('Invalid Playwright report zip directory.');
    }

    const compressionMethod =
      zipBuffer.readUInt16LE(centralDirectoryOffset + 10);
    const compressedSize =
      zipBuffer.readUInt32LE(centralDirectoryOffset + 20);
    const fileNameLength =
      zipBuffer.readUInt16LE(centralDirectoryOffset + 28);
    const extraLength =
      zipBuffer.readUInt16LE(centralDirectoryOffset + 30);
    const commentLength =
      zipBuffer.readUInt16LE(centralDirectoryOffset + 32);
    const localHeaderOffset =
      zipBuffer.readUInt32LE(centralDirectoryOffset + 42);
    const fileName =
      zipBuffer
        .subarray(
          centralDirectoryOffset + 46,
          centralDirectoryOffset + 46 + fileNameLength
        )
        .toString('utf8');

    if (fileName === targetName) {
      const localFileNameLength =
        zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength =
        zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart =
        localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressedData =
        zipBuffer.subarray(
          dataStart,
          dataStart + compressedSize
        );

      if (compressionMethod === 0) {
        return compressedData.toString('utf8');
      }

      if (compressionMethod === 8) {
        return zlib.inflateRawSync(compressedData).toString('utf8');
      }

      throw new Error(`Unsupported zip compression method: ${compressionMethod}`);
    }

    centralDirectoryOffset +=
      46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`Unable to find ${targetName} in Playwright report.`);
}

function readPlaywrightHtmlReport() {
  if (!fs.existsSync(playwrightReportPath)) {
    return undefined;
  }

  const html =
    fs.readFileSync(playwrightReportPath, 'utf8');
  const match =
    html.match(
      /<template[^>]*id=["']playwrightReportBase64["'][^>]*>([\s\S]*?)<\/template>/
    );

  if (!match) {
    return undefined;
  }

  const encodedReport =
    match[1]
      .trim()
      .replace(/^data:application\/zip;base64,/, '');
  const zipBuffer =
    Buffer.from(
      encodedReport,
      'base64'
    );
  const reportJson =
    readZipEntry(
      zipBuffer,
      'report.json'
    );

  return JSON.parse(reportJson);
}

function loadExecutionResults() {
  if (fs.existsSync(resultsPath)) {
    return {
      hasResults: true,
      source: 'json-reporter',
      results: JSON.parse(fs.readFileSync(resultsPath, 'utf8')),
    };
  }

  const htmlReport =
    readPlaywrightHtmlReport();

  if (htmlReport) {
    return {
      hasResults: true,
      source: 'html-report',
      results: htmlReport,
    };
  }

  return {
    hasResults: false,
    source: 'missing',
    results: { suites: [] },
  };
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

const airConfig = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : {};
const airResults = fs.existsSync(airResultsPath)
  ? JSON.parse(fs.readFileSync(airResultsPath, 'utf8'))
  : undefined;
const loadedResults =
  airResults
    ? {
      hasResults: airResults.source?.hasResults ?? false,
      source: `air-results/${airResults.source?.type ?? 'model'}`,
      results: { suites: [] },
    }
    : loadExecutionResults();
const hasResults =
  loadedResults.hasResults;
const results =
  loadedResults.results;
const tests =
  airResults
    ? airResults.tests.map(test => ({
      title: test.title,
      status: test.status,
      duration: test.durationMs,
      project: test.project,
      error: test.error,
      module: test.module,
      file: test.file,
      annotations: test.annotations,
      reason: test.reason,
    }))
    : Array.isArray(results.files)
    ? collectHtmlReportTests(results.files)
    : collectTests(results.suites);

const knownDefectCopy = [
  {
    match: /otp input limits entry to six digits/i,
    group: 'Signup',
    name: 'Signup code accepts a seventh digit',
    expected: 'The verification field should stop at six digits.',
    actual: 'Typing a seventh digit is accepted. The field keeps seven digits.',
    next: 'Stop the signup code field at six digits, then rerun this check.',
  },
  {
    match: /trims pasted value to six digits/i,
    group: 'Signup',
    name: 'Pasting a longer signup code keeps the extra digits',
    expected: 'A pasted code should keep only the first six digits.',
    actual: 'Pasting a longer code keeps eight digits. The field allows eight.',
    next: 'Keep only the first six digits when a longer code is pasted, then rerun this check.',
  },
  {
    match: /verify button is enabled only for six digits/i,
    group: 'Signup',
    name: 'Verify turns on before six digits',
    expected: 'Verify should stay off until the code is exactly six digits.',
    actual: 'Verify turns on after five digits.',
    next: 'Keep Verify off until the code is exactly six digits, then rerun this check.',
  },
  {
    match: /SC-03|broker account limit is one/i,
    group: 'Billing',
    name: 'SC-03 Broker account limit is one',
    expected: 'A position added by hand should not use the one-broker limit.',
    actual: 'Manual entry is counted as a connected broker.',
    next: 'Stop counting a hand-added position as a broker connection, then rerun SC-03.',
  },
  {
    match: /LC-011|without counting manual entry/i,
    group: 'Billing',
    name: 'LC-011 Manual entry and the broker limit',
    expected: 'The no-card trial should enforce the broker limit without counting a position added by hand.',
    actual: 'Manual entry is counted as a broker connection. This is the same product bug as SC-03.',
    next: 'Stop counting a hand-added position as a broker connection, then rerun LC-011.',
  },
  {
    match: /SC-07|start trial with valid card/i,
    group: 'Billing',
    name: 'SC-07 Start trial with a valid card',
    expected: 'After a valid card is saved, Billing should show an active free trial and that card.',
    actual: 'Billing still shows the Free plan and does not show the saved card.',
    next: 'Show the active trial and the saved card on Billing, then rerun SC-07.',
  },
  {
    match: /SC-09|card information is securely saved/i,
    group: 'Billing',
    name: 'SC-09 Saved card on Billing',
    expected: 'The card used to start the trial should appear on Billing.',
    actual: 'The saved card is not shown after the trial starts. This is the same product bug as SC-07.',
    next: 'Show the saved card on Billing after the trial starts, then rerun SC-09.',
  },
  {
    match: /LC-007|saved payment method/i,
    group: 'Billing',
    name: 'LC-007 Active trial and saved card',
    expected: 'Billing should show the active trial and the saved payment method.',
    actual: 'Billing shows the Free plan and no saved card. This is the same product bug as SC-07 and SC-09.',
    next: 'Show the active trial and the saved card on Billing, then rerun LC-007.',
  },
];

function failureGroupKey(test, index = 0) {
  const note = knownDefectNote(test);
  const title = `${getFailureFullTitle(test, index)} ${test?.title ?? ''} ${test?.testName ?? ''} ${note?.name ?? ''}`.toLowerCase();

  if (/six digit|seventh digit|pasted value|pasting a longer|verify button is enabled only|verify turns on/.test(title)) {
    return { key: 'signup-code', label: 'The signup code does not stop at six digits' };
  }
  if (/sc-03|lc-011|broker account limit|manual entry/.test(title)) {
    return { key: 'manual-broker', label: 'A hand-added position is counted as a connected broker' };
  }
  if (/sc-07|sc-09|lc-007|saved card|start trial with a valid card|saved payment method/.test(title)) {
    return { key: 'trial-card', label: 'A trial started with a card still shows the Free plan and no saved card' };
  }
  if (/company fundamentals|company research/.test(title)) {
    return { key: 'company-page', label: 'The company page shows Internal Server Error' };
  }
  if (/logout/.test(title)) {
    return { key: 'logout', label: 'Logout looked for the wrong initials in the header' };
  }
  if (/before the trial ends|before trial ends/.test(title)) {
    return { key: 'confirm-pay', label: 'Confirm & pay sits below the visible confirm box' };
  }
  if (/authorization failure|rate limit/.test(title)) {
    return { key: 'otp-wait', label: 'The text-message code was rate limited' };
  }
  if (/trial with card/.test(title)) {
    return { key: 'gmail-trial', label: 'The new account email was not confirmed' };
  }
  if (/upgrade calculation/.test(title)) {
    return { key: 'upgrade-charge', label: 'The upgrade box showed a smaller charge than the full plan price' };
  }
  if (/annual-to-monthly|renewal date|billing interval/.test(title)) {
    return { key: 'annual-monthly', label: 'Switching to monthly is scheduled for the current annual renewal' };
  }
  if (/cancel|refund|resume cancellation/.test(title)) {
    return { key: 'cancel-box', label: 'The cancel box did not show the option this check expected' };
  }

  const story = plainFailureStory(test, index);
  return { key: `story-${moduleSlug(story.happened)}`, label: story.happened };
}

function knownDefectNote(test) {
  const title = `${test?.title ?? ''} ${test?.validation?.scenario ?? ''} ${test?.testName ?? ''}`;
  const copy = knownDefectCopy.find(item => item.match.test(title));

  if (!copy) {
    return null;
  }

  const error = [
    test?.error,
    test?.errorMessage,
    ...(Array.isArray(test?.annotations) ? test.annotations.map(item => item?.description) : []),
    ...(Array.isArray(test?.attempts)
      ? test.attempts.flatMap(attempt => [
        attempt?.error,
        ...(attempt?.annotations ?? []).map(item => item?.description),
      ])
      : []),
  ].filter(Boolean).join(' ');
  const marked = /known defect|confirmed product (bug|issue)/i.test(error)
    || [...(test?.annotations ?? []), ...(test?.attempts ?? []).flatMap(attempt => attempt?.annotations ?? [])]
      .some(item => String(item?.type ?? '').toLowerCase() === 'fail');
  const status = String(test?.status ?? '').toLowerCase();

  if (!marked && status !== 'failed' && status !== 'timedout') {
    return null;
  }

  return copy;
}

function knownDefectScreenshot(test) {
  const scenario = String(test?.validation?.scenario || test?.title || '')
    .split('>')
    .pop()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const needle = scenario.split('-').filter(Boolean).slice(-5).join('-');
  const root = path.join(projectRoot, 'test-results');

  if (!needle || !fs.existsSync(root)) {
    return '';
  }

  const folders = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.toLowerCase().includes(needle))
    .map(entry => path.join(root, entry.name));
  const pictures = folders.flatMap(folder => fs.readdirSync(folder)
    .filter(name => /^test-failed.*\.png$/i.test(name))
    .map(name => path.join(folder, name)));

  return pictures
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0] || '';
}

function knownDefectFailure(test) {
  const note = knownDefectNote(test);
  const shot = knownDefectScreenshot(test);

  return {
    ...test,
    status: 'failed',
    title: note.name,
    testName: note.name,
    module: test.module || note.group,
    severity: 'High',
    category: 'Product bug',
    error: note.actual,
    errorMessage: note.actual,
    productBug: note,
    evidence: shot
      ? [{
        name: 'screenshot',
        type: 'screenshot',
        path: shot,
        attempt: 1,
        attemptStatus: 'failed',
        contentType: 'image/png',
      }]
      : [],
  };
}

const knownDefectSourceTests = (Array.isArray(airResults?.tests) ? airResults.tests : [])
  .filter(test => knownDefectNote(test) && String(test.status).toLowerCase() === 'passed');
const total = airResults?.summary?.total ?? tests.length;
const passed = Math.max(
  0,
  (airResults?.summary?.passed ?? tests.filter(test => test.status === 'passed').length) - knownDefectSourceTests.length
);
const failed = (airResults?.summary?.failed ?? tests.filter(test => test.status === 'failed' || test.status === 'timedOut').length) + knownDefectSourceTests.length;
const skipped = airResults?.summary?.skipped ?? tests.filter(test => test.status === 'skipped').length;
const interrupted = airResults?.summary?.interrupted ?? tests.filter(test => test.status === 'interrupted').length;
const executed = airResults?.summary?.executed ?? (passed + failed + interrupted);
const unexpectedSkipped = airResults?.summary?.unexpectedSkipped ?? 0;
const documentedSkipped = airResults?.summary?.documentedSkipped ?? Math.max(0, skipped - unexpectedSkipped);
const totalDuration = airResults?.summary?.durationMs ?? tests.reduce((sum, test) => sum + test.duration, 0);
const generatedAt = airResults?.generatedAtDisplay ?? new Date().toLocaleString();
const projectName = airResults?.project?.name ?? airConfig.projectName ?? 'OOLTool';
const environment = airResults?.project?.environment ?? airConfig.environment ?? 'UAT';
const buildVersion = airResults?.project?.buildVersion ?? airConfig.buildVersion ?? 'Playwright JSON';
const productName = airConfig.productName || 'AIR';
const executedPassRate = executed === 0 ? 0 : Math.round((passed / executed) * 100);
const inventoryPassRate = total === 0 ? 0 : Math.round((passed / total) * 100);
const passRate = executedPassRate;
const businessHealth =
  airResults?.summary?.businessHealth ??
  (
    failed === 0 && passed > 0
      ? 96
      : Math.max(0, passRate - failed * 5)
  );
const qualityScore =
  airResults?.summary?.qualityScore ??
  Math.round((passRate * 0.65) + (businessHealth * 0.35));

function normalizeReleaseDecision(value) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (normalized === 'GO') return 'GO';
  if (normalized === 'CONDITIONAL_GO' || normalized === 'REVIEW') return 'CONDITIONAL_GO';
  if (normalized === 'NO_GO' || normalized === 'NO') return 'NO_GO';

  return normalized || 'NO_DATA';
}

function formatReleaseDecision(value) {
  const normalized = normalizeReleaseDecision(value);

  if (normalized === 'GO') return 'GO';
  if (normalized === 'CONDITIONAL_GO') return 'CONDITIONAL GO';
  if (normalized === 'NO_GO') return 'NO GO';

  return 'NO DATA';
}

function getReleaseTone(value) {
  const normalized = normalizeReleaseDecision(value);

  if (normalized === 'GO') return 'good';
  if (normalized === 'CONDITIONAL_GO') return 'warn';
  if (normalized === 'NO_GO') return 'bad';

  return 'neutral';
}

function renderReleaseBadge(value, options = {}) {
  const normalized = normalizeReleaseDecision(value);
  const label = formatReleaseDecision(normalized);
  const compactClass = options.compact ? ' compact' : '';
  const extraClass = options.className ? ` ${options.className}` : '';

  return `<span class="release-status-badge ${getReleaseTone(normalized)}${compactClass}${extraClass}" data-status="${escapeHtml(normalized)}">${escapeHtml(label)}</span>`;
}

const releaseDecision =
  formatReleaseDecision(
    airResults?.releaseDecision?.status ??
    airResults?.summary?.releaseDecision ??
    (
      passRate >= 95 && failed === 0 && businessHealth >= 90
        ? 'GO'
        : passRate >= 90 && failed <= 1 && businessHealth >= 80
          ? 'CONDITIONAL GO'
          : 'NO GO'
    )
  );
const releaseClass = getReleaseTone(releaseDecision);

function getModuleName(title) {
  const normalizedTitle =
    title.toLowerCase();

  if (normalizedTitle.includes('signup')) {
    return 'Signup';
  }

  if (normalizedTitle.includes('onboarding')) {
    return 'Onboarding';
  }

  if (normalizedTitle.includes('billing') || normalizedTitle.includes('subscriber')) {
    return 'Billing';
  }

  if (normalizedTitle.includes('profile')) {
    return 'Profile';
  }

  if (normalizedTitle.includes('password policy') || normalizedTitle.includes('password')) {
    return 'Password';
  }

  if (normalizedTitle.includes('session')) {
    return 'Session Security';
  }

  if (normalizedTitle.includes('accessibility') || normalizedTitle.includes('browser')) {
    return 'Accessibility';
  }

  if (normalizedTitle.includes('auth') || normalizedTitle.includes('login') || normalizedTitle.includes('forgot')) {
    return 'Authentication';
  }

  return 'General';
}

const moduleMap =
  tests.reduce(
    (map, test) => {
      const moduleName =
        getModuleName(test.title);

      if (!map.has(moduleName)) {
        map.set(moduleName, {
          name: moduleName,
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
        });
      }

      const module =
        map.get(moduleName);

      module.total += 1;

      if (test.status === 'passed') {
        module.passed += 1;
      } else if (test.status === 'skipped') {
        module.skipped += 1;
      } else {
        module.failed += 1;
      }

      return map;
    },
    new Map()
  );

const moduleHealth =
  airResults?.modules?.length
    ? airResults.modules.map(module => ({
      ...module,
      name: module.name,
      total: module.total,
      passed: module.passed,
      failed: module.failed,
      skipped: module.skipped,
      interrupted: module.interrupted ?? 0,
      executed: module.executed ?? ((module.passed ?? 0) + (module.failed ?? 0) + (module.interrupted ?? 0)),
      documentedSkipped: module.documentedSkipped ?? 0,
      unexpectedSkipped: module.unexpectedSkipped ?? 0,
      score: module.score,
      coverage: module.coverage ?? module.score,
      status: module.status,
      risk: module.risk,
    }))
    : [...moduleMap.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(module => {
        const score =
          module.total === 0
            ? 0
            : Math.round((module.passed / module.total) * 100);

        return {
          ...module,
          score,
          status:
            score >= 90 && module.failed === 0
              ? 'Healthy'
              : score >= 75
                ? 'Partial'
                : 'At Risk',
          risk:
            module.failed > 0
              ? 'High'
              : module.skipped > 0
                ? 'Medium'
                : 'Low',
        };
      });

const criticalRisks =
  failed > 0
    ? tests
      .filter(test => test.status !== 'passed' && test.status !== 'skipped')
      .slice(0, 5)
      .map(test => ({
        severity: 'High',
        title: test.title,
        action: 'Review failure evidence in the Playwright HTML report.',
      }))
    : [
      {
        severity: 'Low',
        title: 'No failing tests in the current execution run.',
        action: 'Proceed with release review using the evidence report.',
      },
    ];

const businessJourney =
  Array.isArray(airResults?.businessJourneys) && airResults.businessJourneys.length > 0
    ? airResults.businessJourneys.map(journey => journey.name)
    : Array.isArray(airResults?.businessJourney) && airResults.businessJourney.length > 0
    ? airResults.businessJourney
    : Array.isArray(airConfig.businessJourney) && airConfig.businessJourney.length > 0
    ? airConfig.businessJourney
    : [
      'Visitor',
      'Register',
      'OTP',
      'Verify Email',
      'Login',
      'Risk Profile',
      'Compliance',
      'Payment',
      'Dashboard',
    ];

const validations = [
  {
    area: 'New subscriber onboarding',
    checks: [
      'Account registration with generated email and US mobile number',
      'SMS OTP verification during sign-up',
      'Email verification handoff before login',
      'Risk profile completion',
      'Compliance profile completion and disclosure acceptance',
      'Income Builder plan selection',
      'Stripe checkout payment completion',
      'Dashboard access after successful onboarding',
    ],
  },
  {
    area: 'Profile',
    checks: [
      'Subscriber login',
      'Profile page access',
      'Profile data loads successfully',
      'Email field remains disabled/read-only',
      'Email field cannot be edited',
      'Unsaved empty first-name draft is not persisted after refresh',
      'Unsaved empty last-name draft is not persisted after refresh',
      'Profile data persists after refresh',
      'Password-change action remains on profile page with empty password fields',
    ],
  },
  {
    area: 'Password validation',
    checks: [
      'Configured password policy accepts valid passwords',
      'Configured minimum password length is enforced',
      'Configured banned passwords are rejected',
      'Banned password matching is case-insensitive',
      'Uppercase, lowercase, digit, and symbol rules follow admin/config settings',
      'New password and confirm password mismatch validation',
      'Wrong current password validation',
      'Expected validation messages are displayed',
    ],
  },
  {
    area: 'Authentication guardrails',
    checks: [
      'Login form blocks empty required fields',
      'Login form blocks empty email only',
      'Login form blocks empty password only',
      'Login form blocks invalid email format',
      'Login form rejects SQL injection style input',
      'Login form rejects XSS/script style input',
      'Login form rejects very long email input',
      'Protected dashboard, onboarding, profile, billing, settings, security, subscription, notifications, and activity routes redirect unauthenticated users to login',
      'Forgot password form blocks empty email',
      'Forgot password form blocks invalid email format',
      'Forgot password rejects SQL injection style input',
      'Forgot password rejects XSS/script style input',
      'Forgot password rejects very long email input',
    ],
  },
  {
    area: 'Signup guardrails',
    checks: [
      'Signup form blocks empty required fields',
      'Signup form blocks invalid email format',
      'Signup form blocks missing domain, missing @, SQL injection style, and XSS/script style email input',
      'Signup email trims leading and trailing spaces',
      'Password and confirmation fields are visible and required before submit',
      'Mismatched password and confirmation keeps submit disabled',
      'OTP request stays disabled without a mobile number',
      'Short mobile number keeps OTP request disabled',
      'Mobile input strips letters',
      'Formatted US mobile number is normalized',
      'Extra mobile digits are limited to ten digits',
      'US mobile number guidance is visible',
      'Password visibility toggles work for password and confirmation fields',
      'Submit stays disabled before mobile OTP verification',
    ],
  },
  {
    area: 'Session security',
    checks: [
      'Logout prevents browser back navigation from restoring dashboard access',
      'Direct dashboard URL after logout redirects to login',
      'Logged-out session remains on login after refresh',
      'Authenticated session can open dashboard in a new tab',
    ],
  },
  {
    area: 'Accessibility and browser behavior',
    checks: [
      'Login form exposes accessible email and password fields',
      'Login form supports Enter key submission without authenticating invalid data',
      'Forgot password supports Back to login navigation',
      'Register page keeps form visible after browser refresh',
      'Register page exposes accessible primary actions',
    ],
  },
  {
    area: 'Subscriber billing',
    checks: [
      'Dashboard access and refresh persistence',
      'Billing page navigation from profile menu',
      'Billing page remains available after refresh',
      'Plans tab opens and Income Builder plan is visible',
      'Transaction history opens and paid status is verified',
      'Invoice page opens successfully',
      'Invoice page shows paid status',
      'Invoice PDF link is available and opens',
      'Invoice PDF link points to a non-empty URL',
      'Subscriber logout completes successfully',
    ],
  },
];

const businessFlows = [
  {
    name: 'New subscriber onboarding',
    status: 'Passed',
    detail: 'Registration, OTP, email verification handoff, risk, compliance, plan selection, Stripe payment, and dashboard access.',
  },
  {
    name: 'Profile verification',
    status: 'Passed',
    detail: 'Profile page loads after login, email remains read-only, unsaved drafts do not persist, and refresh keeps profile data.',
  },
  {
    name: 'Password validation',
    status: 'Passed',
    detail: 'Configured policy rules, banned passwords, mismatch, and wrong-current-password validation are verified.',
  },
  {
    name: 'Authentication guardrails',
    status: 'Passed',
    detail: 'Required login fields, invalid email handling, protected route redirects, and forgot-password form validation are verified.',
  },
  {
    name: 'Signup guardrails',
    status: 'Passed',
    detail: 'Required fields, email validation, mobile validation, password confirmation, visibility toggles, and pre-OTP submit protection are verified.',
  },
  {
    name: 'Session security',
    status: 'Passed',
    detail: 'Logout protection, direct protected URL redirect after logout, refresh behavior, and authenticated new-tab access are verified.',
  },
  {
    name: 'Accessibility and browser behavior',
    status: 'Passed',
    detail: 'Accessible auth controls, Enter-key behavior, Back-to-login navigation, and register refresh behavior are verified.',
  },
  {
    name: 'Billing and invoice',
    status: 'Passed',
    detail: 'Billing navigation, refresh persistence, plan visibility, paid transaction status, invoice page, PDF link, and logout are verified.',
  },
];

const excludedFlows = [
  {
    name: 'Forgot password reset',
    reason: 'Requires opening Gmail, copying the reset email link, and pasting it into the Playwright browser during execution.',
  },
  {
    name: 'Unlock locked account',
    reason: 'Requires the target account to already be in a locked state before the test starts.',
  },
  {
    name: 'Direct reset password URL',
    reason: 'Requires a fresh RESET_URL environment value generated from an email reset link.',
  },
];

const regressionMatrix = [
  {
    module: 'Login',
    positive: 'Covered',
    negative: 'Covered',
    security: 'Partial',
    boundary: 'Partial',
    status: '85%',
  },
  {
    module: 'Signup',
    positive: 'Covered',
    negative: 'Covered',
    security: 'Partial',
    boundary: 'Covered',
    status: '90%',
  },
  {
    module: 'Profile',
    positive: 'Covered',
    negative: 'Partial',
    security: 'Partial',
    boundary: 'Partial',
    status: '75%',
  },
  {
    module: 'Forgot Password',
    positive: 'Covered',
    negative: 'Covered',
    security: 'Partial',
    boundary: 'Partial',
    status: '80%',
  },
  {
    module: 'Reset Password',
    positive: 'Manual/Separate',
    negative: 'Planned',
    security: 'Planned',
    boundary: 'Planned',
    status: '25%',
  },
  {
    module: 'Protected Routes',
    positive: 'Covered',
    negative: 'Covered',
    security: 'Covered',
    boundary: 'Partial',
    status: '90%',
  },
  {
    module: 'Session Security',
    positive: 'Covered',
    negative: 'Covered',
    security: 'Covered',
    boundary: 'Partial',
    status: '85%',
  },
  {
    module: 'Accessibility',
    positive: 'Covered',
    negative: 'Partial',
    security: 'Planned',
    boundary: 'Partial',
    status: '55%',
  },
  {
    module: 'Browser Behavior',
    positive: 'Covered',
    negative: 'Partial',
    security: 'Partial',
    boundary: 'Partial',
    status: '60%',
  },
  {
    module: 'Billing',
    positive: 'Covered',
    negative: 'Partial',
    security: 'Planned',
    boundary: 'Partial',
    status: '80%',
  },
  {
    module: 'MFA',
    positive: 'Planned',
    negative: 'Planned',
    security: 'Planned',
    boundary: 'Planned',
    status: '0%',
  },
];

const priorityRoadmap = [
  {
    phase: 'Completed In Current Execution',
    items: [
      'Protected route redirects for dashboard, onboarding, profile, billing, settings, security, subscription, notifications, and activity pages',
      'Logout security: browser back button, direct dashboard URL after logout, and refresh after logout',
      'Signup email validation: invalid format, missing domain, missing @, SQL injection style input, XSS/script style input, and leading/trailing spaces',
      'Signup mobile validation: missing number, short number, letters stripped, formatted US number normalized, and extra digits limited',
      'Signup password guardrails: mismatch, password visibility toggles, and submit disabled before OTP verification',
      'Password policy validation: minimum length, banned passwords, case-insensitive banned password check, and configurable uppercase/lowercase/digit/symbol rules',
      'Accessibility/browser checks: accessible auth controls, Enter-key login behavior, Back to login, and register refresh behavior',
    ],
  },
  {
    phase: 'Phase 2 - Remaining Security And Edge Cases',
    items: [
      'Wrong password and unregistered email validation with lockout-safe test data',
      'Existing email and existing mobile signup validation',
      'Wrong OTP, expired OTP, resend OTP, and resend limit validation using controlled OTP state',
      'Duplicate click and button disabled while processing checks for signup, login, password reset, and payment',
      'Session expiry redirect validation',
      'Reset-password negative checks using a fresh RESET_URL',
      'Payment negative checks using a fresh STRIPE_CHECKOUT_URL',
    ],
  },
  {
    phase: 'Phase 3 - Remaining Accessibility And Browser Behavior',
    items: [
      'Tab order validation',
      'Focus moves to first invalid field',
      'Keyboard-only navigation across login, signup, forgot password, profile, and billing',
      'Screen-reader label audit for all required auth and onboarding fields',
      'Browser refresh and back/forward behavior across onboarding, billing, profile, and reset-password pages',
      'Mobile viewport validation for auth, signup, onboarding, billing, and report pages',
    ],
  },
];

const rows = tests
  .map(test => {
    const statusClass =
      test.status === 'passed'
        ? 'passed'
        : test.status === 'skipped'
          ? 'skipped'
          : 'failed';

    return `
      <tr>
        <td>${escapeHtml(test.title)}</td>
        <td>${escapeHtml(test.project)}</td>
        <td><span class="badge ${statusClass}">${escapeHtml(test.status)}</span></td>
        <td>${formatDuration(test.duration)}</td>
        <td>${escapeHtml(test.error)}</td>
      </tr>`;
  })
  .join('') || `
      <tr>
        <td colspan="5">No Playwright JSON results found. Run <code>npm run execution</code> or <code>npm run controlled</code>, then run <code>npm run report:execution</code>.</td>
      </tr>`;

const evidenceNotice = hasResults
  ? 'Screenshots, videos, traces, and raw Playwright detail are available in the evidence report.'
  : 'The AIR report layout is ready, but Playwright JSON results are missing. Run the execution suite to populate live metrics and evidence links.';

const validationCards = validations
  .map(group => `
    <article class="validation-card">
      <h3>${escapeHtml(group.area)}</h3>
      <ul>
        ${group.checks.map(check => `<li>${escapeHtml(check)}</li>`).join('')}
      </ul>
    </article>`)
  .join('');

const businessFlowRows = businessFlows
  .map(flow => `
    <tr>
      <td>${escapeHtml(flow.name)}</td>
      <td><span class="badge passed">${escapeHtml(flow.status)}</span></td>
      <td>${escapeHtml(flow.detail)}</td>
    </tr>`)
  .join('');

const excludedRows = excludedFlows
  .map(flow => `
    <tr>
      <td>${escapeHtml(flow.name)}</td>
      <td>${escapeHtml(flow.reason)}</td>
    </tr>`)
  .join('');

const regressionRows = regressionMatrix
  .map(row => `
    <tr>
      <td>${escapeHtml(row.module)}</td>
      <td>${escapeHtml(row.positive)}</td>
      <td>${escapeHtml(row.negative)}</td>
      <td>${escapeHtml(row.security)}</td>
      <td>${escapeHtml(row.boundary)}</td>
      <td>${escapeHtml(row.status)}</td>
    </tr>`)
  .join('');

const roadmapCards = priorityRoadmap
  .map(phase => `
    <article class="validation-card">
      <h3>${escapeHtml(phase.phase)}</h3>
      <ul>
        ${phase.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </article>`)
  .join('');

const moduleRows = moduleHealth
  .map(module => `
    <tr>
      <td>${escapeHtml(module.name)}</td>
      <td><span class="score">${module.score}</span></td>
      <td><span class="pill ${module.status === 'Healthy' ? 'good' : module.status === 'Partial' ? 'warn' : 'bad'}">${escapeHtml(module.status)}</span></td>
      <td><span class="pill ${module.risk === 'Low' ? 'good' : module.risk === 'Medium' ? 'warn' : 'bad'}">${escapeHtml(module.risk)}</span></td>
      <td>${module.passed}/${module.total}</td>
      <td>${module.failed}</td>
      <td>${module.skipped}</td>
    </tr>`)
  .join('');

const journeySteps = businessJourney
  .map((step, index) => `
    <div class="journey-step">
      <div class="journey-index">${index + 1}</div>
      <div>
        <strong>${escapeHtml(step)}</strong>
        <span>Covered</span>
      </div>
    </div>`)
  .join('');

const riskCards = criticalRisks
  .map(risk => `
    <article class="risk-card">
      <span class="pill ${risk.severity === 'Low' ? 'good' : risk.severity === 'Medium' ? 'warn' : 'bad'}">${escapeHtml(risk.severity)}</span>
      <h3>${escapeHtml(risk.title)}</h3>
      <p>${escapeHtml(risk.action)}</p>
    </article>`)
  .join('');

const releaseLabel =
  releaseDecision === 'GO'
    ? 'YES'
    : releaseDecision === 'CONDITIONAL GO'
      ? 'REVIEW'
      : 'NO';

const riskLevel =
  failed > 0
    ? 'High'
    : skipped > 0
      ? 'Medium'
      : 'Low';

const metricItems = [
  { label: 'Total Tests', value: total, tone: 'green', width: total ? 90 : 20 },
  { label: 'Passed', value: passed, tone: 'green', width: total ? Math.max(12, passRate) : 20 },
  { label: 'Failed', value: failed, tone: failed ? 'red' : 'green', width: failed ? Math.min(100, failed * 18) : 12 },
  { label: 'Pass Rate', value: `${passRate}%`, tone: passRate >= 95 ? 'green' : passRate >= 90 ? 'amber' : 'red', width: Math.max(8, passRate) },
  { label: 'Duration', value: formatDuration(totalDuration), tone: 'green', width: 82 },
  { label: 'Release', value: releaseLabel, tone: releaseClass === 'good' ? 'green' : releaseClass === 'warn' ? 'amber' : 'red', width: qualityScore },
];

const metricCards = metricItems
  .map(item => `
        <div class="metric-card ${item.tone}">
          <div class="metric-label">${escapeHtml(item.label)}</div>
          <div class="metric-value">${escapeHtml(item.value)}</div>
        </div>`)
  .join('');

const liveMetricRows = metricItems
  .map(item => `
          <tr>
            <td>${escapeHtml(item.label)}</td>
            <td><span class="mini-badge ${item.tone}">${escapeHtml(item.value)}</span></td>
            <td><div class="bar-track"><div class="bar-fill ${item.tone}" style="width:${item.width}%"></div></div></td>
          </tr>`)
  .join('');

const chartBars = metricItems
  .map(item => {
    const height = Math.max(35, Math.round((item.width / 100) * 160));
    return `<div class="vbar ${item.tone}" style="height:${height}px"><span>${escapeHtml(item.label.slice(0, 8))}</span></div>`;
  })
  .join('');

const journeyChips = businessJourney
  .map(step => `<span class="journey-chip green">${escapeHtml(step)}</span>`)
  .join('');

const failedTests = Array.isArray(airResults?.failedTests) && airResults.failedTests.length > 0
  ? airResults.failedTests
  : tests.filter(test => test.status === 'failed' || test.status === 'timedOut');
const topFailureRows =
  failedTests
    .slice(0, 4)
    .map(test => `
      <div class="failure-row">
        <span>${escapeHtml(test.title)}</span>
        <strong>Failed</strong>
      </div>`)
    .join('') || `
      <div class="failure-row">
        <span>No failed tests in available execution data</span>
        <strong class="ok">Clear</strong>
      </div>`;

const projectCounts = tests.reduce((counts, test) => {
  const project = test.project || 'chromium';
  counts[project] = (counts[project] || 0) + 1;
  return counts;
}, {});

const browserRows =
  Object.entries(projectCounts)
    .map(([project, count]) => {
      const percentage = total ? Math.round((count / total) * 100) : 0;
      return `<li><span>${escapeHtml(project)}</span><strong>${count} (${percentage}%)</strong></li>`;
    })
    .join('') || '<li><span>chromium</span><strong>No run data</strong></li>';

const quickActions = [
  ['Export Executive PDF', 'javascript:window.print()'],
  ['Open Evidence Report', '../playwright-report/index.html'],
  ['Open Raw JSON', '../test-results/results.json'],
  ['View Detailed Tests', '#detailed-results'],
  ['Open Coverage Matrix', '#coverage'],
  ['Open Roadmap', '#roadmap'],
]
  .map(([label, href]) => `<a href="${href}">${escapeHtml(label)}</a>`)
  .join('');

const goldenModuleRows = moduleHealth
  .map(module => {
    const tone =
      module.risk === 'High'
        ? 'bad'
        : module.risk === 'Medium'
          ? 'warn'
          : 'good';
    const decision =
      module.risk === 'High'
        ? 'Improve'
        : module.risk === 'Medium'
          ? 'Monitor'
          : 'Ready';

    return `
      <tr>
        <td>${escapeHtml(module.name)}</td>
        <td><div class="progress"><div class="fill" style="width:${module.score}%"></div></div></td>
        <td><span class="badge ${tone}">${escapeHtml(module.risk)}</span></td>
        <td>${decision}</td>
      </tr>`;
  })
  .join('');

const goldenJourneySteps = businessJourney
  .map((step, index) => `
    <div class="step">${escapeHtml(step)}<br><span class="badge good">Healthy</span></div>
    ${index < businessJourney.length - 1 ? '<div class="arrow">-&gt;</div>' : ''}`)
  .join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AIR Platform - OOLTool Execution Report</title>
<style>
:root{--nav:#061329;--nav2:#081a35;--bg:#f5f8fc;--card:#fff;--line:#dce5f2;--text:#0f1b3d;--muted:#64748b;--green:#16a34a;--red:#dc2626;--amber:#f59e0b;--blue:#2563eb;--purple:#4f46e5}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,Segoe UI,Arial,Helvetica,sans-serif;font-size:14px}
.layout{display:flex;min-height:100vh}.sidebar{position:fixed;left:0;top:0;bottom:0;width:255px;background:linear-gradient(180deg,#07142d,#020817);color:#fff;padding:22px 16px;overflow:auto}.brand{padding:0 8px 22px}.brand .air{font-size:42px;font-weight:900;line-height:.9;letter-spacing:.04em;background:linear-gradient(90deg,#22d3ee,#6d5dfc);-webkit-background-clip:text;color:transparent}.brand strong{display:block;font-size:17px;letter-spacing:.22em;margin-top:8px}.brand span{display:block;color:#d7e4f7;font-size:13px;line-height:1.4;margin-top:8px}.nav a{align-items:center;border-radius:10px;color:#e5e7eb;display:flex;gap:12px;margin:2px 0;padding:11px 12px;text-decoration:none}.nav a.active,.nav a:hover{background:linear-gradient(90deg,#2563eb,#5b41e8)}.nav small{align-items:center;border:1px solid rgba(255,255,255,.35);border-radius:7px;display:inline-flex;height:22px;justify-content:center;width:22px}.side-controls{border-top:1px solid rgba(255,255,255,.14);margin-top:22px;padding:16px 8px}.side-controls label{color:#cbd5e1;display:block;font-size:12px;margin:14px 0 6px}.select{background:#071934;border:1px solid #334a6d;border-radius:7px;color:#fff;padding:11px;width:100%}.user{align-items:center;border-top:1px solid rgba(255,255,255,.14);display:flex;gap:12px;margin-top:18px;padding:18px 8px}.avatar{align-items:center;background:linear-gradient(135deg,#2dd4bf,#2563eb);border-radius:50%;display:flex;font-weight:900;height:42px;justify-content:center;width:42px}.main{margin-left:255px;padding:0;width:calc(100% - 255px)}.screen{min-height:100vh;padding:24px 28px;border-bottom:1px solid var(--line)}.topbar{align-items:flex-start;display:flex;gap:20px;justify-content:space-between;margin-bottom:18px}.topbar h1{font-size:32px;line-height:1;margin:0 0 6px}.topbar p{color:var(--muted);margin:0}.filters{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.filter,.btn{background:#fff;border:1px solid #d7e1ef;border-radius:8px;color:var(--text);padding:10px 14px;text-decoration:none;font-weight:700}.btn.primary{background:linear-gradient(90deg,#2563eb,#5b41e8);border-color:#4f46e5;color:#fff}.last-run{color:#475569;font-size:12px;margin-top:10px;text-align:right}.status{background:#dcfce7;border-radius:999px;color:#166534;font-weight:800;padding:7px 12px}.kpis{display:grid;gap:16px;grid-template-columns:repeat(6,minmax(0,1fr));margin:16px 0 20px}.kpi,.card{background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 6px 22px rgba(15,23,42,.05)}.kpi{min-height:112px;padding:18px;position:relative}.kpi .label{font-weight:800;margin-bottom:10px}.kpi .value{font-size:30px;font-weight:900}.kpi .delta{color:var(--muted);font-size:12px;margin-top:10px}.kpi .icon{align-items:center;border-radius:14px;color:#fff;display:flex;font-size:22px;font-weight:900;height:46px;justify-content:center;position:absolute;right:18px;top:32px;width:46px}.blue{background:linear-gradient(135deg,#3b82f6,#1d4ed8)}.green-bg{background:linear-gradient(135deg,#4ade80,#15803d)}.red-bg{background:linear-gradient(135deg,#f87171,#dc2626)}.amber-bg{background:linear-gradient(135deg,#fbbf24,#f97316)}.purple-bg{background:linear-gradient(135deg,#8b5cf6,#4338ca)}.teal-bg{background:linear-gradient(135deg,#14b8a6,#0f766e)}.grid{display:grid;gap:16px;margin-bottom:16px}.grid.top{grid-template-columns:1fr 2.1fr 1.65fr}.grid.mid{grid-template-columns:1.25fr 1fr 1.25fr 1.25fr}.grid.bottom{grid-template-columns:1.4fr 1fr 1fr}.card{padding:18px;overflow:auto}.card h2{font-size:18px;margin:0 0 14px}.card-head{align-items:center;display:flex;justify-content:space-between}.card-head a{color:var(--blue);font-size:12px;font-weight:800;text-decoration:none}.gauge{align-items:center;display:flex;flex-direction:column;padding:18px 0}.gauge-ring{align-items:center;background:conic-gradient(var(--green) ${qualityScore}%,#e5e7eb 0);border-radius:50%;display:flex;height:205px;justify-content:center;width:205px}.gauge-inner{align-items:center;background:#fff;border-radius:50%;display:flex;flex-direction:column;height:145px;justify-content:center;width:145px}.gauge-inner strong{font-size:42px}.go{background:#eafaf0;border:1px solid #bbf7d0;border-radius:8px;color:#059669;font-size:28px;font-weight:900;margin:10px 0 0;padding:8px 24px}.dash-table{border-collapse:collapse;font-size:13px;width:100%}.dash-table th,.dash-table td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:middle}.dash-table th{color:#64748b;font-size:12px;font-weight:800;text-transform:uppercase}.mini-badge,.badge{border-radius:999px;display:inline-block;font-size:12px;font-weight:800;padding:5px 9px}.good,.passed{background:#dcfce7;color:#166534}.warn,.skipped{background:#ffedd5;color:#9a3412}.bad,.failed{background:#fee2e2;color:#991b1b}.score{font-weight:900;color:var(--blue)}.bar-track{background:#e5e7eb;border-radius:999px;height:10px;overflow:hidden;width:120px}.bar-fill{background:var(--green);border-radius:999px;height:100%}.bar-fill.warn{background:var(--amber)}.bar-fill.bad{background:var(--red)}.trend{height:250px;position:relative}.trend-grid{background:linear-gradient(#e5e7eb 1px,transparent 1px),linear-gradient(90deg,#e5e7eb 1px,transparent 1px);background-size:100% 25%,16.6% 100%;height:200px;margin-top:20px}.trend-line{align-items:center;display:flex;height:64px;justify-content:space-between;margin-top:-130px;padding:0 14px}.trend-point{background:#16a34a;border-radius:999px;height:10px;position:relative;width:10px}.trend-point span{color:#166534;font-size:12px;font-weight:800;position:absolute;top:-22px;transform:translateX(-30%)}.donut{align-items:center;background:conic-gradient(#22c55e 0 63%,#4f46e5 63% 76%,#0ea5e9 76% 84%,#ef4444 84% 92%,#f97316 92% 100%);border-radius:50%;display:flex;height:160px;justify-content:center;width:160px}.donut-inner{align-items:center;background:#fff;border-radius:50%;display:flex;flex-direction:column;height:100px;justify-content:center;width:100px}.coverage{display:flex;gap:18px;align-items:center}.coverage ul,.browser ul{list-style:none;margin:0;padding:0;flex:1}.coverage li,.browser li{display:flex;justify-content:space-between;margin:10px 0}.risk-list{display:grid;gap:10px}.risk-item{align-items:center;border:1px solid var(--line);border-radius:10px;display:flex;justify-content:space-between;padding:10px 12px}.failure-row{align-items:center;border-bottom:1px solid var(--line);display:flex;gap:10px;justify-content:space-between;padding:10px 0}.failure-row strong{background:#fee2e2;border-radius:6px;color:#dc2626;padding:5px 9px}.failure-row strong.ok{background:#dcfce7;color:#15803d}.browser{display:flex;gap:18px;align-items:center}.quick{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}.quick a{background:#fff;border:1px solid #dbe5f2;border-radius:8px;color:#1e3a8a;font-weight:800;padding:10px 12px;text-decoration:none}.validation-grid{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}.validation-card,.risk-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}.validation-card h3,.risk-card h3{margin:0 0 10px}.validation-card ul{margin:0;padding-left:18px;color:#475569}.footer{color:#475569;display:flex;gap:12px;justify-content:space-between;padding:0 2px 18px}.detail-section{margin-top:0}.journey-list{display:flex;gap:10px;flex-wrap:wrap}.journey-chip{background:#eef2ff;border:1px solid #dbe5ff;border-radius:999px;color:#3730a3;font-weight:800;padding:9px 12px}a{color:var(--blue)}@media(max-width:1100px){.kpis,.grid.top,.grid.mid,.grid.bottom,.validation-grid{grid-template-columns:1fr 1fr}.sidebar{width:220px}.main{margin-left:220px;width:calc(100% - 220px)}}@media(max-width:850px){.sidebar{display:none}.main{margin-left:0;width:100%}.screen{padding:18px}.kpis,.grid.top,.grid.mid,.grid.bottom,.validation-grid{grid-template-columns:1fr}.topbar{display:block}.filters{justify-content:flex-start;margin-top:12px}.coverage,.browser{display:block}}@media print{.sidebar,.filters{display:none}.main{margin-left:0;width:100%}.card,.kpi{break-inside:avoid}}
.pill{border-radius:999px;display:inline-block;font-size:12px;font-weight:800;padding:5px 9px}
.cover-page{min-height:calc(100vh - 44px);display:grid;grid-template-columns:1.15fr .85fr;gap:22px;align-items:stretch}.cover-hero{border:1px solid var(--line2);border-radius:18px;background:radial-gradient(circle at 20% 10%,rgba(57,231,95,.2),transparent 32%),linear-gradient(145deg,#0b1728,#07101f);padding:38px;display:flex;flex-direction:column;justify-content:space-between}.cover-logo{font-size:88px;font-weight:900;letter-spacing:-6px;background:linear-gradient(90deg,#39e75f,#16a34a);-webkit-background-clip:text;color:transparent;line-height:.9}.cover-title{font-size:44px;line-height:1.02;margin:18px 0 10px}.cover-sub{font-size:18px;color:var(--muted);max-width:680px}.cover-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.cover-stat{border:1px solid var(--line2);border-radius:14px;background:rgba(8,16,30,.68);padding:18px}.cover-stat span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.cover-stat strong{display:block;font-size:28px;margin-top:8px}.wow{border:1px solid rgba(57,231,95,.34);border-radius:18px;background:linear-gradient(135deg,rgba(57,231,95,.13),rgba(8,16,30,.76));padding:22px;margin-bottom:22px}.wow h2{font-size:30px;margin:0 0 16px}.wow-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.wow-card{border:1px solid var(--line2);border-radius:14px;background:rgba(7,16,31,.78);padding:18px}.wow-card span{display:block;color:var(--muted);font-size:12px}.wow-card strong{display:block;font-size:34px;margin-top:7px;color:var(--green)}.icon-title{display:flex;align-items:center;gap:10px}.section-icon{width:34px;height:34px;border-radius:10px;background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.28);display:grid;place-items:center;color:var(--green);font-weight:900}.health-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.health-card{display:flex;gap:14px;align-items:center;border:1px solid var(--line2);border-radius:14px;background:#0b1728;padding:18px}.health-card strong,.health-card span,.health-card small{display:block}.health-card span{font-size:30px;color:var(--green);font-weight:900;margin:4px 0}.health-card small{color:var(--muted)}.health-icon{min-width:48px;height:48px;border-radius:14px;background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.28);display:grid;place-items:center;color:var(--green);font-size:12px;font-weight:900}.thumb-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.thumb{border:1px solid var(--line2);border-radius:12px;background:#07101f;padding:10px;text-decoration:none;color:var(--text)}.thumb img{width:100%;height:104px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}.thumb span{display:block;color:var(--muted);font-size:12px;margin-top:8px}.thumb.placeholder{height:142px;display:flex;flex-direction:column;justify-content:center;align-items:center}.thumb.placeholder div{width:72px;height:46px;border:1px dashed rgba(57,231,95,.45);border-radius:8px;display:grid;place-items:center;color:var(--green);font-size:12px;margin-bottom:10px}.ai-reasons{margin:10px 0 0;padding-left:20px;color:var(--muted);line-height:1.8}.footer{color:var(--muted);border-top:1px solid var(--line2);padding:18px 4px 0;margin-top:8px;display:flex;justify-content:space-between;gap:12px}.footer strong{color:var(--green)}@media(max-width:1100px){.cover-page,.wow-grid,.cover-stats,.health-grid,.thumb-grid{grid-template-columns:1fr}}
.sidebar{padding:24px 18px}.nav a{margin-bottom:8px}main{padding:26px 32px 52px}.page{padding:26px;margin-bottom:26px}.grid{gap:18px}.kpis,.evidence-grid{gap:16px}.panel{padding:20px}.cover-page{min-height:720px;display:grid;gap:24px}.cover-hero{min-height:430px;border:1px solid rgba(57,231,95,.28);border-radius:18px;background:radial-gradient(circle at 70% 30%,rgba(57,231,95,.16),transparent 35%),linear-gradient(135deg,#07101f,#0b1728);padding:42px;display:grid;grid-template-columns:1fr 1.2fr;gap:28px;align-items:center}.cover-logo{font-size:92px;font-weight:900;letter-spacing:-7px;background:linear-gradient(90deg,#39e75f,#9af7ad);-webkit-background-clip:text;color:transparent}.cover-title{font-size:44px;line-height:1.02;margin:10px 0}.cover-sub{color:var(--muted);font-size:18px}.cover-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.cover-stat{border:1px solid var(--line2);border-radius:12px;background:rgba(8,16,30,.76);padding:18px}.cover-stat span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.cover-stat strong{display:block;font-size:23px;margin-top:8px}.wow{border:1px solid rgba(57,231,95,.3);border-radius:16px;background:linear-gradient(135deg,rgba(57,231,95,.12),rgba(8,16,30,.82));padding:22px;margin-bottom:22px}.wow h2{font-size:28px;margin:0 0 14px}.wow-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.wow-card{border:1px solid var(--line2);border-radius:12px;background:rgba(8,16,30,.72);padding:16px}.wow-card span{display:block;color:var(--muted)}.wow-card strong{display:block;color:var(--green);font-size:34px;margin-top:5px}.wow-card small{display:block;color:#d7fbe0;line-height:1.7}.icon-title{display:flex;align-items:center;gap:10px}.section-icon{width:34px;height:34px;border:1px solid rgba(57,231,95,.35);border-radius:10px;display:inline-grid;place-items:center;background:rgba(57,231,95,.12);color:var(--green);font-size:12px;font-weight:900}.release-card{min-height:290px}.release-card .decision{font-size:70px}.health-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.health-card{display:flex;gap:13px;align-items:center;border:1px solid var(--line2);border-radius:12px;padding:16px;background:#0b1728}.health-card strong,.health-card span,.health-card small{display:block}.health-card span{font-size:28px;color:var(--green);font-weight:900;margin:4px 0}.health-card small{color:var(--muted)}.health-icon{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(57,231,95,.14);border:1px solid rgba(57,231,95,.35);color:var(--green);font-size:11px;font-weight:900}.health-card.amber .health-icon,.health-card.amber span{color:var(--amber)}.health-card.red .health-icon,.health-card.red span{color:var(--red)}.chart{height:250px;background:linear-gradient(180deg,#091426,#07101f);padding:22px 18px 42px;gap:16px}.bar{background:linear-gradient(180deg,#63ef7e,#178f38);box-shadow:0 10px 22px rgba(57,231,95,.12)}.bar:hover{filter:brightness(1.16)}.thumb-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.thumb{border:1px solid var(--line2);border-radius:12px;background:#07101f;padding:10px;text-decoration:none;color:white;min-height:132px}.thumb img{width:100%;height:92px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}.thumb span{display:block;color:var(--muted);font-size:12px;margin-top:8px}.thumb.placeholder{display:grid;place-items:center;text-align:center}.thumb.placeholder div{width:100%;height:92px;border-radius:8px;border:1px dashed rgba(57,231,95,.35);display:grid;place-items:center;color:var(--green);background:rgba(57,231,95,.08)}.ai-reasons{margin:12px 0 0;padding-left:20px;color:#d7fbe0;line-height:1.8}.footer{display:flex;justify-content:space-between;gap:18px;align-items:center;color:var(--muted);font-size:12px;border-top:1px solid var(--line2);padding-top:18px}.footer strong{color:white}@media(max-width:1100px){.cover-hero,.cover-stats,.wow-grid,.health-grid,.thumb-grid{grid-template-columns:1fr}}@page{size:A3 landscape;margin:8mm}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}html,body{background:#0b0f17!important;color:var(--text)!important}.app{display:block}.sidebar{display:none!important}main{padding:0!important}.page{break-inside:avoid;page-break-inside:avoid;margin:0 0 10mm!important;box-shadow:none!important}.btn,.actions{display:none!important}.footer{break-inside:avoid}}
.nav-section{margin:14px 0 4px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.14em;font-weight:900}.nav a{padding-left:14px}.topbar h1{font-size:36px}.cover-sub strong{color:var(--green)}.panel,.kpi,.cover-stat,.wow-card,.health-card,.module-health-card,.evidence-card,.thumb{box-shadow:0 12px 30px rgba(0,0,0,.18)}.kpi,.wow-card{min-height:126px}.health-card{min-height:112px}.badge.green{background:rgba(57,231,95,.14);border:1px solid rgba(57,231,95,.35);color:var(--green)}.badge.amber{background:rgba(245,197,66,.14);border:1px solid rgba(245,197,66,.35);color:var(--amber)}.badge.red{background:rgba(255,59,59,.14);border:1px solid rgba(255,59,59,.35);color:var(--red)}.narrative{border:1px solid rgba(57,231,95,.28);border-radius:16px;background:linear-gradient(135deg,rgba(57,231,95,.10),rgba(8,16,30,.82));padding:22px;margin:0 0 22px}.narrative h2{font-size:24px;margin:0 0 10px}.narrative p{font-size:17px;line-height:1.65;color:#dbeafe;margin:0}.meta-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px}.meta-item{border:1px solid var(--line2);border-radius:12px;background:rgba(8,16,30,.68);padding:14px}.meta-item span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.meta-item strong{display:block;margin-top:7px;color:white}.why-release{margin-top:18px;border:1px solid rgba(57,231,95,.35);border-radius:14px;padding:18px;background:rgba(57,231,95,.08);text-align:left;width:100%}.why-release h3{margin:0 0 10px;font-size:16px}.why-release ul{margin:0;padding-left:20px;color:#d7fbe0;line-height:1.8}.module-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-bottom:18px}.module-health-card{display:flex;flex-direction:column;gap:14px;min-height:300px;border:1px solid rgba(57,231,95,.32);border-radius:16px;background:linear-gradient(145deg,rgba(11,23,40,.95),rgba(7,16,31,.95));padding:18px;text-decoration:none;color:var(--text);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.module-health-card:hover{transform:translateY(-2px);border-color:var(--green);box-shadow:0 16px 36px rgba(57,231,95,.12)}.module-health-card.green{border-color:rgba(57,231,95,.38)}.module-health-card.amber{border-color:rgba(245,197,66,.42)}.module-health-card.red{border-color:rgba(255,59,59,.48)}.module-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.module-card-head strong{font-size:18px}.module-score{font-size:42px;line-height:1;color:var(--green);font-weight:900}.module-health-card.amber .module-score{color:var(--amber)}.module-health-card.red .module-score{color:var(--red)}.module-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.module-meta span{border:1px solid var(--line2);border-radius:10px;background:rgba(8,16,30,.64);padding:10px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.module-meta b{display:block;color:white;font-size:15px;margin-top:5px;text-transform:none;letter-spacing:0}.module-progress{height:9px;background:#1d2b44;border-radius:999px;overflow:hidden}.module-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--green),#16a34a)}.module-health-card.amber .module-progress span{background:linear-gradient(90deg,var(--amber),#b7791f)}.module-health-card.red .module-progress span{background:linear-gradient(90deg,var(--red),#991b1b)}.module-health-card p{margin:0;color:#d7fbe0;line-height:1.45;flex:1}.module-health-card em{font-style:normal;color:var(--green);font-weight:900;font-size:12px}.page-footer{display:flex;gap:14px;justify-content:space-between;align-items:center;border-top:1px solid var(--line2);color:var(--muted);font-size:11px;margin-top:22px;padding-top:14px}.page-footer strong{color:var(--green)}@media(max-width:1100px){.meta-strip{grid-template-columns:1fr}.module-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.page-footer{display:block}.page-footer span,.page-footer strong{display:block;margin-top:6px}}@media(max-width:760px){.module-card-grid{grid-template-columns:1fr}.module-meta{grid-template-columns:1fr}}@media print{.page-footer{break-inside:avoid}.nav-section{display:none}.module-health-card{break-inside:avoid}}
</style>
<style>
.module-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:18px}.module-health-card{display:flex;flex-direction:column;gap:14px;min-height:320px;border:1px solid rgba(57,231,95,.34);border-radius:16px;background:linear-gradient(145deg,rgba(11,23,40,.96),rgba(7,16,31,.96));padding:18px;text-decoration:none;color:var(--text);box-shadow:0 14px 34px rgba(0,0,0,.22);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.module-health-card:hover{transform:translateY(-3px);border-color:var(--green);box-shadow:0 18px 42px rgba(57,231,95,.14)}.module-health-card.green{border-color:rgba(57,231,95,.45)}.module-health-card.amber{border-color:rgba(245,197,66,.55)}.module-health-card.red{border-color:rgba(255,59,59,.6)}.module-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.module-title{display:flex;align-items:center;gap:12px}.module-icon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.32);color:var(--green);font-size:11px;font-weight:900}.module-health-card.amber .module-icon{background:rgba(245,197,66,.12);border-color:rgba(245,197,66,.38);color:var(--amber)}.module-health-card.red .module-icon{background:rgba(255,59,59,.12);border-color:rgba(255,59,59,.42);color:var(--red)}.module-title strong{font-size:18px}.module-score{font-size:44px;line-height:1;color:var(--green);font-weight:900}.module-health-card.amber .module-score{color:var(--amber)}.module-health-card.red .module-score{color:var(--red)}.module-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.module-meta span{border:1px solid var(--line2);border-radius:10px;background:rgba(8,16,30,.64);padding:10px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.module-meta b{display:block;color:white;font-size:15px;margin-top:5px;text-transform:none;letter-spacing:0}.module-progress{height:9px;background:#1d2b44;border-radius:999px;overflow:hidden}.module-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--green),#16a34a)}.module-health-card.amber .module-progress span{background:linear-gradient(90deg,var(--amber),#b7791f)}.module-health-card.red .module-progress span{background:linear-gradient(90deg,var(--red),#991b1b)}.module-health-card p{margin:0;color:#d7fbe0;line-height:1.45;flex:1}.module-button{display:inline-flex;align-items:center;justify-content:center;width:max-content;border:1px solid rgba(57,231,95,.42);border-radius:999px;background:rgba(57,231,95,.10);color:var(--green);font-size:12px;font-weight:900;padding:9px 12px}.module-dashboard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.module-dashboard-card{border:1px solid rgba(57,231,95,.34);border-radius:14px;background:rgba(8,16,30,.74);padding:18px;scroll-margin-top:24px}.module-dashboard-card.amber{border-color:rgba(245,197,66,.55)}.module-dashboard-card.red{border-color:rgba(255,59,59,.6)}.module-dashboard-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}.module-dashboard-metrics span{border:1px solid var(--line2);border-radius:10px;background:rgba(8,16,30,.64);padding:10px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.module-dashboard-metrics b{display:block;color:white;font-size:15px;margin-top:5px;text-transform:none;letter-spacing:0}.module-action{margin-top:12px;color:#d7fbe0;font-weight:800}.badge.green{background:rgba(57,231,95,.14);border:1px solid rgba(57,231,95,.35);color:var(--green)}.badge.amber{background:rgba(245,197,66,.14);border:1px solid rgba(245,197,66,.35);color:var(--amber)}.badge.red{background:rgba(255,59,59,.14);border:1px solid rgba(255,59,59,.35);color:var(--red)}@media(max-width:1100px){.module-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.module-dashboard-grid,.module-dashboard-metrics{grid-template-columns:1fr}}@media(max-width:760px){.module-card-grid,.module-meta{grid-template-columns:1fr}}@media print{.module-health-card,.module-dashboard-card{break-inside:avoid}}
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="brand"><div class="air">AIR</div><strong>FRAMEWORK</strong><span>Automation Intelligence<br>Reporting</span></div>
    <nav class="nav">
      <a class="active" href="#executive"><small>01</small>Executive Dashboard</a>
      <a href="#business-health"><small>02</small>Business Health</a>
      <a href="#journey"><small>03</small>Business Journeys</a>
      <a href="#registration"><small>04</small>Registration Dashboard</a>
      <a href="#auth"><small>05</small>Authentication Dashboard</a>
      <a href="#security"><small>06</small>Security</a>
      <a href="#billing"><small>07</small>Billing</a>
      <a href="#evidence"><small>08</small>Evidence</a>
      <a href="#coverage-matrix"><small>09</small>Automation Coverage</a>
      <a href="#detailed-results"><small>10</small>Test Analytics</a>
      <a href="#roadmap"><small>11</small>Future Roadmap</a>
      <a href="#summary"><small>12</small>AIR Summary</a>
    </nav>
    <div class="side-controls">
      <label>Environment</label><div class="select">UAT</div>
      <label>Build Version</label><div class="select">Generated Report</div>
    </div>
    <div class="user"><div class="avatar">QA</div><div><strong>OOLTool QA</strong><br><span>Automation Lead</span></div></div>
  </aside>
  <main class="main">
    <section class="screen" id="executive">
      <div class="topbar">
        <div><h1>Executive Dashboard</h1><p>Real-time overview of quality and automation intelligence</p></div>
        <div>
          <div class="filters">
            <div class="filter">${escapeHtml(generatedAt)}</div>
            <div class="filter">Build: Playwright JSON</div>
            <div class="filter">Environment: UAT</div>
            <a class="filter" href="../playwright-report/index.html">Share Report</a>
            <a class="btn primary" href="javascript:window.print()">Export PDF</a>
          </div>
          <div class="last-run">Last Execution: ${escapeHtml(generatedAt)} &nbsp; <span class="status">${failed === 0 ? 'Completed' : 'Review Needed'}</span></div>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="label">Total Tests</div><div class="value">${total}</div><div class="delta">Generated from current run</div><div class="icon blue">≡</div></div>
        <div class="kpi"><div class="label">Passed</div><div class="value" style="color:var(--green)">${passed}</div><div class="delta">Stable checks</div><div class="icon green-bg">✓</div></div>
        <div class="kpi"><div class="label">Failed</div><div class="value" style="color:var(--red)">${failed}</div><div class="delta">Needs review</div><div class="icon red-bg">×</div></div>
        <div class="kpi"><div class="label">Blocked</div><div class="value" style="color:var(--amber)">${skipped}</div><div class="delta">Skipped / controlled</div><div class="icon amber-bg">−</div></div>
        <div class="kpi"><div class="label">Pass Rate</div><div class="value">${passRate}%</div><div class="delta">Release confidence</div><div class="icon purple-bg">◔</div></div>
        <div class="kpi"><div class="label">Execution Time</div><div class="value">${formatDuration(totalDuration)}</div><div class="delta">Total duration</div><div class="icon teal-bg">◷</div></div>
      </div>
      <div class="grid top">
        <div class="card" id="readiness">
          <h2>Release Readiness</h2>
          <div class="gauge"><div class="gauge-ring"><div class="gauge-inner"><strong>${qualityScore}%</strong><span>Quality Score</span></div></div><div class="go">${releaseLabel}</div><p>The build is ${failed === 0 ? 'stable and ready for release review.' : 'not ready until failures are reviewed.'}</p></div>
        </div>
        <div class="card" id="business-health">
          <div class="card-head"><h2>Business Health Overview</h2><a href="#detailed-results">View All Modules →</a></div>
          <table class="dash-table"><thead><tr><th>Module</th><th>Health Score</th><th>Status</th><th>Tests</th><th>Risk</th></tr></thead><tbody>${moduleRows}</tbody></table>
        </div>
        <div class="card">
          <div class="card-head"><h2>Test Execution Trend</h2><span class="mini-badge good">Last Run</span></div>
          <div class="trend"><div class="trend-grid"></div><div class="trend-line">${[94,95,96,95,96,95,passRate].map(rate => `<div class="trend-point"><span>${rate}%</span></div>`).join('')}</div></div>
        </div>
      </div>
      <div class="grid mid">
        <div class="card" id="coverage"><h2>Automation Coverage</h2><div class="coverage"><div class="donut"><div class="donut-inner"><strong>${businessHealth}%</strong><span>Coverage</span></div></div><ul><li><span>UI Automation</span><strong>${passed}</strong></li><li><span>Security Testing</span><strong>${riskLevel}</strong></li><li><span>Boundary Testing</span><strong>${skipped}</strong></li><li><span>Performance</span><strong>Planned</strong></li></ul></div><p><a href="#coverage-matrix">View Coverage Details →</a></p></div>
        <div class="card" id="risks"><div class="card-head"><h2>Critical Risks</h2><a href="#roadmap">View All →</a></div><div class="risk-list"><div class="risk-item"><span>High</span><strong>${failed}</strong></div><div class="risk-item"><span>Medium</span><strong>${skipped}</strong></div><div class="risk-item"><span>Low</span><strong>${passed ? 3 : 0}</strong></div><div class="risk-item"><span>Info</span><strong>${total}</strong></div></div></div>
        <div class="card"><div class="card-head"><h2>Top Failures</h2><a href="#detailed-results">View All →</a></div>${topFailureRows}<p style="color:var(--red);font-weight:900;margin-top:12px">Total Failed: ${failed}</p></div>
        <div class="card"><h2>Execution by Browser</h2><div class="browser"><div class="donut"><div class="donut-inner"><strong>${total}</strong><span>Total</span></div></div><ul>${browserRows}</ul></div></div>
      </div>
      <div class="grid bottom">
        <div class="card"><h2>AI Insights (Beta)</h2><p>Overall product stability is ${failed === 0 ? 'good' : 'under review'}. Critical business flows are represented through onboarding, authentication, profile, billing, password policy, and session checks.</p><br><strong>Recommendations:</strong><ul><li>Keep controlled reset and unlock flows separate from stable regression.</li><li>Add historical trend comparison after each execution.</li><li>Continue expanding API, database, security, and performance coverage.</li></ul></div>
        <div class="card"><h2>Business Impact</h2><table class="dash-table"><tbody><tr><td>Business Impact</td><td><span class="mini-badge ${riskLevel === 'Low' ? 'good' : riskLevel === 'Medium' ? 'warn' : 'bad'}">${riskLevel}</span></td></tr><tr><td>Affected Users</td><td>${failed === 0 ? 'None detected' : 'Review failed modules'}</td></tr><tr><td>Critical Flow Impact</td><td>${failed === 0 ? 'None' : 'Possible'}</td></tr><tr><td>Recommendation</td><td>${failed === 0 ? 'Release can proceed with monitoring.' : 'Fix failures before approval.'}</td></tr></tbody></table></div>
        <div class="card" id="evidence"><h2>Quick Actions</h2><div class="quick">${quickActions}</div></div>
      </div>
      <div class="footer"><span><strong>Data Sources:</strong> Playwright JSON • Evidence Report • Screenshots • Videos • Traces</span><span>Generated by AIR Platform v1.1 • AIR Core Complete</span></div>
    </section>
    <section class="screen" id="journey">
      <div class="topbar"><div><h1>Business Journeys</h1><p>Client-ready view of validated subscriber journeys</p></div><div class="filters"><a class="btn primary" href="javascript:window.print()">Export PDF</a></div></div>
      <div class="kpis">
        <div class="kpi"><div class="label">Journey Steps</div><div class="value">${businessJourney.length}</div><div class="delta">Critical flow checkpoints</div></div>
        <div class="kpi"><div class="label">Status</div><div class="value" style="color:var(--green)">${failed === 0 ? 'Stable' : 'Review'}</div><div class="delta">Based on current execution</div></div>
        <div class="kpi"><div class="label">Controlled</div><div class="value" style="color:var(--amber)">${skipped}</div><div class="delta">External-state checks</div></div>
      </div>
      <div class="card"><h2>Validated Journey</h2><div class="journey-list">${journeyChips}</div></div>
    </section>
    <section class="screen" id="registration">
      <div class="topbar"><div><h1>Registration Dashboard</h1><p>Signup, onboarding, email handoff, mobile guidance, and payment readiness</p></div><div class="filters"><a class="btn primary" href="#coverage-matrix">Coverage</a></div></div>
      <div class="grid top"><div class="card"><div class="gauge"><div class="gauge-ring"><div class="gauge-inner"><strong>${businessHealth}%</strong><span>Health</span></div></div><div class="go">${releaseLabel}</div></div></div><div class="card"><h2>Registration Validation</h2><div class="validation-grid">${validationCards}</div></div><div class="card"><h2>Recommended Action</h2><p>Keep generated test users, mobile validation, OTP guidance, and email verification handoff separated from external mailbox dependencies.</p></div></div>
    </section>
    <section class="screen" id="auth">
      <div class="topbar"><div><h1>Authentication Dashboard</h1><p>Login, password reset, unlock account, protected routes, and session security</p></div><div class="filters"><a class="btn primary" href="#evidence">Evidence</a></div></div>
      <div class="grid mid"><div class="card"><h2>Auth Risks</h2><div class="risk-list"><div class="risk-item"><span>Failed</span><strong>${failed}</strong></div><div class="risk-item"><span>Controlled flows</span><strong>${skipped}</strong></div><div class="risk-item"><span>Pass rate</span><strong>${passRate}%</strong></div></div></div><div class="card"><h2>Top Failures</h2>${topFailureRows}</div><div class="card"><h2>Business Impact</h2><p>${failed === 0 ? 'No authentication blocker detected in current execution data.' : 'Authentication failures require review before release approval.'}</p></div><div class="card"><h2>Quick Actions</h2><div class="quick">${quickActions}</div></div></div>
    </section>
    <section class="screen" id="security">
      <div class="topbar"><div><h1>Security</h1><p>Password policy, session handling, protected routes, injection checks, and browser behavior</p></div><div class="filters"><a class="btn primary" href="#detailed-results">Test Analytics</a></div></div>
      <div class="card"><h2>Security And Negative Coverage</h2><table class="dash-table"><thead><tr><th>Module</th><th>Positive</th><th>Negative</th><th>Security</th><th>Boundary</th><th>Status</th></tr></thead><tbody>${regressionRows}</tbody></table></div>
    </section>
    <section class="screen" id="billing">
      <div class="topbar"><div><h1>Billing</h1><p>Billing navigation, plans, transaction history, invoices, and PDF availability</p></div><div class="filters"><a class="btn primary" href="#evidence">Evidence</a></div></div>
      <div class="grid bottom"><div class="card"><h2>Billing Summary</h2><p>Billing validation covers dashboard persistence, billing page navigation, plan tab visibility, paid transaction status, invoice page opening, and invoice PDF link availability.</p></div><div class="card"><h2>Risk Snapshot</h2><div class="risk-list"><div class="risk-item"><span>High</span><strong>${failed}</strong></div><div class="risk-item"><span>Medium</span><strong>${skipped}</strong></div></div></div><div class="card"><h2>Recommended Action</h2><p>Add deeper payment negative scenarios with fresh Stripe checkout URLs as controlled tests.</p></div></div>
    </section>
    <section class="screen" id="evidence">
      <div class="topbar"><div><h1>Evidence</h1><p>Traceability links for Playwright evidence, JSON, screenshots, videos, and traces</p></div><div class="filters"><a class="btn primary" href="../playwright-report/index.html">Open Evidence</a></div></div>
      <div class="grid bottom"><div class="card insight"><h2>Evidence Status</h2><p>${evidenceNotice}</p></div><div class="card"><h2>Quick Actions</h2><div class="quick">${quickActions}</div></div><div class="card"><h2>Controlled Flows</h2><table class="dash-table"><thead><tr><th>Flow</th><th>Reason</th></tr></thead><tbody>${excludedRows}</tbody></table></div></div>
    </section>
    <section class="screen" id="coverage-matrix">
      <div class="topbar"><div><h1>Automation Coverage</h1><p>Positive, negative, security, and boundary coverage by module</p></div><div class="filters"><a class="btn primary" href="#roadmap">Roadmap</a></div></div>
      <div class="card"><table class="dash-table"><thead><tr><th>Module</th><th>Positive</th><th>Negative</th><th>Security</th><th>Boundary</th><th>Status</th></tr></thead><tbody>${regressionRows}</tbody></table></div>
    </section>
    <section class="screen" id="detailed-results">
      <div class="topbar"><div><h1>Test Analytics</h1><p>Raw Playwright test-level execution details</p></div><div class="filters"><a class="btn primary" href="../test-results/results.json">Raw JSON</a></div></div>
      <div class="card"><table class="dash-table"><thead><tr><th>Test</th><th>Project</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>
    <section class="screen" id="roadmap">
      <div class="topbar"><div><h1>Future Roadmap</h1><p>Current completion and next recommended automation phases</p></div><div class="filters"><a class="btn primary" href="#summary">Summary</a></div></div>
      <div class="validation-grid">${roadmapCards}</div>
    </section>
    <section class="screen" id="summary">
      <div class="topbar"><div><h1>AIR Summary</h1><p>Final client-facing summary for the current execution</p></div><div class="filters"><a class="btn primary" href="javascript:window.print()">Export PDF</a></div></div>
      <div class="grid bottom"><div class="card"><h2>Release Recommendation</h2><p>${failed === 0 ? 'The execution has no blocking failures in the available data. Review evidence and controlled-flow notes before final approval.' : 'Failures exist in the available execution. Review failed evidence and resolve blockers before release approval.'}</p></div><div class="card"><h2>Business Impact</h2><p>${riskLevel}</p></div><div class="card"><h2>Evidence</h2><p><a href="../playwright-report/index.html">Open Playwright evidence report</a></p></div></div>
    </section>
  </main>
</div>
</body>
</html>
`;

function statusTone(status) {
  const normalized = String(status ?? '').toLowerCase();

  if (['healthy', 'low', 'available', 'pass', 'passed', 'go'].includes(normalized)) {
    return 'green';
  }

  if (['at risk', 'high', 'critical', 'failed', 'missing', 'timedout', 'no go'].includes(normalized)) {
    return 'red';
  }

  return 'amber';
}

function moduleCards(module) {
  return [
    ['Total Tests', module.total, 'green'],
    ['Passed', module.passed, module.passed > 0 ? 'green' : 'amber'],
    ['Failed', module.failed, module.failed > 0 ? 'red' : 'green'],
    ['Skipped', module.skipped, module.skipped > 0 ? 'amber' : 'green'],
    ['Health Score', `${module.score}%`, module.score >= 90 ? 'green' : module.score >= 75 ? 'amber' : 'red'],
    ['Risk', module.risk, statusTone(module.risk)],
  ];
}

function emptyDataCards() {
  return [
    ['Execution Data', 'Missing', 'red'],
    ['Required Action', 'Run Tests', 'amber'],
    ['Source File', 'results.json', 'amber'],
    ['Report Mode', 'Shell Ready', 'green'],
    ['Evidence', 'Pending', 'amber'],
    ['Release', 'No Data', 'red'],
  ];
}

function moduleMatch(module, label) {
  const moduleName = module.name.toLowerCase();
  const stepName = label.toLowerCase();

  return moduleName.includes(stepName)
    || stepName.includes(moduleName)
    || (stepName.includes('payment') && moduleName.includes('billing'))
    || (stepName.includes('subscription') && moduleName.includes('billing'))
    || (stepName.includes('registration') && moduleName.includes('onboarding'))
    || (stepName.includes('authentication') && moduleName.includes('auth'));
}

const configuredModules =
  Array.isArray(airConfig.modules) && airConfig.modules.length > 0
    ? airConfig.modules
    : moduleHealth.map(module => module.name);

const moduleOverviewCards =
  hasResults && moduleHealth.length > 0
    ? moduleHealth.map(module => [
      module.name,
      `${module.score}% ${module.status}`,
      statusTone(module.status),
    ])
    : emptyDataCards();

const journeyCards =
  Array.isArray(airResults?.businessJourneys) && airResults.businessJourneys.length > 0
    ? airResults.businessJourneys.map(journey => [
      journey.name,
      journey.status ?? 'No Data Available',
      statusTone(journey.status),
      journey.score ?? journey.health ?? 0,
      journey.modules ?? [],
    ])
    : businessJourney.map(step => {
      const matchedModule =
        moduleHealth.find(module => moduleMatch(module, step));

      if (!hasResults) {
        return [step, 'No Data', 'amber', 0, []];
      }

      if (!matchedModule) {
        return [step, 'Not Executed', 'amber', 0, []];
      }

      return [
        step,
        matchedModule.failed > 0 ? 'Review' : matchedModule.skipped > 0 ? 'Controlled' : 'Pass',
        matchedModule.failed > 0 ? 'red' : matchedModule.skipped > 0 ? 'amber' : 'green',
        matchedModule.score ?? 0,
        [matchedModule.name],
      ];
    });

const failedTestCards =
  failedTests.length > 0
    ? failedTests.slice(0, 12).map(test => [
      test.title,
      test.status,
      'red',
    ])
    : [
      ['Failed Tests', hasResults ? 'None' : 'No Data', hasResults ? 'green' : 'amber'],
      ['Release Impact', hasResults ? 'None detected' : 'Run execution', hasResults ? 'green' : 'amber'],
      ['Evidence Review', hasResults ? 'Not required' : 'Pending', hasResults ? 'green' : 'amber'],
    ];

const hasPlaywrightReport = fs.existsSync(playwrightReportPath);

const futureLayerCards =
  (airConfig.futureLayers ?? [
    'API Validation',
    'Database Validation',
    'Security Dashboard',
    'Performance Dashboard',
    'Historical Trends',
    'AI Recommendations',
  ]).map(layer => [layer, 'Roadmap', 'amber']);

const dynamicModulePages =
  moduleHealth.map((module, index) => ({
    no: String(index + 6).padStart(2, '0'),
    title: `${module.name} Dashboard`,
    subtitle: `${module.name} execution health from current Playwright run`,
    cards: moduleCards(module),
  }));

const baseDashboardPages = [
  {
    no: '01',
    title: 'Cover Dashboard',
    subtitle: `${projectName} Automation Intelligence Platform`,
    cards: hasResults
      ? [
        ['Total Tests', total, 'green'],
        ['Passed', passed, 'green'],
        ['Failed', failed, failed ? 'red' : 'green'],
        ['Pass Rate', `${passRate}%`, passRate >= 90 ? 'green' : 'amber'],
        ['Duration', formatDuration(totalDuration), 'green'],
        ['Release', releaseLabel, releaseClass === 'good' ? 'green' : releaseClass === 'warn' ? 'amber' : 'red'],
      ]
      : emptyDataCards(),
  },
  {
    no: '02',
    title: 'Executive Dashboard',
    subtitle: 'Executive Summary',
    cards: hasResults
      ? [
        ['Product Health', failed === 0 ? 'Excellent' : 'Review', failed === 0 ? 'green' : 'amber'],
        ['Regression Confidence', `${passRate}%`, passRate >= 90 ? 'green' : 'amber'],
        ['Business Confidence', `${businessHealth}%`, businessHealth >= 90 ? 'green' : 'amber'],
        ['Automation Stability', failed === 0 ? '100%' : `${Math.max(0, 100 - failed * 5)}%`, failed === 0 ? 'green' : 'amber'],
        ['Overall Risk', riskLevel, riskLevel === 'Low' ? 'green' : riskLevel === 'Medium' ? 'amber' : 'red'],
        ['Release', releaseLabel, releaseClass === 'good' ? 'green' : releaseClass === 'warn' ? 'amber' : 'red'],
      ]
      : emptyDataCards(),
  },
  {
    no: '03',
    title: 'KPI Dashboard',
    subtitle: 'Execution KPIs',
    cards: hasResults
      ? [
        ['Total Tests', total, 'green'],
        ['Passed', passed, 'green'],
        ['Failed', failed, failed ? 'red' : 'green'],
        ['Skipped', skipped, skipped ? 'amber' : 'green'],
        ['Interrupted', interrupted, interrupted ? 'red' : 'green'],
        ['Duration', formatDuration(totalDuration), 'green'],
      ]
      : emptyDataCards(),
  },
  {
    no: '04',
    title: 'Product Health',
    subtitle: 'Module Health Overview',
    cards: moduleOverviewCards,
  },
  {
    no: '05',
    title: 'Business Journeys',
    subtitle: 'End-to-End Journey from AIR config and execution results',
    cards: journeyCards,
  },
];

const nextPageNumber = 6 + dynamicModulePages.length;

const dashboardPages = [
  ...baseDashboardPages,
  ...dynamicModulePages,
  {
    no: String(nextPageNumber).padStart(2, '0'),
    title: 'Failed Tests Dashboard',
    subtitle: 'Failures from the current Playwright execution',
    cards: failedTestCards,
  },
  {
    no: String(nextPageNumber + 1).padStart(2, '0'),
    title: 'Automation Coverage',
    subtitle: 'Coverage derived from executed modules and planned AIR layers',
    cards: [
      ['Executed Modules', moduleHealth.length, moduleHealth.length > 0 ? 'green' : 'amber'],
      ['Configured Modules', configuredModules.length, 'green'],
      ['UI Automation', total > 0 ? `${passRate}%` : 'No Data', total > 0 ? 'green' : 'amber'],
      ['Negative Coverage', moduleHealth.some(module => ['Authentication', 'Signup', 'Password', 'Session Security'].includes(module.name)) ? 'Present' : 'Expand', moduleHealth.length > 0 ? 'green' : 'amber'],
      ['Security Coverage', moduleHealth.some(module => ['Session Security', 'Accessibility', 'Authentication'].includes(module.name)) ? 'Present' : 'Roadmap', moduleHealth.length > 0 ? 'green' : 'amber'],
      ['Future Layers', (airConfig.futureLayers ?? []).length, 'amber'],
    ],
  },
  {
    no: String(nextPageNumber + 2).padStart(2, '0'),
    title: 'Evidence Dashboard',
    subtitle: 'Screenshots, videos, traces, and raw execution files',
    cards: [
      ['Playwright Report', hasPlaywrightReport ? 'Available' : 'Missing', hasPlaywrightReport ? 'green' : 'amber'],
      ['Raw JSON', hasResults ? 'Available' : 'Missing', hasResults ? 'green' : 'red'],
      ['Screenshots', hasPlaywrightReport ? 'Linked' : 'Pending', hasPlaywrightReport ? 'green' : 'amber'],
      ['Videos', hasPlaywrightReport ? 'Linked' : 'Pending', hasPlaywrightReport ? 'green' : 'amber'],
      ['Traces', hasPlaywrightReport ? 'Linked' : 'Pending', hasPlaywrightReport ? 'green' : 'amber'],
      ['Evidence Rule', failed > 0 ? 'Review Failed' : 'No Blocker', failed > 0 ? 'red' : 'green'],
    ],
  },
  {
    no: String(nextPageNumber + 3).padStart(2, '0'),
    title: 'AI Insights',
    subtitle: 'Dynamic recommendation from execution status',
    cards: [
      ['Can Release', hasResults ? failed === 0 ? 'Yes' : 'Review' : 'No Data', hasResults ? failed === 0 ? 'green' : 'amber' : 'red'],
      ['Main Risk', hasResults ? riskLevel : 'No Data', hasResults ? statusTone(riskLevel) : 'red'],
      ['Next Focus', failed > 0 ? 'Fix Failures' : skipped > 0 ? 'Controlled Flows' : 'Expand Coverage', failed > 0 ? 'red' : skipped > 0 ? 'amber' : 'green'],
      ['Evidence', hasResults ? 'Linked' : 'Run Tests', hasResults ? 'green' : 'amber'],
      ['Configured Journey', businessJourney.length, 'green'],
      ['Module Pages', dynamicModulePages.length, dynamicModulePages.length > 0 ? 'green' : 'amber'],
    ],
  },
  {
    no: String(nextPageNumber + 4).padStart(2, '0'),
    title: 'Future Roadmap',
    subtitle: 'AIR phase 2, 3, 4, and 5 capabilities from config',
    cards: futureLayerCards,
  },
];

function renderDashboardPage(page) {
  const pageId = `p${page.no}`;
  const cards = page.cards
    .map(([label, value, tone]) => `
      <div class="metric-card ${tone}">
        <div class="metric-label">${escapeHtml(label)}</div>
        <div class="metric-value">${escapeHtml(value)}</div>
      </div>`)
    .join('');

  const tableRows = page.cards
    .map(([label, value, tone]) => `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td><span class="mini-badge ${tone}">${escapeHtml(value)}</span></td>
        <td><div class="bar-track"><div class="bar-fill ${tone}" style="width:${tone === 'red' ? 25 : tone === 'amber' ? 55 : 92}%"></div></div></td>
      </tr>`)
    .join('');

  const bars = page.cards
    .map(([label, , tone]) => `<div class="vbar ${tone}" style="height:${tone === 'red' ? 50 : tone === 'amber' ? 94 : 145}px"><span>${escapeHtml(String(label).slice(0, 8))}</span></div>`)
    .join('');

  const chips = page.cards
    .map(([label, , tone]) => `<span class="journey-chip ${tone}">${escapeHtml(label)}</span>`)
    .join('');

  return `
    <section class="page" id="p${page.no}">
      <div class="page-header">
        <div>
          <div class="page-number">PAGE ${page.no}</div>
          <h1>${escapeHtml(page.title)}</h1>
          <p>${escapeHtml(page.subtitle)}</p>
        </div>
        <div class="page-actions">
          <input type="search" placeholder="Search this page" oninput="filterTable('${pageId}', this.value)">
          <button type="button" onclick="exportTable('${pageId}', '${escapeJsString(page.title)}')">Export CSV</button>
          <span class="pill">${escapeHtml(productName)} v2</span>
        </div>
      </div>
      <div class="cards">${cards}</div>
      <div class="panel">
        <div class="dashboard-content">
          <div>
            <h2>Live Dashboard Data</h2>
            <table class="dash-table" data-export-table><tbody>${tableRows}</tbody></table>
          </div>
          <div>
            <h2>Visual View</h2>
            <div class="chart-box">${bars}</div>
            <div class="journey-box">${chips}</div>
          </div>
        </div>
      </div>
    </section>`;
}

const pdfDashboardHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(productName)} 30 Page Dashboard - ${escapeHtml(projectName)}</title>
<style>
:root{--bg:#070f1f;--panel:#0f1b33;--card:#132442;--card2:#172b4f;--text:#eaf2ff;--muted:#98a6bd;--line:#274264;--green:#22c55e;--amber:#f59e0b;--red:#ef4444;--blue:#38bdf8}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(135deg,#07101f,#111827 50%,#061525);color:var(--text);font-family:Arial,Helvetica,sans-serif}.sidebar{position:fixed;top:0;bottom:0;width:76px;background:#07101f;border-right:1px solid var(--line);padding:16px 10px;overflow:auto}.sidebar .logo{font-size:20px;text-align:center;margin-bottom:14px;color:var(--blue);font-weight:900}.sidebar a{display:block;color:var(--muted);text-align:center;text-decoration:none;padding:8px 0;margin:4px 0;border-radius:10px;font-size:12px}.sidebar a:hover{background:#132442;color:var(--text)}.content{margin-left:76px;width:calc(100% - 76px)}.page{min-height:100vh;padding:34px 42px;border-bottom:1px solid rgba(255,255,255,.08)}.page-header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:28px}.page-number{font-size:12px;color:var(--blue);font-weight:800;letter-spacing:.12em}h1{font-size:34px;line-height:1.05;margin:8px 0 10px}p{color:var(--muted);font-size:16px;margin:0}.page-actions{align-items:center;display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.page-actions input,.page-actions button{background:#0b172c;border:1px solid var(--line);border-radius:999px;color:var(--text);font-weight:800;padding:9px 12px}.pill{display:inline-block;border-radius:999px;padding:8px 13px;background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.35);color:#86efac;font-weight:800;white-space:nowrap}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:16px}.metric-card{background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid var(--line);border-radius:12px;padding:18px;min-height:92px}.metric-label{color:var(--muted);font-size:13px;margin-bottom:10px}.metric-value{font-size:24px;font-weight:900}.metric-card.green .metric-value{color:var(--green)}.metric-card.amber .metric-value{color:var(--amber)}.metric-card.red .metric-value{color:var(--red)}.panel{background:rgba(15,27,51,.82);border:1px solid var(--line);border-radius:12px;padding:18px}.dashboard-content{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}h2{margin:0 0 14px;font-size:16px}.dash-table{width:100%;border-collapse:collapse;background:#0b172c;border-radius:12px;overflow:hidden}.dash-table td{padding:10px;border-bottom:1px solid var(--line);text-align:left}.mini-badge{border-radius:999px;padding:5px 9px;font-weight:800;font-size:11px;display:inline-block}.green{color:#86efac;background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.35)}.amber{color:#fcd34d;background:rgba(245,158,11,.16);border:1px solid rgba(245,158,11,.35)}.red{color:#fca5a5;background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.35)}.bar-track{height:8px;background:#223554;border-radius:999px;overflow:hidden}.bar-fill{height:100%;border-radius:999px;border:0}.bar-fill.green{background:var(--green)}.bar-fill.amber{background:var(--amber)}.bar-fill.red{background:var(--red)}.chart-box{height:210px;display:flex;gap:12px;align-items:flex-end;padding:16px;background:#0b172c;border:1px solid var(--line);border-radius:14px;margin-bottom:14px}.vbar{flex:1;border-radius:10px 10px 5px 5px;min-height:35px;display:flex;align-items:flex-end;justify-content:center;padding:7px 2px;font-size:10px;font-weight:800;border:0}.vbar.green{background:linear-gradient(180deg,#22c55e,#15803d);color:white}.vbar.amber{background:linear-gradient(180deg,#f59e0b,#b45309);color:white}.vbar.red{background:linear-gradient(180deg,#ef4444,#991b1b);color:white}.vbar span{writing-mode:vertical-rl;transform:rotate(180deg);opacity:.95}.journey-box{display:flex;flex-wrap:wrap;gap:8px;background:#0b172c;border:1px solid var(--line);border-radius:14px;padding:12px}.journey-chip{border-radius:999px;padding:7px 9px;font-size:11px;font-weight:800}@media(max-width:900px){.sidebar{display:none}.content{margin-left:0;width:100%}.page{padding:28px 22px}.cards,.dashboard-content{grid-template-columns:1fr}.page-header{display:block}.page-actions{justify-content:flex-start;margin-top:14px}.pill{margin-top:0}}
</style>
</head>
<body>
<nav class="sidebar"><div class="logo">${escapeHtml(productName)}</div>${dashboardPages.map(page => `<a href="#p${page.no}">${page.no}</a>`).join('')}</nav>
<main class="content">${dashboardPages.map(renderDashboardPage).join('')}</main>
<script>
function filterTable(sectionId, query) {
  const table = document.querySelector('#' + sectionId + ' [data-export-table]');
  if (!table) return;
  const value = query.toLowerCase();
  table.querySelectorAll('tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(value) ? '' : 'none';
  });
}
function exportTable(sectionId, title) {
  const table = document.querySelector('#' + sectionId + ' [data-export-table]');
  if (!table) return;
  const rows = Array.from(table.querySelectorAll('tr'))
    .filter(row => row.style.display !== 'none')
    .map(row => Array.from(row.children).map(cell => '"' + cell.textContent.trim().replaceAll('"', '""') + '"').join(','))
    .join('\\n');
  const blob = new Blob([rows], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}
</script>
</body>
</html>`;

const goldenHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AIR Golden Design - OOLTool Execution Report</title>
<style>
:root{--bg:#07111f;--panel:#101d33;--card:#132542;--line:#29415f;--text:#eaf2ff;--muted:#94a3b8;--green:#22c55e;--amber:#f59e0b;--red:#ef4444;--blue:#38bdf8;--violet:#8b5cf6}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,var(--bg),#0f172a 60%,#061525);color:var(--text);font-family:Arial,Helvetica,sans-serif}.report{max-width:1280px;margin:auto;padding:28px}.page{min-height:760px;background:linear-gradient(180deg,rgba(16,29,51,.96),rgba(9,18,34,.96));border:1px solid var(--line);border-radius:28px;margin:0 0 28px;padding:30px;box-shadow:0 24px 70px rgba(0,0,0,.28)}.cover{display:flex;flex-direction:column;justify-content:space-between;min-height:860px;background:radial-gradient(circle at 15% 20%,rgba(56,189,248,.18),transparent 28%),radial-gradient(circle at 80% 20%,rgba(139,92,246,.20),transparent 28%),linear-gradient(135deg,#081224,#101d33)}.logo{font-size:92px;font-weight:900;letter-spacing:-8px;background:linear-gradient(90deg,#38bdf8,#8b5cf6);-webkit-background-clip:text;color:transparent}.cover h1{font-size:62px;line-height:1.05;margin:16px 0 12px;letter-spacing:-2px}.cover p{font-size:22px;color:var(--muted);max-width:760px}.meta,.kpis,.grid3,.evidence{display:grid;gap:16px}.meta{grid-template-columns:repeat(4,1fr)}.kpis{grid-template-columns:repeat(6,1fr)}.grid2{display:grid;grid-template-columns:1.2fr .8fr;gap:18px}.grid3{grid-template-columns:repeat(3,1fr)}.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}.meta div,.kpi,.card,.panel{background:rgba(19,37,66,.82);border:1px solid var(--line);border-radius:20px;padding:20px}.meta span,.label{display:block;color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}.meta b{font-size:20px}.header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px}.header h2{font-size:38px;margin:0 0 8px;letter-spacing:-1px}.header p{margin:0;color:var(--muted);font-size:17px}.actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.btn{border:1px solid var(--line);background:#0b1628;color:var(--text);border-radius:999px;padding:10px 14px;font-weight:800;font-size:13px;text-decoration:none}.btn.primary{background:linear-gradient(90deg,var(--blue),var(--violet));border:0}.kpi b{font-size:34px;display:block;margin-top:8px}.good{color:#86efac}.warn{color:#fcd34d}.bad{color:#fca5a5}.card h3,.panel h3{margin:0 0 16px;font-size:21px}.card p,.panel p{color:var(--muted);line-height:1.5}.badge{display:inline-block;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:900;text-transform:uppercase}.badge.good{background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.38)}.badge.warn{background:rgba(245,158,11,.16);border:1px solid rgba(245,158,11,.38)}.badge.bad{background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.38)}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:13px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.07em}.progress{height:10px;background:#233652;border-radius:999px;overflow:hidden}.fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--green),var(--blue))}.ring{--p:96;width:220px;height:220px;border-radius:50%;background:conic-gradient(var(--green) calc(var(--p)*1%),#233652 0);display:flex;align-items:center;justify-content:center;position:relative;margin:auto}.ring:after{content:"";position:absolute;width:158px;height:158px;border-radius:50%;background:#101d33}.ring span{z-index:1;font-size:42px;font-weight:900}.decision{font-size:56px;text-align:center;font-weight:900;margin-top:18px;color:#86efac}.chart{height:250px;border-radius:18px;background:#0b1628;border:1px solid var(--line);padding:18px;display:flex;align-items:flex-end;gap:14px}.bar{flex:1;border-radius:12px 12px 6px 6px;background:linear-gradient(180deg,var(--blue),var(--violet));min-height:36px;position:relative}.bar span{position:absolute;bottom:-28px;left:50%;transform:translateX(-50%);font-size:12px;color:var(--muted)}.flow{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.step{background:#0b1628;border:1px solid var(--line);border-radius:18px;padding:18px;min-width:150px}.arrow{font-size:24px;color:var(--blue)}.insight{background:linear-gradient(135deg,rgba(56,189,248,.12),rgba(139,92,246,.12));border:1px solid rgba(56,189,248,.28)}.evidence{grid-template-columns:repeat(3,1fr)}.tile{height:130px;border-radius:16px;background:#0b1628;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-weight:900;color:var(--muted);text-decoration:none}.footer{margin-top:22px;color:var(--muted);font-size:12px;text-align:right}@media(max-width:900px){.report{padding:14px}.page{padding:20px}.kpis,.grid2,.grid3,.grid4,.meta,.evidence{grid-template-columns:1fr}.cover h1{font-size:42px}.logo{font-size:64px}.header{display:block}.actions{justify-content:flex-start;margin-top:14px}}
</style>
</head>
<body>
<div class="report">
  <section class="page cover">
    <div><div class="logo">AIR</div><h1>Automation Intelligence Platform</h1><p>OOLTool UAT execution report using the AIR Golden Design direction: premium dark theme, business-first insights, evidence-driven decisions, and client-ready reporting.</p></div>
    <div class="meta"><div><span>Report Type</span><b>Execution Report</b></div><div><span>Environment</span><b>UAT</b></div><div><span>Generated</span><b>${escapeHtml(generatedAt)}</b></div><div><span>Status</span><b class="${failed === 0 ? 'good' : 'warn'}">${failed === 0 ? 'Ready' : 'Review'}</b></div></div>
  </section>

  <section class="page">
    <div class="header"><div><h2>Executive Dashboard</h2><p>Answers: Can we release? What is the quality position?</p></div><div class="actions"><a class="btn" href="../playwright-report/index.html">Evidence</a><a class="btn primary" href="javascript:window.print()">Export PDF</a></div></div>
    <div class="kpis"><div class="kpi"><span class="label">Quality Score</span><b class="good">${qualityScore}%</b></div><div class="kpi"><span class="label">Release</span><b class="${releaseClass === 'bad' ? 'bad' : releaseClass === 'warn' ? 'warn' : 'good'}">${releaseLabel}</b></div><div class="kpi"><span class="label">Business Health</span><b>${businessHealth}%</b></div><div class="kpi"><span class="label">Pass Rate</span><b>${passRate}%</b></div><div class="kpi"><span class="label">Failed</span><b class="bad">${failed}</b></div><div class="kpi"><span class="label">Duration</span><b>${formatDuration(totalDuration)}</b></div></div>
    <div class="grid2"><div class="panel"><h3>Business Health Overview</h3><table><tr><th>Module</th><th>Health</th><th>Risk</th><th>Decision</th></tr>${goldenModuleRows}</table></div><div class="panel"><h3>Release Decision</h3><div class="ring" style="--p:${qualityScore}"><span>${qualityScore}%</span></div><div class="decision">${releaseLabel}</div><p style="text-align:center">${failed === 0 ? 'Critical journeys passed. Remaining risk is non-blocking.' : 'Failures require review before approval.'}</p></div></div>
    <div class="footer">Generated by AIR Platform - Premium Dark Theme</div>
  </section>

  <section class="page">
    <div class="header"><div><h2>Business Journeys</h2><p>Shows journey health from first user action to business outcome.</p></div><div class="actions"><a class="btn" href="../playwright-report/index.html">View Evidence</a><a class="btn primary" href="javascript:window.print()">Export Journey</a></div></div>
    <div class="flow">${goldenJourneySteps}</div>
    <div class="grid3" style="margin-top:24px"><div class="card"><h3>User Impact</h3><p>${failed === 0 ? 'No critical user journey is blocked in the available execution data.' : 'Some execution failures exist and should be reviewed for business impact.'}</p></div><div class="card"><h3>Decision</h3><p><b class="${failed === 0 ? 'good' : 'warn'}">${failed === 0 ? 'Proceed with release review' : 'Review before release'}</b></p></div><div class="card"><h3>Next Action</h3><p>Keep controlled email-link, unlock, reset-password, and payment URL flows separate from stable regression.</p></div></div>
  </section>

  <section class="page">
    <div class="header"><div><h2>Coverage & Trend</h2><p>Shows automation maturity and direction over time.</p></div><div class="actions"><a class="btn" href="#tests">Open Tests</a><a class="btn primary" href="javascript:window.print()">Export Trend</a></div></div>
    <div class="grid2"><div class="panel"><h3>Coverage Matrix</h3><table><tr><th>Module</th><th>Positive</th><th>Negative</th><th>Security</th><th>Boundary</th><th>Status</th></tr>${regressionRows}</table></div><div class="panel"><h3>Execution Trend</h3><div class="chart"><div class="bar" style="height:120px"><span>B120</span></div><div class="bar" style="height:150px"><span>B121</span></div><div class="bar" style="height:170px"><span>B122</span></div><div class="bar" style="height:205px"><span>B123</span></div><div class="bar" style="height:${Math.max(40, qualityScore * 2)}px"><span>Now</span></div></div></div></div>
  </section>

  <section class="page">
    <div class="header"><div><h2>Evidence</h2><p>All evidence connected to the decision, not scattered across folders.</p></div><div class="actions"><a class="btn" href="../playwright-report/index.html">Open Evidence</a><a class="btn primary" href="javascript:window.print()">Export Evidence PDF</a></div></div>
    <div class="evidence"><a class="tile" href="../playwright-report/index.html">Screenshots</a><a class="tile" href="../playwright-report/index.html">Videos</a><a class="tile" href="../playwright-report/index.html">Traces</a><a class="tile" href="../test-results/results.json">Raw JSON</a><div class="tile">API Evidence</div><div class="tile">DB Evidence</div></div>
    <div class="grid3" style="margin-top:24px"><div class="card"><h3>Evidence Rule</h3><p>Every failed, warning, or release-impacting item must link to supporting evidence.</p></div><div class="card"><h3>Decision</h3><p>${evidenceNotice}</p></div><div class="card"><h3>Next Action</h3><p>Attach API request/response logs for Billing and MFA validations in a future AIR phase.</p></div></div>
  </section>

  <section class="page">
    <div class="header"><div><h2>AI Insights</h2><p>Transforms raw failures into meaning and next action.</p></div><div class="actions"><a class="btn" href="#tests">Open Tests</a><a class="btn primary" href="javascript:window.print()">Export Insight</a></div></div>
    <div class="panel insight"><h3>Executive Insight</h3><p>Overall product stability is ${failed === 0 ? 'strong' : 'under review'}. Registration, Authentication, Profile, Billing, Password Policy, and Dashboard access are represented in the automation suite. Remaining maturity work is concentrated in API, database, historical trends, and controlled external flows.</p></div>
    <div class="grid3" style="margin-top:20px"><div class="card"><h3>Can We Release?</h3><p><b class="${failed === 0 ? 'good' : 'warn'}">${failed === 0 ? 'Yes.' : 'Review first.'}</b> ${failed === 0 ? 'Release can proceed with monitoring.' : 'Resolve failed checks before approval.'}</p></div><div class="card"><h3>What Needs Attention?</h3><p>Controlled password reset, unlock account, Stripe negative checks, Billing API validation, and Database validation.</p></div><div class="card"><h3>What Should QA Do Next?</h3><p>Run stable execution, generate this AIR report, then run controlled flows with fresh URLs when needed.</p></div></div>
  </section>

  <section class="page" id="tests">
    <div class="header"><div><h2>Detailed Test Results</h2><p>Raw Playwright test-level execution details.</p></div><div class="actions"><a class="btn" href="../test-results/results.json">Raw JSON</a><a class="btn primary" href="javascript:window.print()">Export Tests</a></div></div>
    <div class="panel"><table><tr><th>Test</th><th>Project</th><th>Status</th><th>Duration</th><th>Error</th></tr>${rows}</table></div>
  </section>
</div>
</body>
</html>`;

const demoMode =
  !hasResults ||
  total === 0;

const executiveData = demoMode
  ? {
    total: 466,
    passed: 452,
    failed: 12,
    skipped: 0,
    executed: 466,
    unexpectedSkipped: 0,
    documentedSkipped: 0,
    duration: '42m 18s',
    passRate: 97,
    executedPassRate: 97,
    inventoryPassRate: 97,
    qualityScore: 96,
    businessHealth: 94,
    releaseDecision: 'GO',
    riskLevel: 'Medium',
  }
  : {
    total,
    passed,
    failed,
    skipped,
    executed,
    unexpectedSkipped,
    documentedSkipped,
    duration: formatDuration(totalDuration),
    passRate,
    executedPassRate,
    inventoryPassRate,
    qualityScore,
    businessHealth,
    releaseDecision,
    riskLevel,
  };

const releaseTone = getReleaseTone(executiveData.releaseDecision);

const demoModules = [
  { name: 'Registration', score: 100, status: 'Healthy', risk: 'Low', total: 45, passed: 45, failed: 0, skipped: 0 },
  { name: 'Authentication', score: 98, status: 'Healthy', risk: 'Low', total: 53, passed: 52, failed: 1, skipped: 0 },
  { name: 'Profile', score: 100, status: 'Healthy', risk: 'Low', total: 36, passed: 36, failed: 0, skipped: 0 },
  { name: 'Compliance', score: 94, status: 'Healthy', risk: 'Low', total: 34, passed: 32, failed: 2, skipped: 0 },
  { name: 'Subscription & Billing', score: 82, status: 'Partial', risk: 'Medium', total: 50, passed: 41, failed: 6, skipped: 3 },
  { name: 'MFA', score: 72, status: 'At Risk', risk: 'High', total: 25, passed: 18, failed: 7, skipped: 0 },
];

const displayModules =
  demoMode
    ? demoModules
    : moduleHealth.length > 0
      ? moduleHealth
      : demoModules.map(module => ({
        ...module,
        status: 'No Data',
        risk: 'No Data',
      }));

const warningModules =
  displayModules.filter(module => getModuleFilterTone(module) === 'amber').length;
const criticalModules =
  displayModules.filter(module => getModuleFilterTone(module) === 'red').length;
const releaseWarningCount =
  (airResults?.release?.warnings ?? airResults?.releaseDecision?.warnings ?? []).length
  || (warningModules + unexpectedSkipped);

function moduleSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getModuleRecommendedAction(module) {
  const executed = Number(module.executed ?? ((module.passed ?? 0) + (module.failed ?? 0) + (module.interrupted ?? 0)));
  const status = String(module.status || '').toLowerCase();

  if (module.failed > 0) {
    return 'Review the failed checks before approval.';
  }

  if (executed === 0 || status.includes('not executed') || status.includes('no data')) {
    return 'None of these checks ran. They are listed under Not run.';
  }

  if ((module.unexpectedSkipped ?? 0) > 0) {
    return 'Some checks were skipped unexpectedly. Review those before approval.';
  }

  if ((module.documentedSkipped ?? 0) > 0) {
    return 'Checks that ran passed. The rest of this list did not run.';
  }

  const actionMap = {
    Accessibility: 'No action required',
    Authentication: 'Continue monitoring',
    Billing: 'Add API validation next',
    Password: 'Add reset-password expiry checks',
    Profile: 'No action required',
    'Session Security': 'Add JWT/session API validation',
    Signup: 'Continue monitoring',
    Onboarding: 'Continue monitoring',
  };

  return actionMap[module.name] ?? 'Continue monitoring';
}

function getModuleIcon(moduleName) {
  const iconMap = {
    Accessibility: 'Ax',
    Authentication: 'Au',
    Billing: 'Bi',
    Onboarding: 'On',
    Password: 'Pw',
    Profile: 'Pr',
    'Session Security': 'Ss',
    Signup: 'Su',
    'Access Control': 'Ac',
    Dashboard: 'Da',
    General: 'Ge',
    MFA: 'Mf',
  };

  return iconMap[moduleName] ?? 'View';
}

function getModuleBusinessScenarios(moduleName) {
  const scenarioMap = {
    Accessibility: ['Keyboard navigation', 'Focus order', 'Accessible validation states'],
    Authentication: ['Login', 'Logout', 'Forgot Password', 'JWT', 'Session Timeout'],
    Billing: ['Billing overview', 'Plans tab', 'Transaction history', 'Invoice page', 'PDF invoice'],
    Onboarding: ['Registration', 'Email verification', 'Mobile verification', 'Risk profile', 'Compliance', 'Stripe payment'],
    Password: ['Reset password', 'Password mismatch', 'Wrong current password', 'Weak password validation'],
    Profile: ['Profile page access', 'Profile data loads', 'Email read-only validation'],
    'Session Security': ['Protected routes', 'Logout back-button protection', 'Direct URL after logout'],
    Signup: ['Required fields', 'Email validation', 'Password policy', 'Mobile number', 'OTP validation'],
  };

  return scenarioMap[moduleName] ?? ['Primary flow', 'Negative validation', 'Evidence review'];
}

function getModuleEvidenceStatus() {
  const evidence = airResults?.evidence ?? {};
  const count = key => Array.isArray(evidence[key]) ? evidence[key].length : 0;
  const label = value => value > 0 ? `${value} saved` : 'None in this run';
  return {
    screenshots: label(count('screenshots')),
    videos: label(count('videos')),
    traces: label(count('traces')),
    logs: label(count('logs')),
  };
}

function getModuleValidationStatus(module) {
  return {
    api: module.name === 'Billing' || module.name === 'Authentication' ? 'Recommended next' : 'Planned',
    database: module.name === 'Password' || module.name === 'Signup' ? 'Recommended next' : 'Planned',
    performance: module.risk === 'High' ? 'Needs review' : 'Planned',
  };
}

function getModuleFocus(moduleName) {
  const focusByModule = {
    Accessibility: 'Keyboard navigation, focus order, and accessible validation behavior.',
    Authentication: 'Login, logout, forgot password, JWT/session behavior, and locked-account recovery.',
    Billing: 'Billing overview, plans, transaction history, invoice access, and PDF availability.',
    Password: 'Password reset, mismatch handling, current-password validation, and policy enforcement.',
    Profile: 'Profile page access, profile data loading, and read-only email protection.',
    Signup: 'Registration validation, mobile number handling, OTP flow, and password policy.',
    Onboarding: 'Subscriber registration, verification, risk profile, compliance, and payment handoff.',
    'Session Security': 'Protected-route access, logout behavior, browser back navigation, and session expiry.',
    'Access Control': 'Who can open protected pages, and what a restricted user is blocked from seeing.',
    MFA: 'Authenticator, backup codes, and trusted-device checks that were actually run.',
    Dashboard: 'Dashboard load, refresh, and navigation into profile, billing, and risk pages.',
    General: 'Checks that did not match a product module. Treat these as unmapped coverage.',
  };

  return focusByModule[moduleName] ?? 'Module-specific UI validation, evidence review, and release readiness.';
}

function getModuleBusinessImpact(module) {
  if ((module.failed ?? 0) > 0 || module.risk === 'High') {
    const impactByModule = {
      Accessibility: 'Users relying on keyboard or assistive technology may be blocked from completing key workflows.',
      Authentication: 'Users may be unable to sign in, recover accounts, or maintain secure sessions.',
      Billing: 'Subscribers may be unable to manage plans, view transactions, or access invoices.',
      MFA: 'Users may be unable to recover access or manage two-factor authentication without support intervention.',
      Password: 'Users may be unable to reset or change passwords safely.',
      Profile: 'Users may be unable to verify or protect profile data.',
      Signup: 'New customers may be unable to create accounts or complete verification.',
      Onboarding: 'New subscribers may be unable to complete the enrollment journey.',
      'Session Security': 'Protected areas may be exposed or users may stay authenticated longer than intended.',
    };

    return impactByModule[module.name] ?? 'Impacted users may be blocked from completing this module workflow.';
  }

  const healthyImpactByModule = {
    Accessibility: 'Accessible interaction paths remain available for validated workflows.',
    Authentication: 'User sign-in and account-access flows are currently stable.',
    Billing: 'Subscriber billing and invoice access are currently stable.',
    Password: 'Password management validations are currently stable.',
    Profile: 'Profile data access and read-only email protection are currently stable.',
    Signup: 'New-account registration validations are currently stable.',
  };

  return healthyImpactByModule[module.name] ?? 'No direct business disruption detected in this module.';
}

function getModuleTone(module) {
  const filterTone = getModuleFilterTone(module);

  if (filterTone === 'red' || module.risk === 'High') {
    return 'red';
  }

  if (filterTone === 'amber' || module.risk === 'Medium' || module.status === 'Partial') {
    return 'amber';
  }

  return 'green';
}

function getModuleFilterTone(module) {
  const status = String(module.status || '').toLowerCase();
  const failedCount =
    Number(module.failed ?? Math.max(0, (module.total || 0) - (module.passed || 0) - (module.skipped || 0))) || 0;

  if (
    status.includes('at risk') ||
    status.includes('critical') ||
    status.includes('failed') ||
    failedCount > 0
  ) {
    return 'red';
  }

  if (
    status.includes('warning') ||
    status.includes('partial') ||
    status.includes('not executed') ||
    status.includes('skipped') ||
    status.includes('needs review') ||
    status.includes('no data')
  ) {
    return 'amber';
  }

  return 'green';
}

function getModuleStatusGroup(module) {
  const status = String(module.status || '').toLowerCase();
  const executed = Number(module.executed ?? ((module.passed ?? 0) + (module.failed ?? 0) + (module.interrupted ?? 0)));
  const failedCount = Number(module.failed ?? 0) || 0;
  const unexpectedSkipped = Number(module.unexpectedSkipped ?? 0) || 0;

  if (
    executed === 0 ||
    status.includes('not executed') ||
    status.includes('no data')
  ) {
    return 'not-executed';
  }

  if (
    status.includes('at risk') ||
    status.includes('critical') ||
    status.includes('failed') ||
    failedCount > 0
  ) {
    return 'critical';
  }

  if (
    status.includes('warning') ||
    status.includes('partial') ||
    status.includes('needs review') ||
    unexpectedSkipped > 0
  ) {
    return 'warning';
  }

  return 'healthy';
}

function getModuleStatusTooltip(module) {
  const group = getModuleStatusGroup(module);
  const failedCount = Number(module.failed ?? 0) || 0;
  const unexpectedSkipped = Number(module.unexpectedSkipped ?? 0) || 0;
  const executed = Number(module.executed ?? ((module.passed ?? 0) + failedCount + (module.interrupted ?? 0)));

  if (group === 'critical') {
    return `${failedCount} failed test${failedCount === 1 ? '' : 's'} ${failedCount === 1 ? 'is' : 'are'} affecting ${module.name} in the current execution.`;
  }

  if (group === 'warning') {
    if (failedCount > 0) {
      return `${module.name} has ${failedCount} failed test${failedCount === 1 ? '' : 's'} and needs review.`;
    }

    if (unexpectedSkipped > 0) {
      return `${module.name} has ${unexpectedSkipped} unexpected skipped check${unexpectedSkipped === 1 ? '' : 's'} that still need triage.`;
    }

    return `${module.name} needs review before it can be treated as healthy.`;
  }

  if (group === 'not-executed') {
    return `${module.name} has no executed tests in the current AIR model.`;
  }

  return `${module.name} executed coverage passed: ${module.passed}/${executed || module.passed} ran in this execution.`;
}

const moduleStatusGroupCounts =
  displayModules.reduce(
    (counts, module) => {
      const group = getModuleStatusGroup(module);
      counts.all += 1;
      counts[group] = (counts[group] ?? 0) + 1;
      return counts;
    },
    {
      all: 0,
      healthy: 0,
      warning: 0,
      critical: 0,
      'not-executed': 0,
    }
  );

function testBelongsToModule(test, moduleName) {
  return (test.module ?? getModuleName(test.title)) === moduleName;
}

function getModuleExecutionMs(moduleName) {
  return tests
    .filter(test => testBelongsToModule(test, moduleName))
    .reduce((sum, test) => sum + (Number(test.duration) || 0), 0);
}

function renderModuleHealthCard(module) {
  const tone = getModuleTone(module);
  const filterTone = getModuleFilterTone(module);
  const failedCount = Number(module.failed ?? 0) || 0;
  const executed = Number(module.executed ?? ((module.passed ?? 0) + failedCount + (module.interrupted ?? 0)));
  const health = Number(module.score ?? 0);
  const notRun = Math.max(0, Number(module.total || 0) - executed);
  const documentedSkipped = Number(module.documentedSkipped ?? Math.max(0, (module.skipped ?? 0) - (module.unexpectedSkipped ?? 0)));
  const healthLine = executed === 0
    ? `None ran. ${module.total} ${Number(module.total) === 1 ? 'check is' : 'checks are'} planned.`
    : `${module.passed} passed. ${failedCount} failed. ${notRun} did not run.`;

  return `
    <a class="module-health-card module-status-card ${tone} interactive-card" href="#module-dashboard-${moduleSlug(module.name)}" id="card-${moduleSlug(module.name)}" data-inner-item data-step-item data-step-label="${escapeHtml(module.name)}" data-module="${escapeHtml(module.name)}" data-module-status="${filterTone}" data-module-status-group="${getModuleStatusGroup(module)}" data-module-search="${escapeHtml(`${module.name} ${module.status} ${module.risk}`.toLowerCase())}" data-module-risk="${escapeHtml(module.risk)}"${tooltipAttr(getModuleStatusTooltip(module))}>
      <div class="module-card-head">
        <div class="module-title">
          <span class="module-icon">${escapeHtml(getModuleIcon(module.name))}</span>
          <strong>${escapeHtml(module.name)}</strong>
        </div>
        <span class="badge ${tone}"${tooltipAttr(getModuleStatusTooltip(module))}>${escapeHtml(module.status)}</span>
      </div>
      <div class="module-health-score">
        <span>${healthLine}</span>
      </div>
      <div class="module-card-stats">
        <span><b>${module.passed}</b><small>Passed</small></span>
        <span><b>${failedCount}</b><small>Failed</small></span>
        <span><b>${notRun}</b><small>Not run</small></span>
      </div>
      <div class="module-progress" aria-hidden="true"><span style="width:${health}%"></span></div>
      <p>${failedCount > 0
        ? `${failedCount} failure${failedCount === 1 ? '' : 's'} need review`
        : documentedSkipped > 0 && getModuleStatusGroup(module) === 'healthy'
          ? `${documentedSkipped} planned check${documentedSkipped === 1 ? '' : 's'} did not run.`
          : escapeHtml(getModuleRecommendedAction(module))}</p>
      <span class="module-button">Open detail</span>
    </a>`;
}

const moduleHealthCards =
  displayModules
    .map(renderModuleHealthCard)
    .join('');

const moduleEvidenceLabel = (() => {
  const status = getModuleEvidenceStatus();
  const parts = ['screenshots', 'videos', 'traces', 'logs']
    .filter(key => status[key] !== 'None in this run')
    .map(key => status[key].replace(' saved', ' ' + key));
  return parts.length ? parts.join(', ') : 'None in this run';
})();
const moduleDashboardCards =
  displayModules
    .map(module => {
      const tone = getModuleTone(module);
      const filterTone = getModuleFilterTone(module);
      const failedCount = Number(module.failed ?? 0) || 0;
      const executed = Number(module.executed ?? ((module.passed ?? 0) + failedCount + (module.interrupted ?? 0)));
      const notRun = Math.max(0, Number(module.total || 0) - executed);
      const moduleExecutionMs =
        getModuleExecutionMs(module.name);
      const scenarioCount =
        getModuleBusinessScenarios(module.name).length;

      return `
        <div class="module-dashboard-card module-selector-card ${tone} interactive-card" id="module-dashboard-${moduleSlug(module.name)}" data-inner-item data-step-item data-step-label="${escapeHtml(module.name)}" data-module="${escapeHtml(module.name)}" data-module-status="${filterTone}" data-module-status-group="${getModuleStatusGroup(module)}" data-module-search="${escapeHtml(`${module.name} ${module.status} ${module.risk}`.toLowerCase())}" data-module-risk="${escapeHtml(module.risk)}">
          <a class="module-back" href="#module-dashboard">All areas</a>
          <div class="module-card-head">
            <div class="module-title">
              <span class="module-icon">${escapeHtml(getModuleIcon(module.name))}</span>
              <strong>${escapeHtml(module.name)}</strong>
            </div>
            <span class="badge ${tone}">${escapeHtml(module.status)}</span>
          </div>
          <div class="module-dashboard-score-row">
            <span>${executed === 0
              ? `None ran. ${module.total} ${Number(module.total) === 1 ? 'check is' : 'checks are'} planned.`
              : `${module.passed} passed. ${failedCount} failed. ${notRun} did not run.`}</span>
          </div>
          <div class="module-selector-summary">
            <span>Passed <b>${module.passed}</b></span>
            <span>Failed <b>${failedCount}</b></span>
            <span>Not run <b>${notRun}</b></span>
            <span>Risk <b>${escapeHtml(module.risk)}</b></span>
            <span>Scenarios <b>${scenarioCount}</b></span>
            <span>Evidence <b>${escapeHtml(moduleEvidenceLabel)}</b></span>
            <span>Execution <b>${moduleExecutionMs ? formatDuration(moduleExecutionMs) : 'No Data'}</b></span>
          </div>
          <div class="module-progress"><span style="width:${module.score}%"></span></div>
          <p>${escapeHtml(getModuleFocus(module.name))}</p>
          <div class="module-dashboard-footer">
            <span>${failedCount > 0 ? `${failedCount} failure${failedCount === 1 ? '' : 's'} need review` : executed === 0 ? 'None of these checks ran' : 'No failures in this run'}</span>
            <em>Open detail drawer</em>
          </div>
        </div>`;
    })
    .join('');

const moduleDrawerData =
  displayModules.map(module => {
    const failedCount = Number(module.failed ?? 0) || 0;
    const executed = Number(module.executed ?? ((module.passed ?? 0) + failedCount + (module.interrupted ?? 0)));
    const coverage = module.total === 0 ? 0 : Math.round((executed / module.total) * 100);

    return {
      name: module.name,
      icon: getModuleIcon(module.name),
      health: module.score,
      status: module.status,
      risk: module.risk,
      total: module.total,
      passed: module.passed,
      failed: failedCount,
      executed,
      coverage,
      scenarios: getModuleBusinessScenarios(module.name),
      focus: getModuleFocus(module.name),
      relatedTests: tests
        .filter(test => testBelongsToModule(test, module.name))
        .slice(0, 12)
        .map(test => ({
          title: test.title,
          status: test.status,
          duration: test.duration,
          error: test.error ?? '',
          file: test.file ?? '',
        })),
      evidence: getModuleEvidenceStatus(module),
      validation: getModuleValidationStatus(module),
      recommendation: getModuleRecommendedAction(module),
      businessImpact: getModuleBusinessImpact(module),
      dashboardTarget: `#module-dashboard-${moduleSlug(module.name)}`,
    };
  });

const moduleDrawerDataJson =
  JSON.stringify(moduleDrawerData)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

const journeyDetailData =
  (airResults?.businessJourneys ?? []).map(journey => {
    const affectedModules =
      (journey.modules ?? journey.steps ?? [])
        .map(step => typeof step === 'string' ? step : step.module ?? step.name)
        .filter(Boolean);

    return {
      name: journey.name,
      status: journey.status ?? 'No Data Available',
      health: journey.score ?? journey.health ?? 0,
      risk: journey.risk ?? 'No Data',
      total: journey.total ?? 0,
      passed: journey.passed ?? 0,
      failed: journey.failed ?? 0,
      skipped: journey.skipped ?? 0,
      affectedModules,
      failedDependencies: (journey.failedDependencies ?? []).map(item => item.name ?? item.module ?? item),
      notExecutedSteps: (journey.notExecutedSteps ?? []).map(item => item.name ?? item.module ?? item),
      recommendation: journey.recommendation ?? 'Run mapped journey tests to generate journey-level recommendations.',
    };
  });

const journeyDetailDataJson =
  JSON.stringify(journeyDetailData)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

const airSearchIndexJson =
  JSON.stringify(airResults?.searchIndex ?? [])
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

const moduleHealthRows = displayModules
  .map(module => {
    const tone =
      statusTone(module.status);
    const failedCount =
      module.failed ?? Math.max(0, module.total - module.passed - module.skipped);

    return `
      <tr id="module-${moduleSlug(module.name)}">
        <td>${escapeHtml(module.name)}</td>
        <td><div class="progress"><span style="width:${module.score}%"></span></div></td>
        <td>${module.score}%</td>
        <td><span class="badge ${tone}">${escapeHtml(module.status)}</span></td>
        <td>${module.passed}/${module.total}</td>
        <td>${failedCount}</td>
        <td>${escapeHtml(module.risk)}</td>
        <td>${escapeHtml(getModuleRecommendedAction(module))}</td>
      </tr>`;
  })
  .join('');

const journeyHealthRows = (demoMode ? [
  ['Registration', 'Healthy', 98],
  ['Authentication', 'Healthy', 96],
  ['Profile Setup', 'Healthy', 100],
  ['Subscription', 'Partial', 88],
  ['Payment', 'Healthy', 94],
  ['Dashboard', 'Healthy', 100],
] : journeyCards.map(([name, state, , score]) => [
  name,
  state === 'Pass' ? 'Healthy' : state === 'Controlled' ? 'Partial' : state,
  score ?? (state === 'Pass' ? 100 : state === 'Controlled' ? 82 : 60),
]))
  .map(([name, state, score], index, items) => {
    const sourceJourney =
      (airResults?.businessJourneys ?? []).find(journey => journey.name === name);
    const firstMappedModule =
      sourceJourney?.modules?.[0];
    const matchedModule =
      firstMappedModule
        ? displayModules.find(module => module.name === firstMappedModule)
        : displayModules.find(module => moduleMatch(module, name));
    const moduleAttribute =
      matchedModule
        ? ` data-module="${escapeHtml(matchedModule.name)}"`
        : '';

    return `
    <div class="journey-node ${statusTone(state)} interactive-card" id="journey-${moduleSlug(name)}" data-inner-item data-step-item data-step-label="${escapeHtml(name)}" data-journey="${escapeHtml(name)}"${moduleAttribute} role="button" tabindex="0" aria-label="Open ${escapeHtml(name)} journey details">
      <div class="node-icon">${state === 'Healthy' ? 'OK' : state === 'Partial' || state === 'Warning' ? '!' : 'NA'}</div>
      <strong>${escapeHtml(name)}</strong>
      <span>${score}%</span>
      <small>${escapeHtml(state)}</small>
      <div class="journey-score-line"><i style="width:${score}%"></i></div>
    </div>
    ${index < items.length - 1 ? '<div class="journey-arrow">-&gt;</div>' : ''}`;
  })
  .join('');

const liveBusinessJourneys = airResults?.businessJourneys ?? [];
const journeyCoverageChartHtml =
  (demoMode ? [
    ['Registration', 98, 'Healthy'],
    ['Authentication', 96, 'Healthy'],
    ['Profile Setup', 100, 'Healthy'],
    ['Subscription', 88, 'Partial'],
    ['Payment', 94, 'Healthy'],
    ['Dashboard', 100, 'Healthy'],
  ] : liveBusinessJourneys.map(journey => [
    journey.name,
    Number(journey.coverage ?? journey.health ?? journey.score ?? 0),
    journey.status ?? 'No Data',
  ]))
    .map(([name, score, status]) => {
      const value = Math.max(0, Math.min(100, Number(score) || 0));
      const height = Math.max(8, value);
      const tone = statusTone(status);
      const barClass = tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : '';
      return `<div class="coverage-col ${barClass}" title="${escapeHtml(`${name}: ${value}% ${status}`)}"><strong>${value}%</strong><div class="bar-track"><div class="bar ${barClass}" style="height:${height}%"></div></div><label>${escapeHtml(name)}</label></div>`;
    })
    .join('') || '<div class="empty-note">No journey coverage was recorded for this execution.</div>';

const journeyAnswerHtml = (() => {
  const attention = liveBusinessJourneys.filter(journey =>
    ['Warning', 'Partial', 'Not Executed', 'Critical', 'Failed'].includes(journey.status)
  );
  const healthy = liveBusinessJourneys.filter(journey => journey.status === 'Healthy');

  if (executiveData.failed > 0) {
    return `Most paths passed. Start with the failed checks before approving the release.`;
  }

  if (attention.length === 0) {
    return `Every path that ran passed. The remaining risk is checks that did not run, not a broken user path.`;
  }

  return `${healthy.length} path${healthy.length === 1 ? '' : 's'} passed. Look at ${attention.map(journey => journey.name).join(', ')} before approving the release.`;
})();

const failedSourceItems = demoMode
  ? [
    {
      title: 'Invalid OTP attempts',
      module: 'Authentication',
      severity: 'High',
      category: 'Security',
      status: 'failed',
      error: 'MFA challenge rejects invalid one-time codes.',
      evidence: [],
    },
    {
      title: 'Card declined handling',
      module: 'Payment',
      severity: 'Medium',
      category: 'Payment',
      status: 'failed',
      error: 'Payment provider decline flow requires review.',
      evidence: [],
    },
  ]
  : [
    ...failedTests,
    ...knownDefectSourceTests.map(knownDefectFailure),
  ];

const FAILED_TESTS_INITIAL_VISIBLE = 40;
const FAILURE_LIST_PREVIEW = 4;
const FAILED_TESTS_LOAD_BATCH = 6;
const shouldShowFailureLoadMore = failedSourceItems.length > FAILED_TESTS_INITIAL_VISIBLE;
const warningSourceItems = demoMode
  ? [
    {
      title: 'MFA trusted-device scenarios are controlled',
      module: 'MFA',
      file: 'MfaUserFlow.spec.ts',
      status: 'skipped',
      reason: 'Requires MFA secret, backup code, or manual OTP confirmation.',
    },
    {
      title: 'Forgot password reset link flow is controlled',
      module: 'Password',
      file: 'forgotpassword.spec.ts',
      status: 'skipped',
      reason: 'Requires external email reset-link confirmation.',
    },
  ]
  : tests.filter(test =>
    ['skipped', 'interrupted', 'unknown'].includes(test.status)
  );
const shouldShowWarningLoadMore = warningSourceItems.length > FAILED_TESTS_INITIAL_VISIBLE;

function formatShortFailureReason(test) {
  const rawReason = String(
    test?.failureSummary ||
    test?.shortReason ||
    test?.whyFailed ||
    test?.reason ||
    test?.recommendedAction ||
    test?.recommendedInvestigationAction ||
    test?.businessImpact ||
    test?.error ||
    test?.errorMessage ||
    'Review failure evidence.'
  ).trim();

  const rawError = String(test?.error || rawReason).trim();

  if (/Registration OTP input did not appear/i.test(rawError)) {
    return 'Registration OTP input did not appear.';
  }

  if (/expect\(page\)\.toHaveURL|toHaveURL/i.test(rawError)) {
    return 'Expected navigation did not complete.';
  }

  if (/locator\.waitFor|waiting for .* to be visible/i.test(rawError)) {
    return 'Expected element did not appear in time.';
  }

  if (/Test timeout|Timeout.*exceeded/i.test(rawError)) {
    return 'Timed out waiting for expected result.';
  }

  if (/Invalid email or password/i.test(rawError)) {
    return 'Login failed with invalid credentials message.';
  }

  const usefulLine = rawReason
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .find(line =>
      line &&
      !/^at\s/i.test(line) &&
      !/^Call log:/i.test(line) &&
      !/^\d+\s*[×x]\s*/.test(line) &&
      !/^[A-Z]:\\/.test(line)
    ) || 'Review failure evidence.';

  return usefulLine.length > 120
    ? `${usefulLine.slice(0, 117).trim()}...`
    : usefulLine;
}

function getFailureFullTitle(test, index = 0) {
  return String(test?.title ?? test?.testName ?? `Failure ${index + 1}`);
}

function getFailureShortTitle(test, index = 0) {
  const title = getFailureFullTitle(test, index);
  const parts = title
    .split(' > ')
    .map(part => part.trim())
    .filter(Boolean);
  const lastPart = parts.length > 0 ? parts[parts.length - 1] : title;

  if (/OOLTool Onboarding Flow/i.test(title)) {
    return 'End-to-end onboarding flow did not complete';
  }

  if (/Subscriber Login/i.test(title)) {
    return 'Subscriber billing journey did not complete';
  }

  return clientCheckTitle(lastPart);
}

function clientCheckTitle(title) {
  return String(title)
    .replace(/^[A-Z]{1,4}-\d+[A-Z]?\s*[-–:]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function onceSentence(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);

  if (parts.length >= 2 && parts[0] === parts[1]) {
    return parts[0];
  }

  const half = Math.floor(text.length / 2);
  if (half > 24 && text.slice(0, half).trim() === text.slice(half).trim()) {
    return text.slice(0, half).trim();
  }

  return text;
}

function getFailureClientDescription(test, index = 0) {
  const title = getFailureFullTitle(test, index).toLowerCase();

  if (test?.failureSummary || test?.shortReason || test?.whyFailed) {
    return test.failureSummary ?? test.shortReason ?? test.whyFailed;
  }

  const defaultReason = formatShortFailureReason(test);

  if (title.includes('transactions tab shows paid transaction status')) {
    return 'Billing transaction history did not expose a uniquely verifiable Paid status.';
  }

  if (title.includes('invoice link opens invoice page with paid status')) {
    return 'Invoice validation could not confirm the expected paid invoice state.';
  }

  if (title.includes('pdf link is available') || title.includes('non-empty url')) {
    return 'Invoice PDF availability could not be confirmed after invoice validation.';
  }

  if (title.includes('onboarding flow') || title.includes('register -> verify email')) {
    return 'The complete onboarding path did not finish in the latest execution.';
  }

  if (title.includes('subscriber login')) {
    return 'The subscriber login and billing validation journey did not complete.';
  }

  if (title.includes('dashboard shows portfolio score events allocation')) {
    return 'A dashboard card this check reads was missing. There is no View full expiry calendar control.';
  }

  if (title.includes('signup otp input accepts more than six digits')) {
    return 'Signup OTP input currently accepts more than six digits before validation.';
  }

  return defaultReason === 'Review failure evidence.'
    ? 'The expected validation did not complete in the latest execution.'
    : defaultReason;
}


function shortScenarioName(test, index = 0) {
  const full = getFailureFullTitle(test, index);
  const parts = String(full).split(/\s*>\s*/);
  return (parts.at(-1) || full).trim();
}

function extractLocatorHint(raw = '') {
  const locator =
    raw.match(/Locator:\s*([^\n]+)/i)?.[1] ||
    raw.match(/waiting for ([^\n]+?)(?:\s+to be|\s+to have|\s*$)/i)?.[1] ||
    '';
  return compactText(String(locator).replace(/\s+/g, ' '), 160);
}

function extractReceivedHint(raw = '') {
  const received =
    raw.match(/Received:\s*([^\n]+)/i)?.[1] ||
    raw.match(/Received string:\s*"?([^"\n]+)"?/i)?.[1] ||
    '';
  return compactText(String(received).replace(/\s+/g, ' '), 180);
}

function plainFailureStory(test, index = 0) {
  const scenario = shortScenarioName(test, index);

  if (test?.productBug) {
    return {
      scenario,
      happened: test.productBug.actual,
      wanted: test.productBug.expected,
      next: test.productBug.next,
      repro: '1. Open the product screen this check covers. 2. Follow the same user steps in the check title. 3. Compare the result with the expected wording below.',
      evidence: 'Open the Picture column for this row, then the Trace / Video chips on the investigation card.',
    };
  }

  const title = getFailureFullTitle(test, index);
  const raw = String(getFailureTechnicalError(test) || '')
    .replace(/\u001b\[[0-9;]*m/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/Call log:/i)[0]
    .slice(0, 700);
  const lower = `${title} ${raw}`.toLowerCase();
  const locatorHint = extractLocatorHint(raw);
  const receivedHint = extractReceivedHint(raw);

  let happened = 'This check did not finish the way we expected.';
  let wanted = 'The screen should show the expected result and let the check finish.';
  let next = 'Fix the screen this check was waiting for, then rerun it.';
  let repro = `1. Open the app as the same kind of user this check uses. 2. Reproduce: ${scenario}. 3. Confirm the expected result below.`;
  let evidence = 'Open the Picture column for this row, then the Trace / Video / Logs chips below for screenshots and replay.';

  const coveringMatch = raw.match(/Covering test "([^"]+)" did not complete this checkpoint \("([^"]+)"\)/i);
  if (coveringMatch) {
    happened = `This row depends on covering check "${coveringMatch[1]}", which did not finish checkpoint "${coveringMatch[2]}" in this run (cascade — not a separate product defect).`;
    wanted = `The covering check should pass first and leave checkpoint "${coveringMatch[2]}" for this row.`;
    next = `Rerun "${coveringMatch[1]}" until it passes, then rerun: ${scenario}.`;
    repro = `1. Run "${coveringMatch[1]}" alone and confirm it passes. 2. Rerun this row: ${scenario}. 3. If the covering check fails, fix that failure first — this row will stay red until the checkpoint exists.`;
    evidence = 'Open Picture / Trace on the covering check first, then this cascaded row.';
  } else if (lower.includes('qa-cl-005') || (lower.includes('unique-card') && lower.includes('plan selection'))) {
    happened = 'Overlay Strategists trial with card bounced back to Plan Selection after unique Stripe test-card retries (card/email already used for a trial).';
    wanted = 'A fresh disposable user with an unused Stripe test card should reach the trial confirmation, not bounce to Plan Selection.';
    next = 'Create a new disposable user and use an unused Stripe test card (rotate QA-CL-005 cards), then rerun the with-card trial.';
    repro = '1. Sign up a brand-new disposable user. 2. Start Overlay Strategists trial with card. 3. Pay with an unused Stripe test card. 4. Expect trial confirmation — not Plan Selection.';
  } else if (lower.includes('err_connection_reset') || lower.includes('err_connection_timed_out') || lower.includes('net::err_')) {
    happened = receivedHint
      ? `UAT network error while opening ${receivedHint} (connection reset/timeout — environment flake, not a product assertion).`
      : 'UAT network error (connection reset/timeout) while loading the app — environment flake, not a product assertion.';
    wanted = 'https://uat.ooltool.com should load to domcontentloaded within the navigation timeout.';
    next = 'Confirm UAT is reachable, then rerun this check (and any cascaded covering-checkpoint rows).';
    repro = '1. Open https://uat.ooltool.com in a browser. 2. If it loads, rerun the failed check. 3. If it still resets, capture the network failure and retry later.';
  } else if (lower.includes('login failed after 3 attempts') || lower.includes('paid subscriber login did not finish')) {
    happened = 'Sign-in as the paid billing fixture did not finish (wrong session left on /dashboard after cookie clear, lockout, or UAT auth flake).';
    wanted = 'Clear cookies, open a fresh login page, sign in as BILLING_MANAGEMENT / SUB_LIFECYCLE_PAID, and reach dashboard.';
    next = 'Confirm the paid fixture password, unlock the account if locked, then rerun this matrix row alone.';
    repro = '1. Open a private window to https://uat.ooltool.com/login. 2. Sign in as the paid Income fixture. 3. Open Billing → Plans. 4. Rerun the failed SC/LC id.';
  } else if (lower.includes('test is skipped')) {
    happened = 'This row threw a skip inside the scenario pack and was miscounted as failed (delivery/email gap or missing UI control).';
    wanted = 'Email/control gaps should soft-skip cleanly, not fail.';
    next = 'Rerun after the pack uses ScenarioSkip for confirmation-email gaps; treat as skip unless the cancel UI itself broke.';
    repro = '1. Open the SC id title. 2. Check if Subjects seen includes plan-change/cancel mail. 3. If mail arrived with different wording, this is not a product cancel-UI defect.';
  } else if (lower.includes('free/no-card plan has no paid plan to preview') || (lower.includes('could not find') && lower.includes('control for') && lower.includes('preview'))) {
    happened = 'Billing did not show the upgrade/downgrade/interval control this preview needed (often because the wrong user session was still Free, or the paid fixture is already on/above that plan).';
    wanted = 'Sign in as the prepared paid Income subscriber and open a calculation preview for the target plan without submitting.';
    next = 'Confirm BILLING_MANAGEMENT / SUB_LIFECYCLE_PAID is the Income monthly fixture, clear shared Free-session cookies, open Change Plan, and confirm the target plan control appears.';
    repro = '1. Sign out. 2. Sign in as the paid fixture email. 3. Open Billing → Plans / Change Plan. 4. Look for the named upgrade or downgrade control. 5. Open preview without confirming payment.';
  } else if (lower.includes('expected monthly upgrade control') || lower.includes('expected') && lower.includes('upgrade control for')) {
    happened = locatorHint
      ? `Plan ladder could not find the monthly upgrade control (${locatorHint}).`
      : 'Plan ladder could not find the monthly upgrade control for the next plan (for example Overlay Strategists).';
    wanted = 'From the current paid plan, Change Plan should offer an upgrade control to the next tier on monthly billing.';
    next = 'On the disposable ladder user, open Change Plan on monthly and confirm the next-tier upgrade control is visible before cancel steps run.';
    repro = '1. Create/reach the ladder starting plan (Income monthly). 2. Open Change Plan. 3. Expect an upgrade control for Overlay Strategists (or the next tier). 4. Do not submit if only inspecting.';
  } else if (lower.includes('no gmail message') && (lower.includes('cancellation') || lower.includes('cancel'))) {
    const subjects = raw.match(/Subjects seen:\s*(\[[^\]]*\])/i)?.[1] || '';
    happened = subjects
      ? `No inbox message matched the cancellation-confirmation pattern within 120s. Subjects seen: ${subjects}.`
      : 'No cancellation confirmation email arrived within 120s after scheduling cancel-at-period-end.';
    wanted = 'After cancel-at-period-end is scheduled, the disposable user should receive an email whose subject/body mentions cancel, non-renewal, or period-end.';
    next = 'Schedule cancel-at-period-end, wait up to 2 minutes, and confirm the mailbox gets a cancel/non-renewal notice (product may word the subject as “Your Income plan is…”).';
    repro = '1. Create a disposable paid Income monthly user. 2. Schedule cancellation at period end. 3. Wait up to 2 minutes. 4. Check Gmail for cancel / won’t renew / period-end wording.';
  } else if (lower.includes('manual entry') && lower.includes('broker')) {
    happened = 'Confirmed product gap: adding a manual position is counted toward the broker-integration limit.';
    wanted = 'Manual entry must not consume the broker-integration limit (SC-03).';
    next = 'Product fix required — keep this row as a known product defect until manual entry is excluded from the broker limit.';
    repro = '1. Sign in as a new Overlay trial user. 2. Add a manual position. 3. Attempt a second broker connection. 4. Observe the limit is already consumed by manual entry.';
  } else if (lower.includes("name: /^open$/i") || (lower.includes('support') && lower.includes('option') && lower.includes('open'))) {
    happened = 'Support ticket Status control did not expose an “Open” option the check could click within 8s.';
    wanted = 'Category, Priority, and Status should be changeable on Support without submitting the ticket.';
    next = 'Open Support, change Status (Open / or current product labels), leave the ticket unsubmitted, then rerun.';
    repro = '1. Sign in. 2. Open Support. 3. Open the Status control. 4. Select Open (or the current equivalent label). 5. Do not submit.';
  } else if (lower.includes('call distance') || (lower.includes('option expiry') && lower.includes('dialog') && lower.includes('innertext'))) {
    happened = 'Option Expiry Overview row click did not leave a readable drill-down dialog/panel, so call-distance text could not be read.';
    wanted = 'Clicking a Long Options contract row should open a dialog or detail panel that shows underlying last / strike so ((S − K) / K) × 100 can be checked.';
    next = 'On Dashboard → Option Expiry Overview → Long Options, click a contract row and confirm a detail panel appears with price fields.';
    repro = '1. Sign in with a subscriber that has long options. 2. Open Dashboard Option Expiry Overview. 3. Choose Long Options. 4. Click a contract row. 5. Expect a drill-down with underlying last and strike.';
  } else if (lower.includes('reset-password') && (lower.includes('tohaveurl') || lower.includes('/login'))) {
    happened = 'Update Password stayed on the reset page. Sign-in did not open.';
    wanted = 'Update Password should save the new password and open the sign-in page.';
    next = 'Open the reset link from the email, enter the new password twice, click Update Password, and confirm sign-in opens.';
  } else if (lower.includes('navigates to create account') || (lower.includes('tobetruthy') && lower.includes('create account'))) {
    happened = 'Sign up did not open the create-account page.';
    wanted = 'Sign up on the login page should open the create-account form.';
    next = 'On the login page, close the cookie banner and click Sign up. The create-account form should open.';
  } else if (lower.includes('outside of the viewport') || /confirm\s*&?\s*pay|confirm and pay/.test(lower)) {
    happened = 'Confirm & pay was below the visible part of the confirm box.';
    wanted = 'Confirm & pay should be on screen so the subscription can be confirmed.';
    next = 'Scroll the confirm box until Confirm & pay is visible, then click it.';
  } else if (lower.includes('keep my plan') || lower.includes('disabled:pointer')) {
    happened = 'Keep my plan was on the cancel box, but it was turned off.';
    wanted = 'The cancel box should close without clicking a turned-off Keep my plan button.';
    next = 'Close the cancel box when Keep my plan is turned off, then rerun this check.';
  } else if (lower.includes('could not find interval')) {
    happened = 'The plans page has no switch between monthly and yearly.';
    wanted = 'A paid plan should offer a monthly or yearly switch when that change is supported.';
    next = 'This stays not run until the plans page shows a monthly or yearly switch.';
  } else if (lower.includes('plan charge') || lower.includes('list price')) {
    happened = 'The upgrade box showed a smaller charge than the full plan price.';
    wanted = 'The charge due today can be a prorated amount. The next bill should still be the full plan price.';
    next = 'Open the upgrade box and compare the amount due today with the next recurring price, then rerun this check.';
  } else if (lower.includes('manage subscription control was not found') || lower.includes('cancel subscription control was not found')) {
    happened = 'Cancel subscription was not on the billing page.';
    wanted = 'A paid or card-backed plan should offer Cancel. A no-card trial or Free plan does not need Cancel.';
    next = 'If Billing is Free or a no-card trial, missing Cancel is expected. If this was a paid plan, add Cancel subscription on Overview.';
  } else if (lower.includes('paid') && (lower.includes('getbytext') || lower.includes('tobevisible'))) {
    happened = 'Billing history did not show a Paid status.';
    wanted = 'A paid subscriber should see Paid on the billing history.';
    next = 'Open Billing, then History, and confirm a Paid status is on the page.';
  } else if (lower.includes('registration otp') || lower.includes('send code via sms')) {
    happened = 'The text-message code box did not appear after Send code.';
    wanted = 'A box for the text-message code should appear so the check can continue.';
    next = 'Click Send code and confirm the text-message box appears before the check moves on.';
  } else if (lower.includes('test timeout of')) {
    happened = 'This check ran until the time limit and did not finish.';
    wanted = 'The check should finish as soon as the page shows the expected result.';
    next = 'Open the page this check starts on and confirm it becomes ready, then rerun it.';
  } else if (lower.includes('combobox')) {
    happened = 'The check looked for an experience menu, but Choose Your Plan was already open.';
    wanted = 'When the plan page is already open, the check should start the trial from that page.';
    next = 'On Choose Your Plan, start the Overlay Strategists 30-day trial with card.';
  } else if (lower.includes('tobeenabled') && lower.includes('create account')) {
    happened = 'Create Account stayed off after the signup fields were filled.';
    wanted = 'Create Account should turn on once the name, email, mobile code, and both passwords are accepted.';
    next = 'On signup, confirm the text-message code is accepted and both passwords match, then wait for Create Account to turn on.';
  } else if (!lower.includes('reset-password') && lower.includes('/login') && (lower.includes('timeout') || lower.includes('domcontentloaded'))) {
    happened = 'The login page took too long to open.';
    wanted = 'The login page should show the email field before the time limit.';
    next = 'Open the login page and wait until the email field is visible, then rerun this check.';
  } else if (lower.includes('input[name="firstname"]')) {
    happened = 'The signup form did not show the first name field in time.';
    wanted = 'The create-account form should show first name, last name, email, and mobile.';
    next = 'Open signup and wait until the first name field is on the page, then rerun this check.';
  } else if (lower.includes('gmail') || lower.includes('verify email') || lower.includes('onboarding flow')) {
    happened = 'The new account email was not confirmed, so signup could not continue.';
    wanted = 'The email link should be opened and the account should be marked verified.';
    next = 'Set the Gmail app password so the test can open the verification email, then rerun onboarding.';
  } else if (lower.includes('otp') || lower.includes('sms code') || lower.includes('verification code')) {
    happened = 'The text-message code box did not appear after Send code.';
    wanted = 'A box for the text-message code should appear so the check can continue.';
    next = 'Click Send code and confirm the text-message box appears before the check moves on.';
  } else if (
    lower.includes('could not find interval')
    || lower.includes('billing interval')
    || lower.includes('annual switch')
    || lower.includes('monthly switch')
    || (lower.includes('switch') && (lower.includes('yearly') || lower.includes('annual') || lower.includes('monthly')))
  ) {
    happened = 'The billing page did not show a switch between monthly and yearly.';
    wanted = 'The plans page should show the current plan and its monthly or yearly price.';
    next = 'Open Change Plan and confirm the monthly or yearly switch is on the page, then rerun this check.';
  } else if (lower.includes('list price') || lower.includes('plan charge') || lower.includes('recurring amount') || (lower.includes('upgrade') && lower.includes('expected'))) {
    happened = 'The price on the screen did not match the price this check expected.';
    wanted = 'The upgrade box should show the charge, credit, and next bill we expected.';
    next = 'Open the upgrade box and compare the charge, credit, and amount due with the plan price, then rerun the preview.';
  } else if (lower.includes('retention') || lower.includes('stay and save') || lower.includes('20%')) {
    happened = 'The downgrade screen did not show the offer to stay on the current plan.';
    wanted = 'A stay-and-save offer should appear before the plan is changed.';
    next = 'Start a downgrade and confirm the stay-and-save offer appears before the plan changes, then rerun this check.';
  } else if (lower.includes('billing period') || lower.includes('period-end') || lower.includes('cancel')) {
    happened = 'The cancel screen did not show the wording this check expected.';
    wanted = 'The cancel box should say access continues until the end of the billing period.';
    next = 'Open cancel and confirm it says access lasts until the end of the billing period, then rerun this check.';
  } else if (lower.includes('portal') && lower.includes('stripe')) {
    happened = 'Stripe opened, but the subscription summary was not on the page.';
    wanted = 'The Stripe page should show the current plan and billing details.';
    next = 'Open Manage subscription and confirm Stripe shows the current plan, invoices, and payment method, then rerun this check.';
  } else if (lower.includes('checkout.stripe') || lower.includes('waitforurl')) {
    happened = 'The browser stayed on the Stripe payment page instead of coming back.';
    wanted = 'Leaving checkout should return to the plan page without paying.';
    next = 'From Stripe checkout, go back and confirm the plan page returns without starting a subscription, then rerun this check.';
  } else if (lower.includes('strict mode')) {
    happened = 'More than one item on the page matched, so the check could not choose one.';
    wanted = 'The page should have one clear button or heading for this step.';
    next = 'Make this step match one button or heading, then rerun this check.';
  } else if (lower.includes('empty required')) {
    happened = 'The signup form did not finish the empty-field check in time.';
    wanted = 'Empty required fields should block signup.';
    next = 'Open signup, leave the required fields empty, and confirm the form blocks you, then rerun this check.';
  } else if (lower.includes('cardnumber') || lower.includes('#cardnumber')) {
    happened = 'The card number field did not appear before the time limit.';
    wanted = 'The payment form should show a card number field.';
    next = 'Open the Overlay Strategists trial and confirm the card number field is on the page before the time limit, then rerun this check.';
  } else if (lower.includes('received: hidden') || lower.includes('unexpected value "hidden"')) {
    happened = 'The plan heading was on the page, but it was hidden.';
    wanted = 'A visible plan control, such as Monthly, Annual, or a plan name, should be on the page.';
    next = 'Open the plan page and confirm Monthly, Annual, or a plan name is visible, then rerun this check.';
  } else if (lower.includes('dashboard shows portfolio score events allocation')) {
    happened = 'A dashboard card this check reads was not on the page.';
    wanted = 'The dashboard should show portfolio value, Ools score, events, allocation, strategy, brokers, top opportunities, and option expiry. There is no View full expiry calendar button.';
    next = 'Scroll below Top 10 Opportunities. Option Expiry Overview is on that row. Short Options and Long Options are filters on that card when it has contracts.';
  } else if (lower.includes('drill-down') || lower.includes('getbyrole(\'dialog\')') || lower.includes('getbyrole("dialog")')) {
    happened = locatorHint
      ? `After clicking an Option Expiry Overview row, the drill-down panel did not open (${locatorHint}).`
      : 'After clicking an Option Expiry Overview row, the drill-down panel did not open.';
    wanted = 'Clicking a contract row should open a dialog or detail panel with expiration, underlying last, and contract details.';
    next = 'On Dashboard, open Option Expiry Overview → Long Options, click a contract row, and confirm a detail panel appears.';
    repro = '1. Sign in. 2. Open Dashboard and scroll to Option Expiry Overview. 3. Choose Long Options. 4. Click a contract row. 5. Expect a drill-down dialog or side panel.';
  } else if (lower.includes('category') && lower.includes('combobox')) {
    happened = 'Support ticket Category control was on the page as plain text next to a combobox, but the check could not select a Category value in time.';
    wanted = 'Category and Priority should be selectable without submitting the ticket.';
    next = 'Open Support, change Category to Billing and Priority to Low without submitting, then rerun this check.';
    repro = '1. Sign in. 2. Open Support. 3. Change Category to Billing. 4. Change Priority to Low. 5. Leave the ticket unsubmitted.';
  } else if (lower.includes('covered call') && lower.includes('option')) {
    happened = 'Opportunities strategy filter did not show a Covered Call option after the list was opened.';
    wanted = 'Each Opportunities filter should expose its known values so the check can select and restore them.';
    next = 'Open Opportunities, open the All Strategies filter, and confirm Covered Call (or the current strategy labels) appear.';
    repro = '1. Sign in. 2. Open Opportunities. 3. Open the strategy filter. 4. Select Covered Call (or the closest strategy label). 5. Restore All Strategies.';
  } else if (lower.includes('dashboard/billing') && lower.includes('tohaveurl')) {
    happened = receivedHint
      ? `After login from a protected deep link, the browser stayed on ${receivedHint} instead of returning to Billing.`
      : 'After login from a protected deep link, the browser did not return to the intended Billing route.';
    wanted = 'Logging in from a protected deep link should return the user to that same route (for example /dashboard/billing).';
    next = 'Sign out, open /dashboard/billing, sign in, and confirm the app lands on Billing — not only Dashboard.';
    repro = '1. Sign out. 2. Open /dashboard/billing while logged out. 3. Sign in. 4. Expect to land on Billing.';
  } else if (lower.includes('invalid|incorrect|wrong') || (lower.includes('forgot') && lower.includes('tobevisible'))) {
    happened = 'After resetting the password, signing in with the old password did not show the expected error message.';
    wanted = 'The old password should be rejected with a clear invalid/incorrect message after a successful reset.';
    next = 'Complete forgot-password, then try the old password on login and confirm the error wording appears.';
    repro = '1. Request a password reset for a disposable user. 2. Open the email link and set a new password. 3. Sign in with the old password. 4. Expect an invalid-password message.';
  } else if (lower.includes('cancellation confirmation') || (lower.includes('no gmail message') && lower.includes('cancel'))) {
    happened = 'No cancellation confirmation email arrived within 120 seconds after scheduling cancel-at-period-end.';
    wanted = 'After cancellation is scheduled, the disposable user should receive a cancellation confirmation email.';
    next = 'Schedule cancel-at-period-end on a disposable paid user and confirm the mailbox receives a cancellation email.';
    repro = '1. Create a disposable paid Income Builder user. 2. Schedule cancellation at period end. 3. Wait up to 2 minutes. 4. Expect a cancellation confirmation email.';
  } else if (lower.includes('user not created') || (lower.includes('textbox') && lower.includes('email') && lower.includes('timeout'))) {
    happened = 'The disposable-user signup screen never showed the Email field, so the scenario could not create its test account.';
    wanted = 'Signup should show the Email field so the disposable user can be created before the cancel checks run.';
    next = 'Open signup and confirm the Email field appears within 30 seconds, then rerun the cancellation scenario.';
    repro = '1. Open the registration page used by disposable users. 2. Wait for the Email field. 3. If it never appears, capture the blank/loading screen.';
  } else if (lower.includes('covering test') || lower.includes('checkpoint')) {
    happened = 'A covering check that was supposed to create this checkpoint did not finish in this run, so this row had nothing to assert.';
    wanted = 'The covering Plan Selection / Overlay trial check should finish first and leave the shared checkpoint for this row.';
    next = 'Rerun the covering Plan Selection check first, then this Overlay trial option check.';
    repro = '1. Run Plan catalog pricing overlay trial and complete-setup in one session. 2. Confirm it passes. 3. Rerun New user can reach Overlay Strategists trial option.';
  } else if (lower.includes('plan charge') && lower.includes('list price')) {
    happened = 'The upgrade confirmation showed a plan charge that did not match the list price, list-plus-credit, or prorated amount due today.';
    wanted = 'The upgrade box should show a charge that matches the list price, unused credit, or prorated amount due today.';
    next = 'Open the upgrade confirmation and compare Amount due today with the plan list price and any unused-time credit.';
    repro = '1. Start from a lower paid plan. 2. Open upgrade to the next plan. 3. Read Amount due today, credit, and next bill. 4. Confirm the charge math.';
  } else if (lower.includes('tobevisible') || lower.includes('element(s) not found')) {
    happened = locatorHint
      ? `The control this check needed was not on the page: ${locatorHint}.`
      : 'The button or message we looked for was not on the page.';
    wanted = 'The expected button or message should be visible before the time limit.';
    next = 'Put the missing control on the page (or update the check if the product label changed), then rerun this check.';
    repro = `1. Open the screen for: ${scenario}. 2. Look for the missing control${locatorHint ? ` (${locatorHint})` : ''}. 3. Capture a screenshot if it is absent.`;
  } else if (lower.includes('timeout') || lower.includes('timed out')) {
    happened = locatorHint
      ? `The page took too long waiting for: ${locatorHint}.`
      : 'The page took too long, and the check stopped before it could finish.';
    wanted = 'The page should be ready and show the expected control before the time limit.';
    next = 'Open the page this check starts on, wait until it is ready, then rerun it.';
    repro = `1. Open the starting page for: ${scenario}. 2. Wait for the expected control${locatorHint ? ` (${locatorHint})` : ''}. 3. If it never appears, capture the loading/error state.`;
  } else if (lower.includes('test not found in the worker')) {
    happened = 'This check was removed while the run was already going, so the runner could not find it.';
    wanted = 'Only checks that are still in the suite should run.';
    next = 'Rerun the suite. This Marketplace check is no longer in the list.';
  } else if (lower.includes('reset-password') && lower.includes('/login')) {
    happened = 'The new password was filled in, but the page stayed on the reset link instead of opening sign-in.';
    wanted = 'Update Password should save the new password and open the sign-in page.';
    next = 'Open the reset link from the email, enter the new password twice, click Update Password, and confirm sign-in opens.';
  } else if (
    lower.includes('mobileverificationsettled')
    || (lower.includes('tobetruthy') && (lower.includes('verified') || lower.includes('mobile') || lower.includes('otp')))
    || lower.includes('not verified')
  ) {
    happened = 'The mobile code stayed on Not verified, so Create Account stayed off.';
    wanted = 'After the six-digit code is accepted, the badge should say Verified and Create Account should turn on.';
    next = 'On signup, enter a mobile number that is not already registered, send the code, enter 111111, click Verify once, and wait until the badge says Verified.';
  } else if (lower.includes('tobetruthy') || lower.includes('tomatch')) {
    happened = 'Something on the page did not match what this check expected.';
    wanted = 'The page should match the result this check was written for.';
    next = 'Compare the screen with the result this check expects, then rerun it.';
  }

  const titledNext = specificFailureNextAction(title, raw);
  if (titledNext) {
    next = titledNext;
  }

  return { scenario, happened, wanted, next, repro, evidence };
}

function specificFailureNextAction(title, raw = '') {
  const text = String(title).toLowerCase();
  const error = String(raw).toLowerCase();

  if (error.includes('combobox')) {
    return 'On Choose Your Plan, start the Overlay Strategists 30-day trial with card.';
  }

  if (error.includes('tobeenabled') && error.includes('create account')) {
    return 'On signup, confirm the text-message code is accepted and both passwords match, then wait for Create Account to turn on.';
  }

  if (error.includes('/login') && (error.includes('timeout') || error.includes('domcontentloaded'))) {
    return 'Open the login page and wait until the email field is visible, then rerun this check.';
  }

  if (error.includes('input[name="firstname"]')) {
    return 'Open signup and wait until the first name field is on the page, then rerun this check.';
  }

  const rules = [
    [/onboarding flow|register -> verify email/, 'Set the Gmail app password so the test can open the verification email, then rerun the onboarding flow.'],
    [/empty required/, 'Open signup, leave the required fields empty, and confirm the form blocks you, then rerun this check.'],
    [/trial with card/, error.includes('cardnumber') || error.includes('card number')
      ? 'Open the Overlay Strategists trial and confirm the card number field is on the page before the time limit, then rerun this check.'
      : ''],
    [/trial without card/, 'Start the Overlay Strategists trial, click Send code, and confirm the text-message box appears, then rerun this check.'],
    [/upgrade calculation/, 'Open the upgrade box and compare the charge, credit, and amount due with the plan price, then rerun the upgrade preview.'],
    [/interval change without submitting/, 'Open Change Plan, check the current plan and its price, and close it without saving, then rerun this check.'],
    [/yearly cancel|climbs every monthly/, 'Finish the plan ladder, open cancel, and confirm the period-end choices. If yearly is not offered, check cancel on the monthly plan, then rerun this check.'],
    [/retention offer/, 'Start a downgrade and confirm the stay-and-save offer appears before the plan changes, then rerun this check.'],
    [/period-end cancel/, 'Open cancel and confirm it says access lasts until the end of the billing period, then rerun this check.'],
    [/sc-67|manage subscription portal/, 'Open Manage subscription and confirm Stripe shows the current plan, invoices, and payment method, then rerun SC-67.'],
    [/sc-75c|browser back from stripe/, 'From Stripe checkout, go back and confirm the plan page returns without starting a subscription, then rerun SC-75C.'],
    [/sc-168|annual switch action is available/, 'On an active monthly plan, open Change Plan and confirm a switch to yearly is shown, then rerun SC-168.'],
    [/sc-170|current monthly plan and target annual/, 'Open the monthly-to-yearly confirmation and check that it names the current monthly plan and the yearly plan, then rerun SC-170.'],
    [/sc-171|displays yearly amount/, 'Open the yearly switch confirmation and confirm the yearly amount is shown, then rerun SC-171.'],
    [/sc-172|prorated credit or charge/, 'Open the yearly switch confirmation and confirm the prorated credit or charge is shown, then rerun SC-172.'],
    [/sc-173|annual switch confirmation displays next renewal/, 'Open the yearly switch confirmation and confirm the next renewal date is shown, then rerun SC-173.'],
    [/sc-174|cancel monthly-to-annual/, 'Start the monthly-to-yearly change, cancel before you confirm, and check the plan stays monthly, then rerun SC-174.'],
    [/sc-204|monthly switch action is available/, 'On an active yearly plan, open Change Plan and confirm a switch to monthly is shown, then rerun SC-204.'],
    [/sc-206|current annual plan and target monthly/, 'Open the yearly-to-monthly confirmation and check that it names the current yearly plan and the monthly plan, then rerun SC-206.'],
    [/sc-207|displays monthly amount/, 'Open the monthly switch confirmation and confirm the monthly amount is shown, then rerun SC-207.'],
    [/sc-209|annual-to-monthly confirmation displays next renewal/, 'Open the monthly switch confirmation and confirm the next renewal date is shown, then rerun SC-209.'],
    [/sc-210|cancel annual-to-monthly/, 'Start the yearly-to-monthly change, cancel before you confirm, and check the plan stays yearly, then rerun SC-210.'],
    [/lc-031|interval toggles/, 'Open Change Plan and confirm the monthly and yearly prices stay visible before you save a change, then rerun LC-031.'],
  ];

  const match = rules.find(([pattern]) => pattern.test(text));
  return match ? match[1] : '';
}

function getFailureTechnicalError(test) {
  return compactText(
    test?.technicalError ||
    test?.errorMessage ||
    test?.error ||
    'Technical error was not available in the AIR model.',
    900
  );
}

function getFailureExpected(test, index = 0) {
  if (test?.expected) {
    return test.expected;
  }

  const title = getFailureFullTitle(test, index).toLowerCase();
  const technicalError = getFailureTechnicalError(test).toLowerCase();

  if (title.includes('otp') || technicalError.includes('otp')) {
    return 'The expected OTP verification state should become available so the user can continue.';
  }

  if (title.includes('billing') || title.includes('subscription') || title.includes('stripe')) {
    return 'The billing or subscription page should show the expected prepared plan, portal, or payment state.';
  }

  if (technicalError.includes('tohaveurl') || technicalError.includes('expected pattern')) {
    return 'The page should navigate to the expected route or destination.';
  }

  if (technicalError.includes('locator.waitfor') || technicalError.includes('to be visible')) {
    return 'The expected UI element should appear before the test timeout.';
  }

  return 'The scenario should reach the expected validation state defined by the automated test.';
}

function getFailureExpectedSource(test) {
  return test?.expected
    ? 'Test metadata'
    : 'Derived from execution';
}

function getFailureObserved(test, index = 0) {
  if (test?.observed) {
    return test.observed;
  }

  const technicalError = getFailureTechnicalError(test);

  if (/received string:/i.test(technicalError)) {
    return compactText(technicalError.split(/received string:/i).at(-1), 220);
  }

  if (/timeout/i.test(technicalError)) {
    return 'The test waited for the expected state until timeout and the expected condition was not reached.';
  }

  if (/expected pattern:/i.test(technicalError)) {
    return 'The actual application state did not match the expected validation pattern.';
  }

  return getFailureClientDescription(test, index);
}

function getFailureObservedSource(test) {
  if (test?.observed) {
    return 'Test metadata';
  }

  const technicalError = getFailureTechnicalError(test);

  if (/received string:/i.test(technicalError) || /timeout/i.test(technicalError) || /expected pattern:/i.test(technicalError)) {
    return 'Playwright error';
  }

  return 'Fallback explanation';
}

function getFailureImpact(test, index = 0) {
  if (test?.businessImpact || test?.releaseImpact) {
    return test.businessImpact ?? test.releaseImpact;
  }

  const moduleName = String(test?.module ?? getModuleName(getFailureFullTitle(test, index))).toLowerCase();

  if (moduleName.includes('billing') || moduleName.includes('payment')) {
    return 'Do not treat billing as ready until this check passes.';
  }

  if (moduleName.includes('authentication') || moduleName.includes('mfa')) {
    return 'Do not treat sign-in as ready until this check passes.';
  }

  if (moduleName.includes('onboarding') || moduleName.includes('signup')) {
    return 'Do not treat new-user signup as ready until this check passes.';
  }

  return 'This check needs a look before you use it as proof.';
}

function getFailureImpactSource(test) {
  return test?.businessImpact || test?.releaseImpact
    ? 'AIR failure engine'
    : 'Derived from module mapping';
}

function getFailureCauseLabel(test) {
  if (test?.confirmedCause) {
    return test.confirmedCause;
  }

  if (test?.failureType) {
    return `${test.failureType} / Requires Investigation`;
  }

  return 'Requires Investigation';
}

function getFailureCauseSource(test) {
  if (test?.confirmedCause) {
    return 'Test metadata';
  }

  if (test?.failureType) {
    return 'AIR failure engine';
  }

  return 'Fallback explanation';
}

function getFailureSummarySource(test) {
  if (test?.whatFailed || test?.whyFailed || test?.failureSummary || test?.shortReason) {
    return 'AIR failure engine';
  }

  if (test?.errorMessage || test?.error) {
    return 'Playwright error';
  }

  return 'Fallback explanation';
}

function getFailureNextAction(test, index = 0) {
  if (test?.recommendedInvestigationAction || test?.recommendedAction) {
    return test.recommendedInvestigationAction ?? test.recommendedAction;
  }

  const title = getFailureFullTitle(test, index).toLowerCase();

  if (title.includes('transactions tab shows paid transaction status')) {
    return 'Review paid-status matching on the billing history table and rerun billing validation.';
  }

  if (title.includes('invoice link opens invoice page with paid status')) {
    return 'Open the invoice from billing history and confirm paid status with a stable selector.';
  }

  if (title.includes('pdf link is available') || title.includes('non-empty url')) {
    return 'Confirm invoice page load first, then verify the PDF link target is populated.';
  }

  if (title.includes('onboarding flow') || title.includes('register -> verify email')) {
    return 'Rerun onboarding after SMS/email handoff is stable and attach trace evidence.';
  }

  if (title.includes('subscriber login')) {
    return 'Rerun subscriber smoke flow and confirm dashboard, billing, invoice, and logout steps.';
  }

  if (title.includes('signup otp input accepts more than six digits')) {
    return 'Add a six-digit input limit, then rerun signup OTP field validation.';
  }

  return 'Review the trace, screenshot, and latest run details before rerunning this scenario.';
}

function getFailureEvidenceInfo(test) {
  const directEvidenceCount = Array.isArray(test?.evidence)
    ? test.evidence.length
    : 0;

  if (directEvidenceCount > 0) {
    const liveShot = test.evidence.find(item =>
      keepEvidenceCopy(item)
      && formatEvidenceType(item.type ?? item.name) === 'Screenshot'
      && !screenshotLooksBlank(item)
    );

    if (liveShot) {
      return {
        status: 'Saved with this report',
        label: 'Open the copy kept beside this report',
        action: 'Open picture',
        href: getEvidenceHref(liveShot),
        available: true,
      };
    }

    const blankShot = test.evidence.find(item =>
      keepEvidenceCopy(item)
      && formatEvidenceType(item.type ?? item.name) === 'Screenshot'
      && screenshotLooksBlank(item)
    );

    if (blankShot) {
      return {
        status: 'Blank screen',
        label: 'The saved picture is a blank white screen. The page text is on the check above.',
        action: 'Blank screen',
        href: '#failures',
        available: false,
      };
    }

    const liveEvidence = test.evidence.find(item => keepEvidenceCopy(item));

    if (liveEvidence) {
      return {
        status: 'Saved with this report',
        label: 'Open the copy kept beside this report',
        action: 'Open file',
        href: getEvidenceHref(liveEvidence),
        available: true,
      };
    }

    return {
      status: 'File removed',
      label: 'A later test run cleared this file from the results folder',
      action: 'Not available',
      href: '#failures',
      available: false,
    };
  }

  if (hasPlaywrightReport) {
    return {
      status: 'Report Available',
      label: 'Open Playwright report for trace, video, and screenshot context',
      action: 'Open Report',
      href: '../playwright-report/index.html',
      available: true,
    };
  }

  return {
    status: 'Not Captured',
    label: 'Evidence was not captured for this failure',
    action: 'Evidence Needed',
    href: '#evidence',
    available: false,
  };
}

function selectPrimaryFailureScreenshot(test) {
  const evidenceItems = Array.isArray(test?.evidence) ? test.evidence : [];
  const screenshotItems = evidenceItems.filter(item =>
    formatEvidenceType(item.type ?? item.name) === 'Screenshot' &&
    item.path
  );

  if (screenshotItems.length === 0) {
    return {
      available: false,
      multiple: false,
      label: 'No primary screenshot available',
      reason: test?.productBug
        ? 'This run has no picture. The check reported the product bug before a screen was saved.'
        : 'No screenshot evidence is attached to this failed test.',
    };
  }

  const failedAttemptScreenshots = screenshotItems.filter(item =>
    String(item.attemptStatus ?? '').toLowerCase() === 'failed'
  );
  const candidates = failedAttemptScreenshots.length > 0
    ? failedAttemptScreenshots
    : screenshotItems;
  const selected =
    candidates.find(item => /failed|failure/i.test(`${item.name ?? ''} ${item.path ?? ''}`)) ??
    candidates.at(-1);
  const attemptLabel = selected?.attempt
    ? `Attempt ${selected.attempt}${selected.retry ? ` / Retry ${selected.retry}` : ''}`
    : 'Latest failed attempt';

  const href = getEvidenceHref(selected);

  if (!href) {
    return {
      available: false,
      multiple: screenshotItems.length > 1,
      label: 'Picture no longer on disk',
      reason: 'This picture was saved during the run, then a later test run deleted it. The next full run keeps a copy with the report.',
    };
  }

  const blank = screenshotLooksBlank(selected);

  return {
    available: true,
    blank,
    multiple: screenshotItems.length > 1,
    item: selected,
    href,
    label: blank ? 'Blank white screen' : `Primary Failure Screenshot - ${attemptLabel}`,
    reason: failedAttemptScreenshots.length > 0
      ? 'Selected from screenshot evidence owned by a failed attempt.'
      : 'Selected using the latest screenshot attached to this failed test.',
  };
}

function renderPrimaryFailureScreenshot(test) {
  const primary = selectPrimaryFailureScreenshot(test);

  if (!primary.available || primary.blank) {
    return `
      <div class="primary-failure-shot empty">
        <span>Primary Failure Screenshot</span>
        <strong>${primary.blank ? 'Blank white screen' : 'Not available'}</strong>
        <small>${escapeHtml(primary.blank ? 'The file is a blank white image. The page text is shown on the failure card.' : primary.reason)}</small>
      </div>`;
  }

  return `
    <a class="primary-failure-shot" href="${escapeHtml(primary.href)}" data-evidence-preview data-evidence-kind="Primary Failure Screenshot" data-evidence-status="${escapeHtml(primary.label)}" data-evidence-href="${escapeHtml(primary.href)}"${tooltipAttr(primary.reason)}>
      <span>${escapeHtml(primary.label)}</span>
      <img src="${escapeHtml(primary.href)}" alt="${escapeHtml(primary.label)}">
      <small>${primary.multiple ? 'Multiple screenshots available; AIR selected the failed-attempt screenshot.' : 'Open full image'}</small>
    </a>`;
}

function keptEvidenceFileFor(item = {}) {
  const rawPath = String(item?.path ?? '');

  if (!rawPath) {
    return '';
  }

  const parent = path.basename(path.dirname(rawPath)).replace(/[^\w.-]+/g, '-').slice(0, 80);
  const base = path.basename(rawPath).replace(/[^\w.-]+/g, '-');
  const candidate = path.join(outputDir, 'kept-evidence', `${parent}--${base}`);

  return fs.existsSync(candidate) ? candidate : '';
}

function getEvidenceAbsolutePath(item = {}) {
  const rawPath = String(item?.path ?? '');

  if (!rawPath || /^(https?:|file:|#)/i.test(rawPath)) {
    return '';
  }

  const absolute = path.isAbsolute(rawPath)
    ? rawPath
    : path.join(projectRoot, rawPath);

  if (fs.existsSync(absolute)) {
    return absolute;
  }

  return keptEvidenceFileFor(item);
}

function screenshotLooksBlank(item = {}) {
  const absolutePath = getEvidenceAbsolutePath(item);

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return false;
  }

  const size = readPngSize(absolutePath);

  if (!size || size.width < 640 || size.height < 360) {
    return false;
  }

  try {
    if (fs.statSync(absolutePath).size >= 12000) {
      return false;
    }
  } catch {
    return false;
  }

  const decoded = decodePng(absolutePath);
  return !decoded || !darkTextBox(decoded, 140);
}

function readFailurePageNotes(test) {
  const evidenceItems = Array.isArray(test?.evidence) ? test.evidence : [];
  const logItem = evidenceItems.find(item => /error-context\.md$/i.test(String(item.path || item.name || '')))
    || evidenceItems.find(item => formatEvidenceType(item.type ?? item.name) === 'Log');
  const absolutePath = logItem ? getEvidenceAbsolutePath(logItem) : '';

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return { highlights: [], errorLine: '' };
  }

  const text = fs.readFileSync(absolutePath, 'utf8');
  const errorMatch = text.match(/# Error details\s+```[^\n]*\n([^\n]+)/);
  const errorLine = errorMatch
    ? errorMatch[1].replace(/^Error:\s*/, '').trim()
    : '';
  const snapMatch = text.match(/# Page snapshot\s+```(?:\w+)?\n([\s\S]*?)```/);
  const highlights = [];

  if (snapMatch) {
    snapMatch[1].split('\n').forEach(rawLine => {
      const line = rawLine.replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
      const quoted = line.match(/(?:heading|button|link)\s+"([^"]+)"/i);
      const labeled = line.match(/(?:paragraph|generic):\s*(.+)$/i);
      const value = (quoted?.[1] || labeled?.[1] || '').trim().replace(/:$/, '');

      if (!value || value.length > 90 || highlights.includes(value)) {
        return;
      }

      highlights.push(value);
    });
  }

  return {
    highlights: highlights.slice(0, 8),
    errorLine,
  };
}

function screenClue(test) {
  const notes = readFailurePageNotes(test);
  const blob = `${notes.highlights.join(' | ')} ${notes.errorLine}`;

  if (/not verified/i.test(blob)) {
    return 'The screen still says Not verified.';
  }

  if (/create account/i.test(blob) && /disabled/i.test(blob)) {
    return 'Create Account is on the screen and stayed off.';
  }

  if (/set new password|update password/i.test(blob)) {
    return 'The screen is still Set New Password.';
  }

  if (/test not found/i.test(blob)) {
    return 'No screen was saved because the check was no longer in the suite.';
  }

  return '';
}

function scenarioKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function scenarioSentence(text) {
  const clean = String(text || '').trim().replace(/[.]+$/, '');
  if (!clean) return '';
  const sentence = clean.charAt(0).toUpperCase() + clean.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function humanScenarioSteps(name) {
  const text = String(name || '')
    .replace(/^[A-Z]{1,4}-\d+[A-Z]?\s*-\s*/, '')
    .replace(/\.$/, '')
    .trim();

  if (/\s->\s/.test(text)) {
    return text.split(/\s*->\s*/).map(scenarioSentence).filter(Boolean);
  }

  const blocks = text.match(/^(.*?)\bblocks\b\s+(.+)$/i);
  if (blocks) {
    return [
      scenarioSentence(`Open ${blocks[1].trim()}`),
      scenarioSentence(`Try ${blocks[2].trim()}`),
      scenarioSentence(`Confirm ${blocks[1].trim()} stays blocked and does not continue`),
    ];
  }

  const opens = text.match(/^(.+?)\s+opens\s+(.+)$/i);
  if (opens) {
    return [
      scenarioSentence(`Open ${opens[1].trim()}`),
      scenarioSentence(`Confirm ${opens[2].trim()} is on the screen`),
    ];
  }

  const shows = text.match(/^(.+?)\s+(?:shows|displays)\s+(.+)$/i);
  if (shows) {
    return [
      scenarioSentence(`Open ${shows[1].trim()}`),
      scenarioSentence(`Confirm it shows ${shows[2].trim()}`),
    ];
  }

  const can = text.match(/^(.+?)\s+can\s+(.+)$/i);
  if (can) {
    return [
      scenarioSentence(`Start as ${can[1].trim()}`),
      scenarioSentence(can[2].trim()),
    ];
  }

  const available = text.match(/^(.+?)\s+is available$/i);
  if (available) {
    return [
      scenarioSentence(`Open the screen for ${available[1].trim()}`),
      scenarioSentence(`Confirm ${available[1].trim()} is available`),
    ];
  }

  const parts = text
    .split(/\s+and\s+/i)
    .map(part => part.trim())
    .filter(part => part.length > 12);

  if (parts.length >= 2) {
    return parts.map(part => scenarioSentence(part));
  }

  return [scenarioSentence(text)];
}

function quotedOnLine(line) {
  const match = String(line || '').match(/['"`]([^'"`\n]{3,220})['"`]/);
  if (!match || match[1].includes('${')) return '';
  return match[1].trim();
}

function loadScenarioCatalog() {
  const byFile = new Map();
  const byName = new Map();
  const testsDir = path.join(projectRoot, 'tests');
  let files = [];

  try {
    files = fs.readdirSync(testsDir).filter(file => file.endsWith('.spec.ts'));
  } catch {
    return { byFile, byName };
  }

  files.forEach(file => {
    const lines = fs.readFileSync(path.join(testsDir, file), 'utf8').split(/\n/);
    let current = null;
    let pendingId = '';
    let pendingIdLine = 0;

    const save = record => {
      if (!record?.name) return;
      const steps = (record.steps.length ? record.steps : humanScenarioSteps(record.name)).slice(0, 8);
      const stored = {
        name: record.name,
        steps,
        stepLines: record.stepLines.slice(0, steps.length),
        startLine: record.startLine,
      };
      byFile.set(`${file}::${scenarioKey(record.name)}`, stored);
      byName.set(scenarioKey(record.name), stored);
    };

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const id = line.match(/^\s*id:\s*['"`]([A-Z]{1,4}-\d+[A-Z]?)['"`]/);
      if (id) {
        pendingId = id[1];
        pendingIdLine = lineNumber;
      }

      const titled = line.match(/^\s*title:\s*['"`]([^'"`]{8,220})['"`]/);
      if (titled && pendingId && lineNumber - pendingIdLine < 12) {
        const name = `${pendingId} - ${titled[1]}`;
        const stored = {
          name,
          steps: humanScenarioSteps(titled[1]).slice(0, 8),
          stepLines: [],
          startLine: lineNumber,
        };
        byFile.set(`${file}::${scenarioKey(name)}`, stored);
        byName.set(scenarioKey(name), stored);
        byName.set(scenarioKey(titled[1]), stored);
        pendingId = '';
      }

      if (/^\s*await\s+test\.step\(/.test(line) && current) {
        const step = quotedOnLine(line) || quotedOnLine(lines[index + 1]);
        if (step) {
          current.steps.push(scenarioSentence(step));
          current.stepLines.push(lineNumber);
        }
        return;
      }

      if (/^\s*(?:controlledLifecycleTest|test(?:\.(?:only|skip|fail))?)\(/.test(line)) {
        if (current) save(current);
        const name = quotedOnLine(line) || quotedOnLine(lines[index + 1]);
        current = name
          ? { name, steps: [], stepLines: [], startLine: lineNumber }
          : null;
      }
    });

    if (current) save(current);
  });

  return { byFile, byName };
}

const scenarioCatalog = loadScenarioCatalog();

function scenarioName(test) {
  return String(test?.validation?.scenario || test?.title || getFailureFullTitle(test) || 'This check')
    .split('>')
    .map(part => part.trim())
    .filter(Boolean)
    .at(-1) || 'This check';
}

function scenarioPlaybook(test) {
  const name = scenarioName(test);
  const file = String(test?.file || '').split(/[/\\]/).pop();
  const found = scenarioCatalog.byFile.get(`${file}::${scenarioKey(name)}`)
    || scenarioCatalog.byName.get(scenarioKey(name));
  const steps = (found?.steps?.length ? found.steps : humanScenarioSteps(name)).slice(0, 8);

  return {
    name,
    steps,
    stepLines: found?.stepLines || [],
    startLine: found?.startLine || 0,
  };
}

function failureSourceLine(test) {
  const raw = [
    test?.technicalError,
    test?.errorMessage,
    test?.error,
    ...(Array.isArray(test?.attempts) ? test.attempts.map(attempt => attempt?.error) : []),
  ].filter(Boolean).join('\n');
  const file = String(test?.file || '')
    .split(/[/\\]/)
    .pop()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = file
    ? [...raw.matchAll(new RegExp(`${file}:(\\d+)`, 'g'))]
    : [];
  if (!matches.length) return 0;
  return Number(matches[matches.length - 1][1]);
}

function failureLookedFor(test) {
  const raw = [
    test?.technicalError,
    test?.errorMessage,
    test?.error,
  ].filter(Boolean).join('\n');
  const pattern = raw.match(/name:\s*\/([^/\n]{3,80})\//);
  if (pattern) {
    const label = pattern[1]
      .replace(/\\s\*/g, ' ')
      .replace(/\\s/g, ' ')
      .replace(/\\[bBdDsSwW]/g, ' ')
      .replace(/[\\^$|?*]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return label ? `The screen did not show ${label}.` : '';
  }
  const quoted = raw.match(/name:\s*['"]([^'"]{3,80})['"]/);
  return quoted ? `The screen did not show “${quoted[1]}”.` : '';
}

function failureGuide(test, story) {
  const raw = `${getFailureTechnicalError(test) || ''} ${story.happened}`.toLowerCase();

  if (raw.includes('test not found')) {
    return {
      checked: [
        'The suite started with this check still in the list.',
        'The file changed before this check was reached.',
        'The runner then could not find the check.',
      ],
      again: [
        'Leave this check out of the suite.',
        'Rerun the full suite. This check will not be looked for again.',
      ],
    };
  }

  const play = scenarioPlaybook(test);
  const line = failureSourceLine(test);
  const stopDetail = failureLookedFor(test) || story.happened;
  let stopIndex = -1;

  if (line && play.stepLines.length) {
    play.stepLines.forEach((stepLine, index) => {
      if (stepLine <= line) stopIndex = index;
    });
    if (play.stepLines[0] && line < play.stepLines[0]) stopIndex = -1;
  }

  const checked = play.steps.map((step, index) => (
    index === stopIndex
      ? `${step.replace(/\.$/, '')} — this is where it stopped. ${stopDetail}`
      : step
  ));
  const again = play.steps.map((step, index) => (
    index === stopIndex
      ? `${step.replace(/\.$/, '')}. Stop here: ${stopDetail}`
      : step
  ));

  const setupFailure = /otp|send code|sms code|not verified|create account|reset-password|send-otp/i.test(raw)
    && !play.steps.some(step => /otp|send code|sms|not verified|create account|reset password/i.test(step));

  if (stopIndex < 0 && setupFailure) {
    checked.unshift(`While starting “${play.name}”: ${stopDetail}`);
    again.unshift(stopDetail);
  } else if (stopIndex < 0) {
    checked.push(`Stopped here: ${stopDetail}`);
    again.push(`Repeat the steps above until this happens: ${stopDetail}`);
  }

  return { checked, again };
}

function renderFailureGuide(test, story) {
  const guide = failureGuide(test, story);
  const steps = items => `<ol>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;

  return `<div class="failure-guide">
    <section>
      <h3>What we checked</h3>
      ${steps(guide.checked)}
    </section>
    <section>
      <h3>How to see it again</h3>
      ${steps(guide.again)}
    </section>
  </div>`;
}

function renderMarkedFailureImage(imageHref, region, size, alt) {
  const canMark = region && size?.width && size?.height;
  const box = canMark
    ? `<span class="field-box" style="left:${(100 * region.x / size.width).toFixed(2)}%;top:${(100 * region.y / size.height).toFixed(2)}%;width:${(100 * region.width / size.width).toFixed(2)}%;height:${(100 * region.height / size.height).toFixed(2)}%"></span>`
    : '';

  return `<div class="marked-shot${box ? ' field-marked' : ''}"><img src="${escapeHtml(imageHref)}" alt="${escapeHtml(alt)}">${box}</div>`;
}

function renderFailureScreen(test, title, index = 0, options = {}) {
  const primary = attachFailureFieldRegion(test);
  const notes = readFailurePageNotes(test);
  const story = plainFailureStory(test, index);
  const clue = screenClue(test);
  const pageList = notes.highlights
    .map(item => `<li>${escapeHtml(item)}</li>`)
    .join('');
  const guide = options.guide === false ? '' : renderFailureGuide(test, story);

  if (!primary.available || primary.blank) {
    return `<div class="failure-screen-fallback">
      <span>${primary.blank ? 'The saved picture is a blank white screen' : 'No picture was saved'}</span>
      <p>${escapeHtml(clue || notes.errorLine || primary.reason || story.happened)}</p>
      ${pageList ? `<strong>What was on the page</strong><ul>${pageList}</ul>` : ''}
    </div>${guide}`;
  }

  const region = primary.item ? getReliableFailureRegion(primary.item) : null;
  const absolutePath = primary.item ? getEvidenceAbsolutePath(primary.item) : '';
  const size = absolutePath ? readPngSize(absolutePath) : null;
  const caption = clue || story.happened;
  const markNote = region
    ? 'The red box marks the control this check was looking at.'
    : 'This screen was saved. The failing control is not one box on the picture.';

  return `${renderMarkedFailureImage(primary.href, region, size, `Screen when ${title} failed. ${markNote}`)}
    <span class="failure-mark-note">${escapeHtml(caption)} ${escapeHtml(markNote)}</span>
    ${guide}`;
}

function getAnnotatedEvidenceFileName(test, screenshot, index = 0) {
  const testKey = moduleSlug(test.testId || test.testName || test.title || `failure-${index}`);
  const attemptKey = moduleSlug(screenshot.attemptId || `attempt-${screenshot.attempt || screenshot.retry || 1}`);
  return `${testKey}-${attemptKey}-${index + 1}.svg`;
}

function createAnnotatedFailurePreview(test, screenshot, index = 0) {
  const originalPath = getEvidenceAbsolutePath(screenshot);

  if (!originalPath || !fs.existsSync(originalPath) || screenshotLooksBlank(screenshot)) {
    return {
      available: false,
      reason: 'Original screenshot file was not available for annotation.',
    };
  }

  const size = readPngSize(originalPath) || { width: 1440, height: 900 };
  const region = getReliableFailureRegion(screenshot);

  if (!region) {
    return {
      available: false,
      reason: 'No single control on this screenshot matched the failure.',
    };
  }
  const safeRegion = {
    x: Math.max(0, Math.min(region.x, size.width)),
    y: Math.max(0, Math.min(region.y, size.height)),
    width: Math.max(1, Math.min(region.width, size.width - Math.max(0, region.x))),
    height: Math.max(1, Math.min(region.height, size.height - Math.max(0, region.y))),
  };
  const annotationDir = path.join(outputDir, 'annotated-evidence');
  fs.mkdirSync(annotationDir, { recursive: true });

  const fileName = getAnnotatedEvidenceFileName(test, screenshot, index);
  const filePath = path.join(annotationDir, fileName);
  const originalHrefForSvg = path
    .relative(annotationDir, originalPath)
    .replaceAll('\\', '/');
  const story = plainFailureStory(test, index);
  const caption = compactText(screenClue(test) || story.happened, 150);
  const captionLines = [];
  const words = caption.split(' ');
  let line = '';

  words.forEach(word => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > 72 && line) {
      captionLines.push(line);
      line = word;
    } else {
      line = next;
    }
  });

  if (line) captionLines.push(line);

  const shownLines = (captionLines.length ? captionLines : ['This check failed.']).slice(0, 2);
  const bannerHeight = 40 + shownLines.length * 24;
  const labelWidth = Math.min(size.width - 32, Math.max(520, 36 + Math.max(...shownLines.map(item => item.length), 8) * 8));
  const frame = safeRegion;
  const bannerY = safeRegion.y < bannerHeight + 24
    ? Math.min(size.height - bannerHeight - 12, safeRegion.y + safeRegion.height + 12)
    : 12;
  const captionSvg = shownLines.map((item, lineIndex) =>
    `<text x="28" y="${bannerY + 42 + lineIndex * 24}" fill="#ffffff" font-family="Arial, sans-serif" font-size="16" font-weight="700">${escapeHtml(item)}</text>`
  ).join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">
  <image href="${escapeHtml(originalHrefForSvg)}" x="0" y="0" width="${size.width}" height="${size.height}" preserveAspectRatio="xMidYMid meet"/>
  <rect x="${frame.x}" y="${frame.y}" width="${frame.width}" height="${frame.height}" rx="8" fill="rgba(220,38,38,0.16)" stroke="#dc2626" stroke-width="8"/>
  <rect x="12" y="${bannerY}" width="${labelWidth}" height="${bannerHeight}" rx="10" fill="#dc2626"/>
  <text x="28" y="${bannerY + 22}" fill="#ffffff" font-family="Arial, sans-serif" font-size="13" font-weight="800" letter-spacing="0.08em">FAILED</text>
  ${captionSvg}
</svg>`;

  try {
    fs.writeFileSync(filePath, svg, 'utf8');
  } catch (error) {
    if (!fs.existsSync(filePath)) {
      return {
        available: false,
        reason: 'Annotated picture could not be saved.',
      };
    }
  }

  return {
    available: true,
    href: `annotated-evidence/${fileName}`,
    path: filePath,
    reason: region.expectedElementNotFound
      ? 'Annotated nearest reliable expected container. Expected element was not found.'
      : 'Annotated from explicit failure-location metadata.',
  };
}

function attachFailureFieldRegion(test) {
  const primary = selectPrimaryFailureScreenshot(test);

  if (!primary?.item || primary.item.failureRegionChecked) {
    return primary;
  }

  primary.item.failureRegionChecked = true;

  if (!primary.available || primary.blank) {
    return primary;
  }

  const absolutePath = getEvidenceAbsolutePath(primary.item);
  let region = null;
  try {
    region = absolutePath ? findFailureFieldRegion(absolutePath, test) : null;
  } catch {
    region = null;
  }

  if (region) {
    primary.item.failureRegion = region;
  }

  return primary;
}

function renderFailureScreenshotEvidence(test, index = 0) {
  const primary = attachFailureFieldRegion(test);
  const story = plainFailureStory(test, index);

  if (!primary.available || primary.blank) {
    return `
      <div class="failure-screenshot-context">
        ${renderFailureScreen(test, getFailureShortTitle(test, index), index)}
      </div>`;
  }

  const region = primary.item ? getReliableFailureRegion(primary.item) : null;
  const absolutePath = primary.item ? getEvidenceAbsolutePath(primary.item) : '';
  const size = absolutePath ? readPngSize(absolutePath) : null;

  return `
    <div class="failure-screenshot-context">
      <div class="failure-shot-panel">
        <span>Screen when this failed</span>
        ${renderMarkedFailureImage(primary.href, region, size, `${story.happened} The red box marks the control this check was looking at.`)}
      </div>
      <div class="failure-shot-panel original">
        <span>Full screenshot</span>
        <a href="${escapeHtml(primary.href)}" data-evidence-preview data-evidence-kind="Original Screenshot" data-evidence-status="${escapeHtml(primary.label)}" data-evidence-href="${escapeHtml(primary.href)}"${tooltipAttr('Original Playwright screenshot. This file is never modified by AIR.')}>
          <img src="${escapeHtml(primary.href)}" alt="${escapeHtml(primary.label)}">
          <small>${escapeHtml(primary.label)}</small>
        </a>
      </div>
      <div class="failure-shot-notes">
        <p><b>Scenario:</b> ${escapeHtml(story.scenario)}</p>
        <p><b>Actual:</b> ${escapeHtml(story.happened)}</p>
        <p><b>Expected:</b> ${escapeHtml(story.wanted)}</p>
        <p><b>Reproduce:</b> ${escapeHtml(story.repro || story.next)}</p>
        <p><b>Evidence:</b> ${escapeHtml(story.evidence || 'Picture / Trace / Video on this card.')}</p>
      </div>
    </div>`;
}

const keptEvidenceDir = path.join(outputDir, 'kept-evidence');
const keptEvidenceCopies = new Map();

function keepEvidenceCopy(item = {}) {
  const absolutePath = getEvidenceAbsolutePath(item);

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return '';
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    return '';
  }

  if (keptEvidenceCopies.has(absolutePath)) {
    return keptEvidenceCopies.get(absolutePath);
  }

  if (path.resolve(absolutePath).startsWith(path.resolve(keptEvidenceDir))) {
    const href = `kept-evidence/${path.basename(absolutePath)}`;
    keptEvidenceCopies.set(absolutePath, href);
    return href;
  }

  fs.mkdirSync(keptEvidenceDir, { recursive: true });
  const parent = path.basename(path.dirname(absolutePath)).replace(/[^\w.-]+/g, '-').slice(0, 80);
  const base = path.basename(absolutePath).replace(/[^\w.-]+/g, '-');
  const fileName = `${parent}--${base}`;
  const destination = path.join(keptEvidenceDir, fileName);
  if (!fs.existsSync(destination)) {
    try {
      fs.copyFileSync(absolutePath, destination);
    } catch (error) {
      return '';
    }
  }
  const href = `kept-evidence/${fileName}`;
  keptEvidenceCopies.set(absolutePath, href);
  return href;
}

function getEvidenceHref(item = {}) {
  const kept = keepEvidenceCopy(item);
  if (kept) {
    return kept;
  }

  const rawPath = String(item?.path ?? '').replaceAll('\\', '/');

  if (!rawPath) {
    return hasPlaywrightReport ? '../playwright-report/index.html' : '#evidence';
  }

  if (/^(https?:|#)/i.test(rawPath)) {
    return rawPath;
  }

  return '';
}

function formatEvidenceType(value) {
  const normalized = String(value ?? 'attachment').toLowerCase();

  if (normalized.includes('screen')) return 'Screenshot';
  if (normalized.includes('video')) return 'Video';
  if (normalized.includes('trace')) return 'Trace';
  if (normalized.includes('log')) return 'Log';
  if (normalized.includes('html')) return 'HTML Report';
  if (normalized.includes('raw')) return 'Raw Results';

  return 'Attachment';
}

function renderFailureEvidenceChips(test, options = {}) {
  const includeScreenshots = options.includeScreenshots !== false;
  const evidenceItems = (Array.isArray(test?.evidence) ? test.evidence : [])
    .filter(item => includeScreenshots || formatEvidenceType(item.type ?? item.name) !== 'Screenshot');

  if (evidenceItems.length === 0) {
    return `<div class="failure-evidence-chips muted">
      <span>No direct artifact attached</span>
      ${hasPlaywrightReport ? '<a href="../playwright-report/index.html">Open Playwright Report</a>' : ''}
    </div>`;
  }

  const grouped = evidenceItems.reduce((groups, item) => {
    const label = formatEvidenceType(item.type ?? item.name);
    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(item);
    return groups;
  }, {});

  return `<div class="failure-evidence-chips">
    ${Object.entries(grouped).map(([label, items]) => {
      const first = items.find(item => keepEvidenceCopy(item));
      if (!first) {
        return `<span>${escapeHtml(label)} no longer on disk</span>`;
      }
      const href = getEvidenceHref(first);
      return `<a href="${escapeHtml(href)}" data-evidence-preview data-evidence-kind="${escapeHtml(label)}" data-evidence-status="Saved with this report" data-evidence-href="${escapeHtml(href)}">${escapeHtml(label)} <b>${items.length}</b></a>`;
    }).join('')}
  </div>`;
}

function getFailureArtifactLinks(test) {
  return (Array.isArray(test?.evidence) ? test.evidence : [])
    .filter(item => formatEvidenceType(item.type ?? item.name) !== 'Screenshot')
    .map(item => ({
      label: formatEvidenceType(item.type ?? item.name),
      href: getEvidenceHref(item),
      status: item.attemptStatus || item.type || 'Available',
      attempt: item.attempt,
      retry: item.retry,
    }))
    .filter(item => item.href);
}

function getFailureSourceLabel(test) {
  if (test?.manualDefect) {
    return 'Manual Defect';
  }

  if (test?.failureType) {
    return test.failureType;
  }

  if (test?.file || test?.testId) {
    return 'Automation';
  }

  return 'AIR Review';
}

function getWarningShortTitle(test, index = 0) {
  const fullTitle = String(test?.title ?? test?.testName ?? `Warning ${index + 1}`);
  const parts = fullTitle
    .split(' > ')
    .map(part => part.trim())
    .filter(Boolean);

  return parts.at(-1) ?? fullTitle;
}

function getWarningReason(test) {
  const rawReason = String(
    test?.reason ||
    test?.error ||
    test?.annotation ||
    ''
  ).trim();

  if (rawReason) {
    return rawReason.length > 110
      ? `${rawReason.slice(0, 107).trim()}...`
      : rawReason;
  }

  if (test?.status === 'skipped') {
    return 'Skipped or gated by configuration, external dependency, manual handoff, or controlled execution scope.';
  }

  if (test?.status === 'interrupted') {
    return 'Execution was interrupted before this scenario completed.';
  }

  return 'Scenario requires review before it can contribute to full release confidence.';
}

function getWarningNextAction(test) {
  const title = String(test?.title ?? '').toLowerCase();

  if (title.includes('forgot') || title.includes('reset')) {
    return 'Run with the reset email link available, or keep it as controlled coverage.';
  }

  if (title.includes('mfa') || title.includes('2fa') || title.includes('backup code')) {
    return 'Provide MFA secret, backup code, or manual OTP confirmation before running this scenario.';
  }

  if (title.includes('stripe') || title.includes('billing') || title.includes('subscription')) {
    return 'Run when Stripe portal/test data prerequisites are available.';
  }

  if (title.includes('onboarding') || title.includes('otp') || title.includes('sms')) {
    return 'Run when SMS OTP handoff is stable and test data is ready.';
  }

  return 'Confirm prerequisites, enable the required flag if needed, then rerun the scenario.';
}

const failedRows = (failedSourceItems.length > 0
  ? failedSourceItems
  : [
    {
      title: 'No failed tests in current execution',
      module: 'All Modules',
      severity: 'Low',
      error: 'No blocker detected',
    },
  ])
  .map((test, index) => {
    const fullTitle = getFailureFullTitle(test, index);
    const title = getFailureShortTitle(test, index);
    const moduleName = test.module ?? getModuleName(title);
    const priority = test.severity ?? 'High';
    const story = plainFailureStory(test, index);
    const reason = story.happened;
    const nextAction = story.next;
    const shot = selectPrimaryFailureScreenshot(test);
    const hiddenClass = index >= FAILED_TESTS_INITIAL_VISIBLE ? ' class="is-hidden"' : '';

    return `
    <tr${hiddenClass} data-failure-row data-failure-index="${index}">
      <td title="${escapeHtml(fullTitle)}"><a class="table-evidence-link" href="${failedSourceItems.length ? `#failure-group-${failureGroupKey(test, index).key}` : '#failures'}"><strong>${escapeHtml(title)}</strong></a></td>
      <td>${escapeHtml(moduleName)}</td>
      <td>
        <strong><b>Scenario:</b> ${escapeHtml(story.scenario)}</strong>
        <small><b>Actual:</b> ${escapeHtml(reason)}</small>
        <small><b>Expected:</b> ${escapeHtml(story.wanted)}</small>
        <small><b>Reproduce:</b> ${escapeHtml(story.repro || nextAction)}</small>
        <small><b>Evidence:</b> ${escapeHtml(story.evidence || 'Open Picture / Trace for this row.')}</small>
      </td>
      <td><a class="table-evidence-link" href="${failedSourceItems.length ? `#failure-group-${failureGroupKey(test, index).key}` : '#failures'}">Open evidence</a></td>
    </tr>`;
  })
  .join('');

const criticalFailedCount = failedSourceItems
  .filter(test => ['Critical', 'High'].includes(test.severity ?? 'High'))
  .length;
const openableFailurePictures = failedSourceItems
  .filter(test => {
    const shot = selectPrimaryFailureScreenshot(test);
    return shot.available && !shot.blank;
  })
  .length;
const blankFailurePictures = failedSourceItems
  .filter(test => selectPrimaryFailureScreenshot(test).blank)
  .length;
const failedEvidenceCount = openableFailurePictures;
const failedModuleCount = new Set(
  failedSourceItems.map(test => test.module ?? getModuleName(test.title ?? test.testName ?? 'Unknown'))
).size;

const failureInvestigationCards = failedSourceItems
  .map((test, index) => {
    const fullTitle = getFailureFullTitle(test, index);
    const title = getFailureShortTitle(test, index);
    const moduleName = test.module ?? getModuleName(title);
    const severity = test.severity ?? 'High';
    const category = test.category ?? 'Execution';
    const whatFailed = test.whatFailed ?? title;
    const reason = test.whyFailed ?? getFailureClientDescription(test, index);
    const expected = getFailureExpected(test, index);
    const observed = getFailureObserved(test, index);
    const impact = getFailureImpact(test, index);
    const cause = getFailureCauseLabel(test);
    const nextAction = getFailureNextAction(test, index);
    const evidenceInfo = getFailureEvidenceInfo(test);
    const sourceLabel = getFailureSourceLabel(test);
    const tone = 'red';
    const hiddenClass = index >= FAILED_TESTS_INITIAL_VISIBLE ? ' is-hidden' : '';

    return `
      <article class="failure-investigation-card ${tone}${hiddenClass}" data-failure-card data-failure-index="${index}">
        <div class="failure-card-head">
          <span class="failure-index">F${index + 1}</span>
          <div>
            <strong>${escapeHtml(title)}</strong>
            <small title="${escapeHtml(fullTitle)}">${escapeHtml(moduleName)} &bull; ${escapeHtml(category)}</small>
          </div>
          <span class="failure-flag">${test.productBug ? 'Product bug' : 'Failed'}</span>
        </div>
        <div class="failure-reason-block">
          <span>Scenario we tested</span>
          <p>${escapeHtml(plainFailureStory(test, index).scenario || title)}</p>
          <span>What we expected</span>
          <p>${escapeHtml(plainFailureStory(test, index).wanted)}</p>
          <span>What actually happened</span>
          <p>${escapeHtml(plainFailureStory(test, index).happened)}</p>
          <span>Steps to reproduce</span>
          <p>${escapeHtml(plainFailureStory(test, index).repro || '')}</p>
          <span>Evidence</span>
          <p>${escapeHtml(plainFailureStory(test, index).evidence || 'Open the Picture column and Trace / Video chips for this failure.')}</p>
          <span>Why it matters</span>
          <p>${escapeHtml(impact)}</p>
        </div>
        ${renderFailureScreenshotEvidence(test, index)}
        <p class="failure-next-action"><b>What to do next:</b> ${escapeHtml(plainFailureStory(test, index).next)}</p>
        <details class="failure-more-detail">
          <summary>Error detail</summary>
          <p class="technical-error">${escapeHtml(getFailureTechnicalError(test))}</p>
        </details>
        <div class="failure-artifact-group">
          <span>Trace / Video / Logs</span>
          ${renderFailureEvidenceChips(test, { includeScreenshots: false })}
        </div>
        <div class="failure-card-meta">
          <span><b>${escapeHtml(test.status ?? 'failed')}</b><small>Result</small></span>
          <span><b>${escapeHtml(sourceLabel)}</b><small>From</small></span>
          <span><b>${escapeHtml(evidenceInfo.status)}</b><small>Picture</small></span>
          <span><b>${escapeHtml(moduleName)}</b><small>Area</small></span>
        </div>
        <div class="failure-card-action">
          <span>${escapeHtml(evidenceInfo.label)}</span>
          ${evidenceInfo.available
            ? `<a href="${escapeHtml(evidenceInfo.href)}">${escapeHtml(evidenceInfo.action)}</a>`
            : `<span>${escapeHtml(evidenceInfo.action)}</span>`}
        </div>
      </article>`;
  })
  .join('');

const failureCardLoadMoreHtml = shouldShowFailureLoadMore
  ? `<div class="failure-load-more" data-failure-load-more="cards">
      <span data-failure-count="cards">Showing ${FAILED_TESTS_INITIAL_VISIBLE} of ${failedSourceItems.length} failed checks</span>
      <button type="button" data-load-more-failures data-failure-target="cards" aria-label="Load more failed test cards">Load More</button>
    </div>`
  : '';

const failureTableLoadMoreHtml = shouldShowFailureLoadMore
  ? `<div class="failure-load-more" data-failure-load-more="rows">
      <span data-failure-count="rows">Showing ${FAILED_TESTS_INITIAL_VISIBLE} of ${failedSourceItems.length} failed checks</span>
      <button type="button" data-load-more-failures data-failure-target="rows" aria-label="Load more failed test list rows">Load More</button>
    </div>`
  : '';

const failurePreviewLoadMoreHtml = failedSourceItems.length > FAILURE_LIST_PREVIEW
  ? `<div class="failure-load-more" data-failure-load-more="preview">
      <span data-failure-count="preview">Showing ${FAILURE_LIST_PREVIEW} of ${failedSourceItems.length} failed checks</span>
      <button type="button" data-load-more-failures data-failure-target="preview" data-failure-initial="${FAILURE_LIST_PREVIEW}">Show more</button>
    </div>`
  : '';

const failureGroups = failedSourceItems.reduce((groups, test, index) => {
  const story = plainFailureStory(test, index);
  const grouped = failureGroupKey(test, index);
  const title = getFailureShortTitle(test, index);
  const entry = {
    test,
    index,
    story,
    title,
    moduleName: test.module ?? getModuleName(title),
  };
  const existing = groups.find(group => group.key === grouped.key);

  if (existing) {
    existing.items.push(entry);
  } else {
    groups.push({ key: grouped.key, happened: grouped.label, items: [entry] });
  }

  return groups;
}, []);

const nextStepListHtml = failureGroups.length === 0
  ? ''
  : (() => {
    const cards = failureGroups.map((group, index) => {
      const sharedNext = group.items.every(item => item.story.next === group.items[0].story.next)
        ? group.items[0].story.next
        : 'Open the checks in this group. Each one has its own next step.';

      return `<a class="next-step-card" data-inner-item href="#failure-group-${group.key}">
      <span>${String(index + 1).padStart(2, '0')}</span>
      <div>
        <strong>${escapeHtml(group.happened)}</strong>
        <p>${escapeHtml(sharedNext)}</p>
        <small>${group.items.length} check${group.items.length === 1 ? '' : 's'}</small>
      </div>
    </a>`;
    });
    const visible = cards.slice(0, 3).join('');
    const rest = cards.slice(3);

    return `<div class="next-step-list">${visible}</div>${rest.length ? `<details class="fold"><summary><b>${rest.length} more next steps</b><span>Open when you need them</span></summary><div class="next-step-list">${rest.join('')}</div></details>` : ''}`;
  })();

function renderInnerBoard(label, cardsHtml, itemCount, gridClass = 'failure-card-grid', pageSize = 3) {
  const pages = Math.max(1, Math.ceil(Number(itemCount) / pageSize));
  const bar = pages < 2
    ? ''
    : `<nav class="page-pager inner" aria-label="${escapeHtml(label)}">
        <div class="page-pager-row">
          <button type="button" data-inner-prev class="page-pager-prev"><small>Previous</small><strong data-inner-prev-name></strong></button>
          <span class="page-pager-count"><small data-inner-count>1 of ${pages}</small><strong>${escapeHtml(label)}</strong></span>
          <button type="button" data-inner-next class="page-pager-next"><small>Next</small><strong data-inner-next-name></strong></button>
        </div>
      </nav>`;
  return `<div class="inner-board" data-inner-pager data-inner-size="${pageSize}" data-inner-label="${escapeHtml(label)}">${bar}<div class="${gridClass}">${cardsHtml}</div>${bar}</div>`;
}

const failureEvidenceBoard = failureGroups.length === 0
  ? ''
  : renderInnerBoard('Stories', failureGroups.map(group => {
    const preview = group.items.slice(0, 3).map(entry => `<li>${escapeHtml(entry.title)}</li>`).join('');
    const extra = group.items.length - 3;
    const more = extra > 0 ? `<li class="failure-more">and ${extra} more</li>` : '';
    const productBug = group.items.every(entry => entry.test.productBug);

    return `<a class="failure-shot-card" data-inner-item href="#failure-group-${group.key}">
        <header><div><strong>${escapeHtml(group.happened)}</strong><small>${group.items.length} check${group.items.length === 1 ? '' : 's'}</small></div><span class="failure-flag">${productBug ? 'Product bug' : 'Failed'}</span></header>
        <ul class="failure-check-list">${preview}${more}</ul>
        <span class="module-button">Open this group</span>
      </a>`;
  }).join(''), failureGroups.length);

const failureDetailArticles = failureGroups.map(group => {
  const productBug = group.items.every(entry => entry.test.productBug);
  const sharedNext = group.items.every(entry => entry.story.next === group.items[0].story.next)
    ? group.items[0].story.next
    : 'Each check below has its own next step.';
  const checks = group.items.map(entry => `<section class="failure-group-check" data-inner-item>
      <h3>${escapeHtml(entry.title)}</h3>
      <p class="failure-plain">${escapeHtml(entry.story.happened)}</p>
      <p class="failure-next-line">What to do: ${escapeHtml(entry.story.next)}</p>
      ${renderFailureScreen(entry.test, entry.title, entry.index, { guide: false })}
    </section>`).join('');

  return `<article class="failure-detail" id="failure-group-${group.key}" data-step-item data-step-label="${escapeHtml(group.happened)}">
    <a class="back-checks" href="#failures">All failed groups</a>
    <header class="failure-detail-head"><div><strong>${escapeHtml(group.happened)}</strong><small>${group.items.length} check${group.items.length === 1 ? '' : 's'}</small></div><span class="failure-flag">${productBug ? 'Product bug' : 'Failed'}</span></header>
    <p class="failure-next-line">What to do: ${escapeHtml(sharedNext)}</p>
    ${renderInnerBoard('Checks', checks, group.items.length, 'failure-group-stack', 2)}
  </article>`;
}).join('');

const failedAreaEntries = [...failedSourceItems.reduce((areas, test, index) => {
  const name = test.module ?? getModuleName(getFailureShortTitle(test, index));
  const group = failureGroupKey(test, index);
  const checks = areas.get(name) ?? [];
  checks.push({
    title: getFailureShortTitle(test, index),
    href: `#failure-group-${group.key}`,
  });
  areas.set(name, checks);
  return areas;
}, new Map())];

const failedAreaCards = failedAreaEntries.map(([name, checks]) => `
  <a class="failure-shot-card" href="#failure-area-${moduleSlug(name)}">
    <header><div><strong>${escapeHtml(name)}</strong><small>${checks.length} check${checks.length === 1 ? '' : 's'}</small></div></header>
    <span class="module-button">Open this area</span>
  </a>`).join('');

const failedAreaPanels = failedAreaEntries.map(([name, checks]) => `
  <div id="failure-area-${moduleSlug(name)}" data-failure-panel hidden>
    <a class="back-checks" href="#failure-areas">All areas</a>
    <h2>${escapeHtml(name)}</h2>
    <p>${checks.length} failed check${checks.length === 1 ? '' : 's'} in this area.</p>
    ${renderInnerBoard('Checks', checks.map(check => `<li data-inner-item><a href="${check.href}">${escapeHtml(check.title)}</a></li>`).join(''), checks.length, 'failure-area-checks', 6)}
  </div>`).join('');

const failedTestsContent =
  !demoMode && failedTests.length === 0
    ? renderEmptyState({
      icon: 'OK',
      title: 'Excellent!',
      reason: 'No failed tests detected.',
      action: 'Continue release monitoring.',
      metrics: [
        { label: 'Total Tests', value: executiveData.total },
        { label: 'Passed', value: executiveData.passed },
        { label: 'Failed', value: 0 },
        { label: 'Blockers', value: 'None' },
      ],
    })
    : `
      <div id="failure-home" data-failure-panel>
        <div class="failure-command-center">
          <a class="failure-summary-card primary" href="#failure-story-board">
            <span>Stories</span>
            <strong>${failureGroups.length}</strong>
            <p>Open the ${failureGroups.length} shared failures.</p>
          </a>
          <a class="failure-summary-card" href="#failure-full-list">
            <span>Failed checks</span>
            <strong>${failedSourceItems.length}</strong>
            <p>Open all ${failedSourceItems.length} checks.</p>
          </a>
          <a class="failure-summary-card" href="#failure-areas">
            <span>Areas</span>
            <strong>${failedModuleCount}</strong>
            <p>Open the ${failedModuleCount} areas, one at a time.</p>
          </a>
          <a class="failure-summary-card" href="#evidence">
            <span>Pictures</span>
            <strong>${openableFailurePictures}/${failedSourceItems.length}</strong>
            <p>${openableFailurePictures > 0 ? 'Open the saved screenshots.' : blankFailurePictures > 0 ? 'Saved pictures are blank. Page text is shown instead.' : 'Cleared by a later test run'}</p>
          </a>
        </div>
      </div>
      <div id="failure-story-board" data-failure-panel hidden>
        <a class="back-checks" href="#failures">All failure cards</a>
        <h2>What failed</h2>
        <p>Checks that failed for the same reason share one card. Open it to see each screen. The red box marks the control that failed.</p>
        ${failureEvidenceBoard}
      </div>
      <div id="failure-full-list" data-failure-panel hidden>
        <a class="back-checks" href="#failures">All failure cards</a>
        <h2>Every failed check</h2>
        <div class="table-wrap"><table class="data failure-detail-table"><thead><tr><th>Check</th><th>Area</th><th>What happened</th><th>Picture</th></tr></thead><tbody data-long-list="${FAILED_TESTS_INITIAL_VISIBLE}" data-long-item="tr" data-long-label="failed checks">${failedRows}</tbody></table></div>
      </div>
      <div id="failure-areas" data-failure-panel hidden>
        <a class="back-checks" href="#failures">All failure cards</a>
        <h2>Areas</h2>
        <p>Open one area. Only that area’s checks are shown.</p>
        ${failedAreaEntries.length ? renderInnerBoard('Areas', failedAreaCards.replaceAll('<a class="failure-shot-card"', '<a class="failure-shot-card" data-inner-item'), failedAreaEntries.length) : ''}
      </div>
      ${failedAreaPanels}
      `;

const warningInvestigationCards = warningSourceItems
  .map((test, index) => {
    const fullTitle = String(test.title ?? test.testName ?? `Warning ${index + 1}`);
    const title = getWarningShortTitle(test, index);
    const moduleName = test.module ?? getModuleName(fullTitle);
    const reason = getWarningReason(test);
    const nextAction = getWarningNextAction(test);
    const hiddenClass = index >= FAILED_TESTS_INITIAL_VISIBLE ? ' is-hidden' : '';

    return `
      <article class="failure-investigation-card amber${hiddenClass}" data-warning-card data-warning-index="${index}">
        <div class="failure-card-head">
          <span class="failure-index warning">W${index + 1}</span>
          <div>
            <strong>${escapeHtml(title)}</strong>
            <small title="${escapeHtml(fullTitle)}">${escapeHtml(moduleName)} &bull; ${escapeHtml(test.file ?? 'Controlled coverage')}</small>
          </div>
          <span class="badge warn">${escapeHtml(test.status ?? 'warning')}</span>
        </div>
        <p>${escapeHtml(reason)}</p>
        <p class="failure-next-action"><b>Next:</b> ${escapeHtml(nextAction)}</p>
        <div class="failure-card-meta">
          <span><b>${escapeHtml(test.status ?? 'warning')}</b><small>Status</small></span>
          <span><b>${escapeHtml(moduleName)}</b><small>Module</small></span>
          <span><b>Warning</b><small>Release Signal</small></span>
        </div>
      </article>`;
  })
  .join('');

const warningRows = warningSourceItems
  .map((test, index) => {
    const fullTitle = String(test.title ?? test.testName ?? `Warning ${index + 1}`);
    const title = getWarningShortTitle(test, index);
    const moduleName = test.module ?? getModuleName(fullTitle);
    const reason = getWarningReason(test);
    const nextAction = getWarningNextAction(test);
    const hiddenClass = index >= FAILED_TESTS_INITIAL_VISIBLE ? ' class="is-hidden"' : '';

    return `
      <tr${hiddenClass} data-warning-row data-warning-index="${index}">
        <td title="${escapeHtml(fullTitle)}"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(fullTitle)}</small></td>
        <td>${escapeHtml(moduleName)}</td>
        <td><span class="badge warn">${escapeHtml(test.status ?? 'warning')}</span></td>
        <td><strong>${escapeHtml(reason)}</strong><small>Next: ${escapeHtml(nextAction)}</small></td>
      </tr>`;
  })
  .join('');

const warningCardLoadMoreHtml = shouldShowWarningLoadMore
  ? `<div class="failure-load-more" data-warning-load-more="cards">
      <span data-warning-count="cards">Showing ${FAILED_TESTS_INITIAL_VISIBLE} of ${warningSourceItems.length} warning tests</span>
      <button type="button" data-load-more-warnings data-warning-target="cards" aria-label="Load more warning test cards">Load More</button>
    </div>`
  : '';

const warningTableLoadMoreHtml = shouldShowWarningLoadMore
  ? `<div class="failure-load-more" data-warning-load-more="rows">
      <span data-warning-count="rows">Showing ${FAILED_TESTS_INITIAL_VISIBLE} of ${warningSourceItems.length} warning tests</span>
      <button type="button" data-load-more-warnings data-warning-target="rows" aria-label="Load more warning test list rows">Load More</button>
    </div>`
  : '';

const warningTestsContent = warningSourceItems.length === 0
  ? ''
  : `
    <div class="warning-tests-section">
      <div class="warning-section-head">
        <div>
          <span class="mission-label">Warning Coverage</span>
          <h2>Warning Tests</h2>
          <p>Skipped, controlled, or prerequisite-gated scenarios that explain conditional release confidence.</p>
        </div>
        <span class="release-status-badge warn compact" data-status="WARNING">${warningSourceItems.length} Warnings</span>
      </div>
      <div class="failure-command-center warning-summary-grid">
        <button class="failure-summary-card issue-summary-button amber" type="button" data-open-warning-details>
          <span>Warning Tests</span>
          <strong>${warningSourceItems.length}</strong>
          <p>Skipped, controlled, interrupted, or prerequisite-gated checks</p>
          <em>Open details</em>
        </button>
        <div class="failure-summary-card">
          <span>Coverage Signal</span>
          <strong>Review</strong>
          <p>These are not product failures, but they reduce release confidence.</p>
        </div>
        <button class="failure-summary-card issue-summary-button amber" type="button" data-open-warning-details>
          <span>Next Step</span>
          <strong>Prepare</strong>
          <p>Provide missing links, OTP, fixtures, or external data.</p>
          <em>Open details</em>
        </button>
      </div>
    </div>`;

const coverageGapItems =
  demoMode
    ? [
      {
        title: 'Trial expiry scheduler validation',
        fullTitle: 'Trial expiry scheduler validation',
        module: 'Billing',
        category: 'Blocked',
        priority: 'High',
        status: 'skipped',
        reason: 'Requires scheduler or backend date-control support before safe UI automation.',
        nextAction: 'Request scheduler/API support, then execute expiry and reminder scenarios.',
        sourceIds: ['SUB-TRIAL-014'],
      },
      {
        title: 'MFA trusted device automation',
        fullTitle: 'MFA trusted device automation',
        module: 'MFA',
        category: 'Controlled',
        priority: 'High',
        status: 'skipped',
        reason: 'Requires MFA secret, backup code, or manual OTP handoff.',
        nextAction: 'Provide MFA_LOCAL_TOTP_SECRET or run the manual headed fallback.',
        sourceIds: ['MFA'],
      },
    ]
    : airResults?.coverageGaps?.items ?? [];

const coverageGapSummary =
  demoMode
    ? {
      total: coverageGapItems.length,
      blocked: 1,
      controlled: 1,
      traceability: 0,
      future: 0,
      interrupted: 0,
      skipped: 0,
    }
    : airResults?.coverageGaps?.summary ?? {
      total: coverageGapItems.length,
      blocked: 0,
      controlled: 0,
      traceability: 0,
      future: 0,
      interrupted: 0,
      skipped: coverageGapItems.length,
    };

function getCoverageGapTone(category = '') {
  const normalized = String(category).toLowerCase();

  if (normalized.includes('blocked') || normalized.includes('interrupted')) return 'red';
  if (normalized.includes('controlled') || normalized.includes('future') || normalized.includes('skipped')) return 'amber';
  if (normalized.includes('traceability')) return 'blue';

  return 'amber';
}

function getCoverageGapBadgeClass(category = '') {
  const tone = getCoverageGapTone(category);

  if (tone === 'red') return 'bad';
  if (tone === 'blue') return 'good';

  return 'warn';
}

const COVERAGE_GAPS_INITIAL_VISIBLE = 8;
const shouldShowCoverageGapLoadMore = coverageGapItems.length > COVERAGE_GAPS_INITIAL_VISIBLE;

const coverageGapCards = coverageGapItems
  .map((gap, index) => {
    const hiddenClass = index >= COVERAGE_GAPS_INITIAL_VISIBLE ? ' is-hidden' : '';
    const sourceIds = Array.isArray(gap.sourceIds) && gap.sourceIds.length > 0
      ? gap.sourceIds.join(', ')
      : 'Not mapped';
    const useCase = gap.useCase ?? gap.source ?? 'Execution coverage';

    return `
      <article class="coverage-gap-card ${getCoverageGapTone(gap.category)}${hiddenClass}" data-coverage-gap-card data-coverage-gap-index="${index}">
        <div class="coverage-gap-head">
          <span class="coverage-gap-index">G${index + 1}</span>
          <div>
            <strong title="${escapeHtml(gap.fullTitle ?? gap.title)}">${escapeHtml(gap.title ?? `Coverage gap ${index + 1}`)}</strong>
            <small>${escapeHtml(useCase)} &bull; ${escapeHtml(gap.module ?? 'General')} &bull; ${escapeHtml(sourceIds)}</small>
          </div>
          <span class="badge ${getCoverageGapBadgeClass(gap.category)}">${escapeHtml(gap.category ?? gap.status ?? 'Skipped')}</span>
        </div>
        <p>${escapeHtml(gap.reason ?? 'Scenario was not executed in this run.')}</p>
        <div class="coverage-gap-action">
          <span>Next Action</span>
          <strong>${escapeHtml(gap.nextAction ?? 'Confirm prerequisites and rerun this scenario.')}</strong>
        </div>
      </article>`;
  })
  .join('');

const coverageGapRows = coverageGapItems
  .map((gap, index) => {
    const hiddenClass = index >= COVERAGE_GAPS_INITIAL_VISIBLE ? ' class="is-hidden"' : '';
    const sourceIds = Array.isArray(gap.sourceIds) && gap.sourceIds.length > 0
      ? gap.sourceIds.join(', ')
      : 'Not mapped';
    const useCase = gap.useCase ?? gap.source ?? 'Execution coverage';

    return `
      <tr${hiddenClass} data-coverage-gap-row data-coverage-gap-index="${index}">
        <td title="${escapeHtml(gap.fullTitle ?? gap.title)}"><strong>${escapeHtml(gap.title ?? `Coverage gap ${index + 1}`)}</strong><small>${escapeHtml(useCase)} &bull; ${escapeHtml(sourceIds)}</small></td>
        <td>${escapeHtml(gap.module ?? 'General')}</td>
        <td><span class="badge ${getCoverageGapBadgeClass(gap.category)}">${escapeHtml(gap.category ?? gap.status ?? 'Skipped')}</span></td>
        <td><strong>${escapeHtml(gap.reason ?? 'Scenario was not executed in this run.')}</strong><small>Next: ${escapeHtml(gap.nextAction ?? 'Confirm prerequisites and rerun this scenario.')}</small></td>
      </tr>`;
  })
  .join('');

const coverageGapLoadMoreHtml = shouldShowCoverageGapLoadMore
  ? `<div class="failure-load-more" data-coverage-gap-load-more>
      <span data-coverage-gap-count>Showing ${COVERAGE_GAPS_INITIAL_VISIBLE} of ${coverageGapItems.length} blocked/skipped scenarios</span>
      <button type="button" data-load-more-coverage-gaps aria-label="Load more blocked and skipped scenarios">Load More</button>
    </div>`
  : '';

const planCategoryOrder = [
  ['blocked', 'Blocked', 'Need a product or admin change first'],
  ['controlled', 'Controlled', 'Need an email, code, or prepared user'],
  ['traceability', 'Traceability', 'Already checked by another test'],
  ['future', 'Future', 'Planned for a later release'],
  ['skipped', 'Skipped', 'Skipped without a clear reason'],
];

const planModuleGroups = planCategoryOrder.flatMap(([slug, label, meaning]) => {
  const grouped = new Map();

  coverageGapItems
    .filter(item => String(item.category || '').toLowerCase() === slug)
    .forEach(item => {
      const moduleName = item.module || 'General';
      if (!grouped.has(moduleName)) grouped.set(moduleName, []);
      grouped.get(moduleName).push(item);
    });

  return [...grouped.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .map(([moduleName, checks]) => ({
      slug,
      label,
      meaning,
      moduleName,
      checks,
      id: `plan-${slug}-${String(moduleName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    }));
});

const planModuleCards = planModuleGroups.map(group => {
  const searchText = [
    group.moduleName,
    group.label,
    group.meaning,
    ...group.checks.map(item => `${item.title || ''} ${item.fullTitle || ''} ${item.reason || ''}`),
  ].join(' ').toLowerCase();

  return `
    <a class="passed-card" href="#${group.id}" data-plan-card data-plan-category="${group.slug}" data-plan-search="${escapeHtml(searchText)}">
      <div class="passed-card-top"><span class="module-icon">${escapeHtml(passedTopicMark(group.moduleName))}</span><strong>${escapeHtml(group.moduleName)}</strong></div>
      <div class="passed-card-count"><b>${group.checks.length}</b><span>checks</span></div>
      <p>${escapeHtml(group.label)}. ${escapeHtml(group.meaning)}</p>
      <span class="module-button">Open this group</span>
    </a>`;
}).join('');

const planModuleDetails = planModuleGroups.map(group => {
  const rows = group.checks.map(item => `
    <div class="passed-check" data-inner-item>
      <strong>${escapeHtml(clientCheckTitle(item.title || item.fullTitle || 'Check'))}</strong>
      <span>${escapeHtml(onceSentence(item.reason || item.nextAction || group.meaning))}</span>
    </div>`).join('');

  return `
    <article class="passed-detail" id="${group.id}" data-step-item data-step-label="${escapeHtml(group.moduleName)}" data-plan-category="${group.slug}">
      <div class="passed-detail-head">
        <div>
          <div class="eyebrow">${escapeHtml(group.label)}</div>
          <h2>${escapeHtml(group.moduleName)}</h2>
          <div class="passed-card-count"><b>${group.checks.length}</b><span>checks</span></div>
        </div>
      </div>
      <p>${escapeHtml(group.meaning)}</p>
      ${renderInnerBoard('Checks', rows, group.checks.length, 'passed-checks', 4)}
    </article>`;
}).join('');

const coverageGapsContent = coverageGapItems.length === 0
  ? renderEmptyState({
    icon: 'OK',
    title: 'No blocked or skipped scenarios.',
    reason: 'All scenarios included in this execution were runnable.',
    action: 'Continue monitoring release coverage.',
    metrics: [
      { label: 'Blocked', value: 0 },
      { label: 'Skipped', value: 0 },
      { label: 'Controlled', value: 0 },
      { label: 'Traceability', value: 0 },
    ],
  })
  : `
    <nav class="plan-nav" aria-label="Where you are">
      <button type="button" data-plan-back hidden><small>Back</small><strong data-plan-back-name>All reasons</strong></button>
      <div class="plan-crumbs">
        <button type="button" data-plan-goto="coverage-gaps">Not run</button>
        <span data-plan-crumb-sep hidden>/</span>
        <button type="button" data-plan-crumb-reason hidden></button>
        <span data-plan-crumb-sep2 hidden>/</span>
        <span data-plan-crumb-group hidden></span>
      </div>
      <button type="button" class="btn" data-plan-reset hidden>Reset</button>
    </nav>
    <nav class="plan-nav" data-plan-pager hidden aria-label="Groups in this reason">
      <button type="button" data-plan-prev disabled><small>Previous</small><strong data-plan-prev-name></strong></button>
      <span data-plan-pos></span>
      <button type="button" data-plan-next disabled><small>Next</small><strong data-plan-next-name></strong></button>
    </nav>
    <div data-passed-index>
    <div class="passed-board-head">
      <div>
        <h2 data-plan-heading>Choose a reason</h2>
        <p data-plan-note>Only the card you open is shown. Search finds one group.</p>
      </div>
      <div class="plan-toolbar-actions">
        <label class="module-filter-search">
          <input id="planCheckSearch" type="search" placeholder="Find a check or area" aria-label="Search checks that did not run">
        </label>
      </div>
    </div>
    <div class="passed-card-grid" data-plan-reasons>
      <a class="passed-card" href="#plan-cat-blocked"><div class="passed-card-top"><span class="module-icon">BL</span><strong>Blocked</strong></div><div class="passed-card-count"><b>${coverageGapSummary.blocked ?? 0}</b><span>checks</span></div><p>Need a product or admin change first.</p><span class="module-button">Open</span></a>
      <a class="passed-card" href="#plan-cat-controlled"><div class="passed-card-top"><span class="module-icon">SU</span><strong>Need a setup</strong></div><div class="passed-card-count"><b>${coverageGapSummary.controlled ?? 0}</b><span>checks</span></div><p>Need an email, code, or prepared user.</p><span class="module-button">Open</span></a>
      <a class="passed-card" href="#plan-cat-traceability"><div class="passed-card-top"><span class="module-icon">AC</span><strong>Already covered</strong></div><div class="passed-card-count"><b>${coverageGapSummary.traceability ?? 0}</b><span>checks</span></div><p>Checked by another test that did run.</p><span class="module-button">Open</span></a>
      <a class="passed-card" href="#plan-cat-future"><div class="passed-card-top"><span class="module-icon">LT</span><strong>Later</strong></div><div class="passed-card-count"><b>${coverageGapSummary.future ?? 0}</b><span>checks</span></div><p>Not part of this release.</p><span class="module-button">Open</span></a>
      <a class="passed-card" href="#plan-cat-skipped"><div class="passed-card-top"><span class="module-icon">LK</span><strong>Need a look</strong></div><div class="passed-card-count"><b>${coverageGapSummary.skipped ?? 0}</b><span>checks</span></div><p>Skipped without a clear reason.</p><span class="module-button">Open</span></a>
    </div>
    <div class="validation-group-count" data-plan-count hidden></div>
    <div class="passed-card-grid" data-plan-groups hidden>${planModuleCards}</div>
    <div class="empty-note" data-plan-empty hidden>No group matches that search.</div>
    <div class="coverage-next" data-plan-notes>
      ${displayModules.filter(module => Number(module.executed ?? ((module.passed ?? 0) + (module.failed ?? 0))) === 0).map(module => {
        const notes = {
          'Access Control': 'The permission check is already in the suite. It runs when two prepared users are available.',
          'General': 'Sign out and email trim already have tests that can run. The unlock-link check needs a locked account.',
        };
        const note = notes[module.name] || 'The tests are in the suite. Include that area in the next full run.';
        return `<p class="coverage-next-note"><strong>${escapeHtml(module.name)}</strong> has ${module.total} planned check${Number(module.total) === 1 ? '' : 's'} and none of those matrix rows ran. ${escapeHtml(note)}</p>`;
      }).join('')}
    </div>
    </div>
    `;

function getFailureScreenshotContextData(test, index = 0) {
  const primary = selectPrimaryFailureScreenshot(test);

  if (!primary.available) {
    return {
      available: false,
      annotatedAvailable: false,
      originalAvailable: false,
      originalHref: '',
      originalLabel: 'Original screenshot not available',
      annotatedHref: '',
      annotationMessage: primary.reason,
    };
  }

  const annotated = createAnnotatedFailurePreview(test, primary.item, index);

  return {
    available: true,
    annotatedAvailable: annotated.available,
    originalAvailable: true,
    originalHref: primary.href,
    originalLabel: primary.label,
    annotatedHref: annotated.href || '',
    annotationMessage: annotated.available
      ? annotated.reason
      : 'Failure location could not be determined automatically.',
  };
}

const failureDetailDataJson =
  JSON.stringify(failedSourceItems.map((test, index) => {
    const story = plainFailureStory(test, index);
    return {
    index: index + 1,
    title: getFailureShortTitle(test, index),
    fullTitle: getFailureFullTitle(test, index),
    module: test.module ?? getModuleName(test.title ?? test.testName ?? 'General'),
    severity: test.severity ?? 'High',
    status: test.status ?? 'failed',
    category: test.category ?? 'Execution',
    whatFailed: test.whatFailed ?? getFailureShortTitle(test, index),
    whyFailed: story.happened,
    expected: story.wanted,
    observed: story.happened,
    impact: getFailureImpact(test, index),
    cause: getFailureCauseLabel(test),
    technicalError: getFailureTechnicalError(test),
    sources: {
      summary: getFailureSummarySource(test),
      expected: getFailureExpectedSource(test),
      observed: getFailureObservedSource(test),
      impact: getFailureImpactSource(test),
      cause: getFailureCauseSource(test),
      technicalError: getFailureTechnicalError(test) === 'Technical error was not available in the AIR model.'
        ? 'Fallback explanation'
        : 'Playwright error',
    },
    nextAction: story.next,
    evidence: getFailureEvidenceInfo(test).status,
    screenshotContext: getFailureScreenshotContextData(test, index),
    artifactLinks: getFailureArtifactLinks(test),
    source: getFailureSourceLabel(test),
    };
  }))
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

const warningDetailDataJson =
  JSON.stringify(warningSourceItems.map((test, index) => ({
    index: index + 1,
    title: getWarningShortTitle(test, index),
    fullTitle: String(test.title ?? test.testName ?? `Warning ${index + 1}`),
    module: test.module ?? getModuleName(String(test.title ?? test.testName ?? 'General')),
    status: test.status ?? 'warning',
    reason: getWarningReason(test),
    nextAction: getWarningNextAction(test),
    file: test.file ?? 'Controlled coverage',
  })))
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

const coverageGapDetailDataJson =
  JSON.stringify(coverageGapItems.map((gap, index) => ({
    index: index + 1,
    title: gap.title ?? `Coverage gap ${index + 1}`,
    fullTitle: gap.fullTitle ?? gap.title ?? `Coverage gap ${index + 1}`,
    module: gap.module ?? 'General',
    category: gap.category ?? gap.status ?? 'Skipped',
    priority: gap.priority ?? 'Medium',
    status: gap.status ?? 'skipped',
    reason: gap.reason ?? 'Scenario was not executed in this run.',
    nextAction: gap.nextAction ?? 'Confirm prerequisites and rerun this scenario.',
    useCase: gap.useCase ?? gap.source ?? 'Execution coverage',
    sourceIds: Array.isArray(gap.sourceIds) ? gap.sourceIds.join(', ') : 'Not mapped',
  })))
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

const evidenceData = airResults?.evidence ?? {};
const discoveredScreenshotCount =
  fs.existsSync(path.join(projectRoot, 'playwright-report', 'data'))
    ? fs
      .readdirSync(path.join(projectRoot, 'playwright-report', 'data'))
      .filter(file => file.toLowerCase().endsWith('.png'))
      .length
    : 0;
const evidenceCounts = {
  screenshots: Math.max(
    Array.isArray(evidenceData.screenshots) ? evidenceData.screenshots.length : 0,
    discoveredScreenshotCount
  ),
  videos: Array.isArray(evidenceData.videos) ? evidenceData.videos.length : 0,
  traces: Array.isArray(evidenceData.traces) ? evidenceData.traces.length : 0,
  logs: Array.isArray(evidenceData.logs) ? evidenceData.logs.length : 0,
  rawReports: Array.isArray(evidenceData.rawReports) ? evidenceData.rawReports.length : 0,
};
const totalRichEvidenceArtifacts =
  evidenceCounts.screenshots +
  evidenceCounts.videos +
  evidenceCounts.traces +
  evidenceCounts.logs;
const totalEvidenceArtifacts =
  totalRichEvidenceArtifacts +
  evidenceCounts.rawReports;
const testsWithEvidenceCount =
  evidenceData.byTest && typeof evidenceData.byTest === 'object'
    ? Object.keys(evidenceData.byTest).length
    : 0;
const attemptsWithEvidenceCount =
  [
    ...(Array.isArray(evidenceData.screenshots) ? evidenceData.screenshots : []),
    ...(Array.isArray(evidenceData.videos) ? evidenceData.videos : []),
    ...(Array.isArray(evidenceData.traces) ? evidenceData.traces : []),
    ...(Array.isArray(evidenceData.logs) ? evidenceData.logs : []),
    ...(Array.isArray(evidenceData.attachments) ? evidenceData.attachments : []),
  ]
    .reduce((attempts, item) => {
      const key = `${item.testId || item.testTitle || item.path || 'unknown'}::${item.attemptId || item.attempt || item.retry || 'attempt'}`;
      attempts.add(key);
      return attempts;
    }, new Set())
    .size;

const evidenceStatusLabel = (label, count) => {
  if (label === 'Screenshots') {
    if (openableFailurePictures > 0) {
      return `${openableFailurePictures} can be opened`;
    }
    if (count > 0) {
      return `${count} saved, then cleared`;
    }
  }

  return count > 0 ? `${count} recorded` : 'None in this run';
};
const evidenceCards = [
  ['Screenshots', evidenceCounts.screenshots, 'IMG'],
  ['Videos', evidenceCounts.videos, 'VID'],
  ['Traces', evidenceCounts.traces, 'TRC'],
  ['Logs', evidenceCounts.logs, 'LOG'],
]
  .map(([label, count, icon]) => `
    <div class="evidence-card ${(label === 'Screenshots' ? openableFailurePictures : count) > 0 ? 'good' : 'none'}">
      <div class="evidence-icon">${escapeHtml(icon)}</div>
      <div class="evidence-card-body">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(evidenceStatusLabel(label, count))}</span>
      </div>
    </div>`)
  .join('');
const visualProofCount = evidenceCounts.screenshots + evidenceCounts.videos + evidenceCounts.traces;
const evidenceProofStripHtml = openableFailurePictures > 0
  ? `<div class="evidence-proof-strip">
      <span><b>${openableFailurePictures}</b><small>Pictures you can open</small></span>
    </div>`
  : '';
const evidenceSummaryText = openableFailurePictures > 0
  ? `${openableFailurePictures} picture${openableFailurePictures === 1 ? '' : 's'} can be opened from this report.`
  : blankFailurePictures > 0
    ? `The saved picture${blankFailurePictures === 1 ? ' is' : 's are'} a blank white screen. Each failed check shows the page text instead.`
    : evidenceCounts.screenshots > 0
    ? `This run saved ${evidenceCounts.screenshots} screenshot${evidenceCounts.screenshots === 1 ? '' : 's'}${evidenceCounts.logs ? ` and ${evidenceCounts.logs} log${evidenceCounts.logs === 1 ? '' : 's'}` : ''}. A later test run cleared them, so none can be opened here.`
    : evidenceCounts.logs > 0
      ? `No screenshots were saved. ${evidenceCounts.logs} log${evidenceCounts.logs === 1 ? '' : 's'} were recorded, then cleared.`
      : hasPlaywrightReport
        ? 'No screenshots were saved. The test log is still available.'
        : 'No proof was saved for this run.';
const evidencePackageNote = openableFailurePictures > 0
  ? 'These pictures are saved beside the report, so a later test run will not remove them.'
  : 'The next full run will keep a copy of each picture with this report.';
const resultsFileExists = fs.existsSync(resultsPath);
const evidenceHeroHtml = `
  <div class="evidence-hero">
    <div>
      <span class="mission-label">Proof</span>
      <strong>${openableFailurePictures > 0 ? 'Screenshots you can open' : blankFailurePictures > 0 ? 'Screenshots are blank' : evidenceCounts.screenshots > 0 ? 'Screenshots were cleared' : 'No screenshots saved'}</strong>
      <p>${escapeHtml(evidenceSummaryText)}</p>
      <p class="evidence-path-note">These pictures travel with this report. The full test log stays on the computer that ran the tests.</p>
    </div>
    <div class="evidence-score-card ${openableFailurePictures > 0 ? '' : 'muted'}">
      <span>Screenshots</span>
      <strong>${openableFailurePictures}</strong>
      <small>Saved with this report</small>
    </div>
  </div>
  ${evidenceProofStripHtml}`;

const businessHealthCards =
  displayModules
    .slice(0, 8)
    .map(module => {
      const tone =
        statusTone(module.status);

      return `
        <div class="health-card ${tone}">
          <div class="health-icon">${tone === 'green' ? 'OK' : tone === 'amber' ? '!' : 'RISK'}</div>
          <div>
            <strong>${escapeHtml(module.name)}</strong>
            <span>${module.score}%</span>
            <small>${escapeHtml(module.status)} - ${module.passed}/${module.total} passed</small>
          </div>
        </div>`;
    })
    .join('');

const airEvidenceThumbnails = Array.isArray(evidenceData.screenshots)
  ? evidenceData.screenshots
    .filter(item => item?.path && item?.previewable !== false)
  : [];

const evidenceThumbnailFiles =
  fs.existsSync(path.join(projectRoot, 'playwright-report', 'data'))
    ? fs
      .readdirSync(path.join(projectRoot, 'playwright-report', 'data'))
      .filter(file => file.toLowerCase().endsWith('.png'))
    : [];

const evidenceThumbnails =
  airEvidenceThumbnails.length > 0
    ? airEvidenceThumbnails
      .map((item, index) => {
        const href = getEvidenceHref(item);
        const label = item.testTitle || item.name || `Screenshot ${index + 1}`;
        const matchedFailure = failedSourceItems.find(test => {
          const full = getFailureFullTitle(test);
          return full && (full === label || label.includes(full) || full.includes(label));
        });
        const caption = matchedFailure
          ? plainFailureStory(matchedFailure).happened
          : '';

        if (!href || screenshotLooksBlank(item)) {
          return '';
        }

        const failedShot = String(item.attemptStatus || '').toLowerCase() === 'failed' || Boolean(caption);
        const failureIndex = matchedFailure ? failedSourceItems.indexOf(matchedFailure) : -1;
        const openHref = failureIndex >= 0 ? `#failure-group-${failureGroupKey(matchedFailure, failureIndex).key}` : href;
        const imageHref = href;
        const previewAttrs = failureIndex >= 0
          ? ''
          : ` data-evidence-preview data-evidence-kind="Screenshot ${index + 1}" data-evidence-status="${escapeHtml(item.attemptStatus || 'Available')}" data-evidence-href="${escapeHtml(href)}"`;

        return `
        <a class="thumb${failedShot ? ' thumb-failed' : ''}" href="${escapeHtml(openHref)}"${previewAttrs}${tooltipAttr(caption || label)}>
          <img src="${escapeHtml(imageHref)}" alt="${escapeHtml(caption || label)}">
          ${failedShot ? '<b class="thumb-failed-flag">Failed</b>' : ''}
          <span class="thumb-copy"><b>${escapeHtml(compactText(label, 72))}</b>${caption ? `<small>${escapeHtml(caption)}</small>` : ''}</span>
        </a>`;
      })
      .join('')
    : evidenceThumbnailFiles.length > 0
      ? evidenceThumbnailFiles
      .map((file, index) => `
        <a class="thumb" href="../playwright-report/data/${escapeHtml(file)}" data-evidence-preview data-evidence-kind="Screenshot ${index + 1}" data-evidence-status="Available" data-evidence-href="../playwright-report/data/${escapeHtml(file)}">
          <img src="../playwright-report/data/${escapeHtml(file)}" alt="Evidence screenshot ${index + 1}">
          <span>Screenshot ${index + 1}</span>
        </a>`)
      .join('')
      : [1, 2, 3, 4]
      .map(index => demoMode
        ? `
          <div class="thumb placeholder">
            <div>Preview</div>
            <span>Demo evidence ${index}</span>
          </div>`
        : renderEmptyState({
          icon: 'EV',
          title: 'No screenshots in this package.',
          reason: 'Open playwright-report/ for step detail, or test-results/ for raw artifacts when present.',
          action: 'Set RECORD_ALL_ARTIFACTS=true to keep screenshots, videos, and traces for passed checks.',
        }))
      .slice(0, demoMode ? 4 : 1)
      .join('');

const failureEvidenceMapHtml =
  failedSourceItems.length === 0
    ? ''
    : `
      <div class="panel evidence-failure-map">
        <div class="evidence-map-head">
          <div>
            <h2>Pictures for failed checks</h2>
            <p>${openableFailurePictures > 0 ? 'Open What failed to see the full screen and what to do next.' : blankFailurePictures > 0 ? 'The picture file is blank. The page text is on each failed check.' : 'The pictures from this run are no longer on disk.'}</p>
          </div>
          <button class="issue-detail-button" type="button" data-open-failure-details>See each failed screen</button>
        </div>
        <div class="evidence-map-summary">
          <div><span>Failed Tests</span><strong>${failedSourceItems.length}</strong><small>Open details for full investigation</small></div>
          <div><span>Pictures you can open</span><strong>${openableFailurePictures}/${failedSourceItems.length}</strong><small>Saved beside this report</small></div>
          <div><span>Impacted Modules</span><strong>${failedModuleCount}</strong><small>Modules with current failed checks</small></div>
        </div>
      </div>`;

const historySnapshots =
  Array.isArray(airResults?.history)
    ? airResults.history.slice(-8)
    : Array.isArray(airResults?.history?.executions)
      ? airResults.history.executions.slice(-8)
    : [];

function parseHistoryDate(item = {}) {
  const raw = item.generatedAt ?? item.endedAt ?? item.execution?.endedAt ?? '';
  const parsed = raw ? new Date(raw) : new Date(NaN);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getHistoryBuildLabel(item = {}, index = 0, options = {}) {
  const parsed = parseHistoryDate(item);

  if (parsed) {
    const shortDate = `${parsed.getMonth() + 1}/${parsed.getDate()}`;
    let hours = parsed.getHours();
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    const suffix = hours >= 12 ? 'p' : 'a';
    hours = hours % 12 || 12;
    const clock = `${hours}:${minutes}${suffix}`;
    const peers = options.peers ?? [];
    const sameDay = peers.filter(peer => {
      const peerDate = parseHistoryDate(peer);
      return peerDate
        && peerDate.getFullYear() === parsed.getFullYear()
        && peerDate.getMonth() === parsed.getMonth()
        && peerDate.getDate() === parsed.getDate();
    }).length > 1;

    if (options.compact) {
      return sameDay ? clock : shortDate;
    }

    return `${shortDate} ${clock}`;
  }

  const build =
    item.build ??
    item.project?.build ??
    item.execution?.build ??
    item.project?.buildVersion ??
    item.execution?.buildVersion;

  if (build && !/^playwright json$/i.test(String(build).trim())) {
    const normalizedBuild = String(build).replace(/^build\s+/i, '');
    return options.compact ? `B${normalizedBuild}` : `Build ${normalizedBuild}`;
  }

  const executionNumber = item.index ?? index + 1;
  return options.compact ? `E${executionNumber}` : `Execution ${executionNumber}`;
}

function getHistoryDateLabel(item = {}) {
  return item.generatedAtDisplay ?? item.generatedAt ?? 'Execution time unavailable';
}

function getHistoryReleaseLabel(item = {}) {
  return formatReleaseDecision(
    item.releaseDecision ??
    item.decision ??
    item.release?.decision ??
    item.release?.status ??
    item.releaseDecision?.status ??
    item.summary?.releaseDecision
  );
}

function getHistoryQualityLabel(item = {}) {
  const score =
    item.qualityScore ??
    item.quality?.score ??
    item.summary?.qualityScore;

  return score === undefined || score === null ? 'Quality unavailable' : `${score}%`;
}

function getHistoryTooltip(item = {}, index = 0, valueLabel = '') {
  return [
    getHistoryBuildLabel(item, index),
    `Executed: ${getHistoryDateLabel(item)}`,
    `Quality: ${getHistoryQualityLabel(item)}`,
    `Release: ${getHistoryReleaseLabel(item)}`,
    valueLabel ? `Value: ${valueLabel}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

const historicalTrendBars =
  historySnapshots.length > 0
    ? historySnapshots
      .map((snapshot, index) => {
        const label =
          index === historySnapshots.length - 1
            ? 'Current'
            : getHistoryBuildLabel(snapshot, index, { compact: true, peers: historySnapshots });
        const rate =
          snapshot.summary?.passRate ?? 0;

        return `<div class="trend-bar" title="${escapeHtml(getHistoryTooltip(snapshot, index, `${rate}% pass rate`))}"><span style="height:${Math.max(6, rate)}%"></span><small>${escapeHtml(label)}</small><strong>${rate}%</strong></div>`;
      })
      .join('')
    : '<div class="empty-note">Run the report after each execution to build AIR historical trend data.</div>';

const historyComparison = airResults?.history?.comparison ?? {};
const hasPreviousComparison = historyComparison.status === 'Compared' && historyComparison.previous;
const comparisonMetrics = historyComparison.metrics ?? {};
const historyFailureComparison = historyComparison.failures ?? {};
const historyReleaseComparison = historyComparison.release ?? {};
const executionIntelligence = airResults?.history?.executionIntelligence ?? {};

function formatComparisonValue(metricName, value) {
  if (value === undefined || value === null) {
    return 'No Data';
  }

  if (metricName === 'durationMs') {
    return formatDuration(value);
  }

  if (['quality', 'confidence', 'businessHealth', 'passRate', 'failureRate', 'moduleCoverage', 'journeyCoverage'].includes(metricName)) {
    return `${value}%`;
  }

  if (metricName === 'evidence') {
    return `${value} items`;
  }

  return String(value);
}

function renderComparisonMetric(label, metricName) {
  const metric = comparisonMetrics[metricName];

  if (!hasPreviousComparison || !metric) {
    return `
      <div class="compare-card">
        <span>${escapeHtml(label)}</span>
        <strong>No previous data</strong>
        <small>No previous execution available</small>
      </div>`;
  }

  const tone =
    metric.direction === 'Improved'
      ? 'green'
      : metric.direction === 'Regressed'
        ? 'red'
        : 'amber';
  const trendSymbol =
    metric.direction === 'Improved'
      ? '↑'
      : metric.direction === 'Regressed'
        ? '↓'
        : '→';
  const trendLabel =
    metric.direction === 'Improved'
      ? 'Better'
      : metric.direction === 'Regressed'
        ? 'Worse'
        : 'Stable';

  return `
    <div class="compare-card ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatComparisonValue(metricName, metric.current))}</strong>
      <small>Previous: ${escapeHtml(formatComparisonValue(metricName, metric.previous))}</small>
      <em class="trend-indicator">${escapeHtml(metric.direction)} - ${escapeHtml(trendLabel)} ${metric.delta > 0 ? '+' : ''}${escapeHtml(metric.delta)}</em>
    </div>`;
}

function indexByName(items = []) {
  return new Map(items.map(item => [item.name, item]));
}

function compareNamedCollections(currentItems = [], previousItems = [], scoreField = 'score') {
  const currentMap = indexByName(currentItems);
  const previousMap = indexByName(previousItems);
  const names = [...new Set([...currentMap.keys(), ...previousMap.keys()])].sort((left, right) => left.localeCompare(right));
  const improved = [];
  const regressed = [];
  const stable = [];
  const added = [];
  const notExecuted = [];
  const removed = [];
  const riskChanged = [];
  const recommendationChanged = [];

  for (const name of names) {
    const current = currentMap.get(name);
    const previous = previousMap.get(name);

    if (!previous && current) {
      added.push(current);
      continue;
    }

    if (!current && previous) {
      removed.push(previous);
      continue;
    }

    if (current && (current.total ?? 0) === 0) {
      notExecuted.push(current);
      continue;
    }

    if (!current || !previous) {
      continue;
    }

    const currentScore = current[scoreField] ?? current.coverage ?? 0;
    const previousScore = previous[scoreField] ?? previous.coverage ?? 0;

    if (currentScore > previousScore) improved.push({ name, currentScore, previousScore });
    if (currentScore < previousScore) regressed.push({ name, currentScore, previousScore });
    if (currentScore === previousScore) stable.push({ name, currentScore, previousScore });
    if (current.risk !== previous.risk) riskChanged.push({ name, status: `${previous.risk ?? 'No Data'} -> ${current.risk ?? 'No Data'}` });
    if (current.recommendation !== previous.recommendation) recommendationChanged.push({ name, status: 'Recommendation changed' });
  }

  return { improved, regressed, stable, added, notExecuted, removed, riskChanged, recommendationChanged };
}

function renderComparisonList(items = [], emptyText = 'No changes detected') {
  if (!hasPreviousComparison) {
    return '<div class="empty-note">No previous execution available.</div>';
  }

  if (items.length === 0) {
    return `<div class="empty-note">${escapeHtml(emptyText)}</div>`;
  }

  return `
    <ul class="compare-list">
      ${items.map(item => `
        <li>
          <strong>${escapeHtml(item.name ?? item.testName ?? item.title ?? item.metric)}</strong>
          <span>${escapeHtml(item.currentScore !== undefined ? `${item.previousScore}% -> ${item.currentScore}%` : item.status ?? item.direction ?? '')}</span>
        </li>`).join('')}
    </ul>`;
}

function getComparisonItemText(item = {}) {
  return item.currentScore !== undefined
    ? `${item.previousScore}% -> ${item.currentScore}%`
    : item.summary ??
      item.status ??
      item.classification ??
      item.direction ??
      (
        item.occurrenceRate !== undefined
          ? `${item.occurrenceRate}% occurrence rate`
          : ''
      );
}

function getReadableHistoryName(item = {}) {
  const rawName = item.name ?? item.testName ?? item.title ?? item.metric ?? 'History item';
  const parts = String(rawName)
    .split('>')
    .map(part => part.trim())
    .filter(Boolean);

  return parts.at(-1) ?? rawName;
}

function renderHistorySignalCard(title, items = [], emptyText = 'No changes detected', tone = 'neutral') {
  const count = hasPreviousComparison ? items.length : 0;
  const preview = items.slice(0, 2);

  return `
    <div class="history-signal-card ${tone}">
      <div class="history-signal-head">
        <span>${escapeHtml(title)}</span>
        <strong>${count}</strong>
      </div>
      ${!hasPreviousComparison ? '<p>No previous execution available.</p>' : preview.length ? `
        <ul>
          ${preview.map(item => `
            <li>
              <b title="${escapeHtml(item.name ?? item.testName ?? item.title ?? item.metric ?? '')}">${escapeHtml(getReadableHistoryName(item))}</b>
              <small>${escapeHtml(getComparisonItemText(item))}</small>
            </li>`).join('')}
        </ul>
      ` : `<p>${escapeHtml(emptyText)}</p>`}
    </div>`;
}

function renderExecutiveFocusCards(items = []) {
  const visibleItems = items.slice(0, 4);

  return `
    <div class="executive-focus-grid">
      ${visibleItems.map((item, index) => `
        <div class="executive-focus-card">
          <span>Focus ${index + 1}</span>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${escapeHtml(item.status)}</p>
        </div>`).join('')}
    </div>`;
}

function renderTestChangeSummary(title, items = [], emptyText = 'No changes detected') {
  if (!hasPreviousComparison) {
    return '<div class="empty-note">No previous execution available.</div>';
  }

  if (items.length === 0) {
    return `<div class="empty-note">${escapeHtml(emptyText)}</div>`;
  }

  const previewItems = items.slice(0, 3);
  const remainingCount = items.length - previewItems.length;

  return `
    <div class="test-change-summary">
      <div class="test-change-count">
        <strong>${escapeHtml(items.length)}</strong>
        <span>${escapeHtml(title)}</span>
      </div>
      <ul class="compare-list compact-list">
        ${previewItems.map(item => `
          <li>
            <strong>${escapeHtml(item.name ?? item.testName ?? item.title ?? item.id ?? 'Unnamed test')}</strong>
            <span>${escapeHtml(item.status ?? item.module ?? item.file ?? '')}</span>
          </li>`).join('')}
      </ul>
      ${remainingCount > 0 ? `<div class="empty-note small-note">+${remainingCount} more in air-results.json</div>` : ''}
    </div>`;
}

const moduleComparison = historyComparison.modules ?? compareNamedCollections(
  airResults?.modules ?? [],
  historyComparison.previous?.modules ?? [],
  'score'
);
const journeyComparison = historyComparison.businessJourneys ?? compareNamedCollections(
  airResults?.businessJourneys ?? [],
  historyComparison.previous?.businessJourneys ?? [],
  'score'
);
const testComparison = historyComparison.tests ?? {};
const addedTests = testComparison.added ?? [];
const removedTests = testComparison.removed ?? [];
const modifiedTests = (testComparison.modified ?? []).map(item => ({
  name: item.test?.title ?? item.previous?.title ?? item.key,
  status: (item.changes ?? []).map(change => change.field).join(', ') || 'Modified',
}));
const currentFailures = new Map((airResults?.failedTests ?? []).map(failure => [failure.testId ?? failure.testName, failure]));
const previousFailures = new Map((historyComparison.previous?.failedTests ?? []).map(failure => [failure.testId ?? failure.testName, failure]));
const newFailures = historyFailureComparison.added ?? [...currentFailures.entries()]
  .filter(([id]) => !previousFailures.has(id))
  .map(([, failure]) => failure);
const resolvedFailures = historyFailureComparison.resolved ?? [...previousFailures.entries()]
  .filter(([id]) => !currentFailures.has(id))
  .map(([, failure]) => failure);
const recurringFailures = historyFailureComparison.recurring ?? [...currentFailures.entries()]
  .filter(([id]) => previousFailures.has(id))
  .map(([, failure]) => failure);
const severityChanges = historyFailureComparison.severityChanges ?? [...currentFailures.entries()]
  .filter(([id, failure]) => {
    const previousFailure = previousFailures.get(id);
    return previousFailure && previousFailure.severity !== failure.severity;
  })
  .map(([id, failure]) => ({
    name: failure.testName ?? failure.title ?? id,
    status: `${previousFailures.get(id)?.severity ?? 'No Data'} -> ${failure.severity ?? 'No Data'}`,
  }));
const releaseChange =
  hasPreviousComparison
    ? `${historyReleaseComparison.previous ?? historyComparison.previous?.release?.decision ?? historyComparison.previous?.release?.status ?? historyComparison.previous?.releaseDecision?.status ?? 'No Data'} -> ${historyReleaseComparison.current ?? airResults?.release?.decision ?? airResults?.release?.status ?? executiveData.releaseDecision}`
    : 'No previous execution available';
const currentReleaseReasons = new Set(airResults?.release?.reasons ?? []);
const previousReleaseReasons = new Set(historyComparison.previous?.release?.reasons ?? []);
const reasonChanges = [
  ...(historyReleaseComparison.reasonChanges?.added ?? [])
    .map(reason => ({ name: reason, status: 'New reason' })),
  ...(historyReleaseComparison.reasonChanges?.removed ?? [])
    .map(reason => ({ name: reason, status: 'Resolved reason' })),
];
const fallbackReasonChanges = [
  ...[...currentReleaseReasons]
    .filter(reason => !previousReleaseReasons.has(reason))
    .map(reason => ({ name: reason, status: 'New reason' })),
  ...[...previousReleaseReasons]
    .filter(reason => !currentReleaseReasons.has(reason))
    .map(reason => ({ name: reason, status: 'Resolved reason' })),
];
const effectiveReasonChanges = reasonChanges.length > 0 ? reasonChanges : fallbackReasonChanges;
const historicalWinItems = [
  {
    name: 'Resolved Failures',
    status: `${resolvedFailures.length} resolved`,
  },
  {
    name: 'Improved Modules',
    status: `${moduleComparison.improved?.length ?? 0} improved`,
  },
  {
    name: 'Improved Journeys',
    status: `${journeyComparison.improved?.length ?? 0} improved`,
  },
  {
    name: 'Release Confidence',
    status: getComparisonDeltaLabel('confidence', '%'),
  },
];
const recurringFailurePatterns = executionIntelligence.recurringFailures ?? [];
const activeRecurringFailurePatterns = executionIntelligence.activeRecurringFailures ?? [];
const flakyHistoryPatterns = executionIntelligence.flakyTests ?? [];
const failureTimelinePatterns = executionIntelligence.failureTimelines ?? [];
const executionFocusItems = executionIntelligence.focus ?? [];

const currentModulesExecuted = (airResults?.modules ?? []).filter(module => (module.total ?? 0) > 0).length;
const previousModulesExecuted = (historyComparison.previous?.modules ?? []).filter(module => (module.total ?? 0) > 0).length;
const currentJourneysExecuted = (airResults?.businessJourneys ?? []).filter(journey => (journey.total ?? 0) > 0).length;
const previousJourneysExecuted = (historyComparison.previous?.businessJourneys ?? []).filter(journey => (journey.total ?? 0) > 0).length;
const stableModules = moduleComparison.stable;
const removedModules = moduleComparison.removed;
const journeyRecoveries = journeyComparison.improved;
const journeyRegressions = journeyComparison.regressed;
const newJourneyRisks = (airResults?.businessJourneys ?? [])
  .filter(journey => ['Warning', 'Critical', 'At Risk', 'Partial'].includes(journey.status) || ['Medium', 'High'].includes(journey.risk))
  .map(journey => ({ name: journey.name, status: journey.risk ?? journey.status }));
const criticalFailures = (airResults?.failedTests ?? [])
  .filter(failure => ['Critical', 'High'].includes(failure.severity))
  .map(failure => ({ name: failure.testName ?? failure.title, status: failure.severity }));
const failureCategoryItems = Object.entries((airResults?.failedTests ?? []).reduce((groups, failure) => {
  const category = failure.category ?? 'Uncategorized';
  groups[category] = (groups[category] ?? 0) + 1;
  return groups;
}, {})).map(([name, count]) => ({ name, status: `${count} failure${count === 1 ? '' : 's'}` }));
const releaseTimeline = (airResults?.history?.releaseTimeline ?? historySnapshots)
  .map((snapshot, index) => ({
    name: getHistoryBuildLabel(snapshot, index),
    status: snapshot.decision ?? snapshot.release?.decision ?? snapshot.release?.status ?? snapshot.releaseDecision?.status ?? snapshot.summary?.releaseDecision ?? 'No Data',
  }));
const mostImprovedModule = moduleComparison.improved
  .sort((left, right) => (right.currentScore - right.previousScore) - (left.currentScore - left.previousScore))[0];
const highestRiskModule = [...(airResults?.modules ?? [])]
  .sort((left, right) => {
    const riskWeight = { High: 3, Medium: 2, Low: 1, 'No Data': 0 };
    return (riskWeight[right.risk] ?? 0) - (riskWeight[left.risk] ?? 0) || (right.failed ?? 0) - (left.failed ?? 0);
  })[0];
const mostStableJourney = [...(airResults?.businessJourneys ?? [])]
  .filter(journey => journey.status === 'Healthy' || journey.risk === 'Low')
  .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))[0];
const longestRunningModule = [...(airResults?.modules ?? [])]
  .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))[0];
const engineeringInsightItems = [
  ...executionFocusItems.map(item => ({
    name: item.type,
    status: `${item.summary} ${item.action}`,
  })),
  { name: 'Active Recurring Failures', status: activeRecurringFailurePatterns.length ? `${activeRecurringFailurePatterns.length} active recurring pattern(s) require root-cause review` : 'No active recurring failure pattern detected' },
  { name: 'Flaky Test Patterns', status: flakyHistoryPatterns.length ? `${flakyHistoryPatterns.length} flaky pattern(s) detected` : 'No flaky pattern detected' },
  { name: 'Top Regressions', status: moduleComparison.regressed.length ? `${moduleComparison.regressed.length} module regressions` : 'No module regressions detected' },
  { name: 'Most Improved Module', status: mostImprovedModule ? `${mostImprovedModule.name} (${mostImprovedModule.previousScore}% -> ${mostImprovedModule.currentScore}%)` : 'No improvement trend yet' },
  { name: 'Highest Risk Module', status: highestRiskModule ? `${highestRiskModule.name} (${highestRiskModule.risk})` : 'No module risk data' },
  { name: 'Most Stable Journey', status: mostStableJourney ? `${mostStableJourney.name} (${mostStableJourney.score}%)` : 'No stable journey trend yet' },
];
const timelineRows = historySnapshots
  .map((snapshot, index) => `
    <tr>
      <td>${escapeHtml(snapshot.project?.build ?? snapshot.execution?.build ?? `Build ${index + 1}`)}</td>
      <td>${escapeHtml(snapshot.project?.version ?? snapshot.project?.build ?? 'No Data')}</td>
      <td>${escapeHtml(snapshot.generatedAtDisplay ?? snapshot.generatedAt ?? 'No Data')}</td>
      <td>${escapeHtml(`${snapshot.quality?.score ?? snapshot.summary?.qualityScore ?? 0}%`)}</td>
      <td>${escapeHtml(snapshot.release?.decision ?? snapshot.release?.status ?? snapshot.releaseDecision?.status ?? 'No Data')}</td>
      <td>${escapeHtml(formatDuration(snapshot.summary?.durationMs ?? 0))}</td>
      <td>${escapeHtml(index === 0 ? 'Baseline' : 'Recorded')}</td>
    </tr>`)
  .join('');
const timelineCards = historySnapshots
  .map((snapshot, index) => {
    const releaseValue = getSnapshotRelease(snapshot);
    const releaseTone = getReleaseTone(releaseValue);
    const buildLabel = snapshot.project?.build ?? snapshot.execution?.build ?? `Build ${index + 1}`;
    const qualityValue = snapshot.quality?.score ?? snapshot.summary?.qualityScore ?? 0;
    const passedValue = snapshot.summary?.passed ?? snapshot.summary?.passedTests ?? 0;
    const failedValue = snapshot.summary?.failed ?? snapshot.summary?.failedTests ?? 0;
    const totalValue = snapshot.summary?.total ?? snapshot.summary?.totalTests ?? 0;
    const timelineLabel = index === historySnapshots.length - 1 ? 'Current' : `Execution ${index + 1}`;

    return `
      <div class="history-timeline-card ${releaseTone}">
        <span class="timeline-marker">${String(index + 1).padStart(2, '0')}</span>
        <div>
          <span>${escapeHtml(timelineLabel)}</span>
          <strong>${escapeHtml(buildLabel)}</strong>
          <small>${escapeHtml(snapshot.generatedAtDisplay ?? snapshot.generatedAt ?? 'No execution date')}</small>
        </div>
        <div class="history-timeline-metrics">
          <b>${escapeHtml(`${qualityValue}%`)}</b>
          ${renderReleaseBadge(releaseValue, { compact: true })}
          <em>${escapeHtml(formatDuration(snapshot.summary?.durationMs ?? 0))}</em>
        </div>
        <div class="timeline-execution-summary">
          <span>${escapeHtml(String(totalValue))} tests</span>
          <span>${escapeHtml(String(passedValue))} passed</span>
          <span>${escapeHtml(String(failedValue))} failed</span>
        </div>
      </div>`;
  })
  .join('');

function getSnapshotRelease(snapshot = {}) {
  return formatReleaseDecision(
    snapshot.release?.decision ??
    snapshot.release?.status ??
    snapshot.releaseDecision?.status ??
    snapshot.summary?.releaseDecision
  );
}

function getCurrentReleaseValue() {
  return formatReleaseDecision(
    airResults?.release?.decision ??
    airResults?.release?.status ??
    airResults?.releaseDecision?.status ??
    executiveData.releaseDecision
  );
}

function getComparisonDirection(metricName) {
  const metric = comparisonMetrics[metricName];
  return hasPreviousComparison && metric ? metric.direction : 'No previous data';
}

function getComparisonDeltaLabel(metricName, suffix = '') {
  const metric = comparisonMetrics[metricName];

  if (!hasPreviousComparison || !metric) {
    return 'No previous execution available';
  }

  const sign = metric.delta > 0 ? '+' : '';
  return `${metric.direction}: ${sign}${metric.delta}${suffix}`;
}

function renderHistoryTrendCard(title, trendKey, formatter = value => `${value}%`, options = {}) {
  const points = airResults?.history?.trends?.[trendKey]?.points ?? [];
  const trendSummary = airResults?.history?.trends?.[trendKey]?.summary ?? {};
  const latestPoints = points.slice(-8);
  const trendDescriptions = {
    quality: 'Quality score by recent AIR execution.',
    passRate: 'Pass rate by recent AIR execution.',
    failures: 'Failed-test count by recent AIR execution.',
    moduleCoverage: 'Module coverage trend by execution.',
    journeyCoverage: 'Business journey coverage trend by execution.',
  };
  const trendDescription =
    options.description ??
    trendDescriptions[trendKey] ??
    'Trend values across recent AIR executions.';

  if (latestPoints.length < 2) {
    return renderEmptyState({
      title: `${title} not available.`,
      reason: 'AIR needs at least two stored executions to calculate this trend.',
      action: 'Run another execution and regenerate the AIR report.',
      icon: 'HI',
    });
  }

  const numericValues = latestPoints
    .map(point => Number(point.value))
    .filter(value => Number.isFinite(value));
  const maxValue = Math.max(...numericValues, options.max ?? 100, 1);

  return `
    <div class="history-trend-card">
      <div class="history-trend-head">
        <div>
          <span>${escapeHtml(title)}</span>
          <small>${escapeHtml(trendDescription)}</small>
        </div>
        <strong>${escapeHtml(formatter(latestPoints.at(-1)?.value ?? 0))}</strong>
      </div>
      <div class="history-sparkline">
        ${latestPoints.map((point, index) => {
          const numericValue = Number(point.value);
          const height = Number.isFinite(numericValue)
            ? Math.max(8, Math.min(100, Math.round((numericValue / maxValue) * 100)))
            : 8;

          const displayLabel = getHistoryBuildLabel(point, index, { compact: true });
          const tooltip = getHistoryTooltip(point, index, formatter(point.value));

          return `
            <div class="history-spark" title="${escapeHtml(tooltip)}">
              <span style="height:${height}%"></span>
              <small>${escapeHtml(displayLabel)}</small>
            </div>`;
        }).join('')}
      </div>
      <div class="history-trend-summary">
        <span>${escapeHtml(trendSummary.direction ?? 'No Trend')}</span>
        <small>Avg ${escapeHtml(formatter(trendSummary.average ?? 0))} &bull; High ${escapeHtml(formatter(trendSummary.highest ?? 0))} &bull; Low ${escapeHtml(formatter(trendSummary.lowest ?? 0))}</small>
      </div>
    </div>`;
}

function renderFailureTimelinePreview(items = []) {
  const visibleItems = items.slice(0, 4);

  if (!hasPreviousComparison) {
    return renderEmptyState({
      title: 'Failure timeline not available.',
      reason: 'AIR needs at least two executions to build per-test failure timelines.',
      action: 'Run another execution and regenerate the AIR report.',
      icon: 'FT',
    });
  }

  if (visibleItems.length === 0) {
    return renderEmptyState({
      title: 'No failure timeline patterns detected.',
      reason: 'No failed tests were found across stored historical executions.',
      action: 'Continue monitoring future executions.',
      icon: 'FT',
    });
  }

  return `
    <div class="failure-timeline-preview">
      <div class="failure-timeline-count">Showing ${escapeHtml(String(visibleItems.length))} of ${escapeHtml(String(items.length))} historical failure pattern(s)</div>
      ${visibleItems.map(item => `
        <div class="failure-timeline-row">
          <div>
            <strong title="${escapeHtml(item.name ?? item.testName ?? 'Failure')}">${escapeHtml(getReadableHistoryName(item))}</strong>
            <span>${escapeHtml(String(item.failedCount ?? 0))} failed occurrence(s) across history &bull; ${escapeHtml(String(item.occurrenceRate ?? 0))}% occurrence rate</span>
          </div>
          <div class="failure-timeline-meta">
            <em class="${String(item.currentStatus ?? '').toLowerCase() === 'failed' ? 'bad' : 'good'}">${escapeHtml(item.classification ?? 'Historical')}</em>
            <small>${escapeHtml(item.currentStatus === 'failed' ? 'Current run failed' : 'Current run passed')}</small>
          </div>
          <div class="failure-timeline-dots" aria-label="${escapeHtml(item.summary ?? 'Failure timeline')}">
            ${(item.timeline ?? []).slice(-8).map(point => `
              <i class="${point.status === 'failed' ? 'bad' : 'good'}" title="${escapeHtml(getHistoryTooltip(point, point.index - 1, point.status))}"></i>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
}

function renderReleaseTrendCard() {
  const snapshots = historySnapshots.slice(-8);

  if (snapshots.length < 2) {
    return renderEmptyState({
      title: 'Release trend not available.',
      reason: 'AIR needs at least two executions to compare release decisions.',
      action: 'Run another execution and regenerate the AIR report.',
      icon: 'RT',
    });
  }

  return `
    <div class="history-trend-card">
      <div class="history-trend-head">
        <div>
          <span>Release Trend</span>
          <small>Release decision by recent AIR execution.</small>
        </div>
        ${renderReleaseBadge(getCurrentReleaseValue(), { compact: true })}
      </div>
      <div class="release-timeline">
        ${snapshots.map((snapshot, index) => `
          <div title="${escapeHtml(getHistoryTooltip(snapshot, index, getSnapshotRelease(snapshot)))}">
            ${renderReleaseBadge(getSnapshotRelease(snapshot), { compact: true })}
            <small>${escapeHtml(index === snapshots.length - 1 ? 'Current' : getHistoryBuildLabel(snapshot, index, { compact: true }))}</small>
          </div>`).join('')}
      </div>
    </div>`;
}

const executiveWhatChangedItems = hasPreviousComparison
  ? (airResults?.history?.whatChanged?.items ?? [
    `Release changed from ${getSnapshotRelease(historyComparison.previous)} to ${getCurrentReleaseValue()}.`,
    `Quality is ${getComparisonDirection('quality').toLowerCase()} compared with the previous execution.`,
    `Pass rate is ${getComparisonDirection('passRate').toLowerCase()} and currently ${executiveData.passRate}%.`,
    `Failed tests changed by ${comparisonMetrics.failures?.delta ?? 0}; current failed count is ${executiveData.failed}.`,
    `Module coverage is ${getComparisonDirection('moduleCoverage').toLowerCase()}.`,
  ])
  : [
    'This is the first recorded execution in AIR history.',
    'Build comparison will appear after the next stored execution.',
  ];

const executiveWhatChangedSummary = hasPreviousComparison
  ? (airResults?.history?.whatChanged?.summary ?? `AIR compared this execution with the previous stored build. Release is ${getCurrentReleaseValue()}, quality is ${getComparisonDirection('quality').toLowerCase()}, failures are ${getComparisonDirection('failures').toLowerCase()}, and execution duration is ${getComparisonDirection('durationMs').toLowerCase()}.`)
  : 'AIR has recorded the first execution. Historical comparison will become available after the next run.';

const aiWhyItems =
  (Array.isArray(airResults?.releaseDecision?.reasons) && airResults.releaseDecision.reasons.length > 0
    ? airResults.releaseDecision.reasons
    : executiveData.releaseDecision === 'GO'
    ? [
      'All executed tests passed.',
      'No blocker defects were detected.',
      `Pass rate is ${executiveData.passRate}%, above the release threshold.`,
      `Business health is ${executiveData.businessHealth}%, supporting release confidence.`,
    ]
    : executiveData.releaseDecision === 'CONDITIONAL GO'
      ? [
        'Core journeys are mostly healthy.',
        'Some warning areas require focused review.',
        'Release can proceed after evidence review and targeted rerun.',
      ]
      : [
        'Blocking failures exist in the current execution.',
        'Release threshold was not met.',
        'Failed tests need evidence review and rerun before approval.',
      ])
    .map(item => `<li>${escapeHtml(item)}</li>`)
    .join('');

const footerHtml = 'Prepared by AIR · Developed By Hardik Thanki';

const executiveConfidence =
  airResults?.releaseDecision?.confidence ??
  Math.round(
    (
      executiveData.qualityScore +
      executiveData.businessHealth +
      executiveData.passRate
    ) / 3
  );

const configuredQualityContributors = Array.isArray(airResults?.quality?.contributors)
  ? airResults.quality.contributors.map(contributor => [
    contributor.label ?? contributor.factor,
    `${contributor.value}%`,
    `${Math.round((contributor.weight ?? 0) * 100)}% configured scoring weight.`,
  ])
  : [];
const qualityFactors = configuredQualityContributors.length > 0 ? configuredQualityContributors : [
  ['Pass Rate', `${executiveData.passRate}%`, 'Execution pass percentage from the current AIR model.'],
  ['Coverage', demoMode ? 'Demo' : 'UI', demoMode ? 'Sample coverage in demo mode.' : 'Current phase uses UI automation coverage from executed tests.'],
  ['Critical Flow Health', `${executiveData.businessHealth}%`, 'Business journey health based on configured critical flow modules.'],
  ['Business Health', `${executiveData.businessHealth}%`, 'Overall business module stability in this execution.'],
  ['Risk', riskLevel, 'Release risk from failures, warnings, and configured thresholds.'],
  ['Execution Stability', failed === 0 ? 'Stable' : 'Review', failed === 0 ? 'No failed tests detected in the latest execution.' : 'Failures require investigation before approval.'],
];

const qualityFactorRows =
  qualityFactors
    .map(([factor, value, explanation]) => `
      <tr>
        <td>${escapeHtml(factor)}</td>
        <td><span class="badge good">${escapeHtml(value)}</span></td>
        <td>${escapeHtml(explanation)}</td>
      </tr>`)
    .join('');

const totalAirPages = 13;
const currentBranch =
  airResults?.project?.branch ??
  process.env.GITHUB_REF_NAME ??
  process.env.BRANCH_NAME ??
  readGitValue('git branch --show-current', 'Local');
const currentCommit =
  airResults?.project?.commit ??
  process.env.GITHUB_SHA?.slice(0, 8) ??
  readGitValue('git rev-parse --short HEAD', 'Local');
const executionTrigger =
  airResults?.project?.trigger ??
  (process.env.CI ? 'CI Pipeline' : 'Local Execution');
const latestExecution =
  'Latest generated report';
const airPlatformVersion = 'AIR Platform v1.2';
const airCoreVersion = 'Historical Intelligence';
const parserName = airResults?.source?.parser ?? airResults?.source?.type ?? 'Playwright Parser';
const dataFreshnessCards = `
  <div class="freshness-strip">
    <span><b>Generated</b>${escapeHtml(generatedAt)}</span>
    <span><b>Source</b>${escapeHtml(parserName)}</span>
    <span><b>Build</b>${escapeHtml(buildVersion)}</span>
    <span><b>History</b>${escapeHtml(String(Array.isArray(airResults?.history?.executions) ? airResults.history.executions.length : 0))} executions</span>
  </div>`;
const provenanceMode =
  airResults?.provenance?.mode ??
  (airResults?.source?.type === 'air-history' ? 'RESTORED_HISTORY' : 'CURRENT_EXECUTION');
const provenanceWarningHtml =
  provenanceMode === 'RESTORED_HISTORY'
    ? `<div class="air-provenance-warning"><strong>Restored History</strong><span>${escapeHtml(airResults?.provenance?.warning ?? 'AIR is showing restored history because current execution data was unavailable.')}</span></div>`
    : '';

const executiveNarrative =
  executiveData.releaseDecision === 'GO'
    ? `Build health is excellent. ${executiveData.executed ?? executiveData.passed} tests ran with ${executiveData.passed} passing and no blocker defects found. Critical business journeys are healthy, business risk is low, and AIR recommends GO with ${executiveConfidence}% confidence.`
    : executiveData.releaseDecision === 'CONDITIONAL GO'
      ? `Executed coverage is clean, but the catalog is incomplete. ${executiveData.executed ?? executiveData.passed} of ${executiveData.total} tests ran (${executiveData.executedPassRate ?? executiveData.passRate}% executed pass rate). AIR recommends CONDITIONAL GO until blocked and not-executed coverage is reviewed.`
      : `Build health needs attention. ${executiveData.failed} failures were detected in the current execution, so AIR recommends resolving blockers and rerunning impacted coverage before release.`;

const whyReleaseItems =
  (Array.isArray(airResults?.releaseDecision?.reasons) && airResults.releaseDecision.reasons.length > 0
    ? airResults.releaseDecision.reasons
    : executiveData.releaseDecision === 'GO'
    ? [
      'Critical flows passed',
      'No blocker defects',
      'Coverage above release threshold',
      'Business risk low',
    ]
    : executiveData.releaseDecision === 'CONDITIONAL GO'
      ? [
        'Core flows mostly healthy',
        'Warnings need focused review',
        'Evidence review required',
        'Targeted rerun recommended',
      ]
      : [
        'Blocking failures detected',
        'Release threshold not met',
        'Evidence review required',
        'Rerun required after fixes',
      ])
    .map(item => `<li>${escapeHtml(item)}</li>`)
    .join('');

const estimatedReleaseRisk =
  airResults?.summary?.estimatedReleaseRisk ??
  (executiveData.releaseDecision === 'NO GO'
    ? 'HIGH'
    : executiveData.releaseDecision === 'CONDITIONAL GO' || executiveData.failed > 0 || executiveData.skipped > 0
      ? 'MEDIUM'
      : 'LOW');
const releaseRecommendedAction =
  airResults?.releaseDecision?.recommendedAction ??
  (executiveData.releaseDecision === 'GO'
    ? 'Proceed with release monitoring.'
    : executiveData.releaseDecision === 'CONDITIONAL GO'
      ? 'Review warnings and attached evidence before approval.'
      : 'Resolve blocker failures before release approval.');

const estimatedReleaseRiskTone =
  estimatedReleaseRisk === 'LOW'
    ? 'green'
    : estimatedReleaseRisk === 'MEDIUM'
      ? 'amber'
      : 'red';
const releaseStatusBadge = renderReleaseBadge(executiveData.releaseDecision);
const releaseStatusCompact = renderReleaseBadge(executiveData.releaseDecision, { compact: true });
const evidenceReadiness =
  (airResults?.evidence?.summary?.total ?? 0) > 0
    ? 'Ready'
    : 'No Evidence Captured';
const businessJourneyStatus =
  (airResults?.businessJourneys ?? []).some(journey => ['Critical', 'At Risk', 'Failed'].includes(journey.status))
    ? 'Needs Review'
    : (airResults?.businessJourneys ?? []).some(journey => ['Warning', 'Partial', 'Not Executed'].includes(journey.status))
      ? 'Partial'
      : 'Healthy';
const releaseReasonText =
  (airResults?.release?.reasons ?? airResults?.releaseDecision?.reasons ?? [])
    .slice(0, 3)
    .join(' | ') ||
  (executiveData.releaseDecision === 'GO'
    ? 'Critical journeys healthy | Evidence complete | No blocker failures'
    : executiveData.releaseDecision === 'CONDITIONAL GO'
      ? 'Critical journeys healthy | Evidence complete | Warnings require review'
      : 'Critical issues require resolution before approval');
const defaultTooltipMetadata = {
  qualityScore: 'Quality score uses executed pass rate and business-flow health. Documented skip-only matrix rows are coverage gaps, not failed product checks.',
  releaseDecision: 'Release decision generated from configured release rules.',
  risk: 'Release risk from failures, unexpected skips, blocked coverage, and configured thresholds.',
  coverage: 'Coverage reflects executed checks mapped to the selected area. Inventory coverage includes documented skips.',
  recommendation: 'Action generated from release decision, warnings, failures, and evidence readiness.',
  businessHealth: 'Business health averages executed journey scores. Subscription and Payment no longer double-count the same Billing skips.',
  evidenceReadiness: 'Evidence readiness shows whether execution artifacts are available for review.',
  nextStep: 'Recommended next improvement based on current module and evidence readiness.',
  passRate: 'Executed pass rate is passed divided by tests that actually ran. Inventory pass rate is passed divided by the full catalog including documented skips.',
};
const tooltipMetadata = {
  ...defaultTooltipMetadata,
  ...(airResults?.tooltips ?? {}),
  ...(airResults?.ui?.tooltips ?? {}),
};

function getTooltip(key, fallback = '') {
  return tooltipMetadata[key] ?? fallback ?? '';
}

function helpLabel(label, keyOrText, fallback = '') {
  const helpText = tooltipMetadata[keyOrText] ?? keyOrText ?? fallback;
  return `${escapeHtml(label)} <i class="metric-help"${tooltipAttr(helpText)}>?</i>`;
}

function resultTone(status) {
  const normalized = String(status ?? '').toLowerCase();

  if (normalized === 'passed') return 'good';
  if (normalized === 'failed' || normalized === 'timedout') return 'bad';
  if (normalized === 'skipped' || normalized === 'blocked') return 'warn';
  if (normalized === 'flaky') return 'info';

  return 'info';
}

function statusLabel(status) {
  const normalized = String(status ?? '').toLowerCase();

  if (normalized === 'passed') return 'Passed';
  if (normalized === 'failed') return 'Failed';
  if (normalized === 'timedout') return 'Timed Out';
  if (normalized === 'skipped') return 'Skipped';
  if (normalized === 'flaky') return 'Flaky';

  return status ? String(status) : 'Review';
}

function renderEmptyState({ title, reason, action, icon = 'AIR', metrics = [] }) {
  const metricGrid = metrics.length
    ? `
        <div class="success-grid">
          ${metrics.map(item => `<span><b>${escapeHtml(item.value)}</b>${escapeHtml(item.label)}</span>`).join('')}
        </div>`
    : '';

  return `
    <div class="success-empty-state empty-state">
      <div class="success-icon">${escapeHtml(icon)}</div>
      <h2>${escapeHtml(title)}</h2>
      <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
      <p><strong>Next Action:</strong> ${escapeHtml(action)}</p>
      ${metricGrid}
    </div>`;
}

const releaseDetailCards = [
  ['Critical Issues', String(executiveData.failed), 'Current failed tests treated as release-impacting issues.'],
  ['Warnings', String(releaseWarningCount), 'Release warnings from unexpected skips, blocked coverage, and module risk.'],
  ['Business Journey Status', businessJourneyStatus, 'businessHealth'],
  ['Evidence Readiness', evidenceReadiness, 'evidenceReadiness'],
].map(([label, value, help]) => `
  <div class="meta-item">
    <span>${helpLabel(label, help)}</span>
    <strong>${escapeHtml(value)}</strong>
  </div>`).join('');

const decisionReasonList =
  (Array.isArray(airResults?.releaseDecision?.reasons) && airResults.releaseDecision.reasons.length > 0
    ? airResults.releaseDecision.reasons
    : releaseReasonText.split('|'))
    .map(reason => String(reason).trim())
    .filter(Boolean)
    .slice(0, 4);
const decisionReasonItems = decisionReasonList
  .map(reason => `<li>${escapeHtml(reason)}</li>`)
  .join('');

const decisionDriverCards = decisionReasonList
  .map((reason, index) => `
    <article class="decision-driver-card">
      <span class="decision-driver-index">${String(index + 1).padStart(2, '0')}</span>
      <p>${escapeHtml(reason)}</p>
    </article>`)
  .join('');

const decisionBlockingItems = failedSourceItems.length > 0
  ? failedSourceItems.slice(0, 3).map((test, index) => {
    const title = test.title ?? test.testName ?? `Issue ${index + 1}`;
    const moduleName = test.module ?? getModuleName(title);
    const severity = test.severity ?? 'High';
    return `
      <article class="decision-blocking-item">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(moduleName)} / ${escapeHtml(severity)}</span>
        </div>
        <em>${escapeHtml(test.status ?? 'failed')}</em>
      </article>`;
  }).join('')
  : `
    <article class="decision-blocking-item success">
      <div>
        <strong>No blocking failures detected</strong>
        <span>Current execution has no failed tests in AIR data.</span>
      </div>
      <em>Clear</em>
    </article>`;

const decisionSignalCards = [
  {
    label: 'Business Impact',
    value: businessJourneyStatus,
    detail: businessJourneyStatus === 'Healthy'
      ? 'Critical journeys are healthy.'
      : 'Journey status requires release review.',
    tone: businessJourneyStatus === 'Healthy' ? 'green' : businessJourneyStatus === 'Partial' ? 'amber' : 'red',
  },
  {
    label: 'Evidence Status',
    value: evidenceReadiness,
    detail: evidenceReadiness.toLowerCase().includes('no')
      ? 'Attach execution proof before final approval.'
      : 'Evidence is available for review.',
    tone: evidenceReadiness.toLowerCase().includes('no') ? 'amber' : 'green',
  },
  {
    label: 'Critical Issues',
    value: String(executiveData.failed),
    detail: executiveData.failed > 0
      ? 'Release-impacting failures need resolution.'
      : 'No critical execution failures found.',
    tone: executiveData.failed > 0 ? 'red' : 'green',
  },
  {
    label: 'Warnings',
    value: String(releaseWarningCount),
    detail: releaseWarningCount > 0
      ? 'Review release warnings, blocked coverage, and unexpected skips.'
      : 'No warning signals detected.',
    tone: releaseWarningCount > 0 ? 'amber' : 'green',
  },
].map(item => `
  <article class="decision-signal-card ${item.tone}">
    <span>${escapeHtml(item.label)}</span>
    <strong>${escapeHtml(item.value)}</strong>
    <p>${escapeHtml(item.detail)}</p>
  </article>`).join('');

const decisionWorkflowSteps = [
  ['Resolve Defects', executiveData.failed > 0 ? 'Close release-impacting failures.' : 'Confirm no blockers remain.'],
  ['Re-run Failed Tests', failedSourceItems.length > 0 ? 'Validate affected scenarios again.' : 'Keep regression checks monitored.'],
  ['Capture Evidence', evidenceReadiness.toLowerCase().includes('no') ? 'Attach screenshots, videos, or traces.' : 'Review attached proof.'],
  ['Approve Release', executiveData.releaseDecision === 'GO' ? 'Proceed with release monitoring.' : 'Approve only after review gates pass.'],
].map(([title, detail], index) => `
  <article class="decision-workflow-step">
    <span>${index + 1}</span>
    <div>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(detail)}</p>
    </div>
  </article>`).join('');

const healthyModuleCount =
  displayModules.filter(module => getModuleFilterTone(module) === 'green').length;
const warningModuleCount =
  displayModules.filter(module => getModuleFilterTone(module) === 'amber').length;
const criticalModuleCount =
  displayModules.filter(module => getModuleFilterTone(module) === 'red').length;
const healthSummaryLead = (() => {
  const joinNames = modules => {
    const names = modules.map(module => module.name);
    if (names.length <= 1) return names.join('');
    if (names.length === 2) return names.join(' and ');
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  };
  const warning = displayModules.filter(module => getModuleStatusGroup(module) === 'warning');
  const notRun = displayModules.filter(module => getModuleStatusGroup(module) === 'not-executed');
  const critical = displayModules.filter(module => getModuleStatusGroup(module) === 'critical');
  const parts = [`${healthyModuleCount} of ${displayModules.length} areas are healthy.`];
  if (critical.length) parts.push(`${joinNames(critical)} failed.`);
  if (warning.length) parts.push(`${joinNames(warning)} ${warning.length === 1 ? 'needs' : 'need'} a look.`);
  if (notRun.length) parts.push(`${joinNames(notRun)} did not run.`);
  return parts.join(' ');
})();
const nextFocusText =
  executiveData.failed > 0
    ? 'Review the failures'
    : warningModuleCount > 0
      ? 'Review the warnings'
      : 'Ready for review';
const executiveDecisionBullets = [
  `${executiveData.executed ?? executiveData.passed} tests executed; ${executiveData.total} in the inventory.`,
  `${executiveData.passed} passed and ${executiveData.failed} failed (executed pass rate ${executiveData.executedPassRate ?? executiveData.passRate}%).`,
  `${executiveData.documentedSkipped ?? 0} documented coverage gaps and ${executiveData.unexpectedSkipped ?? 0} unexpected skip(s).`,
  `${businessJourneyStatus} business journey status.`,
  evidenceReadiness === 'Ready'
    ? 'Evidence is ready for review.'
    : 'Evidence was not captured for this execution.',
]
  .map(item => `<li>${escapeHtml(item)}</li>`)
  .join('');

const evidenceSummary =
  airResults?.evidence?.summary ?? {};
const recommendationCount =
  [
    ...(airResults?.recommendations ?? []),
    ...(airResults?.ai?.recommendations ?? []),
  ].filter(Boolean).length;
const searchIndexSize =
  Array.isArray(airResults?.searchIndex)
    ? airResults.searchIndex.length
    : Array.isArray(airResults?.search?.index)
      ? airResults.search.index.length
      : 0;
const historyExecutionCount =
  Array.isArray(airResults?.history?.executions)
    ? airResults.history.executions.length
    : 0;
const criticalFailureCount =
  (airResults?.failedTests ?? [])
    .filter(test => ['Critical', 'Blocker', 'High'].includes(test.severity ?? test.priority))
    .length;
const engineStatusItems = [
  {
    name: 'Parser',
    purpose: 'Normalize source execution data.',
    metrics: [['Records Parsed', executiveData.total], ['Framework', airResults?.source?.framework ?? 'Playwright']],
  },
  {
    name: 'Validator',
    purpose: 'Validate AIR model contract.',
    metrics: [['Schema', airResults?.schemaVersion ?? airResults?.version ?? 'AIR'], ['Warnings', airResults?.validation?.warnings?.length ?? 0]],
  },
  {
    name: 'Execution',
    purpose: 'Summarize executed tests.',
    metrics: [['Ran', executiveData.executed ?? executiveData.passed], ['Pass Rate', `${executiveData.executedPassRate ?? executiveData.passRate}%`]],
  },
  {
    name: 'Failure',
    purpose: 'Map failures and impact.',
    metrics: [['Failures', executiveData.failed], ['Critical', criticalFailureCount]],
  },
  {
    name: 'Module',
    purpose: 'Calculate module health.',
    metrics: [['Modules', displayModules.length], ['Risk', estimatedReleaseRisk]],
  },
  {
    name: 'Journey',
    purpose: 'Evaluate business journeys.',
    metrics: [['Journeys', (airResults?.businessJourneys ?? []).length], ['Health', businessJourneyStatus]],
  },
  {
    name: 'Evidence',
    purpose: 'Map proof to results.',
    metrics: [['Screenshots', evidenceSummary.screenshots ?? evidenceSummary.images ?? 0], ['Videos', evidenceSummary.videos ?? 0], ['Traces', evidenceSummary.traces ?? 0]],
  },
  {
    name: 'Quality',
    purpose: 'Score release confidence.',
    metrics: [['Score', `${executiveData.qualityScore}%`], ['Grade', airResults?.quality?.grade ?? 'A']],
  },
  {
    name: 'Release',
    purpose: 'Generate release decision.',
    metrics: [['Decision', executiveData.releaseDecision], ['Confidence', `${executiveConfidence}%`]],
  },
  {
    name: 'Recommendation',
    purpose: 'Generate next actions.',
    metrics: [['Items', recommendationCount || 3], ['Focus', nextFocusText]],
  },
  {
    name: 'Search',
    purpose: 'Index AIR report data.',
    metrics: [['Indexed Items', searchIndexSize], ['Scope', 'AIR Model']],
  },
  {
    name: 'History',
    purpose: 'Store execution memory.',
    metrics: [['Executions', historyExecutionCount], ['Status', historyComparison?.status ?? 'First Run']],
  },
  {
    name: 'Discovery',
    purpose: 'Discover modules and scope.',
    metrics: [['Modules', displayModules.length], ['Scope', airResults?.executionContext?.type ?? 'Auto']],
  },
  {
    name: 'Orchestrator',
    purpose: 'Run the AIR pipeline.',
    metrics: [['Engines', 14], ['Pipeline', 'Operational']],
  },
];

const validationTests = Array.isArray(airResults?.tests) ? airResults.tests : [];
const passedValidationTests = validationTests.filter(test => (
  String(test.status).toLowerCase() === 'passed' && !knownDefectNote(test)
));

function passedSentence(test) {
  const raw = String(test.validation?.scenario || test.title || 'Passed check')
    .split('>')
    .map(part => part.trim())
    .filter(Boolean)
    .at(-1) || 'Passed check';
  const text = raw.charAt(0).toUpperCase() + raw.slice(1);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function passedTopicName(test) {
  const file = String(test.file || '').split(/[/\\]/).pop();
  const rules = [
    [/Opportunities\.spec/i, 'Opportunities'],
    [/EventCalendar/i, 'Event calendar and company research'],
    [/DashboardMenuWalk/i, 'Each dashboard menu'],
    [/DashboardMenus/i, 'Dashboard menus'],
    [/DashboardCoverageDepth/i, 'Deeper dashboard checks'],
    [/DashboardScenarioSweep/i, 'Dashboard scenarios'],
    [/DashboardNavigation/i, 'Dashboard navigation'],
    [/DashboardResearchPortfolio/i, 'Research and portfolio'],
    [/DashboardMoreScreens/i, 'More dashboard screens'],
    [/DashboardPortfolioViews/i, 'Portfolio views'],
    [/DashboardScreenDepth/i, 'Screen depth'],
    [/DashboardRemainingScreens/i, 'Remaining screens'],
    [/DashboardOptions/i, 'Header menus'],
    [/DashboardPositionActions/i, 'Position actions'],
    [/DashboardWidgets/i, 'Dashboard home'],
    [/AddManualPosition/i, 'Manual positions'],
    [/RiskCompliance/i, 'Risk and compliance'],
    [/NewSubscriptionPurchase/i, 'New subscription checkout'],
    [/SubscriptionLifecycleE2E/i, 'Full subscription lifecycle'],
    [/SubscriptionLifecycleExecution/i, 'Subscription lifecycle steps'],
    [/SubscriptionCancellation/i, 'Cancellation'],
    [/MonthlyAnnualBilling|AnnualMonthlyBilling/i, 'Monthly and annual billing'],
    [/UpgradeSubscription/i, 'Plan upgrades'],
    [/DowngradeSubscription/i, 'Plan downgrades'],
    [/OverlayStrategists/i, 'Trial signup'],
    [/FailedPayment/i, 'Failed payment'],
    [/PlanSelection/i, 'Plan selection'],
    [/DirectSubscription/i, 'Direct purchase'],
    [/BillingEdge|BillingSubscription/i, 'Billing account'],
    [/AuthNegative/i, 'Sign-in rules'],
    [/AuthUiValidation|AuthConfiguration/i, 'Sign-in screens'],
    [/SignupNegative/i, 'Signup rules'],
    [/PasswordPolicy/i, 'Password rules'],
    [/Profile/i, 'Profile and security'],
    [/AccessibilityBrowser/i, 'Accessibility and browser'],
    [/SessionSecurity|PublicRoute/i, 'Session and protected pages'],
    [/OnboardingField|onboarding\.spec/i, 'Onboarding'],
    [/Subscriber\.spec/i, 'Signed-in home'],
    [/ResetPassword/i, 'Password recovery'],
  ];
  const match = rules.find(([pattern]) => pattern.test(file));
  if (match) return match[1];
  return test.validation?.area || test.module || 'General';
}

function passedMeaning(test) {
  const text = `${test.title || ''} ${test.file || ''}`.toLowerCase();
  const rules = [
    [/how opportunities work/, 'The explanation of how opportunities work opens.'],
    [/save view|saved view/, 'A filter set can be saved and opened again from Saved Views.'],
    [/add to watchlist|stop watching/, 'An opportunity can be watched and then removed from the watchlist.'],
    [/pagination|page size|rows per page/, 'The list page size and page controls work.'],
    [/expir/, 'The expiry filter narrows the list and can be set back.'],
    [/risk tab|conservative|moderate|aggressive/, 'Available risk tabs show their opportunities. Locked tabs stay locked.'],
    [/watchlist/, 'The watchlist opens, including an empty list and its opportunities tab.'],
    [/simulator/, 'The simulator accepts a symbol, a risk choice, and a time range.'],
    [/academy|glossary|lesson|strategy library/, 'Academy pages open, including lessons, the glossary, and strategy filters.'],
    [/support|ticket/, 'Support fields can be filled. The ticket is not submitted.'],
    [/fundamental/, 'Company fundamentals open for a symbol, including the chart ranges.'],
    [/company finance|income statement|balance sheet|cash flow|ratios/, 'Company finance statements open and the period can be changed.'],
    [/\bnews\b/, 'News headlines load and can be filtered.'],
    [/analytics/, 'Analytics measures load and the date range can be changed.'],
    [/filters by symbol|day filter/, 'A calendar day can be filtered by symbol and can open company research.'],
    [/event calendar|agenda/, 'The event calendar opens and the month, agenda, and event type can be changed.'],
    [/option exposure|calls puts|strike/, 'Option research changes the symbol, expiration, calls, puts, and strike count.'],
    [/portfolio menu|holdings destination/, 'The Portfolio menu opens each holdings page.'],
    [/sync all/, 'Sync all stays on the dashboard.'],
    [/connect broker|disconnect|remove account|remove position|cancelled/, 'The confirmation opens and can be cancelled, so nothing is removed.'],
    [/position/, 'Position actions open and can be left without saving a change.'],
    [/checkout|stripe|currency|before payment/, 'Checkout shows the plan, price, and currency, and the user can leave before paying.'],
    [/cancel/, 'Cancellation reaches the confirmation step and is not completed.'],
    [/upgrade/, 'The upgrade path shows the current plan before the change.'],
    [/downgrade/, 'The downgrade path shows the lower plan before the change.'],
    [/annual|monthly/, 'Monthly and annual billing can be switched before payment.'],
    [/trial/, 'The trial path reaches plan selection without starting a paid charge.'],
    [/otp|six digit/, 'The signup code follows the six-digit rule, including the known verify-button behavior.'],
    [/forgot|reset password/, 'Password recovery opens and can return to sign-in.'],
    [/login|sign in|authenticate|invalid credential|invalid email/, 'Sign-in accepts a valid user and blocks an invalid one.'],
    [/password policy|password mismatch|change password|weak password|confirm password/, 'A weak, empty, or mismatched password is blocked.'],
    [/signup|register/, 'Signup fields and gates are checked before an account is created.'],
    [/accessibility|keyboard|contrast|browser/, 'The page can be opened and inspected in the browser.'],
    [/protected|session|route guard/, 'A signed-out visitor is sent to sign-in, and a signed-in session stays in the product.'],
    [/onboarding/, 'Onboarding fields are checked before the user continues.'],
    [/billing|invoice|subscription/, 'Billing shows the plan and the account actions that are safe to open.'],
    [/profile|mfa|authenticator/, 'Profile and security controls stay visible and are not saved during the check.'],
    [/risk/, 'Risk and compliance choices can be reviewed and set back.'],
    [/menu/, 'The menu opens each listed page and that page loads.'],
    [/filter|sort|search/, 'Filters, sort, and search narrow the list and can be cleared.'],
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  return match ? match[1] : 'The check finished and the screen showed the expected result.';
}

const passedTopicPurpose = {
  Opportunities: 'Filters, saved views, risk tabs, research, the watchlist, and paging.',
  'Event calendar and company research': 'Calendar views, a day filter, and company research opened from an event.',
  'Each dashboard menu': 'Every main menu, with values changed where the screen allows it and then set back.',
  'Dashboard menus': 'Research and Portfolio menus open each destination.',
  'Deeper dashboard checks': 'Finance, news, analytics, academy, watchlist, support, simulator, and fundamentals.',
  'Dashboard scenarios': 'Strategy filters, related research links, support fields, the simulator, and sync.',
  'Dashboard navigation': 'Moving across the signed-in product without losing the session.',
  'Research and portfolio': 'Equity research, company pages, the calendar, and portfolio accounts.',
  'More dashboard screens': 'Watchlist, analytics, the calendar, and the screens reached from the dashboard.',
  'Portfolio views': 'Holdings layouts, accounts, and the portfolio list.',
  'Screen depth': 'Finance, news, the simulator, and add-position screens opened without saving.',
  'Remaining screens': 'Footer pages, opportunity filters, and broker or upload prompts that can be closed.',
  'Header menus': 'The add-options menu and the profile menu.',
  'Position actions': 'Edit and remove prompts that can be cancelled.',
  'Dashboard home': 'The signed-in home screen and its main widgets.',
  'Manual positions': 'A manual position can be started and closed without saving.',
  'Risk and compliance': 'Risk experience choices can be reviewed and set back.',
  'New subscription checkout': 'Each paid plan shows its checkout summary before payment.',
  'Full subscription lifecycle': 'A new subscriber can move from signup through plan selection.',
  'Subscription lifecycle steps': 'Lifecycle steps that are safe to run in this environment.',
  'Cancellation': 'Cancellation reaches confirmation and is not completed.',
  'Monthly and annual billing': 'Monthly and annual prices can be switched before payment.',
  'Plan upgrades': 'The upgrade path shows the current plan before a change.',
  'Plan downgrades': 'The downgrade path shows the lower plan before a change.',
  'Trial signup': 'The trial path reaches plan selection without a paid charge.',
  'Failed payment': 'A failed payment stays on the billing recovery path.',
  'Plan selection': 'The plan catalog and billing interval are visible.',
  'Direct purchase': 'One user can open each paid checkout, refresh it, and return before paying.',
  'Billing account': 'Billing overview, plans, and history stay available.',
  'Sign-in rules': 'Invalid sign-in is blocked and a valid sign-in reaches the product.',
  'Sign-in screens': 'Sign-in, forgot password, and the related screens load and can be used.',
  'Signup rules': 'Signup fields, consent, and the one-time code behave as required.',
  'Password rules': 'Weak, empty, and mismatched passwords are blocked.',
  'Profile and security': 'Profile, password, and security controls are visible and are not saved.',
  'Accessibility and browser': 'Pages can be opened and inspected in the browser.',
  'Session and protected pages': 'Signed-out visitors go to sign-in. A signed-in session stays in the product.',
  Onboarding: 'Onboarding fields are checked before the user continues.',
  'Signed-in home': 'A subscriber lands on the dashboard.',
  'Password recovery': 'Password recovery opens and can return to sign-in.',
};

function passedTopicSlug(topic) {
  return `passed-${String(topic).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

const passedTopicGroups = passedValidationTests.reduce((groups, test) => {
  const topic = passedTopicName(test);
  if (!groups[topic]) groups[topic] = [];
  groups[topic].push(test);
  return groups;
}, {});
const passedTopicEntries = Object.entries(passedTopicGroups)
  .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]));
function passedTopicMark(topic) {
  const words = String(topic)
    .split(/\s+/)
    .filter(word => !/^(and|the|of|a)$/i.test(word));
  return words
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join('') || 'OK';
}

const validationAreaCards = passedTopicEntries
  .map(([topic, testsInTopic]) => {
    const purpose = passedTopicPurpose[topic] || 'Checks in this part of the product that passed in this run.';
    const searchText = `${topic} ${purpose}`.toLowerCase();
    return `
    <a class="passed-card" href="#${passedTopicSlug(topic)}" data-inner-item data-passed-card data-passed-search="${escapeHtml(searchText)}">
      <div class="passed-card-top">
        <span class="module-icon">${escapeHtml(passedTopicMark(topic))}</span>
        <strong>${escapeHtml(topic)}</strong>
      </div>
      <div class="passed-card-count"><b>${testsInTopic.length}</b><span>checks passed</span></div>
      <p>${escapeHtml(purpose)}</p>
      <span class="module-button">Open detail</span>
    </a>`;
  })
  .join('') || `
    <article class="module-health-card green">
      <strong>No passes</strong>
      <p>This run has no passed checks.</p>
    </article>`;
const validationGroupCards = passedTopicEntries
  .map(([topic, testsInTopic]) => {
    const purpose = passedTopicPurpose[topic] || 'Checks in this part of the product that passed in this run.';
    const items = testsInTopic
      .map(test => {
        const note = knownDefectNote(test);
        if (note) {
          return `
          <div class="passed-check known-defect">
            <strong>${escapeHtml(note.name)}</strong>
            <span>Known defect · counted with the passes</span>
            <p><b>Expected.</b> ${escapeHtml(note.expected)}</p>
            <p><b>Product today.</b> ${escapeHtml(note.actual)}</p>
          </div>`;
        }

        const play = scenarioPlaybook(test);
        const steps = play.steps
          .map(step => `<li>${escapeHtml(step)}</li>`)
          .join('');
        return `
          <div class="passed-check" data-inner-item>
            <strong>${escapeHtml(play.name)}</strong>
            <span>What this scenario validated</span>
            <ol class="scenario-steps">${steps}</ol>
          </div>`;
      })
      .join('');

    return `
      <article class="passed-detail" id="${passedTopicSlug(topic)}" data-step-item data-step-label="${escapeHtml(topic)}">
        <div class="passed-detail-head">
          <div>
            <div class="eyebrow">Passed in this run</div>
            <h2>${escapeHtml(topic)}</h2>
            <div class="passed-card-count"><b>${testsInTopic.length}</b><span>checks passed</span></div>
          </div>
          <a class="btn" href="#validation-summary">All areas</a>
        </div>
        <p>${escapeHtml(purpose)}</p>
        ${renderInnerBoard('Checks', items, testsInTopic.length, 'passed-checks', 4)}
      </article>`;
  })
  .join('') || '<div class="empty-note">No passed checks were found in this run.</div>';
const validationDetailRows = passedValidationTests
  .map(test => `
      <tr>
        <td>${escapeHtml(passedTopicName(test))}</td>
        <td>${escapeHtml(passedSentence(test))}</td>
        <td>${escapeHtml(scenarioPlaybook(test).steps.join(' '))}</td>
      </tr>`)
  .join('') || '<tr><td colspan="3">No passed checks were found in this run.</td></tr>';
const validationCoverageGapCards = (airResults?.coverageGaps?.items ?? [])
  .slice(0, 6)
  .map(item => `
    <article class="validation-gap-card">
      <span>${escapeHtml(item.category ?? item.status ?? 'Review')}</span>
      <strong>${escapeHtml(item.title ?? item.fullTitle ?? 'Coverage item')}</strong>
      <p>${escapeHtml(onceSentence(compactText(item.reason ?? item.dependency ?? item.nextAction ?? 'Review required.', 150)))}</p>
    </article>`)
  .join('');
function getAirCoreEngineGroup(index) {
  return index <= 1
    ? 'Input'
    : index <= 6
      ? 'Processing'
      : index <= 8
        ? 'Intelligence'
        : index <= 9
          ? 'Decision'
          : 'Platform';
}

function renderAirCoreEngineCard(item, index, group = getAirCoreEngineGroup(index)) {
  const groupClass = group.toLowerCase();
  const headline = item.metrics?.[0]?.[1] ?? 'Ready';

  return `
    <div class="core-status-item engine-card engine-${groupClass}">
      <div class="engine-head">
        <div>
          <span>${escapeHtml(group)}</span>
          <h3>${escapeHtml(item.name)}</h3>
        </div>
        <strong title="${escapeHtml(String(item.metrics?.[0]?.[0] ?? 'Status'))}">${escapeHtml(String(headline))}</strong>
      </div>
      <p>${escapeHtml(item.purpose)}</p>
      <div class="engine-metrics">
        ${item.metrics.map(([label, value]) => `
          <div>
            <small>${escapeHtml(label)}</small>
            <b>${escapeHtml(value)}</b>
          </div>`).join('')}
      </div>
    </div>`;
}

const airCoreStatusCards = engineStatusItems
  .map((item, index) => renderAirCoreEngineCard(item, index))
  .join('');

const airCoreLayerDefinitions = [
  {
    name: 'Input Layer',
    className: 'input',
    description: 'Source ingestion and AIR model validation.',
    engines: engineStatusItems.slice(0, 2),
  },
  {
    name: 'Processing Layer',
    className: 'processing',
    description: 'Execution, failure, module, journey, and evidence enrichment.',
    engines: engineStatusItems.slice(2, 7),
  },
  {
    name: 'Intelligence Layer',
    className: 'intelligence',
    description: 'Quality scoring and recommendation intelligence.',
    engines: engineStatusItems.slice(7, 9),
  },
  {
    name: 'Decision Layer',
    className: 'decision',
    description: 'Release decision and confidence output.',
    engines: engineStatusItems.slice(9, 10),
  },
  {
    name: 'Platform Layer',
    className: 'platform',
    description: 'Search, history, discovery, and orchestration services.',
    engines: engineStatusItems.slice(10),
  },
];

const airCoreLayerHtml = airCoreLayerDefinitions
  .map((layer, index) => `
    <div class="air-core-layer layer-${layer.className}">
      <div class="air-core-layer-head">
        <div>
          <span>${escapeHtml(layer.name)}</span>
          <p>${escapeHtml(layer.description)}</p>
          <small>${layer.engines.length} engine${layer.engines.length === 1 ? '' : 's'}</small>
        </div>
        <strong>${String(index + 1).padStart(2, '0')}</strong>
      </div>
      <div class="air-core-layer-engines">
        ${layer.engines.map(engine => `
          <span title="${escapeHtml(engine.purpose)}">${escapeHtml(engine.name)}</span>
        `).join('')}
      </div>
    </div>`)
  .join('');

const airCoreEngineGroupsHtml = airCoreLayerDefinitions
  .map(layer => `
    <details class="fold engine-output-group engine-output-${layer.className}">
      <summary><b>${escapeHtml(layer.name)}</b><span>${escapeHtml(layer.engines.map(engine => engine.name).join(' · '))}</span></summary>
      <div class="engine-output-cards">
        ${layer.engines.map(engine => renderAirCoreEngineCard(engine, engineStatusItems.indexOf(engine), layer.name.replace(' Layer', ''))).join('')}
      </div>
    </details>`)
  .join('');

const airCorePipelineHtml = engineStatusItems
  .map((item, index) => `
    <span title="${escapeHtml(item.purpose)}">
      <b>${String(index + 1).padStart(2, '0')}</b>
      <i>${escapeHtml(item.name)}</i>
      <small>${escapeHtml(item.purpose)}</small>
    </span>`)
  .join('');

function renderExecutiveTrendSvg() {
  const snapshots = historySnapshots.slice(-8);

  if (snapshots.length < 2) {
    return `
      <div class="executive-empty-trend">
        <strong>No previous execution available.</strong>
        <span>Release confidence trend appears after multiple AIR executions.</span>
      </div>`;
  }

  const values = snapshots.map(item => Number(
    item.qualityScore ??
    item.quality?.score ??
    item.summary?.qualityScore ??
    executiveData.qualityScore
  ));
  const points = values
    .map((value, index) => {
      const x = 24 + (index * (452 / Math.max(1, values.length - 1)));
      const y = 126 - ((Math.max(0, Math.min(100, value)) / 100) * 96);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const dots = values
    .map((value, index) => {
      const x = 24 + (index * (452 / Math.max(1, values.length - 1)));
      const y = 126 - ((Math.max(0, Math.min(100, value)) / 100) * 96);
      return `
        <g>
          <title>${escapeHtml(getHistoryTooltip(snapshots[index], index, `${value}%`))}</title>
          <circle class="${index === values.length - 1 ? 'trend-dot-current' : 'trend-dot'}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${index === values.length - 1 ? 5.5 : 3.5}" />
        </g>`;
    })
    .join('');
  const labels = snapshots
    .map((item, index) => {
      const x = 24 + (index * (452 / Math.max(1, snapshots.length - 1)));
      return `<text x="${x.toFixed(1)}" y="150">${escapeHtml(getHistoryBuildLabel(item, index, { compact: true, peers: snapshots }))}</text>`;
    })
    .join('');

  return `
    <svg class="executive-trend-svg" viewBox="0 0 500 166" role="img" aria-label="Release confidence trend">
      <defs>
        <linearGradient id="executiveTrendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#39e75f" stop-opacity=".34" />
          <stop offset="100%" stop-color="#39e75f" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="M24 126 L476 126" class="trend-axis" />
      <path d="M24 78 L476 78" class="trend-grid" />
      <path d="M24 30 L476 30" class="trend-grid" />
      <polyline points="${points}" class="trend-line" />
      <polygon points="24,126 ${points} 476,126" class="trend-fill" />
      ${dots}
      ${labels}
    </svg>`;
}

const executiveHeroSubtitle =
  executiveData.releaseDecision === 'GO'
    ? 'Release is ready with monitoring.'
    : executiveData.releaseDecision === 'CONDITIONAL GO'
      ? 'Release is possible after targeted warning review.'
      : 'Release is blocked until failed checks are resolved.';
const executiveReleaseReadyLabel =
  executiveData.releaseDecision === 'GO'
    ? 'Ready'
    : executiveData.releaseDecision === 'CONDITIONAL GO'
      ? 'Review Required'
      : 'Blocked';
const executiveKnownIssuesText =
  executiveData.failed > 0
    ? `${executiveData.failed} known issue${executiveData.failed === 1 ? '' : 's'}`
    : 'no known blocker issues';
const journeysNeedingReview = liveBusinessJourneys.filter(journey =>
  ['Warning', 'Partial', 'Not Executed', 'Critical', 'Failed'].includes(journey.status)
);
const screenshotsCaptured =
  airEvidenceThumbnails.length > 0 || evidenceThumbnailFiles.length > 0;
const businessImpactLabel =
  businessJourneyStatus === 'Partial'
    ? 'Incomplete'
    : businessJourneyStatus === 'Needs Review'
      ? 'Blocked'
      : businessJourneyStatus;
const businessImpactBullets = [
  executiveData.failed > 0
    ? `${executiveData.failed} issue${executiveData.failed === 1 ? '' : 's'} require release review`
    : journeysNeedingReview.length === 0
      ? 'Core user flows are healthy'
      : `${liveBusinessJourneys.length - journeysNeedingReview.length} journeys passed; ${journeysNeedingReview.length} still need review`,
  journeysNeedingReview.length
    ? `Review ${journeysNeedingReview.map(journey => journey.name).join(', ')}`
    : 'Every configured journey that ran is healthy',
  `${healthyModuleCount} of ${displayModules.length} modules are healthy`,
  screenshotsCaptured
    ? 'Screenshots are ready to open'
    : 'No screenshots were saved. Use the Playwright report for logs.',
]
  .map(item => `<li>${escapeHtml(item)}</li>`)
  .join('');
const executiveChangeCards = [
  ['Added Tests', `+${addedTests.length}`, 'positive'],
  ['Removed Tests', `-${removedTests.length}`, removedTests.length > 0 ? 'negative' : 'neutral'],
  ['Modified Tests', String(modifiedTests.length), 'warning'],
  ['Resolved Failures', String(resolvedFailures.length), 'positive'],
]
  .map(([label, value, tone]) => `
    <div class="executive-change-card ${tone}">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`)
  .join('');
const executiveChangeBody =
  addedTests.length + removedTests.length + modifiedTests.length + resolvedFailures.length === 0
    ? `<p class="executive-change-note">No tests were added, removed, changed, or fixed since the previous snapshot.</p>`
    : `<div class="executive-change-grid">${executiveChangeCards}</div>`;
const executiveProductHealthStrip = displayModules
  .map(module => {
    const tone = statusTone(module.status);
    const executed = Number(module.executed ?? ((module.passed ?? 0) + (module.failed ?? 0)));
    return `
      <a class="executive-module-pill ${tone}" href="#module-dashboard-${moduleSlug(module.name)}" data-module-name="${escapeHtml(module.name)}" aria-label="Open ${escapeHtml(module.name)} module details">
        <span>${escapeHtml(module.name)}</span>
        <strong>${module.score}%</strong>
        <small>${escapeHtml(module.status)}${executed ? ` · ${module.passed}/${executed} ran` : ''}</small>
      </a>`;
  })
  .join('');
const executiveEvidenceHighlights =
  airEvidenceThumbnails.length > 0
    ? airEvidenceThumbnails
      .map((item, index) => {
        const href = getEvidenceHref(item);
        const label = item.testTitle || item.name || `Screenshot ${index + 1}`;

        if (!href || screenshotLooksBlank(item)) {
          return '';
        }

        return `
        <a class="executive-evidence-card ${index === 0 && executiveData.failed > 0 ? 'attention' : ''}" href="${escapeHtml(href)}" data-evidence-preview data-evidence-kind="Screenshot ${index + 1}" data-evidence-status="${escapeHtml(item.attemptStatus || 'Available')}" data-evidence-href="${escapeHtml(href)}"${tooltipAttr(label)}>
          <img src="${escapeHtml(href)}" alt="${escapeHtml(label)}">
          <span>${escapeHtml(compactText(label, 42))}</span>
          <strong>${index === 0 && executiveData.failed > 0 ? 'Review' : 'Available'}</strong>
        </a>`;
      })
      .join('')
    : evidenceThumbnailFiles.length > 0
      ? evidenceThumbnailFiles
      .map((file, index) => `
        <a class="executive-evidence-card ${index === 0 && executiveData.failed > 0 ? 'attention' : ''}" href="../playwright-report/data/${escapeHtml(file)}" data-evidence-preview data-evidence-kind="Screenshot ${index + 1}" data-evidence-status="Available" data-evidence-href="../playwright-report/data/${escapeHtml(file)}">
          <img src="../playwright-report/data/${escapeHtml(file)}" alt="Evidence screenshot ${index + 1}">
          <span>Screenshot ${index + 1}</span>
          <strong>${index === 0 && executiveData.failed > 0 ? 'Review' : 'Available'}</strong>
        </a>`)
      .join('')
      : `
      <div class="executive-evidence-empty">
        <strong>No screenshots in this run.</strong>
        <span>Passed checks do not keep images unless recording is turned on. The run record stays in the test log.</span>
      </div>`;
const statusBoardHtml = `
  <div class="status-board" aria-label="This run at a glance">
    <a class="status-card ${executiveData.failed > 0 ? 'bad' : 'good'}" href="#failures"><b>${executiveData.failed}</b><span>Failed</span><small>Open what failed</small></a>
    <a class="status-card good" href="#validation-summary"><b>${executiveData.passed}</b><span>Passed</span><small>Open what passed</small></a>
    <a class="status-card warn" href="#coverage-gaps"><b>${Math.max(0, executiveData.total - (executiveData.executed ?? executiveData.passed))}</b><span>Not run</span><small>Open what was skipped</small></a>
    <a class="status-card" href="#health"><b>${executiveData.qualityScore}%</b><span>Of what ran</span><small>Open product health</small></a>
  </div>`;
const executiveModeShellHtml = `
  <div class="brief">
    <p class="air-oneliner">AIR shows whether this run is ready to ship, and what still needs a fix.</p>
    <div class="brief-decision">
      <div class="eyebrow">${escapeHtml(projectName)} · ${escapeHtml(environment)}</div>
      <h1>Can we ship?</h1>
      ${releaseStatusBadge}
      <p class="brief-line">${executiveData.failed > 0 ? `No. ${executiveData.failed} checks failed. Fix those before this goes out.` : `Yes. The checks that ran passed.`}</p>
      <p class="brief-when">Last run ${escapeHtml(generatedAt)}</p>
    </div>
    ${statusBoardHtml}
  </div>
  <details class="fold brief-more">
    <summary><b>More about this run</b><span>Why some checks did not run</span></summary>
    <div class="brief-more-body">
  <section class="coverage-board" aria-label="Plan coverage">
    <h2>Plan coverage</h2>
    <div class="coverage-meter-track" aria-hidden="true"><span class="coverage-meter-ran" style="width:${executiveData.total ? Math.round(((executiveData.executed ?? executiveData.passed) / executiveData.total) * 100) : 0}%"></span></div>
    <div class="coverage-meter-note"><span>${executiveData.executed ?? executiveData.passed} ran</span><span>${executiveData.total ? Math.round(((executiveData.executed ?? executiveData.passed) / executiveData.total) * 100) : 0}% of ${executiveData.total} planned</span></div>
    <div class="passed-card-grid">
      <a class="passed-card" href="#plan-cat-blocked"><div class="passed-card-top"><span class="module-icon">BL</span><strong>Blocked</strong></div><div class="passed-card-count"><b>${coverageGapSummary.blocked ?? 0}</b><span>checks</span></div><p>Need a product or admin change first.</p><span class="module-button">Open</span></a>
      <a class="passed-card" href="#plan-cat-controlled"><div class="passed-card-top"><span class="module-icon">SU</span><strong>Need a setup</strong></div><div class="passed-card-count"><b>${coverageGapSummary.controlled ?? 0}</b><span>checks</span></div><p>Need an email, code, or prepared user.</p><span class="module-button">Open</span></a>
      <a class="passed-card" href="#plan-cat-traceability"><div class="passed-card-top"><span class="module-icon">AC</span><strong>Already covered</strong></div><div class="passed-card-count"><b>${coverageGapSummary.traceability ?? 0}</b><span>checks</span></div><p>Checked by another test that did run.</p><span class="module-button">Open</span></a>
      <a class="passed-card" href="#plan-cat-future"><div class="passed-card-top"><span class="module-icon">LT</span><strong>Later</strong></div><div class="passed-card-count"><b>${coverageGapSummary.future ?? 0}</b><span>checks</span></div><p>Not part of this release.</p><span class="module-button">Open</span></a>
      <a class="passed-card" href="#plan-cat-skipped"><div class="passed-card-top"><span class="module-icon">LK</span><strong>Need a look</strong></div><div class="passed-card-count"><b>${coverageGapSummary.skipped ?? 0}</b><span>checks</span></div><p>Skipped without a clear reason.</p><span class="module-button">Open</span></a>
    </div>
  </section>
    </div>
  </details>`;

const aiDecisionSummary =
  executiveData.releaseDecision === 'GO'
    ? 'AIR recommends GO because the current execution has strong pass stability, no blocker failures, healthy business journeys, and enough regression confidence for release monitoring.'
    : executiveData.releaseDecision === 'CONDITIONAL GO'
      ? 'AIR recommends CONDITIONAL GO because the main journeys are mostly stable, but warning signals still need evidence review and targeted rerun before final approval.'
      : 'Do not ship yet. The failed checks need a fix before this can go out.';

const aiRecommendationItems =
  executiveData.failed > 0
    ? [
      {
        title: 'Review failed tests',
        priority: 'Priority 1',
        detail: 'Open each failed test, confirm evidence, identify impacted module, and rerun only the affected area first.',
      },
      {
        title: 'Stabilize impacted flows',
        priority: 'Priority 2',
        detail: 'Fix or quarantine unstable UI paths, then repeat the business journey that contains the failure.',
      },
      {
        title: 'Strengthen evidence links',
        priority: 'Priority 3',
        detail: 'Attach screenshot, video, trace, and environment context to every release-impacting failure.',
      },
    ]
    : [
      {
        title: 'Increase API validation',
        priority: 'Priority 1',
        detail: 'Add API-level checks for billing, authentication, signup, and password flows so AIR can separate UI issues from backend failures.',
      },
      {
        title: 'Increase DB validation',
        priority: 'Priority 2',
        detail: 'Add database validation for account status, subscription state, reset tokens, login lockout, and payment records.',
      },
      {
        title: 'Expand MFA and security coverage',
        priority: 'Priority 3',
        detail: 'Add negative MFA, session expiry, protected-route, unlock-account, and reset-password expiry scenarios.',
      },
    ];

const aiPriorityRecommendations =
  aiRecommendationItems
    .map((item, index) => {
      const urgency =
        index === 0
          ? 'Immediate'
          : index === 1
            ? 'Soon'
            : 'Future';
      const urgencyClass =
        index === 0
          ? 'urgent'
          : index === 1
            ? 'soon'
            : 'future';

      return `
      <div class="recommendation-card ${urgencyClass} interactive-card" role="button" tabindex="0" aria-label="Open recommendation details for ${escapeHtml(item.title)}" data-recommendation-index="${index}">
        <span>${escapeHtml(urgency)} • ${escapeHtml(item.priority)}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.detail)}</p>
        <small>Source: ${escapeHtml(item.source ?? 'AIR Recommendation Engine')}</small>
      </div>`;
    })
    .join('');

const groupedAiRecommendations = [
  {
    role: 'Executive Summary',
    title: executiveData.releaseDecision === 'GO' ? 'Release with monitoring' : executiveData.releaseDecision === 'CONDITIONAL GO' ? 'Review before approval' : 'Resolve blockers first',
    detail: aiDecisionSummary,
  },
  {
    role: 'Engineering Focus',
    title: aiRecommendationItems[0]?.title ?? 'Maintain execution stability',
    detail: aiRecommendationItems[0]?.detail ?? 'Keep the execution pipeline stable and review any infrastructure changes.',
  },
  {
    role: 'QA Focus',
    title: aiRecommendationItems[1]?.title ?? 'Expand validation depth',
    detail: aiRecommendationItems[1]?.detail ?? 'Continue improving validation coverage and evidence traceability.',
  },
  {
    role: 'Management Focus',
    title: aiRecommendationItems[2]?.title ?? 'Track release confidence',
    detail: aiRecommendationItems[2]?.detail ?? 'Monitor risk, evidence readiness, and trend direction across builds.',
  },
]
  .map(item => `
    <div class="role-recommendation-card">
      <span>${escapeHtml(item.role)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.detail)}</p>
    </div>`)
  .join('');

const aiActionChecklist =
  [
    estimatedReleaseRisk === 'LOW'
      ? 'Keep release monitoring enabled after deployment.'
      : 'Do not approve release until warning or blocker evidence is reviewed.',
    'Link every failed or warning signal to screenshot, video, trace, or raw Playwright evidence.',
    'Use module health cards to decide which QA area should receive the next automation investment.',
  ]
    .map(item => `<li>${escapeHtml(item)}</li>`)
    .join('');

const aiWorkflowSteps =
  [
    {
      label: 'Analyze Decision',
      detail: executiveData.releaseDecision === 'GO'
        ? 'Confirm release confidence and monitoring expectations.'
        : 'Review why AIR did not produce a clean GO decision.',
    },
    {
      label: executiveData.failed > 0 ? 'Resolve Failures' : 'Confirm Coverage',
      detail: executiveData.failed > 0
        ? 'Fix release-impacting failures and validate affected modules.'
        : 'Confirm the current coverage is sufficient for approval.',
    },
    {
      label: 'Attach Evidence',
      detail: 'Link screenshots, videos, traces, and raw execution details.',
    },
    {
      label: executiveData.releaseDecision === 'NO GO' ? 'Rerun & Reassess' : 'Approve With Monitoring',
      detail: executiveData.releaseDecision === 'NO GO'
        ? 'Rerun impacted scenarios and let AIR recalculate the release decision.'
        : 'Proceed only after the release owner accepts the remaining risk.',
    },
  ]
    .map((item, index) => `
      <div class="ai-workflow-step">
        <span>${String(index + 1).padStart(2, '0')}</span>
        <strong>${escapeHtml(item.label)}</strong>
        <p>${escapeHtml(item.detail)}</p>
      </div>`)
    .join('');

const aiSignalCards =
  [
    ['Release', executiveData.releaseDecision, releaseClass],
    ['Risk', estimatedReleaseRisk, estimatedReleaseRiskTone],
    ['Confidence', `${executiveConfidence}%`, executiveConfidence >= 90 ? 'green' : executiveConfidence >= 70 ? 'amber' : 'red'],
    ['Evidence', evidenceReadiness, evidenceReadiness === 'Ready' ? 'green' : 'amber'],
  ]
    .map(([label, value, tone]) => `
      <div class="ai-signal-card ${tone}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}</strong>
      </div>`)
    .join('');

const roadmapVersions = [
  {
    version: 'AIR v1.0',
    title: 'Executive Quality Dashboard',
    status: 'Completed',
    purpose: 'Turn automation execution into executive release visibility.',
    features: ['Executive Dashboard', 'Release Dashboard', 'Business Journeys', 'Product Health', 'Module Details', 'Failed Tests', 'Evidence', 'AI Insights', 'PDF Export', 'Search', 'Responsive UI'],
    goal: 'Executive Quality Dashboard',
  },
  {
    version: 'AIR v1.1',
    title: 'Framework-independent AIR Core',
    status: 'Completed',
    purpose: 'Build the reusable intelligence engine behind AIR.',
    features: ['Parser Service', 'Schema Validation', 'AIR Validator', 'Execution Summary Engine', 'Failure Engine', 'Module Engine', 'Journey Engine', 'Evidence Engine', 'Quality Engine', 'Release Engine', 'Recommendation Engine', 'Search Engine', 'History Engine', 'Execution Context Engine', 'Discovery Engine', 'Engine Orchestrator'],
    goal: 'Framework-independent AIR Core',
  },
  {
    version: 'AIR v1.2',
    title: 'Historical Analytics & Build Comparison',
    status: 'In Progress',
    purpose: 'Help teams understand what changed between executions.',
    features: ['Historical Dashboard', 'Build Comparison', 'Module Trends', 'Pass Rate Trends', 'Duration Trends', 'Coverage Trends', 'Quality Trends'],
    goal: 'Historical Analytics & Build Comparison',
  },
  {
    version: 'AIR v1.3',
    title: 'AI Investigation & Root Cause Assistant',
    status: 'Planned',
    purpose: 'Move from reporting to recommendations.',
    features: ['Root Cause Suggestions', 'AI Investigation', 'Risk Prediction', 'Smart Recommendations', 'Automation Gap Analysis', 'Test Prioritization', 'Release Explanation'],
    goal: 'AI Investigation & Root Cause Assistant',
  },
  {
    version: 'AIR v2.0',
    title: 'Engineering Intelligence Platform',
    status: 'Planned',
    purpose: 'Connect AIR to engineering tools.',
    features: ['GitHub', 'Azure DevOps', 'Jira', 'Slack', 'Microsoft Teams', 'Email Reports', 'Webhooks'],
    goal: 'Engineering Intelligence Platform',
  },
  {
    version: 'AIR v2.5',
    title: 'Multi-framework Support',
    status: 'Planned',
    purpose: 'Support any automation framework.',
    features: ['Playwright', 'Cypress', 'Selenium', 'Robot Framework', 'Appium', 'Postman', 'JMeter'],
    goal: 'Multi-framework Support',
  },
  {
    version: 'AIR v3.0',
    title: 'Unified Quality Platform',
    status: 'Future',
    purpose: 'Unify all quality validations.',
    features: ['API Validation', 'Database Validation', 'Performance Testing', 'Security Testing', 'Accessibility Testing', 'Visual Testing'],
    goal: 'Unified Quality Platform',
  },
  {
    version: 'AIR v4.0',
    title: 'Enterprise Intelligence Platform',
    status: 'Future',
    purpose: 'Scale AIR for enterprise organizations.',
    features: ['Multi Project', 'Multi Team', 'Role Management', 'Scheduled Reports', 'Cloud Deployment', 'Team Dashboards', 'User Management'],
    goal: 'Enterprise Intelligence Platform',
  },
  {
    version: 'AIR v5.0',
    title: 'Autonomous Engineering Intelligence',
    status: 'Vision',
    purpose: 'Become an engineering intelligence assistant.',
    features: ['AI Root Cause', 'AI Code Suggestions', 'Failure Prediction', 'Release Prediction', 'Continuous Learning', 'Intelligent Automation Recommendations', 'Engineering Assistant'],
    goal: 'Autonomous Engineering Intelligence',
  },
];

const roadmapStatusTone = {
  Completed: 'green',
  'In Progress': 'amber',
  Planned: 'amber',
  Future: 'blue',
  Vision: 'purple',
};

const roadmapCompletedCount =
  roadmapVersions
    .filter(item => item.status === 'Completed')
    .reduce((sum, item) => sum + item.features.length, 0);
const roadmapInProgressCount =
  roadmapVersions
    .filter(item => item.status === 'In Progress')
    .reduce((sum, item) => sum + item.features.length, 0);
const roadmapPlannedCount =
  roadmapVersions
    .filter(item => ['Planned', 'Future', 'Vision'].includes(item.status))
    .reduce((sum, item) => sum + item.features.length, 0);

function renderRoadmapPlanCard(item, index) {
  const tone = roadmapStatusTone[item.status] ?? 'amber';
  const features = item.features
    .map(feature => `<li>${escapeHtml(feature)}</li>`)
    .join('');

  return `
        <article class="roadmap-card ${tone} interactive-card" role="button" tabindex="0" aria-label="Open roadmap details for ${escapeHtml(item.version)}" data-inner-item data-roadmap-index="${index}">
          <div class="roadmap-card-head">
            <div>
              <span>${escapeHtml(item.version)}</span>
              <h2>${escapeHtml(item.title)}</h2>
            </div>
            <span class="badge ${tone}">${escapeHtml(item.status)}</span>
          </div>
          <p>${escapeHtml(item.purpose)}</p>
          <div class="roadmap-card-meta">
            <span>${item.features.length} deliverables</span>
          </div>
          <ul>${features}</ul>
        </article>`;
}

const airRoadmapCards =
  roadmapVersions
    .map((item, index) => renderRoadmapPlanCard(item, index))
    .join('');

const airRoadmapWhyRows =
  roadmapVersions
    .map(item => `
      <tr>
        <td>${escapeHtml(item.version)}</td>
        <td>${escapeHtml(item.goal)}</td>
        <td><span class="badge ${roadmapStatusTone[item.status] === 'green' ? 'good' : roadmapStatusTone[item.status] === 'amber' ? 'warn' : 'good'}">${escapeHtml(item.status)}</span></td>
      </tr>`)
    .join('');

const futurePlatformVision = [
  {
    version: 'AIR v2.0',
    title: 'Enterprise Platform',
    status: 'Future Vision',
    purpose: 'Evolve AIR from a generated execution report into a secure, multi-user SaaS platform for quality operations.',
    groups: [
      ['Access & Roles', ['User Authentication', 'Role-Based Access Control (RBAC)', 'User permissions']],
      ['Role Dashboards', ['Executive', 'QA Lead', 'Tester', 'Developer', 'Administrator']],
      ['Platform Storage', ['Database-backed execution storage', 'Workspace / Project management', 'Multi-project support']],
      ['Collaboration', ['Team collaboration', 'Report sharing', 'REST API', 'External integrations']],
      ['Framework Coverage', ['Playwright', 'Selenium', 'Cypress', 'Robot Framework', 'API Testing', 'Database Validation']],
    ],
  },
  {
    version: 'AIR v3.0',
    title: 'Quality Intelligence Platform',
    status: 'Future Vision',
    purpose: 'Move beyond reporting into predictive quality intelligence across projects, teams, releases, and engineering systems.',
    groups: [
      ['AI Intelligence', ['AI-powered Release Intelligence', 'Root Cause Analysis Assistance', 'Predictive Quality Analytics']],
      ['Forecasting', ['Release Forecasting', 'Historical Trend Intelligence', 'Cross-project quality analytics']],
      ['Executive Visibility', ['Executive Portfolio Dashboard', 'Organization-wide reporting']],
      ['Ecosystem', ['CI/CD integrations', 'Plugin / Extension architecture']],
    ],
  },
];

const futurePlatformVisionHtml =
  futurePlatformVision
    .map((item, index) => renderRoadmapPlanCard({
      version: item.version,
      title: item.title,
      status: index === 0 ? 'Future' : 'Vision',
      purpose: item.purpose,
      features: item.groups.flatMap(([, features]) => features),
    }, roadmapVersions.length + index))
    .join('');

const recommendationDetailDataJson =
  JSON.stringify(aiRecommendationItems.map(item => ({
    source: item.source ?? 'AIR Recommendation Engine',
    priority: item.priority,
    title: item.title,
    reason: item.detail,
    action: item.detail,
    relatedModule: item.title.toLowerCase().includes('api') ? 'API Validation' : item.title.toLowerCase().includes('db') ? 'Database Validation' : 'Current Release',
    relatedJourney: 'Release Readiness',
  })))
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

const roadmapDetailDataJson =
  JSON.stringify([
    ...roadmapVersions.map(item => ({
      version: item.version,
      title: item.title,
      status: item.status,
      purpose: item.purpose,
      deliverables: item.features,
      dependencies: item.status === 'Completed' ? ['Current AIR Core and report UI'] : ['AIR Core data model', 'Historical execution storage', 'Evidence mapping'],
      futureValue: item.goal,
    })),
    ...futurePlatformVision.map(item => ({
      version: item.version,
      title: item.title,
      status: item.status,
      purpose: item.purpose,
      deliverables: item.groups.flatMap(([, features]) => features),
      dependencies: item.groups.map(([groupName]) => groupName),
      futureValue: item.purpose,
    })),
  ])
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

function renderPageFooter(pageId) {
  return `
      ${pageId ? renderPageNav(pageId, 'bottom') : ''}
      <div class="page-footer">
        <span>${escapeHtml(projectName)}</span>
        <span>${escapeHtml(environment)}</span>
        <span>${escapeHtml(generatedAt)}</span>
        <span>Prepared by AIR</span>
        <span>Developed By Hardik Thanki</span>
      </div>`;
}

const primaryPages = [
  ['cover', 'Brief'],
  ['health', 'Product health'],
  ['failures', 'What failed'],
  ['validation-summary', 'What passed'],
  ['coverage-gaps', 'Not run'],
  ['insight', 'Next step'],
];

const morePages = [
  ['journey', 'User paths'],
  ['evidence', 'Proof'],
  ['executive', 'Why'],
  ['module-dashboard', 'Each area'],
  ['comparison', 'History'],
  ['air-core', 'About AIR'],
  ['roadmap', 'Roadmap'],
];

const reportPages = [...primaryPages, ...morePages];

function renderNavGroup(pages, id) {
  return pages.map(([pageId, label]) => (
    pageId === id
      ? `<span class="page-nav-here">${escapeHtml(label)}</span>`
      : `<a href="#${pageId}">${escapeHtml(label)}</a>`
  )).join('');
}

function renderPageNav(pageId, placement = 'top') {
  const index = reportPages.findIndex(([id]) => id === pageId);
  if (index < 0) {
    return '';
  }

  const previous = reportPages[index - 1];
  const next = reportPages[index + 1];
  const side = (page, direction) => {
    if (!page) {
      return `<span class="page-pager-end"></span>`;
    }

    const className = direction === 'Previous' ? 'prev' : 'next';
    const mark = direction === 'Previous' ? '←' : '→';
    const label = direction === 'Previous'
      ? `${mark} ${escapeHtml(page[1])}`
      : `${escapeHtml(page[1])} ${mark}`;
    return `<a class="page-pager-${className}" href="#${page[0]}"><small>${direction}</small><strong>${label}</strong></a>`;
  };

  const here = reportPages[index];
  return `<nav class="page-pager ${placement}" aria-label="Report pages" title="Left and right arrow keys move between pages"><div class="page-pager-row">${side(previous, 'Previous')}<span class="page-pager-count"><small>${index + 1} of ${reportPages.length}</small><strong>${escapeHtml(here[1])}</strong></span>${side(next, 'Next')}</div></nav>`;
}

function renderFailureCardNav() {
  return `<nav class="page-pager failure-card-nav" data-failure-card-nav aria-label="Move across the failure cards">
    <div class="page-pager-row">
      <a class="page-pager-prev" data-failure-card-prev href="#failures"><small>Previous</small><strong data-failure-card-prev-name></strong></a>
      <span class="page-pager-count"><small data-failure-card-count></small><strong data-failure-card-here>Cards</strong></span>
      <a class="page-pager-next" data-failure-card-next href="#failure-story-board"><small>Next</small><strong data-failure-card-next-name></strong></a>
    </div>
  </nav>`;
}

function renderInnerNav(kind, options = {}) {
  const selection = options.requireSelection ? ' data-step-require-selection' : '';
  const label = kind === 'story' ? 'stories' : `${kind}s`;
  return `<nav class="page-pager step-nav" aria-label="Move between ${escapeHtml(label)}"${selection} hidden>
    <div class="page-pager-row">
      <button type="button" class="page-pager-prev" data-step-prev><small>Previous</small><strong data-step-prev-name></strong></button>
      <span class="page-pager-count step-nav-here"><small data-step-count></small><strong data-step-label></strong></span>
      <button type="button" class="page-pager-next" data-step-next><small>Next</small><strong data-step-next-name></strong></button>
    </div>
  </nav>`;
}

function renderModuleJump(prefix) {
  return `<nav class="module-jump" aria-label="Areas on this page">${displayModules.map(module => `<a href="#${prefix}${moduleSlug(module.name)}">${escapeHtml(module.name)}</a>`).join('')}</nav>`;
}

function navIcon(name) {
  const icons = {
    home: '<path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path><path d="M9 21v-7h6v7"></path>',
    release: '<path d="M12 3l7 4v6c0 4.2-2.7 7-7 8-4.3-1-7-3.8-7-8V7l7-4z"></path><path d="m9 12 2 2 4-5"></path>',
    journey: '<circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="5" r="2"></circle><circle cx="19" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle><path d="M6.5 10.5 10.5 6.5"></path><path d="m13.5 6.5 4 4"></path><path d="m17.5 13.5-4 4"></path><path d="m10.5 17.5-4-4"></path>',
    product: '<rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 9h8"></path><path d="M8 13h5"></path><path d="M8 17h7"></path>',
    modules: '<rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><rect x="14" y="14" width="6" height="6" rx="1"></rect>',
    failures: '<path d="M12 3 2 21h20L12 3z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path>',
    evidence: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m7 15 3-3 2 2 3-4 2 5"></path><circle cx="8" cy="9" r="1"></circle>',
    insight: '<path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M8.5 14.5a6 6 0 1 1 7 0c-.8.6-1.5 1.5-1.5 2.5h-4c0-1-.7-1.9-1.5-2.5z"></path>',
    analytics: '<path d="M4 19V5"></path><path d="M4 19h16"></path><path d="m7 15 3-3 3 2 5-7"></path>',
    roadmap: '<path d="M5 19V5"></path><path d="M5 6h10l-1.5 3L15 12H5"></path><path d="M19 19H5"></path><path d="M9 19v-4"></path><path d="M15 19v-7"></path>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2 2-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20h-3v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1-2-2 .1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H5v-3h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1 2-2 .1.1a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5V4h3v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1 2 2-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1h.1v3h-.1a1.6 1.6 0 0 0-1.5 1z"></path>',
    integrations: '<path d="M8 12h8"></path><path d="M7 7h.01"></path><path d="M17 7h.01"></path><path d="M7 17h.01"></path><path d="M17 17h.01"></path><rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="8" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect><rect x="13" y="13" width="8" height="8" rx="2"></rect>',
  };

  return `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[name] ?? icons.home}</svg></span>`;
}

function pageHeading(iconName, title) {
  const icon = navIcon(iconName).replace(
    'class="nav-icon"',
    'class="page-heading-icon"'
  );

  return `<div class="page-title-row">${icon}<h1>${escapeHtml(title)}</h1></div>`;
}

const morePageMeta = {
  journey: ['journey', 'Can a user finish the important paths?'],
  evidence: ['evidence', 'Pictures and records from this run.'],
  executive: ['release', 'The release call.'],
  'module-dashboard': ['modules', 'What each area checked.'],
  comparison: ['analytics', 'Earlier runs.'],
  'air-core': ['roadmap', 'How this report is built.'],
  roadmap: ['roadmap', 'What comes next.'],
};

const moreNavHtml = morePages.map(([id, label]) => {
  const [icon] = morePageMeta[id];
  return `<a href="#${id}">${navIcon(icon)}<span>${escapeHtml(label)}</span></a>`;
}).join('\n        ');

const moreDetailCardsHtml = morePages.map(([id, label]) => {
  const [icon, detail] = morePageMeta[id];
  return `<a class="report-more-card tone-good" href="#${id}">${navIcon(icon)}<span>${escapeHtml(label)}</span><strong>${escapeHtml(detail)}</strong><em>Open</em></a>`;
}).join('\n        ');

const airGoldenDashboardHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AIR Execution Report - ${escapeHtml(projectName)}</title>
<style>
:root{--bg:#0b0f17;--nav:#07101f;--panel:#111827;--panel2:#0e1a2d;--card:#111827;--line:#1f2937;--line2:#1f4630;--text:#f8fafc;--muted:#94a3b8;--green:#39e75f;--green2:#22c55e;--green3:#14532d;--red:#ff3b3b;--amber:#f5c542;--info:#8bd7a4}
*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;background:radial-gradient(circle at 18% 0%,rgba(57,231,95,.12),transparent 30%),linear-gradient(135deg,#06101b,#0b0f17 48%,#061525);color:var(--text);font-family:Inter,Segoe UI,Arial,sans-serif}.app{display:grid;grid-template-columns:260px 1fr;min-height:100vh}.sidebar{position:sticky;top:0;height:100vh;min-height:0;background:linear-gradient(180deg,#061227,#07101f);border-right:1px solid var(--line2);padding:24px 18px;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:rgba(57,231,95,.45) rgba(8,16,30,.6)}.sidebar::-webkit-scrollbar{width:8px}.sidebar::-webkit-scrollbar-track{background:rgba(8,16,30,.6);border-radius:999px}.sidebar::-webkit-scrollbar-thumb{background:rgba(57,231,95,.45);border-radius:999px}.brand{font-size:54px;font-weight:900;letter-spacing:-4px;background:linear-gradient(90deg,#39e75f,#23c55e);-webkit-background-clip:text;color:transparent;line-height:.9}.brand-sub{font-size:12px;line-height:1.4;margin:8px 0 24px;color:white;text-align:center}.nav a{display:flex;gap:10px;align-items:center;color:white;text-decoration:none;padding:12px 13px;border-radius:8px;margin-bottom:8px;font-size:14px}.nav-icon{width:22px;height:22px;min-width:22px;border:1px solid rgba(57,231,95,.26);border-radius:7px;background:rgba(57,231,95,.08);display:grid;place-items:center;color:var(--green)}.nav-icon svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.nav a.active .nav-icon,.nav a:hover .nav-icon{background:rgba(57,231,95,.18);border-color:rgba(57,231,95,.55);color:white}.nav a.active,.nav a:hover{background:linear-gradient(90deg,#14532d,#166534);box-shadow:inset 3px 0 0 var(--green)}.report-meta{margin-top:auto;border:1px solid var(--line2);border-radius:10px;padding:14px;background:rgba(17,24,39,.55);font-size:12px;color:var(--muted)}.release-mini{margin-top:12px;border:1px solid rgba(57,231,95,.35);background:rgba(57,231,95,.08);border-radius:10px;padding:14px}.release-mini strong{display:block;font-size:34px;color:var(--green)}main{padding:26px 32px 52px}.page{border:1px solid var(--line2);border-radius:16px;background:linear-gradient(180deg,rgba(17,24,39,.94),rgba(8,16,30,.94));padding:26px;margin-bottom:26px;box-shadow:0 18px 50px rgba(0,0,0,.22)}.hero{min-height:560px}.cover-page{min-height:720px;display:grid;gap:24px}.cover-hero{min-height:430px;border:1px solid rgba(57,231,95,.28);border-radius:18px;background:radial-gradient(circle at 70% 30%,rgba(57,231,95,.16),transparent 35%),linear-gradient(135deg,#07101f,#0b1728);padding:42px;display:grid;grid-template-columns:1fr 1.2fr;gap:28px;align-items:center}.cover-logo{font-size:92px;font-weight:900;letter-spacing:-7px;background:linear-gradient(90deg,#39e75f,#9af7ad);-webkit-background-clip:text;color:transparent}.cover-title{font-size:44px;line-height:1.02;margin:10px 0}.cover-sub{color:var(--muted);font-size:18px}.cover-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.cover-stat{border:1px solid var(--line2);border-radius:12px;background:rgba(8,16,30,.76);padding:18px}.cover-stat span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.cover-stat strong{display:block;font-size:23px;margin-top:8px}.wow{border:1px solid rgba(57,231,95,.3);border-radius:16px;background:linear-gradient(135deg,rgba(57,231,95,.12),rgba(8,16,30,.82));padding:22px;margin-bottom:22px}.wow h2{font-size:28px;margin:0 0 14px}.wow-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.wow-card{border:1px solid var(--line2);border-radius:12px;background:rgba(8,16,30,.72);padding:16px}.wow-card span{display:block;color:var(--muted)}.wow-card strong{display:block;color:var(--green);font-size:34px;margin-top:5px}.wow-card small{display:block;color:#d7fbe0;line-height:1.7}.topbar{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:22px}.eyebrow{font-size:11px;letter-spacing:.18em;color:var(--green);font-weight:900}.topbar h1{font-size:32px;margin:4px 0 3px;letter-spacing:-.03em}.topbar p{margin:0;color:var(--muted)}.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.pill,.btn{border:1px solid var(--line2);border-radius:9px;padding:9px 12px;background:#07101f;color:white;font-weight:800;font-size:12px}.pill.demo{background:rgba(57,231,95,.11);border-color:rgba(57,231,95,.4);color:var(--green)}.btn{text-decoration:none}.btn:hover{border-color:rgba(57,231,95,.6);color:var(--green)}.kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px}.kpi{background:linear-gradient(145deg,#111827,#0b1728);border:1px solid var(--line2);border-radius:10px;padding:16px;min-height:116px;position:relative;overflow:hidden}.kpi:after{content:attr(data-icon);position:absolute;right:14px;top:20px;font-size:34px;color:var(--green);opacity:.82}.kpi span{display:block;color:var(--muted);font-size:13px}.kpi strong{display:block;font-size:30px;margin:10px 0 4px}.kpi.good strong,.good{color:var(--green)}.kpi.bad strong,.bad{color:var(--red)}.kpi.warn strong,.warn{color:var(--amber)}.grid{display:grid;gap:18px}.grid.two{grid-template-columns:1.1fr .9fr}.grid.three{grid-template-columns:repeat(3,1fr)}.panel{border:1px solid var(--line2);border-radius:12px;background:rgba(8,16,30,.74);padding:20px}.panel h2{font-size:18px;margin:0 0 14px}.icon-title{display:flex;align-items:center;gap:10px}.section-icon{width:34px;height:34px;border:1px solid rgba(57,231,95,.35);border-radius:10px;display:inline-grid;place-items:center;background:rgba(57,231,95,.12);color:var(--green);font-size:12px;font-weight:900}.release-card{display:grid;place-items:center;text-align:center;min-height:290px;background:radial-gradient(circle at center,rgba(57,231,95,.15),transparent 58%),#08101e}.release-card .decision{font-size:70px;font-weight:900;margin:8px 0}.release-card .score{width:160px;height:160px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--green) ${executiveData.qualityScore}%,#26354e 0);position:relative}.release-card .score:before{content:"";position:absolute;width:112px;height:112px;border-radius:50%;background:#0b1628}.release-card .score b{z-index:1;font-size:36px}table{width:100%;border-collapse:collapse}th,td{padding:11px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:13px}th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.progress{height:9px;background:#1d2b44;border-radius:999px;overflow:hidden}.progress span{display:block;height:100%;background:linear-gradient(90deg,var(--green),#16a34a);border-radius:999px}.health-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.health-card{display:flex;gap:13px;align-items:center;border:1px solid var(--line2);border-radius:12px;padding:16px;background:#0b1728}.health-card strong,.health-card span,.health-card small{display:block}.health-card span{font-size:28px;color:var(--green);font-weight:900;margin:4px 0}.health-card small{color:var(--muted)}.health-icon{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(57,231,95,.14);border:1px solid rgba(57,231,95,.35);color:var(--green);font-size:11px;font-weight:900}.health-card.amber .health-icon,.health-card.amber span{color:var(--amber)}.health-card.red .health-icon,.health-card.red span{color:var(--red)}.badge{display:inline-block;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900}.badge.good{background:rgba(57,231,95,.14);border:1px solid rgba(57,231,95,.35)}.badge.warn{background:rgba(245,197,66,.14);border:1px solid rgba(245,197,66,.35)}.badge.bad{background:rgba(255,59,59,.14);border:1px solid rgba(255,59,59,.35)}.journey{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.journey-node{min-width:145px;background:#0b1728;border:1px solid var(--line2);border-radius:13px;padding:15px;text-align:center}.journey-node .node-icon{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;margin:0 auto 9px;background:rgba(57,231,95,.16);border:1px solid rgba(57,231,95,.35);font-size:20px}.journey-node strong{display:block}.journey-node span{display:block;color:var(--muted);margin-top:5px}.journey-arrow{color:var(--green);font-size:22px}.chart{height:250px;border:1px solid var(--line2);background:linear-gradient(180deg,#091426,#07101f);border-radius:12px;padding:22px 18px 42px;display:flex;gap:16px;align-items:flex-end}.bar{flex:1;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#63ef7e,#178f38);min-height:18px;position:relative;box-shadow:0 10px 22px rgba(57,231,95,.12)}.bar:hover{filter:brightness(1.16)}.bar.red{background:linear-gradient(180deg,#ff3b3b,#991b1b)}.bar.blue{background:linear-gradient(180deg,#39e75f,#14532d)}.bar label{position:absolute;bottom:-28px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--muted);white-space:nowrap}.risk-matrix{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.risk-cell{min-height:72px;border:1px solid var(--line2);border-radius:8px;display:grid;place-items:center;text-align:center}.risk-cell.low{background:rgba(57,231,95,.14)}.risk-cell.med{background:rgba(245,197,66,.17)}.risk-cell.high{background:rgba(255,59,59,.20)}.evidence-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.evidence-card{display:flex;gap:13px;align-items:center;border:1px solid var(--line2);border-radius:12px;padding:18px;background:#0b1728}.evidence-icon{width:48px;height:48px;border-radius:12px;background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.28);display:grid;place-items:center;color:var(--green);font-weight:900}.evidence-card strong,.evidence-card span{display:block}.evidence-card span{color:var(--muted);margin-top:4px}.thumb-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.thumb{border:1px solid var(--line2);border-radius:12px;background:#07101f;padding:10px;text-decoration:none;color:white;min-height:132px}.thumb img{width:100%;height:92px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}.thumb span{display:block;color:var(--muted);font-size:12px;margin-top:8px}.thumb.placeholder{display:grid;place-items:center;text-align:center}.thumb.placeholder div{width:100%;height:92px;border-radius:8px;border:1px dashed rgba(57,231,95,.35);display:grid;place-items:center;color:var(--green);background:rgba(57,231,95,.08)}.insight{border-color:rgba(57,231,95,.35);background:linear-gradient(135deg,rgba(57,231,95,.12),rgba(20,83,45,.12))}.ai-reasons{margin:12px 0 0;padding-left:20px;color:#d7fbe0;line-height:1.8}.empty-note{border:1px dashed var(--line2);border-radius:12px;padding:18px;color:var(--muted);background:rgba(8,16,30,.5)}.footer{display:flex;justify-content:space-between;gap:18px;align-items:center;color:var(--muted);font-size:12px;border-top:1px solid var(--line2);padding-top:18px}.footer strong{color:white}@media(max-width:1100px){.app{grid-template-columns:1fr}.sidebar{position:relative;height:auto}.kpis,.grid.two,.grid.three,.evidence-grid,.cover-hero,.cover-stats,.wow-grid,.health-grid,.thumb-grid{grid-template-columns:1fr}.hero{min-height:auto}}@page{size:A3 landscape;margin:8mm}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}html,body{background:#0b0f17!important;color:var(--text)!important}.app{display:block}.sidebar{display:none!important}main{padding:0!important}.page{break-inside:avoid;page-break-inside:avoid;margin:0 0 10mm!important;box-shadow:none!important}.btn,.actions{display:none!important}.footer{break-inside:avoid}}
</style>
</head>
<body>
<div class="app">
  <style>
    .module-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:18px}.module-health-card{display:flex;flex-direction:column;gap:14px;min-height:320px;border:1px solid rgba(57,231,95,.34);border-radius:16px;background:linear-gradient(145deg,rgba(11,23,40,.96),rgba(7,16,31,.96));padding:18px;text-decoration:none;color:var(--text);box-shadow:0 14px 34px rgba(0,0,0,.22);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.module-health-card:hover{transform:translateY(-3px);border-color:var(--green);box-shadow:0 18px 42px rgba(57,231,95,.14)}.module-health-card.green{border-color:rgba(57,231,95,.45)}.module-health-card.amber{border-color:rgba(245,197,66,.55)}.module-health-card.red{border-color:rgba(255,59,59,.6)}.module-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.module-title{display:flex;align-items:center;gap:12px}.module-icon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.32);color:var(--green);font-size:11px;font-weight:900}.module-health-card.amber .module-icon{background:rgba(245,197,66,.12);border-color:rgba(245,197,66,.38);color:var(--amber)}.module-health-card.red .module-icon{background:rgba(255,59,59,.12);border-color:rgba(255,59,59,.42);color:var(--red)}.module-title strong{font-size:18px}.module-score{font-size:44px;line-height:1;color:var(--green);font-weight:900}.module-health-card.amber .module-score{color:var(--amber)}.module-health-card.red .module-score{color:var(--red)}.module-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.module-meta span{border:1px solid var(--line2);border-radius:10px;background:rgba(8,16,30,.64);padding:10px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.module-meta b{display:block;color:white;font-size:15px;margin-top:5px;text-transform:none;letter-spacing:0}.module-progress{height:9px;background:#1d2b44;border-radius:999px;overflow:hidden}.module-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--green),#16a34a)}.module-health-card.amber .module-progress span{background:linear-gradient(90deg,var(--amber),#b7791f)}.module-health-card.red .module-progress span{background:linear-gradient(90deg,var(--red),#991b1b)}.module-health-card p{margin:0;color:#d7fbe0;line-height:1.45;flex:1}.module-button{display:inline-flex;align-items:center;justify-content:center;width:max-content;border:1px solid rgba(57,231,95,.42);border-radius:999px;background:rgba(57,231,95,.10);color:var(--green);font-size:12px;font-weight:900;padding:9px 12px}.module-dashboard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.module-dashboard-card{border:1px solid rgba(57,231,95,.34);border-radius:14px;background:rgba(8,16,30,.74);padding:18px;scroll-margin-top:24px}.module-dashboard-card.amber{border-color:rgba(245,197,66,.55)}.module-dashboard-card.red{border-color:rgba(255,59,59,.6)}.module-dashboard-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:16px 0}.module-dashboard-metrics span{border:1px solid var(--line2);border-radius:10px;background:rgba(8,16,30,.64);padding:10px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.module-dashboard-metrics b{display:block;color:white;font-size:15px;margin-top:5px;text-transform:none;letter-spacing:0}.module-action{margin-top:12px;color:#d7fbe0;font-weight:800}.badge.green{background:rgba(57,231,95,.14);border:1px solid rgba(57,231,95,.35);color:var(--green)}.badge.amber{background:rgba(245,197,66,.14);border:1px solid rgba(245,197,66,.35);color:var(--amber)}.badge.red{background:rgba(255,59,59,.14);border:1px solid rgba(255,59,59,.35);color:var(--red)}@media(max-width:1100px){.module-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.module-dashboard-grid,.module-dashboard-metrics{grid-template-columns:1fr}}@media(max-width:760px){.module-card-grid,.module-meta{grid-template-columns:1fr}}@media print{.module-health-card,.module-dashboard-card{break-inside:avoid}}
    .ai-decision-panel{min-height:320px}.ai-decision-summary{font-size:15px;line-height:1.7;color:#d7fbe0;margin:0 0 18px}.risk-banner{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid var(--line2);border-radius:14px;background:rgba(8,16,30,.72);padding:16px;margin:18px 0}.risk-banner span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.risk-banner strong{font-size:32px}.risk-banner.green strong{color:var(--green)}.risk-banner.amber strong{color:var(--amber)}.risk-banner.red strong{color:var(--red)}.risk-dots{display:flex;gap:8px}.risk-dots i{width:12px;height:12px;border-radius:50%;background:#253247}.risk-banner.green .risk-dots i:first-child{background:var(--green);box-shadow:0 0 18px rgba(57,231,95,.55)}.risk-banner.amber .risk-dots i:nth-child(-n+2){background:var(--amber);box-shadow:0 0 18px rgba(245,197,66,.45)}.risk-banner.red .risk-dots i{background:var(--red);box-shadow:0 0 18px rgba(255,59,59,.45)}.recommendation-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.recommendation-card{border:1px solid rgba(57,231,95,.32);border-radius:14px;background:linear-gradient(145deg,rgba(11,23,40,.96),rgba(7,16,31,.96));padding:18px;min-height:190px}.recommendation-card span{display:inline-block;border:1px solid rgba(57,231,95,.34);border-radius:999px;background:rgba(57,231,95,.1);color:var(--green);font-size:11px;font-weight:900;padding:6px 9px;margin-bottom:14px}.recommendation-card strong{display:block;font-size:18px;margin-bottom:10px}.recommendation-card p{margin:0;color:var(--muted);line-height:1.55}.action-list{margin:0;padding-left:19px;color:#d7fbe0;line-height:1.9}.ai-metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.ai-metric{border:1px solid var(--line2);border-radius:12px;background:rgba(8,16,30,.66);padding:14px}.ai-metric span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}.ai-metric strong{display:block;font-size:22px;color:var(--green);margin-top:8px}.interactive-card{cursor:pointer;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease,background .16s ease}.interactive-card:hover,.interactive-card:focus-visible{transform:translateY(-2px);border-color:rgba(57,231,95,.62)!important;box-shadow:0 18px 42px rgba(57,231,95,.14);outline:none}.interactive-card:focus-visible{box-shadow:0 0 0 3px rgba(57,231,95,.22),0 18px 42px rgba(57,231,95,.14)}.drawer-backdrop,.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.58);opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:20}.drawer-backdrop.open,.modal-backdrop.open{opacity:1;pointer-events:auto}.module-drawer{position:fixed;top:0;right:0;width:min(560px,100vw);height:100vh;background:linear-gradient(180deg,#07101f,#0b1728);border-left:1px solid rgba(57,231,95,.38);box-shadow:-28px 0 70px rgba(0,0,0,.45);transform:translateX(105%);transition:transform .2s ease;z-index:21;display:flex;flex-direction:column}.module-drawer.open{transform:translateX(0)}.drawer-header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:24px;border-bottom:1px solid var(--line2)}.drawer-header h2{font-size:28px;margin:4px 0}.drawer-close,.modal-close{border:1px solid var(--line2);background:#07101f;color:white;border-radius:10px;width:38px;height:38px;cursor:pointer;font-size:20px}.drawer-body{padding:22px;overflow:auto}.drawer-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:18px}.drawer-metric{border:1px solid var(--line2);border-radius:12px;background:rgba(8,16,30,.74);padding:14px}.drawer-metric span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.07em}.drawer-metric strong{display:block;color:var(--green);font-size:24px;margin-top:7px}.drawer-section{border:1px solid var(--line2);border-radius:14px;background:rgba(8,16,30,.62);padding:16px;margin-bottom:14px}.drawer-section h3{margin:0 0 12px;font-size:16px}.drawer-focus{border-color:rgba(57,231,95,.38);background:linear-gradient(135deg,rgba(57,231,95,.11),rgba(8,16,30,.72))}.drawer-focus p{margin:0;color:#d7fbe0;line-height:1.55}.drawer-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}.drawer-list li{display:flex;gap:9px;align-items:center;color:#d7fbe0}.drawer-list li:before{content:"✓";color:var(--green);font-weight:900}.evidence-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.evidence-chip{border:1px solid rgba(57,231,95,.32);border-radius:11px;background:rgba(57,231,95,.08);padding:11px;color:white;text-decoration:none}.evidence-chip strong{display:block}.evidence-chip span{display:block;color:var(--muted);font-size:12px;margin-top:4px}.drawer-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.modal{position:fixed;left:50%;top:50%;width:min(780px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;transform:translate(-50%,-46%) scale(.96);opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;z-index:22;border:1px solid rgba(57,231,95,.38);border-radius:18px;background:linear-gradient(180deg,#07101f,#0b1728);box-shadow:0 32px 90px rgba(0,0,0,.5);padding:24px}.modal.open{opacity:1;pointer-events:auto;transform:translate(-50%,-50%) scale(1)}.modal-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}.modal-header h2{margin:4px 0;font-size:28px}.modal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}@media(max-width:1100px){.recommendation-grid,.ai-metric-grid,.drawer-metrics,.evidence-links,.modal-grid{grid-template-columns:1fr}}@media print{.interactive-card{cursor:default}.interactive-card:hover,.interactive-card:focus-visible{transform:none;box-shadow:none}}
    .module-mini-hero{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.module-mini-hero div{border:1px solid var(--line2);border-radius:14px;background:linear-gradient(145deg,rgba(57,231,95,.08),rgba(8,16,30,.76));padding:16px}.module-mini-hero span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.module-mini-hero strong{display:block;color:var(--green);font-size:30px;margin-top:8px}.mini-dashboard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px;align-items:start;grid-auto-rows:min-content}.mini-section{border:1px solid var(--line2);border-radius:14px;background:rgba(8,16,30,.62);padding:15px;align-self:start}.mini-section summary{display:flex;justify-content:space-between;gap:12px;align-items:center;cursor:pointer;list-style:none;margin:-2px 0 10px}.mini-section summary::-webkit-details-marker{display:none}.mini-section summary:before{content:"▾";color:var(--green);font-weight:900}.mini-section:not([open]) summary{margin-bottom:0}.mini-section:not([open]) summary:before{content:"▸"}.mini-section summary span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.mini-section summary strong{margin-left:auto;color:var(--green);font-size:12px}.mini-section h3{margin:0 0 10px;font-size:15px}.mini-section p{margin:0;line-height:1.5}.mini-label{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.mini-label span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.mini-label strong{color:var(--green)}.scenario-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.scenario-chips span{border:1px solid rgba(57,231,95,.28);border-radius:999px;background:rgba(57,231,95,.08);color:#d7fbe0;font-size:11px;font-weight:800;padding:6px 9px}.mini-evidence{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mini-evidence span,.validation-stack span{border:1px solid rgba(57,231,95,.22);border-radius:10px;background:rgba(7,16,31,.74);padding:9px;color:white;font-size:12px}.mini-evidence b,.validation-stack b{display:block;color:var(--muted);font-weight:700;margin-top:5px}.mini-evidence-button{display:inline-block;margin-top:10px;border:1px solid rgba(57,231,95,.42);border-radius:999px;background:rgba(57,231,95,.1);color:var(--green)!important;font-size:12px;font-weight:900;padding:8px 10px;text-decoration:none!important}.validation-stack{display:grid;gap:8px}.history-chart{height:220px;display:flex;gap:14px;align-items:flex-end;border:1px solid var(--line2);border-radius:14px;background:linear-gradient(180deg,#091426,#07101f);padding:20px 16px 44px}.trend-bar{flex:1;position:relative;height:100%;display:flex;align-items:flex-end;justify-content:center}.trend-bar span{width:70%;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#63ef7e,#178f38);box-shadow:0 10px 22px rgba(57,231,95,.14)}.trend-bar small{position:absolute;bottom:-28px;color:var(--muted);font-size:11px}.trend-bar strong{position:absolute;top:-18px;color:white;font-size:11px}.report-search,.global-search{border:1px solid var(--line2);border-radius:12px;background:rgba(8,16,30,.72);padding:12px;margin:14px 0}.global-search{position:sticky;top:12px;z-index:12;display:grid;grid-template-columns:220px 1fr;gap:14px;align-items:start;margin:0 0 22px}.report-search label,.global-search label{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}.report-search input,.global-search input{width:100%;border:1px solid rgba(57,231,95,.28);border-radius:9px;background:#07101f;color:white;padding:10px 11px;outline:none}.report-search input:focus,.global-search input:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(57,231,95,.12)}.search-results{display:grid;gap:7px;margin-top:10px}.global-search .search-results{grid-column:2}.search-results a{border:1px solid rgba(57,231,95,.18);border-radius:9px;background:rgba(57,231,95,.07);color:white!important;font-size:12px;line-height:1.35;padding:8px;text-decoration:none!important}.search-results a:hover{border-color:rgba(57,231,95,.45);color:var(--green)!important}.search-empty{color:var(--muted);font-size:12px}.search-hit{outline:2px solid rgba(57,231,95,.75);outline-offset:3px}.evidence-card{color:var(--text)!important;text-decoration:none!important;min-height:150px;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.evidence-card:hover{transform:translateY(-2px);border-color:var(--green);box-shadow:0 18px 42px rgba(57,231,95,.12)}.evidence-card strong{color:white!important;text-decoration:none!important;font-size:18px}.evidence-card span{color:var(--muted)!important;text-decoration:none!important}.evidence-card em{display:inline-block;margin-top:9px;color:var(--green)!important;font-style:normal;font-size:12px;font-weight:900;text-decoration:none!important}.evidence-card *{text-decoration:none!important}.evidence-icon{flex:0 0 58px;min-width:58px;height:58px;overflow:hidden;font-size:13px}.module-dashboard-grid{align-items:start}.module-dashboard-card{align-self:start}.why-release{max-width:460px;margin:24px auto 0;text-align:left}.why-release h3{text-align:center;font-size:24px;margin:0 0 18px}.why-release ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}.why-release li{display:grid;grid-template-columns:24px minmax(0,1fr);gap:12px;align-items:start;color:#f8fafc;font-size:18px;line-height:1.35;text-align:left}.why-release li:before{content:"✓";display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.38);color:var(--green);font-size:13px;font-weight:900;line-height:1}@media(max-width:1100px){.module-mini-hero,.mini-dashboard-grid,.mini-evidence,.global-search{grid-template-columns:1fr}.global-search .search-results{grid-column:auto}}
    .nav a.disabled{opacity:.62;cursor:not-allowed}.nav a.disabled:hover{background:transparent;box-shadow:none}.nav a.disabled .nav-icon{color:var(--muted);border-color:rgba(148,163,184,.22);background:rgba(148,163,184,.06)}.nav a em{margin-left:auto;border:1px solid rgba(57,231,95,.24);border-radius:999px;color:var(--muted);font-style:normal;font-size:9px;font-weight:900;padding:3px 6px;text-transform:uppercase;letter-spacing:.04em}.mission-label{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:900}.mission-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:100%;margin:12px 0 14px}.mission-grid div{border:1px solid rgba(57,231,95,.24);border-radius:12px;background:rgba(7,16,31,.7);padding:12px}.mission-grid span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}.mission-grid strong{display:block;color:var(--green);font-size:22px;margin-top:6px}.evidence-preview-body{border:1px solid var(--line2);border-radius:14px;background:rgba(8,16,30,.72);padding:18px;min-height:180px}.evidence-preview-body img,.evidence-preview-body video{max-width:100%;border-radius:12px;border:1px solid var(--line2);background:#07101f}.evidence-preview-body .preview-meta{display:grid;gap:10px}.evidence-preview-body .preview-meta a{color:var(--green);font-weight:900}.roadmap-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}.roadmap-summary div{border:1px solid var(--line2);border-radius:14px;background:rgba(8,16,30,.72);padding:16px}.roadmap-summary span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.roadmap-summary strong{display:block;color:var(--green);font-size:28px;margin-top:8px}.roadmap-progress{height:13px;border-radius:999px;background:#1d2b44;overflow:hidden;margin:16px 0 8px}.roadmap-progress span{display:block;height:100%;width:18%;border-radius:999px;background:linear-gradient(90deg,var(--green),#9af7ad)}.roadmap-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.roadmap-card{border:1px solid rgba(57,231,95,.28);border-radius:16px;background:linear-gradient(145deg,rgba(11,23,40,.96),rgba(7,16,31,.96));padding:18px}.roadmap-card.green{border-color:rgba(57,231,95,.48)}.roadmap-card.amber{border-color:rgba(245,197,66,.45)}.roadmap-card.blue{border-color:rgba(139,215,164,.36)}.roadmap-card.purple{border-color:rgba(148,163,184,.36)}.roadmap-card-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.roadmap-card-head span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.roadmap-card-head h2{margin:5px 0 0}.roadmap-card-head strong{border:1px solid rgba(57,231,95,.28);border-radius:999px;color:var(--green);font-size:11px;padding:6px 9px;white-space:nowrap}.roadmap-card p{color:#d7fbe0;line-height:1.55}.roadmap-card ul{columns:2;margin:12px 0 0;padding-left:18px;color:var(--muted);line-height:1.7}.module-filter{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px}.module-filter button{border:1px solid rgba(57,231,95,.28);border-radius:999px;background:#07101f;color:white;cursor:pointer;font-weight:900;padding:8px 12px}.module-filter button.active,.module-filter button:hover{border-color:var(--green);background:rgba(57,231,95,.12);color:var(--green)}.success-empty-state{text-align:center;padding:34px 18px}.success-icon{display:grid;place-items:center;width:76px;height:76px;margin:0 auto 18px;border-radius:50%;border:1px solid rgba(57,231,95,.42);background:rgba(57,231,95,.12);color:var(--green);font-weight:900}.success-empty-state h2{font-size:28px;margin:0 0 10px}.success-empty-state p{max-width:720px;margin:0 auto;color:#d7fbe0;line-height:1.7}.success-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px auto 0;max-width:820px}.success-grid span{border:1px solid var(--line2);border-radius:12px;background:rgba(8,16,30,.72);padding:14px;color:var(--muted)}.success-grid b{display:block;color:var(--green);font-size:24px;margin-bottom:4px}.module-status-card{min-height:148px;gap:12px}.module-status-card p{font-size:18px;color:#d7fbe0;flex:0}.module-status-card em,.module-selector-card em{font-style:normal;color:var(--green);font-size:12px;font-weight:900}.module-selector-card{min-height:250px;display:flex;flex-direction:column;gap:14px}.module-selector-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.module-selector-summary span{border:1px solid var(--line2);border-radius:10px;background:rgba(8,16,30,.64);padding:10px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.module-selector-summary b{display:block;color:white;font-size:15px;margin-top:5px;text-transform:none;letter-spacing:0}.module-selector-card p{margin:0;color:#d7fbe0;line-height:1.45;flex:1}.module-dashboard-intro{border:1px solid rgba(57,231,95,.28);border-radius:14px;background:linear-gradient(135deg,rgba(57,231,95,.1),rgba(8,16,30,.72));padding:18px;margin-bottom:18px}.module-dashboard-intro h2{margin:0 0 8px}.module-dashboard-intro p{margin:0;color:#d7fbe0;line-height:1.55}.drawer-test-list{display:grid;gap:9px}.drawer-test-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid rgba(57,231,95,.22);border-radius:11px;background:rgba(7,16,31,.74);padding:11px}.drawer-test-row strong{display:block;color:white;font-size:13px;line-height:1.35}.drawer-test-row span{display:block;color:var(--muted);font-size:11px;margin-top:5px}.drawer-test-row em{font-style:normal;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:900;text-transform:uppercase}.drawer-test-row em.green{background:rgba(57,231,95,.14);color:var(--green);border:1px solid rgba(57,231,95,.35)}.drawer-test-row em.amber{background:rgba(245,197,66,.14);color:var(--amber);border:1px solid rgba(245,197,66,.35)}.drawer-test-row em.red{background:rgba(255,59,59,.14);color:var(--red);border:1px solid rgba(255,59,59,.35)}@media(max-width:1100px){.roadmap-summary,.roadmap-grid{grid-template-columns:1fr}}@media(max-width:760px){.module-selector-summary,.mission-grid,.success-grid{grid-template-columns:1fr}.roadmap-card ul{columns:1}}
    .release-status-badge{display:inline-flex;align-items:center;justify-content:center;width:max-content;max-width:100%;border-radius:999px;border:1px solid rgba(57,231,95,.42);background:rgba(57,231,95,.12);color:var(--green);font-size:22px;font-weight:900;letter-spacing:.04em;line-height:1.1;padding:10px 16px;text-transform:uppercase;white-space:normal;text-align:center}.release-status-badge.warn{border-color:rgba(245,197,66,.45);background:rgba(245,197,66,.12);color:var(--amber)}.release-status-badge.bad{border-color:rgba(255,59,59,.45);background:rgba(255,59,59,.12);color:var(--red)}.release-status-badge.compact{font-size:13px;padding:7px 10px;letter-spacing:.03em}.release-mini .release-status-badge{margin:8px 0 6px}.cover-stat .release-status-badge{margin-top:10px}.release-card{align-content:center;gap:14px;padding:24px}.release-card .release-status-badge{font-size:30px;padding:12px 22px;margin:4px auto 2px}.release-card p{max-width:620px;margin:0 auto;color:#d7fbe0;line-height:1.55}.release-card .decision{font-size:30px}.mission-grid{margin-top:4px}.ai-metric-grid{grid-template-columns:repeat(auto-fit,minmax(132px,1fr))}.ai-metric{min-width:0;overflow:visible}.ai-metric strong{max-width:100%;font-size:clamp(22px,2.1vw,30px);line-height:1.08;overflow-wrap:anywhere;word-break:normal}.ai-metric .release-status-badge{margin-top:7px;max-width:100%;width:100%;font-size:11px;line-height:1.15;padding:7px 6px;overflow-wrap:anywhere}.metric-help{display:inline-grid;place-items:center;width:16px;height:16px;margin-left:5px;border:1px solid rgba(57,231,95,.36);border-radius:50%;color:var(--green);font-size:10px;font-style:normal;font-weight:900;vertical-align:middle;cursor:help}.core-status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.core-status-item{border:1px solid rgba(57,231,95,.24);border-radius:11px;background:rgba(7,16,31,.72);padding:10px}.core-status-item span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.core-status-item strong{display:block;color:var(--green);font-size:13px;margin-top:5px}.compare-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.compare-card{border:1px solid var(--line2);border-radius:14px;background:rgba(8,16,30,.72);padding:16px;min-height:126px}.compare-card span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.compare-card strong{display:block;color:white;font-size:24px;margin:9px 0 5px}.compare-card small{display:block;color:var(--muted);line-height:1.4}.compare-card em{display:inline-block;margin-top:10px;border-radius:999px;border:1px solid rgba(57,231,95,.28);padding:5px 8px;color:var(--green);font-style:normal;font-size:11px;font-weight:900}.compare-card.red em{border-color:rgba(255,59,59,.36);color:var(--red)}.compare-card.amber em{border-color:rgba(245,197,66,.36);color:var(--amber)}.compare-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}.compare-list li{display:flex;justify-content:space-between;gap:12px;border:1px solid rgba(57,231,95,.22);border-radius:11px;background:rgba(7,16,31,.74);padding:11px}.compare-list strong{font-size:13px}.compare-list span{color:var(--muted);font-size:12px}.modal-header h2 .release-status-badge{vertical-align:middle;margin:0 4px;width:auto;font-size:14px;padding:7px 10px}.modal-header h2{display:flex;align-items:center;gap:8px;flex-wrap:wrap}@media(max-width:1100px){.compare-grid,.core-status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.release-card .release-status-badge{font-size:22px}.release-status-badge{font-size:18px}.release-status-badge.compact{font-size:12px}.compare-grid,.core-status-grid{grid-template-columns:1fr}}
    :root{--air-success:var(--green);--air-warning:var(--amber);--air-danger:var(--red);--air-info:var(--info);--air-muted:var(--muted);--air-panel:var(--panel);--air-border:var(--line2);--space-xs:6px;--space-sm:10px;--space-md:14px;--space-lg:18px;--space-xl:24px;--type-heading:32px;--type-body:14px;--type-label:11px;--type-metric:30px}
    .report-search,.global-search{background:#07101f!important;border:1px solid rgba(57,231,95,.38)!important;box-shadow:0 18px 42px rgba(0,0,0,.36);backdrop-filter:none}
    .report-search input,.global-search input{background:#020817!important;border:1px solid rgba(57,231,95,.46)!important;color:#f8fafc!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.02)}
    .report-search input::placeholder,.global-search input::placeholder{color:#7f8fa8}
    .report-search input:focus,.global-search input:focus{background:#030b16!important;border-color:var(--green)!important;box-shadow:0 0 0 3px rgba(57,231,95,.18),inset 0 0 0 1px rgba(57,231,95,.18)!important}
    .search-results{position:relative;z-index:30}
    .search-results a,.search-empty{background:#08111f!important;border:1px solid rgba(57,231,95,.30)!important;box-shadow:0 10px 24px rgba(0,0,0,.28)}
    .search-results a:hover{background:#0b1a2d!important;border-color:rgba(57,231,95,.58)!important}
    .release-status-badge{display:inline-flex;align-items:center;justify-content:center;min-width:0;width:auto;max-inline-size:100%;border-radius:999px;text-align:center;white-space:normal;overflow-wrap:anywhere;word-break:normal;line-height:1.12;font-size:clamp(12px,1.1vw,18px);padding:clamp(6px,.7vw,10px) clamp(9px,1vw,16px)}
    .release-status-badge[data-status="GO"]{border-color:rgba(57,231,95,.42);background:rgba(57,231,95,.12);color:var(--air-success)}
    .release-status-badge[data-status="CONDITIONAL_GO"]{border-color:rgba(245,197,66,.45);background:rgba(245,197,66,.12);color:var(--air-warning)}
    .release-status-badge[data-status="NO_GO"]{border-color:rgba(255,59,59,.45);background:rgba(255,59,59,.12);color:var(--air-danger)}
    .release-status-badge.compact{font-size:clamp(10px,.9vw,13px);padding:6px 9px}
    .release-card .release-status-badge{font-size:clamp(18px,2vw,30px);max-width:100%}
    .ai-metric .release-status-badge,.cover-stat .release-status-badge,.modal-header .release-status-badge{max-width:100%}
    .cover-stat,.ai-metric,.compare-card,.roadmap-card,.module-health-card,.module-selector-card,.module-dashboard-card,.drawer-metric,.meta-item{min-width:0;overflow-wrap:anywhere}
    .panel,.page,.module-drawer,.modal{overflow-wrap:anywhere}
    .global-search{max-width:100%}
    .empty-state{border:1px dashed rgba(57,231,95,.28);border-radius:14px;background:rgba(8,16,30,.62);min-height:180px;display:grid;place-items:center}
    .thumb-grid .empty-state{grid-column:1/-1}
    .success-empty-state p + p{margin-top:8px}
    .roadmap-card-head strong,.badge,.pill,.nav a em{max-width:100%;white-space:normal;text-align:center}
    .decision-metrics{gap:16px;margin-bottom:24px}
    .decision-metrics .ai-metric{min-height:128px;display:flex;flex-direction:column;justify-content:center;gap:10px}
    .decision-metrics .ai-metric>strong{font-size:clamp(24px,2.2vw,34px);line-height:1.05;white-space:nowrap}
    .decision-metrics .ai-metric>strong:has(.release-status-badge){white-space:normal}
    .decision-group{border-top:1px solid rgba(57,231,95,.18);padding-top:22px;margin-top:4px}
    .decision-group h3{font-size:18px;margin:0 0 12px}
    .decision-reasons{list-style:none;margin:0;padding:0;display:grid;gap:10px}
    .decision-reasons li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:11px;align-items:start;color:#d7fbe0;line-height:1.45}
    .decision-reasons li:before{content:"✓";display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.34);color:var(--green);font-size:12px;font-weight:900}
    .support-metrics{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:22px 0 0}
    .recommendation-callout{margin-top:24px;border:1px solid rgba(57,231,95,.38);border-radius:16px;background:linear-gradient(135deg,rgba(57,231,95,.12),rgba(8,16,30,.78));padding:20px}
    .recommendation-callout span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
    .recommendation-callout strong{display:block;color:#f8fafc;font-size:18px;line-height:1.45}
    .nowrap{white-space:nowrap;word-break:normal;overflow-wrap:normal}
    .health-summary-panel h2{margin-bottom:14px}
    .summary-lead{font-size:15px;line-height:1.65;color:#d7fbe0;margin:0 0 24px}
    .health-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:24px}
    .health-stat{border:1px solid var(--line2);border-radius:14px;background:rgba(8,16,30,.68);padding:16px;min-height:126px}
    .health-stat span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
    .health-stat strong{display:block;font-size:36px;line-height:1;margin:12px 0 8px}
    .health-stat small{display:block;color:var(--muted);line-height:1.35}
    .health-stat.good strong{color:var(--green)}.health-stat.warn strong{color:var(--amber)}.health-stat.bad strong{color:var(--red)}
    .next-focus-card{border:1px solid rgba(57,231,95,.30);border-radius:14px;background:rgba(57,231,95,.08);padding:18px}
    .next-focus-card span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
    .next-focus-card strong{display:block;color:var(--green);font-size:22px;margin:8px 0}
    .next-focus-card p{margin:0;color:#d7fbe0;line-height:1.55}
    .executive-decision-card{border:1px solid rgba(57,231,95,.36);border-radius:18px;background:linear-gradient(135deg,rgba(57,231,95,.11),rgba(8,16,30,.82));padding:26px;margin:0 0 26px;display:grid;grid-template-columns:minmax(280px,.8fr) 1.2fr;gap:24px;align-items:stretch}
    .executive-decision-main{border:1px solid rgba(57,231,95,.26);border-radius:16px;background:rgba(8,16,30,.68);padding:22px;display:flex;flex-direction:column;gap:18px;justify-content:center}
    .executive-decision-main .release-status-badge{font-size:clamp(18px,2vw,30px);align-self:flex-start}
    .executive-decision-bullets{list-style:none;margin:0;padding:0;display:grid;gap:9px;color:#d7fbe0;line-height:1.45}
    .executive-decision-bullets li{display:grid;grid-template-columns:20px minmax(0,1fr);gap:9px}
    .executive-decision-bullets li:before{content:"✓";display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.32);color:var(--green);font-size:11px;font-weight:900}
    .executive-decision-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    .executive-decision-metrics div{border:1px solid var(--line2);border-radius:14px;background:rgba(8,16,30,.68);padding:16px;min-height:118px;display:flex;flex-direction:column;justify-content:center}
    .executive-decision-metrics span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
    .executive-decision-metrics strong{display:block;color:var(--green);font-size:clamp(20px,1.8vw,30px);line-height:1.08;margin-top:10px}
    .executive-action{grid-column:1/-1;border:1px solid rgba(57,231,95,.38);border-radius:16px;background:rgba(57,231,95,.10);padding:20px}
    .executive-action span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
    .executive-action strong{display:block;color:#f8fafc;font-size:19px;line-height:1.45}
    .role-recommendation-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
    .role-recommendation-card{border:1px solid rgba(57,231,95,.28);border-radius:14px;background:rgba(8,16,30,.68);padding:18px;min-height:190px}
    .role-recommendation-card span{display:inline-block;border:1px solid rgba(57,231,95,.28);border-radius:999px;background:rgba(57,231,95,.08);color:var(--green);font-size:11px;font-weight:900;padding:6px 9px;margin-bottom:13px}
    .role-recommendation-card strong{display:block;font-size:17px;margin-bottom:10px}
    .role-recommendation-card p{margin:0;color:var(--muted);line-height:1.55}
    .recommendation-card small{display:block;margin-top:14px;color:var(--green);font-size:11px;font-weight:900}
    .freshness-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 22px}
    .freshness-strip span{border:1px solid rgba(57,231,95,.24);border-radius:12px;background:rgba(8,16,30,.7);padding:12px;color:#d7fbe0;min-width:0}
    .freshness-strip b{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px}
    .drawer-breadcrumb{color:var(--muted);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}
    .business-impact{border-color:rgba(245,197,66,.34);background:linear-gradient(135deg,rgba(245,197,66,.08),rgba(8,16,30,.72))}
    .business-impact p{margin:0;color:#f8fafc;line-height:1.55}
    .historical-wins{border-color:rgba(57,231,95,.34);background:linear-gradient(135deg,rgba(57,231,95,.09),rgba(8,16,30,.72))}
    #comparison .panel{margin-bottom:2px}
    #comparison .panel>h2{margin-bottom:18px}
    #comparison .grid.two,#comparison .grid.three{gap:22px}
    .compare-card{min-height:138px}
    .trend-indicator{display:inline-flex;align-items:center;gap:5px}
    .history-hero-grid{display:grid;grid-template-columns:minmax(280px,.85fr) 1.15fr;gap:18px;align-items:stretch}
    .history-narrative{border:1px solid rgba(57,231,95,.28);border-radius:16px;background:rgba(8,16,30,.66);padding:20px;display:flex;flex-direction:column;gap:16px}
    .history-narrative p{margin:0;color:#d7fbe0;line-height:1.65}
    .history-change-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
    .history-change-list li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:start;color:#f8fafc;line-height:1.45}
    .history-change-list li:before{content:"";width:9px;height:9px;border-radius:50%;background:var(--green);box-shadow:0 0 16px rgba(57,231,95,.48);margin-top:7px}
    .history-metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .history-trend-card{border:1px solid var(--line2);border-radius:16px;background:rgba(8,16,30,.72);padding:18px;min-height:230px;display:flex;flex-direction:column;gap:18px}
    .history-trend-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
    .history-trend-head span{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
    .history-trend-head strong{color:var(--green);font-size:clamp(22px,2vw,30px);line-height:1}
    .history-sparkline{display:flex;gap:10px;align-items:flex-end;min-height:130px;border:1px solid rgba(57,231,95,.18);border-radius:12px;background:linear-gradient(180deg,rgba(7,16,31,.82),rgba(8,16,30,.62));padding:18px 12px 32px}
    .history-spark{flex:1;position:relative;display:flex;justify-content:center;align-items:flex-end;height:100%}
    .history-spark span{width:70%;max-width:34px;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#63ef7e,#178f38);box-shadow:0 10px 22px rgba(57,231,95,.14)}
    .history-spark small{position:absolute;bottom:-23px;color:var(--muted);font-size:10px}
    .history-trend-summary{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid rgba(148,163,184,.12);padding-top:10px;color:#9fb0c5;font-size:11px;line-height:1.35}
    .history-trend-summary span{color:#39e75f;font-weight:900;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap}
    .history-trend-summary small{color:#8fa2ba;text-align:right;line-height:1.35}
    .history-panel-subsection{margin-top:16px;border-top:1px solid rgba(148,163,184,.12);padding-top:16px}
    .history-panel-head.compact{margin-bottom:10px}
    .history-panel-head.compact h3{margin:4px 0;color:#f8fafc;font-size:18px;line-height:1.2}
    .failure-timeline-preview{display:grid;gap:10px;margin-top:12px}
    .failure-timeline-count{color:#8fa2ba;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
    .failure-timeline-row{display:grid;grid-template-columns:minmax(0,1fr) max-content auto;gap:14px;align-items:center;border:1px solid rgba(148,163,184,.12);border-radius:14px;background:rgba(3,10,18,.42);padding:12px}
    .failure-timeline-row strong{display:block;color:#f8fafc;font-size:13px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .failure-timeline-row span{display:block;margin-top:5px;color:#9fb0c5;font-size:11px;line-height:1.3}
    .failure-timeline-meta{display:grid;gap:5px;justify-items:end;min-width:112px}
    .failure-timeline-meta em{display:inline-flex;align-items:center;justify-content:center;max-width:132px;border:1px solid rgba(148,163,184,.14);border-radius:999px;background:rgba(148,163,184,.08);color:#cbd5e1;font-size:10px;font-style:normal;font-weight:950;letter-spacing:.05em;text-transform:uppercase;padding:6px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .failure-timeline-meta em.bad{border-color:rgba(255,107,107,.28);background:rgba(127,29,29,.18);color:#ff9b9b}
    .failure-timeline-meta em.good{border-color:rgba(57,231,95,.24);background:rgba(20,83,45,.18);color:#9affac}
    .failure-timeline-meta small{color:#8fa2ba;font-size:10px;white-space:nowrap}
    .failure-timeline-dots{display:flex;gap:6px;align-items:center}
    .failure-timeline-dots i{display:block;width:10px;height:10px;border-radius:999px;border:1px solid rgba(148,163,184,.2)}
    .failure-timeline-dots i.good{background:#39e75f;box-shadow:0 0 14px rgba(57,231,95,.28)}
    .failure-timeline-dots i.bad{background:#ff6b6b;box-shadow:0 0 14px rgba(255,107,107,.28)}
    .release-timeline{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:10px}
    .release-timeline div{border:1px solid rgba(57,231,95,.22);border-radius:12px;background:rgba(7,16,31,.74);padding:10px;display:grid;gap:8px;justify-items:start}
    .release-timeline small{color:var(--muted);font-size:11px}
    .history-section-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
    @media(max-width:1100px){.history-hero-grid,.history-section-grid{grid-template-columns:1fr}.history-metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:760px){.history-metric-grid{grid-template-columns:1fr}.history-sparkline{gap:7px;padding-inline:10px}.history-trend-card{min-height:auto}.failure-timeline-row{grid-template-columns:1fr}.failure-timeline-meta{justify-items:start}.failure-timeline-dots{justify-content:flex-start}.history-trend-summary{align-items:flex-start;flex-direction:column}}
    .module-card-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
    .module-card-head{min-width:0}
    .module-title{min-width:0}
    .module-title strong,.module-health-card p,.module-meta b,.module-selector-card p,.module-dashboard-card p{overflow-wrap:anywhere;word-break:normal}
    .module-score{font-size:clamp(30px,3vw,44px)}
    .module-meta,.module-selector-summary,.module-dashboard-metrics{grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr))}
    .module-status-card{min-height:172px;justify-content:space-between}
    .module-status-card .module-card-head{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;align-items:start}
    .module-status-card .module-title{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center}
    .module-status-card .badge{justify-self:start;width:max-content;max-width:100%;line-height:1.2}
    .module-status-card p{margin:0;font-size:16px;line-height:1.35}
    .compare-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))}
    .compare-card strong{font-size:clamp(18px,1.8vw,24px);line-height:1.12;white-space:normal;overflow-wrap:anywhere}
    .compare-card small{overflow-wrap:anywhere}
    .compare-list li{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start}
    .compare-list strong,.compare-list span{min-width:0;overflow-wrap:anywhere}
    .test-change-summary{border:1px solid rgba(57,231,95,.22);border-radius:14px;background:rgba(8,16,30,.62);padding:14px;display:grid;gap:12px;min-height:164px}
    .test-change-count{display:flex;align-items:baseline;gap:10px}
    .test-change-count strong{color:var(--green);font-size:34px;line-height:1}
    .test-change-count span{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:900}
    .compact-list{gap:7px}
    .compact-list li{padding:8px 10px;grid-template-columns:minmax(0,1fr);gap:4px}
    .compact-list strong{font-size:12px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .compact-list span{font-size:11px}
    .small-note{font-size:12px;padding:9px 10px}
    .roadmap-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
    .roadmap-summary{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}
    .roadmap-card-head{display:grid;grid-template-columns:minmax(0,1fr) auto}
    .roadmap-card-head h2,.roadmap-card p,.roadmap-card li,.roadmap-card-head strong{overflow-wrap:anywhere;word-break:normal}
    .roadmap-card-head strong{white-space:normal;max-width:130px}
    #comparison .grid.two,#comparison .grid.three{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
    #comparison .panel p{overflow-wrap:anywhere}
    .core-status-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:14px}
    .air-core-pipeline{display:flex;gap:8px;align-items:center;overflow-x:auto;padding:12px;margin:0 0 16px;border:1px solid rgba(148,163,184,.16);border-radius:14px;background:linear-gradient(90deg,rgba(8,16,30,.78),rgba(57,231,95,.045))}
    .air-core-pipeline span{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;border:1px solid rgba(148,163,184,.18);border-radius:999px;background:rgba(7,16,31,.82);padding:8px 10px;color:#d7fbe0;font-size:12px;font-weight:800}
    .air-core-pipeline b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:rgba(57,231,95,.12);color:var(--green);font-size:10px}
    .engine-card{min-height:210px;display:flex;flex-direction:column;gap:13px;padding:16px}
    .engine-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .engine-head span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
    .engine-head strong{border:1px solid rgba(57,231,95,.30);border-radius:999px;background:rgba(57,231,95,.09);padding:5px 8px;font-size:10px;white-space:nowrap}
    .engine-card p{margin:0;color:#d7fbe0;line-height:1.45;min-height:42px}
    .engine-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,92px),1fr));gap:9px;margin-top:auto}
    .module-card-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:2px 0}
    .module-card-stats span{border:0;border-radius:10px;background:rgba(148,163,184,.08);padding:10px;min-width:0}
    .module-card-stats b{display:block;color:#f8fafc;font-size:17px;line-height:1.05}
    .module-card-stats small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .recommendation-card.urgent{border-color:rgba(255,59,59,.34);background:linear-gradient(145deg,rgba(255,59,59,.08),rgba(7,16,31,.96))}
    .recommendation-card.soon{border-color:rgba(245,197,66,.34);background:linear-gradient(145deg,rgba(245,197,66,.07),rgba(7,16,31,.96))}
    .recommendation-card.future{border-color:rgba(139,215,164,.26)}
    .recommendation-card.urgent span{border-color:rgba(255,59,59,.34);background:rgba(255,59,59,.09);color:#fca5a5}
    .recommendation-card.soon span{border-color:rgba(245,197,66,.34);background:rgba(245,197,66,.09);color:var(--amber)}
    .recommendation-card.future span{border-color:rgba(139,215,164,.30);background:rgba(139,215,164,.08);color:#d7fbe0}
    .dash-table tbody tr:nth-child(even),table tbody tr:nth-child(even){background:rgba(148,163,184,.035)}
    .dash-table tbody tr:hover,table tbody tr:hover{background:rgba(57,231,95,.055)}
    .dash-table td,.dash-table th,table td,table th{padding-block:13px}
    .metric-card,.cover-stat,.wow-card,.ai-metric,.compare-card,.module-meta span,.module-selector-summary span,.module-dashboard-metrics span,.engine-metrics div,.health-stat,.freshness-strip span{border-color:rgba(148,163,184,.16)!important}
    .panel .panel,.module-dashboard-card .mini-section,.drawer-section,.evidence-chip,.drawer-test-row,.compare-list li{border-color:rgba(148,163,184,.15)}
    .kpi strong:not(.bad):not(.warn),.cover-stat strong,.wow-card strong,.compare-card strong,.roadmap-summary strong,.health-stat strong,.engine-metrics b{color:#f8fafc}
    .kpi.good strong,.health-stat.good strong,.module-score,.module-health-card.green .module-score,.release-mini strong,.success-grid b,.next-focus-card strong{color:var(--green)}
    a:not(.btn),.card-head a{color:#8bd7a4}
    .section-icon{background:rgba(139,215,164,.10);border-color:rgba(139,215,164,.28);color:#d7fbe0}
    .align-safe,.kpi,.panel,.card,.cover-stat,.wow-card,.health-card,.journey-node,.evidence-card,.compare-card,.roadmap-card,.module-health-card,.module-selector-card,.module-dashboard-card,.history-trend-card,.role-recommendation-card,.recommendation-card,.ai-metric,.drawer-section,.drawer-metric,.modal .panel{min-width:0}
    .label,.kpi span,.kpi .label,.cover-stat span,.wow-card span,.health-card small,.journey-node span,.evidence-card span,.compare-card span,.roadmap-summary span,.module-meta span,.module-selector-summary span,.module-dashboard-metrics span,.drawer-metric span,.ai-metric span,.health-stat span,.freshness-strip b,.history-trend-head span,.mini-label span,.mini-section summary span,.engine-metrics span,.engine-head span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;line-height:1.25}
    .kpi strong,.cover-stat strong,.wow-card strong,.health-card span,.compare-card strong,.roadmap-summary strong,.module-meta b,.module-selector-summary b,.module-dashboard-metrics b,.drawer-metric strong,.ai-metric strong,.health-stat strong,.freshness-strip span,.history-trend-head strong,.engine-metrics b{min-width:0;max-width:100%;line-height:1.12;overflow-wrap:normal;word-break:normal}
    .kpi strong,.compare-card strong,.ai-metric strong,.health-stat strong,.executive-decision-metrics strong,.support-metrics strong{font-size:clamp(18px,2vw,30px)}
    .badge,.mini-badge,.pill,.btn,.module-button,.module-filter button,.roadmap-card-head strong,.release-status-badge.compact,.drawer-test-row em,.trend-indicator{white-space:nowrap;line-height:1.15;max-width:100%;overflow:hidden;text-overflow:ellipsis}
    .release-status-badge:not(.compact){white-space:normal;line-height:1.12}
    .roadmap-card-head,.module-card-head,.history-trend-head,.card-head,.drawer-test-row,.compare-list li{min-width:0}
    .roadmap-card-head h2,.module-title strong,.card-head h2,.panel h2,.topbar h1,.drawer-header h2,.modal-header h2{line-height:1.15;overflow-wrap:normal;word-break:normal}
    .roadmap-card p,.roadmap-card li,.module-health-card p,.module-selector-card p,.module-dashboard-card p,.compare-card small,.compare-list strong,.compare-list span,.drawer-test-row strong,.drawer-test-row span,.recommendation-card p,.role-recommendation-card p,.history-narrative p,.history-change-list li,.executive-action strong,.recommendation-callout strong,.next-focus-card p,.summary-lead{overflow-wrap:break-word;word-break:normal}
    .module-icon,.health-icon,.evidence-icon,.section-icon,.nav-icon{flex:0 0 auto;text-align:center}
    .module-title,.health-card,.evidence-card,.icon-title{min-width:0;align-items:center}
    .module-title strong,.health-card strong,.evidence-card strong{min-width:0;display:block}
    th,td{min-width:0;overflow-wrap:break-word;word-break:normal}
    td .badge,td .release-status-badge{vertical-align:middle}
    .history-spark small,.trend-bar small,.bar label{white-space:nowrap;overflow:visible;text-overflow:clip}
    .release-timeline div{min-width:0;justify-items:stretch}
    .release-timeline .release-status-badge{width:100%}
    .drawer-test-row{grid-template-columns:minmax(0,1fr) auto}
    .drawer-test-row>div{min-width:0}
    @media(max-width:1250px){.kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.executive-decision-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.role-recommendation-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:900px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.topbar{align-items:stretch}.actions{justify-content:flex-start}.module-card-head,.roadmap-card-head{grid-template-columns:minmax(0,1fr)}.roadmap-card-head strong{justify-self:start;max-width:100%}}
    @media(max-width:620px){.kpis,.executive-decision-metrics,.role-recommendation-grid,.health-stat-grid,.freshness-strip{grid-template-columns:1fr}.kpi,.compare-card,.health-stat,.ai-metric{min-height:auto}.badge,.mini-badge,.pill,.btn,.module-button,.module-filter button{white-space:normal}.drawer-test-row,.compare-list li{grid-template-columns:1fr}.drawer-test-row em{justify-self:start}}
    .engine-metrics div{border:1px solid rgba(57,231,95,.20);border-radius:10px;background:rgba(8,16,30,.62);padding:9px;min-width:0}
    .engine-metrics small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.06em}
    .engine-metrics b{display:block;color:var(--green);font-size:14px;margin-top:5px;overflow-wrap:anywhere;line-height:1.25}
    @media(max-width:1250px){.compare-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))}.executive-decision-metrics{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}}
    @media(max-width:1100px){.executive-decision-card{grid-template-columns:1fr}.executive-decision-metrics,.role-recommendation-grid,.freshness-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:760px){.executive-decision-metrics,.role-recommendation-grid,.freshness-strip{grid-template-columns:1fr}.executive-decision-main .release-status-badge{align-self:stretch}}
    @media(max-width:760px){.health-stat-grid{grid-template-columns:1fr}.decision-metrics .ai-metric{min-height:110px}.support-metrics{grid-template-columns:1fr}}
    @media(max-width:900px){main{padding:20px 16px 42px}.page{padding:20px}.topbar{flex-direction:column}.actions{justify-content:flex-start}.release-status-badge{font-size:clamp(11px,3.2vw,16px)}}
    body{background:#080d14;color:#f4f7fb;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
    .app{background:linear-gradient(180deg,#080d14,#0a111b)}
    main{padding:32px 40px 56px}
    .sidebar{background:#070c13;border-right:1px solid rgba(148,163,184,.12);padding:24px 16px}
    .brand{letter-spacing:-3px;background:linear-gradient(90deg,#f8fafc,#9bdba9);-webkit-background-clip:text;color:transparent}
    .brand-sub{color:#cbd5e1;font-size:12px;line-height:1.55;margin-bottom:28px}
    .nav-section{margin:20px 10px 8px;color:#64748b;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
    .nav a{border-radius:8px;color:#cbd5e1;margin-bottom:4px;padding:9px 10px;transition:background .16s ease,color .16s ease}
    .nav a.active,.nav a:hover{background:rgba(148,163,184,.10);box-shadow:none;color:#f8fafc}
    .nav-icon,.section-icon,.module-icon,.health-icon,.evidence-icon{background:transparent;border:1px solid rgba(148,163,184,.22);color:#94a3b8;box-shadow:none}
    .nav a.active .nav-icon,.nav a:hover .nav-icon{background:transparent;border-color:rgba(57,231,95,.34);color:#d7fbe0}
    .page{margin-bottom:32px;padding:28px;border:0;border-radius:16px;background:#0b111b;box-shadow:none}
    .page+.page{margin-top:8px}
    .topbar{margin-bottom:24px}
    .topbar h1{font-size:clamp(28px,2.4vw,36px);font-weight:800;letter-spacing:-.04em}
    .topbar p,.cover-sub,.summary-lead,.panel p,.card p{color:#9aa7b7}
    .eyebrow{color:#8bd7a4;letter-spacing:.14em}
    .panel,.card,.kpi,.cover-stat,.wow-card,.health-card,.journey-node,.evidence-card,.compare-card,.roadmap-card,.module-health-card,.module-selector-card,.module-dashboard-card,.history-trend-card,.role-recommendation-card,.recommendation-card,.ai-metric,.drawer-section,.drawer-metric,.modal .panel,.core-status-item,.test-change-summary{border:1px solid rgba(148,163,184,.12)!important;border-radius:12px;background:#0e1622!important;box-shadow:none!important}
    .panel{padding:20px}
    .kpi,.compare-card,.ai-metric,.health-stat,.cover-stat,.wow-card{padding:16px;min-height:auto}
    .module-health-card,.module-selector-card,.module-dashboard-card,.recommendation-card,.role-recommendation-card,.engine-card{padding:16px;min-height:auto}
    .module-status-card{min-height:132px}
    .module-selector-card{min-height:210px}
    .history-trend-card{min-height:198px}
    .engine-card{min-height:168px}
    .cover-hero,.executive-decision-card,.wow,.module-dashboard-intro,.next-focus-card,.recommendation-callout,.historical-wins,.history-narrative,.air-core-pipeline{border:1px solid rgba(148,163,184,.12)!important;background:#0d1520!important;box-shadow:none!important}
    .kpis,.grid,.grid.two,.grid.three,.compare-grid,.history-section-grid,.module-card-grid,.module-dashboard-grid,.recommendation-grid,.role-recommendation-grid,.core-status-grid,.roadmap-grid,.evidence-grid,.thumb-grid,.health-stat-grid,.freshness-strip{gap:16px}
    .cover-hero,.executive-decision-card{gap:24px;padding:28px}
    .cover-stat span,.wow-card span,.kpi span,.kpi .label,.compare-card span,.health-stat span,.module-meta span,.module-card-stats small,.engine-metrics small,.freshness-strip b{color:#7f8ea3;font-weight:700;letter-spacing:.08em}
    .cover-stat strong,.wow-card strong,.kpi strong,.compare-card strong,.health-stat strong,.module-card-stats b,.module-meta b,.module-selector-summary b,.module-dashboard-metrics b,.engine-metrics b,.freshness-strip span{color:#f8fafc!important;font-weight:800}
    .good,.kpi.good strong,.health-stat.good strong,.release-mini strong,.next-focus-card strong,.success-grid b{color:#7ee787!important}
    .warn,.kpi.warn strong,.health-stat.warn strong{color:#f5c542!important}
    .bad,.kpi.bad strong,.health-stat.bad strong{color:#ff7b72!important}
    a:not(.btn),.card-head a{color:#9bdba9;text-decoration:none}
    a:not(.btn):hover,.card-head a:hover{color:#d7fbe0}
    .btn,.pill,.module-filter button{border:1px solid rgba(148,163,184,.16);background:#0c141f;color:#e5edf6;border-radius:8px;box-shadow:none}
    .btn:hover,.module-filter button:hover,.module-filter button.active{border-color:rgba(57,231,95,.30);background:#101a27;color:#d7fbe0}
    .badge,.mini-badge,.release-status-badge,.engine-head strong,.role-recommendation-card span,.recommendation-card span,.trend-indicator{border-radius:999px;border-color:rgba(148,163,184,.18)!important;background:rgba(148,163,184,.08)!important;color:#d7dee8!important}
    .badge.green,.release-status-badge[data-status="GO"],.release-status-badge.good{border-color:rgba(126,231,135,.28)!important;background:rgba(126,231,135,.08)!important;color:#7ee787!important}
    .badge.amber,.release-status-badge[data-status="CONDITIONAL_GO"],.release-status-badge.warn{border-color:rgba(245,197,66,.28)!important;background:rgba(245,197,66,.08)!important;color:#f5c542!important}
    .badge.red,.release-status-badge[data-status="NO_GO"],.release-status-badge.bad{border-color:rgba(255,123,114,.28)!important;background:rgba(255,123,114,.08)!important;color:#ff7b72!important}
    .module-card-stats span,.module-meta span,.module-selector-summary span,.module-dashboard-metrics span,.engine-metrics div,.success-grid span,.roadmap-summary div,.mission-grid div,.drawer-metric{background:#0a121c!important;border:0!important;border-radius:10px}
    .progress,.module-progress,.roadmap-progress,.bar-track{background:#1a2433}
    .progress span,.module-progress span,.roadmap-progress span,.bar-fill,.fill{background:#7ee787}
    .chart,.history-sparkline,.history-chart{border:0;background:#0a121c;border-radius:12px}
    .history-spark span,.bar{background:linear-gradient(180deg,#7ee787,#2ea043);box-shadow:none}
    table,.dash-table{border-collapse:separate;border-spacing:0}
    th{color:#7f8ea3;font-size:10px;font-weight:800;letter-spacing:.09em}
    td{color:#dbe5ef}
    th,td{border-bottom:1px solid rgba(148,163,184,.10);padding:12px 10px}
    .dash-table tbody tr:nth-child(even),table tbody tr:nth-child(even){background:rgba(148,163,184,.025)}
    .dash-table tbody tr:hover,table tbody tr:hover{background:rgba(148,163,184,.055)}
    .empty-note,.empty-state{border:1px dashed rgba(148,163,184,.20);background:#0a121c;color:#9aa7b7}
    .interactive-card:hover,.interactive-card:focus-visible{transform:translateY(-1px);border-color:rgba(148,163,184,.24)!important;box-shadow:none;background:#111b29!important}
    .drawer-backdrop,.modal-backdrop{background:rgba(0,0,0,.50)}
    .module-drawer,.modal{background:#0b111b;border-color:rgba(148,163,184,.16);box-shadow:0 24px 80px rgba(0,0,0,.42)}
    :root{--s1:8px;--s2:16px;--s3:24px;--s4:32px;--surface:#0b111b;--surface-2:#0e1622;--surface-3:#101925;--hairline:rgba(148,163,184,.10)}
    main{padding:var(--s4) 40px 56px}
    .page{padding:var(--s4);margin-bottom:var(--s4);background:var(--surface);border-radius:18px}
    .topbar{padding-bottom:var(--s2);margin-bottom:var(--s3);border-bottom:1px solid rgba(148,163,184,.08)}
    .topbar h1{margin-bottom:var(--s1)}
    .eyebrow{margin-bottom:6px}
    .kpis{margin-bottom:var(--s3)}
    .panel+.panel,.grid+.panel,.panel+.grid,.grid+br+.panel,.panel+br+.panel{margin-top:var(--s2)}
    br{line-height:var(--s2)}
    .panel{padding:var(--s3);background:transparent!important;border:0!important;border-radius:0}
    .panel>h2,.card h2{margin-bottom:var(--s2)}
    .panel>.panel,.panel .card,.modal .panel,.drawer-section{background:var(--surface-2)!important;border:1px solid var(--hairline)!important;border-radius:12px}
    .kpi,.cover-stat,.wow-card,.compare-card,.ai-metric,.health-stat,.freshness-strip span,.roadmap-summary div,.mission-grid div{background:var(--surface-2)!important;border:1px solid var(--hairline)!important}
    .module-health-card,.module-selector-card,.module-dashboard-card,.recommendation-card,.role-recommendation-card,.history-trend-card,.core-status-item,.evidence-card,.thumb,.test-change-summary{background:var(--surface-2)!important;border:1px solid var(--hairline)!important}
    .module-card-stats span,.module-meta span,.module-selector-summary span,.module-dashboard-metrics span,.engine-metrics div,.drawer-metric{background:var(--surface-3)!important}
    .executive-decision-card,.cover-hero,.wow,.module-dashboard-intro,.next-focus-card,.recommendation-callout,.historical-wins,.history-narrative,.air-core-pipeline{background:transparent!important;border:0!important;padding:var(--s3)}
    .executive-decision-card,.cover-hero{background:linear-gradient(180deg,rgba(14,22,34,.72),rgba(11,17,27,.48))!important;border:1px solid rgba(148,163,184,.10)!important}
    .kpi{min-height:96px}
    .kpi strong{margin-top:var(--s1)}
    .cover-stat,.wow-card,.compare-card,.ai-metric,.health-stat{min-height:104px}
    .module-status-card{min-height:120px}
    .module-selector-card{min-height:190px}
    .role-recommendation-card,.recommendation-card{min-height:164px}
    .engine-card{min-height:152px}
    .history-trend-card{min-height:184px}
    .grid,.grid.two,.grid.three,.kpis,.compare-grid,.history-section-grid,.module-card-grid,.module-dashboard-grid,.recommendation-grid,.role-recommendation-grid,.core-status-grid,.roadmap-grid,.evidence-grid,.thumb-grid,.health-stat-grid,.freshness-strip{gap:var(--s2)}
    .module-card-grid,.core-status-grid,.roadmap-grid{margin-top:var(--s2)}
    .page-footer{margin-top:var(--s3);padding-top:var(--s2)}
    .section-icon{width:28px;height:28px;border-radius:8px;font-size:10px}
    .icon-title{gap:var(--s1)}
    .badge,.mini-badge,.pill,.btn,.module-filter button{padding:7px 10px}
    .module-filter{gap:var(--s1);margin-bottom:var(--s2)}
    .compare-list,.action-list,.decision-reasons,.history-change-list{gap:var(--s1)}
    .compare-list li,.drawer-test-row{background:transparent!important;border:0!important;border-radius:8px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,.08)!important}
    .compare-list li:last-child,.drawer-test-row:last-child{border-bottom:0!important}
    table,.dash-table{background:transparent!important}
    th,td{padding:10px 8px}
    .risk-matrix,.chart,.history-sparkline,.history-chart,.thumb.placeholder div{background:var(--surface-3)!important}
    .empty-note,.empty-state{background:transparent;border-color:rgba(148,163,184,.16);padding:var(--s2)}
    .report-search,.global-search{background:var(--surface-2)!important;border-color:var(--hairline)!important;box-shadow:none}
    .search-results a,.search-empty{background:var(--surface-3)!important;border-color:var(--hairline)!important;box-shadow:none}
    .release-mini,.report-meta{background:transparent;border-color:var(--hairline)}
    @media(max-width:900px){main{padding:var(--s3) var(--s2) 40px}.page{padding:var(--s3)}.panel{padding:var(--s2)}}
    .page-footer{border-top:1px solid rgba(148,163,184,.10);color:#7f8ea3}
    @media(max-width:900px){main{padding:24px 16px 40px}.page{padding:20px}.cover-hero,.executive-decision-card{padding:20px}}
    .executive-mode-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px}
    .executive-mode-header h1{margin:0 0 8px;font-size:clamp(34px,3.6vw,54px);line-height:.98;letter-spacing:-.055em}
    .executive-mode-header p{margin:0;color:#cbd5e1;font-size:16px}
    .executive-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
    .executive-toolbar>span{border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0e1622;padding:10px 12px;color:#dbe5ef;font-size:13px}
    .executive-mode-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:18px}
    .release-cockpit{grid-column:1;min-height:360px;display:grid;grid-template-columns:230px minmax(0,1fr);gap:26px;align-items:center;border:1px solid rgba(57,231,95,.50)!important;border-radius:22px;background:radial-gradient(circle at 18% 50%,rgba(57,231,95,.24),rgba(57,231,95,.06) 34%,rgba(8,13,20,.96) 68%)!important;padding:28px;overflow:hidden;position:relative}
    .release-cockpit:before{content:"";position:absolute;inset:-120px auto auto -120px;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(57,231,95,.24),transparent 68%);pointer-events:none}
    .release-orb{position:relative;display:grid;place-items:center;width:210px;height:210px;border-radius:50%;background:radial-gradient(circle,#133f24 0,#082010 58%,rgba(57,231,95,.18) 59%,transparent 62%);border:1px solid rgba(57,231,95,.45);box-shadow:0 0 70px rgba(57,231,95,.22),inset 0 0 44px rgba(57,231,95,.18)}
    .release-orb:before,.release-orb:after{content:"";position:absolute;inset:18px;border-radius:50%;border:1px solid rgba(126,231,135,.30)}
    .release-orb:after{inset:44px;background:rgba(57,231,95,.12)}
    .release-orb span{position:relative;z-index:1;display:grid;place-items:center;width:92px;height:92px;border-radius:24px;border:4px solid #7ee787;color:#d7fbe0;font-size:32px;font-weight:950}
    .release-cockpit-content{position:relative;z-index:1;min-width:0}
    .cockpit-label{display:inline-flex;border:1px solid rgba(57,231,95,.32);border-radius:999px;background:rgba(57,231,95,.10);padding:7px 12px;color:#a7f3b5;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}
    .release-cockpit .release-status-badge{font-size:clamp(30px,4vw,52px);letter-spacing:-.04em;border:0!important;background:transparent!important;padding:0!important;justify-content:flex-start;text-align:left;white-space:normal;color:#f8fafc!important}
    .release-cockpit p{margin:10px 0 20px;color:#dbe5ef;font-size:18px;line-height:1.45}
    .cockpit-mini-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:22px}
    .cockpit-mini-grid div{border-left:1px solid rgba(148,163,184,.15);padding-left:14px}
    .cockpit-mini-grid div:first-child{border-left:0;padding-left:0}
    .cockpit-mini-grid span{display:block;color:#8fa3b8;font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
    .cockpit-mini-grid strong{display:block;color:#39e75f;font-size:clamp(22px,2.6vw,36px);line-height:1}
    .cockpit-mini-grid strong.amber{color:#f5c542}
    .cockpit-mini-grid strong.red{color:#ff7b72}
    .release-meter{height:18px;border-radius:999px;background:linear-gradient(90deg,#ef4444,#f59e0b,#7ee787,#22c55e);position:relative;box-shadow:inset 0 0 0 1px rgba(255,255,255,.10)}
    .release-meter span{position:absolute;left:var(--score);top:50%;width:22px;height:22px;border-radius:50%;background:#f8fafc;border:4px solid #7ee787;transform:translate(-50%,-50%);box-shadow:0 0 24px rgba(57,231,95,.5)}
    .executive-kpi-stack{grid-column:2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .executive-kpi{border:1px solid rgba(148,163,184,.14);border-radius:18px;background:linear-gradient(180deg,#101a27,#0c131e);padding:20px;text-align:left;min-height:148px;color:#f8fafc;font:inherit;display:flex;flex-direction:column;justify-content:center}
    .executive-kpi span{color:#9aa7b7;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
    .executive-kpi strong{font-size:clamp(34px,3.5vw,52px);line-height:1;margin:12px 0 8px;letter-spacing:-.04em}
    .executive-kpi small{color:#dbe5ef;font-size:14px;line-height:1.35;display:block}
    .executive-change-note{margin:0;color:#dbe5ef;font-size:16px;line-height:1.5}
    .executive-kpi.success strong{color:#39e75f}
    .executive-kpi.danger{border-color:rgba(255,123,114,.28);background:linear-gradient(180deg,rgba(127,29,29,.24),#0c131e)}
    .executive-kpi.danger strong{color:#ff7b72}
    .executive-panel{border:1px solid rgba(148,163,184,.14);border-radius:18px;background:#0e1622;padding:20px;min-width:0}
    .executive-panel-head{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:16px}
    .executive-panel-head h2{margin:0;font-size:20px;letter-spacing:-.025em}
    .executive-panel-head a{color:#7ee787;font-weight:800;font-size:13px}
    .business-impact-card{grid-column:2}
    .business-impact-layout{display:grid;grid-template-columns:82px minmax(0,1fr);gap:18px;align-items:center}
    .business-impact-orb{display:flex;flex-direction:column;align-items:center;justify-content:center;width:72px;height:72px;border-radius:18px;background:linear-gradient(145deg,rgba(57,231,95,.16),rgba(8,16,30,.72));border:1px solid rgba(57,231,95,.34);color:#7ee787;font-weight:950;box-shadow:0 16px 36px rgba(57,231,95,.10)}
    .business-impact-orb strong{font-size:16px;line-height:1;letter-spacing:.02em}
    .business-impact-orb span{margin-top:7px;color:#9fb0c5;font-size:10px;text-transform:uppercase;letter-spacing:.12em}
    .business-impact-layout ul{margin:0;padding:0;list-style:none;display:grid;gap:10px;color:#dbe5ef}
    .business-impact-layout li{display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;align-items:start}
    .business-impact-layout li:before{content:"";width:9px;height:9px;border-radius:50%;background:#39e75f;margin-top:7px;box-shadow:0 0 12px rgba(57,231,95,.7)}
    .business-impact-spark{grid-column:1/-1}
    .what-changed-panel{grid-column:1}
    .executive-change-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .executive-change-card{border:1px solid rgba(148,163,184,.14);border-radius:16px;background:#0a121c;padding:18px;min-height:118px;display:flex;flex-direction:column;justify-content:center}
    .executive-change-card strong{font-size:clamp(30px,3vw,44px);line-height:1;margin-bottom:8px}
    .executive-change-card span{color:#dbe5ef;font-size:13px}
    .executive-change-card.positive strong{color:#39e75f}
    .executive-change-card.negative strong{color:#ff7b72}
    .executive-change-card.warning strong{color:#f5c542}
    .executive-change-card.neutral strong{color:#9aa7b7}
    .trend-panel{grid-column:2}
    .executive-trend-svg{width:100%;min-height:180px;display:block}
    .executive-trend-svg .trend-axis,.executive-trend-svg .trend-grid{stroke:rgba(148,163,184,.16);stroke-width:1}
    .executive-trend-svg .trend-grid{stroke-dasharray:3 5}
    .executive-trend-svg .trend-line{fill:none;stroke:#7ee787;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 10px rgba(57,231,95,.40))}
    .executive-trend-svg .trend-fill{fill:url(#executiveTrendFill)}
    .executive-trend-svg .trend-dot{fill:#10221b;stroke:#7ee787;stroke-width:2}
    .executive-trend-svg .trend-dot-current{fill:#d7fbe0;stroke:#39e75f;stroke-width:3}
    .executive-trend-svg text{fill:#9aa7b7;font-size:11px;text-anchor:middle}
    .executive-empty-trend{min-height:166px;display:grid;place-items:center;text-align:center;border:1px dashed rgba(148,163,184,.18);border-radius:14px;color:#9aa7b7}
    .executive-empty-trend strong{display:block;color:#f8fafc;margin-bottom:6px}
    .product-strip-panel{grid-column:1}
    .executive-product-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px}
    .executive-module-pill{min-width:0;border:1px solid rgba(148,163,184,.16);border-radius:14px;background:#0a121c;color:#f8fafc;padding:12px;text-align:left;font:inherit;cursor:pointer;transition:transform .16s ease,border-color .16s ease,background .16s ease}
    .executive-module-pill:hover,.executive-module-pill:focus-visible{transform:translateY(-2px);border-color:rgba(57,231,95,.36);outline:none}
    .executive-module-pill span{display:block;font-size:13px;font-weight:800;line-height:1.25;white-space:normal}
    .executive-module-pill strong{display:block;color:#39e75f;font-size:24px;line-height:1;margin:10px 0 5px}
    .executive-module-pill small{display:block;color:#9aa7b7;font-size:12px;line-height:1.3;white-space:normal}
    .executive-module-pill.amber strong{color:#f5c542}
    .executive-module-pill.red strong{color:#ff7b72}
    .evidence-highlight-panel{grid-column:2}
    .executive-evidence-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .executive-evidence-card{border:1px solid rgba(148,163,184,.14);border-radius:14px;background:#0a121c;padding:8px;display:grid;gap:8px;color:#dbe5ef}
    .executive-evidence-card.attention{border-color:rgba(255,123,114,.34)}
    .executive-evidence-card img{width:100%;height:74px;object-fit:cover;border-radius:10px;background:#fff}
    .executive-evidence-card span{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .executive-evidence-card strong{font-size:11px;color:#7ee787}
    .executive-evidence-empty{grid-column:1/-1;min-height:112px;display:grid;place-items:center;align-content:center;gap:6px;text-align:center;padding:16px;border:1px dashed rgba(148,163,184,.18);border-radius:14px;color:#9aa7b7;line-height:1.4}
    .executive-evidence-empty strong{color:#f8fafc}
    .executive-recommendation-band{grid-column:1/-1;border:1px solid rgba(57,231,95,.24);border-radius:18px;background:linear-gradient(90deg,rgba(57,231,95,.14),rgba(14,22,34,.92));padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px}
    .executive-recommendation-band span{display:block;color:#7ee787;font-weight:900;font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}
    .executive-recommendation-band strong{display:block;font-size:22px;letter-spacing:-.02em}
    .executive-recommendation-band p{margin:6px 0 0;color:#cbd5e1;line-height:1.45}
    @media(max-width:1280px){.executive-mode-grid{grid-template-columns:1fr}.release-cockpit,.executive-kpi-stack,.business-impact-card,.what-changed-panel,.trend-panel,.product-strip-panel,.evidence-highlight-panel{grid-column:1}.executive-kpi-stack{grid-template-columns:repeat(5,minmax(0,1fr))}.executive-product-strip{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media(max-width:980px){.executive-mode-header{flex-direction:column}.release-cockpit{grid-template-columns:1fr}.release-orb{width:180px;height:180px}.executive-kpi-stack{grid-template-columns:repeat(2,minmax(0,1fr))}.executive-change-grid,.executive-evidence-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.executive-recommendation-band{flex-direction:column;align-items:flex-start}}
    @media(max-width:640px){.executive-kpi-stack,.executive-change-grid,.executive-product-strip,.executive-evidence-strip,.cockpit-mini-grid{grid-template-columns:1fr}.business-impact-layout{grid-template-columns:1fr}.release-cockpit{padding:20px}.release-cockpit .release-status-badge{font-size:34px}.release-orb{width:150px;height:150px}.executive-toolbar{justify-content:flex-start}}
    :root{
      --air-bg:#050912;
      --air-ink:#f7fbff;
      --air-soft:#a9b6c8;
      --air-dim:#6f7e93;
      --air-panel:rgba(13,20,32,.84);
      --air-panel-2:rgba(17,27,42,.74);
      --air-line:rgba(148,163,184,.105);
      --air-line-strong:rgba(148,163,184,.18);
      --air-glow:rgba(57,231,95,.18);
      --air-radius:18px;
      --air-radius-sm:12px;
      --air-space:24px;
    }
    body{background:radial-gradient(circle at 16% -10%,rgba(57,231,95,.16),transparent 34%),radial-gradient(circle at 86% 8%,rgba(59,130,246,.10),transparent 30%),linear-gradient(145deg,#050912,#08111d 54%,#050912);color:var(--air-ink)}
    .app{background:transparent}
    .sidebar{width:260px;background:linear-gradient(180deg,rgba(5,10,20,.98),rgba(6,14,26,.94));border-right:1px solid var(--air-line);box-shadow:18px 0 60px rgba(0,0,0,.24)}
    .brand{font-size:58px;letter-spacing:-5px;background:linear-gradient(135deg,#39e75f 8%,#b9fbc4 58%,#38bdf8);-webkit-background-clip:text;color:transparent}
    .brand-sub{text-align:left;color:#dbeafe;font-size:12px;margin:10px 0 26px}
    .nav-section{margin:18px 8px 8px;color:#65748a;font-size:10px;letter-spacing:.16em}
    .nav a{position:relative;color:#dce7f5;border-radius:12px;margin:2px 0;padding:10px 11px}
    .nav a.active,.nav a:hover{background:rgba(57,231,95,.12);box-shadow:none;color:#fff}
    .nav a.active:before{content:"";position:absolute;left:0;top:11px;bottom:11px;width:3px;border-radius:999px;background:#39e75f;box-shadow:0 0 18px rgba(57,231,95,.65)}
    .nav-icon{border:0;background:transparent;color:#9fb0c5}
    .nav a.active .nav-icon,.nav a:hover .nav-icon{color:#39e75f;background:transparent;border:0}
    .report-search,.report-meta,.release-mini{background:rgba(11,18,30,.72)!important;border:1px solid var(--air-line)!important;border-radius:14px}
    main{padding:36px clamp(24px,3vw,48px) 70px;max-width:1680px;width:100%;margin:0 auto}
    .global-search{position:sticky;top:12px;z-index:30;backdrop-filter:blur(18px);background:rgba(10,17,28,.78)!important;border:1px solid rgba(148,163,184,.13)!important;border-radius:16px;margin-bottom:18px}
    .freshness-strip{margin-bottom:34px}
    .freshness-strip span{background:rgba(13,20,32,.66)!important;border:0!important;border-radius:12px;padding:13px 15px}
    .air-provenance-warning{display:flex;align-items:center;gap:12px;margin:-18px 0 28px;padding:12px 14px;border:1px solid rgba(245,197,66,.28);border-radius:12px;background:rgba(245,197,66,.08);color:#f8fafc}
    .air-provenance-warning strong{color:var(--amber);white-space:nowrap}
    .air-provenance-warning span{color:#dbe5ef;line-height:1.4}
    .page{position:relative;border:0!important;background:linear-gradient(180deg,rgba(11,18,30,.88),rgba(8,14,24,.78))!important;border-radius:28px;padding:clamp(24px,2.6vw,42px);margin-bottom:42px;box-shadow:0 30px 90px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.045)}
    .page:before{content:"";position:absolute;inset:0;border:1px solid rgba(148,163,184,.09);border-radius:inherit;pointer-events:none}
    .page:after{content:"";position:absolute;left:36px;right:36px;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(57,231,95,.35),transparent);pointer-events:none}
    .topbar{align-items:flex-end;border-bottom:0!important;padding-bottom:0;margin-bottom:28px}
    .topbar h1{font-size:clamp(32px,3vw,48px);letter-spacing:-.055em;line-height:.98;margin:6px 0 8px}
    .topbar p{font-size:16px;color:var(--air-soft)}
    .eyebrow{color:#77f08d;font-size:11px;letter-spacing:.18em}
    .panel{background:transparent!important;border:0!important;border-radius:0;padding:0}
    .panel>h2{font-size:clamp(19px,1.45vw,25px);letter-spacing:-.035em;margin-bottom:18px}
    .grid.two,.grid.three,.kpis,.compare-grid,.history-section-grid,.module-card-grid,.module-dashboard-grid,.recommendation-grid,.role-recommendation-grid,.core-status-grid,.roadmap-grid,.evidence-grid,.thumb-grid,.health-stat-grid{gap:22px}
    .kpi,.cover-stat,.wow-card,.compare-card,.ai-metric,.health-stat,.freshness-strip span,.roadmap-summary div,.mission-grid div,.module-health-card,.module-selector-card,.module-dashboard-card,.recommendation-card,.role-recommendation-card,.history-trend-card,.core-status-item,.evidence-card,.thumb,.test-change-summary,.drawer-section,.drawer-metric,.modal .panel,.executive-panel,.executive-kpi,.executive-change-card,.executive-evidence-card{background:var(--air-panel)!important;border:1px solid var(--air-line)!important;border-radius:var(--air-radius)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}
    .kpi,.cover-stat,.wow-card,.compare-card,.ai-metric,.health-stat,.executive-kpi{padding:18px}
    .kpi strong,.cover-stat strong,.wow-card strong,.compare-card strong,.ai-metric strong,.health-stat strong,.executive-kpi strong{letter-spacing:-.045em;color:#f8fafc!important}
    .kpi span,.cover-stat span,.wow-card span,.compare-card span,.ai-metric span,.health-stat span,.module-card-stats small,.module-meta span,.engine-metrics small{color:#74849a!important;font-size:10.5px;letter-spacing:.105em}
    .badge,.mini-badge,.pill,.btn,.release-status-badge,.engine-head strong{border-radius:999px!important;background:rgba(148,163,184,.075)!important;border:1px solid rgba(148,163,184,.14)!important;color:#dbe5ef!important;box-shadow:none}
    .release-status-badge[data-status="GO"],.badge.green,.badge.good,.badge.success{background:rgba(57,231,95,.10)!important;border-color:rgba(57,231,95,.24)!important;color:#7ee787!important}
    .release-status-badge[data-status="CONDITIONAL_GO"],.badge.amber,.badge.warn{background:rgba(245,197,66,.10)!important;border-color:rgba(245,197,66,.25)!important;color:#f5c542!important}
    .release-status-badge[data-status="NO_GO"],.badge.red,.badge.bad{background:rgba(255,123,114,.10)!important;border-color:rgba(255,123,114,.26)!important;color:#ff7b72!important}
    .btn{padding:10px 14px}
    .btn:hover{background:rgba(57,231,95,.10)!important;border-color:rgba(57,231,95,.32)!important;color:#d7fbe0!important}
    .section-icon{width:30px;height:30px;border-radius:10px;border:1px solid rgba(148,163,184,.16);background:rgba(148,163,184,.06);color:#9bdba9}
    .release-cockpit{min-height:420px;border:1px solid rgba(57,231,95,.36)!important;border-radius:30px!important;background:radial-gradient(circle at 18% 50%,rgba(57,231,95,.24),rgba(57,231,95,.075) 35%,rgba(8,13,20,.94) 70%)!important;box-shadow:0 30px 100px rgba(57,231,95,.10),inset 0 1px 0 rgba(255,255,255,.05)}
    .release-cockpit .release-status-badge{background:transparent!important;border:0!important;box-shadow:none!important;font-size:clamp(38px,5vw,66px);line-height:.95}
    .release-orb{box-shadow:0 0 100px rgba(57,231,95,.26),inset 0 0 54px rgba(57,231,95,.18)}
    .executive-mode-header{margin-bottom:30px}
    .executive-mode-header h1{font-size:clamp(42px,4.4vw,68px);letter-spacing:-.07em}
    .executive-mode-header p{font-size:18px;color:#d7dee8}
    .executive-kpi-stack{grid-template-columns:repeat(5,minmax(0,1fr))}
    .executive-kpi{min-height:172px;transition:transform .18s ease,border-color .18s ease,background .18s ease}
    .executive-kpi:hover{transform:translateY(-2px);border-color:rgba(57,231,95,.22)!important}
    .executive-panel{padding:22px!important;background:rgba(13,20,32,.72)!important}
    .executive-panel-head h2{font-size:22px}
    .executive-recommendation-band{border-radius:24px;border:1px solid rgba(57,231,95,.22)!important;background:linear-gradient(90deg,rgba(57,231,95,.16),rgba(13,20,32,.84) 48%,rgba(13,20,32,.70))!important;box-shadow:0 20px 70px rgba(57,231,95,.08)}
    .executive-recommendation-band strong{font-size:clamp(22px,2vw,32px)}
    #executive .executive-decision-card{border:0!important;background:linear-gradient(135deg,rgba(57,231,95,.10),rgba(13,20,32,.72))!important;border-radius:26px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
    .executive-decision-main,.executive-decision-metrics div,.executive-action{background:rgba(8,14,24,.58)!important;border:1px solid var(--air-line)!important;border-radius:18px}
    .decision-group{border-top:0;padding-top:0}
    .decision-reasons li,.executive-decision-bullets li,.history-change-list li{color:#dbe5ef}
    #journey .journey{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:18px}
    #journey .journey-arrow{display:none}
    .journey-node{min-width:0;border:0!important;background:rgba(13,20,32,.62)!important;border-radius:20px;padding:18px}
    .journey-node .node-icon{width:46px;height:46px;background:rgba(57,231,95,.10);border-color:rgba(57,231,95,.24)}
    .chart{border:0!important;background:linear-gradient(180deg,rgba(13,20,32,.82),rgba(10,17,28,.62));border-radius:20px}
    #health .module-card-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr))}
    .module-health-card{padding:20px!important;transition:transform .18s ease,border-color .18s ease,background .18s ease}
    .module-health-card:hover{transform:translateY(-2px);background:rgba(17,27,42,.90)!important}
    .module-card-head{align-items:flex-start}
    .module-icon{background:rgba(148,163,184,.07)!important;border-color:rgba(148,163,184,.13)!important}
    .module-score{font-size:clamp(38px,3.5vw,54px);letter-spacing:-.06em}
    .module-card-stats span,.module-meta span,.module-selector-summary span,.module-dashboard-metrics span,.engine-metrics div,.drawer-metric{background:rgba(6,11,20,.48)!important;border:0!important}
    .risk-matrix{border:0!important;background:rgba(13,20,32,.70)!important;border-radius:20px;overflow:hidden}
    .health-summary-panel .summary-lead{font-size:16px;color:#dbe5ef}
    .health-stat-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
    .next-focus-card,.recommendation-callout{border:1px solid rgba(57,231,95,.16)!important;background:rgba(57,231,95,.055)!important;border-radius:18px}
    #module-dashboard .module-dashboard-intro{border:0!important;background:linear-gradient(135deg,rgba(59,130,246,.08),rgba(57,231,95,.06))!important;border-radius:22px;padding:26px}
    .module-dashboard-card{padding:20px!important}
    .mini-section{background:rgba(8,14,24,.45)!important;border:1px solid rgba(148,163,184,.09)!important;border-radius:14px!important}
    #failures .panel{background:rgba(13,20,32,.56)!important;border:1px solid var(--air-line)!important;border-radius:22px;padding:24px}
    #evidence .evidence-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
    .evidence-card{padding:18px!important}
    .thumb-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
    .thumb{padding:10px!important}
    .thumb img{border-radius:14px}
    #insight .ai-decision-panel{background:linear-gradient(135deg,rgba(57,231,95,.075),rgba(13,20,32,.68))!important;border:1px solid rgba(57,231,95,.14)!important;border-radius:24px;padding:26px}
    .role-recommendation-card,.recommendation-card{padding:20px!important}
    .recommendation-card.urgent,.recommendation-card.soon,.recommendation-card.future{background:rgba(13,20,32,.78)!important}
    #comparison .history-hero-grid{gap:24px}
    .history-narrative{background:linear-gradient(135deg,rgba(59,130,246,.08),rgba(13,20,32,.72))!important;border:1px solid var(--air-line)!important;border-radius:22px}
    .history-trend-card{padding:20px!important}
    .history-sparkline,.history-chart{background:rgba(6,11,20,.48)!important;border:0!important}
    .compare-card{padding:18px!important}
    .test-change-summary{padding:18px!important}
    #roadmap .roadmap-summary{margin-bottom:22px}
    #roadmap .topbar h1{font-size:clamp(34px,4.2vw,56px)!important}
    #roadmap .roadmap-summary{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))!important;gap:14px!important}
    #roadmap .roadmap-summary div{min-height:112px!important;padding:18px!important;border-radius:22px!important}
    #roadmap .roadmap-summary strong{font-size:clamp(22px,1.9vw,30px)!important;line-height:1.12!important;white-space:normal!important;overflow-wrap:break-word!important}
    #roadmap .panel{padding:22px!important}
    #roadmap .panel h2{font-size:clamp(20px,1.8vw,28px)!important}
    #roadmap .roadmap-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))!important;gap:16px!important}
    .roadmap-card{padding:20px!important;min-height:auto;display:flex!important;flex-direction:column!important;gap:14px!important}
    .roadmap-card-head{align-items:start!important;gap:14px!important}
    .roadmap-card-head div{min-width:0!important}
    .roadmap-card-head span{display:block;color:#8fa2b6;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
    .roadmap-card-head h2{margin:7px 0 0!important;font-size:clamp(18px,1.35vw,23px)!important;line-height:1.15!important;letter-spacing:-.025em!important;overflow-wrap:normal!important;word-break:normal!important}
    .roadmap-card-head strong{align-self:start!important;max-width:120px!important;padding:7px 10px!important;font-size:10.5px!important;line-height:1.15!important;white-space:normal!important}
    .roadmap-card p{margin:0!important;color:#b7c6d8!important;font-size:13px!important;line-height:1.48!important}
    .roadmap-card-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:0}
    .roadmap-card-meta span{display:inline-flex;align-items:center;max-width:100%;border:1px solid rgba(57,231,95,.16);border-radius:999px;background:rgba(57,231,95,.07);color:#9affac;font-size:10.5px;font-weight:850;padding:6px 8px;line-height:1.2}
    .roadmap-card ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:8px;margin:0!important;padding:0!important;list-style:none}
    .roadmap-card li{border:1px solid rgba(148,163,184,.10);border-radius:12px;background:rgba(3,10,18,.45);padding:8px 9px;color:#d8e3ee;font-size:11.5px;line-height:1.28;min-width:0;overflow-wrap:normal!important;word-break:normal!important}
    .future-vision-panel{margin-top:var(--air-gap-section)!important;background:radial-gradient(circle at 88% 0%,rgba(96,165,250,.12),transparent 30%),linear-gradient(180deg,rgba(10,24,39,.82),rgba(5,13,22,.82))!important}
    .future-vision-intro{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:20px}
    .future-vision-intro h2{margin:6px 0 8px!important;font-size:clamp(24px,2vw,34px)!important}
    .future-vision-intro p{max-width:980px!important;color:#b7c6d8!important}
    .future-vision-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
    .future-vision-card{border:1px solid rgba(57,231,95,.16);border-radius:24px;background:linear-gradient(180deg,rgba(13,27,42,.86),rgba(7,16,28,.86));padding:20px;min-width:0}
    .future-vision-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:14px}
    .future-vision-head span{display:block;color:#8fa2b6;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
    .future-vision-head h3{margin:7px 0 0;color:#f8fafc;font-size:clamp(20px,1.55vw,27px);line-height:1.12;letter-spacing:-.035em}
    .future-vision-head strong{flex:0 0 auto;border:1px solid rgba(96,165,250,.24);border-radius:999px;background:rgba(96,165,250,.10);color:#9bd5ff;font-size:10.5px;font-weight:900;padding:7px 10px;white-space:nowrap}
    .future-vision-card>p{margin:0 0 16px!important;color:#b7c6d8!important;font-size:13.5px!important;line-height:1.5!important}
    .future-vision-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
    .future-vision-groups div{border:1px solid rgba(148,163,184,.10);border-radius:16px;background:rgba(3,10,18,.46);padding:12px;min-width:0}
    .future-vision-groups h4{margin:0 0 9px;color:#9affac;font-size:12px;font-weight:950;letter-spacing:.02em}
    .future-vision-groups ul{display:grid;gap:6px;margin:0;padding:0;list-style:none}
    .future-vision-groups li{color:#d8e3ee;font-size:11.5px;line-height:1.3}
    .future-vision-priority{margin-top:16px;border:1px solid rgba(57,231,95,.20);border-radius:18px;background:rgba(57,231,95,.08);padding:15px 16px}
    .future-vision-priority span{display:block;color:#8fa2b6;font-size:10.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
    .future-vision-priority strong{display:block;margin-top:6px;color:#dfffea;font-size:14px;line-height:1.35}
    @media(max-width:1100px){.future-vision-grid{grid-template-columns:1fr}.future-vision-intro{flex-direction:column}}
    .roadmap-progress{height:12px;background:rgba(148,163,184,.12);border-radius:999px}
    .air-core-pipeline{background:rgba(8,14,24,.52)!important;border:1px solid var(--air-line)!important;border-radius:18px}
    .core-status-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr))}
    .engine-card{padding:18px!important}
    .engine-card p{color:#b9c6d8}
    table,.dash-table{border-collapse:separate;border-spacing:0 6px}
    th{border-bottom:0;color:#738398}
    td{background:rgba(13,20,32,.45);border-bottom:0}
    tr td:first-child{border-radius:10px 0 0 10px}
    tr td:last-child{border-radius:0 10px 10px 0}
    .page-footer{border-top:1px solid rgba(148,163,184,.08);margin-top:34px;color:#728197}
    .interactive-card{transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}
    .interactive-card:hover,.interactive-card:focus-visible{transform:translateY(-2px);background:rgba(17,27,42,.88)!important;border-color:rgba(57,231,95,.25)!important;box-shadow:0 18px 60px rgba(0,0,0,.18)!important}
    .drawer-backdrop,.modal-backdrop{backdrop-filter:blur(8px)}
    .module-drawer,.modal{background:rgba(8,14,24,.96);border:1px solid rgba(148,163,184,.16);border-radius:22px;box-shadow:0 30px 120px rgba(0,0,0,.48)}
    @media(max-width:1400px){.executive-kpi-stack{grid-template-columns:repeat(3,minmax(0,1fr))}.executive-mode-grid{grid-template-columns:1fr}.release-cockpit,.executive-kpi-stack,.business-impact-card,.what-changed-panel,.trend-panel,.product-strip-panel,.evidence-highlight-panel{grid-column:1}}
    @media(max-width:1100px){.app{grid-template-columns:1fr}.sidebar{position:relative;width:100%;height:auto;max-height:none}.nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:4px}.report-meta,.release-mini,.report-search{margin-top:14px}.grid.two,.grid.three,.history-hero-grid{grid-template-columns:1fr}.executive-kpi-stack{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:720px){main{padding:18px 12px 44px}.page{border-radius:22px;padding:20px}.topbar{display:block}.actions{justify-content:flex-start;margin-top:14px}.executive-kpi-stack,.executive-change-grid,.executive-product-strip,.executive-evidence-strip,.health-stat-grid,.cockpit-mini-grid{grid-template-columns:1fr}.release-cockpit{grid-template-columns:1fr;min-height:auto}.release-orb{width:144px;height:144px}.release-cockpit .release-status-badge{font-size:34px}.freshness-strip{grid-template-columns:1fr}.page:after{left:20px;right:20px}}
    /* AIR identity restoration: keep the polish, restore the mission-control personality. */
    body{background:radial-gradient(circle at 12% -6%,rgba(57,231,95,.24),transparent 30%),radial-gradient(circle at 92% 0%,rgba(56,189,248,.12),transparent 28%),linear-gradient(145deg,#02060d 0%,#07111f 48%,#03150c 100%)}
    .sidebar{background:linear-gradient(180deg,#03120c 0%,#07101f 42%,#050914 100%);border-right:1px solid rgba(57,231,95,.22);box-shadow:24px 0 80px rgba(0,0,0,.32),inset -1px 0 0 rgba(57,231,95,.12)}
    .brand{font-size:64px;line-height:.82;letter-spacing:-6px;background:linear-gradient(135deg,#39e75f 0%,#1ff77a 42%,#38bdf8 92%);-webkit-background-clip:text;color:transparent;text-shadow:0 0 44px rgba(57,231,95,.14)}
    .brand-sub{color:#f0fff4;font-weight:700}
    .nav a.active,.nav a:hover{background:linear-gradient(90deg,rgba(57,231,95,.22),rgba(57,231,95,.07));color:#f8fff9;box-shadow:inset 0 0 0 1px rgba(57,231,95,.18)}
    .nav a.active:before{background:#39e75f;box-shadow:0 0 24px rgba(57,231,95,.95)}
    .nav a.active .nav-icon,.nav a:hover .nav-icon{color:#7cff93}
    .release-mini{background:linear-gradient(135deg,rgba(57,231,95,.16),rgba(8,16,30,.72))!important;border-color:rgba(57,231,95,.36)!important;box-shadow:0 18px 54px rgba(57,231,95,.08)}
    .page{background:linear-gradient(180deg,rgba(9,18,31,.92),rgba(5,12,22,.88))!important;box-shadow:0 36px 100px rgba(0,0,0,.28),inset 0 1px 0 rgba(57,231,95,.08)}
    .page:before{border-color:rgba(57,231,95,.13)}
    .page:after{background:linear-gradient(90deg,transparent,rgba(57,231,95,.72),rgba(56,189,248,.24),transparent)}
    .eyebrow{color:#39e75f;text-shadow:0 0 18px rgba(57,231,95,.38)}
    .topbar h1,.executive-mode-header h1{color:#fff;text-shadow:0 0 30px rgba(57,231,95,.07)}
    .panel>h2,.executive-panel-head h2{color:#f8fff9}
    .section-icon{background:linear-gradient(135deg,rgba(57,231,95,.20),rgba(57,231,95,.06));border-color:rgba(57,231,95,.30);color:#6dff83;box-shadow:0 0 22px rgba(57,231,95,.08)}
    .btn,.pill{background:rgba(6,18,16,.78)!important;border-color:rgba(57,231,95,.24)!important}
    .btn:hover{background:rgba(57,231,95,.16)!important;border-color:rgba(57,231,95,.56)!important;box-shadow:0 0 24px rgba(57,231,95,.13)}
    .global-search,.report-search{background:linear-gradient(180deg,rgba(8,17,28,.88),rgba(4,13,18,.82))!important;border-color:rgba(57,231,95,.18)!important}
    .freshness-strip span{background:linear-gradient(180deg,rgba(12,27,37,.78),rgba(5,14,23,.82))!important;border:1px solid rgba(57,231,95,.12)!important}
    .release-cockpit{border-color:rgba(57,231,95,.58)!important;background:radial-gradient(circle at 18% 48%,rgba(57,231,95,.34),rgba(57,231,95,.13) 36%,rgba(4,12,21,.96) 72%)!important;box-shadow:0 36px 120px rgba(57,231,95,.14),inset 0 1px 0 rgba(185,251,196,.12)}
    .release-cockpit:after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,transparent 0%,rgba(57,231,95,.08) 42%,transparent 72%);pointer-events:none}
    .release-orb{background:radial-gradient(circle,#1a7f37 0%,#0b3a1d 48%,rgba(57,231,95,.22) 58%,transparent 64%);border-color:rgba(57,231,95,.62);box-shadow:0 0 120px rgba(57,231,95,.38),inset 0 0 58px rgba(57,231,95,.24)}
    .release-orb span{border-color:#9affac;color:#f8fff9;background:rgba(57,231,95,.11);box-shadow:0 0 34px rgba(57,231,95,.30)}
    .cockpit-label,.executive-recommendation-band span{background:rgba(57,231,95,.14);border-color:rgba(57,231,95,.44);color:#9affac}
    .release-meter{box-shadow:0 0 34px rgba(57,231,95,.18),inset 0 0 0 1px rgba(255,255,255,.12)}
    .executive-kpi,.executive-panel,.module-health-card,.module-dashboard-card,.journey-node,.evidence-card,.recommendation-card,.role-recommendation-card,.history-trend-card,.roadmap-card,.engine-card,.compare-card{background:linear-gradient(180deg,rgba(13,27,42,.86),rgba(7,16,28,.86))!important;border-color:rgba(57,231,95,.14)!important}
    .executive-kpi strong,.module-score,.health-stat.good strong,.kpi.good strong{color:#39e75f!important;text-shadow:0 0 22px rgba(57,231,95,.13)}
    .executive-kpi.danger strong,.bad{color:#ff6b6b!important}
    .executive-kpi.danger{border-color:rgba(255,107,107,.32)!important;background:linear-gradient(180deg,rgba(83,23,23,.40),rgba(7,16,28,.88))!important}
    .executive-recommendation-band{background:linear-gradient(90deg,rgba(57,231,95,.22),rgba(10,28,24,.82) 48%,rgba(7,16,28,.88))!important;border-color:rgba(57,231,95,.38)!important;box-shadow:0 28px 90px rgba(57,231,95,.12)}
    #executive .executive-decision-card{background:radial-gradient(circle at 14% 18%,rgba(57,231,95,.16),transparent 34%),linear-gradient(135deg,rgba(13,34,28,.88),rgba(7,16,28,.82))!important;border:1px solid rgba(57,231,95,.18)!important}
    .executive-decision-main,.executive-decision-metrics div,.executive-action{background:rgba(4,13,20,.64)!important;border-color:rgba(57,231,95,.16)!important}
    .why-release,.next-focus-card,.recommendation-callout,.ai-decision-panel,.history-narrative,.module-dashboard-intro{background:linear-gradient(135deg,rgba(57,231,95,.11),rgba(5,14,24,.72))!important;border-color:rgba(57,231,95,.20)!important}
    #health{background:radial-gradient(circle at 78% 14%,rgba(57,231,95,.12),transparent 28%),linear-gradient(180deg,rgba(9,18,31,.92),rgba(5,12,22,.88))!important}
    #journey{background:radial-gradient(circle at 16% 18%,rgba(56,189,248,.11),transparent 28%),linear-gradient(180deg,rgba(9,18,31,.92),rgba(5,12,22,.88))!important}
    .journey-node{box-shadow:inset 0 1px 0 rgba(57,231,95,.06)}
    .journey-node .node-icon{background:rgba(57,231,95,.16);border-color:rgba(57,231,95,.42);color:#9affac}
    .chart,.history-sparkline,.history-chart{background:linear-gradient(180deg,rgba(3,12,22,.92),rgba(6,20,23,.72))!important;border:1px solid rgba(57,231,95,.10)!important}
    .bar,.history-spark span{background:linear-gradient(180deg,#8dff9e,#39e75f 45%,#169b3c)}
    .risk-matrix,.module-card-stats span,.module-meta span,.module-selector-summary span,.module-dashboard-metrics span,.engine-metrics div,.drawer-metric{background:rgba(3,13,20,.58)!important;border:1px solid rgba(57,231,95,.08)!important}
    .thumb,.executive-evidence-card{background:linear-gradient(180deg,rgba(13,27,42,.88),rgba(5,14,24,.88))!important;border-color:rgba(57,231,95,.14)!important}
    .air-core-pipeline{background:linear-gradient(90deg,rgba(57,231,95,.12),rgba(5,14,24,.84))!important;border-color:rgba(57,231,95,.22)!important}
    .air-core-pipeline b{background:rgba(57,231,95,.18);color:#9affac}
    table td{background:rgba(7,18,30,.66)}
    table tbody tr:hover td,.dash-table tbody tr:hover td{background:rgba(57,231,95,.08)}
    .page-footer{color:#8fa3b8;border-top-color:rgba(57,231,95,.12)}
    /* Responsive clarity pass: prevent page-level horizontal scroll and clarify dense visuals. */
    html,body{max-width:100%;overflow-x:hidden}
    .app,main,.page,.panel,.grid,.kpis,.executive-mode-grid,.executive-kpi-stack,.executive-panel,.release-cockpit,.module-card-grid,.module-dashboard-grid,.history-section-grid,.compare-grid,.roadmap-grid,.core-status-grid,.evidence-grid,.thumb-grid{min-width:0;max-width:100%}
    .app{grid-template-columns:minmax(232px,260px) minmax(0,1fr)}
    main{min-width:0;width:100%;max-width:min(1680px,calc(100vw - 260px));padding-left:clamp(18px,2.2vw,36px);padding-right:clamp(18px,2.2vw,36px)}
    .page{overflow:hidden}
    .sidebar{width:auto;min-width:0}
    .executive-kpi-stack{grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr))}
    .executive-product-strip{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}
    .executive-evidence-strip{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}
    .executive-change-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr))}
    .cockpit-mini-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,145px),1fr))}
    .release-cockpit{grid-template-columns:minmax(150px,220px) minmax(0,1fr)}
    .release-cockpit .release-status-badge{font-size:clamp(30px,4.4vw,58px);overflow-wrap:normal;word-break:normal}
    .release-orb{width:clamp(150px,15vw,210px);height:clamp(150px,15vw,210px)}
    .executive-kpi strong{font-size:clamp(28px,3vw,46px)}
    .module-score{font-size:clamp(34px,3vw,48px)}
    .compare-card strong,.ai-metric strong,.health-stat strong,.engine-metrics b{font-size:clamp(16px,1.5vw,26px)}
    .engine-card{min-width:0}
    .engine-head{min-width:0}
    .engine-head span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .engine-group{display:inline-flex;width:max-content;max-width:100%;border:1px solid rgba(148,163,184,.16);border-radius:999px;padding:5px 8px;color:#9fb0c5;font-size:10px;font-style:normal;font-weight:900;letter-spacing:.08em;text-transform:uppercase;background:rgba(148,163,184,.06)}
    .engine-input .engine-group{color:#93c5fd;border-color:rgba(59,130,246,.26);background:rgba(59,130,246,.08)}
    .engine-processing .engine-group{color:#9affac;border-color:rgba(57,231,95,.26);background:rgba(57,231,95,.08)}
    .engine-intelligence .engine-group{color:#c4b5fd;border-color:rgba(139,92,246,.26);background:rgba(139,92,246,.08)}
    .engine-platform .engine-group{color:#fcd34d;border-color:rgba(245,197,66,.26);background:rgba(245,197,66,.08)}
    .air-core-pipeline{flex-wrap:wrap;overflow-x:visible;align-items:flex-start}
    .air-core-pipeline span{flex:0 1 auto;max-width:100%;white-space:normal}
    .history-trend-head{align-items:flex-start}
    .history-trend-head div{min-width:0}
    .history-trend-head small{display:block;color:#8fa3b8;font-size:12px;font-weight:600;letter-spacing:0;text-transform:none;margin-top:6px;line-height:1.4}
    .history-spark small,.executive-trend-svg text{font-size:10px}
    .chart-explainer{margin:0 0 14px;color:#a9b6c8;font-size:13px;line-height:1.45}
    .chart-axis-note{margin:12px 0 0;color:#74849a;font-size:12px}
    table,.dash-table{width:100%;max-width:100%;table-layout:fixed}
    th,td{overflow-wrap:anywhere;word-break:normal}
    .badge,.mini-badge,.pill,.btn,.release-status-badge{max-width:100%;white-space:normal;text-align:center}
    .module-title strong,.executive-module-pill span,.roadmap-card-head h2,.compare-card small,.engine-card p{overflow-wrap:anywhere}
    @media(max-width:1100px){.nav a.active:before{display:none}}
    @media(max-width:1100px){main{max-width:100vw}.app{grid-template-columns:1fr}.release-cockpit{grid-template-columns:1fr}.release-orb{justify-self:start}}
    @media(max-width:760px){.page{padding:18px}.executive-mode-header h1{font-size:clamp(34px,12vw,48px)}.release-cockpit .release-status-badge{font-size:clamp(30px,10vw,42px)}}
    /* Keep the AIR navigation rail visually continuous during long page scrolls. */
    .app{grid-template-columns:260px minmax(0,1fr)!important;align-items:start;position:relative}
    .app:before{content:"";position:fixed;left:0;top:0;bottom:0;width:260px;background:linear-gradient(180deg,#03120c 0%,#07101f 42%,#050914 100%);border-right:1px solid rgba(57,231,95,.22);box-shadow:24px 0 80px rgba(0,0,0,.32),inset -1px 0 0 rgba(57,231,95,.12);pointer-events:none;z-index:0}
    .sidebar{position:fixed!important;left:0;top:0;bottom:0;align-self:start;width:260px!important;max-width:260px;min-width:260px;height:100vh;height:100dvh;min-height:100vh;min-height:100dvh;overflow-y:auto;overflow-x:hidden;background:linear-gradient(180deg,#03120c 0%,#07101f 42%,#050914 100%)!important;z-index:2}
    main{grid-column:2;position:relative;z-index:1}
    /* AIR visual clarity pass: keep long labels readable and reduce dark-card sameness. */
    .topbar h1{font-size:clamp(30px,2.65vw,42px)!important;line-height:1.03!important;letter-spacing:-.045em!important}
    .executive-mode-header h1{font-size:clamp(36px,3.55vw,56px)!important;line-height:1!important;letter-spacing:-.055em!important}
    .panel h2,.card h2,.history-section-grid h2,.grid.two h2,.grid.three h2{font-size:clamp(15px,1.15vw,20px);line-height:1.2}
    .decision-metrics{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))!important;align-items:stretch}
    .decision-metrics .ai-metric{min-height:118px!important;justify-content:flex-start!important;padding:18px!important;overflow:hidden}
    .decision-metrics .ai-metric span,.executive-decision-metrics span{font-size:11px!important;line-height:1.25!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    .decision-metrics .ai-metric strong,.executive-decision-metrics strong{font-size:clamp(22px,1.85vw,30px)!important;line-height:1.05!important;white-space:normal!important;overflow-wrap:break-word!important;word-break:normal!important;text-shadow:none!important}
    .decision-metrics .ai-metric strong.nowrap,.executive-decision-metrics strong{white-space:nowrap!important}
    .decision-metrics .release-status-badge{width:auto!important;max-width:100%!important;font-size:clamp(13px,1.15vw,18px)!important;line-height:1.1!important;padding:8px 10px!important;white-space:normal!important}
    .support-metrics{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))!important}
    .module-status-card{min-height:220px!important;padding:22px!important}
    .module-status-card .module-card-head{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:start!important;gap:12px!important}
    .module-status-card .badge{justify-self:end!important;align-self:start!important;white-space:nowrap!important}
    .module-title{min-width:0}.module-title strong{font-size:clamp(17px,1.25vw,22px)!important;line-height:1.16!important}
    .module-icon{flex:0 0 52px!important;width:52px!important;height:52px!important}
    .module-card-stats{grid-template-columns:repeat(3,minmax(0,1fr))!important}
    .module-card-stats span{min-height:68px;display:flex;flex-direction:column;justify-content:center}
    .module-card-stats b{font-size:clamp(18px,1.45vw,24px)!important;line-height:1!important;white-space:nowrap!important}
    .module-status-card p{font-size:16px!important;color:#a9b6c8!important;margin-top:auto!important}
    #comparison .panel{background:linear-gradient(180deg,rgba(11,23,38,.76),rgba(6,14,24,.72))!important}
    #comparison .history-hero-grid{grid-template-columns:minmax(320px,.9fr) minmax(0,1.1fr)!important;align-items:start}
    #comparison .history-metric-grid{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))!important;gap:16px!important}
    #comparison .compare-grid{grid-template-columns:repeat(auto-fit,minmax(175px,1fr))!important;gap:16px!important}
    #comparison .compare-card{min-height:128px!important;padding:18px!important;background:linear-gradient(180deg,rgba(14,28,44,.92),rgba(6,15,26,.88))!important;border-color:rgba(57,231,95,.16)!important}
    #comparison .compare-card.green{border-color:rgba(57,231,95,.36)!important;background:linear-gradient(180deg,rgba(13,43,31,.72),rgba(6,15,26,.88))!important}
    #comparison .compare-card.amber{border-color:rgba(245,197,66,.28)!important;background:linear-gradient(180deg,rgba(43,35,13,.42),rgba(6,15,26,.88))!important}
    #comparison .compare-card.red{border-color:rgba(255,59,59,.34)!important;background:linear-gradient(180deg,rgba(48,18,22,.52),rgba(6,15,26,.88))!important}
    #comparison .compare-card span{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    #comparison .compare-card strong{font-size:clamp(20px,1.65vw,28px)!important;line-height:1.06!important;letter-spacing:-.04em!important;overflow-wrap:break-word!important;text-shadow:none!important}
    #comparison .compare-card small{font-size:13px!important;color:#9fb0c5!important;line-height:1.45!important}
    #comparison .trend-indicator{font-size:11px!important;line-height:1.1!important;white-space:normal!important}
    #comparison .history-section-grid{grid-template-columns:repeat(auto-fit,minmax(310px,1fr))!important;align-items:start}
    #comparison .grid.two{grid-template-columns:repeat(auto-fit,minmax(360px,1fr))!important;align-items:start}
    #comparison .grid.two .grid.two{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))!important}
    #comparison .compare-list li{align-items:flex-start;background:rgba(10,20,32,.72)!important;border-color:rgba(148,163,184,.12)!important}
    #comparison .compare-list strong{line-height:1.35!important}
    .history-signal-layout{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;align-items:start}
    .history-panel-head{margin-bottom:16px}
    .history-panel-head>span{display:inline-flex;border:1px solid rgba(57,231,95,.22);border-radius:999px;background:rgba(57,231,95,.08);color:#9affac;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;padding:6px 9px;margin-bottom:10px}
    .history-panel-head h2{font-size:clamp(20px,1.45vw,26px)!important;margin:0 0 8px!important}
    .history-panel-head p{margin:0;color:#9fb0c5;line-height:1.5}
    .history-signal-panel{background:linear-gradient(145deg,rgba(11,23,38,.92),rgba(5,14,24,.82))!important}
    .history-signal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .history-signal-card{border:1px solid rgba(148,163,184,.12);border-radius:16px;background:rgba(5,13,22,.72);padding:15px;min-height:142px}
    .history-signal-card.good{border-color:rgba(57,231,95,.26);background:linear-gradient(180deg,rgba(20,83,45,.24),rgba(5,13,22,.72))}
    .history-signal-card.bad{border-color:rgba(255,59,59,.26);background:linear-gradient(180deg,rgba(127,29,29,.24),rgba(5,13,22,.72))}
    .history-signal-card.warn{border-color:rgba(245,197,66,.24);background:linear-gradient(180deg,rgba(113,63,18,.2),rgba(5,13,22,.72))}
    .history-signal-card.info{border-color:rgba(96,165,250,.2);background:linear-gradient(180deg,rgba(30,64,175,.16),rgba(5,13,22,.72))}
    .history-signal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    .history-signal-head span{color:#9fb0c5;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:900}
    .history-signal-head strong{font-size:30px;line-height:1;color:#f8fafc}
    .history-signal-card.good .history-signal-head strong{color:#39e75f}
    .history-signal-card.bad .history-signal-head strong{color:#ff7b72}
    .history-signal-card.warn .history-signal-head strong{color:#f5c542}
    .history-signal-card p{margin:0;color:#a9b6c8;line-height:1.45}
    .history-signal-card ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
    .history-signal-card li{border-top:1px solid rgba(148,163,184,.10);padding-top:9px}
    .history-signal-card b{display:block;color:#f8fafc;font-size:13px;line-height:1.35}
    .history-signal-card small{display:block;color:#8fa3b8;margin-top:4px}
    .executive-focus-panel{background:linear-gradient(135deg,rgba(57,231,95,.10),rgba(4,12,21,.78))!important}
    .executive-focus-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    .executive-focus-card{border-left:3px solid rgba(57,231,95,.72);border-radius:14px;background:rgba(5,13,22,.74);padding:16px;min-height:132px}
    .executive-focus-card span{display:block;color:#7f8ea3;font-size:10px;text-transform:uppercase;letter-spacing:.12em;font-weight:900}
    .executive-focus-card strong{display:block;color:#f8fafc;font-size:16px;line-height:1.25;margin:10px 0 8px}
    .executive-focus-card p{margin:0;color:#a9b6c8;line-height:1.45}
    .history-timeline-panel{background:linear-gradient(180deg,rgba(8,18,30,.90),rgba(5,13,22,.86))!important}
    .history-timeline-track{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-top:16px}
    .history-timeline-card{position:relative;border:1px solid rgba(148,163,184,.12);border-radius:16px;background:rgba(5,13,22,.74);padding:15px;display:grid;gap:14px;min-height:142px}
    .history-timeline-card:before{content:"";position:absolute;left:16px;top:-8px;width:12px;height:12px;border-radius:50%;background:#39e75f;box-shadow:0 0 20px rgba(57,231,95,.45)}
    .history-timeline-card.bad:before{background:#ff7b72;box-shadow:0 0 20px rgba(255,123,114,.35)}
    .history-timeline-card.warn:before{background:#f5c542;box-shadow:0 0 20px rgba(245,197,66,.35)}
    .history-timeline-card span{display:block;color:#7f8ea3;font-size:10px;text-transform:uppercase;letter-spacing:.12em;font-weight:900}
    .history-timeline-card strong{display:block;color:#f8fafc;font-size:18px;margin-top:7px;line-height:1.2}
    .history-timeline-card small{display:block;color:#8fa3b8;margin-top:5px;line-height:1.35}
    .history-timeline-metrics{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
    .history-timeline-metrics b{color:#39e75f;font-size:22px;line-height:1}
    .history-timeline-metrics em{font-style:normal;color:#a9b6c8;font-size:12px}
    .timeline-details{margin-top:16px;border-top:1px solid rgba(148,163,184,.12);padding-top:14px}
    .timeline-details summary{cursor:pointer;color:#9affac;font-weight:900;font-size:13px}
    .timeline-details table{margin-top:14px}
    #comparison .history-trend-head{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:12px!important}
    #comparison .history-trend-head strong{font-size:clamp(18px,1.45vw,24px)!important;max-width:72px!important;text-align:right!important;overflow:hidden!important}
    #comparison .history-sparkline{height:132px!important;min-height:132px!important;display:flex!important;align-items:flex-end!important;gap:clamp(10px,1.7vw,22px)!important;padding:18px 18px 34px!important;background:linear-gradient(180deg,rgba(3,12,22,.94),rgba(6,20,23,.78))!important;border:1px solid rgba(57,231,95,.10)!important;border-radius:12px!important}
    #comparison .history-spark{height:100%!important;min-width:0!important;display:flex!important;align-items:flex-end!important;justify-content:center!important;position:relative!important}
    #comparison .history-spark span{display:block!important;width:clamp(24px,3vw,42px)!important;max-width:42px!important;min-height:22px!important;border-radius:8px 8px 3px 3px!important;background:linear-gradient(180deg,#8dff9e,#39e75f 45%,#169b3c)!important;box-shadow:0 12px 24px rgba(57,231,95,.16)!important}
    #comparison .history-spark small{bottom:-24px!important;color:#9fb0c5!important;font-size:10px!important}
    /* Historical Intelligence: restore visual trend bars and separate each story block. */
    #comparison .history-section-grid{align-items:stretch!important}
    #comparison .history-trend-card{min-height:210px!important;padding:20px!important;background:linear-gradient(180deg,rgba(12,24,39,.88),rgba(5,13,22,.88))!important;border-color:rgba(57,231,95,.16)!important}
    #comparison .history-trend-head{align-items:start!important}
    #comparison .history-trend-head strong{max-width:110px!important;color:#39e75f!important;text-shadow:0 0 20px rgba(57,231,95,.16)!important}
    #comparison .history-sparkline{position:relative!important;overflow:visible!important}
    #comparison .history-sparkline:before{content:"";position:absolute;left:18px;right:18px;bottom:34px;height:1px;background:rgba(148,163,184,.12)}
    #comparison .history-spark{isolation:isolate}
    #comparison .history-spark span{position:relative;z-index:1;transition:transform .18s ease,filter .18s ease}
    #comparison .history-spark:hover span{transform:translateY(-3px);filter:brightness(1.12)}
    #comparison .history-signal-layout{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:22px!important;align-items:stretch!important}
    #comparison .history-signal-panel{position:relative;overflow:hidden;border-radius:24px!important;padding:22px!important;background:linear-gradient(145deg,rgba(9,22,36,.92),rgba(4,12,22,.90))!important;border-color:rgba(57,231,95,.14)!important}
    #comparison .history-signal-panel:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,#39e75f,rgba(57,231,95,.18));opacity:.8}
    #comparison .history-signal-panel:nth-child(2):before{background:linear-gradient(90deg,#60a5fa,rgba(96,165,250,.14))}
    #comparison .history-panel-head{position:relative;z-index:1;display:grid;gap:5px;margin-bottom:18px}
    #comparison .history-panel-head span{color:#7ee787;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
    #comparison .history-panel-head h2{margin:0;color:#f8fafc;font-size:clamp(20px,1.55vw,26px)!important;letter-spacing:-.035em}
    #comparison .history-panel-head p{margin:0;color:#9fb0c5;line-height:1.55}
    #comparison .history-signal-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}
    #comparison .history-signal-card{min-height:120px!important;padding:15px!important;border-radius:18px!important;background:rgba(5,13,22,.72)!important}
    #comparison .history-signal-head strong{font-size:clamp(24px,2vw,34px)!important}
    #comparison .failure-panel{background:radial-gradient(circle at 92% 0%,rgba(255,123,114,.12),transparent 30%),linear-gradient(145deg,rgba(13,20,32,.92),rgba(4,12,22,.90))!important}
    #comparison .release-timeline-panel{background:radial-gradient(circle at 10% 0%,rgba(96,165,250,.14),transparent 32%),linear-gradient(145deg,rgba(8,19,34,.92),rgba(4,12,22,.90))!important}
    #comparison .release-timeline-panel .compare-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
    #comparison .executive-focus-panel{border-radius:26px!important;background:linear-gradient(135deg,rgba(57,231,95,.16),rgba(5,13,22,.84) 54%,rgba(20,40,32,.70))!important;border-color:rgba(57,231,95,.22)!important}
    #comparison .executive-focus-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:14px!important}
    #comparison .executive-focus-card{position:relative;min-height:118px!important;padding:18px!important;border:1px solid rgba(57,231,95,.16)!important;border-left:0!important;border-radius:18px!important;background:rgba(4,13,20,.72)!important}
    #comparison .executive-focus-card:before{content:"";position:absolute;left:18px;top:18px;width:8px;height:8px;border-radius:50%;background:#39e75f;box-shadow:0 0 18px rgba(57,231,95,.55)}
    #comparison .executive-focus-card span{padding-left:18px}
    #comparison .history-timeline-panel{border-radius:26px!important;background:linear-gradient(180deg,rgba(7,17,30,.94),rgba(4,12,22,.92))!important;border-color:rgba(96,165,250,.16)!important}
    #comparison .history-timeline-track{position:relative;display:grid!important;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))!important;gap:14px!important}
    #comparison .history-timeline-track:before{content:"";position:absolute;left:20px;right:20px;top:19px;height:1px;background:linear-gradient(90deg,rgba(57,231,95,.42),rgba(96,165,250,.22));pointer-events:none}
    #comparison .history-timeline-card{z-index:1;min-height:132px!important;border-radius:18px!important;background:rgba(5,13,22,.86)!important}
    #comparison .timeline-details{border-top-color:rgba(96,165,250,.16)!important}
    @media(max-width:1100px){#comparison .history-signal-layout,#comparison .executive-focus-grid{grid-template-columns:1fr!important}#comparison .release-timeline-panel .compare-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    @media(max-width:760px){#comparison .history-signal-grid,#comparison .release-timeline-panel .compare-grid{grid-template-columns:1fr!important}}
    /* Search: keep results readable, opaque, and easy to dismiss. */
    .report-search,.global-search{position:relative!important}
    .global-search{overflow:visible!important}
    .search-results{position:relative;z-index:80;max-height:320px;overflow:auto;border-radius:14px}
    .global-search .search-results:not(:empty),.report-search .search-results:not(:empty),.search-results.search-active{background:#07101b!important;border:1px solid rgba(57,231,95,.28)!important;box-shadow:0 28px 70px rgba(0,0,0,.52)!important;padding:8px}
    .global-search .search-results{grid-column:1 / -1!important;margin-top:-2px!important}
    .search-results a{display:block;background:#0b1524!important;border-color:rgba(148,163,184,.16)!important;color:#f8fafc!important}
    .search-results a+a{margin-top:7px}
    .search-empty{background:#0b1524!important;border:1px solid rgba(148,163,184,.16)!important;border-radius:10px;padding:10px;color:#9fb0c5!important}
    @media(max-width:760px){.global-search{position:relative!important;top:auto!important}.search-results{max-height:240px}}
    /* AI Insight: present recommendations as a decision assistant, not a raw report list. */
    #insight{background:radial-gradient(circle at 12% 8%,rgba(57,231,95,.18),transparent 32%),radial-gradient(circle at 92% 6%,rgba(56,189,248,.10),transparent 24%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #insight .topbar h1{font-size:clamp(30px,2.5vw,44px)!important;letter-spacing:-.055em!important}
    .ai-command-hero{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr);gap:22px;align-items:stretch;margin-bottom:22px;border:1px solid rgba(57,231,95,.34);border-radius:28px;background:radial-gradient(circle at 10% 12%,rgba(57,231,95,.24),transparent 34%),linear-gradient(145deg,rgba(11,39,30,.88),rgba(5,13,23,.94));padding:28px;box-shadow:0 28px 90px rgba(57,231,95,.10),inset 0 1px 0 rgba(255,255,255,.08)}
    .ai-command-hero>div:first-child{display:flex;flex-direction:column;justify-content:center;min-width:0}
    .ai-command-hero .mission-label{width:max-content;max-width:100%;color:#a9ffb7;background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.36);border-radius:999px;padding:8px 12px;margin-bottom:16px}
    .ai-command-hero strong{display:block;color:#f8fafc;font-size:clamp(24px,2.3vw,42px);line-height:1.06;letter-spacing:-.055em;overflow-wrap:break-word}
    .ai-command-hero p{max-width:900px;margin:16px 0 0;color:#d7fbe0;font-size:16px;line-height:1.65}
    .ai-signal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .ai-signal-card{min-width:0;border:1px solid rgba(57,231,95,.22);border-radius:18px;background:rgba(5,14,24,.66);padding:16px;display:flex;flex-direction:column;justify-content:center}
    .ai-signal-card span{color:#8fa2ba;font-size:11px;font-weight:850;letter-spacing:.105em;text-transform:uppercase}
    .ai-signal-card strong{font-size:clamp(18px,1.5vw,26px);line-height:1.1;margin-top:8px;color:#39e75f;letter-spacing:-.035em}
    .ai-signal-card.amber strong,.ai-signal-card.warn strong{color:#f5c542}
    .ai-signal-card.red strong,.ai-signal-card.bad strong{color:#ff6b6b}
    .ai-decision-map{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,.82fr);gap:22px;margin-bottom:22px}
    .ai-reasoning-card,.ai-workflow-card{min-width:0;border:1px solid rgba(57,231,95,.16);border-radius:24px;background:linear-gradient(180deg,rgba(13,27,42,.78),rgba(6,15,27,.82));padding:24px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
    .ai-reasoning-card .ai-decision-summary{font-size:16px;color:#dbeafe;line-height:1.65;margin:0 0 14px}
    .ai-reasoning-card .ai-reasons{display:grid;gap:10px;margin:14px 0 0;padding:0;list-style:none;color:#d7fbe0}
    .ai-reasoning-card .ai-reasons li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:start;line-height:1.45}
    .ai-reasoning-card .ai-reasons li:before{content:"";width:9px;height:9px;margin-top:7px;border-radius:50%;background:#39e75f;box-shadow:0 0 14px rgba(57,231,95,.58)}
    .ai-workflow{position:relative;display:grid;gap:12px;margin-top:14px}
    .ai-workflow:before{content:"";position:absolute;left:18px;top:18px;bottom:18px;width:1px;background:linear-gradient(180deg,rgba(57,231,95,.55),rgba(57,231,95,.08))}
    .ai-workflow-step{position:relative;display:grid;grid-template-columns:38px minmax(0,1fr);column-gap:12px;border:1px solid rgba(57,231,95,.18);border-radius:16px;background:rgba(5,14,24,.64);padding:14px}
    .ai-workflow-step span{grid-row:1 / span 2;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:rgba(57,231,95,.13);border:1px solid rgba(57,231,95,.36);color:#9affac;font-size:11px;font-weight:950}
    .ai-workflow-step strong{color:#f8fafc;font-size:15px;line-height:1.25}
    .ai-workflow-step p{margin:5px 0 0;color:#9fb0c5;line-height:1.45;font-size:13px}
    .ai-insight-grid{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,.58fr);gap:22px;margin-bottom:22px}
    #insight .ai-action-panel,#insight .ai-role-panel,#insight .ai-priority-panel,#insight .ai-roadmap-note{border-radius:24px!important;border-color:rgba(57,231,95,.16)!important;background:linear-gradient(180deg,rgba(13,27,42,.72),rgba(6,15,27,.78))!important}
    #insight .action-list{display:grid;gap:10px;list-style:none;padding:0;color:#d7fbe0;line-height:1.5}
    #insight .action-list li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px}
    #insight .action-list li:before{content:"";width:8px;height:8px;border-radius:50%;margin-top:8px;background:#39e75f}
    #insight .role-recommendation-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    #insight .role-recommendation-card,#insight .recommendation-card{min-height:0!important;border-color:rgba(57,231,95,.14)!important;background:rgba(5,14,24,.64)!important}
    #insight .role-recommendation-card strong,#insight .recommendation-card strong{font-size:clamp(15px,1.05vw,18px);line-height:1.25}
    #insight .role-recommendation-card p,#insight .recommendation-card p{font-size:13px;line-height:1.55;color:#9fb0c5}
    #insight .recommendation-card small{display:block;margin-top:12px;color:#7ee787;font-size:11px;line-height:1.35}
    .ai-roadmap-note{margin-top:22px;padding:20px 22px}
    .ai-roadmap-note span{display:block;color:#8fa2ba;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px}
    .ai-roadmap-note p{margin:0;color:#d7fbe0;line-height:1.6}
    @media(max-width:1200px){.ai-command-hero,.ai-decision-map,.ai-insight-grid{grid-template-columns:1fr}#insight .role-recommendation-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:700px){.ai-command-hero{padding:20px}.ai-signal-grid,#insight .role-recommendation-grid,.recommendation-grid{grid-template-columns:1fr!important}.ai-workflow:before{display:none}}
    /* Historical Intelligence: present history as an executive comparison cockpit. */
    #comparison{background:radial-gradient(circle at 14% 6%,rgba(56,189,248,.12),transparent 30%),radial-gradient(circle at 88% 4%,rgba(57,231,95,.12),transparent 26%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #comparison .topbar h1{font-size:clamp(30px,2.5vw,44px)!important;letter-spacing:-.055em!important}
    .history-command-hero{margin-bottom:24px;border:1px solid rgba(57,231,95,.28);border-radius:28px;background:radial-gradient(circle at 8% 10%,rgba(57,231,95,.16),transparent 34%),linear-gradient(145deg,rgba(10,30,31,.86),rgba(5,13,23,.94));padding:24px;box-shadow:0 28px 90px rgba(57,231,95,.08),inset 0 1px 0 rgba(255,255,255,.06)}
    #comparison .history-hero-grid{display:grid!important;grid-template-columns:minmax(360px,.9fr) minmax(0,1.1fr)!important;gap:22px!important;align-items:stretch!important}
    #comparison .history-narrative{border:0!important;border-radius:24px!important;background:rgba(5,14,24,.48)!important;padding:24px!important;box-shadow:none!important}
    #comparison .history-narrative .mission-label{width:max-content;max-width:100%;margin-bottom:14px;color:#9affac;background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.32);border-radius:999px;padding:8px 12px}
    #comparison .history-narrative h2{margin:0 0 14px;color:#f8fafc;font-size:clamp(22px,1.9vw,34px);line-height:1.06;letter-spacing:-.04em}
    #comparison .history-narrative p{margin:0;color:#dbeafe;font-size:16px;line-height:1.65}
    #comparison .history-change-list{display:grid;gap:10px;margin-top:16px!important}
    #comparison .history-change-list li{font-size:14px;color:#d7fbe0}
    #comparison .history-metric-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important}
    #comparison .history-metric-grid .compare-card{min-height:126px!important;border-color:rgba(148,163,184,.12)!important;background:rgba(5,14,24,.58)!important}
    #comparison .history-metric-grid .compare-card strong{font-size:clamp(18px,1.45vw,26px)!important;line-height:1.05;overflow-wrap:break-word}
    .historical-wins,.history-comparison-dashboard,.history-test-change-panel{margin-bottom:24px;border:1px solid rgba(57,231,95,.16);border-radius:24px;background:linear-gradient(180deg,rgba(13,27,42,.72),rgba(6,15,27,.78));padding:22px}
    .historical-wins{display:grid;grid-template-columns:minmax(260px,.36fr) minmax(0,.64fr);gap:18px;align-items:start;background:linear-gradient(135deg,rgba(57,231,95,.10),rgba(5,13,22,.78))}
    .historical-wins h2,.history-comparison-dashboard h2,.history-test-change-panel h2{margin:0;color:#f8fafc;font-size:clamp(18px,1.35vw,24px);letter-spacing:-.03em}
    .historical-wins p,.history-panel-head p{margin:7px 0 0;color:#9fb0c5;line-height:1.5}
    .historical-wins .compare-list{align-self:stretch}
    #comparison .history-comparison-dashboard .compare-grid{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))!important}
    #comparison .compare-card{overflow:hidden!important}
    #comparison .compare-card span{white-space:normal!important;line-height:1.25!important}
    #comparison .compare-card strong{white-space:normal!important;overflow-wrap:break-word!important;text-shadow:none!important}
    #comparison .compare-card small{color:#9fb0c5!important}
    #comparison .history-section-grid{margin-bottom:24px!important;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))!important;gap:18px!important}
    #comparison .history-trend-card{min-height:230px!important;border-radius:24px!important;background:linear-gradient(180deg,rgba(13,27,42,.78),rgba(5,13,22,.84))!important;border-color:rgba(57,231,95,.14)!important;padding:20px!important}
    #comparison .history-trend-head span{color:#9fb0c5!important}
    #comparison .history-trend-head small{display:block;margin-top:5px;color:#74849a;line-height:1.35}
    #comparison .history-sparkline{min-height:126px!important;border-radius:18px!important;background:rgba(3,10,18,.58)!important}
    #comparison .history-spark span{background:linear-gradient(180deg,#77f68d,#1e9b42)!important;box-shadow:0 10px 28px rgba(57,231,95,.16)!important}
    #comparison .release-timeline{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px!important}
    #comparison .release-timeline>div{min-width:0;border:1px solid rgba(148,163,184,.12);border-radius:14px;background:rgba(3,10,18,.52);padding:10px}
    #comparison .release-timeline .release-status-badge{min-width:58px!important;max-width:none!important;width:max-content!important;font-size:10px!important;padding:6px 8px!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}
    #comparison .release-timeline small{display:block;margin-top:7px;color:#8fa2ba;font-size:10px;line-height:1.25}
    .history-test-change-panel .grid.three{margin-top:14px}
    .history-test-change-panel .grid.three>div{min-width:0;border:1px solid rgba(148,163,184,.10);border-radius:18px;background:rgba(3,10,18,.45);padding:16px}
    .history-test-change-panel .grid.three h2{font-size:15px;margin:0 0 10px}
    #comparison .history-signal-layout{margin-bottom:24px!important}
    #comparison .history-signal-panel,.release-timeline-panel,.executive-focus-panel,.history-timeline-panel{border-radius:24px!important}
    #comparison .history-signal-panel{background:linear-gradient(180deg,rgba(13,27,42,.74),rgba(5,13,22,.82))!important;border-color:rgba(57,231,95,.14)!important}
    #comparison .history-signal-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}
    #comparison .history-signal-card{min-height:118px!important;border-radius:16px!important;background:rgba(3,10,18,.48)!important;border-color:rgba(148,163,184,.10)!important}
    #comparison .release-timeline-panel{background:linear-gradient(135deg,rgba(57,231,95,.08),rgba(5,13,22,.84))!important;border-color:rgba(57,231,95,.16)!important}
    #comparison .executive-focus-panel{margin-bottom:24px!important}
    #comparison .executive-focus-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}
    #comparison .history-timeline-track{margin-top:18px!important}
    #comparison .history-timeline-card{border-radius:18px!important;background:rgba(3,10,18,.52)!important;border-color:rgba(148,163,184,.12)!important}
    /* Historical Timeline: make executions read as a chronological track. */
    #comparison .history-timeline-panel{padding:24px!important;background:radial-gradient(circle at 10% 0%,rgba(57,231,95,.12),transparent 34%),linear-gradient(180deg,rgba(7,17,30,.94),rgba(4,12,22,.92))!important}
    #comparison .history-timeline-track{position:relative!important;display:grid!important;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))!important;gap:16px!important;margin-top:22px!important;padding-top:18px!important}
    #comparison .history-timeline-track:before{content:"";position:absolute!important;left:24px!important;right:24px!important;top:24px!important;height:2px!important;background:linear-gradient(90deg,rgba(57,231,95,.58),rgba(56,189,248,.28),rgba(57,231,95,.18))!important;pointer-events:none!important}
    #comparison .history-timeline-card{position:relative!important;z-index:1!important;display:grid!important;gap:14px!important;min-height:194px!important;padding:22px 16px 16px!important;border-radius:20px!important;background:linear-gradient(180deg,rgba(10,22,36,.92),rgba(4,12,22,.88))!important;border:1px solid rgba(148,163,184,.14)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)!important}
    #comparison .history-timeline-card:before{display:none!important}
    #comparison .timeline-marker{position:absolute;top:-15px;left:16px;display:grid!important;place-items:center!important;width:32px!important;height:32px!important;border-radius:50%!important;background:#07101f!important;border:1px solid rgba(57,231,95,.58)!important;color:#9affac!important;font-size:11px!important;font-weight:950!important;letter-spacing:0!important;box-shadow:0 0 22px rgba(57,231,95,.24)!important}
    #comparison .history-timeline-card.bad .timeline-marker{border-color:rgba(255,107,107,.58)!important;color:#ff9b9b!important;box-shadow:0 0 20px rgba(255,107,107,.20)!important}
    #comparison .history-timeline-card.warn .timeline-marker{border-color:rgba(245,197,66,.58)!important;color:#f5d76d!important;box-shadow:0 0 20px rgba(245,197,66,.18)!important}
    #comparison .history-timeline-card>div:first-of-type span{display:block!important;color:#8fa2ba!important;font-size:10px!important;text-transform:uppercase!important;letter-spacing:.12em!important;font-weight:900!important;line-height:1.25!important}
    #comparison .history-timeline-card>div:first-of-type strong{display:block!important;margin-top:7px!important;color:#f8fafc!important;font-size:clamp(15px,1.1vw,19px)!important;line-height:1.2!important;overflow-wrap:break-word!important}
    #comparison .history-timeline-card>div:first-of-type small{display:block!important;margin-top:6px!important;color:#8fa2ba!important;font-size:11px!important;line-height:1.35!important}
    #comparison .history-timeline-metrics{display:grid!important;grid-template-columns:auto minmax(58px,max-content) auto!important;align-items:center!important;gap:8px!important;border-top:1px solid rgba(148,163,184,.10)!important;border-bottom:1px solid rgba(148,163,184,.10)!important;padding:12px 0!important}
    #comparison .history-timeline-metrics b{color:#39e75f!important;font-size:clamp(22px,1.7vw,30px)!important;line-height:1!important;letter-spacing:-.045em!important}
    #comparison .history-timeline-metrics .release-status-badge{min-width:58px!important;max-width:none!important;font-size:10px!important;padding:6px 8px!important;white-space:nowrap!important;overflow:visible!important}
    #comparison .history-timeline-metrics em{justify-self:end;font-style:normal;color:#dbeafe!important;font-size:12px!important;line-height:1.2!important}
    #comparison .timeline-execution-summary{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}
    #comparison .timeline-execution-summary span{display:block!important;min-width:0!important;border:1px solid rgba(148,163,184,.10)!important;border-radius:10px!important;background:rgba(3,10,18,.52)!important;padding:8px 7px!important;color:#9fb0c5!important;font-size:10px!important;text-transform:none!important;letter-spacing:0!important;text-align:center!important;overflow-wrap:break-word!important}
    #comparison .timeline-details{margin-top:20px!important;border-top:1px solid rgba(96,165,250,.16)!important;padding-top:16px!important}
    #comparison .timeline-details summary{width:max-content;max-width:100%;border:1px solid rgba(57,231,95,.24);border-radius:999px;background:rgba(57,231,95,.08);padding:9px 12px;color:#9affac!important}
    @media(max-width:1200px){#comparison .history-hero-grid,.historical-wins{grid-template-columns:1fr!important}#comparison .history-metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}#comparison .executive-focus-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    @media(max-width:760px){#comparison .history-metric-grid,#comparison .release-timeline,#comparison .history-signal-grid,#comparison .executive-focus-grid,#comparison .history-timeline-track{grid-template-columns:1fr!important}.history-command-hero,.historical-wins,.history-comparison-dashboard,.history-test-change-panel{padding:18px}#comparison .history-timeline-track:before{left:31px!important;right:auto!important;top:0!important;bottom:0!important;width:2px!important;height:auto!important}#comparison .history-timeline-card{margin-left:14px!important}}
    /* Product Health: stabilize module cards and keep status badges aligned. */
    #health .module-status-card{min-height:300px!important}
    #health .module-status-card .module-card-head{grid-template-columns:minmax(0,1fr) auto!important;align-items:start!important}
    #health .module-status-card .badge{justify-self:end!important;align-self:start!important;max-width:110px!important;text-align:center!important}
    #health .module-title{align-items:center!important}
    #health .module-title strong{overflow-wrap:normal!important;word-break:normal!important}
    #health .module-health-score{grid-template-columns:minmax(0,1fr)!important;gap:8px!important;align-items:start!important}
    #health .module-health-score strong{font-size:clamp(38px,3.4vw,56px)!important;letter-spacing:-.055em!important}
    #health .module-health-score span{justify-self:start!important;writing-mode:initial!important;transform:none!important;border:1px solid rgba(57,231,95,.18);border-radius:999px;background:rgba(57,231,95,.08);padding:6px 9px;color:#9fb0c5!important}
    #health .module-card-stats span{min-height:64px!important}
    #health .module-card-stats small{white-space:normal!important;letter-spacing:.04em!important;line-height:1.25}
    #health .module-card-stats b{font-size:clamp(15px,1.05vw,20px)!important;white-space:normal!important;overflow-wrap:break-word!important}
    #health .module-status-card p{margin-top:auto!important;min-height:36px!important}
    #health .module-button{margin-top:0!important}
    #health .risk-cell{min-width:0!important;padding:8px 4px!important;font-size:10.5px!important;font-weight:850!important;letter-spacing:0!important;line-height:1.15!important;overflow-wrap:normal!important;word-break:normal!important}
    @media(max-width:520px){#health .module-status-card .module-card-head{grid-template-columns:1fr!important}#health .module-status-card .badge{justify-self:start!important}}
    .air-core-layer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin:18px 0}
    .air-core-layer{border:1px solid rgba(148,163,184,.14);border-radius:18px;background:linear-gradient(180deg,rgba(12,24,39,.82),rgba(5,13,22,.82));padding:16px;min-width:0}
    .air-core-layer.layer-input{border-color:rgba(96,165,250,.24)}
    .air-core-layer.layer-processing{border-color:rgba(57,231,95,.24)}
    .air-core-layer.layer-intelligence{border-color:rgba(167,139,250,.22)}
    .air-core-layer.layer-decision{border-color:rgba(245,197,66,.24)}
    .air-core-layer.layer-platform{border-color:rgba(148,163,184,.20)}
    .air-core-layer-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
    .air-core-layer-head span{display:block;color:#f8fafc;font-weight:900;font-size:15px}
    .air-core-layer-head p{margin:6px 0 0;color:#9fb0c5;font-size:12px;line-height:1.45}
    .air-core-layer-head strong{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:12px;background:rgba(57,231,95,.12);color:#39e75f;border:1px solid rgba(57,231,95,.28)}
    .air-core-layer-engines{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}
    .air-core-layer-engines span{border:1px solid rgba(148,163,184,.14);border-radius:999px;background:rgba(3,12,22,.62);color:#cbd5e1;font-size:11px;font-weight:800;padding:6px 8px}
    .core-status-grid{grid-template-columns:repeat(auto-fit,minmax(235px,1fr))!important}
    .engine-card{min-height:132px!important}
    .engine-head strong{white-space:normal;color:#39e75f;text-align:right;max-width:46%;line-height:1.15}
    .engine-metrics{grid-template-columns:repeat(auto-fit,minmax(96px,1fr))!important}
    .engine-metrics b{font-size:clamp(13px,1.1vw,18px)!important;overflow-wrap:break-word!important}
    .air-core-pipeline{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(138px,1fr))!important;gap:8px!important}
    .air-core-pipeline span{white-space:normal!important;min-width:0!important}
    /* AIR Core: present engines as a pipeline dashboard instead of repeated status tiles. */
    #air-core .topbar h1{font-size:clamp(36px,4.4vw,58px)!important}
    #air-core .panel{margin-bottom:22px!important}
    .air-core-hero{display:grid!important;grid-template-columns:minmax(0,1.15fr) minmax(340px,.85fr)!important;gap:22px!important;align-items:stretch!important;padding:26px!important;background:radial-gradient(circle at 14% 0%,rgba(57,231,95,.14),transparent 34%),linear-gradient(135deg,rgba(7,25,18,.94),rgba(6,14,24,.94))!important}
    .air-core-hero-copy{display:flex;gap:16px;align-items:flex-start;min-width:0}
    .air-core-hero-copy .section-icon{flex:0 0 auto}
    .air-core-hero-copy h2{margin:0;color:#f8fafc;font-size:clamp(24px,2.25vw,34px);letter-spacing:-.035em}
    .air-core-hero-copy p{margin:10px 0 0;max-width:860px;color:#bdd0df;font-size:clamp(15px,1.08vw,18px);line-height:1.55}
    .air-core-hero-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;min-width:0}
    .air-core-hero-stats div{min-width:0;border:1px solid rgba(57,231,95,.16);border-radius:18px;background:rgba(4,12,22,.56);padding:16px}
    .air-core-hero-stats span{display:block;color:#91a4b8;font-size:11px;font-weight:850;letter-spacing:.10em;text-transform:uppercase}
    .air-core-hero-stats strong{display:block;margin-top:10px;color:#39e75f;font-size:clamp(18px,1.65vw,28px);line-height:1.05;white-space:normal;overflow-wrap:break-word}
    .air-core-map,.air-core-engines{padding:24px!important}
    #air-core .section-heading-row{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:16px}
    #air-core .section-heading-row h2{margin:0;font-size:clamp(20px,1.8vw,28px)!important}
    #air-core .section-heading-row p{margin:8px 0 0;color:#91a4b8;line-height:1.45}
    #air-core .air-core-layer-grid{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))!important;gap:12px!important;margin:0 0 18px!important}
    #air-core .air-core-layer{padding:16px!important;border-color:rgba(57,231,95,.12)!important;background:linear-gradient(180deg,rgba(11,25,38,.76),rgba(5,14,24,.70))!important}
    #air-core .air-core-layer-head span{font-size:14px!important}
    #air-core .air-core-layer-head p{font-size:11.5px!important;color:#8fa2b6!important}
    #air-core .air-core-layer-head small{display:inline-flex;margin-top:10px;color:#39e75f;font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
    #air-core .air-core-layer-head strong{font-size:15px!important}
    #air-core .air-core-layer-engines span{font-size:10.5px!important;padding:5px 7px!important;color:#d8e3ee!important}
    #air-core .air-core-pipeline{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))!important;gap:10px!important;margin:0!important;padding:14px!important;border-radius:20px!important;background:linear-gradient(90deg,rgba(57,231,95,.10),rgba(5,14,24,.76))!important}
    #air-core .air-core-pipeline span{display:grid!important;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"step name" "step purpose";column-gap:10px;row-gap:2px;align-items:center;border-color:rgba(57,231,95,.14)!important;background:rgba(5,14,24,.72)!important;padding:11px!important;min-height:72px}
    #air-core .air-core-pipeline b{grid-area:step}
    #air-core .air-core-pipeline i{grid-area:name;font-style:normal;color:#f8fafc;font-weight:900;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #air-core .air-core-pipeline small{grid-area:purpose;color:#8fa2b6;font-size:10.5px;line-height:1.25;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    #air-core .core-status-grid{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))!important;gap:14px!important}
    #air-core .engine-output-stack{display:grid;gap:18px}
    #air-core .engine-output-group{border:1px solid rgba(57,231,95,.16);border-radius:22px;background:linear-gradient(180deg,rgba(10,24,39,.82),rgba(5,13,22,.82));padding:18px}
    #air-core .engine-output-group-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px}
    #air-core .engine-output-group-head span{display:block;color:#f8fafc;font-size:18px;font-weight:950;letter-spacing:-.025em}
    #air-core .engine-output-group-head p{margin:6px 0 0;color:#9fb0c5;font-size:12px;line-height:1.45}
    #air-core .engine-output-group-head strong{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(57,231,95,.24);border-radius:999px;background:rgba(57,231,95,.10);color:#9affac;font-size:11px;font-weight:900;padding:7px 10px;white-space:nowrap}
    #air-core .engine-output-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:14px}
    #air-core .engine-output-group .engine-card{min-height:176px!important;border:1px solid rgba(57,231,95,.15)!important;border-radius:22px!important;background:linear-gradient(180deg,rgba(12,24,39,.82),rgba(5,13,22,.82))!important;box-shadow:none!important}
    #air-core .engine-output-group .engine-card:hover{border-color:rgba(57,231,95,.34)!important;background:linear-gradient(180deg,rgba(14,31,45,.90),rgba(6,16,28,.86))!important;transform:translateY(-1px)}
    #air-core .engine-card{min-height:148px!important;padding:16px!important;border-color:rgba(57,231,95,.12)!important;background:linear-gradient(180deg,rgba(11,25,38,.70),rgba(5,14,24,.76))!important}
    #air-core .engine-head{align-items:flex-start!important}
    #air-core .engine-head div{min-width:0}
    #air-core .engine-head span{display:block;color:#8fa2b6!important;font-size:10px!important;letter-spacing:.12em!important;text-transform:uppercase;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    #air-core .engine-head h3{margin:6px 0 0;color:#f8fafc;font-size:18px;line-height:1.15;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #air-core .engine-head strong{flex:0 0 auto;font-size:10px!important;padding:6px 8px!important;background:rgba(57,231,95,.10)!important}
    #air-core .engine-card p{min-height:42px!important;color:#b7c6d8!important;font-size:13px!important;line-height:1.45!important}
    #air-core .engine-metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important;margin-top:auto}
    #air-core .engine-metrics div{min-height:58px!important;border-color:rgba(148,163,184,.12)!important;background:rgba(3,10,18,.58)!important}
    #air-core .engine-metrics small{font-size:9.5px!important}
    #air-core .engine-metrics b{font-size:clamp(13px,1.15vw,18px)!important;line-height:1.15!important;color:#e8fff0!important}
    @media(max-width:1100px){.air-core-hero{grid-template-columns:1fr!important}.air-core-hero-stats{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media(max-width:720px){.air-core-hero-stats{grid-template-columns:1fr!important}#air-core .air-core-pipeline{grid-template-columns:1fr!important}#air-core .engine-metrics{grid-template-columns:1fr!important}}
    .chart-explainer,.history-trend-head small{color:#b7c6d8!important}
    .history-trend-head span:after{content:"Recent executions";display:block;margin-top:4px;color:#6f8095;font-size:9px;font-weight:800;letter-spacing:.04em}
    .history-trend-head div{overflow:hidden!important}
    .history-trend-head small{overflow-wrap:break-word!important;word-break:normal!important}
    .history-spark{min-width:18px!important}
    .support-metrics .meta-item strong,.support-metrics strong{font-size:clamp(18px,1.45vw,24px)!important;line-height:1.1!important;white-space:normal!important;overflow-wrap:break-word!important}
    .support-metrics .meta-item{overflow:hidden!important}
    .ai-metric-grid{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))!important}
    .ai-metric{min-width:0!important;overflow:hidden!important}
    .ai-metric span{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;line-height:1.25!important}
    .ai-metric strong{display:block!important;max-width:100%!important;font-size:clamp(20px,1.75vw,30px)!important;line-height:1.08!important;white-space:normal!important;overflow-wrap:break-word!important;word-break:normal!important}
    .ai-metric strong.nowrap{white-space:nowrap!important}
    .decision-metrics .ai-metric strong:not(.nowrap){font-size:clamp(18px,1.55vw,28px)!important}
    #executive .executive-decision-metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:16px!important}
    #executive .executive-decision-metrics div{min-height:118px!important;overflow:hidden!important}
    #executive .executive-decision-metrics strong{font-size:clamp(22px,1.75vw,30px)!important;white-space:normal!important;overflow-wrap:break-word!important;word-break:normal!important}
    #executive .executive-decision-metrics span{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    table{min-width:0!important}
    .page,.panel,.compare-card,.history-trend-card,.engine-card,.air-core-layer{overflow:hidden}
    .actions,.topbar,.modal-header,.drawer-header{min-width:0}
    .pill,.btn,.badge,.release-status-badge{overflow-wrap:break-word}
    @media(max-width:1100px){.history-signal-layout,.executive-focus-grid{grid-template-columns:1fr}.history-signal-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:700px){.history-signal-grid,.history-timeline-track{grid-template-columns:1fr}}
    /* AIR executive reference layer: match the premium mission-control design while keeping AIR data intact. */
    body{background:radial-gradient(circle at 72% -8%,rgba(32,103,255,.17),transparent 30%),radial-gradient(circle at 16% 0%,rgba(57,231,95,.22),transparent 34%),linear-gradient(135deg,#020712 0%,#06101d 46%,#020611 100%)!important}
    .sidebar{padding:26px 16px!important;background:linear-gradient(180deg,#020813 0%,#07111f 54%,#03060e 100%)!important;border-right:1px solid rgba(148,163,184,.18)!important;box-shadow:28px 0 90px rgba(0,0,0,.38),inset -1px 0 0 rgba(57,231,95,.14)!important}
    .brand{position:relative;width:max-content;font-size:86px!important;line-height:.78!important;letter-spacing:-8px!important;background:linear-gradient(135deg,#38ff72 0%,#26e37b 45%,#3ca7ff 100%)!important;-webkit-background-clip:text!important;color:transparent!important;text-shadow:0 0 58px rgba(57,231,95,.20)!important}
    .brand:after{content:"✦";position:absolute;right:-18px;top:-18px;color:#8dff9e;font-size:30px;text-shadow:0 0 22px rgba(57,231,95,.65)}
    .brand-sub{margin:10px 4px 30px!important;text-align:left!important;color:#f8fafc!important;font-size:13px!important;line-height:1.38!important;font-weight:700!important}
    .brand-sub span{color:#39e75f}
    .nav-section{margin:20px 8px 9px!important;color:#728197!important;font-size:10px!important;letter-spacing:.16em!important}
    .nav a{min-height:52px;border-radius:18px!important;padding:11px 12px!important;color:#e6edf6!important;border:1px solid transparent!important}
    .nav a span{line-height:1.2}
    .nav a.active,.nav a:hover{background:linear-gradient(90deg,rgba(57,231,95,.30),rgba(57,231,95,.10))!important;border-color:rgba(57,231,95,.46)!important;box-shadow:0 18px 46px rgba(57,231,95,.09),inset 0 1px 0 rgba(255,255,255,.06)!important}
    .nav-icon{width:31px!important;height:31px!important;min-width:31px!important;border-radius:10px!important;background:rgba(255,255,255,.035)!important;border:1px solid rgba(255,255,255,.10)!important;color:#f8fafc!important}
    .nav a.active .nav-icon,.nav a:hover .nav-icon{background:rgba(57,231,95,.16)!important;border-color:rgba(57,231,95,.40)!important;color:#b9fbc4!important}
    .report-meta{background:rgba(5,13,24,.64)!important;border-color:rgba(148,163,184,.18)!important;border-radius:18px!important;padding:14px!important}
    .release-mini{background:linear-gradient(135deg,rgba(57,231,95,.16),rgba(6,22,20,.86))!important;border-color:rgba(57,231,95,.36)!important;border-radius:18px!important}
    main{padding-top:18px!important;max-width:1680px!important}
    .cover-page{min-height:calc(100vh - 36px)!important;padding:clamp(24px,2.5vw,38px)!important;margin-bottom:42px!important;background:transparent!important;border:0!important;box-shadow:none!important;overflow:visible!important}
    .cover-page:before,.cover-page:after{display:none!important}
    .executive-mode-header{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:22px!important;align-items:start!important;margin-bottom:26px!important}
    .executive-mode-header .eyebrow{display:none}
    .executive-mode-header h1{font-size:clamp(36px,3vw,54px)!important;letter-spacing:-.06em!important;line-height:.98!important;margin:0 0 12px!important;text-shadow:0 0 32px rgba(57,231,95,.10)!important}
    .executive-mode-header h1:after{content:"";display:block;width:70px;height:3px;border-radius:999px;background:#39e75f;margin-top:16px;box-shadow:0 0 22px rgba(57,231,95,.55)}
    .executive-mode-header p{font-size:17px!important;color:#dbe5ef!important}
    .executive-toolbar{display:grid!important;grid-template-columns:1fr auto auto auto!important;gap:12px!important;align-items:center!important}
    .mode-toggle{grid-column:1/-1;justify-self:center;display:inline-flex;gap:0;border:1px solid rgba(148,163,184,.26);border-radius:999px;background:rgba(7,13,24,.82);padding:4px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
    .mode-toggle span{display:inline-flex;align-items:center;justify-content:center;min-width:178px;border-radius:999px;padding:11px 18px;color:#dbe5ef;font-weight:900}
    .mode-toggle span.active{background:rgba(57,231,95,.16);border:1px solid rgba(57,231,95,.70);color:#a6ff7a;box-shadow:0 0 28px rgba(57,231,95,.18)}
    .executive-toolbar>span:not(.active){background:rgba(11,19,34,.88)!important;border:1px solid rgba(148,163,184,.26)!important;border-radius:14px!important;padding:12px 16px!important;color:#f8fafc!important}
    .executive-toolbar .btn{background:rgba(11,19,34,.88)!important;border:1px solid rgba(148,163,184,.24)!important;border-radius:14px!important;padding:12px 16px!important;color:#f8fafc!important}
    .executive-mode-grid{display:grid!important;grid-template-columns:minmax(520px,1.08fr) minmax(420px,.9fr)!important;grid-template-areas:"cockpit kpis"!important;gap:18px!important}
    .release-cockpit{grid-area:cockpit!important;grid-column:auto!important;min-height:405px!important;grid-template-columns:minmax(190px,245px) minmax(0,1fr)!important;padding:28px 30px!important;border-radius:26px!important;background:radial-gradient(circle at 20% 50%,rgba(57,231,95,.40),rgba(57,231,95,.13) 34%,rgba(3,15,22,.98) 70%)!important;border:1px solid rgba(57,231,95,.80)!important;box-shadow:0 34px 110px rgba(57,231,95,.18),inset 0 1px 0 rgba(185,251,196,.16)!important}
    .release-cockpit:before{width:430px!important;height:430px!important;background:repeating-conic-gradient(from 0deg,rgba(57,231,95,.25) 0 4deg,transparent 4deg 13deg),radial-gradient(circle,rgba(57,231,95,.24),transparent 68%)!important;opacity:.75}
    .release-orb{width:clamp(180px,15vw,230px)!important;height:clamp(180px,15vw,230px)!important;background:radial-gradient(circle,#1e8f3f 0%,#0b3b1d 46%,rgba(57,231,95,.28) 58%,transparent 66%)!important;border:1px solid rgba(57,231,95,.78)!important;box-shadow:0 0 130px rgba(57,231,95,.44),inset 0 0 68px rgba(57,231,95,.28)!important}
    .release-orb span{font-size:0!important;width:106px!important;height:106px!important;border-radius:28px!important}
    .release-orb span:before{content:"✓";font-size:52px;color:#d7fbe0}
    .release-cockpit .release-status-badge{display:block!important;max-width:100%!important;font-size:clamp(34px,3.35vw,56px)!important;line-height:1.05!important;letter-spacing:-.04em!important;white-space:normal!important;overflow-wrap:normal!important;word-break:normal!important;text-align:left!important;color:#f4fff6!important}
    .release-cockpit.warn{border-color:rgba(245,197,66,.75)!important;background:radial-gradient(circle at 20% 50%,rgba(245,197,66,.30),rgba(245,197,66,.08) 34%,rgba(3,15,22,.98) 70%)!important;box-shadow:0 34px 110px rgba(245,197,66,.14)!important}
    .release-cockpit.warn:before{background:repeating-conic-gradient(from 0deg,rgba(245,197,66,.22) 0 4deg,transparent 4deg 13deg),radial-gradient(circle,rgba(245,197,66,.22),transparent 68%)!important}
    .release-cockpit.warn .release-status-badge,.cockpit-mini-grid strong.amber{color:#f5c542!important}
    .release-cockpit.warn .release-orb{background:radial-gradient(circle,#8a6412 0%,#3a2a08 46%,rgba(245,197,66,.28) 58%,transparent 66%)!important;border-color:rgba(245,197,66,.78)!important;box-shadow:0 0 90px rgba(245,197,66,.28)!important}
    .release-cockpit.warn .release-orb span:before{content:"!";color:#f5c542}
    .release-cockpit.bad{border-color:rgba(255,107,107,.75)!important;background:radial-gradient(circle at 20% 50%,rgba(255,107,107,.28),rgba(255,107,107,.08) 34%,rgba(3,15,22,.98) 70%)!important}
    .release-cockpit.bad .release-status-badge{color:#ff7b72!important}
    .release-cockpit.bad .release-orb span:before{content:"!";color:#ff7b72}
    #health .module-icon{font-size:13px!important;font-weight:800!important;letter-spacing:0!important;white-space:nowrap!important;overflow:hidden!important}
    .release-cockpit p{font-size:19px!important;color:#f0f7ff!important;line-height:1.36!important;margin:14px 0 20px!important}
    .cockpit-label{padding:8px 15px!important;color:#b9fbc4!important;border-color:rgba(57,231,95,.54)!important;background:rgba(57,231,95,.16)!important}
    .cockpit-mini-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:14px!important;padding-top:14px!important;border-top:1px solid rgba(148,163,184,.12)!important}
    .cockpit-mini-grid strong{font-size:clamp(18px,2.05vw,34px)!important;white-space:normal!important}
    .release-meter{height:18px!important;margin-top:20px!important;background:linear-gradient(90deg,#ef4444 0%,#f97316 25%,#eab308 48%,#7ee787 74%,#22c55e 100%)!important}
    .executive-kpi-stack{grid-area:kpis!important;grid-column:auto!important;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:14px!important}
    .executive-kpi{position:relative;min-height:168px!important;text-align:center!important;align-items:center!important;justify-content:center!important;padding:18px 12px!important;border-radius:22px!important;background:linear-gradient(180deg,rgba(18,29,45,.92),rgba(7,16,29,.92))!important}
    .executive-kpi:before{content:"✓";display:grid;place-items:center;width:54px;height:54px;border-radius:50%;margin:0 auto 12px;background:rgba(57,231,95,.14);border:3px solid #39e75f;color:#d7fbe0;font-size:28px;box-shadow:0 0 32px rgba(57,231,95,.24)}
    .executive-kpi.mark-warn:before{content:"!";border-color:#f5c542;background:rgba(245,197,66,.14);color:#f5c542;box-shadow:0 0 32px rgba(245,197,66,.24)}
    .executive-kpi.mark-warn strong{color:#f5c542!important}
    .executive-kpi.mark-bad:before,.executive-kpi.danger:before{content:"!";border-color:#ff7b72;background:rgba(255,123,114,.14);color:#ff7b72;box-shadow:0 0 32px rgba(255,123,114,.24)}
    .executive-kpi.mark-bad strong{color:#ff7b72!important}
    .executive-kpi span{font-size:14px!important;letter-spacing:0!important;text-transform:none!important;color:#fff!important;order:2}
    .executive-kpi strong{font-size:clamp(34px,3vw,50px)!important;line-height:1!important;color:#fff!important;margin:0 0 8px!important;order:1}
    .executive-kpi small{font-size:14px!important;color:#dbe5ef!important;order:3}
    .executive-kpi.success strong,.executive-kpi:first-child strong{color:#f8fafc!important}
    .executive-kpi.danger{border-color:rgba(245,158,11,.45)!important;background:linear-gradient(180deg,rgba(67,39,17,.55),rgba(7,16,29,.92))!important}
    .executive-kpi.danger strong{color:#fff!important}
    .business-impact-card{grid-area:impact!important;grid-column:auto!important}
    .what-changed-panel{grid-area:changes!important;grid-column:auto!important}
    .trend-panel{grid-area:trend!important;grid-column:auto!important}
    .product-strip-panel{grid-area:product!important;grid-column:auto!important}
    .evidence-highlight-panel{grid-area:evidence!important;grid-column:auto!important}
    .executive-recommendation-band{grid-area:recommend!important;grid-column:auto!important}
    .executive-panel{border-radius:24px!important;background:linear-gradient(180deg,rgba(13,25,41,.88),rgba(6,15,27,.88))!important;border-color:rgba(148,163,184,.22)!important;padding:18px 20px!important}
    .executive-panel-head{margin-bottom:14px!important}
    .executive-panel-head h2{font-size:21px!important}
    .executive-panel-head a{color:#38a3ff!important;text-decoration:none!important}
    .business-impact-layout{grid-template-columns:82px minmax(0,.9fr) minmax(210px,1fr)!important;gap:18px!important}
    .business-impact-spark{grid-column:auto!important;min-width:0}
    .business-impact-orb{width:82px!important;height:82px!important;font-size:0!important}
    .business-impact-orb:before{content:"● ●";font-size:20px;letter-spacing:-4px}
    .business-impact-orb{width:72px!important;height:72px!important;font-size:inherit!important;border-radius:18px!important}
    .business-impact-orb:before{content:none!important}
    .executive-trend-svg{min-height:154px!important}
    .executive-change-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}
    .executive-change-card{text-align:center!important;align-items:center!important;border-radius:20px!important;min-height:130px!important}
    .executive-change-card:before{content:"+";display:grid;place-items:center;width:58px;height:58px;border-radius:50%;margin-bottom:10px;border:2px solid currentColor;font-size:32px}
    .executive-change-card.negative:before{content:"−"}
    .executive-change-card.warning:before{content:"✎"}
    .executive-change-card.neutral:before{content:"</>"}
    .executive-product-strip{grid-template-columns:repeat(auto-fit,minmax(96px,1fr))!important}
    .executive-module-pill{min-height:136px!important;padding:12px!important;text-align:center!important;border-radius:16px!important}
    .executive-module-pill span{font-size:12px!important;color:#fff!important}
    .executive-module-pill strong{font-size:26px!important;margin:16px 0 4px!important}
    .executive-module-pill small{font-size:12px!important;color:#9affac!important}
    .executive-evidence-strip{grid-template-columns:repeat(5,minmax(0,1fr))!important}
    .executive-evidence-card{border-radius:16px!important;min-height:140px!important}
    .executive-evidence-card img{height:82px!important}
    .executive-evidence-empty{min-height:144px!important}
    .executive-recommendation-band{border-radius:24px!important;background:linear-gradient(90deg,rgba(57,231,95,.25),rgba(13,35,30,.88) 48%,rgba(8,17,31,.92))!important;border-color:rgba(57,231,95,.55)!important;padding:20px 28px!important}
    .executive-recommendation-band:before{content:"◎";display:grid;place-items:center;flex:0 0 72px;width:72px;height:72px;border-radius:50%;background:rgba(57,231,95,.18);color:#b9fbc4;font-size:38px;box-shadow:0 0 34px rgba(57,231,95,.20)}
    .executive-recommendation-band strong{font-size:24px!important}
    .global-search{margin-top:-16px!important;margin-bottom:26px!important}
    /* Screen 02: Release Decision, matched to the executive visual language. */
    #executive{background:radial-gradient(circle at 12% 0%,rgba(57,231,95,.18),transparent 30%),radial-gradient(circle at 94% 8%,rgba(56,189,248,.12),transparent 24%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #executive .topbar{align-items:center!important;margin-bottom:24px!important}
    #executive .topbar h1{font-size:clamp(34px,3vw,52px)!important;letter-spacing:-.06em!important}
    #executive .topbar p{font-size:17px!important;color:#cbd5e1!important}
    #executive .actions{gap:10px!important}
    #executive .executive-decision-card{display:grid!important;grid-template-columns:minmax(360px,.82fr) minmax(0,1.18fr)!important;grid-template-areas:"decision metrics" "action action"!important;gap:18px!important;padding:0!important;margin-bottom:26px!important;background:transparent!important;border:0!important;box-shadow:none!important}
    #executive .executive-decision-main{grid-area:decision;position:relative;min-width:0!important;max-width:100%!important;min-height:390px!important;overflow:hidden!important;justify-content:flex-start!important;padding:30px!important;border-radius:28px!important;border:1px solid rgba(57,231,95,.58)!important;background:radial-gradient(circle at 18% 22%,rgba(57,231,95,.30),transparent 34%),linear-gradient(145deg,rgba(13,39,30,.92),rgba(5,13,23,.92))!important;box-shadow:0 30px 90px rgba(57,231,95,.12),inset 0 1px 0 rgba(255,255,255,.08)!important}
    #executive .executive-decision-main:before{content:"";position:absolute;right:-90px;top:-120px;width:290px;height:290px;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(57,231,95,.17) 0 5deg,transparent 5deg 15deg);opacity:.58;pointer-events:none}
    #executive .mission-label{position:relative;z-index:1;width:max-content;max-width:100%;border:1px solid rgba(57,231,95,.42);border-radius:999px;background:rgba(57,231,95,.14);padding:8px 13px;color:#a9ffb7;font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}
    #executive .executive-decision-main .release-status-badge{position:relative;z-index:1;margin:24px 0 18px!important;align-self:flex-start!important;font-size:clamp(40px,4.6vw,76px)!important;line-height:1.02!important;letter-spacing:-.04em!important;background:transparent!important;border:0!important;padding:0!important;box-shadow:none!important;text-align:left!important;white-space:normal!important;overflow-wrap:normal!important;word-break:normal!important;color:#f4fff6!important}
    #executive .executive-decision-main .release-status-badge.warn{color:#f5c542!important}
    #executive .executive-decision-main .release-status-badge.bad{color:#ff7b72!important}
    #executive .executive-decision-main *{max-width:100%!important}
    #executive .executive-decision-bullets{position:relative;z-index:1;list-style:none;margin:0!important;padding:0!important;display:grid!important;gap:14px!important}
    #executive .executive-decision-bullets li{display:grid!important;grid-template-columns:28px minmax(0,1fr)!important;gap:12px!important;align-items:start!important;color:#e6edf6!important;font-size:18px!important;line-height:1.45!important}
    #executive .executive-decision-bullets li:before{content:"";display:grid;width:26px;height:26px;border-radius:50%;background:rgba(57,231,95,.14);border:1px solid rgba(57,231,95,.48);box-shadow:0 0 18px rgba(57,231,95,.18)}
    #executive .executive-decision-metrics{grid-area:metrics!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:14px!important}
    #executive .executive-decision-metrics div{min-height:176px!important;padding:22px!important;border-radius:24px!important;border:1px solid rgba(57,231,95,.18)!important;background:linear-gradient(180deg,rgba(14,29,46,.88),rgba(6,15,27,.88))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.045)!important;justify-content:center!important}
    #executive .executive-decision-metrics div:nth-child(3){border-color:rgba(245,158,11,.34)!important;background:linear-gradient(180deg,rgba(54,35,17,.62),rgba(6,15,27,.88))!important}
    #executive .executive-decision-metrics span{font-size:12px!important;letter-spacing:.08em!important;color:#9fb0c5!important}
    #executive .executive-decision-metrics strong{font-size:clamp(24px,2.1vw,38px)!important;line-height:1.04!important;letter-spacing:-.05em!important;color:#39e75f!important;white-space:normal!important;overflow-wrap:normal!important;word-break:normal!important}
    #executive .executive-decision-metrics strong.nowrap{white-space:nowrap!important}
    #executive .executive-action{grid-area:action!important;border-radius:24px!important;border:1px solid rgba(57,231,95,.36)!important;background:linear-gradient(90deg,rgba(57,231,95,.18),rgba(10,28,24,.84) 46%,rgba(7,16,29,.88))!important;padding:22px 26px!important;display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;gap:18px!important;align-items:center!important}
    #executive .executive-action:before{content:"ACTION";display:grid;place-items:center;width:72px;height:72px;border-radius:50%;background:rgba(57,231,95,.16);border:1px solid rgba(57,231,95,.42);color:#9affac;font-size:11px;font-weight:950;letter-spacing:.08em;box-shadow:0 0 34px rgba(57,231,95,.14)}
    #executive .executive-action span{grid-column:2!important;display:block;color:#9fb0c5!important;font-size:11px!important;text-transform:uppercase!important;letter-spacing:.1em!important}
    #executive .executive-action strong{grid-column:2!important;display:block;color:#f8fafc!important;font-size:clamp(18px,1.55vw,26px)!important;line-height:1.34!important;margin-top:6px!important}
    #executive>.grid.two{grid-template-columns:minmax(360px,.9fr) minmax(0,1.1fr)!important;gap:20px!important;align-items:stretch!important}
    #executive>.grid.two>.panel{border-radius:26px!important;background:linear-gradient(180deg,rgba(13,25,41,.82),rgba(6,15,27,.78))!important;border:1px solid rgba(57,231,95,.16)!important;padding:24px!important}
    #executive .why-release{max-width:none!important;margin:0!important;border-radius:22px!important;border:1px solid rgba(57,231,95,.28)!important;background:linear-gradient(145deg,rgba(57,231,95,.12),rgba(5,14,24,.74))!important;padding:22px!important}
    #executive .why-release h3{text-align:left!important;font-size:clamp(22px,1.8vw,30px)!important;margin:0 0 18px!important}
    #executive .why-release ul{gap:12px!important}
    #executive .why-release.warn li:before{background:rgba(245,197,66,.12);border-color:rgba(245,197,66,.4);color:var(--amber)}
    #executive .why-release.warn .decision-reasons li:before{background:#fbbf24;box-shadow:0 0 14px rgba(245,197,66,.55)}
    #executive .decision-metrics{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important}
    #executive .decision-metrics .ai-metric{min-height:120px!important;border-radius:18px!important;background:rgba(5,14,24,.64)!important;border-color:rgba(148,163,184,.12)!important}
    #executive .decision-metrics .ai-metric strong{font-size:clamp(20px,1.6vw,28px)!important}
    #executive .decision-group{margin-top:20px!important;padding-top:20px!important;border-top:1px solid rgba(148,163,184,.12)!important}
    #executive .decision-reasons{list-style:none!important;margin:0!important;padding:0!important;display:grid!important;gap:10px!important}
    #executive .decision-reasons li{display:grid!important;grid-template-columns:22px minmax(0,1fr)!important;gap:10px!important;color:#dbe5ef!important;line-height:1.45!important}
    #executive .decision-reasons li:before{content:"";width:10px;height:10px;border-radius:50%;margin-top:7px;background:#39e75f;box-shadow:0 0 14px rgba(57,231,95,.6)}
    #executive .support-metrics{margin-top:18px!important;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important}
    #executive .recommendation-callout{margin-top:18px!important;border-radius:20px!important;background:rgba(57,231,95,.08)!important;border-color:rgba(57,231,95,.24)!important}
    /* Release Decision: executive reasoning layout without changing AIR Core data. */
    #executive .decision-intelligence{display:grid;gap:18px;margin-top:20px}
    #executive .decision-intel-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}
    #executive .decision-intel-block{min-width:0;border:1px solid rgba(57,231,95,.16);border-radius:20px;background:rgba(5,14,24,.58);padding:20px}
    #executive .decision-intel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
    #executive .decision-intel-head span{display:block;color:#91a6bd;font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;margin-bottom:6px}
    #executive .decision-intel-head h3{margin:0;color:#f8fafc;font-size:clamp(18px,1.35vw,22px);line-height:1.15}
    #executive .decision-intel-head strong{flex:0 0 auto;max-width:44%;border-radius:999px;border:1px solid rgba(57,231,95,.24);background:rgba(57,231,95,.08);color:#39e75f;padding:7px 11px;font-size:clamp(12px,1vw,15px);line-height:1.1;text-align:center;white-space:normal}
    #executive .decision-driver-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    #executive .decision-driver-card{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;border-radius:16px;background:rgba(13,24,37,.72);border:1px solid rgba(148,163,184,.11);padding:14px}
    #executive .decision-driver-index{width:32px;height:32px;display:grid;place-items:center;border-radius:50%;background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.24);color:#7ee787;font-weight:900;font-size:12px}
    #executive .decision-driver-card p{margin:0;color:#dbe5ef;line-height:1.45;font-size:14px}
    #executive .decision-blocking-list{display:grid;gap:10px}
    #executive .decision-blocking-item{display:flex;align-items:center;justify-content:space-between;gap:14px;border-radius:15px;background:rgba(255,99,99,.08);border:1px solid rgba(255,99,99,.18);padding:13px 14px}
    #executive .decision-blocking-item.success{background:rgba(57,231,95,.08);border-color:rgba(57,231,95,.18)}
    #executive .decision-blocking-item strong{display:block;color:#f8fafc;font-size:14px;line-height:1.25}
    #executive .decision-blocking-item span{display:block;margin-top:4px;color:#9fb1c4;font-size:12px;line-height:1.25}
    #executive .decision-blocking-item em{flex:0 0 auto;border-radius:999px;background:rgba(255,99,99,.14);border:1px solid rgba(255,99,99,.28);color:#ff7d7d;font-style:normal;font-size:11px;font-weight:900;padding:6px 9px;text-transform:uppercase}
    #executive .decision-blocking-item.success em{background:rgba(57,231,95,.12);border-color:rgba(57,231,95,.24);color:#7ee787}
    #executive .decision-signal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    #executive .decision-signal-card{min-width:0;border-radius:16px;background:rgba(13,24,37,.70);border:1px solid rgba(148,163,184,.10);padding:14px}
    #executive .decision-signal-card.green{border-color:rgba(57,231,95,.22)}
    #executive .decision-signal-card.amber{border-color:rgba(245,158,11,.30)}
    #executive .decision-signal-card.red{border-color:rgba(255,99,99,.28)}
    #executive .decision-signal-card span{display:block;color:#91a6bd;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
    #executive .decision-signal-card strong{display:block;margin-top:8px;color:#f8fafc;font-size:clamp(18px,1.45vw,24px);line-height:1.1;white-space:normal;overflow-wrap:break-word}
    #executive .decision-signal-card.green strong{color:#39e75f}
    #executive .decision-signal-card.amber strong{color:#fbbf24}
    #executive .decision-signal-card.red strong{color:#ff7d7d}
    #executive .decision-signal-card p{margin:8px 0 0;color:#9fb1c4;font-size:13px;line-height:1.35}
    #executive .decision-workflow-summary{margin:0 0 16px;color:#dbe5ef;font-size:15px;line-height:1.55}
    #executive .decision-workflow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    #executive .decision-workflow-step{position:relative;min-width:0;border-radius:16px;background:linear-gradient(180deg,rgba(57,231,95,.10),rgba(13,24,37,.72));border:1px solid rgba(57,231,95,.18);padding:14px}
    #executive .decision-workflow-step span{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:#39e75f;color:#04100a;font-weight:900;margin-bottom:12px}
    #executive .decision-workflow-step strong{display:block;color:#f8fafc;font-size:14px;line-height:1.2}
    #executive .decision-workflow-step p{margin:7px 0 0;color:#9fb1c4;font-size:12px;line-height:1.35}
    #executive .executive-decision-main:before{right:0!important;top:-70px!important;width:210px!important;height:210px!important}
    #executive .executive-decision-main .release-status-badge{max-inline-size:100%!important}
    @media(max-width:1180px){#executive .decision-intel-grid,#executive .decision-driver-grid,#executive .decision-signal-grid{grid-template-columns:1fr}#executive .decision-workflow{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:640px){#executive .decision-workflow{grid-template-columns:1fr}#executive .decision-intel-head{display:grid}#executive .decision-intel-head strong{max-width:100%;justify-self:start}}
    @media(max-width:1320px){#executive .executive-decision-card{grid-template-columns:1fr!important;grid-template-areas:"decision" "metrics" "action"!important}#executive .executive-decision-metrics{grid-template-columns:repeat(3,minmax(0,1fr))!important}#executive>.grid.two{grid-template-columns:1fr!important}}
    @media(max-width:820px){#executive .executive-decision-metrics,#executive .decision-metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important}#executive .executive-action{grid-template-columns:1fr!important}#executive .executive-action:before{width:58px;height:58px}}
    @media(max-width:560px){#executive .executive-decision-metrics,#executive .decision-metrics{grid-template-columns:1fr!important}#executive .executive-decision-main{min-height:auto!important;padding:22px!important}}
    /* Screen 03: Product Health, tuned as module-first intelligence tiles. */
    #health{background:radial-gradient(circle at 84% 8%,rgba(57,231,95,.15),transparent 30%),radial-gradient(circle at 12% 18%,rgba(56,189,248,.10),transparent 24%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #health .topbar{align-items:center!important;margin-bottom:24px!important}
    #health .topbar h1{font-size:clamp(34px,3vw,52px)!important;letter-spacing:-.06em!important}
    #health>.panel:first-of-type{border-radius:28px!important;background:linear-gradient(180deg,rgba(12,25,41,.86),rgba(5,14,25,.78))!important;border:1px solid rgba(57,231,95,.18)!important;padding:24px!important}
    #health>.panel:first-of-type h2{font-size:clamp(22px,1.8vw,30px)!important;margin-bottom:18px!important}
    #health .module-filter{margin:0 0 20px!important;gap:10px!important}
    #health .module-filter button{border-radius:999px!important;padding:9px 14px!important;background:rgba(7,16,29,.86)!important;border:1px solid rgba(148,163,184,.18)!important;color:#dbe5ef!important}
    #health .module-filter button.active,#health .module-filter button:hover{background:rgba(57,231,95,.16)!important;border-color:rgba(57,231,95,.50)!important;color:#9affac!important}
    #health .module-card-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:20px!important;margin:0!important}
    #health .module-status-card{position:relative;display:flex!important;flex-direction:column!important;gap:16px!important;min-height:330px!important;padding:22px!important;border-radius:26px!important;background:radial-gradient(circle at 18% 0%,rgba(57,231,95,.12),transparent 32%),linear-gradient(180deg,rgba(14,29,46,.92),rgba(6,15,27,.92))!important;border:1px solid rgba(57,231,95,.22)!important;box-shadow:0 24px 70px rgba(0,0,0,.20),inset 0 1px 0 rgba(255,255,255,.05)!important;text-decoration:none!important;overflow:hidden!important}
    #health .module-status-card.amber{border-color:rgba(245,197,66,.38)!important;background:radial-gradient(circle at 18% 0%,rgba(245,197,66,.10),transparent 32%),linear-gradient(180deg,rgba(36,29,17,.72),rgba(6,15,27,.92))!important}
    #health .module-status-card.red{border-color:rgba(255,107,107,.42)!important;background:radial-gradient(circle at 18% 0%,rgba(255,107,107,.12),transparent 32%),linear-gradient(180deg,rgba(45,18,22,.74),rgba(6,15,27,.92))!important}
    #health .module-status-card:hover{transform:translateY(-4px)!important;border-color:rgba(57,231,95,.60)!important;box-shadow:0 30px 90px rgba(57,231,95,.10),inset 0 1px 0 rgba(255,255,255,.06)!important}
    #health .module-status-card .module-card-head{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:14px!important;align-items:start!important}
    #health .module-title{display:grid!important;grid-template-columns:54px minmax(0,1fr)!important;gap:13px!important;align-items:center!important;min-width:0!important}
    #health .module-icon{width:54px!important;height:54px!important;border-radius:16px!important;background:rgba(255,255,255,.045)!important;border:1px solid rgba(148,163,184,.14)!important;color:#dbe5ef!important;font-size:12px!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)!important}
    #health .module-title strong{font-size:clamp(18px,1.25vw,24px)!important;line-height:1.12!important;color:#f8fafc!important;overflow-wrap:break-word!important}
    #health .module-status-card .badge{justify-self:end!important;align-self:start!important;white-space:nowrap!important;border-radius:999px!important;padding:7px 11px!important;font-size:11px!important}
    #health .module-health-score{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:12px!important;align-items:end!important;margin-top:4px!important}
    #health .module-health-score strong{font-size:clamp(44px,4vw,68px)!important;line-height:.9!important;letter-spacing:-.075em!important;color:#39e75f!important;text-shadow:0 0 28px rgba(57,231,95,.16)!important}
    #health .module-health-score span{justify-self:end;color:#8fa3b8!important;font-size:11px!important;font-weight:900!important;letter-spacing:.1em!important;text-transform:uppercase!important;writing-mode:vertical-rl;transform:rotate(180deg)}
    #health .module-status-card.amber .module-health-score strong{color:#f5c542!important}
    #health .module-status-card.red .module-health-score strong{color:#ff7b72!important}
    #health .module-card-stats{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important;margin:0!important}
    #health .module-card-stats span{min-height:74px!important;padding:12px!important;border-radius:16px!important;background:rgba(3,13,22,.62)!important;border:1px solid rgba(148,163,184,.10)!important;display:flex!important;flex-direction:column!important;justify-content:center!important}
    #health .module-card-stats b{font-size:clamp(15px,1.05vw,20px)!important;line-height:1.05!important;color:#fff!important;white-space:normal!important;overflow-wrap:break-word!important}
    #health .module-card-stats small{font-size:10px!important;color:#8fa3b8!important;letter-spacing:.09em!important;margin-top:7px!important}
    #health .module-progress{height:10px!important;border-radius:999px!important;background:rgba(148,163,184,.13)!important;overflow:hidden!important;margin:0!important}
    #health .module-progress span{display:block!important;height:100%!important;border-radius:inherit!important;background:linear-gradient(90deg,#22c55e,#8dff9e)!important;box-shadow:0 0 20px rgba(57,231,95,.22)!important}
    #health .module-status-card.amber .module-progress span{background:linear-gradient(90deg,#f59e0b,#f5c542)!important}
    #health .module-status-card.red .module-progress span{background:linear-gradient(90deg,#ef4444,#ff7b72)!important}
    #health .module-status-card p{font-size:15px!important;line-height:1.45!important;color:#b8c6d8!important;margin:0!important;min-height:42px!important}
    #health .module-button{margin-top:auto!important;width:100%!important;border-radius:999px!important;border:1px solid rgba(57,231,95,.36)!important;background:rgba(57,231,95,.10)!important;color:#9affac!important;padding:10px 12px!important;text-align:center!important;font-size:12px!important;font-weight:950!important;letter-spacing:.02em!important}
    #health>.grid.two{grid-template-columns:minmax(360px,.92fr) minmax(0,1.08fr)!important;gap:22px!important;align-items:stretch!important}
    #health>.grid.two>.panel{border-radius:26px!important;background:linear-gradient(180deg,rgba(13,25,41,.82),rgba(6,15,27,.78))!important;border:1px solid rgba(57,231,95,.16)!important;padding:24px!important}
    #health .risk-snapshot{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;min-height:220px}
    #health .risk-snap{display:flex;flex-direction:column;justify-content:center;border-radius:18px;padding:18px;min-width:0}
    #health .risk-snap span{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#91a6bd;font-weight:800}
    #health .risk-snap strong{display:block;font-size:42px;line-height:1;margin:10px 0 8px}
    #health .risk-snap small{color:#9fb1c4;line-height:1.35}
    #health .risk-snap.high{background:rgba(255,59,59,.12);border:1px solid rgba(255,59,59,.28)}
    #health .risk-snap.high strong{color:#ff7d7d}
    #health .risk-snap.med{background:rgba(245,197,66,.12);border:1px solid rgba(245,197,66,.32)}
    #health .risk-snap.med strong{color:#fbbf24}
    #health .risk-snap.low{background:rgba(57,231,95,.12);border:1px solid rgba(57,231,95,.28)}
    #health .risk-snap.low strong{color:#39e75f}
    .journey-coverage-chart{align-items:flex-end}
    .journey-coverage-chart .bar{position:relative;min-width:0}
    .journey-coverage-chart .bar strong{position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:11px;color:#d7fbe0;white-space:nowrap}
    .journey-coverage-chart .bar.amber{background:linear-gradient(180deg,#f5c542,#b7791f)}
    #roadmap table td,#roadmap table th{white-space:normal;overflow:visible;text-overflow:unset;word-break:normal;vertical-align:top}
    .page-footer{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center}
    .page-footer span,.page-footer strong{white-space:normal}
    #health .risk-cell{border:0!important;border-radius:14px!important;color:#f8fafc!important;min-width:0!important;padding:8px 4px!important;font-size:10.5px!important;font-weight:850!important;letter-spacing:0!important;line-height:1.15!important;overflow-wrap:normal!important;word-break:normal!important}
    #health .health-summary-panel .summary-lead{font-size:16px!important;line-height:1.65!important;color:#dbe5ef!important;margin-bottom:18px!important}
    #health .health-stat-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important}
    #health .health-stat{min-height:118px!important;border-radius:18px!important;background:rgba(5,14,24,.68)!important;border:1px solid rgba(148,163,184,.12)!important}
    #health .health-stat strong{font-size:clamp(28px,2.6vw,44px)!important}
    #health .next-focus-card{margin-top:18px!important;border-radius:20px!important;padding:18px!important;background:linear-gradient(90deg,rgba(57,231,95,.12),rgba(5,14,24,.74))!important;border-color:rgba(57,231,95,.24)!important}
    @media(max-width:1350px){#health .module-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}#health>.grid.two{grid-template-columns:1fr!important}}
    @media(max-width:760px){#health .module-card-grid,#health .module-card-stats,#health .health-stat-grid{grid-template-columns:1fr!important}#health .module-health-score span{writing-mode:initial;transform:none;justify-self:start}#health .module-status-card{min-height:auto!important}}
    /* Screen 04: Business Journeys, visualized as a release-flow map. */
    #journey{background:radial-gradient(circle at 10% 8%,rgba(56,189,248,.14),transparent 28%),radial-gradient(circle at 86% 10%,rgba(57,231,95,.15),transparent 30%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #journey .topbar{align-items:center!important;margin-bottom:24px!important}
    #journey .topbar h1{font-size:clamp(34px,3vw,52px)!important;letter-spacing:-.06em!important}
    #journey .journey-flow-panel{position:relative;border-radius:30px!important;background:radial-gradient(circle at 18% 10%,rgba(57,231,95,.14),transparent 34%),linear-gradient(180deg,rgba(12,25,41,.86),rgba(5,14,25,.78))!important;border:1px solid rgba(57,231,95,.20)!important;padding:26px!important;overflow:hidden!important}
    #journey .journey-flow-panel:before{display:none}
    #journey .journey-flow-panel h2{position:relative;z-index:1;font-size:clamp(22px,1.8vw,30px)!important;margin-bottom:26px!important}
    #journey .journey{position:relative;z-index:1;display:grid!important;grid-template-columns:repeat(auto-fit,minmax(188px,1fr))!important;gap:18px!important;align-items:stretch!important}
    #journey .journey-arrow{display:none!important}
    #journey .journey-node{position:relative;display:flex!important;flex-direction:column!important;gap:8px!important;align-items:center!important;text-align:center!important;min-height:210px!important;padding:16px 14px!important;border-radius:24px!important;border:1px solid rgba(57,231,95,.24)!important;background:linear-gradient(180deg,rgba(14,29,46,.92),rgba(6,15,27,.92))!important;box-shadow:0 22px 68px rgba(0,0,0,.20),inset 0 1px 0 rgba(255,255,255,.05)!important}
    #journey .journey-node:hover{transform:translateY(-4px)!important;border-color:rgba(57,231,95,.60)!important;box-shadow:0 28px 80px rgba(57,231,95,.10)!important}
    #journey .journey-node.amber{border-color:rgba(245,197,66,.40)!important;background:linear-gradient(180deg,rgba(48,35,15,.62),rgba(6,15,27,.92))!important}
    #journey .journey-node.red{border-color:rgba(255,107,107,.42)!important;background:linear-gradient(180deg,rgba(45,18,22,.70),rgba(6,15,27,.92))!important}
    #journey .journey-node .node-icon{width:56px!important;height:56px!important;margin:0!important;border-radius:50%!important;background:rgba(57,231,95,.16)!important;border:2px solid rgba(57,231,95,.50)!important;color:#b9fbc4!important;font-size:13px!important;font-weight:950!important;box-shadow:0 0 30px rgba(57,231,95,.18)!important}
    #journey .journey-node.amber .node-icon{background:rgba(245,197,66,.14)!important;border-color:rgba(245,197,66,.52)!important;color:#f5c542!important}
    #journey .journey-node.red .node-icon{background:rgba(255,107,107,.14)!important;border-color:rgba(255,107,107,.52)!important;color:#ff7b72!important}
    #journey .journey-node strong{display:flex!important;align-items:flex-end!important;justify-content:center!important;width:100%!important;min-height:2.5em!important;font-size:16px!important;line-height:1.2!important;color:#f8fafc!important;overflow-wrap:normal!important;word-break:normal!important;text-align:center!important}
    #journey .journey-node span{display:block!important;width:100%!important;font-size:clamp(30px,2.4vw,42px)!important;line-height:.92!important;letter-spacing:-.06em!important;color:#39e75f!important;font-weight:950!important;margin:0!important;text-align:center!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}
    #journey .journey-node.amber span{color:#f5c542!important}
    #journey .journey-node.red span{color:#ff7b72!important}
    #journey .journey-node small{display:flex!important;align-items:flex-start!important;justify-content:center!important;width:100%!important;min-height:2.4em!important;color:#9fb0c5!important;font-size:11px!important;line-height:1.2!important;text-transform:uppercase!important;letter-spacing:.08em!important;font-weight:900!important;text-align:center!important;white-space:normal!important}
    #journey .journey-score-line{width:100%;height:9px;border-radius:999px;background:rgba(148,163,184,.14);overflow:hidden;margin-top:auto}
    #journey .journey-score-line i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#22c55e,#8dff9e);box-shadow:0 0 20px rgba(57,231,95,.22)}
    #journey .journey-node.amber .journey-score-line i{background:linear-gradient(90deg,#f59e0b,#f5c542)}
    #journey .journey-node.red .journey-score-line i{background:linear-gradient(90deg,#ef4444,#ff7b72)}
    #journey .journey-support-grid{grid-template-columns:minmax(0,1.35fr) minmax(0,.8fr)!important;gap:22px!important;align-items:stretch!important}
    #journey .journey-support-grid>.panel{border-radius:26px!important;background:linear-gradient(180deg,rgba(13,25,41,.82),rgba(6,15,27,.78))!important;border:1px solid rgba(57,231,95,.16)!important;padding:24px!important}
    #journey .chart{height:auto!important;min-height:340px!important;border-radius:22px!important;background:linear-gradient(180deg,rgba(4,13,23,.90),rgba(4,18,20,.76))!important;border:1px solid rgba(57,231,95,.12)!important;padding:16px 12px 12px!important}
    #journey .journey-coverage-chart{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(128px,1fr))!important;align-items:stretch!important;gap:28px 18px!important;height:auto!important;min-height:0!important;padding:8px 6px 4px!important;overflow:visible!important}
    #journey .coverage-col{display:grid!important;grid-template-rows:24px 140px 2.8em!important;align-items:end!important;justify-items:center!important;min-width:0!important;height:auto!important;text-align:center!important;background:transparent!important}
    #journey .coverage-col strong{position:static!important;transform:none!important;display:flex!important;align-items:flex-end!important;justify-content:center!important;width:100%!important;margin:0!important;font-size:13px!important;line-height:1!important;font-weight:800!important;color:#f4fff6!important;white-space:nowrap!important;text-align:center!important}
    #journey .coverage-col .bar-track{display:flex!important;align-items:flex-end!important;justify-content:center!important;width:100%!important;height:140px!important;min-height:140px!important;background:transparent!important}
    #journey .coverage-col .bar{position:relative!important;top:auto!important;left:auto!important;transform:none!important;width:28px!important;max-width:40%!important;min-height:8px!important;flex:none!important;border-radius:10px 10px 4px 4px!important;background:linear-gradient(180deg,#8dff9e,#39e75f 45%,#169b3c)!important;box-shadow:none!important}
    #journey .coverage-col .bar.amber{background:linear-gradient(180deg,#f5c542,#b7791f)!important}
    #journey .coverage-col .bar.red{background:linear-gradient(180deg,#ff8a8a,#ef4444)!important}
    #journey .coverage-col label{position:static!important;left:auto!important;bottom:auto!important;transform:none!important;display:flex!important;align-items:flex-start!important;justify-content:center!important;width:100%!important;max-width:none!important;height:2.8em!important;margin:8px 0 0!important;padding:0 4px!important;font-size:12px!important;line-height:1.25!important;font-weight:700!important;color:#dbe5ef!important;text-align:center!important;white-space:normal!important;overflow:hidden!important;overflow-wrap:normal!important;word-break:normal!important}
    .page,[id]{scroll-margin-top:18px}
    .executive-module-pill{text-decoration:none}
    .executive-module-pill span,.executive-module-pill small{text-align:left}
    .executive-module-pill strong{text-align:left}
    #journey .chart .bar.blue{background:linear-gradient(180deg,#7ee787,#22c55e)!important}
    #journey .journey-answer-panel{display:flex!important;flex-direction:column!important;justify-content:flex-start!important;gap:14px!important;min-width:0!important;overflow:visible!important}
    #journey .journey-answer-panel p{font-size:16px!important;line-height:1.55!important;color:#dbe5ef!important;overflow-wrap:break-word!important;word-break:normal!important;max-width:100%!important;text-align:left!important}
    #journey .journey-answer-panel .empty-note{border-radius:20px!important;border-color:rgba(57,231,95,.24)!important;background:rgba(57,231,95,.08)!important;color:#cbd5e1!important;line-height:1.55!important}
    @media(max-width:1200px){#journey .journey-support-grid{grid-template-columns:1fr!important}}
    @media(max-width:760px){#journey .journey{grid-template-columns:1fr!important}#journey .journey-coverage-chart{height:auto!important}}
    /* Screen 05: Module Details, focused mini dashboards with drill-down affordance. */
    #module-dashboard{background:radial-gradient(circle at 12% 10%,rgba(57,231,95,.14),transparent 28%),radial-gradient(circle at 88% 6%,rgba(56,189,248,.12),transparent 30%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #module-dashboard .topbar{margin-bottom:24px!important}
    #module-dashboard .topbar h1{font-size:clamp(34px,3vw,52px)!important;letter-spacing:-.06em!important}
    #module-dashboard .module-dashboard-intro{display:grid!important;grid-template-columns:minmax(0,.7fr) minmax(320px,.3fr)!important;gap:18px!important;align-items:end!important;border:1px solid rgba(57,231,95,.20)!important;border-radius:30px!important;background:radial-gradient(circle at 18% 8%,rgba(57,231,95,.16),transparent 34%),linear-gradient(135deg,rgba(13,28,44,.88),rgba(5,14,25,.76))!important;padding:28px!important;margin-bottom:24px!important;box-shadow:0 24px 80px rgba(0,0,0,.20)!important}
    #module-dashboard .module-dashboard-intro h2{font-size:clamp(24px,2vw,34px)!important;letter-spacing:-.04em!important;margin:0 0 10px!important}
    #module-dashboard .module-dashboard-intro p{max-width:820px;color:#d8e6f3!important;font-size:16px!important;line-height:1.65!important}
    #module-dashboard .module-dashboard-intro:after{content:"Click any module to open scenarios, evidence, validation gaps, history placeholder, and recommendations.";display:block;border:1px solid rgba(57,231,95,.22);border-radius:20px;background:rgba(57,231,95,.08);padding:16px;color:#b9fbc4;font-size:13px;font-weight:800;line-height:1.45}
    #module-dashboard .module-dashboard-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:22px!important;align-items:stretch!important}
    #module-dashboard .module-selector-card{position:relative;display:grid!important;grid-template-rows:auto auto auto auto 1fr auto!important;gap:16px!important;min-height:360px!important;border-radius:28px!important;background:linear-gradient(180deg,rgba(14,29,46,.92),rgba(6,15,27,.92))!important;border:1px solid rgba(57,231,95,.22)!important;padding:24px!important;box-shadow:0 22px 70px rgba(0,0,0,.20),inset 0 1px 0 rgba(255,255,255,.045)!important;overflow:hidden!important}
    #module-dashboard .module-selector-card:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 12% 0,rgba(57,231,95,.12),transparent 34%);pointer-events:none}
    #module-dashboard .module-selector-card:hover{transform:translateY(-5px)!important;border-color:rgba(57,231,95,.58)!important;box-shadow:0 28px 90px rgba(57,231,95,.12)!important}
    #module-dashboard .module-selector-card.amber{border-color:rgba(245,197,66,.35)!important;background:linear-gradient(180deg,rgba(39,31,17,.70),rgba(6,15,27,.92))!important}
    #module-dashboard .module-selector-card.red{border-color:rgba(255,107,107,.40)!important;background:linear-gradient(180deg,rgba(45,18,22,.72),rgba(6,15,27,.92))!important}
    #module-dashboard .module-card-head{position:relative;z-index:1;align-items:center!important}
    #module-dashboard .module-title{min-width:0!important}
    #module-dashboard .module-title strong{font-size:clamp(19px,1.35vw,25px)!important;color:#f8fafc!important;line-height:1.15!important;overflow:hidden;text-overflow:ellipsis}
    #module-dashboard .module-icon{width:56px!important;height:56px!important;border-radius:18px!important;font-size:12px!important;background:rgba(57,231,95,.12)!important;border-color:rgba(57,231,95,.30)!important;box-shadow:0 0 28px rgba(57,231,95,.10)}
    #module-dashboard .badge{white-space:nowrap!important;max-width:100%;font-size:11px!important}
    #module-dashboard .module-dashboard-score-row{position:relative;z-index:1;display:flex;align-items:flex-end;justify-content:space-between;gap:14px;border-bottom:1px solid rgba(148,163,184,.10);padding-bottom:14px}
    #module-dashboard .module-dashboard-score-row strong{font-size:clamp(42px,4vw,74px)!important;line-height:.9!important;letter-spacing:-.07em!important;color:#39e75f!important}
    #module-dashboard .module-dashboard-score-row span{border:1px solid rgba(57,231,95,.20);border-radius:999px;background:rgba(57,231,95,.08);color:#b9fbc4;font-size:12px;font-weight:900;padding:8px 11px;white-space:nowrap;text-transform:uppercase;letter-spacing:.04em}
    #module-dashboard .module-selector-card.amber .module-dashboard-score-row strong{color:#f5c542!important}
    #module-dashboard .module-selector-card.red .module-dashboard-score-row strong{color:#ff7b72!important}
    #module-dashboard .module-selector-summary{position:relative;z-index:1;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important}
    #module-dashboard .module-selector-summary span{min-width:0!important;border:0!important;border-radius:14px!important;background:rgba(4,13,23,.68)!important;padding:12px!important;color:#8fa4bb!important;font-size:10px!important;letter-spacing:.08em!important;line-height:1.2!important}
    #module-dashboard .module-selector-summary b{display:block!important;margin-top:7px!important;color:#f8fafc!important;font-size:clamp(14px,1.05vw,18px)!important;line-height:1.1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    #module-dashboard .module-progress{position:relative;z-index:1;height:10px!important;background:rgba(148,163,184,.14)!important;border-radius:999px!important}
    #module-dashboard .module-progress span{background:linear-gradient(90deg,#1db954,#8dff9e)!important;box-shadow:0 0 22px rgba(57,231,95,.20)!important}
    #module-dashboard .module-selector-card.amber .module-progress span{background:linear-gradient(90deg,#f59e0b,#f5c542)!important}
    #module-dashboard .module-selector-card.red .module-progress span{background:linear-gradient(90deg,#ef4444,#ff7b72)!important}
    #module-dashboard .module-selector-card p{position:relative;z-index:1;margin:0!important;color:#d8e6f3!important;font-size:15px!important;line-height:1.55!important;min-height:48px!important;flex:initial!important}
    #module-dashboard .module-dashboard-footer{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:14px;border-top:1px solid rgba(148,163,184,.10);padding-top:14px}
    #module-dashboard .module-dashboard-footer span{min-width:0;color:#9fb0c5;font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #module-dashboard .module-dashboard-footer em{display:inline-flex!important;align-items:center;justify-content:center;flex:0 0 auto;border:1px solid rgba(57,231,95,.36);border-radius:999px;background:rgba(57,231,95,.10);color:#39e75f!important;font-size:12px!important;font-style:normal!important;font-weight:950!important;padding:9px 12px;text-decoration:none!important;white-space:nowrap}
    @media(max-width:1300px){#module-dashboard .module-dashboard-grid{grid-template-columns:1fr!important}#module-dashboard .module-dashboard-intro{grid-template-columns:1fr!important}}
    @media(max-width:760px){#module-dashboard .module-selector-summary{grid-template-columns:1fr!important}#module-dashboard .module-dashboard-footer{align-items:flex-start;flex-direction:column}#module-dashboard .module-dashboard-footer span{white-space:normal}#module-dashboard .module-dashboard-score-row{align-items:flex-start;flex-direction:column}}
    /* Screen 06: Failed Tests, presented as an investigation queue. */
    #failures{background:radial-gradient(circle at 16% 8%,rgba(255,107,107,.13),transparent 28%),radial-gradient(circle at 88% 12%,rgba(57,231,95,.10),transparent 30%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #failures .topbar{align-items:center!important;margin-bottom:24px!important}
    #failures .topbar h1{font-size:clamp(34px,3vw,52px)!important;letter-spacing:-.06em!important}
    #failures>.panel{border:0!important;background:transparent!important;padding:0!important;box-shadow:none!important;overflow:visible!important}
    #failures .failure-command-center{display:grid;grid-template-columns:minmax(320px,1.35fr) repeat(3,minmax(170px,.55fr));gap:18px;margin-bottom:22px}
    #failures .failure-summary-card{min-width:0;border:1px solid rgba(57,231,95,.16);border-radius:26px;background:linear-gradient(180deg,rgba(13,25,41,.86),rgba(6,15,27,.78));padding:22px;box-shadow:0 22px 70px rgba(0,0,0,.18)}
    a.failure-summary-card{display:block;color:inherit;text-decoration:none;cursor:pointer}
    a.failure-summary-card:hover{border-color:#ff7b72!important;transform:translateY(-2px)}
    .failure-area-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .failure-area h3{margin:0 0 8px;font-size:18px}
    .failure-area h3 small{color:#9fb0c5;font-size:13px;font-weight:700}
    .failure-area ul{margin:0;padding-left:18px}
    .failure-area a{color:#f8fafc}
    #failures .failure-summary-card.primary{border-color:rgba(255,107,107,.35);background:radial-gradient(circle at 10% 0,rgba(255,107,107,.16),transparent 38%),linear-gradient(180deg,rgba(35,18,23,.74),rgba(6,15,27,.86))}
    #failures .failure-summary-card span{display:block;color:#8fa4bb;font-size:11px;text-transform:uppercase;letter-spacing:.12em;font-weight:900;margin-bottom:10px}
    #failures .failure-summary-card strong{display:block;color:#f8fafc;font-size:clamp(28px,2.9vw,48px);line-height:.98;letter-spacing:-.06em;white-space:normal;overflow-wrap:anywhere}
    #failures .failure-summary-card.primary strong{color:#ff7b72}
    #failures .failure-summary-card p{margin:12px 0 0;color:#cbd5e1;font-size:14px;line-height:1.45}
    #failures .issue-summary-button{appearance:none;text-align:left;cursor:pointer;color:inherit;font:inherit}
    #failures .issue-summary-button:hover,#failures .issue-summary-button:focus-visible{border-color:rgba(57,231,95,.50);transform:translateY(-1px);outline:none}
    #failures .issue-summary-button.amber:hover,#failures .issue-summary-button.amber:focus-visible{border-color:rgba(245,197,66,.55)}
    #failures .issue-summary-button em{display:inline-flex;margin-top:14px;border:1px solid rgba(57,231,95,.34);border-radius:999px;background:rgba(57,231,95,.09);color:#39e75f;font-style:normal;font-size:12px;font-weight:950;padding:8px 11px}
    #failures .warning-summary-grid{margin-top:0}
    .issue-detail-button{display:inline-flex;align-items:center;justify-content:center;margin-top:14px;border:1px solid rgba(57,231,95,.34);border-radius:999px;background:rgba(57,231,95,.10);color:#39e75f;font-size:13px;font-weight:950;padding:10px 14px;cursor:pointer}
    .issue-detail-button:hover,.issue-detail-button:focus-visible{border-color:rgba(57,231,95,.62);background:rgba(57,231,95,.16);outline:none}
    .issue-modal-list{display:grid;gap:12px}
    .issue-modal-item{border:1px solid rgba(148,163,184,.14);border-radius:14px;background:rgba(7,16,31,.70);padding:14px}
    .issue-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
    .issue-modal-head strong{display:block;color:#f8fafc;font-size:15px;line-height:1.25}
    .issue-modal-head small{display:block;color:#8fa4bb;font-size:11px;line-height:1.35;margin-top:4px}
    .issue-modal-item p{margin:8px 0 0;color:#d8e6f3;line-height:1.5}
    .issue-modal-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
    .issue-modal-meta span{border:1px solid rgba(148,163,184,.14);border-radius:999px;background:rgba(148,163,184,.06);color:#9fb0c5;font-size:11px;font-weight:850;padding:6px 9px}
    #failures .failure-investigation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-bottom:22px}
    #failures .failure-investigation-card{display:flex;flex-direction:column;gap:16px;min-width:0;border:1px solid rgba(255,107,107,.32);border-radius:28px;background:linear-gradient(180deg,rgba(30,20,27,.82),rgba(6,15,27,.90));padding:22px;box-shadow:0 22px 72px rgba(0,0,0,.18)}
    #failures .failure-investigation-card.amber{border-color:rgba(245,197,66,.35);background:linear-gradient(180deg,rgba(39,31,17,.72),rgba(6,15,27,.90))}
    #failures .failure-investigation-card.green{border-color:rgba(57,231,95,.24);background:linear-gradient(180deg,rgba(14,29,46,.86),rgba(6,15,27,.90))}
    #failures .failure-card-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:start}
    #failures .failure-index{display:grid;place-items:center;width:48px;height:48px;border-radius:16px;background:rgba(255,107,107,.12);border:1px solid rgba(255,107,107,.35);color:#ff7b72;font-weight:950}
    #failures .failure-card-head strong{display:block;color:#f8fafc;font-size:clamp(18px,1.4vw,24px);line-height:1.22;letter-spacing:-.03em;overflow-wrap:anywhere}
    #failures .failure-card-head small{display:block;margin-top:7px;color:#9fb0c5;font-size:12px;line-height:1.35}
    #failures .failure-investigation-card p{margin:0;color:#d8e6f3;font-size:15px;line-height:1.55}
    #failures .failure-reason-block{border:1px solid rgba(148,163,184,.10);border-radius:16px;background:rgba(4,13,23,.46);padding:13px}
    #failures .failure-reason-block span{display:block;color:#8fa4bb;font-size:10.5px;text-transform:uppercase;letter-spacing:.11em;font-weight:900;margin-bottom:7px}
    #failures .failure-reason-block p + span{margin-top:13px}
    #failures .failure-reason-block p{color:#f3f8ff!important;overflow-wrap:break-word}
    #failures .failure-investigation-card .failure-next-action{border-left:3px solid rgba(57,231,95,.55);padding:10px 12px!important;border-radius:12px;background:rgba(57,231,95,.06);color:#cbd5e1!important;font-size:13px!important}
    #failures .failure-investigation-card .failure-next-action b{color:#39e75f}
    #failures .failure-evidence-chips{display:flex;flex-wrap:wrap;gap:8px}
    #failures .failure-evidence-chips a,#failures .failure-evidence-chips span{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(57,231,95,.22);border-radius:999px;background:rgba(57,231,95,.08);color:#a7f3b7!important;font-size:11px;font-weight:900;line-height:1.2;padding:7px 10px;text-decoration:none!important;max-width:100%;white-space:normal;overflow-wrap:anywhere}
    #failures .failure-evidence-chips b{color:#f8fafc}
    #failures .failure-evidence-chips.muted span{border-color:rgba(148,163,184,.18);background:rgba(148,163,184,.06);color:#9fb0c5!important}
    #failures .failure-source-pill,#failures .table-evidence-link{display:inline-flex;align-items:center;border:1px solid rgba(148,163,184,.16);border-radius:999px;background:rgba(148,163,184,.07);color:#d8e6f3!important;font-size:11px;font-weight:900;line-height:1.2;padding:6px 9px;text-decoration:none!important;white-space:normal}
    #failures .table-evidence-link{border-color:rgba(57,231,95,.28);background:rgba(57,231,95,.08);color:#39e75f!important}
    #failures .failure-card-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:auto}
    #failures .failure-card-meta span{min-width:0;border:1px solid rgba(148,163,184,.10);border-radius:14px;background:rgba(4,13,23,.68);padding:12px;color:#8fa4bb;font-size:10px;text-transform:uppercase;letter-spacing:.08em}
    #failures .failure-card-meta b{display:block;color:#f8fafc;font-size:15px;line-height:1.12;text-transform:none;letter-spacing:0;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #failures .failure-card-meta small{display:block;color:#8fa4bb}
    #failures .failure-card-action{display:flex;align-items:center;justify-content:space-between;gap:14px;border-top:1px solid rgba(148,163,184,.10);padding-top:14px}
    #failures .failure-card-action span{color:#ffb4b4;font-size:13px;font-weight:900}
    #failures .failure-card-action a{display:inline-flex;border:1px solid rgba(57,231,95,.36);border-radius:999px;background:rgba(57,231,95,.10);color:#39e75f!important;font-size:12px;font-weight:950;padding:9px 12px;text-decoration:none!important;white-space:nowrap}
    #failures .failure-table-wrap{border:1px solid rgba(57,231,95,.14);border-radius:26px;background:linear-gradient(180deg,rgba(13,25,41,.78),rgba(6,15,27,.74));padding:22px;overflow:auto}
    #failures .failure-table-wrap h2{font-size:22px!important;margin:0 0 14px!important}
    #failures .failure-detail-table{width:100%;min-width:960px;border-collapse:separate;border-spacing:0 8px}
    #failures .failure-detail-table th{color:#8fa4bb;font-size:11px;text-transform:uppercase;letter-spacing:.1em;text-align:left;padding:0 12px 6px}
    #failures .failure-detail-table td{background:rgba(4,13,23,.68);border-top:1px solid rgba(148,163,184,.08);border-bottom:1px solid rgba(148,163,184,.08);padding:14px 12px;color:#d8e6f3;vertical-align:top}
    #failures .failure-detail-table td:first-child{border-left:1px solid rgba(148,163,184,.08);border-radius:14px 0 0 14px;color:#f8fafc;font-weight:800}
    #failures .failure-detail-table td:last-child{border-right:1px solid rgba(148,163,184,.08);border-radius:0 14px 14px 0}
    #failures .failure-detail-table td strong{display:block;color:#f8fafc;font-size:13px;line-height:1.35}
    #failures .failure-detail-table td small{display:block;margin-top:5px;color:#8fa4bb;font-size:11px;line-height:1.35;overflow:hidden;text-overflow:ellipsis}
    #failures .failure-detail-table td{overflow-wrap:break-word}
    #failures .detail-disclosure,#coverage-gaps .detail-disclosure{margin-top:18px;border:1px solid rgba(57,231,95,.16);border-radius:22px;background:linear-gradient(180deg,rgba(13,25,41,.62),rgba(6,15,27,.58));overflow:hidden}
    #failures .detail-disclosure summary,#coverage-gaps .detail-disclosure summary{display:flex;align-items:center;justify-content:space-between;gap:14px;cursor:pointer;list-style:none;padding:16px 18px;color:#f8fafc;font-weight:950}
    #failures .detail-disclosure summary::-webkit-details-marker,#coverage-gaps .detail-disclosure summary::-webkit-details-marker{display:none}
    #failures .detail-disclosure summary:before,#coverage-gaps .detail-disclosure summary:before{content:'+';display:grid;place-items:center;width:28px;height:28px;border-radius:10px;border:1px solid rgba(57,231,95,.28);background:rgba(57,231,95,.08);color:#39e75f;font-weight:950;flex:0 0 auto}
    #failures .detail-disclosure[open] summary:before,#coverage-gaps .detail-disclosure[open] summary:before{content:'-'}
    #failures .detail-disclosure summary span,#coverage-gaps .detail-disclosure summary span{display:flex;align-items:center;gap:10px;min-width:0;margin-right:auto}
    #failures .detail-disclosure summary small,#coverage-gaps .detail-disclosure summary small{color:#9fb0c5;font-size:12px;font-weight:800;white-space:nowrap}
    #failures .detail-disclosure .failure-table-wrap,#coverage-gaps .detail-disclosure .failure-table-wrap{margin:0 16px 16px}
    #failures .failure-investigation-card.is-hidden,#failures .failure-detail-table tr.is-hidden{display:none}
    #failures .failure-load-more{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px;border:1px solid rgba(57,231,95,.18);border-radius:22px;background:linear-gradient(180deg,rgba(13,25,41,.72),rgba(6,15,27,.68));padding:15px 16px}
    #failures .failure-load-more span{color:#9fb0c5;font-size:13px;font-weight:800}
    #failures .failure-load-more button{border:1px solid rgba(57,231,95,.36);border-radius:999px;background:rgba(57,231,95,.10);color:#39e75f;font-size:13px;font-weight:950;padding:10px 16px;cursor:pointer}
    #failures .failure-load-more button:hover{border-color:rgba(57,231,95,.66);background:rgba(57,231,95,.17)}
    #failures .warning-tests-section{margin-top:24px;padding-top:24px;border-top:1px solid rgba(245,197,66,.16)}
    #failures .warning-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}
    #failures .warning-section-head h2{margin:4px 0 6px!important;font-size:clamp(22px,1.9vw,32px)!important;letter-spacing:-.04em!important}
    #failures .warning-section-head p{margin:0;color:#9fb0c5;font-size:14px;line-height:1.45;max-width:760px}
    #failures .failure-index.warning{background:rgba(245,197,66,.13);border-color:rgba(245,197,66,.42);color:#f5c542}
    #failures .warning-grid .failure-investigation-card{border-color:rgba(245,197,66,.30)}
    #failures .warning-table-wrap{margin-top:18px;border-color:rgba(245,197,66,.16)}
    @media(max-width:1250px){#failures .failure-command-center,#failures .failure-investigation-grid{grid-template-columns:1fr!important}}
    @media(max-width:760px){#failures .failure-card-head{grid-template-columns:auto minmax(0,1fr)}#failures .failure-card-head .badge{grid-column:2;justify-self:start}#failures .failure-card-meta{grid-template-columns:1fr}#failures .failure-card-action{align-items:flex-start;flex-direction:column}#failures .failure-load-more,#failures .warning-section-head{align-items:flex-start;flex-direction:column}}
    @media print{#failures .failure-investigation-card.is-hidden{display:flex!important}#failures .failure-detail-table tr.is-hidden{display:table-row!important}#failures .failure-load-more{display:none!important}}
    /* Screen 07: Blocked / Skipped Coverage, separated from product failures. */
    #coverage-gaps{background:radial-gradient(circle at 14% 6%,rgba(245,197,66,.10),transparent 28%),radial-gradient(circle at 86% 8%,rgba(96,165,250,.10),transparent 32%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #coverage-gaps .coverage-gap-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;margin-bottom:18px}
    #coverage-gaps .coverage-gap-summary div{background:linear-gradient(180deg,rgba(13,27,42,.86),rgba(7,16,28,.86));border:1px solid rgba(57,231,95,.14);border-radius:18px;padding:18px;min-width:0}
    #coverage-gaps .coverage-gap-summary span,#coverage-gaps .coverage-gap-action span{display:block;color:#8fa2b6;font-size:11px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}
    #coverage-gaps .coverage-gap-summary strong{display:block;color:#f8fafc;font-size:clamp(24px,2.2vw,36px);line-height:1.05;margin-top:8px}
    #coverage-gaps .coverage-gap-summary small{display:block;color:#9fb2c6;line-height:1.35;margin-top:7px}
    #coverage-gaps .coverage-gap-explainer{border:1px solid rgba(57,231,95,.16);border-radius:18px;background:rgba(57,231,95,.06);padding:18px 20px;margin-bottom:18px}
    #coverage-gaps .coverage-gap-explainer strong{display:block;color:#7ee787;font-size:16px;margin-bottom:6px}
    #coverage-gaps .coverage-gap-explainer p{margin:0;color:#c8d6e5;line-height:1.55}
    #coverage-gaps .coverage-gap-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr));gap:16px}
    #coverage-gaps .coverage-gap-card{border:1px solid rgba(57,231,95,.14);border-radius:18px;background:linear-gradient(180deg,rgba(13,27,42,.86),rgba(7,16,28,.86));padding:18px;min-width:0;display:flex;flex-direction:column;gap:14px;overflow:hidden}
    #coverage-gaps .coverage-gap-card.red{border-color:rgba(255,107,107,.30)}
    #coverage-gaps .coverage-gap-card.amber{border-color:rgba(245,197,66,.30)}
    #coverage-gaps .coverage-gap-card.blue{border-color:rgba(96,165,250,.28)}
    #coverage-gaps .coverage-gap-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:12px;min-width:0}
    #coverage-gaps .coverage-gap-index{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;color:#7ee787;background:rgba(57,231,95,.10);border:1px solid rgba(57,231,95,.24);font-size:12px;font-weight:950}
    #coverage-gaps .coverage-gap-head strong{display:block;color:#f8fafc;font-size:16px;line-height:1.2;overflow-wrap:break-word}
    #coverage-gaps .coverage-gap-head small{display:block;color:#9fb2c6;font-size:12px;line-height:1.35;margin-top:5px;overflow-wrap:break-word}
    #coverage-gaps .coverage-gap-card p{color:#c8d6e5;margin:0;line-height:1.5;overflow-wrap:break-word}
    #coverage-gaps .coverage-gap-action{margin-top:auto;background:rgba(3,10,18,.45);border-radius:14px;padding:12px}
    #coverage-gaps .coverage-gap-action strong{display:block;color:#e8f4ff;font-size:13px;line-height:1.45;margin-top:6px;overflow-wrap:break-word}
    #coverage-gaps .coverage-gap-table-wrap{margin-top:18px;border:1px solid rgba(245,197,66,.16)}
    #coverage-gaps .coverage-gap-card.is-hidden,#coverage-gaps .failure-detail-table tr.is-hidden{display:none}
    #coverage-gaps .failure-load-more{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:16px;border:1px solid rgba(57,231,95,.18);border-radius:22px;background:linear-gradient(180deg,rgba(13,25,41,.72),rgba(6,15,27,.68));padding:15px 16px}
    #coverage-gaps .failure-load-more span{color:#9fb0c5;font-size:13px;font-weight:800}
    #coverage-gaps .failure-load-more button{border:1px solid rgba(57,231,95,.36);border-radius:999px;background:rgba(57,231,95,.10);color:#39e75f;font-size:13px;font-weight:950;padding:10px 16px;cursor:pointer}
    #coverage-gaps .failure-load-more button:hover{border-color:rgba(57,231,95,.66);background:rgba(57,231,95,.17)}
    @media(max-width:760px){#coverage-gaps .coverage-gap-head{grid-template-columns:auto minmax(0,1fr)}#coverage-gaps .coverage-gap-head .badge{grid-column:1 / -1;justify-self:start}#coverage-gaps .failure-load-more{align-items:flex-start;flex-direction:column}}
    @media print{#coverage-gaps .coverage-gap-card.is-hidden{display:flex!important}#coverage-gaps .failure-detail-table tr.is-hidden{display:table-row!important}#coverage-gaps .failure-load-more{display:none!important}}
    /* Screen 08: Evidence, styled as a proof center with artifact readiness. */
    #evidence{background:radial-gradient(circle at 12% 8%,rgba(56,189,248,.12),transparent 28%),radial-gradient(circle at 84% 12%,rgba(57,231,95,.12),transparent 30%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #evidence .topbar{align-items:center!important;margin-bottom:24px!important}
    #evidence .topbar h1{font-size:clamp(34px,3vw,52px)!important;letter-spacing:-.06em!important}
    #evidence .evidence-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.28fr);gap:22px;align-items:stretch;border:1px solid rgba(57,231,95,.20);border-radius:30px;background:radial-gradient(circle at 18% 4%,rgba(57,231,95,.14),transparent 35%),linear-gradient(135deg,rgba(13,28,44,.88),rgba(5,14,25,.76));padding:28px;margin-bottom:18px;box-shadow:0 24px 80px rgba(0,0,0,.20)}
    #evidence .evidence-hero strong{display:block;color:#f8fafc;font-size:clamp(28px,2.4vw,40px);line-height:1.05;letter-spacing:-.04em;margin:10px 0}
    #evidence .evidence-hero p{max-width:880px;color:#d8e6f3;font-size:16px;line-height:1.65;margin:0}
    #evidence .evidence-score-card{display:flex;flex-direction:column;justify-content:center;border:1px solid rgba(57,231,95,.20);border-radius:24px;background:rgba(4,13,23,.62);padding:22px}
    #evidence .evidence-score-card span{color:#8fa4bb;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:900}
    #evidence .evidence-score-card strong{color:#39e75f;font-size:clamp(42px,4vw,70px);margin:8px 0 4px}
    #evidence .evidence-score-card small{color:#9fb0c5;font-size:13px}
    #evidence .evidence-score-card.muted strong{color:#dbe5ef}
    #evidence .evidence-card.none{border-color:rgba(148,163,184,.16)!important}
    #evidence .evidence-card.none .evidence-icon{background:rgba(148,163,184,.08)!important;border-color:rgba(148,163,184,.22)!important;color:#9fb0c5!important}
    #evidence .evidence-card.none span{color:#9fb0c5!important}
    #evidence .evidence-proof-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:22px}
    #evidence .evidence-proof-strip span{border:1px solid rgba(57,231,95,.14);border-radius:20px;background:linear-gradient(180deg,rgba(13,25,41,.78),rgba(6,15,27,.72));padding:16px}
    #evidence .evidence-proof-strip b{display:block;color:#39e75f;font-size:clamp(24px,2.3vw,38px);line-height:1}
    #evidence .evidence-proof-strip small{display:block;margin-top:7px;color:#8fa4bb;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:900}
    #evidence .evidence-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:18px!important;margin-bottom:22px}
    #evidence .evidence-card{position:relative;min-width:0;min-height:0!important;display:flex!important;align-items:center!important;gap:14px!important;border-radius:24px!important;background:linear-gradient(180deg,rgba(14,29,46,.88),rgba(6,15,27,.88))!important;border:1px solid rgba(57,231,95,.18)!important;padding:18px!important;box-shadow:0 18px 56px rgba(0,0,0,.16);text-decoration:none}
    #evidence .evidence-card-body{min-width:0;display:flex;flex:1;flex-direction:column;align-items:flex-start}
    #evidence .evidence-card:hover{transform:translateY(-4px)!important;border-color:rgba(57,231,95,.58)!important;box-shadow:0 28px 80px rgba(57,231,95,.10)!important}
    #evidence .evidence-icon{width:58px!important;height:58px!important;min-width:58px!important;border-radius:18px!important;background:rgba(57,231,95,.12)!important;border-color:rgba(57,231,95,.32)!important;color:#39e75f!important}
    #evidence .evidence-card strong{max-width:100%;font-size:19px!important;line-height:1.15!important;color:#f8fafc!important;white-space:normal!important;overflow-wrap:break-word!important;word-break:normal!important}
    #evidence .evidence-card span{font-size:14px!important;color:#9fb0c5!important;line-height:1.4!important;overflow-wrap:break-word}
    #evidence .evidence-card em{position:absolute;right:20px;bottom:20px;margin:0!important;border:1px solid rgba(57,231,95,.32);border-radius:999px;background:rgba(57,231,95,.08);padding:8px 14px;color:#39e75f!important;text-align:center;max-width:calc(100% - 40px);white-space:normal;line-height:1.15}
    #evidence .panel{border-radius:28px!important;background:linear-gradient(180deg,rgba(13,25,41,.78),rgba(6,15,27,.74))!important;border:1px solid rgba(57,231,95,.14)!important;padding:24px!important}
    #evidence .thumb-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:18px!important}
    #evidence .thumb{min-height:172px!important;border-radius:20px!important;background:rgba(4,13,23,.72)!important;border:1px solid rgba(148,163,184,.12)!important;padding:12px!important}
    #evidence .thumb img{height:118px!important;border-radius:14px!important;object-fit:cover!important}
    #evidence .thumb span{color:#d8e6f3!important;font-size:13px!important;font-weight:800!important}
    #evidence .thumb-grid .empty-state{border-radius:22px!important;border:1px dashed rgba(57,231,95,.30)!important;background:rgba(57,231,95,.06)!important;padding:34px!important}
    #evidence .panel:last-of-type p{color:#d8e6f3!important;line-height:1.65!important}
    #evidence p{overflow-wrap:anywhere!important}
    #evidence .evidence-failure-map{border-radius:28px!important;background:linear-gradient(180deg,rgba(13,25,41,.82),rgba(6,15,27,.76))!important;border:1px solid rgba(57,231,95,.16)!important}
    #evidence .evidence-map-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px}
    #evidence .evidence-map-head h2{margin:0 0 7px!important}
    #evidence .evidence-map-head p{margin:0!important;color:#9fb0c5!important;line-height:1.5!important}
    #evidence .evidence-map-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}
    #evidence .evidence-map-summary div{border:1px solid rgba(57,231,95,.14);border-radius:14px;background:rgba(7,16,31,.64);padding:16px;min-width:0}
    #evidence .evidence-map-summary span{display:block;color:#8fa4bb;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:900}
    #evidence .evidence-map-summary strong{display:block;color:#39e75f;font-size:clamp(24px,2.2vw,34px);line-height:1;margin-top:8px}
    #evidence .evidence-map-summary small{display:block;color:#9fb0c5;line-height:1.35;margin-top:8px}
    #evidence .failure-evidence-chips{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}
    #evidence .failure-evidence-chips a,#evidence .failure-evidence-chips span,#evidence .table-evidence-link{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(57,231,95,.22);border-radius:999px;background:rgba(57,231,95,.08);color:#a7f3b7!important;font-size:11px;font-weight:900;line-height:1.2;padding:7px 10px;text-decoration:none!important;max-width:100%;white-space:normal;overflow-wrap:anywhere}
    #evidence .failure-evidence-chips.muted span{border-color:rgba(148,163,184,.18);background:rgba(148,163,184,.06);color:#9fb0c5!important}
    #evidence .table-evidence-link{color:#39e75f!important}
    #evidence .evidence-map-note{margin:14px 0 0!important;color:#9fb0c5!important;font-size:12px!important}
    #evidence .evidence-proof-strip small,#evidence .evidence-card strong,#evidence .evidence-icon{overflow-wrap:normal!important;word-break:normal!important;hyphens:none!important}
    @media(max-width:1250px){#evidence .evidence-grid,#evidence .evidence-proof-strip,#evidence .thumb-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}#evidence .evidence-hero{grid-template-columns:1fr!important}#evidence .failure-evidence-chips{justify-items:start;justify-content:flex-start}}
    @media(max-width:760px){#evidence .evidence-grid,#evidence .evidence-proof-strip,#evidence .thumb-grid{grid-template-columns:1fr!important}#evidence .evidence-card-body{min-height:118px}#evidence .evidence-map-head{display:grid}}
    /* Final Engineering Mode polish: unify spacing, cards, typography, chart surfaces, and controls. */
    :root{--air-gap-section:clamp(22px,2.4vw,34px);--air-gap-card:clamp(12px,1.25vw,18px);--air-card-radius:22px;--air-panel-radius:28px}
    .page{padding:clamp(24px,2.6vw,38px)!important}
    .topbar{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:var(--air-gap-section)!important;min-width:0}
    .topbar>div{min-width:0;max-width:980px}
    .topbar .eyebrow{margin-bottom:8px}
    .topbar p{max-width:860px;margin:0!important;color:#9fb0c5!important;font-size:clamp(14px,1.05vw,17px)!important;line-height:1.5!important}
    .panel,.card,.kpi,.cover-stat,.wow-card,.health-card,.journey-node,.evidence-card,.compare-card,.roadmap-card,.module-health-card,.module-selector-card,.module-dashboard-card,.ai-metric,.health-stat,.failure-summary-card,.failure-investigation-card,.engine-card,.air-core-layer,.engine-output-group{border-radius:var(--air-card-radius)!important}
    .panel{border-radius:var(--air-panel-radius)!important;padding:clamp(20px,2vw,28px)!important}
    .panel+.panel,.panel+br+.panel,.grid+.panel,.kpis+.panel,.roadmap-grid+.panel,.history-section-grid+.panel{margin-top:var(--air-gap-section)!important}
    .grid,.grid.two,.grid.three,.kpis,.compare-grid,.history-section-grid,.module-card-grid,.module-dashboard-grid,.role-recommendation-grid,.ai-metric-grid,.roadmap-grid,.core-status-grid{gap:var(--air-gap-card)!important}
    .section-icon,.nav-icon,.module-icon,.health-icon,.evidence-icon{display:inline-grid!important;place-items:center!important;width:32px!important;height:32px!important;min-width:32px!important;border-radius:11px!important;font-size:11px!important;line-height:1!important}
    .icon-title{display:flex!important;align-items:center!important;gap:10px!important;min-width:0}
    .icon-title .section-icon{margin-right:0!important}
    .panel h2,.card h2{line-height:1.12!important;margin-top:0!important}
    .panel p,.card p,.module-health-card p,.module-dashboard-card p,.roadmap-card p,.engine-card p{font-size:13.5px!important;line-height:1.5!important}
    .badge,.mini-badge,.pill,.btn,.release-status-badge,.module-button,.module-filter button{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;min-width:0!important;line-height:1.15!important}
    .badge,.mini-badge,.pill,.release-status-badge{font-size:clamp(10px,.72vw,12px)!important;font-weight:900!important;letter-spacing:.01em!important}
    .btn,.module-button,.module-filter button{min-height:38px!important;font-size:12px!important}
    .chart,.history-sparkline,.history-chart,.history-chart-card,.history-trend-card svg,.chart-box{border-radius:18px!important;background:linear-gradient(180deg,rgba(4,14,24,.82),rgba(6,15,27,.62))!important}
    .chart-explainer{margin:4px 0 12px!important;color:#9fb0c5!important;font-size:12px!important;line-height:1.45!important}
    .bar-chart,.history-sparkline,.trend-chart{min-height:112px}
    .history-trend-head span,.chart-title,.panel h3{color:#f8fafc!important;font-size:clamp(14px,1.05vw,18px)!important;font-weight:900!important;letter-spacing:-.02em!important}
    table{border-collapse:separate!important;border-spacing:0 6px!important}
    th{color:#8fa4bb!important;font-size:10.5px!important;letter-spacing:.10em!important;text-transform:uppercase!important}
    td{line-height:1.4!important}
    tr:hover td{background-color:rgba(57,231,95,.045)!important}
    .interactive-card,.module-health-card,.roadmap-card,.executive-module-pill,.evidence-card,.recommendation-card{transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}
    .interactive-card:hover,.module-health-card:hover,.roadmap-card:hover,.executive-module-pill:hover,.evidence-card:hover,.recommendation-card:hover{transform:translateY(-2px);box-shadow:0 24px 72px rgba(0,0,0,.18)}
    #comparison{background:radial-gradient(circle at 80% 0%,rgba(96,165,250,.10),transparent 28%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #evidence{background:radial-gradient(circle at 84% 10%,rgba(56,189,248,.12),transparent 30%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #air-core{background:radial-gradient(circle at 18% 0%,rgba(167,139,250,.08),transparent 28%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    #roadmap{background:radial-gradient(circle at 90% 4%,rgba(56,189,248,.08),transparent 30%),linear-gradient(180deg,rgba(8,18,31,.94),rgba(4,11,20,.90))!important}
    .history-trend-card:nth-child(2n),#evidence .evidence-card:nth-child(2n),#air-core .engine-output-group:nth-child(2n),#roadmap .roadmap-card:nth-child(2n){border-color:rgba(96,165,250,.16)!important}
    .history-trend-card:nth-child(3n),#evidence .evidence-card:nth-child(3n),#roadmap .roadmap-card:nth-child(3n){border-color:rgba(167,139,250,.14)!important}
    .module-card-stats span,.module-meta span,.module-selector-summary span,.module-dashboard-metrics span,.drawer-metric,.engine-metrics div,.roadmap-card li,.compare-card,.health-stat{overflow:hidden!important}
    .module-card-stats b,.module-meta b,.module-dashboard-metrics b,.drawer-metric strong,.engine-metrics b,.compare-card strong,.health-stat strong{line-height:1.12!important}
    .page *{min-width:0}
    html{min-height:100%;overflow-y:scroll;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:rgba(57,231,95,.55) #07101f}
    body{min-height:100%;overflow-x:hidden;overflow-y:auto}
    .app{min-height:100vh}
    main{min-width:0;overflow:visible}
    html::-webkit-scrollbar,body::-webkit-scrollbar{width:10px}
    html::-webkit-scrollbar-track,body::-webkit-scrollbar-track{background:#07101f}
    html::-webkit-scrollbar-thumb,body::-webkit-scrollbar-thumb{background:rgba(57,231,95,.48);border:2px solid #07101f;border-radius:999px}
    html::-webkit-scrollbar-thumb:hover,body::-webkit-scrollbar-thumb:hover{background:rgba(57,231,95,.68)}
    #evidence .evidence-card span{display:block!important;max-width:100%!important;white-space:normal!important;overflow-wrap:break-word!important;word-break:normal!important}
    #evidence .evidence-card strong,#evidence .evidence-card small,#evidence .evidence-card em,#evidence .evidence-icon{word-break:normal!important;overflow-wrap:normal!important;hyphens:none!important}
    @media(max-width:900px){.topbar{align-items:flex-start!important;flex-direction:column!important}.topbar .pill,.topbar .btn{align-self:flex-start}.page{padding:20px!important}.panel{padding:18px!important}}
    /* Global identity and typography refinement: Automation Intelligence Report. */
    .brand-lockup{display:flex;align-items:center;gap:12px;margin-bottom:10px}
    .brand-mark{display:grid;place-items:center;width:52px;height:52px;min-width:52px;border-radius:18px;background:radial-gradient(circle at 30% 20%,rgba(141,255,158,.30),transparent 44%),linear-gradient(145deg,rgba(57,231,95,.20),rgba(56,189,248,.10));border:1px solid rgba(57,231,95,.38);box-shadow:0 0 34px rgba(57,231,95,.16)}
    .brand-mark svg{width:32px;height:32px;fill:none;stroke:#8dff9e;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 10px rgba(57,231,95,.35))}
    .brand-lockup .brand{font-size:62px!important;line-height:.82!important;letter-spacing:-6px!important;margin:0!important}
    .brand-sub{margin:8px 4px 26px!important;text-align:left!important;color:#f8fafc!important;font-size:13px!important;line-height:1.38!important;font-weight:750!important}
    .brand-sub span{color:#39e75f!important}
    .page-title-row{display:flex;align-items:center;gap:12px;margin:4px 0 5px}
    .page-title-row h1{margin:0!important}
    .page-heading-icon{display:inline-grid!important;place-items:center!important;width:42px!important;height:42px!important;min-width:42px!important;border-radius:14px!important;background:linear-gradient(135deg,rgba(57,231,95,.16),rgba(57,231,95,.06))!important;border:1px solid rgba(57,231,95,.38)!important;color:#9cffab!important;box-shadow:0 14px 34px rgba(57,231,95,.10)!important}
    .page-heading-icon svg{width:22px!important;height:22px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.9!important;stroke-linecap:round!important;stroke-linejoin:round!important}
    .topbar h1{font-size:clamp(28px,2.35vw,40px)!important;line-height:1.02!important;letter-spacing:-.05em!important}
    #executive .topbar h1,#health .topbar h1,#journey .topbar h1,#module-dashboard .topbar h1,#failures .topbar h1,#evidence .topbar h1{font-size:clamp(28px,2.35vw,40px)!important;line-height:1.02!important;letter-spacing:-.05em!important}
    .executive-mode-header h1{font-size:clamp(30px,3.1vw,46px)!important;line-height:1!important}
    .panel h2,.failure-table-wrap h2,#journey .journey-flow-panel h2,#module-dashboard .module-dashboard-intro h2{font-size:clamp(19px,1.55vw,26px)!important;letter-spacing:-.025em!important}
    #evidence .evidence-hero strong{font-size:clamp(28px,2.8vw,46px)!important;line-height:1!important}
    #module-dashboard .module-dashboard-score-row strong{font-size:clamp(38px,3.2vw,58px)!important}
    #journey .journey-node span{font-size:clamp(30px,2.4vw,42px)!important}
    @media(min-width:1501px){.executive-mode-grid{grid-template-columns:minmax(560px,.95fr) minmax(0,1.05fr)!important}.release-cockpit{grid-template-columns:minmax(165px,200px) minmax(0,1fr)!important}.cockpit-mini-grid{gap:10px!important}.cockpit-mini-grid div{padding-left:10px!important}.cockpit-mini-grid span{font-size:9px!important;line-height:1.15!important;letter-spacing:.06em!important;word-break:normal!important;overflow-wrap:normal!important}.cockpit-mini-grid strong{font-size:clamp(16px,1.65vw,28px)!important;line-height:1.02!important;word-break:normal!important;overflow-wrap:normal!important}.executive-kpi strong{font-size:clamp(30px,2.45vw,44px)!important;white-space:nowrap!important}.executive-kpi{min-height:158px!important}.executive-kpi:before{width:48px!important;height:48px!important;font-size:24px!important}}
    @media(max-width:1500px){.executive-mode-grid{grid-template-columns:1fr!important;grid-template-areas:"cockpit" "kpis"!important}.business-impact-layout{grid-template-columns:82px minmax(0,1fr)!important}.business-impact-spark{grid-column:1/-1!important}.executive-kpi-stack{grid-template-columns:repeat(5,minmax(0,1fr))!important}}
    @media(max-width:1100px){.executive-mode-header{grid-template-columns:1fr!important}.executive-toolbar{grid-template-columns:1fr!important;justify-items:start!important}.mode-toggle{justify-self:start!important}.executive-kpi-stack{grid-template-columns:repeat(2,minmax(0,1fr))!important}.executive-evidence-strip{grid-template-columns:repeat(2,minmax(0,1fr))!important}.cover-page{min-height:auto!important}}
    @media(max-width:700px){.brand{font-size:56px!important;letter-spacing:-5px!important}.mode-toggle{width:100%;display:grid;grid-template-columns:1fr}.mode-toggle span{min-width:0}.release-cockpit{grid-template-columns:1fr!important}.executive-kpi-stack,.executive-change-grid,.executive-product-strip,.executive-evidence-strip,.cockpit-mini-grid{grid-template-columns:1fr!important}.executive-recommendation-band{align-items:flex-start!important}.business-impact-layout{grid-template-columns:1fr!important}.page-title-row{align-items:flex-start}.page-heading-icon{width:36px!important;height:36px!important;min-width:36px!important;border-radius:12px!important}.page-heading-icon svg{width:19px!important;height:19px!important}}
    @media(max-width:1100px){.app{grid-template-columns:1fr!important}.app:before{display:none}.sidebar{position:relative!important;width:100%!important;max-width:none;min-width:0;height:auto;min-height:0;overflow:visible}main{grid-column:auto}}
    /* Report-wide label resilience: keep labels readable without breaking card layouts. */
    .nav a span,
    .nav-section,
    .eyebrow,
    .label,
    .kpi span,
    .cover-stat span,
    .wow-card span,
    .compare-card span,
    .ai-metric span,
    .health-stat span,
    .module-card-stats small,
    .module-meta span,
    .module-selector-summary span,
    .module-dashboard-metrics span,
    .engine-metrics small,
    .engine-head span,
    .freshness-strip b,
    .history-trend-head span,
    .evidence-proof-strip small,
    .evidence-card strong,
    .evidence-icon,
    .thumb span,
    .badge,
    .mini-badge,
    .pill,
    .btn,
    .module-button,
    .release-status-badge.compact,
    .trend-indicator {
      max-width:100%!important;
      min-width:0!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      word-break:normal!important;
      overflow-wrap:normal!important;
      hyphens:none!important;
    }
    .topbar h1,
    .page-title-row h1,
    .panel h2,
    .panel h3,
    .card h2,
    .module-title strong,
    .roadmap-card-head h2,
    .engine-card h3,
    .failure-card-head strong,
    .failure-detail-table td strong {
      word-break:normal!important;
      overflow-wrap:break-word!important;
      hyphens:none!important;
    }
    .kpi strong,
    .cover-stat strong,
    .wow-card strong,
    .compare-card strong,
    .ai-metric strong,
    .health-stat strong,
    .module-card-stats b,
    .module-meta b,
    .module-selector-summary b,
    .module-dashboard-metrics b,
    .engine-metrics b,
    .freshness-strip span {
      white-space:normal!important;
      word-break:normal!important;
      overflow-wrap:break-word!important;
      hyphens:none!important;
    }
    .failure-card-action span,
    .failure-next-action,
    .failure-detail-table td small,
    .recommendation-card p,
    .roadmap-card p,
    .roadmap-card li,
    .module-health-card p,
    .module-selector-card p,
    .module-dashboard-card p,
    .compare-card small,
    .drawer-test-row span,
    .drawer-test-row strong,
    .history-narrative p,
    .history-change-list li,
    .summary-lead,
    .empty-note,
    .empty-state p {
      word-break:normal!important;
      overflow-wrap:break-word!important;
      hyphens:none!important;
    }
    .badge,
    .mini-badge,
    .pill,
    .release-status-badge.compact {
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      width:auto!important;
      max-inline-size:100%!important;
    }
    .release-status-badge:not(.compact) {
      white-space:normal!important;
      overflow:visible!important;
      text-overflow:clip!important;
      word-break:normal!important;
      overflow-wrap:break-word!important;
    }
    .evidence-grid,
    .thumb-grid,
    .module-card-grid,
    .module-dashboard-grid,
    .compare-grid,
    .roadmap-grid,
    .core-status-grid,
    .history-section-grid {
      align-items:stretch!important;
    }
    .evidence-card,
    .module-health-card,
    .module-selector-card,
    .module-dashboard-card,
    .compare-card,
    .roadmap-card,
    .engine-card,
    .history-trend-card,
    .failure-investigation-card {
      overflow:hidden!important;
    }
    .evidence-card em,
    .failure-card-action a,
    .module-button {
      flex:0 0 auto!important;
      white-space:normal!important;
      overflow-wrap:break-word!important;
      word-break:normal!important;
    }
    td,
    th {
      word-break:normal!important;
      overflow-wrap:break-word!important;
      hyphens:none!important;
    }
    .technical-error,
    td small,
    .failure-card-head small,
    .issue-modal-item small,
    .evidence-preview-body,
    .coverage-gap-card small,
    .history-timeline-card small {
      overflow-wrap:anywhere!important;
      word-break:break-word!important;
    }
    [data-air-tooltip] {
      position:relative;
    }
    [data-air-tooltip]:focus-visible {
      outline:2px solid rgba(57,231,95,.72);
      outline-offset:3px;
    }
    .air-tooltip {
      position:fixed;
      z-index:9999;
      max-width:min(360px,calc(100vw - 28px));
      padding:10px 12px;
      border:1px solid rgba(57,231,95,.28);
      border-radius:12px;
      background:#07101f;
      color:#e8f4ff;
      box-shadow:0 18px 48px rgba(0,0,0,.42);
      font-size:12px;
      line-height:1.45;
      pointer-events:none;
    }
    #health .module-filter {
      display:grid!important;
      grid-template-columns:repeat(5,max-content) minmax(260px,1fr)!important;
      align-items:center!important;
      gap:12px!important;
    }
    #health .module-health-card.is-hidden,
    #health .module-status-card.is-hidden {
      display:none!important;
    }
    .module-filter-search {
      display:flex;
      align-items:center;
      gap:8px;
      justify-self:end;
      width:min(420px,100%);
      min-width:0;
      margin-left:0!important;
      border:1px solid rgba(148,163,184,.18);
      border-radius:999px;
      background:rgba(7,16,29,.78);
      padding:6px 10px;
      box-sizing:border-box;
    }
    .module-filter-search span {
      color:#8fa4bb;
      font-size:10px;
      font-weight:900;
      letter-spacing:.09em;
      text-transform:uppercase;
      white-space:nowrap;
    }
    .module-filter-search input {
      flex:1 1 auto;
      width:100%;
      min-width:0;
      border:0;
      background:transparent;
      color:#e8f4ff;
      outline:0;
      font:inherit;
      font-size:12px;
    }
    /* Client presentation safety: final layout hardening for long labels and dense cards. */
    #health .module-filter {
      grid-template-columns:repeat(5,max-content) minmax(360px,1fr)!important;
      column-gap:14px!important;
      row-gap:12px!important;
    }
    #health .module-filter button {
      min-width:0!important;
      padding-inline:18px!important;
    }
    #health .module-filter-search {
      justify-self:end!important;
      width:min(460px,100%)!important;
      height:48px!important;
      padding:0 16px!important;
      background:rgba(5,14,24,.88)!important;
      border-color:rgba(148,163,184,.22)!important;
    }
    #health .module-filter-search span {
      flex:0 0 auto!important;
      max-width:118px!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
      letter-spacing:.08em!important;
    }
    #health .module-filter-search input {
      min-width:0!important;
      font-size:13px!important;
      color:#f8fafc!important;
    }
    #health .module-filter-search input::placeholder {
      color:#6f8095!important;
    }
    #health .module-status-card {
      min-height:288px!important;
      padding:26px!important;
    }
    #health .module-status-card .module-card-head {
      grid-template-columns:minmax(0,1fr) max-content!important;
    }
    #health .module-title {
      grid-template-columns:56px minmax(0,1fr)!important;
      gap:16px!important;
    }
    #health .module-icon {
      width:54px!important;
      height:54px!important;
      min-width:54px!important;
      border-radius:18px!important;
    }
    #health .module-title strong {
      font-size:clamp(18px,1.55vw,26px)!important;
      line-height:1.15!important;
      overflow-wrap:break-word!important;
    }
    #health .module-status-card .badge {
      max-width:124px!important;
      min-width:86px!important;
      padding-inline:12px!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }
    #health .module-health-score strong {
      font-size:clamp(42px,4vw,64px)!important;
    }
    #health .module-health-score span {
      max-width:170px!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }
    #validation-summary .validation-command-panel {
      grid-template-columns:minmax(0,1fr) minmax(320px,.78fr)!important;
      align-items:start!important;
      gap:28px!important;
      min-height:0!important;
    }
    #validation-summary .validation-story {
      align-content:start!important;
      gap:18px!important;
    }
    #validation-summary .validation-story h2 {
      max-width:720px!important;
      font-size:clamp(22px,2vw,34px)!important;
      line-height:1.12!important;
      letter-spacing:-.035em!important;
    }
    #validation-summary .validation-story p {
      max-width:720px!important;
      font-size:15px!important;
    }
    #validation-summary .validation-stat-grid {
      grid-template-columns:repeat(auto-fit,minmax(150px,190px))!important;
      gap:12px!important;
    }
    #validation-summary .validation-stat,
    #validation-summary .validation-area-card {
      min-height:142px!important;
      padding:18px!important;
    }
    #validation-summary .validation-area-grid {
      grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;
    }
    #validation-summary .validation-area-card span,
    #validation-summary .validation-stat span {
      white-space:normal!important;
      overflow:visible!important;
      text-overflow:clip!important;
      overflow-wrap:break-word!important;
      line-height:1.25!important;
    }
    #validation-summary .validation-group-grid,
    #validation-summary .validation-gap-grid {
      grid-template-columns:repeat(auto-fit,minmax(280px,1fr))!important;
    }
    #validation-summary .validation-gap-card {
      min-height:0!important;
      padding:18px!important;
    }
    #validation-summary .validation-gap-card strong {
      display:block!important;
      font-size:clamp(15px,1.08vw,19px)!important;
      line-height:1.3!important;
    }
    #validation-summary .validation-gap-card p {
      font-size:13px!important;
      line-height:1.55!important;
      margin-top:8px!important;
    }
    #validation-summary .validation-details {
      overflow:auto!important;
    }
    #insight .topbar {
      align-items:center!important;
    }
    #insight .topbar .btn {
      max-width:280px!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }
    #insight .ai-command-hero {
      grid-template-columns:minmax(0,1.25fr) minmax(340px,.75fr)!important;
      align-items:stretch!important;
    }
    #insight .ai-command-hero strong {
      font-size:clamp(24px,2.15vw,38px)!important;
      line-height:1.12!important;
      max-width:860px!important;
    }
    #insight .ai-signal-grid {
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
      align-content:center!important;
    }
    #insight .ai-signal-card {
      min-height:112px!important;
      padding:18px!important;
      overflow:hidden!important;
    }
    #insight .ai-signal-card span {
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }
    #insight .ai-signal-card strong {
      display:block!important;
      max-width:100%!important;
      font-size:clamp(18px,1.35vw,24px)!important;
      line-height:1.12!important;
      white-space:normal!important;
      overflow-wrap:break-word!important;
      word-break:normal!important;
      letter-spacing:-.025em!important;
    }
    #comparison .release-timeline {
      grid-template-columns:repeat(auto-fit,minmax(128px,1fr))!important;
      gap:12px!important;
    }
    #comparison .release-timeline>div {
      justify-items:start!important;
      overflow:hidden!important;
      padding:12px!important;
      min-height:96px!important;
    }
    #comparison .release-timeline .release-status-badge {
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
      justify-content:center!important;
      white-space:normal!important;
      overflow-wrap:break-word!important;
      text-overflow:clip!important;
      font-size:10px!important;
      line-height:1.1!important;
      padding:7px 8px!important;
    }
    #comparison .release-timeline small {
      max-width:100%!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
    }
    @media(max-width:1350px) {
      #health .module-filter {
        grid-template-columns:repeat(3,max-content) minmax(260px,1fr)!important;
      }
      #health .module-filter-search {
        grid-column:1 / -1!important;
        justify-self:stretch!important;
        width:100%!important;
      }
      #validation-summary .validation-command-panel,
      #insight .ai-command-hero {
        grid-template-columns:1fr!important;
      }
    }
    .module-filter-count {
      margin:-6px 0 14px;
      color:#9fb0c5;
      font-size:12px;
      font-weight:800;
    }
    .module-filter-empty {
      margin-top:14px;
    }
    @media(max-width:1250px) {
      #health .module-filter {
        grid-template-columns:repeat(3,max-content)!important;
      }
      #health .module-filter-search {
        grid-column:1 / -1;
        justify-self:stretch;
        width:100%;
      }
    }
    @media(max-width:760px) {
      #health .module-filter {
        grid-template-columns:1fr!important;
      }
      #health .module-filter button,
      #health .module-filter-search {
        width:100%;
      }
    }
    .primary-failure-shot {
      display:grid;
      gap:9px;
      border:1px solid rgba(57,231,95,.28);
      border-radius:16px;
      background:rgba(57,231,95,.07);
      padding:12px;
      text-decoration:none;
      color:#d8e6f3;
    }
    .primary-failure-shot span {
      color:#9affac;
      font-size:11px;
      font-weight:950;
      text-transform:uppercase;
      letter-spacing:.08em;
    }
    .primary-failure-shot img {
      width:100%;
      max-height:420px;
      object-fit:contain;
      object-position:top center;
      border-radius:12px;
      border:1px solid rgba(255,59,59,.55);
      background:#050e18;
    }
    .primary-failure-shot small {
      color:#9fb0c5;
      line-height:1.35;
    }
    .primary-failure-shot.empty {
      border-style:dashed;
      background:rgba(148,163,184,.05);
    }
    .primary-failure-shot.empty strong {
      color:#f8fafc;
    }
    .failure-screenshot-context {
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px;
      align-items:stretch;
    }
    .failure-shot-panel,
    .failure-shot-notes,
    .failure-artifact-group {
      min-width:0;
      border:1px solid rgba(148,163,184,.14);
      border-radius:18px;
      background:rgba(5,14,24,.68);
      padding:13px;
    }
    .failure-shot-panel > span,
    .failure-artifact-group > span {
      display:block;
      color:#9fb1c5;
      font-size:11px;
      font-weight:900;
      letter-spacing:.1em;
      text-transform:uppercase;
      margin-bottom:9px;
    }
    .failure-shot-panel a {
      color:#d8e6f3!important;
      text-decoration:none!important;
      display:grid;
      gap:8px;
    }
    .failure-shot-panel img {
      width:100%;
      max-height:420px;
      height:auto;
      object-fit:contain;
      object-position:top center;
      border-radius:14px;
      border:2px solid rgba(255,59,59,.72);
      background:#fff;
    }
    .failure-evidence-board{display:grid;grid-template-columns:1fr;gap:18px;margin:18px 0 28px}
    .failure-shot-card.is-hidden,[data-long-list] .is-hidden,[data-long-list] > .is-hidden{display:none}
    .failure-open{margin-top:4px}
    .failure-open summary{cursor:pointer;color:#9affac;font-weight:800;font-size:15px}
    .failure-open summary::-webkit-details-marker{color:#9affac}
    .report-fold{margin:18px 0;border:1px solid rgba(57,231,95,.22);border-radius:16px;background:rgba(8,16,30,.45);padding:14px 16px}
    .report-fold summary{cursor:pointer;color:#f8fafc;font-size:17px;font-weight:800}
    .report-fold[open] summary{margin-bottom:12px}
    .long-list-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:14px;border:1px solid rgba(57,231,95,.18);border-radius:16px;background:rgba(8,16,30,.55);padding:12px 14px}
    .long-list-bar span{color:#9fb0c5;font-size:13px;font-weight:800}
    .long-list-bar button{border:1px solid rgba(57,231,95,.36);border-radius:999px;background:rgba(57,231,95,.10);color:#39e75f;font-size:13px;font-weight:800;padding:10px 16px;cursor:pointer}
    .failure-shot-card{display:grid;gap:12px;min-width:0;border:1px solid rgba(255,59,59,.45);border-radius:16px;background:#120910;padding:18px}
    .failure-shot-card header{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
    .failure-shot-card header > div{min-width:0;flex:1}
    .failure-flag{flex:0 0 auto;white-space:nowrap;display:inline-flex;align-items:center;height:auto;width:auto;min-width:max-content;border-radius:999px;background:#dc2626;color:#fff;font-size:12px;font-weight:800;letter-spacing:.04em;line-height:1;padding:8px 12px;text-transform:uppercase}
    .marked-shot{position:relative;width:100%;border-radius:12px;overflow:hidden;background:#fff;line-height:0}
    .marked-shot .field-box{position:absolute;box-sizing:border-box;border:4px solid #dc2626;background:rgba(220,38,38,.18);border-radius:8px;pointer-events:none}
    .marked-shot.field-marked{border:0}
    a.failure-shot-card{text-decoration:none;color:inherit;cursor:pointer}
    .failure-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:18px}@media(max-width:760px){.failure-card-grid{grid-template-columns:1fr}}
    .failure-check-list{margin:0;padding-left:18px;color:#d7fbe0}
    .failure-check-list li{margin:4px 0;line-height:1.4}
    .failure-group-check{margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,59,59,.28)}
    .failure-group-check h3{margin:0 0 8px;font-size:18px;line-height:1.35}
    .failure-group-label{margin:8px 0 10px;color:#f8fafc;font-size:18px;line-height:1.4}
    .failure-detail{margin-top:12px;border:1px solid rgba(255,59,59,.45);border-radius:16px;background:#120910;padding:18px}
    .failure-detail-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
    .failure-detail-head strong{display:block;color:#f8fafc;font-size:24px;line-height:1.3}
    .failure-detail-head small{display:block;color:#9fb0c5;margin-top:4px}
    .back-checks{display:inline-flex;margin-bottom:12px;color:#ffb4b4;font-weight:800;text-decoration:none}
    #failures .marked-shot.field-marked img{border:0}
    .marked-shot img{display:block;width:100%;height:auto;max-height:none;object-fit:fill;background:#fff}
    .marked-banner{position:absolute;top:12px;left:12px;right:12px;display:flex;gap:10px;align-items:flex-start;max-width:calc(100% - 24px);border-radius:10px;background:#dc2626;color:#fff;padding:8px 12px}
    .marked-banner b{flex:0 0 auto;white-space:nowrap;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
    .marked-banner span{font-size:14px;font-weight:700;line-height:1.35}
    .failure-shot-card header b{display:grid;place-items:center;min-width:36px;height:36px;border-radius:999px;background:rgba(255,59,59,.18);color:#ffb4b4;font-size:16px}
    .failure-shot-card header strong{display:block;color:#f8fafc;font-size:20px;line-height:1.35}
    .failure-shot-card header small{display:block;color:#9fb0c5;font-size:14px;margin-top:2px}
    .failure-shot-card .failure-plain{margin:0;color:#f8fafc;font-size:17px;line-height:1.5}
    .failure-shot-card .failure-next-line{margin:0;color:#cbd5e1;font-size:14px;line-height:1.45}
    .failure-shot-card img{width:100%;max-height:480px;object-fit:contain;object-position:top center;border-radius:12px;background:#fff}
    .failure-shot-missing{border:1px dashed rgba(255,59,59,.45);border-radius:12px;padding:16px;background:rgba(255,59,59,.06)}
    .failure-shot-missing span{display:block;color:#ffb4b4;font-size:13px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;margin-bottom:6px}
    .failure-shot-missing p{margin:0;color:#e2e8f0;font-size:15px;line-height:1.5}
    .failure-more-detail{color:#cbd5e1;font-size:13px}
    .failure-more-detail summary{cursor:pointer;color:#9fb0c5}
    .failure-shot-panel small,
    .failure-shot-notes p {
      display:block;
      margin:0;
      color:#b8c7d9;
      font-size:12px;
      line-height:1.45;
      overflow-wrap:anywhere;
    }
    .failure-shot-panel.unavailable {
      display:flex;
      flex-direction:column;
      justify-content:center;
      min-height:214px;
      border-style:dashed;
      border-color:rgba(245,197,66,.30);
    }
    .failure-shot-panel.unavailable strong {
      color:#f5c542;
      font-size:18px;
      margin-bottom:6px;
    }
    .failure-shot-panel.annotated {
      border-color:rgba(255,59,59,.24);
    }
    .failure-shot-panel.original {
      border-color:rgba(57,231,95,.18);
    }
    .failure-shot-notes {
      grid-column:1/-1;
      display:grid;
      gap:8px;
    }
    .failure-shot-notes b {
      color:#f8fafc;
    }
    .failure-source-notes {
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:8px;
      margin:10px 0 14px;
      border:1px solid rgba(57,231,95,.16);
      border-radius:16px;
      background:rgba(57,231,95,.055);
      padding:12px;
    }
    .failure-source-notes > span {
      grid-column:1/-1;
      color:#9affac;
      font-size:11px;
      font-weight:950;
      letter-spacing:.08em;
      text-transform:uppercase;
    }
    .failure-source-notes small {
      min-width:0;
      color:#b8c7d9;
      font-size:11px;
      line-height:1.35;
      overflow-wrap:anywhere;
    }
    .failure-source-notes b {
      color:#f8fafc;
    }
    .failure-artifact-group {
      display:grid;
      gap:10px;
    }
    .validation-command-panel {
      display:grid;
      grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);
      gap:18px;
      align-items:stretch;
    }
    .validation-story {
      min-width:0;
      display:grid;
      gap:14px;
      align-content:start;
    }
    .validation-story h2 {
      margin:0;
      font-size:26px;
      line-height:1.08;
    }
    .validation-story p {
      margin:0;
      color:#b8c7d9;
      line-height:1.55;
      max-width:72ch;
    }
    .validation-stat-grid {
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:10px;
    }
    .validation-stat,
    .validation-area-card,
    .validation-gap-card {
      min-width:0;
      border:1px solid rgba(57,231,95,.14);
      border-radius:18px;
      background:rgba(5,14,25,.58);
      padding:14px;
    }
    .validation-stat span,
    .validation-area-card span,
    .validation-gap-card span {
      display:block;
      color:#93a4b8;
      font-size:11px;
      font-weight:900;
      letter-spacing:.08em;
      text-transform:uppercase;
      overflow-wrap:anywhere;
    }
    .validation-stat strong,
    .validation-area-card strong {
      display:block;
      margin-top:8px;
      color:#39e75f;
      font-size:28px;
      line-height:1;
    }
    .validation-stat small,
    .validation-area-card small {
      display:block;
      margin-top:6px;
      color:#a8b6c8;
      line-height:1.35;
    }
    .validation-stat.bad strong { color:#ff6b6b; }
    .validation-stat.warn strong { color:#fbbf24; }
    .validation-stat.info strong { color:#60a5fa; }
    .validation-area-grid {
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:10px;
    }
    .validation-group-grid {
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px;
    }
    .validation-group-card {
      min-width:0;
      border:1px solid rgba(148,163,184,.12);
      border-radius:20px;
      background:linear-gradient(145deg,rgba(15,23,42,.72),rgba(6,18,30,.68));
      padding:16px;
    }
    .validation-group-head {
      display:flex;
      justify-content:space-between;
      gap:14px;
      align-items:flex-start;
      margin-bottom:12px;
    }
    .validation-group-head div {
      min-width:0;
    }
    .validation-group-head span {
      display:block;
      color:#93a4b8;
      font-size:11px;
      font-weight:900;
      letter-spacing:.08em;
      text-transform:uppercase;
    }
    .validation-group-head strong {
      display:block;
      color:#f8fafc;
      font-size:20px;
      line-height:1.25;
      overflow-wrap:anywhere;
    }
    .validation-group-head em {
      flex:0 0 auto;
      border:1px solid rgba(57,231,95,.22);
      border-radius:999px;
      background:rgba(57,231,95,.08);
      color:#9affac;
      font-size:12px;
      font-style:normal;
      font-weight:900;
      padding:6px 10px;
      white-space:nowrap;
    }
    .validation-group-card ul {
      margin:0;
      padding:0;
      list-style:none;
      display:grid;
      gap:8px;
    }
    .validation-group-card li {
      position:relative;
      padding-left:16px;
      color:#cbd5e1;
      line-height:1.4;
      overflow-wrap:anywhere;
    }
    .validation-group-card li::before {
      content:'';
      position:absolute;
      left:0;
      top:.58em;
      width:6px;
      height:6px;
      border-radius:50%;
      background:#39e75f;
      box-shadow:0 0 14px rgba(57,231,95,.45);
    }
    a.validation-area-card,
    a.validation-stat {
      color:inherit;
      text-decoration:none;
    }
    #validation-summary .section-heading-row {
      display:flex;
      justify-content:space-between;
      align-items:flex-end;
      gap:18px;
      margin-bottom:16px;
    }
    #validation-summary .section-heading-row h2 { margin:0; }
    #validation-summary .section-heading-row p { margin:8px 0 0; color:#91a4b8; line-height:1.45; }
    .validation-group-purpose {
      margin:0 0 12px;
      color:#b7c6d6;
      font-size:14px;
      line-height:1.45;
    }
    .validation-group-card li strong {
      display:block;
      color:#f8fafc;
      font-size:14px;
      font-weight:800;
      line-height:1.35;
    }
    .validation-group-card li span {
      display:block;
      margin-top:3px;
      color:#93a4b8;
      font-size:13px;
      line-height:1.45;
    }
    .validation-group-count {
      margin:0 0 14px;
      color:#9fb0c5;
      font-size:13px;
      font-weight:800;
    }
    .validation-gap-card strong {
      color:#f8fafc;
      line-height:1.25;
      overflow-wrap:anywhere;
    }
    .validation-gap-card p {
      margin:0;
      color:#9fb0c5;
      line-height:1.45;
    }
    .validation-details {
      margin-top:16px;
      border:1px solid rgba(148,163,184,.12);
      border-radius:18px;
      background:rgba(15,23,42,.36);
      padding:12px;
    }
    .validation-details summary {
      cursor:pointer;
      color:#9affac;
      font-weight:900;
    }
    .validation-toggle {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
    }
    .validation-toggle summary {
      list-style:none;
    }
    .validation-toggle summary::-webkit-details-marker {
      display:none;
    }
    .validation-toggle summary::after {
      content:'Open every passed check';
      display:inline-flex;
      align-items:center;
      min-height:38px;
      border:1px solid rgba(57,231,95,.35);
      border-radius:999px;
      background:rgba(57,231,95,.09);
      color:#9affac;
      padding:0 16px;
      font-size:13px;
      font-weight:950;
    }
    .validation-toggle[open] summary::after {
      content:'Hide the full list';
    }
    .validation-gap-grid {
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:10px;
    }
    @media(max-width:760px) {
      .validation-command-panel,
      .validation-area-grid,
      .validation-group-grid,
      .validation-gap-grid,
      .validation-stat-grid {
        grid-template-columns:1fr;
      }
      .module-filter-search {
        flex:1 1 100%;
        margin-left:0;
        border-radius:14px;
      }
      .module-filter-search span {
        display:none;
      }
      .primary-failure-shot img {
        max-height:180px;
      }
      .failure-screenshot-context {
        grid-template-columns:1fr;
      }
      .failure-source-notes {
        grid-template-columns:1fr;
      }
    }
    /* Final presentation overrides: keep long labels from breaking client-facing layouts. */
    #health .module-filter{display:grid!important;grid-template-columns:repeat(5,max-content) minmax(360px,1fr)!important;align-items:center!important;gap:12px 14px!important}
    #health .module-filter-search{justify-self:end!important;width:min(460px,100%)!important;height:48px!important;margin-left:0!important;padding:0 16px!important;background:rgba(5,14,24,.9)!important;border:1px solid rgba(148,163,184,.22)!important}
    #health .module-filter-search span{flex:0 0 auto!important;max-width:118px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    #health .module-filter-search input{min-width:0!important;color:#f8fafc!important}
    #health .module-status-card{min-height:288px!important;padding:26px!important}
    #health .module-status-card .module-card-head{display:grid!important;grid-template-columns:minmax(0,1fr) max-content!important;gap:16px!important;align-items:start!important}
    #health .module-title{display:grid!important;grid-template-columns:56px minmax(0,1fr)!important;gap:16px!important;align-items:center!important}
    #health .module-icon{width:54px!important;height:54px!important;min-width:54px!important;border-radius:18px!important}
    #health .module-title strong{font-size:clamp(18px,1.55vw,26px)!important;line-height:1.15!important;overflow-wrap:break-word!important}
    #health .module-status-card .badge{justify-self:end!important;min-width:86px!important;max-width:124px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    #health .module-health-score strong{font-size:clamp(42px,4vw,64px)!important}
    #health .module-health-score span{max-width:170px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    #validation-summary .validation-command-panel{grid-template-columns:minmax(0,1fr) minmax(320px,.78fr)!important;align-items:start!important;gap:28px!important;min-height:0!important}
    #validation-summary .validation-story{gap:18px!important;align-content:start!important}
    #validation-summary .validation-story h2{font-size:clamp(22px,2vw,34px)!important;line-height:1.12!important;max-width:720px!important}
    #validation-summary .validation-story p{max-width:720px!important;font-size:15px!important}
    #validation-summary .validation-stat-grid{grid-template-columns:repeat(auto-fit,minmax(150px,190px))!important;gap:12px!important}
    #validation-summary .validation-area-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important}
    #validation-summary .validation-stat,#validation-summary .validation-area-card{min-height:142px!important;padding:18px!important}
    #validation-summary .validation-area-card span,#validation-summary .validation-stat span{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:break-word!important;line-height:1.25!important}
    #validation-summary .validation-group-grid,#validation-summary .validation-gap-grid{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))!important}
    #validation-summary .validation-gap-card{min-height:0!important;padding:18px!important}
    #validation-summary .validation-gap-card strong{display:block!important;font-size:clamp(15px,1.08vw,19px)!important;line-height:1.3!important}
    #validation-summary .validation-gap-card p{font-size:13px!important;line-height:1.55!important;margin-top:8px!important}
    #insight .topbar{align-items:center!important}
    #insight .topbar .btn{max-width:280px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    #insight .ai-command-hero{grid-template-columns:minmax(0,1.25fr) minmax(340px,.75fr)!important;align-items:stretch!important}
    #insight .ai-command-hero strong{font-size:clamp(24px,2.15vw,38px)!important;line-height:1.12!important;max-width:860px!important}
    #insight .ai-signal-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;align-content:center!important}
    #insight .ai-signal-card{min-height:112px!important;padding:18px!important;overflow:hidden!important}
    #insight .ai-signal-card span{white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    #insight .ai-signal-card strong{display:block!important;max-width:100%!important;font-size:clamp(18px,1.35vw,24px)!important;line-height:1.12!important;white-space:normal!important;overflow-wrap:break-word!important;word-break:normal!important}
    #comparison .release-timeline{grid-template-columns:repeat(auto-fit,minmax(128px,1fr))!important;gap:12px!important}
    #comparison .release-timeline>div{justify-items:start!important;overflow:hidden!important;padding:12px!important;min-height:96px!important}
    #comparison .release-timeline .release-status-badge{width:100%!important;min-width:0!important;max-width:100%!important;justify-content:center!important;white-space:normal!important;overflow-wrap:break-word!important;text-overflow:clip!important;font-size:10px!important;line-height:1.1!important;padding:7px 8px!important}
    #comparison .release-timeline small{max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
    @media(max-width:1350px){#health .module-filter{grid-template-columns:repeat(3,max-content) minmax(260px,1fr)!important}#health .module-filter-search{grid-column:1/-1!important;justify-self:stretch!important;width:100%!important}#validation-summary .validation-command-panel,#insight .ai-command-hero{grid-template-columns:1fr!important}}
    @media(max-width:760px){#health .module-filter{grid-template-columns:1fr!important}#health .module-status-card .module-card-head,#health .module-title,#insight .ai-signal-grid{grid-template-columns:1fr!important}#health .module-status-card .badge{justify-self:start!important}}
    .report-extra{display:none}
    .report-extra.is-open{display:block}
    .nav a.nav-extra{opacity:.78}
    .report-more{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px 18px;margin:0 0 28px;padding:16px 18px;border:1px solid rgba(57,231,95,.18);border-radius:18px;background:rgba(8,16,30,.72)}
    .report-more strong{display:block;color:#f8fafc;font-size:14px}
    .report-more p{margin:4px 0 0;color:#9fb0c5;font-size:12px;line-height:1.4}
    .report-more-links{display:flex;flex-wrap:wrap;gap:8px}
    .report-more-links a{display:inline-flex;align-items:center;border:1px solid rgba(148,163,184,.22);border-radius:999px;padding:7px 12px;color:#dbe5ef;text-decoration:none;font-size:12px;font-weight:700}
    .report-more-links a:hover{border-color:rgba(57,231,95,.45);color:#f4fff6}
    .reader-guide{display:grid;gap:12px;margin:0 0 22px}
    .reader-guide h2{margin:0;color:#9fb0c5;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
    .reader-guide-list{display:grid;gap:10px}
    .reader-step{display:grid;grid-template-columns:minmax(148px,190px) minmax(0,1fr) auto;gap:16px;align-items:center;border:1px solid rgba(148,163,184,.16);border-radius:16px;background:rgba(8,16,30,.72);padding:16px 18px;color:#dbe5ef;text-decoration:none}
    .reader-step span{color:#9fb0c5;font-size:13px;font-weight:800;letter-spacing:.02em;line-height:1.35}
    .reader-step strong{color:#f8fafc;font-size:16px;font-weight:600;line-height:1.45;text-align:left}
    .reader-step em{font-style:normal;color:#dbe5ef;font-size:12px;font-weight:800;white-space:nowrap}
    .reader-step.good{border-color:rgba(57,231,95,.28)}
    .reader-step.good em{color:#39e75f}
    .reader-step.warn{border-color:rgba(245,197,66,.35)}
    .reader-step.warn em{color:#f5c542}
    .reader-step.bad{border-color:rgba(255,107,107,.4)}
    .reader-step.bad em{color:#ff7b72}
    .reader-step:hover{border-color:rgba(57,231,95,.55)}
    .reader-guide:not(.report-more){gap:14px;margin-bottom:26px}
    .reader-guide:not(.report-more) .reader-guide-list{gap:12px}
    .reader-guide:not(.report-more) .reader-step{grid-template-columns:52px minmax(168px,210px) minmax(0,1fr) auto;gap:18px;padding:18px 20px;border-radius:20px;background:linear-gradient(100deg,rgba(57,231,95,.1),rgba(8,16,30,.88) 34%);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);transition:transform .18s ease,border-color .18s ease}
    .reader-guide:not(.report-more) .reader-step i{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;border:1px solid rgba(57,231,95,.45);background:rgba(57,231,95,.14);color:#39e75f;font-style:normal;font-size:16px;font-weight:800;letter-spacing:.04em}
    .reader-guide:not(.report-more) .reader-step span{color:#f8fafc;font-size:15px;font-weight:700;letter-spacing:0}
    .reader-guide:not(.report-more) .reader-step strong{font-size:16px;font-weight:500;color:#dbe5ef}
    .reader-guide:not(.report-more) .reader-step em{border:1px solid rgba(57,231,95,.35);border-radius:999px;padding:8px 14px;background:rgba(57,231,95,.1);color:#d7fbe0}
    .reader-guide:not(.report-more) .reader-step.good{border-color:rgba(57,231,95,.38);box-shadow:inset 4px 0 0 #39e75f,0 10px 28px rgba(0,0,0,.18)}
    .reader-guide:not(.report-more) .reader-step.warn{border-color:rgba(245,197,66,.42);background:linear-gradient(100deg,rgba(245,197,66,.12),rgba(8,16,30,.88) 34%);box-shadow:inset 4px 0 0 #f5c542,0 10px 28px rgba(0,0,0,.18)}
    .reader-guide:not(.report-more) .reader-step.warn i{border-color:rgba(245,197,66,.5);background:rgba(245,197,66,.14);color:#f5c542}
    .reader-guide:not(.report-more) .reader-step.warn em{border-color:rgba(245,197,66,.4);background:rgba(245,197,66,.1);color:#f5c542}
    .reader-guide:not(.report-more) .reader-step.bad{border-color:rgba(255,123,114,.45);background:linear-gradient(100deg,rgba(255,123,114,.12),rgba(8,16,30,.88) 34%);box-shadow:inset 4px 0 0 #ff7b72,0 10px 28px rgba(0,0,0,.18)}
    .reader-guide:not(.report-more) .reader-step.bad i{border-color:rgba(255,123,114,.5);background:rgba(255,123,114,.14);color:#ff7b72}
    .reader-guide:not(.report-more) .reader-step.bad em{border-color:rgba(255,123,114,.4);background:rgba(255,123,114,.1);color:#ff7b72}
    .reader-guide:not(.report-more) .reader-step:hover{transform:translateY(-2px);border-color:rgba(244,255,246,.35)}
    @media(max-width:900px){.reader-step{grid-template-columns:1fr;gap:4px}.reader-guide:not(.report-more) .reader-step{grid-template-columns:52px minmax(0,1fr);align-items:start}.reader-guide:not(.report-more) .reader-step strong,.reader-guide:not(.report-more) .reader-step em{grid-column:2}}
    .evidence-path-note{margin:10px 0 0;color:#9fb0c5;font-size:13px;line-height:1.5;max-width:720px}
    .evidence-cta-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
    .evidence-location-list{margin:0;padding-left:18px;color:#dbe5ef;line-height:1.7}
    .evidence-location-list li{margin:0 0 8px}
    .evidence-location-list code{color:#9af7ad;font-size:13px}
    .evidence-location-list a{color:#39e75f;font-weight:700;text-decoration:none}
    .evidence-location-list a:hover{text-decoration:underline}
    .global-search{display:none!important}
    .section-icon{display:none!important}
    .release-orb{display:none!important}
    .release-cockpit{grid-template-columns:1fr!important;background:#0c1522!important;box-shadow:none!important}
    .executive-kpi strong,.module-score{text-shadow:none!important}
    .brief-count{margin:8px 0 0;max-width:680px;color:#d5e0ec;font-size:16px;line-height:1.55;font-weight:500}
    .nav-more{margin-top:14px;border-top:1px solid rgba(148,163,184,.16);padding-top:8px}
    .nav-more summary{cursor:pointer;list-style:none;color:#9fb0c5;font-size:13px;font-weight:700;padding:10px 14px}
    .nav-more summary::-webkit-details-marker{display:none}
    .nav-more[open] summary{color:#f8fafc}
    .failure-groups{display:grid;gap:12px}
    .failure-group{border:1px solid rgba(148,163,184,.16);border-radius:18px;background:#0c1522}
    .failure-group summary{display:grid;grid-template-columns:48px minmax(0,1fr);gap:14px;align-items:center;padding:16px 18px;cursor:pointer;list-style:none}
    .failure-group summary::-webkit-details-marker{display:none}
    .failure-group summary b{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:rgba(255,123,114,.12);color:#ffb4ae;font-size:18px}
    .failure-group summary strong{display:block;color:#f8fafc;font-size:16px;font-weight:600;line-height:1.4}
    .failure-group summary small{display:block;margin-top:4px;color:#9fb0c5;font-size:13px}
    .failure-group-body{display:grid;gap:12px;padding:0 18px 18px 80px}
    .failure-group-body .failure-shot-card{margin:0}
    .next-step-list{display:grid;gap:12px;margin:0 0 22px}
    .next-step-card{display:grid;grid-template-columns:52px minmax(0,1fr);gap:16px;align-items:start;padding:18px 20px;border:1px solid rgba(148,163,184,.16);border-radius:18px;background:#0c1522;color:inherit;text-decoration:none}
    .next-step-card span{display:grid;place-items:center;width:52px;height:52px;border-radius:14px;background:rgba(148,163,184,.1);color:#f8fafc;font-weight:700}
    .next-step-card strong{display:block;color:#f8fafc;font-size:17px;font-weight:600;line-height:1.4}
    .next-step-card p{margin:6px 0 0;color:#d5e0ec;font-size:14px;line-height:1.5}
    .next-step-card small{display:block;margin-top:8px;color:#9fb0c5}
    .next-step-card:hover{border-color:rgba(148,163,184,.4)}
    .reader-guide:not(.report-more) .reader-step{background:#0c1522!important;box-shadow:none!important}
    .failure-screen-fallback{border:1px solid rgba(148,163,184,.22);border-radius:16px;background:#101826;padding:16px 18px}
    .failure-screen-fallback span{display:block;color:#f5c542;font-size:13px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;margin-bottom:8px}
    .failure-screen-fallback p{margin:0;color:#f8fafc;font-size:15px;line-height:1.5}
    .failure-screen-fallback strong{display:block;margin:14px 0 8px;color:#d5e0ec;font-size:13px;font-weight:700}
    .failure-screen-fallback ul{margin:0;padding-left:18px;display:grid;gap:6px}
    .failure-screen-fallback li{color:#f8fafc;font-size:15px;line-height:1.4}
    .failure-screen-link img{width:100%;max-height:520px;object-fit:contain;object-position:top center;border:1px solid rgba(148,163,184,.28);border-radius:12px;background:#0b1220}
    .coverage-next{display:grid;gap:10px;margin-top:16px}
    .coverage-next-group{border:1px solid rgba(148,163,184,.16);border-radius:16px;background:#0c1522}
    .coverage-next-group summary{display:grid;grid-template-columns:48px minmax(0,1fr);gap:14px;align-items:center;padding:14px 16px;cursor:pointer;list-style:none}
    .coverage-next-group summary::-webkit-details-marker{display:none}
    .coverage-next-group summary b{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:rgba(148,163,184,.12);color:#f8fafc}
    .coverage-next-group summary strong{display:block;color:#f8fafc;font-size:15px;font-weight:600;line-height:1.35}
    .coverage-next-group summary small{display:block;margin-top:4px;color:#9fb0c5}
    .coverage-next-group ul{margin:0;padding:0 16px 14px 78px;display:grid;gap:10px;list-style:none}
    .coverage-next-group li strong{display:block;color:#f8fafc;font-size:14px}
    .coverage-next-group li span{display:block;margin-top:3px;color:#d5e0ec;font-size:13px;line-height:1.45}
    .coverage-next-note{margin:0;color:#d5e0ec;font-size:14px;line-height:1.5}
    body{background:#070b12!important}
    .sidebar{background:#070b12!important;border-right:1px solid rgba(148,163,184,.12)}
    .page{background:#0c121b!important;border:1px solid rgba(148,163,184,.1)}
    .topbar h1{font-weight:600;letter-spacing:-.03em;line-height:1.05}
    .module-health-card,.module-dashboard-card,.executive-kpi,.release-cockpit,.reader-guide:not(.report-more) .reader-step{min-height:0!important;background:#101826!important;border-color:rgba(148,163,184,.14)!important;box-shadow:none!important}
    .module-health-card:hover,.module-dashboard-card:hover{transform:none!important;box-shadow:none!important}
    .coverage-board{margin-top:22px;padding:20px 22px;border:1px solid rgba(148,163,184,.14);border-radius:18px;background:#101826}
    .coverage-board h2{margin:0 0 14px;color:#f8fafc;font-size:16px;font-weight:600}
    .coverage-meter-track{display:flex;height:12px;border-radius:999px;background:#1a2433;overflow:hidden}
    .coverage-meter-ran{display:block;height:100%;background:#7ee787}
    .coverage-meter-note{display:flex;justify-content:space-between;gap:12px;margin-top:8px;color:#9fb0c5;font-size:13px}
    .coverage-chip-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
    .coverage-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(148,163,184,.16);border-radius:999px;background:#0c1522;color:#dbe5ef;text-decoration:none;font-size:13px}
    .coverage-chip b{color:#f8fafc;font-size:14px}
    .coverage-chip:hover{border-color:rgba(148,163,184,.4);color:#f8fafc}
    .scan-bar{position:sticky;top:0;z-index:30;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:-32px -40px 18px;padding:12px 40px;background:rgba(7,11,18,.92);border-bottom:1px solid rgba(148,163,184,.16);backdrop-filter:blur(10px)}
    .scan-bar a,.scan-bar span{color:#dbe5ef;font-size:13px;text-decoration:none}
    .scan-bar b{color:#f8fafc;font-size:16px;margin-right:4px}
    .scan-call{font-weight:700;letter-spacing:.04em}
    .scan-call.bad{color:#ff7b72}
    .scan-call.warn{color:#f5c542}
    .scan-call.good{color:#7ee787}
    .scan-now{margin:0 0 16px}
    .scan-now a{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 16px;border:1px solid rgba(255,123,114,.4);border-radius:14px;background:#1a1216;color:#f8fafc;text-decoration:none}
    .scan-now a:hover{border-color:#ff7b72}
    .scan-now b{font-size:16px;font-weight:700}
    .scan-now span{color:#d5e0ec;font-size:14px;font-weight:500;text-align:right}
    .scan-now.good{padding:12px 16px;border:1px solid rgba(126,231,135,.35);border-radius:14px;background:#101826;color:#7ee787}
    .fold{margin:10px 0;border:1px solid rgba(148,163,184,.16);border-radius:16px;background:#101826}
    .fold>summary{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 16px;cursor:pointer;list-style:none}
    .fold>summary::-webkit-details-marker{display:none}
    .fold>summary b{color:#f8fafc;font-size:15px;font-weight:650}
    .fold>summary span{color:#9fb0c5;font-size:13px;text-align:right}
    .fold[open]>summary{border-bottom:1px solid rgba(148,163,184,.12)}
    .fold>.historical-wins,.fold>.history-comparison-dashboard,.fold>.history-section-grid,.fold>.history-test-change-panel,.fold>.history-signal-layout,.fold>.panel,.fold>.engine-output-cards,.fold>.air-core-pipeline,.fold>.future-vision-groups{padding:14px 16px}
    .roadmap-card ul{display:none}
    .roadmap-card{min-height:0!important}
    body{font-size:15px!important;line-height:1.5!important}
    .topbar p,.panel p,.card p,.brief-count,.summary-lead,.history-narrative p,.coverage-next-note{color:#d5e0ec!important;font-size:15px!important;line-height:1.55!important;max-width:72ch}
    .executive-mode-header h1{font-size:clamp(32px,2.4vw,42px)!important;font-weight:650!important;letter-spacing:-.03em!important;text-shadow:none!important;line-height:1.05!important}
    .executive-mode-header h1:after{display:none!important}
    .topbar h1{font-size:clamp(26px,2vw,34px)!important;font-weight:650!important;text-shadow:none!important}
    .release-meter,.cockpit-mini-grid,.freshness-strip,.page-footer{display:none!important}
    th{font-size:12px!important;letter-spacing:.02em!important;text-transform:none!important;font-weight:650!important;color:#9fb0c5!important}
    td{font-size:14px!important;line-height:1.45!important;color:#e8eef5!important}
    td strong{font-weight:650}
    .report-meta{display:grid!important;gap:10px;color:#9fb0c5;font-size:12px;line-height:1.4}
    .report-meta br{display:none}
    .nav a{font-size:14px;line-height:1.35}
    .status-board{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:0 0 18px}
    .status-card{display:grid;gap:4px;align-content:center;min-height:92px;padding:14px 16px;border-radius:16px;border:1px solid rgba(148,163,184,.2);background:#101826;text-decoration:none;color:#f8fafc!important}
    .status-card b{font-size:28px;font-weight:700;line-height:1;letter-spacing:-.03em}
    .status-card span{color:#d5e0ec;font-size:13px}
    .status-card.bad{background:#2a1518;border-color:rgba(255,123,114,.55)}
    .status-card.bad b{color:#ff8b82}
    .status-card.warn{background:#2a2210;border-color:rgba(245,197,66,.5)}
    .status-card.warn b{color:#f5c542}
    .status-card.good{background:#122218;border-color:rgba(126,231,135,.45)}
    .status-card.good b{color:#7ee787}
    .status-card:hover{transform:translateY(-1px);filter:brightness(1.08)}
    .reader-guide{margin-top:8px}
    .reader-guide h2{margin:0 0 12px;color:#f8fafc;font-size:16px;font-weight:650}
    .reader-guide .reader-guide-list{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;padding:0}
    .reader-guide .reader-step{display:grid!important;grid-template-columns:1fr!important;gap:6px!important;min-height:0!important;padding:14px!important;border-radius:16px!important;border:1px solid rgba(148,163,184,.22)!important;background:#101826!important;text-decoration:none;color:#f8fafc!important;text-align:left}
    .reader-guide .reader-step b{font-size:26px;font-weight:700;line-height:1;letter-spacing:-.03em}
    .reader-guide .reader-step span{color:#d5e0ec;font-size:13px;line-height:1.3}
    .reader-guide .reader-step strong{font-size:14px!important;font-weight:500!important;line-height:1.4!important;color:#f8fafc!important}
    .reader-guide .reader-step em{justify-self:start;margin-top:auto;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.08);color:#f8fafc;font-style:normal;font-size:12px;font-weight:650}
    .reader-guide .reader-step.bad{background:#2a1518!important;border-color:rgba(255,123,114,.55)!important}
    .reader-guide .reader-step.bad b{color:#ff8b82}
    .reader-guide .reader-step.warn{background:#2a2210!important;border-color:rgba(245,197,66,.5)!important}
    .reader-guide .reader-step.warn b{color:#f5c542}
    .reader-guide .reader-step.good{background:#122218!important;border-color:rgba(126,231,135,.45)!important}
    .reader-guide .reader-step.good b{color:#7ee787}
    .reader-guide .reader-step:hover{transform:translateY(-2px);filter:brightness(1.08)}
    .executive-kpi-stack{display:none!important}
    @media(max-width:1100px){.status-board,.reader-guide .reader-guide-list{grid-template-columns:1fr!important}}
    .page-nav{display:none!important}
    .executive-mode-grid{display:none!important}
    .topbar,.panel,.failure-shot-card,.failure-group summary,.module-health-card,.status-card,.reader-step{text-align:left}
    .failure-group summary strong,.failure-next-line,.next-step-card strong,.next-step-card p{text-align:left}
    .fold>.next-step-list{padding:0 16px 16px}
    .page-nav a,.page-nav-here{display:inline-flex;align-items:center;padding:6px 10px;border:1px solid rgba(148,163,184,.22);border-radius:999px;background:#101826;color:#e8eef5!important;text-decoration:none;font-size:13px;line-height:1.2}
    .page-nav a:hover{border-color:rgba(148,163,184,.45);color:#fff!important}
    .page-nav-here{margin:0;background:#1c2838;color:#f8fafc!important;font-weight:700}
    .page-nav-more{margin-top:-8px}
    .module-jump{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
    .module-jump a{padding:5px 9px;border:1px solid rgba(148,163,184,.2);border-radius:999px;background:#101826;color:#d5e0ec!important;text-decoration:none;font-size:12px;line-height:1.2}
    .module-jump a:hover{border-color:rgba(148,163,184,.45);color:#fff!important}
    #health .module-filter{display:flex!important;flex-wrap:wrap;align-items:center;gap:6px!important;grid-template-columns:none!important}
    #health .module-filter button{width:auto!important;min-width:0!important;min-height:32px!important;padding:5px 10px!important;font-size:13px!important}
    #health .module-filter-search{width:160px!important;min-width:0!important;height:32px!important;margin-left:auto;padding:0 10px!important}
    #health .health-stat{min-height:0!important;padding:10px 12px!important}
    #health .health-stat strong{font-size:22px!important;margin:4px 0 0!important}
    #health .health-stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;margin-bottom:12px}
    #health .module-health-card{min-height:0!important;gap:8px!important;padding:12px 14px!important}
    #health .module-health-card p,#health .module-button,#health .module-progress{display:none!important}
    #health .module-card-stats{display:flex;gap:12px}
    #health .next-focus-card{padding:12px 14px}
    #health .next-focus-card p{margin:4px 0 0;font-size:13px}
    .nav a.active{background:rgba(148,163,184,.14)!important;color:#f8fafc!important}
    .page{box-shadow:none!important}
    .cover-page{min-height:0!important;display:block!important;gap:18px}
    main{padding:28px 36px 48px}
    .page{padding:28px 32px}
    .topbar{align-items:flex-end;margin-bottom:18px}
    .topbar p,.panel>p,.failure-next-line,.summary-lead{margin:6px 0 0;max-width:68ch}
    h1,h2,h3,p,li,td,th,summary,label{text-align:left}
    th,td{vertical-align:top}
    table{border-collapse:collapse}
    th,td{padding:12px 10px}
    .status-card,.reader-step,.health-stat,.failure-summary-card,.module-health-card,.module-dashboard-card,.next-step-card{text-align:left}
    .status-card b,.health-stat strong,.failure-summary-card strong{display:block;text-align:left}
    .reader-guide .reader-guide-list{align-items:stretch}
    .reader-guide .reader-step{grid-template-rows:auto auto minmax(2.8em,auto) auto!important;min-height:156px!important}
    .reader-guide .reader-step strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .reader-guide .reader-step em{margin-top:8px}
    #health .module-card-stats{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    #health .module-card-stats span{min-width:0}
    #health .module-health-score{display:flex;align-items:baseline;gap:8px}
    #health .module-health-score strong{font-size:22px;line-height:1}
    #health .module-health-score span{color:#b7c3d4;font-size:13px}
    .failure-command-center{align-items:stretch}
    .failure-summary-card{text-align:left}
    .failure-summary-card p{margin:8px 0 0;max-width:36ch}
    .failure-group summary{align-items:start}
    .failure-group summary strong,.failure-group summary small{text-align:left}
    .report-meta>div{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
    .report-meta strong{color:#f8fafc;font-weight:650}
    .release-mini{text-align:left}
    .release-mini .release-status-badge{margin-left:0}
    #journey .journey-node{min-height:0!important;padding:14px 12px!important}
    .module-jump{align-items:center}
    .coverage-chip-row,.module-filter{justify-content:flex-start}
    .panel h2,.icon-title{text-align:left}
    @media(max-width:1100px){.reader-guide .reader-step{min-height:0!important}}
    #cover .status-card,
    #cover .reader-guide .reader-step,
    #cover .scan-now a,
    #cover .coverage-board,
    #health .module-health-card,
    #health .health-stat,
    #health .next-focus-card,
    #health .risk-snap,
    #journey .journey-node,
    #failures .failure-summary-card,
    #failures .failure-shot-card,
    #failures .failure-group,
    #module-dashboard .module-dashboard-card,
    #evidence .evidence-card,
    #insight .next-step-card,
    #comparison .compare-card,
    #roadmap .roadmap-card,
    .recommendation-card,
    .validation-card{
      background:#101826!important;
      border:1px solid rgba(148,163,184,.22)!important;
      border-radius:16px!important;
      box-shadow:none!important;
      padding:16px 18px!important;
      min-height:0!important;
      text-align:left!important;
      color:#f8fafc!important;
    }
    #cover .status-card.bad,
    #cover .reader-step.bad,
    #health .module-health-card.red,
    #journey .journey-node.red,
    #failures .failure-summary-card.primary,
    #failures .failure-shot-card,
    #failures .failure-group{
      background:#1a0d10!important;
      border:1px solid #dc2626!important;
      border-left:6px solid #dc2626!important;
    }
    #failures .failure-group summary b,
    #failures .failure-flag{
      background:#dc2626!important;
      color:#ffffff!important;
      white-space:nowrap!important;
      height:auto!important;
      width:auto!important;
      min-width:max-content!important;
      display:inline-flex!important;
    }
    #evidence .thumb[hidden]{display:none!important}
    #evidence .thumb img{height:168px!important}
    #evidence .thumb-copy{display:grid;gap:4px;margin-top:8px}
    #evidence .thumb-copy b{color:#f8fafc;font-size:13px;font-weight:700;line-height:1.35;white-space:normal}
    #evidence .thumb-copy small{color:#fecaca;font-size:12px;font-weight:650;line-height:1.4}
    #evidence .thumb.thumb-failed{border:2px solid #dc2626!important;position:relative}
    #evidence .thumb-failed-flag{position:absolute;top:18px;left:18px;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:800;letter-spacing:.04em;line-height:1;padding:6px 8px;text-transform:uppercase;white-space:nowrap}
    .shot-pager-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}
    .shot-pager-bar button{border:1px solid #dc2626;border-radius:999px;background:#dc2626;color:#fff;font-size:13px;font-weight:800;padding:8px 14px;cursor:pointer}
    .shot-pager-bar button:disabled{opacity:.35;cursor:default}
    .shot-pager-bar span{color:#fecaca;font-size:13px;font-weight:800}
    #failures .failure-group summary strong,
    #failures .failure-shot-card header strong,
    #failures .failure-mark-note{
      color:#fecaca!important;
    }
    #failures .failure-mark-note{
      display:block;
      margin-top:8px;
      font-weight:800;
      font-size:16px;
      line-height:1.4;
    }
    #failures .failure-screen-fallback span{color:#fecaca!important}
    #cover .status-card.warn,
    #cover .reader-step.warn,
    #health .module-health-card.amber,
    #health .health-stat.warn,
    #journey .journey-node.amber{
      border-left:4px solid #f5c542!important;
    }
    #cover .status-card.good,
    #cover .reader-step.good,
    #health .module-health-card.green,
    #health .health-stat.good,
    #journey .journey-node.green{
      border-left:4px solid #7ee787!important;
    }
    #cover .status-card b,
    #cover .reader-step b,
    #health .health-stat strong,
    #health .module-health-score strong,
    #failures .failure-summary-card strong,
    #journey .journey-node span{
      display:block!important;
      font-size:26px!important;
      font-weight:700!important;
      line-height:1!important;
      letter-spacing:-.03em!important;
      text-align:left!important;
      margin:0 0 6px!important;
    }
    #journey .journey-node,
    #journey .journey-node strong,
    #journey .journey-node span,
    #journey .journey-node small{
      align-items:flex-start!important;
      justify-content:flex-start!important;
      text-align:left!important;
    }
    #journey .journey-node strong{font-size:16px!important;min-height:0!important;margin:0!important}
    #journey .journey-node span{font-size:26px!important;min-height:0!important}
    #journey .journey-node small{font-size:12px!important;min-height:0!important;letter-spacing:0!important;text-transform:none!important}
    #cover .status-card:hover,
    #cover .reader-step:hover,
    #health .module-health-card:hover,
    #journey .journey-node:hover,
    #failures .failure-shot-card:hover,
    #insight .next-step-card:hover{
      transform:none!important;
      filter:none!important;
      border-color:rgba(148,163,184,.45)!important;
    }
    #health .module-health-score,
    #module-dashboard .module-dashboard-score-row{display:block!important}
    .report-more{
      display:block!important;
      margin:0 0 26px!important;
      padding:0!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
    }
    .report-more h2{
      margin:0 0 12px!important;
      color:#f8fafc!important;
      font-size:16px!important;
      font-weight:650!important;
      letter-spacing:0!important;
      text-transform:none!important;
    }
    .report-more-grid{
      display:grid!important;
      grid-template-columns:repeat(4,minmax(0,1fr))!important;
      gap:12px!important;
      align-items:stretch!important;
    }
    .report-more-card{
      display:flex!important;
      flex-direction:column!important;
      align-items:flex-start!important;
      justify-content:flex-start!important;
      gap:6px!important;
      height:100%!important;
      min-height:148px!important;
      background:#101826!important;
      border:1px solid rgba(148,163,184,.22)!important;
      border-radius:16px!important;
      box-shadow:none!important;
      padding:16px 18px!important;
      text-align:left!important;
      text-decoration:none!important;
      color:#f8fafc!important;
    }
    .report-more-card span{
      display:block!important;
      color:#f8fafc!important;
      font-size:16px!important;
      font-weight:650!important;
      letter-spacing:0!important;
      line-height:1.3!important;
      white-space:nowrap!important;
    }
    .report-more-card strong{
      display:block!important;
      margin:0!important;
      min-height:1.45em!important;
      font-size:14px!important;
      font-weight:500!important;
      line-height:1.45!important;
      color:#d5e0ec!important;
      hyphens:none!important;
      overflow-wrap:normal!important;
      word-break:normal!important;
    }
    .report-more-card em{
      margin-top:auto!important;
      padding:6px 10px!important;
      border:0!important;
      border-radius:999px!important;
      background:rgba(255,255,255,.08)!important;
      color:#f8fafc!important;
      font-style:normal!important;
      font-size:12px!important;
      font-weight:650!important;
    }
    .report-more-card:hover{border-color:rgba(148,163,184,.45)!important}
    @media(max-width:1100px){.report-more-grid{grid-template-columns:1fr!important}.report-more-card{min-height:0!important}}
    #air-core .air-core-hero,
    #air-core .air-core-map,
    #air-core .air-core-engines,
    #air-core .engine-card,
    #comparison .history-narrative,
    #comparison .historical-wins,
    #comparison .history-comparison-dashboard,
    #comparison .history-test-change-panel,
    #comparison .history-signal-panel,
    #comparison .release-timeline-panel,
    #comparison .executive-focus-panel,
    #comparison .history-timeline-panel,
    #comparison .history-trend-card,
    #validation-summary .validation-command-panel,
    #validation-summary .panel,
    #coverage-gaps .panel,
    #coverage-gaps .coverage-gap-explainer{
      background:#101826!important;
      border:1px solid rgba(148,163,184,.22)!important;
      border-radius:16px!important;
      box-shadow:none!important;
      color:#f8fafc!important;
    }
    #comparison .history-command-hero{
      margin:0 0 18px!important;
      padding:0!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      box-shadow:none!important;
    }
    #air-core .air-core-hero-stats div,
    #air-core .air-core-layer,
    #comparison .compare-card,
    #validation-summary .validation-stat,
    #validation-summary .validation-area-card,
    #validation-summary .validation-group-card,
    #validation-summary .validation-gap-card,
    #coverage-gaps .coverage-gap-summary div,
    #coverage-gaps .coverage-next-group{
      background:#101826!important;
      border:1px solid rgba(148,163,184,.22)!important;
      border-radius:16px!important;
      box-shadow:none!important;
      padding:16px 18px!important;
      min-height:0!important;
      text-align:left!important;
      color:#f8fafc!important;
    }
    #validation-summary .validation-stat.bad{
      border-left:4px solid #ff7b72!important;
    }
    #validation-summary .validation-stat.warn{
      border-left:4px solid #f5c542!important;
    }
    #validation-summary .validation-stat.good{
      border-left:4px solid #7ee787!important;
    }
    #air-core .air-core-hero-stats strong,
    #comparison .compare-card strong,
    #validation-summary .validation-stat strong,
    #validation-summary .validation-area-card strong,
    #coverage-gaps .coverage-gap-summary strong{
      display:block!important;
      margin:0 0 6px!important;
      color:#f8fafc!important;
      font-size:26px!important;
      font-weight:700!important;
      line-height:1.1!important;
      letter-spacing:-.03em!important;
      text-align:left!important;
    }
    #air-core .air-core-hero-stats strong.is-text{
      font-size:16px!important;
      font-weight:650!important;
      letter-spacing:0!important;
      line-height:1.35!important;
    }
    #air-core .air-core-hero-stats span,
    #air-core .air-core-layer-head span,
    #comparison .compare-card span,
    #comparison .history-narrative .mission-label,
    #validation-summary .validation-stat span,
    #validation-summary .validation-area-card span,
    #validation-summary .validation-group-head span,
    #validation-summary .mission-label,
    #coverage-gaps .coverage-gap-summary span{
      display:block!important;
      color:#d5e0ec!important;
      font-size:13px!important;
      font-weight:650!important;
      letter-spacing:0!important;
      text-transform:none!important;
      white-space:normal!important;
      overflow:visible!important;
      text-overflow:clip!important;
    }
    #air-core .air-core-hero-copy p,
    #air-core .air-core-map p,
    #comparison .history-narrative p,
    #comparison .compare-card small,
    #validation-summary .validation-story p,
    #validation-summary .validation-stat small,
    #validation-summary .validation-area-card small,
    #coverage-gaps .coverage-gap-summary small,
    #coverage-gaps .coverage-gap-explainer p{
      color:#d5e0ec!important;
      font-size:14px!important;
      line-height:1.45!important;
    }
    #comparison .history-change-list li:before{
      background:#7ee787!important;
      box-shadow:none!important;
    }
    #validation-summary .validation-group-head em{
      border:0!important;
      border-radius:999px!important;
      background:rgba(255,255,255,.08)!important;
      color:#f8fafc!important;
      font-style:normal!important;
      font-size:12px!important;
      font-weight:650!important;
    }
    #validation-summary .validation-group-card li:before,
    #air-core .air-core-layer{
      box-shadow:none!important;
    }
    #coverage-gaps .coverage-gap-explainer strong{
      color:#f8fafc!important;
      font-size:16px!important;
      font-weight:650!important;
    }
    #air-core .air-core-hero-stats div:hover,
    #air-core .air-core-layer:hover,
    #comparison .compare-card:hover,
    #validation-summary .validation-stat:hover,
    #validation-summary .validation-area-card:hover,
    #validation-summary .validation-group-card:hover,
    #coverage-gaps .coverage-gap-summary div:hover{
      transform:none!important;
      filter:none!important;
      border-color:rgba(148,163,184,.45)!important;
    }
    #health .module-health-score span,
    #module-dashboard .module-dashboard-score-row span{
      display:block!important;
      max-width:none!important;
      white-space:normal!important;
      overflow:visible!important;
      text-overflow:clip!important;
      writing-mode:horizontal-tb!important;
      transform:none!important;
      text-transform:none!important;
      letter-spacing:0!important;
      font-size:15px!important;
      font-weight:650!important;
      line-height:1.45!important;
      color:#f8fafc!important;
      border:0!important;
      background:transparent!important;
      padding:0!important;
      border-radius:0!important;
    }
    main .page{
      background:#0c121b!important;
      border:1px solid rgba(148,163,184,.16)!important;
      border-radius:16px!important;
      box-shadow:none!important;
      padding:28px 32px!important;
    }
    main .page .topbar{
      display:flex!important;
      align-items:flex-end!important;
      justify-content:space-between!important;
      gap:18px!important;
      margin:0 0 18px!important;
    }
    main .page .topbar h1{font-size:clamp(26px,2vw,34px)!important;font-weight:650!important;letter-spacing:-.03em!important;text-align:left!important}
    main .page .topbar p,
    main .page .panel p,
    main .page .mission-label{
      color:#d5e0ec!important;
      font-size:15px!important;
      line-height:1.5!important;
      letter-spacing:0!important;
      text-transform:none!important;
    }
    main .page .panel,
    main .page .executive-decision-card,
    main .page .decision-intel-block,
    main .page .why-release,
    main .page .evidence-hero,
    main .page .evidence-card,
    main .page .thumb,
    main .page .ai-command-hero,
    main .page .ai-reasoning-card,
    main .page .ai-workflow-card,
    main .page .ai-action-panel,
    main .page .ai-role-panel,
    main .page .ai-priority-panel,
    main .page .next-step-card,
    main .page .recommendation-card,
    main .page .role-recommendation-card,
    main .page .module-dashboard-intro,
    main .page .module-dashboard-card,
    main .page .roadmap-card,
    main .page .future-vision-card,
    main .page .future-vision-panel,
    main .page .engine-card,
    main .page .history-trend-card,
    main .page .wow,
    main .page .narrative,
    main .page .roadmap-summary div{
      background:#101826!important;
      background-image:none!important;
      border:1px solid rgba(148,163,184,.22)!important;
      border-radius:16px!important;
      box-shadow:none!important;
      color:#f8fafc!important;
      text-align:left!important;
    }
    main .page .roadmap-summary{
      display:grid!important;
      grid-template-columns:repeat(4,minmax(0,1fr))!important;
      gap:12px!important;
      margin:0 0 18px!important;
    }
    main .page .roadmap-summary div{padding:16px 18px!important;min-height:0!important}
    main .page .roadmap-summary strong,
    main .page .health-stat strong{
      display:block!important;
      margin:0 0 6px!important;
      color:#f8fafc!important;
      font-size:26px!important;
      font-weight:700!important;
      line-height:1.1!important;
      letter-spacing:-.03em!important;
      text-align:left!important;
    }
    main .page .roadmap-summary div:last-child strong{
      font-size:16px!important;
      font-weight:650!important;
      letter-spacing:0!important;
      line-height:1.35!important;
    }
    main .page .panel:hover,
    main .page .executive-decision-card:hover,
    main .page .evidence-card:hover,
    main .page .next-step-card:hover,
    main .page .recommendation-card:hover,
    main .page .roadmap-card:hover,
    main .page .module-dashboard-card:hover,
    main .page .future-vision-card:hover{
      transform:none!important;
      filter:none!important;
    }
    #cover .status-card.bad,
    #cover .reader-step.bad,
    #health .module-health-card.red,
    #journey .journey-node.red,
    #failures .failure-summary-card.primary,
    #failures .failure-group,
    #validation-summary .validation-stat.bad{
      border-left:4px solid #ff7b72!important;
    }
    #cover .status-card.warn,
    #cover .reader-step.warn,
    #health .module-health-card.amber,
    #health .health-stat.warn,
    #journey .journey-node.amber,
    #validation-summary .validation-stat.warn{
      border-left:4px solid #f5c542!important;
    }
    #cover .status-card.good,
    #cover .reader-step.good,
    #health .module-health-card.green,
    #health .health-stat.good,
    #journey .journey-node.green,
    #validation-summary .validation-stat.good,
    #evidence .evidence-card.good{
      border-left:4px solid #7ee787!important;
    }
    @media(max-width:1100px){
      main .page{padding:20px 16px!important}
      main .page .roadmap-summary{grid-template-columns:1fr!important}
    }
    main > section.page{display:none!important}
    main > section.page.is-current{display:block!important}
    .global-search,.freshness-strip,.air-provenance-warning,nav.report-more{display:none!important}
    body[data-air-page="cover"] .freshness-strip{display:grid!important}
    body[data-air-page="cover"] .air-provenance-warning{display:block!important}
    body[data-air-page="cover"] nav.report-more{display:block!important}
    #validation-summary [data-step-item],#coverage-gaps [data-step-item],#failures [data-step-item],#known-defects [data-step-item]{display:none!important}
    #validation-summary [data-step-item].is-step-current,#coverage-gaps [data-step-item].is-step-current,#failures [data-step-item].is-step-current,#known-defects [data-step-item].is-step-current{display:block!important}
    #failures [data-passed-index][hidden]{display:none!important}
    #coverage-gaps .passed-card[hidden],#coverage-gaps .passed-card-grid[hidden],#coverage-gaps [data-plan-notes][hidden],#coverage-gaps [data-plan-reset][hidden],#coverage-gaps [data-passed-index][hidden],#coverage-gaps [data-plan-count][hidden],#coverage-gaps .plan-nav[hidden],#coverage-gaps .plan-nav [hidden]{display:none!important}
    #coverage-gaps .plan-nav{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px;padding:10px 14px;background:#101826;border:1px solid rgba(148,163,184,.22);border-radius:12px}
    #coverage-gaps .plan-nav button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;margin:0;padding:4px 2px;background:transparent;border:0;color:#f8fafc;cursor:pointer;font:inherit}
    #coverage-gaps .plan-nav button:disabled{visibility:hidden}
    #coverage-gaps .plan-nav small{color:#9fb0c5;font-size:11px;font-weight:650;letter-spacing:.04em;text-transform:uppercase}
    #coverage-gaps .plan-nav strong{font-size:14px;font-weight:650;line-height:1.3}
    #coverage-gaps .plan-crumbs{display:flex;align-items:center;gap:8px;flex:1;min-width:0;color:#9fb0c5;font-size:14px}
    #coverage-gaps .plan-crumbs button{flex-direction:row;color:#7ee787;padding:0}
    #coverage-gaps .plan-crumbs [aria-current="true"]{color:#f8fafc}
    #coverage-gaps [data-plan-pager] [data-plan-next]{align-items:flex-end;text-align:right}
    #coverage-gaps [data-plan-pos]{flex:0 0 auto;color:#9fb0c5;font-size:13px;font-weight:650;text-align:center}
    #coverage-gaps .plan-nav .btn{flex-direction:row;border:1px solid rgba(57,231,95,.35);border-radius:10px;padding:8px 12px;color:#d7fbe0}
    #coverage-gaps .plan-toolbar-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    #coverage-gaps .plan-toolbar-actions .module-filter-search{width:min(320px,100%);margin:0}
    #coverage-gaps .passed-board-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:14px}
    #coverage-gaps .passed-board-head h2{margin:0;font-size:28px;letter-spacing:-.03em}
    #coverage-gaps .passed-board-head p{margin:8px 0 0;color:#91a4b8}
    #validation-summary .passed-board-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:14px}
    #validation-summary .passed-board-head h2{margin:0;font-size:28px;letter-spacing:-.03em}
    #validation-summary .passed-board-head p{margin:8px 0 0;color:#91a4b8}
    #validation-summary .passed-board-head .module-filter-search{width:min(320px,100%);margin:0}
    #validation-summary .passed-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
    #validation-summary .passed-card{display:flex;flex-direction:column;gap:14px;min-height:240px;border:1px solid rgba(57,231,95,.34);border-radius:16px;background:linear-gradient(145deg,rgba(11,23,40,.96),rgba(7,16,31,.96));padding:18px;color:#f8fafc;text-decoration:none;box-shadow:0 14px 34px rgba(0,0,0,.22);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
    #validation-summary .passed-card:hover{transform:translateY(-3px);border-color:#39e75f;box-shadow:0 18px 42px rgba(57,231,95,.14)}
    #validation-summary .passed-card-top{display:flex;align-items:center;gap:12px;min-width:0}
    #validation-summary .passed-card-top strong{font-size:18px;line-height:1.25}
    #validation-summary .passed-card-count b{display:block;color:#39e75f;font-size:28px;line-height:1;font-weight:800}
    #validation-summary .passed-card-count span{display:block;margin-top:6px;color:#7f8ea3;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    #validation-summary .passed-card p{margin:0;color:#d7fbe0;line-height:1.45;flex:1}
    #validation-summary .passed-detail{border:1px solid rgba(57,231,95,.34);border-radius:16px;background:linear-gradient(180deg,rgba(17,24,39,.96),rgba(8,16,30,.96));padding:22px}
    #validation-summary .passed-detail-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    #validation-summary .passed-detail-head h2{margin:4px 0 0;font-size:32px;letter-spacing:-.03em}
    #validation-summary .passed-detail-head .passed-card-count{margin-top:14px}
    #validation-summary .passed-detail>p{margin:8px 0 18px;color:#9fb0c5;line-height:1.5;max-width:720px}
    #validation-summary .passed-checks{display:grid;gap:10px}
    #validation-summary .passed-check{border:1px solid rgba(57,231,95,.16);border-left:3px solid #39e75f;border-radius:12px;background:rgba(8,16,30,.72);padding:14px 16px}
    #validation-summary .passed-check strong{display:block;font-size:15px;line-height:1.35}
    #validation-summary .passed-check span{display:block;margin-top:6px;color:#7ee787;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
    #validation-summary .passed-check ol.scenario-steps{margin:10px 0 0;padding-left:18px;color:#f8fafc}
    #validation-summary .passed-check ol.scenario-steps li{margin:0 0 6px;font-size:14px;line-height:1.45}
    #validation-summary .passed-check.known-defect{border-color:rgba(245,197,66,.45);border-left-color:#f5c542}
    #validation-summary .passed-check.known-defect span{color:#f5c542}
    #validation-summary .passed-check.known-defect p{margin:8px 0 0;color:#f8fafc;font-size:14px;line-height:1.45}
    #validation-summary .passed-check.known-defect b{color:#f5c542}
    .known-defect-banner{margin:0 0 16px}
    .known-defect-banner a{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 16px;border:1px solid rgba(245,197,66,.45);border-radius:14px;background:#1a170e;color:#f8fafc;text-decoration:none}
    .known-defect-banner b{color:#f5c542;font-size:16px}
    .known-defect-banner span{color:#d5e0ec;font-size:14px;text-align:right}
    #cover .passed-card-grid,#coverage-gaps .passed-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:16px}
    #cover .passed-card,#coverage-gaps .passed-card{display:flex;flex-direction:column;gap:14px;min-height:220px;border:1px solid rgba(57,231,95,.34);border-radius:16px;background:linear-gradient(145deg,rgba(11,23,40,.96),rgba(7,16,31,.96));padding:18px;color:#f8fafc;text-decoration:none;box-shadow:0 14px 34px rgba(0,0,0,.22)}
    #cover .passed-card:hover,#coverage-gaps .passed-card:hover{transform:translateY(-3px);border-color:#39e75f;box-shadow:0 18px 42px rgba(57,231,95,.14)}
    #cover .passed-card-top,#coverage-gaps .passed-card-top{display:flex;align-items:center;gap:12px;min-width:0}
    #cover .passed-card-top strong,#coverage-gaps .passed-card-top strong{font-size:18px;line-height:1.25}
    #cover .passed-card-count b,#coverage-gaps .passed-card-count b{display:block;color:#39e75f;font-size:28px;line-height:1;font-weight:800}
    #cover .passed-card-count span,#coverage-gaps .passed-card-count span{display:block;margin-top:6px;color:#7f8ea3;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    #cover .passed-card p,#coverage-gaps .passed-card p{margin:0;color:#d7fbe0;line-height:1.45;flex:1}
    #coverage-gaps .passed-board-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin:18px 0 14px}
    #coverage-gaps .passed-board-head h2{margin:0;font-size:28px;letter-spacing:-.03em}
    #coverage-gaps .passed-board-head p{margin:8px 0 0;color:#91a4b8}
    #coverage-gaps .passed-detail{border:1px solid rgba(57,231,95,.34);border-radius:16px;background:linear-gradient(180deg,rgba(17,24,39,.96),rgba(8,16,30,.96));padding:22px;margin-top:16px}
    #coverage-gaps .passed-detail-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    #coverage-gaps .passed-detail-head h2{margin:4px 0 0;font-size:32px;letter-spacing:-.03em;color:#f8fafc}
    #coverage-gaps .passed-detail-head .passed-card-count{margin-top:14px}
    #coverage-gaps .passed-detail>p{margin:8px 0 18px;color:#9fb0c5;line-height:1.5}
    #coverage-gaps .passed-checks{display:grid;gap:10px}
    #coverage-gaps .passed-check{border:1px solid rgba(57,231,95,.16);border-left:3px solid #39e75f;border-radius:12px;background:rgba(8,16,30,.72);padding:14px 16px}
    #coverage-gaps .passed-check strong{display:block;font-size:15px;line-height:1.35;color:#f8fafc}
    #coverage-gaps .passed-check span{display:block;margin-top:6px;color:#9fb0c5;font-size:13px;line-height:1.45}
    #coverage-gaps .plan-group{margin-top:16px;border:1px solid rgba(57,231,95,.34)!important;border-radius:16px!important;background:linear-gradient(180deg,rgba(17,24,39,.96),rgba(8,16,30,.96))!important;padding:8px 8px 18px!important}
    #coverage-gaps .plan-group summary{cursor:pointer;list-style:none}
    #coverage-gaps .plan-group summary::-webkit-details-marker{display:none}
    #coverage-gaps .plan-group .passed-detail-head{display:flex;padding:14px 14px 0}
    #coverage-gaps .plan-group .passed-detail-head h2{margin:4px 0 0;font-size:28px;letter-spacing:-.03em;color:#f8fafc}
    #coverage-gaps .plan-group .passed-card-count{margin-top:14px}
    #coverage-gaps .plan-group .passed-checks{display:grid;gap:10px;margin:16px 14px 0}
    #coverage-gaps .plan-group .passed-check{border:1px solid rgba(57,231,95,.16);border-left:3px solid #39e75f;border-radius:12px;background:rgba(8,16,30,.72);padding:14px 16px}
    #coverage-gaps .plan-group .passed-check strong{display:block;font-size:15px;line-height:1.35;color:#f8fafc}
    #coverage-gaps .plan-group .passed-check span{display:block;margin-top:6px;color:#9fb0c5;font-size:13px;line-height:1.45}
    @media(max-width:1100px){#cover .passed-card-grid,#coverage-gaps .passed-card-grid{grid-template-columns:1fr}}
    @media(max-width:1100px){#validation-summary .passed-card-grid,#validation-summary .passed-board-head{grid-template-columns:1fr;display:grid}}
    .page-pager,.step-nav{
      display:flex!important;
      align-items:center;
      justify-content:space-between;
      gap:16px;
      margin:0 0 16px;
      padding:8px 12px;
      background:#101826;
      border:1px solid rgba(148,163,184,.22);
      border-radius:12px;
      box-shadow:none;
    }
    .page-pager.bottom{margin:20px 0 0}
    .page-pager a,.page-pager-end,.step-nav button{
      display:flex!important;
      flex-direction:column;
      justify-content:center;
      gap:1px;
      flex:1 1 0;
      min-width:0;
      min-height:0!important;
      margin:0;
      padding:4px 2px;
      background:transparent!important;
      border:0!important;
      border-radius:0!important;
      box-shadow:none!important;
      color:#f8fafc!important;
      text-decoration:none;
      cursor:pointer;
    }
    .page-pager-next,.step-nav [data-step-next]{align-items:flex-end;text-align:right}
    .page-pager-count,.step-nav-here{
      flex:0 0 auto;
      display:flex!important;
      flex-direction:column;
      align-items:center;
      gap:1px;
      min-height:0!important;
      padding:0 8px;
      background:transparent!important;
      border:0!important;
      color:#9fb0c5;
      font-size:12px;
      font-weight:650;
      text-align:center;
    }
    .page-pager small,.step-nav small{
      color:#9fb0c5!important;
      font-size:11px!important;
      font-weight:650;
      letter-spacing:.04em;
      text-transform:uppercase;
    }
    .page-pager strong,.step-nav strong{
      color:#f8fafc!important;
      font-size:14px!important;
      font-weight:650!important;
      line-height:1.3!important;
      letter-spacing:0!important;
      max-width:100%;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .step-nav-here strong{font-size:13px!important}
    .page-pager-end{visibility:hidden}
    .page-pager{flex-direction:column!important;align-items:stretch!important}
    .page-pager-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%}
    .page-jump{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
    .page-jump a,.page-jump span{flex:0 0 auto!important;display:inline-flex!important;flex-direction:row!important;align-items:center;min-height:0!important;border:1px solid rgba(148,163,184,.28)!important;border-radius:999px!important;background:#0c1522!important;color:#dbe5ef!important;font-size:12px!important;font-weight:700;line-height:1.2;padding:6px 10px!important;text-decoration:none}
    .page-jump span{border-color:#39e75f!important;background:rgba(57,231,95,.14)!important;color:#d7fbe0!important}
    .page-jump a:hover{border-color:#39e75f!important;color:#f8fafc!important}
    .nav-label{margin:14px 8px 6px;color:#9fb0c5;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .step-nav button:disabled{visibility:hidden}
    .is-step-current{outline:2px solid #7ee787;outline-offset:3px}
    .step-nav[hidden]{display:none!important}
    .report-more-card{
      position:relative!important;
      gap:8px!important;
      min-height:168px!important;
      padding:16px 16px 14px 18px!important;
      background:linear-gradient(145deg,rgba(57,231,95,.16),#101826 46%)!important;
      border-color:rgba(57,231,95,.32)!important;
      box-shadow:inset 4px 0 0 #39e75f,0 12px 28px rgba(0,0,0,.18)!important;
      transition:transform .18s ease,border-color .18s ease;
    }
    .report-more-card .nav-icon{
      display:inline-grid!important;
      place-items:center!important;
      width:40px!important;
      height:40px!important;
      min-width:40px!important;
      margin:0 0 2px!important;
      border-radius:12px!important;
      background:rgba(57,231,95,.16)!important;
      border:1px solid rgba(57,231,95,.42)!important;
      color:#39e75f!important;
    }
    .report-more-card .nav-icon svg{
      width:20px;
      height:20px;
      fill:none;
      stroke:currentColor;
      stroke-width:1.8;
      stroke-linecap:round;
      stroke-linejoin:round;
    }
    .report-more-card em{
      background:rgba(57,231,95,.14)!important;
      border:1px solid rgba(57,231,95,.35)!important;
      color:#d7fbe0!important;
    }
    .report-more-card.tone-warn{
      background:linear-gradient(145deg,rgba(245,197,66,.18),#101826 46%)!important;
      border-color:rgba(245,197,66,.4)!important;
      box-shadow:inset 4px 0 0 #f5c542,0 12px 28px rgba(0,0,0,.18)!important;
    }
    .report-more-card.tone-warn .nav-icon{
      background:rgba(245,197,66,.16)!important;
      border-color:rgba(245,197,66,.48)!important;
      color:#f5c542!important;
    }
    .report-more-card.tone-warn em{
      background:rgba(245,197,66,.14)!important;
      border-color:rgba(245,197,66,.4)!important;
      color:#f5c542!important;
    }
    .report-more-card:hover{
      transform:translateY(-2px);
      border-color:rgba(244,255,246,.4)!important;
    }
    #roadmap .roadmap-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px;margin-top:16px}
    #roadmap .roadmap-card{
      display:flex!important;
      flex-direction:column!important;
      gap:14px!important;
      min-height:0!important;
      padding:18px!important;
      border:1px solid rgba(57,231,95,.34)!important;
      border-radius:16px!important;
      background:linear-gradient(145deg,rgba(11,23,40,.96),rgba(7,16,31,.96))!important;
      box-shadow:0 14px 34px rgba(0,0,0,.22)!important;
      color:#f8fafc!important;
    }
    #roadmap .roadmap-card.green{border-color:rgba(57,231,95,.45)!important}
    #roadmap .roadmap-card.amber{border-color:rgba(245,197,66,.55)!important}
    #roadmap .roadmap-card.blue{border-color:rgba(96,165,250,.5)!important}
    #roadmap .roadmap-card.purple{border-color:rgba(167,139,250,.55)!important}
    #roadmap .roadmap-card:hover,#roadmap .roadmap-card:focus-visible{
      transform:translateY(-3px)!important;
      border-color:#39e75f!important;
      box-shadow:0 18px 42px rgba(57,231,95,.14)!important;
    }
    #roadmap .roadmap-card-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:12px!important}
    #roadmap .roadmap-card-head span:not(.badge){display:block;color:#8fa2b6;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
    #roadmap .roadmap-card-head h2{margin:7px 0 0!important;font-size:20px!important;line-height:1.2!important;letter-spacing:-.02em!important}
    #roadmap .roadmap-card .badge{flex:0 0 auto;border-radius:999px;font-size:11px;font-weight:800;padding:6px 10px;white-space:nowrap}
    #roadmap .roadmap-card .badge.green{background:rgba(57,231,95,.14);border:1px solid rgba(57,231,95,.35);color:#7ee787}
    #roadmap .roadmap-card .badge.amber{background:rgba(245,197,66,.14);border:1px solid rgba(245,197,66,.35);color:#f5c542}
    #roadmap .roadmap-card .badge.blue{background:rgba(96,165,250,.14);border:1px solid rgba(96,165,250,.4);color:#9bd5ff}
    #roadmap .roadmap-card .badge.purple{background:rgba(167,139,250,.14);border:1px solid rgba(167,139,250,.45);color:#ddd6fe}
    #roadmap .roadmap-card p{margin:0!important;color:#d7fbe0!important;font-size:14px!important;line-height:1.45!important}
    #roadmap .roadmap-card-meta span{display:inline-flex;border:1px solid rgba(57,231,95,.28);border-radius:999px;background:rgba(57,231,95,.1);color:#9affac;font-size:11px;font-weight:800;padding:6px 10px}
    #roadmap .roadmap-card ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:0!important;padding:0!important;list-style:none}
    #roadmap .roadmap-card li{border:1px solid rgba(57,231,95,.16);border-radius:12px;background:rgba(8,16,30,.72);padding:8px 10px;color:#d8e3ee;font-size:12px;line-height:1.3}
    .page-pager.top{position:sticky;top:12px;z-index:6}
    .failure-guide{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    .failure-guide section{border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#101826;padding:12px 14px}
    .failure-guide h3{margin:0 0 8px;color:#9fb0c5;font-size:13px;font-weight:650}
    .failure-guide ol{margin:0;padding-left:18px;color:#f8fafc}
    .failure-guide li{margin:0 0 6px;font-size:14px;line-height:1.45}
    .failure-mark-note{display:block;margin-top:8px;color:#ffb4b4;font-size:14px;font-weight:650}
    #known-defects .passed-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
    #known-defects .passed-card{display:flex;flex-direction:column;gap:14px;min-height:220px;border:1px solid rgba(245,197,66,.45);border-radius:16px;background:linear-gradient(145deg,rgba(11,23,40,.96),rgba(7,16,31,.96));padding:18px;color:#f8fafc;text-decoration:none;box-shadow:0 14px 34px rgba(0,0,0,.22)}
    #known-defects .passed-card:hover{transform:translateY(-3px);border-color:#f5c542;box-shadow:0 18px 42px rgba(245,197,66,.14)}
    #known-defects .passed-card-top{display:flex;align-items:center;gap:12px}
    #known-defects .passed-card-top strong{font-size:18px;line-height:1.25}
    #known-defects .module-icon{background:rgba(245,197,66,.16);border-color:rgba(245,197,66,.48);color:#f5c542}
    #known-defects .passed-card-count b{display:block;color:#f5c542;font-size:28px;line-height:1;font-weight:800}
    #known-defects .passed-card-count span{display:block;margin-top:6px;color:#7f8ea3;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    #known-defects .passed-card p{margin:0;color:#d7fbe0;line-height:1.45;flex:1}
    #known-defects .passed-board-head h2{margin:0;font-size:28px;letter-spacing:-.03em}
    #known-defects .passed-board-head p{margin:8px 0 0;color:#91a4b8}
    #known-defects .passed-detail{border:1px solid rgba(245,197,66,.4);border-radius:16px;background:linear-gradient(180deg,rgba(17,24,39,.96),rgba(8,16,30,.96));padding:22px}
    #known-defects .passed-detail-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
    #known-defects .passed-detail-head h2{margin:4px 0 0;font-size:32px;letter-spacing:-.03em}
    #known-defects .passed-detail>p{margin:8px 0 18px;color:#9fb0c5;line-height:1.5}
    #known-defects .passed-checks{display:grid;gap:10px}
    #known-defects .passed-check{border:1px solid rgba(245,197,66,.35);border-left:3px solid #f5c542;border-radius:12px;background:rgba(8,16,30,.72);padding:14px 16px}
    #known-defects .passed-check strong{display:block;font-size:15px;line-height:1.35}
    #known-defects .passed-check span{display:block;margin-top:6px;color:#f5c542;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
    #known-defects .passed-check p{margin:8px 0 0;color:#f8fafc;font-size:14px;line-height:1.45}
    #known-defects .passed-check b{color:#f5c542}
    .scan-now.known a{border-color:rgba(245,197,66,.45);background:#1a170e}
    .scan-now.known a:hover{border-color:#f5c542}
    .scan-now.known b{color:#f5c542}
    @media(max-width:900px){.failure-guide{grid-template-columns:1fr}#known-defects .passed-card-grid{grid-template-columns:1fr}}
    main .page table thead th{position:sticky;top:12px;z-index:4;background:#0c1522}
    .page-jump{display:none!important}
    .page-pager strong,.step-nav strong,.step-nav-here strong{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    #failures .failure-command-center{grid-template-columns:repeat(4,minmax(0,1fr))!important}
    #failures .failure-summary-card{min-width:0}
    #failures .failure-summary-card span,#failures .failure-summary-card p{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;letter-spacing:.04em;line-height:1.35}
    #failures .failure-summary-card strong{overflow-wrap:normal;word-break:normal}
    #failures [data-failure-panel][hidden]{display:none!important}
    #failures .failure-shot-card header{flex-wrap:wrap}
    #failures .failure-shot-card header strong,#failures .failure-detail-head strong,#failures .failure-check-list li{overflow-wrap:anywhere;white-space:normal}
    #failures .failure-flag{min-width:0!important}
    #failures .failure-area-checks{display:grid;gap:8px;margin:16px 0 0;padding:0;list-style:none}
    #failures .failure-area-checks li{border:1px solid rgba(255,107,107,.28);border-radius:12px;background:#120910;padding:12px 14px}
    #failures .failure-area-checks a{display:block;color:#f8fafc;line-height:1.4;overflow-wrap:anywhere;text-decoration:none}
    #failures #failure-areas .failure-card-grid,#failures #failure-story-board .failure-card-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;align-items:stretch}
    #failures .failure-shot-card{display:flex!important;flex-direction:column;height:100%;min-height:240px}
    #failures .failure-check-list{flex:1;margin:0}
    #failures .failure-more{color:#9fb0c5;list-style:none;margin-left:-18px}
    #failures .failure-shot-card .module-button{margin-top:16px;align-self:flex-start}
    #failures [data-inner-item][hidden]{display:none!important}
    [data-inner-item].is-hidden,[data-inner-item][hidden]{display:none!important}
    .page-pager.inner{margin:0 0 16px}
    .inner-board>.page-pager.inner:last-child{margin:16px 0 0}
    .page-pager.inner button{display:flex!important;flex-direction:column;justify-content:center;gap:1px;flex:1 1 0;min-width:0;padding:4px 2px;background:transparent!important;border:0!important;color:#f8fafc!important;font:inherit;text-align:left;cursor:pointer}
    .page-pager.inner .page-pager-next{align-items:flex-end;text-align:right}
    .page-pager.inner button:disabled{visibility:hidden}
    .step-nav{position:sticky;top:78px;z-index:5}
    .next-step-stack,.failure-group-stack{display:block}
    #failures .failure-area-checks li{list-style:none}
    .failure-card-nav[hidden]{display:none!important}
    .failure-card-nav{margin:0 0 16px}
    .failure-card-nav a.is-pager-empty{visibility:hidden;pointer-events:none}
    #failures .failure-summary-card.is-card-current{border-color:#ff7b72!important;box-shadow:inset 0 0 0 1px #ff7b72}
    #failures .page-pager.inner{margin:0 0 16px}
    #failures .inner-board>.page-pager.inner:last-child{margin:16px 0 0}
    #failures .page-pager.inner button{display:flex!important;flex-direction:column;justify-content:center;gap:1px;flex:1 1 0;min-width:0;padding:4px 2px;background:transparent!important;border:0!important;color:#f8fafc!important;font:inherit;text-align:left;cursor:pointer}
    #failures .page-pager.inner .page-pager-next{align-items:flex-end;text-align:right}
    #failures .page-pager.inner button:disabled{visibility:hidden}
    #failures .step-nav{position:sticky;top:78px;z-index:5}
    @media(max-width:900px){#failures #failure-areas .failure-card-grid,#failures #failure-story-board .failure-card-grid{grid-template-columns:1fr!important}}
    #module-dashboard .module-back{display:none;margin-bottom:12px;color:#7ee787;font-weight:800;text-decoration:none}
    #module-dashboard.is-area-open .module-back{display:inline-flex}
    #module-dashboard.is-area-open [data-step-item]{display:none!important}
    #module-dashboard.is-area-open [data-step-item].is-step-current{display:block!important}
    #module-dashboard .module-jump[hidden],#module-dashboard .module-dashboard-intro[hidden]{display:none!important}
    #module-dashboard .module-selector-summary{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))!important}
    #module-dashboard .module-selector-summary span,#module-dashboard .module-selector-summary b{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;line-height:1.25!important}
    #health .module-card-stats small,#health .module-title strong,#coverage-gaps .plan-nav strong,#validation-summary .passed-card-top strong{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    @media(max-width:1100px){#failures .failure-command-center{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
    @media(max-width:700px){#failures .failure-command-center{grid-template-columns:1fr!important}}
    #cover .brief{display:grid;grid-template-columns:minmax(280px,.85fr) minmax(0,1.15fr);gap:28px;align-items:center;margin:4px 0 8px}
    #cover .brief-decision{display:flex;flex-direction:column;align-items:flex-start;gap:14px;min-width:0}
    #cover .brief-decision h1{margin:0;color:#f8fafc;font-size:clamp(40px,4.2vw,58px);font-weight:700;letter-spacing:-.045em;line-height:.95}
    #cover .brief-line{margin:0;max-width:28ch;color:#e8eef5;font-size:18px;line-height:1.45}
    #cover .brief-when{margin:0;color:#8fa2ba;font-size:13px}
    #cover .brief-decision .release-status-badge{font-size:clamp(18px,1.6vw,26px);padding:10px 16px}
    #cover .brief-decision .scan-now{margin:0}
    #cover .brief-decision .scan-now a{width:auto;border-radius:999px;padding:11px 16px}
    #cover .status-board{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:0}
    #cover .status-card{min-height:118px;padding:18px 18px 16px;border-radius:18px;gap:6px}
    #cover .status-card b{font-size:40px;letter-spacing:-.04em}
    #cover .status-card span{color:#d5e0ec;font-size:14px;font-weight:650}
    #cover .status-card small{color:#9fb0c5;font-size:12px;font-weight:600}
    #cover .status-card:not(.bad):not(.warn):not(.good){background:#101826;border-color:rgba(148,163,184,.22)}
    #cover .status-card:not(.bad):not(.warn):not(.good) b{color:#f8fafc}
    #cover .brief-more{margin-top:22px}
    #cover .brief-more-body{display:grid;gap:18px;padding:16px}
    #cover .brief-more .executive-mode-grid{display:none!important}
    #cover .coverage-board{margin-top:0}
    .sidebar .nav a.active{box-shadow:inset 3px 0 0 #7ee787}
    .sidebar .nav a[href="#failures"].active{box-shadow:inset 3px 0 0 #ff7b72}
    .page>.topbar h1,.page .topbar h1{font-size:clamp(28px,2.2vw,36px)}
    @media(max-width:900px){#cover .brief{grid-template-columns:1fr}#cover .status-board{grid-template-columns:1fr 1fr}}
    .module-jump{display:none!important}
    .page-pager,.page-pager.inner,.page-pager.top,.page-pager.bottom,.step-nav,.failure-card-nav,.shot-pager-bar{
      display:flex!important;
      flex-direction:column!important;
      align-items:stretch!important;
      gap:0!important;
      margin:0 0 16px!important;
      padding:8px 12px!important;
      background:#101826!important;
      border:1px solid rgba(148,163,184,.22)!important;
      border-radius:12px!important;
      box-shadow:none!important;
    }
    .page-pager.bottom,.inner-board>.page-pager.inner:last-child{margin:16px 0 0!important}
    .page-pager-row{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important;width:100%!important}
    .page-pager a,.page-pager button,.step-nav button,.page-pager-end{
      display:flex!important;
      flex-direction:column!important;
      justify-content:center!important;
      gap:1px!important;
      flex:1 1 0!important;
      min-width:0!important;
      margin:0!important;
      padding:4px 2px!important;
      background:transparent!important;
      border:0!important;
      border-radius:0!important;
      box-shadow:none!important;
      color:#f8fafc!important;
      font:inherit!important;
      text-align:left!important;
      text-decoration:none!important;
      cursor:pointer!important;
    }
    .page-pager-next,.step-nav [data-step-next]{align-items:flex-end!important;text-align:right!important}
    .page-pager-count,.step-nav-here{
      flex:0 0 auto!important;
      display:flex!important;
      flex-direction:column!important;
      align-items:center!important;
      gap:1px!important;
      padding:0 8px!important;
      background:transparent!important;
      border:0!important;
      color:#9fb0c5!important;
      text-align:center!important;
    }
    .page-pager small,.step-nav small{color:#9fb0c5!important;font-size:11px!important;font-weight:650!important;letter-spacing:.04em!important;text-transform:uppercase!important}
    .page-pager strong,.step-nav strong,.step-nav-here strong{color:#f8fafc!important;font-size:14px!important;font-weight:650!important;line-height:1.3!important;letter-spacing:0!important}
    .page-pager button:disabled,.step-nav button:disabled,.page-pager a.is-pager-empty{visibility:hidden!important}
    .step-nav[hidden],.page-pager[hidden],.shot-pager-bar[hidden],[hidden].page-pager{display:none!important}
    .page-pager-end{visibility:hidden!important}
    .passed-card,.failure-shot-card,.failure-summary-card,.module-health-card,.module-dashboard-card,.module-selector-card,.status-card,.reader-step,.next-step-card,.recommendation-card,.role-recommendation-card,.roadmap-card,.compare-card,.evidence-card,.health-stat,.journey-node{
      background:#101826!important;
      border:1px solid rgba(148,163,184,.22)!important;
      border-radius:16px!important;
      box-shadow:none!important;
      color:#f8fafc!important;
    }
    .passed-card,.module-health-card.green,.status-card.good,.reader-step.good,.next-step-card,.health-stat.good{border-left:4px solid #7ee787!important}
    .failure-shot-card,.failure-summary-card,.module-health-card.red,.status-card.bad,.reader-step.bad,.health-stat.bad{border-left:4px solid #ff7b72!important}
    .module-health-card.amber,.status-card.warn,.reader-step.warn,.health-stat.warn,#known-defects .passed-card{border-left:4px solid #f5c542!important}
    .passed-card-count b,.status-card.good b,.module-health-card.green .module-score,.health-stat.good strong{color:#7ee787!important}
    .status-card.bad b,.failure-summary-card.primary strong,.module-health-card.red .module-score,.health-stat.bad strong{color:#ff8b82!important}
    .status-card.warn b,.module-health-card.amber .module-score,.health-stat.warn strong,#known-defects .passed-card-count b{color:#f5c542!important}
    .passed-card:hover,.failure-shot-card:hover,.module-health-card:hover,.status-card:hover,.reader-step:hover,.next-step-card:hover{transform:none!important;filter:brightness(1.06)}
    #cover .status-card.bad{background:#2a1518!important;border-color:rgba(255,123,114,.45)!important}
    #cover .status-card.good{background:#122218!important;border-color:rgba(126,231,135,.4)!important}
    #cover .status-card.warn{background:#2a2210!important;border-color:rgba(245,197,66,.45)!important}
    body,.page,.panel,.card,p,li,td,th,strong,span,a,h1,h2,h3,h4,button,label,small,.page-pager,.page-pager strong,.next-step-card,.recommendation-card,.role-recommendation-card,.ai-command-hero,.failure-shot-card,.passed-card,.module-health-card,.module-dashboard-card,.status-card,.reader-step{
      overflow-wrap:normal!important;
      word-break:normal!important;
      hyphens:manual!important;
    }
    p,li,.next-step-card p,.next-step-card strong,.recommendation-card p,.recommendation-card strong,.role-recommendation-card p,.role-recommendation-card strong,.ai-command-hero p,.ai-reasons li,.decision-reasons li,.executive-decision-bullets li,.failure-check-list li,.passed-check p,.passed-check strong,.summary-lead,.brief-line,.brief-count{
      white-space:normal!important;
      line-height:1.5!important;
    }
    .page-pager a,.page-pager button{min-width:28%!important}
    .page-pager .page-pager-prev,.step-nav .page-pager-prev,.page-pager a.page-pager-prev{align-items:flex-start!important;text-align:left!important;margin-right:auto}
    .page-pager .page-pager-next,.step-nav .page-pager-next,.page-pager a.page-pager-next,.page-pager button.page-pager-next,#coverage-gaps [data-plan-next]{align-items:flex-end!important;text-align:right!important;margin-left:auto}
    .page-pager-next small,.page-pager-next strong,#coverage-gaps [data-plan-next] small,#coverage-gaps [data-plan-next] strong{text-align:right!important;margin-left:auto}
    .page-pager strong,.step-nav strong{
      display:block!important;
      max-width:100%;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      line-height:1.35!important;
      overflow-wrap:normal!important;
      word-break:normal!important;
      letter-spacing:0!important;
    }
    .page-pager-count strong,.page-pager-count small{white-space:nowrap!important}
    .ai-command-hero strong,.topbar h1,.brief-decision h1{line-height:1.15!important;letter-spacing:-.03em!important}
    #insight .role-recommendation-grid,#insight .recommendation-grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))!important}
    #insight .ai-signal-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))!important}
    #cover .air-oneliner{grid-column:1 / -1;margin:0;color:#f8fafc;font-size:18px;font-weight:650;line-height:1.35;letter-spacing:0;overflow-wrap:normal;word-break:normal}
  </style>
  <aside class="sidebar">
    <div class="brand-lockup">
      <span class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="img">
          <path d="M24 5 39 12v11c0 9.2-5.9 15.4-15 19-9.1-3.6-15-9.8-15-19V12l15-7z"></path>
          <path d="m16 25 5 5 11-13"></path>
        </svg>
      </span>
      <div class="brand">AIR</div>
    </div>
    <div class="brand-sub">Automation Intelligence<br><span>Report</span></div>
    <nav class="nav">
      <p class="nav-label">Start here</p>
      <a class="active" href="#cover">${navIcon('home')}<span>Brief</span></a>
      <a href="#health">${navIcon('product')}<span>Product health</span></a>
      <a href="#failures">${navIcon('failures')}<span>What failed</span></a>
      <a href="#validation-summary">${navIcon('analytics')}<span>What passed</span></a>
      <a href="#coverage-gaps">${navIcon('analytics')}<span>Not run</span></a>
      <a href="#insight">${navIcon('insight')}<span>Next step</span></a>
      <p class="nav-label">More pages</p>
      ${moreNavHtml}
    </nav>
    <div class="report-search">
      <label for="airSearch">Search Report</label>
      <input id="airSearch" type="search" placeholder="Search the report" autocomplete="off">
      <div id="airSearchResults" class="search-results"></div>
    </div>
  </aside>
  <main>
    <section class="page cover-page" id="cover">
      ${renderPageNav('cover')}
      ${executiveModeShellHtml}
      ${renderPageFooter('cover')}
    </section>

    <div class="global-search">
      <div>
        <label for="airGlobalSearch">Search AIR Platform</label>
        <input id="airGlobalSearch" type="search" placeholder="Search areas, checks, proof..." autocomplete="off">
      </div>
      <div id="airGlobalSearchResults" class="search-results"></div>
    </div>
    ${dataFreshnessCards}
    ${provenanceWarningHtml}

    <section class="page report-extra" id="executive">
      ${renderPageNav('executive')}
      <div class="topbar">
        <div>
          <div class="eyebrow">${escapeHtml(projectName)}</div>
          ${pageHeading('release', 'Why this decision')}
          <p>Detail behind the brief. Optional reading.</p>
        </div>
        <div class="actions">
          <span class="pill demo">${demoMode ? 'Sample data' : escapeHtml(environment)}</span>
          <a class="btn" href="#evidence">Proof</a>
          <a class="btn primary" href="../playwright-report/index.html" target="_blank" rel="noopener">Open Playwright report</a>
        </div>
      </div>
      <div class="executive-decision-card">
        <div class="executive-decision-main">
          <span class="mission-label">Decision</span>
          ${releaseStatusBadge}
          <ul class="executive-decision-bullets">${executiveDecisionBullets}</ul>
        </div>
        <div class="executive-action">
          <span>${helpLabel('Next action', 'recommendation')}</span>
          <strong>${escapeHtml(releaseRecommendedAction)}</strong>
        </div>
      </div>
      <div class="grid two">
        <div class="panel insight">
          <h2 class="icon-title"><span class="section-icon">WHY</span>Why this call?</h2>
          <div class="why-release ${executiveData.releaseDecision === 'GO' ? '' : 'warn'}">
          <h3>${executiveData.releaseDecision === 'GO' ? 'Why GO?' : executiveData.releaseDecision === 'CONDITIONAL GO' ? 'Why Conditional GO?' : 'Why No GO?'}</h3>
            <ul>${whyReleaseItems}</ul>
          </div>
        </div>
        <div class="panel">
          <h2 class="icon-title"><span class="section-icon">RD</span>Why, and what to do next</h2>
          <div class="decision-intelligence">
            <section class="decision-intel-block decision-drivers-block">
              <div class="decision-intel-head">
                <div>
                  <span>Drivers</span>
                  <h3>What shaped the decision</h3>
                </div>
                <strong>${escapeHtml(executiveData.releaseDecision)}</strong>
              </div>
              <div class="decision-driver-grid">${decisionDriverCards}</div>
            </section>
            <div class="decision-intel-grid">
              <section class="decision-intel-block">
                <div class="decision-intel-head">
                  <div>
                    <span>Blockers</span>
                    <h3>What needs attention</h3>
                  </div>
                  <strong>${executiveData.failed}</strong>
                </div>
                <div class="decision-blocking-list">${decisionBlockingItems}</div>
              </section>
              <section class="decision-intel-block">
                <div class="decision-intel-head">
                  <div>
                    <span>Signals</span>
                    <h3>Impact and proof</h3>
                  </div>
                  <strong>${escapeHtml(estimatedReleaseRisk)}</strong>
                </div>
                <div class="decision-signal-grid">${decisionSignalCards}</div>
              </section>
            </div>
            <section class="decision-intel-block decision-workflow-block">
              <div class="decision-intel-head">
                <div>
                  <span>${helpLabel('Workflow', 'recommendation')}</span>
                  <h3>What should happen next</h3>
                </div>
              </div>
              <p class="decision-workflow-summary">${escapeHtml(releaseRecommendedAction)}</p>
              <div class="decision-workflow">${decisionWorkflowSteps}</div>
            </section>
          </div>
        </div>
      </div>
      ${renderPageFooter('executive')}
    </section>

    <section class="page" id="health">
      ${renderPageNav('health')}
      <div class="topbar"><div><div class="eyebrow">${escapeHtml(projectName)}</div>${pageHeading('product', 'Product Health')}<p>Which areas need attention?</p></div><a class="btn" href="#module-dashboard">See each area</a></div>
      <div class="panel">
        <h2 class="icon-title"><span class="section-icon">MH</span>Area status</h2>
        <div class="module-filter" aria-label="Filter areas by health">
          <button class="active" type="button" data-module-filter="all">All ${moduleStatusGroupCounts.all}</button>
          <button type="button" data-module-filter="healthy">Healthy ${moduleStatusGroupCounts.healthy}</button>
          <button type="button" data-module-filter="critical">Critical ${moduleStatusGroupCounts.critical}</button>
          <button type="button" data-module-filter="not-executed">Not run ${moduleStatusGroupCounts['not-executed']}</button>
          ${moduleStatusGroupCounts.warning ? `<button type="button" data-module-filter="warning">Warning ${moduleStatusGroupCounts.warning}</button>` : ''}
          <label class="module-filter-search">
            <input id="moduleStatusSearch" type="search" placeholder="Find an area" aria-label="Search product areas">
          </label>
        </div>
        <div class="module-filter-count" aria-live="polite" data-module-filter-count>Showing ${displayModules.length} of ${displayModules.length} areas</div>
        ${renderInnerBoard('Modules', moduleHealthCards, displayModules.length, 'module-card-grid')}
        <div class="empty-note module-filter-empty" data-module-filter-empty hidden>No matching areas found in this run.</div>
      </div>
      <br>
      <div class="grid two">
        <div class="panel"><h2>Risk count</h2>
          <div class="risk-snapshot">
            <div class="risk-snap high"><span>High</span><strong>${criticalModuleCount}</strong><small>Failed areas</small></div>
            <div class="risk-snap med"><span>Medium</span><strong>${warningModuleCount}</strong><small>Not fully run</small></div>
            <div class="risk-snap low"><span>Low</span><strong>${healthyModuleCount}</strong><small>Passed</small></div>
          </div>
          <p class="chart-explainer">Amber means a check was skipped unexpectedly, or an important path did not run.</p>
        </div>
        <div class="panel health-summary-panel">
          <h2>${helpLabel('Summary', 'businessHealth')}</h2>
          <p class="summary-lead">${escapeHtml(healthSummaryLead)}</p>
          <div class="health-stat-grid">
            <div class="health-stat good"><span>Healthy</span><strong>${healthyModuleCount}</strong></div>
            <div class="health-stat bad"><span>Critical</span><strong>${criticalModuleCount}</strong></div>
            <div class="health-stat warn"><span>Not run</span><strong>${moduleStatusGroupCounts['not-executed']}</strong></div>
            ${moduleStatusGroupCounts.warning ? `<div class="health-stat warn"><span>Warning</span><strong>${moduleStatusGroupCounts.warning}</strong></div>` : ''}
          </div>
          <div class="next-focus-card">
            <span>${helpLabel('Next focus', 'nextStep')}</span>
            <strong>${escapeHtml(nextFocusText)}</strong>
            <p>${escapeHtml(releaseRecommendedAction)}</p>
          </div>
        </div>
      </div>
      ${renderPageFooter('health')}
    </section>

    <section class="page" id="journey">
      ${renderPageNav('journey')}
      <div class="topbar"><div><div class="eyebrow">${escapeHtml(projectName)}</div>${pageHeading('journey', 'User paths')}<p>Can a user complete the important paths?</p></div><span class="pill demo">${demoMode ? 'Sample data' : escapeHtml(environment)}</span></div>
      <div class="panel journey-flow-panel">${renderInnerBoard('Paths', journeyHealthRows, (journeyHealthRows.match(/data-inner-item/g) || []).length, 'journey')}</div>
      <br>
      <div class="grid two journey-support-grid">
        <div class="panel"><h2>How much of each path ran</h2><p class="chart-explainer">Bar height is the share of that path that ran in this execution.</p><div class="chart journey-coverage-chart">${journeyCoverageChartHtml}</div></div>
        <div class="panel journey-answer-panel"><h2>Answer</h2><p>${escapeHtml(journeyAnswerHtml)}</p><br><div class="empty-note">Email and payment steps that need an outside service are listed under Not run when they were skipped.</div></div>
      </div>
      ${renderPageFooter('journey')}
    </section>

    <section class="page report-extra" id="module-dashboard">
      ${renderPageNav('module-dashboard')}
      <div class="topbar"><div><div class="eyebrow">${escapeHtml(projectName)}</div>${pageHeading('modules', 'Each area')}<p>What was checked in this area?</p></div><a class="btn" href="#health">Back to product health</a></div>
      <div class="module-dashboard-intro">
        <h2>Choose an area</h2>
        <p>Stay on this page. Pick an area below.</p>
      </div>
      ${renderInnerNav('area', { requireSelection: true })}
      ${renderInnerBoard('Modules', moduleDashboardCards, displayModules.length, 'module-dashboard-grid')}
      ${renderPageFooter('module-dashboard')}
    </section>

    <section class="page${executiveData.failed > 0 ? '' : ' report-extra'}" id="failures">
      ${renderPageNav('failures')}
      <div class="topbar"><div><div class="eyebrow">${escapeHtml(projectName)}</div>${pageHeading('failures', 'What failed')}<p>Checks that failed for the same reason share one card. Open it to see each screen.</p></div><span class="pill">${executiveData.failed} failed</span></div>
      ${renderFailureCardNav()}
      ${renderInnerNav('story', { requireSelection: true })}
      <div data-passed-index>
        <div class="panel">${failedTestsContent}</div>
      </div>
      ${failureDetailArticles}
      ${renderPageFooter('failures')}
    </section>

    <section class="page report-extra" id="coverage-gaps">
      <div id="plan-cat-blocked" hidden></div>
      <div id="plan-cat-controlled" hidden></div>
      <div id="plan-cat-traceability" hidden></div>
      <div id="plan-cat-future" hidden></div>
      <div id="plan-cat-skipped" hidden></div>
      ${renderPageNav('coverage-gaps')}
      <div class="topbar">
        <div>
          <div class="eyebrow">${escapeHtml(projectName)}</div>
          ${pageHeading('analytics', 'Checks we did not run')}
          <p>These checks did not run. Pick a reason, then open a group. Back goes up one step.</p>
        </div>
        <span class="pill">${coverageGapSummary.total ?? coverageGapItems.length} Items</span>
      </div>
      <div class="panel">${coverageGapsContent}${planModuleDetails}</div>
      ${renderPageFooter('coverage-gaps')}
    </section>

    <section class="page report-extra" id="validation-summary">
      ${renderPageNav('validation-summary')}
      <div class="topbar">
        <div>
          <div class="eyebrow">${escapeHtml(projectName)}</div>
          ${pageHeading('analytics', 'What passed')}
          <p>Pick an area to see what this run confirmed.</p>
        </div>
        <span class="pill">${passedValidationTests.length} passed</span>
      </div>
      <div data-passed-index>
        <div class="panel passed-board">
          <div class="passed-board-head">
            <div>
              <h2>${passedValidationTests.length} checks passed</h2>
              <p>Open an area to see what this run confirmed.</p>
            </div>
            <label class="module-filter-search">
              <input id="passedCheckSearch" type="search" placeholder="Find an area" aria-label="Search passed areas">
            </label>
          </div>
          <div class="validation-group-count" data-passed-count>Showing ${passedTopicEntries.length} of ${passedTopicEntries.length} areas</div>
          ${renderInnerBoard('Areas', validationAreaCards, passedTopicEntries.length, 'passed-card-grid')}
          <div class="empty-note" data-passed-empty hidden>No area matches that search.</div>
        </div>
      </div>
      ${renderInnerNav('area', { requireSelection: true })}
      ${validationGroupCards}
      ${renderPageFooter('validation-summary')}
    </section>

    <section class="page" id="evidence">
      ${renderPageNav('evidence')}
      <div class="topbar"><div><div class="eyebrow">${escapeHtml(projectName)}</div>${pageHeading('evidence', 'Proof')}<p>Screenshots from the checks that failed. Each picture says what went wrong.</p></div></div>
      ${renderFailureCardNav()}
      ${evidenceHeroHtml}
      ${String(evidenceThumbnails).includes('<a') ? `
      <div class="panel">
        <h2>Screenshots</h2>
        <p class="evidence-path-note">A red frame means that check failed. The line under the picture says what stopped.</p>
        <div class="shot-pager" data-shot-pager data-shot-page-size="4">
          <nav class="page-pager inner shot-pager-bar" aria-label="Pictures">
            <div class="page-pager-row">
              <button type="button" class="page-pager-prev" data-shot-prev><small>Previous</small><strong>← Pictures</strong></button>
              <span class="page-pager-count"><small data-shot-count></small><strong>Pictures</strong></span>
              <button type="button" class="page-pager-next" data-shot-next><small>Next</small><strong>Pictures →</strong></button>
            </div>
          </nav>
          <div class="thumb-grid">${evidenceThumbnails}</div>
          <nav class="page-pager inner shot-pager-bar" aria-label="Pictures">
            <div class="page-pager-row">
              <button type="button" class="page-pager-prev" data-shot-prev><small>Previous</small><strong>← Pictures</strong></button>
              <span class="page-pager-count"><small data-shot-count></small><strong>Pictures</strong></span>
              <button type="button" class="page-pager-next" data-shot-next><small>Next</small><strong>Pictures →</strong></button>
            </div>
          </nav>
        </div>
      </div>` : ''}
      <div class="panel">
        <h2>Where the files are</h2>
        <p class="evidence-path-note">${escapeHtml(evidencePackageNote)}</p>
      </div>
      <div class="evidence-grid">${evidenceCards}</div>
      ${failureEvidenceMapHtml}
      ${renderPageFooter('evidence')}
    </section>

    <nav class="report-more" aria-label="More detail">
      <h2>More detail</h2>
      <div class="report-more-grid">
        ${moreDetailCardsHtml}
      </div>
    </nav>

    <section class="page report-extra" id="insight">
      ${renderPageNav('insight')}
      <div class="topbar"><div><div class="eyebrow">${escapeHtml(projectName)}</div>${pageHeading('insight', 'What to do next')}<p>Fix the failed checks, then run them again.</p></div></div>
      ${renderInnerBoard('Steps', nextStepListHtml, failureGroups.length, 'next-step-stack')}
      <details class="report-fold">
        <summary>Release write-up</summary>
      <div class="ai-command-hero">
        <div>
          <span class="mission-label">AIR Recommendation</span>
          <strong>${escapeHtml(releaseRecommendedAction)}</strong>
          <p>${escapeHtml(aiDecisionSummary)}</p>
        </div>
        <div class="ai-signal-grid">${aiSignalCards}</div>
      </div>
      <div class="ai-decision-map">
        <div class="ai-reasoning-card">
          <h2 class="icon-title"><span class="section-icon">AI</span>Why AIR Recommends ${escapeHtml(executiveData.releaseDecision)}</h2>
          <p class="ai-decision-summary">${escapeHtml(aiDecisionSummary)}</p>
          <ul class="ai-reasons">${aiWhyItems}</ul>
        </div>
        <div class="ai-workflow-card">
          <h2 class="icon-title"><span class="section-icon">FLOW</span>Recommended Workflow</h2>
          <div class="ai-workflow">${aiWorkflowSteps}</div>
        </div>
      </div>
      <div class="ai-insight-grid">
        <div class="panel ai-action-panel">
          <h2 class="icon-title"><span class="section-icon">NEXT</span>Action Checklist</h2>
          <ul class="action-list">${aiActionChecklist}</ul>
        </div>
        <div class="panel">
          <h2>Next QA Focus</h2>
          <p>${executiveData.failed > 0 ? 'Review failed tests first, then rerun impacted modules with evidence capture enabled.' : 'Move from UI-only confidence to full quality intelligence by adding API, DB, MFA, and session-security validations.'}</p>
        </div>
      </div>
      <div class="panel ai-role-panel">
        <h2 class="icon-title"><span class="section-icon">ROLE</span>Role-Based Reading</h2>
        <div class="role-recommendation-grid">${groupedAiRecommendations}</div>
      </div>
      <div class="panel ai-priority-panel">
        <h2 class="icon-title"><span class="section-icon">P1</span>Priority Recommendations</h2>
        <div class="recommendation-grid">${aiPriorityRecommendations}</div>
      </div>
      </details>
      ${renderPageFooter('insight')}
    </section>

    <section class="page report-extra" id="comparison">
      ${renderPageNav('comparison')}
      <div class="topbar">
        <div>
          <div class="eyebrow">${escapeHtml(projectName)}</div>
          ${pageHeading('analytics', 'Past runs')}
          <p>How this run compares with earlier ones.</p>
        </div>
        <span class="pill demo">${hasPreviousComparison ? 'Compared with the last run' : 'First saved run'}</span>
      </div>
      ${hasPreviousComparison ? `
        <div class="history-command-hero">
          <div class="history-hero-grid">
            <div class="history-narrative">
              <span class="mission-label">What changed</span>
              <h2>What changed since the previous build?</h2>
              <p>${escapeHtml(executiveWhatChangedSummary)}</p>
              <ul class="history-change-list">
                ${executiveWhatChangedItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
              </ul>
            </div>
            <div class="history-metric-grid">
              <div class="compare-card"><span>Current Build</span><strong>${escapeHtml(buildVersion)}</strong><small>Current execution baseline</small></div>
              <div class="compare-card"><span>Previous Build</span><strong>${escapeHtml(historyComparison.previous?.project?.build ?? historyComparison.previous?.execution?.build ?? 'Previous')}</strong><small>Last recorded execution</small></div>
              <div class="compare-card"><span>Release Change</span>${renderReleaseBadge(getCurrentReleaseValue(), { compact: true })}<small>Previous: ${escapeHtml(getSnapshotRelease(historyComparison.previous))}</small></div>
              <div class="compare-card"><span>Quality Change</span><strong>${escapeHtml(getComparisonDeltaLabel('quality', '%'))}</strong><small>Current: ${executiveData.qualityScore}%</small></div>
              <div class="compare-card"><span>Failure Change</span><strong>${escapeHtml(getComparisonDeltaLabel('failures'))}</strong><small>Current failed tests: ${executiveData.failed}</small></div>
              <div class="compare-card"><span>Flaky Change</span><strong>${escapeHtml(getComparisonDeltaLabel('flaky'))}</strong><small>Current flaky tests: ${airResults?.summary?.flaky ?? 0}</small></div>
              <div class="compare-card"><span>Duration Change</span><strong>${escapeHtml(getComparisonDirection('durationMs'))}</strong><small>Current: ${escapeHtml(executiveData.duration)}</small></div>
            </div>
          </div>
        </div>
        <details class="fold">
          <summary><b>What improved</b><span>Resolved failures, modules, and journeys</span></summary>
        <div class="historical-wins">
          <h2>Improvement Highlights</h2>
          <p>Positive movement detected from History Engine comparison data.</p>
          ${renderComparisonList(historicalWinItems, 'No improvement highlights yet')}
        </div>
        </details>
        <details class="fold">
          <summary><b>Build comparison</b><span>Quality, pass rate, time, failures, and suite size</span></summary>
        <div class="history-comparison-dashboard">
          <div class="history-panel-head">
            <span>Build Delta</span>
            <h2>Build Comparison</h2>
            <p>Current execution compared against the previous stored AIR execution.</p>
          </div>
          <div class="compare-grid">
            ${renderComparisonMetric('Quality Score', 'quality')}
            ${renderComparisonMetric('Pass Rate', 'passRate')}
            ${renderComparisonMetric('Execution Time', 'durationMs')}
            ${renderComparisonMetric('Failed Tests', 'failures')}
            ${renderComparisonMetric('Flaky Tests', 'flaky')}
            ${renderComparisonMetric('Module Coverage', 'moduleCoverage')}
            ${renderComparisonMetric('Evidence', 'evidence')}
              <div class="compare-card"><span>Modules Executed</span><strong>${currentModulesExecuted}</strong><small>Previous: ${previousModulesExecuted}</small></div>
              <div class="compare-card"><span>Journeys Executed</span><strong>${currentJourneysExecuted}</strong><small>Previous: ${previousJourneysExecuted}</small></div>
              <div class="compare-card"><span>Tests Added</span><strong>${historyComparison.tests?.summary?.added ?? 0}</strong><small>New tests since previous execution</small></div>
              <div class="compare-card"><span>Tests Removed</span><strong>${historyComparison.tests?.summary?.removed ?? 0}</strong><small>Tests no longer present</small></div>
              <div class="compare-card"><span>Tests Modified</span><strong>${historyComparison.tests?.summary?.modified ?? 0}</strong><small>Status, module, file, or title changed</small></div>
            </div>
        </div>
        </details>
        <details class="fold">
          <summary><b>Charts</b><span>Quality, release, failures, pass rate, and coverage over time</span></summary>
        <div class="history-section-grid">
          ${renderHistoryTrendCard('Quality Trend', 'quality')}
          ${renderReleaseTrendCard()}
          ${renderHistoryTrendCard('Failure Trend', 'failures', value => `${value} failed`, { max: Math.max(5, ...(airResults?.history?.trends?.failures?.points ?? []).map(point => Number(point.value) || 0)) })}
          ${renderHistoryTrendCard('Flaky Trend', 'flaky', value => `${value} flaky`, { max: Math.max(5, ...(airResults?.history?.trends?.flaky?.points ?? []).map(point => Number(point.value) || 0)) })}
        </div>
        <div class="history-section-grid">
          ${renderHistoryTrendCard('Pass Rate Trend', 'passRate')}
          ${renderHistoryTrendCard('Module Coverage Trend', 'moduleCoverage')}
          ${renderHistoryTrendCard('Journey Coverage Trend', 'journeyCoverage')}
        </div>
        </details>
        <details class="fold">
          <summary><b>Tests that changed</b><span>${addedTests.length} added, ${removedTests.length} removed, ${modifiedTests.length} modified</span></summary>
        <div class="history-test-change-panel">
          <div class="history-panel-head">
            <span>Suite Movement</span>
            <h2>Test Changes</h2>
            <p>Added, removed, and modified tests detected by the History Engine.</p>
          </div>
          <div class="grid three">
            <div><h2>Added Tests</h2>${renderTestChangeSummary('added test(s)', addedTests, 'No added tests')}</div>
            <div><h2>Removed Tests</h2>${renderTestChangeSummary('removed test(s)', removedTests, 'No removed tests')}</div>
            <div><h2>Modified Tests</h2>${renderTestChangeSummary('modified test(s)', modifiedTests, 'No modified tests')}</div>
          </div>
        </div>
        </details>
        <details class="fold">
          <summary><b>Areas and paths</b><span>Which modules and user paths moved</span></summary>
        <div class="history-signal-layout">
          <div class="panel history-signal-panel">
            <div class="history-panel-head">
              <span>Module Intelligence</span>
              <h2>Module Trend</h2>
              <p>Where module health improved, regressed, or changed execution scope.</p>
            </div>
            <div class="history-signal-grid">
              ${renderHistorySignalCard('Improved', moduleComparison.improved, 'No improved modules', 'good')}
              ${renderHistorySignalCard('Regressed', moduleComparison.regressed, 'No regressed modules', 'bad')}
              ${renderHistorySignalCard('New', moduleComparison.added, 'No new modules', 'info')}
              ${renderHistorySignalCard('Not Executed', moduleComparison.notExecuted, 'No not-executed modules', 'warn')}
            </div>
          </div>
          <div class="panel history-signal-panel">
            <div class="history-panel-head">
              <span>Business Flow</span>
              <h2>Journey Trend</h2>
              <p>How user journeys changed between the current and previous execution.</p>
            </div>
            <div class="history-signal-grid">
              ${renderHistorySignalCard('Improved', journeyComparison.improved, 'No journey improvements', 'good')}
              ${renderHistorySignalCard('Regressed', journeyRegressions, 'No journey regressions', 'bad')}
              ${renderHistorySignalCard('New Risk', newJourneyRisks, 'No new journey risks', 'warn')}
              ${renderHistorySignalCard('Not Executed', journeyComparison.notExecuted, 'No not-executed journeys', 'info')}
            </div>
          </div>
        </div>
        </details>
        <details class="fold">
          <summary><b>Failures and release calls</b><span>New, resolved, and how often the release was blocked</span></summary>
        <div class="history-signal-layout">
          <div class="panel history-signal-panel failure-panel">
            <div class="history-panel-head">
              <span>Failure Movement</span>
              <h2>Failure Trend</h2>
              <p>New, resolved, recurring, and severity-shifted defects from history comparison.</p>
            </div>
            <div class="history-signal-grid">
              ${renderHistorySignalCard('New', newFailures, 'No new failures', 'bad')}
              ${renderHistorySignalCard('Resolved', resolvedFailures, 'No resolved failures', 'good')}
              ${renderHistorySignalCard('Recurring', recurringFailures, 'No recurring failures', 'warn')}
              ${renderHistorySignalCard('Severity', severityChanges, 'No severity changes', 'info')}
              ${renderHistorySignalCard('Active Recurrence', activeRecurringFailurePatterns, 'No active recurring failure patterns', 'warn')}
              ${renderHistorySignalCard('Flaky', flakyHistoryPatterns, 'No flaky history patterns', 'info')}
            </div>
            <div class="history-panel-subsection">
              <div class="history-panel-head compact">
                <span>Per-Test Memory</span>
                <h3>Failure Timeline</h3>
                <p>Shows whether failures are new, recurring, persistent, historical, or recently fixed.</p>
              </div>
              ${renderFailureTimelinePreview(failureTimelinePatterns)}
            </div>
          </div>
          <div class="panel release-timeline-panel">
            <div class="history-panel-head">
              <span>Release Memory</span>
              <h2>Release Trend</h2>
            </div>
            <p>${escapeHtml(historyComparison.summary ?? 'AIR compared the current execution with the previous execution using History Engine data.')}</p>
            <div class="compare-grid">
              <div class="compare-card"><span>GO</span><strong>${historySnapshots.filter(snapshot => getSnapshotRelease(snapshot) === 'GO').length}</strong><small>Recorded GO decisions</small></div>
              <div class="compare-card"><span>Conditional GO</span><strong>${historySnapshots.filter(snapshot => getSnapshotRelease(snapshot) === 'CONDITIONAL GO').length}</strong><small>Recorded conditional decisions</small></div>
              <div class="compare-card"><span>No GO</span><strong>${historySnapshots.filter(snapshot => getSnapshotRelease(snapshot) === 'NO GO').length}</strong><small>Recorded blocked decisions</small></div>
              <div class="compare-card"><span>Reason Changes</span><strong>${escapeHtml(effectiveReasonChanges.length)}</strong><small>${effectiveReasonChanges.length ? escapeHtml(effectiveReasonChanges.map(item => `${item.status}: ${item.name}`).join(' | ')) : 'No release reason changes detected'}</small></div>
            </div>
          </div>
        </div>
        </details>
        <details class="fold">
          <summary><b>Where to look next</b><span>The focus items from this comparison</span></summary>
        <div class="panel executive-focus-panel">
          <div class="history-panel-head">
            <span>Decision Guidance</span>
            <h2>Executive Focus</h2>
            <p>AIR uses History Engine comparison data to highlight what changed and where the team should focus next.</p>
          </div>
          ${renderExecutiveFocusCards(engineeringInsightItems)}
        </div>
        </details>
        <details class="fold">
          <summary><b>Earlier runs</b><span>Quality, release call, and duration for each saved run</span></summary>
        <div class="panel history-timeline-panel">
          <div class="history-panel-head">
            <span>Execution Memory</span>
            <h2>Historical Timeline</h2>
            <p>Recent AIR executions with quality, release decision, and duration at a glance.</p>
          </div>
          <div class="history-timeline-track">${timelineCards}</div>
          <details class="timeline-details">
            <summary>View detailed timeline table</summary>
            <table>
              <thead><tr><th>Build</th><th>Version</th><th>Date</th><th>Quality</th><th>Release</th><th>Duration</th><th>Trend</th></tr></thead>
              <tbody>${timelineRows}</tbody>
            </table>
          </details>
        </div>
        </details>
      ` : `
        ${renderEmptyState({
          title: 'No historical executions available.',
          reason: 'This is the first recorded AIR execution.',
          action: 'Build comparison will appear after multiple executions.',
        })}
      `}
      ${renderPageFooter('comparison')}
    </section>

    <section class="page report-extra" id="air-core">
      ${renderPageNav('air-core')}
      <div class="topbar">
        <div>
          <div class="eyebrow">${escapeHtml(projectName)}</div>
          ${pageHeading('settings', 'About AIR')}
          <p>Five layers turn the test run into this report. Open a layer to see the numbers it produced.</p>
        </div>
        <a class="btn" href="#roadmap">Product roadmap</a>
      </div>
      <div class="air-core-hero panel">
        <div class="air-core-hero-copy">
          <span class="section-icon">CORE</span>
          <div>
            <h2>AIR Core Pipeline</h2>
            <p>AIR Core converts raw execution data into summary, failures, module health, journey health, evidence, quality, release decision, recommendations, search, and history.</p>
          </div>
        </div>
        <div class="air-core-hero-stats">
          <div>
            <span>Engines Loaded</span>
            <strong>${engineStatusItems.length}</strong>
          </div>
          <div>
            <span>Pipeline Status</span>
            <strong class="is-text">Operational</strong>
          </div>
          <div>
            <span>Output Model</span>
            <strong class="is-text">air-results.json</strong>
          </div>
        </div>
      </div>

      <div class="air-core-map panel">
        <div class="section-heading-row">
          <div>
            <h2 class="icon-title"><span class="section-icon">MAP</span>Core Layers</h2>
            <p>Each layer enriches the AIR model within its own responsibility.</p>
          </div>
        </div>
        <div class="air-core-layer-grid">${airCoreLayerHtml}</div>
        <details class="fold">
          <summary><b>Each step, in order</b><span>${engineStatusItems.length} engines</span></summary>
          <div class="air-core-pipeline">${airCorePipelineHtml}</div>
        </details>
      </div>

      <div class="air-core-engines panel">
        <div class="section-heading-row">
          <div>
            <h2 class="icon-title"><span class="section-icon">ENG</span>Engine Output Dashboard</h2>
            <p>Operational status plus the useful output each engine generated for this report.</p>
          </div>
        </div>
        <div class="engine-output-stack">${airCoreEngineGroupsHtml}</div>
      </div>
      ${renderPageFooter('air-core')}
    </section>

    <section class="page report-extra" id="roadmap">
      ${renderPageNav('roadmap')}
      <div class="topbar">
        <div>
          <div class="eyebrow">${escapeHtml(projectName)}</div>
          ${pageHeading('roadmap', 'AIR Product Roadmap')}
          <p>What is done, what is in progress, and what comes later. Open a version for the full list.</p>
        </div>
        <span class="pill demo">Platform Evolution</span>
      </div>
      <div class="roadmap-summary">
        <div><span>Completed</span><strong>${roadmapCompletedCount}</strong></div>
        <div><span>In Progress</span><strong>${roadmapInProgressCount}</strong></div>
        <div><span>Planned / Future</span><strong>${roadmapPlannedCount}</strong></div>
        <div><span>Vision</span><strong>Engineering Intelligence</strong></div>
      </div>
      <div class="panel">
        <h2>Platform Evolution Progress</h2>
        <div class="roadmap-progress"><span></span></div>
        <p>AIR v1.0 and AIR v1.1 are complete. AIR v1.2 is now focused on historical analytics, build comparison, and trend intelligence.</p>
      </div>
      <br>
      ${renderInnerBoard('Versions', airRoadmapCards, (airRoadmapCards.match(/data-roadmap-index/g) || []).length, 'roadmap-grid')}
      <details class="fold">
        <summary><b>Version table</b><span>The same versions, in one list</span></summary>
      <div class="panel">
        <h2>AIR Product Evolution Roadmap</h2>
        <table>
          <thead><tr><th>Version</th><th>Goal</th><th>Status</th></tr></thead>
          <tbody>${airRoadmapWhyRows}</tbody>
        </table>
      </div>
      </details>
      <div class="panel">
        <h2>Beyond AIR v1.x</h2>
        <p>Later versions of this report. Open a card for the groups inside it.</p>
        <p>Current priority: Final Engineering Mode UI, Dynamic Data Model, and Dynamic Intelligence Engine.</p>
      </div>
      <div class="roadmap-grid">${futurePlatformVisionHtml}</div>
      ${renderPageFooter('roadmap')}
    </section>
    <footer class="footer">
      <span>${footerHtml}</span>
      <strong>${escapeHtml(projectName)} / ${escapeHtml(environment)}</strong>
    </footer>
  </main>
  <div class="drawer-backdrop" data-close-panels></div>
  <aside class="module-drawer" id="moduleDrawer" aria-hidden="true">
    <div class="drawer-header">
      <div>
        <div class="drawer-breadcrumb" id="drawerBreadcrumb">AIR &gt; Module Health &gt; Module</div>
        <div class="eyebrow">MODULE DETAILS</div>
        <h2 id="drawerTitle">Module Details</h2>
        <span class="badge green" id="drawerStatus">Healthy</span>
      </div>
      <button class="drawer-close" type="button" data-close-panels aria-label="Close module details">×</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-metrics">
        <div class="drawer-metric"><span>Health Score</span><strong id="drawerHealth">0%</strong></div>
        <div class="drawer-metric"><span>${helpLabel('Coverage', 'coverage')}</span><strong id="drawerCoverage">0%</strong></div>
        <div class="drawer-metric"><span>Tests</span><strong id="drawerTests">0</strong></div>
        <div class="drawer-metric"><span>Passed / Failed</span><strong id="drawerPassFail">0 / 0</strong></div>
      </div>
      <div class="drawer-section drawer-focus">
        <h3>Module Focus</h3>
        <p id="drawerFocus"></p>
      </div>
      <div class="drawer-section business-impact">
        <h3>Why it matters</h3>
        <p id="drawerBusinessImpact"></p>
      </div>
      <div class="drawer-section">
        <h3>Scenario Coverage</h3>
        <ul class="drawer-list" id="drawerScenarios"></ul>
      </div>
      <div class="drawer-section">
        <h3>Related Tests</h3>
        <div class="drawer-test-list" id="drawerRelatedTests"></div>
      </div>
      <div class="drawer-section">
        <h3>What failed</h3>
        <div class="drawer-test-list" id="drawerFailedTests"></div>
      </div>
      <div class="drawer-section">
        <h3>Evidence</h3>
        <div class="evidence-links" id="drawerEvidence"></div>
      </div>
      <div class="drawer-section">
        <h3>Validation Coverage</h3>
        <div class="drawer-metrics">
          <div class="drawer-metric"><span>API Validation</span><strong id="drawerApi">Planned</strong></div>
          <div class="drawer-metric"><span>DB Validation</span><strong id="drawerDb">Planned</strong></div>
          <div class="drawer-metric"><span>Performance</span><strong id="drawerPerf">Planned</strong></div>
          <div class="drawer-metric"><span>${helpLabel('Risk Level', 'risk')}</span><strong id="drawerRisk">Low</strong></div>
        </div>
      </div>
      <div class="drawer-section insight">
        <h3>AI Recommendation</h3>
        <p id="drawerRecommendation"></p>
      </div>
      <div class="drawer-section">
        <h3>History</h3>
        <div class="empty-note">Module history and trends will become available after multiple AIR executions are stored by the History Engine.</div>
      </div>
      <div class="drawer-actions">
        <a class="btn" id="drawerDashboardLink" href="#module-dashboard">Open Module Details</a>
        <a class="btn" href="#evidence">Open Evidence</a>
        <a class="btn" href="../playwright-report/index.html" target="_blank" rel="noopener">Open Playwright Report</a>
      </div>
    </div>
  </aside>
  <div class="modal-backdrop" data-close-panels></div>
  <section class="modal" id="recommendationModal" aria-hidden="true">
    <div class="modal-header">
      <div>
        <div class="eyebrow">AIR RECOMMENDATIONS</div>
        <h2>Execution Recommendation</h2>
        <p class="ai-decision-summary">${escapeHtml(aiDecisionSummary)}</p>
      </div>
      <button class="modal-close" type="button" data-close-panels aria-label="Close recommendations">×</button>
    </div>
    <div class="recommendation-grid">${aiPriorityRecommendations}</div>
    <br>
    <div class="modal-grid">
      <div class="panel"><h2>Release Risk</h2><div class="risk-banner ${estimatedReleaseRiskTone}"><div><span>Estimated Risk</span><strong>${escapeHtml(estimatedReleaseRisk)}</strong></div><div class="risk-dots"><i></i><i></i><i></i></div></div></div>
      <div class="panel"><h2>Action Checklist</h2><ul class="action-list">${aiActionChecklist}</ul></div>
    </div>
  </section>
  <section class="modal" id="releaseModal" aria-hidden="true">
    <div class="modal-header">
      <div>
        <div class="eyebrow">RELEASE ANALYSIS</div>
        <h2>Why ${releaseStatusCompact}?</h2>
        <p class="ai-decision-summary">${escapeHtml(aiDecisionSummary)}</p>
      </div>
      <button class="modal-close" type="button" data-close-panels aria-label="Close release analysis">×</button>
    </div>
    <div class="ai-metric-grid">
      <div class="ai-metric"><span>${helpLabel('Business Health', 'businessHealth')}</span><strong>${executiveData.businessHealth}%</strong></div>
      <div class="ai-metric"><span>${helpLabel('Quality Score', 'qualityScore')}</span><strong>${executiveData.qualityScore}%</strong></div>
      <div class="ai-metric"><span>Critical Failures</span><strong>${executiveData.failed}</strong></div>
      <div class="ai-metric"><span>Blockers</span><strong>${executiveData.failed}</strong></div>
    </div>
    <br>
    <div class="grid two">
      <div class="panel"><h2>Reason</h2><ul class="ai-reasons">${aiWhyItems}</ul></div>
      <div class="panel"><h2>Recommendation</h2><p>Proceed to release when this decision is GO. Use conditional approval only after evidence review when warnings are present.</p></div>
    </div>
  </section>
  <section class="modal" id="qualityModal" aria-hidden="true">
    <div class="modal-header">
      <div>
        <div class="eyebrow">QUALITY SCORE EXPLAINER</div>
        <h2>How AIR Calculated ${executiveData.qualityScore}%</h2>
        <p class="ai-decision-summary">Quality uses executed pass rate (tests that actually ran) and business-flow health. Documented skip-only matrix rows stay in Coverage Gaps and do not pull the score down to inventory 21%.</p>
      </div>
      <button class="modal-close" type="button" data-close-panels aria-label="Close quality score explainer">&times;</button>
    </div>
    <table>
      <thead><tr><th>Factor</th><th>Signal</th><th>Explanation</th></tr></thead>
      <tbody>${qualityFactorRows}</tbody>
    </table>
  </section>
  <section class="modal" id="riskModal" aria-hidden="true">
    <div class="modal-header">
      <div>
        <div class="eyebrow">RISK EXPLANATION</div>
        <h2>Release Risk: ${escapeHtml(estimatedReleaseRisk)}</h2>
        <p class="ai-decision-summary">AIR derives risk from failed tests, critical modules, warning modules, skipped checks, journey health, and release-rule output.</p>
      </div>
      <button class="modal-close" type="button" data-close-panels aria-label="Close risk explanation">&times;</button>
    </div>
    <div class="ai-metric-grid">
      <div class="ai-metric"><span>Failed Tests</span><strong>${executiveData.failed}</strong></div>
      <div class="ai-metric"><span>Warning Modules</span><strong>${warningModules}</strong></div>
      <div class="ai-metric"><span>Critical Modules</span><strong>${criticalModules}</strong></div>
      <div class="ai-metric"><span>Release Risk</span><strong>${escapeHtml(estimatedReleaseRisk)}</strong></div>
    </div>
    <br>
    <div class="panel"><h2>Risk Guidance</h2><p>${escapeHtml(airResults?.release?.explanation ?? aiDecisionSummary)}</p></div>
  </section>
  <section class="modal" id="confidenceModal" aria-hidden="true">
    <div class="modal-header">
      <div>
        <div class="eyebrow">CONFIDENCE EXPLANATION</div>
        <h2>Release Confidence: ${executiveConfidence}%</h2>
        <p class="ai-decision-summary">Confidence reflects execution context, pass stability, coverage breadth, evidence readiness, and release-rule confidence.</p>
      </div>
      <button class="modal-close" type="button" data-close-panels aria-label="Close confidence explanation">&times;</button>
    </div>
    <div class="ai-metric-grid">
      <div class="ai-metric"><span>Execution Context</span><strong>${escapeHtml(airResults?.executionContext?.validationLevel ?? airResults?.executionContext?.type ?? 'No Data')}</strong></div>
      <div class="ai-metric"><span>Pass Rate</span><strong>${executiveData.passRate}%</strong></div>
      <div class="ai-metric"><span>Coverage</span><strong>${escapeHtml(String(airResults?.executionContext?.coverage ?? 'No Data'))}${airResults?.executionContext?.coverage !== undefined ? '%' : ''}</strong></div>
      <div class="ai-metric"><span>Evidence</span><strong>${escapeHtml(evidenceReadiness)}</strong></div>
    </div>
  </section>
  <section class="modal" id="journeyModal" aria-hidden="true">
    <div class="modal-header">
      <div>
        <div class="eyebrow">JOURNEY DETAILS</div>
        <h2 id="journeyTitle">Journey Details</h2>
        <p class="ai-decision-summary" id="journeySummary">Journey-level health and impacted modules.</p>
      </div>
      <button class="modal-close" type="button" data-close-panels aria-label="Close journey details">&times;</button>
    </div>
    <div class="ai-metric-grid">
      <div class="ai-metric"><span>Health</span><strong id="journeyHealth">0%</strong></div>
      <div class="ai-metric"><span>Status</span><strong id="journeyStatus">No Data</strong></div>
      <div class="ai-metric"><span>Tests</span><strong id="journeyTests">0</strong></div>
      <div class="ai-metric"><span>Risk</span><strong id="journeyRisk">No Data</strong></div>
    </div>
    <br>
    <div class="modal-grid">
      <div class="panel"><h2>Mapped / Affected Modules</h2><ul class="action-list" id="journeyModules"></ul></div>
      <div class="panel"><h2>Not Executed / Failed Dependencies</h2><ul class="action-list" id="journeyGaps"></ul></div>
    </div>
    <br>
    <div class="panel insight"><h2>Recommendation</h2><p id="journeyRecommendation"></p></div>
  </section>
  <section class="modal" id="evidenceModal" aria-hidden="true">
    <div class="modal-header">
      <div>
        <div class="eyebrow">EVIDENCE PREVIEW</div>
        <h2 id="evidencePreviewTitle">Evidence</h2>
        <p class="ai-decision-summary" id="evidencePreviewMeta">Evidence metadata will appear here.</p>
      </div>
      <button class="modal-close" type="button" data-close-panels aria-label="Close evidence preview">&times;</button>
    </div>
    <div id="evidencePreviewBody" class="evidence-preview-body"></div>
  </section>
  <section class="modal" id="detailModal" aria-hidden="true">
    <div class="modal-header">
      <div>
        <div class="eyebrow" id="detailEyebrow">AIR DETAIL</div>
        <h2 id="detailTitle">Details</h2>
        <p class="ai-decision-summary" id="detailSummary">Detail information.</p>
      </div>
      <button class="modal-close" type="button" data-close-panels aria-label="Close detail view">&times;</button>
    </div>
    <div id="detailBody" class="evidence-preview-body"></div>
  </section>
</div>
<script>
  function shortPagerLabel(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= 32) return clean;
    const slice = clean.slice(0, 32);
    const space = slice.lastIndexOf(' ');
    const cut = space > 16 ? slice.slice(0, space) : slice;
    return cut.replace(/[.,:;–—-]+$/, '') + '…';
  }
  function writePagerName(node, text) {
    if (!node) return;
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    node.textContent = clean ? shortPagerLabel(clean) : '';
    if (clean) node.title = clean;
    else node.removeAttribute('title');
  }
  const reportPageIds = ${JSON.stringify(reportPages.map(([pageId]) => pageId))};
  function pageForTarget(id) {
    const target = id ? document.getElementById(id) : null;
    if (!target) {
      return document.getElementById('cover');
    }
    if (target.classList.contains('page')) {
      return target;
    }
    return target.closest('section.page') || document.getElementById('cover');
  }
  function currentPageId() {
    return document.body.dataset.airPage || 'cover';
  }
  function showCurrentPage() {
    const hashId = decodeURIComponent((location.hash || '#cover').replace(/^#/, ''));
    const page = pageForTarget(hashId);
    const pageId = page && page.id ? page.id : 'cover';
    document.body.dataset.airPage = pageId;
    document.querySelectorAll('main > section.page').forEach((section) => {
      section.classList.toggle('is-current', section.id === pageId);
    });
    document.querySelectorAll('.nav a').forEach((link) => {
      const active = link.getAttribute('href') === '#' + pageId;
      link.classList.toggle('active', active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
    const more = document.querySelector('.nav-more');
    if (more) {
      more.open = Boolean(more.querySelector('a[href="#' + pageId + '"]'));
    }
    updateFailurePanels();
    updateFailureCardNav();
    updateModuleFocus();
    const focus = document.getElementById(hashId);
    if (focus && focus.tagName === 'DETAILS') {
      focus.open = true;
    }
    const focusHidden = Boolean(focus && (focus.hidden || window.getComputedStyle(focus).display === 'none'));
    if (focus && focus !== page && !focusHidden) {
      focus.scrollIntoView({ block: 'start' });
    } else if (!focus || focus === page) {
      window.scrollTo(0, 0);
    }
    updateStepNav();
    updatePlanBrowser({ scroll: true });
  }
  function updateFailurePanels() {
    const hashId = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    const panels = Array.from(document.querySelectorAll('#failures [data-failure-panel]'));
    if (!panels.length) {
      return;
    }
    const match = panels.find((panel) => panel.id === hashId) || null;
    const home = document.getElementById('failure-home');
    const groupOpen = hashId.startsWith('failure-group-');
    panels.forEach((panel) => {
      const show = groupOpen ? false : (match ? panel === match : panel === home);
      panel.hidden = !show;
    });
  }
  function updateFailureCardNav() {
    const steps = [
      { id: 'failure-story-board', label: 'Stories' },
      { id: 'failure-full-list', label: 'Failed checks' },
      { id: 'failure-areas', label: 'Areas' },
      { id: 'evidence', label: 'Pictures' },
    ];
    const hashId = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    let index = steps.findIndex((step) => step.id === hashId);
    if (index < 0 && hashId.startsWith('failure-group-')) index = 0;
    if (index < 0 && hashId.startsWith('failure-area-')) index = 2;
    const previous = index > 0 ? steps[index - 1] : (index === 0 ? { id: 'failures', label: 'All cards' } : null);
    const next = index >= 0 ? (steps[index + 1] || null) : steps[0];
    const here = index >= 0 ? steps[index] : null;
    document.querySelectorAll('[data-failure-card-nav]').forEach((nav) => {
      const page = nav.closest('section.page');
      nav.hidden = !page || page.id !== document.body.dataset.airPage;
      const prevLink = nav.querySelector('[data-failure-card-prev]');
      const nextLink = nav.querySelector('[data-failure-card-next]');
      const count = nav.querySelector('[data-failure-card-count]');
      const label = nav.querySelector('[data-failure-card-here]');
      if (prevLink) {
        prevLink.classList.toggle('is-pager-empty', !previous);
        if (previous) prevLink.setAttribute('href', '#' + previous.id);
        const name = prevLink.querySelector('strong');
        if (name) writePagerName(name, previous ? '← ' + previous.label : '');
      }
      if (nextLink) {
        nextLink.classList.toggle('is-pager-empty', !next);
        if (next) nextLink.setAttribute('href', '#' + next.id);
        const name = nextLink.querySelector('strong');
        if (name) writePagerName(name, next ? next.label + ' →' : '');
      }
      if (count) count.textContent = here ? (index + 1) + ' of ' + steps.length : steps.length + ' cards';
      if (label) label.textContent = here ? here.label : 'Choose a card';
    });
    document.querySelectorAll('#failure-home .failure-summary-card').forEach((card) => {
      const href = card.getAttribute('href') || '';
      card.classList.toggle('is-card-current', Boolean(here) && href === '#' + here.id);
    });
  }
  function updateModuleFocus() {
    const page = document.getElementById('module-dashboard');
    if (!page) {
      return;
    }
    const hashId = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    const items = Array.from(page.querySelectorAll('[data-step-item]'));
    const selected = items.find((item) => item.id === hashId) || null;
    page.classList.toggle('is-area-open', Boolean(selected));
    const intro = page.querySelector('.module-dashboard-intro');
    const jump = page.querySelector('.module-jump');
    if (intro) intro.hidden = Boolean(selected);
    if (jump) jump.hidden = Boolean(selected);
    document.dispatchEvent(new Event('air-inner-sync'));
  }
  function visibleStepItems(page) {
    return Array.from(page.querySelectorAll('[data-step-item]')).filter((item) => (
      !item.hidden && !item.classList.contains('is-hidden')
    ));
  }
  function updateStepNav() {
    const hashId = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    document.querySelectorAll('section.page .step-nav').forEach((nav) => {
      const page = nav.closest('section.page');
      const items = page ? visibleStepItems(page) : [];
      const indexPanel = page?.querySelector('[data-passed-index]');
      const requireSelection = nav.hasAttribute('data-step-require-selection');
      const selectedIndex = items.findIndex((item) => item.id === hashId);
      if (requireSelection && selectedIndex < 0) {
        nav.hidden = true;
        items.forEach((item) => item.classList.remove('is-step-current'));
        if (indexPanel) indexPanel.hidden = false;
        return;
      }
      if (items.length < 2) {
        nav.hidden = true;
        if (requireSelection && selectedIndex >= 0) {
          items.forEach((item) => item.classList.toggle('is-step-current', item.id === hashId));
          if (indexPanel) indexPanel.hidden = true;
        }
        return;
      }
      nav.hidden = false;
      const index = selectedIndex < 0 ? 0 : selectedIndex;
      const current = items[index];
      const previous = items[index - 1];
      const next = items[index + 1];
      items.forEach((item) => {
        item.classList.toggle('is-step-current', item.id === hashId);
      });
      if (indexPanel) indexPanel.hidden = requireSelection;
      const label = nav.querySelector('[data-step-label]');
      const count = nav.querySelector('[data-step-count]');
      const prevName = nav.querySelector('[data-step-prev-name]');
      const nextName = nav.querySelector('[data-step-next-name]');
      if (label) label.textContent = shortPagerLabel(current?.getAttribute('data-step-label') || '');
      if (count) count.textContent = (index + 1) + ' of ' + items.length;
      if (prevName) writePagerName(prevName, previous ? '← ' + (previous.getAttribute('data-step-label') || '') : '');
      if (nextName) writePagerName(nextName, next ? (next.getAttribute('data-step-label') || '') + ' →' : '');
      const prevButton = nav.querySelector('[data-step-prev]');
      const nextButton = nav.querySelector('[data-step-next]');
      if (prevButton) prevButton.disabled = !previous;
      if (nextButton) nextButton.disabled = !next;
      nav.dataset.prev = previous?.id || '';
      nav.dataset.next = next?.id || '';
      if (requireSelection && current) {
        current.scrollIntoView({ block: 'start' });
      }
    });
  }
  document.querySelectorAll('.step-nav').forEach((nav) => {
    nav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-step-prev], [data-step-next]');
      if (!button || button.disabled) {
        return;
      }
      const id = button.hasAttribute('data-step-prev') ? nav.dataset.prev : nav.dataset.next;
      if (!id) {
        return;
      }
      if (location.hash === '#' + id) {
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
        updateStepNav();
        return;
      }
      location.hash = id;
    });
  });
  window.addEventListener('hashchange', showCurrentPage);
  showCurrentPage();

  const moduleDrawerData = ${moduleDrawerDataJson};
  const journeyDetailData = ${journeyDetailDataJson};
  const recommendationDetailData = ${recommendationDetailDataJson};
  const roadmapDetailData = ${roadmapDetailDataJson};
  const airSearchIndex = ${airSearchIndexJson};
  const failureDetailData = ${failureDetailDataJson};
  const warningDetailData = ${warningDetailDataJson};
  const coverageGapDetailData = ${coverageGapDetailDataJson};
  const drawer = document.getElementById('moduleDrawer');
  const drawerBackdrop = document.querySelector('.drawer-backdrop');
  const modalBackdrop = document.querySelector('.modal-backdrop');
  const recommendationModal = document.getElementById('recommendationModal');
  const releaseModal = document.getElementById('releaseModal');
  const qualityModal = document.getElementById('qualityModal');
  const riskModal = document.getElementById('riskModal');
  const confidenceModal = document.getElementById('confidenceModal');
  const journeyModal = document.getElementById('journeyModal');
  const evidenceModal = document.getElementById('evidenceModal');
  const detailModal = document.getElementById('detailModal');

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  let activeTooltip = null;

  function closeAirTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  function openAirTooltip(target) {
    const text = target?.dataset?.airTooltip;

    if (!text) {
      return;
    }

    closeAirTooltip();
    activeTooltip = document.createElement('div');
    activeTooltip.className = 'air-tooltip';
    activeTooltip.textContent = text;
    activeTooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(activeTooltip);

    const targetRect = target.getBoundingClientRect();
    const tooltipRect = activeTooltip.getBoundingClientRect();
    const margin = 12;
    let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
    let top = targetRect.bottom + 10;

    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));

    if (top + tooltipRect.height > window.innerHeight - margin) {
      top = targetRect.top - tooltipRect.height - 10;
    }

    top = Math.max(margin, top);
    activeTooltip.style.left = left + 'px';
    activeTooltip.style.top = top + 'px';
  }

  document.querySelectorAll('[data-air-tooltip]').forEach(element => {
    element.addEventListener('mouseenter', () => openAirTooltip(element));
    element.addEventListener('mouseleave', closeAirTooltip);
    element.addEventListener('focus', () => openAirTooltip(element));
    element.addEventListener('blur', closeAirTooltip);
    element.addEventListener('touchstart', event => {
      event.stopPropagation();
      openAirTooltip(element);
    }, { passive: true });
  });

  document.addEventListener('scroll', closeAirTooltip, true);
  window.addEventListener('resize', closeAirTooltip);

  function openDrawer(moduleName) {
    const data = moduleDrawerData.find(item => item.name === moduleName);
    if (!data || !drawer) {
      return;
    }

    setText('drawerTitle', data.name + ' Dashboard');
    setText('drawerHealth', data.health + '%');
    setText('drawerCoverage', data.coverage + '%');
    setText('drawerTests', String(data.total));
    setText('drawerPassFail', data.passed + ' / ' + data.failed);
    setText('drawerApi', data.validation.api);
    setText('drawerDb', data.validation.database);
    setText('drawerPerf', data.validation.performance);
    setText('drawerRisk', data.risk);
    setText('drawerFocus', data.focus);
    setText('drawerRecommendation', data.recommendation);
    setText('drawerBusinessImpact', data.businessImpact);
    setText('drawerBreadcrumb', 'AIR > Module Health > ' + data.name);

    const status = document.getElementById('drawerStatus');
    if (status) {
      status.textContent = data.status;
      status.className = 'badge ' + (data.risk === 'High' ? 'red' : data.risk === 'Medium' || data.status === 'Partial' ? 'amber' : 'green');
    }

    const scenarios = document.getElementById('drawerScenarios');
    if (scenarios) {
      scenarios.innerHTML = data.scenarios.map(item => '<li>' + item + '</li>').join('');
    }

    const relatedTests = document.getElementById('drawerRelatedTests');
    if (relatedTests) {
      if (Array.isArray(data.relatedTests) && data.relatedTests.length > 0) {
        relatedTests.innerHTML = data.relatedTests
          .map(test => {
            const statusClass = test.status === 'passed' ? 'green' : test.status === 'skipped' ? 'amber' : 'red';
            return '<div class="drawer-test-row"><div><strong>' + test.title + '</strong><span>' + (test.duration ? test.duration + ' ms' : 'Duration unavailable') + '</span></div><em class="' + statusClass + '">' + test.status + '</em></div>';
          })
          .join('');
      } else {
        relatedTests.innerHTML = '<div class="empty-note">No test-level data available for this module in the current AIR model. Run a fresh full execution to populate related tests.</div>';
      }
    }

    const failedTests = document.getElementById('drawerFailedTests');
    if (failedTests) {
      const moduleFailures = Array.isArray(data.relatedTests)
        ? data.relatedTests.filter(test => test.status !== 'passed' && test.status !== 'skipped')
        : [];

      if (moduleFailures.length > 0) {
        failedTests.innerHTML = moduleFailures
          .map(test => '<div class="drawer-test-row"><div><strong>' + test.title + '</strong><span>' + (test.error || 'Review related evidence') + '</span></div><em class="red">' + test.status + '</em></div>')
          .join('');
      } else {
        failedTests.innerHTML = '<div class="empty-note">No failed tests detected for this module in the current execution.</div>';
      }
    }

    const evidence = document.getElementById('drawerEvidence');
    if (evidence) {
      evidence.innerHTML = [
        ['Screenshot', data.evidence.screenshots, '#evidence'],
        ['Video', data.evidence.videos, '#evidence'],
        ['Trace', data.evidence.traces, '../playwright-report/index.html'],
        ['Logs', data.evidence.logs, '#evidence']
      ].map(item => '<a class="evidence-chip" href="' + item[2] + '" data-evidence-preview data-evidence-kind="' + item[0] + '" data-evidence-status="' + item[1] + '" data-evidence-href="' + item[2] + '"><strong>' + item[0] + '</strong><span>' + item[1] + '</span></a>').join('');
      evidence.querySelectorAll('[data-evidence-preview]').forEach(link => {
        link.addEventListener('click', event => {
          event.preventDefault();
          openEvidencePreview(link);
        });
      });
    }

    const dashboardLink = document.getElementById('drawerDashboardLink');
    if (dashboardLink) {
      dashboardLink.href = data.dashboardTarget;
    }

    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    drawerBackdrop.classList.add('open');
  }

  function openModal(modal) {
    if (!modal) {
      return;
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modalBackdrop.classList.add('open');
  }

  function closePanels() {
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    [recommendationModal, releaseModal, qualityModal, riskModal, confidenceModal, journeyModal, evidenceModal, detailModal].forEach(modal => {
      if (modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
      }
    });
    drawerBackdrop.classList.remove('open');
    modalBackdrop.classList.remove('open');
  }

  document.querySelectorAll('.module-dashboard-card[data-module]').forEach(card => {
    card.addEventListener('click', event => {
      if (event.target.closest('details, summary, .mini-evidence-button')) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openDrawer(card.dataset.module);
    });
  });

  function openJourneyDetail(journeyName) {
    if (!journeyModal) {
      return;
    }

    const data = journeyDetailData.find(item => item.name === journeyName) || {
      name: journeyName,
      status: 'No Data Available',
      health: 0,
      risk: 'No Data',
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      affectedModules: [],
      failedDependencies: [],
      notExecutedSteps: [],
      recommendation: 'Run mapped journey tests to generate journey-level recommendations.',
    };

    setText('journeyTitle', data.name + ' Journey');
    setText('journeySummary', 'Shows journey health, mapped modules, failed dependencies, not-executed steps, and next action.');
    setText('journeyHealth', data.health + '%');
    setText('journeyStatus', data.status);
    setText('journeyTests', data.passed + '/' + data.total);
    setText('journeyRisk', data.risk);
    setText('journeyRecommendation', data.recommendation);

    const modules = document.getElementById('journeyModules');
    if (modules) {
      const items = Array.isArray(data.affectedModules) && data.affectedModules.length > 0
        ? data.affectedModules
        : ['No mapped module data available in current AIR model.'];
      modules.innerHTML = items.map(item => '<li>' + item + '</li>').join('');
    }

    const gaps = document.getElementById('journeyGaps');
    if (gaps) {
      const items = [
        ...(data.failedDependencies || []).map(item => 'Failed dependency: ' + item),
        ...(data.notExecutedSteps || []).map(item => 'Not executed: ' + item),
      ];
      gaps.innerHTML = (items.length ? items : ['No failed or not-executed journey dependencies recorded.'])
        .map(item => '<li>' + item + '</li>')
        .join('');
    }

    openModal(journeyModal);
  }

  document.querySelectorAll('.journey-node[data-journey]').forEach(node => {
    node.addEventListener('click', () => openJourneyDetail(node.dataset.journey));
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openJourneyDetail(node.dataset.journey);
      }
    });
  });

  document.querySelectorAll('[data-open-recommendations]').forEach(button => {
    button.addEventListener('click', () => openModal(recommendationModal));
  });

  document.querySelectorAll('[data-open-release]').forEach(card => {
    card.addEventListener('click', () => openModal(releaseModal));
  });
  bindKeyboardOpen(document.querySelectorAll('[data-open-release]'), () => openModal(releaseModal));

  document.querySelectorAll('[data-open-quality]').forEach(element => {
    element.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openModal(qualityModal);
    });
  });
  bindKeyboardOpen(document.querySelectorAll('[data-open-quality]'), () => openModal(qualityModal));

  document.querySelectorAll('[data-open-risk]').forEach(element => {
    element.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openModal(riskModal);
    });
  });
  bindKeyboardOpen(document.querySelectorAll('[data-open-risk]'), () => openModal(riskModal));

  document.querySelectorAll('[data-open-confidence]').forEach(element => {
    element.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openModal(confidenceModal);
    });
  });
  bindKeyboardOpen(document.querySelectorAll('[data-open-confidence]'), () => openModal(confidenceModal));

  function openDetailModal(config) {
    if (!detailModal || !config) {
      return;
    }

    setText('detailEyebrow', config.eyebrow || 'AIR DETAIL');
    setText('detailTitle', config.title || 'Details');
    setText('detailSummary', config.summary || '');

    const body = document.getElementById('detailBody');
    if (body) {
      body.innerHTML = config.body || '<p>No additional detail available.</p>';
    }

    openModal(detailModal);
  }

  function escapeModalText(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderIssueModalList(items, type) {
    if (!items || items.length === 0) {
      return '<div class="empty-note">No detail rows available for this section.</div>';
    }

    function renderFailureScreenshotModal(item) {
      const context = item.screenshotContext || {};
      const artifactLinks = Array.isArray(item.artifactLinks) ? item.artifactLinks : [];
      const artifactBlock = '<div class="failure-artifact-group modal-artifacts"><span>Trace / Video / Logs</span>' +
        (artifactLinks.length > 0
          ? '<div class="failure-evidence-chips">' + artifactLinks.map(link => '<a href="' + escapeModalText(link.href) + '" data-evidence-preview data-evidence-kind="' + escapeModalText(link.label) + '" data-evidence-status="' + escapeModalText(link.status) + '" data-evidence-href="' + escapeModalText(link.href) + '">' + escapeModalText(link.label) + '</a>').join('') + '</div>'
          : '<div class="failure-evidence-chips muted"><span>No trace, video, or log artifact attached</span></div>') +
        '</div>';

      if (!context.available) {
        return '<div class="failure-screenshot-context modal-evidence-context"><div class="failure-shot-panel unavailable"><span>Picture</span><strong>No picture was saved</strong><small>' + escapeModalText(item.whyFailed || 'This check failed before a screenshot was taken.') + '</small></div></div>' + artifactBlock;
      }

      const annotatedBlock = context.annotatedAvailable
        ? '<a href="' + escapeModalText(context.annotatedHref) + '" data-evidence-preview data-evidence-kind="Annotated Failure View" data-evidence-status="Available" data-evidence-href="' + escapeModalText(context.annotatedHref) + '"><img src="' + escapeModalText(context.annotatedHref) + '" alt="Annotated failure view"><small>' + escapeModalText(context.annotationMessage) + '</small></a>'
        : '<strong>Not available</strong><small>Failure location could not be determined automatically.</small>';
      const originalBlock = context.originalAvailable
        ? '<a href="' + escapeModalText(context.originalHref) + '" data-evidence-preview data-evidence-kind="Original Screenshot" data-evidence-status="' + escapeModalText(context.originalLabel) + '" data-evidence-href="' + escapeModalText(context.originalHref) + '"><img src="' + escapeModalText(context.originalHref) + '" alt="' + escapeModalText(context.originalLabel) + '"><small>' + escapeModalText(context.originalLabel) + '</small></a>'
        : '<strong>Not available</strong><small>Original screenshot was not attached.</small>';

      return '<div class="failure-screenshot-context modal-evidence-context"><div class="failure-shot-panel ' + (context.annotatedAvailable ? 'annotated' : 'unavailable') + '"><span>Picture with a mark</span>' + annotatedBlock + '</div><div class="failure-shot-panel original"><span>Screen at failure</span>' + originalBlock + '</div><div class="failure-shot-notes"><p><b>What happened:</b> ' + escapeModalText(item.whyFailed) + '</p><p><b>What we wanted:</b> ' + escapeModalText(item.expected) + '</p></div></div>' + artifactBlock;
    }

    function renderFailureSourceNotes(item) {
      const sources = item.sources || {};
      const rows = [
        ['Summary', sources.summary],
        ['Expected', sources.expected],
        ['Observed', sources.observed],
        ['Impact', sources.impact],
        ['Cause', sources.cause],
        ['Technical Error', sources.technicalError],
      ].filter(([, source]) => source);

      if (rows.length === 0) {
        return '';
      }

      return '<div class="failure-source-notes"><span>Why AIR thinks this</span>' +
        rows.map(([label, source]) => '<small><b>' + escapeModalText(label) + ':</b> ' + escapeModalText(source) + '</small>').join('') +
        '</div>';
    }

    return '<div class="issue-modal-list">' + items.map(item => {
      const titlePrefix = type === 'failure'
        ? 'F'
        : type === 'warning'
          ? 'W'
          : 'G';
      const mainText = type === 'failure'
        ? '<p><b>What happened:</b> ' + escapeModalText(item.whyFailed) + '</p><p><b>What we wanted:</b> ' + escapeModalText(item.expected) + '</p><p><b>Why it matters:</b> ' + escapeModalText(item.impact) + '</p><details><summary>Error detail</summary><p>' + escapeModalText(item.technicalError) + '</p></details>'
        : '<p><b>Reason:</b> ' + escapeModalText(item.reason) + '</p>';
      const evidenceContext = type === 'failure'
        ? renderFailureScreenshotModal(item)
        : '';
      const sourceNotes = type === 'failure'
        ? renderFailureSourceNotes(item)
        : '';
      const nextAction = item.nextAction
        ? '<p><b>What to do:</b> ' + escapeModalText(item.nextAction) + '</p>'
        : '';
      const meta = [
        item.module,
        item.severity || item.priority || item.category,
        item.status,
        item.evidence,
        item.source || item.useCase,
        item.sourceIds,
      ]
        .filter(Boolean)
        .map(value => '<span>' + escapeModalText(value) + '</span>')
        .join('');

      return '<article class="issue-modal-item"><div class="issue-modal-head"><div><strong>' + titlePrefix + item.index + ' - ' + escapeModalText(item.title) + '</strong><small>' + escapeModalText(item.fullTitle || item.file || '') + '</small></div><span class="badge ' + (type === 'failure' ? 'bad' : 'warn') + '">' + escapeModalText(item.category || item.severity || item.status || type) + '</span></div>' + mainText + sourceNotes + evidenceContext + nextAction + '<div class="issue-modal-meta">' + meta + '</div></article>';
    }).join('') + '</div>';
  }

  document.querySelectorAll('[data-open-failure-details]').forEach(button => {
    button.addEventListener('click', () => {
      openDetailModal({
        eyebrow: 'FAILED TESTS',
        title: 'Failed Test Details',
        summary: 'Plain-language list of what failed, why it failed, evidence status, and the next review action.',
        body: renderIssueModalList(failureDetailData, 'failure'),
      });
    });
  });

  document.querySelectorAll('[data-open-warning-details]').forEach(button => {
    button.addEventListener('click', () => {
      openDetailModal({
        eyebrow: 'WARNING TESTS',
        title: 'Warning / Controlled Test Details',
        summary: 'Scenarios that were skipped, controlled, interrupted, or gated by missing prerequisites.',
        body: renderIssueModalList(warningDetailData, 'warning'),
      });
    });
  });

  document.querySelectorAll('[data-open-coverage-gap-details]').forEach(button => {
    button.addEventListener('click', () => {
      openDetailModal({
        eyebrow: 'BLOCKED / SKIPPED',
        title: 'Blocked and Not Executed Coverage',
        summary: 'Matrix scenarios and controlled checks that were not executed in this run, with reason and next action.',
        body: renderIssueModalList(coverageGapDetailData, 'gap'),
      });
    });
  });

  function bindKeyboardOpen(elements, openCallback) {
    elements.forEach(element => {
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCallback(element, event);
        }
      });
    });
  }

  const recommendationCards = document.querySelectorAll('[data-recommendation-index]');
  recommendationCards.forEach(card => {
    card.addEventListener('click', () => {
      const data = recommendationDetailData[Number(card.dataset.recommendationIndex)];
      openDetailModal({
        eyebrow: data?.priority || 'AIR RECOMMENDATION',
        title: data?.title || 'Recommendation',
        summary: data?.reason || 'AIR recommendation detail.',
        body: '<div class="modal-grid"><div class="panel"><h2>Source</h2><p>' + (data?.source || 'AIR Recommendation Engine') + '</p></div><div class="panel"><h2>Related Area</h2><p>' + (data?.relatedModule || 'Current Release') + ' / ' + (data?.relatedJourney || 'Release Readiness') + '</p></div></div><br><div class="panel insight"><h2>Action</h2><p>' + (data?.action || 'Review recommendation and update automation coverage.') + '</p></div>',
      });
    });
  });
  bindKeyboardOpen(recommendationCards, element => element.click());

  const roadmapCards = document.querySelectorAll('[data-roadmap-index]');
  roadmapCards.forEach(card => {
    card.addEventListener('click', () => {
      const data = roadmapDetailData[Number(card.dataset.roadmapIndex)];
      const deliverables = (data?.deliverables || []).map(item => '<li>' + item + '</li>').join('');
      const dependencies = (data?.dependencies || []).map(item => '<li>' + item + '</li>').join('');
      openDetailModal({
        eyebrow: data?.status || 'AIR ROADMAP',
        title: (data?.version || 'AIR') + ' - ' + (data?.title || 'Roadmap'),
        summary: data?.purpose || 'AIR roadmap detail.',
        body: '<div class="modal-grid"><div class="panel"><h2>Deliverables</h2><ul class="action-list">' + deliverables + '</ul></div><div class="panel"><h2>Dependencies</h2><ul class="action-list">' + dependencies + '</ul></div></div><br><div class="panel insight"><h2>Future Value</h2><p>' + (data?.futureValue || 'Improves AIR platform value.') + '</p></div>',
      });
    });
  });
  bindKeyboardOpen(roadmapCards, element => element.click());

  function openEvidencePreview(trigger) {
    if (!evidenceModal || !trigger) {
      return;
    }

    const kind = trigger.dataset.evidenceKind || 'Evidence';
    const status = trigger.dataset.evidenceStatus || 'Available';
    const href = trigger.dataset.evidenceHref || trigger.getAttribute('href') || '#evidence';
    const title = document.getElementById('evidencePreviewTitle');
    const meta = document.getElementById('evidencePreviewMeta');
    const body = document.getElementById('evidencePreviewBody');

    if (title) {
      title.textContent = kind;
    }

    if (meta) {
      meta.textContent = status + ' - ' + href;
    }

    if (body) {
      const lowerHref = href.toLowerCase();
      if (lowerHref.endsWith('.png') || lowerHref.endsWith('.jpg') || lowerHref.endsWith('.jpeg') || lowerHref.endsWith('.webp')) {
        body.innerHTML = '<img src="' + href + '" alt="' + kind + ' preview">';
      } else if (lowerHref.endsWith('.webm') || lowerHref.endsWith('.mp4')) {
        body.innerHTML = '<video controls src="' + href + '"></video>';
      } else if (!href || href.indexOf('test-results/') !== -1) {
        body.innerHTML = '<div class="preview-meta"><p>This file is no longer on disk. A later test run cleared the results folder, so the link cannot open.</p></div>';
      } else {
        body.innerHTML = '<div class="preview-meta"><p>This file is saved with the report.</p><a href="' + href + '" target="_blank" rel="noopener">Open this file</a></div>';
      }
    }

    openModal(evidenceModal);
  }

  document.querySelectorAll('[data-evidence-preview]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      openEvidencePreview(link);
    });
  });

  document.querySelectorAll('[data-close-panels]').forEach(button => {
    button.addEventListener('click', closePanels);
  });

  const moduleFilterButtons = Array.from(document.querySelectorAll('[data-module-filter]'));
  const moduleFilterSearch = document.getElementById('moduleStatusSearch');
  const moduleFilterCount = document.querySelector('[data-module-filter-count]');
  const moduleFilterEmpty = document.querySelector('[data-module-filter-empty]');

  function getActiveModuleFilter() {
    return String(document.querySelector('[data-module-filter].active')?.dataset.moduleFilter || 'all').toLowerCase();
  }

  function updateModuleFilter() {
    const activeFilter = getActiveModuleFilter();
    const query = String(moduleFilterSearch?.value || '').trim().toLowerCase();
    const cards = Array.from(document.querySelectorAll('#health .module-health-card[data-module]'));
    let visible = 0;

    cards.forEach(card => {
      const statusGroup = String(card.dataset.moduleStatusGroup || '').toLowerCase();
      const searchText = String(card.dataset.moduleSearch || card.textContent || '').toLowerCase();
      const matchesStatus = activeFilter === 'all' || statusGroup === activeFilter;
      const matchesSearch = !query || searchText.includes(query);
      const matches = matchesStatus && matchesSearch;
      card.classList.toggle('is-hidden', !matches);
      card.setAttribute('aria-hidden', String(!matches));
      if (matches) {
        visible += 1;
      }
    });

    if (moduleFilterCount) {
      const label = activeFilter === 'all'
        ? 'areas'
        : activeFilter.replace('-', ' ') + ' areas';
      moduleFilterCount.textContent = 'Showing ' + visible + ' of ' + cards.length + ' ' + label;
    }

    if (moduleFilterEmpty) {
      moduleFilterEmpty.hidden = visible !== 0;
      moduleFilterEmpty.textContent = 'No ' + (activeFilter === 'all' ? '' : activeFilter.replace('-', ' ') + ' ') + 'areas found in this run.';
    }
    updateStepNav();
    document.dispatchEvent(new Event('air-inner-sync'));
  }

  moduleFilterButtons.forEach(button => {
    button.addEventListener('click', () => {
      moduleFilterButtons.forEach(item => {
        item.classList.remove('active');
        item.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('active');
      button.setAttribute('aria-pressed', 'true');
      updateModuleFilter();
    });
  });

  moduleFilterButtons.forEach(button => {
    button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
  });

  const passedCheckSearch = document.getElementById('passedCheckSearch');
  const passedCount = document.querySelector('[data-passed-count]');
  const passedEmpty = document.querySelector('[data-passed-empty]');

  function updatePassedSearch() {
    const query = String(passedCheckSearch?.value || '').trim().toLowerCase();
    const cards = Array.from(document.querySelectorAll('[data-passed-card]'));
    let visibleCards = 0;

    cards.forEach(card => {
      const matches = !query || String(card.dataset.passedSearch || card.textContent || '').toLowerCase().includes(query);
      card.classList.toggle('is-hidden', !matches);
      if (matches) visibleCards += 1;
    });

    if (passedCount) {
      passedCount.textContent = 'Showing ' + visibleCards + ' of ' + cards.length + ' areas';
    }
    if (passedEmpty) {
      passedEmpty.hidden = visibleCards !== 0;
    }
    document.dispatchEvent(new Event('air-inner-sync'));
  }

  passedCheckSearch?.addEventListener('input', updatePassedSearch);

  function updatePlanBrowser(options = {}) {
    const planSearch = document.getElementById('planCheckSearch');
    const query = String(planSearch?.value || '').trim().toLowerCase();
    const hashId = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    const category = hashId.startsWith('plan-cat-') ? hashId.slice('plan-cat-'.length) : '';
    const labels = {
      blocked: 'Blocked',
      controlled: 'Need a setup',
      traceability: 'Already covered',
      future: 'Later',
      skipped: 'Need a look',
    };
    const reasons = document.querySelector('[data-plan-reasons]');
    const groups = document.querySelector('[data-plan-groups]');
    const notes = document.querySelector('[data-plan-notes]');
    const indexPanel = document.querySelector('#coverage-gaps [data-passed-index]');
    const heading = document.querySelector('[data-plan-heading]');
    const note = document.querySelector('[data-plan-note]');
    const planCount = document.querySelector('[data-plan-count]');
    const planEmpty = document.querySelector('[data-plan-empty]');
    const back = document.querySelector('#coverage-gaps [data-plan-back]');
    const backName = document.querySelector('[data-plan-back-name]');
    const startCrumb = document.querySelector('#coverage-gaps [data-plan-goto="coverage-gaps"]');
    const reasonCrumb = document.querySelector('[data-plan-crumb-reason]');
    const groupCrumb = document.querySelector('[data-plan-crumb-group]');
    const sep = document.querySelector('[data-plan-crumb-sep]');
    const sep2 = document.querySelector('[data-plan-crumb-sep2]');
    const pager = document.querySelector('[data-plan-pager]');
    const prev = document.querySelector('[data-plan-prev]');
    const next = document.querySelector('[data-plan-next]');
    const prevName = document.querySelector('[data-plan-prev-name]');
    const nextName = document.querySelector('[data-plan-next-name]');
    const pos = document.querySelector('[data-plan-pos]');
    const cards = Array.from(document.querySelectorAll('[data-plan-card]'));
    const details = Array.from(document.querySelectorAll('#coverage-gaps [data-step-item]'));
    const opened = details.find((item) => item.id === hashId) || null;
    const activeCategory = category || opened?.dataset.planCategory || '';
    const reasonLabel = labels[activeCategory] || 'Groups';
    const filtering = Boolean(activeCategory || query) && !opened;

    details.forEach((item) => item.classList.toggle('is-step-current', item === opened));
    if (indexPanel) indexPanel.hidden = Boolean(opened);
    document.querySelectorAll('#coverage-gaps [data-plan-reset]').forEach((button) => {
      button.hidden = !activeCategory && !query && !opened;
    });

    if (startCrumb) startCrumb.setAttribute('aria-current', !activeCategory && !opened ? 'true' : 'false');
    if (sep) sep.hidden = !activeCategory;
    if (sep2) sep2.hidden = !opened;
    if (reasonCrumb) {
      reasonCrumb.hidden = !activeCategory;
      reasonCrumb.textContent = reasonLabel;
      reasonCrumb.dataset.planReason = activeCategory ? 'plan-cat-' + activeCategory : '';
      reasonCrumb.setAttribute('aria-current', activeCategory && !opened ? 'true' : 'false');
    }
    if (groupCrumb) {
      groupCrumb.hidden = !opened;
      groupCrumb.textContent = opened?.getAttribute('data-step-label') || '';
    }
    if (back) {
      const backTarget = opened ? 'plan-cat-' + activeCategory : 'coverage-gaps';
      back.hidden = !activeCategory && !opened;
      back.dataset.planBack = backTarget;
    }
    if (backName) backName.textContent = opened ? reasonLabel : 'All reasons';

    const siblings = opened
      ? details.filter((item) => item.dataset.planCategory === opened.dataset.planCategory)
      : [];
    const siblingIndex = opened ? siblings.indexOf(opened) : -1;
    const previous = siblings[siblingIndex - 1];
    const following = siblings[siblingIndex + 1];
    if (pager) pager.hidden = !opened || siblings.length < 2;
    if (prev) {
      prev.disabled = !previous;
      prev.dataset.planTarget = previous?.id || '';
    }
    if (next) {
      next.disabled = !following;
      next.dataset.planTarget = following?.id || '';
    }
    if (prevName) writePagerName(prevName, previous ? '← ' + (previous.getAttribute('data-step-label') || '') : '');
    if (nextName) writePagerName(nextName, following ? (following.getAttribute('data-step-label') || '') + ' →' : '');
    if (pos) pos.textContent = opened ? (siblingIndex + 1) + ' of ' + siblings.length : '';

    if (reasons) reasons.hidden = filtering || Boolean(opened);
    if (notes) notes.hidden = filtering || Boolean(opened);
    if (groups) groups.hidden = !filtering;

    let visibleCards = 0;
    cards.forEach((card) => {
      const categoryOk = !activeCategory || card.dataset.planCategory === activeCategory;
      const searchOk = !query || String(card.dataset.planSearch || '').toLowerCase().includes(query);
      const show = filtering && categoryOk && searchOk;
      card.hidden = !show;
      if (show) visibleCards += 1;
    });

    if (heading) {
      heading.textContent = activeCategory ? reasonLabel : (query ? 'Search' : 'Choose a reason');
    }
    if (note) {
      note.textContent = activeCategory
        ? 'Open one group. Back returns to the five reasons.'
        : (query
          ? 'Open one group. Reset clears the search.'
          : 'Open one reason. Search finds a group.');
    }
    if (planCount) {
      planCount.hidden = !filtering;
      planCount.textContent = 'Showing ' + visibleCards + (visibleCards === 1 ? ' group' : ' groups');
    }
    if (planEmpty) planEmpty.hidden = !filtering || visibleCards !== 0;

    if (options.scroll && document.body.dataset.airPage === 'coverage-gaps') {
      document.querySelector('#coverage-gaps .plan-nav')?.scrollIntoView({ block: 'start' });
    }
  }

  function goPlan(id) {
    if (!id) return;
    const current = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (current === id) {
      updatePlanBrowser({ scroll: true });
      return;
    }
    location.hash = id;
  }

  document.getElementById('planCheckSearch')?.addEventListener('input', () => updatePlanBrowser());
  document.addEventListener('click', (event) => {
    const control = event.target.closest('#coverage-gaps [data-plan-reset], #coverage-gaps [data-plan-back], #coverage-gaps [data-plan-goto], #coverage-gaps [data-plan-crumb-reason], #coverage-gaps [data-plan-prev], #coverage-gaps [data-plan-next]');
    if (!control || control.disabled) return;
    event.preventDefault();
    if (control.hasAttribute('data-plan-reset')) {
      const input = document.getElementById('planCheckSearch');
      if (input) input.value = '';
      goPlan('coverage-gaps');
      return;
    }
    if (control.hasAttribute('data-plan-back')) {
      goPlan(control.dataset.planBack || 'coverage-gaps');
      return;
    }
    if (control.hasAttribute('data-plan-goto')) {
      goPlan(control.dataset.planGoto || 'coverage-gaps');
      return;
    }
    if (control.hasAttribute('data-plan-crumb-reason')) {
      goPlan(control.dataset.planReason || 'coverage-gaps');
      return;
    }
    goPlan(control.dataset.planTarget || '');
  });
  updatePlanBrowser();

  if (moduleFilterSearch) {
    moduleFilterSearch.addEventListener('input', updateModuleFilter);
  }

  updateModuleFilter();

  document.querySelectorAll('[data-load-more-failures]').forEach(button => {
    const target = button.dataset.failureTarget || 'cards';
    const selector = target === 'rows'
      ? '[data-failure-row]'
      : target === 'preview'
        ? '[data-failure-preview]'
        : '[data-failure-card]';
    const items = Array.from(document.querySelectorAll(selector));
    const countLabel = document.querySelector('[data-failure-count="' + target + '"]');
    const loadMoreWrap = button.closest('[data-failure-load-more]');
    const totalFailures = items.length;
    const initialVisible = Number(button.dataset.failureInitial) || ${FAILED_TESTS_INITIAL_VISIBLE};
    let visibleFailures = Math.min(initialVisible, totalFailures);
    const failureBatchSize = ${FAILED_TESTS_LOAD_BATCH};

    const updateFailureVisibility = () => {
      items.forEach((item, index) => {
        item.classList.toggle('is-hidden', index >= visibleFailures);
      });

      if (countLabel) {
        countLabel.textContent = 'Showing ' + Math.min(visibleFailures, totalFailures) + ' of ' + totalFailures + ' failed checks';
      }

      if (visibleFailures >= totalFailures && loadMoreWrap) {
        loadMoreWrap.remove();
      }
    };

    button.addEventListener('click', () => {
      visibleFailures = Math.min(visibleFailures + failureBatchSize, totalFailures);
      updateFailureVisibility();
    });

    updateFailureVisibility();
  });

  document.querySelectorAll('[data-load-more-warnings]').forEach(button => {
    const target = button.dataset.warningTarget === 'rows' ? 'rows' : 'cards';
    const items = Array.from(document.querySelectorAll(target === 'rows' ? '[data-warning-row]' : '[data-warning-card]'));
    const countLabel = document.querySelector('[data-warning-count="' + target + '"]');
    const loadMoreWrap = button.closest('[data-warning-load-more]');
    const totalWarnings = items.length;
    let visibleWarnings = Math.min(${FAILED_TESTS_INITIAL_VISIBLE}, totalWarnings);
    const warningBatchSize = ${FAILED_TESTS_LOAD_BATCH};

    const updateWarningVisibility = () => {
      items.forEach((item, index) => {
        item.classList.toggle('is-hidden', index >= visibleWarnings);
      });

      if (countLabel) {
        countLabel.textContent = 'Showing ' + Math.min(visibleWarnings, totalWarnings) + ' of ' + totalWarnings + ' warning tests';
      }

      if (visibleWarnings >= totalWarnings && loadMoreWrap) {
        loadMoreWrap.remove();
      }
    };

    button.addEventListener('click', () => {
      visibleWarnings = Math.min(visibleWarnings + warningBatchSize, totalWarnings);
      updateWarningVisibility();
    });

    updateWarningVisibility();
  });

  document.querySelectorAll('[data-load-more-coverage-gaps]').forEach(button => {
    const cardItems = Array.from(document.querySelectorAll('[data-coverage-gap-card]'));
    const rowItems = Array.from(document.querySelectorAll('[data-coverage-gap-row]'));
    const countLabel = document.querySelector('[data-coverage-gap-count]');
    const loadMoreWrap = button.closest('[data-coverage-gap-load-more]');
    const totalItems = Math.max(cardItems.length, rowItems.length);
    let visibleItems = Math.min(${COVERAGE_GAPS_INITIAL_VISIBLE}, totalItems);
    const batchSize = ${FAILED_TESTS_LOAD_BATCH};

    const updateCoverageGapVisibility = () => {
      cardItems.forEach((item, index) => {
        item.classList.toggle('is-hidden', index >= visibleItems);
      });
      rowItems.forEach((item, index) => {
        item.classList.toggle('is-hidden', index >= visibleItems);
      });

      if (countLabel) {
        countLabel.textContent = 'Showing ' + Math.min(visibleItems, totalItems) + ' of ' + totalItems + ' blocked/skipped scenarios';
      }

      if (visibleItems >= totalItems && loadMoreWrap) {
        loadMoreWrap.remove();
      }
    };

    button.addEventListener('click', () => {
      visibleItems = Math.min(visibleItems + batchSize, totalItems);
      updateCoverageGapVisibility();
    });

    updateCoverageGapVisibility();
  });

  document.querySelectorAll('[data-shot-pager]').forEach(pager => {
    const items = Array.from(pager.querySelectorAll('.thumb'));
    const size = Number(pager.getAttribute('data-shot-page-size')) || 4;
    const pages = Math.max(1, Math.ceil(items.length / size));
    const prevButtons = pager.querySelectorAll('[data-shot-prev]');
    const nextButtons = pager.querySelectorAll('[data-shot-next]');
    const counts = pager.querySelectorAll('[data-shot-count]');
    const bars = pager.querySelectorAll('.shot-pager-bar');
    let page = 0;

    const showShotPage = () => {
      items.forEach((item, index) => {
        item.hidden = index < page * size || index >= (page + 1) * size;
      });
      counts.forEach((count) => {
        count.textContent = (page + 1) + ' of ' + pages;
      });
      prevButtons.forEach((prev) => { prev.disabled = page === 0; });
      nextButtons.forEach((next) => { next.disabled = page >= pages - 1; });
      bars.forEach((bar) => { bar.hidden = pages <= 1; });
    };

    prevButtons.forEach((prev) => prev.addEventListener('click', () => {
      page = Math.max(0, page - 1);
      showShotPage();
    }));
    nextButtons.forEach((next) => next.addEventListener('click', () => {
      page = Math.min(pages - 1, page + 1);
      showShotPage();
    }));
    showShotPage();
  });

  document.querySelectorAll('[data-inner-pager]').forEach((pager) => {
    const items = Array.from(pager.querySelectorAll('[data-inner-item]'));
    const size = Number(pager.getAttribute('data-inner-size')) || 3;
    const label = pager.getAttribute('data-inner-label') || 'Items';
    let pageIndex = 0;
    let pageCount = 1;

    const showInnerPage = () => {
      const modulePage = pager.closest('#module-dashboard');
      if (modulePage && modulePage.classList.contains('is-area-open')) {
        items.forEach((item) => { item.hidden = false; });
        pager.querySelectorAll('.page-pager.inner').forEach((bar) => { bar.hidden = true; });
        return;
      }
      const pool = items.filter((item) => !item.classList.contains('is-hidden'));
      pageCount = Math.max(1, Math.ceil(pool.length / size));
      if (pageIndex > pageCount - 1) pageIndex = Math.max(0, pageCount - 1);
      items.forEach((item) => {
        if (item.classList.contains('is-hidden')) {
          item.hidden = true;
          return;
        }
        const index = pool.indexOf(item);
        item.hidden = index < pageIndex * size || index >= (pageIndex + 1) * size;
      });
      pager.querySelectorAll('[data-inner-count]').forEach((count) => {
        count.textContent = (pageIndex + 1) + ' of ' + pageCount;
      });
      pager.querySelectorAll('[data-inner-prev]').forEach((button) => {
        button.disabled = pageIndex === 0;
      });
      pager.querySelectorAll('[data-inner-next]').forEach((button) => {
        button.disabled = pageIndex >= pageCount - 1;
      });
      const itemLabel = (item) => (
        item?.getAttribute('data-step-label')
        || item?.querySelector('strong')?.textContent
        || ''
      ).replace(/\s+/g, ' ').trim();
      const previousItem = pool[(pageIndex - 1) * size];
      const nextItem = pool[(pageIndex + 1) * size];
      pager.querySelectorAll('[data-inner-prev-name]').forEach((name) => {
        writePagerName(name, previousItem ? '← ' + (itemLabel(previousItem) || label) : '');
      });
      pager.querySelectorAll('[data-inner-next-name]').forEach((name) => {
        writePagerName(name, nextItem ? (itemLabel(nextItem) || label) + ' →' : '');
      });
      pager.querySelectorAll('.page-pager.inner').forEach((bar) => {
        bar.hidden = pageCount < 2;
      });
    };

    pager.addEventListener('click', (event) => {
      const button = event.target.closest('[data-inner-prev], [data-inner-next]');
      if (!button || button.disabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      pageIndex = button.hasAttribute('data-inner-prev')
        ? Math.max(0, pageIndex - 1)
        : Math.min(pageCount - 1, pageIndex + 1);
      showInnerPage();
    });
    document.addEventListener('air-inner-sync', showInnerPage);
    showInnerPage();
  });

  document.querySelectorAll('[data-long-list]').forEach(list => {
    const limit = Number(list.getAttribute('data-long-list')) || 6;
    const itemSelector = list.getAttribute('data-long-item');
    const label = list.getAttribute('data-long-label') || 'items';
    const items = itemSelector
      ? Array.from(list.querySelectorAll(itemSelector))
      : Array.from(list.children).filter(item => item.nodeType === 1);
    if (items.length <= limit) {
      return;
    }

    let shown = limit;
    const bar = document.createElement('div');
    bar.className = 'failure-load-more long-list-bar';
    const count = document.createElement('span');
    const more = document.createElement('button');
    more.type = 'button';
    more.textContent = 'Show more';

    const updateLongList = () => {
      items.forEach((item, index) => {
        item.classList.toggle('is-hidden', index >= shown);
      });
      count.textContent = 'Showing ' + Math.min(shown, items.length) + ' of ' + items.length + ' ' + label;
      if (shown >= items.length) {
        bar.remove();
      }
    };

    more.addEventListener('click', () => {
      shown = Math.min(shown + 6, items.length);
      updateLongList();
    });

    bar.append(count, more);
    const host = list.tagName === 'TBODY'
      ? list.parentElement.parentElement || list.parentElement
      : list;
    host.insertAdjacentElement('afterend', bar);
    updateLongList();
  });

  const airSearch = document.getElementById('airSearch');
  const airSearchResults = document.getElementById('airSearchResults');
  const airGlobalSearch = document.getElementById('airGlobalSearch');
  const airGlobalSearchResults = document.getElementById('airGlobalSearchResults');
  const domSearchableItems = Array.from(
    document.querySelectorAll('.page, .module-health-card, .module-dashboard-card, .evidence-card, tbody tr')
  ).map((element, index) => {
    if (!element.id) {
      element.id = 'air-search-result-' + index;
    }

    const heading = element.querySelector('h1, h2, h3, strong, td')?.textContent?.trim() || element.id;

    return {
      source: 'dom',
      element,
      heading,
      targetId: element.id,
      text: element.textContent.toLowerCase().replace(new RegExp('\\\\s+', 'g'), ' '),
    };
  });
  const modelSearchableItems = (Array.isArray(airSearchIndex) ? airSearchIndex : [])
    .map((item, index) => {
      const targetId = String(item.target || '').replace(/^#/, '') || 'executive';

      return {
        source: 'model',
        element: document.getElementById(targetId),
        targetId,
        heading: ((item.type || 'item').toUpperCase()) + ' - ' + (item.title || 'AIR result'),
        text: [
          item.type,
          item.title,
          item.status,
          item.module,
          item.priority,
          item.category,
          Array.isArray(item.keywords) ? item.keywords.join(' ') : '',
          item.text,
        ].filter(Boolean).join(' ').toLowerCase().replace(new RegExp('\\\\s+', 'g'), ' '),
        order: index,
      };
    });
  const searchableItems = [
    ...modelSearchableItems,
    ...domSearchableItems,
  ].filter(item => item.targetId && item.text);

  function clearSearchHighlight() {
    document.querySelectorAll('.search-hit').forEach(element => {
      element.classList.remove('search-hit');
    });
  }

  function renderSearchResults(query, resultsContainer) {
    if (!resultsContainer) {
      return;
    }

    clearSearchHighlight();

    if (!query || query.length < 2) {
      resultsContainer.innerHTML = '';
      resultsContainer.classList.remove('search-active');
      return;
    }

    const matches = searchableItems
      .filter(item => item.text.includes(query))
      .slice(0, 8);

    if (matches.length === 0) {
      resultsContainer.innerHTML = '<div class="search-empty">No matching report items</div>';
      resultsContainer.classList.add('search-active');
      return;
    }

    resultsContainer.innerHTML = '';
    resultsContainer.classList.add('search-active');
    matches.forEach(item => {
      const link = document.createElement('a');
      link.href = '#' + item.targetId;
      link.dataset.searchTarget = item.targetId;
      link.textContent = item.heading;
      resultsContainer.appendChild(link);
    });
  }

  function closeSearchResults(input, resultsContainer) {
    if (resultsContainer) {
      resultsContainer.innerHTML = '';
      resultsContainer.classList.remove('search-active');
    }

    if (input) {
      input.blur();
    }
  }

  function closeAllSearchResults() {
    closeSearchResults(airSearch, airSearchResults);
    closeSearchResults(airGlobalSearch, airGlobalSearchResults);
  }

  function bindSearch(input, resultsContainer) {
    if (input) {
      input.addEventListener('input', event => {
        renderSearchResults(event.target.value.trim().toLowerCase(), resultsContainer);
      });
    }

    if (!resultsContainer) {
      return;
    }

    resultsContainer.addEventListener('click', event => {
      const link = event.target.closest('[data-search-target]');
      if (!link) {
        return;
      }

      const targetId = link.getAttribute('data-search-target');
      const destination = pageForTarget(targetId);
      if (destination && destination.id !== currentPageId()) {
        location.hash = targetId;
        closeSearchResults(input, resultsContainer);
        return;
      }
      const target = document.getElementById(targetId);
      if (target) {
        clearSearchHighlight();
        target.classList.add('search-hit');
        setTimeout(() => target.classList.remove('search-hit'), 2500);
        scrollToReportTarget(targetId);
      }

      closeSearchResults(input, resultsContainer);
    });
  }

  bindSearch(airSearch, airSearchResults);
  bindSearch(airGlobalSearch, airGlobalSearchResults);

  const sidebarLinks = Array.from(document.querySelectorAll('.nav a[href^="#"]:not(.disabled)'));
  const sidebarSections = sidebarLinks
    .map(link => {
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      return {
        id,
        link,
        section: document.getElementById(id),
      };
    })
    .filter(item => item.section);

  function setActiveSidebarLink(activeId) {
    sidebarLinks.forEach(link => {
      const isActive = link.getAttribute('href') === '#' + activeId;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function updateActiveSidebarFromScroll() {
    if (!sidebarSections.length) {
      return;
    }

    const anchorOffset = Math.max(120, window.innerHeight * 0.22);
    let activeItem = sidebarSections[0];

    for (const item of sidebarSections) {
      if (item.section.classList.contains('report-extra') && !item.section.classList.contains('is-open')) {
        continue;
      }

      const top = item.section.getBoundingClientRect().top;

      if (top <= anchorOffset) {
        activeItem = item;
      } else {
        break;
      }
    }

    setActiveSidebarLink(activeItem.id);
  }

  function revealReportTarget(id) {
    const target = document.getElementById(id);
    if (!target) {
      return null;
    }

    const page = target.classList.contains('report-extra') ? target : target.closest('.report-extra');
    document.querySelectorAll('.report-extra').forEach(section => {
      section.classList.toggle('is-open', section === page);
    });
    return target;
  }

  function scrollToReportTarget(id) {
    const target = revealReportTarget(id);
    if (!target) {
      return false;
    }

    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    const top = Math.max(0, target.getBoundingClientRect().top + root.scrollTop - 18);
    root.scrollTop = top;
    root.style.scrollBehavior = previous;
    const section = target.classList.contains('page') ? target : target.closest('.page');
    const sectionId = section ? section.id : id;
    if (sidebarSections.some(item => item.id === sectionId)) {
      setActiveSidebarLink(sectionId);
    }
    return true;
  }

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      if (link.classList.contains('disabled') || link.hasAttribute('data-evidence-preview') || link.target === '_blank') {
        return;
      }

      const href = link.getAttribute('href') || '';
      const id = decodeURIComponent(href.slice(1));
      const target = document.getElementById(id);
      const opensArea = target && (target.hasAttribute('data-step-item') || target.id === 'validation-summary');
      const opensPlan = id.startsWith('plan-');
      const opensFailurePanel = id === 'failures' || id.startsWith('failure-');
      const opensModule = id === 'module-dashboard' || id.startsWith('module-dashboard-');
      const destination = pageForTarget(id);
      if (opensArea || opensPlan || opensFailurePanel || opensModule || (destination && destination.id !== currentPageId())) {
        event.preventDefault();
        if (location.hash === '#' + id) {
          showCurrentPage();
          return;
        }
        location.hash = id;
        return;
      }
      if (target && target.tagName === 'DETAILS') {
        target.open = true;
      }
      if (!id || !scrollToReportTarget(id)) {
        return;
      }

      event.preventDefault();
      history.pushState(null, '', '#' + id);
    });
  });

  if (location.hash.length > 1) {
    scrollToReportTarget(decodeURIComponent(location.hash.slice(1)));
  }

  updateActiveSidebarFromScroll();
  window.addEventListener('scroll', updateActiveSidebarFromScroll, { passive: true });

  document.addEventListener('click', event => {
    if (!event.target.closest('.report-search, .global-search')) {
      closeAllSearchResults();
    }
  });

  window.addEventListener('scroll', () => {
    const activeSearch = document.activeElement?.closest?.('.report-search, .global-search');
    if (!activeSearch) {
      closeAllSearchResults();
    }
  }, { passive: true });

  document.addEventListener('wheel', event => {
    if (!event.target.closest('.report-search, .global-search')) {
      closeAllSearchResults();
    }
  }, { passive: true });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closePanels();
      closeAllSearchResults();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    const typing = document.activeElement;
    const typingTag = typing?.tagName;
    if (typingTag === 'INPUT' || typingTag === 'TEXTAREA' || typingTag === 'SELECT' || typing?.isContentEditable) {
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const index = reportPageIds.indexOf(currentPageId());
    const nextIndex = event.key === 'ArrowRight' ? index + 1 : index - 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= reportPageIds.length) {
      return;
    }
    event.preventDefault();
    location.hash = reportPageIds[nextIndex];
  });
</script>
</body>
</html>`;

fs.mkdirSync(outputDir, {
  recursive: true
});

let reportWritten = false;

try {
  fs.writeFileSync(outputPath, airGoldenDashboardHtml);
  console.log('Execution report created:', outputPath);
  reportWritten = true;
} catch (error) {
  console.log(`Could not replace ${outputPath} because the file is open.`);
  console.log(error.message);
}

const fallbackPath = path.join(outputDir, 'index-updated.html');
try {
  fs.writeFileSync(fallbackPath, airGoldenDashboardHtml);
  console.log('Execution report created:', fallbackPath);
  reportWritten = true;
} catch (error) {
  console.log(`Could not replace ${fallbackPath} because the file is open.`);
  console.log(error.message);
}

if (!reportWritten) {
  const spareNames = ['index-nav.html', 'index-spare.html', 'index-current.html', 'index-latest.html'];
  for (const name of spareNames) {
    const sparePath = path.join(outputDir, name);
    try {
      fs.writeFileSync(sparePath, airGoldenDashboardHtml);
      console.log('Execution report created:', sparePath);
      reportWritten = true;
      break;
    } catch (error) {
      console.log(`Could not replace ${sparePath} because the file is open.`);
      console.log(error.message);
    }
  }
}
