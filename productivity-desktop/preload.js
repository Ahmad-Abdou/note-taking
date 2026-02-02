const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Storage API (replaces chrome.storage.local)
    storage: {
        get: (key) => ipcRenderer.invoke('store-get', key),
        set: (key, value) => ipcRenderer.invoke('store-set', key, value),
        delete: (key) => ipcRenderer.invoke('store-delete', key),
        getAll: () => ipcRenderer.invoke('store-get-all'),
        clear: () => ipcRenderer.invoke('store-clear')
    },

    // Notifications API
    notifications: {
        show: (title, options) => ipcRenderer.invoke('show-notification', title, options)
    },

    // Window controls
    window: {
        minimize: () => ipcRenderer.invoke('minimize-window'),
        maximize: () => ipcRenderer.invoke('maximize-window'),
        close: () => ipcRenderer.invoke('close-window')
    },

    // Auto-start settings
    autoStart: {
        set: (enable) => ipcRenderer.invoke('set-auto-start', enable),
        get: () => ipcRenderer.invoke('get-auto-start')
    },

    // Network API (used for Account Sync to avoid file:// CORS issues)
    net: {
        request: (options) => ipcRenderer.invoke('net-request', options)
    },

    // Google OAuth for Firebase authentication
    googleOAuth: (clientId) => ipcRenderer.invoke('google-oauth', clientId),

    // Auto-updates (desktop app)
    updates: {
        getVersion: () => ipcRenderer.invoke('updater-get-version'),
        check: () => ipcRenderer.invoke('updater-check'),
        updateNow: () => ipcRenderer.invoke('updater-update-now'),
        onStatus: (callback) => {
            const listener = (event, payload) => callback(payload);
            ipcRenderer.on('updater-status', listener);
            return () => ipcRenderer.removeListener('updater-status', listener);
        }
    },

    // Event listeners from main process
    onStartFocus: (callback) => {
        ipcRenderer.on('start-focus', (event, minutes) => callback(minutes));
    }
});

// Also provide a compatibility layer for chrome.storage.local usage
contextBridge.exposeInMainWorld('chromeStorageCompat', {
    local: {
        get: async (keys, callback) => {
            const result = {};
            if (Array.isArray(keys)) {
                for (const key of keys) {
                    result[key] = await ipcRenderer.invoke('store-get', key);
                }
            } else if (typeof keys === 'string') {
                result[keys] = await ipcRenderer.invoke('store-get', keys);
            } else if (typeof keys === 'object') {
                for (const key of Object.keys(keys)) {
                    const value = await ipcRenderer.invoke('store-get', key);
                    result[key] = value !== undefined ? value : keys[key];
                }
            }
            if (callback) callback(result);
            return result;
        },
        set: async (items, callback) => {
            for (const [key, value] of Object.entries(items)) {
                await ipcRenderer.invoke('store-set', key, value);
            }
            if (callback) callback();
        },
        remove: async (keys, callback) => {
            if (Array.isArray(keys)) {
                for (const key of keys) {
                    await ipcRenderer.invoke('store-delete', key);
                }
            } else {
                await ipcRenderer.invoke('store-delete', keys);
            }
            if (callback) callback();
        },
        clear: async (callback) => {
            await ipcRenderer.invoke('store-clear');
            if (callback) callback();
        }
    }
});
