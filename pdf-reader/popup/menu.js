// ============================================================================
// PDF READER PRO - POPUP MENU
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadBookmarks();

    // Open PDF Viewer button
    document.getElementById('open-pdf-btn').addEventListener('click', () => {
        // Open a file picker for PDF files
        const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
        chrome.tabs.create({ url: viewerUrl });
    });

    // Vocabulary builder button
    document.getElementById('vocabulary-builder-btn').addEventListener('click', () => {
        const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
        chrome.tabs.create({ url: `${viewerUrl}#vocabulary` });
    });

    // Extension Settings Button
    document.getElementById('open-settings-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Check current tab for native view
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url.includes('native_view=true')) {
            const switchBtn = document.getElementById('switch-to-custom-btn');
            const openPdfBtn = document.getElementById('open-pdf-btn');
            if (switchBtn) {
                switchBtn.style.display = 'block';
                switchBtn.addEventListener('click', () => {
                    // Replace native view with our custom viewer
                    let newUrl = tab.url.replace('native_view=true', '');
                    if (newUrl.includes('?') && newUrl.endsWith('?')) {
                        newUrl = newUrl.slice(0, -1);
                    }
                    chrome.tabs.update(tab.id, { url: newUrl });
                    window.close();
                });
            }
            if (openPdfBtn) openPdfBtn.style.display = 'none';
        }
    });

    // Bookmark button
    document.getElementById('add-bookmark-btn').addEventListener('click', async () => {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab) return;

        // If we're on the custom PDF viewer, request the current page
        if (tab.url.includes('viewer.html')) {
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_PDF_INFO' });
                if (response) {
                    saveBookmark({
                        title: response.title || response.pdfTitle || 'PDF Document',
                        url: response.originalUrl || response.url || tab.url,
                        page: response.page || response.currentPage || 1,
                        scrollY: response.scrollY || 0
                    });
                    return;
                }
            } catch (e) {
                console.log('Failed to get PDF info:', e);
            }
        }

        // Check if it's a native PDF
        const url = tab.url;
        const isPdfUrl = url.toLowerCase().endsWith('.pdf') || url.includes('.pdf?') || url.includes('.pdf#');

        if (isPdfUrl) {
            let page = 1;
            const hashMatch = url.match(/#page=(\d+)/);
            if (hashMatch) {
                page = parseInt(hashMatch[1]);
            }

            saveBookmark({
                title: tab.title || url.split('/').pop().replace('.pdf', '') || 'PDF Document',
                url: url.split('#')[0],
                page: page,
                scrollY: 0
            });
            return;
        }

        // For normal web pages
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => ({
                    title: document.title,
                    url: window.location.href,
                    scrollY: window.scrollY
                })
            });

            if (results && results[0] && results[0].result) {
                saveBookmark(results[0].result);
            }
        } catch (error) {
            console.error(error);
            alert('Failed to bookmark: ' + error.message);
        }
    });
});

// ============================================================================
// BOOKMARK FUNCTIONS
// ============================================================================

function saveBookmark(data) {
    chrome.storage.local.get(['bookmarks'], (result) => {
        const bookmarks = result.bookmarks || [];
        const newBookmark = {
            id: Date.now(),
            title: data.title,
            url: data.url,
            scrollY: data.scrollY,
            page: data.page,
            date: new Date().toISOString()
        };
        bookmarks.push(newBookmark);
        chrome.storage.local.set({ bookmarks: bookmarks }, () => {
            loadBookmarks();
            const btn = document.getElementById('add-bookmark-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
            setTimeout(() => btn.innerHTML = originalText, 1500);
        });
    });
}

function loadBookmarks() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.storage.local.get(['bookmarks'], (result) => {
            const bookmarks = result.bookmarks || [];
            const recentList = document.getElementById('recent-bookmarks');
            recentList.innerHTML = '';

            const groupedBookmarks = {};
            bookmarks.forEach(bm => {
                if (!groupedBookmarks[bm.url]) {
                    groupedBookmarks[bm.url] = {
                        title: bm.title,
                        url: bm.url,
                        bookmarks: []
                    };
                }
                groupedBookmarks[bm.url].title = bm.title;
                groupedBookmarks[bm.url].bookmarks.push(bm);
            });

            const groups = Object.values(groupedBookmarks).sort((a, b) => {
                const lastA = a.bookmarks[a.bookmarks.length - 1].date;
                const lastB = b.bookmarks[b.bookmarks.length - 1].date;
                return new Date(lastB) - new Date(lastA);
            });

            renderGroupedList(recentList, groups);
        });
    });
}

function renderGroupedList(container, groups) {
    if (groups.length === 0) {
        container.innerHTML = '<div class="empty-state">No recent bookmarks</div>';
        return;
    }

    groups.forEach(group => {
        const groupLi = document.createElement('li');
        groupLi.className = 'bookmark-group';

        const header = document.createElement('div');
        header.className = 'group-header';
        header.innerHTML = `
            <div class="group-title">
                <i class="fas fa-chevron-down toggle-icon" style="margin-right: 8px; font-size: 10px; color: #666; transition: transform 0.2s;"></i>
                <i class="fas fa-book" style="color: #4CAF50; margin-right: 8px;"></i>
                <span title="${group.title}">${group.title || 'Untitled Book'}</span>
            </div>
        `;
        groupLi.appendChild(header);

        const ul = document.createElement('ul');
        ul.className = 'group-items';
        ul.style.display = 'none';

        group.bookmarks.forEach(bm => {
            const li = document.createElement('li');
            li.className = 'bookmark-item nested';
            li.innerHTML = `
                <div class="bookmark-info">
                    <i class="fas fa-bookmark" style="color: #FF9800; font-size: 12px;"></i>
                    <div class="bookmark-title">Page ${bm.page || 1}</div>
                </div>
                <i class="fas fa-trash delete-btn" title="Delete"></i>
            `;

            li.querySelector('.bookmark-info').addEventListener('click', () => {
                openBookmark(bm);
            });

            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteBookmark(bm.id);
            });

            ul.appendChild(li);
        });

        groupLi.appendChild(ul);
        container.appendChild(groupLi);

        header.addEventListener('click', () => {
            const icon = header.querySelector('.toggle-icon');
            const list = groupLi.querySelector('.group-items');

            if (list.style.display === 'none') {
                list.style.display = 'block';
                icon.style.transform = 'rotate(0deg)';
            } else {
                list.style.display = 'none';
                icon.style.transform = 'rotate(-90deg)';
            }
        });
    });
}

function openBookmark(bm) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab) return;

        // Handle library:// URLs (locally stored PDFs)
        if (bm.url && bm.url.startsWith('library://')) {
            const libraryId = bm.url.replace('library://', '');
            chrome.storage.local.get(['researchLibrary'], (result) => {
                const library = result.researchLibrary || [];
                const item = library.find(i => i.id === libraryId);
                if (item && item.url) {
                    if (item.url.startsWith('data:application/pdf;base64,')) {
                        const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
                        let targetUrl = `${viewerUrl}?source=library&id=${libraryId}`;
                        if (bm.page) {
                            targetUrl += `#page=${bm.page}`;
                        }
                        chrome.tabs.create({ url: targetUrl });
                    } else {
                        const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
                        let targetUrl = `${viewerUrl}?file=${encodeURIComponent(item.url)}`;
                        if (bm.page) {
                            targetUrl += `#page=${bm.page}`;
                        }
                        chrome.tabs.create({ url: targetUrl });
                    }
                } else {
                    alert('Could not find the PDF in your library. It may have been removed.');
                }
            });
            return;
        }

        if (tab.url === bm.url || (tab.url.includes('viewer.html') && bm.url.includes('viewer.html'))) {
            if (tab.url.startsWith('chrome-extension://')) {
                chrome.runtime.sendMessage({
                    action: 'NAVIGATE_TO_PAGE',
                    page: bm.page,
                    scrollY: bm.scrollY
                });
                return;
            }
        }

        let targetUrl = bm.url;
        const isPdf = targetUrl.toLowerCase().includes('.pdf') || targetUrl.startsWith('file://');
        const isViewer = targetUrl.includes('viewer.html');

        if (isPdf && !isViewer) {
            const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
            targetUrl = `${viewerUrl}?file=${encodeURIComponent(targetUrl)}`;
        }

        if (bm.page) {
            if (targetUrl.includes('#')) {
                targetUrl = targetUrl.split('#')[0];
            }
            targetUrl += `#page=${bm.page}`;
        }

        chrome.tabs.create({ url: targetUrl });
    });
}

function deleteBookmark(id) {
    chrome.storage.local.get(['bookmarks'], (result) => {
        const bookmarks = result.bookmarks || [];
        const newBookmarks = bookmarks.filter(b => b.id !== id);
        chrome.storage.local.set({ bookmarks: newBookmarks }, () => {
            loadBookmarks();
        });
    });
}
