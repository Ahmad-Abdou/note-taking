const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Productivity navigation', () => {
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

  test('all main pages open without JS errors', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      const consoleErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });

      // Wait for app init
      await page.waitForFunction(() => typeof window.navigateTo === 'function' || document.querySelector('.nav-item'));

      const pages = ['dashboard', 'schedule', 'tasks', 'goals', 'day-review', 'focus', 'revisions', 'blocker', 'notifications', 'settings'];

      for (const p of pages) {
        await page.click(`.nav-item[data-page="${p}"]`);
        await expect(page.locator(`#page-${p}`)).toHaveClass(/active/);
      }

      if (pageErrors.length) {
        throw pageErrors[0];
      }
      if (consoleErrors.length) {
        throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
      }
    });
  });
});
