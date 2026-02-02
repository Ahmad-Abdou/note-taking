/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const v8toIstanbul = require('v8-to-istanbul');
const { createCoverageMap } = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const COVERAGE_DIR = path.join(process.cwd(), 'test-results', 'v8-coverage');
const OUT_DIR = path.join(process.cwd(), 'test-results', 'coverage');

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
}

function extensionUrlToLocalPath(url) {
  try {
    if (!url.startsWith('chrome-extension://')) return null;
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname || '');
    const rel = p.replace(/^\//, '');
    if (!rel) return null;
    return path.join(process.cwd(), rel);
  } catch {
    return null;
  }
}

function shouldIncludeFile(localPath) {
  if (!localPath) return false;
  if (!fs.existsSync(localPath)) return false;

  const rel = path.relative(process.cwd(), localPath).replace(/\\/g, '/');

  // Only include extension/app source, not node_modules
  if (rel.startsWith('node_modules/')) return false;
  if (rel.startsWith('test-results/')) return false;
  // Exclude vendored/minified code from coverage metrics
  if (rel.includes('/lib/pdfjs/')) return false;
  if (rel.includes('/pdf-reader/lib/pdfjs/')) return false;
  if (rel.endsWith('.min.js')) return false;
  if (!rel.endsWith('.js')) return false;

  return true;
}

async function convertV8ToIstanbul(v8Entries) {
  const map = createCoverageMap({});

  for (const entry of v8Entries) {
    const localPath = extensionUrlToLocalPath(entry.url);
    if (!shouldIncludeFile(localPath)) continue;

    try {
      const converter = v8toIstanbul(localPath, 0, { source: fs.readFileSync(localPath, 'utf8') });
      await converter.load();
      converter.applyCoverage(entry.functions);
      const ist = converter.toIstanbul();
      map.merge(ist);
    } catch (e) {
      // Skip scripts that can't be converted
    }
  }

  return map;
}

async function main() {
  const files = listJsonFiles(COVERAGE_DIR);
  if (files.length === 0) {
    console.error('No raw V8 coverage found. Run `npm run test:coverage` first.');
    process.exitCode = 1;
    return;
  }

  const allV8 = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const jsCoverage = data.jsCoverage || [];
      for (const entry of jsCoverage) {
        allV8.push(entry);
      }
    } catch {
      // ignore
    }
  }

  const coverageMap = await convertV8ToIstanbul(allV8);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const context = libReport.createContext({
    dir: OUT_DIR,
    coverageMap,
  });

  // Console summary
  reports.create('text-summary').execute(context);
  // HTML report
  reports.create('html').execute(context);
  // Machine-readable outputs (for tracking and tooling)
  reports.create('json-summary').execute(context);
  reports.create('json').execute(context);
  reports.create('lcovonly').execute(context);

  console.log(`\nCoverage report written to: ${path.relative(process.cwd(), OUT_DIR)}`);
  console.log('Open: test-results/coverage/index.html');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
