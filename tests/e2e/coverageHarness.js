const fs = require('fs');
const path = require('path');

const COVERAGE_DIR = path.join(process.cwd(), 'test-results', 'v8-coverage');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(name) {
  return String(name)
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function testFileBase(testInfo, suffix = '') {
  let parts = [];
  if (typeof testInfo?.titlePath === 'function') {
    parts = testInfo.titlePath().filter(Boolean);
  } else if (Array.isArray(testInfo?.titlePath)) {
    parts = testInfo.titlePath.filter(Boolean);
  }

  const base = safeName(parts.join(' - ') || testInfo?.title || 'test');
  const worker = typeof testInfo?.workerIndex === 'number' ? `w${testInfo.workerIndex}` : 'w';
  const retry = typeof testInfo?.retry === 'number' ? `r${testInfo.retry}` : 'r0';
  const extra = suffix ? `-${safeName(suffix)}` : '';
  return `${base}-${worker}-${retry}${extra}`;
}

async function runWithPageCoverage(context, testInfo, fn, { suffix } = {}) {
  ensureDir(COVERAGE_DIR);

  const page = await context.newPage();

  // Playwright doesn't expose Puppeteer-style `page.coverage` reliably in all contexts.
  // Use CDP Profiler precise coverage instead (Chromium only).
  /** @type {import('@playwright/test').CDPSession | null} */
  let cdp = null;
  /** @type {string | null} */
  let coverageError = null;
  try {
    cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  } catch (e) {
    // If coverage can't start, we still want the test to run.
    coverageError = e && e.message ? String(e.message) : 'Failed to start precise coverage';
    cdp = null;
  }

  try {
    return await fn(page);
  } finally {
    const outPath = path.join(COVERAGE_DIR, `${testFileBase(testInfo, suffix)}.json`);
    try {
      if (cdp) {
        const { result } = await cdp.send('Profiler.takePreciseCoverage');
        await cdp.send('Profiler.stopPreciseCoverage');
        await cdp.send('Profiler.disable');

        const jsCoverage = (result || [])
          .filter((e) => e && typeof e.url === 'string')
          .map((e) => ({
            url: e.url,
            functions: (e.functions || []).map((f) => ({
              functionName: f.functionName,
              isBlockCoverage: true,
              ranges: (f.ranges || []).map((r) => ({
                startOffset: r.startOffset,
                endOffset: r.endOffset,
                count: r.count,
              })),
            })),
          }));

        fs.writeFileSync(outPath, JSON.stringify({ jsCoverage }, null, 2));
      } else {
        fs.writeFileSync(outPath, JSON.stringify({ jsCoverage: [], error: coverageError }, null, 2));
      }
    } catch (e) {
      // Don't fail the test because coverage capture failed
      try {
        fs.writeFileSync(outPath, JSON.stringify({ jsCoverage: [], error: e && e.message ? String(e.message) : 'Failed to collect coverage' }, null, 2));
      } catch {}
    }

    await page.close().catch(() => {});
  }
}

module.exports = {
  runWithPageCoverage,
  COVERAGE_DIR,
};
