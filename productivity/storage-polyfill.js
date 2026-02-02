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
                Object.entries(items).forEach(([key, value]) => {
                    localStorage.setItem(key, JSON.stringify(value));
                });
                const promise = Promise.resolve();
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
                keysArray.forEach(key => {
                    localStorage.removeItem(key);
                });
                const promise = Promise.resolve();
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
    chrome.storage.onChanged = {
        addListener: function(callback) {
            // Stub for compatibility - not fully implemented
            console.warn('chrome.storage.onChanged.addListener is not fully supported in polyfill');
        },
        removeListener: function(callback) {
            // Stub for compatibility
        }
    };
}

// Polyfill chrome.runtime if it doesn't exist
if (!chrome.runtime) {
    chrome.runtime = {};
}

// Polyfill chrome.runtime.onMessage if it doesn't exist
if (!chrome.runtime.onMessage) {
    chrome.runtime.onMessage = {
        addListener: function(callback) {
            // Stub for compatibility - in a real extension this would handle messages
            console.warn('chrome.runtime.onMessage.addListener is not fully supported in polyfill');
            return true;
        },
        removeListener: function(callback) {
            // Stub for compatibility
        }
    };
}

// Polyfill chrome.runtime.sendMessage if it doesn't exist
if (!chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage = function(message, callback) {
        console.warn('chrome.runtime.sendMessage is not fully supported in polyfill');
        if (callback) {
            callback();
        }
        return Promise.resolve();
    };
}

console.log('Storage and Runtime API polyfill initialized');

