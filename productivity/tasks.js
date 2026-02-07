/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - TASK MANAGEMENT MODULE (FULL IMPLEMENTATION)
 * ============================================================================
 * 
 * Complete Task Management System with:
 * - Full CRUD operations
 * - List and Board (Kanban) views
 * - Subtasks support
 * - Advanced filtering and search
 * - Priority management
 * - Category organization
 * - Goal linking
 * - Recurring tasks
 * - Bulk actions
 * - Drag and drop
 * - Task templates
 */

// ============================================================================
// TASK STATE
// ============================================================================
const TaskState = {
    tasks: [],
    taskLists: [], // Cached task lists for display and sorting
    focusTimeByTaskId: {}, // Cache of total focus minutes per task ID
    currentView: 'list', // 'list' or 'board'
    editingTask: null,
    selectedTasks: new Set(),
    filters: {
        status: 'all',
        priority: 'all',
        category: 'all',
        list: 'all',
        tag: 'all',
        search: '',
        dateRange: 'all'
    },
    sortBy: 'dueDate', // 'dueDate', 'priority', 'title', 'createdAt', 'list'
    sortOrder: 'asc'
};

// Helper function to get list info by ID
function getTaskListInfo(listId) {
    if (!listId) return null;
    const list = TaskState.taskLists.find(l => l.id === listId);
    return list ? { name: list.name, color: list.color, icon: list.icon } : null;
}

// Load and aggregate focus time per task from all focus sessions
async function loadTaskFocusTime() {
    try {
        const sessions = await ProductivityData.DataStore.getFocusSessions();
        const timeByTask = {};

        for (const session of sessions) {
            if (session.linkedTaskId && session.actualDurationMinutes > 0) {
                timeByTask[session.linkedTaskId] = (timeByTask[session.linkedTaskId] || 0) + session.actualDurationMinutes;
            }
        }

        TaskState.focusTimeByTaskId = timeByTask;
    } catch (error) {
        console.error('Failed to load task focus time:', error);
        TaskState.focusTimeByTaskId = {};
    }
}

// Format focus time for display (e.g., "45m" or "2h 15m")
function formatFocusTimeForTask(minutes) {
    if (!minutes || minutes <= 0) return '';
    if (minutes < 60) {
        return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Task categories with colors
const TASK_CATEGORIES = {
    homework: { color: '#6366f1', icon: 'fa-book', label: 'Homework' },
    exam: { color: '#ef4444', icon: 'fa-graduation-cap', label: 'Exam' },
    project: { color: '#10b981', icon: 'fa-project-diagram', label: 'Project' },
    reading: { color: '#8b5cf6', icon: 'fa-book-reader', label: 'Reading' },
    personal: { color: '#f59e0b', icon: 'fa-user', label: 'Personal' },
    work: { color: '#ec4899', icon: 'fa-briefcase', label: 'Work' },
    other: { color: '#64748b', icon: 'fa-tasks', label: 'Other' }
};

// Priority configuration
const PRIORITY_CONFIG = {
    urgent: { color: '#ef4444', weight: 4, label: 'Urgent', icon: 'fa-fire' },
    high: { color: '#f59e0b', weight: 3, label: 'High', icon: 'fa-arrow-up' },
    medium: { color: '#3b82f6', weight: 2, label: 'Medium', icon: 'fa-minus' },
    low: { color: '#64748b', weight: 1, label: 'Low', icon: 'fa-arrow-down' }
};

function ymdLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function normalizeTaskDate(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;

        // Common format from <input type="date">.
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

        // ISO date-time: 2026-01-11T...
        if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);

        // Try parsing non-ISO formats (e.g., imported data). Use local date parts.
        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) return ymdLocal(parsed);
        return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return ymdLocal(value);
    }

    return null;
}

// ============================================================================
// TASK LINK (HYPERLINK) SUPPORT
// ============================================================================

function normalizeTaskLinkUrl(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let value = raw.trim();
    if (!value) return null;

    // If user pastes a bare domain, assume https.
    if (value.startsWith('www.')) value = `https://${value}`;

    // Add scheme if missing.
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
        value = `https://${value}`;
    }

    try {
        const url = new URL(value);
        const protocol = (url.protocol || '').toLowerCase();
        if (!['http:', 'https:', 'mailto:'].includes(protocol)) return null;
        return url.href;
    } catch {
        return null;
    }
}

async function openExternalUrl(url) {
    const normalized = normalizeTaskLinkUrl(url);
    if (!normalized) {
        showToast('error', 'Invalid Link', 'Please enter a valid http(s) or mailto link.');
        return false;
    }

    // Extension environment: open in a new tab when possible.
    try {
        if (typeof chrome !== 'undefined' && chrome?.tabs?.create) {
            chrome.tabs.create({ url: normalized });
            return true;
        }
    } catch (_) {
        // ignore
    }

    try {
        window.open(normalized, '_blank', 'noopener,noreferrer');
        return true;
    } catch (_) {
        showToast('error', 'Open Failed', 'Could not open the link.');
        return false;
    }
}

async function openTaskLink(taskId) {
    const task = TaskState.tasks.find(t => t.id === taskId);
    if (!task || !task.linkUrl) {
        showToast('info', 'No Link', 'This task has no link.');
        return;
    }
    await openExternalUrl(task.linkUrl);
}

// ============================================================================
// TASK INITIALIZATION
// ============================================================================
async function loadTasks() {
    // Debug removed

    try {
        TaskState.tasks = await ProductivityData.DataStore.getTasks();
        // Load task lists for display and sorting
        TaskState.taskLists = await ProductivityData.DataStore.getTaskLists();
        // Load focus time per task
        await loadTaskFocusTime();

        // Populate list and tag filter dropdowns
        populateListTagFilters();

        // Load saved view preference
        const savedView = await new Promise(resolve => {
            chrome.storage.local.get(['taskViewPreference'], result => {
                resolve(result.taskViewPreference || 'list');
            });
        });
        TaskState.currentView = savedView;

        // Update view toggle buttons
        document.querySelectorAll('.task-views .view-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === savedView);
        });

        // Show/hide view containers
        document.getElementById('task-list-view')?.classList.toggle('hidden', savedView !== 'list');
        document.getElementById('task-grid-view')?.classList.toggle('hidden', savedView !== 'grid');
        document.getElementById('task-board-view')?.classList.toggle('hidden', savedView !== 'board');
        document.getElementById('task-calendar-view')?.classList.toggle('hidden', savedView !== 'calendar');

        // Setup event listeners
        setupTaskListeners();

        // Render based on current view
        refreshTaskView();

        // Update stats
        updateTaskStats();

    } catch (error) {
        console.error('Failed to load tasks:', error);
        showToast('error', 'Error', 'Failed to load tasks.');
    }
}

// Populate list and tag filter dropdowns dynamically
function populateListTagFilters() {
    const listSelect = document.getElementById('task-filter-list');
    const tagSelect = document.getElementById('task-filter-tag');

    // Populate list filter
    if (listSelect) {
        const currentList = TaskState.filters.list;
        listSelect.innerHTML = '<option value="all">All Lists</option>';
        TaskState.taskLists.forEach(list => {
            const option = document.createElement('option');
            option.value = list.id;
            option.textContent = list.name;
            listSelect.appendChild(option);
        });
        listSelect.value = currentList;
    }

    // Populate tag filter - collect all unique tags from tasks
    if (tagSelect) {
        const currentTag = TaskState.filters.tag;
        const allTags = new Set();
        TaskState.tasks.forEach(task => {
            if (task.tags && Array.isArray(task.tags)) {
                task.tags.forEach(tag => allTags.add(tag));
            }
        });

        tagSelect.innerHTML = '<option value="all">All Tags</option>';
        [...allTags].sort().forEach(tag => {
            const option = document.createElement('option');
            option.value = tag;
            option.textContent = tag;
            tagSelect.appendChild(option);
        });
        tagSelect.value = currentTag;
    }
}

function setupTaskListeners() {
    // View toggle
    document.querySelectorAll('.task-views .view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.task-views .view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            TaskState.currentView = btn.dataset.view;

            // Save view preference
            chrome.storage.local.set({ taskViewPreference: btn.dataset.view });

            document.getElementById('task-list-view')?.classList.toggle('hidden', TaskState.currentView !== 'list');
            document.getElementById('task-grid-view')?.classList.toggle('hidden', TaskState.currentView !== 'grid');
            document.getElementById('task-board-view')?.classList.toggle('hidden', TaskState.currentView !== 'board');
            document.getElementById('task-calendar-view')?.classList.toggle('hidden', TaskState.currentView !== 'calendar');

            if (TaskState.currentView === 'list') {
                renderListView();
            } else if (TaskState.currentView === 'grid') {
                renderGridView();
            } else if (TaskState.currentView === 'board') {
                renderBoardView();
            } else if (TaskState.currentView === 'calendar') {
                renderTaskCalendarView();
            }
        });
    });

    // Search
    const searchInput = document.getElementById('task-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            TaskState.filters.search = e.target.value.toLowerCase();
            refreshTaskView();
        }, 300));
    }

    // Filters
    document.getElementById('task-filter-status')?.addEventListener('change', (e) => {
        TaskState.filters.status = e.target.value;
        refreshTaskView();
    });

    document.getElementById('task-filter-priority')?.addEventListener('change', (e) => {
        TaskState.filters.priority = e.target.value;
        refreshTaskView();
    });

    document.getElementById('task-filter-category')?.addEventListener('change', (e) => {
        TaskState.filters.category = e.target.value;
        refreshTaskView();
    });

    document.getElementById('task-filter-list')?.addEventListener('change', (e) => {
        TaskState.filters.list = e.target.value;
        refreshTaskView();
    });

    document.getElementById('task-filter-tag')?.addEventListener('change', (e) => {
        TaskState.filters.tag = e.target.value;
        refreshTaskView();
    });

    // Sort
    document.getElementById('task-sort')?.addEventListener('change', (e) => {
        TaskState.sortBy = e.target.value;
        refreshTaskView();
    });

    // Sort order toggle
    document.getElementById('task-sort-order')?.addEventListener('click', (e) => {
        TaskState.sortOrder = TaskState.sortOrder === 'asc' ? 'desc' : 'asc';
        const icon = e.currentTarget.querySelector('i');
        if (icon) {
            icon.className = TaskState.sortOrder === 'asc'
                ? 'fas fa-sort-amount-down'
                : 'fas fa-sort-amount-up';
        }
        refreshTaskView();
    });

    // Add task button
    document.getElementById('add-task-btn')?.addEventListener('click', () => openTaskModal());

    // Broadcast reminders button
    document.getElementById('broadcast-reminders-btn')?.addEventListener('click', async () => {
        if (typeof checkAndBroadcastReminders === 'function') {
            await checkAndBroadcastReminders();
            showToast('success', 'Reminders Sent', 'Task reminders have been sent to all open tabs.');
        } else if (typeof broadcastCustomReminder === 'function') {
            await broadcastCustomReminder('Task Reminder', 'Check your pending tasks!', { type: 'reminder' });
            showToast('success', 'Reminder Sent', 'Reminder has been sent to all open tabs.');
        } else {
            showToast('error', 'Error', 'Notification system not initialized.');
        }
    });

    // Quick add
    document.getElementById('quick-add-task')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            quickAddTask(e.target.value);
            e.target.value = '';
        }
    });

    // Bulk actions
    document.getElementById('bulk-complete')?.addEventListener('click', bulkComplete);
    document.getElementById('bulk-delete')?.addEventListener('click', bulkDelete);
    document.getElementById('select-all-tasks')?.addEventListener('change', toggleSelectAll);

    // Setup event delegation for task items
    setupTaskEventDelegation();
}

function setupTaskEventDelegation() {
    // Event delegation for task list view
    const listView = document.getElementById('task-list-view');
    if (listView && !listView.dataset.delegationSetup) {
        listView.dataset.delegationSetup = 'true';
        listView.addEventListener('click', handleTaskAction);
        listView.addEventListener('change', handleTaskAction);
    }

    // Event delegation for board view
    const boardView = document.getElementById('task-board-view');
    if (boardView && !boardView.dataset.delegationSetup) {
        boardView.dataset.delegationSetup = 'true';
        boardView.addEventListener('click', handleTaskAction);
        boardView.addEventListener('change', handleTaskAction);
    }
}

function handleTaskAction(e) {
    // Let inline link clicks open the URL instead of triggering task actions
    if (e.target.closest('a.task-inline-link')) return;

    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const taskId = target.dataset.taskId;

    // Prevent event bubbling for actions inside task items
    e.stopPropagation();

    switch (action) {
        case 'toggle-selection':
            toggleTaskSelection(taskId);
            break;
        case 'toggle-complete':
            toggleTask(taskId);
            break;
        case 'view-task':
            viewTask(taskId);
            break;
        case 'edit-task':
            editTask(taskId);
            break;
        case 'focus-task':
            startFocusOnTask(taskId);
            break;
        case 'open-link':
            openTaskLink(taskId);
            break;
        case 'delete-task':
            deleteTask(taskId);
            break;
        case 'postpone-task':
            postponeTaskToToday(taskId);
            break;
        case 'finish-and-review':
            finishAndSendToReview(taskId);
            break;
        case 'open-task-modal':
            const status = target.dataset.status;
            openTaskModal(null, status);
            break;
    }
}

function refreshTaskView() {
    if (TaskState.currentView === 'list') {
        renderListView();
    } else if (TaskState.currentView === 'grid') {
        renderGridView();
    } else if (TaskState.currentView === 'board') {
        renderBoardView();
    } else if (TaskState.currentView === 'calendar') {
        renderTaskCalendarView();
    }
}

// ============================================================================
// FILTERING AND SORTING
// ============================================================================
function getFilteredTasks() {
    let filtered = [...TaskState.tasks];

    // Apply search filter
    if (TaskState.filters.search) {
        const search = TaskState.filters.search;
        filtered = filtered.filter(task =>
            task.title.toLowerCase().includes(search) ||
            task.description?.toLowerCase().includes(search) ||
            task.subject?.toLowerCase().includes(search)
        );
    }

    // Apply status filter
    if (TaskState.filters.status !== 'all') {
        filtered = filtered.filter(task => task.status === TaskState.filters.status);
    }

    // Apply priority filter
    if (TaskState.filters.priority !== 'all') {
        filtered = filtered.filter(task => task.priority === TaskState.filters.priority);
    }

    // Apply category filter
    if (TaskState.filters.category !== 'all') {
        filtered = filtered.filter(task => task.category === TaskState.filters.category);
    }

    // Apply list filter
    if (TaskState.filters.list !== 'all') {
        filtered = filtered.filter(task => task.listId === TaskState.filters.list);
    }

    // Apply tag filter
    if (TaskState.filters.tag !== 'all') {
        filtered = filtered.filter(task => task.tags && task.tags.includes(TaskState.filters.tag));
    }

    // Apply date range filter
    if (TaskState.filters.dateRange !== 'all') {
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

        switch (TaskState.filters.dateRange) {
            case 'today':
                filtered = filtered.filter(t => t.dueDate === today);
                break;
            case 'tomorrow':
                filtered = filtered.filter(t => t.dueDate === tomorrow);
                break;
            case 'week':
                filtered = filtered.filter(t => t.dueDate && t.dueDate <= weekEnd);
                break;
            case 'overdue':
                filtered = filtered.filter(t => t.dueDate && t.dueDate < today && t.status !== 'completed');
                break;
        }
    }

    // Apply sorting
    filtered.sort((a, b) => {
        let comparison = 0;

        switch (TaskState.sortBy) {
            case 'dueDate':
                if (!a.dueDate && !b.dueDate) comparison = 0;
                else if (!a.dueDate) comparison = 1;
                else if (!b.dueDate) comparison = -1;
                else comparison = a.dueDate.localeCompare(b.dueDate);
                break;
            case 'priority':
                comparison = (PRIORITY_CONFIG[b.priority]?.weight || 0) - (PRIORITY_CONFIG[a.priority]?.weight || 0);
                break;
            case 'title':
                comparison = a.title.localeCompare(b.title);
                break;
            case 'createdAt':
                comparison = new Date(b.createdAt) - new Date(a.createdAt);
                break;
            case 'list':
                const listA = getTaskListInfo(a.listId);
                const listB = getTaskListInfo(b.listId);
                if (!listA && !listB) comparison = 0;
                else if (!listA) comparison = 1;
                else if (!listB) comparison = -1;
                else comparison = listA.name.localeCompare(listB.name);
                break;
        }

        return TaskState.sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
}

// ============================================================================
// LIST VIEW
// ============================================================================
function renderListView() {
    const filteredTasks = getFilteredTasks();
    const today = new Date().toISOString().split('T')[0];

    // Categorize tasks
    const overdue = filteredTasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'completed');
    const todayTasks = filteredTasks.filter(t => t.dueDate === today && t.status !== 'completed');
    const upcoming = filteredTasks.filter(t => (!t.dueDate || t.dueDate > today) && t.status !== 'completed');
    const completed = filteredTasks.filter(t => t.status === 'completed');

    // Render sections
    renderTaskSection('overdue-tasks', overdue, 'overdue-count', true);
    renderTaskSection('today-tasks', todayTasks, 'today-count', false);
    renderTaskSection('upcoming-tasks', upcoming, 'upcoming-count', false);
    renderTaskSection('completed-tasks', completed.slice(0, 10), 'completed-count', false);
}

function renderTaskSection(containerId, tasks, countId, isOverdue = false) {
    const container = document.getElementById(containerId);
    const countEl = document.getElementById(countId);

    if (countEl) countEl.textContent = tasks.length;
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = `
            <li class="empty-task-state">
                <i class="fas fa-check-circle"></i>
                <p>${isOverdue ? 'No overdue tasks!' : 'No tasks here'}</p>
            </li>
        `;
        return;
    }

    container.innerHTML = tasks.map(task => renderTaskItem(task, isOverdue)).join('');

    // Setup drag and drop for list items
    setupTaskDragDrop(container);
}

function renderTaskItem(task, isOverdue = false) {
    const categoryConfig = TASK_CATEGORIES[task.category] || TASK_CATEGORIES.other;
    const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
    const isSelected = TaskState.selectedTasks.has(task.id);
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
    const completedSubtasks = hasSubtasks ? task.subtasks.filter(s => s.completed).length : 0;
    const listInfo = getTaskListInfo(task.listId);

    return `
        <li class="task-item ${task.status === 'completed' ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}" 
            data-task-id="${task.id}"
            draggable="true">
            <div class="task-select">
                <input type="checkbox" ${isSelected ? 'checked' : ''} 
                       data-action="toggle-selection" data-task-id="${task.id}">
            </div>
            <div class="task-checkbox ${task.status === 'completed' ? 'checked' : ''}" 
                 data-action="toggle-complete" data-task-id="${task.id}"
                 style="border-color: ${priorityConfig.color}">
                ${task.status === 'completed' ? '<i class="fas fa-check"></i>' : ''}
            </div>
            <div class="task-content" data-action="view-task" data-task-id="${task.id}">
                <div class="task-title-row">
                    <span class="task-title">${linkifyText(task.title)}</span>
                    ${task.isRecurring ? '<i class="fas fa-redo task-recurring-icon" title="Recurring task"></i>' : ''}
                    ${task.linkedGoalId ? '<i class="fas fa-bullseye task-goal-icon" title="Linked to goal"></i>' : ''}
                </div>
                <div class="task-meta">
                    ${task.dueDate ? `
                        <span class="task-due ${isOverdue ? 'overdue' : ''}">
                            <i class="fas fa-calendar-alt"></i> 
                            ${formatTaskDate(task.dueDate)}
                            ${task.dueTime ? ` at ${task.dueTime}` : ''}
                        </span>
                    ` : ''}
                    ${task.subject ? `
                        <span class="task-subject">
                            <i class="fas fa-book"></i> ${escapeHtml(task.subject)}
                        </span>
                    ` : ''}
                    <span class="task-category" style="color: ${categoryConfig.color}">
                        <i class="fas ${categoryConfig.icon}"></i> ${categoryConfig.label}
                    </span>
                    ${listInfo ? `
                        <span class="task-list-badge" style="color: ${listInfo.color}">
                            <i class="fas ${listInfo.icon || 'fa-folder'}"></i> ${escapeHtml(listInfo.name)}
                        </span>
                    ` : ''}
                    ${hasSubtasks ? `
                        <span class="task-subtasks">
                            <i class="fas fa-list-check"></i> ${completedSubtasks}/${task.subtasks.length}
                        </span>
                    ` : ''}
                    ${task.estimatedTime ? `
                        <span class="task-time">
                            <i class="fas fa-hourglass-half"></i> ${task.estimatedTime}min
                        </span>
                    ` : ''}
                    ${TaskState.focusTimeByTaskId[task.id] ? `
                        <span class="task-focus-time" title="Total focus time on this task">
                            <i class="fas fa-stopwatch"></i> ${formatFocusTimeForTask(TaskState.focusTimeByTaskId[task.id])}
                        </span>
                    ` : ''}
                </div>
            </div>
            <div class="task-priority-badge" style="background: ${priorityConfig.color}" title="${priorityConfig.label}">
                <i class="fas ${priorityConfig.icon}"></i>
            </div>
            <div class="task-actions">
                ${isOverdue ? `
                <button class="btn-icon small highlight-purple" data-action="postpone-task" data-task-id="${task.id}" title="Postpone to Today">
                    <i class="fas fa-calendar-plus"></i>
                </button>
                ` : ''}
                ${task.linkUrl ? `
                <button class="btn-icon small" data-action="open-link" data-task-id="${task.id}" title="Open link">
                    <i class="fas fa-link"></i>
                </button>
                ` : ''}
                <button class="btn-icon small" data-action="edit-task" data-task-id="${task.id}" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon small" data-action="focus-task" data-task-id="${task.id}" title="Focus on this task">
                    <i class="fas fa-play"></i>
                </button>
                <button class="btn-icon small highlight-green" data-action="finish-and-review" data-task-id="${task.id}" title="Finish & Send to Review">
                    <i class="fas fa-graduation-cap"></i>
                </button>
                <button class="btn-icon small danger" data-action="delete-task" data-task-id="${task.id}" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </li>
    `;
}

// ============================================================================
// GRID VIEW
// ============================================================================
function renderGridView() {
    const filteredTasks = getFilteredTasks();
    const gridContainer = document.getElementById('task-grid-view');
    if (!gridContainer) return;

    if (filteredTasks.length === 0) {
        gridContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-tasks"></i>
                <h3>No Tasks</h3>
                <p>Create a new task to get started</p>
                <button class="btn-primary" id="add-task-empty-btn">
                    <i class="fas fa-plus"></i> Add Task
                </button>
            </div>
        `;
        // Add event listener instead of inline onclick (CSP compliance)
        const addBtn = document.getElementById('add-task-empty-btn');
        if (addBtn) {
            addBtn.addEventListener('click', openTaskModal);
        }
        return;
    }

    // Sort tasks by due date and priority
    const sortedTasks = [...filteredTasks].sort((a, b) => {
        // Completed tasks go to the end
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;

        // Then by due date
        if (a.dueDate && b.dueDate) {
            const dateCompare = a.dueDate.localeCompare(b.dueDate);
            if (dateCompare !== 0) return dateCompare;
        } else if (a.dueDate) {
            return -1;
        } else if (b.dueDate) {
            return 1;
        }

        // Then by priority
        const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
        return (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
    });

    gridContainer.innerHTML = `
        <div class="task-grid">
            ${sortedTasks.map(task => renderGridCard(task)).join('')}
        </div>
    `;

    // Setup grid card interactions
    setupGridCardInteractions(gridContainer);
}

function renderGridCard(task) {
    const categoryConfig = TASK_CATEGORIES[task.category] || TASK_CATEGORIES.other;
    const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
    const completedSubtasks = hasSubtasks ? task.subtasks.filter(s => s.completed).length : 0;
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = task.dueDate && task.dueDate < today && task.status !== 'completed';

    // Get task color (custom color or from list)
    const taskColor = task.color || categoryConfig.color;
    const listInfo = getTaskListInfo(task.listId);

    return `
        <div class="task-grid-card ${task.status === 'completed' ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}" 
             data-task-id="${task.id}"
             style="--card-accent: ${taskColor}">
            <div class="grid-card-header">
                <div class="grid-card-checkbox ${task.status === 'completed' ? 'checked' : ''}" 
                     data-action="toggle-complete" data-task-id="${task.id}"
                     style="border-color: ${priorityConfig.color}">
                    ${task.status === 'completed' ? '<i class="fas fa-check"></i>' : ''}
                </div>
                <div class="grid-card-priority" style="background: ${priorityConfig.color}" title="${priorityConfig.label}">
                    <i class="fas ${priorityConfig.icon}"></i>
                </div>
            </div>
            
            <h4 class="grid-card-title">${linkifyText(task.title)}</h4>
            
            ${task.description ? `
                <p class="grid-card-description">${escapeHtml(task.description.substring(0, 80))}${task.description.length > 80 ? '...' : ''}</p>
            ` : ''}
            
            <div class="grid-card-meta">
                ${task.dueDate ? `
                    <span class="grid-card-due ${isOverdue ? 'overdue' : ''}">
                        <i class="fas fa-calendar-alt"></i> ${formatTaskDate(task.dueDate)}
                    </span>
                ` : ''}
                <span class="grid-card-category" style="color: ${categoryConfig.color}">
                    <i class="fas ${categoryConfig.icon}"></i> ${categoryConfig.label}
                </span>
                ${listInfo ? `
                    <span class="grid-card-list" style="color: ${listInfo.color}">
                        <i class="fas ${listInfo.icon || 'fa-folder'}"></i> ${escapeHtml(listInfo.name)}
                    </span>
                ` : ''}
            </div>
            
            ${hasSubtasks ? `
                <div class="grid-card-progress">
                    <div class="grid-card-progress-bar">
                        <div class="grid-card-progress-fill" style="width: ${(completedSubtasks / task.subtasks.length) * 100}%"></div>
                    </div>
                    <span>${completedSubtasks}/${task.subtasks.length}</span>
                </div>
            ` : ''}
            
            <div class="grid-card-footer">
                <div class="grid-card-icons">
                    ${task.isRecurring ? '<i class="fas fa-redo" title="Recurring"></i>' : ''}
                    ${task.linkedGoalId ? '<i class="fas fa-bullseye" title="Linked to goal"></i>' : ''}
                    ${task.linkUrl ? '<i class="fas fa-link" title="Has link"></i>' : ''}
                    ${task.estimatedTime ? `<span title="Estimated time"><i class="fas fa-clock"></i> ${task.estimatedTime}m</span>` : ''}
                    ${TaskState.focusTimeByTaskId[task.id] ? `<span class="grid-card-focus-time" title="Total focus time"><i class="fas fa-stopwatch"></i> ${formatFocusTimeForTask(TaskState.focusTimeByTaskId[task.id])}</span>` : ''}
                </div>
                <div class="grid-card-actions">
                    ${task.linkUrl ? `
                    <button class="btn-icon tiny" data-action="open-link" data-task-id="${task.id}" title="Open link">
                        <i class="fas fa-link"></i>
                    </button>
                    ` : ''}
                    <button class="btn-icon tiny" data-action="edit-task" data-task-id="${task.id}" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon tiny" data-action="focus-task" data-task-id="${task.id}" title="Focus">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn-icon tiny highlight-green" data-action="finish-and-review" data-task-id="${task.id}" title="Finish & Review">
                        <i class="fas fa-graduation-cap"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function setupGridCardInteractions(container) {
    // Checkbox toggle
    container.querySelectorAll('[data-action="toggle-complete"]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTask(el.dataset.taskId);
        });
    });

    // Edit button
    container.querySelectorAll('[data-action="edit-task"]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            editTask(el.dataset.taskId);
        });
    });

    // Open link button
    container.querySelectorAll('[data-action="open-link"]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            openTaskLink(el.dataset.taskId);
        });
    });

    // Focus button
    container.querySelectorAll('[data-action="focus-task"]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            startFocusOnTask(el.dataset.taskId);
        });
    });

    // Finish & Review button
    container.querySelectorAll('[data-action="finish-and-review"]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            finishAndSendToReview(el.dataset.taskId);
        });
    });

    // Card click to view
    container.querySelectorAll('.task-grid-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('a.task-inline-link')) return;
            viewTask(card.dataset.taskId);
        });
    });
}

// ============================================================================
// CALENDAR VIEW
// ============================================================================
let taskCalendarDate = new Date();
let calendarNavInitialized = false;

function renderTaskCalendarView() {
    const container = document.getElementById('task-calendar-grid');
    if (!container) return;

    const year = taskCalendarDate.getFullYear();
    const month = taskCalendarDate.getMonth();

    // Update header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('task-cal-month').textContent = `${monthNames[month]} ${year}`;

    // Setup navigation only once
    if (!calendarNavInitialized) {
        calendarNavInitialized = true;
        document.getElementById('task-cal-prev')?.addEventListener('click', () => {
            taskCalendarDate.setMonth(taskCalendarDate.getMonth() - 1);
            renderTaskCalendarView();
        });
        document.getElementById('task-cal-next')?.addEventListener('click', () => {
            taskCalendarDate.setMonth(taskCalendarDate.getMonth() + 1);
            renderTaskCalendarView();
        });
        document.getElementById('task-cal-today')?.addEventListener('click', () => {
            taskCalendarDate = new Date();
            renderTaskCalendarView();
        });
    }

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date().toISOString().split('T')[0];

    // Build calendar grid
    let html = `
        <div class="task-cal-weekdays">
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>
        <div class="task-cal-days">
    `;

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="task-cal-day empty"></div>';
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        // Prefer dueDate; fall back to startDate so tasks still appear when users only set a start.
        const dayTasks = TaskState.tasks.filter(t => {
            const key = normalizeTaskDate(t.dueDate || t.startDate);
            return key === dateStr && t.status !== 'completed';
        });
        const completedTasks = TaskState.tasks.filter(t => {
            const key = normalizeTaskDate(t.dueDate || t.startDate);
            return key === dateStr && t.status === 'completed';
        });
        const isToday = dateStr === today;
        const isPast = dateStr < today;
        const hasOverdue = isPast && dayTasks.length > 0;

        html += `
            <div class="task-cal-day ${isToday ? 'today' : ''} ${hasOverdue ? 'overdue' : ''}" data-date="${dateStr}">
                <span class="day-number">${day}</span>
                <div class="day-tasks">
                    ${dayTasks.slice(0, 3).map(task => {
            const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
            return `<div class="day-task" style="border-left-color: ${priorityConfig.color}" 
                                     data-task-id="${task.id}" title="${escapeHtml(task.title)}">
                            ${escapeHtml(task.title.substring(0, 15))}${task.title.length > 15 ? '...' : ''}
                        </div>`;
        }).join('')}
                    ${dayTasks.length > 3 ? `<div class="day-task-more">+${dayTasks.length - 3} more</div>` : ''}
                    ${completedTasks.length > 0 ? `<div class="day-task-completed">${completedTasks.length} done</div>` : ''}
                </div>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;

    // Setup click handlers
    container.querySelectorAll('.day-task[data-task-id]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            viewTask(el.dataset.taskId);
        });
    });

    container.querySelectorAll('.task-cal-day:not(.empty)').forEach(el => {
        el.addEventListener('dblclick', () => {
            const date = el.dataset.date;
            openTaskModal({ dueDate: date });
        });
    });
}

// ============================================================================
// BOARD VIEW (KANBAN)
// ============================================================================
function renderBoardView() {
    const filteredTasks = getFilteredTasks();
    const boardContainer = document.getElementById('task-board-view');
    if (!boardContainer) return;

    // Group by status
    const columns = {
        'not-started': { title: 'To Do', tasks: [], icon: 'fa-circle', color: '#64748b' },
        'in-progress': { title: 'In Progress', tasks: [], icon: 'fa-spinner', color: '#3b82f6' },
        'completed': { title: 'Done', tasks: [], icon: 'fa-check-circle', color: '#10b981' }
    };

    filteredTasks.forEach(task => {
        const status = task.status || 'not-started';
        if (columns[status]) {
            columns[status].tasks.push(task);
        }
    });

    boardContainer.innerHTML = `
        <div class="kanban-board">
            ${Object.entries(columns).map(([status, column]) => `
                <div class="kanban-column" data-status="${status}">
                    <div class="kanban-column-header" style="border-top-color: ${column.color}">
                        <div class="column-title">
                            <i class="fas ${column.icon}" style="color: ${column.color}"></i>
                            <span>${column.title}</span>
                            <span class="column-count">${column.tasks.length}</span>
                        </div>
                        <button class="btn-icon small" data-action="open-task-modal" data-status="${status}">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="kanban-column-body" data-status="${status}">
                        ${column.tasks.length === 0 ? `
                            <div class="kanban-empty">
                                <p>No tasks</p>
                            </div>
                        ` : column.tasks.map(task => renderBoardCard(task)).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Setup drag and drop for board
    setupBoardDragDrop();
}

function setupBoardDragDrop() {
    document.querySelectorAll('.kanban-column-body').forEach(column => {
        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            column.classList.add('drag-over');
        });

        column.addEventListener('dragleave', () => {
            column.classList.remove('drag-over');
        });

        column.addEventListener('drop', (e) => {
            e.preventDefault();
            column.classList.remove('drag-over');
            const taskId = e.dataTransfer.getData('text/plain');
            const newStatus = column.dataset.status;
            handleBoardDrop(taskId, newStatus);
        });
    });

    document.querySelectorAll('.kanban-card').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', card.dataset.taskId);
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        card.addEventListener('click', (e) => {
            // Allow action buttons (e.g., complete/edit) to work without opening details.
            if (e.target.closest('[data-action]')) return;
            if (e.target.closest('a.task-inline-link')) return;
            viewTask(card.dataset.taskId);
        });
    });
}

function handleBoardDropTask(taskId, newStatus) {
    const task = TaskState.tasks.find(t => t.id === taskId);
    if (task && task.status !== newStatus) {
        task.status = newStatus;
        ProductivityData.DataStore.saveTask(task);
        refreshTaskView();
        showToast('success', 'Task Moved', `Task moved to ${newStatus.replace('-', ' ')}`);
    }
}

function renderBoardCard(task) {
    const categoryConfig = TASK_CATEGORIES[task.category] || TASK_CATEGORIES.other;
    const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
    const completedSubtasks = hasSubtasks ? task.subtasks.filter(s => s.completed).length : 0;
    const progress = hasSubtasks ? (completedSubtasks / task.subtasks.length) * 100 : 0;

    return `
        <div class="kanban-card ${task.status === 'completed' ? 'completed' : ''}" 
             data-task-id="${task.id}"
             draggable="true">
            <div class="card-header">
                <div class="card-left">
                    <div class="grid-card-checkbox ${task.status === 'completed' ? 'checked' : ''}" 
                         data-action="toggle-complete" data-task-id="${task.id}"
                         style="border-color: ${priorityConfig.color}" title="Mark done">
                        ${task.status === 'completed' ? '<i class="fas fa-check"></i>' : ''}
                    </div>
                    <span class="card-priority" style="background: ${priorityConfig.color}"></span>
                </div>
                <span class="card-category" style="color: ${categoryConfig.color}">
                    <i class="fas ${categoryConfig.icon}"></i>
                </span>
            </div>
            <div class="card-title">${linkifyText(task.title)}</div>
            ${task.description ? `
                <div class="card-description">${escapeHtml(truncate(task.description, 60))}</div>
            ` : ''}
            ${hasSubtasks ? `
                <div class="card-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <span class="progress-text">${completedSubtasks}/${task.subtasks.length}</span>
                </div>
            ` : ''}
            <div class="card-footer">
                ${task.dueDate ? `
                    <span class="card-due ${isOverdue(task) ? 'overdue' : ''}">
                        <i class="fas fa-calendar-alt"></i> ${formatTaskDate(task.dueDate)}
                    </span>
                ` : '<span></span>'}
                <div class="card-actions">
                    ${task.linkUrl ? `
                    <button class="btn-icon tiny" data-action="open-link" data-task-id="${task.id}" title="Open link">
                        <i class="fas fa-link"></i>
                    </button>
                    ` : ''}
                    <button class="btn-icon tiny" data-action="edit-task" data-task-id="${task.id}" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon tiny" data-action="focus-task" data-task-id="${task.id}" title="Focus">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn-icon tiny highlight-green" data-action="finish-and-review" data-task-id="${task.id}" title="Finish & Review">
                        <i class="fas fa-graduation-cap"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Board drag and drop
let draggedTaskId = null;

function handleBoardDragStart(e, taskId) {
    draggedTaskId = taskId;
    e.dataTransfer.setData('text/plain', taskId);
    e.target.classList.add('dragging');
}

function handleBoardDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

// This function is called from inline event handlers
async function handleBoardDrop(e, newStatus) {
    if (e && e.preventDefault) {
        e.preventDefault();
        e.currentTarget?.classList.remove('drag-over');
    }

    // Support both calling conventions
    let taskId = draggedTaskId;
    let status = newStatus;

    // If first param is a string (taskId), use it directly
    if (typeof e === 'string') {
        taskId = e;
        status = newStatus;
    }

    if (!taskId) return;

    const task = TaskState.tasks.find(t => t.id === taskId);
    if (task && task.status !== status) {
        const wasCompleted = task.status === 'completed';
        task.status = status;
        if (status === 'completed') {
            task.completedAt = new Date().toISOString();
        }

        await ProductivityData.DataStore.saveTask(task);

        // Update daily stats when completing a task
        if (!wasCompleted && status === 'completed') {
            try {
                await ProductivityData.ProductivityCalculator.updateDailyStats('task_completed');
            } catch (err) {
                console.warn('[Tasks] Could not update stats:', err);
            }

            // Record progress for challenges
            if (window.ChallengeManager) {
                window.ChallengeManager.recordProgress('tasks', 1);
            }
        }

        refreshTaskView();
        showToast('success', 'Task Updated', `Moved to ${status.replace('-', ' ')}`);
    }

    draggedTaskId = null;
}

// ============================================================================
// TASK CRUD OPERATIONS
// ============================================================================
function openTaskModal(task = null, defaultStatus = 'not-started', prefillData = {}) {
    TaskState.editingTask = task;

    const modal = document.getElementById('task-modal') || createTaskModal();
    const isEditing = task !== null;

    const today = new Date().toISOString().split('T')[0];
    const defaultDueDate = prefillData.dueDate || task?.dueDate || '';
    const defaultStartDate = prefillData.startDate || task?.startDate || '';
    const defaultStartTime = prefillData.startTime || task?.startTime || '';
    const defaultDueTime = prefillData.dueTime || task?.dueTime || '';

    modal.innerHTML = `
        <div class="modal-backdrop" data-action="close-task-modal"></div>
        <div class="modal-content task-modal-redesign">
            <div class="task-modal-header">
                <div class="task-modal-title">
                    <i class="fas ${isEditing ? 'fa-edit' : 'fa-plus-circle'}"></i>
                    <span>${isEditing ? 'Edit Task' : 'New Task'}</span>
                </div>
                <button class="btn-icon-close" data-action="close-task-modal" aria-label="Close task modal">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <form id="task-form" class="task-form-redesign">
                <!-- Main Title Input - Prominent -->
                <div class="task-title-section">
                    <input type="text" id="task-title" required 
                           value="${escapeHtml(task?.title || '')}"
                           placeholder="What do you need to do?"
                           class="task-title-input"
                           autocomplete="off">
                </div>
                
                <!-- Quick Options Bar -->
                <div class="task-quick-options">
                    <!-- Priority Pills -->
                    <div class="priority-selector">
                        ${Object.entries(PRIORITY_CONFIG).map(([key, val]) => `
                            <button type="button" class="priority-pill ${task?.priority === key || (!task && key === 'medium') ? 'active' : ''}" 
                                    data-priority="${key}" title="${val.label}">
                                <i class="fas ${val.icon}"></i>
                            </button>
                        `).join('')}
                        <input type="hidden" id="task-priority" value="${task?.priority || 'medium'}">
                    </div>
                    
                    <!-- Color Picker -->
                    <div class="task-color-picker">
                        <div class="color-options" id="task-color-options" aria-label="Task color"></div>
                        <input type="hidden" id="task-color" value="${task?.color || '#6366f1'}">
                    </div>
                </div>
                
                <!-- Date/Time Section - Compact Grid -->
                <div class="task-datetime-grid">
                    <div class="datetime-group">
                        <label><i class="fas fa-play"></i> Start</label>
                        <div class="datetime-inputs">
                            <input type="date" id="task-start-date" value="${defaultStartDate}">
                            <input type="time" id="task-start-time" value="${defaultStartTime}">
                        </div>
                    </div>
                    <div class="datetime-group">
                        <label><i class="fas fa-flag-checkered"></i> Due</label>
                        <div class="datetime-inputs">
                            <input type="date" id="task-due-date" value="${defaultDueDate}">
                            <input type="time" id="task-due-time" value="${defaultDueTime}">
                        </div>
                    </div>
                </div>
                
                <!-- Reminder Row -->
                <div class="task-reminder-row">
                    <i class="fas fa-bell"></i>
                    <select id="task-reminder-time">
                        <option value="-1" ${task?.reminderMinutes === -1 ? 'selected' : ''}>No reminder</option>
                        <option value="0" ${task?.reminderMinutes === 0 ? 'selected' : ''}>At due time</option>
                        <option value="5" ${task?.reminderMinutes === 5 ? 'selected' : ''}>5 min before</option>
                        <option value="15" ${(!task || task?.reminderMinutes === undefined || task?.reminderMinutes === 15) ? 'selected' : ''}>15 min before</option>
                        <option value="30" ${task?.reminderMinutes === 30 ? 'selected' : ''}>30 min before</option>
                        <option value="60" ${task?.reminderMinutes === 60 ? 'selected' : ''}>1 hour before</option>
                        <option value="1440" ${task?.reminderMinutes === 1440 ? 'selected' : ''}>1 day before</option>
                    </select>
                </div>
                
                <!-- Repeat Section -->
                <div class="task-repeat-section">
                    <div class="repeat-toggle">
                        <label class="toggle-switch-label">
                            <input type="checkbox" id="task-repeat-enabled" ${task?.isRecurring ? 'checked' : ''}>
                            <span class="toggle-switch"></span>
                            <i class="fas fa-redo"></i> Repeat
                        </label>
                    </div>
                    <div id="task-repeat-options" class="${task?.isRecurring ? '' : 'hidden'}">
                        <div class="repeat-options-grid">
                            <select id="task-repeat-frequency">
                                <option value="daily" ${task?.repeatType === 'daily' ? 'selected' : ''}>Daily</option>
                                <option value="weekly" ${task?.repeatType === 'weekly' ? 'selected' : ''}>Weekly</option>
                                <option value="biweekly" ${task?.repeatType === 'biweekly' ? 'selected' : ''}>Every 2 weeks</option>
                                <option value="monthly" ${task?.repeatType === 'monthly' ? 'selected' : ''}>Monthly</option>
                            </select>
                            <div class="repeat-end-options">
                                <select id="task-repeat-end-type">
                                    <option value="never" ${(!task?.repeatEndType || task?.repeatEndType === 'never') ? 'selected' : ''}>Never ends</option>
                                    <option value="date" ${task?.repeatEndType === 'date' ? 'selected' : ''}>Until date</option>
                                    <option value="count" ${task?.repeatEndType === 'count' ? 'selected' : ''}>After X times</option>
                                </select>
                                <input type="date" id="task-repeat-end-date" class="${task?.repeatEndType === 'date' ? '' : 'hidden'}" 
                                       value="${task?.repeatEndDate || ''}">
                                <input type="number" id="task-repeat-count" class="${task?.repeatEndType === 'count' ? '' : 'hidden'}" 
                                       min="1" max="100" value="${task?.repeatCount || 10}" placeholder="Times">
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- List & Tags Section -->
                <div class="task-organization-section">
                    <div class="list-selector">
                        <label><i class="fas fa-list"></i> List</label>
                        <div class="list-select-wrapper">
                            <select id="task-list-select">
                                <option value="">No List</option>
                                <!-- Populated dynamically -->
                            </select>
                            <button type="button" class="btn-create-new" id="btn-create-list" title="Create new list">
                                <i class="fas fa-plus"></i>
                            </button>
                            <button type="button" class="btn-create-new" id="btn-delete-list" title="Delete selected list" aria-label="Delete selected list" disabled>
                                <i class="fas fa-trash"></i>
                            </button>
                            <button type="button" class="btn-create-new" id="btn-manage-lists" title="Create/manage lists" aria-label="Create/manage lists">
                                <i class="fas fa-edit"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="tags-selector">
                        <label><i class="fas fa-tags"></i> Tags</label>
                        <div class="tags-input-wrapper">
                            <div id="selected-tags" class="selected-tags"></div>
                            <input type="text" id="task-tags-input" placeholder="Add tags..." autocomplete="off">
                            <div id="tags-dropdown" class="tags-dropdown hidden"></div>
                        </div>
                        <input type="hidden" id="task-tags" value="${(task?.tags || []).join(',')}">
                    </div>
                </div>
                
                <!-- New List Inline Form -->
                <div id="new-list-form" class="new-list-inline hidden">
                    <input type="text" id="new-list-name" placeholder="List name..." maxlength="30">
                    <div class="color-options" id="new-list-color-options" aria-label="List color"></div>
                    <input type="hidden" id="new-list-color" value="#6366f1">
                    <button type="button" id="save-new-list" class="btn-icon-small"><i class="fas fa-check"></i></button>
                    <button type="button" id="cancel-new-list" class="btn-icon-small cancel"><i class="fas fa-times"></i></button>
                </div>
                
                <!-- Description - Expandable -->
                <details class="task-description-section">
                    <summary><i class="fas fa-align-left"></i> Add description</summary>
                    <textarea id="task-description" rows="3" 
                              placeholder="Add more details...">${escapeHtml(task?.description || '')}</textarea>
                </details>

                <details class="task-description-section" ${task?.linkUrl ? 'open' : ''}>
                    <summary><i class="fas fa-link"></i> Add link</summary>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="url" id="task-link-url" 
                               placeholder="https://..."
                               value="${escapeHtml(task?.linkUrl || '')}"
                               style="flex:1;">
                        <button type="button" class="btn-icon small" id="task-open-link-btn" title="Open link" ${task?.linkUrl ? '' : 'disabled'}>
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                    </div>
                    <div style="margin-top:6px; opacity:0.8; font-size:0.85rem;">Tip: press Ctrl+Enter to open</div>
                </details>
                
                <!-- Subtasks - Expandable -->
                <details class="task-subtasks-section" ${(task?.subtasks?.length > 0) ? 'open' : ''}>
                    <summary><i class="fas fa-tasks"></i> Subtasks <span class="subtask-count">${task?.subtasks?.length || 0}</span></summary>
                    <div id="subtasks-list">
                        ${(task?.subtasks || []).map((subtask, i) => `
                            <div class="subtask-item" data-index="${i}">
                                <input type="checkbox" ${subtask.completed ? 'checked' : ''}>
                                <input type="text" value="${escapeHtml(subtask.title)}" placeholder="Subtask...">
                                <button type="button" class="btn-icon-tiny" data-action="remove-subtask" data-index="${i}">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    <button type="button" class="btn-add-subtask" data-action="add-subtask">
                        <i class="fas fa-plus"></i> Add subtask
                    </button>
                </details>
                
                <!-- Footer Actions -->
                <div class="task-modal-footer">
                    ${isEditing ? `
                        <button type="button" class="btn-delete" data-action="delete-task" data-task-id="${task.id}" aria-label="Delete task">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : '<div></div>'}
                    <div class="footer-actions">
                        <button type="button" class="btn-cancel" data-action="close-task-modal">Cancel</button>
                        <button type="submit" class="btn-save">
                            <i class="fas fa-check"></i> ${isEditing ? 'Save' : 'Create'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    `;

    modal.classList.add('active');

    // Setup event listeners (CSP compliant)
    modal.querySelectorAll('[data-action="close-task-modal"]').forEach(el => {
        el.addEventListener('click', closeTaskModal);
    });

    modal.querySelector('[data-action="delete-task"]')?.addEventListener('click', (e) => {
        deleteTask(e.currentTarget.dataset.taskId);
        closeTaskModal();
    });

    modal.querySelector('[data-action="add-subtask"]')?.addEventListener('click', addSubtask);

    modal.querySelectorAll('[data-action="remove-subtask"]').forEach(el => {
        el.addEventListener('click', (e) => {
            removeSubtask(parseInt(e.currentTarget.dataset.index));
        });
    });

    document.getElementById('task-form')?.addEventListener('submit', saveTask);

    // Link input: enable open button and allow quick open
    const linkInputEl = document.getElementById('task-link-url');
    const openLinkBtn = document.getElementById('task-open-link-btn');
    const syncOpenLinkBtn = () => {
        const normalized = normalizeTaskLinkUrl(linkInputEl?.value || '');
        if (openLinkBtn) openLinkBtn.disabled = !normalized;
    };
    if (linkInputEl) {
        linkInputEl.addEventListener('input', syncOpenLinkBtn);
        syncOpenLinkBtn();
        linkInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                openExternalUrl(linkInputEl.value);
            }
        });
    }
    openLinkBtn?.addEventListener('click', () => {
        openExternalUrl(linkInputEl?.value || '');
    });

    // Load task lists for selection
    const listsPromise = loadTaskListsForModal(task?.listId);

    // Load and display tags
    loadTagsForModal(task?.tags || []);

    // Priority pills click handling
    modal.querySelectorAll('.priority-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            modal.querySelectorAll('.priority-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            document.getElementById('task-priority').value = pill.dataset.priority;
        });
    });

    // Repeat toggle
    document.getElementById('task-repeat-enabled')?.addEventListener('change', (e) => {
        document.getElementById('task-repeat-options')?.classList.toggle('hidden', !e.target.checked);
    });

    // Repeat end type change
    document.getElementById('task-repeat-end-type')?.addEventListener('change', (e) => {
        const endDate = document.getElementById('task-repeat-end-date');
        const endCount = document.getElementById('task-repeat-count');
        endDate?.classList.toggle('hidden', e.target.value !== 'date');
        endCount?.classList.toggle('hidden', e.target.value !== 'count');
    });

    // Create new list button
    document.getElementById('btn-create-list')?.addEventListener('click', () => {
        document.getElementById('new-list-form')?.classList.remove('hidden');
        document.getElementById('new-list-name')?.focus();
    });

    // Save new list
    document.getElementById('save-new-list')?.addEventListener('click', async () => {
        const name = document.getElementById('new-list-name')?.value.trim();
        const color = document.getElementById('new-list-color')?.value || '#6366f1';
        if (name) {
            await createNewTaskList(name, color);
            document.getElementById('new-list-form')?.classList.add('hidden');
            document.getElementById('new-list-name').value = '';
        }
    });

    // Cancel new list
    document.getElementById('cancel-new-list')?.addEventListener('click', () => {
        document.getElementById('new-list-form')?.classList.add('hidden');
    });

    // List action buttons (delete + manage/edit)
    const listSelectEl = document.getElementById('task-list-select');
    const deleteListBtn = document.getElementById('btn-delete-list');
    const manageListBtn = document.getElementById('btn-manage-lists');
    const syncListButtons = () => {
        const hasSelection = !!listSelectEl?.value;
        if (deleteListBtn) {
            deleteListBtn.disabled = !hasSelection;
            deleteListBtn.title = hasSelection ? 'Delete selected list' : 'Select a list to delete';
        }
        if (manageListBtn) {
            manageListBtn.title = hasSelection ? 'Edit selected list' : 'Create/manage lists';
        }
    };

    if (listSelectEl) {
        syncListButtons();
        listSelectEl.addEventListener('change', syncListButtons);

        deleteListBtn?.addEventListener('click', async () => {
            const listId = listSelectEl.value;
            if (!listId) return;
            await deleteTaskList(listId);
            await refreshActiveTaskModalLists(null);
        });

        manageListBtn?.addEventListener('click', async () => {
            // Open full list manager modal; edit selected list if possible.
            const selectedId = listSelectEl.value;
            if (!selectedId) {
                openTaskListModal(null);
                return;
            }

            try {
                const lists = await ProductivityData.DataStore.getTaskLists();
                const list = lists.find(l => String(l.id) === String(selectedId));
                openTaskListModal(list || null);
            } catch (e) {
                openTaskListModal(null);
            }
        });

        // Re-sync after async list load selects an option
        if (listsPromise && typeof listsPromise.then === 'function') {
            listsPromise.then(syncListButtons).catch(() => { });
        }
    }

    // Tags input handling
    setupTagsInput(task?.tags || []);

    // Fixed palette: task color + new list color
    try {
        const taskColorInput = document.getElementById('task-color');
        const taskColorOptions = document.getElementById('task-color-options');
        if (taskColorInput && taskColorOptions && typeof createFixedColorPicker === 'function') {
            createFixedColorPicker(taskColorOptions, taskColorInput, { ariaLabel: 'Task color' });
        }

        const newListColorInput = document.getElementById('new-list-color');
        const newListColorOptions = document.getElementById('new-list-color-options');
        if (newListColorInput && newListColorOptions && typeof createFixedColorPicker === 'function') {
            createFixedColorPicker(newListColorOptions, newListColorInput, { ariaLabel: 'List color' });
        }
    } catch (e) {
        // Non-fatal: keep modal usable even if palette init fails
    }

    // Focus title
    document.getElementById('task-title')?.focus();
}

// Tags functionality
async function loadTagsForModal(selectedTags = []) {
    const tagsContainer = document.getElementById('selected-tags');
    if (!tagsContainer) return;

    // Display selected tags
    tagsContainer.innerHTML = selectedTags.map(tag => `
        <span class="tag-chip" data-tag="${encodeURIComponent(tag)}">
            ${escapeHtml(tag)}
            <button type="button" class="tag-remove" data-tag="${encodeURIComponent(tag)}">×</button>
        </span>
    `).join('');

    // Remove tag click handler
    tagsContainer.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const raw = btn.dataset.tag || '';
            const tag = raw ? decodeURIComponent(raw) : '';
            window.removeTagFromSelection?.(tag);
        });
    });
}

function hasChromeStorageLocal() {
    return typeof chrome !== 'undefined' && chrome?.storage?.local;
}

function safeStorageGet(keys) {
    return new Promise((resolve) => {
        if (hasChromeStorageLocal()) {
            chrome.storage.local.get(keys, (result) => resolve(result || {}));
            return;
        }

        const result = {};
        for (const key of keys) {
            try {
                const raw = localStorage.getItem(key);
                result[key] = raw ? JSON.parse(raw) : undefined;
            } catch {
                result[key] = undefined;
            }
        }
        resolve(result);
    });
}

function safeStorageSet(values) {
    return new Promise((resolve) => {
        if (hasChromeStorageLocal()) {
            chrome.storage.local.set(values, resolve);
            return;
        }
        for (const [key, value] of Object.entries(values)) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch {
                // Ignore quota / serialization errors
            }
        }
        resolve();
    });
}

function setupTagsInput(initialTags = []) {
    const input = document.getElementById('task-tags-input');
    const dropdown = document.getElementById('tags-dropdown');
    const hiddenInput = document.getElementById('task-tags');

    if (!input || !dropdown) return;

    let currentTags = [...initialTags];

    // Update hidden input
    const updateHiddenInput = () => {
        if (hiddenInput) hiddenInput.value = currentTags.join(',');
    };

    // Load existing tags
    safeStorageGet(['allTags']).then((result) => {
        const allTags = Array.isArray(result.allTags) ? result.allTags : [];

        input.addEventListener('focus', () => {
            showTagsDropdown(allTags, currentTags);
        });

        input.addEventListener('input', () => {
            const query = input.value.toLowerCase().trim();
            const filtered = allTags.filter(t =>
                t.toLowerCase().includes(query) && !currentTags.includes(t)
            );
            showTagsDropdown(filtered, currentTags, query);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const newTag = input.value.trim();
                if (newTag && !currentTags.includes(newTag)) {
                    currentTags.push(newTag);
                    loadTagsForModal(currentTags);
                    updateHiddenInput();

                    // Save to all tags if new
                    if (!allTags.includes(newTag)) {
                        allTags.push(newTag);
                        safeStorageSet({ allTags });
                    }
                }
                input.value = '';
                dropdown.classList.add('hidden');
            }
        });

        // Allow clearing stale tag selections if a tag is deleted globally
        async function deleteTagGlobally(tag) {
            const ok = await confirmDialog(`Delete tag "${escapeHtml(tag)}"? This removes it from your saved tags list.`, {
                title: 'Delete Tag',
                confirmText: 'Delete',
                cancelText: 'Cancel',
                danger: true
            });
            if (!ok) return;

            const idx = allTags.findIndex(t => t === tag);
            if (idx >= 0) {
                allTags.splice(idx, 1);
                await safeStorageSet({ allTags });
            }

            if (currentTags.includes(tag)) {
                currentTags = currentTags.filter(t => t !== tag);
                loadTagsForModal(currentTags);
                updateHiddenInput();
            }

            const q = input.value.toLowerCase().trim();
            const filtered = allTags.filter(t =>
                t.toLowerCase().includes(q) && !currentTags.includes(t)
            );
            showTagsDropdown(filtered, currentTags, q);
        }
    }).catch(() => {
        // If storage fails, keep input usable (new tags still work locally)
    });

    // Click outside to close
    if (!window.__taskModalTagsOutsideClickBound) {
        window.__taskModalTagsOutsideClickBound = true;
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.tags-input-wrapper')) {
                dropdown.classList.add('hidden');
            }
        });
    }

    function showTagsDropdown(tags, selected, query = '') {
        if (tags.length === 0 && !query) {
            dropdown.classList.add('hidden');
            return;
        }

        dropdown.innerHTML = tags.slice(0, 10).map(tag => `
            <div class="tag-option" data-tag="${encodeURIComponent(tag)}">
                <span class="tag-option-main"><i class="fas fa-tag"></i> ${escapeHtml(tag)}</span>
                <button type="button" class="tag-option-delete" data-delete-tag="${encodeURIComponent(tag)}" title="Delete tag" aria-label="Delete tag">×</button>
            </div>
        `).join('');

        if (query && !tags.includes(query) && !selected.includes(query)) {
            dropdown.innerHTML += `
                <div class="tag-option create-new" data-tag="${encodeURIComponent(query)}">
                    <i class="fas fa-plus"></i> Create "${escapeHtml(query)}"
                </div>
            `;
        }

        dropdown.classList.remove('hidden');

        dropdown.querySelectorAll('.tag-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const raw = opt.dataset.tag || '';
                const tag = raw ? decodeURIComponent(raw) : '';
                if (!currentTags.includes(tag)) {
                    currentTags.push(tag);
                    loadTagsForModal(currentTags);
                    updateHiddenInput();

                    // Persist tag if this was a create-new click
                    if (!allTags.includes(tag)) {
                        allTags.push(tag);
                        safeStorageSet({ allTags });
                    }
                }
                input.value = '';
                dropdown.classList.add('hidden');
            });
        });

        dropdown.querySelectorAll('[data-delete-tag]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const raw = btn.dataset.deleteTag || '';
                const tag = raw ? decodeURIComponent(raw) : '';
                if (!tag) return;
                await deleteTagGlobally(tag);
            });
        });
    }

    // Global function to remove tag
    window.removeTagFromSelection = (tag) => {
        currentTags = currentTags.filter(t => t !== tag);
        loadTagsForModal(currentTags);
        updateHiddenInput();
    };
}

async function createNewTaskList(name, color) {
    try {
        const newList = {
            id: (typeof generateUUID === 'function') ? generateUUID() : (globalThis.crypto?.randomUUID?.() || generateId()),
            name,
            color,
            createdAt: new Date().toISOString()
        };

        await ProductivityData.DataStore.saveTaskList(newList);
        await loadTaskListsForModal(newList.id);
        showToast('success', 'List Created', `"${name}" list created`);
    } catch (error) {
        console.error('Failed to create list:', error);
        showToast('error', 'Error', 'Failed to create list');
    }
}

function createTaskModal() {
    const modal = document.createElement('div');
    modal.id = 'task-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
    return modal;
}

function closeTaskModal() {
    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.remove('active');
    TaskState.editingTask = null;
}

async function refreshActiveTaskModalLists(preferredSelectedListId = null) {
    const taskModal = document.getElementById('task-modal');
    if (!taskModal || !taskModal.classList.contains('active')) return;

    const listSelect = document.getElementById('task-list-select');
    const selectedId = preferredSelectedListId ?? (listSelect?.value || null);
    await loadTaskListsForModal(selectedId);

    const deleteBtn = document.getElementById('btn-delete-list');
    const manageBtn = document.getElementById('btn-manage-lists');
    const hasSelection = !!document.getElementById('task-list-select')?.value;
    if (deleteBtn) {
        deleteBtn.disabled = !hasSelection;
        deleteBtn.title = hasSelection ? 'Delete selected list' : 'Select a list to delete';
    }
    if (manageBtn) {
        manageBtn.title = hasSelection ? 'Edit selected list' : 'Create/manage lists';
    }
}

async function loadGoalsForLinking(selectedGoalId = null) {
    const goalSelect = document.getElementById('task-goal');
    if (!goalSelect) return;

    try {
        const goals = await ProductivityData.DataStore.getGoals();
        const activeGoals = goals.filter(g => g.status === 'active');

        goalSelect.innerHTML = `
            <option value="">-- No Goal --</option>
            ${activeGoals.map(goal => `
                <option value="${goal.id}" ${selectedGoalId === goal.id ? 'selected' : ''}>
                    ${escapeHtml(goal.title)}
                </option>
            `).join('')}
        `;
    } catch (error) {
        console.error('Failed to load goals:', error);
    }
}

async function loadTaskListsForModal(selectedListId = null) {
    const listSelect = document.getElementById('task-list-select');
    if (!listSelect) return;

    try {
        const taskLists = await ProductivityData.DataStore.getTaskLists();

        listSelect.innerHTML = `
            <option value="">No List</option>
            ${taskLists.map(list => `
                <option value="${list.id}" ${selectedListId === list.id ? 'selected' : ''} data-color="${list.color}">
                    ${escapeHtml(list.name)}
                </option>
            `).join('')}
        `;

        // When list changes, optionally update color picker to match list color
        if (!listSelect.__taskModalListChangeBound) {
            listSelect.__taskModalListChangeBound = true;
            listSelect.addEventListener('change', (e) => {
                const selectedOption = e.target.selectedOptions[0];
                if (selectedOption && selectedOption.dataset.color) {
                    const colorInput = document.getElementById('task-color');
                    if (colorInput && !TaskState.editingTask?.color) {
                        colorInput.value = selectedOption.dataset.color;
                        document.getElementById('task-color-options')?.__setFixedColor?.(colorInput.value);
                    }
                }
            });
        }
    } catch (error) {
        console.error('Failed to load task lists:', error);
    }
}

// Subtask management
function addSubtask() {
    const subtasksList = document.getElementById('subtasks-list');
    if (!subtasksList) return;

    const index = subtasksList.children.length;
    const subtaskDiv = document.createElement('div');
    subtaskDiv.className = 'subtask-item';
    subtaskDiv.dataset.index = index;
    subtaskDiv.innerHTML = `
        <input type="checkbox">
        <input type="text" placeholder="Subtask title" autofocus>
        <button type="button" class="btn-icon tiny danger" data-action="remove-subtask" data-index="${index}">
            <i class="fas fa-times"></i>
        </button>
    `;

    // Add event listener for remove button
    subtaskDiv.querySelector('[data-action="remove-subtask"]').addEventListener('click', (e) => {
        removeSubtask(parseInt(e.currentTarget.dataset.index));
    });

    subtasksList.appendChild(subtaskDiv);
    subtaskDiv.querySelector('input[type="text"]')?.focus();
}

function removeSubtask(index) {
    const subtaskItem = document.querySelector(`.subtask-item[data-index="${index}"]`);
    if (subtaskItem) subtaskItem.remove();

    // Re-index remaining subtasks
    document.querySelectorAll('.subtask-item').forEach((item, i) => {
        item.dataset.index = i;
        const removeBtn = item.querySelector('[data-action="remove-subtask"]');
        if (removeBtn) removeBtn.dataset.index = i;
    });
}

function getSubtasksFromForm() {
    const subtasks = [];
    document.querySelectorAll('.subtask-item').forEach(item => {
        const title = item.querySelector('input[type="text"]')?.value.trim();
        const completed = item.querySelector('input[type="checkbox"]')?.checked || false;

        if (title) {
            subtasks.push({
                id: generateId(),
                title,
                completed
            });
        }
    });
    return subtasks;
}

async function saveTask(e) {
    e.preventDefault();

    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description')?.value.trim() || '';
    const startDate = document.getElementById('task-start-date')?.value || null;
    const startTime = document.getElementById('task-start-time')?.value || null;
    const dueDate = document.getElementById('task-due-date')?.value || null;
    const dueTime = document.getElementById('task-due-time')?.value || null;
    const reminderTimeValue = document.getElementById('task-reminder-time')?.value;
    const reminderMinutes = reminderTimeValue ? parseInt(reminderTimeValue) : 15;
    const priority = document.getElementById('task-priority')?.value || 'medium';
    const listId = document.getElementById('task-list-select')?.value || null;
    const colorValue = document.getElementById('task-color')?.value;
    const color = colorValue || '#6366f1';
    const subtasks = getSubtasksFromForm();

    // Repeat options
    const isRecurring = document.getElementById('task-repeat-enabled')?.checked || false;
    const repeatType = document.getElementById('task-repeat-frequency')?.value || 'daily';
    const repeatEndType = document.getElementById('task-repeat-end-type')?.value || 'never';
    const repeatEndDate = document.getElementById('task-repeat-end-date')?.value || null;
    const repeatCount = parseInt(document.getElementById('task-repeat-count')?.value) || 10;

    // Tags
    const tagsValue = document.getElementById('task-tags')?.value || '';
    const tags = tagsValue ? tagsValue.split(',').filter(t => t.trim()) : [];

    // Optional link
    const linkUrlRaw = document.getElementById('task-link-url')?.value || '';
    const linkUrl = linkUrlRaw.trim() ? normalizeTaskLinkUrl(linkUrlRaw) : null;
    if (linkUrlRaw.trim() && !linkUrl) {
        showToast('error', 'Validation Error', 'Please enter a valid link (http/https/mailto).');
        return;
    }

    if (!title) {
        showToast('error', 'Validation Error', 'Please enter a task title.');
        return;
    }

    const taskData = {
        id: TaskState.editingTask?.id,
        title,
        description,
        linkUrl,
        startDate,
        startTime,
        dueDate,
        dueTime,
        reminderMinutes,
        priority,
        status: TaskState.editingTask?.status || 'not-started',
        isRecurring,
        repeatType: isRecurring ? repeatType : null,
        repeatEndType: isRecurring ? repeatEndType : null,
        repeatEndDate: isRecurring && repeatEndType === 'date' ? repeatEndDate : null,
        repeatCount: isRecurring && repeatEndType === 'count' ? repeatCount : null,
        listId,
        color,
        subtasks,
        tags,
        completedAt: TaskState.editingTask?.completedAt || null
    };

    const task = new ProductivityData.Task(taskData);

    try {
        await ProductivityData.DataStore.saveTask(task);

        // Update local state
        if (TaskState.editingTask) {
            const index = TaskState.tasks.findIndex(t => t.id === task.id);
            if (index >= 0) TaskState.tasks[index] = task;
        } else {
            TaskState.tasks.push(task);
        }

        // Check if user wants to add this task as a countdown
        const addAsCountdown = document.getElementById('task-add-countdown')?.checked;
        if (addAsCountdown && task.dueDate) {
            // Store task countdown in chrome.storage
            chrome.storage.local.get(['taskCountdowns'], async (result) => {
                const taskCountdowns = result.taskCountdowns || [];
                if (!taskCountdowns.includes(task.id)) {
                    taskCountdowns.push(task.id);
                    await chrome.storage.local.set({ taskCountdowns });
                    // Trigger countdown bar refresh if function exists
                    if (typeof window.refreshTaskCountdowns === 'function') {
                        window.refreshTaskCountdowns();
                    }
                }
            });
        }

        closeTaskModal();
        refreshTaskView();
        updateTaskStats();

        // Refresh calendar to show the new/updated task
        if (typeof window.refreshCalendarTasks === 'function') {
            await window.refreshCalendarTasks();
        } else {
            console.warn('refreshCalendarTasks not available');
        }

        if (TaskState.editingTask) {
            showToast('success', 'Task Updated', title);
        } else if (typeof window.showToast === 'function') {
            // notifications.js supports options; silence only for task creation
            window.showToast('success', 'Task Created', title, { silent: true });
        } else {
            // Fallback
            showToast('success', 'Task Created', title);
        }

    } catch (error) {
        console.error('Failed to save task:', error);
        showToast('error', 'Save Failed', 'Could not save the task.');
    }
}

async function toggleTask(taskId) {
    const task = TaskState.tasks.find(t => t.id === taskId);
    if (!task) return;

    const newStatus = task.status === 'completed' ? 'not-started' : 'completed';
    task.status = newStatus;
    task.completedAt = newStatus === 'completed' ? new Date().toISOString() : null;

    try {
        await ProductivityData.DataStore.saveTask(task);

        if (newStatus === 'completed') {
            try {
                await ProductivityData.ProductivityCalculator.updateDailyStats('task_completed');
            } catch (err) {
                console.warn('[Tasks] Could not update stats:', err);
            }
        }

        refreshTaskView();
        updateTaskStats();

        // Refresh calendar (completed tasks are hidden from calendar)
        if (typeof window.refreshCalendarTasks === 'function') {
            window.refreshCalendarTasks();
        }

        if (newStatus === 'completed') {
            showToast('success', 'Task Completed! 🎉', task.title);

            // Trigger notification system (desktop + in-app if available)
            if (typeof window.notifyTaskComplete === 'function') {
                window.notifyTaskComplete(task);
            }

            // Award XP and track achievement via motivation system
            if (window.MotivationSystem?.onTaskComplete) {
                window.MotivationSystem.onTaskComplete();
            }

            // Record progress for challenges
            if (window.ChallengeManager) {
                window.ChallengeManager.recordProgress('tasks', 1);
            }

            // Update linked goal progress if any
            if (task.linkedGoalId) {
                updateGoalProgress(task.linkedGoalId);
            }
        }
    } catch (error) {
        console.error('Failed to toggle task:', error);
        showToast('error', 'Error', 'Failed to update task status.');
    }
}

async function editTask(taskId) {
    let task = TaskState.tasks.find(t => t.id === taskId);
    if (!task) {
        // Fallback: fetch from DataStore (e.g. called from dashboard before Tasks page visited)
        try {
            task = await ProductivityData.DataStore.getTask(taskId);
        } catch (_) { /* ignore */ }
    }
    if (task) {
        openTaskModal(task);
    }
}

async function deleteTask(taskId) {
    const ok = await confirmDialog('Are you sure you want to delete this task?', {
        title: 'Delete Task',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!ok) return;

    try {
        await ProductivityData.DataStore.deleteTask(taskId);
        TaskState.tasks = TaskState.tasks.filter(t => t.id !== taskId);

        closeTaskDetails();
        refreshTaskView();
        updateTaskStats();

        // Refresh calendar to remove the deleted task
        if (typeof window.refreshCalendarTasks === 'function') {
            window.refreshCalendarTasks();
        }

        showToast('info', 'Task Deleted', 'The task has been removed.');
    } catch (error) {
        console.error('Failed to delete task:', error);
        showToast('error', 'Delete Failed', 'Could not delete the task.');
    }
}

function viewTask(taskId) {
    const task = TaskState.tasks.find(t => t.id === taskId);
    if (!task) return;

    const modal = document.getElementById('task-details-modal') || createTaskDetailsModal();
    const categoryConfig = TASK_CATEGORIES[task.category] || TASK_CATEGORIES.other;
    const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

    const hasSubtasks = task.subtasks && task.subtasks.length > 0;
    const completedSubtasks = hasSubtasks ? task.subtasks.filter(s => s.completed).length : 0;

    modal.innerHTML = `
        <div class="modal-backdrop" data-action="close-details"></div>
        <div class="modal-content task-details">
            <div class="task-details-header">
                <div class="task-status-badge ${task.status}">
                    ${task.status === 'completed' ? '<i class="fas fa-check"></i> Completed' :
            task.status === 'in-progress' ? '<i class="fas fa-spinner"></i> In Progress' :
                '<i class="fas fa-circle"></i> To Do'}
                </div>
                <button class="btn-icon" data-action="close-details">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="task-details-body">
                <h3 class="task-detail-title">${linkifyText(task.title)}</h3>

                ${task.linkUrl ? `
                    <div class="task-detail-item" style="margin: 10px 0; gap: 8px;">
                        <i class="fas fa-link"></i>
                        <button class="btn-secondary" data-action="open-link" data-task-id="${task.id}" type="button" title="Open link">
                            Open Link
                        </button>
                        <span style="opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(task.linkUrl)}</span>
                    </div>
                ` : ''}
                
                ${task.description ? `
                    <div class="task-detail-description">${escapeHtml(task.description)}</div>
                ` : ''}
                
                <div class="task-detail-grid">
                    <div class="task-detail-item">
                        <i class="fas ${priorityConfig.icon}" style="color: ${priorityConfig.color}"></i>
                        <span>${priorityConfig.label} Priority</span>
                    </div>
                    <div class="task-detail-item">
                        <i class="fas ${categoryConfig.icon}" style="color: ${categoryConfig.color}"></i>
                        <span>${categoryConfig.label}</span>
                    </div>
                    ${task.dueDate ? `
                        <div class="task-detail-item ${isOverdue(task) ? 'overdue' : ''}">
                            <i class="fas fa-calendar-alt"></i>
                            <span>${formatTaskDate(task.dueDate)}${task.dueTime ? ` at ${task.dueTime}` : ''}</span>
                        </div>
                    ` : ''}
                    ${task.subject ? `
                        <div class="task-detail-item">
                            <i class="fas fa-book"></i>
                            <span>${escapeHtml(task.subject)}</span>
                        </div>
                    ` : ''}
                    ${task.estimatedTime ? `
                        <div class="task-detail-item">
                            <i class="fas fa-hourglass-half"></i>
                            <span>${task.estimatedTime} minutes</span>
                        </div>
                    ` : ''}
                </div>
                
                ${hasSubtasks ? `
                    <div class="task-subtasks-section">
                        <h4>Subtasks (${completedSubtasks}/${task.subtasks.length})</h4>
                        <div class="subtasks-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${(completedSubtasks / task.subtasks.length) * 100}%"></div>
                            </div>
                        </div>
                        <ul class="subtasks-detail-list">
                            ${task.subtasks.map(subtask => `
                                <li class="${subtask.completed ? 'completed' : ''}" 
                                    data-action="toggle-subtask" data-task-id="${task.id}" data-subtask-id="${subtask.id}">
                                    <div class="subtask-checkbox ${subtask.completed ? 'checked' : ''}">
                                        ${subtask.completed ? '<i class="fas fa-check"></i>' : ''}
                                    </div>
                                    <span>${escapeHtml(subtask.title)}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
            <div class="task-details-footer">
                <button class="btn-danger" data-action="delete-task" data-task-id="${task.id}">
                    <i class="fas fa-trash"></i> Delete
                </button>
                <div class="footer-right">
                    <button class="btn-secondary" data-action="close-details">Close</button>
                    <button class="btn-ghost" data-action="focus-task" data-task-id="${task.id}">
                        <i class="fas fa-play"></i> Focus
                    </button>
                    <button class="btn-primary" data-action="edit-task" data-task-id="${task.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.classList.add('active');

    // Setup event listeners for details modal
    setupTaskDetailsListeners(modal, task);
}

function setupTaskDetailsListeners(modal, task) {
    modal.querySelectorAll('[data-action="close-details"]').forEach(el => {
        el.addEventListener('click', closeTaskDetails);
    });

    modal.querySelector('[data-action="delete-task"]')?.addEventListener('click', () => {
        deleteTask(task.id);
    });

    modal.querySelector('[data-action="open-link"]')?.addEventListener('click', () => {
        openTaskLink(task.id);
    });

    modal.querySelector('[data-action="focus-task"]')?.addEventListener('click', () => {
        closeTaskDetails();
        startFocusOnTask(task.id);
    });

    modal.querySelector('[data-action="edit-task"]')?.addEventListener('click', () => {
        closeTaskDetails();
        editTask(task.id);
    });

    modal.querySelectorAll('[data-action="toggle-subtask"]').forEach(el => {
        el.addEventListener('click', () => {
            toggleSubtask(el.dataset.taskId, el.dataset.subtaskId);
        });
    });
}

function createTaskDetailsModal() {
    const modal = document.createElement('div');
    modal.id = 'task-details-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
    return modal;
}

function closeTaskDetails() {
    const modal = document.getElementById('task-details-modal');
    if (modal) modal.classList.remove('active');
}

async function toggleSubtask(taskId, subtaskId) {
    const task = TaskState.tasks.find(t => t.id === taskId);
    if (!task || !task.subtasks) return;

    const subtask = task.subtasks.find(s => s.id === subtaskId);
    if (subtask) {
        subtask.completed = !subtask.completed;
        await ProductivityData.DataStore.saveTask(task);
        viewTask(taskId); // Refresh the view
    }
}

// ============================================================================
// QUICK ADD TASK
// ============================================================================
function quickAddTask(input) {
    if (!input.trim()) return;

    // Parse natural language input
    let title = input;
    let dueDate = null;
    let priority = 'medium';
    let category = 'other';

    // Detect first URL in input (supports "Do X https://..." or just "https://...")
    let linkUrl = null;
    const urlMatch = input.match(/\bhttps?:\/\/[^\s]+/i);
    if (urlMatch && urlMatch[0]) {
        linkUrl = normalizeTaskLinkUrl(urlMatch[0]);
        title = title.replace(urlMatch[0], '').trim();
    }

    // Parse priority markers
    if (input.includes('!urgent') || input.includes('!!!')) {
        priority = 'urgent';
        title = title.replace(/!urgent|!!!/gi, '').trim();
    } else if (input.includes('!high') || input.includes('!!')) {
        priority = 'high';
        title = title.replace(/!high|!!/gi, '').trim();
    } else if (input.includes('!low')) {
        priority = 'low';
        title = title.replace(/!low/gi, '').trim();
    }

    // Parse date markers
    const today = new Date();
    if (input.toLowerCase().includes('today')) {
        dueDate = today.toISOString().split('T')[0];
        title = title.replace(/today/gi, '').trim();
    } else if (input.toLowerCase().includes('tomorrow')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        dueDate = tomorrow.toISOString().split('T')[0];
        title = title.replace(/tomorrow/gi, '').trim();
    }

    // Parse category markers
    Object.keys(TASK_CATEGORIES).forEach(cat => {
        if (input.toLowerCase().includes(`#${cat}`)) {
            category = cat;
            title = title.replace(new RegExp(`#${cat}`, 'gi'), '').trim();
        }
    });

    if (!title) title = 'New Task';

    // Open modal with parsed values
    openTaskModal({
        title,
        dueDate,
        priority,
        category,
        linkUrl
    });
}

// ============================================================================
// BULK ACTIONS
// ============================================================================
function toggleTaskSelection(taskId) {
    if (TaskState.selectedTasks.has(taskId)) {
        TaskState.selectedTasks.delete(taskId);
    } else {
        TaskState.selectedTasks.add(taskId);
    }
    updateBulkActionButtons();
}

function toggleSelectAll(e) {
    const filteredTasks = getFilteredTasks();

    if (e.target.checked) {
        filteredTasks.forEach(t => TaskState.selectedTasks.add(t.id));
    } else {
        TaskState.selectedTasks.clear();
    }

    refreshTaskView();
    updateBulkActionButtons();
}

function updateBulkActionButtons() {
    const count = TaskState.selectedTasks.size;
    const bulkActions = document.getElementById('bulk-actions');

    if (bulkActions) {
        bulkActions.classList.toggle('hidden', count === 0);
        const countEl = bulkActions.querySelector('.selected-count');
        if (countEl) countEl.textContent = count;
    }
}

async function bulkComplete() {
    const taskIds = Array.from(TaskState.selectedTasks);

    let newlyCompleted = 0;

    for (const taskId of taskIds) {
        const task = TaskState.tasks.find(t => t.id === taskId);
        if (task && task.status !== 'completed') {
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
            await ProductivityData.DataStore.saveTask(task);
            newlyCompleted++;
        }
    }

    if (newlyCompleted > 0) {
        for (let i = 0; i < newlyCompleted; i++) {
            try {
                await ProductivityData.ProductivityCalculator.updateDailyStats('task_completed');
            } catch (err) {
                console.warn('[Tasks] Could not update stats:', err);
                break;
            }
        }
    }

    TaskState.selectedTasks.clear();
    refreshTaskView();
    updateTaskStats();
    showToast('success', 'Tasks Completed', `${taskIds.length} tasks marked as complete`);
}

async function bulkDelete() {
    const ok = await confirmDialog(`Delete ${TaskState.selectedTasks.size} selected tasks?`, {
        title: 'Delete Tasks',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!ok) return;

    const taskIds = Array.from(TaskState.selectedTasks);

    for (const taskId of taskIds) {
        await ProductivityData.DataStore.deleteTask(taskId);
        TaskState.tasks = TaskState.tasks.filter(t => t.id !== taskId);
    }

    TaskState.selectedTasks.clear();
    refreshTaskView();
    updateTaskStats();
    showToast('info', 'Tasks Deleted', `${taskIds.length} tasks removed`);
}

// ============================================================================
// RECURRING TASKS
// ============================================================================
async function createRecurringTasks(baseTask) {
    if (!baseTask?.isRecurring || !baseTask?.repeatType) return;
    if (baseTask.repeatEndType !== 'date' || !baseTask.repeatEndDate) return;

    const start = baseTask.dueDate ? new Date(baseTask.dueDate) : new Date();
    const end = new Date(baseTask.repeatEndDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

    const dayIncrement = {
        daily: 1,
        weekly: 7,
        biweekly: 14,
        monthly: 0
    }[baseTask.repeatType] || 7;

    const tasks = [];
    let current = new Date(start);

    if (baseTask.repeatType === 'monthly') {
        current.setMonth(current.getMonth() + 1);
        while (current <= end) {
            tasks.push({
                ...baseTask,
                id: undefined,
                dueDate: current.toISOString().split('T')[0],
                parentTaskId: baseTask.id,
                status: 'not-started',
                completedAt: null,
                isRecurring: false,
                recurring: false
            });
            current.setMonth(current.getMonth() + 1);
        }
    } else {
        current.setDate(current.getDate() + dayIncrement);
        while (current <= end) {
            tasks.push({
                ...baseTask,
                id: undefined,
                dueDate: current.toISOString().split('T')[0],
                parentTaskId: baseTask.id,
                status: 'not-started',
                completedAt: null,
                isRecurring: false,
                recurring: false
            });
            current.setDate(current.getDate() + dayIncrement);
        }
    }

    for (const taskData of tasks) {
        const task = new ProductivityData.Task(taskData);
        await ProductivityData.DataStore.saveTask(task);
        TaskState.tasks.push(task);
    }
}

// ============================================================================
// STATS AND HELPERS
// ============================================================================
function updateTaskStats() {
    const today = new Date().toISOString().split('T')[0];

    const stats = {
        total: TaskState.tasks.length,
        completed: TaskState.tasks.filter(t => t.status === 'completed').length,
        overdue: TaskState.tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'completed').length,
        today: TaskState.tasks.filter(t => t.dueDate === today && t.status !== 'completed').length
    };

    // Update UI elements if they exist
    document.getElementById('total-tasks-count')?.textContent &&
        (document.getElementById('total-tasks-count').textContent = stats.total);
    document.getElementById('completed-tasks-stat')?.textContent &&
        (document.getElementById('completed-tasks-stat').textContent = stats.completed);
}

function startFocusOnTask(taskId) {
    let task = TaskState.tasks.find(t => t.id === taskId);

    // Fallback: fetch from DataStore if not in local state (e.g. called from dashboard)
    const proceed = (resolvedTask) => {
        if (!resolvedTask) {
            // Still navigate to focus page even without task context
            if (typeof navigateTo === 'function') navigateTo('focus');
            return;
        }

        // Inform handleSmartFocusStart to not auto-pick a different task.
        try {
            window.__skipSmartFocusOnce = true;
        } catch (_) {
            // ignore
        }

        // Navigate to focus page so the user sees the focus UI (works across the entire hub)
        if (typeof navigateTo === 'function') {
            navigateTo('focus');
        } else if (typeof window.navigateTo === 'function') {
            window.navigateTo('focus');
        } else {
            // Fallback: directly manipulate the DOM
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.page === 'focus');
            });
            document.querySelectorAll('.page').forEach(p => {
                p.classList.toggle('active', p.id === 'page-focus');
            });
            if (typeof loadFocusPage === 'function') loadFocusPage();
        }

        // Prefer the dedicated duration picker flow (custom timer modal)
        if (typeof window.openFocusDurationForTask === 'function') {
            window.openFocusDurationForTask(resolvedTask.id, resolvedTask.title);
            showToast('info', 'Focus Mode', `Choose duration for: ${resolvedTask.title}`);
            return;
        }

        // Fallback: older flow (auto-start after navigation)
        localStorage.setItem('focusTaskId', resolvedTask.id);
        localStorage.setItem('focusTaskTitle', resolvedTask.title);
        showToast('info', 'Focus Mode', `Starting focus session for: ${resolvedTask.title}`);
    };

    if (task) {
        proceed(task);
    } else {
        // Async fallback to DataStore
        ProductivityData.DataStore.getTask(taskId).then(t => proceed(t)).catch(() => proceed(null));
    }
}

async function updateGoalProgress(goalId) {
    // Placeholder for goal progress update
    // This would update the linked goal's progress
    // Debug removed
}

function formatTaskDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

    const daysUntil = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    if (daysUntil > 0 && daysUntil <= 7) return `In ${daysUntil} days`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(task) {
    if (!task.dueDate || task.status === 'completed') return false;
    const today = new Date().toISOString().split('T')[0];
    return task.dueDate < today;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function setupTaskDragDrop(container) {
    // List view drag and drop setup
    container.querySelectorAll('.task-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.dataset.taskId);
            item.classList.add('dragging');
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });
    });
}

// ============================================================================
// TASK LIST MANAGEMENT
// ============================================================================
let editingTaskList = null;

function openTaskListModal(taskList = null) {
    editingTaskList = taskList;

    const modal = document.getElementById('task-list-modal');
    if (!modal) return;

    const titleEl = document.getElementById('task-list-modal-title');
    const nameInput = document.getElementById('task-list-name');
    const saveBtn = document.getElementById('save-task-list-btn');
    const deleteBtn = document.getElementById('delete-task-list-btn');

    if (titleEl) titleEl.textContent = taskList ? 'Edit List' : 'Create New List';
    if (nameInput) nameInput.value = taskList?.name || '';
    if (saveBtn) saveBtn.textContent = taskList ? 'Update List' : 'Create List';
    if (deleteBtn) deleteBtn.style.display = taskList ? '' : 'none';

    // Reset color selection
    document.querySelectorAll('#task-list-colors .color-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.color === (taskList?.color || '#6366f1')) {
            btn.classList.add('active');
        }
    });

    // Reset icon selection
    document.querySelectorAll('#task-list-icons .icon-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.icon === (taskList?.icon || 'list')) {
            btn.classList.add('active');
        }
    });

    modal.classList.add('active');
    nameInput?.focus();
}

function closeTaskListModal() {
    const modal = document.getElementById('task-list-modal');
    if (modal) modal.classList.remove('active');
    editingTaskList = null;
}

function setupTaskListModalListeners() {
    const modal = document.getElementById('task-list-modal');
    if (!modal) return;

    // Close button
    modal.querySelector('.close-modal')?.addEventListener('click', closeTaskListModal);
    modal.querySelector('.cancel-modal')?.addEventListener('click', closeTaskListModal);

    // Color button selection
    document.querySelectorAll('#task-list-colors .color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#task-list-colors .color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Icon button selection
    document.querySelectorAll('#task-list-icons .icon-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#task-list-icons .icon-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Save button
    document.getElementById('save-task-list-btn')?.addEventListener('click', saveTaskList);

    // Delete button (only visible when editing)
    document.getElementById('delete-task-list-btn')?.addEventListener('click', async () => {
        if (!editingTaskList?.id) return;
        await deleteTaskList(editingTaskList.id);
        closeTaskListModal();
    });
}

async function saveTaskList() {
    const nameInput = document.getElementById('task-list-name');
    const name = nameInput?.value.trim();

    if (!name) {
        showToast('error', 'Validation Error', 'Please enter a list name.');
        return;
    }

    const activeColorBtn = document.querySelector('#task-list-colors .color-btn.active');
    const activeIconBtn = document.querySelector('#task-list-icons .icon-btn.active');

    const color = activeColorBtn?.dataset.color || '#6366f1';
    const icon = activeIconBtn?.dataset.icon || 'list';

    const listData = {
        id: editingTaskList?.id,
        name,
        color,
        icon,
        isVisible: editingTaskList?.isVisible ?? true
    };

    const taskList = new ProductivityData.TaskList(listData);

    try {
        await ProductivityData.DataStore.saveTaskList(taskList);
        closeTaskListModal();
        showToast('success', editingTaskList ? 'List Updated' : 'List Created', name);

        // If task modal is open, refresh its list dropdown.
        await refreshActiveTaskModalLists(taskList.id);

        // Refresh views if needed
        if (typeof refreshScheduleFilters === 'function') {
            refreshScheduleFilters();
        }
    } catch (error) {
        console.error('Failed to save task list:', error);
        showToast('error', 'Save Failed', 'Could not save the list.');
    }
}

async function deleteTaskList(listId) {
    const ok = await confirmDialog('Are you sure you want to delete this list? Tasks in this list will not be deleted but will lose their list assignment.', {
        title: 'Delete List',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!ok) return;

    try {
        await ProductivityData.DataStore.deleteTaskList(listId);
        showToast('success', 'List Deleted', 'The list has been deleted.');

        // If task modal is open, refresh its list dropdown.
        await refreshActiveTaskModalLists(null);

        // Refresh views if needed
        if (typeof refreshScheduleFilters === 'function') {
            refreshScheduleFilters();
        }
    } catch (error) {
        console.error('Failed to delete task list:', error);
        showToast('error', 'Delete Failed', 'Could not delete the list.');
    }
}

// Initialize task list modal listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupTaskListModalListeners();
    setupFinishedTasksToggle();
});

// Setup finished tasks show/hide toggle
function setupFinishedTasksToggle() {
    const toggleBtn = document.getElementById('toggle-completed-btn');
    const completedList = document.getElementById('completed-tasks');

    if (!toggleBtn || !completedList) return;

    // Load saved visibility state (default: hidden)
    const isVisible = localStorage.getItem('showFinishedTasks') === 'true';

    // Apply initial state
    if (isVisible) {
        completedList.classList.remove('hidden');
        toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
        toggleBtn.title = 'Hide finished tasks';
    } else {
        completedList.classList.add('hidden');
        toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        toggleBtn.title = 'Show finished tasks';
    }

    // Toggle on click
    toggleBtn.addEventListener('click', () => {
        const isCurrentlyHidden = completedList.classList.contains('hidden');

        if (isCurrentlyHidden) {
            completedList.classList.remove('hidden');
            toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
            toggleBtn.title = 'Hide finished tasks';
            localStorage.setItem('showFinishedTasks', 'true');
        } else {
            completedList.classList.add('hidden');
            toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
            toggleBtn.title = 'Show finished tasks';
            localStorage.setItem('showFinishedTasks', 'false');
        }
    });
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================
window.TaskState = TaskState;
window.loadTasks = loadTasks;
window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTask = saveTask;
window.toggleTask = toggleTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.viewTask = viewTask;
window.closeTaskDetails = closeTaskDetails;
window.toggleSubtask = toggleSubtask;
window.quickAddTask = quickAddTask;
window.addSubtask = addSubtask;
window.removeSubtask = removeSubtask;
window.toggleTaskSelection = toggleTaskSelection;
window.bulkComplete = bulkComplete;
window.bulkDelete = bulkDelete;
window.startFocusOnTask = startFocusOnTask;
window.handleBoardDragStart = handleBoardDragStart;
window.handleBoardDragOver = handleBoardDragOver;
window.handleBoardDrop = handleBoardDrop;
window.openTaskListModal = openTaskListModal;
window.closeTaskListModal = closeTaskListModal;
window.postponeTaskToToday = postponeTaskToToday;

// ============================================================================
// POSTPONE TASK TO TODAY
// ============================================================================
async function postponeTaskToToday(taskId) {
    const today = new Date().toISOString().split('T')[0];

    const task = TaskState.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.dueDate = today;
    task.updatedAt = new Date().toISOString();

    await ProductivityData.DataStore.saveTask(task);

    // Refresh view
    refreshTaskView();
    updateTaskStats();

    showToast('success', 'Task Postponed', 'Task moved to today');
}

// ============================================================================
// FINISH TASK AND SEND TO SPACED REPETITION REVIEW
// ============================================================================
async function finishAndSendToReview(taskId) {
    let task = TaskState.tasks.find(t => t.id === taskId);
    if (!task) {
        // Fallback: fetch from DataStore (e.g. called from dashboard before Tasks page visited)
        try {
            task = await ProductivityData.DataStore.getTask(taskId);
            if (task) TaskState.tasks.push(task); // Cache it for the modal
        } catch (_) { /* ignore */ }
    }
    if (!task) {
        showToast('error', 'Error', 'Could not find the task.');
        return;
    }

    // Show modal to configure the review item
    showFinishAndReviewModal(task);
}

function showFinishAndReviewModal(task) {
    // Remove existing modal if any
    const existingModal = document.querySelector('.finish-review-modal');
    if (existingModal) existingModal.remove();

    const categoryLabels = {
        'tomorrow': 'Tomorrow (1 day)',
        '3days': '3 Days',
        'week': '1 Week'
    };

    const modal = document.createElement('div');
    modal.className = 'modal finish-review-modal active';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-backdrop" data-action="close-finish-review"></div>
        <div class="modal-content finish-review-modal-content">
            <div class="finish-review-header">
                <div class="finish-review-icon">
                    <i class="fas fa-graduation-cap"></i>
                </div>
                <h2>Finish & Send to Review</h2>
                <p class="finish-review-subtitle">
                    <i class="fas fa-brain"></i> 
                    <strong>Spaced Repetition</strong> helps you remember what you learned by reviewing it at optimal intervals.
                </p>
            </div>
            
            <div class="finish-review-body">
                <div class="finish-review-task-preview">
                    <div class="preview-label">Task being completed:</div>
                    <div class="preview-title">${escapeHtml(task.title)}</div>
                    ${task.description ? `<div class="preview-desc">${escapeHtml(task.description)}</div>` : ''}
                </div>
                
                <div class="finish-review-form">
                    <div class="form-group">
                        <label for="review-title">
                            <i class="fas fa-heading"></i> Review Title
                        </label>
                        <input type="text" id="review-title" 
                               value="${escapeHtml(task.title)}" 
                               placeholder="What do you want to remember?">
                    </div>
                    
                    <div class="form-group">
                        <label for="review-content">
                            <i class="fas fa-align-left"></i> Key Points to Remember
                        </label>
                        <textarea id="review-content" rows="4" 
                                  placeholder="Write down the main concepts, formulas, or facts you want to memorize...">${escapeHtml(task.description || '')}</textarea>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <i class="fas fa-clock"></i> First Review Schedule
                        </label>
                        <div class="review-schedule-options">
                            <button type="button" class="schedule-option active" data-category="tomorrow">
                                <i class="fas fa-calendar-day"></i>
                                <span>Tomorrow</span>
                                <small>Best for fresh content</small>
                            </button>
                            <button type="button" class="schedule-option" data-category="3days">
                                <i class="fas fa-calendar-week"></i>
                                <span>3 Days</span>
                                <small>Already familiar</small>
                            </button>
                            <button type="button" class="schedule-option" data-category="week">
                                <i class="fas fa-calendar-alt"></i>
                                <span>1 Week</span>
                                <small>Quick refresh</small>
                            </button>
                        </div>
                    </div>
                    
                    <div class="spaced-repetition-info">
                        <div class="info-header">
                            <i class="fas fa-info-circle"></i>
                            <span>How Spaced Repetition Works</span>
                        </div>
                        <div class="info-content">
                            <div class="info-step">
                                <span class="step-num">1</span>
                                <span>Review tomorrow → moves to 3 days</span>
                            </div>
                            <div class="info-step">
                                <span class="step-num">2</span>
                                <span>Review after 3 days → moves to 1 week</span>
                            </div>
                            <div class="info-step">
                                <span class="step-num">3</span>
                                <span>Review after 1 week → Mastered! 🎉</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="finish-review-footer">
                <button type="button" class="btn-cancel" data-action="close-finish-review">
                    Cancel
                </button>
                <button type="button" class="btn-complete-only" data-action="complete-only">
                    <i class="fas fa-check"></i> Just Complete
                </button>
                <button type="button" class="btn-finish-review" data-action="finish-and-review">
                    <i class="fas fa-graduation-cap"></i> Complete & Add to Review
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Category selection
    let selectedCategory = 'tomorrow';
    modal.querySelectorAll('.schedule-option').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.schedule-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedCategory = btn.dataset.category;
        });
    });

    // Close modal handlers
    const closeModal = () => modal.remove();
    modal.querySelectorAll('[data-action="close-finish-review"]').forEach(el => {
        el.addEventListener('click', closeModal);
    });

    // Complete only (no review)
    modal.querySelector('[data-action="complete-only"]').addEventListener('click', async () => {
        await completeTaskOnly(task.id);
        closeModal();
    });

    // Complete and add to review
    modal.querySelector('[data-action="finish-and-review"]').addEventListener('click', async () => {
        const title = modal.querySelector('#review-title').value.trim();
        const content = modal.querySelector('#review-content').value.trim();

        if (!title) {
            modal.querySelector('#review-title').focus();
            showToast('error', 'Title Required', 'Please enter a title for the review item.');
            return;
        }

        if (!content) {
            modal.querySelector('#review-content').focus();
            showToast('error', 'Content Required', 'Please add some key points to remember.');
            return;
        }

        await completeTaskAndAddToReview(task.id, {
            title,
            content,
            category: selectedCategory,
            sourceTask: {
                id: task.id,
                title: task.title,
                completedAt: new Date().toISOString()
            }
        });
        closeModal();
    });

    // Focus title input
    setTimeout(() => modal.querySelector('#review-title').focus(), 100);
}

async function completeTaskOnly(taskId) {
    const task = TaskState.tasks.find(t => t.id === taskId);
    if (!task) return;

    const wasCompleted = task.status === 'completed';
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();

    await ProductivityData.DataStore.saveTask(task);

    // Update daily stats
    if (!wasCompleted) {
        try {
            await ProductivityData.ProductivityCalculator.updateDailyStats('task_completed');
        } catch (err) {
            console.warn('[Tasks] Could not update stats:', err);
        }
    }

    refreshTaskView();
    updateTaskStats();
    showToast('success', 'Task Completed', 'Great job finishing this task!');
}

async function completeTaskAndAddToReview(taskId, reviewData) {
    const task = TaskState.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Complete the task
    const wasCompleted = task.status === 'completed';
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();

    await ProductivityData.DataStore.saveTask(task);

    // Update daily stats
    if (!wasCompleted) {
        try {
            await ProductivityData.ProductivityCalculator.updateDailyStats('task_completed');
        } catch (err) {
            console.warn('[Tasks] Could not update stats:', err);
        }
    }

    // Create and save the revision item
    const revision = new ProductivityData.RevisionItem({
        title: reviewData.title,
        content: reviewData.content,
        category: reviewData.category,
        source: {
            type: 'task',
            taskId: task.id,
            taskTitle: task.title
        },
        color: task.color || '#8b5cf6',
        notes: `From completed task: ${task.title}`
    });

    await ProductivityData.DataStore.saveRevision(revision);

    // Update UI
    refreshTaskView();
    updateTaskStats();

    // Update revision badge if visible
    if (window.RevisionSystem) {
        window.RevisionSystem.updateBadge();
    }

    showToast('success', 'Task Completed & Added to Review',
        `"${reviewData.title}" will appear in your To Review page. Keep up the great learning!`);

    // Offer to navigate to revisions page
    setTimeout(() => {
        if (confirm('Would you like to go to the To Review page now?')) {
            if (typeof navigateTo === 'function') {
                navigateTo('revisions');
            }
        }
    }, 500);
}

window.finishAndSendToReview = finishAndSendToReview;
window.deleteTaskList = deleteTaskList;
window.renderGridView = renderGridView;

// Task Management module loaded
