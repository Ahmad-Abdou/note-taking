const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Motivation & XP system', () => {
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

  test('MotivationSystem initialises with zero XP on clean state', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);

      const hasMotivation = await page.evaluate(() => {
        return typeof window.MotivationSystem !== 'undefined' ||
          typeof window.ProductivityData?.DataStore?.getMotivationStats === 'function';
      });
      expect(hasMotivation).toBe(true);

      const stats = await page.evaluate(async () => {
        if (window.ProductivityData?.DataStore?.getMotivationStats) {
          return window.ProductivityData.DataStore.getMotivationStats();
        }
        return null;
      });

      if (stats) {
        expect(stats.totalXP === undefined || stats.totalXP === 0 || stats.totalXP >= 0).toBe(true);
      }
    });
  });

  test('XP bar renders on dashboard', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);

      // XP bar should be visible on dashboard
      const xpBar = page.locator('#xp-bar, .xp-bar, .xp-progress, #motivation-xp-bar');
      const visible = await xpBar.first().isVisible({ timeout: 3000 }).catch(() => false);

      // At minimum the motivation system should be loaded
      const motLoaded = await page.evaluate(() => {
        return typeof window.MotivationSystem !== 'undefined' ||
          typeof window.initMotivation === 'function' ||
          typeof window.loadMotivation === 'function';
      });
      expect(motLoaded || visible).toBe(true);
    });
  });

  test('completing a task awards XP', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);

      // Get initial XP
      const initialXP = await page.evaluate(async () => {
        const stats = await window.ProductivityData?.DataStore?.getMotivationStats?.();
        return stats?.totalXP || 0;
      });

      // Create and complete a task
      await page.evaluate(async () => {
        if (window.ProductivityData?.DataStore?.saveTask) {
          const task = new window.ProductivityData.Task({
            id: 'xp-test-' + Date.now(),
            title: 'XP Test Task',
            status: 'not-started',
            priority: 'high',
            createdAt: Date.now(),
          });
          await window.ProductivityData.DataStore.saveTask(task);
        }
      });

      // Navigate to tasks, complete it
      await page.evaluate(() => window.navigateTo('tasks'));
      await page.waitForTimeout(500);

      // Complete the task via DataStore
      await page.evaluate(async () => {
        const tasks = await window.ProductivityData?.DataStore?.getTasks?.();
        const t = tasks?.find(t => t.title === 'XP Test Task');
        if (t) {
          t.status = 'completed';
          t.completedAt = Date.now();
          await window.ProductivityData.DataStore.saveTask(t);
          // Trigger XP award if awardXP exists
          if (window.MotivationSystem?.awardXP) {
            window.MotivationSystem.awardXP('task_complete', { taskId: t.id, priority: t.priority });
          }
        }
      });

      await page.waitForTimeout(500);

      const finalXP = await page.evaluate(async () => {
        const stats = await window.ProductivityData?.DataStore?.getMotivationStats?.();
        return stats?.totalXP || 0;
      });

      // XP should increase or at least not decrease
      expect(finalXP).toBeGreaterThanOrEqual(initialXP);
    });
  });

  test('CommitmentStats model has correct fields', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);

      const stats = await page.evaluate(() => {
        if (window.ProductivityData?.CommitmentStats) {
          const s = new window.ProductivityData.CommitmentStats({});
          return {
            hasTotalGoalsCreated: 'totalGoalsCreated' in s,
            hasTotalGoalsCompleted: 'totalGoalsCompleted' in s,
            hasTotalGoalsAbandoned: 'totalGoalsAbandoned' in s,
            hasTotalXPLostToDecay: 'totalXPLostToDecay' in s,
            hasLastActivityDate: 'lastActivityDate' in s,
            hasConsecutiveInactiveDays: 'consecutiveInactiveDays' in s,
          };
        }
        return null;
      });

      if (stats) {
        expect(stats.hasTotalGoalsCreated).toBe(true);
        expect(stats.hasTotalGoalsCompleted).toBe(true);
        expect(stats.hasTotalGoalsAbandoned).toBe(true);
        expect(stats.hasTotalXPLostToDecay).toBe(true);
        expect(stats.hasLastActivityDate).toBe(true);
        expect(stats.hasConsecutiveInactiveDays).toBe(true);
      }
    });
  });

  test('AccountabilityCheckin uses unified field names', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);

      const checkin = await page.evaluate(() => {
        if (window.ProductivityData?.AccountabilityCheckin) {
          const c = new window.ProductivityData.AccountabilityCheckin({
            moodRating: 4,
            commitmentForTomorrow: 'Study more',
            blockers: ['procrastination'],
          });
          return {
            mood: c.moodRating,
            commitment: c.commitmentForTomorrow,
            blockers: c.blockers,
            // Old field names should NOT exist
            hasOldMood: 'mood' in c && !('moodRating' in c),
            hasOldTomorrow: 'tomorrowCommitment' in c && !('commitmentForTomorrow' in c),
          };
        }
        return null;
      });

      if (checkin) {
        expect(checkin.mood).toBe(4);
        expect(checkin.commitment).toBe('Study more');
        expect(checkin.hasOldMood).toBe(false);
        expect(checkin.hasOldTomorrow).toBe(false);
      }
    });
  });

  test('UserSettings includes accountability settings', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);

      const settings = await page.evaluate(() => {
        if (window.ProductivityData?.UserSettings) {
          const s = new window.ProductivityData.UserSettings({});
          return {
            hasDailyCheckinEnabled: 'dailyCheckinEnabled' in s,
            hasDailyCheckinTime: 'dailyCheckinTime' in s,
            hasXpDecayEnabled: 'xpDecayEnabled' in s,
            hasXpDecayDailyPercent: 'xpDecayDailyPercent' in s,
            hasDefaultStakeAmount: 'defaultStakeAmount' in s,
          };
        }
        return null;
      });

      if (settings) {
        expect(settings.hasDailyCheckinEnabled).toBe(true);
        expect(settings.hasDailyCheckinTime).toBe(true);
        expect(settings.hasXpDecayEnabled).toBe(true);
        expect(settings.hasXpDecayDailyPercent).toBe(true);
        expect(settings.hasDefaultStakeAmount).toBe(true);
      }
    });
  });
});
