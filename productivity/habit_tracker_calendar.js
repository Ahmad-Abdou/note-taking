(function () {
    'use strict';

    /**
     * HabitTrackerCalendar
     * Reusable dashboard widget for tracking multiple goals over a date range.
     *
     * Storage shape:
     * {
     *   version: 2,
     *   goalsMeta: [{ id: string, label: string }],
     *   goals: {
     *     [goalId]: {
     *       startDate: 'YYYY-MM-DD',
     *       endDate: 'YYYY-MM-DD',
    *       completed: { 'YYYY-MM-DD': 1 },
    *       missedReasons: { 'YYYY-MM-DD': string[] }
     *     }
     *   }
     * }
     */
    class HabitTrackerCalendar {
        constructor(options) {
            const {
                mountEl,
                storageKey = 'habitTrackerCalendar',
                goals = [
                    { id: 'study', label: 'Study 2 hours' },
                    { id: 'workout', label: 'Workout' },
                    { id: 'read', label: 'Read 20 pages' }
                ],
                weekStartsOn = 'monday' // 'monday' | 'sunday'
            } = options || {};

            if (!mountEl) throw new Error('HabitTrackerCalendar: mountEl is required');

            this.mountEl = mountEl;
            this.storageKey = storageKey;
            this.defaultGoals = Array.isArray(goals) ? goals : [];
            this.weekStartsOn = weekStartsOn;

            this.state = {
                activeGoalId: this.defaultGoals[0]?.id || 'default',
                activeView: 'monthly', // 'weekly' | 'monthly' | 'yearly' | 'custom'
                periodOffset: 0,       // 0 = current period, -1 = one period back, etc.
                isManageOpen: false,
                editingGoalId: null,
                data: { version: 2, goalsMeta: [], goals: {} }
            };

            this._handleGoalChange = this._handleGoalChange.bind(this);
            this._handleViewChange = this._handleViewChange.bind(this);
            this._handleApplyRange = this._handleApplyRange.bind(this);
            this._handleGridClick = this._handleGridClick.bind(this);
            this._handleExport = this._handleExport.bind(this);
            this._handleImport = this._handleImport.bind(this);
            this._handleToggleManage = this._handleToggleManage.bind(this);
            this._handleManageClick = this._handleManageClick.bind(this);
            this._handleAddHabit = this._handleAddHabit.bind(this);
            this._handleReasonsTimelineClick = this._handleReasonsTimelineClick.bind(this);
            this._handleExternalDataChanged = this._handleExternalDataChanged.bind(this);
            this._handleNavPrev = this._handleNavPrev.bind(this);
            this._handleNavNext = this._handleNavNext.bind(this);
        }

        async init() {
            await this._load();
            this._ensureGoalDefaults();
            this.render();
            // Sync daily tasks & challenges into the habit grid
            await this.syncExternalDailyItems();

            if (!this._externalDataListenerAttached) {
                window.addEventListener('productivity:data-changed', this._handleExternalDataChanged);
                this._externalDataListenerAttached = true;
            }
        }

        // --- External Daily-Item Sync ---

        /**
         * Pull daily recurring tasks and daily challenges into the habit grid.
         * Auto-checks today if the source item is completed / progressed.
         */
        async syncExternalDailyItems() {
            const today = this._isoToday();
            const dismissed = new Set(this.state.data.dismissedSyncIds || []);
            const currentSyncedHabitIds = new Set();
            let didChange = false;

            // --- Daily recurring tasks ---
            try {
                const DataStore = typeof ProductivityData !== 'undefined' && ProductivityData?.DataStore;
                if (DataStore?.getTasks) {
                    const tasks = await DataStore.getTasks();
                    const dailyTasks = tasks.filter(t =>
                        (t.isRecurring || t.recurring) &&
                        (t.repeatType === 'daily' || t.recurrence === 'daily')
                    );
                    for (const task of dailyTasks) {
                        const habitId = `daily-task--${task.id}`;
                        currentSyncedHabitIds.add(habitId);
                        if (dismissed.has(habitId)) continue;
                        const label = '\u{1F4CB} ' + (task.title || 'Daily Task');
                        didChange = this._ensureSyncedHabit(habitId, label) || didChange;

                        const goalData = this.state.data.goals[habitId];
                        if (!goalData) continue;

                        const isCompletedNow = task.status === 'completed';
                        const isChecked = !!goalData.completed[today];
                        if (isCompletedNow && !isChecked) {
                            goalData.completed[today] = 1;
                            didChange = true;
                        } else if (!isCompletedNow && isChecked) {
                            delete goalData.completed[today];
                            didChange = true;
                        }
                    }
                }
            } catch (e) {
                console.warn('[HabitTracker] Error syncing daily tasks:', e);
            }

            // --- Daily challenges ---
            try {
                const CM = window.ChallengeManager;
                if (CM) {
                    await CM.ensureLoaded();
                    await CM.resetExpiredChallenges?.();
                    const dailyChallenges = (CM.challenges || []).filter(c => c.type === 'daily');
                    for (const ch of dailyChallenges) {
                        const habitId = `daily-challenge--${ch.id}`;
                        currentSyncedHabitIds.add(habitId);
                        if (dismissed.has(habitId)) continue;
                        const label = '\u{1F3C6} ' + (ch.title || 'Daily Challenge');
                        didChange = this._ensureSyncedHabit(habitId, label) || didChange;

                        const goalData = this.state.data.goals[habitId];
                        if (!goalData) continue;

                        const completionHistory = (ch.completionHistory && typeof ch.completionHistory === 'object')
                            ? ch.completionHistory
                            : {};
                        const nextCompleted = {};
                        const nextChallengeDayStatus = {};

                        for (const [dateIso, entry] of Object.entries(completionHistory)) {
                            if (!this._isIsoDate(dateIso)) continue;
                            nextCompleted[dateIso] = 1;
                            nextChallengeDayStatus[dateIso] = entry?.windowOutcome === 'outside' ? 'outside' : 'within';
                        }

                        const isDoneToday = ch.status === 'completed' && ch.lastProgressDate === today;
                        if (isDoneToday && !nextCompleted[today]) {
                            nextCompleted[today] = 1;
                            nextChallengeDayStatus[today] = 'within';
                        }

                        const nextWindow = this._normalizeChallengeTimeWindow({
                            start: ch.timeWindowStart,
                            end: ch.timeWindowEnd
                        });

                        if (!this._isSameObjectMap(goalData.completed, nextCompleted)) {
                            goalData.completed = nextCompleted;
                            didChange = true;
                        }

                        if (!this._isSameObjectMap(goalData.challengeDayStatus, nextChallengeDayStatus)) {
                            goalData.challengeDayStatus = nextChallengeDayStatus;
                            didChange = true;
                        }

                        const currentWindow = this._normalizeChallengeTimeWindow(goalData.challengeTimeWindow);
                        const windowChanged = (currentWindow?.start || null) !== (nextWindow?.start || null)
                            || (currentWindow?.end || null) !== (nextWindow?.end || null);

                        if (windowChanged) {
                            goalData.challengeTimeWindow = nextWindow;
                            didChange = true;
                        }
                    }
                }
            } catch (e) {
                console.warn('[HabitTracker] Error syncing daily challenges:', e);
            }

            // Remove stale synced habits that no longer exist in tasks/challenges.
            const staleSyncedIds = (Array.isArray(this.state.data.goalsMeta) ? this.state.data.goalsMeta : [])
                .map(g => g?.id)
                .filter(id => this._isSyncedHabit(id) && !dismissed.has(id) && !currentSyncedHabitIds.has(id));

            if (staleSyncedIds.length > 0) {
                const staleSet = new Set(staleSyncedIds);
                this.state.data.goalsMeta = (Array.isArray(this.state.data.goalsMeta) ? this.state.data.goalsMeta : [])
                    .filter(g => !staleSet.has(g?.id));
                for (const id of staleSet) {
                    delete this.state.data.goals[id];
                }
                if (!this.state.data.goals[this.state.activeGoalId]) {
                    this.state.activeGoalId = this._getGoalsList()[0]?.id;
                }
                didChange = true;
            }

            if (didChange) {
                await this._save();
                this.render();
            }
        }

        _ensureSyncedHabit(habitId, label) {
            const existingMeta = this.state.data.goalsMeta.find(g => g.id === habitId);
            if (existingMeta) {
                if (existingMeta.label !== label) {
                    existingMeta.label = label;
                    return true;
                }
                return false;
            }

            this.state.data.goalsMeta.push({ id: habitId, label });

            const today = this._isoToday();
            const todayDate = new Date();
            let defaultStart, defaultEnd;
            if (this.state.activeView === 'weekly') {
                const ws = this._alignToWeekStart(todayDate);
                const we = this._alignToWeekEnd(todayDate);
                defaultStart = this._toIso(ws);
                defaultEnd = this._toIso(we);
            } else if (this.state.activeView === 'monthly') {
                defaultStart = this._toIso(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
                defaultEnd = this._toIso(new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0));
            } else if (this.state.activeView === 'yearly') {
                defaultStart = this._toIso(new Date(todayDate.getFullYear(), 0, 1));
                defaultEnd = this._toIso(new Date(todayDate.getFullYear(), 11, 31));
            } else {
                defaultStart = this._addDaysIso(today, -30);
                defaultEnd = today;
            }

            this.state.data.goals[habitId] = {
                startDate: defaultStart,
                endDate: defaultEnd,
                completed: {},
                missedReasons: {},
                challengeDayStatus: {},
                challengeTimeWindow: null
            };
            return true;
        }

        _isSyncedHabit(goalId) {
            return typeof goalId === 'string' &&
                (goalId.startsWith('daily-task--') || goalId.startsWith('daily-challenge--'));
        }

        _getSyncedHabitIcon(goalId) {
            if (typeof goalId !== 'string') return '';
            if (goalId.startsWith('daily-task--')) return '\u{1F4CB} ';
            if (goalId.startsWith('daily-challenge--')) return '\u{1F3C6} ';
            return '';
        }

        _emitDataChanged(source = 'habit', detail = {}) {
            window.dispatchEvent(new CustomEvent('productivity:data-changed', {
                detail: {
                    source,
                    ...detail
                }
            }));
        }

        _handleExternalDataChanged(event) {
            const source = String(event?.detail?.source || '').toLowerCase();
            if (!['task', 'tasks', 'challenge', 'challenges'].includes(source)) return;

            this.syncExternalDailyItems().catch((error) => {
                console.warn('[HabitTracker] External sync failed:', error);
            });
        }

        // --- Storage ---

        _getStorageApi() {
            // Prefer chrome.storage.local; fallback to localStorage.
            if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
                return {
                    get: (key) => new Promise((resolve) => chrome.storage.local.get([key], (r) => resolve(r?.[key]))),
                    set: (obj) => new Promise((resolve) => chrome.storage.local.set(obj, () => resolve()))
                };
            }

            return {
                get: async (key) => {
                    try {
                        const raw = localStorage.getItem(key);
                        return raw ? JSON.parse(raw) : undefined;
                    } catch {
                        return undefined;
                    }
                },
                set: async (obj) => {
                    const [key] = Object.keys(obj);
                    localStorage.setItem(key, JSON.stringify(obj[key]));
                }
            };
        }

        async _load() {
            const storage = this._getStorageApi();
            const stored = await storage.get(this.storageKey);
            if (stored && typeof stored === 'object') {
                this.state.data = {
                    version: stored.version === 2 ? 2 : 1,
                    goalsMeta: Array.isArray(stored.goalsMeta) ? stored.goalsMeta : [],
                    goals: stored.goals && typeof stored.goals === 'object' ? stored.goals : {},
                    dismissedSyncIds: Array.isArray(stored.dismissedSyncIds) ? stored.dismissedSyncIds : []
                };
                if (stored.activeView) this.state.activeView = stored.activeView;
                if (stored.activeGoalId) this.state.activeGoalId = stored.activeGoalId;
                this.state.periodOffset = 0; // always start at current period on open
            }
        }

        async _save() {
            const storage = this._getStorageApi();
            this.state.data.activeView = this.state.activeView;
            this.state.data.activeGoalId = this.state.activeGoalId;
            await storage.set({
                [this.storageKey]: this.state.data
            });
        }

        _getGoalsList() {
            const meta = Array.isArray(this.state.data.goalsMeta) ? this.state.data.goalsMeta : [];
            return meta
                .filter(g => g && typeof g.id === 'string' && typeof g.label === 'string')
                .map(g => ({ id: g.id, label: g.label }));
        }

        _humanizeId(id) {
            return String(id || '')
                .replace(/[_-]+/g, ' ')
                .trim()
                .replace(/\s+/g, ' ')
                .replace(/^./, (c) => c.toUpperCase()) || 'Habit';
        }

        _slugify(label) {
            const base = String(label || '')
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 40);
            return base || `habit-${Date.now()}`;
        }

        _ensureGoalDefaults() {
            const today = this._isoToday();
            const todayDate = new Date();

            // Calculate date range based on activeView
            let defaultStart, defaultEnd;
            if (this.state.activeView === 'weekly') {
                const weekStart = this._alignToWeekStart(todayDate);
                const weekEnd = this._alignToWeekEnd(todayDate);
                defaultStart = this._toIso(weekStart);
                defaultEnd = this._toIso(weekEnd);
            } else if (this.state.activeView === 'monthly') {
                const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
                const monthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
                defaultStart = this._toIso(monthStart);
                defaultEnd = this._toIso(monthEnd);
            } else if (this.state.activeView === 'yearly') {
                const yearStart = new Date(todayDate.getFullYear(), 0, 1);
                const yearEnd = new Date(todayDate.getFullYear(), 11, 31);
                defaultStart = this._toIso(yearStart);
                defaultEnd = this._toIso(yearEnd);
            } else {
                // 'custom' or default fallback
                defaultStart = this._addDaysIso(today, -30);
                defaultEnd = today;
            }

            // Upgrade legacy storage (v1) and/or seed goalsMeta.
            const storedGoals = this.state.data.goals && typeof this.state.data.goals === 'object' ? this.state.data.goals : {};
            const existingMeta = Array.isArray(this.state.data.goalsMeta) ? this.state.data.goalsMeta : [];
            const metaById = new Map();

            // 1) start with defaults (keep stable ordering) — skip deleted ones
            const dismissed = new Set(this.state.data.dismissedSyncIds || []);
            for (const g of this.defaultGoals) {
                if (!g || typeof g.id !== 'string') continue;
                if (dismissed.has(g.id)) continue; // user explicitly deleted this habit
                const label = typeof g.label === 'string' ? g.label : this._humanizeId(g.id);
                metaById.set(g.id, { id: g.id, label });
            }

            // 2) then merge any stored meta (user custom labels)
            for (const g of existingMeta) {
                if (!g || typeof g.id !== 'string') continue;
                const label = typeof g.label === 'string' && g.label.trim() ? g.label.trim() : this._humanizeId(g.id);
                metaById.set(g.id, { id: g.id, label });
            }

            // 3) finally, include any goal IDs that exist in stored data (import/legacy)
            for (const goalId of Object.keys(storedGoals || {})) {
                if (!metaById.has(goalId)) {
                    metaById.set(goalId, { id: goalId, label: this._humanizeId(goalId) });
                }
            }

            this.state.data.goalsMeta = Array.from(metaById.values());
            this.state.data.version = 2;

            const goalsList = this._getGoalsList();

            for (const goal of this._getGoalsList()) {
                if (!this.state.data.goals[goal.id]) {
                    this.state.data.goals[goal.id] = {
                        startDate: defaultStart,
                        endDate: defaultEnd,
                        completed: {},
                        missedReasons: {},
                        challengeDayStatus: {},
                        challengeTimeWindow: null
                    };
                } else {
                    const g = this.state.data.goals[goal.id];
                    g.completed = g.completed && typeof g.completed === 'object' ? g.completed : {};
                    g.startDate = this._isIsoDate(g.startDate) ? g.startDate : defaultStart;
                    g.endDate = this._isIsoDate(g.endDate) ? g.endDate : defaultEnd;
                    g.challengeDayStatus = this._normalizeChallengeDayStatusMap(g.challengeDayStatus);
                    g.challengeTimeWindow = this._normalizeChallengeTimeWindow(g.challengeTimeWindow);

                    const rawReasons = g.missedReasons && typeof g.missedReasons === 'object' ? g.missedReasons : {};
                    g.missedReasons = {};
                    for (const [dateIso, reasons] of Object.entries(rawReasons)) {
                        if (!this._isIsoDate(dateIso)) continue;
                        const normalized = this._normalizeReasonList(reasons);
                        if (normalized.length > 0) {
                            g.missedReasons[dateIso] = normalized;
                        }
                    }
                }
            }

            if (!this.state.data.goals[this.state.activeGoalId]) {
                this.state.activeGoalId = this._getGoalsList()[0]?.id;
            }

            // Persist upgrade/normalization once.
            this._save();
        }

        // --- Rendering ---

        render() {
            this.mountEl.innerHTML = '';
            this.mountEl.classList.remove('habit-tracker-card');
            this.mountEl.classList.add('habit-tracker-card');

            const header = document.createElement('div');
            header.className = 'habit-tracker-header';

            const titleWrap = document.createElement('div');
            titleWrap.className = 'habit-tracker-titlewrap';

            const title = document.createElement('div');
            title.className = 'habit-tracker-title';
            title.textContent = 'Habit Tracker';

            const subtitle = document.createElement('div');
            subtitle.className = 'habit-tracker-subtitle';
            subtitle.textContent = 'Click a day to mark complete. Click missed days or outside-timeframe challenge completions to log thoughts.';

            titleWrap.appendChild(title);
            titleWrap.appendChild(subtitle);

            const controls = document.createElement('div');
            controls.className = 'habit-tracker-controls';

            const goalLabel = document.createElement('label');
            goalLabel.className = 'habit-ctrl';
            goalLabel.innerHTML = `<span class="habit-ctrl-label">Goal</span>`;

            const goalSelect = document.createElement('select');
            goalSelect.className = 'habit-select';
            goalSelect.setAttribute('aria-label', 'Select goal');
            for (const goal of this._getGoalsList()) {
                const opt = document.createElement('option');
                opt.value = goal.id;
                opt.textContent = this._getSyncedHabitIcon(goal.id) + goal.label;
                if (goal.id === this.state.activeGoalId) opt.selected = true;
                goalSelect.appendChild(opt);
            }
            goalSelect.addEventListener('change', this._handleGoalChange);
            goalLabel.appendChild(goalSelect);

            const manageBtn = document.createElement('button');
            manageBtn.className = 'habit-ghost habit-manage-btn';
            manageBtn.type = 'button';
            manageBtn.textContent = this.state.isManageOpen ? 'Done' : 'Manage';
            manageBtn.setAttribute('data-testid', 'habit-manage');
            manageBtn.addEventListener('click', this._handleToggleManage);

            // View selector tabs
            const viewTabs = document.createElement('div');
            viewTabs.className = 'habit-view-tabs';
            const views = [
                { id: 'weekly', label: 'Week' },
                { id: 'monthly', label: 'Month' },
                { id: 'yearly', label: 'Year' },
                { id: 'custom', label: 'Custom' }
            ];
            for (const v of views) {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'habit-view-tab';
                if (v.id === this.state.activeView) tab.classList.add('is-active');
                tab.setAttribute('data-view', v.id);
                tab.textContent = v.label;
                tab.addEventListener('click', this._handleViewChange);
                viewTabs.appendChild(tab);
            }

            const range = this._getActiveGoalRange();

            // Custom date inputs (shown only when view is 'custom')
            const dateControls = document.createElement('div');
            dateControls.className = 'habit-date-controls';
            if (this.state.activeView !== 'custom') dateControls.classList.add('is-hidden');

            const startLabel = document.createElement('label');
            startLabel.className = 'habit-ctrl';
            startLabel.innerHTML = `<span class="habit-ctrl-label">Start</span>`;
            const startInput = document.createElement('input');
            startInput.type = 'date';
            startInput.className = 'habit-date';
            startInput.value = range.startDate;
            startInput.setAttribute('data-role', 'start');
            startInput.addEventListener('change', this._handleApplyRange);
            startLabel.appendChild(startInput);

            const endLabel = document.createElement('label');
            endLabel.className = 'habit-ctrl';
            endLabel.innerHTML = `<span class="habit-ctrl-label">End</span>`;
            const endInput = document.createElement('input');
            endInput.type = 'date';
            endInput.className = 'habit-date';
            endInput.value = range.endDate;
            endInput.setAttribute('data-role', 'end');
            endInput.addEventListener('change', this._handleApplyRange);
            endLabel.appendChild(endInput);

            const applyBtn = document.createElement('button');
            applyBtn.className = 'habit-apply';
            applyBtn.type = 'button';
            applyBtn.textContent = 'Apply';
            applyBtn.addEventListener('click', this._handleApplyRange);

            dateControls.appendChild(startLabel);
            dateControls.appendChild(endLabel);
            dateControls.appendChild(applyBtn);

            const exportBtn = document.createElement('button');
            exportBtn.className = 'habit-ghost';
            exportBtn.type = 'button';
            exportBtn.textContent = 'Export';
            exportBtn.addEventListener('click', this._handleExport);

            const importBtn = document.createElement('button');
            importBtn.className = 'habit-ghost';
            importBtn.type = 'button';
            importBtn.textContent = 'Import';
            importBtn.addEventListener('click', this._handleImport);

            controls.appendChild(goalLabel);
            controls.appendChild(manageBtn);
            controls.appendChild(viewTabs);

            // Period navigation (prev / label / next) — hidden in custom view
            if (this.state.activeView !== 'custom') {
                const periodNav = document.createElement('div');
                periodNav.className = 'habit-period-nav';

                const prevBtn = document.createElement('button');
                prevBtn.type = 'button';
                prevBtn.className = 'habit-period-nav-btn';
                prevBtn.setAttribute('aria-label', 'Previous period');
                prevBtn.innerHTML = '&#8249;'; // ‹
                prevBtn.addEventListener('click', this._handleNavPrev);

                const periodLabel = document.createElement('span');
                periodLabel.className = 'habit-period-label';
                periodLabel.textContent = this._getPeriodLabel();

                const nextBtn = document.createElement('button');
                nextBtn.type = 'button';
                nextBtn.className = 'habit-period-nav-btn';
                nextBtn.setAttribute('aria-label', 'Next period');
                nextBtn.innerHTML = '&#8250;'; // ›
                nextBtn.disabled = (this.state.periodOffset || 0) >= 0;
                nextBtn.addEventListener('click', this._handleNavNext);

                periodNav.appendChild(prevBtn);
                periodNav.appendChild(periodLabel);
                periodNav.appendChild(nextBtn);
                controls.appendChild(periodNav);
            }

            controls.appendChild(dateControls);
            controls.appendChild(exportBtn);
            controls.appendChild(importBtn);

            header.appendChild(titleWrap);
            header.appendChild(controls);

            const body = document.createElement('div');
            body.className = 'habit-tracker-body';

            const stats = document.createElement('div');
            stats.className = 'habit-tracker-stats';
            stats.textContent = this._buildStatsText();

            const gridWrap = document.createElement('div');
            gridWrap.className = 'habit-grid-wrap';

            const gridShell = document.createElement('div');
            gridShell.className = 'habit-grid-shell';

            const weekdays = document.createElement('div');
            weekdays.className = 'habit-weekdays';
            for (const label of this._weekdayLabels()) {
                const el = document.createElement('div');
                el.className = 'habit-weekday';
                el.textContent = label;
                weekdays.appendChild(el);
            }

            const grid = document.createElement('div');
            grid.className = 'habit-grid';
            grid.setAttribute('role', 'grid');
            grid.setAttribute('aria-label', 'Habit completion grid');
            grid.addEventListener('click', this._handleGridClick);

            this._renderGridCellsInto(grid);

            gridShell.appendChild(weekdays);
            gridShell.appendChild(grid);
            gridWrap.appendChild(gridShell);

            const legend = document.createElement('div');
            legend.className = 'habit-legend';
            if (this._isChallengeTimingHabit(this.state.activeGoalId)) {
                legend.innerHTML = `
                    <span class="habit-legend-item"><span class="habit-swatch habit-swatch-future"></span>Future</span>
                    <span class="habit-legend-item"><span class="habit-swatch habit-swatch-window-missed"></span>Missed</span>
                    <span class="habit-legend-item"><span class="habit-swatch habit-swatch-window-outside"></span>Done Outside Timeframe</span>
                    <span class="habit-legend-item"><span class="habit-swatch habit-swatch-window-within"></span>Done Within Timeframe</span>
                `;
            } else {
                legend.innerHTML = `
                    <span class="habit-legend-item"><span class="habit-swatch habit-swatch-empty"></span>Pending</span>
                    <span class="habit-legend-item"><span class="habit-swatch habit-swatch-done"></span>Complete</span>
                    <span class="habit-legend-item"><span class="habit-swatch habit-swatch-missed"></span>Missed</span>
                `;
            }

            // Stats row with stats on left and legend on right
            const statsRow = document.createElement('div');
            statsRow.className = 'habit-tracker-stats-row';
            statsRow.appendChild(stats);
            statsRow.appendChild(legend);

            body.appendChild(statsRow);

            // Manage panel (add/delete habits)
            if (this.state.isManageOpen) {
                const panel = document.createElement('div');
                panel.className = 'habit-manage-panel';
                panel.setAttribute('data-testid', 'habit-manage-panel');
                panel.addEventListener('click', this._handleManageClick);

                const manageHeader = document.createElement('div');
                manageHeader.className = 'habit-manage-header';
                manageHeader.innerHTML = `
                    <div class="habit-manage-header-row">
                        <div class="habit-manage-title">Manage habits</div>
                        <button type="button" class="habit-ghost habit-manage-close" data-action="close-manage" data-testid="habit-manage-close">Close</button>
                    </div>
                    <div class="habit-manage-hint">Add, edit, or delete habits. Deleting removes history.</div>
                `;

                const row = document.createElement('div');
                row.className = 'habit-manage-row';

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'habit-manage-input';
                input.placeholder = 'New habit (e.g., Meditate 10m)';
                input.setAttribute('aria-label', 'New habit name');
                input.setAttribute('data-testid', 'habit-add-input');
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this._handleAddHabit();
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        this.state.isManageOpen = false;
                        this.state.editingGoalId = null;
                        this.render();
                    }
                });

                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'habit-apply habit-manage-add';
                addBtn.textContent = 'Add';
                addBtn.setAttribute('data-testid', 'habit-add-btn');
                addBtn.addEventListener('click', this._handleAddHabit);

                row.appendChild(input);
                row.appendChild(addBtn);

                const list = document.createElement('div');
                list.className = 'habit-manage-list';
                list.setAttribute('data-testid', 'habit-list');

                for (const g of this._getGoalsList()) {
                    const item = document.createElement('div');
                    item.className = 'habit-manage-item';

                    const isEditing = this.state.editingGoalId === g.id;

                    const name = document.createElement('div');
                    name.className = 'habit-manage-name';

                    if (this._isSyncedHabit(g.id)) {
                        item.classList.add('is-synced');
                    }

                    if (isEditing) {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.className = 'habit-manage-rename-input';
                        input.value = g.label;
                        input.setAttribute('data-goal-id', g.id);
                        input.setAttribute('aria-label', `Rename habit ${g.label}`);
                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                this._renameHabit(g.id, input.value);
                            }
                            if (e.key === 'Escape') {
                                e.preventDefault();
                                this.state.editingGoalId = null;
                                this.render();
                            }
                        });
                        name.appendChild(input);
                    } else {
                        name.textContent = g.label;
                    }

                    const actions = document.createElement('div');
                    actions.className = 'habit-manage-actions';

                    if (isEditing) {
                        const save = document.createElement('button');
                        save.type = 'button';
                        save.className = 'habit-apply habit-manage-save';
                        save.textContent = 'Save';
                        save.setAttribute('data-action', 'save-rename');
                        save.setAttribute('data-goal-id', g.id);

                        const cancel = document.createElement('button');
                        cancel.type = 'button';
                        cancel.className = 'habit-ghost habit-manage-cancel';
                        cancel.textContent = 'Cancel';
                        cancel.setAttribute('data-action', 'cancel-rename');
                        cancel.setAttribute('data-goal-id', g.id);

                        actions.appendChild(save);
                        actions.appendChild(cancel);
                    } else {
                        const rename = document.createElement('button');
                        rename.type = 'button';
                        rename.className = 'habit-ghost habit-manage-rename';
                        rename.textContent = 'Edit';
                        rename.setAttribute('data-action', 'start-rename');
                        rename.setAttribute('data-goal-id', g.id);
                        actions.appendChild(rename);
                    }

                    const del = document.createElement('button');
                    del.type = 'button';
                    del.className = 'habit-ghost habit-manage-delete';
                    del.textContent = 'Delete';
                    del.setAttribute('data-action', 'delete-habit');
                    del.setAttribute('data-goal-id', g.id);

                    item.appendChild(name);
                    actions.appendChild(del);
                    item.appendChild(actions);
                    list.appendChild(item);
                }

                panel.appendChild(manageHeader);
                panel.appendChild(row);
                panel.appendChild(list);
                this.mountEl.appendChild(panel); // append to mountEl for overlay styling
            }

            body.appendChild(gridWrap);
            body.appendChild(this._buildMissedReasonsTimeline());
            
            // Add comparative bar chart
            body.appendChild(this._buildBarChart());

            this.mountEl.appendChild(header);
            this.mountEl.appendChild(body);
        }

        _renderGridCellsInto(gridEl) {
            const { startDate, endDate, completed, missedReasons, challengeDayStatus, challengeTimeWindow } = this._getActiveGoalRange();
            const start = this._parseIso(startDate);
            const end = this._parseIso(endDate);
            const isChallengeTiming = this._isChallengeTimingHabit(this.state.activeGoalId);
            const windowLabel = challengeTimeWindow
                ? `${challengeTimeWindow.start} - ${challengeTimeWindow.end}`
                : '';

            if (!start || !end || start > end) {
                gridEl.innerHTML = `<div class="habit-grid-empty">Invalid date range</div>`;
                return;
            }

            const alignedStart = this._alignToWeekStart(start);
            const alignedEnd = this._alignToWeekEnd(end);

            const totalDays = Math.floor((alignedEnd - alignedStart) / 86400000) + 1;

            gridEl.innerHTML = '';

            const today = this._isoToday();

            for (let i = 0; i < totalDays; i++) {
                const d = new Date(alignedStart.getTime() + i * 86400000);
                const iso = this._toIso(d);

                const inRange = iso >= startDate && iso <= endDate;
                const isDone = !!completed?.[iso];
                const isPast = iso < today;
                const isToday = iso === today;
                const reasonCount = this._normalizeReasonList(missedReasons?.[iso]).length;
                const challengeOutcome = challengeDayStatus?.[iso];

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'habit-cell';
                btn.setAttribute('role', 'gridcell');
                btn.setAttribute('data-date', iso);

                if (inRange && isToday) {
                    btn.classList.add('is-today');
                    btn.setAttribute('aria-current', 'date');
                }

                if (!inRange) {
                    btn.classList.add('is-outside');
                    btn.disabled = true;
                    btn.setAttribute('aria-hidden', 'true');
                    btn.tabIndex = -1;
                } else if (isChallengeTiming) {
                    btn.setAttribute('aria-pressed', isDone ? 'true' : 'false');

                    if (isDone && challengeOutcome === 'outside') {
                        btn.classList.add('is-challenge-outside-window');
                        if (reasonCount > 0) {
                            btn.classList.add('has-missed-reasons');
                            btn.setAttribute('data-reason-count', String(reasonCount));
                            btn.title = windowLabel
                                ? `${iso} — Done outside timeframe (${windowLabel}) - ${reasonCount} thought${reasonCount === 1 ? '' : 's'}`
                                : `${iso} — Done outside timeframe - ${reasonCount} thought${reasonCount === 1 ? '' : 's'}`;
                        } else {
                            btn.title = windowLabel
                                ? `${iso} — Done outside timeframe (${windowLabel})`
                                : `${iso} — Done outside timeframe`;
                        }
                    } else if (isDone) {
                        btn.classList.add('is-challenge-within-window');
                        btn.title = windowLabel
                            ? `${iso} — Done within timeframe (${windowLabel})`
                            : `${iso} — Done`;
                    } else if (isPast) {
                        btn.classList.add('is-challenge-missed');
                        if (reasonCount > 0) {
                            btn.classList.add('has-missed-reasons');
                            btn.setAttribute('data-reason-count', String(reasonCount));
                            btn.title = `${iso} — Missed (${reasonCount} reason${reasonCount === 1 ? '' : 's'})`;
                        } else {
                            btn.title = `${iso} — Missed`;
                        }
                    } else {
                        btn.classList.add('is-challenge-pending');
                        btn.title = `${iso} — Future / Pending`;
                    }
                } else if (isDone) {
                    btn.classList.add('is-done');
                    btn.setAttribute('aria-pressed', 'true');
                    btn.title = `${iso} — Complete`;
                } else if (isPast) {
                    btn.classList.add('is-missed');
                    btn.setAttribute('aria-pressed', 'false');
                    if (reasonCount > 0) {
                        btn.classList.add('has-missed-reasons');
                        btn.setAttribute('data-reason-count', String(reasonCount));
                        btn.title = `${iso} — Missed (${reasonCount} reason${reasonCount === 1 ? '' : 's'})`;
                    } else {
                        btn.title = `${iso} — Missed`;
                    }
                } else {
                    btn.setAttribute('aria-pressed', 'false');
                    btn.title = `${iso} — Pending`;
                }

                gridEl.appendChild(btn);
            }
        }

        _buildStatsText() {
            const { startDate, endDate, completed } = this._getActiveGoalRange();
            const start = this._parseIso(startDate);
            const end = this._parseIso(endDate);

            if (!start || !end || start > end) return '—';

            const days = Math.floor((end - start) / 86400000) + 1;
            const doneCount = Object.keys(completed || {}).filter((iso) => iso >= startDate && iso <= endDate).length;
            const pct = days > 0 ? Math.round((doneCount / days) * 100) : 0;

            return `${doneCount}/${days} days complete (${pct}%)`;
        }

        _buildBarChart() {
            const chartWrap = document.createElement('div');
            chartWrap.className = 'habit-tracker-chart';

            const title = document.createElement('div');
            title.className = 'habit-chart-title';
            title.textContent = 'Performance Overview (Selected Period)';
            chartWrap.appendChild(title);

            const { startDate, endDate } = this._getActiveGoalRange();
            const start = this._parseIso(startDate);
            const end = this._parseIso(endDate);

            if (!start || !end || start > end) return chartWrap;

            const days = Math.floor((end - start) / 86400000) + 1;
            if (days <= 0) return chartWrap;

            for (const goal of this._getGoalsList()) {
                const goalData = this.state.data.goals[goal.id];
                const completed = goalData?.completed || {};
                const doneCount = Object.keys(completed).filter((iso) => iso >= startDate && iso <= endDate).length;
                const pct = Math.round((doneCount / days) * 100);

                const barRow = document.createElement('div');
                barRow.className = 'habit-chart-row';

                const label = document.createElement('div');
                label.className = 'habit-chart-label';
                label.textContent = goal.label;

                const barBg = document.createElement('div');
                barBg.className = 'habit-chart-bar-bg';
                barBg.title = `${doneCount}/${days} days (${pct}%)`;

                const barFill = document.createElement('div');
                barFill.className = 'habit-chart-bar-fill';
                barFill.style.width = `${pct}%`;

                barBg.appendChild(barFill);
                barRow.appendChild(label);
                barRow.appendChild(barBg);
                
                const pctLabel = document.createElement('div');
                pctLabel.className = 'habit-chart-pct';
                pctLabel.textContent = `${pct}%`;
                barRow.appendChild(pctLabel);

                chartWrap.appendChild(barRow);
            }

            return chartWrap;
        }

        _collectMissedReasonEntries(limit = 60) {
            const goals = this._getGoalsList();
            const entries = [];

            for (const goal of goals) {
                const goalData = this.state.data.goals[goal.id];
                if (!goalData || typeof goalData !== 'object') continue;

                const completed = goalData.completed && typeof goalData.completed === 'object' ? goalData.completed : {};
                const reasonsMap = goalData.missedReasons && typeof goalData.missedReasons === 'object' ? goalData.missedReasons : {};
                const challengeDayStatus = goalData.challengeDayStatus && typeof goalData.challengeDayStatus === 'object'
                    ? goalData.challengeDayStatus
                    : {};

                for (const [dateIso, reasonList] of Object.entries(reasonsMap)) {
                    if (!this._isIsoDate(dateIso)) continue;
                    const isCompleted = !!completed[dateIso];
                    const isOutsideCompletion = isCompleted && challengeDayStatus[dateIso] === 'outside';
                    if (isCompleted && !isOutsideCompletion) continue;

                    const reasons = this._normalizeReasonList(reasonList);
                    if (reasons.length === 0) continue;

                    entries.push({
                        goalId: goal.id,
                        goalLabel: goal.label,
                        dateIso,
                        reasons,
                        entryType: isOutsideCompletion ? 'outside' : 'missed'
                    });
                }
            }

            entries.sort((a, b) => {
                if (a.dateIso !== b.dateIso) return a.dateIso < b.dateIso ? 1 : -1;
                return a.goalLabel.localeCompare(b.goalLabel);
            });

            return entries.slice(0, Math.max(1, limit));
        }

        _buildMissedReasonsTimeline() {
            const wrap = document.createElement('section');
            wrap.className = 'habit-reasons-timeline';

            const entries = this._collectMissedReasonEntries();

            const header = document.createElement('div');
            header.className = 'habit-reasons-header';

            const title = document.createElement('div');
            title.className = 'habit-reasons-title';
            title.textContent = 'Thoughts Timeline';

            const subtitle = document.createElement('div');
            subtitle.className = 'habit-reasons-subtitle';
            subtitle.textContent = entries.length > 0
                ? `${entries.length} saved thought${entries.length === 1 ? '' : 's'} across all habits.`
                : 'No missed-day reasons or outside-timeframe thoughts saved yet.';

            header.appendChild(title);
            header.appendChild(subtitle);
            wrap.appendChild(header);

            if (entries.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'habit-reasons-empty';
                empty.textContent = 'Click any missed day or outside-timeframe completion in the calendar to add thoughts here.';
                wrap.appendChild(empty);
                return wrap;
            }

            const list = document.createElement('div');
            list.className = 'habit-reasons-list';
            list.addEventListener('click', this._handleReasonsTimelineClick);

            for (const entry of entries) {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'habit-reason-item';
                item.setAttribute('data-goal-id', entry.goalId);
                item.setAttribute('data-date', entry.dateIso);
                item.setAttribute('data-entry-type', entry.entryType || 'missed');

                const head = document.createElement('div');
                head.className = 'habit-reason-item-head';

                const date = document.createElement('span');
                date.className = 'habit-reason-date';
                date.textContent = entry.dateIso;

                const typeBadge = document.createElement('span');
                typeBadge.className = 'habit-reason-type';
                if (entry.entryType === 'outside') {
                    typeBadge.classList.add('is-outside');
                    typeBadge.textContent = 'Outside Timeframe';
                } else {
                    typeBadge.classList.add('is-missed');
                    typeBadge.textContent = 'Missed Day';
                }

                const meta = document.createElement('div');
                meta.className = 'habit-reason-meta';
                meta.appendChild(date);
                meta.appendChild(typeBadge);

                const goal = document.createElement('span');
                goal.className = 'habit-reason-goal';
                goal.textContent = entry.goalLabel;

                head.appendChild(meta);
                head.appendChild(goal);

                const ul = document.createElement('ul');
                ul.className = 'habit-reason-bullets';
                for (const reason of entry.reasons) {
                    const li = document.createElement('li');
                    li.textContent = reason;
                    ul.appendChild(li);
                }

                const hint = document.createElement('div');
                hint.className = 'habit-reason-edit-hint';
                hint.textContent = entry.entryType === 'outside'
                    ? 'Click to edit thoughts'
                    : 'Click to edit or mark complete';

                item.appendChild(head);
                item.appendChild(ul);
                item.appendChild(hint);
                list.appendChild(item);
            }

            wrap.appendChild(list);
            return wrap;
        }

        async _handleReasonsTimelineClick(e) {
            const item = e.target.closest('button.habit-reason-item');
            if (!item) return;

            const goalId = item.getAttribute('data-goal-id');
            const dateIso = item.getAttribute('data-date');
            const entryType = item.getAttribute('data-entry-type') === 'outside' ? 'outside' : 'missed';
            if (!goalId || !this._isIsoDate(dateIso)) return;

            const goalData = this.state.data.goals[goalId];
            if (!goalData) return;
            const isChallengeTiming = this._isChallengeTimingHabit(goalId);

            if (!goalData.completed || typeof goalData.completed !== 'object') goalData.completed = {};
            if (!goalData.missedReasons || typeof goalData.missedReasons !== 'object') goalData.missedReasons = {};

            const result = await this._showMissedReasonsModal({
                dateIso,
                reasons: this._normalizeReasonList(goalData.missedReasons[dateIso]),
                allowMarkComplete: !isChallengeTiming && entryType !== 'outside',
                context: entryType
            });

            if (!result) return;

            if (result.action === 'mark-complete') {
                if (isChallengeTiming) {
                    this._flashInfo('Challenge completion is synced from the challenge timeline.');
                    return;
                }

                goalData.completed[dateIso] = 1;
                delete goalData.missedReasons[dateIso];
                await this._save();
                this.render();

                if (window.ChallengeManager) {
                    window.ChallengeManager.recordProgress('habits', 1);
                }

                this._emitDataChanged('habit', { immediate: true });
                return;
            }

            if (result.action === 'save') {
                if (result.reasons.length > 0) {
                    goalData.missedReasons[dateIso] = result.reasons;
                } else {
                    delete goalData.missedReasons[dateIso];
                }

                await this._save();
                this.render();
                if (entryType === 'outside') {
                    this._flashInfo(result.reasons.length > 0 ? 'Outside-timeframe thoughts saved.' : 'Outside-timeframe thoughts cleared.');
                } else {
                    this._flashInfo(result.reasons.length > 0 ? 'Missed-day reasons saved.' : 'Missed-day reasons cleared.');
                }
                this._emitDataChanged('habit', { immediate: true });
            }
        }

        // --- Events ---

        _getDateRangeForView(view, anchorDate = new Date()) {
            const today = new Date(anchorDate);

            if (view === 'weekly') {
                const weekStart = this._alignToWeekStart(today);
                const weekEnd = this._alignToWeekEnd(today);
                return { startDate: this._toIso(weekStart), endDate: this._toIso(weekEnd) };
            }

            if (view === 'monthly') {
                const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                return { startDate: this._toIso(monthStart), endDate: this._toIso(monthEnd) };
            }

            if (view === 'yearly') {
                const yearStart = new Date(today.getFullYear(), 0, 1);
                const yearEnd = new Date(today.getFullYear(), 11, 31);
                return { startDate: this._toIso(yearStart), endDate: this._toIso(yearEnd) };
            }

            return null;
        }

        _applyViewRangeToGoal(goalId, view = this.state.activeView) {
            if (!goalId || view === 'custom') return false;

            const goalData = this.state.data.goals[goalId];
            if (!goalData) return false;

            const range = this._getDateRangeForView(view, this._getShiftedAnchor());
            if (!range) return false;

            const changed = goalData.startDate !== range.startDate || goalData.endDate !== range.endDate;
            goalData.startDate = range.startDate;
            goalData.endDate = range.endDate;
            return changed;
        }

        _applyViewRangeToAllGoals(view = this.state.activeView) {
            if (view === 'custom') return false;

            let changed = false;
            for (const goal of this._getGoalsList()) {
                if (this._applyViewRangeToGoal(goal.id, view)) changed = true;
            }
            return changed;
        }

        async _handleGoalChange(e) {
            const nextGoal = e.target.value;
            this.state.activeGoalId = nextGoal;

            const changed = this._applyViewRangeToGoal(nextGoal, this.state.activeView);
            if (changed) {
                await this._save();
            }

            this.render();
        }

        // Returns a Date shifted by periodOffset periods from today
        _getShiftedAnchor() {
            const today = new Date();
            const offset = this.state.periodOffset || 0;
            if (offset === 0) return today;
            const view = this.state.activeView;
            if (view === 'weekly') {
                const d = new Date(today);
                d.setDate(d.getDate() + offset * 7);
                return d;
            }
            if (view === 'monthly') {
                return new Date(today.getFullYear(), today.getMonth() + offset, 1);
            }
            if (view === 'yearly') {
                return new Date(today.getFullYear() + offset, 0, 1);
            }
            return today;
        }

        // Human-readable label for the current period (e.g. "April 2026", "Week of Mar 30")
        _getPeriodLabel() {
            if (this.state.activeView === 'custom') return '';
            const anchor = this._getShiftedAnchor();
            const view = this.state.activeView;
            if (view === 'weekly') {
                const ws = this._alignToWeekStart(anchor);
                const we = this._alignToWeekEnd(anchor);
                const opts = { month: 'short', day: 'numeric' };
                return `${ws.toLocaleDateString(undefined, opts)} – ${we.toLocaleDateString(undefined, opts)}`;
            }
            if (view === 'monthly') {
                return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            }
            if (view === 'yearly') {
                return String(anchor.getFullYear());
            }
            return '';
        }

        async _handleNavPrev() {
            if (this.state.activeView === 'custom') return;
            this.state.periodOffset = (this.state.periodOffset || 0) - 1;
            this._applyViewRangeToAllGoals(this.state.activeView);
            await this._save();
            this.render();
        }

        async _handleNavNext() {
            if (this.state.activeView === 'custom') return;
            const next = (this.state.periodOffset || 0) + 1;
            if (next > 0) return; // don't navigate into the future
            this.state.periodOffset = next;
            this._applyViewRangeToAllGoals(this.state.activeView);
            await this._save();
            this.render();
        }

        async _handleViewChange(e) {
            const view = e.target.getAttribute('data-view');
            if (!view) return;

            this.state.activeView = view;
            this.state.periodOffset = 0; // reset to current period when switching view

            // Keep all goals/challenges in sync with the currently selected period view.
            this._applyViewRangeToAllGoals(view);

            await this._save();
            this.render();
        }

        async _handleApplyRange() {
            const startInput = this.mountEl.querySelector('input[data-role="start"]');
            const endInput = this.mountEl.querySelector('input[data-role="end"]');

            const startDate = startInput?.value;
            const endDate = endInput?.value;

            if (!this._isIsoDate(startDate) || !this._isIsoDate(endDate)) {
                this._flashError('Please select valid dates.');
                return;
            }

            if (startDate > endDate) {
                this._flashError('Start must be before end.');
                return;
            }

            const goalData = this.state.data.goals[this.state.activeGoalId];
            goalData.startDate = startDate;
            goalData.endDate = endDate;

            await this._save();
            this.render();
        }

        async _handleGridClick(e) {
            const btn = e.target.closest('button.habit-cell');
            if (!btn || btn.disabled) return;

            const iso = btn.getAttribute('data-date');
            if (!this._isIsoDate(iso)) return;

            // Don't allow clicking on missed days (past days that aren't done)
            const today = this._isoToday();
            const goalData = this.state.data.goals[this.state.activeGoalId];
            const isChallengeTiming = this._isChallengeTimingHabit(this.state.activeGoalId);
            if (!goalData.completed) goalData.completed = {};
            if (!goalData.missedReasons || typeof goalData.missedReasons !== 'object') goalData.missedReasons = {};

            const isDone = !!goalData.completed[iso];
            const isPast = iso < today;
            const reasonsForDay = this._normalizeReasonList(goalData.missedReasons[iso]);
            const challengeOutcome = goalData.challengeDayStatus?.[iso];

            if (isPast && !isDone) {
                const result = await this._showMissedReasonsModal({
                    dateIso: iso,
                    reasons: reasonsForDay,
                    allowMarkComplete: !isChallengeTiming,
                    context: 'missed'
                });

                if (!result) return;

                if (result.action === 'mark-complete') {
                    if (isChallengeTiming) {
                        this._flashInfo('Challenge completion is synced from the challenge timeline.');
                        return;
                    }

                    goalData.completed[iso] = 1;
                    delete goalData.missedReasons[iso];
                    await this._save();
                    this.render();

                    if (window.ChallengeManager) {
                        window.ChallengeManager.recordProgress('habits', 1);
                    }
                    this._emitDataChanged('habit', { immediate: true });
                    return;
                }

                if (result.action === 'save') {
                    if (result.reasons.length > 0) {
                        goalData.missedReasons[iso] = result.reasons;
                    } else {
                        delete goalData.missedReasons[iso];
                    }

                    await this._save();
                    this.render();
                    this._flashInfo(result.reasons.length > 0 ? 'Missed-day reasons saved.' : 'Missed-day reasons cleared.');
                    this._emitDataChanged('habit', { immediate: true });
                }
                return;
            }

            if (isChallengeTiming && isDone && challengeOutcome === 'outside') {
                const result = await this._showMissedReasonsModal({
                    dateIso: iso,
                    reasons: reasonsForDay,
                    allowMarkComplete: false,
                    context: 'outside'
                });

                if (!result) return;

                if (result.action === 'save') {
                    if (result.reasons.length > 0) {
                        goalData.missedReasons[iso] = result.reasons;
                    } else {
                        delete goalData.missedReasons[iso];
                    }

                    await this._save();
                    this.render();
                    this._flashInfo(result.reasons.length > 0 ? 'Outside-timeframe thoughts saved.' : 'Outside-timeframe thoughts cleared.');
                    this._emitDataChanged('habit', { immediate: true });
                }
                return;
            }

            if (isChallengeTiming) {
                return;
            }

            // If it's a past day and not done, we used to block changing it,
            // but now we allow users to click it to mark completion retroactively.

            const next = !isDone;
            if (next) {
                goalData.completed[iso] = 1;
                delete goalData.missedReasons[iso];
            } else {
                delete goalData.completed[iso];
            }

            await this._save();
            this.render();

            // Record progress for challenges when habit is marked done
            if (next && window.ChallengeManager) {
                window.ChallengeManager.recordProgress('habits', 1);
            }
            this._emitDataChanged('habit', { immediate: true });
        }

        async _handleExport() {
            const payload = JSON.stringify(this.state.data, null, 2);
            const ok = await this._copyToClipboard(payload);
            if (ok) this._flashInfo('Exported to clipboard.');
            else this._promptCopy(payload);
        }

        async _handleImport() {
            const raw = await this._showInputModal('Import Habit Data', 'Paste exported Habit Tracker JSON here...');
            if (!raw) return;

            try {
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON');
                if (!parsed.goals || typeof parsed.goals !== 'object') throw new Error('Missing goals');

                // Merge: imported goals overwrite by id.
                this.state.data.goals = {
                    ...this.state.data.goals,
                    ...parsed.goals
                };

                // Merge goal metadata if present.
                if (Array.isArray(parsed.goalsMeta)) {
                    const merged = new Map(this._getGoalsList().map(g => [g.id, g]));
                    for (const g of parsed.goalsMeta) {
                        if (!g || typeof g.id !== 'string') continue;
                        const label = typeof g.label === 'string' && g.label.trim() ? g.label.trim() : this._humanizeId(g.id);
                        merged.set(g.id, { id: g.id, label });
                    }
                    this.state.data.goalsMeta = Array.from(merged.values());
                }

                this.state.data.version = 2;

                this._ensureGoalDefaults();
                await this._save();
                this.render();
                this._flashInfo('Imported successfully.');
            } catch (e) {
                this._flashError('Import failed: invalid JSON.');
            }
        }

        _handleToggleManage() {
            this.state.isManageOpen = !this.state.isManageOpen;
            if (!this.state.isManageOpen) {
                this.state.editingGoalId = null;
            }
            this.render();

            if (this.state.isManageOpen) {
                const input = this.mountEl.querySelector('.habit-manage-input');
                input?.focus();
            }
        }

        async _renameHabit(goalId, nextLabelRaw) {
            const nextLabel = String(nextLabelRaw || '').trim();
            if (!nextLabel) {
                this._flashError('Enter a habit name.');
                return;
            }

            const goals = this._getGoalsList();
            const idx = goals.findIndex(g => g.id === goalId);
            if (idx < 0) return;

            goals[idx] = { ...goals[idx], label: nextLabel };
            this.state.data.goalsMeta = goals;
            this.state.editingGoalId = null;

            await this._save();
            this.render();
            this._flashInfo('Habit updated.');
        }

        async _handleAddHabit() {
            const input = this.mountEl.querySelector('input.habit-manage-input');
            const label = input && typeof input.value === 'string' ? input.value.trim() : '';
            if (!label) {
                this._flashError('Type a habit name, then press Add.');
                input?.focus();
                return;
            }

            const baseId = this._slugify(label);
            const existingIds = new Set(this._getGoalsList().map(g => g.id));
            let id = baseId;
            let i = 2;
            while (existingIds.has(id)) {
                id = `${baseId}-${i++}`;
            }

            const meta = this._getGoalsList();
            meta.push({ id, label });
            this.state.data.goalsMeta = meta;

            const today = this._isoToday();
            const range = this._getDateRangeForView(this.state.activeView) || {
                startDate: this._addDaysIso(today, -30),
                endDate: today
            };
            this.state.data.goals[id] = {
                startDate: range.startDate,
                endDate: range.endDate,
                completed: {},
                missedReasons: {},
                challengeDayStatus: {},
                challengeTimeWindow: null
            };

            this.state.activeGoalId = id;
            this.state.editingGoalId = null;

            if (input) input.value = '';
            await this._save();
            this.render();
            this._flashInfo('Habit added.');
        }

        async _handleManageClick(e) {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;

            const action = btn.getAttribute('data-action');
            const goalId = btn.getAttribute('data-goal-id');

            if (action === 'close-manage') {
                this.state.isManageOpen = false;
                this.state.editingGoalId = null;
                this.render();
                return;
            }

            if (action === 'start-rename') {
                if (!goalId) return;
                this.state.editingGoalId = goalId;
                this.render();
                const input = this.mountEl.querySelector(`.habit-manage-rename-input[data-goal-id="${goalId}"]`);
                input?.focus();
                input?.select?.();
                return;
            }

            if (action === 'cancel-rename') {
                this.state.editingGoalId = null;
                this.render();
                return;
            }

            if (action === 'save-rename') {
                if (!goalId) return;
                const input = this.mountEl.querySelector(`.habit-manage-rename-input[data-goal-id="${goalId}"]`);
                await this._renameHabit(goalId, input?.value);
                return;
            }

            if (action !== 'delete-habit') return;
            if (!goalId) return;

            const goals = this._getGoalsList();

            const goal = goals.find(g => g.id === goalId);
            const ok = await this._showConfirmDialog(`Delete habit "${goal?.label || goalId}"? This will remove its history.`);
            if (!ok) return;

            // Track all dismissed habit IDs so they don't reappear (defaults + synced)
            if (!Array.isArray(this.state.data.dismissedSyncIds)) this.state.data.dismissedSyncIds = [];
            if (!this.state.data.dismissedSyncIds.includes(goalId)) {
                this.state.data.dismissedSyncIds.push(goalId);
            }

            this.state.data.goalsMeta = goals.filter(g => g.id !== goalId);
            delete this.state.data.goals[goalId];

            if (this.state.activeGoalId === goalId) {
                this.state.activeGoalId = this._getGoalsList()[0]?.id;
            }

            // Cascade: if this is a synced challenge habit, also delete the challenge
            if (goalId.startsWith('daily-challenge--')) {
                const challengeId = goalId.replace('daily-challenge--', '');
                try {
                    await window.ChallengeManager?.delete?.(challengeId);
                    // Update challenges UI if visible
                    if (typeof ChallengeState !== 'undefined' && document.getElementById('challenges-grid')) {
                        ChallengeState.challenges = window.ChallengeManager?.challenges || [];
                        if (typeof renderChallenges === 'function') renderChallenges();
                        if (typeof updateChallengeStats === 'function') updateChallengeStats();
                    }
                } catch (e) {
                    console.warn('[HabitTracker] Failed to cascade-delete challenge:', e);
                }
            }

            await this._save();
            this.render();
            this._flashInfo('Habit deleted.');
        }

        _flashError(msg) {
            const stats = this.mountEl.querySelector('.habit-tracker-stats');
            if (!stats) return;

            const prev = stats.textContent;
            stats.textContent = msg;
            stats.classList.add('is-error');
            window.setTimeout(() => {
                stats.classList.remove('is-error');
                stats.textContent = prev;
            }, 1600);
        }

        _flashInfo(msg) {
            const stats = this.mountEl.querySelector('.habit-tracker-stats');
            if (!stats) return;

            const prev = stats.textContent;
            stats.textContent = msg;
            stats.classList.add('is-info');
            window.setTimeout(() => {
                stats.classList.remove('is-info');
                stats.textContent = prev;
            }, 1400);
        }

        async _copyToClipboard(text) {
            try {
                if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                    return true;
                }
            } catch {
                // ignore
            }
            return false;
        }

        _promptCopy(text) {
            // Fallback for environments without Clipboard API permissions.
            this._showCopyModal(text);
        }

        // --- Custom Dialogs (replace native prompt/confirm for Electron compatibility) ---

        _showConfirmDialog(message) {
            // Use shared confirm modal if available (from challenges.js)
            if (typeof window.showConfirmModal === 'function') {
                return window.showConfirmModal(message);
            }
            // Fallback: try native confirm (works in browser extension context)
            return Promise.resolve(confirm(message));
        }

        _showInputModal(title, placeholder) {
            return new Promise((resolve) => {
                let overlay = document.getElementById('ht-input-modal');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'ht-input-modal';
                    overlay.className = 'modal';
                    document.body.appendChild(overlay);
                }
                overlay.innerHTML = `
                    <div class="modal-content" style="max-width:480px;">
                        <div class="modal-header">
                            <h2>${title}</h2>
                            <button class="close-modal-btn">&times;</button>
                        </div>
                        <div class="modal-body" style="padding:16px 20px;">
                            <textarea id="ht-input-textarea" rows="8" style="width:100%;resize:vertical;font-family:monospace;font-size:12px;" placeholder="${placeholder || ''}"></textarea>
                            <div class="modal-actions" style="margin-top:12px;">
                                <button type="button" class="btn-secondary" data-action="cancel">Cancel</button>
                                <button type="button" class="btn-primary" data-action="submit">Import</button>
                            </div>
                        </div>
                    </div>
                `;
                overlay.classList.add('active');

                const textarea = overlay.querySelector('#ht-input-textarea');
                textarea?.focus();

                const cleanup = (val) => {
                    overlay.classList.remove('active');
                    resolve(val);
                };

                overlay.querySelector('[data-action="submit"]').addEventListener('click', () => cleanup(textarea?.value || ''));
                overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(null));
                overlay.querySelectorAll('.close-modal-btn').forEach(b => b.addEventListener('click', () => cleanup(null)));
                overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
            });
        }

        _showMissedReasonsModal({ dateIso, reasons, allowMarkComplete = true, context = 'missed' } = {}) {
            return new Promise((resolve) => {
                let overlay = document.getElementById('ht-missed-reasons-modal');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'ht-missed-reasons-modal';
                    overlay.className = 'modal';
                    document.body.appendChild(overlay);
                }

                const safeDate = this._isIsoDate(dateIso) ? dateIso : this._isoToday();
                const initialReasons = this._normalizeReasonList(reasons);
                const isOutsideContext = context === 'outside';
                const modalTitle = isOutsideContext ? 'Outside-Timeframe Thoughts' : 'Missed Day Reasons';
                const helperText = isOutsideContext
                    ? 'Write one thought per line (this creates a list).'
                    : 'Write one reason per line (this creates a list).';
                const emptyText = isOutsideContext ? 'No thoughts listed yet.' : 'No reasons listed yet.';
                const saveActionLabel = isOutsideContext ? 'Save Thoughts' : 'Save Reasons';
                const placeholder = isOutsideContext
                    ? 'Example:\nHad to finish after the allowed hours\nI was helping family earlier\nWork shifted later than planned'
                    : 'Example:\nFelt sick\nUnexpected family event\nHeavy workload from school';

                overlay.innerHTML = `
                    <div class="modal-content" style="max-width:520px;">
                        <div class="modal-header">
                            <h2>${modalTitle}</h2>
                            <button class="close-modal-btn" type="button">&times;</button>
                        </div>
                        <div class="modal-body" style="padding:16px 20px;">
                            <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Date: ${safeDate}</div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">${helperText}</div>
                            <div id="ht-missed-reasons-preview" style="margin-bottom:10px;"></div>
                            <textarea id="ht-missed-reasons-input" rows="7" style="width:100%;resize:vertical;" placeholder="${placeholder}"></textarea>
                            <div class="modal-actions" style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
                                <button type="button" class="btn-secondary" data-action="cancel">Cancel</button>
                                ${allowMarkComplete ? '<button type="button" class="habit-ghost" data-action="mark-complete">Mark Complete</button>' : ''}
                                <button type="button" class="btn-primary" data-action="save">${saveActionLabel}</button>
                            </div>
                        </div>
                    </div>
                `;

                overlay.classList.add('active');

                const textarea = overlay.querySelector('#ht-missed-reasons-input');
                const preview = overlay.querySelector('#ht-missed-reasons-preview');
                if (textarea) textarea.value = initialReasons.join('\n');

                const parseReasons = () => this._normalizeReasonList(String(textarea?.value || '').split(/\r?\n/));

                const renderPreview = () => {
                    if (!preview) return;
                    preview.innerHTML = '';

                    const list = parseReasons();
                    if (list.length === 0) {
                        const empty = document.createElement('div');
                        empty.style.fontSize = '12px';
                        empty.style.color = 'var(--text-muted)';
                        empty.textContent = emptyText;
                        preview.appendChild(empty);
                        return;
                    }

                    const ul = document.createElement('ul');
                    ul.style.margin = '0';
                    ul.style.paddingLeft = '18px';
                    ul.style.maxHeight = '140px';
                    ul.style.overflowY = 'auto';

                    for (const reason of list) {
                        const li = document.createElement('li');
                        li.style.marginBottom = '4px';
                        li.textContent = reason;
                        ul.appendChild(li);
                    }
                    preview.appendChild(ul);
                };

                const cleanup = (result) => {
                    document.removeEventListener('keydown', onKeyDown, true);
                    overlay.removeEventListener('click', onOverlayClick);
                    overlay.classList.remove('active');
                    resolve(result);
                };

                const onKeyDown = (event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        cleanup(null);
                    }
                };

                const onOverlayClick = (event) => {
                    if (event.target === overlay) {
                        cleanup(null);
                    }
                };

                overlay.querySelector('[data-action="save"]')?.addEventListener('click', () => {
                    cleanup({ action: 'save', reasons: parseReasons() });
                });
                if (allowMarkComplete) {
                    overlay.querySelector('[data-action="mark-complete"]')?.addEventListener('click', () => {
                        cleanup({ action: 'mark-complete' });
                    });
                }
                overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => cleanup(null));
                overlay.querySelectorAll('.close-modal-btn').forEach((btn) => btn.addEventListener('click', () => cleanup(null)));

                textarea?.addEventListener('input', renderPreview);
                document.addEventListener('keydown', onKeyDown, true);
                overlay.addEventListener('click', onOverlayClick);

                renderPreview();
                textarea?.focus();
            });
        }

        _showCopyModal(text) {
            let overlay = document.getElementById('ht-copy-modal');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'ht-copy-modal';
                overlay.className = 'modal';
                document.body.appendChild(overlay);
            }
            overlay.innerHTML = `
                <div class="modal-content" style="max-width:480px;">
                    <div class="modal-header">
                        <h2>Copy JSON</h2>
                        <button class="close-modal-btn">&times;</button>
                    </div>
                    <div class="modal-body" style="padding:16px 20px;">
                        <textarea readonly rows="10" style="width:100%;resize:vertical;font-family:monospace;font-size:12px;">${text?.replace?.(/</g, '&lt;') || ''}</textarea>
                        <div class="modal-actions" style="margin-top:12px;">
                            <button type="button" class="btn-primary" data-action="copy">Copy to Clipboard</button>
                            <button type="button" class="btn-secondary close-modal-btn">Close</button>
                        </div>
                    </div>
                </div>
            `;
            overlay.classList.add('active');

            const cleanup = () => overlay.classList.remove('active');
            overlay.querySelectorAll('.close-modal-btn').forEach(b => b.addEventListener('click', cleanup));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
            overlay.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
                const ok = await this._copyToClipboard(text);
                if (ok) {
                    this._flashInfo('Copied to clipboard!');
                    cleanup();
                }
            });
        }

        // --- Helpers ---

        _getActiveGoalRange() {
            return this.state.data.goals[this.state.activeGoalId] || {
                startDate: this._addDaysIso(this._isoToday(), -30),
                endDate: this._isoToday(),
                completed: {},
                missedReasons: {},
                challengeDayStatus: {},
                challengeTimeWindow: null
            };
        }

        _isChallengeTimingHabit(goalId) {
            return typeof goalId === 'string' && goalId.startsWith('daily-challenge--');
        }

        _normalizeChallengeDayStatusMap(value) {
            if (!value || typeof value !== 'object') return {};

            const out = {};
            for (const [dateIso, status] of Object.entries(value)) {
                if (!this._isIsoDate(dateIso)) continue;
                if (status === 'outside' || status === 'within') {
                    out[dateIso] = status;
                }
            }
            return out;
        }

        _normalizeChallengeTimeWindow(value) {
            if (!value || typeof value !== 'object') return null;
            const start = this._normalizeTimeOfDay(value.start);
            const end = this._normalizeTimeOfDay(value.end);
            if (!start || !end || start === end) return null;
            return { start, end };
        }

        _normalizeTimeOfDay(value) {
            if (typeof value !== 'string') return null;
            const trimmed = value.trim();
            const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
            if (!match) return null;
            return `${match[1]}:${match[2]}`;
        }

        _isSameObjectMap(left, right) {
            const leftObj = (left && typeof left === 'object') ? left : {};
            const rightObj = (right && typeof right === 'object') ? right : {};

            const leftKeys = Object.keys(leftObj).sort();
            const rightKeys = Object.keys(rightObj).sort();
            if (leftKeys.length !== rightKeys.length) return false;

            for (let i = 0; i < leftKeys.length; i++) {
                if (leftKeys[i] !== rightKeys[i]) return false;
                if (String(leftObj[leftKeys[i]]) !== String(rightObj[rightKeys[i]])) return false;
            }
            return true;
        }

        _normalizeReasonList(value) {
            if (!Array.isArray(value)) return [];

            const normalized = [];
            for (const entry of value) {
                const text = String(entry || '').trim();
                if (!text) continue;
                normalized.push(text);
                if (normalized.length >= 25) break;
            }

            return normalized;
        }

        _isoToday() {
            return this._toIso(new Date());
        }

        _toIso(date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        _parseIso(iso) {
            if (!this._isIsoDate(iso)) return null;
            const [y, m, d] = iso.split('-').map((n) => Number(n));
            const dt = new Date(y, m - 1, d);
            if (dt.getFullYear() !== y || dt.getMonth() !== (m - 1) || dt.getDate() !== d) return null;
            dt.setHours(0, 0, 0, 0);
            return dt;
        }

        _isIsoDate(v) {
            return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
        }

        _addDaysIso(iso, deltaDays) {
            const dt = this._parseIso(iso);
            if (!dt) return iso;
            dt.setDate(dt.getDate() + deltaDays);
            return this._toIso(dt);
        }

        _alignToWeekStart(date) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            const day = d.getDay();

            const startsOnSunday = this.weekStartsOn === 'sunday';
            const offset = startsOnSunday ? day : (day === 0 ? 6 : day - 1);
            d.setDate(d.getDate() - offset);
            return d;
        }

        _alignToWeekEnd(date) {
            const start = this._alignToWeekStart(date);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            return end;
        }

        _weekdayLabels() {
            const monday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const sunday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            return this.weekStartsOn === 'sunday' ? sunday : monday;
        }
    }

    window.HabitTrackerCalendar = HabitTrackerCalendar;
})();
