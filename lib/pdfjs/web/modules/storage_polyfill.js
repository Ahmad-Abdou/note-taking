// Fix for Electron/Iframe environment: Polyfill chrome.storage if missing
if (typeof chrome === 'undefined') {
    window.chrome = {};
}
if (!chrome.storage) {
    chrome.storage = {};
}
if (!chrome.storage.local) {
    chrome.storage.local = {
        get: (keys, callback) => {
            const result = {};
            if (typeof keys === 'string') keys = [keys];
            if (Array.isArray(keys)) {
                keys.forEach(key => {
                    try {
                        const value = localStorage.getItem(key);
                        if (value) result[key] = JSON.parse(value);
                    } catch (e) {
                        console.error('Error reading from localStorage', e);
                    }
                });
            }
            if (callback) callback(result);
            return Promise.resolve(result);
        },
        set: (items, callback) => {
            for (const key in items) {
                try {
                    localStorage.setItem(key, JSON.stringify(items[key]));
                } catch (e) {
                    console.error('Error writing to localStorage', e);
                }
            }
            if (callback) callback();
            return Promise.resolve();
        }
    };
}
if (!chrome.storage.onChanged) {
    chrome.storage.onChanged = {
        addListener: (callback) => {
            // Stub
        }
    };
}
