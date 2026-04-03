/**
 * Storage and Runtime API Polyfill
 * Provides compatibility layer for chrome.storage.local and chrome.runtime APIs
 * when running in non-extension contexts (testing, desktop app, etc.)
 */

// Initialize chrome object if it doesn't exist
if (typeof chrome === 'undefined') {
    window.chrome = {};
}

// Polyfill chrome.storage.local if it doesn't exist
if (!chrome.storage) {
    chrome.storage = {};
}

if (!chrome.storage.local) {
    chrome.storage.local = {
        get: function(keys, callback) {
            const result = {};
            
            // Handle different key types
            if (typeof keys === 'string') {
                keys = [keys];
            }
            
            if (Array.isArray(keys)) {
                keys.forEach(key => {
                    try {
                        const value = localStorage.getItem(key);
                        if (value !== null) {
                            result[key] = JSON.parse(value);
                        }
                    } catch (e) {
                        console.error('Error reading from localStorage:', e);
                    }
                });
            } else if (typeof keys === 'object' && keys !== null) {
                // Handle default values object
                Object.keys(keys).forEach(key => {
                    try {
                        const value = localStorage.getItem(key);
                        if (value !== null) {
                            result[key] = JSON.parse(value);
                        } else {
                            result[key] = keys[key]; // Use default value
                        }
                    } catch (e) {
                        console.error('Error reading from localStorage:', e);
                        result[key] = keys[key]; // Use default value
                    }
                });
            } else if (!keys) {
                // Get all keys
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    try {
                        const value = localStorage.getItem(key);
                        if (value !== null) {
                            result[key] = JSON.parse(value);
                        }
                    } catch (e) {
                        console.error('Error reading from localStorage:', e);
                    }
                }
            }
            
            // Support both callback and Promise-based usage (Chrome API supports both)
            const promise = Promise.resolve(result);
            if (callback) {
                callback(result);
            }
            return promise;
        },
        
        set: function(items, callback) {
            try {
                const changes = {};
                Object.entries(items).forEach(([key, value]) => {
                    const oldValueStr = localStorage.getItem(key);
                    const oldValue = oldValueStr !== null ? JSON.parse(oldValueStr) : undefined;
                    localStorage.setItem(key, JSON.stringify(value));
                    changes[key] = { oldValue, newValue: value };
                });
                
                const promise = Promise.resolve();
                if (Object.keys(changes).length > 0 && chrome.storage.onChanged && chrome.storage.onChanged._trigger) {
                    chrome.storage.onChanged._trigger(changes);
                }
                if (callback) {
                    callback();
                }
                return promise;
            } catch (e) {
                console.error('Error writing to localStorage:', e);
                const promise = Promise.reject(e);
                if (callback) {
                    callback();
                }
                return promise;
            }
        },
        
        remove: function(keys, callback) {
            try {
                const keysArray = Array.isArray(keys) ? keys : [keys];
                const changes = {};
                keysArray.forEach(key => {
                    const oldValueStr = localStorage.getItem(key);
                    const oldValue = oldValueStr !== null ? JSON.parse(oldValueStr) : undefined;
                    if (oldValue !== undefined) {
                        changes[key] = { oldValue, newValue: undefined };
                    }
                    localStorage.removeItem(key);
                });
                
                const promise = Promise.resolve();
                if (Object.keys(changes).length > 0 && chrome.storage.onChanged && chrome.storage.onChanged._trigger) {
                    chrome.storage.onChanged._trigger(changes);
                }
                if (callback) {
                    callback();
                }
                return promise;
            } catch (e) {
                console.error('Error removing from localStorage:', e);
                const promise = Promise.reject(e);
                if (callback) {
                    callback();
                }
                return promise;
            }
        },
        
        clear: function(callback) {
            try {
                localStorage.clear();
                const promise = Promise.resolve();
                if (chrome.storage.onChanged && chrome.storage.onChanged._trigger) {
                    // Difficult to know what was cleared, stub triggering if needed
                    // Event does not contain individual keys
                }
                if (callback) {
                    callback();
                }
                return promise;
            } catch (e) {
                console.error('Error clearing localStorage:', e);
                const promise = Promise.reject(e);
                if (callback) {
                    callback();
                }
                return promise;
            }
        }
    };
}

// Polyfill chrome.storage.onChanged if needed
if (!chrome.storage.onChanged) {
    const _storageListeners = new Set();
    chrome.storage.onChanged = {
        addListener: function(callback) {
            _storageListeners.add(callback);
        },
        removeListener: function(callback) {
            _storageListeners.delete(callback);
        },
        _trigger: function(changes, areaName = 'local') {
            _storageListeners.forEach(cb => {
                try { cb(changes, areaName); } catch (e) { console.error('Error in storage listener:', e); }
            });
        }
    };

    // Listen to localStorage changes from other tabs
    window.addEventListener('storage', (e) => {
        if (e.storageArea !== localStorage) return;
        if (!e.key) {
            // clear() was called
            return;
        }
        try {
            const oldValue = e.oldValue ? JSON.parse(e.oldValue) : undefined;
            const newValue = e.newValue ? JSON.parse(e.newValue) : undefined;
            chrome.storage.onChanged._trigger({
                [e.key]: { oldValue, newValue }
            });
        } catch (err) {
            console.error('Error parsing storage event:', err);
        }
    });
}

// Polyfill chrome.runtime if it doesn't exist
if (!chrome.runtime) {
    chrome.runtime = {};
}

// Polyfill chrome.runtime.onMessage if it doesn't exist
if (!chrome.runtime.onMessage) {
    let _warnedOnMessage = false;
    chrome.runtime.onMessage = {
        addListener: function(callback) {
            // Stub for compatibility - in a real extension this would handle messages
            if (!_warnedOnMessage) {
                console.warn('chrome.runtime.onMessage.addListener is not fully supported in polyfill');
                _warnedOnMessage = true;
            }
            return true;
        },
        removeListener: function(callback) {
            // Stub for compatibility
        }
    };
}

// Polyfill chrome.runtime.sendMessage if it doesn't exist
if (!chrome.runtime.sendMessage) {
    let _warnedSendMessage = false;
    chrome.runtime.sendMessage = function(message, callback) {
        if (!_warnedSendMessage) {
            console.warn('chrome.runtime.sendMessage is not fully supported in polyfill');
            _warnedSendMessage = true;
        }
        if (callback) {
            callback();
        }
        return Promise.resolve();
    };
}

console.log('Storage and Runtime API polyfill initialized');

