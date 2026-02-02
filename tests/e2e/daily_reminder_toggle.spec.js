const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Daily reminder toggle', () => {
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

  test('daily reminder stays off when disabled', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.setDailyReminderEnabled === 'function');

      // Disable reminder and align reminder time to now
      await page.evaluate(async () => {
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        await window.setDailyReminderEnabled(false);
        window.NotificationState.dailyReminderTime = time;
        window.NotificationState.dailyReminderRepeat = 'once';
        window.NotificationState.dailyReminderDays = [0, 1, 2, 3, 4, 5, 6];

        await chrome.storage.local.set({
          dailyReminderEnabled: false,
          dailyReminderTime: time,
          dailyReminderRepeat: 'once',
          dailyReminderDays: [0, 1, 2, 3, 4, 5, 6],
          reminderDismissed: null,
          lastDailyReminderDate: null
        });

        await window.checkDailyTaskReminder();
      });

      await expect(page.locator('#daily-task-reminder-modal')).toHaveCount(0);
    });
  });
});
