const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Extension test runner', () => {
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

  test('runs in-extension JS test suite (all pass)', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/tests/test_runner.html'), { waitUntil: 'domcontentloaded' });

      // Ensure runner is ready
      await expect(page.locator('#runAllBtn')).toBeVisible();

      // Run all tests and wait for completion
      await page.click('#runAllBtn');

      // Wait until runner finishes (button re-enabled)
      await expect(page.locator('#runAllBtn')).toBeEnabled({ timeout: 120_000 });

      const failed = await page.locator('#failedCount').innerText();
      const pending = await page.locator('#pendingCount').innerText();

      expect(parseInt(pending, 10)).toBe(0);
      expect(parseInt(failed, 10)).toBe(0);
    });
  });
});
