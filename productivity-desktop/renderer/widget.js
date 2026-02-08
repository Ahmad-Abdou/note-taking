/**
 * Widget.js — Floating pinned card renderer
 * Runs inside each widget BrowserWindow.
 * Reads cardId from the URL query parameter ?card=<cardId>.
 */

(function () {
    'use strict';

    // ===== Configuration =====
    const CARD_CONFIG = {
        'today-tasks': {
            icon: 'fa-list-check',
            title: "Today's Tasks",
            collapsedCount: 1,
            expandedCount: 5,
            collapsedHeight: 100,
            expandedHeight: 380
        },
        'schedule': {
            icon: 'fa-calendar-day',
            title: "Today's Schedule",
            collapsedCount: 1,
            expandedCount: 5,
            collapsedHeight: 100,
            expandedHeight: 380
        },
        'priority-tasks': {
            icon: 'fa-bolt',
            title: 'Priority Tasks',
            collapsedCount: 1,
            expandedCount: 5,
            collapsedHeight: 100,
            expandedHeight: 380
        },
        'deadlines': {
            icon: 'fa-hourglass-half',
            title: 'Deadlines',
            collapsedCount: 1,
            expandedCount: 5,
            collapsedHeight: 100,
            expandedHeight: 380
        },
        'goals': {
            icon: 'fa-trophy',
            title: 'Goals',
            collapsedCount: 1,
            expandedCount: 3,
            collapsedHeight: 110,
            expandedHeight: 340
        },
        'challenges': {
            icon: 'fa-flag-checkered',
            title: 'Challenges',
            collapsedCount: 1,
            expandedCount: 3,
            collapsedHeight: 110,
            expandedHeight: 340
        },
        'progress': {
            icon: 'fa-chart-line',
            title: 'This Week',
            collapsedCount: 1,
            expandedCount: 1,
            collapsedHeight: 100,
            expandedHeight: 300
        },
        'review': {
            icon: 'fa-brain',
            title: 'Items to Review',
            collapsedCount: 1,
            expandedCount: 3,
            collapsedHeight: 100,
            expandedHeight: 310
        }
    };

    // ===== State =====
    let cardId = null;
    let expanded = false;
    let config = null;

    // ===== Helpers =====
    function getCardId() {
        if (window.electronAPI?.widgets?.getCardId) {
            return window.electronAPI.widgets.getCardId();
        }
        try {
            return new URLSearchParams(window.location.search).get('card');
        } catch (_) {
            return null;
        }
    }

    function esc(text) {
        if (typeof escapeHtml === 'function') return escapeHtml(text);
        const d = document.createElement('div');
        d.textContent = text || '';
        return d.innerHTML;
    }

    function getTodayYMD() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function normalizeYMD(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            if (isNaN(d)) return '';
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } catch (_) {
            return '';
        }
    }

    function daysBetween(dateStr1, dateStr2) {
        try {
            const d1 = new Date(dateStr1);
            const d2 = new Date(dateStr2);
            return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
        } catch (_) {
            return 0;
        }
    }

    function formatFocusTime(minutes) {
        if (!minutes || minutes <= 0) return '';
        if (minutes < 60) return `${Math.round(minutes)}m`;
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }

    const DS = () => window.ProductivityData?.DataStore;

    // ===== Renderers =====

    async function renderTodayTasks() {
        const content = document.getElementById('widget-content');
        if (!content) return;

        const store = DS();
        if (!store) { content.innerHTML = emptyState('Loading...'); return; }

        const allTasks = await store.getTasks();
        const today = getTodayYMD();

        const todayTasks = allTasks
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
                return String(ta).localeCompare(String(tb));
            });

        const limit = expanded ? config.expandedCount : config.collapsedCount;
        const visible = todayTasks.slice(0, limit);

        if (visible.length === 0) {
            content.innerHTML = emptyState('No tasks for today');
            return;
        }

        content.innerHTML = visible.map(t => taskItemHTML(t)).join('');
        bindTaskActions(content);
    }

    async function renderPriorityTasks() {
        const content = document.getElementById('widget-content');
        if (!content) return;

        const store = DS();
        if (!store) { content.innerHTML = emptyState('Loading...'); return; }

        const limit = expanded ? config.expandedCount : config.collapsedCount;
        const tasks = await store.getPriorityTasks(limit);

        if (tasks.length === 0) {
            content.innerHTML = emptyState('No priority tasks');
            return;
        }

        content.innerHTML = tasks.map(t => taskItemHTML(t)).join('');
        bindTaskActions(content);
    }

    async function renderSchedule() {
        const content = document.getElementById('widget-content');
        if (!content) return;

        const store = DS();
        if (!store) { content.innerHTML = emptyState('Loading...'); return; }

        const today = getTodayYMD();
        const events = await store.getEventsForDate(today);
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const upcoming = events
            .filter(e => {
                if (!e.startTime) return true;
                const [h, m] = e.startTime.split(':').map(Number);
                return (h * 60 + m) >= currentMinutes - 30;
            })
            .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

        const limit = expanded ? config.expandedCount : config.collapsedCount;
        const visible = upcoming.slice(0, limit);

        if (visible.length === 0) {
            content.innerHTML = emptyState('No upcoming events');
            return;
        }

        content.innerHTML = visible.map(e => `
            <div class="widget-schedule-item" data-event-id="${e.id}">
                <span class="widget-schedule-time">${esc(e.startTime || '--:--')}</span>
                <span class="widget-schedule-title">${esc(e.title || e.subject || 'Event')}</span>
            </div>
        `).join('');
    }

    async function renderDeadlines() {
        const content = document.getElementById('widget-content');
        if (!content) return;

        const store = DS();
        if (!store) { content.innerHTML = emptyState('Loading...'); return; }

        const allTasks = await store.getTasks();
        const today = getTodayYMD();

        const withDeadlines = allTasks
            .filter(t => t && t.status !== 'completed' && t.dueDate)
            .map(t => {
                const days = daysBetween(today, normalizeYMD(t.dueDate));
                return { ...t, daysLeft: days };
            })
            .sort((a, b) => a.daysLeft - b.daysLeft);

        const limit = expanded ? config.expandedCount : config.collapsedCount;
        const visible = withDeadlines.slice(0, limit);

        if (visible.length === 0) {
            content.innerHTML = emptyState('No deadlines');
            return;
        }

        content.innerHTML = visible.map(t => {
            const cls = t.daysLeft < 0 ? 'overdue' : (t.daysLeft <= 2 ? 'soon' : 'normal');
            const label = t.daysLeft < 0 ? `${Math.abs(t.daysLeft)}d ago` : (t.daysLeft === 0 ? 'Today' : `${t.daysLeft}d`);
            return `
                <div class="widget-deadline-item">
                    <span class="widget-deadline-days ${cls}">${label}</span>
                    <span class="widget-deadline-title">${esc(t.title)}</span>
                </div>
            `;
        }).join('');
    }

    async function renderGoals() {
        const content = document.getElementById('widget-content');
        if (!content) return;

        const store = DS();
        if (!store) { content.innerHTML = emptyState('Loading...'); return; }

        const goals = await store.getGoals();
        const active = goals.filter(g => g.status === 'active' || !g.status);
        const limit = expanded ? config.expandedCount : config.collapsedCount;
        const visible = active.slice(0, limit);

        if (visible.length === 0) {
            content.innerHTML = emptyState('No active goals');
            return;
        }

        content.innerHTML = visible.map(g => {
            const pct = Math.round(g.progress || 0);
            return `
                <div class="widget-goal-item">
                    <div class="widget-goal-header">
                        <span class="widget-goal-title">${esc(g.title)}</span>
                        <span class="widget-goal-pct">${pct}%</span>
                    </div>
                    <div class="widget-goal-bar">
                        <div class="widget-goal-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function renderChallenges() {
        const content = document.getElementById('widget-content');
        if (!content) return;

        const store = DS();
        if (!store) { content.innerHTML = emptyState('Loading...'); return; }

        const challenges = await store.getChallenges();
        const active = challenges.filter(c => c.status === 'active');
        const limit = expanded ? config.expandedCount : config.collapsedCount;
        const visible = active.slice(0, limit);

        if (visible.length === 0) {
            content.innerHTML = emptyState('No active challenges');
            return;
        }

        content.innerHTML = visible.map(c => {
            const current = c.currentValue || c.progress || 0;
            const target = c.targetValue || c.target || 1;
            const pct = Math.min(Math.round((current / target) * 100), 100);
            return `
                <div class="widget-challenge-item">
                    <div class="widget-challenge-title">${esc(c.title || c.name)}</div>
                    <div class="widget-challenge-progress">${current} / ${target}</div>
                    <div class="widget-challenge-bar">
                        <div class="widget-challenge-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function renderWeeklyProgress() {
        const content = document.getElementById('widget-content');
        if (!content) return;

        const store = DS();
        if (!store) { content.innerHTML = emptyState('Loading...'); return; }

        // Read weekly stats from storage the same way the dashboard does
        const stats = await store.get('productivity_daily_stats', {});
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const today = new Date();
        const dayOfWeek = today.getDay();

        const weekData = [];
        let total = 0;

        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - dayOfWeek + i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const dayStat = stats[key];
            const hours = dayStat ? (dayStat.focusMinutes || 0) / 60 : 0;
            weekData.push({ day: days[i], hours, isToday: i === dayOfWeek });
            total += hours;
        }

        const maxHours = Math.max(...weekData.map(d => d.hours), 1);
        const avg = total / 7;

        if (!expanded) {
            // Collapsed: just show total & avg in compact form
            content.innerHTML = `
                <div class="widget-weekly-summary" style="border-top: none; margin-top: 0; padding-top: 0;">
                    <div class="widget-weekly-stat">
                        <div class="widget-weekly-stat-value">${total.toFixed(1)}h</div>
                        <div class="widget-weekly-stat-label">Total</div>
                    </div>
                    <div class="widget-weekly-stat">
                        <div class="widget-weekly-stat-value">${avg.toFixed(1)}h</div>
                        <div class="widget-weekly-stat-label">Daily Avg</div>
                    </div>
                </div>
            `;
            return;
        }

        // Expanded: show bar chart + summary
        const barsHTML = weekData.map(d => {
            const pct = maxHours > 0 ? (d.hours / maxHours * 100) : 0;
            const barColor = d.isToday ? 'var(--widget-primary)' : 'rgba(99, 102, 241, 0.4)';
            return `
                <div class="widget-chart-bar-container">
                    <div class="widget-chart-bar-wrapper">
                        <div class="widget-chart-bar" style="height: ${Math.max(pct, 3)}%; background: ${barColor};" title="${d.hours.toFixed(1)}h"></div>
                    </div>
                    <div class="widget-chart-label">${d.day}</div>
                </div>
            `;
        }).join('');

        content.innerHTML = `
            <div class="widget-weekly-chart">${barsHTML}</div>
            <div class="widget-weekly-summary">
                <div class="widget-weekly-stat">
                    <div class="widget-weekly-stat-value">${total.toFixed(1)}h</div>
                    <div class="widget-weekly-stat-label">Total</div>
                </div>
                <div class="widget-weekly-stat">
                    <div class="widget-weekly-stat-value">${avg.toFixed(1)}h</div>
                    <div class="widget-weekly-stat-label">Daily Avg</div>
                </div>
            </div>
        `;
    }

    async function renderReview() {
        const content = document.getElementById('widget-content');
        if (!content) return;

        const store = DS();
        if (!store) { content.innerHTML = emptyState('Loading...'); return; }

        const revisions = await store.getRevisions();
        const today = new Date();

        const due = revisions
            .filter(r => {
                if (!r || !r.nextReviewDate) return false;
                return new Date(r.nextReviewDate) <= today;
            })
            .sort((a, b) => new Date(a.nextReviewDate) - new Date(b.nextReviewDate));

        const limit = expanded ? config.expandedCount : config.collapsedCount;
        const visible = due.slice(0, limit);

        if (visible.length === 0) {
            content.innerHTML = emptyState('No items to review');
            return;
        }

        content.innerHTML = visible.map(r => `
            <div class="widget-review-item">
                <div class="widget-review-icon"><i class="fas fa-book"></i></div>
                <div class="widget-review-info">
                    <div class="widget-review-title">${esc(r.title || r.topic)}</div>
                    <div class="widget-review-due">${r.category || 'Uncategorized'}</div>
                </div>
            </div>
        `).join('');
    }

    // ===== Shared HTML builders =====

    function taskItemHTML(task) {
        const isCompleted = task.status === 'completed';
        const time = task.dueTime || task.startTime || '';
        const metaParts = [];
        if (time) metaParts.push(`<span><i class="fas fa-clock"></i> ${esc(time)}</span>`);
        if (task.subject) metaParts.push(`<span><i class="fas fa-book"></i> ${esc(task.subject)}</span>`);
        const meta = metaParts.length ? `<div class="widget-task-meta">${metaParts.join('')}</div>` : '';

        return `
            <div class="widget-task-item ${isCompleted ? 'completed' : ''}" data-task-id="${task.id}">
                <div class="widget-task-checkbox ${isCompleted ? 'checked' : ''}" data-action="toggle">
                    ${isCompleted ? '<i class="fas fa-check"></i>' : ''}
                </div>
                <div class="widget-task-info">
                    <div class="widget-task-title ${isCompleted ? 'strikethrough' : ''}">${esc(task.title)}</div>
                    ${meta}
                </div>
                <div class="widget-task-priority ${task.priority || 'medium'}"></div>
                <div class="widget-task-actions">
                    <button class="focus-btn" data-action="focus" data-task-id="${task.id}" title="Start Focus">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
        `;
    }

    function emptyState(message) {
        return `
            <div class="widget-empty">
                <i class="fas ${config?.icon || 'fa-circle'}"></i>
                <p>${esc(message)}</p>
            </div>
        `;
    }

    // ===== Event Binding =====

    function bindTaskActions(container) {
        container.onclick = async (e) => {
            const item = e.target.closest('.widget-task-item');
            if (!item) return;

            const taskId = item.dataset.taskId;
            if (!taskId) return;

            const actionEl = e.target.closest('[data-action]');
            const action = actionEl?.dataset.action;

            if (action === 'toggle') {
                e.stopPropagation();
                // Optimistic UI update
                const checkbox = item.querySelector('.widget-task-checkbox');
                const title = item.querySelector('.widget-task-title');
                const isCompleted = item.classList.contains('completed');

                if (isCompleted) {
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

                // Persist
                try {
                    const store = DS();
                    if (store) {
                        const tasks = await store.getTasks();
                        const task = tasks.find(t => t.id === taskId);
                        if (task) {
                            if (task.status === 'completed') {
                                task.status = 'not-started';
                                task.completedAt = null;
                            } else {
                                task.status = 'completed';
                                task.completedAt = new Date().toISOString();
                            }
                            await store.saveTask(task);
                        }
                    }
                } catch (err) {
                    console.error('[Widget] Toggle task failed:', err);
                }

                // Notify other windows
                if (window.electronAPI?.widgets?.notifyDataChanged) {
                    window.electronAPI.widgets.notifyDataChanged(cardId);
                }
                return;
            }

            if (action === 'focus') {
                e.stopPropagation();
                // Send focus request to main window via main process
                if (window.electronAPI?.widgets?.startFocus) {
                    window.electronAPI.widgets.startFocus(taskId);
                }
                return;
            }
        };
    }

    // ===== Render Dispatcher =====

    const RENDERERS = {
        'today-tasks': renderTodayTasks,
        'schedule': renderSchedule,
        'priority-tasks': renderPriorityTasks,
        'deadlines': renderDeadlines,
        'goals': renderGoals,
        'challenges': renderChallenges,
        'progress': renderWeeklyProgress,
        'review': renderReview
    };

    async function render() {
        const renderer = RENDERERS[cardId];
        if (renderer) {
            try {
                await renderer();
            } catch (err) {
                console.error('[Widget] Render error:', err);
                const content = document.getElementById('widget-content');
                if (content) content.innerHTML = emptyState('Error loading data');
            }
        }
    }

    // ===== Expand / Collapse =====

    function toggleExpand() {
        expanded = !expanded;
        const container = document.getElementById('widget-container');
        const icon = document.getElementById('widget-expand-icon');

        if (expanded) {
            container?.classList.add('expanded');
        } else {
            container?.classList.remove('expanded');
        }

        const width = 340;
        const height = expanded ? config.expandedHeight : config.collapsedHeight;

        // Resize via IPC
        if (window.electronAPI?.widgets?.resize) {
            window.electronAPI.widgets.resize(cardId, width, height, expanded);
        }

        // Re-render with new item count
        render();
    }

    // ===== Init =====

    async function init() {
        cardId = getCardId();
        if (!cardId || !CARD_CONFIG[cardId]) {
            console.error('[Widget] Unknown card:', cardId);
            return;
        }

        config = CARD_CONFIG[cardId];

        // Set title
        const titleEl = document.getElementById('widget-title');
        if (titleEl) titleEl.textContent = config.title;

        // Set title bar icon
        const pinIcon = document.querySelector('.widget-pin-icon');
        if (pinIcon) {
            pinIcon.className = `fas ${config.icon} widget-pin-icon`;
            pinIcon.style.transform = 'none';
        }

        // Check saved expanded state
        if (window.electronAPI?.widgets?.getPinned) {
            try {
                const pinned = await window.electronAPI.widgets.getPinned();
                if (pinned[cardId]?.expanded) {
                    expanded = true;
                    document.getElementById('widget-container')?.classList.add('expanded');
                }
            } catch (_) { /* ignore */ }
        }

        // Bind expand button
        const expandBtn = document.getElementById('widget-expand-btn');
        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleExpand();
            });
        }

        // Bind close button
        const closeBtn = document.getElementById('widget-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.electronAPI?.widgets?.unpin) {
                    window.electronAPI.widgets.unpin(cardId);
                }
            });
        }

        // Listen for data changes from other windows
        if (window.electronAPI?.widgets?.onDataChanged) {
            window.electronAPI.widgets.onDataChanged((payload) => {
                // Re-render when data changes
                render();
            });
        }

        // Initial render
        await render();
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
