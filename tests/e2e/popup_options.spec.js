const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Popup and options', () => {
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

  test('popup quick-add task writes to storage', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/popup/menu.html'), { waitUntil: 'load' });

      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });

      const title = `Popup Task ${Date.now()}`;
      await page.fill('#quick-task-title', title);
      await page.click('#quick-add-btn');

      // Verify it landed in storage
      const tasks = await page.evaluate(() => new Promise((resolve) => {
        chrome.storage.local.get(['productivity_tasks'], (r) => resolve(r.productivity_tasks || []));
      }));

      expect(Array.isArray(tasks)).toBeTruthy();
      expect(tasks.some(t => t.title === title)).toBeTruthy();
    });
  });

  test('options page saves Gemini API key and PDF reader toggle', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/options.html'), { waitUntil: 'load' });

      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });

      await page.fill('#api-key', `e2e-key-${Date.now()}`);
      await page.evaluate(() => {
        const cb = document.getElementById('default-pdf-reader');
        if (cb) cb.checked = false;
      });

      await page.click('#save-btn');
      await expect(page.locator('#status')).toHaveCount(0);
      await expect(page.locator('#toast-container .toast .toast-title')).toContainText('Settings Saved');

      // Verify persisted
      const stored = await page.evaluate(() => new Promise((resolve) => {
        chrome.storage.local.get(['geminiApiKey', 'useAsDefaultPdfReader'], resolve);
      }));

      expect(typeof stored.geminiApiKey).toBe('string');
      expect(stored.geminiApiKey.length).toBeGreaterThan(0);
      expect(stored.useAsDefaultPdfReader).toBe(false);
    });
  });
});
