const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Focus overlay controls', () => {
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

  test('pause/resume updates state and timer', async ({}, testInfo) => {
    test.setTimeout(90_000);

    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.addInitScript(() => {
        window.confirm = () => true;
        window.alert = () => {};
      });

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      await page.click('.nav-item[data-page="focus"]');
      await expect(page.locator('#page-focus')).toHaveClass(/active/);

      await page.click('#start-focus-btn');
      const boredomConfirm = page.locator('#boredom-level-modal [data-action="confirm-boredom"]');
      if (await boredomConfirm.isVisible().catch(() => false)) {
        await boredomConfirm.click();
      }
      await expect(page.locator('#focus-overlay')).not.toHaveClass(/hidden/);

      const timeText = page.locator('#focus-time');

      const t1 = await timeText.textContent();
      await page.waitForTimeout(1200);
      const t2 = await timeText.textContent();
      expect(t2).not.toBe(t1);

      await page.click('#focus-pause-btn');
      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.isPaused === true);

      const paused1 = await timeText.textContent();
      await page.waitForTimeout(1200);
      const paused2 = await timeText.textContent();
      expect(paused2).toBe(paused1);

      await page.click('#focus-pause-btn');
      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.isPaused === false);

      await page.waitForTimeout(1200);
      const t3 = await timeText.textContent();
      expect(t3).not.toBe(paused2);

      // Cleanup
      await page.click('#focus-stop-btn');
      const endEarlyConfirm = page.locator('#end-early-session-modal [data-action="confirm-end-early"]');
      if (await endEarlyConfirm.isVisible().catch(() => false)) {
        await endEarlyConfirm.click();
      }
      await expect(page.locator('#focus-overlay')).toHaveClass(/hidden/);
    });
  });

  test('stop shows end-early modal when >1 min elapsed, and ends session', async ({}, testInfo) => {
    test.setTimeout(90_000);

    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.addInitScript(() => {
        window.confirm = () => true;
        window.alert = () => {};
      });

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      await page.click('.nav-item[data-page="focus"]');
      await expect(page.locator('#page-focus')).toHaveClass(/active/);

      await page.click('#start-focus-btn');

      const boredomConfirm = page.locator('#boredom-level-modal [data-action="confirm-boredom"]');
      if (await boredomConfirm.isVisible().catch(() => false)) {
        await boredomConfirm.click();
      }

      await expect(page.locator('#focus-overlay')).not.toHaveClass(/hidden/);

      // Force elapsed >= 1 minute (but not completed)
      await page.evaluate(() => {
        const planned = (FocusState.selectedMinutes || 25) * 60;
        const remaining = Math.max(120, planned - 70);
        FocusState.remainingSeconds = remaining;
        FocusState.endTimestamp = Date.now() + remaining * 1000;
      });

      await page.click('#focus-stop-btn');

      const modal = page.locator('#end-early-session-modal');
      await expect(modal).toBeVisible();
      await modal.locator('[data-action="confirm-end-early"]').click();

      await expect(page.locator('#focus-overlay')).toHaveClass(/hidden/);
      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.isActive === false);
    });
  });

  test('stop during break stops focus mode (does not auto-start next session)', async ({}, testInfo) => {
    test.setTimeout(90_000);

    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.addInitScript(() => {
        window.confirm = () => true;
        window.alert = () => {};
      });

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      await page.click('.nav-item[data-page="focus"]');
      await expect(page.locator('#page-focus')).toHaveClass(/active/);

      await page.click('#start-focus-btn');

      const boredomConfirm = page.locator('#boredom-level-modal [data-action="confirm-boredom"]');
      if (await boredomConfirm.isVisible().catch(() => false)) {
        await boredomConfirm.click();
      }

      await expect(page.locator('#focus-overlay')).not.toHaveClass(/hidden/);

      // Put app into break mode and enable auto-start-next-session (historically made Stop feel broken)
      await page.evaluate(() => {
        FocusState.settings.autoStartNextSession = true;
        FocusState.isActive = true;
        startBreak(1);
      });

      await expect(page.locator('#focus-overlay')).toHaveClass(/break-mode/);

      await page.click('#focus-stop-btn');

      await expect(page.locator('#focus-overlay')).toHaveClass(/hidden/);
      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.isActive === false);

      // Wait a bit to ensure no auto-start happens.
      await page.waitForTimeout(1200);
      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.isActive === false);
    });
  });

  test('restore after reload then stop works', async ({}, testInfo) => {
    test.setTimeout(120_000);

    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.addInitScript(() => {
        window.confirm = () => true;
        window.alert = () => {};
      });

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      await page.click('.nav-item[data-page="focus"]');
      await page.click('#start-focus-btn');

      const boredomConfirm = page.locator('#boredom-level-modal [data-action="confirm-boredom"]');
      if (await boredomConfirm.isVisible().catch(() => false)) {
        await boredomConfirm.click();
      }

      await expect(page.locator('#focus-overlay')).not.toHaveClass(/hidden/);

      // Give storage sync a tick
      await page.waitForTimeout(400);

      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      // Restore prompt should appear on app load, but allow for immediate restore paths.
      await page.waitForFunction(() => {
        const modal = document.getElementById('restore-session-modal');
        const overlay = document.getElementById('focus-overlay');
        return !!modal || (!!overlay && !overlay.classList.contains('hidden'));
      }, null, { timeout: 15_000 });

      const restoreModal = page.locator('#restore-session-modal');
      if (await restoreModal.isVisible().catch(() => false)) {
        await restoreModal.locator('[data-action="restore-session"]').click();
      }

      await expect(page.locator('#focus-overlay')).not.toHaveClass(/hidden/);

      await page.click('#focus-stop-btn');
      const endEarlyConfirm = page.locator('#end-early-session-modal [data-action="confirm-end-early"]');
      if (await endEarlyConfirm.isVisible().catch(() => false)) {
        await endEarlyConfirm.click();
      }

      await expect(page.locator('#focus-overlay')).toHaveClass(/hidden/);
      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.isActive === false);
    });
  });
});
