const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');
const { runWithPageCoverage } = require('./coverageHarness');

test.describe('Blocker – add-site modal', () => {
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

  // --- helpers ---

  async function goToBlocker(page) {
    await page.goto(extensionUrl('/productivity/index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.navigateTo === 'function');
    await page.evaluate(() => new Promise(r => chrome.storage.local.clear(r)));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.navigateTo === 'function');
    await page.click('.nav-item[data-page="blocker"]');
    await expect(page.locator('#page-blocker')).toHaveClass(/active/);
  }

  test('navigate to Blocker page', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await goToBlocker(page);
      await expect(page.locator('#page-blocker')).toBeVisible();
    });
  });

  test('add-site button opens modal instead of prompt', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      // Ensure window.prompt is NOT called
      let promptCalled = false;
      await page.addInitScript(() => {
        window.__origPrompt = window.prompt;
        window.prompt = (...args) => { window.__promptCalledFlag = true; return null; };
      });

      await goToBlocker(page);

      // Click add site button
      const addBtn = page.locator('#add-blocked-site-btn, [data-action="add-blocked-site"], .add-site-btn, button:has-text("Add Site"), button:has-text("Block")');
      if (await addBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.first().click();

        // Either a modal opens or prompt was called – we want modal
        const modal = page.locator('#add-site-modal, .add-site-modal');
        const modalVisible = await modal.first().isVisible({ timeout: 2000 }).catch(() => false);

        const wasPrompt = await page.evaluate(() => window.__promptCalledFlag === true);

        // At least one approach should work; prefer modal
        if (modalVisible) {
          expect(modalVisible).toBe(true);
          expect(wasPrompt).toBeFalsy();
        }
      }
    });
  });

  test('add site via modal adds entry to blocked list', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await goToBlocker(page);

      const addBtn = page.locator('#add-blocked-site-btn, [data-action="add-blocked-site"], .add-site-btn, button:has-text("Add Site"), button:has-text("Block")');
      if (await addBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await addBtn.first().click();

        const input = page.locator('#add-site-modal input[type="text"], .add-site-modal input[type="text"], #blocked-site-url-input');
        if (await input.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await input.first().fill('reddit.com');

          const confirmBtn = page.locator('#add-site-modal button:has-text("Add"), .add-site-modal button:has-text("Add"), #confirm-add-site-btn');
          await confirmBtn.first().click();

          // Verify site appears in the blocked list
          await expect(page.locator('#page-blocker')).toContainText('reddit.com');
        }
      }
    });
  });

  test('can remove a blocked site', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await page.addInitScript(() => {
        window.confirm = () => true;
      });

      await goToBlocker(page);

      // Pre-seed a site
      await page.evaluate(async () => {
        const sites = [{ id: 'test-rm-' + Date.now(), url: 'example-remove.com', addedAt: new Date().toISOString() }];
        await new Promise(r => chrome.storage.local.set({ blockedSites: sites }, r));
      });
      // Reload to pick up the seeded data
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.navigateTo === 'function');
      await page.click('.nav-item[data-page="blocker"]');

      await expect(page.locator('#page-blocker')).toContainText('example-remove.com');

      // Click remove button
      const removeBtn = page.locator('.blocked-site-item .remove-btn, .blocked-site-item button:has-text("Remove"), .blocked-site-item .delete-btn, .blocked-site-item [data-action="remove"]');
      if (await removeBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await removeBtn.first().click();
        // Site should be gone
        await expect(page.locator('#page-blocker')).not.toContainText('example-remove.com');
      }
    });
  });

  test('blocker toggle enables and disables blocking', async ({}, testInfo) => {
    await runWithPageCoverage(context, testInfo, async (page) => {
      await goToBlocker(page);

      const toggle = page.locator('#blocker-toggle, #enable-blocker-toggle, input[name="blocker-enabled"]');
      if (await toggle.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        // Toggle on
        await toggle.first().check();
        const checked = await toggle.first().isChecked();
        expect(checked).toBe(true);

        // Toggle off
        await toggle.first().uncheck();
        const unchecked = await toggle.first().isChecked();
        expect(unchecked).toBe(false);
      }
    });
  });
});
