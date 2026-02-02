const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

test.describe('Tasks actions', () => {
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

  test('filters, view toggles, and edit/complete/delete work', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      page.on('dialog', (d) => d.accept().catch(() => {}));

      await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');

      await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.ProductivityData?.DataStore?.saveTask === 'function');

      const today = ymdLocal(new Date());
      const titles = {
        a: `E2E Task A ${Date.now()}`,
        b: `E2E Task B ${Date.now()}`,
        c: `E2E Task C ${Date.now()}`,
      };

      await page.evaluate(async ({ today, titles }) => {
        const t1 = new window.ProductivityData.Task({
          id: `e2e-a-${Date.now()}`,
          title: titles.a,
          dueDate: today,
          priority: 'high',
          category: 'homework',
          status: 'not-started',
        });
        const t2 = new window.ProductivityData.Task({
          id: `e2e-b-${Date.now()}`,
          title: titles.b,
          dueDate: today,
          priority: 'low',
          category: 'personal',
          status: 'completed',
          completedAt: Date.now(),
        });
        const t3 = new window.ProductivityData.Task({
          id: `e2e-c-${Date.now()}`,
          title: titles.c,
          dueDate: today,
          priority: 'urgent',
          category: 'exam',
          status: 'in-progress',
        });
        await window.ProductivityData.DataStore.saveTask(t1);
        await window.ProductivityData.DataStore.saveTask(t2);
        await window.ProductivityData.DataStore.saveTask(t3);
      }, { today, titles });

      await page.evaluate(() => window.navigateTo('tasks'));
      await expect(page.locator('#page-tasks')).toHaveClass(/active/);

      // Filters
      await page.fill('#task-search', 'E2E Task');
      await expect(page.locator('#page-tasks')).toContainText('E2E Task');

      await page.selectOption('#task-filter-status', 'completed');
      // Completed list is hidden by default; show it for stable assertions.
      await page.click('#toggle-completed-btn');
      await expect(page.locator('#completed-tasks')).toContainText(titles.b);

      await page.selectOption('#task-filter-status', 'all');
      await page.selectOption('#task-filter-priority', 'urgent');
      await expect(page.locator('#page-tasks')).toContainText(titles.c);

      await page.selectOption('#task-filter-priority', 'all');
      await page.fill('#task-search', '');

      // View toggles
      await page.click('.view-btn[data-view="grid"]');
      await expect(page.locator('#task-grid-view')).not.toHaveClass(/hidden/);

      await page.click('.view-btn[data-view="board"]');
      await expect(page.locator('#task-board-view')).not.toHaveClass(/hidden/);

      await page.click('.view-btn[data-view="calendar"]');
      await expect(page.locator('#task-calendar-view')).not.toHaveClass(/hidden/);

      await page.click('.view-btn[data-view="list"]');
      await expect(page.locator('#task-list-view')).not.toHaveClass(/hidden/);

      const listView = page.locator('#task-list-view');

      // Edit a task via button
      const taskIdA = await page.evaluate(async (title) => {
        const tasks = await window.ProductivityData.DataStore.getTasks();
        return tasks.find(t => t.title === title)?.id || null;
      }, titles.a);
      expect(taskIdA).toBeTruthy();

      await listView.locator(`[data-action="edit-task"][data-task-id="${taskIdA}"]`).first().click();
      await expect(page.locator('#task-modal')).toHaveClass(/active/);
      const updatedTitle = `${titles.a} (edited)`;
      await page.fill('#task-title', updatedTitle);
      // Submit via form to avoid intermittent click interception by toasts/backdrops.
      await page.evaluate(() => document.getElementById('task-form')?.requestSubmit());
      await expect(page.locator('#task-modal')).not.toHaveClass(/active/);
      await expect(page.locator('#page-tasks')).toContainText(updatedTitle);

      // Toggle completion and verify storage reflects completed
      await listView.locator(`[data-action="toggle-complete"][data-task-id="${taskIdA}"]`).first().click();
      await expect.poll(async () => {
        return await page.evaluate(async (id) => {
          const tasks = await window.ProductivityData.DataStore.getTasks();
          return tasks.find(x => x.id === id)?.status || null;
        }, taskIdA);
      }).toBe('completed');
      const afterToggle = await page.evaluate(async (id) => {
        const tasks = await window.ProductivityData.DataStore.getTasks();
        const t = tasks.find(x => x.id === id);
        return t ? { status: t.status, completedAt: t.completedAt ?? null } : null;
      }, taskIdA);
      expect(afterToggle).toBeTruthy();
      expect(afterToggle.status).toBe('completed');

      // Delete and verify it disappears
      await listView.locator(`[data-action="delete-task"][data-task-id="${taskIdA}"]`).first().click();

      // New in-page confirm dialog (replaces native window.confirm)
      const confirmModal = page.locator('#confirm-modal');
      await expect(confirmModal).toHaveClass(/active/);
      await confirmModal.locator('[data-confirm-ok]').click();
      await expect(confirmModal).not.toHaveClass(/active/);

      await expect.poll(async () => {
        return await page.evaluate(async (id) => {
          const tasks = await window.ProductivityData.DataStore.getTasks();
          return tasks.some(t => t.id === id);
        }, taskIdA);
      }).toBe(false);
      const afterDelete = await page.evaluate(async (id) => {
        const tasks = await window.ProductivityData.DataStore.getTasks();
        return tasks.some(t => t.id === id);
      }, taskIdA);
      expect(afterDelete).toBeFalsy();
    });
  });
});
