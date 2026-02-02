/**
 * ============================================================================
 * SPACED REPETITION MANAGER
 * ============================================================================
 * 
 * Manages spaced repetition / review items in the PDF viewer.
 * Allows users to add pages, documents, highlights to review queue.
 */

const SpacedRepetitionManager = (function () {
    'use strict';

    // Storage key for revisions
    const STORAGE_KEY = 'pdf_revisions';

    // Review categories with their day intervals
    const CATEGORIES = {
        'tomorrow': { label: 'Tomorrow', days: 1, icon: '📅' },
        '3days': { label: 'In 3 Days', days: 3, icon: '📆' },
        'week': { label: 'In a Week', days: 7, icon: '🗓️' }
    };

    // State
    let revisions = [];
    let isInitialized = false;
    let panelOpen = false;

    /**
     * Initialize the manager
     */
    async function init() {
        if (isInitialized) return;

        await loadRevisions();
        setupToolbarButton();
        setupPanel();
        setupContextMenu();
        updateBadge();

        isInitialized = true;
        console.log('📚 SpacedRepetitionManager initialized');
    }

    /**
     * Load revisions from storage
     */
    async function loadRevisions() {
        try {
            const stored = await chrome.storage.local.get(STORAGE_KEY);
            revisions = stored[STORAGE_KEY] || [];
        } catch (e) {
            // Fallback to localStorage
            const stored = localStorage.getItem(STORAGE_KEY);
            revisions = stored ? JSON.parse(stored) : [];
        }
    }

    /**
     * Save revisions to storage
     */
    async function saveRevisions() {
        try {
            await chrome.storage.local.set({ [STORAGE_KEY]: revisions });
        } catch (e) {
            // Fallback to localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(revisions));
        }
        updateBadge();
    }

    /**
     * Generate unique ID
     */
    function generateId() {
        return 'rev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Calculate due date based on category
     */
    function calculateDueDate(category) {
        const date = new Date();
        date.setDate(date.getDate() + (CATEGORIES[category]?.days || 1));
        return date.toISOString().split('T')[0];
    }

    /**
     * Get items due today or earlier
     */
    function getDueItems() {
        const today = new Date().toISOString().split('T')[0];
        return revisions.filter(r => r.dueDate <= today);
    }

    /**
     * Add a revision item
     */
    async function addRevision(data) {
        const revision = {
            id: generateId(),
            title: data.title || 'Untitled',
            content: data.content || '',
            source: {
                type: data.sourceType || 'page', // 'page', 'document', 'highlight', 'note'
                documentName: data.documentName || getDocumentName(),
                pageNumber: data.pageNumber || getCurrentPage(),
                url: data.url || window.location.href
            },
            category: data.category || 'tomorrow',
            dueDate: calculateDueDate(data.category || 'tomorrow'),
            reviewCount: 0,
            reviewHistory: [],
            color: data.color || '#8b5cf6',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        revisions.push(revision);
        await saveRevisions();

        showNotification('Added to Review', `"${revision.title}" will be reviewed ${CATEGORIES[revision.category].label.toLowerCase()}`);

        return revision;
    }

    /**
     * Mark a revision as reviewed
     */
    async function markReviewed(revisionId) {
        const revision = revisions.find(r => r.id === revisionId);
        if (!revision) return null;

        revision.reviewCount++;
        revision.reviewHistory.push({
            date: new Date().toISOString(),
            category: revision.category
        });

        // Progress to next category
        const progression = {
            'tomorrow': '3days',
            '3days': 'week',
            'week': 'completed'
        };

        const nextCategory = progression[revision.category] || 'completed';

        if (nextCategory === 'completed') {
            // Remove completed item
            revisions = revisions.filter(r => r.id !== revisionId);
            showNotification('Review Complete! 🎉', 'Item has been fully reviewed');
        } else {
            revision.category = nextCategory;
            revision.dueDate = calculateDueDate(nextCategory);
            revision.updatedAt = new Date().toISOString();
            showNotification('Progress! 📈', `Next review: ${CATEGORIES[nextCategory].label}`);
        }

        await saveRevisions();
        renderPanel();
        return nextCategory;
    }

    /**
     * Mark a revision as complete (moves to finished category)
     */
    async function markComplete(revisionId) {
        const revision = revisions.find(r => r.id === revisionId);
        if (!revision) return;

        revision.category = 'finished';
        revision.completedAt = new Date().toISOString();
        revision.updatedAt = new Date().toISOString();
        await saveRevisions();

        showNotification('Completed! 🎉', `"${revision.title}" moved to Finished`);
        renderPanel();
    }

    /**
     * Delete a revision
     */
    async function deleteRevision(revisionId) {
        revisions = revisions.filter(r => r.id !== revisionId);
        await saveRevisions();
        renderPanel();
    }

    /**
     * Get current page number
     */
    function getCurrentPage() {
        const pageInput = document.getElementById('pageNumber');
        return pageInput ? parseInt(pageInput.value) || 1 : 1;
    }

    /**
     * Get human-friendly document name (prefer PDF title over raw filename)
     */
    function getDocumentName() {
        // 1) Prefer the current document title (set from PDF metadata or library entry)
        if (document && typeof document.title === 'string') {
            const cleanedTitle = document.title
                .replace(/ - PDF Viewer$/i, '') // Strip viewer suffix if present
                .trim();
            if (cleanedTitle) {
                return cleanedTitle;
            }
        }

        // 2) Fallback to filename from URL (last segment ending in .pdf)
        const url = window.location.href;
        const match = url.match(/[^\/\\]+\.pdf/i);
        if (match) {
            return decodeURIComponent(match[0]);
        }

        // 3) Final fallback
        return 'PDF Document';
    }

    /**
     * Setup toolbar button with badge
     */
    function setupToolbarButton() {
        const toolbarRight = document.getElementById('toolbarViewerRight');
        if (!toolbarRight) return;

        // Create button wrapper for badge
        const wrapper = document.createElement('div');
        wrapper.id = 'spacedRepWrapper';
        wrapper.className = 'toolbar-button-wrapper';
        wrapper.innerHTML = `
            <button id="spacedRepBtn" class="toolbarButton" title="Spaced Repetition (Review Queue)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5"></path>
                    <path d="M2 12l10 5 10-5"></path>
                </svg>
            </button>
            <span id="spacedRepBadge" class="toolbar-badge hidden">0</span>
        `;

        // Insert before settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            toolbarRight.insertBefore(wrapper, settingsBtn);
        } else {
            toolbarRight.appendChild(wrapper);
        }

        // Add click handler
        document.getElementById('spacedRepBtn').addEventListener('click', togglePanel);
    }

    /**
     * Update badge with due items count
     */
    function updateBadge() {
        const badge = document.getElementById('spacedRepBadge');
        if (!badge) return;

        const dueCount = getDueItems().length;
        badge.textContent = dueCount;
        badge.classList.toggle('hidden', dueCount === 0);

        // Add pulse animation if there are due items
        if (dueCount > 0) {
            badge.classList.add('pulse');
        } else {
            badge.classList.remove('pulse');
        }
    }

    /**
     * Setup side panel
     */
    function setupPanel() {
        // Create panel HTML
        const panel = document.createElement('div');
        panel.id = 'spacedRepPanel';
        panel.className = 'spaced-rep-panel';
        panel.innerHTML = `
            <div class="sr-header">
                <h2>📚 Review Queue</h2>
                <button id="srCloseBtn" class="panel-close-btn">&times;</button>
            </div>
            <div class="sr-stats">
                <div class="sr-stat">
                    <span class="sr-stat-value" id="srTotalCount">0</span>
                    <span class="sr-stat-label">Total</span>
                </div>
                <div class="sr-stat due">
                    <span class="sr-stat-value" id="srDueCount">0</span>
                    <span class="sr-stat-label">Due Today</span>
                </div>
            </div>
            <div class="sr-add-section">
                <button id="srAddPageBtn" class="sr-add-btn">
                    <span class="sr-add-icon">📄</span>
                    Add Current Page
                </button>
                <button id="srAddDocBtn" class="sr-add-btn">
                    <span class="sr-add-icon">📑</span>
                    Add Document
                </button>
            </div>
            <div class="sr-tabs">
                <button class="sr-tab active" data-category="due">Due Now</button>
                <button class="sr-tab" data-category="tomorrow">Tomorrow</button>
                <button class="sr-tab" data-category="3days">3 Days</button>
                <button class="sr-tab" data-category="week">Week</button>
                <button class="sr-tab" data-category="all">All</button>
                <button class="sr-tab" data-category="finished">✓ Finished</button>
            </div>
            <div class="sr-list" id="srList">
                <div class="sr-empty">No items in review queue</div>
            </div>
        `;

        document.body.appendChild(panel);

        // Setup event listeners
        document.getElementById('srCloseBtn').addEventListener('click', togglePanel);
        document.getElementById('srAddPageBtn').addEventListener('click', () => showAddModal('page'));
        document.getElementById('srAddDocBtn').addEventListener('click', () => showAddModal('document'));

        // Tab switching
        panel.querySelectorAll('.sr-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                panel.querySelectorAll('.sr-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderPanel(tab.dataset.category);
            });
        });
    }

    /**
     * Toggle panel visibility
     */
    function togglePanel() {
        const panel = document.getElementById('spacedRepPanel');
        if (!panel) return;

        panelOpen = !panelOpen;
        panel.classList.toggle('open', panelOpen);

        if (panelOpen) {
            renderPanel();
        }
    }

    /**
     * Render panel content
     */
    function renderPanel(filter) {
        const list = document.getElementById('srList');
        const totalEl = document.getElementById('srTotalCount');
        const dueEl = document.getElementById('srDueCount');

        if (!list) return;

        // Get current filter from active tab if not provided
        if (!filter) {
            const activeTab = document.querySelector('.sr-tab.active');
            filter = activeTab ? activeTab.dataset.category : 'all';
        }

        const today = new Date().toISOString().split('T')[0];

        // Get active (non-finished) items for due calculation
        const activeRevisions = revisions.filter(r => r.category !== 'finished');
        const dueItems = activeRevisions.filter(r => r.dueDate <= today);
        const finishedItems = revisions.filter(r => r.category === 'finished');

        // Update stats (exclude finished from total/due counts)
        if (totalEl) totalEl.textContent = activeRevisions.length;
        if (dueEl) dueEl.textContent = dueItems.length;

        // Filter items
        let filteredItems;
        switch (filter) {
            case 'due':
                filteredItems = dueItems;
                break;
            case 'all':
                // 'All' shows active items only (not finished)
                filteredItems = activeRevisions;
                break;
            case 'finished':
                filteredItems = finishedItems;
                break;
            default:
                filteredItems = revisions.filter(r => r.category === filter);
        }

        if (filteredItems.length === 0) {
            list.innerHTML = `<div class="sr-empty">No items ${filter === 'due' ? 'due for review' : 'in this category'}</div>`;
            return;
        }

        list.innerHTML = filteredItems.map(item => {
            const isDue = item.dueDate <= today;
            return `
                <div class="sr-item ${isDue ? 'due' : ''}" data-id="${item.id}">
                    <div class="sr-item-color" style="background: ${item.color}"></div>
                    <div class="sr-item-content">
                        <div class="sr-item-title">${escapeHtml(item.title)}</div>
                        <div class="sr-item-meta">
                            <span class="sr-item-source">${escapeHtml(item.source.documentName)} - Page ${item.source.pageNumber}</span>
                            <span class="sr-item-category">${CATEGORIES[item.category]?.icon || ''} ${CATEGORIES[item.category]?.label || item.category}</span>
                        </div>
                    </div>
                    <div class="sr-item-actions">
                        ${isDue ? `<button class="sr-btn-review" title="Review & Progress to Next Level">↻</button>` : ''}
                        <button class="sr-btn-complete" title="Mark as Complete (Done)">✓</button>
                        <button class="sr-btn-goto" title="Go to Source">→</button>
                        <button class="sr-btn-delete" title="Delete">×</button>
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners to items
        list.querySelectorAll('.sr-item').forEach(item => {
            const id = item.dataset.id;

            item.querySelector('.sr-btn-review')?.addEventListener('click', (e) => {
                e.stopPropagation();
                markReviewed(id);
            });

            item.querySelector('.sr-btn-complete')?.addEventListener('click', (e) => {
                e.stopPropagation();
                markComplete(id);
            });

            item.querySelector('.sr-btn-goto')?.addEventListener('click', (e) => {
                e.stopPropagation();
                goToSource(id);
            });

            item.querySelector('.sr-btn-delete')?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Delete this review item?')) {
                    deleteRevision(id);
                }
            });
        });
    }

    /**
     * Go to revision source
     */
    function goToSource(revisionId) {
        const revision = revisions.find(r => r.id === revisionId);
        if (!revision) return;

        const sourceUrl = revision.source.url;
        const pageNum = revision.source.pageNumber;
        const currentUrl = window.location.href.split('#')[0]; // Remove hash
        const sourceBaseUrl = sourceUrl ? sourceUrl.split('#')[0] : '';

        // Check if this is a different document
        if (sourceUrl && sourceBaseUrl && sourceBaseUrl !== currentUrl) {
            // Navigate to the different document with page number
            let targetUrl = sourceUrl;
            if (pageNum && !targetUrl.includes('#page=')) {
                targetUrl = targetUrl.split('#')[0] + '#page=' + pageNum;
            }
            window.location.href = targetUrl;
            return;
        }

        // Same document - just navigate to page
        if (!pageNum) return;

        // Use PDF.js viewer API to navigate
        if (window.PDFViewerApplication && window.PDFViewerApplication.pdfViewer) {
            window.PDFViewerApplication.page = pageNum;
        } else {
            // Fallback: try input method
            const pageInput = document.getElementById('pageNumber');
            if (pageInput) {
                pageInput.value = pageNum;
                pageInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // Close the panel after navigating
        togglePanel();

        showNotification('📍 Navigated', `Jumped to page ${pageNum}`);
    }

    /**
     * Show add modal
     */
    function showAddModal(type = 'page') {
        // Remove existing modal
        document.querySelector('.sr-modal')?.remove();

        const modal = document.createElement('div');
        modal.className = 'sr-modal';
        modal.innerHTML = `
            <div class="sr-modal-content">
                <div class="sr-modal-header">
                    <h3>${type === 'page' ? '📄 Add Page to Review' : '📑 Add Document to Review'}</h3>
                    <button class="sr-modal-close">&times;</button>
                </div>
                <div class="sr-modal-body">
                    <div class="sr-form-group">
                        <label>Title</label>
                        <input type="text" id="srAddTitle" placeholder="${type === 'page' ? `Page ${getCurrentPage()} - ${getDocumentName()}` : getDocumentName()}" 
                               value="${type === 'page' ? `Page ${getCurrentPage()} - ${getDocumentName()}` : getDocumentName()}">
                    </div>
                    <div class="sr-form-group">
                        <label>Notes (optional)</label>
                        <textarea id="srAddContent" placeholder="What do you want to remember from this ${type}?"></textarea>
                    </div>
                    <div class="sr-form-group">
                        <label>Review Schedule</label>
                        <div class="sr-category-select">
                            <button class="sr-category-btn active" data-category="tomorrow">
                                📅 Tomorrow
                            </button>
                            <button class="sr-category-btn" data-category="3days">
                                📆 3 Days
                            </button>
                            <button class="sr-category-btn" data-category="week">
                                🗓️ 1 Week
                            </button>
                        </div>
                    </div>
                </div>
                <div class="sr-modal-footer">
                    <button class="sr-btn-cancel">Cancel</button>
                    <button class="sr-btn-save">Add to Review</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Category selection
        let selectedCategory = 'tomorrow';
        modal.querySelectorAll('.sr-category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.sr-category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedCategory = btn.dataset.category;
            });
        });

        // Close handlers
        modal.querySelector('.sr-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('.sr-btn-cancel').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Save handler
        modal.querySelector('.sr-btn-save').addEventListener('click', async () => {
            const title = document.getElementById('srAddTitle').value.trim();
            const content = document.getElementById('srAddContent').value.trim();

            await addRevision({
                title: title || (type === 'page' ? `Page ${getCurrentPage()}` : getDocumentName()),
                content: content,
                sourceType: type,
                category: selectedCategory
            });

            modal.remove();
            renderPanel();
        });
    }

    /**
     * Setup context menu for selections/highlights
     */
    function setupContextMenu() {
        // Listen for custom highlight menu events
        document.addEventListener('highlightContextMenu', (e) => {
            addContextMenuOption(e.detail);
        });

        // Also listen for text selection
        document.addEventListener('mouseup', (e) => {
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length > 0) {
                // Could show a mini tooltip for "Add to Review"
            }
        });
    }

    /**
     * Add "Add to Review" option to context menus
     */
    function addToReviewFromSelection() {
        const selection = window.getSelection();
        if (!selection || selection.toString().trim().length === 0) return;

        const text = selection.toString().trim();
        showAddModalForText(text);
    }

    /**
     * Show add modal for selected text
     */
    function showAddModalForText(text) {
        // Remove existing modal
        document.querySelector('.sr-modal')?.remove();

        const preview = text.length > 100 ? text.substring(0, 100) + '...' : text;

        const modal = document.createElement('div');
        modal.className = 'sr-modal';
        modal.innerHTML = `
            <div class="sr-modal-content">
                <div class="sr-modal-header">
                    <h3>📝 Add Selection to Review</h3>
                    <button class="sr-modal-close">&times;</button>
                </div>
                <div class="sr-modal-body">
                    <div class="sr-form-group">
                        <label>Selected Text</label>
                        <div class="sr-selected-preview">${escapeHtml(preview)}</div>
                    </div>
                    <div class="sr-form-group">
                        <label>Title</label>
                        <input type="text" id="srAddTitle" placeholder="Give this a memorable title" value="">
                    </div>
                    <div class="sr-form-group">
                        <label>Notes (optional)</label>
                        <textarea id="srAddContent" placeholder="Add any notes to help you remember..."></textarea>
                    </div>
                    <div class="sr-form-group">
                        <label>Review Schedule</label>
                        <div class="sr-category-select">
                            <button class="sr-category-btn active" data-category="tomorrow">📅 Tomorrow</button>
                            <button class="sr-category-btn" data-category="3days">📆 3 Days</button>
                            <button class="sr-category-btn" data-category="week">🗓️ 1 Week</button>
                        </div>
                    </div>
                </div>
                <div class="sr-modal-footer">
                    <button class="sr-btn-cancel">Cancel</button>
                    <button class="sr-btn-save">Add to Review</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Category selection
        let selectedCategory = 'tomorrow';
        modal.querySelectorAll('.sr-category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.sr-category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedCategory = btn.dataset.category;
            });
        });

        // Close handlers
        modal.querySelector('.sr-modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('.sr-btn-cancel').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Save handler
        modal.querySelector('.sr-btn-save').addEventListener('click', async () => {
            const title = document.getElementById('srAddTitle').value.trim() || preview.substring(0, 50);
            const notes = document.getElementById('srAddContent').value.trim();

            await addRevision({
                title: title,
                content: text + (notes ? '\n\n---\nNotes: ' + notes : ''),
                sourceType: 'highlight',
                category: selectedCategory
            });

            modal.remove();
            renderPanel();
        });
    }

    /**
     * Show notification
     */
    function showNotification(title, message) {
        // Use custom viewer's notification if available
        if (typeof showToast === 'function') {
            showToast('success', title, message);
            return;
        }

        // Fallback to simple notification
        const notif = document.createElement('div');
        notif.className = 'sr-notification';
        notif.innerHTML = `
            <strong>${title}</strong>
            <span>${message}</span>
        `;
        document.body.appendChild(notif);

        setTimeout(() => {
            notif.classList.add('fade-out');
            setTimeout(() => notif.remove(), 300);
        }, 3000);
    }

    /**
     * Escape HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Public API
    return {
        init,
        addRevision,
        markReviewed,
        deleteRevision,
        getDueItems,
        getRevisions: () => revisions,
        togglePanel,
        addToReviewFromSelection,
        showAddModalForText,
        updateBadge
    };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SpacedRepetitionManager.init());
} else {
    SpacedRepetitionManager.init();
}

// Export for global access
window.SpacedRepetitionManager = SpacedRepetitionManager;
