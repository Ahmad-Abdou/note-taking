const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('PDF Reader - options', () => {
  test.describe.configure({ mode: 'serial' });

  /** @type {import('@playwright/test').BrowserContext | null} */
  let context = null;
  /** @type {((p: string) => string) | null} */
  let extensionUrl = null;

  test.beforeAll(async () => {
    const extensionPath = path.resolve(__dirname, '..', '..', 'pdf-reader');
    const launched = await launchExtension({ extensionPath });
    context = launched.context;
    extensionUrl = launched.extensionUrl;
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('options page uses shared toast on save', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/options.html'), { waitUntil: 'load' });

      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });

      await page.fill('#api-key', `e2e-pdf-key-${Date.now()}`);
      await page.evaluate(() => {
        const cb = document.getElementById('default-pdf-reader');
        if (cb) cb.checked = false;
      });

      await page.click('#save-btn');

      await expect(page.locator('#status')).toHaveCount(0);
      await expect(page.locator('#toast-container .toast .toast-title')).toContainText('Settings Saved');

      const stored = await page.evaluate(() => new Promise((resolve) => {
        chrome.storage.local.get(['geminiApiKey', 'useAsDefaultPdfReader'], resolve);
      }));

      expect(typeof stored.geminiApiKey).toBe('string');
      expect(stored.geminiApiKey.length).toBeGreaterThan(0);
      expect(stored.useAsDefaultPdfReader).toBe(false);
    }, { suffix: 'pdf-reader' });
  });
});
