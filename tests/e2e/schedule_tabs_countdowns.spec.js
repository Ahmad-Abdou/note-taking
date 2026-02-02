const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

test.describe('Schedule tabs and countdowns', () => {
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

  test('tabs switch schedules and pinned countdowns render', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.loadSchedule === 'function');

      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.loadSchedule === 'function');

      const today = new Date();
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const schoolEvents = [
        {
          id: `e2e-school-${Date.now()}`,
          title: 'E2E Class',
          date: ymdLocal(today),
          startTime: '10:00',
          endTime: '11:00',
          type: 'class',
          scheduleType: 'school',
        },
      ];
      const personalEvents = [
        {
          id: `e2e-personal-${Date.now()}`,
          title: 'E2E Personal',
          date: ymdLocal(tomorrow),
          startTime: '18:00',
          endTime: '19:00',
          type: 'personal',
          scheduleType: 'personal',
        },
      ];

      await page.evaluate(({ schoolEvents, personalEvents }) => {
        return Promise.all([
          chrome.storage.local.set({ productivity_schedule_school: schoolEvents }),
          chrome.storage.local.set({ productivity_schedule_personal: personalEvents }),
          chrome.storage.local.set({ pinnedCountdowns: [schoolEvents[0].id] }),
        ]);
      }, { schoolEvents, personalEvents });

      await page.evaluate(() => window.navigateTo('schedule'));
      await expect(page.locator('#page-schedule')).toHaveClass(/active/);

      // Countdown bar should show pinned event
      await expect(page.locator('#countdown-bar-items')).toContainText('E2E Class');

      // Ensure something renders in the calendar grid
      await expect(page.locator('#calendar-grid')).toBeVisible();

      // View toggles
      await page.click('.view-toggle-btn[data-view="day"]');
      await page.click('.view-toggle-btn[data-view="week"]');
      await page.click('.view-toggle-btn[data-view="month"]');
      await page.click('.view-toggle-btn[data-view="agenda"]');
      await page.click('.view-toggle-btn[data-view="week"]');

      // Week navigation buttons
      await page.click('#next-week');
      await page.click('#prev-week');
      await page.click('#today-btn');

      // Tabs
      await page.click('.tab-btn[data-view="school"]');
      await expect(page.locator('#calendar-grid')).toContainText('E2E Class');

      await page.click('.tab-btn[data-view="personal"]');
      // personal event is tomorrow; it should still appear in agenda/month or upcoming lists depending on view
      await page.click('.view-toggle-btn[data-view="agenda"]');
      await expect(page.locator('#calendar-grid')).toContainText('E2E Personal');

      await page.click('.tab-btn[data-view="combined"]');
      await expect(page.locator('#calendar-grid')).toContainText('E2E Class');
    });
  });
});
