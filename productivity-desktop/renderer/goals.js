/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - GOALS MODULE (FULL IMPLEMENTATION)
 * ============================================================================
 * 
 * Complete Goals & Milestone Tracker with:
 * - Goal creation with milestones
 * - Progress tracking and visualization
 * - Category filtering (Academic, Skills, Projects, Career)
 * - Deadline management
 * - Goal linking to tasks
 * - Achievement system integration
 * - Statistics and insights
 * - Visual progress indicators
 */

// ============================================================================
// GOALS STATE
// ============================================================================
const GoalsState = {
    goals: [],
    achievements: [],
    currentFilter: 'all',
    editingGoal: null,
    milestonesCount: 0
};

// ============================================================================
// GOALS INITIALIZATION
// ============================================================================
async function loadGoals() {
    // Debug removed

    // Load goals and achievements
    GoalsState.goals = await ProductivityData.DataStore.getGoals();
    GoalsState.achievements = await ProductivityData.DataStore.getAchievements();

    // Update stats
    updateGoalStats();

    // Render UI
    renderGoalsGrid(getFilteredGoals());
    renderAchievements(GoalsState.achievements);

    // Setup filters and event delegation
    setupGoalFilters();
    setupGoalEventDelegation();
}

function setupGoalEventDelegation() {
    const container = document.getElementById('goals-grid');
    if (!container || container.dataset.delegationSetup) return;

    container.dataset.delegationSetup = 'true';

    container.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) {
            // Check if clicking on goal card itself
            const card = e.target.closest('.goal-card');
            if (card && !e.target.closest('.goal-actions') && !e.target.closest('.milestone-dot') && !e.target.closest('.btn-ghost')) {
                viewGoalDetails(card.dataset.goalId);
            }
            return;
        }

        e.stopPropagation();
        const goalId = target.dataset.goalId;
        const milestoneId = target.dataset.milestoneId;

        switch (target.dataset.action) {
            case 'view-goal':
                viewGoalDetails(goalId);
                break;
            case 'edit-goal':
                editGoal(goalId);
                break;
            case 'duplicate-goal':
                duplicateGoal(goalId);
                break;
            case 'delete-goal':
                deleteGoal(goalId);
                break;
            case 'toggle-milestone':
                toggleMilestone(goalId, milestoneId);
                break;
            case 'add-milestone-quick':
                addMilestoneQuick(goalId);
                break;
            case 'open-goal-modal':
                openGoalModal();
                break;
        }
    });
}

function updateGoalStats() {
    const stats = {
        total: GoalsState.goals.length,
        active: GoalsState.goals.filter(g => g.status === 'active').length,
        completed: GoalsState.goals.filter(g => g.status === 'completed').length,
        totalMilestones: 0,
        completedMilestones: 0
    };

    GoalsState.goals.forEach(goal => {
        stats.totalMilestones += goal.milestones.length;
        stats.completedMilestones += goal.milestones.filter(m => m.isCompleted).length;
    });

    // Update UI elements
    document.getElementById('goals-total')?.setAttribute('data-value', stats.total);
    document.getElementById('goals-active')?.setAttribute('data-value', stats.active);
    document.getElementById('goals-completed')?.setAttribute('data-value', stats.completed);

    const milestoneProgress = stats.totalMilestones > 0
        ? Math.round((stats.completedMilestones / stats.totalMilestones) * 100)
        : 0;

    const progressBar = document.getElementById('overall-goal-progress');
    if (progressBar) {
        progressBar.style.width = `${milestoneProgress}%`;
        progressBar.setAttribute('data-percent', `${milestoneProgress}%`);
    }
}

function getFilteredGoals() {
    if (GoalsState.currentFilter === 'all') {
        return GoalsState.goals;
    }
    return GoalsState.goals.filter(g => g.category === GoalsState.currentFilter);
}

function setupGoalFilters() {
    document.querySelectorAll('.goal-categories .category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.goal-categories .category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            GoalsState.currentFilter = btn.dataset.category;
            renderGoalsGrid(getFilteredGoals());
        });
    });
}

// ============================================================================
// GOALS RENDERING
// ============================================================================
function renderGoalsGrid(goals) {
    const container = document.getElementById('goals-grid');
    if (!container) return;

    if (goals.length === 0) {
        const isFiltered = GoalsState.currentFilter !== 'all';
        container.innerHTML = `
            <div class="empty-state goals-empty" style="grid-column: span 3;">
                <div class="empty-icon">
                    <i class="fas ${isFiltered ? 'fa-filter' : 'fa-bullseye'}"></i>
                </div>
                <h3>${isFiltered ? 'No Goals in This Category' : 'Set Your First Goal'}</h3>
                <p>${isFiltered ? 'Try a different filter or create a new goal.' : 'Goals help you stay focused on what matters most.'}</p>
                <button class="btn-primary" data-action="open-goal-modal">
                    <i class="fas fa-plus"></i> Create Goal
                </button>
            </div>
        `;
        return;
    }

    // Sort: active first, then by target date
    goals.sort((a, b) => {
        if (a.status !== b.status) {
            return a.status === 'active' ? -1 : 1;
        }
        if (a.targetDate && b.targetDate) {
            return new Date(a.targetDate) - new Date(b.targetDate);
        }
        return 0;
    });

    container.innerHTML = goals.map(goal => renderGoalCard(goal)).join('');
}

function renderGoalCard(goal) {
    const progress = goal.calculateProgress();
    const daysLeft = goal.daysRemaining;
    const isCompleted = goal.status === 'completed';
    const isOverdue = daysLeft !== null && daysLeft < 0 && !isCompleted;
    const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft < 7 && !isCompleted;

    const categoryColors = {
        academic: '#6366f1',
        skill: '#10b981',
        project: '#f59e0b',
        career: '#8b5cf6'
    };

    const categoryIcons = {
        academic: 'fa-graduation-cap',
        skill: 'fa-tools',
        project: 'fa-project-diagram',
        career: 'fa-briefcase'
    };

    const color = categoryColors[goal.category] || '#6366f1';
    const icon = categoryIcons[goal.category] || 'fa-bullseye';

    return `
        <div class="goal-card ${isCompleted ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}" 
             data-goal-id="${goal.id}"
             style="--goal-color: ${color}">
            
            <div class="goal-header">
                <div class="goal-category-badge" style="background: ${color}20; color: ${color}">
                    <i class="fas ${icon}"></i>
                    ${capitalizeFirst(goal.category)}
                </div>
                <div class="goal-actions">
                    <button class="btn-icon small" data-action="edit-goal" data-goal-id="${goal.id}" title="Edit Goal">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon small" data-action="duplicate-goal" data-goal-id="${goal.id}" title="Duplicate">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="btn-icon small danger" data-action="delete-goal" data-goal-id="${goal.id}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            
            <h3 class="goal-title">
                ${isCompleted ? '<i class="fas fa-check-circle" style="color: #10b981"></i> ' : ''}
                ${escapeHtml(goal.title)}
            </h3>
            
            ${goal.description ? `<p class="goal-description">${escapeHtml(truncateText(goal.description, 100))}</p>` : ''}
            
            <!-- Progress Ring -->
            <div class="goal-progress-ring">
                <svg viewBox="0 0 100 100">
                    <circle class="progress-bg" cx="50" cy="50" r="40" stroke-width="8" fill="none"/>
                    <circle class="progress-fill" cx="50" cy="50" r="40" stroke-width="8" fill="none"
                            stroke="${color}"
                            stroke-dasharray="${2 * Math.PI * 40}"
                            stroke-dashoffset="${2 * Math.PI * 40 * (1 - progress / 100)}"
                            transform="rotate(-90 50 50)"/>
                </svg>
                <div class="progress-text">
                    <span class="progress-value">${progress}</span>
                    <span class="progress-percent">%</span>
                </div>
            </div>
            
            <!-- Milestones Preview -->
            ${goal.milestones.length > 0 ? `
                <div class="goal-milestones-preview">
                    <div class="milestones-header">
                        <span><i class="fas fa-flag"></i> Milestones</span>
                        <span class="milestones-count">${goal.milestones.filter(m => m.isCompleted).length}/${goal.milestones.length}</span>
                    </div>
                    <div class="milestones-dots">
                        ${goal.milestones.slice(0, 8).map(m => `
                            <span class="milestone-dot ${m.isCompleted ? 'completed' : ''}" 
                                  title="${escapeHtml(m.title)}"
                                  data-action="toggle-milestone" data-goal-id="${goal.id}" data-milestone-id="${m.id}">
                            </span>
                        `).join('')}
                        ${goal.milestones.length > 8 ? `<span class="more-dots">+${goal.milestones.length - 8}</span>` : ''}
                    </div>
                </div>
            ` : `
                <div class="goal-no-milestones">
                    <button class="btn-ghost small" data-action="add-milestone-quick" data-goal-id="${goal.id}">
                        <i class="fas fa-plus"></i> Add Milestones
                    </button>
                </div>
            `}
            
            <!-- Goal Footer -->
            <div class="goal-footer">
                ${goal.targetDate ? `
                    <div class="goal-deadline ${isOverdue ? 'overdue' : ''} ${isUrgent ? 'urgent' : ''}">
                        <i class="fas ${isOverdue ? 'fa-exclamation-triangle' : 'fa-calendar'}"></i>
                        <span>
                            ${isOverdue ? `${Math.abs(daysLeft)} days overdue` :
                daysLeft === 0 ? 'Due today!' :
                    daysLeft === 1 ? 'Due tomorrow' :
                        daysLeft !== null ? `${daysLeft} days left` :
                            formatGoalDate(goal.targetDate)}
                        </span>
                    </div>
                ` : ''}
                
                ${goal.linkedTaskIds?.length > 0 ? `
                    <div class="goal-linked-tasks">
                        <i class="fas fa-link"></i>
                        <span>${goal.linkedTaskIds.length} tasks</span>
                    </div>
                ` : ''}
            </div>
            
            ${isCompleted ? `
                <div class="goal-completed-badge">
                    <i class="fas fa-trophy"></i> Goal Achieved!
                </div>
            ` : ''}
        </div>
    `;
}

// ============================================================================
// GOAL DETAILS VIEW
// ============================================================================
async function viewGoalDetails(goalId) {
    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    const progress = goal.calculateProgress();
    const daysLeft = goal.daysRemaining;

    const modal = document.getElementById('goal-details-modal') || createGoalDetailsModal();

    modal.innerHTML = `
        <div class="modal-backdrop" data-action="close-goal-details"></div>
        <div class="modal-content large goal-details-content">
            <div class="modal-header">
                <div class="goal-detail-header">
                    <span class="goal-category-badge ${goal.category}">
                        <i class="fas ${getCategoryIcon(goal.category)}"></i>
                        ${capitalizeFirst(goal.category)}
                    </span>
                    <h2>${escapeHtml(goal.title)}</h2>
                </div>
                <button class="btn-icon" data-action="close-goal-details">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="modal-body goal-details-body">
                <!-- Progress Section -->
                <div class="goal-detail-section progress-section">
                    <div class="large-progress-ring">
                        <svg viewBox="0 0 200 200">
                            <circle class="progress-bg" cx="100" cy="100" r="85" stroke-width="15" fill="none"/>
                            <circle class="progress-fill" cx="100" cy="100" r="85" stroke-width="15" fill="none"
                                    stroke-dasharray="${2 * Math.PI * 85}"
                                    stroke-dashoffset="${2 * Math.PI * 85 * (1 - progress / 100)}"
                                    transform="rotate(-90 100 100)"/>
                        </svg>
                        <div class="progress-center">
                            <span class="progress-value">${progress}%</span>
                            <span class="progress-label">Complete</span>
                        </div>
                    </div>
                    
                    <div class="goal-stats">
                        ${goal.targetDate ? `
                            <div class="stat-item">
                                <i class="fas fa-calendar"></i>
                                <div>
                                    <span class="stat-value">${daysLeft !== null ? (daysLeft >= 0 ? daysLeft : 0) : '--'}</span>
                                    <span class="stat-label">Days Left</span>
                                </div>
                            </div>
                        ` : ''}
                        <div class="stat-item">
                            <i class="fas fa-flag"></i>
                            <div>
                                <span class="stat-value">${goal.milestones.filter(m => m.isCompleted).length}/${goal.milestones.length}</span>
                                <span class="stat-label">Milestones</span>
                            </div>
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-tasks"></i>
                            <div>
                                <span class="stat-value">${goal.linkedTaskIds?.length || 0}</span>
                                <span class="stat-label">Tasks</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Description -->
                ${goal.description ? `
                    <div class="goal-detail-section">
                        <h4><i class="fas fa-align-left"></i> Description</h4>
                        <p class="goal-full-description">${escapeHtml(goal.description)}</p>
                    </div>
                ` : ''}
                
                <!-- Milestones Section -->
                <div class="goal-detail-section milestones-section">
                    <div class="section-header">
                        <h4><i class="fas fa-flag"></i> Milestones</h4>
                        <button class="btn-secondary small" data-action="add-milestone" data-goal-id="${goal.id}">
                            <i class="fas fa-plus"></i> Add
                        </button>
                    </div>
                    
                    ${goal.milestones.length > 0 ? `
                        <ul class="milestones-detail-list">
                            ${goal.milestones.map((m, index) => `
                                <li class="milestone-detail-item ${m.isCompleted ? 'completed' : ''}" draggable="true">
                                    <div class="milestone-drag-handle">
                                        <i class="fas fa-grip-vertical"></i>
                                    </div>
                                    <div class="milestone-checkbox ${m.isCompleted ? 'checked' : ''}"
                                         data-action="toggle-milestone" data-goal-id="${goal.id}" data-milestone-id="${m.id}">
                                        ${m.isCompleted ? '<i class="fas fa-check"></i>' : index + 1}
                                    </div>
                                    <div class="milestone-content">
                                        <span class="milestone-title ${m.isCompleted ? 'strikethrough' : ''}">${escapeHtml(m.title)}</span>
                                        ${m.description ? `<span class="milestone-desc">${escapeHtml(m.description)}</span>` : ''}
                                        ${m.targetDate ? `<span class="milestone-date"><i class="fas fa-calendar"></i> ${formatGoalDate(m.targetDate)}</span>` : ''}
                                        ${m.completedAt ? `<span class="milestone-completed-date">Completed ${formatRelativeDate(m.completedAt)}</span>` : ''}
                                    </div>
                                    <div class="milestone-actions">
                                        <button class="btn-icon small" data-action="edit-milestone" data-goal-id="${goal.id}" data-milestone-id="${m.id}" title="Edit">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn-icon small danger" data-action="delete-milestone" data-goal-id="${goal.id}" data-milestone-id="${m.id}" title="Delete">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </li>
                            `).join('')}
                        </ul>
                    ` : `
                        <div class="empty-milestones">
                            <i class="fas fa-flag"></i>
                            <p>No milestones yet</p>
                            <p class="sub">Break down your goal into smaller steps</p>
                        </div>
                    `}
                </div>
                
                <!-- Reflection Notes -->
                <div class="goal-detail-section">
                    <h4><i class="fas fa-pencil-alt"></i> Notes & Reflections</h4>
                    <textarea class="goal-reflection" id="goal-reflection-${goal.id}" 
                              placeholder="Add notes about your progress, challenges, or insights...">${escapeHtml(goal.reflection || '')}</textarea>
                </div>
            </div>
            
            <div class="modal-footer">
                <button class="btn-secondary" data-action="close-goal-details">Close</button>
                ${goal.status !== 'completed' ? `
                    <button class="btn-primary" data-action="mark-complete" data-goal-id="${goal.id}">
                        <i class="fas fa-check"></i> Mark Complete
                    </button>
                ` : `
                    <button class="btn-secondary" data-action="reopen-goal" data-goal-id="${goal.id}">
                        <i class="fas fa-redo"></i> Reopen Goal
                    </button>
                `}
            </div>
        </div>
    `;

    modal.classList.add('active');

    // Setup event listeners
    setupGoalDetailsListeners(modal, goal);
}

function setupGoalDetailsListeners(modal, goal) {
    modal.querySelectorAll('[data-action="close-goal-details"]').forEach(el => {
        el.addEventListener('click', closeGoalDetails);
    });

    modal.querySelector('[data-action="add-milestone"]')?.addEventListener('click', () => {
        addMilestone(goal.id);
    });

    modal.querySelectorAll('[data-action="toggle-milestone"]').forEach(el => {
        el.addEventListener('click', () => {
            toggleMilestone(el.dataset.goalId, el.dataset.milestoneId);
        });
    });

    modal.querySelectorAll('[data-action="edit-milestone"]').forEach(el => {
        el.addEventListener('click', () => {
            editMilestone(el.dataset.goalId, el.dataset.milestoneId);
        });
    });

    modal.querySelectorAll('[data-action="delete-milestone"]').forEach(el => {
        el.addEventListener('click', () => {
            deleteMilestone(el.dataset.goalId, el.dataset.milestoneId);
        });
    });

    modal.querySelector('[data-action="mark-complete"]')?.addEventListener('click', (e) => {
        markGoalComplete(e.target.closest('[data-goal-id]').dataset.goalId);
    });

    modal.querySelector('[data-action="reopen-goal"]')?.addEventListener('click', (e) => {
        reopenGoal(e.target.closest('[data-goal-id]').dataset.goalId);
    });

    // Save reflection on blur
    const reflectionTextarea = modal.querySelector('.goal-reflection');
    if (reflectionTextarea) {
        reflectionTextarea.addEventListener('blur', () => {
            saveGoalReflection(goal.id);
        });
    }
}

function createGoalDetailsModal() {
    const modal = document.createElement('div');
    modal.id = 'goal-details-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
    return modal;
}

function closeGoalDetails() {
    const modal = document.getElementById('goal-details-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// ============================================================================
// GOAL MODAL - CREATE/EDIT
// ============================================================================
function openGoalModal(goal = null) {
    GoalsState.editingGoal = goal;
    GoalsState.milestonesCount = goal?.milestones?.length || 0;

    let modal = document.getElementById('goal-modal');
    if (!modal) {
        modal = createGoalModal();
    } else {
        // Re-setup listeners when modal already exists
        setupGoalModalListeners(modal);
    }

    const titleEl = document.getElementById('goal-modal-title');

    // Set title
    if (titleEl) {
        titleEl.textContent = goal ? 'Edit Goal' : 'Create New Goal';
    }

    // Populate form - try both possible ID formats
    const titleInput = document.getElementById('goal-title-input');
    const descInput = document.getElementById('goal-description-input');
    const categoryInput = document.getElementById('goal-category-input');
    const priorityInput = document.getElementById('goal-priority-input');
    const dateInput = document.getElementById('goal-target-date-input');

    if (titleInput) titleInput.value = goal?.title || '';
    if (descInput) descInput.value = goal?.description || '';
    if (categoryInput) categoryInput.value = goal?.category || 'academic';
    if (priorityInput) priorityInput.value = goal?.priority || 'medium';
    if (dateInput) dateInput.value = goal?.targetDate || '';

    // Populate commitment fields (Why & Stakes)
    const whyInput = document.getElementById('goal-why-input');
    const consequencesInput = document.getElementById('goal-consequences-input');
    const stakesEnabled = document.getElementById('goal-stakes-enabled');
    const stakesAmount = document.getElementById('goal-stakes-amount');
    const stakesDescription = document.getElementById('goal-stakes-description');
    const stakesOptions = document.getElementById('stakes-options');
    const whyCharCount = document.getElementById('why-char-count');
    const stakesPreview = document.getElementById('stakes-preview-amount');

    if (whyInput) {
        whyInput.value = goal?.why || '';
        if (whyCharCount) {
            const count = (goal?.why || '').trim().length;
            whyCharCount.textContent = count;
            whyCharCount.classList.toggle('valid', count >= 50);
        }
    }
    if (consequencesInput) consequencesInput.value = goal?.consequences || '';

    if (stakesEnabled) {
        stakesEnabled.checked = goal?.stakes?.enabled || false;
        if (stakesOptions) {
            stakesOptions.classList.toggle('hidden', !stakesEnabled.checked);
        }
    }
    if (stakesAmount) {
        stakesAmount.value = goal?.stakes?.xpAtStake || 100;
        if (stakesPreview) stakesPreview.textContent = stakesAmount.value;
    }
    if (stakesDescription) stakesDescription.value = goal?.stakes?.description || '';

    // Populate vision image
    const visionPreview = document.getElementById('vision-image-preview');
    const removeVisionBtn = document.getElementById('remove-vision-image');
    if (goal?.visionImageUrl && visionPreview) {
        visionPreview.innerHTML = `<img src="${goal.visionImageUrl}" alt="Vision Image">`;
        visionPreview.classList.add('has-image');
        visionPreview.dataset.imageData = goal.visionImageUrl;
        if (removeVisionBtn) removeVisionBtn.classList.remove('hidden');
    } else if (visionPreview) {
        visionPreview.innerHTML = `
            <i class="fas fa-image"></i>
            <span>Click or drag image to upload</span>
        `;
        visionPreview.classList.remove('has-image');
        delete visionPreview.dataset.imageData;
        if (removeVisionBtn) removeVisionBtn.classList.add('hidden');
    }

    // Render milestones
    renderMilestoneInputs(goal?.milestones || []);

    // Update delete button
    updateGoalDeleteButton();

    // Store goal ID for editing
    modal.dataset.goalId = goal?.id || '';

    modal.classList.add('active');
    if (titleInput) titleInput.focus();
}

function createGoalModal() {
    const modal = document.createElement('div');
    modal.id = 'goal-modal';
    modal.className = 'modal';

    modal.innerHTML = `
        <div class="modal-backdrop" data-action="close-goal-modal"></div>
        <div class="modal-content large">
            <div class="modal-header">
                <h2 id="goal-modal-title">Create New Goal</h2>
                <button class="btn-icon" data-action="close-goal-modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <form id="goal-form">
                <div class="modal-body">
                    <div class="form-row">
                        <div class="form-group full">
                            <label for="goal-title-input">Goal Title *</label>
                            <input type="text" id="goal-title-input" required 
                                   placeholder="e.g., Master Calculus, Build Portfolio Website">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group full">
                            <label for="goal-description-input">Description</label>
                            <textarea id="goal-description-input" rows="3" 
                                      placeholder="What does achieving this goal mean to you?"></textarea>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="goal-category-input">Category</label>
                            <select id="goal-category-input">
                                <option value="academic">📚 Academic</option>
                                <option value="skill">🛠️ Skill Development</option>
                                <option value="project">📊 Project</option>
                                <option value="career">💼 Career</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="goal-priority-input">Priority</label>
                            <select id="goal-priority-input">
                                <option value="low">Low</option>
                                <option value="medium" selected>Medium</option>
                                <option value="high">High</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="goal-target-date-input">Target Date</label>
                            <input type="date" id="goal-target-date-input">
                        </div>
                    </div>
                    
                    <div class="milestones-section">
                        <div class="section-header">
                            <h4><i class="fas fa-flag"></i> Milestones</h4>
                            <span class="helper-text">Break your goal into achievable steps</span>
                        </div>
                        <div id="milestones-container" class="milestones-input-container">
                            <!-- Milestone inputs added dynamically -->
                        </div>
                        <button type="button" class="btn-ghost" data-action="add-milestone-input">
                            <i class="fas fa-plus"></i> Add Milestone
                        </button>
                    </div>

                    <!-- Commitment: Why Section -->
                    <div class="commitment-section why-section">
                        <div class="section-header collapsible" data-action="toggle-why-section">
                            <h4><i class="fas fa-heart"></i> Your "Why" <span class="optional-badge">Recommended</span></h4>
                            <i class="fas fa-chevron-down toggle-icon" id="why-toggle-icon"></i>
                        </div>
                        <div id="why-section-content" class="collapsible-content expanded">
                            <div class="form-group">
                                <label for="goal-why-input">Why is this goal important to you?</label>
                                <textarea id="goal-why-input" rows="3"
                                          placeholder="This goal matters to me because..."
                                          maxlength="500"></textarea>
                                <div class="char-counter">
                                    <span id="why-char-count">0</span>/50 minimum for staked goals
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="goal-consequences-input">What happens if you don't achieve this?</label>
                                <textarea id="goal-consequences-input" rows="2"
                                          placeholder="If I fail to complete this goal..."
                                          maxlength="300"></textarea>
                            </div>
                            <div class="form-group vision-image-group">
                                <label>Vision Image <span class="helper-text">(Visualize your success)</span></label>
                                <div class="vision-image-upload" id="vision-image-upload">
                                    <div class="vision-image-preview" id="vision-image-preview">
                                        <i class="fas fa-image"></i>
                                        <span>Click or drag image to upload</span>
                                    </div>
                                    <input type="file" id="goal-vision-image" accept="image/*" hidden>
                                    <button type="button" class="btn-ghost btn-remove-image hidden" id="remove-vision-image">
                                        <i class="fas fa-trash"></i> Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Commitment: Stakes Section -->
                    <div class="commitment-section stakes-section">
                        <div class="section-header">
                            <h4><i class="fas fa-fire-alt"></i> Commitment Stakes</h4>
                            <label class="toggle-switch small">
                                <input type="checkbox" id="goal-stakes-enabled">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div id="stakes-options" class="stakes-options hidden">
                            <div class="stakes-warning">
                                <i class="fas fa-exclamation-triangle"></i>
                                <span>You will lose XP if you abandon this goal or miss the deadline!</span>
                            </div>
                            <div class="form-group">
                                <label for="goal-stakes-amount">XP at Stake</label>
                                <div class="stakes-amount-input">
                                    <button type="button" class="btn-icon small" data-action="stake-decrease">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <input type="number" id="goal-stakes-amount" value="100" min="50" max="500" step="50">
                                    <button type="button" class="btn-icon small" data-action="stake-increase">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                                <div class="stakes-preview">
                                    Losing <strong id="stakes-preview-amount">100</strong> XP is at stake
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="goal-stakes-description">Personal Commitment (optional)</label>
                                <input type="text" id="goal-stakes-description"
                                       placeholder="e.g., I will donate $20 to charity if I fail"
                                       maxlength="150">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <div id="goal-delete-btn-container"></div>
                    <button type="button" class="btn-secondary" data-action="close-goal-modal">Cancel</button>
                    <button type="submit" class="btn-primary">
                        <i class="fas fa-save"></i> Save Goal
                    </button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    // Setup event listeners (CSP compliant)
    setupGoalModalListeners(modal);

    return modal;
}

function setupGoalModalListeners(modal) {
    modal.querySelectorAll('[data-action="close-goal-modal"]').forEach(el => {
        el.addEventListener('click', closeGoalModal);
    });

    modal.querySelector('[data-action="add-milestone-input"]')?.addEventListener('click', addMilestoneInput);

    document.getElementById('goal-form')?.addEventListener('submit', saveGoal);

    // Stakes toggle
    const stakesToggle = document.getElementById('goal-stakes-enabled');
    const stakesOptions = document.getElementById('stakes-options');
    if (stakesToggle && stakesOptions) {
        stakesToggle.addEventListener('change', () => {
            stakesOptions.classList.toggle('hidden', !stakesToggle.checked);
        });
    }

    // Stakes amount buttons
    modal.querySelector('[data-action="stake-decrease"]')?.addEventListener('click', () => adjustStakeAmount(-50));
    modal.querySelector('[data-action="stake-increase"]')?.addEventListener('click', () => adjustStakeAmount(50));

    // Stakes amount input sync
    const stakesAmountInput = document.getElementById('goal-stakes-amount');
    const stakesPreview = document.getElementById('stakes-preview-amount');
    if (stakesAmountInput && stakesPreview) {
        stakesAmountInput.addEventListener('input', () => {
            stakesPreview.textContent = stakesAmountInput.value || '0';
        });
    }

    // Why section collapsible
    modal.querySelector('[data-action="toggle-why-section"]')?.addEventListener('click', () => {
        const content = document.getElementById('why-section-content');
        const icon = document.getElementById('why-toggle-icon');
        if (content && icon) {
            content.classList.toggle('expanded');
            icon.classList.toggle('rotated');
        }
    });

    // Why character counter
    const whyInput = document.getElementById('goal-why-input');
    const whyCharCount = document.getElementById('why-char-count');
    if (whyInput && whyCharCount) {
        whyInput.addEventListener('input', () => {
            const count = whyInput.value.trim().length;
            whyCharCount.textContent = count;
            whyCharCount.classList.toggle('valid', count >= 50);
        });
    }

    // Vision image upload
    const visionUpload = document.getElementById('vision-image-upload');
    const visionInput = document.getElementById('goal-vision-image');
    const visionPreview = document.getElementById('vision-image-preview');
    const removeVisionBtn = document.getElementById('remove-vision-image');

    if (visionUpload && visionInput && visionPreview) {
        // Click to upload
        visionPreview.addEventListener('click', () => visionInput.click());

        // Drag and drop
        visionUpload.addEventListener('dragover', (e) => {
            e.preventDefault();
            visionUpload.classList.add('dragover');
        });
        visionUpload.addEventListener('dragleave', () => {
            visionUpload.classList.remove('dragover');
        });
        visionUpload.addEventListener('drop', (e) => {
            e.preventDefault();
            visionUpload.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handleVisionImageUpload(file);
            }
        });

        // File input change
        visionInput.addEventListener('change', () => {
            if (visionInput.files[0]) {
                handleVisionImageUpload(visionInput.files[0]);
            }
        });

        // Remove image
        if (removeVisionBtn) {
            removeVisionBtn.addEventListener('click', () => {
                clearVisionImage();
            });
        }
    }
}

function adjustStakeAmount(delta) {
    const input = document.getElementById('goal-stakes-amount');
    const preview = document.getElementById('stakes-preview-amount');
    if (!input) return;

    let value = parseInt(input.value) || 100;
    value = Math.max(50, Math.min(500, value + delta));
    input.value = value;
    if (preview) preview.textContent = value;
}

function handleVisionImageUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('vision-image-preview');
        const removeBtn = document.getElementById('remove-vision-image');
        if (preview) {
            preview.innerHTML = `<img src="${e.target.result}" alt="Vision Image">`;
            preview.classList.add('has-image');
            preview.dataset.imageData = e.target.result;
        }
        if (removeBtn) {
            removeBtn.classList.remove('hidden');
        }
    };
    reader.readAsDataURL(file);
}

function clearVisionImage() {
    const preview = document.getElementById('vision-image-preview');
    const removeBtn = document.getElementById('remove-vision-image');
    const input = document.getElementById('goal-vision-image');

    if (preview) {
        preview.innerHTML = `
            <i class="fas fa-image"></i>
            <span>Click or drag image to upload</span>
        `;
        preview.classList.remove('has-image');
        delete preview.dataset.imageData;
    }
    if (removeBtn) {
        removeBtn.classList.add('hidden');
    }
    if (input) {
        input.value = '';
    }
}

function updateGoalDeleteButton() {
    const container = document.getElementById('goal-delete-btn-container');
    if (!container) return;

    if (GoalsState.editingGoal) {
        container.innerHTML = `
            <button type="button" class="btn-danger" data-action="delete-goal" data-goal-id="${GoalsState.editingGoal.id}">
                <i class="fas fa-trash"></i> Delete
            </button>
        `;
        container.querySelector('[data-action="delete-goal"]')?.addEventListener('click', (e) => {
            deleteGoal(e.currentTarget.dataset.goalId);
        });
    } else {
        container.innerHTML = '';
    }
}

function renderMilestoneInputs(milestones) {
    // Try both possible container IDs
    const container = document.getElementById('milestones-container') || document.getElementById('milestones-list');
    if (!container) return;

    container.innerHTML = '';

    if (milestones.length === 0) {
        // Add 3 empty milestone inputs by default for new goals
        for (let i = 1; i <= 3; i++) {
            container.appendChild(createMilestoneInputElement(i));
        }
    } else {
        milestones.forEach((m, i) => {
            container.appendChild(createMilestoneInputElement(i + 1, m));
        });
    }

    GoalsState.milestonesCount = Math.max(milestones.length, 3);
}

function createMilestoneInputElement(index, milestone = null) {
    const row = document.createElement('div');
    row.className = 'milestone-input-row';
    row.dataset.index = index;
    row.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';

    const numSpan = document.createElement('span');
    numSpan.className = 'milestone-number';
    numSpan.textContent = index;
    numSpan.style.cssText = 'min-width: 24px; color: var(--text-muted);';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'milestone-title-input';
    titleInput.value = milestone ? milestone.title : '';
    titleInput.placeholder = `Milestone ${index}`;
    titleInput.dataset.milestoneId = milestone?.id || '';
    titleInput.style.cssText = 'flex: 1; padding: 8px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'milestone-date-input';
    dateInput.value = milestone?.targetDate || '';
    dateInput.title = 'Target date for this milestone';
    dateInput.style.cssText = 'padding: 8px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-icon small danger';
    removeBtn.title = 'Remove';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.style.cssText = 'padding: 6px; background: var(--danger-light); color: var(--danger); border: none; border-radius: 6px; cursor: pointer;';
    removeBtn.addEventListener('click', () => {
        row.remove();
        renumberMilestones();
    });

    row.appendChild(numSpan);
    row.appendChild(titleInput);
    row.appendChild(dateInput);
    row.appendChild(removeBtn);

    return row;
}

function renumberMilestones() {
    const container = document.getElementById('milestones-container') || document.getElementById('milestones-list');
    if (!container) return;

    container.querySelectorAll('.milestone-input-row').forEach((row, i) => {
        const numSpan = row.querySelector('.milestone-number');
        if (numSpan) numSpan.textContent = i + 1;
        const input = row.querySelector('.milestone-title-input');
        if (input) input.placeholder = `Milestone ${i + 1}`;
    });
}

function addMilestoneInput() {
    const container = document.getElementById('milestones-container') || document.getElementById('milestones-list');
    if (!container) return;

    GoalsState.milestonesCount++;
    container.appendChild(createMilestoneInputElement(GoalsState.milestonesCount));

    // Focus the new input
    const inputs = container.querySelectorAll('.milestone-title-input');
    inputs[inputs.length - 1].focus();
}

// Keep removeMilestoneInput for backwards compatibility
function removeMilestoneInput(button) {
    const row = button.closest('.milestone-input-row');
    if (row) {
        row.remove();
        renumberMilestones();
    }
}

function closeGoalModal() {
    const modal = document.getElementById('goal-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    GoalsState.editingGoal = null;
}

// ============================================================================
// GOAL CRUD OPERATIONS
// ============================================================================
async function saveGoal(e) {
    e.preventDefault();

    const title = document.getElementById('goal-title-input').value.trim();
    const description = document.getElementById('goal-description-input').value.trim();
    const category = document.getElementById('goal-category-input').value;
    const priority = document.getElementById('goal-priority-input').value;
    const targetDate = document.getElementById('goal-target-date-input').value || null;

    if (!title) {
        showToast('error', 'Validation Error', 'Please enter a goal title');
        return;
    }

    // Gather milestones
    const milestoneInputs = document.querySelectorAll('.milestone-input-row');
    const milestones = [];

    milestoneInputs.forEach((row, index) => {
        const titleInput = row.querySelector('.milestone-title-input');
        const dateInput = row.querySelector('.milestone-date-input');
        const milestoneTitle = titleInput.value.trim();

        if (milestoneTitle) {
            const existingId = titleInput.dataset.milestoneId;
            milestones.push(new ProductivityData.Milestone({
                id: existingId || undefined,
                title: milestoneTitle,
                targetDate: dateInput.value || null,
                order: index,
                isCompleted: GoalsState.editingGoal?.milestones?.find(m => m.id === existingId)?.isCompleted || false
            }));
        }
    });

    // Collect commitment fields (Why & Stakes)
    const why = document.getElementById('goal-why-input')?.value.trim() || '';
    const consequences = document.getElementById('goal-consequences-input')?.value.trim() || '';
    const stakesEnabled = document.getElementById('goal-stakes-enabled')?.checked || false;
    const stakesAmount = parseInt(document.getElementById('goal-stakes-amount')?.value) || 100;
    const stakesDescription = document.getElementById('goal-stakes-description')?.value.trim() || '';
    const visionImagePreview = document.getElementById('vision-image-preview');
    const visionImageUrl = visionImagePreview?.dataset.imageData || GoalsState.editingGoal?.visionImageUrl || null;

    // Validation: If stakes enabled, require "why" with min 50 chars
    if (stakesEnabled && why.length < 50) {
        showToast('warning', 'Commitment Required',
            'Please write at least 50 characters explaining why this goal matters to you when stakes are enabled.');
        document.getElementById('goal-why-input')?.focus();
        return;
    }

    // Create or update goal
    const goalData = {
        id: GoalsState.editingGoal?.id,
        title,
        description,
        category,
        priority,
        targetDate,
        milestones,
        status: GoalsState.editingGoal?.status || 'active',
        progress: GoalsState.editingGoal?.progress || 0,
        linkedTaskIds: GoalsState.editingGoal?.linkedTaskIds || [],
        reflection: GoalsState.editingGoal?.reflection || '',
        // Commitment fields
        why,
        consequences,
        visionImageUrl,
        stakes: {
            enabled: stakesEnabled,
            xpAtStake: stakesEnabled ? stakesAmount : 0,
            description: stakesDescription
        },
        hoursInvested: GoalsState.editingGoal?.hoursInvested || 0,
        abandonmentRequest: GoalsState.editingGoal?.abandonmentRequest || null
    };

    const goal = new ProductivityData.Goal(goalData);
    const isNewGoal = !GoalsState.editingGoal;

    try {
        await ProductivityData.DataStore.saveGoal(goal);

        // Update commitment stats for new goals
        if (isNewGoal) {
            await ProductivityData.DataStore.incrementGoalStat('totalGoalsCreated');
        }

        closeGoalModal();
        await loadGoals();

        showToast('success',
            GoalsState.editingGoal ? 'Goal Updated' : 'Goal Created',
            `"${title}" has been saved.`);

        // Check for achievements
        if (!GoalsState.editingGoal) {
            await checkGoalAchievements();
        }
    } catch (error) {
        console.error('Failed to save goal:', error);
        showToast('error', 'Save Failed', 'Could not save the goal. Please try again.');
    }
}

async function deleteGoal(goalId) {
    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    // Check if goal has stakes or significant progress
    const hasStakes = goal.stakes?.enabled && goal.stakes?.xpAtStake > 0;
    const hasProgress = goal.progress > 0 || goal.milestones.some(m => m.isCompleted);

    if (hasStakes || hasProgress) {
        // Show abandonment modal instead of simple delete
        openAbandonmentModal(goal);
        return;
    }

    // Simple delete for empty goals without stakes
    const ok = await confirmDialog('Are you sure you want to delete this goal? This action cannot be undone.', {
        title: 'Delete Goal',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!ok) return;

    try {
        await ProductivityData.DataStore.deleteGoal(goalId);

        closeGoalModal();
        closeGoalDetails();
        await loadGoals();

        showToast('info', 'Goal Deleted', 'The goal has been removed.');
    } catch (error) {
        console.error('Failed to delete goal:', error);
        showToast('error', 'Delete Failed', 'Could not delete the goal.');
    }
}

// ============================================================================
// ABANDONMENT FRICTION SYSTEM
// ============================================================================

function openAbandonmentModal(goal) {
    const invested = goal.getInvestedTime ? goal.getInvestedTime() : {
        hours: goal.hoursInvested || 0,
        milestonesCompleted: goal.milestones.filter(m => m.isCompleted).length,
        totalMilestones: goal.milestones.length
    };

    // Check for existing cooldown
    if (goal.abandonmentRequest?.cooldownEndsAt) {
        const cooldownEnd = new Date(goal.abandonmentRequest.cooldownEndsAt);
        if (cooldownEnd > new Date()) {
            const hoursLeft = Math.ceil((cooldownEnd - new Date()) / (1000 * 60 * 60));
            showToast('warning', 'Cooling Off Period',
                `You requested to abandon this goal. Please wait ${hoursLeft} more hours before confirming.`);
            showAbandonmentCooldownModal(goal, hoursLeft);
            return;
        }
    }

    // Create abandonment modal
    let modal = document.getElementById('abandonment-modal');
    if (!modal) {
        modal = createAbandonmentModal();
    }

    // Populate modal
    document.getElementById('abandonment-goal-title').textContent = goal.title;
    document.getElementById('abandonment-hours-invested').textContent = invested.hours.toFixed(1);
    document.getElementById('abandonment-milestones-completed').textContent =
        `${invested.milestonesCompleted}/${invested.totalMilestones}`;
    document.getElementById('abandonment-progress').textContent = `${goal.progress}%`;

    const stakesWarning = document.getElementById('abandonment-stakes-warning');
    if (goal.stakes?.enabled && goal.stakes?.xpAtStake > 0) {
        stakesWarning.innerHTML = `
            <div class="stakes-loss-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <span>You will lose <strong>${goal.stakes.xpAtStake} XP</strong> by abandoning this goal!</span>
            </div>
        `;
        stakesWarning.hidden = false;
    } else {
        stakesWarning.hidden = true;
    }

    // Reset form
    document.getElementById('abandonment-reason').value = '';
    document.getElementById('abandonment-char-count').textContent = '0';
    document.getElementById('abandonment-char-count').classList.remove('valid');
    document.getElementById('confirm-abandonment-btn').disabled = true;

    modal.dataset.goalId = goal.id;
    modal.classList.add('active');
}

function createAbandonmentModal() {
    const modal = document.createElement('div');
    modal.id = 'abandonment-modal';
    modal.className = 'modal';

    modal.innerHTML = `
        <div class="modal-backdrop" data-action="close-abandonment"></div>
        <div class="modal-content medium abandonment-content">
            <div class="modal-header abandonment-header">
                <h2><i class="fas fa-flag-checkered"></i> Abandoning Goal</h2>
                <button class="btn-icon" data-action="close-abandonment">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="abandonment-summary">
                    <h3 id="abandonment-goal-title"></h3>
                    <div class="sunk-cost-display">
                        <div class="sunk-cost-item">
                            <span class="sunk-cost-value" id="abandonment-hours-invested">0</span>
                            <span class="sunk-cost-label">Hours Invested</span>
                        </div>
                        <div class="sunk-cost-item">
                            <span class="sunk-cost-value" id="abandonment-milestones-completed">0/0</span>
                            <span class="sunk-cost-label">Milestones Done</span>
                        </div>
                        <div class="sunk-cost-item">
                            <span class="sunk-cost-value" id="abandonment-progress">0%</span>
                            <span class="sunk-cost-label">Progress</span>
                        </div>
                    </div>
                </div>

                <div id="abandonment-stakes-warning" hidden></div>

                <div class="abandonment-reflection">
                    <label for="abandonment-reason">
                        <i class="fas fa-pencil-alt"></i>
                        Why are you abandoning this goal? <span class="required">*</span>
                    </label>
                    <textarea id="abandonment-reason" rows="4"
                              placeholder="Please explain why you're abandoning this goal. This helps you reflect and learn from the experience..."
                              minlength="50" required></textarea>
                    <div class="char-counter">
                        <span id="abandonment-char-count">0</span>/50 minimum characters
                    </div>
                </div>

                <div class="abandonment-notice">
                    <i class="fas fa-info-circle"></i>
                    <p>After submitting, there will be a <strong>48-hour cooling off period</strong>
                    before the goal is permanently removed. You can cancel the abandonment during this time.</p>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" data-action="close-abandonment">Keep Goal</button>
                <button class="btn-danger" id="confirm-abandonment-btn" disabled>
                    <i class="fas fa-times-circle"></i> Request Abandonment
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    setupAbandonmentModalListeners(modal);
    return modal;
}

function setupAbandonmentModalListeners(modal) {
    // Close handlers
    modal.querySelectorAll('[data-action="close-abandonment"]').forEach(el => {
        el.addEventListener('click', () => modal.classList.remove('active'));
    });

    // Character counter
    const reasonInput = document.getElementById('abandonment-reason');
    const charCount = document.getElementById('abandonment-char-count');
    const confirmBtn = document.getElementById('confirm-abandonment-btn');

    reasonInput?.addEventListener('input', () => {
        const count = reasonInput.value.trim().length;
        charCount.textContent = count;
        confirmBtn.disabled = count < 50;

        if (count >= 50) {
            charCount.classList.add('valid');
        } else {
            charCount.classList.remove('valid');
        }
    });

    // Confirm abandonment
    confirmBtn?.addEventListener('click', async () => {
        const goalId = modal.dataset.goalId;
        const reason = reasonInput.value.trim();

        if (reason.length < 50) return;

        await requestGoalAbandonment(goalId, reason);
        modal.classList.remove('active');
    });
}

async function requestGoalAbandonment(goalId, reason) {
    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    const settings = await ProductivityData.DataStore.getSettings();
    const cooldownHours = settings.abandonmentCooldownHours || 48;

    const cooldownEnd = new Date();
    cooldownEnd.setHours(cooldownEnd.getHours() + cooldownHours);

    goal.abandonmentRequest = {
        requestedAt: new Date().toISOString(),
        reason: reason,
        cooldownEndsAt: cooldownEnd.toISOString()
    };

    await ProductivityData.DataStore.saveGoal(goal);
    closeGoalModal();
    closeGoalDetails();
    await loadGoals();

    showToast('info', 'Abandonment Requested',
        `Goal will be removed in ${cooldownHours} hours. You can cancel this during the cooling off period.`);
}

function showAbandonmentCooldownModal(goal, hoursLeft) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'abandonment-cooldown-modal';

    modal.innerHTML = `
        <div class="modal-backdrop" data-action="close-cooldown"></div>
        <div class="modal-content small abandonment-cooldown-content">
            <div class="modal-header">
                <h2><i class="fas fa-clock"></i> Cooling Off Period</h2>
                <button class="btn-icon" data-action="close-cooldown">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <p>You requested to abandon <strong>"${escapeHtml(goal.title)}"</strong>.</p>
                <p class="cooldown-time">
                    <i class="fas fa-hourglass-half"></i>
                    <strong>${hoursLeft} hours</strong> remaining
                </p>
                <p class="cooldown-reason">
                    <strong>Your reason:</strong> "${escapeHtml(goal.abandonmentRequest?.reason || '')}"
                </p>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" data-action="cancel-abandonment-cooldown" data-goal-id="${goal.id}">
                    <i class="fas fa-undo"></i> Keep Goal
                </button>
                <button class="btn-ghost" data-action="close-cooldown">
                    Wait for Cooldown
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-action="close-cooldown"]').forEach(el => {
        el.addEventListener('click', () => modal.remove());
    });

    modal.querySelector('[data-action="cancel-abandonment-cooldown"]')?.addEventListener('click', async (e) => {
        await cancelGoalAbandonment(e.currentTarget.dataset.goalId);
        modal.remove();
    });
}

async function cancelGoalAbandonment(goalId) {
    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    goal.abandonmentRequest = null;
    await ProductivityData.DataStore.saveGoal(goal);
    await loadGoals();

    showToast('success', 'Abandonment Cancelled', 'Great decision! Keep working towards your goal.');
}

async function confirmGoalAbandonment(goalId) {
    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    // Apply XP penalty if stakes were enabled
    if (goal.stakes?.enabled && goal.stakes?.xpAtStake > 0) {
        if (typeof window.MotivationSystem?.applyXPPenalty === 'function') {
            window.MotivationSystem.applyXPPenalty(goal.stakes.xpAtStake, `Abandoned goal: ${goal.title}`);
        }
    }

    // Update commitment stats
    const stats = await ProductivityData.DataStore.getCommitmentStats();
    stats.totalGoalsAbandoned++;
    if (goal.stakes?.xpAtStake > 0) {
        stats.totalXPLostToStakes += goal.stakes.xpAtStake;
    }
    await ProductivityData.DataStore.saveCommitmentStats(stats);

    // Delete the goal
    await ProductivityData.DataStore.deleteGoal(goalId);
    closeGoalModal();
    closeGoalDetails();
    await loadGoals();

    showToast('info', 'Goal Abandoned', 'The goal has been removed from your list.');
}

// Check for expired abandonment cooldowns on load
async function checkExpiredAbandonments() {
    const goals = await ProductivityData.DataStore.getGoals();
    const now = new Date();

    for (const goal of goals) {
        if (goal.abandonmentRequest?.cooldownEndsAt) {
            const cooldownEnd = new Date(goal.abandonmentRequest.cooldownEndsAt);
            if (cooldownEnd <= now) {
                // Cooldown expired, complete the abandonment
                await confirmGoalAbandonment(goal.id);
            }
        }
    }
}

async function editGoal(goalId) {
    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (goal) {
        closeGoalDetails();
        openGoalModal(goal);
    }
}

async function duplicateGoal(goalId) {
    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    const duplicate = new ProductivityData.Goal({
        ...goal,
        id: undefined,
        title: `${goal.title} (Copy)`,
        status: 'active',
        progress: 0,
        createdAt: new Date().toISOString(),
        completedAt: null,
        milestones: goal.milestones.map(m => ({
            ...m,
            id: undefined,
            isCompleted: false,
            completedAt: null
        }))
    });

    await ProductivityData.DataStore.saveGoal(duplicate);
    await loadGoals();

    showToast('success', 'Goal Duplicated', `Created a copy of "${goal.title}"`);
}

async function markGoalComplete(goalId) {
    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    goal.status = 'completed';
    goal.completedAt = new Date().toISOString();
    goal.progress = 100;

    // Mark all milestones complete
    goal.milestones.forEach(m => {
        if (!m.isCompleted) {
            m.isCompleted = true;
            m.completedAt = new Date().toISOString();
        }
    });

    await ProductivityData.DataStore.saveGoal(goal);

    closeGoalDetails();
    await loadGoals();

    showToast('success', '🎉 Goal Achieved!', `Congratulations on completing "${goal.title}"!`);

    // Check achievements
    await checkGoalAchievements();
}

async function reopenGoal(goalId) {
    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    goal.status = 'active';
    goal.completedAt = null;
    goal.progress = goal.calculateProgress();

    await ProductivityData.DataStore.saveGoal(goal);

    closeGoalDetails();
    await loadGoals();

    showToast('info', 'Goal Reopened', `"${goal.title}" is now active again.`);
}

// ============================================================================
// MILESTONE OPERATIONS
// ============================================================================
async function toggleMilestone(goalId, milestoneId) {
    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    const milestone = goal.milestones.find(m => m.id === milestoneId);
    if (!milestone) return;

    milestone.isCompleted = !milestone.isCompleted;
    milestone.completedAt = milestone.isCompleted ? new Date().toISOString() : null;

    // Recalculate progress
    goal.progress = goal.calculateProgress();

    // Check if goal is complete
    if (goal.progress === 100 && goal.status !== 'completed') {
        const ok = await confirmDialog(`All milestones complete! Mark "${goal.title}" as achieved?`, {
            title: 'Mark Goal Achieved',
            confirmText: 'Mark Achieved',
            cancelText: 'Not yet'
        });
        if (ok) {
            goal.status = 'completed';
            goal.completedAt = new Date().toISOString();
        }
    }

    await ProductivityData.DataStore.saveGoal(goal);
    await loadGoals();

    // Update details modal if open
    const detailsModal = document.getElementById('goal-details-modal');
    if (detailsModal?.classList.contains('active')) {
        viewGoalDetails(goalId);
    }

    if (milestone.isCompleted) {
        showToast('success', 'Milestone Completed! ✓', milestone.title);
    }
}

async function addMilestone(goalId) {
    const title = prompt('Enter milestone title:');
    if (!title?.trim()) return;

    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    goal.milestones.push(new ProductivityData.Milestone({
        title: title.trim(),
        order: goal.milestones.length
    }));

    await ProductivityData.DataStore.saveGoal(goal);
    await loadGoals();

    // Refresh details view
    viewGoalDetails(goalId);

    showToast('success', 'Milestone Added', title.trim());
}

async function addMilestoneQuick(goalId) {
    // Quick add multiple milestones
    closeGoalDetails();
    editGoal(goalId);
}

async function editMilestone(goalId, milestoneId) {
    const goal = GoalsState.goals.find(g => g.id === goalId);
    const milestone = goal?.milestones.find(m => m.id === milestoneId);
    if (!milestone) return;

    const newTitle = prompt('Edit milestone title:', milestone.title);
    if (newTitle === null) return;

    if (newTitle.trim()) {
        milestone.title = newTitle.trim();
        await ProductivityData.DataStore.saveGoal(goal);
        await loadGoals();
        viewGoalDetails(goalId);
    }
}

async function deleteMilestone(goalId, milestoneId) {
    if (!confirm('Delete this milestone?')) return;

    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    goal.milestones = goal.milestones.filter(m => m.id !== milestoneId);
    goal.progress = goal.calculateProgress();

    await ProductivityData.DataStore.saveGoal(goal);
    await loadGoals();
    viewGoalDetails(goalId);
}

async function saveGoalReflection(goalId) {
    const textarea = document.getElementById(`goal-reflection-${goalId}`);
    if (!textarea) return;

    const goal = GoalsState.goals.find(g => g.id === goalId);
    if (!goal) return;

    goal.reflection = textarea.value;
    await ProductivityData.DataStore.saveGoal(goal);
}

// ============================================================================
// ACHIEVEMENTS
// ============================================================================
function renderAchievements(achievements) {
    const container = document.getElementById('achievements-grid');
    if (!container) return;

    const unlocked = achievements.filter(a => a.isUnlocked);
    const locked = achievements.filter(a => !a.isUnlocked);

    if (unlocked.length === 0 && locked.length === 0) {
        container.innerHTML = `
            <div class="empty-achievements">
                <i class="fas fa-medal"></i>
                <p>Complete goals and milestones to unlock achievements!</p>
            </div>
        `;
        return;
    }

    const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
    unlocked.sort((a, b) => (rarityOrder[a.rarity] || 3) - (rarityOrder[b.rarity] || 3));

    container.innerHTML = `
        ${unlocked.map(a => `
            <div class="achievement-card unlocked ${a.rarity}" title="${a.description}">
                <div class="achievement-icon">
                    <i class="${a.icon || 'fas fa-trophy'}"></i>
                </div>
                <div class="achievement-info">
                    <h4>${a.title}</h4>
                    <p>${a.description}</p>
                    ${a.unlockedAt ? `<span class="unlocked-date">Unlocked ${formatRelativeDate(a.unlockedAt)}</span>` : ''}
                </div>
                <div class="achievement-rarity ${a.rarity}">${capitalizeFirst(a.rarity)}</div>
            </div>
        `).join('')}
        ${locked.slice(0, 4).map(a => `
            <div class="achievement-card locked" title="Keep working to unlock this!">
                <div class="achievement-icon">
                    <i class="fas fa-lock"></i>
                </div>
                <div class="achievement-info">
                    <h4>???</h4>
                    <p>${a.hint || a.description}</p>
                </div>
            </div>
        `).join('')}
    `;
}

async function checkGoalAchievements() {
    const totalGoals = GoalsState.goals.length;
    const completedGoals = GoalsState.goals.filter(g => g.status === 'completed').length;
    const totalMilestones = GoalsState.goals.reduce((sum, g) => sum + g.milestones.length, 0);
    const completedMilestones = GoalsState.goals.reduce((sum, g) => sum + g.milestones.filter(m => m.isCompleted).length, 0);

    const achievements = [];

    if (totalGoals === 1) achievements.push('first_goal');
    if (completedGoals === 1) achievements.push('goal_getter');
    if (completedGoals >= 5) achievements.push('goal_crusher');
    if (completedGoals >= 10) achievements.push('goal_master');
    if (completedMilestones >= 10) achievements.push('milestone_hunter');
    if (completedMilestones >= 50) achievements.push('milestone_master');

    for (const achievement of achievements) {
        await ProductivityData.DataStore.unlockAchievement(achievement);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function formatGoalDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatGoalDate(dateStr);
}

function getCategoryIcon(category) {
    const icons = {
        academic: 'fa-graduation-cap',
        skill: 'fa-tools',
        project: 'fa-project-diagram',
        career: 'fa-briefcase'
    };
    return icons[category] || 'fa-bullseye';
}

// Use truncate from utils.js but with alias for backward compatibility
function truncateText(text, maxLength) {
    return truncate(text, maxLength);
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================
window.loadGoals = loadGoals; // Main entry point for app.js
window.openGoalModal = openGoalModal;
window.closeGoalModal = closeGoalModal;
window.saveGoal = saveGoal;
window.editGoal = editGoal;
window.deleteGoal = deleteGoal;
window.duplicateGoal = duplicateGoal;
window.toggleMilestone = toggleMilestone;
window.addMilestone = addMilestone;
window.addMilestoneQuick = addMilestoneQuick;
window.editMilestone = editMilestone;
window.deleteMilestone = deleteMilestone;
window.viewGoalDetails = viewGoalDetails;
window.closeGoalDetails = closeGoalDetails;
window.markGoalComplete = markGoalComplete;
window.reopenGoal = reopenGoal;
window.addMilestoneInput = addMilestoneInput;
window.removeMilestoneInput = removeMilestoneInput;
window.saveGoalReflection = saveGoalReflection;
// Abandonment friction system
window.openAbandonmentModal = openAbandonmentModal;
window.cancelGoalAbandonment = cancelGoalAbandonment;
window.confirmGoalAbandonment = confirmGoalAbandonment;
window.checkExpiredAbandonments = checkExpiredAbandonments;

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Add goal button
    document.getElementById('add-goal-btn')?.addEventListener('click', () => openGoalModal());

    // Daily Goals Settings - Load and Save handlers
    const dailyStudyTargetInput = document.getElementById('goals-daily-study');
    const dailyTaskTargetInput = document.getElementById('goals-daily-tasks');
    const weeklyStudyTargetInput = document.getElementById('goals-weekly-study');
    const saveTargetsBtn = document.getElementById('save-daily-targets-btn');

    // Load current settings (async-safe)
    (async () => {
        if (!dailyStudyTargetInput || !dailyTaskTargetInput || !weeklyStudyTargetInput) return;

        try {
            const storedSettings = await window.ProductivityData?.DataStore?.getSettings?.();
            const settings = storedSettings || window.App?.settings || {};

            dailyStudyTargetInput.value = settings.dailyStudyTarget ?? 8;
            dailyTaskTargetInput.value = settings.dailyTaskTarget ?? 5;
            weeklyStudyTargetInput.value = settings.weeklyStudyTarget ?? 40;
        } catch (e) {
            dailyStudyTargetInput.value = 8;
            dailyTaskTargetInput.value = 5;
            weeklyStudyTargetInput.value = 40;
        }
    })();

    // Save targets button handler
    saveTargetsBtn?.addEventListener('click', async () => {
        const dailyStudyTarget = parseInt(dailyStudyTargetInput?.value) || 8;
        const dailyTaskTarget = parseInt(dailyTaskTargetInput?.value) || 5;
        const weeklyStudyTarget = parseInt(weeklyStudyTargetInput?.value) || 40;

        // Update App.settings
        if (window.App?.settings) {
            window.App.settings.dailyStudyTarget = dailyStudyTarget;
            window.App.settings.dailyTaskTarget = dailyTaskTarget;
            window.App.settings.weeklyStudyTarget = weeklyStudyTarget;
        }

        // Save to storage
        await window.ProductivityData?.DataStore?.saveSettings({
            dailyStudyTarget,
            dailyTaskTarget,
            weeklyStudyTarget
        });

        // Show confirmation
        saveTargetsBtn.textContent = '✓ Saved!';
        saveTargetsBtn.style.backgroundColor = 'var(--color-success)';
        setTimeout(() => {
            saveTargetsBtn.innerHTML = '<i class="fas fa-save"></i> Save Targets';
            saveTargetsBtn.style.backgroundColor = '';
        }, 2000);
    });
});

// Goals module loaded
