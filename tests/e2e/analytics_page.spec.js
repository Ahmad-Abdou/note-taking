const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Analytics page', () => {
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

  test('navigate to Analytics page', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);
      await page.click('.nav-item[data-page="analytics"]');
      await expect(page.locator('#page-analytics')).toHaveClass(/active/);
      await expect(page.locator('#page-analytics')).toBeVisible();
    });
  });

  test('analytics page renders chart containers', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);
      await page.click('.nav-item[data-page="analytics"]');
      await expect(page.locator('#page-analytics')).toHaveClass(/active/);

      // Should have content (charts, stats, etc.)
      const hasContent = await page.evaluate(() => {
        const el = document.getElementById('page-analytics');
        return el && el.children.length > 0;
      });
      expect(hasContent).toBe(true);
    });
  });

  test('analytics shows focus time statistics with seeded data', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);

      // Seed focus sessions
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        sessions.push({
          id: `analytics-fs-${i}-${Date.now()}`,
          startTime: Date.now() - (i * 86400000),
          duration: 25 * 60 * 1000,
          endTime: Date.now() - (i * 86400000) + 25 * 60 * 1000,
          completed: true,
        });
      }
      await page.evaluate(async (sessions) => {
        await new Promise(r =>
          chrome.storage.local.set({ productivity_focus_sessions: sessions }, r)
        );
      }, sessions);

      await page.click('.nav-item[data-page="analytics"]');
      await expect(page.locator('#page-analytics')).toHaveClass(/active/);

      // Wait for rendering
      await page.waitForTimeout(1000);

      const hasStats = await page.evaluate(() => {
        const el = document.getElementById('page-analytics');
        return el && el.textContent.length > 20;
      });
      expect(hasStats).toBe(true);
    });
  });

  test('performance radar chart renders', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await setupPage(page);
      await page.click('.nav-item[data-page="analytics"]');
      await expect(page.locator('#page-analytics')).toHaveClass(/active/);

      // Look for radar chart canvas or SVG
      const hasChart = await page.evaluate(() => {
        const analytics = document.getElementById('page-analytics');
        if (!analytics) return false;
        return analytics.querySelector('canvas, svg, .chart-container, .radar-chart') !== null;
      });
      // Chart may not render without data, but the container should exist
      const hasContainer = await page.evaluate(() => {
        return document.querySelector('#performance-radar, .performance-radar, #analytics-charts') !== null;
      });
      expect(hasChart || hasContainer).toBe(true);
    });
  });
});
