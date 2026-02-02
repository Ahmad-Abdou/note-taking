const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Live sync without refresh', () => {
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

  test('task + schedule update live on storage change', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      // Start clean
      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ProductivityData?.DataStore?.saveTask === 'function');

      // Verify Tasks page updates without refresh
      await page.evaluate(() => window.navigateTo('tasks'));
      await expect(page.locator('#page-tasks')).toHaveClass(/active/);

      const taskTitle = `Live Sync Task ${Date.now()}`;
      await page.evaluate(async (title) => {
        const today = new Date().toISOString().split('T')[0];
        const task = new window.ProductivityData.Task({
          id: `live-sync-task-${Date.now()}`,
          title,
          status: 'not-started',
          priority: 'medium',
          dueDate: today,
          dueTime: '09:00'
        });
        await window.ProductivityData.DataStore.saveTask(task);
      }, taskTitle);

      await expect(page.locator('#task-list-view .task-title')).toContainText(taskTitle, { timeout: 5000 });

      // Verify Schedule sidebar updates without refresh
      await page.evaluate(() => window.navigateTo('schedule'));
      await expect(page.locator('#page-schedule')).toHaveClass(/active/);

      const scheduleTaskTitle = `Live Sync Schedule ${Date.now()}`;
      await page.evaluate(async (title) => {
        const today = new Date().toISOString().split('T')[0];
        const task = new window.ProductivityData.Task({
          id: `live-sync-schedule-${Date.now()}`,
          title,
          status: 'not-started',
          priority: 'low',
          dueDate: today,
          dueTime: '10:00'
        });
        await window.ProductivityData.DataStore.saveTask(task);
      }, scheduleTaskTitle);

      await expect(page.locator('#my-events-list')).toContainText(scheduleTaskTitle, { timeout: 5000 });
    });
  });
});
