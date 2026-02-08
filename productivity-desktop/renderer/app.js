/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - MAIN APPLICATION
 * ============================================================================
 * 
 * Core application logic handling navigation, initialization, and UI updates
 */

// ============================================================================
// APPLICATION STATE
// ============================================================================

const App = {
    currentPage: 'dashboard',
    settings: null,
    isInitialized: false,

    // Motivational quotes for focus mode
    quotes: [
        { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
        { text: "It's not that I'm so smart, it's just that I stay with problems longer.", author: "Albert Einstein" },
        { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
        { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
        { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
        { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
        { text: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
        { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
        { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
        { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
        { text: "There are no shortcuts to any place worth going.", author: "Beverly Sills" },
        { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" }
    ]
};

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
        if (rect.right > viewportWidth + 1 || rect.width > viewportWidth + 1) {
            el.classList.add('overflow-debug');
            const id = el.id ? `#${el.id}` : '';
            const cls = el.classList && el.classList.length ? `.${Array.from(el.classList).join('.')}` : '';
            const label = `${el.tagName.toLowerCase()}${id}${cls}`;
            const right = Math.round(rect.right);
            const width = Math.round(rect.width);
            const overBy = Math.max(0, right - viewportWidth);
            overflowing.push({ el: label, width, right, overBy });
        }
    });

    if (overflowing.length) {
        overflowing.sort((a, b) => (b.overBy - a.overBy) || (b.right - a.right) || (b.width - a.width));
        console.warn('Overflow elements (right > viewport):', overflowing.slice(0, 20));
        if (overflowing.length > 20) {
            console.warn(`Overflow elements total: ${overflowing.length}`);
        }
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Debug removed

    try {
        // Load settings
        App.settings = await ProductivityData.DataStore.getSettings();

        // Apply theme
        applyTheme(App.settings.theme);
        applyAccentColor(App.settings.accentColor);

        // Initialize UI
        initializeNavigation();
        initializeModals();
        initializeQuickActions();
        initializeSettings();
        loadSettingsPage(); // Populate settings form with saved data
        setupFAB();
        setupQuickEntry();
        setupHabitTrackerCalendar();
        window.addEventListener('resize', highlightOverflowElements);

        // Sync notification preferences with NotificationState early
        if (window.NotificationState && App.settings.notificationPreferences) {
            Object.assign(window.NotificationState.preferences, App.settings.notificationPreferences);
        }

        // Initialize audio context on first user interaction
        document.body.addEventListener('click', () => {
            if (window.NotificationSounds) {
                window.NotificationSounds.init();
            }
        }, { once: true });

        // Load dashboard data
        await loadDashboard();

        // Initialize motivation system (streaks, XP, achievements)
        if (window.MotivationSystem) {
            await window.MotivationSystem.init();
            // Render activity heatmap
            window.MotivationSystem.renderActivityHeatmap('activity-heatmap', 12);

            // Check for XP decay (commitment feature)
            if (typeof window.MotivationSystem.checkXPDecay === 'function') {
                window.MotivationSystem.checkXPDecay();
            }
        }

        // Initialize accountability check-in system
        if (typeof window.initAccountabilityCheckin === 'function') {
            window.initAccountabilityCheckin();
        }

        // Check for expired goal abandonments
        if (typeof checkExpiredAbandonments === 'function') {
            checkExpiredAbandonments();
        }

        // highlightOverflowElements(); // debug only

        // Update date display
        updateDateDisplay();

        // Set up auto-refresh
        setInterval(updateDateDisplay, 60000); // Update every minute
        setInterval(loadDashboard, 300000); // Refresh dashboard every 5 minutes

        App.isInitialized = true;
        // Debug removed

    } catch (error) {
        console.error('❌ Initialization failed:', error);
        showToast('error', 'Initialization Error', 'Failed to load application data.');
    }

    // Wire up desktop app updater UI (outside try-catch so it works even if init partially fails)
    try { setupAppUpdater(); } catch (e) { console.warn('setupAppUpdater error:', e); }
});

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
    window.habitTrackerInstance = widget;
}

// ============================================================================
// NAVIGATION
// ============================================================================

function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const viewAllLinks = document.querySelectorAll('.view-all');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navigateTo(page);
        });
    });

    viewAllLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Update pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `page-${page}`);
    });

    App.currentPage = page;

    // Clear badge for the visited page
    clearBadgeForPage(page);

    // Load page-specific data
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'schedule':
            if (typeof loadSchedule === 'function') loadSchedule();
            break;
        case 'tasks':
            if (typeof loadTasks === 'function') loadTasks();
            break;
        case 'goals':
            if (typeof loadGoals === 'function') loadGoals();
            break;
        case 'challenges':
            if (typeof loadChallengesPage === 'function') loadChallengesPage();
            break;
        case 'focus':
            if (typeof loadFocusPage === 'function') loadFocusPage();
            // Smart focus start: auto-start with first incomplete task
            handleSmartFocusStart();
            break;
        case 'analytics':
            if (typeof loadAnalyticsPage === 'function') loadAnalyticsPage();
            break;
        case 'day-review':
            if (typeof loadDayReviewPage === 'function') loadDayReviewPage();
            break;
        case 'blocker':
            if (typeof loadBlocker === 'function') loadBlocker();
            break;
        case 'idle':
            if (typeof loadIdlePage === 'function') loadIdlePage();
            break;
        case 'notifications':
            loadNotificationsPage();
            break;
        case 'revisions':
            if (window.RevisionSystem) window.RevisionSystem.init();
            break;
        case 'settings':
            loadSettingsPage();
            break;
    }
}

// Smart focus start: auto-start session with first incomplete task or prompt to create one
async function handleSmartFocusStart() {
    try {
        // If a task explicitly triggered focus (via Tasks/Dashboard), don't override it.
        if (window.__skipSmartFocusOnce) {
            window.__skipSmartFocusOnce = false;
            return;
        }

        // Basic re-entrancy guard (prevents loops when focus navigation triggers logic multiple times).
        if (window.__smartFocusInProgress) return;
        window.__smartFocusInProgress = true;

        // If a task was explicitly queued for focus by other flows, don't auto-pick a different one.
        try {
            const hasPending = !!(window.FocusState?.pendingLinkedTaskId);
            const hasStored = !!(localStorage.getItem('focusTaskId') || localStorage.getItem('focusTaskTitle'));
            if (hasPending || hasStored) return;
        } catch (_) {
            // ignore
        }

        // Check if there's already an active focus session
        if (window.FocusState && window.FocusState.isActive) {
            return; // Don't interrupt an active session
        }

        const tasks = await ProductivityData.DataStore.getTasks();
        const today = new Date().toISOString().split('T')[0];

        // Find first incomplete task prioritizing today's tasks
        const todayTasks = tasks.filter(t =>
            t.status !== 'completed' &&
            (t.dueDate === today || t.startDate === today)
        ).sort((a, b) => (b.priorityWeight || 0) - (a.priorityWeight || 0));

        const incompleteTasks = tasks.filter(t => t.status !== 'completed')
            .sort((a, b) => (b.priorityWeight || 0) - (a.priorityWeight || 0));

        const firstTask = todayTasks[0] || incompleteTasks[0];

        if (firstTask) {
            const taskId = firstTask.id;
            const taskTitle = firstTask.title || '';

            // Silently pre-select the task without opening any modal.
            try {
                if (window.FocusState) {
                    window.FocusState.pendingLinkedTaskId = taskId;
                    window.FocusState.pendingLinkedTaskTitle = taskTitle;
                } else {
                    localStorage.setItem('focusTaskId', taskId);
                    localStorage.setItem('focusTaskTitle', taskTitle);
                }
            } catch (_) {
                // ignore
            }

            // Update the task dropdown if available.
            try {
                const dropdown = document.getElementById('focus-task-dropdown');
                if (dropdown) dropdown.value = taskId;
            } catch (_) {
                // ignore
            }
        } else {
            // No tasks - show prompt to create one
            showSmartFocusCreateTaskPrompt();
        }
    } catch (error) {
        console.error('Smart focus start error:', error);
    } finally {
        window.__smartFocusInProgress = false;
    }
}

// Show prompt to create a task when no tasks exist
function showSmartFocusCreateTaskPrompt() {
    const focusPage = document.getElementById('page-focus');
    if (!focusPage) return;

    // Check if prompt already exists
    if (document.getElementById('smart-focus-prompt')) return;

    const prompt = document.createElement('div');
    prompt.id = 'smart-focus-prompt';
    prompt.className = 'smart-focus-prompt';
    prompt.innerHTML = `
        <div class="smart-focus-prompt-content">
            <i class="fas fa-tasks"></i>
            <h3>No tasks to focus on</h3>
            <p>Create a task to get started with your focus session</p>
            <div class="smart-focus-quick-add">
                <input type="text" id="smart-focus-task-input" placeholder="What do you want to work on?" autocomplete="off">
                <button class="btn-primary" id="smart-focus-create-btn">
                    <i class="fas fa-plus"></i> Create & Start
                </button>
            </div>
        </div>
    `;

    // Insert at top of focus page
    focusPage.insertBefore(prompt, focusPage.firstChild);

    // Handle create task
    const input = document.getElementById('smart-focus-task-input');
    const btn = document.getElementById('smart-focus-create-btn');

    const createAndStart = async () => {
        const title = input.value.trim();
        if (!title) return;

        btn.disabled = true;
        try {
            const task = new ProductivityData.Task({
                title,
                dueDate: new Date().toISOString().split('T')[0],
                priority: 'medium',
                status: 'not-started'
            });
            await ProductivityData.DataStore.saveTask(task);

            // Remove prompt
            prompt.remove();

            // Start focus session with new task
            if (typeof startFocusOnTask === 'function') {
                startFocusOnTask(task.id);
            } else if (typeof window.startFocusSession === 'function') {
                window.startFocusSession(task.id, task.title);
            }
        } catch (error) {
            console.error('Failed to create task for focus:', error);
            showToast('error', 'Error', 'Failed to create task');
            btn.disabled = false;
        }
    };

    btn.addEventListener('click', createAndStart);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createAndStart();
    });
    input.focus();
}

// Clear badge when user visits a tab
function clearBadgeForPage(page) {
    if (page === 'tasks') {
        const tasksBadge = document.getElementById('tasks-badge');
        if (tasksBadge) {
            tasksBadge.style.display = 'none';
        }
        // Mark tasks as seen
        chrome.storage.local.set({ tasksLastSeen: Date.now() });
    } else if (page === 'schedule') {
        const upcomingBadge = document.getElementById('upcoming-badge');
        if (upcomingBadge) {
            upcomingBadge.style.display = 'none';
        }
        // Mark schedule as seen
        chrome.storage.local.set({ scheduleLastSeen: Date.now() });
    }
}

// ============================================================================
// DASHBOARD
// ============================================================================

async function loadDashboard() {
    // Debug removed

    try {
        // Load all required data in parallel
        const [
            settings,
            todayStats,
            streakData,
            priorityTasks,
            allTasks,
            todayEvents,
            activeGoals,
            weekStats
        ] = await Promise.all([
            ProductivityData.DataStore.getSettings(),
            ProductivityData.DataStore.getDailyStats(),
            ProductivityData.DataStore.getStreakData(),
            ProductivityData.DataStore.getPriorityTasks(5),
            ProductivityData.DataStore.getTasks(),
            ProductivityData.DataStore.getEventsForDate(ProductivityData.getTodayDate()),
            ProductivityData.DataStore.getActiveGoals(),
            ProductivityData.DataStore.calculateWeeklyStats()
        ]);

        App.settings = settings;

        // Update greeting
        updateGreeting(settings.userName);

        // Update productivity score
        updateProductivityScore(todayStats, settings);

        // Update quick stats in sidebar
        updateQuickStats(streakData, todayStats);

        // Update today's schedule (tasks + imported/legacy schedule events)
        const todayAgenda = buildTodayAgendaItems(ProductivityData.getTodayDate(), todayEvents, allTasks);
        renderTodaySchedule(todayAgenda);

        // Populate TaskState so dashboard action handlers can access task data
        if (window.TaskState) {
            window.TaskState.tasks = allTasks;
            if (!window.TaskState.taskLists || window.TaskState.taskLists.length === 0) {
                try {
                    window.TaskState.taskLists = await ProductivityData.DataStore.getTaskLists();
                } catch (_) { /* ignore */ }
            }
        }

        // Update today's tasks (quick list card)
        setupTodayTasksCardHandlers();
        renderTodayTasksCard(allTasks);

        // Update priority tasks
        renderPriorityTasks(priorityTasks);

        // Update upcoming deadlines
        await renderUpcomingDeadlines();

        // Update weekly progress chart
        if (weekStats && weekStats.dailyStats) {
            renderWeeklyChart(weekStats);
        }

        // Update goals preview
        renderGoalsPreview(activeGoals);

        // Update new dashboard widgets
        await renderReviewWidget();

        // Update challenges widget
        await renderDashboardChallengesWidget();

        // Update best record on dashboard
        await loadDashboardBestRecord();

        // Update badges
        updateBadges();

        // Update notification badge count
        await updateNotificationCount();

    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

function getDashboardTodayYMD() {
    try {
        if (typeof ProductivityData?.getTodayDate === 'function') return ProductivityData.getTodayDate();
    } catch (e) {
        // ignore
    }
    return new Date().toISOString().split('T')[0];
}

function normalizeYMD(value) {
    if (!value) return '';
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
}

function normalizeTaskLinkUrlInDashboard(raw) {
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

async function openExternalUrlFromDashboard(url) {
    const normalized = normalizeTaskLinkUrlInDashboard(url);
    if (!normalized) {
        showToast('error', 'Invalid Link', 'Please enter a valid http(s) or mailto link.');
        return false;
    }

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

function renderTodayTasksCard(allTasks) {
    const list = document.getElementById('today-tasks-list');
    if (!list) return;

    const today = getDashboardTodayYMD();
    const tasks = Array.isArray(allTasks) ? allTasks : [];

    const todayTasks = tasks
        .filter(t => {
            if (!t) return false;
            if (t.status === 'completed') return false;
            const due = normalizeYMD(t.dueDate);
            const start = normalizeYMD(t.startDate);
            return due === today || start === today;
        })
        .sort((a, b) => {
            const pa = (a.priorityWeight ?? 0);
            const pb = (b.priorityWeight ?? 0);
            if (pb !== pa) return pb - pa;
            const ta = (a.dueTime || a.startTime || '99:99');
            const tb = (b.dueTime || b.startTime || '99:99');
            if (ta !== tb) return String(ta).localeCompare(String(tb));
            return String(a.title || '').localeCompare(String(b.title || ''));
        })
        .slice(0, 8);

    if (todayTasks.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-list-check"></i>
                <p>No tasks planned for today</p>
                <button class="btn-secondary" id="today-tasks-open-modal-btn" style="margin-top:10px;">Add a task</button>
            </div>
        `;
        list.querySelector('#today-tasks-open-modal-btn')?.addEventListener('click', () => {
            const input = document.getElementById('today-tasks-input');
            if (input) {
                input.focus();
                return;
            }
            window.openTaskModal?.(null, 'not-started', { dueDate: today });
        });
        return;
    }

    // Get task lists for display
    const getListInfo = (listId) => {
        if (!listId || !window.TaskState?.taskLists) return null;
        return window.TaskState.taskLists.find(l => l.id === listId);
    };

    // Get focus time for task
    const getFocusTime = (taskId) => {
        if (!taskId || !window.TaskState?.focusTimeByTaskId) return 0;
        return window.TaskState.focusTimeByTaskId[taskId] || 0;
    };

    // Format focus time
    const formatFocusTime = (minutes) => {
        if (!minutes || minutes <= 0) return '';
        if (minutes < 60) return `${Math.round(minutes)}m`;
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    };

    list.innerHTML = todayTasks.map(task => {
        const time = task.dueTime || task.startTime || '';
        const listInfo = getListInfo(task.listId);
        const focusMinutes = getFocusTime(task.id);
        const focusTimeStr = formatFocusTime(focusMinutes);

        const metaParts = [];
        if (time) metaParts.push(`<span><i class="fas fa-clock"></i> ${escapeHtml(time)}</span>`);
        if (task.subject) metaParts.push(`<span><i class="fas fa-book"></i> ${escapeHtml(task.subject)}</span>`);
        if (listInfo) metaParts.push(`<span style="color: ${listInfo.color}"><i class="fas ${listInfo.icon || 'fa-folder'}"></i> ${escapeHtml(listInfo.name)}</span>`);
        if (task.tags && task.tags.length > 0) {
            metaParts.push(`<span><i class="fas fa-tag"></i> ${task.tags.slice(0, 2).map(t => escapeHtml(t)).join(', ')}</span>`);
        }
        if (focusTimeStr) metaParts.push(`<span class="task-focus-time"><i class="fas fa-stopwatch"></i> ${focusTimeStr}</span>`);

        const meta = metaParts.length ? `<div class="task-meta">${metaParts.join('')}</div>` : '<div class="task-meta"></div>';

        return `
            <li class="task-item ${task.status === 'completed' ? 'completed' : ''}" data-task-id="${task.id}">
                <div class="task-checkbox ${task.status === 'completed' ? 'checked' : ''}" data-action="toggle">
                    ${task.status === 'completed' ? '<i class="fas fa-check"></i>' : ''}
                </div>
                <div class="task-info" data-action="view">
                    <div class="task-title ${task.status === 'completed' ? 'strikethrough' : ''}">${escapeHtml(task.title)}</div>
                    ${meta}
                </div>
                <div class="task-priority ${task.priority || 'medium'}"></div>
                <div class="task-item-actions">
                    ${task.linkUrl ? `
                    <button class="btn-icon tiny" data-action="open-link" data-task-id="${task.id}" title="Open link">
                        <i class="fas fa-link"></i>
                    </button>` : ''}
                    <button class="btn-icon tiny" data-action="focus" data-task-id="${task.id}" title="Start Focus">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn-icon tiny" data-action="edit" data-task-id="${task.id}" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon tiny highlight-green" data-action="review" data-task-id="${task.id}" title="Send to Review">
                        <i class="fas fa-graduation-cap"></i>
                    </button>
                    <button class="btn-icon tiny danger" data-action="delete" data-task-id="${task.id}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </li>
        `;
    }).join('');

    // Event delegation for task actions
    list.onclick = async (e) => {
        const item = e.target.closest('.task-item');
        if (!item) return;

        const taskId = item.dataset.taskId;
        if (!taskId) return;

        const actionEl = e.target.closest('[data-action]');
        const action = actionEl?.dataset.action;

        if (action === 'open-link') {
            e.stopPropagation();
            let task = window.TaskState?.tasks?.find?.(t => t.id === taskId);
            if (!task) {
                try { task = await ProductivityData.DataStore.getTask(taskId); } catch (_) { /* ignore */ }
            }
            if (!task?.linkUrl) {
                showToast('info', 'No Link', 'This task has no link.');
                return;
            }
            await openExternalUrlFromDashboard(task.linkUrl);
            return;
        }

        if (action === 'focus') {
            e.stopPropagation();
            if (typeof startFocusOnTask === 'function' || typeof window.startFocusOnTask === 'function') {
                (window.startFocusOnTask || startFocusOnTask)(taskId);
            } else {
                navigateTo('focus');
            }
            return;
        }

        if (action === 'edit') {
            e.stopPropagation();
            // Always try DataStore first for reliability from dashboard context
            if (typeof window.openTaskModal === 'function') {
                let task = window.TaskState?.tasks?.find?.(t => t.id === taskId);
                if (!task) {
                    try { task = await ProductivityData.DataStore.getTask(taskId); } catch (_) { /* ignore */ }
                }
                if (task) {
                    window.openTaskModal(task);
                } else if (typeof editTask === 'function') {
                    editTask(taskId);
                }
            } else if (typeof editTask === 'function') {
                editTask(taskId);
            }
            return;
        }

        if (action === 'review') {
            e.stopPropagation();
            const reviewFn = window.finishAndSendToReview || (typeof finishAndSendToReview === 'function' ? finishAndSendToReview : null);
            if (reviewFn) {
                // Ensure TaskState has the task so finishAndSendToReview can find it
                if (window.TaskState?.tasks && !window.TaskState.tasks.find(t => t.id === taskId)) {
                    try {
                        const task = await ProductivityData.DataStore.getTask(taskId);
                        if (task) window.TaskState.tasks.push(task);
                    } catch (_) { /* ignore */ }
                }
                reviewFn(taskId);
            } else {
                showToast('info', 'Unavailable', 'Review feature is loading, please try again.');
            }
            return;
        }

        if (action === 'delete') {
            e.stopPropagation();
            if (confirm('Delete this task?')) {
                await ProductivityData.DataStore.deleteTask(taskId);
                await loadDashboard();
                showToast('success', 'Deleted', 'Task deleted successfully');
            }
            return;
        }

        // Click on task text/info should NOT complete it.
        if (action === 'view' || !action) {
            e.stopPropagation();
            if (typeof window.openTaskModal === 'function') {
                let task = window.TaskState?.tasks?.find?.(t => t.id === taskId);
                if (!task) {
                    try { task = await ProductivityData.DataStore.getTask(taskId); } catch (_) { /* ignore */ }
                }
                if (task) {
                    window.openTaskModal(task);
                } else if (typeof editTask === 'function') {
                    editTask(taskId);
                }
            } else if (typeof editTask === 'function') {
                editTask(taskId);
            }
            return;
        }

        // Only toggle completion when user clicks the checkbox.
        if (action !== 'toggle') return;

        e.stopPropagation();
        const checkbox = item.querySelector('.task-checkbox');
        const title = item.querySelector('.task-title');
        const isCurrentlyCompleted = item.classList.contains('completed');

        if (isCurrentlyCompleted) {
            item.classList.remove('completed');
            checkbox?.classList.remove('checked');
            if (checkbox) checkbox.innerHTML = '';
            title?.classList.remove('strikethrough');
        } else {
            item.classList.add('completed');
            checkbox?.classList.add('checked');
            if (checkbox) checkbox.innerHTML = '<i class="fas fa-check"></i>';
            title?.classList.add('strikethrough');
        }

        await toggleTask(taskId);
    };
}

function setupTodayTasksCardHandlers() {
    const input = document.getElementById('today-tasks-input');
    const btn = document.getElementById('today-tasks-add-btn');
    if (!input || !btn) return;

    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';

    const submit = async () => {
        const raw = input.value?.trim();
        if (!raw) return;

        const today = getDashboardTodayYMD();
        input.value = '';

        // If user pastes a link in the dashboard quick-add, store it as linkUrl.
        let title = raw;
        let linkUrl = null;
        const urlMatch = raw.match(/\bhttps?:\/\/[^\s]+/i);
        if (urlMatch && urlMatch[0]) {
            linkUrl = normalizeTaskLinkUrlInDashboard(urlMatch[0]);
            title = title.replace(urlMatch[0], '').trim() || urlMatch[0];
        } else {
            // Also support bare domains like www.example.com
            const maybeBare = raw.match(/\bwww\.[^\s]+/i);
            if (maybeBare && maybeBare[0]) {
                linkUrl = normalizeTaskLinkUrlInDashboard(maybeBare[0]);
                title = title.replace(maybeBare[0], '').trim() || maybeBare[0];
            }
        }

        input.disabled = true;
        btn.disabled = true;
        try {
            const task = new ProductivityData.Task({
                title,
                linkUrl,
                dueDate: today,
                priority: 'medium',
                category: 'personal',
                status: 'not-started'
            });

            await ProductivityData.DataStore.saveTask(task);
            try {
                await ProductivityData.ProductivityCalculator.updateDailyStats('task_created');
            } catch (e) {
                // ignore
            }

            if (App.currentPage === 'dashboard') {
                await loadDashboard();
            }
        } catch (error) {
            console.error('[App] Failed to quick add today task:', error);
            showToast('error', 'Save Failed', 'Could not add the task.');
        } finally {
            input.disabled = false;
            btn.disabled = false;
            input.focus();
        }
    };

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        }
    });
}

async function updateNotificationCount() {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Check when user last saw notifications
        const lastSeen = await new Promise(resolve => {
            chrome.storage.local.get(['notificationsLastSeen'], result => {
                resolve(result.notificationsLastSeen || 0);
            });
        });

        // If user has seen notifications today, don't show badge
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (lastSeen > todayStart.getTime()) {
            updateNotificationBadge(0);
            return;
        }

        let count = 0;

        // Count due/overdue tasks
        const tasks = await ProductivityData.DataStore.getTasks();
        count += tasks.filter(t => t.dueDate <= today && t.status !== 'completed').length;

        updateNotificationBadge(count);
    } catch (e) {
        console.error('Error updating notification count:', e);
    }
}

function updateGreeting(userName) {
    const hour = new Date().getHours();
    let greeting = 'Good Evening';

    if (hour < 12) greeting = 'Good Morning';
    else if (hour < 17) greeting = 'Good Afternoon';

    const greetingEl = document.getElementById('greeting-text');
    if (greetingEl) {
        greetingEl.textContent = `${greeting}, ${userName || 'Scholar'}!`;
    }
}

function updateDateDisplay() {
    const dateEl = document.getElementById('date-display');
    if (dateEl) {
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        dateEl.textContent = new Date().toLocaleDateString('en-US', options);
    }
}

function updateProductivityScore(stats, settings) {
    // Calculate score if not already done
    const score = stats.productivityScore || stats.calculateProductivityScore(settings);

    // Update score display
    const scoreEl = document.getElementById('productivity-score');
    const scoreCircle = document.getElementById('score-circle');

    if (scoreEl) {
        animateNumber(scoreEl, 0, score, 1000);
    }

    if (scoreCircle) {
        // Circle circumference is 283 (2 * PI * 45)
        const offset = 283 - (283 * score / 100);
        setTimeout(() => {
            scoreCircle.style.strokeDashoffset = offset;
        }, 100);
    }

    // Update breakdown
    const tasksCompletedEl = document.getElementById('tasks-completed');
    const focusHoursEl = document.getElementById('focus-hours');
    const currentStreakEl = document.getElementById('current-streak');

    if (tasksCompletedEl) tasksCompletedEl.textContent = stats.tasksCompleted;
    if (focusHoursEl) focusHoursEl.textContent = (stats.focusMinutes / 60).toFixed(1);
}

function updateQuickStats(streakData, todayStats) {
    const streakEl = document.getElementById('streak-count');
    const hoursEl = document.getElementById('today-hours');
    const currentStreakDisplay = document.getElementById('current-streak');

    if (streakEl) streakEl.textContent = streakData.currentStreak;
    if (hoursEl) hoursEl.textContent = ProductivityData.formatMinutes(todayStats.focusMinutes);
    if (currentStreakDisplay) currentStreakDisplay.textContent = streakData.currentStreak;
}

function renderTodaySchedule(events) {
    const container = document.getElementById('today-schedule');
    if (!container) return;

    if (events.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-day"></i>
                <p>No schedule yet for today</p>
                <button class="btn-secondary" id="dashboard-add-task-btn" style="margin-top:10px;">Add your first task</button>
            </div>
        `;

        container.querySelector('#dashboard-add-task-btn')?.addEventListener('click', () => {
            window.openTaskModal?.(null, 'not-started', { dueDate: ProductivityData.getTodayDate() });
        });
        return;
    }

    // Sort events by start time
    events.sort((a, b) => a.startTime.localeCompare(b.startTime));

    container.innerHTML = events.map(event => `
        <div class="timeline-item" data-task-id="${event.taskId || ''}">
            <span class="timeline-time">${formatTime(event.startTime)}</span>
            <div class="timeline-content ${event.type}">
                <div class="timeline-title">${event.isTask ? '<i class="fas fa-tasks" style="margin-right:6px;opacity:0.85;"></i>' : ''}${escapeHtml(event.title)}</div>
                <div class="timeline-meta">
                    ${event.location ? `<i class="fas fa-map-marker-alt"></i> ${escapeHtml(event.location)}` : ''}
                    ${event.endTime ? `<span>${formatTime(event.startTime)} - ${formatTime(event.endTime)}</span>` : ''}
                </div>
            </div>
            ${event.isTask ? `
                <button class="btn-icon small timeline-focus-btn" data-task-id="${event.taskId}" title="Start Focus">
                    <i class="fas fa-play"></i>
                </button>
            ` : ''}
        </div>
    `).join('');

    // Add event listeners for focus buttons
    container.querySelectorAll('.timeline-focus-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskId = btn.dataset.taskId;
            if (typeof startFocusOnTask === 'function') {
                startFocusOnTask(taskId);
            } else {
                navigateTo('focus');
            }
        });
    });
}

function buildTodayAgendaItems(dateStr, scheduleEvents, tasks) {
    const items = [];

    for (const ev of (scheduleEvents || [])) {
        if (!ev?.startTime) continue;
        items.push({
            id: ev.id,
            title: ev.title || 'Untitled',
            type: ev.type || 'other',
            startTime: ev.startTime,
            endTime: ev.endTime || null,
            location: ev.location || '',
            isTask: false
        });
    }

    const datedTasks = (tasks || []).filter(t => {
        if (!t) return false;
        if (t.status === 'completed') return false;
        return t.startDate === dateStr || t.dueDate === dateStr;
    });

    for (const t of datedTasks) {
        const startTime = t.startTime || t.dueTime || '09:00';
        const endTime = t.dueTime || addMinutesToTime(startTime, t.estimatedMinutes || 30);
        items.push({
            id: `task-${t.id}`,
            taskId: t.id,
            title: t.title,
            type: 'task',
            startTime,
            endTime,
            location: t.subject || '',
            isTask: true
        });
    }

    return items;
}

function addMinutesToTime(timeHHmm, minutesToAdd) {
    if (!timeHHmm) return '09:30';
    const [h, m] = timeHHmm.split(':').map(Number);
    const total = (h * 60 + m) + (minutesToAdd || 0);
    const hh = Math.min(23, Math.floor(total / 60));
    const mm = ((total % 60) + 60) % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function renderPriorityTasks(tasks) {
    const container = document.getElementById('priority-tasks');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-tasks"></i>
                <p>No tasks yet. Add your first task to get started.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tasks.map(task => `
        <li class="task-item ${task.status === 'completed' ? 'completed' : ''}" data-task-id="${task.id}" style="cursor: pointer;">
            <div class="task-checkbox ${task.status === 'completed' ? 'checked' : ''}">
                ${task.status === 'completed' ? '<i class="fas fa-check"></i>' : ''}
            </div>
            <div class="task-info">
                <div class="task-title ${task.status === 'completed' ? 'strikethrough' : ''}">${escapeHtml(task.title)}</div>
                <div class="task-meta">
                    ${task.dueDate ? `<span><i class="fas fa-calendar"></i> ${formatDate(task.dueDate)}</span>` : ''}
                    ${task.subject ? `<span><i class="fas fa-book"></i> ${escapeHtml(task.subject)}</span>` : ''}
                </div>
            </div>
            <div class="task-priority ${task.priority}"></div>
        </li>
    `).join('');

    // Add click handler for entire task item row using event delegation
    container.onclick = async (e) => {
        const item = e.target.closest('.task-item');
        if (item) {
            e.stopPropagation();
            const taskId = item.dataset.taskId;

            // Immediately update UI for visual feedback
            const checkbox = item.querySelector('.task-checkbox');
            const title = item.querySelector('.task-title');
            const isCurrentlyCompleted = item.classList.contains('completed');

            if (isCurrentlyCompleted) {
                item.classList.remove('completed');
                checkbox.classList.remove('checked');
                checkbox.innerHTML = '';
                title.classList.remove('strikethrough');
            } else {
                item.classList.add('completed');
                checkbox.classList.add('checked');
                checkbox.innerHTML = '<i class="fas fa-check"></i>';
                title.classList.add('strikethrough');
            }

            // Toggle task in database
            await toggleTask(taskId);
        }
    };
}

async function renderUpcomingDeadlines() {
    const container = document.getElementById('upcoming-deadlines');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const items = [];

    // Get tasks with due dates
    const tasks = await ProductivityData.DataStore.getTasks();
    const upcomingTasks = tasks.filter(t => t.status !== 'completed' && t.dueDate);

    for (const task of upcomingTasks) {
        const daysUntil = task.daysUntilDue;
        items.push({
            type: 'task',
            title: task.title,
            subtitle: task.subject || task.category || 'Task',
            date: task.dueDate,
            daysUntil: daysUntil,
            isPinned: false
        });
    }

    // Get pinned countdown tasks
    try {
        const stored = await chrome.storage.local.get('taskCountdowns');
        const pinnedTaskIds = stored.taskCountdowns || [];

        if (pinnedTaskIds.length > 0) {
            for (const task of upcomingTasks) {
                if (!pinnedTaskIds.includes(task.id)) continue;
                items.push({
                    type: 'task',
                    title: task.title,
                    subtitle: task.subject || task.category || 'Task',
                    date: task.dueDate,
                    daysUntil: task.daysUntilDue,
                    isPinned: true
                });
            }
        }
    } catch (e) {
        console.error('Failed to load task countdowns:', e);
    }

    // Sort by days left (ascending), pinned items first if same days
    items.sort((a, b) => {
        if (a.daysUntil === b.daysUntil) {
            return a.isPinned ? -1 : 1;
        }
        return a.daysUntil - b.daysUntil;
    });

    const displayItems = items.slice(0, 6);

    if (displayItems.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-hourglass-half"></i>
                <p>No upcoming deadlines</p>
            </div>
        `;
        return;
    }

    container.innerHTML = displayItems.map(item => {
        let urgencyClass = '';
        let daysText = '';
        const daysUntil = item.daysUntil;

        if (daysUntil < 0) {
            urgencyClass = 'urgent';
            daysText = `${Math.abs(daysUntil)}d overdue`;
        } else if (daysUntil === 0) {
            urgencyClass = 'urgent';
            daysText = 'Today';
        } else if (daysUntil === 1) {
            urgencyClass = 'soon';
            daysText = 'Tomorrow';
        } else if (daysUntil <= 3) {
            urgencyClass = 'soon';
            daysText = `${daysUntil} days`;
        } else {
            daysText = `${daysUntil} days`;
        }

        return `
            <li class="deadline-item ${urgencyClass}">
                <span class="deadline-days">${item.isPinned ? '<i class="fas fa-thumbtack" style="font-size:0.7rem;margin-right:4px;"></i>' : ''}${daysText}</span>
                <div class="deadline-info">
                    <div class="deadline-title">${escapeHtml(item.title)}</div>
                    <div class="deadline-subject">${escapeHtml(item.subtitle)}</div>
                </div>
            </li>
        `;
    }).join('');
}

function renderWeeklyChart(weekStats) {
    const container = document.getElementById('weekly-chart');
    const totalHoursEl = document.getElementById('week-total-hours');
    const avgHoursEl = document.getElementById('week-avg-hours');

    if (!container) return;

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date().getDay();
    const weekDates = ProductivityData.getWeekDates();

    // Find max hours for scaling
    let maxMinutes = 60; // Minimum scale of 1 hour
    Object.values(weekStats.dailyStats).forEach(stats => {
        if (stats.focusMinutes > maxMinutes) maxMinutes = stats.focusMinutes;
    });

    container.innerHTML = weekDates.map((date, index) => {
        const stats = weekStats.dailyStats[date];
        const minutes = stats ? stats.focusMinutes : 0;
        const hours = (minutes / 60).toFixed(1);
        const heightPercent = (minutes / maxMinutes) * 100;
        const isToday = index === today;

        return `
            <div class="chart-bar">
                <div class="bar-fill ${isToday ? 'today' : ''}" style="height: ${heightPercent}%"></div>
                <span class="bar-label">${dayNames[index]}</span>
                <span class="bar-value">${hours}h</span>
            </div>
        `;
    }).join('');

    // Update totals
    if (totalHoursEl) totalHoursEl.textContent = `${weekStats.totalHours}h`;
    if (avgHoursEl) avgHoursEl.textContent = `${weekStats.avgHours}h`;
}

/**
 * Load and display best record card on the dashboard.
 */
async function loadDashboardBestRecord() {
    const container = document.getElementById('dashboard-best-record');
    if (!container) return;

    try {
        const allStats = await ProductivityData.DataStore.get('productivity_daily_stats', {});
        const today = new Date().toISOString().split('T')[0];
        const todayStats = allStats[today] || { focusMinutes: 0, focusSessions: 0, tasksCompleted: 0, productivityScore: 0 };

        let bestDay = null;
        for (const [date, stats] of Object.entries(allStats)) {
            const fm = stats.focusMinutes || 0;
            if (fm > 0 && (!bestDay || fm > bestDay.focusMinutes)) {
                bestDay = {
                    date,
                    focusMinutes: fm,
                    focusSessions: stats.focusSessions || 0,
                    tasksCompleted: stats.tasksCompleted || 0,
                    productivityScore: stats.productivityScore || 0
                };
            }
        }

        if (!bestDay || bestDay.focusMinutes === 0) {
            container.innerHTML = '';
            return;
        }

        const todayFocus = todayStats.focusMinutes || 0;
        const todaySessions = todayStats.focusSessions || 0;
        const todayTasks = todayStats.tasksCompleted || 0;
        const isToday = bestDay.date === today;
        const progress = Math.min((todayFocus / bestDay.focusMinutes) * 100, 100);
        const isNewRecord = isToday && todayFocus >= bestDay.focusMinutes && todayFocus > 0;
        const remaining = Math.max(0, bestDay.focusMinutes - todayFocus);

        const fmtTime = (m) => {
            const h = Math.floor(m / 60);
            const mins = Math.round(m % 60);
            if (h === 0) return `${mins}m`;
            if (mins === 0) return `${h}h`;
            return `${h}h ${mins}m`;
        };

        const recordDate = new Date(bestDay.date + 'T00:00:00');
        const dateLabel = isToday ? 'Today \u2014 New Record!' : recordDate.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
        });

        container.innerHTML = `
            <div class="best-record-card ${isNewRecord ? 'is-record' : ''}">
                <div class="best-record-header">
                    <div class="best-record-icon">${isNewRecord ? '\uD83C\uDFC6' : '\uD83C\uDFC5'}</div>
                    <div class="best-record-heading">
                        <h3>${isNewRecord ? 'New Personal Record!' : 'Personal Best'}</h3>
                        <span class="best-record-date">${dateLabel}</span>
                    </div>
                </div>
                <div class="best-record-stats">
                    <div class="best-record-stat primary">
                        <span class="best-record-stat-value">${fmtTime(bestDay.focusMinutes)}</span>
                        <span class="best-record-stat-label">Focus Time</span>
                    </div>
                    <div class="best-record-stat">
                        <span class="best-record-stat-value">${bestDay.focusSessions}</span>
                        <span class="best-record-stat-label">Sessions</span>
                    </div>
                    <div class="best-record-stat">
                        <span class="best-record-stat-value">${bestDay.tasksCompleted}</span>
                        <span class="best-record-stat-label">Tasks Done</span>
                    </div>
                    ${bestDay.productivityScore > 0 ? `
                    <div class="best-record-stat">
                        <span class="best-record-stat-value">${bestDay.productivityScore}%</span>
                        <span class="best-record-stat-label">Score</span>
                    </div>` : ''}
                </div>
                ${!isToday ? `
                <div class="best-record-progress">
                    <div class="best-record-progress-header">
                        <span class="best-record-progress-label">Today's progress toward record</span>
                        <span class="best-record-progress-value">${Math.round(progress)}%</span>
                    </div>
                    <div class="best-record-progress-bar">
                        <div class="best-record-progress-fill ${progress >= 100 ? 'complete' : progress >= 75 ? 'close' : ''}" style="width: ${progress}%"></div>
                    </div>
                    <div class="best-record-today-stats">
                        <span>${fmtTime(todayFocus)} focused</span>
                        <span>${todaySessions} session${todaySessions === 1 ? '' : 's'}</span>
                        <span>${todayTasks} task${todayTasks === 1 ? '' : 's'} done</span>
                        ${remaining > 0 ? `<span class="best-record-remaining">${fmtTime(remaining)} to beat record</span>` : `<span class="best-record-beaten">\uD83C\uDF89 Record beaten!</span>`}
                    </div>
                </div>` : ''}
            </div>
        `;
    } catch (e) {
        console.error('Failed to load dashboard best record:', e);
    }
}

function renderGoalsPreview(goals) {
    const container = document.getElementById('goals-preview');
    if (!container) return;

    if (goals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bullseye"></i>
                <p>No active goals. Set one now!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = goals.slice(0, 3).map(goal => `
        <div class="goal-preview-item">
            <div class="goal-preview-header">
                <span class="goal-preview-title">${escapeHtml(goal.title)}</span>
                <span class="goal-preview-progress">${goal.progress}%</span>
            </div>
            <div class="goal-progress-bar">
                <div class="goal-progress-fill" style="width: ${goal.progress}%"></div>
            </div>
        </div>
    `).join('');
}

// Render Items to Review Widget
async function renderReviewWidget() {
    const container = document.getElementById('review-widget-content');
    if (!container) return;

    try {
        const revisions = await ProductivityData.DataStore.getRevisions();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get due items (due today or overdue)
        const dueItems = revisions.filter(r => {
            const dueDate = new Date(r.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate <= today;
        }).slice(0, 3);

        if (dueItems.length === 0) {
            container.innerHTML = `
                <div class="widget-empty">
                    <i class="fas fa-check-circle"></i>
                    <p>No items due for review!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = dueItems.map(item => `
            <div class="widget-item">
                <div class="widget-item-info">
                    <span class="widget-item-title">${escapeHtml(item.title)}</span>
                    <span class="widget-item-meta">${formatDueLabel(item.dueDate)}</span>
                </div>
                <button class="btn-icon small widget-focus-btn" data-revision-id="${item.id}" title="Start Focus">
                    <i class="fas fa-play"></i>
                </button>
            </div>
        `).join('');

        // Add event listeners for focus buttons
        container.querySelectorAll('.widget-focus-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const revisionId = btn.dataset.revisionId;
                const revision = dueItems.find(r => r.id === revisionId);
                if (revision && window.RevisionSystem && typeof window.RevisionSystem.startFocusOnRevision === 'function') {
                    window.RevisionSystem.startFocusOnRevision(revision);
                } else {
                    navigateTo('focus');
                }
            });
        });
    } catch (error) {
        console.error('Failed to render review widget:', error);
    }
}

// Render Today's Tasks Widget
async function renderTodayTasksWidget() {
    const container = document.getElementById('todays-tasks-widget-content');
    if (!container) return;

    try {
        const tasks = await ProductivityData.DataStore.getTasks();
        const today = new Date().toISOString().split('T')[0];

        // Get today's pending tasks
        const todayTasks = tasks.filter(t =>
            t.dueDate === today && t.status !== 'completed'
        ).slice(0, 3);

        if (todayTasks.length === 0) {
            container.innerHTML = `
                <div class="widget-empty">
                    <i class="fas fa-check-circle"></i>
                    <p>No tasks due today!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = todayTasks.map(task => `
            <div class="widget-item">
                <div class="widget-item-info">
                    <span class="widget-item-title">${escapeHtml(task.title)}</span>
                    <span class="widget-item-meta priority-${task.priority || 'medium'}">${(task.priority || 'medium').charAt(0).toUpperCase() + (task.priority || 'medium').slice(1)}</span>
                </div>
                <button class="btn-icon small widget-focus-btn" data-task-id="${task.id}" title="Start Focus">
                    <i class="fas fa-play"></i>
                </button>
            </div>
        `).join('');

        // Add event listeners for focus buttons
        container.querySelectorAll('.widget-focus-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = btn.dataset.taskId;
                if (typeof startFocusOnTask === 'function') {
                    startFocusOnTask(taskId);
                } else {
                    navigateTo('focus');
                }
            });
        });
    } catch (error) {
        console.error('Failed to render today tasks widget:', error);
    }
}

// Helper function for due label formatting
function formatDueLabel(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(dateStr);
    dueDate.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) return `${Math.abs(daysDiff)}d overdue`;
    if (daysDiff === 0) return 'Due today';
    if (daysDiff === 1) return 'Due tomorrow';
    return `Due in ${daysDiff}d`;
}

async function renderDashboardChallengesWidget() {
    const container = document.getElementById('dashboard-challenges');
    if (!container) return;

    try {
        await window.ChallengeManager?.ensureLoaded?.();
        const challenges = Array.isArray(window.ChallengeManager?.challenges)
            ? window.ChallengeManager.challenges
            : [];

        const active = challenges.filter(c => c && (c.status === 'active' || c.status === 'completed'));
        if (active.length === 0) {
            container.innerHTML = `
                <div class="empty-state small">
                    <i class="fas fa-flag-checkered"></i>
                    <p>No challenges yet</p>
                    <p class="sub">Create one to track progress automatically.</p>
                </div>
            `;
            return;
        }

        // Prefer active first, then recently completed
        active.sort((a, b) => {
            const sa = a.status === 'active' ? 0 : 1;
            const sb = b.status === 'active' ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return String(a.title || '').localeCompare(String(b.title || ''));
        });

        const top = active.slice(0, 3);
        container.innerHTML = `
            <div class="dashboard-challenges-list">
                ${top.map(c => {
                    const current = Math.max(0, Number(c.currentProgress) || 0);
                    const target = Math.max(1, Number(c.targetProgress) || 1);
                    const pct = Math.max(0, Math.min(100, Math.round((current / target) * 100)));
                    const statusClass = c.status === 'completed' ? 'completed' : 'active';
                    return `
                        <div class="dashboard-challenge-item ${statusClass}">
                            <div class="row">
                                <div class="title">${escapeHtml(c.title || 'Challenge')}</div>
                                <div class="count">${current}/${target}</div>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width:${pct}%"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (e) {
        console.error('[Dashboard] Failed to render challenges widget:', e);
        container.innerHTML = `
            <div class="empty-state small">
                <i class="fas fa-flag-checkered"></i>
                <p>Challenges unavailable</p>
            </div>
        `;
    }
}

async function updateBadges() {
    const tasksBadge = document.getElementById('tasks-badge');
    const upcomingBadge = document.getElementById('upcoming-badge');

    // Get last seen timestamps
    const stored = await chrome.storage.local.get(['tasksLastSeen', 'scheduleLastSeen', 'tasksBadgeData', 'scheduleBadgeData']);
    const tasksLastSeen = stored.tasksLastSeen || 0;
    const scheduleLastSeen = stored.scheduleLastSeen || 0;

    if (tasksBadge) {
        const tasks = await ProductivityData.DataStore.getTasks();
        const pendingTasks = tasks.filter(t => t.status !== 'completed');

        // Count tasks created or updated after last seen
        const newTasks = pendingTasks.filter(t => {
            const taskTime = new Date(t.createdAt || t.updatedAt || 0).getTime();
            return taskTime > tasksLastSeen;
        });

        // Only show badge if there are NEW tasks since last visit
        const showBadge = newTasks.length > 0;
        tasksBadge.textContent = newTasks.length;
        tasksBadge.style.display = showBadge ? 'inline' : 'none';
    }

    if (upcomingBadge) {
        const today = ProductivityData.getTodayDate();
        const tasks = await ProductivityData.DataStore.getTasks();
        const calendarTasks = tasks.filter(t => t.status !== 'completed' && (t.startDate || t.dueDate));

        // Count tasks created/updated after last seen (schedule is tasks-only)
        const newCalendarTasks = calendarTasks.filter(t => {
            const taskTime = new Date(t.updatedAt || t.createdAt || 0).getTime();
            return taskTime > scheduleLastSeen && (t.startDate === today || t.dueDate === today);
        });

        const showBadge = newCalendarTasks.length > 0;
        upcomingBadge.textContent = newCalendarTasks.length;
        upcomingBadge.style.display = showBadge ? 'inline' : 'none';
    }
}

// ============================================================================
// QUICK ACTIONS
// ============================================================================

function initializeQuickActions() {
    // Use window.openTaskModal to allow tasks.js to override the implementation
    document.getElementById('quick-add-task')?.addEventListener('click', () => window.openTaskModal?.());
    document.getElementById('quick-pomodoro')?.addEventListener('click', () => startQuickPomodoro());
    document.getElementById('quick-goal')?.addEventListener('click', () => window.openGoalModal?.());
    document.getElementById('quick-focus-btn')?.addEventListener('click', () => startQuickPomodoro());
    document.getElementById('add-task-btn')?.addEventListener('click', () => window.openTaskModal?.());
    document.getElementById('add-goal-btn')?.addEventListener('click', () => window.openGoalModal?.());

    // Notifications button - show notification panel or request permission
    document.getElementById('notifications-btn')?.addEventListener('click', () => {
        showNotificationPanel();
    });
}

async function showNotificationPanel() {
    // Check if notification permission is granted
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showToast('success', 'Notifications Enabled', 'You will now receive notifications.');
                updateNotificationBadge();
            } else {
                showToast('warning', 'Notifications Blocked', 'Enable notifications in browser settings.');
            }
        });
        return;
    }

    if (Notification.permission === 'denied') {
        showToast('warning', 'Notifications Blocked', 'Enable notifications in your browser settings to receive alerts.');
        return;
    }

    // Show notification panel with upcoming reminders
    showNotificationDropdown();
}

async function showNotificationDropdown() {
    // Remove existing dropdown
    document.querySelector('.notification-dropdown')?.remove();

    // Tasks-only: due today + overdue
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const todayStart = new Date(today).getTime();

    // Check if notifications were cleared today
    const storage = await chrome.storage.local.get(['notificationsCleared']);
    const clearedTime = storage.notificationsCleared || 0;
    const shouldShow = clearedTime < todayStart; // Only show if cleared before today

    let notifications = [];

    if (shouldShow) {
        try {
            // Get tasks due today
            const tasks = await ProductivityData.DataStore.getTasks();
            const dueTodayTasks = tasks.filter(t => t.dueDate === today && t.status !== 'completed');

            dueTodayTasks.forEach(task => {
                notifications.push({
                    type: 'task',
                    title: task.title,
                    message: 'Due today',
                    icon: 'fa-tasks',
                    color: '#f59e0b'
                });
            });

            // Get overdue tasks
            const overdueTasks = tasks.filter(t => t.dueDate < today && t.status !== 'completed');
            overdueTasks.forEach(task => {
                notifications.push({
                    type: 'overdue',
                    title: task.title,
                    message: 'Overdue!',
                    icon: 'fa-exclamation-triangle',
                    color: '#ef4444'
                });
            });
        } catch (e) {
            console.error('Error loading notifications:', e);
        }
    } // end if (shouldShow)

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'notification-dropdown';
    dropdown.innerHTML = `
        <div class="notification-dropdown-header">
            <h4><i class="fas fa-bell"></i> Notifications</h4>
            <span class="notification-count">${notifications.length}</span>
        </div>
        <div class="notification-dropdown-body">
            ${notifications.length > 0 ? notifications.map(n => `
                <div class="notification-item" data-type="${n.type}">
                    <div class="notification-icon" style="background: ${n.color}20; color: ${n.color}">
                        <i class="fas ${n.icon}"></i>
                    </div>
                    <div class="notification-content">
                        <span class="notification-title">${escapeHtml(n.title)}</span>
                        <span class="notification-message">${n.message}</span>
                    </div>
                </div>
            `).join('') : `
                <div class="notification-empty">
                    <i class="fas fa-check-circle"></i>
                    <p>All caught up!</p>
                    <small>No pending notifications</small>
                </div>
            `}
        </div>
        ${notifications.length > 0 ? `
            <div class="notification-dropdown-footer">
                <button class="btn-ghost small" id="clear-notifications-btn">Clear All</button>
            </div>
        ` : ''}
    `;

    // Position near the notification button
    const btn = document.getElementById('notifications-btn');
    if (btn) {
        const rect = btn.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${rect.bottom + 8}px`;
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
    }

    document.body.appendChild(dropdown);

    // Mark notifications as seen and clear badge
    chrome.storage.local.set({ notificationsLastSeen: Date.now() });
    updateNotificationBadge(0);

    // Clear all button
    dropdown.querySelector('#clear-notifications-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        // Store the clear timestamp so notifications stay cleared until new ones appear
        chrome.storage.local.set({
            notificationsCleared: Date.now(),
            notificationsLastSeen: Date.now()
        });
        dropdown.remove();
        updateNotificationBadge(0);
        showToast('info', 'Cleared', 'All notifications cleared.');
    });

    // Click on notification item to navigate
    dropdown.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', () => {
            const type = item.dataset.type;
            dropdown.remove();
            if (type === 'task' || type === 'overdue') navigateTo('tasks');
        });
    });

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', function closeDropdown(e) {
            if (!dropdown.contains(e.target) && e.target !== btn) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        });
    }, 10);
}

function updateNotificationBadge(count) {
    const dot = document.querySelector('.notification-dot');
    if (dot) {
        if (count > 0) {
            dot.style.display = 'block';
            dot.textContent = count > 9 ? '9+' : count;
        } else {
            dot.style.display = 'none';
        }
    }
}

function startQuickPomodoro() {
    navigateTo('focus');
}

// ============================================================================
// MODALS
// ============================================================================

function initializeModals() {
    // Close modal handlers
    document.querySelectorAll('.close-modal, .cancel-modal').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    // Close on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAllModals();
        });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllModals();
    });

    // Recurring checkbox handlers
    document.getElementById('task-recurring')?.addEventListener('change', (e) => {
        document.getElementById('recurring-options')?.classList.toggle('hidden', !e.target.checked);
    });

    // Weekday button handlers
    document.querySelectorAll('.weekday-btn').forEach(btn => {
        btn.addEventListener('click', () => btn.classList.toggle('active'));
    });

    // Color button handlers
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.parentElement.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Save handlers
    document.getElementById('save-task-btn')?.addEventListener('click', saveTask);
    document.getElementById('save-goal-btn')?.addEventListener('click', saveGoal);

    // Add milestone button - use goals.js function if available, fallback to local
    document.getElementById('add-milestone-btn')?.addEventListener('click', () => {
        if (typeof addMilestoneInput === 'function') {
            addMilestoneInput();
        } else {
            addMilestoneField();
        }
    });

    // Initialize donation modal
    initializeDonateModal();
}

function initializeDonateModal() {
    const donateBtn = document.getElementById('donate-btn');
    const donateModal = document.getElementById('donate-modal');

    if (!donateBtn || !donateModal) return;

    const backdrop = donateModal.querySelector('.donate-modal-backdrop');
    const closeBtn = donateModal.querySelector('.donate-modal-close');

    function openDonateModal() {
        donateModal.style.display = 'flex';
    }

    function closeDonateModal() {
        donateModal.style.display = 'none';
    }

    donateBtn.addEventListener('click', openDonateModal);
    closeBtn?.addEventListener('click', closeDonateModal);
    backdrop?.addEventListener('click', closeDonateModal);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && donateModal.style.display === 'flex') {
            closeDonateModal();
        }
    });
}

function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

// Legacy task modal function - kept for backwards compatibility
// The main openTaskModal is provided by tasks.js and exports to window.openTaskModal
async function openTaskModalLegacy(task = null) {
    // Prefer the redesigned task modal (tasks.js) if present.
    // This ensures any remaining legacy entrypoints still open the new UI.
    if (typeof window.openTaskModal === 'function' && window.openTaskModal !== openTaskModalLegacy) {
        try {
            const prefillDate = task?.prefillDate;
            const prefillData = prefillDate ? { dueDate: prefillDate } : {};
            await window.openTaskModal(task, 'not-started', prefillData);
            return;
        } catch (err) {
            console.warn('[TaskModal] Falling back to legacy modal:', err);
        }
    }

    // Handle prefillDate option (from daily reminder)
    const prefillDate = task?.prefillDate;

    // Reset form
    document.getElementById('task-title').value = task?.title || '';
    document.getElementById('task-description').value = task?.description || '';
    document.getElementById('task-start-date').value = task?.startDate || '';
    document.getElementById('task-due-date').value = task?.dueDate || prefillDate || '';
    document.getElementById('task-due-time').value = task?.dueTime || '';
    document.getElementById('task-reminder-time').value = task?.reminderMinutes !== undefined ? task.reminderMinutes.toString() : '15';
    document.getElementById('task-priority').value = task?.priority || 'medium';
    document.getElementById('task-category').value = task?.category || 'personal';
    document.getElementById('task-subject').value = task?.subject || '';
    document.getElementById('task-estimate-hours').value = Math.floor((task?.estimatedMinutes || 30) / 60);
    document.getElementById('task-estimate-minutes').value = (task?.estimatedMinutes || 30) % 60;
    document.getElementById('task-recurring').checked = task?.isRecurring || false;
    document.getElementById('recurring-options')?.classList.toggle('hidden', !task?.isRecurring);

    // Reset repeat toggle
    const repeatEnabled = document.getElementById('task-repeat-enabled');
    if (repeatEnabled) repeatEnabled.checked = task?.isRecurring || false;
    document.getElementById('task-repeat-options')?.classList.toggle('hidden', !task?.isRecurring);

    // Reset priority pills
    document.querySelectorAll('.priority-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.priority === (task?.priority || 'medium'));
    });

    // Load task lists into select
    await loadTaskListsIntoSelect(task?.listId);

    // Set task color
    {
        const taskColorValueEl = document.getElementById('task-color');
        const taskColorOptionsEl = document.getElementById('task-color-options');

        const rawColor = task?.color || '#6366f1';
        const color = (typeof normalizePaletteColor === 'function')
            ? normalizePaletteColor(rawColor, '#6366f1')
            : rawColor;

        if (taskColorValueEl) taskColorValueEl.value = color;

        if (taskColorOptionsEl && taskColorValueEl && typeof createFixedColorPicker === 'function') {
            if (!taskColorOptionsEl.__fixedColorPickerBound) {
                createFixedColorPicker(taskColorOptionsEl, taskColorValueEl, { defaultColor: '#6366f1' });
                taskColorOptionsEl.__fixedColorPickerBound = true;
            }
            if (typeof taskColorOptionsEl.__setFixedColor === 'function') {
                taskColorOptionsEl.__setFixedColor(color);
            }
        }
    }

    // Hide new list form
    document.getElementById('new-list-form')?.classList.add('hidden');

    // Store task ID for editing (don't set for prefill)
    document.getElementById('task-modal').dataset.taskId = (task?.id && !prefillDate) ? task.id : '';

    // Update modal title
    const modalTitle = document.getElementById('task-modal-title');
    if (modalTitle) {
        modalTitle.innerHTML = task?.id
            ? '<i class="fas fa-edit"></i> Edit Task'
            : '<i class="fas fa-plus-circle"></i> New Task';
    }

    // Update save button text
    const saveBtn = document.getElementById('save-task-btn');
    if (saveBtn) {
        saveBtn.innerHTML = task?.id
            ? '<i class="fas fa-save"></i> Save Changes'
            : '<i class="fas fa-check"></i> Create Task';
    }

    openModal('task-modal');
}

// Load task lists into the select dropdown
async function loadTaskListsIntoSelect(selectedListId = '') {
    const select = document.getElementById('task-list-select');
    if (!select) return;

    // Clear existing options except "No List"
    select.innerHTML = '<option value="">No List</option>';

    try {
        const result = await new Promise(resolve => {
            chrome.storage.local.get(['taskLists'], resolve);
        });
        const lists = result.taskLists || [];

        lists.forEach(list => {
            const option = document.createElement('option');
            option.value = list.id;
            option.textContent = list.name;
            option.dataset.color = list.color;
            if (list.id === selectedListId) option.selected = true;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load task lists:', error);
    }
}

async function saveTask() {
    const modal = document.getElementById('task-modal');
    const taskId = modal.dataset.taskId;

    const reminderTimeValue = document.getElementById('task-reminder-time')?.value;
    const reminderMinutes = reminderTimeValue ? parseInt(reminderTimeValue) : 15;

    // Check for repeat settings (new modal design)
    const isRepeatEnabled = document.getElementById('task-repeat-enabled')?.checked || false;
    const repeatFrequency = document.getElementById('task-repeat-frequency')?.value || 'weekly';

    const taskData = {
        id: taskId || undefined,
        title: document.getElementById('task-title').value.trim(),
        description: document.getElementById('task-description')?.value?.trim() || '',
        startDate: document.getElementById('task-start-date')?.value || '',
        dueDate: document.getElementById('task-due-date').value,
        dueTime: document.getElementById('task-due-time').value,
        reminderMinutes: reminderMinutes,
        priority: document.getElementById('task-priority').value || 'medium',
        category: document.getElementById('task-category')?.value || 'personal',
        subject: document.getElementById('task-subject')?.value?.trim() || '',
        estimatedMinutes: (parseInt(document.getElementById('task-estimate-hours')?.value) || 0) * 60 +
            (parseInt(document.getElementById('task-estimate-minutes')?.value) || 0) || 30,
        isRecurring: isRepeatEnabled,
        recurrence: isRepeatEnabled ? repeatFrequency : null,
        color: document.getElementById('task-color')?.value || '#6366f1',
        listId: document.getElementById('task-list-select')?.value || ''
    };

    if (!taskData.title) {
        showToast('error', 'Validation Error', 'Task title is required.');
        return;
    }

    try {
        const task = new ProductivityData.Task(taskData);
        await ProductivityData.DataStore.saveTask(task);

        // Update daily stats if new task
        if (!taskId) {
            await ProductivityData.ProductivityCalculator.updateDailyStats('task_created');
        }

        closeAllModals();

        // Silence only for *new* task creation
        if (!taskId && typeof window.showToast === 'function') {
            window.showToast('success', 'Task Created', `"${task.title}" has been saved.`, { silent: true });
        } else {
            showToast('success', 'Task Saved', `"${task.title}" has been saved.`);
        }

        // Refresh current page - await to ensure UI updates
        if (App.currentPage === 'dashboard') {
            await loadDashboard();
        } else if (App.currentPage === 'tasks' && typeof loadTasks === 'function') {
            await loadTasks();
        } else if (App.currentPage === 'schedule' && typeof loadSchedule === 'function') {
            await loadSchedule();
        }

    } catch (error) {
        console.error('Failed to save task:', error);
        showToast('error', 'Save Failed', 'Could not save the task.');
    }
}

function openEventModal() {
    showToast('info', 'Events Disabled', 'This app is tasks-only now.');
    window.openTaskModal?.();
}

async function saveEvent() {
    showToast('warning', 'Events Disabled', 'Event creation is disabled.');
    closeAllModals();
}

function openGoalModal(goal = null) {
    // Reset form
    document.getElementById('goal-title-input').value = goal?.title || '';
    document.getElementById('goal-description-input').value = goal?.description || '';
    document.getElementById('goal-category-input').value = goal?.category || 'academic';
    document.getElementById('goal-target-date-input').value = goal?.targetDate || '';

    // Reset milestones
    const milestonesList = document.getElementById('milestones-list');
    milestonesList.innerHTML = '';

    if (goal?.milestones?.length > 0) {
        goal.milestones.forEach((m, index) => {
            addMilestoneField(m.title, m.targetDate);
        });
    }

    // Store goal ID for editing
    document.getElementById('goal-modal').dataset.goalId = goal?.id || '';

    openModal('goal-modal');
}

function addMilestoneField(title = '', targetDate = '') {
    const milestonesList = document.getElementById('milestones-list');
    const index = milestonesList.children.length;

    const milestoneDiv = document.createElement('div');
    milestoneDiv.className = 'milestone-item';
    milestoneDiv.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'milestone-title';
    titleInput.placeholder = `Milestone ${index + 1}`;
    titleInput.value = title;
    titleInput.style.cssText = 'flex: 1; padding: 8px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'milestone-date';
    dateInput.value = targetDate;
    dateInput.style.cssText = 'padding: 8px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeBtn.style.cssText = 'padding: 8px; background: var(--danger-light); color: var(--danger); border: none; border-radius: 6px; cursor: pointer;';
    removeBtn.addEventListener('click', () => milestoneDiv.remove());

    milestoneDiv.appendChild(titleInput);
    milestoneDiv.appendChild(dateInput);
    milestoneDiv.appendChild(removeBtn);

    milestonesList.appendChild(milestoneDiv);
}

async function saveGoal() {
    const modal = document.getElementById('goal-modal');
    const goalId = modal.dataset.goalId;

    // Gather milestones
    const milestones = Array.from(document.querySelectorAll('#milestones-list .milestone-item')).map((item, index) => ({
        title: item.querySelector('.milestone-title').value.trim(),
        targetDate: item.querySelector('.milestone-date').value,
        order: index
    })).filter(m => m.title);

    const goalData = {
        id: goalId || undefined,
        title: document.getElementById('goal-title-input').value.trim(),
        description: document.getElementById('goal-description-input').value.trim(),
        category: document.getElementById('goal-category-input').value,
        targetDate: document.getElementById('goal-target-date-input').value,
        milestones: milestones
    };

    if (!goalData.title) {
        showToast('error', 'Validation Error', 'Goal title is required.');
        return;
    }

    try {
        const goal = new ProductivityData.Goal(goalData);
        await ProductivityData.DataStore.saveGoal(goal);

        // Check achievements
        await ProductivityData.ProductivityCalculator.checkAchievements();

        closeAllModals();
        showToast('success', 'Goal Created', `"${goal.title}" has been created.`);

        // Refresh current page
        if (App.currentPage === 'dashboard') loadDashboard();
        else if (App.currentPage === 'goals' && typeof loadGoals === 'function') loadGoals();

    } catch (error) {
        console.error('Failed to save goal:', error);
        showToast('error', 'Save Failed', 'Could not save the goal.');
    }
}

// ============================================================================
// TASK TOGGLE
// ============================================================================

async function toggleTask(taskId) {
    try {
        const tasks = await ProductivityData.DataStore.getTasks();
        const task = tasks.find(t => t.id === taskId);

        if (!task) {
            console.error('[App] Task not found:', taskId);
            return;
        }

        const wasCompleted = task.status === 'completed';

        if (wasCompleted) {
            task.status = 'not-started';
            task.completedAt = null;
            showToast('info', 'Task Reopened', `"${task.title}" marked as pending.`);
        } else {
            task.status = 'completed';
            task.completedAt = new Date().toISOString();

            // Update stats
            try {
                await ProductivityData.ProductivityCalculator.updateDailyStats('task_completed');
            } catch (e) {
                console.warn('[App] Could not update stats:', e);
            }

            showToast('success', 'Task Completed', `Great job completing "${task.title}"!`);
        }

        // Save the task
        await ProductivityData.DataStore.saveTask(task);

        // Refresh the current view immediately
        if (App.currentPage === 'dashboard') {
            // For dashboard, refresh immediately to update the priority tasks list
            await loadDashboard();
        } else if (App.currentPage === 'tasks' && typeof loadTasks === 'function') {
            await loadTasks();
        }

        // Also update TaskState if on tasks page to keep state synced
        if (typeof TaskState !== 'undefined' && TaskState.tasks) {
            const idx = TaskState.tasks.findIndex(t => t.id === taskId);
            if (idx >= 0) {
                TaskState.tasks[idx].status = task.status;
                TaskState.tasks[idx].completedAt = task.completedAt;
            }
        }

    } catch (error) {
        console.error('[App] Failed to toggle task:', error);
        showToast('error', 'Error', 'Failed to update task status.');
    }
}

// Make toggleTask globally available
window.toggleTask = toggleTask;

// ============================================================================
// SETTINGS
// ============================================================================

function initializeSettings() {
    document.getElementById('save-settings-btn')?.addEventListener('click', saveSettings);
    document.getElementById('export-data-btn')?.addEventListener('click', exportData);
    document.getElementById('import-data-btn')?.addEventListener('click', triggerImport);
    document.getElementById('clear-data-btn')?.addEventListener('click', confirmClearData);

    // Sync buttons
    document.getElementById('sync-export-btn')?.addEventListener('click', syncExport);
    document.getElementById('sync-import-btn')?.addEventListener('click', syncImport);

    // Settings tabs (new redesigned settings)
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            // Update tab active state
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // Update panel visibility
            document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`settings-${targetTab}`)?.classList.add('active');
        });
    });

    // Theme buttons (new redesign)
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyTheme(btn.dataset.theme);
        });
    });

    // Accent color buttons (new redesign)
    document.querySelectorAll('.accent-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.accent-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyAccentColor(btn.dataset.color);
        });
    });

    // Theme change (legacy select)
    document.getElementById('theme-select')?.addEventListener('change', (e) => {
        applyTheme(e.target.value);
    });

    // Accent color (legacy)
    document.querySelectorAll('#page-settings .color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#page-settings .color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyAccentColor(btn.dataset.color);
        });
    });

    // Test sound button
    document.getElementById('test-sound-btn')?.addEventListener('click', () => {
        const soundType = document.getElementById('notification-sound-type')?.value || 'reminder';
        if (window.playNotificationSound) {
            window.playNotificationSound(soundType);
        } else if (window.NotificationSounds) {
            window.NotificationSounds.play(soundType);
        }

        // Also show a test sliding notification
        if (window.showSlidingNotification) {
            window.showSlidingNotification({
                type: 'info',
                title: '🔔 Test Notification',
                message: `Testing ${soundType} sound and notification display`,
                duration: 5000,
                soundType: soundType,
                actions: [
                    { label: 'Great!', primary: true, callback: () => console.log('Notification dismissed') }
                ]
            });
        }
    });

    // Volume slider
    document.getElementById('notification-volume')?.addEventListener('input', (e) => {
        const volume = parseInt(e.target.value);
        document.getElementById('volume-display').textContent = `${volume}%`;
        if (window.NotificationState) {
            window.NotificationState.preferences.volume = volume / 100;
        }
    });

    // New task modal - priority pills
    document.querySelectorAll('.priority-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.priority-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            const priorityInput = document.getElementById('task-priority');
            if (priorityInput) priorityInput.value = pill.dataset.priority;
        });
    });

    // Repeat toggle for task modal
    document.getElementById('task-repeat-enabled')?.addEventListener('change', (e) => {
        const repeatOptions = document.getElementById('task-repeat-options');
        if (repeatOptions) {
            repeatOptions.classList.toggle('hidden', !e.target.checked);
        }
        // Also update hidden recurring checkbox for compatibility
        const recurringCheck = document.getElementById('task-recurring');
        if (recurringCheck) recurringCheck.checked = e.target.checked;
    });

    // Repeat end type change
    document.getElementById('task-repeat-end-type')?.addEventListener('change', (e) => {
        const endDateInput = document.getElementById('task-repeat-end-date');
        const countInput = document.getElementById('task-repeat-count');
        if (endDateInput) endDateInput.classList.toggle('hidden', e.target.value !== 'date');
        if (countInput) countInput.classList.toggle('hidden', e.target.value !== 'count');
    });

    // Fixed palette color pickers for legacy task modal sections
    {
        const taskColorOptionsEl = document.getElementById('task-color-options');
        const taskColorValueEl = document.getElementById('task-color');
        if (taskColorOptionsEl && taskColorValueEl && typeof createFixedColorPicker === 'function') {
            if (!taskColorOptionsEl.__fixedColorPickerBound) {
                createFixedColorPicker(taskColorOptionsEl, taskColorValueEl, { defaultColor: '#6366f1' });
                taskColorOptionsEl.__fixedColorPickerBound = true;
            }
        }

        const newListColorOptionsEl = document.getElementById('new-list-color-options');
        const newListColorValueEl = document.getElementById('new-list-color');
        if (newListColorOptionsEl && newListColorValueEl && typeof createFixedColorPicker === 'function') {
            if (!newListColorOptionsEl.__fixedColorPickerBound) {
                createFixedColorPicker(newListColorOptionsEl, newListColorValueEl, { defaultColor: '#6366f1' });
                newListColorOptionsEl.__fixedColorPickerBound = true;
            }
        }
    }

    // Create new list button
    document.getElementById('btn-create-list')?.addEventListener('click', () => {
        const form = document.getElementById('new-list-form');
        if (form) {
            form.classList.remove('hidden');
            document.getElementById('new-list-name')?.focus();
        }
    });

    // Cancel new list creation
    document.getElementById('btn-cancel-new-list')?.addEventListener('click', () => {
        const form = document.getElementById('new-list-form');
        if (form) {
            form.classList.add('hidden');
            document.getElementById('new-list-name').value = '';
            const newListColorValueEl = document.getElementById('new-list-color');
            const newListColorOptionsEl = document.getElementById('new-list-color-options');
            if (newListColorValueEl) newListColorValueEl.value = '#6366f1';
            if (newListColorOptionsEl && typeof newListColorOptionsEl.__setFixedColor === 'function') {
                newListColorOptionsEl.__setFixedColor('#6366f1');
            }
        }
    });

    // Save new list
    document.getElementById('btn-save-new-list')?.addEventListener('click', async () => {
        const nameInput = document.getElementById('new-list-name');
        const colorInput = document.getElementById('new-list-color');
        const listSelect = document.getElementById('task-list-select');
        const form = document.getElementById('new-list-form');

        const listName = nameInput?.value?.trim();
        if (!listName) {
            showToast('error', 'Error', 'Please enter a list name');
            return;
        }

        const listColor = colorInput?.value || '#6366f1';

        try {
            // Get existing lists
            const result = await new Promise(resolve => {
                chrome.storage.local.get(['taskLists'], resolve);
            });
            const lists = result.taskLists || [];

            // Check for duplicate
            if (lists.some(l => l.name.toLowerCase() === listName.toLowerCase())) {
                showToast('error', 'Error', 'A list with this name already exists');
                return;
            }

            // Create new list
            const newList = {
                id: 'list-' + Date.now(),
                name: listName,
                color: listColor,
                createdAt: new Date().toISOString()
            };

            lists.push(newList);

            // Save to storage
            await new Promise(resolve => {
                chrome.storage.local.set({ taskLists: lists }, resolve);
            });

            // Add to select and select it
            if (listSelect) {
                const option = document.createElement('option');
                option.value = newList.id;
                option.textContent = listName;
                option.dataset.color = listColor;
                listSelect.appendChild(option);
                listSelect.value = newList.id;
            }

            // Update task color to match list
            const taskColorInput = document.getElementById('task-color');
            if (taskColorInput) taskColorInput.value = listColor;
            const taskColorOptionsEl = document.getElementById('task-color-options');
            if (taskColorOptionsEl && typeof taskColorOptionsEl.__setFixedColor === 'function') {
                taskColorOptionsEl.__setFixedColor(listColor);
            }

            // Hide form and reset
            if (form) form.classList.add('hidden');
            if (nameInput) nameInput.value = '';

            const newListColorValueEl = document.getElementById('new-list-color');
            const newListColorOptionsEl = document.getElementById('new-list-color-options');
            if (newListColorValueEl) newListColorValueEl.value = '#6366f1';
            if (newListColorOptionsEl && typeof newListColorOptionsEl.__setFixedColor === 'function') {
                newListColorOptionsEl.__setFixedColor('#6366f1');
            }

            showToast('success', 'List Created', `"${listName}" has been created`);
        } catch (error) {
            console.error('Failed to create list:', error);
            showToast('error', 'Error', 'Failed to create list');
        }
    });

    // Handle Enter key in new list name input
    document.getElementById('new-list-name')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-save-new-list')?.click();
        }
    });


    // Close modal buttons (new design)
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) closeModal(modal.id);
        });
    });

    // Cancel buttons for modals
    document.getElementById('cancel-task-btn')?.addEventListener('click', () => closeModal('task-modal'));

    // Dashboard hero actions
    document.querySelectorAll('.hero-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action === 'focus') navigateTo('focus');
            else if (action === 'task') window.openTaskModal?.();
            else if (action === 'schedule') navigateTo('schedule');
        });
    });

    // View links in dashboard
    document.querySelectorAll('.view-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            if (page) navigateTo(page);
        });
    });

    // Sidebar add button (legacy id) - tasks-only
    document.getElementById('sidebar-add-event')?.addEventListener('click', () => {
        window.openTaskModal?.();
    });
}

function loadSettingsPage() {
    if (!App.settings) return;

    // Profile
    document.getElementById('user-name').value = App.settings.userName || '';
    document.getElementById('user-school').value = App.settings.school || '';
    document.getElementById('user-semester').value = App.settings.semester || '';

    // Appearance - new design theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === (App.settings.theme || 'dark'));
    });

    // Appearance - new design accent buttons
    document.querySelectorAll('.accent-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === App.settings.accentColor);
    });

    // Legacy theme select
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = App.settings.theme || 'dark';

    // Legacy color buttons
    document.querySelectorAll('#page-settings .color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === App.settings.accentColor);
    });

    // Notification settings in new settings panel
    const notifPrefs = App.settings.notificationPreferences || {};
    const notifEnabled = document.getElementById('settings-notif-enabled');
    if (notifEnabled) notifEnabled.checked = notifPrefs.enabled !== false;

    const notifSound = document.getElementById('settings-notif-sound');
    if (notifSound) notifSound.checked = notifPrefs.sound !== false;

    const notifDesktop = document.getElementById('settings-notif-desktop');
    if (notifDesktop) notifDesktop.checked = notifPrefs.desktop !== false;
}

// ============================================================================
// NOTIFICATIONS PAGE
// ============================================================================
function loadNotificationsPage() {
    if (!App.settings) return;

    // Merge saved settings with runtime NotificationState
    const savedPrefs = App.settings.notificationPreferences || {};
    const runtimePrefs = window.NotificationState?.preferences || {};
    const notifPrefs = { ...runtimePrefs, ...savedPrefs };

    // Sync NotificationState with saved settings
    if (window.NotificationState) {
        Object.assign(window.NotificationState.preferences, savedPrefs);
    }

    // Master toggle
    const notifyEnabled = document.getElementById('notify-enabled');
    if (notifyEnabled) notifyEnabled.checked = notifPrefs.enabled !== false;

    // Sound settings
    const soundEnabled = document.getElementById('notify-sound-enabled');
    if (soundEnabled) soundEnabled.checked = notifPrefs.sound !== false;

    const soundType = document.getElementById('notification-sound-type');
    if (soundType) soundType.value = notifPrefs.soundType || 'reminder';

    const volumeSlider = document.getElementById('notification-volume');
    const volumeDisplay = document.getElementById('volume-display');
    if (volumeSlider) {
        const volume = Math.round((notifPrefs.volume || 0.7) * 100);
        volumeSlider.value = volume;
        if (volumeDisplay) volumeDisplay.textContent = `${volume}%`;
    }

    // Notification types
    const notifyBreaks = document.getElementById('notify-breaks');
    if (notifyBreaks) notifyBreaks.checked = notifPrefs.breakReminders !== false;

    const notifyDeadlines = document.getElementById('notify-deadlines');
    if (notifyDeadlines) notifyDeadlines.checked = notifPrefs.taskReminders !== false;

    const notifyFocus = document.getElementById('notify-focus');
    if (notifyFocus) notifyFocus.checked = notifPrefs.focusAlerts !== false;

    const notifyGoals = document.getElementById('notify-goals');
    if (notifyGoals) notifyGoals.checked = notifPrefs.goalDeadlines !== false;

    const notifySummary = document.getElementById('notify-summary');
    if (notifySummary) notifySummary.checked = notifPrefs.dailySummary !== false;

    const notifyAchievements = document.getElementById('notify-achievements');
    if (notifyAchievements) notifyAchievements.checked = notifPrefs.achievements !== false;

    const notifyStreaks = document.getElementById('notify-streaks');
    if (notifyStreaks) notifyStreaks.checked = notifPrefs.streakReminders !== false;

    const deadlineReminder = document.getElementById('deadline-reminder-time');
    if (deadlineReminder) deadlineReminder.value = App.settings.deadlineReminderMinutes || 15;

    // Daily reminder settings + habit reminders + global task reminders toggle
    chrome.storage.local.get([
        'dailyReminderTime',
        'dailyReminderEnabled',
        'dailyReminderRepeat',
        'dailyReminderDays',
        'habitReminderTime',
        'habitReminderEnabled',
        'habitReminderRepeat',
        'habitReminderDays',
        'taskRemindersEnabled'
    ], (result) => {
        const dailyReminderInput = document.getElementById('daily-reminder-time');
        if (dailyReminderInput) {
            dailyReminderInput.value = result.dailyReminderTime || '20:30';
        }

        const enabledCheckbox = document.getElementById('daily-reminder-enabled');
        if (enabledCheckbox) {
            enabledCheckbox.checked = result.dailyReminderEnabled !== false;
            const settingsDiv = document.getElementById('daily-reminder-settings');
            if (settingsDiv) {
                settingsDiv.style.opacity = enabledCheckbox.checked ? '1' : '0.5';
                settingsDiv.style.pointerEvents = enabledCheckbox.checked ? 'auto' : 'none';
            }
        }

        const repeatSelect = document.getElementById('daily-reminder-repeat');
        if (repeatSelect) {
            repeatSelect.value = result.dailyReminderRepeat || 'once';
        }

        const days = result.dailyReminderDays || [0, 1, 2, 3, 4, 5, 6];
        document.querySelectorAll('#page-notifications .day-selector input[data-day]').forEach(checkbox => {
            const day = parseInt(checkbox.dataset.day);
            checkbox.checked = days.includes(day);
        });

        // If task reminders were toggled from extension Options, reflect it here.
        if (result.taskRemindersEnabled === false) {
            const notifyDeadlines = document.getElementById('notify-deadlines');
            if (notifyDeadlines) notifyDeadlines.checked = false;
            if (window.NotificationState) {
                window.NotificationState.preferences.taskReminders = false;
            }
        }

        // Habit reminder settings
        const habitReminderInput = document.getElementById('habit-reminder-time');
        if (habitReminderInput) {
            habitReminderInput.value = result.habitReminderTime || '09:00';
        }

        const habitEnabledCheckbox = document.getElementById('habit-reminder-enabled');
        if (habitEnabledCheckbox) {
            const enabled = result.habitReminderEnabled !== false;
            habitEnabledCheckbox.checked = enabled;

            const repeatSelect = document.getElementById('habit-reminder-repeat');
            if (habitReminderInput) habitReminderInput.disabled = !enabled;
            if (repeatSelect) repeatSelect.disabled = !enabled;
        }

        const habitRepeatSelect = document.getElementById('habit-reminder-repeat');
        if (habitRepeatSelect) {
            habitRepeatSelect.value = result.habitReminderRepeat || 'once';
        }
    });

    // Setup auto-save on change for all notification settings
    setupNotificationAutoSave();
}

function setupNotificationAutoSave() {
    // Only set up once
    if (window._notificationAutoSaveSetup) return;
    window._notificationAutoSaveSetup = true;

    const saveNotificationSettings = async () => {
        const notifPrefs = {
            enabled: document.getElementById('notify-enabled')?.checked !== false,
            sound: document.getElementById('notify-sound-enabled')?.checked !== false,
            soundType: document.getElementById('notification-sound-type')?.value || 'reminder',
            volume: (parseInt(document.getElementById('notification-volume')?.value) || 70) / 100,
            breakReminders: document.getElementById('notify-breaks')?.checked !== false,
            taskReminders: document.getElementById('notify-deadlines')?.checked !== false,
            focusAlerts: document.getElementById('notify-focus')?.checked !== false,
            goalDeadlines: document.getElementById('notify-goals')?.checked !== false,
            dailySummary: document.getElementById('notify-summary')?.checked !== false,
            achievements: document.getElementById('notify-achievements')?.checked !== false,
            streakReminders: document.getElementById('notify-streaks')?.checked !== false
        };

        App.settings.notificationPreferences = notifPrefs;
        App.settings.deadlineReminderMinutes = parseInt(document.getElementById('deadline-reminder-time')?.value) || 15;

        if (window.NotificationState) {
            Object.assign(window.NotificationState.preferences, notifPrefs);
        }

        // Keep the global task reminder toggle (used by background/content scripts)
        // in sync with the Notifications page UI.
        try {
            const taskRemindersEnabled = (notifPrefs.enabled !== false) && (notifPrefs.taskReminders !== false);
            await chrome.storage.local.set({ taskRemindersEnabled });
        } catch (e) {
            // ignore
        }

        await ProductivityData.DataStore.saveSettings(App.settings);
    };

    // Auto-save on change for toggles and selects
    const notifPage = document.getElementById('page-notifications');
    if (!notifPage) return;

    notifPage.querySelectorAll('input[type="checkbox"], select').forEach(el => {
        el.addEventListener('change', saveNotificationSettings);
    });

    // Volume slider
    const volumeSlider = document.getElementById('notification-volume');
    const volumeDisplay = document.getElementById('volume-display');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            if (volumeDisplay) volumeDisplay.textContent = `${e.target.value}%`;
        });
        volumeSlider.addEventListener('change', saveNotificationSettings);
    }

    // Test sound button
    document.getElementById('test-sound-btn')?.addEventListener('click', () => {
        const soundType = document.getElementById('notification-sound-type')?.value || 'reminder';
        const volume = (parseInt(document.getElementById('notification-volume')?.value) || 70) / 100;
        if (window.NotificationSounds) {
            window.NotificationSounds.play(soundType, volume);
        }
    });

    // Daily reminder enable toggle
    document.getElementById('daily-reminder-enabled')?.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await chrome.storage.local.set({ dailyReminderEnabled: enabled });

        const settingsDiv = document.getElementById('daily-reminder-settings');
        if (settingsDiv) {
            settingsDiv.style.opacity = enabled ? '1' : '0.5';
            settingsDiv.style.pointerEvents = enabled ? 'auto' : 'none';
        }

        if (typeof setupDailyTaskReminder === 'function') {
            setupDailyTaskReminder();
        }
    });

    // Test daily reminder
    document.getElementById('test-daily-reminder-btn')?.addEventListener('click', () => {
        if (typeof triggerDailyTaskReminder === 'function') {
            triggerDailyTaskReminder();
        }
    });

    // Habit reminder enable toggle
    document.getElementById('habit-reminder-enabled')?.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        await chrome.storage.local.set({ habitReminderEnabled: enabled });

        const timeInput = document.getElementById('habit-reminder-time');
        const repeatSelect = document.getElementById('habit-reminder-repeat');
        if (timeInput) timeInput.disabled = !enabled;
        if (repeatSelect) repeatSelect.disabled = !enabled;

        if (typeof setHabitReminderEnabled === 'function') {
            setHabitReminderEnabled(enabled);
        } else if (typeof setupDailyHabitReminder === 'function') {
            setupDailyHabitReminder();
        }
    });

    // Test habit reminder
    document.getElementById('test-habit-reminder-btn')?.addEventListener('click', () => {
        if (typeof triggerHabitReminder === 'function') {
            triggerHabitReminder();
        }
    });

    // Habit reminder time
    document.getElementById('habit-reminder-time')?.addEventListener('change', (e) => {
        if (typeof setHabitReminderTime === 'function') {
            setHabitReminderTime(e.target.value);
        } else {
            chrome.storage.local.set({ habitReminderTime: e.target.value }, () => {
                if (typeof setupDailyHabitReminder === 'function') {
                    setupDailyHabitReminder();
                }
            });
        }
    });

    // Habit reminder repeat
    document.getElementById('habit-reminder-repeat')?.addEventListener('change', async (e) => {
        await chrome.storage.local.set({ habitReminderRepeat: e.target.value });
        if (typeof setupDailyHabitReminder === 'function') {
            setupDailyHabitReminder();
        }
    });

    // Daily reminder time
    document.getElementById('daily-reminder-time')?.addEventListener('change', (e) => {
        if (typeof setDailyReminderTime === 'function') {
            setDailyReminderTime(e.target.value);
        }
    });

    // Daily reminder repeat
    document.getElementById('daily-reminder-repeat')?.addEventListener('change', async (e) => {
        await chrome.storage.local.set({ dailyReminderRepeat: e.target.value });
        if (typeof setupDailyTaskReminder === 'function') {
            setupDailyTaskReminder();
        }
    });

    // Active days
    notifPage.querySelectorAll('.day-selector input[data-day]').forEach(checkbox => {
        checkbox.addEventListener('change', async () => {
            const activeDays = [];
            notifPage.querySelectorAll('.day-selector input[data-day]:checked').forEach(cb => {
                activeDays.push(parseInt(cb.dataset.day));
            });
            await chrome.storage.local.set({ dailyReminderDays: activeDays });
            if (typeof setupDailyTaskReminder === 'function') {
                setupDailyTaskReminder();
            }
        });
    });
}

async function saveSettings() {
    try {
        const userNameEl = document.getElementById('user-name');
        const schoolEl = document.getElementById('user-school');
        const semesterEl = document.getElementById('user-semester');

        // Update local settings object if elements exist
        if (userNameEl) App.settings.userName = userNameEl.value.trim();
        if (schoolEl) App.settings.school = schoolEl.value.trim();
        if (semesterEl) App.settings.semester = semesterEl.value.trim();

        // Read theme from active button (new design) or legacy select
        const activeThemeBtn = document.querySelector('.theme-btn.active');
        if (activeThemeBtn) {
            App.settings.theme = activeThemeBtn.dataset.theme;
        } else {
            // Fallback to legacy select element if it exists
            const themeSelect = document.getElementById('theme-select');
            if (themeSelect) App.settings.theme = themeSelect.value;
        }

        App.settings.accentColor = document.querySelector('#page-settings .color-btn.active')?.dataset.color ||
            document.querySelector('.accent-btn.active')?.dataset.color || '#6366f1';

        await ProductivityData.DataStore.saveSettings(App.settings);

        showToast('success', 'Settings Saved', 'Your preferences have been updated.');

    } catch (error) {
        console.error('Failed to save settings:', error);
        showToast('error', 'Save Failed', 'Could not save settings.');
    }
}

async function exportData() {
    try {
        const data = await ProductivityData.DataStore.exportAllData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `productivity-hub-backup-${ProductivityData.getTodayDate()}.json`;
        a.click();

        URL.revokeObjectURL(url);
        showToast('success', 'Export Complete', 'Your data has been exported.');

    } catch (error) {
        console.error('Export failed:', error);
        showToast('error', 'Export Failed', 'Could not export data.');
    }
}

function triggerImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const result = await ProductivityData.DataStore.importAllData(text, { merge: false });

            if (result.success) {
                showToast('success', 'Import Complete', 'Your data has been imported.');
                location.reload();
            } else {
                showToast('error', 'Import Failed', result.error || 'Invalid data format.');
            }
        } catch (error) {
            console.error('Import failed:', error);
            showToast('error', 'Import Failed', 'Could not read the file.');
        }
    };

    input.click();
}

async function confirmClearData() {
    const step1 = await confirmDialog('Are you sure you want to delete all data? This cannot be undone!', {
        title: 'Delete All Data',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!step1) return;

    const step2 = await confirmDialog('This will permanently delete all your tasks, goals, sessions, and settings. Continue?', {
        title: 'Confirm Deletion',
        confirmText: 'Yes, delete',
        cancelText: 'Cancel',
        danger: true
    });
    if (!step2) return;

    ProductivityData.DataStore.clearAllData().then(() => {
        showToast('info', 'Data Cleared', 'All data has been deleted.');
        location.reload();
    });
}

// ============================================================================
// SYNC FUNCTIONS (Extension <-> Desktop)
// ============================================================================

async function syncExport() {
    try {
        const data = await ProductivityData.DataStore.exportAllData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `productivity-hub-sync-${ProductivityData.getTodayDate()}.json`;
        a.click();

        URL.revokeObjectURL(url);

        showToast('success', 'Sync Export Complete', 'Data exported! Import this file in the desktop app or other browser to sync.');

        if (window.showSlidingNotification) {
            window.showSlidingNotification({
                type: 'success',
                title: '📤 Sync Export Complete',
                message: 'Import the downloaded file in your desktop app or other browser extension to sync your data.',
                duration: 8000
            });
        }
    } catch (error) {
        console.error('Sync export failed:', error);
        showToast('error', 'Sync Failed', 'Could not export data for sync.');
    }
}

async function syncImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const mergeOption = document.getElementById('sync-merge-option')?.checked ?? true;

            const result = await ProductivityData.DataStore.importAllData(text, { merge: mergeOption });

            if (result.success) {
                const sourceText = result.source === 'desktop' ? 'desktop app' : 'browser extension';
                const modeText = mergeOption ? 'merged with' : 'replaced';

                showToast('success', 'Sync Complete', `Data from ${sourceText} has been ${modeText} your local data.`);

                if (window.showSlidingNotification) {
                    window.showSlidingNotification({
                        type: 'success',
                        title: '🔄 Sync Complete!',
                        message: `Successfully synced data from ${sourceText}. Exported on ${new Date(result.exportDate).toLocaleDateString()}.`,
                        duration: 6000,
                        actions: [
                            { label: 'Refresh Now', primary: true, callback: () => location.reload() }
                        ]
                    });
                }

                // Auto-refresh after 2 seconds
                setTimeout(() => location.reload(), 2000);
            } else {
                showToast('error', 'Sync Failed', result.error || 'Invalid sync file format.');
            }
        } catch (error) {
            console.error('Sync import failed:', error);
            showToast('error', 'Sync Failed', 'Could not read the sync file.');
        }
    };

    input.click();
}

// ============================================================================
// THEME & APPEARANCE
// ============================================================================

function applyTheme(theme) {
    if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}

function applyAccentColor(color) {
    document.documentElement.style.setProperty('--primary', color);
    document.documentElement.style.setProperty('--primary-hover', adjustColor(color, -20));
    document.documentElement.style.setProperty('--primary-light', color + '1a');
    document.documentElement.style.setProperty('--primary-glow', color + '4d');
}

function adjustColor(color, amount) {
    const hex = color.replace('#', '');
    const num = parseInt(hex, 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

// ============================================================================
// TOAST NOTIFICATIONS (legacy fallback)
// ============================================================================

function showToastLegacy(type, title, message, duration = 5000) {
    let container = document.getElementById('toast-container');

    // Create toast container if it doesn't exist
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconEl = document.createElement('i');
    iconEl.className = icons[type];

    const contentDiv = document.createElement('div');
    contentDiv.className = 'toast-content';
    contentDiv.innerHTML = `
        <div class="toast-title">${escapeHtml(title)}</div>
        <div class="toast-message">${escapeHtml(message)}</div>
    `;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.addEventListener('click', () => toast.remove());

    toast.appendChild(iconEl);
    toast.appendChild(contentDiv);
    toast.appendChild(closeBtn);

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Prefer the richer notification system from notifications.js (plays professional sounds)
// Use `var` here because notifications.js defines a global `function showToast(...)`.
// A top-level `const showToast` would throw: "Identifier 'showToast' has already been declared".
var showToast = (typeof window.showToast === 'function') ? window.showToast : showToastLegacy;

// ============================================================================
// UTILITY FUNCTIONS (using shared Utils)
// ============================================================================

function getRandomQuote() {
    return App.quotes[Math.floor(Math.random() * App.quotes.length)];
}

function easeOutQuart(x) {
    return 1 - Math.pow(1 - x, 4);
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs (except quick entry)
    if (e.target.matches('input:not(#quick-entry-input), textarea, select')) return;

    // Alt + N: New Task
    if (e.altKey && e.key === 'n') {
        e.preventDefault();
        window.openTaskModal?.();
    }

    // Alt + Q: Quick Entry (command palette style)
    if (e.altKey && e.key === 'q') {
        e.preventDefault();
        openQuickEntryModal();
    }

    // Alt + E reserved (events disabled)

    // Alt + F: Start Focus
    if (e.altKey && e.key === 'f') {
        e.preventDefault();
        navigateTo('focus');
    }

    // Alt + D: Dashboard
    if (e.altKey && e.key === 'd') {
        e.preventDefault();
        navigateTo('dashboard');
    }

    // Alt + S: Schedule
    if (e.altKey && e.key === 's') {
        e.preventDefault();
        navigateTo('schedule');
    }

    // Alt + T: Tasks
    if (e.altKey && e.key === 't') {
        e.preventDefault();
        navigateTo('tasks');
    }

    // Enter in quick entry input
    if (e.target.id === 'quick-entry-input' && e.key === 'Enter') {
        e.preventDefault();
        submitQuickEntry();
    }
});

// ============================================================================
// FLOATING ACTION BUTTON (FAB)
// ============================================================================

function setupFAB() {
    const fabMain = document.getElementById('fab-main');
    const fabContainer = document.getElementById('fab-container');
    const fabMenu = document.getElementById('fab-menu');

    if (!fabMain || !fabContainer) return;

    // FAB primary action: open New Task
    // Shift+Click toggles the quick-actions menu.
    fabMain.addEventListener('click', (e) => {
        e.stopPropagation();

        if (!e.shiftKey && typeof window.openTaskModal === 'function') {
            window.openTaskModal();
            return;
        }

        fabContainer.classList.toggle('open');
        fabMain.classList.toggle('active');
    });

    // Close on outside click
    document.addEventListener('click', () => {
        fabContainer.classList.remove('open');
        fabMain.classList.remove('active');
    });

    // FAB actions
    fabMenu?.addEventListener('click', (e) => {
        const action = e.target.closest('.fab-action');
        if (!action) return;

        e.stopPropagation();
        fabContainer.classList.remove('open');
        fabMain.classList.remove('active');

        const actionType = action.dataset.action;

        switch (actionType) {
            case 'quick-task':
                window.openTaskModal?.();
                break;
            case 'quick-focus':
                navigateTo('focus');
                break;
        }
    });
}

// ============================================================================
// QUICK ENTRY MODAL
// ============================================================================

function openQuickEntryModal() {
    const modal = document.getElementById('quick-entry-modal');
    if (!modal) return;

    modal.classList.add('active');

    const input = document.getElementById('quick-entry-input');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 100);
    }
}

function closeQuickEntryModal() {
    const modal = document.getElementById('quick-entry-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function submitQuickEntry() {
    const input = document.getElementById('quick-entry-input');
    const text = input?.value?.trim();

    if (!text) {
        closeQuickEntryModal();
        return;
    }

    // Use the quickAddTask function from tasks.js
    if (typeof quickAddTask === 'function') {
        quickAddTask(text);
    } else if (typeof window.quickAddTask === 'function') {
        window.quickAddTask(text);
    }

    closeQuickEntryModal();
}

function setupQuickEntry() {
    // Close button
    document.querySelectorAll('[data-action="close-quick-entry"]').forEach(el => {
        el.addEventListener('click', closeQuickEntryModal);
    });

    // Submit button
    document.getElementById('quick-entry-submit')?.addEventListener('click', submitQuickEntry);

    // Close on backdrop click
    document.querySelector('#quick-entry-modal .modal-backdrop')?.addEventListener('click', closeQuickEntryModal);
}

// Make navigateTo globally accessible for other modules
window.navigateTo = navigateTo;

// ============================================================================
// TASK REMINDER NOTIFICATIONS
// ============================================================================
async function checkAndSendTaskReminders() {
    try {
        // Allow users to disable reminder broadcasts completely.
        try {
            const stored = await chrome.storage.local.get(['taskRemindersEnabled']);
            if (stored.taskRemindersEnabled === false) return;
        } catch (e) {
            // ignore
        }

        const tasks = await ProductivityData.DataStore.getTasks();
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        // Get pending tasks due today or overdue
        const urgentTasks = tasks.filter(t => {
            if (t.status === 'completed') return false;
            if (!t.dueDate) return false;
            return t.dueDate <= today;
        });

        if (urgentTasks.length > 0) {
            // Send Chrome notification
            const overdue = urgentTasks.filter(t => t.dueDate < today);
            const dueToday = urgentTasks.filter(t => t.dueDate === today);

            let message = '';
            if (overdue.length > 0) {
                message += `⚠️ ${overdue.length} overdue task(s)! `;
            }
            if (dueToday.length > 0) {
                message += `📋 ${dueToday.length} task(s) due today.`;
            }

            // Use the unified in-app toast style (instead of OS-level Chrome notifications)
            if (typeof window.showToast === 'function') {
                window.showToast(overdue.length > 0 ? 'warning' : 'info', 'Task Reminder', message, {
                    duration: 15000,
                    actions: [
                        { label: 'View Tasks', primary: true, callback: () => window.navigateTo?.('tasks') },
                        { label: 'Dismiss', callback: () => { } }
                    ]
                });
            }

            // Also send to all tabs via content script messaging
            sendReminderToAllTabs(urgentTasks.length, message);
        }
    } catch (error) {
        console.error('Failed to check task reminders:', error);
    }
}

async function sendReminderToAllTabs(taskCount, message) {
    try {
        // Send message to background script to broadcast to all tabs
        await chrome.runtime.sendMessage({
            type: 'BROADCAST_REMINDER',
            taskCount: taskCount,
            message: message
        });
    } catch (e) {
        // Broadcast failed silently - background service worker may not be ready
    }
}

// Check for reminders every 30 minutes
setInterval(checkAndSendTaskReminders, 30 * 60 * 1000);

// Check on load after a short delay
setTimeout(checkAndSendTaskReminders, 5000);

// ============================================================================
// LIVE STORAGE SYNC (NO REFRESH REQUIRED)
// ============================================================================
function setupLiveStorageSync() {
    if (window.__liveStorageSyncInstalled) return;
    window.__liveStorageSyncInstalled = true;

    if (!chrome?.storage?.onChanged) return;

    const keys = window.ProductivityData?.STORAGE_KEYS || {};
    const watchedKeys = new Set([
        keys.TASKS,
        keys.TASK_LISTS,
        keys.SCHEDULE_SCHOOL,
        keys.SCHEDULE_PERSONAL,
        keys.SETTINGS,
        'importedCalendarsMeta',

        // Notification-related toggles stored outside SETTINGS
        'taskRemindersEnabled',
        'dailyReminderTime',
        'dailyReminderEnabled',
        'dailyReminderRepeat',
        'dailyReminderDays',
        'habitReminderTime',
        'habitReminderEnabled',
        'habitReminderRepeat',
        'habitReminderDays'
    ].filter(Boolean));

    let syncTimer = null;

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        const changedKeys = Object.keys(changes || {});
        if (!changedKeys.some(key => watchedKeys.has(key))) return;

        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(async () => {
            const tasksActive = document.getElementById('page-tasks')?.classList.contains('active');
            const scheduleActive = document.getElementById('page-schedule')?.classList.contains('active');
            const settingsActive = document.getElementById('page-settings')?.classList.contains('active');
            const notificationsActive = document.getElementById('page-notifications')?.classList.contains('active');

            // If core settings changed, reload them and refresh any active pages that depend on them.
            try {
                if (changes?.[keys.SETTINGS]) {
                    App.settings = await window.ProductivityData?.DataStore?.getSettings?.();
                    if (App.settings) {
                        applyTheme(App.settings.theme);
                        applyAccentColor(App.settings.accentColor);

                        if (window.NotificationState && App.settings.notificationPreferences) {
                            Object.assign(window.NotificationState.preferences, App.settings.notificationPreferences);
                        }
                    }
                }
            } catch (e) {
                // ignore
            }

            if (settingsActive && typeof loadSettingsPage === 'function') {
                loadSettingsPage();
            }

            // Refresh notification UI if settings or notification storage toggles changed.
            if (notificationsActive && typeof loadNotificationsPage === 'function') {
                if (changes?.[keys.SETTINGS] || changes?.taskRemindersEnabled || changes?.dailyReminderTime || changes?.dailyReminderEnabled || changes?.dailyReminderRepeat || changes?.dailyReminderDays || changes?.habitReminderTime || changes?.habitReminderEnabled || changes?.habitReminderRepeat || changes?.habitReminderDays) {
                    loadNotificationsPage();
                }
            }

            if (tasksActive && typeof loadTasks === 'function') {
                await loadTasks();
            }

            if (scheduleActive && typeof loadSchedule === 'function') {
                await loadSchedule();
            }
        }, 150);
    });
}

setupLiveStorageSync();

// ── Desktop App Updater ────────────────────────────────────
function setupAppUpdater() {
    const api = window.electronAPI?.updates;
    if (!api) {
        console.log('[Updater] No electronAPI.updates — skipping');
        return;
    }

    const versionEl   = document.getElementById('app-version-info');
    const statusEl    = document.getElementById('app-update-status');
    const checkBtn    = document.getElementById('app-update-check-btn');
    const updateBtn   = document.getElementById('app-update-now-btn');

    console.log('[Updater] setup — checkBtn:', !!checkBtn, 'updateBtn:', !!updateBtn, 'versionEl:', !!versionEl, 'statusEl:', !!statusEl);

    // Show current version
    api.getVersion().then(info => {
        const ver = typeof info === 'string' ? info : info?.version;
        if (versionEl && ver) versionEl.textContent = `v${ver}`;
    }).catch(() => {});

    // Subscribe to status updates from main process
    api.onStatus((payload) => {
        if (!statusEl) return;
        // main.js sends "state", normalise to local var
        const state   = payload?.state || payload?.status || '';
        const message = payload?.message || '';

        switch (state) {
            case 'checking':
                statusEl.textContent = 'Checking for updates…';
                if (checkBtn) checkBtn.disabled = true;
                break;
            case 'available':
                statusEl.textContent = message || 'A new update is available. Downloading…';
                break;
            case 'not-available':
                statusEl.textContent = 'You are on the latest version.';
                if (checkBtn) checkBtn.disabled = false;
                break;
            case 'downloading':
                const pct = payload?.percent != null ? Math.round(payload.percent) : '…';
                statusEl.textContent = `Downloading update… ${pct}%`;
                break;
            case 'downloaded':
                statusEl.textContent = message || 'Update downloaded. Restart to install.';
                if (updateBtn) {
                    updateBtn.style.display = 'inline-flex';
                    updateBtn.disabled = false;
                }
                if (checkBtn) checkBtn.disabled = false;
                break;
            case 'error':
                statusEl.textContent = message || 'Update check failed.';
                if (checkBtn) checkBtn.disabled = false;
                break;
            default:
                statusEl.textContent = message || '';
                if (checkBtn) checkBtn.disabled = false;
        }
    });

    // "Check for Updates" button
    if (checkBtn) {
        checkBtn.addEventListener('click', () => {
            if (statusEl) statusEl.textContent = 'Checking for updates…';
            checkBtn.disabled = true;
            api.check().catch(() => {
                if (statusEl) statusEl.textContent = 'Update check failed.';
                checkBtn.disabled = false;
            });
        });
    }

    // "Update Now" / "Restart & Install" button
    if (updateBtn) {
        updateBtn.addEventListener('click', () => {
            updateBtn.disabled = true;
            if (statusEl) statusEl.textContent = 'Restarting to install update…';
            api.updateNow().catch(() => {
                if (statusEl) statusEl.textContent = 'Failed to install update.';
                updateBtn.disabled = false;
            });
        });
    }
}

// Main Application loaded
