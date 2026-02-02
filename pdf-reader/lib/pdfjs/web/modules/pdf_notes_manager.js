/**
 * PDF Notes Manager - Per-PDF note taking system
 * Allows users to add, view, and manage notes specific to each PDF document
 */

class PDFNotesManager {
    constructor() {
        this.pdfId = null;
        this.pdfTitle = '';
        this.pdfUrl = '';
        this.notes = [];
        this.notesPanel = null;
        this.isVisible = false;

        // Auto-initialize when constructed
        this.autoInit();
    }

    autoInit() {
        // Get PDF URL from query string
        const urlParams = new URLSearchParams(window.location.search);
        const pdfUrl = urlParams.get('file') || window.location.href;

        this.pdfUrl = pdfUrl;
        this.pdfId = this.generatePDFId(pdfUrl);
        this.pdfTitle = this.extractTitleFromUrl(pdfUrl);

        // Try to get PDF metadata if available
        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
            window.PDFViewerApplication.pdfDocument.getMetadata().then(metadata => {
                if (metadata.info && metadata.info.Title) {
                    this.pdfTitle = metadata.info.Title;
                    this.updatePanelTitle();
                }
            }).catch(() => { });
        }

        this.loadNotes();
        this.createNotesPanel();
        this.registerWithOverlayManager();
    }

    updatePanelTitle() {
        const titleEl = this.notesPanel?.querySelector('.pdf-notes-title');
        if (titleEl) {
            titleEl.textContent = this.pdfTitle;
        }
    }

    init(pdfDocument, pdfUrl) {
        this.pdfUrl = pdfUrl;
        this.pdfId = this.generatePDFId(pdfUrl);
        this.pdfTitle = this.extractTitleFromUrl(pdfUrl);

        // Extract title from metadata if available
        if (pdfDocument) {
            pdfDocument.getMetadata().then(metadata => {
                if (metadata.info && metadata.info.Title) {
                    this.pdfTitle = metadata.info.Title;
                }
            }).catch(() => { });
        }

        this.loadNotes();
        this.createNotesPanel();
        this.createNotesButton();

    }

    generatePDFId(url) {
        // Create a unique ID based on URL
        let hash = 0;
        const str = url || 'unknown';
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'pdf_' + Math.abs(hash).toString(16);
    }

    extractTitleFromUrl(url) {
        try {
            const filename = decodeURIComponent(url.split('/').pop().split('?')[0]);
            return filename.replace('.pdf', '').replace(/[-_]/g, ' ') || 'Untitled Document';
        } catch (e) {
            return 'Untitled Document';
        }
    }

    loadNotes() {
        try {
            const storageKey = `pdfNotes_${this.pdfId}`;
            chrome.storage.local.get([storageKey, 'allPdfNotes'], (result) => {
                this.notes = result[storageKey] || [];
                this.updateNotesCount();

                // Also register this PDF in the global list
                const allPdfNotes = result.allPdfNotes || {};
                if (!allPdfNotes[this.pdfId]) {
                    allPdfNotes[this.pdfId] = {
                        id: this.pdfId,
                        title: this.pdfTitle,
                        url: this.pdfUrl,
                        notesCount: this.notes.length,
                        lastAccessed: new Date().toISOString()
                    };
                    chrome.storage.local.set({ allPdfNotes });
                }
            });
        } catch (e) {
            console.error('PDFNotesManager: Error loading notes:', e);
            this.notes = [];
        }
    }

    saveNotes() {
        const storageKey = `pdfNotes_${this.pdfId}`;
        chrome.storage.local.set({ [storageKey]: this.notes }, () => {
            // Update global PDF list with note count
            chrome.storage.local.get(['allPdfNotes'], (result) => {
                const allPdfNotes = result.allPdfNotes || {};
                if (allPdfNotes[this.pdfId]) {
                    allPdfNotes[this.pdfId].notesCount = this.notes.length;
                    allPdfNotes[this.pdfId].lastAccessed = new Date().toISOString();
                    chrome.storage.local.set({ allPdfNotes });
                }
            });
        });
    }

    createNotesButton() {
        const toolbar = document.getElementById('toolbarViewerRight');
        if (!toolbar) return;

        // Check if button already exists
        if (document.getElementById('pdfNotesBtn')) return;

        const separator = document.createElement('div');
        separator.className = 'verticalToolbarSeparator';

        const btn = document.createElement('button');
        btn.id = 'pdfNotesBtn';
        btn.className = 'toolbarButton';
        btn.title = 'PDF Notes';
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span class="notes-badge hidden" id="notesBadge">0</span>
        `;

        btn.addEventListener('click', () => this.togglePanel());

        // Insert before highlight wrapper or append to toolbar
        const highlightWrapper = document.getElementById('highlightWrapper');
        if (highlightWrapper) {
            toolbar.insertBefore(separator, highlightWrapper);
            toolbar.insertBefore(btn, highlightWrapper);
        } else {
            toolbar.appendChild(separator);
            toolbar.appendChild(btn);
        }
    }

    createNotesPanel() {
        // Remove existing panel
        const existing = document.getElementById('pdfNotesPanel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'pdfNotesPanel';
        panel.className = 'pdf-notes-panel hidden';
        panel.innerHTML = `
            <div class="notes-panel-header">
                <h3>📝 Notes for this PDF</h3>
                <span class="notes-pdf-title">${this.escapeHtml(this.pdfTitle)}</span>
                <button class="notes-panel-close">&times;</button>
            </div>
            <div class="notes-add-section">
                <textarea id="newNoteInput" placeholder="Write a note about this PDF..." rows="3"></textarea>
                <div class="notes-add-actions">
                    <div class="note-page-input">
                        <label>Page:</label>
                        <input type="number" id="notePageNumber" min="1" value="1">
                    </div>
                    <button id="addNoteBtn" class="add-note-btn">+ Add Note</button>
                </div>
            </div>
            <div class="notes-list-header">
                <span id="notesCount">0 notes</span>
                <div class="notes-actions">
                    <button id="exportNotesBtn" class="small-action-btn" title="Export Notes">📥</button>
                    <button id="clearAllNotesBtn" class="small-action-btn" title="Clear All">🗑️</button>
                </div>
            </div>
            <div class="notes-list" id="notesList">
                <div class="notes-empty">No notes yet. Start taking notes!</div>
            </div>
        `;

        document.body.appendChild(panel);
        this.notesPanel = panel;

        // Event listeners
        panel.querySelector('.notes-panel-close').addEventListener('click', () => this.hidePanel());
        panel.querySelector('#addNoteBtn').addEventListener('click', () => this.addNote());
        panel.querySelector('#exportNotesBtn').addEventListener('click', () => this.exportNotes());
        panel.querySelector('#clearAllNotesBtn').addEventListener('click', () => this.clearAllNotes());

        // Enter key to add note
        panel.querySelector('#newNoteInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.addNote();
            }
        });

        // Update current page number
        this.updateCurrentPage();
    }

    updateCurrentPage() {
        const pageInput = document.getElementById('notePageNumber');
        const currentPageEl = document.getElementById('pageNumber');
        if (pageInput && currentPageEl) {
            pageInput.value = currentPageEl.value || 1;
        }
    }

    togglePanel() {
        if (this.isVisible) {
            this.hidePanel();
        } else {
            // Use overlay manager to ensure only one panel is open
            if (window.overlayManager) {
                window.overlayManager.open('pdfNotes');
            } else {
                this.showPanel();
            }
        }
    }

    showPanel() {
        if (this.notesPanel) {
            this.updateCurrentPage();
            this.notesPanel.classList.remove('hidden');
            this.isVisible = true;
            this.renderNotes();
        }
    }

    hidePanel() {
        if (this.notesPanel) {
            this.notesPanel.classList.add('hidden');
            this.isVisible = false;
        }
    }

    registerWithOverlayManager() {
        if (window.overlayManager) {
            window.overlayManager.register('pdfNotes',
                () => this.showPanel(),
                () => this.hidePanel()
            );
        }
    }

    addNote(content = null, page = null, selectedText = null) {
        const input = document.getElementById('newNoteInput');
        const pageInput = document.getElementById('notePageNumber');

        // Use provided content or get from input
        const noteContent = content || (input ? input.value.trim() : '');
        if (!noteContent && !selectedText) {
            this.showToast('Please enter a note');
            return;
        }

        const note = {
            id: Date.now().toString(),
            content: noteContent,
            selectedText: selectedText || null,
            page: page || (pageInput ? parseInt(pageInput.value) : 1) || 1,
            createdAt: new Date().toISOString(),
            color: selectedText ? '#e3f2fd' : '#fff9c4',
            type: selectedText ? 'selection' : 'note'
        };

        this.notes.unshift(note);
        this.saveNotes();
        this.renderNotes();
        this.updateNotesCount();

        if (input) input.value = '';
        this.showToast(selectedText ? 'Selection saved as note!' : 'Note added!');
    }

    addNoteFromSelection(text, page, selectionRange = null) {
        // Show dialog allowing user to edit the selected text before saving
        const dialog = document.createElement('div');
        dialog.className = 'note-edit-dialog';
        dialog.innerHTML = `
            <div class="note-edit-content">
                <h4>Add Note from Selection</h4>
                <label style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; display: block;">Selected Text (editable):</label>
                <textarea id="editSelectionText" style="min-height: 100px;">${this.escapeHtml(text)}</textarea>
                <label style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; margin-top: 8px; display: block;">Your Note/Comment (optional):</label>
                <textarea id="noteCommentText" placeholder="Add your thoughts or comments..." style="min-height: 60px;"></textarea>
                <div class="note-edit-actions">
                    <button id="cancelEditBtn" class="cancel-btn">Cancel</button>
                    <button id="saveEditBtn" class="save-btn">Save Note</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        const saveNote = () => {
            const editedText = dialog.querySelector('#editSelectionText').value.trim();
            const comment = dialog.querySelector('#noteCommentText').value.trim();

            if (!editedText && !comment) {
                this.showToast('Please enter some text');
                return;
            }

            dialog.remove();

            // Create a highlight for the selected text (silent - don't show highlight notification)
            let highlightId = null;
            if (selectionRange && window.createHighlight) {
                try {
                    const highlight = window.createHighlight(selectionRange, 'highlight', null, '#90CAF9', { silent: true });
                    if (highlight) {
                        highlightId = highlight.id;
                    }
                } catch (e) {
                    console.error('PDFNotesManager: Error creating highlight:', e);
                }
            } else if (window.getSelection && window.createHighlight) {
                // Try to use current selection if no range provided
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    try {
                        const highlight = window.createHighlight(selection, 'highlight', null, '#90CAF9', { silent: true });
                        if (highlight) {
                            highlightId = highlight.id;
                        }
                    } catch (e) {
                        console.error('PDFNotesManager: Error creating highlight from selection:', e);
                    }
                }
            }

            const note = {
                id: Date.now().toString(),
                content: comment || editedText,
                selectedText: editedText,
                page: page || 1,
                createdAt: new Date().toISOString(),
                color: '#e3f2fd',
                isHighlight: true,
                highlightId: highlightId  // Link to the highlight
            };

            this.notes.unshift(note);
            this.saveNotes();
            this.renderNotes();
            this.updateNotesCount();

            // Show notification using notificationManager
            if (window.notificationManager) {
                window.notificationManager.success('Note saved with highlight!', 'notes');
            } else {
                this.showToast('Selection saved as note with highlight!');
            }
        };

        dialog.querySelector('#cancelEditBtn').addEventListener('click', () => dialog.remove());
        dialog.querySelector('#saveEditBtn').addEventListener('click', saveNote);

        // Ctrl+Enter to save
        dialog.querySelectorAll('textarea').forEach(ta => {
            ta.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    saveNote();
                }
            });
        });

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });

        // Focus the first textarea
        dialog.querySelector('#editSelectionText').focus();
    }

    deleteNote(noteId) {
        this.notes = this.notes.filter(n => n.id !== noteId);
        this.saveNotes();
        this.renderNotes();
        this.updateNotesCount();
        this.showToast('Note deleted');
    }

    editNote(noteId, newContent) {
        const note = this.notes.find(n => n.id === noteId);
        if (note) {
            note.content = newContent;
            note.updatedAt = new Date().toISOString();
            this.saveNotes();
            this.renderNotes();
            this.showToast('Note updated');
        }
    }

    renderNotes() {
        const list = document.getElementById('notesList');
        if (!list) return;

        if (this.notes.length === 0) {
            list.innerHTML = '<div class="notes-empty">No notes yet. Start taking notes!</div>';
            return;
        }

        list.innerHTML = this.notes.map(note => `
            <div class="note-item" data-note-id="${note.id}" style="background-color: ${note.color || '#fff9c4'}">
                ${note.selectedText ? `
                    <div class="note-selected-text">
                        <small>📌 Selected text:</small>
                        <blockquote>"${this.escapeHtml(note.selectedText.substring(0, 200))}${note.selectedText.length > 200 ? '...' : ''}"</blockquote>
                    </div>
                ` : ''}
                <div class="note-content">${this.escapeHtml(note.content)}</div>
                <div class="note-meta">
                    <span class="note-page" title="Go to page ${note.page}">📄 Page ${note.page}</span>
                    <span class="note-date">${this.formatDate(note.createdAt)}</span>
                    ${note.type === 'selection' || note.isHighlight ? '<span class="note-highlight-badge">Selection</span>' : ''}
                </div>
                <div class="note-actions">
                    <button class="note-action-btn edit-note" title="Edit">✏️</button>
                    <button class="note-action-btn goto-page" title="Go to Page">📍</button>
                    <button class="note-action-btn delete-note" title="Delete">🗑️</button>
                </div>
            </div>
        `).join('');

        // Add event listeners
        list.querySelectorAll('.note-item').forEach(item => {
            const noteId = item.dataset.noteId;

            item.querySelector('.delete-note').addEventListener('click', () => {
                if (confirm('Delete this note?')) {
                    this.deleteNote(noteId);
                }
            });

            item.querySelector('.goto-page').addEventListener('click', () => {
                const note = this.notes.find(n => n.id === noteId);
                if (note) {
                    this.goToPage(note.page);
                }
            });

            item.querySelector('.note-page').addEventListener('click', () => {
                const note = this.notes.find(n => n.id === noteId);
                if (note) {
                    this.goToPage(note.page);
                }
            });

            item.querySelector('.edit-note').addEventListener('click', () => {
                this.showEditDialog(noteId);
            });
        });
    }

    showEditDialog(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        const dialog = document.createElement('div');
        dialog.className = 'note-edit-dialog';
        dialog.innerHTML = `
            <div class="note-edit-content">
                <h4>Edit Note</h4>
                <textarea id="editNoteText">${this.escapeHtml(note.content)}</textarea>
                <div class="note-edit-actions">
                    <button id="cancelEditBtn" class="cancel-btn">Cancel</button>
                    <button id="saveEditBtn" class="save-btn">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        dialog.querySelector('#cancelEditBtn').addEventListener('click', () => dialog.remove());
        dialog.querySelector('#saveEditBtn').addEventListener('click', () => {
            const newContent = dialog.querySelector('#editNoteText').value.trim();
            if (newContent) {
                this.editNote(noteId, newContent);
            }
            dialog.remove();
        });

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    goToPage(pageNum) {
        const pageInput = document.getElementById('pageNumber');
        if (pageInput) {
            pageInput.value = pageNum;
            pageInput.dispatchEvent(new Event('change'));
        }
        // Also try direct navigation
        if (window.PDFViewerApplication) {
            window.PDFViewerApplication.page = pageNum;
        }
    }

    updateNotesCount() {
        const countEl = document.getElementById('notesCount');
        const badgeEl = document.getElementById('notesBadge');

        if (countEl) {
            countEl.textContent = `${this.notes.length} note${this.notes.length !== 1 ? 's' : ''}`;
        }

        if (badgeEl) {
            if (this.notes.length > 0) {
                badgeEl.textContent = this.notes.length;
                badgeEl.classList.remove('hidden');
            } else {
                badgeEl.classList.add('hidden');
            }
        }
    }

    exportNotes() {
        if (this.notes.length === 0) {
            this.showToast('No notes to export');
            return;
        }

        const exportData = {
            pdfTitle: this.pdfTitle,
            pdfUrl: this.pdfUrl,
            exportDate: new Date().toISOString(),
            notes: this.notes
        };

        // Create markdown format
        let markdown = `# Notes for: ${this.pdfTitle}\n\n`;
        markdown += `Exported: ${new Date().toLocaleString()}\n\n---\n\n`;

        this.notes.forEach((note, index) => {
            markdown += `## Note ${index + 1} (Page ${note.page})\n\n`;
            if (note.selectedText) {
                markdown += `> "${note.selectedText}"\n\n`;
            }
            if (note.content) {
                markdown += `${note.content}\n\n`;
            }
            markdown += `*Added: ${this.formatDate(note.createdAt)}*\n\n---\n\n`;
        });

        // Download as markdown
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.pdfTitle.replace(/[^a-z0-9]/gi, '_')}_notes.md`;
        a.click();
        URL.revokeObjectURL(url);

        this.showToast('Notes exported!');
    }

    clearAllNotes() {
        if (this.notes.length === 0) return;

        if (confirm(`Delete all ${this.notes.length} notes for this PDF?`)) {
            this.notes = [];
            this.saveNotes();
            this.renderNotes();
            this.updateNotesCount();
            this.showToast('All notes cleared');
        }
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return 'Unknown date';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message) {
        const existing = document.querySelector('.notes-toast');
        if (existing) existing.remove();

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

// Export for use
window.PDFNotesManager = PDFNotesManager;
