const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

test.describe('Goals & targets', () => {
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

  test('can create a goal and see it in the goals grid', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });

      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });

      // Open Goals page
      await page.click('.nav-item[data-page="goals"]');
      await expect(page.locator('#page-goals')).toHaveClass(/active/);

      // Open goal modal
      await page.click('#add-goal-btn');
      await expect(page.locator('#goal-modal')).toHaveClass(/active/);

      const title = `E2E Goal ${Date.now()}`;
      await page.fill('#goal-title-input', title);
      await page.fill('#goal-target-date-input', ymdLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));

      await page.click('#save-goal-btn');

      // Modal should close
      await expect(page.locator('#goal-modal')).not.toHaveClass(/active/);

      // Goal should appear
      await expect(page.locator('#goals-grid')).toContainText(title);
    });
  });

  test('daily targets persist after reload', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });

      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });

      await page.click('.nav-item[data-page="goals"]');
      await expect(page.locator('#page-goals')).toHaveClass(/active/);

      // Set targets
      await page.fill('#goals-daily-study', '6');
      await page.fill('#goals-daily-tasks', '4');
      await page.fill('#goals-weekly-study', '30');

      await page.click('#save-daily-targets-btn');

      // Reload and verify
      await page.reload({ waitUntil: 'load' });
      await page.click('.nav-item[data-page="goals"]');
      await expect(page.locator('#page-goals')).toHaveClass(/active/);

      await expect(page.locator('#goals-daily-study')).toHaveValue('6');
      await expect(page.locator('#goals-daily-tasks')).toHaveValue('4');
      await expect(page.locator('#goals-weekly-study')).toHaveValue('30');
    });
  });
});
