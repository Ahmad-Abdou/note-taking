/**
 * Research Library Manager with Folder System
 * Manages a collection of PDFs with folder organization, cross-tab sync, and persistence
 * Uses IndexedDB for storing actual PDF files (bypasses chrome.storage 5MB limit)
 */

class ResearchLibraryManager {
    constructor() {
        this.library = [];
        this.folders = [];
        this.isOpen = false;
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.currentFolderId = null; // null means root/all view
        
        // Initialize PDF storage (IndexedDB)
        this.pdfStorage = new PdfStorage();
        
        // Cross-tab sync listener
        this.setupStorageListener();
        
        this.autoInit();
    }

    setupStorageListener() {
        // Listen for changes from other tabs
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local') {
                if (changes.researchLibrary) {
                    this.library = changes.researchLibrary.newValue || [];
                    if (this.isOpen) {
                        this.renderLibrary();
                    }
                }
                if (changes.researchFolders) {
                    this.folders = changes.researchFolders.newValue || [];
                    if (this.isOpen) {
                        this.renderLibrary();
                    }
                }
            }
        });
    }

    async autoInit() {
        // Initialize IndexedDB for PDF storage
        await this.pdfStorage.init();
        
        await this.loadLibrary();
        // Don't create button - it already exists in viewer.html
        // Just create the panel
        this.createLibraryPanel();
        this.registerWithOverlayManager();
        
        // Check if library should be kept open (after switching PDFs)
        if (sessionStorage.getItem('keepLibraryOpen') === 'true') {
            sessionStorage.removeItem('keepLibraryOpen');
            setTimeout(() => {
                this.showPanel();
            }, 500);
        }
        
        // Automatically add current PDF to library
        setTimeout(() => {
            this.addCurrentPdfToLibraryAuto();
        }, 2000);
    }

    async addCurrentPdfToLibraryAuto() {
        const currentUrl = window.location.href;
        
        // Check if this PDF is already in the library
        const exists = this.library.some(item => item.url === currentUrl);
        if (exists) return;

        // Get PDF info
        const title = this.extractTitleFromUrl(currentUrl);
        const pageCount = window.PDFViewerApplication?.pagesCount || 0;

        // Don't auto-add, just track that we've seen this PDF
        // User can manually add via the library panel
    }

    async addCurrentPdfToLibrary(folderId = null) {
        const currentUrl = window.location.href;
        
        // Check if already exists
        const exists = this.library.some(item => item.url === currentUrl);
        if (exists) {
            this.showToast('This PDF is already in your library');
            return;
        }

        const title = this.extractTitleFromUrl(currentUrl);
        const pageCount = window.PDFViewerApplication?.pagesCount || 0;

        const newEntry = {
            id: Date.now().toString(),
            title: title,
            author: '',
            url: currentUrl,
            pageCount: pageCount,
            addedAt: new Date().toISOString(),
            lastOpened: new Date().toISOString(),
            isFavorite: false,
            tags: [],
            notes: '',
            folderId: folderId // null means root level
        };

        this.library.push(newEntry);
        await this.saveLibrary();
        this.renderLibrary();
        this.showToast('Added to library');
    }

    extractTitleFromUrl(url) {
        try {
            const urlObj = new URL(url);
            let filename = urlObj.pathname.split('/').pop();
            filename = decodeURIComponent(filename);
            filename = filename.replace(/\.pdf$/i, '');
            filename = filename.replace(/[-_]/g, ' ');
            return filename || 'Untitled PDF';
        } catch (e) {
            return 'Untitled PDF';
        }
    }

    async loadLibrary() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['researchLibrary', 'researchFolders'], (result) => {
                this.library = result.researchLibrary || [];
                this.folders = result.researchFolders || [];
                resolve();
            });
        });
    }

    async saveLibrary() {
        return new Promise((resolve) => {
            chrome.storage.local.set({ 
                researchLibrary: this.library,
                researchFolders: this.folders
            }, resolve);
        });
    }

    // ==================== FOLDER MANAGEMENT ====================

    async createFolder(name, color = '#4285f4') {
        const folder = {
            id: Date.now().toString(),
            name: name.trim(),
            color: color,
            createdAt: new Date().toISOString()
        };
        
        this.folders.push(folder);
        await this.saveLibrary();
        this.renderLibrary();
        this.showToast(`Folder "${name}" created`);
        return folder;
    }

    async renameFolder(folderId, newName) {
        const folder = this.folders.find(f => f.id === folderId);
        if (folder) {
            folder.name = newName.trim();
            await this.saveLibrary();
            this.renderLibrary();
        }
    }

    async deleteFolder(folderId) {
        // Move all books in this folder to root
        this.library.forEach(book => {
            if (book.folderId === folderId) {
                book.folderId = null;
            }
        });
        
        this.folders = this.folders.filter(f => f.id !== folderId);
        await this.saveLibrary();
        this.renderLibrary();
        this.showToast('Folder deleted');
    }

    async moveBookToFolder(bookId, folderId) {
        const book = this.library.find(b => b.id === bookId);
        if (book) {
            book.folderId = folderId;
            await this.saveLibrary();
            this.renderLibrary();
            
            const folderName = folderId 
                ? this.folders.find(f => f.id === folderId)?.name || 'Unknown'
                : 'Root';
            this.showToast(`Moved to ${folderName}`);
        }
    }

    showFolderDialog(bookId = null, mode = 'select') {
        // Remove existing dialog if any
        const existingDialog = document.querySelector('.folder-dialog-overlay');
        if (existingDialog) existingDialog.remove();

        const overlay = document.createElement('div');
        overlay.className = 'folder-dialog-overlay';
        overlay.innerHTML = `
            <div class="folder-dialog">
                <div class="folder-dialog-header">
                    <h3>${mode === 'create' ? 'Create New Folder' : mode === 'move' ? 'Move to Folder' : 'Select Destination'}</h3>
                    <button class="folder-dialog-close">×</button>
                </div>
                <div class="folder-dialog-content">
                    ${mode === 'create' ? `
                        <div class="folder-create-form">
                            <input type="text" class="folder-name-input" placeholder="Folder name" autofocus>
                            <div class="folder-color-picker">
                                <span>Color:</span>
                                <input type="color" class="folder-color-input" value="#4285f4">
                            </div>
                            <button class="folder-create-btn">Create Folder</button>
                        </div>
                    ` : `
                        <div class="folder-list-dialog">
                            <div class="folder-option" data-folder-id="null">
                                <span class="folder-icon">📚</span>
                                <span>Root (No Folder)</span>
                            </div>
                            ${this.folders.map(folder => `
                                <div class="folder-option" data-folder-id="${folder.id}">
                                    <span class="folder-icon" style="color: ${folder.color}">📁</span>
                                    <span>${folder.name}</span>
                                </div>
                            `).join('')}
                            <div class="folder-option folder-option-new">
                                <span class="folder-icon">➕</span>
                                <span>Create New Folder</span>
                            </div>
                        </div>
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Event listeners
        overlay.querySelector('.folder-dialog-close').addEventListener('click', () => {
            overlay.remove();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        if (mode === 'create') {
            const createBtn = overlay.querySelector('.folder-create-btn');
            const nameInput = overlay.querySelector('.folder-name-input');
            const colorInput = overlay.querySelector('.folder-color-input');

            createBtn.addEventListener('click', async () => {
                const name = nameInput.value.trim();
                if (name) {
                    await this.createFolder(name, colorInput.value);
                    overlay.remove();
                }
            });

            nameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    createBtn.click();
                }
            });
        } else {
            // Select/Move mode
            overlay.querySelectorAll('.folder-option').forEach(option => {
                option.addEventListener('click', async () => {
                    if (option.classList.contains('folder-option-new')) {
                        overlay.remove();
                        this.showFolderDialog(bookId, 'create');
                        return;
                    }

                    const folderId = option.dataset.folderId;
                    const actualFolderId = folderId === 'null' ? null : folderId;

                    if (bookId) {
                        // Moving existing book
                        await this.moveBookToFolder(bookId, actualFolderId);
                    } else {
                        // Adding new book
                        await this.addCurrentPdfToLibrary(actualFolderId);
                    }
                    overlay.remove();
                });
            });
        }
    }

    // ==================== UI CREATION ====================

    createLibraryButton() {
        // Check if button already exists
        if (document.getElementById('researchLibraryBtn')) {
            return;
        }
        
        const button = document.createElement('button');
        button.id = 'researchLibraryBtn';
        button.className = 'toolbarButton';
        button.title = 'Research Library';
        button.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
        `;
        
        button.addEventListener('click', () => this.togglePanel());
        
        // Try to insert into toolbar
        const toolbar = document.getElementById('toolbarViewerRight');
        if (toolbar) {
            toolbar.insertBefore(button, toolbar.firstChild);
        }
    }

    createLibraryPanel() {
        // Check if panel already exists
        if (document.getElementById('researchLibraryPanel')) {
            this.panel = document.getElementById('researchLibraryPanel');
            // Still need to setup event listeners even for existing panel
            this.setupEventListeners();
            return;
        }
        
        const panel = document.createElement('div');
        panel.id = 'researchLibraryPanel';
        panel.className = 'research-library-panel';
        panel.innerHTML = `
            <div class="library-header">
                <h2>Research Library</h2>
                <button class="library-close-btn">×</button>
            </div>
            
            <div class="library-toolbar">
                <div class="library-search">
                    <input type="text" placeholder="Search library..." class="library-search-input">
                </div>
                <div class="library-actions">
                    <button class="library-btn" id="addCurrentPdfBtn" title="Add Current PDF">
                        <span>➕</span> Add
                    </button>
                    <button class="library-btn" id="createFolderBtn" title="Create Folder">
                        <span>📁</span> New Folder
                    </button>
                    <button class="library-btn" id="importLibraryBtn" title="Import">
                        <span>📥</span>
                    </button>
                    <button class="library-btn" id="exportLibraryBtn" title="Export">
                        <span>📤</span>
                    </button>
                    <button class="library-btn" id="storageManagerBtn" title="Storage Manager">
                        <span>📊</span>
                    </button>
                </div>
            </div>

            <div class="library-filters">
                <button class="filter-btn active" data-filter="all">All</button>
                <button class="filter-btn" data-filter="favorites">⭐ Favorites</button>
                <button class="filter-btn" data-filter="recent">🕐 Recent</button>
            </div>

            <div class="library-breadcrumb">
                <span class="breadcrumb-item" data-folder-id="null">📚 All Books</span>
            </div>

            <div class="library-content">
                <div class="library-list"></div>
            </div>

            <div class="library-footer">
                <span class="library-count">0 items</span>
                <span class="library-storage-info" title="IndexedDB storage used for PDFs">💾 Calculating...</span>
                <button class="library-btn library-btn-small" id="addPdfFilesBtn">
                    <span>📄</span> Add PDF Files
                </button>
            </div>

            <input type="file" id="libraryFileInput" accept=".pdf" multiple style="display: none;">
            <input type="file" id="importFileInput" accept=".json" style="display: none;">
        `;

        document.body.appendChild(panel);
        this.panel = panel;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Close button
        this.panel.querySelector('.library-close-btn').addEventListener('click', () => {
            this.hidePanel();
        });

        // Search
        const searchInput = this.panel.querySelector('.library-search-input');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.renderLibrary();
        });

        // Filters
        this.panel.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.panel.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.renderLibrary();
            });
        });

        // Add current PDF - show folder selection dialog
        this.panel.querySelector('#addCurrentPdfBtn').addEventListener('click', () => {
            this.showFolderDialog(null, 'select');
        });

        // Create folder
        this.panel.querySelector('#createFolderBtn').addEventListener('click', () => {
            this.showFolderDialog(null, 'create');
        });

        // Export
        this.panel.querySelector('#exportLibraryBtn').addEventListener('click', () => {
            this.exportLibrary();
        });

        // Import
        this.panel.querySelector('#importLibraryBtn').addEventListener('click', () => {
            this.panel.querySelector('#importFileInput').click();
        });

        this.panel.querySelector('#importFileInput').addEventListener('change', (e) => {
            this.importLibrary(e.target.files[0]);
        });

        // Storage Manager
        this.panel.querySelector('#storageManagerBtn').addEventListener('click', () => {
            if (window.StorageManager) {
                const sm = new window.StorageManager();
                sm.showStorageUI();
            } else {
                this.showToast('Storage Manager not available', 'error');
            }
        });

        // Add PDF files
        this.panel.querySelector('#addPdfFilesBtn').addEventListener('click', () => {
            this.panel.querySelector('#libraryFileInput').click();
        });

        this.panel.querySelector('#libraryFileInput').addEventListener('change', (e) => {
            this.addPdfFiles(e.target.files);
        });

        // Breadcrumb navigation
        this.panel.querySelector('.library-breadcrumb').addEventListener('click', (e) => {
            const item = e.target.closest('.breadcrumb-item');
            if (item) {
                const folderId = item.dataset.folderId;
                this.currentFolderId = folderId === 'null' ? null : folderId;
                this.renderLibrary();
            }
        });
    }

    togglePanel() {
        if (this.isOpen) {
            this.hidePanel();
        } else {
            // Use overlay manager to ensure only one panel is open
            if (window.overlayManager) {
                window.overlayManager.open('researchLibrary');
            } else {
                this.showPanel();
            }
        }
    }

    showPanel() {
        this.panel.classList.add('open');
        this.isOpen = true;
        this.renderLibrary();
    }

    hidePanel() {
        this.panel.classList.remove('open');
        this.isOpen = false;
    }
    
    registerWithOverlayManager() {
        if (window.overlayManager) {
            window.overlayManager.register('researchLibrary',
                () => this.showPanel(),
                () => this.hidePanel()
            );
        }
    }

    renderLibrary() {
        const listContainer = this.panel.querySelector('.library-list');
        let items = this.filterLibrary();

        // Update breadcrumb
        this.updateBreadcrumb();

        // If viewing a specific folder, filter by folder
        if (this.currentFolderId !== null) {
            items = items.filter(item => item.folderId === this.currentFolderId);
        }

        let html = '';

        // If at root level, show folders first
        if (this.currentFolderId === null) {
            const foldersToShow = this.folders.filter(folder => {
                // Count books in folder
                const booksInFolder = this.library.filter(b => b.folderId === folder.id);
                return booksInFolder.length > 0 || this.searchQuery === '';
            });

            foldersToShow.forEach(folder => {
                const bookCount = this.library.filter(b => b.folderId === folder.id).length;
                html += `
                    <div class="library-folder" data-folder-id="${folder.id}">
                        <div class="folder-header">
                            <span class="folder-icon" style="color: ${folder.color}">📁</span>
                            <span class="folder-name">${folder.name}</span>
                            <span class="folder-count">${bookCount} books</span>
                            <div class="folder-actions">
                                <button class="folder-action-btn folder-rename-btn" title="Rename">✏️</button>
                                <button class="folder-action-btn folder-delete-btn" title="Delete">🗑️</button>
                            </div>
                        </div>
                    </div>
                `;
            });

            // Show root-level books (no folder)
            items = items.filter(item => item.folderId === null || item.folderId === undefined);
        }

        // Render books
        if (items.length === 0 && html === '') {
            html += `
                <div class="library-empty">
                    <p>📚 No items found</p>
                    <p>Add PDFs to your research library</p>
                </div>
            `;
        } else {
            // Check if viewing from library via URL params
            const urlParams = new URLSearchParams(window.location.search);
            const currentLibraryId = urlParams.get('id');
            const currentSource = urlParams.get('source');
            
            // Also check currentPDF in storage for more accurate detection
            const currentUrl = window.location.href;
            
            items.forEach(item => {
                // Check if this is the currently open PDF
                // Match by: library ID, direct URL, or file parameter
                let isCurrentPdf = false;
                
                // Check by library ID (when opened from library)
                if (currentSource === 'library' && currentLibraryId && item.id === currentLibraryId) {
                    isCurrentPdf = true;
                }
                // Check by direct URL match
                else if (item.url && item.url === currentUrl) {
                    isCurrentPdf = true;
                }
                // Check if the file param matches the item URL
                else if (item.url) {
                    const fileParam = urlParams.get('file');
                    if (fileParam && decodeURIComponent(fileParam) === item.url) {
                        isCurrentPdf = true;
                    }
                }
                // Check for IndexedDB stored PDFs - match by ID in URL
                if (!isCurrentPdf && item.hasStoredData && currentLibraryId === item.id) {
                    isCurrentPdf = true;
                }
                
                // Check if this is a local file that needs selection
                const isLocalUnlinked = item.isLocalFile && !item.url && !item.hasStoredData;
                const hasStoredData = item.hasStoredData === true;
                
                // Determine icon: book icon for books, PDF icon for documents
                // Check if title/tags suggest it's a book
                const isBook = item.tags?.includes('book') || 
                               item.title?.toLowerCase().includes('book') ||
                               item.type === 'book';
                const itemIcon = isBook ? '📚' : '📄';
                
                html += `
                    <div class="library-item ${isCurrentPdf ? 'current' : ''} ${isLocalUnlinked ? 'needs-link' : ''}" data-id="${item.id}">
                        <div class="item-icon">${itemIcon}</div>
                        <div class="item-info">
                            <div class="item-title">
                                ${item.title}
                                ${isCurrentPdf ? '<span class="reading-badge">📖 Currently Reading</span>' : ''}
                                ${hasStoredData && !isCurrentPdf ? '<span class="stored-badge">💾 Stored</span>' : ''}
                                ${isLocalUnlinked && !isCurrentPdf ? '<span class="local-badge">📂 Select file to open</span>' : ''}
                            </div>
                            <div class="item-meta">
                                ${item.author ? `<span class="item-author">${item.author}</span>` : ''}
                                ${item.pageCount ? `<span class="item-pages">${item.pageCount} pages</span>` : ''}
                                ${item.fileName && !isCurrentPdf ? `<span class="item-filename">${item.fileName}</span>` : ''}
                                ${item.fileSize ? `<span class="item-size">${this.formatFileSize(item.fileSize)}</span>` : ''}
                            </div>
                            ${item.tags && item.tags.length > 0 ? `
                                <div class="item-tags">
                                    ${item.tags.map(tag => `<span class="item-tag">${tag}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                        <div class="item-actions">
                            <button class="item-action-btn favorite-btn ${item.isFavorite ? 'active' : ''}" title="Favorite">
                                ${item.isFavorite ? '⭐' : '☆'}
                            </button>
                            <button class="item-action-btn move-btn" title="Move to folder">📁</button>
                            <button class="item-action-btn edit-btn" title="Edit">✏️</button>
                            <button class="item-action-btn delete-btn" title="Remove">🗑️</button>
                        </div>
                    </div>
                `;
            });
        }

        listContainer.innerHTML = html;

        // Update count
        const totalCount = this.library.length;
        this.panel.querySelector('.library-count').textContent = `${totalCount} items`;

        // Update storage info
        this.updateStorageInfo();

        // Setup item event listeners
        this.setupItemListeners();
    }

    async updateStorageInfo() {
        const storageInfoEl = this.panel.querySelector('.library-storage-info');
        if (storageInfoEl && this.pdfStorage) {
            try {
                const usage = await this.pdfStorage.getStorageUsage();
                storageInfoEl.textContent = `💾 ${this.formatFileSize(usage.totalSize)} used`;
                storageInfoEl.title = `${usage.count} PDFs stored in IndexedDB`;
            } catch (error) {
                storageInfoEl.textContent = '💾 --';
            }
        }
    }

    updateBreadcrumb() {
        const breadcrumb = this.panel.querySelector('.library-breadcrumb');
        
        if (this.currentFolderId === null) {
            breadcrumb.innerHTML = `<span class="breadcrumb-item active" data-folder-id="null">📚 All Books</span>`;
        } else {
            const folder = this.folders.find(f => f.id === this.currentFolderId);
            breadcrumb.innerHTML = `
                <span class="breadcrumb-item" data-folder-id="null">📚 All Books</span>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-item active" data-folder-id="${folder?.id}" style="color: ${folder?.color}">
                    📁 ${folder?.name || 'Unknown'}
                </span>
            `;
        }
    }

    setupItemListeners() {
        // Folder click (to enter folder)
        this.panel.querySelectorAll('.library-folder .folder-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.folder-action-btn')) return;
                const folderId = header.closest('.library-folder').dataset.folderId;
                this.currentFolderId = folderId;
                this.renderLibrary();
            });
        });

        // Folder rename
        this.panel.querySelectorAll('.folder-rename-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderId = btn.closest('.library-folder').dataset.folderId;
                const folder = this.folders.find(f => f.id === folderId);
                const newName = prompt('Enter new folder name:', folder?.name);
                if (newName && newName.trim()) {
                    this.renameFolder(folderId, newName);
                }
            });
        });

        // Folder delete
        this.panel.querySelectorAll('.folder-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderId = btn.closest('.library-folder').dataset.folderId;
                const folder = this.folders.find(f => f.id === folderId);
                if (confirm(`Delete folder "${folder?.name}"? Books will be moved to root.`)) {
                    this.deleteFolder(folderId);
                }
            });
        });

        // Item click (to open PDF)
        this.panel.querySelectorAll('.library-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.item-action-btn')) return;
                const id = item.dataset.id;
                this.openPdf(id);
            });
        });

        // Favorite button
        this.panel.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.closest('.library-item').dataset.id;
                this.toggleFavorite(id);
            });
        });

        // Move button
        this.panel.querySelectorAll('.move-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.closest('.library-item').dataset.id;
                this.showFolderDialog(id, 'move');
            });
        });

        // Edit button
        this.panel.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.closest('.library-item').dataset.id;
                this.showEditDialog(id);
            });
        });

        // Delete button
        this.panel.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.closest('.library-item').dataset.id;
                this.removeFromLibrary(id);
            });
        });
    }

    filterLibrary() {
        let items = [...this.library];

        // Apply filter
        switch (this.currentFilter) {
            case 'favorites':
                items = items.filter(item => item.isFavorite);
                break;
            case 'recent':
                items = items.sort((a, b) => new Date(b.lastOpened) - new Date(a.lastOpened)).slice(0, 10);
                break;
            default:
                items = items.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
        }

        // Apply search
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            items = items.filter(item => 
                item.title.toLowerCase().includes(query) ||
                (item.author && item.author.toLowerCase().includes(query)) ||
                (item.tags && item.tags.some(tag => tag.toLowerCase().includes(query)))
            );
        }

        return items;
    }

    async openPdf(id) {
        const item = this.library.find(i => i.id === id);
        if (item) {
            item.lastOpened = new Date().toISOString();
            await this.saveLibrary();
            
            if (item.url === window.location.href) {
                // Already viewing this PDF, just close panel
                this.showToast('Already viewing this PDF');
                return;
            }
            
            // Handle PDFs stored in IndexedDB
            if (item.hasStoredData) {
                try {
                    const pdfRecord = await this.pdfStorage.getPdf(item.id);
                    if (pdfRecord && pdfRecord.data) {
                        // Convert ArrayBuffer to base64 for sessionStorage
                        const bytes = new Uint8Array(pdfRecord.data);
                        const base64 = this.uint8ArrayToBase64(bytes);
                        sessionStorage.setItem('pendingPdfData', base64);
                        sessionStorage.setItem('pendingPdfTitle', item.title);
                        
                        // Keep library open after navigation
                        sessionStorage.setItem('keepLibraryOpen', 'true');
                        
                        // Navigate to viewer
                        const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
                        window.location.href = `${viewerUrl}?source=library&id=${item.id}`;
                    } else {
                        // PDF data not found in IndexedDB, prompt for re-selection
                        this.showToast('PDF data not found. Please re-add the file.');
                        this.promptForFileReselection(item);
                    }
                } catch (error) {
                    console.error('Error loading PDF from IndexedDB:', error);
                    this.showToast('Error loading PDF');
                }
                return;
            }
            
            // Handle local files that need re-selection (legacy)
            if (item.isLocalFile && !item.url) {
                this.promptForFileSelection(item);
                return;
            }
            
            // Check if it's a base64 data URL (legacy locally added PDF)
            if (item.url && item.url.startsWith('data:application/pdf;base64,')) {
                try {
                    // Store the base64 data in sessionStorage for the viewer to pick up
                    const base64Data = item.url.split(',')[1];
                    sessionStorage.setItem('pendingPdfData', base64Data);
                    sessionStorage.setItem('pendingPdfTitle', item.title);
                    
                    // Keep library open after navigation
                    sessionStorage.setItem('keepLibraryOpen', 'true');
                    
                    // Navigate to viewer with special flag
                    const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
                    window.location.href = `${viewerUrl}?source=library&id=${item.id}`;
                } catch (error) {
                    console.error('Error opening local PDF:', error);
                    this.showToast('Error opening PDF');
                }
            } else if (item.url) {
                // Regular URL - keep library open and navigate
                sessionStorage.setItem('keepLibraryOpen', 'true');
                window.location.href = item.url;
            } else {
                this.showToast('No file linked. Click to select file.');
            }
        }
    }

    // Prompt user to re-select a PDF file and store it in IndexedDB
    promptForFileReselection(item) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf';
        input.style.display = 'none';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file && file.type === 'application/pdf') {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    
                    // Store in IndexedDB
                    await this.pdfStorage.storePdf(item.id, arrayBuffer, {
                        title: item.title,
                        fileName: file.name,
                        fileSize: file.size
                    });
                    
                    // Update item metadata
                    item.hasStoredData = true;
                    item.fileName = file.name;
                    item.fileSize = file.size;
                    await this.saveLibrary();
                    
                    // Now open the PDF
                    const bytes = new Uint8Array(arrayBuffer);
                    const base64 = this.uint8ArrayToBase64(bytes);
                    sessionStorage.setItem('pendingPdfData', base64);
                    sessionStorage.setItem('pendingPdfTitle', item.title);
                    
                    const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
                    window.location.href = `${viewerUrl}?source=library&id=${item.id}`;
                } catch (error) {
                    console.error('Error storing PDF:', error);
                    this.showToast('Error storing PDF file');
                }
            }
            input.remove();
        };
        
        input.oncancel = () => input.remove();
        document.body.appendChild(input);
        this.showToast(`Select "${item.fileName || item.title}" to restore`);
        input.click();
    }

    // Legacy file selection for items without IndexedDB storage
    promptForFileSelection(item) {
        // Create a hidden file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf';
        input.style.display = 'none';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file && file.type === 'application/pdf') {
                // Load the PDF directly without storing it
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const bytes = new Uint8Array(arrayBuffer);
                    
                    // Convert to base64 in chunks to avoid stack overflow
                    const base64 = this.uint8ArrayToBase64(bytes);
                    sessionStorage.setItem('pendingPdfData', base64);
                    sessionStorage.setItem('pendingPdfTitle', item.title);
                    
                    // Update lastOpened
                    item.lastOpened = new Date().toISOString();
                    await this.saveLibrary();
                    
                    // Navigate to viewer
                    const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
                    window.location.href = `${viewerUrl}?source=library&id=${item.id}`;
                } catch (error) {
                    console.error('Error loading PDF:', error);
                    this.showToast('Error loading PDF file');
                }
            }
            input.remove();
        };
        
        input.oncancel = () => input.remove();
        
        document.body.appendChild(input);
        
        // Show helpful message
        this.showToast(`Select "${item.fileName || item.title}" to open`);
        
        input.click();
    }

    async toggleFavorite(id) {
        const item = this.library.find(i => i.id === id);
        if (item) {
            item.isFavorite = !item.isFavorite;
            await this.saveLibrary();
            this.renderLibrary();
        }
    }

    async removeFromLibrary(id) {
        const item = this.library.find(i => i.id === id);
        if (item && confirm(`Remove "${item.title}" from library?`)) {
            // Also delete from IndexedDB if stored there
            if (item.hasStoredData) {
                try {
                    await this.pdfStorage.deletePdf(id);
                } catch (error) {
                    console.error('Error deleting PDF from IndexedDB:', error);
                }
            }
            
            this.library = this.library.filter(i => i.id !== id);
            await this.saveLibrary();
            this.renderLibrary();
            this.showToast('Removed from library');
        }
    }

    showEditDialog(id) {
        const item = this.library.find(i => i.id === id);
        if (!item) return;

        const existingDialog = document.querySelector('.edit-dialog-overlay');
        if (existingDialog) existingDialog.remove();

        const overlay = document.createElement('div');
        overlay.className = 'edit-dialog-overlay';
        overlay.innerHTML = `
            <div class="edit-dialog">
                <div class="edit-dialog-header">
                    <h3>Edit PDF Details</h3>
                    <button class="edit-dialog-close">×</button>
                </div>
                <div class="edit-dialog-content">
                    <div class="edit-field">
                        <label>Title</label>
                        <input type="text" id="editTitle" value="${item.title}">
                    </div>
                    <div class="edit-field">
                        <label>Author</label>
                        <input type="text" id="editAuthor" value="${item.author || ''}">
                    </div>
                    <div class="edit-field">
                        <label>Tags (comma-separated)</label>
                        <input type="text" id="editTags" value="${item.tags ? item.tags.join(', ') : ''}">
                    </div>
                    <div class="edit-field">
                        <label>Notes</label>
                        <textarea id="editNotes" rows="3">${item.notes || ''}</textarea>
                    </div>
                </div>
                <div class="edit-dialog-footer">
                    <button class="edit-cancel-btn">Cancel</button>
                    <button class="edit-save-btn">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('.edit-dialog-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('.edit-cancel-btn').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        overlay.querySelector('.edit-save-btn').addEventListener('click', async () => {
            item.title = overlay.querySelector('#editTitle').value;
            item.author = overlay.querySelector('#editAuthor').value;
            item.tags = overlay.querySelector('#editTags').value.split(',').map(t => t.trim()).filter(t => t);
            item.notes = overlay.querySelector('#editNotes').value;
            
            await this.saveLibrary();
            this.renderLibrary();
            overlay.remove();
            this.showToast('Changes saved');
        });
    }

    async exportLibrary() {
        const data = {
            version: 2,
            exportedAt: new Date().toISOString(),
            folders: this.folders,
            library: this.library
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `research-library-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showToast('Library exported');
    }

    async importLibrary(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                // Handle both v1 and v2 formats
                if (data.version === 2) {
                    // New format with folders
                    const importedFolders = data.folders || [];
                    const importedLibrary = data.library || [];
                    
                    // Merge folders
                    importedFolders.forEach(folder => {
                        if (!this.folders.some(f => f.id === folder.id)) {
                            this.folders.push(folder);
                        }
                    });
                    
                    // Merge library
                    importedLibrary.forEach(item => {
                        if (!this.library.some(i => i.url === item.url)) {
                            this.library.push(item);
                        }
                    });
                } else if (Array.isArray(data.library)) {
                    // Old format (v1)
                    data.library.forEach(item => {
                        if (!this.library.some(i => i.url === item.url)) {
                            item.folderId = null; // Add to root
                            this.library.push(item);
                        }
                    });
                } else if (Array.isArray(data)) {
                    // Very old format - just an array
                    data.forEach(item => {
                        if (!this.library.some(i => i.url === item.url)) {
                            item.folderId = null;
                            this.library.push(item);
                        }
                    });
                }
                
                await this.saveLibrary();
                this.renderLibrary();
                this.showToast('Library imported successfully');
            } catch (error) {
                console.error('Import error:', error);
                this.showToast('Error importing library');
            }
        };
        reader.readAsText(file);
    }

    async addPdfFiles(files) {
        let addedCount = 0;
        
        for (const file of files) {
            if (file.type === 'application/pdf') {
                try {
                    const info = await this.extractPdfInfo(file);
                    
                    // Create library entry with metadata
                    const newEntry = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        title: info.title || file.name.replace('.pdf', ''),
                        author: info.author || '',
                        fileName: file.name,
                        fileSize: file.size,
                        isLocalFile: true,
                        hasStoredData: true, // Flag indicating PDF is stored in IndexedDB
                        url: null,
                        pageCount: info.pageCount || 0,
                        addedAt: new Date().toISOString(),
                        lastOpened: null,
                        isFavorite: false,
                        tags: [],
                        notes: '',
                        folderId: this.currentFolderId
                    };

                    // Store the actual PDF data in IndexedDB
                    const arrayBuffer = await file.arrayBuffer();
                    await this.pdfStorage.storePdf(newEntry.id, arrayBuffer, {
                        title: newEntry.title,
                        fileName: file.name,
                        fileSize: file.size
                    });

                    this.library.push(newEntry);
                    addedCount++;
                } catch (error) {
                    console.error('Error adding PDF:', error);
                    this.showToast(`Error adding ${file.name}`);
                }
            }
        }

        await this.saveLibrary();
        this.renderLibrary();
        
        if (addedCount > 0) {
            this.showToast(`Added ${addedCount} PDF(s) to library`);
        }
    }

    async extractPdfInfo(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const typedArray = new Uint8Array(e.target.result);
                    const pdf = await pdfjsLib.getDocument(typedArray).promise;
                    const metadata = await pdf.getMetadata();
                    
                    resolve({
                        title: metadata.info?.Title || '',
                        author: metadata.info?.Author || '',
                        pageCount: pdf.numPages
                    });
                } catch (error) {
                    resolve({ title: '', author: '', pageCount: 0 });
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }

    fileToBase64(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    // Convert Uint8Array to base64 without stack overflow
    uint8ArrayToBase64(bytes) {
        let binary = '';
        const chunkSize = 8192; // Process in chunks to avoid stack overflow
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    // Format file size for display
    formatFileSize(bytes) {
        if (!bytes) return '';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    showToast(message) {
        const existingToast = document.querySelector('.library-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'library-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
}

// Export the class - let custom_viewer.js handle initialization
window.ResearchLibraryManager = ResearchLibraryManager;
