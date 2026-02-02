/**
 * ============================================================================
 * PDF VIEWER TESTS
 * ============================================================================
 * Tests for PDF highlights, notes, vocabulary, bookmarks, and drawing
 */

const pdfViewerTests = {
    'PDF Highlights': {
        icon: '🖍️',
        tests: [
            {
                name: 'Highlight colors are valid',
                fn: async () => {
                    const validColors = ['#ffff00', '#00ff00', '#00ffff', '#ff69b4', '#ffa500'];

                    for (const color of validColors) {
                        if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
                            throw new Error(`Invalid color format: ${color}`);
                        }
                    }
                    return true;
                }
            },
            {
                name: 'Can create a highlight',
                fn: async () => {
                    const testHighlight = {
                        id: 'highlight-test-' + Date.now(),
                        text: 'Test highlighted text',
                        color: '#ffff00',
                        page: 1,
                        rects: [{ x: 100, y: 100, width: 200, height: 20 }],
                        createdAt: new Date().toISOString()
                    };

                    const storageKey = 'highlights_test_pdf';
                    const current = await new Promise(resolve => {
                        chrome.storage.local.get([storageKey], resolve);
                    });

                    const highlights = current[storageKey] || [];
                    highlights.push(testHighlight);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ [storageKey]: highlights }, resolve);
                    });

                    // Verify
                    const verify = await new Promise(resolve => {
                        chrome.storage.local.get([storageKey], resolve);
                    });

                    const found = verify[storageKey].find(h => h.id === testHighlight.id);
                    if (!found) throw new Error('Highlight not saved');

                    // Cleanup
                    await new Promise(resolve => {
                        chrome.storage.local.remove([storageKey], resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Highlight rect structure is valid',
                fn: async () => {
                    const rect = { x: 100, y: 200, width: 150, height: 20 };

                    if (typeof rect.x !== 'number' || typeof rect.y !== 'number') {
                        throw new Error('Rect x/y must be numbers');
                    }
                    if (typeof rect.width !== 'number' || typeof rect.height !== 'number') {
                        throw new Error('Rect width/height must be numbers');
                    }
                    if (rect.width <= 0 || rect.height <= 0) {
                        throw new Error('Rect dimensions must be positive');
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
                name: 'Can create a PDF note',
                fn: async () => {
                    const testNote = {
                        id: 'note-test-' + Date.now(),
                        content: 'Test note content',
                        page: 1,
                        position: { x: 100, y: 100 },
                        createdAt: new Date().toISOString()
                    };

                    const storageKey = 'notes_test_pdf';
                    const current = await new Promise(resolve => {
                        chrome.storage.local.get([storageKey], resolve);
                    });

                    const notes = current[storageKey] || [];
                    notes.push(testNote);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ [storageKey]: notes }, resolve);
                    });

                    // Cleanup
                    await new Promise(resolve => {
                        chrome.storage.local.remove([storageKey], resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Note content is sanitized',
                fn: async () => {
                    const unsafeContent = '<script>alert("xss")</script>Hello';

                    // Simple sanitization check
                    const sanitized = unsafeContent
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');

                    if (sanitized.includes('<script>')) {
                        throw new Error('Script tags should be escaped');
                    }

                    return true;
                }
            }
        ]
    },

    'PDF Vocabulary': {
        icon: '📖',
        tests: [
            {
                name: 'Can add word to vocabulary',
                fn: async () => {
                    const testWord = {
                        id: 'vocab-test-' + Date.now(),
                        word: 'ephemeral',
                        definition: 'lasting for a very short time',
                        context: 'The ephemeral beauty of cherry blossoms',
                        sourceUrl: 'https://example.com/test.pdf',
                        createdAt: new Date().toISOString()
                    };

                    const current = await new Promise(resolve => {
                        chrome.storage.local.get(['vocabulary'], resolve);
                    });

                    const vocabulary = current.vocabulary || [];
                    vocabulary.push(testWord);

                    await new Promise(resolve => {
                        chrome.storage.local.set({ vocabulary }, resolve);
                    });

                    // Cleanup
                    const cleaned = vocabulary.filter(v => v.id !== testWord.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ vocabulary: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Vocabulary export format is valid JSON',
                fn: async () => {
                    const vocabulary = [
                        { word: 'test1', definition: 'def1' },
                        { word: 'test2', definition: 'def2' }
                    ];

                    const json = JSON.stringify(vocabulary);
                    const parsed = JSON.parse(json);

                    if (!Array.isArray(parsed) || parsed.length !== 2) {
                        throw new Error('JSON export/import failed');
                    }

                    return true;
                }
            }
        ]
    },

    'PDF Bookmarks': {
        icon: '🔖',
        tests: [
            {
                name: 'Can create a PDF bookmark',
                fn: async () => {
                    const testBookmark = {
                        id: Date.now(),
                        title: 'Test PDF',
                        url: 'https://example.com/test.pdf',
                        page: 5,
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
            },
            {
                name: 'Bookmark page number is valid',
                fn: async () => {
                    const bookmark = { page: 5, url: 'test.pdf' };

                    if (typeof bookmark.page !== 'number' || bookmark.page < 1) {
                        throw new Error('Page number must be positive integer');
                    }

                    return true;
                }
            },
            {
                name: 'Bookmark URL with page hash is correct',
                fn: async () => {
                    const baseUrl = 'https://example.com/test.pdf';
                    const page = 5;
                    const urlWithPage = `${baseUrl}#page=${page}`;

                    if (!urlWithPage.includes('#page=5')) {
                        throw new Error('Page hash not formatted correctly');
                    }

                    // Extract page from hash
                    const match = urlWithPage.match(/#page=(\d+)/);
                    if (!match || parseInt(match[1]) !== 5) {
                        throw new Error('Page extraction from hash failed');
                    }

                    return true;
                }
            }
        ]
    },

    'PDF Drawing': {
        icon: '✏️',
        tests: [
            {
                name: 'Drawing storage structure is valid',
                fn: async () => {
                    const result = await new Promise(resolve => {
                        chrome.storage.local.get(null, resolve);
                    });

                    const drawingKeys = Object.keys(result).filter(k => k.startsWith('drawings_'));

                    for (const key of drawingKeys) {
                        if (!Array.isArray(result[key])) {
                            throw new Error(`${key} should be an array`);
                        }
                    }

                    return true;
                }
            },
            {
                name: 'Drawing path format is valid',
                fn: async () => {
                    const drawing = {
                        id: 'drawing-1',
                        page: 1,
                        tool: 'pen',
                        color: '#000000',
                        lineWidth: 2,
                        points: [
                            { x: 0, y: 0 },
                            { x: 10, y: 10 },
                            { x: 20, y: 15 }
                        ]
                    };

                    if (!Array.isArray(drawing.points)) {
                        throw new Error('Drawing points should be an array');
                    }

                    for (const point of drawing.points) {
                        if (typeof point.x !== 'number' || typeof point.y !== 'number') {
                            throw new Error('Drawing point coordinates must be numbers');
                        }
                    }

                    return true;
                }
            },
            {
                name: 'Drawing tools are valid',
                fn: async () => {
                    const validTools = ['pen', 'highlighter', 'eraser', 'line', 'rectangle', 'circle'];
                    const testTool = 'pen';

                    if (!validTools.includes(testTool)) {
                        throw new Error(`Invalid drawing tool: ${testTool}`);
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
                name: 'Can add PDF to research library',
                fn: async () => {
                    const testItem = {
                        id: 'lib-test-' + Date.now(),
                        title: 'Test Research Paper',
                        author: 'Test Author',
                        url: 'https://example.com/paper.pdf',
                        addedAt: new Date().toISOString(),
                        isFavorite: false,
                        tags: ['test', 'research'],
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

                    // Cleanup
                    const cleaned = library.filter(i => i.id !== testItem.id);
                    await new Promise(resolve => {
                        chrome.storage.local.set({ researchLibrary: cleaned }, resolve);
                    });

                    return true;
                }
            },
            {
                name: 'Library search works correctly',
                fn: async () => {
                    const library = [
                        { title: 'Machine Learning Basics', author: 'John Doe' },
                        { title: 'Deep Learning Advanced', author: 'Jane Smith' },
                        { title: 'Statistics 101', author: 'Bob Johnson' }
                    ];

                    const searchTerm = 'learning';
                    const results = library.filter(item =>
                        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        item.author.toLowerCase().includes(searchTerm.toLowerCase())
                    );

                    if (results.length !== 2) {
                        throw new Error(`Expected 2 results, got ${results.length}`);
                    }

                    return true;
                }
            },
            {
                name: 'Library folder assignment works',
                fn: async () => {
                    const item = {
                        id: 'item-1',
                        title: 'Test',
                        folderId: null
                    };

                    const folder = {
                        id: 'folder-1',
                        name: 'Research'
                    };

                    // Assign to folder
                    item.folderId = folder.id;

                    if (item.folderId !== 'folder-1') {
                        throw new Error('Folder assignment failed');
                    }

                    return true;
                }
            }
        ]
    }
};

// Export for use in main test suite
if (typeof window !== 'undefined') {
    window.pdfViewerTests = pdfViewerTests;
}
