const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Focus floating widget', () => {
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

  test('start pins floating focus widget and stop unpins it', async ({}, testInfo) => {
    test.setTimeout(90_000);

    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.addInitScript(() => {
        window.confirm = () => true;
        window.alert = () => {};
      });

      await page.goto(extensionUrl('/productivity-desktop/renderer/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      // Reset persisted state so the test starts from a clean session.
      await page.evaluate(() => new Promise(resolve => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      await page.evaluate(() => window.navigateTo('focus'));
      await expect(page.locator('#page-focus')).toHaveClass(/active/);

      await page.evaluate(() => {
        window.__floatingWidgetCalls = [];

        const previous = window.electronAPI?.widgets || {};
        const previousPin = typeof previous.pin === 'function' ? previous.pin.bind(previous) : null;
        const previousUnpin = typeof previous.unpin === 'function' ? previous.unpin.bind(previous) : null;

        window.electronAPI = {
          ...(window.electronAPI || {}),
          widgets: {
            ...previous,
            pin: async (cardId, opts) => {
              window.__floatingWidgetCalls.push({ action: 'pin', cardId, opts });
              if (previousPin) return previousPin(cardId, opts);
              return { success: true };
            },
            unpin: async (cardId) => {
              window.__floatingWidgetCalls.push({ action: 'unpin', cardId });
              if (previousUnpin) return previousUnpin(cardId);
              return { success: true };
            },
            onFocusControl: previous.onFocusControl || (() => () => {}),
            onDataChanged: previous.onDataChanged || (() => () => {}),
            onUnpinned: previous.onUnpinned || (() => () => {}),
            focusControl: previous.focusControl || (() => {})
          }
        };
      });

      await page.evaluate(async () => {
        await window.startFocusSession(10, { skipBoredomPrompt: true });
      });

      await expect
        .poll(async () => {
          return await page.evaluate(() => {
            return Array.isArray(window.__floatingWidgetCalls)
              && window.__floatingWidgetCalls.some(c => c.action === 'pin' && c.cardId === 'focus-session');
          });
        }, { timeout: 8000 })
        .toBe(true);

      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.isActive === true);
      await expect(page.locator('#focus-overlay')).toHaveClass(/hidden/);

      const pinCall = await page.evaluate(() => {
        return (window.__floatingWidgetCalls || []).find(c => c.action === 'pin');
      });

      expect(pinCall).toBeTruthy();
      expect(pinCall.cardId).toBe('focus-session');
      expect(pinCall.opts?.width).toBe(320);

      await page.evaluate(async () => {
        await window.stopFocusSession();
      });

      await expect
        .poll(async () => {
          return await page.evaluate(() => {
            return Array.isArray(window.__floatingWidgetCalls)
              && window.__floatingWidgetCalls.some(c => c.action === 'unpin' && c.cardId === 'focus-session');
          });
        }, { timeout: 8000 })
        .toBe(true);

      await page.waitForFunction(() => typeof FocusState !== 'undefined' && FocusState.isActive === false);
    });
  });

  test('floating focus widget shows extra-time counter with + prefix', async ({}, testInfo) => {
    test.setTimeout(60_000);

    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/productivity-desktop/renderer/widget.html?card=focus-session'), { waitUntil: 'load' });

      await page.evaluate(() => new Promise((resolve) => {
        chrome.storage.local.set({
          focusState: {
            isActive: true,
            isPaused: false,
            isBreak: false,
            isOpenEnded: false,
            isExtraTime: true,
            extraTimeSeconds: 65,
            selectedMinutes: 25,
            remainingSeconds: 0,
            taskTitle: 'Linear Algebra Review'
          }
        }, resolve);
      }));

      await expect
        .poll(async () => (await page.locator('.widget-focus-clock').textContent()) || '', { timeout: 6000 })
        .toContain('+01:05');

      await expect(page.locator('.widget-focus-target')).toContainText('Linear Algebra Review');
    });
  });

  test('break overlay can be minimized back to app', async ({}, testInfo) => {
    test.setTimeout(60_000);

    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.addInitScript(() => {
        window.confirm = () => true;
        window.alert = () => {};
      });

      await page.goto(extensionUrl('/productivity-desktop/renderer/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');
      await page.evaluate(() => window.navigateTo('focus'));

      await page.waitForFunction(() => typeof startBreak === 'function' && typeof FocusState !== 'undefined');

      await page.evaluate(() => {
        FocusState.isActive = false;
        startBreak(1);
      });

      await expect(page.locator('#focus-overlay')).toHaveClass(/break-mode/);

      await page.locator('#focus-minimize-btn').click();

      await expect(page.locator('#focus-overlay')).toHaveClass(/hidden/);
      await expect
        .poll(async () => await page.evaluate(() => FocusState.isOverlayMinimized === true), { timeout: 4000 })
        .toBe(true);
    });
  });
});
