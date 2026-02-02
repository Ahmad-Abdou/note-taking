const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');

async function getServiceWorker(context, extensionId) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const workers = context.serviceWorkers();
    const worker = workers.find(w => w.url().startsWith(`chrome-extension://${extensionId}/`));
    if (worker) return worker;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Could not find extension service worker');
}

test('content task reminder uses unified toast with actions', async () => {
  const { context, extensionId, extensionUrl } = await launchExtension();
  const page = await context.newPage();
  await page.goto('https://example.com/');

  const worker = await getServiceWorker(context, extensionId);

  // Trigger the content-script reminder by messaging the active tab from the extension's service worker.
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab id found');

    await chrome.tabs.sendMessage(tab.id, {
      action: 'show_task_reminder',
      taskCount: 3,
      message: '📋 You have 3 tasks due today'
    });
  });

  const toast = page.locator('#edge-note-taker-toast-container .toast');
  await expect(toast).toBeVisible();
  await expect(toast.locator('.toast-title')).toHaveText(/Task Reminder/i);
  await expect(toast.locator('.toast-message')).toContainText('You have 3 tasks due today');

  // Verify action buttons exist.
  await expect(toast.locator('.toast-actions .toast-btn')).toHaveCount(2);

  // "View Tasks" should open the productivity hub.
  const [hubPage] = await Promise.all([
    context.waitForEvent('page'),
    toast.locator('.toast-actions .toast-btn', { hasText: 'View Tasks' }).click()
  ]);
  await hubPage.waitForLoadState();
  await expect(hubPage).toHaveURL(extensionUrl('/productivity/index.html'));
  await hubPage.close();

  // Trigger again and ensure "Dismiss" removes the toast.
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab id found');

    await chrome.tabs.sendMessage(tab.id, {
      action: 'show_task_reminder',
      taskCount: 1,
      message: '📋 Test dismiss'
    });
  });

  const toast2 = page.locator('#edge-note-taker-toast-container .toast');
  await expect(toast2).toBeVisible();
  await toast2.locator('.toast-actions .toast-btn', { hasText: 'Dismiss' }).click();
  await expect(page.locator('#edge-note-taker-toast-container .toast')).toHaveCount(0);

  // Disable task reminders globally and ensure reminders are suppressed.
  await worker.evaluate(async () => {
    await new Promise((resolve) => chrome.storage.local.set({ taskRemindersEnabled: false }, resolve));
  });

  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab id found');

    await chrome.tabs.sendMessage(tab.id, {
      action: 'show_task_reminder',
      taskCount: 1,
      message: '📋 This should be suppressed'
    });
  });

  // Give the content script a moment to process the message.
  await expect(page.locator('#edge-note-taker-toast-container .toast')).toHaveCount(0);

  await context.close();
});
