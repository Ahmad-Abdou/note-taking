const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');

function repoRootFromHere(currentDirname) {
  // tests/e2e -> repo root
  return path.resolve(currentDirname, '..', '..');
}

async function launchExtension({ extensionPath } = {}) {
  const extPathRaw = extensionPath || repoRootFromHere(__dirname);
  // Chromium command line parsing is happier with forward slashes on Windows.
  const extPath = extPathRaw.replace(/\\/g, '/');

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-profile-'));

  const launchOptions = {
    // NOTE: Chromium does not reliably support extensions in headless mode.
    headless: false,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-sandbox',
    ],
  };

  // Prefer Chrome if installed. If Chrome won't load the unpacked extension
  // (e.g., enterprise policies), fall back to Playwright's bundled Chromium.
  let context;
  let usedChromeChannel = false;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
      channel: 'chrome',
      // Playwright adds '--disable-extensions' by default; remove it for extension tests.
      ignoreDefaultArgs: ['--disable-extensions'],
    });
    usedChromeChannel = true;
  } catch (e) {
    context = await chromium.launchPersistentContext(userDataDir, launchOptions);
  }

  // Nudge MV3 service worker to start: load a normal page so the content script
  // runs and pings the background via CONTENT_SCRIPT_HELLO.
  try {
    const page = await context.newPage();
    await page.goto('https://example.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.close();
  } catch {
    // ignore
  }

  let extensionId;
  try {
    extensionId = await getExtensionId(context, {
      userDataDir,
      extPathRaw,
      timeoutMs: usedChromeChannel ? 10_000 : 30_000,
    });
  } catch (e) {
    if (!usedChromeChannel) throw e;

    // Chrome was selected but the extension didn't appear; retry with bundled Chromium.
    try { await context.close(); } catch { }

    const retryUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-profile-'));
    context = await chromium.launchPersistentContext(retryUserDataDir, launchOptions);
    extensionId = await getExtensionId(context, { userDataDir: retryUserDataDir, extPathRaw, timeoutMs: 30_000 });
  }

  return { context, extensionId, extensionUrl: (p) => `chrome-extension://${extensionId}${p}` };
}

function normalizeFsPath(p) {
  if (!p) return '';
  try {
    return path.resolve(p).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  } catch {
    return String(p).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  }
}

function getExtensionIdFromPreferences(userDataDir, extPathRaw) {
  const prefCandidates = [
    path.join(userDataDir, 'Default', 'Preferences'),
    path.join(userDataDir, 'Default', 'Secure Preferences'),
    path.join(userDataDir, 'Preferences'),
    path.join(userDataDir, 'Secure Preferences'),
  ];

  const targetPath = normalizeFsPath(extPathRaw);

  for (const prefPath of prefCandidates) {
    try {
      if (!fs.existsSync(prefPath)) continue;
      const raw = fs.readFileSync(prefPath, 'utf8');
      const prefs = JSON.parse(raw);
      const settings = prefs?.extensions?.settings;
      if (!settings || typeof settings !== 'object') continue;

      for (const [extId, info] of Object.entries(settings)) {
        const installedPath = info?.path;
        if (!installedPath) continue;
        if (normalizeFsPath(installedPath) === targetPath) {
          return extId;
        }
      }
    } catch {
      // ignore and keep trying
    }
  }

  return null;
}

async function getExtensionId(context, { userDataDir, extPathRaw, timeoutMs = 30_000 } = {}) {
  // MV3 uses a service worker, but it may start/stop quickly.
  // Prefer waiting for the serviceworker event; fall back to polling.

  const existing = context.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
  if (existing) return new URL(existing.url()).host;

  try {
    const sw = await context.waitForEvent('serviceworker', {
      timeout: timeoutMs,
      predicate: (w) => w.url().startsWith('chrome-extension://'),
    });
    return new URL(sw.url()).host;
  } catch {
    // ignore and fall back to polling
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const workers = context.serviceWorkers();
    const extWorker = workers.find(w => w.url().startsWith('chrome-extension://'));
    if (extWorker) {
      return new URL(extWorker.url()).host;
    }
    await new Promise(r => setTimeout(r, 250));
  }

  // Final fallback: detect extension ID from the persistent profile.
  if (userDataDir && extPathRaw) {
    const extId = getExtensionIdFromPreferences(userDataDir, extPathRaw);
    if (extId) return extId;
  }

  throw new Error('Could not determine extension ID (no extension service worker found)');
}

module.exports = {
  launchExtension,
};
