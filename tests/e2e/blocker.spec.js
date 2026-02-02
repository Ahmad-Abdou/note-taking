const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Distraction blocker', () => {
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

  test('can enable blocker and add a blocked site', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });

      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });

      // Navigate to blocker page
      await page.click('.nav-item[data-page="blocker"]');
      await expect(page.locator('#page-blocker')).toHaveClass(/active/);

      // Enable blocker
      await page.click('#toggle-blocker-btn');
      await expect(page.locator('#blocker-status')).toContainText('Blocker Active');

      // Handle the prompt() used by the UI
      page.once('dialog', async (dialog) => {
        // prompt
        await dialog.accept('example.com');
      });

      await page.click('#add-blocked-site-btn');

      await expect(page.locator('#blocked-sites-list')).toContainText('example.com');

      // Reload and verify the site still exists (persistence)
      await page.reload({ waitUntil: 'load' });
      await page.click('.nav-item[data-page="blocker"]');
      await expect(page.locator('#page-blocker')).toHaveClass(/active/);
      await expect(page.locator('#blocked-sites-list')).toContainText('example.com');
    });
  });
});
