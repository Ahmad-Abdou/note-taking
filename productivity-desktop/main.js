const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, globalShortcut, net } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');

// Allow audio to play without user gesture
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Initialize persistent storage
const store = new Store();

let mainWindow;
let tray;
let isQuitting = false;

function prepareToQuit(reason = 'quit') {
    isQuitting = true;

    // Best-effort: close UI surfaces that might keep the app "alive" in user perception.
    try {
        const wins = BrowserWindow.getAllWindows?.() || [];
        for (const w of wins) {
            try {
                if (!w.isDestroyed()) w.destroy();
            } catch (_) {
                // ignore
            }
        }
    } catch (_) {
        // ignore
    }

    // Removing the tray icon avoids "app still running" confusion and can help ensure
    // the updater can replace files without the app lingering in the tray.
    try {
        if (tray && !tray.isDestroyed()) tray.destroy();
    } catch (_) {
        // ignore
    }

    // Log for diagnostics (doesn't crash if console not available)
    try {
        console.log(`[App] prepareToQuit: ${reason}`);
    } catch (_) {
        // ignore
    }
}

// ===== Auto Update (electron-updater) =====

let updaterInitialized = false;
let installAfterDownload = false;

function getAppUpdateConfigPath() {
    // electron-builder embeds this file in packaged builds when publish config exists.
    try {
        return path.join(process.resourcesPath, 'app-update.yml');
    } catch {
        return null;
    }
}

function ensureUpdateConfigOrExplain() {
    const configPath = getAppUpdateConfigPath();
    if (!configPath) {
        sendUpdaterStatus({
            state: 'error',
            message: 'Unable to locate update configuration path.'
        });
        return { ok: false, error: 'no_config_path' };
    }

    if (!fs.existsSync(configPath)) {
        sendUpdaterStatus({
            state: 'error',
            message: 'Missing app-update.yml. Auto-update requires an installer build (NSIS) built with publish settings, and updates must be published (e.g., GitHub Releases).'
        });
        return { ok: false, error: 'missing_app_update_yml' };
    }

    return { ok: true };
}

function sendUpdaterStatus(payload) {
    try {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('updater-status', payload);
    } catch (e) {
        // Ignore: window may be closing
    }
}

function initAutoUpdater() {
    if (updaterInitialized) return;
    updaterInitialized = true;

    // Only meaningful for packaged apps (installed/portable).
    // In development, this will typically error due to missing update config.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        sendUpdaterStatus({ state: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        sendUpdaterStatus({
            state: 'available',
            version: info?.version,
            releaseName: info?.releaseName,
            releaseDate: info?.releaseDate
        });
    });

    autoUpdater.on('update-not-available', (info) => {
        sendUpdaterStatus({ state: 'not-available', version: info?.version });
    });

    autoUpdater.on('error', (err) => {
        sendUpdaterStatus({ state: 'error', message: err?.message || String(err) });
    });

    autoUpdater.on('download-progress', (progress) => {
        sendUpdaterStatus({
            state: 'downloading',
            percent: typeof progress?.percent === 'number' ? progress.percent : null,
            transferred: progress?.transferred,
            total: progress?.total,
            bytesPerSecond: progress?.bytesPerSecond
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        sendUpdaterStatus({
            state: 'downloaded',
            version: info?.version,
            releaseName: info?.releaseName,
            releaseDate: info?.releaseDate
        });

        if (installAfterDownload) {
            // Reset first to avoid loops.
            installAfterDownload = false;
            // Give renderer a moment to paint status then restart.
            setTimeout(() => {
                try {
                    // Ensure the app will actually quit.
                    // Our window close handler normally hides to tray.
                    prepareToQuit('update_install');

                    // Fail-safe: if something still prevents shutdown (e.g., odd event listeners),
                    // force exit so the installer doesn't prompt the user to close the app.
                    setTimeout(() => {
                        try {
                            process.exit(0);
                        } catch (_) {
                            // ignore
                        }
                    }, 6000);

                    // Trigger installer; it will quit the app and run update.
                    autoUpdater.quitAndInstall(false, true);
                } catch (e) {
                    sendUpdaterStatus({ state: 'error', message: e?.message || String(e) });
                }
            }, 600);
        }
    });

    // When the updater is about to quit for update, ensure we don't block quit.
    autoUpdater.on('before-quit-for-update', () => {
        prepareToQuit('before-quit-for-update');
    });
}

// Create main application window
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        frame: true,
        titleBarStyle: 'default',
        backgroundColor: '#0f0f23',
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // Open DevTools in development (can use F12 or Ctrl+Shift+I)
        // mainWindow.webContents.openDevTools();
    });

    // Enable F12 to open DevTools
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
            mainWindow.webContents.toggleDevTools();
        }
    });

    // Minimize to tray instead of closing
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Create system tray
function createTray() {
    // Use ICO file for Windows (better tray icon support), PNG for others
    let iconPath;
    if (process.platform === 'win32') {
        iconPath = path.join(__dirname, 'assets', 'icons', 'win', 'icon.ico');
    } else {
        iconPath = path.join(__dirname, 'assets', 'icon.png');
    }

    const trayIcon = nativeImage.createFromPath(iconPath);

    // For Windows, resize to standard tray icon size (16x16 or let Windows handle it)
    // Don't resize ICO files as they contain multiple sizes
    let finalIcon = trayIcon;
    if (process.platform !== 'win32') {
        finalIcon = trayIcon.resize({ width: 16, height: 16 });
    }

    tray = new Tray(finalIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Productivity Hub',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            }
        },
        { type: 'separator' },
        {
            label: 'Quick Focus (25 min)',
            click: () => {
                mainWindow.show();
                mainWindow.webContents.send('start-focus', 25);
            }
        },
        {
            label: 'Deep Work (50 min)',
            click: () => {
                mainWindow.show();
                mainWindow.webContents.send('start-focus', 50);
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Productivity Hub');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
    });
}

// Register global hotkeys
function registerShortcuts() {
    // Ctrl+Shift+F to start quick focus
    globalShortcut.register('CommandOrControl+Shift+F', () => {
        mainWindow.show();
        mainWindow.webContents.send('start-focus', 25);
    });
}

// App ready
app.whenReady().then(() => {
    // Prevent multiple app instances (a common cause of update installers claiming
    // the app is still running).
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
        prepareToQuit('second-instance');
        app.quit();
        return;
    }

    app.on('second-instance', () => {
        try {
            if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
            }
        } catch (_) {
            // ignore
        }
    });

    createWindow();
    createTray();
    registerShortcuts();
    initAutoUpdater();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Ensure app.quit() is not blocked by "minimize to tray" close handler.
app.on('before-quit', () => {
    prepareToQuit('before-quit');
});

// Cleanup on quit
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// ===== IPC Handlers for Storage =====

// Get data from store
ipcMain.handle('store-get', (event, key) => {
    return store.get(key);
});

// Set data in store
ipcMain.handle('store-set', (event, key, value) => {
    store.set(key, value);
    return true;
});

// Delete data from store
ipcMain.handle('store-delete', (event, key) => {
    store.delete(key);
    return true;
});

// Get all data
ipcMain.handle('store-get-all', () => {
    return store.store;
});

// Clear all data
ipcMain.handle('store-clear', () => {
    store.clear();
    return true;
});

// ===== IPC Handlers for Notifications =====

ipcMain.handle('show-notification', (event, title, options) => {
    const notification = new Notification({
        title: title,
        body: options.body || '',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        silent: options.silent || false
    });
    notification.show();
    return true;
});

// ===== IPC Handlers for Window Control =====

ipcMain.handle('minimize-window', () => {
    mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.handle('close-window', () => {
    mainWindow.hide();
});

// ===== Auto-start Configuration =====

ipcMain.handle('set-auto-start', (event, enable) => {
    app.setLoginItemSettings({
        openAtLogin: enable,
        path: app.getPath('exe')
    });
    return true;
});

ipcMain.handle('get-auto-start', () => {
    return app.getLoginItemSettings().openAtLogin;
});

// ===== IPC Handlers for Auto Updates =====

ipcMain.handle('updater-get-version', () => {
    return {
        version: app.getVersion(),
        isPackaged: app.isPackaged
    };
});

ipcMain.handle('updater-check', async () => {
    initAutoUpdater();

    if (!app.isPackaged) {
        // Don't hard-fail: allow the UI to show a helpful message.
        sendUpdaterStatus({
            state: 'error',
            message: 'Updates are only available in packaged builds (build installer/portable and run that build).'
        });
        return { ok: false, error: 'not_packaged' };
    }

    const cfg = ensureUpdateConfigOrExplain();
    if (!cfg.ok) return { ok: false, error: cfg.error };

    try {
        await autoUpdater.checkForUpdates();
        return { ok: true };
    } catch (err) {
        const msg = err?.message || String(err);
        sendUpdaterStatus({ state: 'error', message: msg });
        return { ok: false, error: msg };
    }
});

ipcMain.handle('updater-update-now', async () => {
    initAutoUpdater();

    if (!app.isPackaged) {
        sendUpdaterStatus({
            state: 'error',
            message: 'Updates are only available in packaged builds (build installer/portable and run that build).'
        });
        return { ok: false, error: 'not_packaged' };
    }

    const cfg = ensureUpdateConfigOrExplain();
    if (!cfg.ok) return { ok: false, error: cfg.error };

    try {
        // If update is already downloaded (rare), just install.
        installAfterDownload = true;

        // Ensure we have an update available; if not, tell user.
        const result = await autoUpdater.checkForUpdates();
        const available = !!result?.updateInfo?.version;
        if (!available) {
            installAfterDownload = false;
            sendUpdaterStatus({ state: 'not-available' });
            return { ok: true, status: 'not-available' };
        }

        await autoUpdater.downloadUpdate();
        // quitAndInstall will be triggered in update-downloaded.
        return { ok: true };
    } catch (err) {
        installAfterDownload = false;
        const msg = err?.message || String(err);
        sendUpdaterStatus({ state: 'error', message: msg });
        return { ok: false, error: msg };
    }
});

// ===== IPC Handlers for Network =====

ipcMain.handle('net-request', async (event, options = {}) => {
    try {
        const method = (options.method || 'GET').toUpperCase();
        const url = String(options.url || '');
        const headers = options.headers && typeof options.headers === 'object' ? options.headers : {};
        const body = typeof options.body === 'string' ? options.body : null;

        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
            throw new Error('Only https URLs are allowed.');
        }
        if (parsed.hostname !== 'api.github.com') {
            throw new Error('Only api.github.com is allowed.');
        }

        return await new Promise((resolve, reject) => {
            const request = net.request({ method, url });
            for (const [k, v] of Object.entries(headers)) {
                if (typeof v === 'string') request.setHeader(k, v);
            }

            request.on('response', (response) => {
                const chunks = [];
                response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                response.on('end', () => {
                    const responseBody = Buffer.concat(chunks).toString('utf8');
                    const status = response.statusCode || 0;
                    resolve({ ok: status >= 200 && status < 300, status, body: responseBody });
                });
                response.on('error', reject);
            });

            request.on('error', reject);

            if (body) {
                request.write(body);
            }
            request.end();
        });
    } catch (err) {
        return { ok: false, status: 0, body: JSON.stringify({ error: err.message || String(err) }) };
    }
});

// ===== IPC Handler for Google OAuth =====

ipcMain.handle('google-oauth', async (event, clientId) => {
    return new Promise((resolve) => {
        // Use exact redirect URI that matches Google Cloud Console configuration
        // Try http://localhost first as it's commonly used
        const redirectUri = 'http://localhost';

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'token');
        authUrl.searchParams.set('scope', 'openid email profile');
        authUrl.searchParams.set('prompt', 'select_account');

        // Create auth window
        const authWindow = new BrowserWindow({
            width: 500,
            height: 700,
            parent: mainWindow,
            modal: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        let resolved = false;

        function handleCallback(url) {
            if (resolved) return;
            if (!url.startsWith('http://localhost')) return;

            try {
                // Extract access token from URL fragment (comes after #)
                const hashPart = url.split('#')[1];
                if (!hashPart) return;

                const params = new URLSearchParams(hashPart);
                const accessToken = params.get('access_token');

                if (accessToken) {
                    resolved = true;
                    authWindow.close();
                    resolve({ success: true, accessToken });
                } else {
                    const error = params.get('error') || 'No access token received';
                    resolved = true;
                    authWindow.close();
                    resolve({ success: false, error });
                }
            } catch (err) {
                resolved = true;
                authWindow.close();
                resolve({ success: false, error: err.message });
            }
        }

        // Listen for navigation events
        authWindow.webContents.on('will-navigate', (event, url) => {
            handleCallback(url);
        });

        authWindow.webContents.on('will-redirect', (event, url) => {
            handleCallback(url);
        });

        authWindow.webContents.on('did-navigate', (event, url) => {
            handleCallback(url);
        });

        authWindow.loadURL(authUrl.toString());

        authWindow.on('closed', () => {
            if (!resolved) {
                resolve({ success: false, error: 'Window closed by user' });
            }
        });
    });
});

