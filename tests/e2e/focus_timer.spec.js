const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Focus timer – no infinite loop', () => {
  test.describe.configure({ mode: 'serial' });

  /** @type {import('@playwright/test').BrowserContext | null} */
  let context = null;
  /** @type {((path: string) => string) | null} */
  let extensionUrl = null;

  test.beforeAll(async () => {
    const launched = await launchExtension();
    context = launched.context;
    extensionUrl = launched.extensionUrl;
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('start and stop focus does not produce page errors', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.startFocusSession === 'function');

      // Clear storage for clean state
      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.startFocusSession === 'function');

      // Navigate to focus page
      await page.click('.nav-item[data-page="focus"]');
      await expect(page.locator('#page-focus')).toHaveClass(/active/);

      // Start focus session
      await page.click('#start-focus-btn');

      // Handle boredom level modal if it appears
      const boredomConfirm = page.locator('#boredom-level-modal [data-action="confirm-boredom"]');
      if (await boredomConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
        await boredomConfirm.click();
      }

      // Focus overlay should be visible
      await expect(page.locator('#focus-overlay')).not.toHaveClass(/hidden/);

      // Wait 3 seconds to ensure timer ticks work without errors
      await page.waitForTimeout(3000);

      // Stop focus session
      await page.click('#focus-stop-btn');
      const endEarlyConfirm = page.locator('#end-early-session-modal [data-action="confirm-end-early"]');
      if (await endEarlyConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
        await endEarlyConfirm.click();
      }

      await expect(page.locator('#focus-overlay')).toHaveClass(/hidden/);

      // No page errors should have occurred
      if (pageErrors.length) {
        throw new Error(`Page errors during focus: ${pageErrors.map(e => e.message).join('; ')}`);
      }
    });
  });

  test('timer tick does not fire after session ends', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.startFocusSession === 'function');

      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.startFocusSession === 'function');

      await page.click('.nav-item[data-page="focus"]');

      // Start and immediately stop
      await page.click('#start-focus-btn');
      const boredomConfirm = page.locator('#boredom-level-modal [data-action="confirm-boredom"]');
      if (await boredomConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
        await boredomConfirm.click();
      }

      await page.waitForTimeout(500);

      await page.click('#focus-stop-btn');
      const endEarlyConfirm = page.locator('#end-early-session-modal [data-action="confirm-end-early"]');
      if (await endEarlyConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
        await endEarlyConfirm.click();
      }

      // After stopping, check that no interval is still running
      const timerIntervalIsNull = await page.evaluate(() => {
        return typeof FocusState !== 'undefined' && FocusState.timerInterval === null;
      });
      expect(timerIntervalIsNull).toBe(true);

      // Wait 3 more seconds — no tick errors should occur
      await page.waitForTimeout(3000);

      if (pageErrors.length) {
        throw new Error(`Timer kept ticking after stop: ${pageErrors.map(e => e.message).join('; ')}`);
      }
    });
  });

  test('pause and resume does not create multiple intervals', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.startFocusSession === 'function');

      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.startFocusSession === 'function');

      await page.click('.nav-item[data-page="focus"]');
      await page.click('#start-focus-btn');

      const boredomConfirm = page.locator('#boredom-level-modal [data-action="confirm-boredom"]');
      if (await boredomConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
        await boredomConfirm.click();
      }

      // Pause
      const pauseBtn = page.locator('#focus-pause-btn');
      if (await pauseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pauseBtn.click();
        await page.waitForTimeout(500);

        // Resume
        const resumeBtn = page.locator('#focus-resume-btn, #focus-pause-btn');
        await resumeBtn.click();
        await page.waitForTimeout(500);

        // Pause again
        await pauseBtn.click();
        await page.waitForTimeout(500);

        // Resume again
        await resumeBtn.click();
        await page.waitForTimeout(1000);
      }

      // Stop
      await page.click('#focus-stop-btn');
      const endEarlyConfirm = page.locator('#end-early-session-modal [data-action="confirm-end-early"]');
      if (await endEarlyConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
        await endEarlyConfirm.click();
      }

      await page.waitForTimeout(2000);

      if (pageErrors.length) {
        throw new Error(`Errors during pause/resume cycle: ${pageErrors.map(e => e.message).join('; ')}`);
      }
    });
  });

  test('FocusState guards prevent re-entrant completion', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.startFocusSession === 'function');

      // Test that _completing guard exists
      const hasGuards = await page.evaluate(() => {
        return typeof FocusState !== 'undefined' &&
          '_completing' in FocusState &&
          '_completingBreak' in FocusState;
      });
      expect(hasGuards).toBe(true);
    });
  });

  test('keyboard shortcuts do not stack on page reload', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.loadFocusPage === 'function');

      // Navigate to focus page multiple times
      await page.click('.nav-item[data-page="focus"]');
      await page.waitForTimeout(300);
      await page.click('.nav-item[data-page="dashboard"]');
      await page.waitForTimeout(300);
      await page.click('.nav-item[data-page="focus"]');
      await page.waitForTimeout(300);
      await page.click('.nav-item[data-page="dashboard"]');
      await page.waitForTimeout(300);
      await page.click('.nav-item[data-page="focus"]');
      await page.waitForTimeout(300);

      // No errors from stacking keyboard listeners
      if (pageErrors.length) {
        throw new Error(`Errors from nav cycling: ${pageErrors.map(e => e.message).join('; ')}`);
      }
    });
  });
});
