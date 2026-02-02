/**
 * Document Editor - Full-screen document creation like Google Docs/Word
 * Create pages, write content with rich formatting, and organize notes
 */

class DocumentEditor {
    constructor() {
        this.documents = [];
        this.currentDocId = null;
        this.isOpen = false;
        this.editor = null;
        this.autoSaveTimeout = null;
        
        this.init();
    }

    async init() {
        await this.loadDocuments();
        this.createToolbarButton();
        this.createEditorOverlay();
    }

    async loadDocuments() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['pdfDocuments'], (result) => {
                this.documents = result.pdfDocuments || [];
                resolve();
            });
        });
    }

    async saveDocuments() {
        return new Promise((resolve) => {
            chrome.storage.local.set({ pdfDocuments: this.documents }, resolve);
        });
    }

    createToolbarButton() {
        const toolbar = document.getElementById('toolbarViewerRight');
        if (!toolbar) return;

        // Check if button already exists
        if (document.getElementById('documentEditorBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'documentEditorBtn';
        btn.className = 'toolbarButton';
        btn.title = 'Document Editor (Alt+D)';
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <line x1="10" y1="9" x2="8" y2="9"></line>
            </svg>
        `;
        
        // Insert after notes button
        const notesBtn = document.getElementById('globalNotesBtn');
        if (notesBtn && notesBtn.nextSibling) {
            toolbar.insertBefore(btn, notesBtn.nextSibling);
        } else {
            toolbar.appendChild(btn);
        }

        btn.addEventListener('click', () => this.openDocumentList());

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                this.openDocumentList();
            }
        });
    }

    createEditorOverlay() {
        if (document.getElementById('documentEditorOverlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'documentEditorOverlay';
        overlay.className = 'doc-editor-overlay';
        overlay.innerHTML = `
            <div class="doc-editor-container">
                <!-- Document List View -->
                <div class="doc-list-view" id="docListView">
                    <div class="doc-list-header">
                        <h1>📄 My Documents</h1>
                        <button class="doc-close-btn" id="closeDocList">×</button>
                    </div>
                    <div class="doc-list-actions">
                        <button class="doc-btn-primary" id="createNewDoc">
                            <i>➕</i> New Document
                        </button>
                    </div>
                    <div class="doc-list-grid" id="docListGrid">
                        <!-- Documents will be rendered here -->
                    </div>
                </div>

                <!-- Document Editor View -->
                <div class="doc-editor-view hidden" id="docEditorView">
                    <div class="doc-editor-topbar">
                        <div class="doc-editor-left">
                            <button class="doc-back-btn" id="backToDocList" title="Back to Documents">
                                ← Back
                            </button>
                            <input type="text" class="doc-title-input" id="docTitleInput" placeholder="Untitled Document">
                        </div>
                        <div class="doc-editor-right">
                            <span class="doc-save-status" id="docSaveStatus">Saved</span>
                            <button class="doc-action-btn" id="docExportBtn" title="Export">
                                📤 Export
                            </button>
                            <button class="doc-action-btn" id="docAddNotesBtn" title="Add Notes">
                                📝 Add Notes
                            </button>
                        </div>
                    </div>

                    <!-- Formatting Toolbar -->
                    <div class="doc-format-toolbar">
                        <div class="format-group">
                            <select class="format-select" id="formatHeading">
                                <option value="p">Normal</option>
                                <option value="h1">Heading 1</option>
                                <option value="h2">Heading 2</option>
                                <option value="h3">Heading 3</option>
                            </select>
                        </div>
                        <div class="format-divider"></div>
                        <div class="format-group">
                            <button class="format-btn" data-command="bold" title="Bold (Ctrl+B)"><b>B</b></button>
                            <button class="format-btn" data-command="italic" title="Italic (Ctrl+I)"><i>I</i></button>
                            <button class="format-btn" data-command="underline" title="Underline (Ctrl+U)"><u>U</u></button>
                            <button class="format-btn" data-command="strikeThrough" title="Strikethrough"><s>S</s></button>
                        </div>
                        <div class="format-divider"></div>
                        <div class="format-group">
                            <button class="format-btn" data-command="insertUnorderedList" title="Bullet List">•≡</button>
                            <button class="format-btn" data-command="insertOrderedList" title="Numbered List">1.</button>
                        </div>
                        <div class="format-divider"></div>
                        <div class="format-group">
                            <button class="format-btn" data-command="justifyLeft" title="Align Left">⫷</button>
                            <button class="format-btn" data-command="justifyCenter" title="Align Center">≡</button>
                            <button class="format-btn" data-command="justifyRight" title="Align Right">⫸</button>
                        </div>
                        <div class="format-divider"></div>
                        <div class="format-group">
                            <input type="color" class="format-color" id="textColorPicker" value="#000000" title="Text Color">
                            <input type="color" class="format-color" id="bgColorPicker" value="#ffff00" title="Highlight">
                        </div>
                        <div class="format-divider"></div>
                        <div class="format-group">
                            <button class="format-btn" data-command="undo" title="Undo (Ctrl+Z)">↶</button>
                            <button class="format-btn" data-command="redo" title="Redo (Ctrl+Y)">↷</button>
                        </div>
                    </div>

                    <!-- Editor Content Area -->
                    <div class="doc-editor-content">
                        <div class="doc-page">
                            <div class="doc-editor-area" id="docEditorArea" contenteditable="true">
                                <p><br></p>
                            </div>
                        </div>
                    </div>

                    <!-- Attached Notes Sidebar -->
                    <div class="doc-notes-sidebar hidden" id="docNotesSidebar">
                        <div class="notes-sidebar-header">
                            <h3>📝 Attached Notes</h3>
                            <button class="notes-sidebar-close" id="closeNotesSidebar">×</button>
                        </div>
                        <div class="notes-sidebar-content" id="notesSidebarContent">
                            <!-- Notes will be rendered here -->
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.setupEditorListeners();
    }

    setupEditorListeners() {
        // Close document list
        document.getElementById('closeDocList').addEventListener('click', () => this.close());

        // Create new document
        document.getElementById('createNewDoc').addEventListener('click', () => this.createNewDocument());

        // Back to document list
        document.getElementById('backToDocList').addEventListener('click', () => this.showDocumentList());

        // Title input
        const titleInput = document.getElementById('docTitleInput');
        titleInput.addEventListener('input', () => this.onTitleChange());

        // Export button
        document.getElementById('docExportBtn').addEventListener('click', () => this.exportDocument());

        // Add notes button
        document.getElementById('docAddNotesBtn').addEventListener('click', () => this.toggleNotesSidebar());

        // Close notes sidebar
        document.getElementById('closeNotesSidebar').addEventListener('click', () => this.toggleNotesSidebar(false));

        // Formatting buttons
        document.querySelectorAll('.format-btn[data-command]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.execCommand(btn.dataset.command, false, null);
                document.getElementById('docEditorArea').focus();
            });
        });

        // Heading select
        document.getElementById('formatHeading').addEventListener('change', (e) => {
            document.execCommand('formatBlock', false, e.target.value);
            document.getElementById('docEditorArea').focus();
        });

        // Text color
        document.getElementById('textColorPicker').addEventListener('input', (e) => {
            document.execCommand('foreColor', false, e.target.value);
        });

        // Background color (highlight)
        document.getElementById('bgColorPicker').addEventListener('input', (e) => {
            document.execCommand('hiliteColor', false, e.target.value);
        });

        // Editor content changes (auto-save)
        const editorArea = document.getElementById('docEditorArea');
        editorArea.addEventListener('input', () => this.onContentChange());

        // Close on escape
        document.getElementById('documentEditorOverlay').addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (document.getElementById('docNotesSidebar').classList.contains('hidden')) {
                    this.close();
                } else {
                    this.toggleNotesSidebar(false);
                }
            }
        });
    }

    openDocumentList() {
        this.isOpen = true;
        document.getElementById('documentEditorOverlay').classList.add('visible');
        document.getElementById('docListView').classList.remove('hidden');
        document.getElementById('docEditorView').classList.add('hidden');
        this.renderDocumentList();
    }

    showDocumentList() {
        // Save current document first
        if (this.currentDocId) {
            this.saveCurrentDocument();
        }
        document.getElementById('docListView').classList.remove('hidden');
        document.getElementById('docEditorView').classList.add('hidden');
        this.currentDocId = null;
        this.renderDocumentList();
    }

    close() {
        if (this.currentDocId) {
            this.saveCurrentDocument();
        }
        this.isOpen = false;
        document.getElementById('documentEditorOverlay').classList.remove('visible');
        this.currentDocId = null;
    }

    renderDocumentList() {
        const grid = document.getElementById('docListGrid');
        
        if (this.documents.length === 0) {
            grid.innerHTML = `
                <div class="doc-empty-state">
                    <div class="empty-icon">📄</div>
                    <h3>No documents yet</h3>
                    <p>Create your first document to start writing</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.documents.map(doc => {
            const date = new Date(doc.updatedAt || doc.createdAt).toLocaleDateString();
            const preview = this.stripHtml(doc.content || '').substring(0, 100);
            
            return `
                <div class="doc-card" data-doc-id="${doc.id}">
                    <div class="doc-card-preview">
                        <div class="doc-card-icon">📄</div>
                        <div class="doc-card-text">${this.escapeHtml(preview) || 'Empty document'}</div>
                    </div>
                    <div class="doc-card-info">
                        <div class="doc-card-title">${this.escapeHtml(doc.title || 'Untitled')}</div>
                        <div class="doc-card-date">${date}</div>
                    </div>
                    <div class="doc-card-actions">
                        <button class="doc-card-btn doc-open-btn" title="Open">📂</button>
                        <button class="doc-card-btn doc-delete-btn" title="Delete">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');

        // Setup card listeners
        grid.querySelectorAll('.doc-card').forEach(card => {
            const docId = card.dataset.docId;
            
            card.querySelector('.doc-open-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDocument(docId);
            });

            card.querySelector('.doc-delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteDocument(docId);
            });

            card.addEventListener('click', () => this.openDocument(docId));
        });
    }

    createNewDocument() {
        const doc = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            title: 'Untitled Document',
            content: '<p><br></p>',
            attachedNotes: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.documents.unshift(doc);
        this.saveDocuments();
        this.openDocument(doc.id);
    }

    openDocument(docId) {
        const doc = this.documents.find(d => d.id === docId);
        if (!doc) return;

        this.currentDocId = docId;
        
        document.getElementById('docListView').classList.add('hidden');
        document.getElementById('docEditorView').classList.remove('hidden');
        
        document.getElementById('docTitleInput').value = doc.title || 'Untitled Document';
        document.getElementById('docEditorArea').innerHTML = doc.content || '<p><br></p>';
        document.getElementById('docSaveStatus').textContent = 'Saved';
        
        this.loadAttachedNotes();
    }

    saveCurrentDocument() {
        if (!this.currentDocId) return;

        const doc = this.documents.find(d => d.id === this.currentDocId);
        if (!doc) return;

        doc.title = document.getElementById('docTitleInput').value.trim() || 'Untitled Document';
        doc.content = document.getElementById('docEditorArea').innerHTML;
        doc.updatedAt = new Date().toISOString();

        this.saveDocuments();
        document.getElementById('docSaveStatus').textContent = 'Saved';
    }

    onTitleChange() {
        this.scheduleAutoSave();
    }

    onContentChange() {
        document.getElementById('docSaveStatus').textContent = 'Saving...';
        this.scheduleAutoSave();
    }

    scheduleAutoSave() {
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.saveCurrentDocument();
        }, 1000);
    }

    deleteDocument(docId) {
        const doc = this.documents.find(d => d.id === docId);
        if (doc && confirm(`Delete "${doc.title || 'Untitled'}"?`)) {
            this.documents = this.documents.filter(d => d.id !== docId);
            this.saveDocuments();
            this.renderDocumentList();
        }
    }

    exportDocument() {
        const doc = this.documents.find(d => d.id === this.currentDocId);
        if (!doc) return;

        // Export as HTML file
        const content = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${this.escapeHtml(doc.title)}</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
        h1, h2, h3 { color: #333; }
        p { margin-bottom: 1em; }
    </style>
</head>
<body>
    <h1>${this.escapeHtml(doc.title)}</h1>
    ${doc.content}
</body>
</html>`;

        const blob = new Blob([content], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(doc.title || 'document').replace(/[^a-z0-9]/gi, '_')}.html`;
        a.click();
        URL.revokeObjectURL(url);
    }

    toggleNotesSidebar(show = null) {
        const sidebar = document.getElementById('docNotesSidebar');
        if (show === null) {
            sidebar.classList.toggle('hidden');
        } else {
            sidebar.classList.toggle('hidden', !show);
        }
        
        if (!sidebar.classList.contains('hidden')) {
            this.loadAttachedNotes();
        }
    }

    async loadAttachedNotes() {
        const doc = this.documents.find(d => d.id === this.currentDocId);
        if (!doc) return;

        // Get all notes from storage
        const result = await new Promise(resolve => {
            chrome.storage.local.get(['globalNotes'], resolve);
        });
        const allNotes = result.globalNotes || [];

        const container = document.getElementById('notesSidebarContent');
        
        // Show notes that can be added to this document
        let html = `
            <div class="notes-section">
                <h4>Available Notes</h4>
                <div class="available-notes-list">
        `;

        allNotes.forEach(note => {
            const isAttached = doc.attachedNotes?.includes(note.id);
            html += `
                <div class="available-note ${isAttached ? 'attached' : ''}" data-note-id="${note.id}">
                    <div class="available-note-info">
                        <div class="available-note-title">${this.escapeHtml(note.title || 'Untitled')}</div>
                        <div class="available-note-preview">${this.escapeHtml(this.truncate(note.content, 60))}</div>
                    </div>
                    <div class="available-note-actions">
                        ${isAttached 
                            ? `<button class="note-action-btn remove-note-btn" title="Remove">❌</button>
                               <button class="note-action-btn insert-note-btn" title="Insert into document">📥</button>`
                            : `<button class="note-action-btn add-note-btn" title="Attach to document">➕</button>`
                        }
                    </div>
                </div>
            `;
        });

        html += '</div></div>';

        if (allNotes.length === 0) {
            html = `
                <div class="notes-empty">
                    <p>No notes available</p>
                    <p class="hint">Create notes from the All Notes panel</p>
                </div>
            `;
        }

        container.innerHTML = html;

        // Setup note action listeners
        container.querySelectorAll('.add-note-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const noteId = e.target.closest('.available-note').dataset.noteId;
                this.attachNote(noteId);
            });
        });

        container.querySelectorAll('.remove-note-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const noteId = e.target.closest('.available-note').dataset.noteId;
                this.detachNote(noteId);
            });
        });

        container.querySelectorAll('.insert-note-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const noteId = e.target.closest('.available-note').dataset.noteId;
                this.insertNoteContent(noteId, allNotes);
            });
        });
    }

    attachNote(noteId) {
        const doc = this.documents.find(d => d.id === this.currentDocId);
        if (!doc) return;

        if (!doc.attachedNotes) doc.attachedNotes = [];
        if (!doc.attachedNotes.includes(noteId)) {
            doc.attachedNotes.push(noteId);
            this.saveDocuments();
            this.loadAttachedNotes();
        }
    }

    detachNote(noteId) {
        const doc = this.documents.find(d => d.id === this.currentDocId);
        if (!doc || !doc.attachedNotes) return;

        doc.attachedNotes = doc.attachedNotes.filter(id => id !== noteId);
        this.saveDocuments();
        this.loadAttachedNotes();
    }

    async insertNoteContent(noteId, allNotes) {
        const note = allNotes.find(n => n.id === noteId);
        if (!note) return;

        const editor = document.getElementById('docEditorArea');
        const noteHtml = `
            <div class="inserted-note" style="background: #f5f5f5; border-left: 4px solid #6366f1; padding: 12px; margin: 16px 0; border-radius: 4px;">
                <strong style="color: #6366f1;">${this.escapeHtml(note.title || 'Note')}</strong>
                <p>${this.escapeHtml(note.content).replace(/\n/g, '<br>')}</p>
            </div>
        `;

        // Insert at cursor or append
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (editor.contains(range.commonAncestorContainer)) {
                const fragment = range.createContextualFragment(noteHtml);
                range.insertNode(fragment);
            } else {
                editor.innerHTML += noteHtml;
            }
        } else {
            editor.innerHTML += noteHtml;
        }

        this.onContentChange();
    }

    stripHtml(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncate(text, length) {
        if (!text) return '';
        return text.length > length ? text.substring(0, length) + '...' : text;
    }
}

// Initialize
window.documentEditor = new DocumentEditor();
