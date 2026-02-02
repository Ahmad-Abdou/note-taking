/**
 * Global Notes Manager - Unified notes system accessible from any PDF
 * Similar to Research Library - notes organized in folders, accessible globally
 */

class GlobalNotesManager {
    constructor() {
        this.notes = [];
        this.folders = [];
        this.pages = []; // Pages feature - like Google Docs
        this.isOpen = false;
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.currentFolderId = null;
        this.currentPageId = null; // Currently viewing page
        this.panel = null;

        this.setupStorageListener();
        this.setupMessageListener();
        this.autoInit();
    }

    setupMessageListener() {
        // Listen for messages from content script or background
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'ADD_NOTE_TO_GLOBAL') {
                this.addNoteFromExternal(request.content, request.title);
                sendResponse({ success: true });
            }
            return true;
        });
    }

    // Public method to add a note from external sources
    addNoteFromExternal(content, title = '') {
        this.showAddNoteDialog(content, title);
        this.showPanel();
    }

    // Quick add note without dialog
    async quickAddNote(content, title = 'Quick Note') {
        const currentPdf = this.getCurrentPdfInfo();
        const currentPage = window.PDFViewerApplication?.page || 1;

        const note = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            title: title,
            content: content,
            color: '#667eea',
            pdfUrl: currentPdf.url,
            libraryId: currentPdf.libraryId,
            pdfTitle: currentPdf.title,
            page: currentPage,
            folderId: null,
            isStarred: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.notes.push(note);
        await this.saveNotes();
        this.showToast('Note added');

        if (this.isOpen) {
            this.renderNotes();
        }

        return note;
    }

    setupStorageListener() {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local') {
                if (changes.globalNotes) {
                    this.notes = changes.globalNotes.newValue || [];
                    if (this.isOpen) {
                        this.renderNotes();
                    }
                }
                if (changes.noteFolders) {
                    this.folders = changes.noteFolders.newValue || [];
                    if (this.isOpen) {
                        this.renderNotes();
                    }
                }
                if (changes.notePages) {
                    this.pages = changes.notePages.newValue || [];
                    if (this.isOpen) {
                        this.renderNotes();
                    }
                }
            }
        });
    }

    async autoInit() {
        await this.loadNotes();
        this.createPanel();
        this.createToolbarButton();
        this.registerWithOverlayManager();
    }

    async loadNotes() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['globalNotes', 'noteFolders', 'notePages'], (result) => {
                this.notes = result.globalNotes || [];
                this.folders = result.noteFolders || [];
                this.pages = result.notePages || [];
                resolve();
            });
        });
    }

    async saveNotes() {
        return new Promise((resolve) => {
            chrome.storage.local.set({
                globalNotes: this.notes,
                noteFolders: this.folders,
                notePages: this.pages
            }, resolve);
        });
    }

    createToolbarButton() {
        // Use existing button from HTML or create one
        let btn = document.getElementById('globalNotesBtn');

        if (!btn) {
            const toolbar = document.getElementById('toolbarViewerRight');
            if (!toolbar) return;

            btn = document.createElement('button');
            btn.id = 'globalNotesBtn';
            btn.className = 'toolbarButton';
            btn.title = 'All Notes (Alt+N)';
            btn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                    <line x1="6" y1="8" x2="6" y2="8.01"></line>
                    <line x1="6" y1="12" x2="6" y2="12.01"></line>
                    <line x1="6" y1="16" x2="6" y2="16.01"></line>
                </svg>
            `;

            // Insert before the library button if it exists
            const libraryBtn = document.getElementById('researchLibraryBtn');
            if (libraryBtn) {
                toolbar.insertBefore(btn, libraryBtn);
            } else {
                toolbar.appendChild(btn);
            }
        }

        btn.addEventListener('click', () => this.togglePanel());

        // Keyboard shortcut - Alt+N
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                this.togglePanel();
            }
        });
    }

    createPanel() {
        if (document.getElementById('globalNotesPanel')) {
            this.panel = document.getElementById('globalNotesPanel');
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'globalNotesPanel';
        panel.className = 'global-notes-panel';
        panel.innerHTML = `
            <div class="notes-header">
                <h2>📝 All Notes</h2>
                <button class="notes-close-btn">×</button>
            </div>
            
            <div class="notes-toolbar">
                <div class="notes-search">
                    <input type="text" placeholder="Search notes..." class="notes-search-input">
                </div>
                <div class="notes-actions">
                    <button class="notes-btn" id="addNoteBtn" title="Add Note">
                        <span>➕</span> New Note
                    </button>
                    <button class="notes-btn" id="createNoteFolderBtn" title="Create Folder">
                        <span>📁</span> New Folder
                    </button>
                    <button class="notes-btn" id="createPageBtn" title="New Page">
                        <span>📄</span> New Page
                    </button>
                    <button class="notes-btn" id="exportNotesBtn" title="Export Notes">
                        <span>📤</span>
                    </button>
                </div>
            </div>

            <div class="notes-filters">
                <button class="filter-btn active" data-filter="all">All</button>
                <button class="filter-btn" data-filter="starred">⭐ Starred</button>
                <button class="filter-btn" data-filter="recent">🕐 Recent</button>
                <button class="filter-btn" data-filter="pages">📄 Pages</button>
                <button class="filter-btn" data-filter="current">📄 Current PDF</button>
            </div>

            <div class="notes-breadcrumb">
                <span class="breadcrumb-item active" data-folder-id="null">📝 All Notes</span>
            </div>

            <div class="notes-content">
                <div class="notes-list"></div>
            </div>

            <div class="notes-footer">
                <span class="notes-count">0 notes</span>
            </div>
        `;

        document.body.appendChild(panel);
        this.panel = panel;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Close button
        this.panel.querySelector('.notes-close-btn').addEventListener('click', () => {
            this.hidePanel();
        });

        // Search
        const searchInput = this.panel.querySelector('.notes-search-input');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderNotes();
        });

        // Add note button
        this.panel.querySelector('#addNoteBtn').addEventListener('click', () => {
            this.showAddNoteDialog();
        });

        // Create folder button
        this.panel.querySelector('#createNoteFolderBtn').addEventListener('click', () => {
            this.showCreateFolderDialog();
        });

        // Create page button
        const createPageBtn = this.panel.querySelector('#createPageBtn');
        if (createPageBtn) {
            createPageBtn.addEventListener('click', () => {
                this.showCreatePageDialog();
            });
        }

        // Export button
        this.panel.querySelector('#exportNotesBtn').addEventListener('click', () => {
            this.exportNotes();
        });

        // Filter buttons
        this.panel.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.panel.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.renderNotes();
            });
        });

        // Breadcrumb clicks
        this.panel.querySelector('.notes-breadcrumb').addEventListener('click', (e) => {
            const item = e.target.closest('.breadcrumb-item');
            if (item) {
                const folderId = item.dataset.folderId;
                this.currentFolderId = folderId === 'null' ? null : folderId;
                this.renderNotes();
            }
        });
    }

    togglePanel() {
        if (this.isOpen) {
            // Use overlay manager to properly close and reset state
            if (window.overlayManager) {
                window.overlayManager.close('globalNotes');
            } else {
                this.hidePanel();
            }
        } else {
            // Use overlay manager to ensure only one panel is open
            if (window.overlayManager) {
                window.overlayManager.open('globalNotes');
            } else {
                this.showPanel();
            }
        }
    }

    showPanel() {
        this.panel.classList.add('visible');
        this.isOpen = true;
        this.renderNotes();
    }

    hidePanel() {
        this.panel.classList.remove('visible');
        this.isOpen = false;
    }

    registerWithOverlayManager() {
        if (window.overlayManager) {
            window.overlayManager.register('globalNotes',
                () => this.showPanel(),
                () => this.hidePanel()
            );
        }
    }

    getCurrentPdfInfo() {
        const urlParams = new URLSearchParams(window.location.search);
        const libraryId = urlParams.get('id');
        const pdfUrl = urlParams.get('file') || window.location.href;
        const title = document.title || 'Unknown PDF';

        return {
            url: libraryId ? `library://${libraryId}` : pdfUrl,
            libraryId: libraryId,
            title: title
        };
    }

    filterNotes() {
        let filtered = [...this.notes];

        // If viewing a page, show only notes in that page
        if (this.currentPageId !== null) {
            filtered = filtered.filter(n => n.pageId === this.currentPageId);
            return this.applySearchFilter(filtered);
        }

        // Filter by folder (including nested folders)
        if (this.currentFolderId !== null) {
            // Get all descendant folder IDs
            const descendantFolderIds = this.getDescendantFolderIds(this.currentFolderId);
            filtered = filtered.filter(n =>
                n.folderId === this.currentFolderId ||
                descendantFolderIds.includes(n.folderId)
            );
        }

        // Filter by type
        switch (this.currentFilter) {
            case 'starred':
                filtered = filtered.filter(n => n.isStarred);
                break;
            case 'pages':
                // Show pages list, not notes
                return [];
            case 'recent':
                filtered = filtered.sort((a, b) =>
                    new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
                ).slice(0, 20);
                break;
            case 'current':
                const currentPdf = this.getCurrentPdfInfo();
                filtered = filtered.filter(n =>
                    n.pdfUrl === currentPdf.url ||
                    n.libraryId === currentPdf.libraryId
                );
                break;
        }

        return this.applySearchFilter(filtered);
    }

    applySearchFilter(notes) {
        if (!this.searchQuery) return notes;
        return notes.filter(n =>
            n.title?.toLowerCase().includes(this.searchQuery) ||
            n.content?.toLowerCase().includes(this.searchQuery) ||
            n.pdfTitle?.toLowerCase().includes(this.searchQuery)
        );
    }

    // Get all descendant folder IDs for nested folder support
    getDescendantFolderIds(parentId) {
        const descendants = [];
        const children = this.folders.filter(f => f.parentFolderId === parentId);
        children.forEach(child => {
            descendants.push(child.id);
            descendants.push(...this.getDescendantFolderIds(child.id));
        });
        return descendants;
    }

    // Get child folders of a parent folder
    getChildFolders(parentId) {
        return this.folders.filter(f => f.parentFolderId === parentId);
    }

    renderNotes() {
        const listContainer = this.panel.querySelector('.notes-list');
        const notes = this.filterNotes();

        this.updateBreadcrumb();

        let html = '';

        // If viewing Pages filter, show pages list
        if (this.currentFilter === 'pages' && this.currentPageId === null) {
            html = this.renderPagesList();
            listContainer.innerHTML = html;
            this.panel.querySelector('.notes-count').textContent = `${this.pages.length} pages`;
            this.setupPageListeners();
            return;
        }

        // If inside a page, show page editor view
        if (this.currentPageId !== null) {
            html = this.renderPageContent();
            listContainer.innerHTML = html;
            this.setupPageEditorListeners();
            return;
        }

        // Show folders first (only root level folders or child folders of current)
        if (this.currentFilter === 'all') {
            const foldersToShow = this.currentFolderId === null
                ? this.folders.filter(f => !f.parentFolderId)
                : this.getChildFolders(this.currentFolderId);

            foldersToShow.forEach(folder => {
                const noteCount = this.notes.filter(n => n.folderId === folder.id).length;
                const childFolderCount = this.getChildFolders(folder.id).length;
                html += `
                    <div class="note-folder" data-folder-id="${folder.id}" style="border-left: 4px solid ${folder.color || '#667eea'}">
                        <div class="folder-header">
                            <span class="folder-icon" style="color: ${folder.color || '#667eea'}">📁</span>
                            <span class="folder-name">${this.escapeHtml(folder.name)}</span>
                            <span class="folder-count">${noteCount} notes${childFolderCount > 0 ? `, ${childFolderCount} folders` : ''}</span>
                            <div class="folder-actions">
                                <button class="folder-action-btn folder-add-subfolder-btn" title="Add Subfolder">➕📁</button>
                                <button class="folder-action-btn folder-color-btn" title="Change Color">🎨</button>
                                <button class="folder-action-btn folder-rename-btn" title="Rename">✏️</button>
                                <button class="folder-action-btn folder-move-btn" title="Move Folder">📂</button>
                                <button class="folder-action-btn folder-delete-btn" title="Delete">🗑️</button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        // Show notes (only those in current folder, not in subfolders)
        const currentPdf = this.getCurrentPdfInfo();
        const notesToShow = this.currentFolderId === null
            ? notes.filter(n => !n.folderId && !n.pageId)
            : notes.filter(n => n.folderId === this.currentFolderId && !n.pageId);

        notesToShow.forEach(note => {
            const isFromCurrentPdf = note.pdfUrl === currentPdf.url || note.libraryId === currentPdf.libraryId;
            const dateStr = new Date(note.updatedAt || note.createdAt).toLocaleDateString();
            const noteColor = note.color || '#667eea';

            // Show selected text as a quote if available
            const selectedTextHtml = note.selectedText ? `
                <div class="note-selected-text" style="
                    background: rgba(102, 126, 234, 0.1);
                    border-left: 3px solid ${noteColor};
                    padding: 8px 12px;
                    margin: 8px 0;
                    font-style: italic;
                    font-size: 12px;
                    color: var(--theme-text-secondary, #a0a0a0);
                    border-radius: 0 6px 6px 0;
                ">"${this.escapeHtml(this.truncateText(note.selectedText, 120))}"</div>
            ` : '';

            html += `
                <div class="note-item ${isFromCurrentPdf ? 'current-pdf' : ''}" data-note-id="${note.id}" style="border-left: 4px solid ${noteColor}">
                    <div class="note-header">
                        <span class="note-color-dot" style="background: ${noteColor}"></span>
                        <span class="note-title">${this.escapeHtml(note.title || 'Untitled Note')}</span>
                        <div class="note-actions">
                            <button class="note-action-btn star-btn ${note.isStarred ? 'active' : ''}" title="Star">
                                ${note.isStarred ? '⭐' : '☆'}
                            </button>
                            <button class="note-action-btn color-btn" title="Change Highlight Color">🎨</button>
                            <button class="note-action-btn edit-btn" title="Edit">✏️</button>
                            <button class="note-action-btn move-btn" title="Move to folder">📁</button>
                            <button class="note-action-btn move-to-page-btn" title="Move to Page">📄</button>
                            <button class="note-action-btn delete-btn" title="Delete">🗑️</button>
                        </div>
                    </div>
                    ${selectedTextHtml}
                    <div class="note-preview">${this.escapeHtml(this.truncateText(note.content, 150))}</div>
                    <div class="note-meta">
                        <span class="note-pdf" title="${this.escapeHtml(note.pdfTitle || '')}">
                            📄 ${this.escapeHtml(this.truncateText(note.pdfTitle || 'Unknown PDF', 30))}
                        </span>
                        ${note.page ? `<span class="note-page">Page ${note.page}</span>` : ''}
                        <span class="note-date">${dateStr}</span>
                        ${isFromCurrentPdf ? '<span class="current-pdf-badge">Current PDF</span>' : ''}
                    </div>
                </div>
            `;
        });

        if (!html) {
            html = `
                <div class="notes-empty">
                    <div class="empty-icon">📝</div>
                    <div class="empty-text">No notes yet</div>
                    <div class="empty-hint">Click "New Note" to create your first note</div>
                </div>
            `;
        }

        listContainer.innerHTML = html;

        // Update count
        this.panel.querySelector('.notes-count').textContent = `${this.notes.length} notes`;

        this.setupNoteListeners();
    }

    // Render the list of Pages (like Google Docs pages)
    renderPagesList() {
        if (this.pages.length === 0) {
            return `
                <div class="notes-empty">
                    <div class="empty-icon">📄</div>
                    <div class="empty-text">No pages yet</div>
                    <div class="empty-hint">Create a Page to organize your notes like a document</div>
                </div>
            `;
        }

        let html = '';
        this.pages.forEach(page => {
            const notesInPage = this.notes.filter(n => n.pageId === page.id).length;
            const dateStr = new Date(page.updatedAt || page.createdAt).toLocaleDateString();

            html += `
                <div class="note-page-item" data-page-id="${page.id}" style="border-left: 4px solid ${page.color || '#667eea'}">
                    <div class="page-header">
                        <span class="page-icon">📄</span>
                        <span class="page-title">${this.escapeHtml(page.title || 'Untitled Page')}</span>
                        <div class="page-actions">
                            <button class="page-action-btn page-edit-btn" title="Edit Page">✏️</button>
                            <button class="page-action-btn page-export-btn" title="Export as PDF">📤</button>
                            <button class="page-action-btn page-delete-btn" title="Delete">🗑️</button>
                        </div>
                    </div>
                    <div class="page-preview">${this.escapeHtml(this.truncateText(page.content || '', 150))}</div>
                    <div class="page-meta">
                        <span class="page-notes-count">${notesInPage} notes attached</span>
                        <span class="page-date">${dateStr}</span>
                    </div>
                </div>
            `;
        });

        return html;
    }

    // Render page content (like Google Docs editor)
    renderPageContent() {
        const page = this.pages.find(p => p.id === this.currentPageId);
        if (!page) return '<div class="notes-empty">Page not found</div>';

        const notesInPage = this.notes.filter(n => n.pageId === this.currentPageId);

        let html = `
            <div class="page-editor">
                <div class="page-editor-header">
                    <input type="text" class="page-title-input" value="${this.escapeHtml(page.title)}" placeholder="Page Title..." />
                    <div class="page-editor-actions">
                        <button class="page-editor-btn save-page-btn" title="Save">💾 Save</button>
                        <button class="page-editor-btn export-page-btn" title="Export">📤 Export</button>
                    </div>
                </div>
                <div class="page-editor-body">
                    <textarea class="page-content-editor" placeholder="Start writing your page content here... Use this like Google Docs to organize your thoughts.">${this.escapeHtml(page.content || '')}</textarea>
                </div>
                <div class="page-notes-section">
                    <h4>📌 Notes in this Page</h4>
                    <div class="page-notes-list">
        `;

        if (notesInPage.length === 0) {
            html += `<div class="page-notes-empty">No notes attached. Use the "Move to Page" button on any note to add it here.</div>`;
        } else {
            notesInPage.forEach(note => {
                html += `
                    <div class="page-note-item" data-note-id="${note.id}">
                        <div class="page-note-header">
                            <span class="page-note-title">${this.escapeHtml(note.title || 'Untitled')}</span>
                            <div class="page-note-actions">
                                <button class="page-note-btn insert-note-btn" title="Insert into page">📥</button>
                                <button class="page-note-btn remove-from-page-btn" title="Remove from page">❌</button>
                            </div>
                        </div>
                        <div class="page-note-preview">${this.escapeHtml(this.truncateText(note.content, 100))}</div>
                    </div>
                `;
            });
        }

        html += `
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    setupPageListeners() {
        // Page click to open
        this.panel.querySelectorAll('.note-page-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.page-action-btn')) return;
                const pageId = item.dataset.pageId;
                this.currentPageId = pageId;
                this.renderNotes();
            });
        });

        // Page edit button
        this.panel.querySelectorAll('.page-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pageId = btn.closest('.note-page-item').dataset.pageId;
                this.currentPageId = pageId;
                this.renderNotes();
            });
        });

        // Page export button
        this.panel.querySelectorAll('.page-export-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pageId = btn.closest('.note-page-item').dataset.pageId;
                this.exportPage(pageId);
            });
        });

        // Page delete button
        this.panel.querySelectorAll('.page-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pageId = btn.closest('.note-page-item').dataset.pageId;
                this.deletePage(pageId);
            });
        });
    }

    setupPageEditorListeners() {
        // Save page button
        const saveBtn = this.panel.querySelector('.save-page-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveCurrentPage());
        }

        // Export page button
        const exportBtn = this.panel.querySelector('.export-page-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportPage(this.currentPageId));
        }

        // Auto-save on content change
        const titleInput = this.panel.querySelector('.page-title-input');
        const contentEditor = this.panel.querySelector('.page-content-editor');

        let saveTimeout;
        const autoSave = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => this.saveCurrentPage(), 1000);
        };

        if (titleInput) titleInput.addEventListener('input', autoSave);
        if (contentEditor) contentEditor.addEventListener('input', autoSave);

        // Insert note into page content
        this.panel.querySelectorAll('.insert-note-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const noteId = btn.closest('.page-note-item').dataset.noteId;
                this.insertNoteIntoPage(noteId);
            });
        });

        // Remove note from page
        this.panel.querySelectorAll('.remove-from-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const noteId = btn.closest('.page-note-item').dataset.noteId;
                this.removeNoteFromPage(noteId);
            });
        });
    }

    saveCurrentPage() {
        const page = this.pages.find(p => p.id === this.currentPageId);
        if (!page) return;

        const titleInput = this.panel.querySelector('.page-title-input');
        const contentEditor = this.panel.querySelector('.page-content-editor');

        if (titleInput) page.title = titleInput.value.trim() || 'Untitled Page';
        if (contentEditor) page.content = contentEditor.value;
        page.updatedAt = new Date().toISOString();

        this.saveNotes();
        this.showToast('Page saved');
    }

    insertNoteIntoPage(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        const contentEditor = this.panel.querySelector('.page-content-editor');

        if (note && contentEditor) {
            const noteText = `\n\n--- Note: ${note.title || 'Untitled'} ---\n${note.content}\n---\n`;
            contentEditor.value += noteText;
            this.saveCurrentPage();
            this.showToast('Note inserted into page');
        }
    }

    removeNoteFromPage(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (note && confirm(`Remove "${note.title || 'this note'}" from this page?`)) {
            note.pageId = null;
            note.updatedAt = new Date().toISOString();
            this.saveNotes();
            this.renderNotes();
            this.showToast('Note removed from page');
        }
    }

    setupNoteListeners() {
        // Folder click
        this.panel.querySelectorAll('.note-folder .folder-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.folder-action-btn')) return;
                const folderId = header.closest('.note-folder').dataset.folderId;
                this.currentFolderId = folderId;
                this.renderNotes();
            });
        });

        // Add subfolder button
        this.panel.querySelectorAll('.folder-add-subfolder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const parentFolderId = btn.closest('.note-folder').dataset.folderId;
                this.showCreateFolderDialog(parentFolderId);
            });
        });

        // Move folder button
        this.panel.querySelectorAll('.folder-move-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderId = btn.closest('.note-folder').dataset.folderId;
                this.showMoveFolderDialog(folderId);
            });
        });

        // Folder color change
        this.panel.querySelectorAll('.folder-color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderId = btn.closest('.note-folder').dataset.folderId;
                this.showFolderColorDialog(folderId);
            });
        });

        // Folder rename
        this.panel.querySelectorAll('.folder-rename-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderId = btn.closest('.note-folder').dataset.folderId;
                const folder = this.folders.find(f => f.id === folderId);
                const newName = prompt('Enter new folder name:', folder?.name);
                if (newName && newName.trim()) {
                    folder.name = newName.trim();
                    this.saveNotes();
                    this.renderNotes();
                }
            });
        });

        // Folder delete
        this.panel.querySelectorAll('.folder-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderId = btn.closest('.note-folder').dataset.folderId;
                const folder = this.folders.find(f => f.id === folderId);
                if (confirm(`Delete folder "${folder?.name}"? Notes will be moved to root.`)) {
                    this.notes.forEach(n => {
                        if (n.folderId === folderId) n.folderId = null;
                    });
                    this.folders = this.folders.filter(f => f.id !== folderId);
                    this.saveNotes();
                    this.renderNotes();
                }
            });
        });

        // Note click - view/edit
        this.panel.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.note-action-btn')) return;
                const noteId = item.dataset.noteId;
                this.showViewNoteDialog(noteId);
            });
        });

        // Star button
        this.panel.querySelectorAll('.star-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const noteId = btn.closest('.note-item').dataset.noteId;
                this.toggleStar(noteId);
            });
        });

        // Edit button
        this.panel.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const noteId = btn.closest('.note-item').dataset.noteId;
                this.showEditNoteDialog(noteId);
            });
        });

        // Move button
        this.panel.querySelectorAll('.move-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const noteId = btn.closest('.note-item').dataset.noteId;
                this.showMoveDialog(noteId);
            });
        });

        // Delete button
        this.panel.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const noteId = btn.closest('.note-item').dataset.noteId;
                this.deleteNote(noteId);
            });
        });

        // Color button - change note and highlight color
        this.panel.querySelectorAll('.note-item .color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const noteId = btn.closest('.note-item').dataset.noteId;
                this.showNoteColorDialog(noteId);
            });
        });

        // Move to page button
        this.panel.querySelectorAll('.move-to-page-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const noteId = btn.closest('.note-item').dataset.noteId;
                this.showMoveToPageDialog(noteId);
            });
        });
    }

    updateBreadcrumb() {
        const breadcrumb = this.panel.querySelector('.notes-breadcrumb');

        // If viewing a page
        if (this.currentPageId !== null) {
            const page = this.pages.find(p => p.id === this.currentPageId);
            breadcrumb.innerHTML = `
                <span class="breadcrumb-item" data-folder-id="null">📝 All Notes</span>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-item" data-folder-id="null" onclick="window.globalNotesManager.currentFilter='pages'; window.globalNotesManager.currentPageId=null; window.globalNotesManager.renderNotes();">📄 Pages</span>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-item active" data-page-id="${page?.id}" style="color: ${page?.color || '#667eea'}">
                    📄 ${page?.title || 'Untitled Page'}
                </span>
            `;
            return;
        }

        // If viewing pages filter
        if (this.currentFilter === 'pages') {
            breadcrumb.innerHTML = `
                <span class="breadcrumb-item" data-folder-id="null">📝 All Notes</span>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-item active">📄 Pages</span>
            `;
            return;
        }

        if (this.currentFolderId === null) {
            breadcrumb.innerHTML = `<span class="breadcrumb-item active" data-folder-id="null">📝 All Notes</span>`;
        } else {
            // Build full path for nested folders
            const path = this.getFolderPath(this.currentFolderId);
            let html = `<span class="breadcrumb-item" data-folder-id="null">📝 All Notes</span>`;

            path.forEach((folder, index) => {
                const isLast = index === path.length - 1;
                html += `
                    <span class="breadcrumb-separator">›</span>
                    <span class="breadcrumb-item ${isLast ? 'active' : ''}" data-folder-id="${folder.id}" style="color: ${folder.color || '#667eea'}">
                        📁 ${folder.name || 'Unknown'}
                    </span>
                `;
            });

            breadcrumb.innerHTML = html;
        }
    }

    // Get full folder path (for nested folders breadcrumb)
    getFolderPath(folderId) {
        const path = [];
        let current = this.folders.find(f => f.id === folderId);

        while (current) {
            path.unshift(current);
            current = current.parentFolderId ? this.folders.find(f => f.id === current.parentFolderId) : null;
        }

        return path;
    }

    showAddNoteDialog(initialContent = '', initialTitle = '') {
        const currentPdf = this.getCurrentPdfInfo();
        const currentPage = window.PDFViewerApplication?.page || 1;
        const colors = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        let selectedColor = colors[0];

        // Pre-select current folder if browsing inside one
        const preSelectedFolderId = this.currentFolderId;

        const dialog = document.createElement('div');
        dialog.className = 'note-dialog-overlay';
        dialog.innerHTML = `
            <div class="note-dialog">
                <div class="note-dialog-header">
                    <h3>Add New Note</h3>
                    <button class="note-dialog-close">×</button>
                </div>
                <div class="note-dialog-body">
                    <input type="text" class="note-title-input" placeholder="Note title..." value="${this.escapeHtml(initialTitle)}" />
                    <textarea class="note-content-input" placeholder="Write your note here..." rows="8">${this.escapeHtml(initialContent)}</textarea>
                    
                    <div class="color-picker-label">Note Color:</div>
                    <div class="folder-color-picker">
                        ${colors.map((c, i) => `
                            <button class="color-option ${i === 0 ? 'selected' : ''}" data-color="${c}" style="background: ${c}"></button>
                        `).join('')}
                    </div>
                    
                    <div class="note-dialog-meta">
                        <label>
                            <input type="checkbox" class="link-to-pdf" checked />
                            Link to current PDF (${this.truncateText(currentPdf.title, 30)})
                        </label>
                        <label>
                            <input type="checkbox" class="link-to-page" checked />
                            Link to page ${currentPage}
                        </label>
                    </div>
                    <div class="note-folder-select">
                        <label>Folder:</label>
                        <select class="folder-select">
                            <option value="" ${!preSelectedFolderId ? 'selected' : ''}>No folder</option>
                            ${this.folders.map(f => `<option value="${f.id}" ${preSelectedFolderId === f.id ? 'selected' : ''} style="color: ${f.color}">${f.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="note-dialog-footer">
                    <button class="note-dialog-btn cancel-btn">Cancel</button>
                    <button class="note-dialog-btn save-btn primary">Save Note</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Color picker events
        dialog.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                dialog.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedColor = btn.dataset.color;
            });
        });

        dialog.querySelector('.note-dialog-close').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.cancel-btn').addEventListener('click', () => dialog.remove());

        dialog.querySelector('.save-btn').addEventListener('click', () => {
            const title = dialog.querySelector('.note-title-input').value.trim();
            const content = dialog.querySelector('.note-content-input').value.trim();
            const linkToPdf = dialog.querySelector('.link-to-pdf').checked;
            const linkToPage = dialog.querySelector('.link-to-page').checked;
            const folderId = dialog.querySelector('.folder-select').value || null;

            if (!content) {
                alert('Please enter note content');
                return;
            }

            const note = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                title: title || 'Untitled Note',
                content: content,
                color: selectedColor,
                pdfUrl: linkToPdf ? currentPdf.url : null,
                libraryId: linkToPdf ? currentPdf.libraryId : null,
                pdfTitle: linkToPdf ? currentPdf.title : null,
                page: linkToPage ? currentPage : null,
                folderId: folderId,
                isStarred: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            this.notes.push(note);
            this.saveNotes();
            this.renderNotes();
            dialog.remove();
            this.showToast('Note added');
        });

        dialog.querySelector('.note-title-input').focus();
    }

    showViewNoteDialog(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        const dialog = document.createElement('div');
        dialog.className = 'note-dialog-overlay';
        dialog.innerHTML = `
            <div class="note-dialog view-mode">
                <div class="note-dialog-header">
                    <h3>${this.escapeHtml(note.title || 'Untitled Note')}</h3>
                    <button class="note-dialog-close">×</button>
                </div>
                <div class="note-dialog-body">
                    <div class="note-view-content">${this.escapeHtml(note.content).replace(/\n/g, '<br>')}</div>
                    <div class="note-view-meta">
                        ${note.pdfTitle ? `<div class="meta-item">📄 ${this.escapeHtml(note.pdfTitle)}</div>` : ''}
                        ${note.page ? `<div class="meta-item">📑 Page ${note.page}</div>` : ''}
                        <div class="meta-item">🕐 ${new Date(note.createdAt).toLocaleString()}</div>
                    </div>
                </div>
                <div class="note-dialog-footer">
                    ${note.pdfUrl ? `<button class="note-dialog-btn goto-btn">Go to PDF</button>` : ''}
                    <button class="note-dialog-btn edit-btn">Edit</button>
                    <button class="note-dialog-btn close-btn">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        dialog.querySelector('.note-dialog-close').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.close-btn').addEventListener('click', () => dialog.remove());

        dialog.querySelector('.edit-btn')?.addEventListener('click', () => {
            dialog.remove();
            this.showEditNoteDialog(noteId);
        });

        dialog.querySelector('.goto-btn')?.addEventListener('click', () => {
            this.goToNote(note);
            dialog.remove();
        });
    }

    showEditNoteDialog(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        const colors = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        const currentColor = note.color || '#667eea';

        const dialog = document.createElement('div');
        dialog.className = 'note-dialog-overlay';
        dialog.innerHTML = `
            <div class="note-dialog">
                <div class="note-dialog-header">
                    <h3>Edit Note</h3>
                    <button class="note-dialog-close">×</button>
                </div>
                <div class="note-dialog-body">
                    <input type="text" class="note-title-input" value="${this.escapeHtml(note.title || '')}" placeholder="Note title..." />
                    <textarea class="note-content-input" placeholder="Write your note here..." rows="8">${this.escapeHtml(note.content || '')}</textarea>
                    <div class="note-folder-select">
                        <label>Folder:</label>
                        <select class="folder-select">
                            <option value="">No folder</option>
                            ${this.folders.map(f => `<option value="${f.id}" ${note.folderId === f.id ? 'selected' : ''}>${f.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="note-color-picker">
                        <label>Note Color:</label>
                        <div class="color-options">
                            ${colors.map(color => `<div class="color-option ${color === currentColor ? 'selected' : ''}" data-color="${color}" style="background-color: ${color};" title="${color}"></div>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="note-dialog-footer">
                    <button class="note-dialog-btn cancel-btn">Cancel</button>
                    <button class="note-dialog-btn save-btn primary">Save Changes</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        let selectedColor = currentColor;

        // Color picker event listener
        dialog.querySelectorAll('.note-color-picker .color-option').forEach(opt => {
            opt.addEventListener('click', () => {
                dialog.querySelectorAll('.note-color-picker .color-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                selectedColor = opt.dataset.color;
            });
        });

        dialog.querySelector('.note-dialog-close').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.cancel-btn').addEventListener('click', () => dialog.remove());

        dialog.querySelector('.save-btn').addEventListener('click', () => {
            note.title = dialog.querySelector('.note-title-input').value.trim() || 'Untitled Note';
            note.content = dialog.querySelector('.note-content-input').value.trim();
            note.folderId = dialog.querySelector('.folder-select').value || null;
            note.color = selectedColor;
            note.updatedAt = new Date().toISOString();

            this.saveNotes();
            this.renderNotes();
            dialog.remove();
            this.showToast('Note updated');
        });
    }

    showCreateFolderDialog(parentFolderId = null) {
        const colors = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        let selectedColor = colors[0];

        const parentFolder = parentFolderId ? this.folders.find(f => f.id === parentFolderId) : null;
        const title = parentFolder ? `Create Subfolder in "${parentFolder.name}"` : 'Create New Folder';

        const dialog = document.createElement('div');
        dialog.className = 'note-dialog-overlay';
        dialog.innerHTML = `
            <div class="note-dialog small">
                <div class="note-dialog-header">
                    <h3>${title}</h3>
                    <button class="note-dialog-close">×</button>
                </div>
                <div class="note-dialog-body">
                    <input type="text" class="note-title-input" placeholder="Folder name..." autofocus />
                    <div class="color-picker-label">Folder Color:</div>
                    <div class="folder-color-picker">
                        ${colors.map((c, i) => `
                            <button class="color-option ${i === 0 ? 'selected' : ''}" data-color="${c}" style="background: ${c}"></button>
                        `).join('')}
                    </div>
                </div>
                <div class="note-dialog-footer">
                    <button class="note-dialog-btn cancel-btn">Cancel</button>
                    <button class="note-dialog-btn save-btn primary">Create Folder</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Color picker events
        dialog.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                dialog.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedColor = btn.dataset.color;
            });
        });

        dialog.querySelector('.note-dialog-close').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.cancel-btn').addEventListener('click', () => dialog.remove());

        dialog.querySelector('.save-btn').addEventListener('click', () => {
            const name = dialog.querySelector('.note-title-input').value.trim();
            if (!name) {
                alert('Please enter a folder name');
                return;
            }

            const folder = {
                id: Date.now().toString(),
                name: name,
                color: selectedColor,
                parentFolderId: parentFolderId, // Support nested folders
                createdAt: new Date().toISOString()
            };
            this.folders.push(folder);
            this.saveNotes();
            this.renderNotes();
            dialog.remove();
            this.showToast(parentFolderId ? 'Subfolder created' : 'Folder created');
        });

        dialog.querySelector('.note-title-input').focus();
    }

    showFolderColorDialog(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        if (!folder) return;

        const colors = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        let selectedColor = folder.color || colors[0];

        const dialog = document.createElement('div');
        dialog.className = 'note-dialog-overlay';
        dialog.innerHTML = `
            <div class="note-dialog small">
                <div class="note-dialog-header">
                    <h3>Change Folder Color</h3>
                    <button class="note-dialog-close">×</button>
                </div>
                <div class="note-dialog-body">
                    <p style="margin-bottom: 12px; color: #888;">Folder: <strong style="color: #e0e0e0">${this.escapeHtml(folder.name)}</strong></p>
                    <div class="color-picker-label">Select Color:</div>
                    <div class="folder-color-picker">
                        ${colors.map(c => `
                            <button class="color-option ${selectedColor === c ? 'selected' : ''}" data-color="${c}" style="background: ${c}"></button>
                        `).join('')}
                    </div>
                    <div style="margin-top: 16px;">
                        <label style="display: flex; align-items: center; gap: 8px; color: #aaa; cursor: pointer;">
                            <input type="checkbox" id="applyToNotes" />
                            Apply this color to all notes in this folder
                        </label>
                    </div>
                </div>
                <div class="note-dialog-footer">
                    <button class="note-dialog-btn cancel-btn">Cancel</button>
                    <button class="note-dialog-btn save-btn primary">Apply</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Color picker events
        dialog.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                dialog.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedColor = btn.dataset.color;
            });
        });

        dialog.querySelector('.note-dialog-close').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.cancel-btn').addEventListener('click', () => dialog.remove());

        dialog.querySelector('.save-btn').addEventListener('click', () => {
            folder.color = selectedColor;

            // Apply to all notes in folder if checked
            const applyToNotes = dialog.querySelector('#applyToNotes').checked;
            if (applyToNotes) {
                this.notes.forEach(note => {
                    if (note.folderId === folderId) {
                        note.color = selectedColor;
                        // Also update highlights if on the same PDF
                        this.updateHighlightColor(note.highlightId, selectedColor);
                    }
                });
            }

            this.saveNotes();
            this.renderNotes();
            dialog.remove();
            this.showToast(applyToNotes ? 'Folder and notes updated' : 'Folder color updated');
        });
    }

    showNoteColorDialog(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        const colors = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        let selectedColor = note.color || '#667eea';

        const dialog = document.createElement('div');
        dialog.className = 'note-dialog-overlay';
        dialog.innerHTML = `
            <div class="note-dialog small">
                <div class="note-dialog-header">
                    <h3>🎨 Change Note Color</h3>
                    <button class="note-dialog-close">×</button>
                </div>
                <div class="note-dialog-body">
                    <p style="color: #888; font-size: 13px; margin-bottom: 12px;">Choose a color for this note and its highlight:</p>
                    <div class="folder-color-picker" style="justify-content: center;">
                        ${colors.map(c => `
                            <button class="color-option ${c === selectedColor ? 'selected' : ''}" data-color="${c}" style="background: ${c}"></button>
                        `).join('')}
                    </div>
                    <div style="margin-top: 15px;">
                        <label style="display: flex; align-items: center; gap: 8px; color: #aaa; font-size: 13px; cursor: pointer;">
                            <input type="checkbox" id="updateHighlight" checked style="width: 16px; height: 16px;">
                            Update highlight color in PDF
                        </label>
                    </div>
                </div>
                <div class="note-dialog-footer">
                    <button class="note-dialog-btn cancel-btn">Cancel</button>
                    <button class="note-dialog-btn save-btn primary">Apply</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Color picker events
        dialog.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                dialog.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedColor = btn.dataset.color;
            });
        });

        dialog.querySelector('.note-dialog-close').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.cancel-btn').addEventListener('click', () => dialog.remove());

        dialog.querySelector('.save-btn').addEventListener('click', () => {
            note.color = selectedColor;
            note.updatedAt = new Date().toISOString();

            // Update highlight if checked
            const updateHighlight = dialog.querySelector('#updateHighlight').checked;
            if (updateHighlight && note.highlightId) {
                this.updateHighlightColor(note.highlightId, selectedColor);
            }

            this.saveNotes();
            this.renderNotes();
            dialog.remove();
            this.showToast('Note color updated');
        });
    }

    // ========== PAGES FEATURE (Like Google Docs) ==========

    showCreatePageDialog() {
        const colors = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        let selectedColor = colors[0];

        const dialog = document.createElement('div');
        dialog.className = 'note-dialog-overlay';
        dialog.innerHTML = `
            <div class="note-dialog">
                <div class="note-dialog-header">
                    <h3>📄 Create New Page</h3>
                    <button class="note-dialog-close">×</button>
                </div>
                <div class="note-dialog-body">
                    <p style="color: #888; font-size: 13px; margin-bottom: 12px;">Create a page to organize your notes like a Google Doc</p>
                    <input type="text" class="note-title-input" placeholder="Page title..." autofocus />
                    <textarea class="note-content-input" placeholder="Start writing your page content here..." rows="6"></textarea>
                    <div class="color-picker-label">Page Color:</div>
                    <div class="folder-color-picker">
                        ${colors.map((c, i) => `
                            <button class="color-option ${i === 0 ? 'selected' : ''}" data-color="${c}" style="background: ${c}"></button>
                        `).join('')}
                    </div>
                </div>
                <div class="note-dialog-footer">
                    <button class="note-dialog-btn cancel-btn">Cancel</button>
                    <button class="note-dialog-btn save-btn primary">Create Page</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Color picker events
        dialog.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                dialog.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedColor = btn.dataset.color;
            });
        });

        dialog.querySelector('.note-dialog-close').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.cancel-btn').addEventListener('click', () => dialog.remove());

        dialog.querySelector('.save-btn').addEventListener('click', () => {
            const title = dialog.querySelector('.note-title-input').value.trim();
            const content = dialog.querySelector('.note-content-input').value;

            if (!title) {
                alert('Please enter a page title');
                return;
            }

            const page = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                title: title,
                content: content,
                color: selectedColor,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            this.pages.push(page);
            this.saveNotes();
            this.currentFilter = 'pages';
            this.currentPageId = page.id;
            this.renderNotes();
            dialog.remove();
            this.showToast('Page created');
        });

        dialog.querySelector('.note-title-input').focus();
    }

    showMoveToPageDialog(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        const dialog = document.createElement('div');
        dialog.className = 'note-dialog-overlay';
        dialog.innerHTML = `
            <div class="note-dialog small">
                <div class="note-dialog-header">
                    <h3>📄 Move to Page</h3>
                    <button class="note-dialog-close">×</button>
                </div>
                <div class="note-dialog-body">
                    <p style="color: #888; font-size: 13px; margin-bottom: 12px;">Select a page to move this note to:</p>
                    <div class="folder-list">
                        <div class="folder-option ${!note.pageId ? 'selected' : ''}" data-page-id="">
                            📝 No page (keep as standalone note)
                        </div>
                        ${this.pages.map(p => `
                            <div class="folder-option ${note.pageId === p.id ? 'selected' : ''}" data-page-id="${p.id}">
                                <span style="color: ${p.color}">📄</span> ${this.escapeHtml(p.title)}
                            </div>
                        `).join('')}
                    </div>
                    ${this.pages.length === 0 ? '<p style="color: #888; font-size: 12px; margin-top: 10px;">No pages yet. Create a page first.</p>' : ''}
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        dialog.querySelector('.note-dialog-close').addEventListener('click', () => dialog.remove());

        dialog.querySelectorAll('.folder-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const pageId = opt.dataset.pageId || null;
                note.pageId = pageId;
                note.updatedAt = new Date().toISOString();
                this.saveNotes();
                this.renderNotes();
                dialog.remove();
                this.showToast(pageId ? 'Note moved to page' : 'Note removed from page');
            });
        });
    }

    showMoveFolderDialog(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        if (!folder) return;

        // Get valid parent folders (exclude self and descendants)
        const descendantIds = this.getDescendantFolderIds(folderId);
        const validFolders = this.folders.filter(f =>
            f.id !== folderId && !descendantIds.includes(f.id)
        );

        const dialog = document.createElement('div');
        dialog.className = 'note-dialog-overlay';
        dialog.innerHTML = `
            <div class="note-dialog small">
                <div class="note-dialog-header">
                    <h3>📂 Move Folder</h3>
                    <button class="note-dialog-close">×</button>
                </div>
                <div class="note-dialog-body">
                    <p style="color: #888; font-size: 13px; margin-bottom: 12px;">Move "${this.escapeHtml(folder.name)}" to:</p>
                    <div class="folder-list">
                        <div class="folder-option ${!folder.parentFolderId ? 'selected' : ''}" data-folder-id="">
                            📝 Root level (no parent)
                        </div>
                        ${validFolders.map(f => `
                            <div class="folder-option ${folder.parentFolderId === f.id ? 'selected' : ''}" data-folder-id="${f.id}">
                                <span style="color: ${f.color}">📁</span> ${this.escapeHtml(f.name)}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        dialog.querySelector('.note-dialog-close').addEventListener('click', () => dialog.remove());

        dialog.querySelectorAll('.folder-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const parentId = opt.dataset.folderId || null;
                folder.parentFolderId = parentId;
                this.saveNotes();
                this.renderNotes();
                dialog.remove();
                this.showToast('Folder moved');
            });
        });
    }

    deletePage(pageId) {
        const page = this.pages.find(p => p.id === pageId);
        if (page && confirm(`Delete page "${page.title || 'Untitled Page'}"? Notes will be unassigned.`)) {
            // Remove page association from notes
            this.notes.forEach(n => {
                if (n.pageId === pageId) {
                    n.pageId = null;
                    n.updatedAt = new Date().toISOString();
                }
            });

            this.pages = this.pages.filter(p => p.id !== pageId);
            this.saveNotes();

            if (this.currentPageId === pageId) {
                this.currentPageId = null;
            }

            this.renderNotes();
            this.showToast('Page deleted');
        }
    }

    exportPage(pageId) {
        const page = this.pages.find(p => p.id === pageId);
        if (!page) return;

        const notesInPage = this.notes.filter(n => n.pageId === pageId);

        let content = `# ${page.title || 'Untitled Page'}\n\n`;
        content += page.content || '';

        if (notesInPage.length > 0) {
            content += '\n\n---\n## Attached Notes\n\n';
            notesInPage.forEach(note => {
                content += `### ${note.title || 'Untitled Note'}\n`;
                content += `${note.content}\n`;
                if (note.pdfTitle) content += `*From: ${note.pdfTitle}*\n`;
                content += '\n';
            });
        }

        // Export as markdown file
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(page.title || 'page').replace(/[^a-z0-9]/gi, '_')}.md`;
        a.click();
        URL.revokeObjectURL(url);

        this.showToast('Page exported as Markdown');
    }

    // Update a highlight's color in the PDF viewer
    updateHighlightColor(highlightId, newColor) {
        if (!highlightId) return;

        // Try to update highlight in HighlightManager
        if (window.highlightManager && typeof window.highlightManager.updateHighlightColor === 'function') {
            window.highlightManager.updateHighlightColor(highlightId, newColor);
        }

        // Also try direct DOM update for visible highlights
        const highlightElements = document.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
        highlightElements.forEach(el => {
            el.style.backgroundColor = newColor;
            // Handle different opacity levels
            const currentOpacity = el.style.opacity || 0.35;
            el.style.backgroundColor = this.hexToRgba(newColor, parseFloat(currentOpacity));
        });

        // Update in storage
        if (window.highlightManager && window.highlightManager.highlights) {
            const highlight = window.highlightManager.highlights.find(h => h.id === highlightId);
            if (highlight) {
                highlight.color = newColor;
                window.highlightManager.saveHighlights();
            }
        }
    }

    // Convert hex color to rgba
    hexToRgba(hex, alpha = 0.35) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    showMoveDialog(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        const dialog = document.createElement('div');
        dialog.className = 'note-dialog-overlay';
        dialog.innerHTML = `
            <div class="note-dialog small">
                <div class="note-dialog-header">
                    <h3>Move to Folder</h3>
                    <button class="note-dialog-close">×</button>
                </div>
                <div class="note-dialog-body">
                    <div class="folder-list">
                        <div class="folder-option ${!note.folderId ? 'selected' : ''}" data-folder-id="">
                            📝 No folder (root)
                        </div>
                        ${this.folders.map(f => `
                            <div class="folder-option ${note.folderId === f.id ? 'selected' : ''}" data-folder-id="${f.id}">
                                <span style="color: ${f.color}">📁</span> ${f.name}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        dialog.querySelector('.note-dialog-close').addEventListener('click', () => dialog.remove());

        dialog.querySelectorAll('.folder-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const folderId = opt.dataset.folderId || null;
                note.folderId = folderId;
                note.updatedAt = new Date().toISOString();
                this.saveNotes();
                this.renderNotes();
                dialog.remove();
                this.showToast('Note moved');
            });
        });
    }

    toggleStar(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (note) {
            note.isStarred = !note.isStarred;
            this.saveNotes();
            this.renderNotes();
        }
    }

    deleteNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (note && confirm(`Delete "${note.title || 'this note'}"?`)) {
            // Also delete associated highlight if it exists
            if (note.highlightId) {
                this.deleteAssociatedHighlight(note.highlightId);
            }

            this.notes = this.notes.filter(n => n.id !== noteId);
            this.saveNotes();
            this.renderNotes();
            this.showToast('Note deleted');
        }
    }

    // Delete highlight associated with a note
    deleteAssociatedHighlight(highlightId) {
        if (!highlightId) return;

        // Remove from DOM
        const highlightElements = document.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
        highlightElements.forEach(el => el.remove());

        // Remove from highlight manager's storage
        if (window.highlightManager && window.highlightManager.highlights) {
            const idx = window.highlightManager.highlights.findIndex(h => h.id === highlightId);
            if (idx !== -1) {
                window.highlightManager.highlights.splice(idx, 1);
                window.highlightManager.saveHighlights();
            }
        }

        // Also try the global deleteHighlight function
        if (typeof window.deleteHighlight === 'function') {
            try {
                window.deleteHighlight(highlightId);
            } catch (e) {
            }
        }

    }

    goToNote(note) {
        if (!note.pdfUrl) return;

        const navigateToPageInCurrentViewer = (page) => {
            const targetPage = Number.parseInt(page, 10);
            if (!Number.isFinite(targetPage) || targetPage <= 0) return false;

            if (window.PDFViewerApplication && typeof window.PDFViewerApplication.page !== 'undefined') {
                window.PDFViewerApplication.page = targetPage;
                return true;
            }

            if (typeof window.scrollToPage === 'function') {
                try {
                    window.scrollToPage(targetPage);
                    return true;
                } catch (e) {
                }
            }

            try {
                window.location.hash = `#page=${targetPage}`;
                return true;
            } catch (e) {
            }

            return false;
        };

        if (note.pdfUrl.startsWith('library://')) {
            const libraryId = note.pdfUrl.replace('library://', '');

            // If we're already viewing this library PDF, just navigate.
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const currentSource = urlParams.get('source');
                const currentId = urlParams.get('id');
                if (currentSource === 'library' && currentId && currentId === libraryId) {
                    if (note.page && navigateToPageInCurrentViewer(note.page)) {
                        this.showToast(`Navigated to page ${Number.parseInt(note.page, 10)}`);
                    }
                    return;
                }
            } catch (e) {
            }

            // Need to load from IndexedDB and navigate
            if (typeof PdfStorage !== 'undefined') {
                const pdfStorage = new PdfStorage();
                pdfStorage.init().then(async () => {
                    const pdfRecord = await pdfStorage.getPdf(libraryId);
                    if (pdfRecord && pdfRecord.data) {
                        const bytes = new Uint8Array(pdfRecord.data);
                        const base64 = this.uint8ArrayToBase64(bytes);
                        sessionStorage.setItem('pendingPdfData', base64);
                        sessionStorage.setItem('pendingPdfTitle', pdfRecord.title || 'PDF');

                        const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
                        window.location.href = `${viewerUrl}?source=library&id=${libraryId}${note.page ? `#page=${note.page}` : ''}`;
                    }
                });
            }
        } else {
            // Check if this is the current PDF by comparing normalized URLs
            const urlParams = new URLSearchParams(window.location.search);
            const currentFile = urlParams.get('file');

            // Normalize URLs for comparison
            const normalizeUrl = (url) => {
                if (!url) return '';
                try {
                    return decodeURIComponent(url).toLowerCase().replace(/\/+$/, '');
                } catch (e) {
                    return url.toLowerCase().replace(/\/+$/, '');
                }
            };

            const currentNormalized = normalizeUrl(currentFile);
            const noteNormalized = normalizeUrl(note.pdfUrl);
            const isSamePdf = currentNormalized && noteNormalized &&
                (currentNormalized === noteNormalized ||
                    currentNormalized.includes(noteNormalized) ||
                    noteNormalized.includes(currentNormalized));


            if (isSamePdf) {
                // Same PDF - just navigate to page
                if (note.page && navigateToPageInCurrentViewer(note.page)) {
                    this.showToast(`Navigated to page ${Number.parseInt(note.page, 10)}`);

                    // Try to scroll to the highlight if it exists
                    if (note.highlightId) {
                        setTimeout(() => {
                            const highlightEl = document.querySelector(`[data-highlight-id="${note.highlightId}"]`);
                            if (highlightEl) {
                                highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                // Flash the highlight
                                highlightEl.style.transition = 'box-shadow 0.3s';
                                highlightEl.style.boxShadow = '0 0 10px 3px rgba(255, 200, 0, 0.8)';
                                setTimeout(() => {
                                    highlightEl.style.boxShadow = '';
                                }, 1500);
                            }
                        }, 500);
                    }
                } else {
                    this.showToast('Navigating to note location');
                }
            } else {
                // Different PDF - open in extension viewer
                const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
                const targetUrl = `${viewerUrl}?file=${encodeURIComponent(note.pdfUrl)}${note.page ? `#page=${note.page}` : ''}`;
                window.location.href = targetUrl;
            }
        }
    }

    uint8ArrayToBase64(bytes) {
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    exportNotes() {
        const data = {
            notes: this.notes,
            folders: this.folders,
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notes_export_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.showToast('Notes exported');
    }

    getRandomColor() {
        const colors = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message) {
        const existingToast = document.querySelector('.notes-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'notes-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.globalNotesManager = new GlobalNotesManager();
    });
} else {
    window.globalNotesManager = new GlobalNotesManager();
}
