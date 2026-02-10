/**
 * Storage Adapter for Desktop Application
 * Provides compatibility layer between chrome.storage.local and Electron's electron-store
 */

// Initialize chrome object for compatibility
if (typeof chrome === 'undefined') {
    window.chrome = {};
}

// Use the compatibility layer from preload
if (typeof chromeStorageCompat !== 'undefined') {
    window.chrome.storage = chromeStorageCompat;
} else {
    // Fallback to localStorage if electron APIs not available
    window.chrome.storage = {
        local: {
            get: (keys, callback) => {
                const result = {};
                if (typeof keys === 'string') {
                    const value = localStorage.getItem(keys);
                    result[keys] = value ? JSON.parse(value) : undefined;
                } else if (Array.isArray(keys)) {
                    keys.forEach(key => {
                        const value = localStorage.getItem(key);
                        result[key] = value ? JSON.parse(value) : undefined;
                    });
                } else if (typeof keys === 'object') {
                    Object.keys(keys).forEach(key => {
                        const value = localStorage.getItem(key);
                        result[key] = value ? JSON.parse(value) : keys[key];
                    });
                }
                if (callback) callback(result);
                return Promise.resolve(result);
            },
            set: (items, callback) => {
                Object.entries(items).forEach(([key, value]) => {
                    localStorage.setItem(key, JSON.stringify(value));
                });
                if (callback) callback();
                return Promise.resolve();
            },
            remove: (keys, callback) => {
                if (Array.isArray(keys)) {
                    keys.forEach(key => localStorage.removeItem(key));
                } else {
                    localStorage.removeItem(keys);
                }
                if (callback) callback();
                return Promise.resolve();
            },
            clear: (callback) => {
                localStorage.clear();
                if (callback) callback();
                return Promise.resolve();
            }
        }
    };
}

// Add chrome.notifications compatibility
if (typeof chrome.notifications === 'undefined') {
    window.chrome.notifications = {
        create: (...args) => {
            // Support both Chrome signatures:
            // - create(options, callback?)  (MV3 style in our code)
            // - create(notificationId, options, callback?)
            let notificationId;
            let options;
            let callback;

            if (args.length >= 1 && typeof args[0] === 'object') {
                options = args[0];
                callback = typeof args[1] === 'function' ? args[1] : undefined;
            } else {
                notificationId = typeof args[0] === 'string' ? args[0] : undefined;
                options = args[1];
                callback = typeof args[2] === 'function' ? args[2] : undefined;
            }

            const resolvedId =
                notificationId ||
                options?.id ||
                options?.tag ||
                `desktop_${Date.now()}`;

            try {
                if (typeof electronAPI !== 'undefined' && electronAPI?.notifications?.show) {
                    electronAPI.notifications.show(options?.title || 'Notification', {
                        body: options?.message || options?.body || '',
                        silent: false
                    }).catch(() => { });
                } else if ('Notification' in window) {
                    // Best-effort web notification fallback (should not throw / crash).
                    if (Notification.permission === 'granted') {
                        new Notification(options?.title || 'Notification', {
                            body: options?.message || options?.body || ''
                        });
                    } else if (Notification.permission !== 'denied') {
                        // Request permission asynchronously; don't block/create sync.
                        Notification.requestPermission().catch(() => { });
                    }
                }
            } catch (e) {
                console.error('[storage-adapter] Failed to show notification:', e);
            }

            try {
                callback?.(resolvedId);
            } catch (_) {
                // ignore
            }

            return Promise.resolve(resolvedId);
        },
        clear: (notificationId, callback) => {
            try {
                callback?.(true);
            } catch (_) {
                // ignore
            }
            return Promise.resolve(true);
        },
        onClicked: {
            addListener: () => { }
        }
    };
}

// Request notification permission
if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission();
}

// Add runtime compatibility (empty stubs)
if (typeof chrome.runtime === 'undefined') {
    window.chrome.runtime = {
        sendMessage: () => { },
        onMessage: {
            addListener: () => { }
        },
        getURL: (path) => {\n            // Map extension icon paths to desktop asset paths\n            if (path === 'icons/icon48.png') return '../assets/icon48.png';\n            if (path === 'icons/icon128.png') return '../assets/icon128.png';\n            return path;\n        }
    };
}

// Add tabs compatibility (empty stubs)
if (typeof chrome.tabs === 'undefined') {
    window.chrome.tabs = {
        query: (queryInfo, callback) => { if (callback) callback([]); },
        sendMessage: () => { }
    };
}

// Listen for focus session from system tray
if (typeof electronAPI !== 'undefined') {
    electronAPI.onStartFocus((minutes) => {
        // Trigger focus mode
        const event = new CustomEvent('start-focus-session', { detail: { minutes } });
        window.dispatchEvent(event);
    });
}

console.log('Storage adapter initialized for desktop application');
