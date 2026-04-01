const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Floating widget full minimize', () => {
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

  test('minimize button toggles full-minimized state and resize payload', async ({}, testInfo) => {
    test.setTimeout(60_000);

    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.addInitScript(() => {
        window.__widgetCalls = [];

        const previous = window.electronAPI?.widgets || {};

        window.electronAPI = {
          ...(window.electronAPI || {}),
          widgets: {
            ...previous,
            getPinned: async () => ({
              'today-tasks': {
                expanded: false,
                minimized: false,
                width: 340,
                collapsedHeight: 100,
                expandedHeight: 380,
                minimizedHeight: 40
              }
            }),
            resize: async (cardId, width, height, expanded, minimized) => {
              window.__widgetCalls.push({
                action: 'resize',
                cardId,
                width,
                height,
                expanded,
                minimized: minimized === true
              });
              return { success: true };
            },
            unpin: async (cardId) => {
              window.__widgetCalls.push({ action: 'unpin', cardId });
              return { success: true };
            }
          }
        };
      });

      await page.goto(extensionUrl('/productivity-desktop/renderer/widget.html?card=today-tasks'), { waitUntil: 'load' });

      const minimizeBtn = page.locator('#widget-minimize-btn');
      const widgetContainer = page.locator('#widget-container');

      await expect(minimizeBtn).toBeVisible();
      await expect(widgetContainer).not.toHaveClass(/is-minimized/);

      await minimizeBtn.click();
      await expect(widgetContainer).toHaveClass(/is-minimized/);

      await expect
        .poll(async () => {
          return await page.evaluate(() => {
            const calls = (window.__widgetCalls || []).filter((entry) => entry.action === 'resize');
            return calls[calls.length - 1] || null;
          });
        }, { timeout: 5000 })
        .toMatchObject({
          cardId: 'today-tasks',
          minimized: true,
          expanded: false
        });

      await minimizeBtn.click();
      await expect(widgetContainer).not.toHaveClass(/is-minimized/);

      await expect
        .poll(async () => {
          return await page.evaluate(() => {
            const calls = (window.__widgetCalls || []).filter((entry) => entry.action === 'resize');
            return calls[calls.length - 1] || null;
          });
        }, { timeout: 5000 })
        .toMatchObject({
          cardId: 'today-tasks',
          minimized: false,
          expanded: false
        });
    });
  });
});
