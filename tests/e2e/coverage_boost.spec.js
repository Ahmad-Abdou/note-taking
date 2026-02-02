const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

test.describe('Coverage boost flows', () => {
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

  test('exercise productivity pages and modules', async ({}, testInfo) => {
    testInfo.setTimeout(180_000);
    await runWithPageCoverage(context, testInfo, async (page) => {
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      // Start clean
      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      // Seed some representative data to drive renders
      await page.evaluate(() => {
        const today = new Date();
        const ymd = (d) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dd}`;
        };

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const tasks = [
          {
            id: 'e2e-task-1',
            title: 'E2E Task Overdue',
            description: 'Overdue task',
            status: 'not-started',
            priority: 'high',
            category: 'homework',
            dueDate: ymd(yesterday),
            dueTime: '09:00',
            createdAt: Date.now(),
          },
          {
            id: 'e2e-task-2',
            title: 'E2E Task Today',
            status: 'in-progress',
            priority: 'medium',
            category: 'assignment',
            dueDate: ymd(today),
            dueTime: '15:00',
            createdAt: Date.now(),
          },
          {
            id: 'e2e-task-3',
            title: 'E2E Task Upcoming',
            status: 'not-started',
            priority: 'low',
            category: 'personal',
            dueDate: ymd(tomorrow),
            createdAt: Date.now(),
          },
          {
            id: 'e2e-task-4',
            title: 'E2E Task Completed',
            status: 'completed',
            priority: 'urgent',
            category: 'exam',
            dueDate: ymd(today),
            completedAt: Date.now(),
            createdAt: Date.now(),
          },
        ];

        const scheduleSchool = [
          {
            id: 'e2e-event-1',
            title: 'E2E Class',
            date: ymd(today),
            startTime: '10:00',
            endTime: '11:00',
            type: 'class',
            scheduleType: 'school',
          },
          {
            id: 'e2e-event-2',
            title: 'E2E Study',
            date: ymd(today),
            startTime: '12:00',
            endTime: '13:30',
            type: 'study',
            scheduleType: 'school',
          },
        ];

        const idleCategories = [
          { id: 'idle-cat-1', name: 'Social Media', color: '#6366f1' },
          { id: 'idle-cat-2', name: 'Gaming', color: '#ef4444' },
        ];

        const idleRecords = [
          {
            id: 'idle-rec-1',
            startTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            endTime: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
            durationMinutes: 10,
            categoryId: 'idle-cat-1',
            notes: 'seed',
          },
        ];

        const revisions = [
          {
            id: 'rev-1',
            title: 'E2E Review Item',
            source: 'seed',
            createdAt: Date.now(),
            nextReview: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            intervalDays: 1,
            easeFactor: 2.5,
            repetitions: 0,
          },
        ];

        return Promise.all([
          chrome.storage.local.set({ productivity_tasks: tasks }),
          chrome.storage.local.set({ productivity_schedule_school: scheduleSchool }),
          chrome.storage.local.set({ productivity_schedule_personal: [] }),
          chrome.storage.local.set({ productivity_idle_categories: idleCategories }),
          chrome.storage.local.set({ productivity_idle_records: idleRecords }),
          chrome.storage.local.set({ productivity_revisions: revisions }),
        ]);
      });

      // TASKS: exercise filters + view toggles
      await page.evaluate(() => window.navigateTo('tasks'));
      await expect(page.locator('#page-tasks')).toHaveClass(/active/);
      await page.selectOption('#task-filter-status', 'all');
      await page.selectOption('#task-filter-priority', 'high');
      await page.fill('#task-search', 'E2E');
      await page.selectOption('#task-filter-priority', 'all');
      await page.click('.view-btn[data-view="grid"]');
      await page.click('.view-btn[data-view="board"]');
      await page.click('.view-btn[data-view="calendar"]');
      await page.click('.view-btn[data-view="list"]');
      await page.click('#toggle-completed-btn');
      await page.click('#toggle-completed-btn');

      // SCHEDULE: force-load, switch views, navigate, and open an event details modal
      await page.evaluate(() => window.navigateTo('schedule'));
      await expect(page.locator('#page-schedule')).toHaveClass(/active/);
      await page.waitForTimeout(300);

      // Switch schedule views via UI controls
      await page.click('.view-toggle-btn[data-view="day"]');
      await page.click('.view-toggle-btn[data-view="week"]');
      await page.click('.view-toggle-btn[data-view="month"]');
      await page.click('.view-toggle-btn[data-view="agenda"]');
      await page.click('.view-toggle-btn[data-view="week"]');

      await page.click('#next-week');
      await page.click('#prev-week');
      await page.click('#today-btn');

      // Open first visible schedule event (week/day/agenda/month all supported by listeners)
      const eventCandidates = page.locator('.calendar-event[data-event-id], .day-event[data-event-id], .agenda-event[data-event-id], .month-event-dot[data-event-id], .today-event[data-event-id], .upcoming-event[data-event-id]');
      if (await eventCandidates.count()) {
        await eventCandidates.first().click({ force: true });
        // Close details if it opened
        const closeBtn = page.locator('[data-action="close-event-details"]');
        if (await closeBtn.count()) {
          await closeBtn.first().click({ force: true });
        }
      }

      // Trigger some exported helpers (should be safe no-ops if UI not present)
      await page.evaluate(async () => {
        if (typeof window.refreshScheduleFilters === 'function') window.refreshScheduleFilters();
        if (typeof window.goToToday === 'function') window.goToToday();
        if (typeof window.navigateNext === 'function') window.navigateNext();
        if (typeof window.navigatePrev === 'function') window.navigatePrev();
      });

      // Open and close schedule import modal (covers code paths) without letting it block later clicks.
      await page.evaluate(() => {
        if (typeof window.openImportScheduleModal === 'function') window.openImportScheduleModal();
      });

      const importModal = page.locator('#import-schedule-modal');
      await importModal.waitFor({ state: 'attached', timeout: 3000 }).catch(() => {});
      if (await importModal.count()) {
        const closeBtn = page.locator('#import-schedule-modal [data-action="close-import"]');
        const closeBackdrop = page.locator('#import-schedule-modal .modal-backdrop[data-action="close-import"]');
        if (await closeBtn.count()) {
          await closeBtn.first().click({ force: true });
        } else if (await closeBackdrop.count()) {
          await closeBackdrop.first().click({ force: true });
        }
        await importModal.waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
      }

      // Defensive: import modal is created async; ensure it cannot intercept later clicks.
      await page.evaluate(() => {
        try {
          document.getElementById('import-schedule-modal')?.remove();
        } catch {}
      });

      // Defensive: schedule event detail modal can remain open and intercept clicks.
      await page.evaluate(() => {
        try {
          document.getElementById('event-details-modal')?.remove();
          document.getElementById('schedule-event-modal')?.remove();
          document.querySelectorAll('.modal.active').forEach((m) => {
            if (m && m.id !== 'restore-session-modal') m.remove();
          });
        } catch {}
      });

      // FOCUS: start/pause/resume/stop
      await page.evaluate(() => window.navigateTo('focus'));
      await expect(page.locator('#page-focus')).toHaveClass(/active/);
      await expect(page.locator('#start-focus-btn')).toBeVisible();
      await page.click('#start-focus-btn');
      // Focus sessions may prompt for boredom tagging; confirm if the modal appears.
      const boredomConfirm = page.locator('#boredom-level-modal [data-action="confirm-boredom"]');
      if (await boredomConfirm.isVisible().catch(() => false)) {
        await boredomConfirm.click();
      }
      await expect(page.locator('#focus-overlay')).not.toHaveClass(/hidden/);
      await page.click('#focus-pause-btn');
      await page.click('#focus-pause-btn');
      await page.click('#focus-overlay-toggle-btn');
      await page.click('#focus-stop-btn');
      const endEarlyConfirm = page.locator('#end-early-session-modal [data-action="confirm-end-early"]');
      if (await endEarlyConfirm.isVisible().catch(() => false)) {
        await endEarlyConfirm.click();
      }
      await expect(page.locator('#focus-overlay')).toHaveClass(/hidden/);

      // ANALYTICS: load and change period
      await page.evaluate(() => window.navigateTo('analytics'));
      await expect(page.locator('#page-analytics')).toHaveClass(/active/);
      await page.selectOption('#analytics-period', 'month');
      await page.selectOption('#analytics-period', 'week');

      // IDLE: load page + open/close modal
      await page.evaluate(() => window.navigateTo('idle'));
      await expect(page.locator('#page-idle')).toHaveClass(/active/);
      await page.evaluate(() => {
        if (window.IdleTracking?.load) window.IdleTracking.load();
        if (window.IdleTracking?.showAddCategoryModal) window.IdleTracking.showAddCategoryModal();
      });
      await expect(page.locator('#idle-category-modal')).toHaveClass(/active/);
      await page.fill('#category-name', `E2E Cat ${Date.now()}`);
      await page.click('#cancel-idle-category-btn');

      // REVISIONS: init page
      await page.evaluate(() => window.navigateTo('revisions'));
      await expect(page.locator('#page-revisions')).toHaveClass(/active/);

      if (pageErrors.length) {
        throw pageErrors[0];
      }
    });
  });
});
