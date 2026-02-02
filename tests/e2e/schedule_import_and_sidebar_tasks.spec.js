const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Schedule import + sidebar tasks', () => {
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

  test('import shows controls immediately; undated tasks appear in My Tasks', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      page.on('dialog', (d) => d.accept().catch(() => {}));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      // Start clean
      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ProductivityData?.DataStore?.saveTask === 'function');

      await page.evaluate(() => window.navigateTo('schedule'));
      await expect(page.locator('#page-schedule')).toHaveClass(/active/);

      // Create a task without start/due dates
      const undatedTitle = `E2E Undated Task ${Date.now()}`;
      await page.evaluate(async (title) => {
        const t = new window.ProductivityData.Task({
          id: `e2e-undated-${Date.now()}`,
          title,
          priority: 'medium',
          category: 'personal',
          status: 'not-started',
        });
        await window.ProductivityData.DataStore.saveTask(t);
        if (typeof window.refreshCalendarTasks === 'function') {
          await window.refreshCalendarTasks();
        }
      }, undatedTitle);

      await expect(page.locator('#my-events-list')).toContainText(undatedTitle);

      // Import an ICS file and ensure the imported calendar is controllable immediately
      await page.click('#import-schedule-btn');
      await expect(page.locator('#import-schedule-modal')).toHaveClass(/active/);

      const calendarName = `E2E Subscribed Calendar ${Date.now()}`;
      await page.fill('#import-calendar-name', calendarName);

      const icsPath = path.join(__dirname, '..', 'fixtures', 'sample_calendar.ics');
      await page.setInputFiles('#schedule-file-input', icsPath);

      // Modal should close after import
      await expect(page.locator('#import-schedule-modal')).toHaveCount(0);

      // Imported calendar should show up in the controls list without needing a reload
      await expect(page.locator('#imported-calendars-list')).toContainText(calendarName);

      // Should have at least a delete control for the newly imported calendar
      await expect(page.locator('#imported-calendars-list [data-delete-calendar]')).toHaveCount(1);
    });
  });
});
