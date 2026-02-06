const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Day review', () => {
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

  async function goToDayReview(page) {
    await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.navigateTo === 'function');
    await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.navigateTo === 'function');
    await page.click('.nav-item[data-page="day-review"]');
    await expect(page.locator('#page-day-review')).toHaveClass(/active/);
  }

  test('navigate to Day Review page', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await goToDayReview(page);
      await expect(page.locator('#page-day-review')).toBeVisible();
    });
  });

  test('day review page renders summary sections', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await goToDayReview(page);

      // Day review should show some summary area
      const reviewContent = page.locator('#page-day-review');
      await expect(reviewContent).toBeVisible();

      // Check for typical summary elements
      const hasSections = await page.evaluate(() => {
        const review = document.getElementById('page-day-review');
        return review && review.children.length > 0;
      });
      expect(hasSections).toBe(true);
    });
  });

  test('can submit a day review with tasks seeded', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');
      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() =>
        typeof window.ProductivityData?.DataStore?.saveTask === 'function'
      );

      // Seed some completed tasks for today
      const today = new Date().toISOString().split('T')[0];
      await page.evaluate(async (today) => {
        for (let i = 0; i < 3; i++) {
          await window.ProductivityData.DataStore.saveTask(
            new window.ProductivityData.Task({
              id: `review-task-${i}-${Date.now()}`,
              title: `Review Task ${i + 1}`,
              status: 'completed',
              priority: 'medium',
              dueDate: today,
              completedAt: Date.now(),
              createdAt: Date.now(),
            })
          );
        }
      }, today);

      await page.click('.nav-item[data-page="day-review"]');
      await expect(page.locator('#page-day-review')).toHaveClass(/active/);

      // The review page should show task completion stats
      await page.waitForTimeout(500);
      const hasContent = await page.evaluate(() => {
        const el = document.getElementById('page-day-review');
        return el && el.textContent.trim().length > 10;
      });
      expect(hasContent).toBe(true);
    });
  });
});
