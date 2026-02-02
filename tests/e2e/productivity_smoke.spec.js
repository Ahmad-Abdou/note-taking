const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

test.describe('Productivity UI smoke', () => {
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

  test('can create a task and see it on Tasks page', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      // Capture uncaught errors as test failures
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });

      // Wait for core scripts to initialize
      await page.waitForFunction(() => typeof window.openTaskModal === 'function');

      // Start clean
      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.openTaskModal === 'function');

      // Open task modal from dashboard hero button
      await page.click('.hero-action-btn[data-action="task"]');
      await expect(page.locator('#task-modal')).toHaveClass(/active/);
      await expect(page.locator('#task-form')).toBeVisible();
      await expect(page.locator('#task-modal button[type="submit"].btn-save')).toBeVisible();

      const title = `E2E Task ${Date.now()}`;
      await page.fill('#task-title', title);
      const today = ymdLocal(new Date());
      await page.fill('#task-due-date', today);

      await expect(page.locator('#task-title')).toHaveValue(title);
      await expect(page.locator('#task-due-date')).toHaveValue(today);

      await page.click('#task-modal button[type="submit"].btn-save');

      // Wait for modal to close (save completed)
      await expect(page.locator('#task-modal')).not.toHaveClass(/active/);

      // Navigate to Tasks page and assert the task shows up under Today
      await page.click('.nav-item[data-page="tasks"]');
      await expect(page.locator('#page-tasks')).toHaveClass(/active/);

      await expect(page.locator('#today-tasks')).toContainText(title);

      if (pageErrors.length) {
        throw pageErrors[0];
      }
    });
  });

  test('focus overlay can start and stop', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'domcontentloaded' });

      // Navigate to Focus page and start a session
      await page.click('.nav-item[data-page="focus"]');
      await expect(page.locator('#page-focus')).toHaveClass(/active/);

      await expect(page.locator('#start-focus-btn')).toBeVisible();
      await page.click('#start-focus-btn');

      const boredomConfirm = page.locator('#boredom-level-modal [data-action="confirm-boredom"]');
      if (await boredomConfirm.isVisible().catch(() => false)) {
        await boredomConfirm.click();
      }

      await expect(page.locator('#focus-overlay')).not.toHaveClass(/hidden/);

      // Stop focus session
      await page.click('#focus-stop-btn');
      const endEarlyConfirm = page.locator('#end-early-session-modal [data-action="confirm-end-early"]');
      if (await endEarlyConfirm.isVisible().catch(() => false)) {
        await endEarlyConfirm.click();
      }
      await expect(page.locator('#focus-overlay')).toHaveClass(/hidden/);
    });
  });

  test('notification test sound button does not crash', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'domcontentloaded' });

      // Navigate to Notifications page
      await page.click('.nav-item[data-page="notifications"]');
      await expect(page.locator('#page-notifications')).toHaveClass(/active/);

      // Click test sound (should be a user gesture)
      await page.click('#test-sound-btn');

      // Give audio graph a tick to build
      await page.waitForTimeout(300);

      if (pageErrors.length) {
        throw pageErrors[0];
      }
    });
  });
});
