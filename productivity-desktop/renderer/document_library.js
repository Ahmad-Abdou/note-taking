/**
 * ============================================================================
 * DOCUMENT LIBRARY MODULE
 * ============================================================================
 * 
 * Manages imported documents for study and spaced repetition.
 * Allows users to import local documents (txt, md, html) and create
 * revision items from selected text.
 */

const DocumentLibrary = {
    isInitialized: false,
    currentDocument: null,

    /**
     * Initialize the document library
     */
    async init() {
        if (this.isInitialized) return;

        this.setupEventListeners();
        this.isInitialized = true;
        console.log('📚 DocumentLibrary initialized');
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Import document button
        const importBtn = document.getElementById('import-document-btn');
        if (importBtn && !importBtn.dataset.listenerAdded) {
            importBtn.dataset.listenerAdded = 'true';
            importBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showImportModal();
            });
        }

        // My Documents tab
        const docsTab = document.querySelector('[data-category="documents"]');
        if (docsTab && !docsTab.dataset.listenerAdded) {
            docsTab.dataset.listenerAdded = 'true';
            docsTab.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showDocumentLibrary();
            });
        }

        // File input for document import
        const fileInput = document.getElementById('document-file-input');
        if (fileInput && !fileInput.dataset.listenerAdded) {
            fileInput.dataset.listenerAdded = 'true';
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.importDocument(file);
                }
                // Reset input so same file can be selected again
                fileInput.value = '';
            });
        }
    },

    /**
     * Show import modal
     */
    showImportModal() {
        // Remove existing modal if any
        const existingModal = document.querySelector('.document-import-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.className = 'modal document-import-modal active';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content document-import-content">
                <div class="modal-header-minimal">
                    <h2><i class="fas fa-file-import"></i> Import Document</h2>
                    <button class="close-modal-btn">&times;</button>
                </div>
                <div class="modal-body-streamlined">
                    <div class="import-dropzone" id="import-dropzone">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <h3>Drop your document here</h3>
                        <p>or click to browse</p>
                        <p class="supported-formats">Supported: TXT, MD, HTML, PDF</p>
                    </div>
                    <input type="file" id="document-file-input-modal" class="hidden" accept=".txt,.md,.html,.htm,.pdf">
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        const closeModal = () => modal.remove();
        modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Dropzone handlers
        const dropzone = modal.querySelector('#import-dropzone');
        const fileInput = modal.querySelector('#document-file-input-modal');

        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) {
                this.importDocument(file);
                closeModal();
            }
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importDocument(file);
                closeModal();
            }
        });
    },

    /**
     * Import a document file
     */
    async importDocument(file) {
        const allowedExtensions = ['.txt', '.md', '.html', '.htm', '.pdf'];

        const extension = '.' + file.name.split('.').pop().toLowerCase();

        if (!allowedExtensions.includes(extension)) {
            showToast('error', 'Unsupported Format', 'Please use TXT, MD, HTML, or PDF files.');
            return null;
        }

        try {
            let finalContent = '';
            let docType = extension.replace('.', '');

            if (extension === '.pdf') {
                // For PDF files, extract text using pdf.js or store reference
                finalContent = await this.extractPDFText(file);
            } else {
                const content = await this.readFileContent(file);

                if (extension === '.html' || extension === '.htm') {
                    finalContent = this.parseHTMLContent(content);
                } else {
                    finalContent = content;
                }
            }

            const doc = new ProductivityData.StudyDocument({
                name: file.name,
                type: docType,
                content: finalContent,
                size: file.size
            });

            await ProductivityData.DataStore.saveStudyDocument(doc);

            showToast('success', 'Document Imported', `"${file.name}" has been added to your library.`);

            // Refresh the document library if it's visible
            this.renderDocumentLibrary();

            return doc;
        } catch (error) {
            console.error('Document import failed:', error);
            showToast('error', 'Import Failed', 'Could not read the document.');
            return null;
        }
    },

    /**
     * Extract text from PDF file
     */
    async extractPDFText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;

                    // Check if pdfjsLib is available
                    if (typeof pdfjsLib !== 'undefined') {
                        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                        let fullText = '';

                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const textContent = await page.getTextContent();
                            const pageText = textContent.items.map(item => item.str).join(' ');
                            fullText += pageText + '\n\n';
                        }

                        resolve(fullText.trim());
                    } else {
                        // Fallback: store as base64 and show PDF in viewer later
                        resolve('[PDF Document - Open to view content]\nFile: ' + file.name);
                    }
                } catch (err) {
                    console.error('PDF extraction error:', err);
                    resolve('[PDF Document - Could not extract text]\nFile: ' + file.name);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Read file content as text
     */
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    /**
     * Parse HTML content to extract plain text
     */
    parseHTMLContent(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Remove script and style elements
        doc.querySelectorAll('script, style').forEach(el => el.remove());

        // Get text content
        return doc.body.textContent || doc.body.innerText || '';
    },

    /**
     * Show document library view
     */
    async showDocumentLibrary() {
        // Switch to documents tab
        document.querySelectorAll('.revision-categories .category-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.category === 'documents');
        });

        await this.renderDocumentLibrary();
    },

    /**
     * Render document library
     */
    async renderDocumentLibrary() {
        const container = document.getElementById('revisions-container');
        const emptyState = document.getElementById('revisions-empty');

        if (!container) return;

        const docs = await ProductivityData.DataStore.getStudyDocuments();

        // Clear existing content
        container.querySelectorAll('.revision-card, .document-card').forEach(el => el.remove());

        if (docs.length === 0) {
            if (emptyState) {
                emptyState.innerHTML = `
                    <i class="fas fa-file-alt"></i>
                    <h3>No documents yet</h3>
                    <p>Import documents to study with spaced repetition.</p>
                    <p class="hint">Use the "Import Document" button to add your first document.</p>
                `;
                emptyState.classList.remove('hidden');
            }
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        // Sort by last opened, then created date
        docs.sort((a, b) => {
            if (a.lastOpenedAt && b.lastOpenedAt) {
                return new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt);
            }
            if (a.lastOpenedAt) return -1;
            if (b.lastOpenedAt) return 1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        docs.forEach(doc => {
            const card = this.createDocumentCard(doc);
            container.appendChild(card);
        });
    },

    /**
     * Create a document card element
     */
    createDocumentCard(doc) {
        const card = document.createElement('div');
        card.className = 'document-card';
        card.dataset.id = doc.id;
        card.style.setProperty('--card-accent', doc.color || '#6366f1');

        const typeIcons = {
            'txt': 'fa-file-alt',
            'md': 'fa-file-code',
            'html': 'fa-file-code',
            'htm': 'fa-file-code',
            'pdf': 'fa-file-pdf'
        };

        const icon = typeIcons[doc.type] || 'fa-file';
        const formattedSize = this.formatFileSize(doc.size);
        const formattedDate = this.formatDate(doc.createdAt);
        const preview = doc.content.substring(0, 150).replace(/\n/g, ' ') + (doc.content.length > 150 ? '...' : '');

        card.innerHTML = `
            <div class="document-card-header">
                <div class="document-icon" style="background: ${doc.color}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="document-info">
                    <h3 class="document-title">${this.escapeHtml(doc.name)}</h3>
                    <div class="document-meta">
                        <span>${formattedSize}</span>
                        <span>•</span>
                        <span>${formattedDate}</span>
                        ${doc.revisionCount > 0 ? `<span>• ${doc.revisionCount} revision${doc.revisionCount !== 1 ? 's' : ''}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="document-preview">${this.escapeHtml(preview)}</div>
            <div class="document-actions">
                <button class="btn-study" title="Open & Study" data-action="study">
                    <i class="fas fa-book-reader"></i> Study
                </button>
                <button class="btn-delete" title="Delete" data-action="delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        // Add action handlers
        card.querySelector('[data-action="study"]').addEventListener('click', () => {
            this.openDocumentViewer(doc.id);
        });

        card.querySelector('[data-action="delete"]').addEventListener('click', () => {
            this.deleteDocument(doc.id);
        });

        return card;
    },

    /**
     * Open document viewer modal
     */
    async openDocumentViewer(docId) {
        const doc = await ProductivityData.DataStore.markDocumentOpened(docId);
        if (!doc) return;

        this.currentDocument = doc;

        // Remove existing modal
        document.querySelector('.document-viewer-modal')?.remove();

        const modal = document.createElement('div');
        modal.className = 'modal document-viewer-modal active';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content document-viewer-content">
                <div class="document-viewer-header">
                    <div class="document-viewer-title">
                        <i class="fas fa-file-alt"></i>
                        <h2>${this.escapeHtml(doc.name)}</h2>
                    </div>
                    <div class="document-viewer-actions">
                        <button class="btn-add-selection" id="add-selection-to-revision" disabled>
                            <i class="fas fa-plus"></i> Add Selection to Review
                        </button>
                        <button class="close-modal-btn">&times;</button>
                    </div>
                </div>
                <div class="document-viewer-body" id="document-content">
                    ${this.formatDocumentContent(doc.content, doc.type)}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        const closeModal = () => {
            this.currentDocument = null;
            modal.remove();
        };
        modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Selection handler
        const contentArea = modal.querySelector('#document-content');
        const addBtn = modal.querySelector('#add-selection-to-revision');

        contentArea.addEventListener('mouseup', () => {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            addBtn.disabled = text.length === 0;
        });

        addBtn.addEventListener('click', () => {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            if (text) {
                this.addSelectionToRevision(text, doc);
            }
        });
    },

    /**
     * Format document content for display
     */
    formatDocumentContent(content, type) {
        // For PDFs without extracted text, show helpful message
        if (type === 'pdf' && (content.includes('[PDF Document') || content.length < 100)) {
            return `
                <div class="pdf-notice">
                    <i class="fas fa-file-pdf" style="font-size: 3rem; color: #ef4444; margin-bottom: 16px;"></i>
                    <h3>PDF Document</h3>
                    <p>This PDF was imported for tracking. To study its content with spaced repetition:</p>
                    <ol>
                        <li>Open the PDF in your <strong>PDF Viewer</strong> (browser extension or app)</li>
                        <li>Use the <strong>Spaced Repetition</strong> panel in the PDF viewer</li>
                        <li>Select text or pages to add to your review queue</li>
                    </ol>
                    <p class="hint">The PDF viewer's spaced repetition syncs with this app!</p>
                </div>
            `;
        }

        const escaped = this.escapeHtml(content);

        if (type === 'md') {
            // Basic markdown rendering - paragraphs, headers, lists
            return escaped
                .replace(/^### (.*$)/gim, '<h4>$1</h4>')
                .replace(/^## (.*$)/gim, '<h3>$1</h3>')
                .replace(/^# (.*$)/gim, '<h2>$1</h2>')
                .replace(/^\* (.*$)/gim, '<li>$1</li>')
                .replace(/^\- (.*$)/gim, '<li>$1</li>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>');
        }

        // Plain text - preserve line breaks
        return '<p>' + escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
    },

    /**
     * Add selected text to revision queue
     */
    async addSelectionToRevision(text, doc) {
        // Show the revision modal with pre-filled content
        const preview = text.length > 100 ? text.substring(0, 100) + '...' : text;

        // Remove existing modal
        document.querySelector('.add-revision-from-doc-modal')?.remove();

        const modal = document.createElement('div');
        modal.className = 'modal add-revision-from-doc-modal active';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content revision-modal-content">
                <div class="revision-modal-header">
                    <h2><i class="fas fa-plus-circle"></i> Add to Review Queue</h2>
                    <button class="close-modal-btn">&times;</button>
                </div>
                <div class="revision-modal-body">
                    <div class="revision-form-group">
                        <label>Selected Text</label>
                        <div class="selected-text-preview">${this.escapeHtml(preview)}</div>
                    </div>
                    
                    <div class="revision-form-group">
                        <label for="revision-title-doc">Title</label>
                        <input type="text" id="revision-title-doc" placeholder="Give this a memorable title" value="">
                    </div>
                    
                    <div class="revision-form-group">
                        <label for="revision-notes-doc">Personal Notes (optional)</label>
                        <textarea id="revision-notes-doc" placeholder="Add notes to help you remember..." style="min-height: 60px;"></textarea>
                    </div>
                    
                    <div class="revision-form-group">
                        <label>Review Schedule</label>
                        <div class="revision-category-select">
                            <button type="button" class="revision-category-option active" data-category="tomorrow">
                                <i class="fas fa-calendar-day"></i>
                                <span>Tomorrow</span>
                            </button>
                            <button type="button" class="revision-category-option" data-category="3days">
                                <i class="fas fa-calendar-week"></i>
                                <span>3 Days</span>
                            </button>
                            <button type="button" class="revision-category-option" data-category="week">
                                <i class="fas fa-calendar-alt"></i>
                                <span>1 Week</span>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="revision-modal-footer">
                    <button type="button" class="btn-cancel" id="cancel-doc-revision-btn">Cancel</button>
                    <button type="button" class="btn-save" id="save-doc-revision-btn">Add to Review</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Category selection
        let selectedCategory = 'tomorrow';
        modal.querySelectorAll('.revision-category-option').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.revision-category-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedCategory = btn.dataset.category;
            });
        });

        // Close handlers
        const closeModal = () => modal.remove();
        modal.querySelector('.close-modal-btn').addEventListener('click', closeModal);
        modal.querySelector('#cancel-doc-revision-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Save handler
        modal.querySelector('#save-doc-revision-btn').addEventListener('click', async () => {
            const title = modal.querySelector('#revision-title-doc').value.trim() || preview.substring(0, 50);
            const notes = modal.querySelector('#revision-notes-doc').value.trim();

            const revision = new ProductivityData.RevisionItem({
                title: title,
                content: text,
                category: selectedCategory,
                notes: notes,
                source: {
                    type: 'study-document',
                    docId: doc.id,
                    docName: doc.name
                }
            });

            await ProductivityData.DataStore.saveRevision(revision);
            await ProductivityData.DataStore.incrementDocumentRevisionCount(doc.id);

            showToast('success', 'Added to Review', 'Item will be due for review ' +
                (selectedCategory === 'tomorrow' ? 'tomorrow' :
                    selectedCategory === '3days' ? 'in 3 days' : 'in a week'));

            closeModal();

            // Refresh revision system if available
            if (window.RevisionSystem) {
                await RevisionSystem.loadRevisions();
                await RevisionSystem.updateBadge();
            }
        });

        // Focus title input
        setTimeout(() => modal.querySelector('#revision-title-doc').focus(), 100);
    },

    /**
     * Delete a document
     */
    async deleteDocument(docId) {
        if (!confirm('Are you sure you want to delete this document?')) return;

        await ProductivityData.DataStore.deleteStudyDocument(docId);
        showToast('info', 'Deleted', 'Document removed from library.');

        await this.renderDocumentLibrary();
    },

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    /**
     * Format date
     */
    formatDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Export globally
window.DocumentLibrary = DocumentLibrary;
