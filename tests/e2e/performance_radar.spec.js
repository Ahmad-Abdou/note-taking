const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

// Radar chart is rendered on the Productivity Analytics page.
// We validate that:
// - canvas renders
// - user can set a custom daily goal (hours/day)
// - compare toggles update legend
// - daily goal persists across reload (stored in settings)

test.describe('Weekly performance radar', () => {
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

    test('renders and supports goal + compare toggles (persists)', async ({}, testInfo) => {
        test.setTimeout(90_000);

        await runWithPageCoverage(context, testInfo, async (page) => {
            await page.addInitScript(() => {
                window.confirm = () => true;
                window.alert = () => {};
            });

            await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });

            // Start clean
            await page.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
            await page.reload({ waitUntil: 'load' });
            await page.waitForFunction(() => typeof window.navigateTo === 'function');

            await page.evaluate(() => window.navigateTo('analytics'));
            await expect(page.locator('#page-analytics')).toHaveClass(/active/);

            // Wait for radar to initialize and bind listeners
            await page.waitForFunction(() => {
                const el = document.getElementById('radar-daily-goal');
                return !!el && el.dataset && el.dataset.bound === '1';
            });

            const canvas = page.locator('#performance-radar');
            await expect(canvas).toBeVisible();

            const goalInput = page.locator('#radar-daily-goal');
            await expect(goalInput).toBeVisible();

            // Set a custom goal (e.g., 12h/day)
            await goalInput.fill('12');
            await goalInput.dispatchEvent('change');

            // Verify settings updated in storage (async)
            await page.waitForFunction(async () => {
                const s = await ProductivityData.DataStore.getSettings();
                return Number(s.dailyStudyTarget) === 12;
            });

            // Compare toggles should affect legend
            const legend = page.locator('#performance-radar-legend');
            await expect(legend).toBeVisible();
            await expect(legend).toContainText('This week');

            await page.locator('#radar-compare-last-week').check();
            await expect(legend).toContainText('Last week');

            await page.locator('#radar-compare-overall').check();
            await expect(legend).toContainText('Overall');

            // Reload and ensure goal persists
            await page.reload({ waitUntil: 'load' });
            await page.waitForFunction(() => typeof window.navigateTo === 'function');
            await page.evaluate(() => window.navigateTo('analytics'));
            await expect(page.locator('#page-analytics')).toHaveClass(/active/);

            const goalAfter = page.locator('#radar-daily-goal');
            await expect(goalAfter).toHaveValue('12');
        });
    });
});
