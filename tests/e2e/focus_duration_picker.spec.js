const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

test.describe('Focus duration picker', () => {
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

  test('task focus opens duration modal and starts timestamp-based session', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      page.on('dialog', (d) => d.accept().catch(() => {}));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.openTaskModal === 'function');

      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.openTaskModal === 'function');

      // Create a task (so we have a focus button)
      await page.click('.hero-action-btn[data-action="task"]');
      await expect(page.locator('#task-modal')).toHaveClass(/active/);

      const title = `E2E Focus Task ${Date.now()}`;
      await page.fill('#task-title', title);
      await page.fill('#task-due-date', ymdLocal(new Date()));
      await page.click('#task-modal button[type="submit"].btn-save');
      await expect(page.locator('#task-modal')).not.toHaveClass(/active/);

      // Navigate to Tasks, get the created task ID, and click Focus
      await page.click('.nav-item[data-page="tasks"]');
      await expect(page.locator('#page-tasks')).toHaveClass(/active/);

      const taskId = await page.evaluate(async (taskTitle) => {
        const tasks = await window.ProductivityData?.DataStore?.getTasks?.();
        const t = (tasks || []).find((x) => x && x.title === taskTitle);
        return t?.id || null;
      }, title);
      expect(taskId).toBeTruthy();

      await page.click(`[data-action="focus-task"][data-task-id="${taskId}"]`);

      // Duration picker should appear (reuses the custom timer modal)
      await expect(page.locator('#custom-timer-modal')).toHaveClass(/active/);
      await page.fill('#custom-focus-minutes', '60');
      await page.click('#start-custom-timer-btn', { force: true });

      const boredomConfirm = page.locator('#boredom-level-modal [data-action="confirm-boredom"]');
      if (await boredomConfirm.isVisible().catch(() => false)) {
        await boredomConfirm.click({ force: true });
      }

      // Wait for focus to actually start (storage is the source of truth)
      await page.waitForFunction(() => new Promise((resolve) => {
        chrome.storage.local.get(['focusState'], (r) => resolve(!!r.focusState?.isActive));
      }));
      await expect(page.locator('#focus-overlay')).not.toHaveClass(/hidden/);

      // Validate storage is timestamp-based and linked to the task
      const focusState1 = await page.evaluate(() => new Promise((resolve) => {
        chrome.storage.local.get(['focusState'], (r) => resolve(r.focusState || null));
      }));
      expect(focusState1).toBeTruthy();
      expect(focusState1.isActive).toBeTruthy();
      expect(focusState1.isPaused).toBeFalsy();
      expect(focusState1.selectedMinutes).toBe(60);
      expect(typeof focusState1.startTimestamp).toBe('number');
      expect(typeof focusState1.endTimestamp).toBe('number');
      expect(focusState1.taskTitle).toBe(title);

      const plannedMs = focusState1.endTimestamp - focusState1.startTimestamp;
      expect(plannedMs).toBeGreaterThan(59 * 60 * 1000);
      expect(plannedMs).toBeLessThan(61 * 60 * 1000);

      // Pause should snapshot remaining time
      await page.click('#focus-pause-btn');
      const focusStatePaused = await page.evaluate(() => new Promise((resolve) => {
        chrome.storage.local.get(['focusState'], (r) => resolve(r.focusState || null));
      }));
      expect(focusStatePaused.isPaused).toBeTruthy();
      expect(typeof focusStatePaused.pausedRemainingSeconds).toBe('number');

      // Resume should restore endTimestamp and clear pause snapshot
      await page.click('#focus-pause-btn');
      const focusStateResumed = await page.evaluate(() => new Promise((resolve) => {
        chrome.storage.local.get(['focusState'], (r) => resolve(r.focusState || null));
      }));
      expect(focusStateResumed.isPaused).toBeFalsy();
      expect(typeof focusStateResumed.endTimestamp).toBe('number');
      expect(focusStateResumed.pausedRemainingSeconds == null).toBeTruthy();

      // Stop
      await page.click('#focus-stop-btn');
      const endEarlyConfirm = page.locator('#end-early-session-modal [data-action="confirm-end-early"]');
      if (await endEarlyConfirm.isVisible().catch(() => false)) {
        await endEarlyConfirm.click();
      }
      await expect(page.locator('#focus-overlay')).toHaveClass(/hidden/);
    });
  });
});
