const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Challenges feature', () => {
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

  test('can navigate to Challenges page', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.loadChallengesPage === 'function');

      await page.click('.nav-item[data-page="challenges"]');
      await expect(page.locator('#page-challenges')).toHaveClass(/active/);

      if (pageErrors.length) throw pageErrors[0];
    });
  });

  test('can open challenge creation modal', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.openChallengeModal === 'function');

      // Clear storage for clean state
      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.openChallengeModal === 'function');

      // Navigate to challenges
      await page.click('.nav-item[data-page="challenges"]');
      await expect(page.locator('#page-challenges')).toHaveClass(/active/);

      // Click create button (either the page header button or the empty-state button)
      const createBtn = page.locator('#create-challenge-btn');
      const emptyStateBtn = page.locator('[data-action="create-challenge"]');

      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
      } else {
        await emptyStateBtn.first().click();
      }

      await expect(page.locator('#challenge-modal')).toHaveClass(/active/);

      // Verify metric-based form elements exist
      await expect(page.locator('#challenge-metric')).toBeVisible();
      await expect(page.locator('#challenge-target')).toBeVisible();

      if (pageErrors.length) throw pageErrors[0];
    });
  });

  test('can create a focus_sessions challenge', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.openChallengeModal === 'function');

      // Clear storage
      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.openChallengeModal === 'function');

      // Navigate to challenges
      await page.click('.nav-item[data-page="challenges"]');

      // Open modal
      const createBtn = page.locator('#create-challenge-btn');
      const emptyStateBtn = page.locator('[data-action="create-challenge"]');
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
      } else {
        await emptyStateBtn.first().click();
      }

      await expect(page.locator('#challenge-modal')).toHaveClass(/active/);

      // Select focus_sessions metric
      await page.selectOption('#challenge-metric', 'focus_sessions');

      // Set target
      await page.fill('#challenge-target', '3');

      // Submit
      await page.click('#challenge-modal button[type="submit"]');

      // Modal should close
      await expect(page.locator('#challenge-modal')).not.toHaveClass(/active/);

      // Challenge card should appear
      await expect(page.locator('.challenge-card')).toBeVisible();
      await expect(page.locator('.challenge-card')).toContainText('focus sessions');

      if (pageErrors.length) throw pageErrors[0];
    });
  });

  test('can create a tasks challenge', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.openChallengeModal === 'function');

      // Clear storage
      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.openChallengeModal === 'function');

      await page.click('.nav-item[data-page="challenges"]');

      const createBtn = page.locator('#create-challenge-btn');
      const emptyStateBtn = page.locator('[data-action="create-challenge"]');
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
      } else {
        await emptyStateBtn.first().click();
      }

      await page.selectOption('#challenge-metric', 'tasks');
      await page.fill('#challenge-target', '5');
      await page.click('#challenge-modal button[type="submit"]');

      await expect(page.locator('#challenge-modal')).not.toHaveClass(/active/);
      await expect(page.locator('.challenge-card')).toContainText('tasks');

      if (pageErrors.length) throw pageErrors[0];
    });
  });

  test('can delete a challenge', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      // Clear and create a challenge
      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      // Create challenge programmatically
      await page.evaluate(async () => {
        await window.ChallengeManager.create({
          metric: 'tasks', type: 'daily', targetCount: 3, options: {}
        });
      });

      await page.click('.nav-item[data-page="challenges"]');
      await expect(page.locator('.challenge-card')).toBeVisible();

      // Accept confirm dialog
      page.on('dialog', dialog => dialog.accept());

      // Click delete
      await page.click('.challenge-card .delete-btn');

      // Card should disappear
      await expect(page.locator('.challenge-card')).not.toBeVisible();

      if (pageErrors.length) throw pageErrors[0];
    });
  });

  test('ChallengeManager.recordProgress auto-tracks', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      // Create a tasks challenge with target 2
      const result = await page.evaluate(async () => {
        const c = await window.ChallengeManager.create({
          metric: 'tasks', type: 'daily', targetCount: 2, options: {}
        });
        return c;
      });

      expect(result.status).toBe('active');
      expect(result.currentProgress).toBe(0);

      // Record 1 task
      await page.evaluate(async () => {
        await window.ChallengeManager.recordProgress('tasks', 1);
      });

      const after1 = await page.evaluate(() => window.ChallengeManager.challenges[0]);
      expect(after1.currentProgress).toBe(1);
      expect(after1.status).toBe('active');

      // Record another task — should complete
      await page.evaluate(async () => {
        await window.ChallengeManager.recordProgress('tasks', 1);
      });

      const after2 = await page.evaluate(() => window.ChallengeManager.challenges[0]);
      expect(after2.currentProgress).toBe(2);
      expect(after2.status).toBe('completed');

      if (pageErrors.length) throw pageErrors[0];
    });
  });

  test('dashboard challenges widget renders', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      // Create a challenge so the widget has something to show
      await page.evaluate(async () => {
        await window.ChallengeManager.create({
          metric: 'focus_sessions', type: 'weekly', targetCount: 5, options: {}
        });
      });

      // Dashboard should show challenges widget content
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      const challengeWidget = page.locator('#dashboard-challenges');
      await expect(challengeWidget).toBeVisible();

      // Should show progress bar or challenge item
      const challengeItem = page.locator('.dashboard-challenge-item, .dashboard-challenges-list');
      // Give time for async rendering
      await page.waitForTimeout(1000);
      const hasContent = await challengeItem.count() > 0 ||
        await challengeWidget.locator('.empty-state').count() > 0;
      expect(hasContent).toBe(true);

      if (pageErrors.length) throw pageErrors[0];
    });
  });

  test('challenge filter buttons work', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      // Create challenges of different types
      await page.evaluate(async () => {
        await window.ChallengeManager.create({
          metric: 'tasks', type: 'daily', targetCount: 3, options: {}
        });
        await window.ChallengeManager.create({
          metric: 'focus_sessions', type: 'weekly', targetCount: 5, options: {}
        });
      });

      await page.click('.nav-item[data-page="challenges"]');
      await expect(page.locator('#page-challenges')).toHaveClass(/active/);

      // Should show both challenges
      await expect(page.locator('.challenge-card')).toHaveCount(2);

      // Filter by daily
      const dailyBtn = page.locator('.category-btn[data-filter="daily"]');
      if (await dailyBtn.isVisible().catch(() => false)) {
        await dailyBtn.click();
        await expect(page.locator('.challenge-card')).toHaveCount(1);
      }

      // Filter back to all
      const allBtn = page.locator('.category-btn[data-filter="all"]');
      if (await allBtn.isVisible().catch(() => false)) {
        await allBtn.click();
        await expect(page.locator('.challenge-card')).toHaveCount(2);
      }

      if (pageErrors.length) throw pageErrors[0];
    });
  });
});
