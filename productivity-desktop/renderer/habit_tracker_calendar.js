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
     *       completed: { 'YYYY-MM-DD': 1 }
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
        }

        async init() {
            await this._load();
            this._ensureGoalDefaults();
            this.render();
        }

        // --- Storage ---

        _getStorageApi() {
            // Prefer chrome.storage.local; fallback to localStorage for environments without chrome.
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
                    goals: stored.goals && typeof stored.goals === 'object' ? stored.goals : {}
                };
            }
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

        async _save() {
            const storage = this._getStorageApi();
            await storage.set({
                [this.storageKey]: this.state.data
            });
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

            // 1) start with defaults (keep stable ordering)
            for (const g of this.defaultGoals) {
                if (!g || typeof g.id !== 'string') continue;
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
            if (!goalsList.length) {
                // Ensure at least one habit exists
                const fallback = { id: 'habit', label: 'Habit' };
                this.state.data.goalsMeta = [fallback];
            }

            for (const goal of this._getGoalsList()) {
                if (!this.state.data.goals[goal.id]) {
                    this.state.data.goals[goal.id] = {
                        startDate: defaultStart,
                        endDate: defaultEnd,
                        completed: {}
                    };
                } else {
                    const g = this.state.data.goals[goal.id];
                    g.completed = g.completed && typeof g.completed === 'object' ? g.completed : {};
                    g.startDate = this._isIsoDate(g.startDate) ? g.startDate : defaultStart;
                    g.endDate = this._isIsoDate(g.endDate) ? g.endDate : defaultEnd;
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
            subtitle.textContent = 'Click a day to mark complete.';

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
                opt.textContent = goal.label;
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
            startLabel.appendChild(startInput);

            const endLabel = document.createElement('label');
            endLabel.className = 'habit-ctrl';
            endLabel.innerHTML = `<span class="habit-ctrl-label">End</span>`;
            const endInput = document.createElement('input');
            endInput.type = 'date';
            endInput.className = 'habit-date';
            endInput.value = range.endDate;
            endInput.setAttribute('data-role', 'end');
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
            legend.innerHTML = `
                <span class="habit-legend-item"><span class="habit-swatch habit-swatch-empty"></span>Pending</span>
                <span class="habit-legend-item"><span class="habit-swatch habit-swatch-done"></span>Complete</span>
                <span class="habit-legend-item"><span class="habit-swatch habit-swatch-missed"></span>Missed</span>
            `;

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
                    <div class="habit-manage-title">Manage habits</div>
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
                body.appendChild(panel);
            }

            body.appendChild(gridWrap);

            this.mountEl.appendChild(header);
            this.mountEl.appendChild(body);
        }

        _renderGridCellsInto(gridEl) {
            const { startDate, endDate, completed } = this._getActiveGoalRange();
            const start = this._parseIso(startDate);
            const end = this._parseIso(endDate);

            if (!start || !end || start > end) {
                gridEl.innerHTML = `<div class="habit-grid-empty">Invalid date range</div>`;
                return;
            }

            // Align to week boundary to get consistent GitHub-style columns.
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
                } else if (isDone) {
                    btn.classList.add('is-done');
                    btn.setAttribute('aria-pressed', 'true');
                    btn.title = `${iso} — Complete`;
                } else if (isPast) {
                    btn.classList.add('is-missed');
                    btn.setAttribute('aria-pressed', 'false');
                    btn.title = `${iso} — Missed`;
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

        // --- Events ---

        _handleGoalChange(e) {
            const nextGoal = e.target.value;
            this.state.activeGoalId = nextGoal;
            this.render();
        }

        _handleViewChange(e) {
            const view = e.target.getAttribute('data-view');
            if (!view) return;

            this.state.activeView = view;

            // Update date range based on view
            const today = new Date();
            const goalData = this.state.data.goals[this.state.activeGoalId];

            if (view === 'weekly') {
                // Current week (Monday to Sunday)
                const weekStart = this._alignToWeekStart(today);
                const weekEnd = this._alignToWeekEnd(today);
                goalData.startDate = this._toIso(weekStart);
                goalData.endDate = this._toIso(weekEnd);
            } else if (view === 'monthly') {
                // Current month (1st to last day)
                const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                goalData.startDate = this._toIso(monthStart);
                goalData.endDate = this._toIso(monthEnd);
            } else if (view === 'yearly') {
                // Current year (Jan 1 to Dec 31)
                const yearStart = new Date(today.getFullYear(), 0, 1);
                const yearEnd = new Date(today.getFullYear(), 11, 31);
                goalData.startDate = this._toIso(yearStart);
                goalData.endDate = this._toIso(yearEnd);
            }
            // 'custom' keeps existing dates

            this._save();
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
            if (!goalData.completed) goalData.completed = {};

            const isDone = !!goalData.completed[iso];
            const isPast = iso < today;

            // If it's a past day and not done, it's missed - don't allow changes
            if (isPast && !isDone) return;

            const next = !isDone;
            if (next) goalData.completed[iso] = 1;
            else delete goalData.completed[iso];

            await this._save();

            // Update button instantly for snappy UX.
            btn.classList.toggle('is-done', next);
            btn.classList.toggle('is-missed', !next && isPast);
            btn.setAttribute('aria-pressed', String(next));
            btn.title = `${iso} — ${next ? 'Complete' : (isPast ? 'Missed' : 'Pending')}`;

            const stats = this.mountEl.querySelector('.habit-tracker-stats');
            if (stats) stats.textContent = this._buildStatsText();

            // Record progress for challenges when habit is marked done
            if (next && window.ChallengeManager) {
                window.ChallengeManager.recordProgress('habits', 1);
            }
        }

        async _handleExport() {
            const payload = JSON.stringify(this.state.data, null, 2);
            const ok = await this._copyToClipboard(payload);
            if (ok) this._flashInfo('Exported to clipboard.');
            else this._promptCopy(payload);
        }

        async _handleImport() {
            const raw = prompt('Paste exported Habit Tracker JSON:');
            if (!raw) return;

            try {
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON');
                if (!parsed.goals || typeof parsed.goals !== 'object') throw new Error('Missing goals');

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
            } catch {
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
            this.state.data.goals[id] = {
                startDate: this._addDaysIso(today, -30),
                endDate: today,
                completed: {}
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
            if (goals.length <= 1) {
                this._flashError('Keep at least one habit.');
                return;
            }

            const goal = goals.find(g => g.id === goalId);
            const ok = confirm(`Delete habit "${goal?.label || goalId}"? This will remove its history.`);
            if (!ok) return;

            this.state.data.goalsMeta = goals.filter(g => g.id !== goalId);
            delete this.state.data.goals[goalId];

            if (this.state.activeGoalId === goalId) {
                this.state.activeGoalId = this._getGoalsList()[0]?.id;
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
            prompt('Copy this JSON:', text);
        }

        // --- Helpers ---

        _getActiveGoalRange() {
            return this.state.data.goals[this.state.activeGoalId] || {
                startDate: this._addDaysIso(this._isoToday(), -30),
                endDate: this._isoToday(),
                completed: {}
            };
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
            // Validate to avoid JS Date overflow quirks.
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
            const day = d.getDay(); // 0=Sun..6=Sat

            const startsOnSunday = this.weekStartsOn === 'sunday';
            const offset = startsOnSunday ? day : (day === 0 ? 6 : day - 1); // Monday start: Mon=0..Sun=6
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
