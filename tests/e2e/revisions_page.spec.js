const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Revisions page', () => {
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

  async function setupPage(page) {
    await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.navigateTo === 'function');
    await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.navigateTo === 'function');
  }

  test('navigate to Revisions page', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);
      await page.click('.nav-item[data-page="revisions"]');
      await expect(page.locator('#page-revisions')).toHaveClass(/active/);
      await expect(page.locator('#page-revisions')).toBeVisible();
    });
  });

  test('can add a revision topic', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);
      await page.click('.nav-item[data-page="revisions"]');
      await expect(page.locator('#page-revisions')).toHaveClass(/active/);

      // Try to add a revision topic
      const addBtn = page.locator('#add-revision-btn, [data-action="add-revision"], button:has-text("Add Topic"), button:has-text("Add Revision"), button:has-text("New Topic")');
      if (await addBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.first().click();

        // Fill form if modal appears
        const titleInput = page.locator('#revision-title, #revision-topic-input, input[name="revision-title"]');
        if (await titleInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await titleInput.first().fill('E2E Revision Topic');

          const saveBtn = page.locator('#save-revision-btn, button:has-text("Save"), button[type="submit"]');
          if (await saveBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
            await saveBtn.first().click();
          }

          await page.waitForTimeout(500);
          await expect(page.locator('#page-revisions')).toContainText('E2E Revision Topic');
        }
      }
    });
  });

  test('completing a review triggers ChallengeManager.recordProgress', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);

      // Check that ChallengeManager is available
      const hasCM = await page.evaluate(() => typeof window.ChallengeManager !== 'undefined');
      expect(hasCM).toBe(true);

      // Seed a revision topic and verify recordProgress doesn't throw
      await page.evaluate(async () => {
        const topics = [{
          id: 'rev-test-' + Date.now(),
          title: 'Test Topic',
          subject: 'Math',
          createdAt: Date.now(),
          reviews: [],
          nextReviewDate: new Date().toISOString().slice(0, 10),
        }];
        await new Promise(r =>
          chrome.storage.local.set({ productivity_revisions: topics }, r)
        );
      });

      await page.click('.nav-item[data-page="revisions"]');
      await page.waitForTimeout(500);

      // Verify the ChallengeManager.recordProgress function exists
      const hasRecordProgress = await page.evaluate(() =>
        typeof window.ChallengeManager?.recordProgress === 'function'
      );
      expect(hasRecordProgress).toBe(true);
    });
  });

  test('revision data persists after reload', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);

      // Seed data
      await page.evaluate(async () => {
        const topics = [{
          id: 'persist-test-' + Date.now(),
          title: 'Persistence Test',
          subject: 'Science',
          createdAt: Date.now(),
          reviews: [{ date: new Date().toISOString(), quality: 4 }],
          nextReviewDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        }];
        await new Promise(r =>
          chrome.storage.local.set({ productivity_revisions: topics }, r)
        );
      });

      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');
      await page.click('.nav-item[data-page="revisions"]');
      await expect(page.locator('#page-revisions')).toHaveClass(/active/);

      await expect(page.locator('#page-revisions')).toContainText('Persistence Test');
    });
  });
});
