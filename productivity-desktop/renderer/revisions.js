/**
 * ============================================================================
 * SPACED REPETITION / REVISIONS MODULE
 * ============================================================================
 * 
 * Handles the "To Review" feature for spaced repetition learning.
 * Users can add content they want to memorize and track review progress.
 */

const RevisionSystem = {
    currentCategory: 'due',
    isInitialized: false,

    // Initialize the revision system
    async init() {
        // Always setup event listeners when navigating to the page
        this.setupEventListeners();

        await this.loadRevisions();
        await this.updateStats();
        await this.updateBadge();

        if (!this.isInitialized) {
            this.isInitialized = true;
            console.log('📚 Revision system initialized');
        }
    },

    // Setup event listeners
    setupEventListeners() {
        // Add revision button - with stopPropagation to prevent other handlers
        const addBtn = document.getElementById('add-revision-btn');
        if (addBtn && !addBtn.dataset.listenerAdded) {
            addBtn.dataset.listenerAdded = 'true';
            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('📚 Add Revision button clicked');
                this.showAddModal();
            });
        } else if (!addBtn) {
            console.warn('⚠️ add-revision-btn not found');
        }

        // Category tabs
        document.querySelectorAll('.revision-categories .category-tab').forEach(tab => {
            if (tab.dataset.listenerAdded) return;
            tab.dataset.listenerAdded = 'true';
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const category = e.currentTarget.dataset.category;
                this.switchCategory(category);
            });
        });

        // Review due button
        const reviewDueBtn = document.getElementById('review-due-btn');
        if (reviewDueBtn && !reviewDueBtn.dataset.listenerAdded) {
            reviewDueBtn.dataset.listenerAdded = 'true';
            reviewDueBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showDueItems();
            });
        }
    },

    // Switch category
    async switchCategory(category) {
        this.currentCategory = category;

        // Update active tab
        document.querySelectorAll('.revision-categories .category-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.category === category);
        });

        await this.renderRevisions();
    },

    // Load and render revisions
    async loadRevisions() {
        await this.renderRevisions();
        await this.updateStats();
        this.checkDueItems();
    },

    // Render revisions for current category
    async renderRevisions() {
        const container = document.getElementById('revisions-container');
        const emptyState = document.getElementById('revisions-empty');
        if (!container) return;

        const allRevisions = await ProductivityData.DataStore.getRevisions();
        const today = new Date().toISOString().split('T')[0];

        // Filter by category
        let revisions;
        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
        const oneWeekDate = oneWeekFromNow.toISOString().split('T')[0];

        if (this.currentCategory === 'all') {
            revisions = allRevisions;
        } else if (this.currentCategory === 'due') {
            // Show items due today or overdue
            revisions = allRevisions.filter(r => r.dueDate && r.dueDate <= today);
        } else if (this.currentCategory === 'finished') {
            // Show items that have been reviewed and are due after more than a week
            revisions = allRevisions.filter(r => r.reviewCount > 0 && r.dueDate && r.dueDate > oneWeekDate);
        } else {
            revisions = allRevisions.filter(r => r.category === this.currentCategory);
        }

        // Sort by due date
        revisions.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

        // Clear existing cards (keep empty state)
        container.querySelectorAll('.revision-card').forEach(card => card.remove());

        if (revisions.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        revisions.forEach(revision => {
            const isDue = revision.dueDate <= today;
            const card = this.createRevisionCard(revision, isDue);
            container.appendChild(card);
        });
    },

    // Create a revision card element
    createRevisionCard(revision, isDue = false) {
        const card = document.createElement('div');
        card.className = `revision-card${isDue ? ' due' : ''}`;
        card.dataset.id = revision.id;
        card.style.setProperty('--card-accent', revision.color || '#8b5cf6');

        const categoryLabels = {
            'tomorrow': 'Tomorrow',
            '3days': '3 Days',
            'week': '1 Week'
        };

        const dueDateFormatted = this.formatDueDate(revision.dueDate);

        card.innerHTML = `
            <div class="revision-card-header">
                <h3 class="revision-card-title">${this.escapeHtml(revision.title)}</h3>
                <div class="revision-card-meta">
                    ${isDue ? '<span class="revision-tag due">Due</span>' : ''}
                    <span class="revision-tag ${revision.category.replace('3days', 'three-days')}">${categoryLabels[revision.category] || revision.category}</span>
                </div>
            </div>
            
            <div class="revision-card-content">
                ${this.escapeHtml(revision.content)}
            </div>
            
            ${revision.source ? `
                <div class="revision-card-source">
                    <i class="fas ${revision.source.type === 'document' ? 'fa-file-alt' : 'fa-bookmark'}"></i>
                    <span>${this.escapeHtml(revision.source.docName || 'Source Document')}${revision.source.pageNumber ? ` - Page ${revision.source.pageNumber}` : ''}</span>
                </div>
            ` : ''}
            
            ${revision.notes ? `
                <div class="revision-card-notes">
                    "${this.escapeHtml(revision.notes)}"
                </div>
            ` : ''}
            
            <div class="revision-card-footer">
                <div class="revision-card-info">
                    <span class="revision-due-date">
                        <i class="fas fa-calendar"></i> ${dueDateFormatted}
                    </span>
                    <span class="revision-review-count">
                        Reviewed ${revision.reviewCount} time${revision.reviewCount !== 1 ? 's' : ''}
                    </span>
                </div>
                <div class="revision-card-actions">
                    <button class="btn-focus" title="Start Focusing" data-action="focus">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn-edit" title="Edit" data-action="edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-reviewed" title="Mark as Reviewed" data-action="reviewed">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn-delete" title="Delete" data-action="delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        // Add action handlers
        card.querySelector('[data-action="focus"]').addEventListener('click', () => {
            this.startFocusOnRevision(revision);
        });

        card.querySelector('[data-action="edit"]').addEventListener('click', () => {
            this.showEditModal(revision.id);
        });

        card.querySelector('[data-action="reviewed"]').addEventListener('click', () => {
            this.markAsReviewed(revision.id);
        });

        card.querySelector('[data-action="delete"]').addEventListener('click', () => {
            this.deleteRevision(revision.id);
        });

        return card;
    },

    // Format due date for display
    formatDueDate(dateStr) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(dateStr);
        dueDate.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} overdue`;
        if (diffDays === 0) return 'Due today';
        if (diffDays === 1) return 'Due tomorrow';
        if (diffDays < 7) return `In ${diffDays} days`;

        return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    // Update statistics display
    async updateStats() {
        const stats = await ProductivityData.DataStore.getRevisionStats();

        // Update stat values
        const totalEl = document.getElementById('revision-total-count');
        const dueEl = document.getElementById('revision-due-count');
        const reviewsEl = document.getElementById('revision-review-count');

        if (totalEl) totalEl.textContent = stats.total;
        if (dueEl) dueEl.textContent = stats.due;
        // Show reviews done today instead of total reviews
        if (reviewsEl) reviewsEl.textContent = stats.reviewsDoneToday || 0;

        // Update category counts
        const dueTabEl = document.getElementById('rev-count-due');
        const tomorrowEl = document.getElementById('rev-count-tomorrow');
        const threeDaysEl = document.getElementById('rev-count-3days');
        const weekEl = document.getElementById('rev-count-week');
        const finishedEl = document.getElementById('rev-count-finished');
        const allEl = document.getElementById('rev-count-all');

        if (dueTabEl) dueTabEl.textContent = stats.due;
        if (tomorrowEl) tomorrowEl.textContent = stats.tomorrow;
        if (threeDaysEl) threeDaysEl.textContent = stats.threeDays;
        if (weekEl) weekEl.textContent = stats.week;
        if (finishedEl) finishedEl.textContent = stats.finished || 0;
        if (allEl) allEl.textContent = stats.total;
    },

    // Update sidebar badge
    async updateBadge() {
        const stats = await ProductivityData.DataStore.getRevisionStats();
        const badge = document.getElementById('revisions-badge');

        if (badge) {
            badge.textContent = stats.due;
            badge.style.display = stats.due > 0 ? 'inline-flex' : 'none';
        }
    },

    // Check for due items and show alert
    async checkDueItems() {
        const stats = await ProductivityData.DataStore.getRevisionStats();
        const alert = document.getElementById('due-items-alert');
        const countEl = document.getElementById('due-alert-count');

        if (alert && countEl) {
            if (stats.due > 0) {
                countEl.textContent = stats.due;
                alert.classList.remove('hidden');
            } else {
                alert.classList.add('hidden');
            }
        }
    },

    // Show due items
    async showDueItems() {
        this.switchCategory('due');
        // Scroll to first due item
        setTimeout(() => {
            const firstDue = document.querySelector('.revision-card.due');
            if (firstDue) {
                firstDue.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstDue.style.animation = 'pulse-glow 0.5s ease 3';
            }
        }, 100);
    },

    // Start focus session for a revision item
    startFocusOnRevision(revision) {
        // Navigate to focus page and pre-fill task name
        if (typeof navigateTo === 'function') {
            navigateTo('focus');
            // Wait for page to load then fill in task name
            setTimeout(() => {
                const taskInput = document.getElementById('focus-task-input') ||
                    document.getElementById('task-name-input');
                if (taskInput) {
                    taskInput.value = `Review: ${revision.title}`;
                }
            }, 100);
        }
    },

    // Show add modal
    showAddModal() {
        this.showModal(null);
    },

    // Show edit modal
    async showEditModal(revisionId) {
        const revisions = await ProductivityData.DataStore.getRevisions();
        const revision = revisions.find(r => r.id === revisionId);
        if (revision) {
            this.showModal(revision);
        }
    },

    // Show modal (add or edit)
    showModal(revision = null) {
        console.log('📚 showModal called', revision);
        const isEdit = !!revision;

        // Remove existing modal if any
        const existingModal = document.querySelector('.revision-modal');
        if (existingModal) existingModal.remove();

        const colors = ['#8b5cf6', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
        const selectedColor = revision?.color || '#8b5cf6';

        const modal = document.createElement('div');
        modal.className = 'modal revision-modal active';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content revision-modal-content">
                <div class="revision-modal-header">
                    <h2><i class="fas ${isEdit ? 'fa-edit' : 'fa-plus-circle'}"></i> ${isEdit ? 'Edit' : 'Add'} Review Item</h2>
                    <button class="close-modal-btn" id="close-revision-modal">&times;</button>
                </div>
                <div class="revision-modal-body">
                    <div class="revision-form-group">
                        <label for="revision-title">Title</label>
                        <input type="text" id="revision-title" placeholder="What do you want to remember?" value="${isEdit ? this.escapeHtml(revision.title) : ''}" required>
                    </div>
                    
                    <div class="revision-form-group">
                        <label for="revision-content">Content</label>
                        <textarea id="revision-content" placeholder="The text or information you want to memorize...">${isEdit ? this.escapeHtml(revision.content) : ''}</textarea>
                    </div>
                    
                    <div class="revision-form-group">
                        <label>Review Schedule</label>
                        <div class="revision-category-select">
                            <button type="button" class="revision-category-option ${(!isEdit || revision.category === 'tomorrow') ? 'active' : ''}" data-category="tomorrow">
                                <i class="fas fa-calendar-day"></i>
                                <span>Tomorrow</span>
                            </button>
                            <button type="button" class="revision-category-option ${(isEdit && revision.category === '3days') ? 'active' : ''}" data-category="3days">
                                <i class="fas fa-calendar-week"></i>
                                <span>3 Days</span>
                            </button>
                            <button type="button" class="revision-category-option ${(isEdit && revision.category === 'week') ? 'active' : ''}" data-category="week">
                                <i class="fas fa-calendar-alt"></i>
                                <span>1 Week</span>
                            </button>
                        </div>
                    </div>
                    
                    <div class="revision-form-group">
                        <label for="revision-notes">Personal Notes (optional)</label>
                        <textarea id="revision-notes" placeholder="Any notes or mnemonics to help you remember..." style="min-height: 80px;">${isEdit && revision.notes ? this.escapeHtml(revision.notes) : ''}</textarea>
                    </div>
                    
                    <div class="revision-form-group">
                        <label>Color</label>
                        <div class="revision-color-options">
                            ${colors.map(c => `
                                <div class="revision-color-option ${c === selectedColor ? 'active' : ''}" 
                                     data-color="${c}" 
                                     style="background-color: ${c};">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="revision-modal-footer">
                    <button type="button" class="btn-cancel" id="cancel-revision-btn">Cancel</button>
                    <button type="button" class="btn-save" id="save-revision-btn">${isEdit ? 'Save Changes' : 'Add Item'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        console.log('📚 Modal appended to body', modal, 'display:', modal.style.display);

        // Category selection
        let selectedCategory = revision?.category || 'tomorrow';
        modal.querySelectorAll('.revision-category-option').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.revision-category-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedCategory = btn.dataset.category;
            });
        });

        // Color selection
        let currentColor = selectedColor;
        modal.querySelectorAll('.revision-color-option').forEach(option => {
            option.addEventListener('click', () => {
                modal.querySelectorAll('.revision-color-option').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                currentColor = option.dataset.color;
            });
        });

        // Close modal
        const closeModal = () => modal.remove();
        modal.querySelector('#close-revision-modal').addEventListener('click', closeModal);
        modal.querySelector('#cancel-revision-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Save
        modal.querySelector('#save-revision-btn').addEventListener('click', async () => {
            const title = modal.querySelector('#revision-title').value.trim();
            const content = modal.querySelector('#revision-content').value.trim();
            const notes = modal.querySelector('#revision-notes').value.trim();

            if (!title) {
                modal.querySelector('#revision-title').focus();
                showToast('error', 'Title Required', 'Please enter a title for this item.');
                return;
            }

            if (!content) {
                modal.querySelector('#revision-content').focus();
                showToast('error', 'Content Required', 'Please enter the content you want to memorize.');
                return;
            }

            const data = {
                title,
                content,
                category: selectedCategory,
                notes,
                color: currentColor
            };

            if (isEdit) {
                await ProductivityData.DataStore.updateRevision(revision.id, data);
                showToast('success', 'Updated', 'Review item updated successfully.');
            } else {
                const newRevision = new ProductivityData.RevisionItem(data);
                await ProductivityData.DataStore.saveRevision(newRevision);
                showToast('success', 'Added', 'New review item added.');
            }

            closeModal();
            await this.loadRevisions();
            await this.updateBadge();
        });

        // Focus title input
        setTimeout(() => modal.querySelector('#revision-title').focus(), 100);
    },

    // Mark as reviewed
    async markAsReviewed(revisionId) {
        const result = await ProductivityData.DataStore.markRevisionReviewed(revisionId);

        if (result) {
            if (result.status === 'completed') {
                showToast('success', 'Mastered! 🎉', 'Great job! This item has been mastered and removed.');
            } else {
                const categoryLabels = {
                    'tomorrow': 'tomorrow',
                    '3days': '3 days',
                    'week': 'next week'
                };
                showToast('success', 'Reviewed!', `Item moved to ${categoryLabels[result.category] || result.category}.`);
            }

            await this.loadRevisions();
            await this.updateBadge();
        }
    },

    // Delete revision
    async deleteRevision(revisionId) {
        if (!confirm('Are you sure you want to delete this review item?')) return;

        await ProductivityData.DataStore.deleteRevision(revisionId);
        showToast('info', 'Deleted', 'Review item removed.');

        await this.loadRevisions();
        await this.updateBadge();
    },

    // Escape HTML for safe rendering
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Export globally
window.RevisionSystem = RevisionSystem;

// Auto-initialize when page loads - set up click handler immediately
document.addEventListener('DOMContentLoaded', () => {
    // Set up click handler immediately for the add button
    const addBtn = document.getElementById('add-revision-btn');
    if (addBtn) {
        // Use onclick to ensure it works
        addBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('📚 Add Revision button clicked (onclick)');
            RevisionSystem.showAddModal();
            return false;
        };
        console.log('✅ add-revision-btn onclick handler attached');
    }
});
