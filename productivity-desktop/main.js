const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification, globalShortcut, net, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');

// In development, use an isolated userData directory so running the dev app
// doesn't fight the installed build for the single-instance lock.
// This must happen before electron-store (and anything else) touches userData.
try {
    if (!app.isPackaged) {
        const devUserData = path.join(app.getPath('appData'), 'productivity-hub-desktop-dev');
        app.setPath('userData', devUserData);
    }
} catch (_) {
    // ignore
}

// ===== Diagnostics logging (disk-backed) =====

let diagnosticsLogFilePath = null;

function safeStringify(value) {
    try {
        if (typeof value === 'string') return value;
        return JSON.stringify(value);
    } catch (_) {
        try {
            return String(value);
        } catch {
            return '[unstringifiable]';
        }
    }
}

function resolveDiagnosticsDir() {
    // Prefer Electron's userData when available; fall back to env vars.
    try {
        // In most cases this works even before 'ready', but guard just in case.
        const userData = app.getPath('userData');
        if (userData) return path.join(userData, 'logs');
    } catch (_) {
        // ignore
    }

    const base = process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd();
    return path.join(base, 'ProductivityHub', 'logs');
}

function getDiagnosticsLogFilePath() {
    if (diagnosticsLogFilePath) return diagnosticsLogFilePath;
    const dir = resolveDiagnosticsDir();
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (_) {
        // ignore
    }
    diagnosticsLogFilePath = path.join(dir, 'desktop.log');
    return diagnosticsLogFilePath;
}

function appendDiagnosticsLog(line) {
    try {
        const filePath = getDiagnosticsLogFilePath();
        fs.appendFileSync(filePath, line + '\n', { encoding: 'utf8' });
    } catch (_) {
        // ignore
    }
}

function diag(level, message, extra) {
    const ts = new Date().toISOString();
    const base = `[${ts}] [${process.pid}] [${level}] ${message}`;
    const suffix = extra === undefined ? '' : ` ${safeStringify(extra)}`;
    appendDiagnosticsLog(base + suffix);
}

function diagError(prefix, err) {
    try {
        const payload = {
            message: err?.message || String(err),
            stack: err?.stack || null,
            name: err?.name || null
        };
        diag('error', prefix, payload);
    } catch (_) {
        diag('error', prefix, String(err));
    }
}

process.on('uncaughtException', (err) => {
    diagError('uncaughtException', err);
});

process.on('unhandledRejection', (reason) => {
    diag('error', 'unhandledRejection', {
        reason: safeStringify(reason),
        stack: reason?.stack || null
    });
});

// Allow audio to play without user gesture
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Initialize persistent storage
const store = new Store();

// Safe mode (auto-enable after a renderer crash): disable GPU acceleration.
// This mitigates common Windows black-screen/render crashes caused by GPU driver issues.
let safeModeGpuDisabled = false;
try {
    safeModeGpuDisabled = store.get('safeModeDisableGpu') === true;
} catch (_) {
    safeModeGpuDisabled = false;
}

if (safeModeGpuDisabled) {
    try {
        // Must be called before app is ready.
        app.disableHardwareAcceleration();
        app.commandLine.appendSwitch('disable-gpu');

        // Extra mitigations for common Windows black-screen issues.
        // Only enabled in safe mode to avoid changing default behavior for everyone.
        app.commandLine.appendSwitch('disable-gpu-compositing');
        app.commandLine.appendSwitch('disable-direct-composition');
        app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

        // Force software rendering via SwiftShader (helps with access-violation crashes on some drivers).
        // Mirrors Chromium flags often seen when SwiftShader is used.
        app.commandLine.appendSwitch('use-gl', 'angle');
        app.commandLine.appendSwitch('use-angle', 'swiftshader-webgl');

        // Last-resort stability toggle: disable Chromium sandbox in safe mode only.
        // (Keeps default behavior unchanged unless we've already observed crashes.)
        app.commandLine.appendSwitch('no-sandbox');
        app.commandLine.appendSwitch('disable-setuid-sandbox');
    } catch (_) {
        // ignore
    }
}

// Early boot diagnostics (helps confirm whether we reached app ready/window creation)
try {
    diag('info', 'app boot', {
        isPackaged: app.isPackaged,
        version: app.getVersion?.(),
        userData: (() => {
            try {
                return app.getPath('userData');
            } catch {
                return null;
            }
        })(),
        safeModeDisableGpu: safeModeGpuDisabled
    });
} catch (_) {
    // ignore
}

let mainWindow;
let tray;
let isQuitting = false;

// Prevent infinite relaunch loops if the renderer is repeatedly crashing.
let rendererCrashRelaunchInProgress = false;
let rendererCrashRelaunchCount = 0;
let lastRendererCrashRelaunchAt = 0;

const RENDERER_CRASH_RELAUNCH_COOLDOWN_MS = 60_000;
const STORE_KEY_LAST_CRASH_RELAUNCH_AT = 'lastRendererCrashRelaunchAtMs';

let didStartApp = false;

function safeModeCleanupCachesOnce() {
    if (!safeModeGpuDisabled) return;

    // Only run once per user profile to avoid unnecessary disk churn.
    try {
        if (store.get('safeModeDidCleanupCaches') === true) return;
    } catch (_) {
        // ignore
    }

    let userData = null;
    try {
        userData = app.getPath('userData');
    } catch (_) {
        userData = null;
    }
    if (!userData) return;

    const targets = [
        'GPUCache',
        'Code Cache',
        'Cache',
        'DawnCache',
        'ShaderCache'
    ];

    const deleted = [];
    for (const name of targets) {
        try {
            const p = path.join(userData, name);
            if (fs.existsSync(p)) {
                fs.rmSync(p, { recursive: true, force: true });
                deleted.push(name);
            }
        } catch (_) {
            // ignore
        }
    }

    diag('info', 'safeMode cache cleanup', { deleted });
    try {
        store.set('safeModeDidCleanupCaches', true);
    } catch (_) {
        // ignore
    }
}

function wireSecondInstanceHandler() {
    // Focus existing instance when user tries to open a second one.
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
}

function startApp() {
    if (didStartApp) return;
    didStartApp = true;

    diag('info', 'startApp');

    // If we've entered safe mode due to crashes, do a one-time cleanup of Chromium caches.
    // This often resolves persistent renderer crash loops without wiping user data.
    try {
        safeModeCleanupCachesOnce();
    } catch (_) {
        // ignore
    }

    createWindow();
    createTray();
    registerShortcuts();
    initAutoUpdater();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}

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

    diag('info', 'prepareToQuit', { reason });
}

// ===== Auto Update (electron-updater) =====

let updaterInitialized = false;
let installAfterDownload = false;

function isPortableBuild() {
    // electron-builder portable launcher sets these env vars on Windows.
    return !!(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR);
}

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

    diag('info', 'initAutoUpdater', { isPackaged: app.isPackaged, isPortable: isPortableBuild() });

    // Only meaningful for packaged apps (installed/portable).
    // In development, this will typically error due to missing update config.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        sendUpdaterStatus({ state: 'checking' });
        diag('info', 'updater checking-for-update');
    });

    autoUpdater.on('update-available', (info) => {
        sendUpdaterStatus({
            state: 'available',
            version: info?.version,
            releaseName: info?.releaseName,
            releaseDate: info?.releaseDate
        });
        diag('info', 'updater update-available', { version: info?.version });
    });

    autoUpdater.on('update-not-available', (info) => {
        sendUpdaterStatus({ state: 'not-available', version: info?.version });
        diag('info', 'updater update-not-available', { version: info?.version });
    });

    autoUpdater.on('error', (err) => {
        sendUpdaterStatus({ state: 'error', message: err?.message || String(err) });
        diagError('updater error', err);
    });

    autoUpdater.on('download-progress', (progress) => {
        sendUpdaterStatus({
            state: 'downloading',
            percent: typeof progress?.percent === 'number' ? progress.percent : null,
            transferred: progress?.transferred,
            total: progress?.total,
            bytesPerSecond: progress?.bytesPerSecond
        });
        diag('info', 'updater download-progress', {
            percent: typeof progress?.percent === 'number' ? progress.percent : null
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        sendUpdaterStatus({
            state: 'downloaded',
            version: info?.version,
            releaseName: info?.releaseName,
            releaseDate: info?.releaseDate
        });

        diag('info', 'updater update-downloaded', { version: info?.version });

        if (installAfterDownload) {
            // Reset first to avoid loops.
            installAfterDownload = false;
            // Give renderer a moment to paint status then restart.
            setTimeout(() => {
                try {
                    // Ensure the app will actually quit.
                    // Our window close handler normally hides to tray.
                    // IMPORTANT: don't destroy the UI surfaces yet; if quitAndInstall throws,
                    // tearing down the window/tray would look like a black-screen crash.
                    isQuitting = true;
                    diag('info', 'updater quitAndInstall starting');

                    // Trigger installer (non-silent) and restart.
                    // This is more reliable for relaunch on Windows than fully silent installs,
                    // while our NSIS hook still prevents "app cannot be closed" prompts.
                    autoUpdater.quitAndInstall(false, true);
                } catch (e) {
                    // Restore normal close-to-tray behavior if the install didn't start.
                    isQuitting = false;
                    sendUpdaterStatus({ state: 'error', message: e?.message || String(e) });
                    diagError('updater quitAndInstall failed', e);
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
    diag('info', 'createWindow');
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

    const indexPath = path.join(__dirname, 'renderer', 'index.html');
    Promise.resolve(mainWindow.loadFile(indexPath)).catch((e) => {
        diagError('mainWindow.loadFile failed', e);
    });

    // Renderer load/crash diagnostics (helps when the UI becomes "black" with no stack trace)
    try {
        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            diag('error', 'webContents did-fail-load', {
                errorCode,
                errorDescription,
                validatedURL
            });
            // If load fails, still show the window so it's not perceived as a "black screen" crash.
            try {
                if (!mainWindow.isDestroyed()) mainWindow.show();
            } catch (_) {
                // ignore
            }
        });

        mainWindow.webContents.on('render-process-gone', (event, details) => {
            diag('error', 'webContents render-process-gone', details);

            // If the renderer crashed, enable safe-mode GPU disable for the next launch.
            try {
                if (details?.reason === 'crashed' || typeof details?.exitCode === 'number') {
                    store.set('safeModeDisableGpu', true);
                    diag('warn', 'safeModeDisableGpu enabled', {
                        reason: details?.reason,
                        exitCode: details?.exitCode
                    });
                }
            } catch (_) {
                // ignore
            }

            // Important: if the renderer crashes, the main process can stay alive (tray/lock held),
            // which makes the app appear "won't open" on the next launch.
            // Relaunch once so safe-mode (GPU disabled) can take effect immediately and the lock is released.
            try {
                const now = Date.now();
                const isCrash = details?.reason === 'crashed' || typeof details?.exitCode === 'number';
                const inMemoryCooldownOk = (now - lastRendererCrashRelaunchAt) > 15000;

                // Allow only one automatic relaunch per invocation.
                // This avoids stacking relaunch args and prevents endless relaunch loops.
                const alreadyRelaunchedThisInvocation = process.argv.includes('--relaunch-after-renderer-crash');

                let persistentCooldownOk = true;
                try {
                    const last = Number(store.get(STORE_KEY_LAST_CRASH_RELAUNCH_AT) || 0);
                    persistentCooldownOk = !Number.isFinite(last) || (now - last) > RENDERER_CRASH_RELAUNCH_COOLDOWN_MS;
                } catch (_) {
                    persistentCooldownOk = true;
                }

                const allowRelaunch = isCrash && !rendererCrashRelaunchInProgress && inMemoryCooldownOk && persistentCooldownOk;

                if (allowRelaunch && !alreadyRelaunchedThisInvocation) {
                    rendererCrashRelaunchInProgress = true;
                    rendererCrashRelaunchCount += 1;
                    lastRendererCrashRelaunchAt = now;

                    try {
                        store.set(STORE_KEY_LAST_CRASH_RELAUNCH_AT, now);
                    } catch (_) {
                        // ignore
                    }

                    diag('warn', 'renderer crashed; relaunching app', {
                        count: rendererCrashRelaunchCount,
                        safeModeDisableGpu: true
                    });

                    // Delay slightly to let diagnostics flush.
                    setTimeout(() => {
                        try {
                            const baseArgs = process.argv.slice(1).filter((a) => a !== '--relaunch-after-renderer-crash');
                            app.relaunch({ args: baseArgs.concat(['--relaunch-after-renderer-crash']) });
                        } catch (e) {
                            diagError('app.relaunch failed after renderer crash', e);
                        }

                        try {
                            // Exit hard to ensure the single-instance lock is released.
                            app.exit(0);
                        } catch (_) {
                            app.quit();
                        }
                    }, 700);
                } else if (isCrash && alreadyRelaunchedThisInvocation) {
                    // We already tried an automatic relaunch and still crashed: quit cleanly so we don't
                    // sit headless holding the single-instance lock.
                    diag('error', 'renderer crashed after relaunch; quitting');
                    try {
                        prepareToQuit('renderer_crash_after_relaunch');
                    } catch (_) {
                        // ignore
                    }
                    try {
                        app.quit();
                    } catch (_) {
                        // ignore
                    }
                } else if (isCrash && !persistentCooldownOk) {
                    // If we're crashing in a tight loop across relaunches, stop trying.
                    diag('error', 'renderer crash relaunch suppressed (cooldown)', {
                        cooldownMs: RENDERER_CRASH_RELAUNCH_COOLDOWN_MS
                    });
                    try {
                        prepareToQuit('renderer_crash_loop');
                    } catch (_) {
                        // ignore
                    }
                    try {
                        app.quit();
                    } catch (_) {
                        // ignore
                    }
                }
            } catch (_) {
                // ignore
            }
        });

        mainWindow.webContents.on('unresponsive', () => {
            diag('warn', 'webContents unresponsive');
        });
    } catch (_) {
        // ignore
    }

    // Show window when ready (with a fallback timer so we don't stay hidden forever)
    const readyFallback = setTimeout(() => {
        try {
            if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
                diag('warn', 'ready-to-show timeout; showing window');
                mainWindow.show();
            }
        } catch (_) {
            // ignore
        }
    }, 7000);

    mainWindow.once('ready-to-show', () => {
        clearTimeout(readyFallback);
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

// Single instance lock
// Note: During auto-update, the installer may relaunch the app very quickly.
// If the old instance is still exiting, the lock can be temporarily unavailable.
// We retry once after a short delay to avoid "updated then immediately closed".
function acquireSingleInstanceLockWithRetry() {
    const gotLock = app.requestSingleInstanceLock();
    diag('info', 'singleInstanceLock initial', { gotLock });
    if (gotLock) return true;

    const maxAttempts = 6;
    let attempt = 1;

    const tryAcquire = () => {
        attempt++;
        try {
            const got = app.requestSingleInstanceLock();
            diag('info', 'singleInstanceLock retry', { attempt, maxAttempts, got });
            if (got) {
                wireSecondInstanceHandler();
                app.whenReady().then(startApp);
                return;
            }

            if (attempt >= maxAttempts) {
                diag('error', 'singleInstanceLock failed; quitting', { attempt, maxAttempts });
                app.quit();
                return;
            }

            setTimeout(tryAcquire, 2500);
        } catch (e) {
            diagError('singleInstanceLock retry exception', e);
            app.quit();
        }
    };

    setTimeout(tryAcquire, 2500);
    return false;
}

// Renderer error forwarding for diagnostics
ipcMain.on('renderer-error', (event, payload) => {
    diag('error', 'renderer-error', payload);
});

if (acquireSingleInstanceLockWithRetry()) {
    wireSecondInstanceHandler();
    app.whenReady().then(startApp);
}

app.on('ready', () => {
    diag('info', 'app ready');
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
    try {
        const safeTitle = typeof title === 'string' && title.trim() ? title.trim() : 'Notification';
        const safeOptions = options && typeof options === 'object' ? options : {};
        const body =
            typeof safeOptions.body === 'string'
                ? safeOptions.body
                : (safeOptions.body == null ? '' : String(safeOptions.body));
        const silent = !!safeOptions.silent;

        const iconPath = path.join(__dirname, 'assets', 'icon.png');
        const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

        const notification = new Notification({
            title: safeTitle,
            body,
            icon,
            silent
        });
        notification.show();
        return true;
    } catch (e) {
        try {
            console.error('[main] Failed to show notification:', e);
        } catch (_) {
            // ignore
        }
        return false;
    }
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

// ===== IPC Handler: Open External URLs =====

ipcMain.handle('open-external', async (event, url) => {
    try {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        if (!trimmed) return false;

        // Basic protocol allowlist for safety.
        const parsed = new URL(trimmed);
        const protocol = (parsed.protocol || '').toLowerCase();
        if (!['http:', 'https:', 'mailto:'].includes(protocol)) return false;

        await shell.openExternal(parsed.href);
        return true;
    } catch (e) {
        return false;
    }
});

// ===== IPC Handlers for Auto Updates =====

ipcMain.handle('updater-get-version', () => {
    return {
        version: app.getVersion(),
        isPackaged: app.isPackaged,
        isPortable: isPortableBuild(),
        exePath: app.getPath('exe')
    };
});

ipcMain.handle('updater-check', async () => {
    initAutoUpdater();

    if (isPortableBuild()) {
        sendUpdaterStatus({
            state: 'error',
            message: 'Auto-update is not supported in the portable EXE. Download and install the "Setup" (NSIS) build from GitHub Releases, then use in-app updates.'
        });
        return { ok: false, error: 'portable_not_supported' };
    }

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

    if (isPortableBuild()) {
        sendUpdaterStatus({
            state: 'error',
            message: 'Auto-update is not supported in the portable EXE. Download and install the "Setup" (NSIS) build from GitHub Releases, then use in-app updates.'
        });
        return { ok: false, error: 'portable_not_supported' };
    }

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

