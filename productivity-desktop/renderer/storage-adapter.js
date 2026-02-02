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
        create: (notificationId, options, callback) => {
            if (typeof electronAPI !== 'undefined') {
                electronAPI.notifications.show(options.title || 'Notification', {
                    body: options.message || '',
                    silent: false
                });
            } else if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(options.title || 'Notification', {
                    body: options.message || ''
                });
            }
            if (callback) callback(notificationId);
        },
        clear: (notificationId, callback) => {
            if (callback) callback(true);
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
        getURL: (path) => path
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
