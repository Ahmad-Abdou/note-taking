const { test, expect } = require('@playwright/test');
const { launchExtension } = require('./extensionHarness');

test.describe('Dashboard note-taking smoke', () => {
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

  test('renders seeded notes, handles export buttons, and normal UI actions', async () => {
    test.setTimeout(60_000);

    const page = await context.newPage();

    // Avoid native dialogs and downloads during export.
    await page.addInitScript(() => {
      window.confirm = () => true;
      window.alert = () => {};

      // PDF export uses window.print() which would otherwise open a dialog.
      window.__printed = false;
      window.print = () => {
        window.__printed = true;
      };

      // DOC export creates an anchor and clicks it.
      window.__docExport = null;
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function patchedClick() {
        try {
          if (typeof this.href === 'string' && this.href.startsWith('data:application/vnd.ms-word')) {
            window.__docExport = { href: this.href, download: this.download || '' };
            return;
          }
        } catch {}
        return originalClick.call(this);
      };
    });

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    // Seed storage before loading the dashboard.
    const nowIso = new Date().toISOString();
    await page.goto(extensionUrl('/dashboard/index.html'), { waitUntil: 'load' });

    await page.evaluate(({ nowIso }) => {
      return new Promise((resolve) => {
        const notebooks = {
          default: [
            { type: 'text', content: 'Hello from E2E', url: 'https://example.com', date: nowIso },
            { type: 'image', content: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', url: 'https://example.com', date: nowIso },
          ],
        };

        const bookmarks = [
          {
            title: 'My PDF Bookmark',
            url: 'file:///C:/fake.pdf#page=2',
            date: nowIso,
          },
        ];

        chrome.storage.local.set(
          {
            notebooks,
            currentNotebook: 'default',
            pageWidth: 900,
            pageSettings: { font: 'sans', smallText: false, fullWidth: false, floatingToolbar: true },
            bookmarks,
          },
          () => resolve()
        );
      });
    }, { nowIso });

    await page.reload({ waitUntil: 'load' });

    // Sidebar should show the notebook.
    await expect(page.locator('#notebook-list li')).toContainText(['default']);

    // Content migration should render note blocks as HTML.
    await expect(page.locator('#editor-content')).toContainText('Hello from E2E');
    await expect(page.locator('#editor-content img')).toHaveCount(1);

    // Bookmarks should render and PDF bookmarks should be rewritten to the PDF.js viewer.
    await page.click('#refresh-bookmarks-btn');
    const firstBookmark = page.locator('#bookmark-list a').first();
    await expect(firstBookmark).toBeVisible();
    await expect(firstBookmark).toHaveAttribute('href', /viewer\.html\?file=/);

    // Basic editor interaction: open slash menu by typing '/'
    await page.click('#editor-content');
    await page.keyboard.type('/');
    await expect(page.locator('#slash-menu')).not.toHaveClass(/hidden/);
    await page.click('#slash-menu .menu-item[data-type="h1"]');
    await expect(page.locator('#editor-content h1')).toHaveCount(1);

    // Create a new notebook (modal)
    await page.click('#add-notebook-btn');
    await expect(page.locator('#modal')).not.toHaveClass(/hidden/);
    await page.fill('#new-notebook-name', 'Release Notebook');
    await page.click('#save-notebook-btn');
    await expect(page.locator('#notebook-list li')).toContainText(['Release Notebook']);

    // Export buttons should execute without hanging.
    await page.click('#export-pdf-btn');
    await expect.poll(async () => page.evaluate(() => window.__printed)).toBe(true);

    await page.click('#export-doc-btn');
    const docExport = await page.evaluate(() => window.__docExport);
    expect(docExport).toBeTruthy();
    expect(docExport.download).toMatch(/\.doc$/);
    expect(docExport.href).toMatch(/^data:application\/vnd\.ms-word/);

    if (pageErrors.length) {
      throw pageErrors[0];
    }

    await page.close();
  });
});
