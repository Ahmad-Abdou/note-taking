const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Focus settings', () => {
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

  test('focus settings persist and auto-start flows honor them', async ({}, testInfo) => {
    test.setTimeout(120_000);

    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.addInitScript(() => {
        window.confirm = () => true;
        window.alert = () => {};
        window.prompt = (_msg, def) => (def ? String(def) : 'test');
      });

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      // Clean slate
      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      // Seed a non-default lastFocusDuration so we can validate auto-continue uses it
      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.set({ lastFocusDuration: 45 }, resolve)));

      // Open focus page
      await page.click('.nav-item[data-page="focus"]');
      await expect(page.locator('#page-focus')).toHaveClass(/active/);

      // Ensure settings controls exist (checkbox inputs are visually hidden by styling)
      await expect(page.locator('#break-duration')).toBeVisible();
      await expect(page.locator('#focus-auto-breaks')).toHaveCount(1);
      await expect(page.locator('#focus-auto-next')).toHaveCount(1);

      // Apply settings via DOM (auto-saves on change)
      await page.evaluate(() => {
        const breakSelect = document.getElementById('break-duration');
        if (breakSelect) {
          breakSelect.value = '10';
          breakSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const autoBreaks = document.getElementById('focus-auto-breaks');
        if (autoBreaks) {
          autoBreaks.checked = true;
          autoBreaks.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const autoNext = document.getElementById('focus-auto-next');
        if (autoNext) {
          autoNext.checked = true;
          autoNext.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      // Verify saved to DataStore settings
      await page.waitForFunction(async () => {
        const s = await window.ProductivityData?.DataStore?.getSettings?.();
        return !!s && s.defaultBreakDuration === 10 && s.autoStartBreaks === true && s.autoStartFocus === true;
      });

      // Reload and verify UI reflects persisted settings
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');
      await page.evaluate(() => window.navigateTo('focus'));
      await expect(page.locator('#page-focus')).toHaveClass(/active/);

      // Ensure focus module initializes and settings are loaded
      await page.waitForFunction(() => typeof window.loadFocusPage === 'function');
      await page.evaluate(async () => {
        try {
          await window.loadFocusPage?.();
        } catch {}
      });

      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.settings);
      await page.waitForFunction(() => FocusState.settings.autoStartBreaks === true && FocusState.settings.autoStartNextSession === true);

      await expect(page.locator('#break-duration')).toHaveValue('10');
      await page.waitForFunction(() => {
        const a = document.getElementById('focus-auto-breaks');
        const n = document.getElementById('focus-auto-next');
        return a?.checked === true && n?.checked === true;
      });

      // Start a session programmatically and force completion without waiting real time
      await page.waitForFunction(() => typeof window.startFocusSession === 'function');
      await page.evaluate(() => {
        window.startFocusSession(25);
      });

      await page.waitForTimeout(250);

      await page.evaluate(async () => {
        // Ensure currentSession exists for completion bookkeeping
        if (typeof FocusState !== 'undefined' && !FocusState.currentSession) {
          FocusState.currentSession = {
            id: `e2e_${Date.now()}`,
            type: 'pomodoro',
            durationMinutes: (typeof FocusState !== 'undefined' ? (FocusState.selectedMinutes || 25) : 25),
            startTime: new Date().toISOString(),
            status: 'in-progress',
          };
        }

        if (typeof FocusState !== 'undefined') {
          FocusState.remainingSeconds = 0;
        }
        await window.completeFocusSession();
      });

      const completeModal = page.locator('#session-complete-modal');
      await expect(completeModal).toBeVisible();

      // Auto-start breaks should kick in after the countdown
      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.isBreak === true, null, { timeout: 10_000 });

      // Completing the break should auto-start a new focus session using lastFocusDuration
      await page.evaluate(async () => {
        await window.completeBreak();
      });

      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.isBreak === false && FocusState.isActive === true);
      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.selectedMinutes === 45);
    });
  });

  test('showSlidingNotification renders as unified toast (with actions)', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.showSlidingNotification === 'function');

      await page.evaluate(() => {
        window.showSlidingNotification({
          type: 'warning',
          title: 'Actionable Reminder',
          message: 'This should use toast UI',
          duration: 5_000,
          actions: [
            {
              label: 'Do It',
              primary: true,
              callback: () => {
                window.__e2e_action_clicked = true;
              }
            }
          ]
        });
      });

      const toast = page.locator('.toast-container .toast').first();
      await expect(toast).toBeVisible();
      await expect(toast).toContainText('Actionable Reminder');
      await expect(toast.locator('.toast-actions .toast-btn', { hasText: 'Do It' })).toBeVisible();

      await toast.locator('.toast-actions .toast-btn', { hasText: 'Do It' }).click();
      await page.waitForFunction(() => window.__e2e_action_clicked === true);
    });
  });
});
