document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const notebookList = document.getElementById('notebook-list');
    const documentEditor = document.getElementById('document-editor');
    const pageTitleInput = document.getElementById('page-title');
    const resizablePage = document.getElementById('resizable-page');
    const resizeHandleRight = document.querySelector('.resize-handle.right');
    const breadcrumbsContainer = document.querySelector('.breadcrumbs');

    const addNotebookBtn = document.getElementById('add-notebook-btn');
    const modal = document.getElementById('modal');
    const saveNotebookBtn = document.getElementById('save-notebook-btn');
    const cancelModalBtn = document.getElementById('cancel-modal');
    const newNotebookNameInput = document.getElementById('new-notebook-name');

    const slashMenu = document.getElementById('slash-menu');
    const pageOptionsBtn = document.getElementById('page-options-btn');
    const pageOptionsMenu = document.getElementById('page-options-menu');
    const textToolbar = document.getElementById('text-toolbar');

    // State
    let currentNotebook = 'default';
    let notebooks = {};
    let pageWidth = 900; // Default width
    let pageSettings = {
        font: 'sans',
        smallText: false,
        fullWidth: false,
        floatingToolbar: true
    };

    // Initialization
    loadData();
    setupResizeHandles();
    setupPageOptions();
    setupTextToolbar();
    setupBookmarks();
    setupHabitTrackerCalendar();
    window.addEventListener('resize', applyPageWidth);
    window.addEventListener('resize', highlightOverflowElements);

    function setupHabitTrackerCalendar() {
        const mountEl = document.getElementById('habit-tracker-root');
        if (!mountEl || typeof window.HabitTrackerCalendar !== 'function') return;

        const widget = new window.HabitTrackerCalendar({
            mountEl,
            storageKey: 'habitTrackerCalendar',
            goals: [
                { id: 'study', label: 'Study 2 hours' },
                { id: 'deepwork', label: 'Deep work (90m)' },
                { id: 'exercise', label: 'Exercise' },
                { id: 'reading', label: 'Read 20 pages' }
            ],
            weekStartsOn: 'monday'
        });

        widget.init();
    }

    function loadData() {
        chrome.storage.local.get(['notebooks', 'currentNotebook', 'pageWidth', 'pageSettings', 'bookmarks'], (result) => {
            notebooks = result.notebooks || { 'default': '' };
            currentNotebook = result.currentNotebook || 'default';
            pageWidth = result.pageWidth || 900;
            pageSettings = result.pageSettings || pageSettings;
            const bookmarks = result.bookmarks || [];

            // Apply page width
            applyPageWidth();

            // Apply settings
            applyPageSettings();

            // Migration: Convert Array (Blocks) to String (HTML)
                if (Array.isArray(notebooks[currentNotebook])) {
                    notebooks[currentNotebook] = convertBlocksToHtml(notebooks[currentNotebook]);
                    // Do not overwrite migrated HTML with an empty editor state.
                    saveData({ skipEditor: true });
                }

            renderSidebar();
            renderBookmarks(bookmarks);
            renderPage();
            // highlightOverflowElements(); // debug only
        });
    }

    function highlightOverflowElements() {
        const root = document.querySelector('.main-content') || document.body;
        const viewportWidth = document.documentElement.clientWidth;

        root.querySelectorAll('.overflow-debug').forEach((el) => {
            el.classList.remove('overflow-debug');
        });

        const overflowing = [];
        root.querySelectorAll('*').forEach((el) => {
            if (!(el instanceof HTMLElement)) return;
            if (el.offsetParent === null) return;
            const rect = el.getBoundingClientRect();
            if (rect.width > viewportWidth + 1) {
                el.classList.add('overflow-debug');
                overflowing.push({ el, width: Math.round(rect.width) });
            }
        });

        if (overflowing.length) {
            console.warn('Overflow elements (width > viewport):', overflowing);
        }
    }

    function applyPageWidth() {
        if (!resizablePage) return;
        if (pageSettings.fullWidth) {
            resizablePage.style.width = '100%';
            return;
        }

        const container = resizablePage.parentElement;
        const maxWidth = container ? container.clientWidth : window.innerWidth;
        const clampedWidth = Math.max(320, Math.min(pageWidth, maxWidth));
        resizablePage.style.width = `${clampedWidth}px`;
    }

    function convertBlocksToHtml(blocks) {
        if (!blocks || blocks.length === 0) return '<p><br></p>';
        return blocks.map(block => {
            let content = block.content || '';
            switch (block.type) {
                case 'heading1': return `<h1>${content}</h1>`;
                case 'heading2': return `<h2>${content}</h2>`;
                case 'heading3': return `<h3>${content}</h3>`;
                case 'bullet': return `<ul><li>${content}</li></ul>`;
                case 'number': return `<ol><li>${content}</li></ol>`;
                case 'todo': return `<div class="todo-item"><input type="checkbox" ${block.checked ? 'checked' : ''}> ${content}</div>`;
                case 'image': return `<img src="${content}" style="max-width:100%">`;
                default: return `<p>${content || '<br>'}</p>`;
            }
        }).join('');
    }

    function saveData({ skipEditor = false } = {}) {
        const editorContent = document.getElementById('editor-content');
        if (!skipEditor && editorContent) {
            notebooks[currentNotebook] = editorContent.innerHTML;
        }

        chrome.storage.local.set({
            notebooks: notebooks,
            currentNotebook: currentNotebook,
            pageWidth: pageWidth,
            pageSettings: pageSettings
        });
    }

    // --- Rendering ---

    function renderSidebar() {
        notebookList.innerHTML = '';
        for (const name in notebooks) {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fas fa-book"></i> ${name}`;
            if (name === currentNotebook) li.classList.add('active');
            li.addEventListener('click', () => {
                currentNotebook = name;
                chrome.storage.local.set({ currentNotebook: name });
                renderSidebar();
                renderPage();
            });
            notebookList.appendChild(li);
        }
    }

    function renderPage() {
        // Update Title
        pageTitleInput.textContent = currentNotebook;

        // Update Breadcrumbs
        breadcrumbsContainer.innerHTML = `
            <div class="breadcrumb-item">
                <i class="fas fa-home"></i>
            </div>
            <div class="breadcrumb-separator">/</div>
            <div class="breadcrumb-item">
                <span>${currentNotebook}</span>
            </div>
        `;

        // Render Content
        const editorContent = document.getElementById('editor-content');
        let content = notebooks[currentNotebook];

        // Handle case where content might still be an array
        if (Array.isArray(content)) {
            content = convertBlocksToHtml(content);
            notebooks[currentNotebook] = content;
        }

        editorContent.innerHTML = content || '<p><br></p>';
    }

    // --- Editor Logic ---

    const editorContent = document.getElementById('editor-content');

    editorContent.addEventListener('input', () => {
        saveData();

        // Slash Menu Trigger
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const textNode = range.startContainer;
            if (textNode.nodeType === 3) { // Text node
                const text = textNode.textContent;
                const offset = range.startOffset;
                // Check if the character before cursor is '/'
                if (text.slice(offset - 1, offset) === '/') {
                    const rect = range.getBoundingClientRect();
                    showSlashMenu(rect.left, rect.bottom + window.scrollY);
                } else {
                    hideSlashMenu();
                }
            }
        }
    });

    editorContent.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideSlashMenu();
        }
    });

    // --- Slash Menu ---

    function showSlashMenu(x, y) {
        const menuWidth = 280;
        if (x + menuWidth > window.innerWidth) {
            x = window.innerWidth - menuWidth - 20;
        }
        slashMenu.style.left = `${x}px`;
        slashMenu.style.top = `${y}px`;
        slashMenu.classList.remove('hidden');
    }

    function hideSlashMenu() {
        slashMenu.classList.add('hidden');
    }

    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const type = item.dataset.type;
            insertComponent(type);
            hideSlashMenu();
        });
    });

    function insertComponent(type) {
        const editor = document.getElementById('editor-content');
        editor.focus();

        let htmlToInsert = '';
        switch (type) {
            case 'h1': htmlToInsert = '<h1>Heading 1</h1><p><br></p>'; break;
            case 'h2': htmlToInsert = '<h2>Heading 2</h2><p><br></p>'; break;
            case 'h3': htmlToInsert = '<h3>Heading 3</h3><p><br></p>'; break;
            case 'bullet': htmlToInsert = '<ul><li>List item</li></ul><p><br></p>'; break;
            case 'number': htmlToInsert = '<ol><li>List item</li></ol><p><br></p>'; break;
            case 'todo': htmlToInsert = '<div class="todo-item"><input type="checkbox"> To-do item</div><p><br></p>'; break;
            case 'quote': htmlToInsert = '<blockquote>Quote</blockquote><p><br></p>'; break;
            case 'callout': htmlToInsert = '<div class="callout">💡 Callout</div><p><br></p>'; break;
            case 'divider': htmlToInsert = '<hr><p><br></p>'; break;
            case 'image':
                // Trigger file input or URL prompt
                const url = prompt('Enter Image URL:');
                if (url) htmlToInsert = `<img src="${url}" style="max-width:100%"><p><br></p>`;
                break;
        }

        if (htmlToInsert) {
            document.execCommand('insertHTML', false, htmlToInsert);
        }
    }

    // --- Page Resizing ---

    function setupResizeHandles() {
        let isResizing = false;
        let startX;
        let startWidth;

        if (resizeHandleRight) {
            resizeHandleRight.addEventListener('mousedown', (e) => {
                isResizing = true;
                startX = e.clientX;
                startWidth = resizablePage.offsetWidth;
                document.body.style.cursor = 'col-resize';
                e.preventDefault();
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const dx = e.clientX - startX;
            const newWidth = startWidth + (dx * 2);

            const container = resizablePage.parentElement;
            const maxWidth = container ? container.clientWidth : window.innerWidth - 40;
            if (newWidth > 320 && newWidth < maxWidth) {
                pageWidth = newWidth;
                applyPageWidth();
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = 'default';
                saveData();
            }
        });
    }

    // --- Page Options & Settings ---

    function setupPageOptions() {
        // Ensure the button exists before adding listener
        if (pageOptionsBtn) {
            pageOptionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                pageOptionsMenu.classList.toggle('hidden');
            });
        } else {
            console.error("Page options button not found!");
        }

        // Font Toggles
        document.querySelectorAll('.font-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                pageSettings.font = btn.dataset.font;
                applyPageSettings();
                saveData();
            });
        });

        // Small Text Toggle
        const smallTextToggle = document.getElementById('small-text-toggle');
        smallTextToggle.addEventListener('change', (e) => {
            pageSettings.smallText = e.target.checked;
            applyPageSettings();
            saveData();
        });

        // Full Width Toggle
        const fullWidthToggle = document.getElementById('full-width-toggle');
        fullWidthToggle.addEventListener('change', (e) => {
            pageSettings.fullWidth = e.target.checked;
            applyPageSettings();
            saveData();
        });

        // Floating Toolbar Toggle
        const floatingToolbarToggle = document.getElementById('floating-toolbar-toggle');
        floatingToolbarToggle.addEventListener('change', (e) => {
            pageSettings.floatingToolbar = e.target.checked;
            applyPageSettings();
            saveData();
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            const isClickInsideMenu = pageOptionsMenu.contains(e.target);
            const isClickOnButton = pageOptionsBtn.contains(e.target);

            if (!isClickInsideMenu && !isClickOnButton) {
                pageOptionsMenu.classList.add('hidden');
            }
        });
    }

    function applyPageSettings() {
        // Apply Font
        document.body.classList.remove('serif', 'mono');
        if (pageSettings.font === 'serif') document.body.classList.add('serif');
        if (pageSettings.font === 'mono') document.body.classList.add('mono');

        // Update Font Buttons UI
        document.querySelectorAll('.font-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.font === pageSettings.font);
        });

        // Apply Small Text
        document.body.classList.toggle('small-text', pageSettings.smallText);
        document.getElementById('small-text-toggle').checked = pageSettings.smallText;

        // Apply Full Width
        resizablePage.classList.toggle('full-width', pageSettings.fullWidth);
        document.getElementById('full-width-toggle').checked = pageSettings.fullWidth;

        // Apply Floating Toolbar
        document.getElementById('floating-toolbar-toggle').checked = pageSettings.floatingToolbar !== false;
    }

    // --- Floating Text Toolbar ---

    function setupTextToolbar() {
        // Setup Fixed Toolbar
        const fontSizeSelect = document.getElementById('font-size-select');
        if (fontSizeSelect) {
            fontSizeSelect.addEventListener('change', () => {
                document.execCommand('fontSize', false, fontSizeSelect.value);
            });
        }

        document.querySelectorAll('.format-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const cmd = btn.dataset.cmd;
                const val = btn.dataset.val || null;

                if (cmd === 'backColor') {
                    // Toggle Highlight Logic
                    const selection = window.getSelection();
                    if (!selection.rangeCount) return;

                    // Get current background color of the selection
                    // We use the parent element of the selection to check the background color
                    let parent = selection.anchorNode.parentElement;
                    // If text node, get parent
                    if (selection.anchorNode.nodeType === 3) parent = selection.anchorNode.parentNode;

                    const currentBg = window.getComputedStyle(parent).backgroundColor;

                    // Create a temp element to get the computed RGB of the requested color
                    const temp = document.createElement('div');
                    temp.style.backgroundColor = val;
                    document.body.appendChild(temp);
                    const targetBg = window.getComputedStyle(temp).backgroundColor;
                    document.body.removeChild(temp);

                    // Compare (ignoring spaces)
                    if (currentBg.replace(/\s/g, '') === targetBg.replace(/\s/g, '')) {
                        document.execCommand('backColor', false, 'transparent');
                    } else {
                        document.execCommand('backColor', false, val);
                    }
                } else {
                    document.execCommand(cmd, false, val);
                }
            });
        });

        // Hide toolbar on mousedown outside
        document.addEventListener('mousedown', (e) => {
            if (!textToolbar.contains(e.target) && !documentEditor.contains(e.target)) {
                textToolbar.classList.add('hidden');
            }
        });

        document.addEventListener('selectionchange', () => {
            const selection = window.getSelection();
            if (selection.rangeCount === 0 || selection.isCollapsed) {
                textToolbar.classList.add('hidden');
                return;
            }

            // Check setting
            if (pageSettings.floatingToolbar === false) {
                textToolbar.classList.add('hidden');
                return;
            }

            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Only show if selection is inside editor
            if (!documentEditor.contains(range.commonAncestorContainer) &&
                !documentEditor.contains(range.commonAncestorContainer.parentNode)) {
                textToolbar.classList.add('hidden');
                return;
            }

            // Position toolbar
            textToolbar.style.left = `${rect.left}px`;
            textToolbar.style.top = `${rect.top - 40}px`;
            textToolbar.classList.remove('hidden');
        });

        document.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent losing focus
                const cmd = btn.dataset.cmd;
                const val = btn.dataset.val || null;
                document.execCommand(cmd, false, val);
            });
        });
    }

    // --- Top Bar Actions ---

    const exportPdfBtn = document.getElementById('export-pdf-btn');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', () => {
            window.print();
        });
    }

    const exportDocBtn = document.getElementById('export-doc-btn');
    if (exportDocBtn) {
        exportDocBtn.addEventListener('click', () => {
            const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
                "xmlns:w='urn:schemas-microsoft-com:office:word' " +
                "xmlns='http://www.w3.org/TR/REC-html40'>" +
                "<head><meta charset='utf-8'><title>Export HTML to Word Document with JavaScript</title></head><body>";
            const footer = "</body></html>";
            const sourceHTML = header + document.getElementById("editor-content").innerHTML + footer;

            const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
            const fileDownload = document.createElement("a");
            document.body.appendChild(fileDownload);
            fileDownload.href = source;
            fileDownload.download = `${currentNotebook}.doc`;
            fileDownload.click();
            document.body.removeChild(fileDownload);
        });
    }

    const deleteNotebookBtn = document.getElementById('delete-notebook-btn');
    if (deleteNotebookBtn) {
        deleteNotebookBtn.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete "${currentNotebook}"?`)) {
                delete notebooks[currentNotebook];
                // Switch to another notebook or create default
                const keys = Object.keys(notebooks);
                if (keys.length > 0) {
                    currentNotebook = keys[0];
                } else {
                    notebooks['Default Notebook'] = '';
                    currentNotebook = 'Default Notebook';
                }
                saveData();
                renderSidebar();
                renderPage();
            }
        });
    }

    // Notebook Management
    pageTitleInput.addEventListener('input', () => {
        const newName = pageTitleInput.textContent.trim();
        if (newName && newName !== currentNotebook) {
            const data = notebooks[currentNotebook];
            delete notebooks[currentNotebook];
            notebooks[newName] = data;
            currentNotebook = newName;
            saveData();
            renderSidebar();
        }
    });

    addNotebookBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    cancelModalBtn.addEventListener('click', () => modal.classList.add('hidden'));

    saveNotebookBtn.addEventListener('click', () => {
        const name = newNotebookNameInput.value.trim();
        if (name && !notebooks[name]) {
            notebooks[name] = '';
            currentNotebook = name;
            saveData();
            modal.classList.add('hidden');
            newNotebookNameInput.value = '';
            renderSidebar();
            renderPage();
        }
    });

    document.addEventListener('click', (e) => {
        if (!slashMenu.contains(e.target) && !e.target.closest('#editor-content')) {
            hideSlashMenu();
        }
    });

    function renderBookmarks(bookmarks) {
        const bookmarkList = document.getElementById('bookmark-list');
        if (!bookmarkList) return;

        bookmarkList.innerHTML = '';
        if (!bookmarks || bookmarks.length === 0) {
            bookmarkList.innerHTML = '<li class="empty-state" style="padding: 10px; color: #888; font-size: 0.9em;">No bookmarks yet</li>';
            return;
        }

        bookmarks.forEach((bookmark, index) => {
            let finalUrl = bookmark.url;

            // Force PDF files to open in our custom viewer
            // Check if it's a file/pdf and NOT already our viewer
            if ((finalUrl.startsWith('file://') || finalUrl.toLowerCase().endsWith('.pdf')) && !finalUrl.includes('viewer.html')) {
                // Extract page hash if present
                let pageHash = '';
                if (finalUrl.includes('#')) {
                    const parts = finalUrl.split('#');
                    finalUrl = parts[0];
                    pageHash = '#' + parts[1];
                }

                const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
                finalUrl = `${viewerUrl}?file=${encodeURIComponent(finalUrl)}${pageHash}`;
            }

            const li = document.createElement('li');
            li.className = 'bookmark-item';
            li.innerHTML = `
                <div class="bookmark-content">
                    <a href="${finalUrl}" target="_blank" title="${bookmark.url}">
                        <i class="fas fa-bookmark"></i> ${bookmark.title}
                    </a>
                    <span class="bookmark-date" style="display:block; font-size:0.8em; color:#aaa;">${new Date(bookmark.date).toLocaleDateString()}</span>
                </div>
                <button class="delete-bookmark" data-index="${index}" title="Delete"><i class="fas fa-trash"></i></button>
            `;

            // Handle delete
            li.querySelector('.delete-bookmark').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Delete this bookmark?')) {
                    bookmarks.splice(index, 1);
                    chrome.storage.local.set({ bookmarks: bookmarks }, () => {
                        renderBookmarks(bookmarks);
                    });
                }
            });

            bookmarkList.appendChild(li);
        });
    }

    function setupBookmarks() {
        const refreshBtn = document.getElementById('refresh-bookmarks-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                chrome.storage.local.get(['bookmarks'], (result) => {
                    renderBookmarks(result.bookmarks || []);
                });
            });
        }
    }
});
