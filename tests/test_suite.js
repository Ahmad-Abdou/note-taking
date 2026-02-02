/**
 * Comprehensive Test Suite for Note Taking Extension
 * Tests all major features and components
 */

// Test state
const testState = {
    passed: 0,
    failed: 0,
    pending: 0,
    running: false,
    results: [],
    logs: []
};

// Test categories and their tests
const testCategories = {
    'Chrome Storage API': {
        icon: '💾',
        tests: [
            {
                name: 'chrome.storage.local is available',
                fn: async () => {
                    if (typeof chrome === 'undefined' || !chrome.storage) {
                        throw new Error('Chrome storage API not available');
                    }
                    return true;
                }
            },
            {
                name: 'Can write to storage',
                fn: async () => {
                    await new Promise((resolve, reject) => {
                        chrome.storage.local.set({ testKey: 'testValue' }, () => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else {
                                resolve();
                            }
                        });
                    });
                    return true;
                }
            },
            {
                name: 'Can read from storage',
                fn: async () => {
                    const result = await new Promise((resolve, reject) => {
                        chrome.storage.local.get(['testKey'], (result) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else {
                                resolve(result);
                            }
                        });
                    });
                    if (result.testKey !== 'testValue') {
                        throw new Error(`Expected 'testValue', got '${result.testKey}'`);
                    }
                    return true;
                }
            },
            {
                name: 'Can delete from storage',
                fn: async () => {
                    await new Promise((resolve, reject) => {
                        chrome.storage.local.remove(['testKey'], () => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else {
                                resolve();
                            }
                        });
                    });
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['testKey'], resolve);
                    });
                    if (result.testKey !== undefined) {
                        throw new Error('Key was not deleted');
                    }
                    return true;
                }
            }
        ]
    },

    'Research Library': {
        icon: '📚',
        tests: [
            {
                name: 'Library storage structure is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['researchLibrary', 'researchFolders'], resolve);
                    });
                    // Should be arrays or undefined
                    if (result.researchLibrary && !Array.isArray(result.researchLibrary)) {
                        throw new Error('researchLibrary should be an array');
                    }
                    if (result.researchFolders && !Array.isArray(result.researchFolders)) {
                        throw new Error('researchFolders should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Can add item to library',
                fn: async () => {
                    const testItem = {
                        id: 'test-' + Date.now(),
                        title: 'Test PDF',
                        author: 'Test Author',
                        url: 'https://example.com/test.pdf',
                        addedAt: new Date().toISOString(),
                        isFavorite: false,
                        tags: [],
                        folderId: null
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['researchLibrary'], resolve);
                    });
                    const library = current.researchLibrary || [];
                    library.push(testItem);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ researchLibrary: library }, resolve);
                    });

                    // Verify
                    const verify = await new Promise(resolve => {
                        chrome.storage.local.get(['researchLibrary'], resolve);
                    });
                    const found = verify.researchLibrary.find(i => i.id === testItem.id);
                    if (!found) {
                        throw new Error('Item was not saved');
                    }

                    // Cleanup
                    const cleaned = verify.researchLibrary.filter(i => i.id !== testItem.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ researchLibrary: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Can create folder',
                fn: async () => {
                    const testFolder = {
                        id: 'folder-test-' + Date.now(),
                        name: 'Test Folder',
                        color: '#4285f4',
                        createdAt: new Date().toISOString()
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['researchFolders'], resolve);
                    });
                    const folders = current.researchFolders || [];
                    folders.push(testFolder);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ researchFolders: folders }, resolve);
                    });

                    // Verify
                    const verify = await new Promise(resolve => {
                        chrome.storage.local.get(['researchFolders'], resolve);
                    });
                    const found = verify.researchFolders.find(f => f.id === testFolder.id);
                    if (!found) {
                        throw new Error('Folder was not saved');
                    }

                    // Cleanup
                    const cleaned = verify.researchFolders.filter(f => f.id !== testFolder.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ researchFolders: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Library item has required fields',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['researchLibrary'], resolve);
                    });
                    const library = result.researchLibrary || [];

                    if (library.length === 0) {
                        log('info', 'No items in library to validate');
                        return true;
                    }

                    const requiredFields = ['id', 'title', 'url', 'addedAt'];
                    for (const item of library) {
                        for (const field of requiredFields) {
                            if (item[field] === undefined) {
                                throw new Error(`Item ${item.id} missing required field: ${field}`);
                            }
                        }
                    }
                    return true;
                }
            }
        ]
    },

    'Bookmarks': {
        icon: '🔖',
        tests: [
            {
                name: 'Bookmarks storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['bookmarks'], resolve);
                    });
                    if (result.bookmarks && !Array.isArray(result.bookmarks)) {
                        throw new Error('Bookmarks should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Can add bookmark',
                fn: async () => {
                    const testBookmark = {
                        id: Date.now(),
                        title: 'Test Bookmark',
                        url: 'https://example.com/test.pdf',
                        page: 1,
                        date: new Date().toISOString()
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['bookmarks'], resolve);
                    });
                    const bookmarks = current.bookmarks || [];
                    bookmarks.push(testBookmark);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ bookmarks }, resolve);
                    });

                    // Cleanup
                    const cleaned = bookmarks.filter(b => b.id !== testBookmark.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ bookmarks: cleaned }, resolve);
                    });

                    return true;
                }
            }
        ]
    },

    'PDF Highlights': {
        icon: '🖍️',
        tests: [
            {
                name: 'Highlights storage structure is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(null, resolve);
                    });

                    // Check for any highlights_ prefixed keys
                    const highlightKeys = Object.keys(result).filter(k => k.startsWith('highlights_'));

                    for (const key of highlightKeys) {
                        if (!Array.isArray(result[key])) {
                            throw new Error(`${key} should be an array`);
                        }
                    }

                    log('info', `Found ${highlightKeys.length} highlight storage keys`);
                    return true;
                }
            },
            {
                name: 'Highlight items have required fields',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(null, resolve);
                    });

                    const highlightKeys = Object.keys(result).filter(k => k.startsWith('highlights_'));
                    const requiredFields = ['id', 'text', 'color', 'page'];

                    for (const key of highlightKeys) {
                        const highlights = result[key];
                        for (const h of highlights) {
                            for (const field of requiredFields) {
                                if (h[field] === undefined) {
                                    throw new Error(`Highlight missing field: ${field}`);
                                }
                            }
                        }
                    }

                    return true;
                }
            }
        ]
    },

    'PDF Notes': {
        icon: '📝',
        tests: [
            {
                name: 'Notes storage structure is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(null, resolve);
                    });

                    const noteKeys = Object.keys(result).filter(k => k.startsWith('notes_'));

                    for (const key of noteKeys) {
                        if (!Array.isArray(result[key])) {
                            throw new Error(`${key} should be an array`);
                        }
                    }

                    log('info', `Found ${noteKeys.length} notes storage keys`);
                    return true;
                }
            }
        ]
    },

    'Productivity Features': {
        icon: '⏱️',
        tests: [
            {
                name: 'Tasks storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['tasks'], resolve);
                    });
                    if (result.tasks && !Array.isArray(result.tasks)) {
                        throw new Error('Tasks should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Goals storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['goals'], resolve);
                    });
                    if (result.goals && !Array.isArray(result.goals)) {
                        throw new Error('Goals should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Blocked sites storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['blockedSites'], resolve);
                    });
                    if (result.blockedSites && !Array.isArray(result.blockedSites)) {
                        throw new Error('Blocked sites should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Focus sessions storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['focusSessions'], resolve);
                    });
                    if (result.focusSessions && !Array.isArray(result.focusSessions)) {
                        throw new Error('Focus sessions should be an array');
                    }
                    return true;
                }
            }
        ]
    },

    'Extension APIs': {
        icon: '🔌',
        tests: [
            {
                name: 'chrome.runtime is available',
                fn: async () => {
                    if (typeof chrome === 'undefined' || !chrome.runtime) {
                        throw new Error('chrome.runtime not available');
                    }
                    return true;
                }
            },
            {
                name: 'Can get extension URL',
                fn: async () => {
                    const url = chrome.runtime.getURL('');
                    if (!url || !url.startsWith('chrome-extension://')) {
                        throw new Error('Invalid extension URL: ' + url);
                    }
                    return true;
                }
            },
            {
                name: 'Manifest is accessible',
                fn: async () => {
                    const manifest = chrome.runtime.getManifest();
                    if (!manifest || !manifest.name) {
                        throw new Error('Could not get manifest');
                    }
                    log('info', `Extension: ${manifest.name} v${manifest.version}`);
                    return true;
                }
            }
        ]
    },

    'Vocabulary List': {
        icon: '📖',
        tests: [
            {
                name: 'Vocabulary storage is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['vocabulary'], resolve);
                    });
                    if (result.vocabulary && !Array.isArray(result.vocabulary)) {
                        throw new Error('Vocabulary should be an array');
                    }
                    return true;
                }
            },
            {
                name: 'Can add vocabulary item',
                fn: async () => {
                    const testWord = {
                        id: 'vocab-test-' + Date.now(),
                        word: 'test',
                        definition: 'A test word',
                        context: 'This is a test',
                        addedAt: new Date().toISOString()
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['vocabulary'], resolve);
                    });
                    const vocab = current.vocabulary || [];
                    vocab.push(testWord);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ vocabulary: vocab }, resolve);
                    });

                    // Cleanup
                    const cleaned = vocab.filter(v => v.id !== testWord.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ vocabulary: cleaned }, resolve);
                    });

                    return true;
                }
            }
        ]
    },

    'Data Integrity': {
        icon: '🔒',
        tests: [
            {
                name: 'No orphaned folder references',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['researchLibrary', 'researchFolders'], resolve);
                    });

                    const library = result.researchLibrary || [];
                    const folders = result.researchFolders || [];
                    const folderIds = new Set(folders.map(f => f.id));

                    for (const item of library) {
                        if (item.folderId && !folderIds.has(item.folderId)) {
                            throw new Error(`Item "${item.title}" references non-existent folder: ${item.folderId}`);
                        }
                    }

                    return true;
                }
            },
            {
                name: 'No duplicate IDs in library',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['researchLibrary'], resolve);
                    });

                    const library = result.researchLibrary || [];
                    const ids = library.map(i => i.id);
                    const uniqueIds = new Set(ids);

                    if (ids.length !== uniqueIds.size) {
                        throw new Error('Duplicate IDs found in library');
                    }

                    return true;
                }
            },
            {
                name: 'All dates are valid ISO strings',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(['researchLibrary', 'bookmarks'], resolve);
                    });

                    const items = [
                        ...(result.researchLibrary || []),
                        ...(result.bookmarks || [])
                    ];

                    for (const item of items) {
                        const dateFields = ['addedAt', 'lastOpened', 'date', 'createdAt'];
                        for (const field of dateFields) {
                            if (item[field]) {
                                const date = new Date(item[field]);
                                if (isNaN(date.getTime())) {
                                    throw new Error(`Invalid date in ${field}: ${item[field]}`);
                                }
                            }
                        }
                    }

                    return true;
                }
            }
        ]
    },

    'Storage Limits': {
        icon: '📊',
        tests: [
            {
                name: 'Check storage usage',
                fn: async () => {
                    return new Promise((resolve, reject) => {
                        chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
                            const mb = (bytesInUse / 1024 / 1024).toFixed(2);
                            const limit = 5; // Chrome local storage limit is ~5MB
                            const percentUsed = ((bytesInUse / (limit * 1024 * 1024)) * 100).toFixed(1);

                            log('info', `Storage used: ${mb}MB (${percentUsed}% of 5MB limit)`);

                            if (bytesInUse > limit * 1024 * 1024 * 0.9) {
                                log('warn', '⚠️ Storage is nearly full! Open PDF Viewer and use Storage Manager to clean up.');
                                log('info', 'Tip: Locally stored PDFs in Research Library take the most space.');
                                reject(new Error(`Storage ${percentUsed}% full. Remove local PDFs from library to free space.`));
                            } else if (bytesInUse > limit * 1024 * 1024 * 0.7) {
                                log('warn', `Storage is ${percentUsed}% full. Consider cleaning up soon.`);
                                resolve(true);
                            } else {
                                resolve(true);
                            }
                        });
                    });
                }
            }
        ]
    }
};

// Merge imported test modules if available
if (typeof window !== 'undefined') {
    const importedModules = [
        'focusSessionTests',
        'taskManagementTests',
        'scheduleTests',
        'notificationTests',
        'habitTests',
        'apiTests',
        'pdfViewerTests',
        'goalsAnalyticsTests',
        'siteBlockerTests'
    ];

    for (const moduleName of importedModules) {
        if (window[moduleName]) {
            Object.assign(testCategories, window[moduleName]);
        }
    }
}

// Logging function
function log(type, message) {
    const timestamp = new Date().toLocaleTimeString();
    testState.logs.push({ type, message, timestamp });

    const logContent = document.getElementById('logContent');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${timestamp}] ${message}`;
    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
}

// Render test categories
function renderCategories() {
    const container = document.getElementById('testCategories');
    container.innerHTML = '';

    for (const [categoryName, category] of Object.entries(testCategories)) {
        const categoryEl = document.createElement('div');
        categoryEl.className = 'test-category';

        const passed = category.tests.filter(t => t.status === 'passed').length;
        const failed = category.tests.filter(t => t.status === 'failed').length;

        categoryEl.innerHTML = `
            <div class="category-header">
                <h3>${category.icon} ${categoryName}</h3>
                <div class="category-stats">
                    <span class="passed">${passed} passed</span>
                    <span class="failed">${failed} failed</span>
                </div>
            </div>
            <div class="test-list">
                ${category.tests.map(test => `
                    <div class="test-item" data-test="${test.name}">
                        <div class="test-status ${test.status || 'pending'}">
                            ${test.status === 'passed' ? '✓' :
                test.status === 'failed' ? '✗' :
                    test.status === 'running' ? '◌' : '○'}
                        </div>
                        <div class="test-name">${test.name}</div>
                        ${test.time ? `<div class="test-time">${test.time}ms</div>` : ''}
                    </div>
                    ${test.error ? `<div class="test-error">${test.error}</div>` : ''}
                `).join('')}
            </div>
        `;

        container.appendChild(categoryEl);
    }
}

// Update summary
function updateSummary() {
    let passed = 0, failed = 0, pending = 0;

    for (const category of Object.values(testCategories)) {
        for (const test of category.tests) {
            if (test.status === 'passed') passed++;
            else if (test.status === 'failed') failed++;
            else pending++;
        }
    }

    document.getElementById('passedCount').textContent = passed;
    document.getElementById('failedCount').textContent = failed;
    document.getElementById('pendingCount').textContent = pending;

    const total = passed + failed + pending;
    const completed = passed + failed;
    document.getElementById('progressBar').style.width = `${(completed / total) * 100}%`;

    document.getElementById('runFailedBtn').disabled = failed === 0;
}

// Run a single test
async function runTest(test) {
    test.status = 'running';
    test.error = null;
    renderCategories();

    const startTime = performance.now();

    try {
        await test.fn();
        test.status = 'passed';
        log('success', `✓ ${test.name}`);
    } catch (error) {
        test.status = 'failed';
        test.error = error.message;
        log('error', `✗ ${test.name}: ${error.message}`);
    }

    test.time = Math.round(performance.now() - startTime);
    renderCategories();
    updateSummary();
}

// Run all tests
async function runAllTests() {
    if (testState.running) return;
    testState.running = true;

    document.getElementById('runAllBtn').disabled = true;
    log('info', '🚀 Starting all tests...');

    for (const category of Object.values(testCategories)) {
        for (const test of category.tests) {
            await runTest(test);
            await new Promise(r => setTimeout(r, 50)); // Small delay between tests
        }
    }

    testState.running = false;
    document.getElementById('runAllBtn').disabled = false;

    const passed = Object.values(testCategories).flatMap(c => c.tests).filter(t => t.status === 'passed').length;
    const total = Object.values(testCategories).flatMap(c => c.tests).length;

    if (passed === total) {
        log('success', `🎉 All ${total} tests passed!`);
    } else {
        log('warn', `⚠️ ${total - passed} tests failed`);
    }
}

// Run failed tests
async function runFailedTests() {
    if (testState.running) return;
    testState.running = true;

    document.getElementById('runFailedBtn').disabled = true;
    log('info', '🔄 Retrying failed tests...');

    for (const category of Object.values(testCategories)) {
        for (const test of category.tests) {
            if (test.status === 'failed') {
                await runTest(test);
                await new Promise(r => setTimeout(r, 50));
            }
        }
    }

    testState.running = false;
    document.getElementById('runFailedBtn').disabled = false;
}

// Clear results
function clearResults() {
    for (const category of Object.values(testCategories)) {
        for (const test of category.tests) {
            test.status = null;
            test.error = null;
            test.time = null;
        }
    }

    testState.logs = [];
    document.getElementById('logContent').innerHTML = '';

    renderCategories();
    updateSummary();
    log('info', '🗑️ Results cleared');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderCategories();
    updateSummary();

    // Setup button event listeners (avoiding inline onclick for CSP compliance)
    document.getElementById('runAllBtn').addEventListener('click', runAllTests);
    document.getElementById('runFailedBtn').addEventListener('click', runFailedTests);
    document.getElementById('clearBtn').addEventListener('click', clearResults);

    log('info', '🧪 Test suite ready. Click "Run All Tests" to begin.');
});
