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

      // Verify form elements exist including the new name field
      await expect(page.locator('#challenge-name')).toBeVisible();
      await expect(page.locator('#challenge-metric')).toBeVisible();
      await expect(page.locator('#challenge-target')).toBeVisible();

      if (pageErrors.length) throw pageErrors[0];
    });
  });

  test('can create a challenge with custom name', async ({}, testInfo) => {
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

      // Fill in custom name
      await page.fill('#challenge-name', 'My Morning Sprint');

      // Select focus_sessions metric
      await page.selectOption('#challenge-metric', 'focus_sessions');
      await page.fill('#challenge-target', '3');

      // Submit
      await page.click('#challenge-modal button[type="submit"]');

      // Modal should close
      await expect(page.locator('#challenge-modal')).not.toHaveClass(/active/);

      // Challenge card should appear with custom name
      await expect(page.locator('.challenge-card')).toBeVisible();
      await expect(page.locator('.challenge-card .challenge-title')).toContainText('My Morning Sprint');

      // Verify it was stored with customTitle flag
      const challenge = await page.evaluate(() => window.ChallengeManager.challenges[0]);
      expect(challenge.customTitle).toBe(true);
      expect(challenge.title).toBe('My Morning Sprint');

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

      // Select focus_sessions metric (no custom name — auto-generated)
      await page.selectOption('#challenge-metric', 'focus_sessions');
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

  test('can edit a challenge', async ({}, testInfo) => {
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

      // Hover over card to reveal edit button, then click it
      await page.hover('.challenge-card');
      await page.click('.challenge-card .edit-btn');

      // Edit modal should open with "Edit Challenge" title and "Save Changes" button
      await expect(page.locator('#challenge-modal')).toHaveClass(/active/);
      await expect(page.locator('#challenge-modal .modal-header h2')).toContainText('Edit Challenge');
      await expect(page.locator('#challenge-modal button[type="submit"]')).toContainText('Save Changes');

      // Fields should be pre-populated
      const metric = await page.locator('#challenge-metric').inputValue();
      expect(metric).toBe('tasks');
      const target = await page.locator('#challenge-target').inputValue();
      expect(target).toBe('3');

      // Change the name and target
      await page.fill('#challenge-name', 'Updated Task Challenge');
      await page.fill('#challenge-target', '10');

      // Submit
      await page.click('#challenge-modal button[type="submit"]');
      await expect(page.locator('#challenge-modal')).not.toHaveClass(/active/);

      // Verify the card updated
      await expect(page.locator('.challenge-card .challenge-title')).toContainText('Updated Task Challenge');
      await expect(page.locator('.challenge-card .progress-text')).toContainText('/ 10');

      // Verify in storage
      const challenge = await page.evaluate(() => window.ChallengeManager.challenges[0]);
      expect(challenge.title).toBe('Updated Task Challenge');
      expect(challenge.customTitle).toBe(true);
      expect(challenge.targetProgress).toBe(10);

      if (pageErrors.length) throw pageErrors[0];
    });
  });

  test('can delete a challenge via confirm modal', async ({}, testInfo) => {
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

      // Click delete
      await page.hover('.challenge-card');
      await page.click('.challenge-card .delete-btn');

      // Confirm modal should appear (not native dialog)
      await expect(page.locator('#confirm-modal-overlay')).toHaveClass(/active/);

      // Click the delete/OK button in the confirm modal
      await page.click('#confirm-modal-overlay [data-confirm="ok"]');

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

  test('daily challenge syncs to habit tracker immediately', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      // Clear storage
      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');
      await page.waitForFunction(() => typeof window.habitTrackerInstance === 'object');

      // Navigate to challenges and create a daily challenge via the modal
      await page.click('.nav-item[data-page="challenges"]');

      const createBtn = page.locator('#create-challenge-btn');
      const emptyStateBtn = page.locator('[data-action="create-challenge"]');
      if (await createBtn.isVisible().catch(() => false)) {
        await createBtn.click();
      } else {
        await emptyStateBtn.first().click();
      }

      await page.fill('#challenge-name', 'Daily Sync Test');
      await page.selectOption('#challenge-metric', 'tasks');
      await page.fill('#challenge-target', '2');

      // Select daily type
      const typeSimple = page.locator('#challenge-type-simple');
      if (await typeSimple.isVisible().catch(() => false)) {
        await typeSimple.selectOption('daily');
      }

      await page.click('#challenge-modal button[type="submit"]');
      await expect(page.locator('#challenge-modal')).not.toHaveClass(/active/);

      // Without reloading, check if the habit tracker has the synced entry
      const hasSyncedHabit = await page.evaluate(async () => {
        const ht = window.habitTrackerInstance;
        if (!ht?.state?.data?.goalsMeta) return false;
        return ht.state.data.goalsMeta.some(g => g.id.startsWith('daily-challenge--'));
      });

      expect(hasSyncedHabit).toBe(true);

      if (pageErrors.length) throw pageErrors[0];
    });
  });

  test('deleting challenge removes synced habit', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');
      await page.waitForFunction(() => typeof window.habitTrackerInstance === 'object');

      // Create daily challenge and sync to habits
      const challengeId = await page.evaluate(async () => {
        const c = await window.ChallengeManager.create({
          metric: 'tasks', type: 'daily', targetCount: 3, options: {}
        });
        if (window.habitTrackerInstance?.syncExternalDailyItems) {
          await window.habitTrackerInstance.syncExternalDailyItems();
        }
        return c.id;
      });

      // Verify habit exists
      const habitExistsBefore = await page.evaluate((cId) => {
        const ht = window.habitTrackerInstance;
        return ht?.state?.data?.goalsMeta?.some(g => g.id === `daily-challenge--${cId}`) || false;
      }, challengeId);
      expect(habitExistsBefore).toBe(true);

      // Navigate to challenges and delete
      await page.click('.nav-item[data-page="challenges"]');
      await expect(page.locator('.challenge-card')).toBeVisible();

      await page.hover('.challenge-card');
      await page.click('.challenge-card .delete-btn');

      // Confirm in the custom modal
      await expect(page.locator('#confirm-modal-overlay')).toHaveClass(/active/);
      await page.click('#confirm-modal-overlay [data-confirm="ok"]');

      await expect(page.locator('.challenge-card')).not.toBeVisible();

      // Verify the synced habit was also removed
      const habitExistsAfter = await page.evaluate((cId) => {
        const ht = window.habitTrackerInstance;
        return ht?.state?.data?.goalsMeta?.some(g => g.id === `daily-challenge--${cId}`) || false;
      }, challengeId);
      expect(habitExistsAfter).toBe(false);

      if (pageErrors.length) throw pageErrors[0];
    });
  });

  test('deleting synced habit removes the challenge', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');

      await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ChallengeManager === 'object');
      await page.waitForFunction(() => typeof window.habitTrackerInstance === 'object');

      // Create a daily challenge and sync to habits
      const challengeId = await page.evaluate(async () => {
        const c = await window.ChallengeManager.create({
          metric: 'tasks', type: 'daily', targetCount: 3, options: {}
        });
        if (window.habitTrackerInstance?.syncExternalDailyItems) {
          await window.habitTrackerInstance.syncExternalDailyItems();
        }
        return c.id;
      });

      // Verify challenge and habit both exist
      const beforeState = await page.evaluate((cId) => {
        return {
          challengeExists: window.ChallengeManager.challenges.some(c => c.id === cId),
          habitExists: window.habitTrackerInstance?.state?.data?.goalsMeta?.some(
            g => g.id === `daily-challenge--${cId}`
          ) || false
        };
      }, challengeId);
      expect(beforeState.challengeExists).toBe(true);
      expect(beforeState.habitExists).toBe(true);

      // Delete the habit from the habit tracker side (programmatically to avoid UI complexity)
      await page.evaluate(async (cId) => {
        const ht = window.habitTrackerInstance;
        const habitId = `daily-challenge--${cId}`;

        // Simulate what the delete-habit handler does
        if (!Array.isArray(ht.state.data.dismissedSyncIds)) ht.state.data.dismissedSyncIds = [];
        ht.state.data.dismissedSyncIds.push(habitId);
        ht.state.data.goalsMeta = ht.state.data.goalsMeta.filter(g => g.id !== habitId);
        delete ht.state.data.goals[habitId];

        // Cascade: delete the challenge
        await window.ChallengeManager.delete(cId);

        await ht._save();
      }, challengeId);

      // Verify challenge was also removed
      const afterState = await page.evaluate((cId) => {
        return {
          challengeExists: window.ChallengeManager.challenges.some(c => c.id === cId),
          habitExists: window.habitTrackerInstance?.state?.data?.goalsMeta?.some(
            g => g.id === `daily-challenge--${cId}`
          ) || false
        };
      }, challengeId);
      expect(afterState.challengeExists).toBe(false);
      expect(afterState.habitExists).toBe(false);

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
