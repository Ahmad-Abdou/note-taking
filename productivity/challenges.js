/**
 * Challenges System
 * Manages user challenges with daily/weekly/custom duration tracking
 */

// ============================================================================
// CHALLENGE STATE
// ============================================================================

const ChallengeState = {
    challenges: [],
    filter: 'all'
};

// ============================================================================
// CHALLENGE MANAGER (AUTO-TRACKED)
// ============================================================================

function getTodayYMD() {
    return new Date().toISOString().split('T')[0];
}

function isYesterdayYMD(dateYmd, todayYmd) {
    if (!dateYmd || !todayYmd) return false;
    const d = new Date(dateYmd + 'T00:00:00.000Z');
    const t = new Date(todayYmd + 'T00:00:00.000Z');
    return (t.getTime() - d.getTime()) === 86400000;
}

function normalizeMetric(metric) {
    return String(metric || '').trim().toLowerCase();
}

function normalizeTimeOfDay(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
    if (!match) return null;
    return `${match[1]}:${match[2]}`;
}

function timeToMinutes(hhmm) {
    const normalized = normalizeTimeOfDay(hhmm);
    if (!normalized) return null;
    const [hours, minutes] = normalized.split(':').map(Number);
    return (hours * 60) + minutes;
}

function isValidDailyTimeWindow(start, end) {
    const s = normalizeTimeOfDay(start);
    const e = normalizeTimeOfDay(end);
    return !!s && !!e && s !== e;
}

function formatTimeWindow(start, end) {
    const s = normalizeTimeOfDay(start);
    const e = normalizeTimeOfDay(end);
    if (!s || !e) return '';
    return `${s} - ${e}`;
}

function isTimeWithinWindow(time, start, end) {
    const t = timeToMinutes(time);
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);

    if (t === null || s === null || e === null) return false;
    if (s === e) return true;
    if (s < e) return t >= s && t <= e;

    // Overnight window (example: 22:00 -> 02:00)
    return t >= s || t <= e;
}

function getLocalTimeHHMM(date = new Date()) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function challengeWindowSegments(start, end) {
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    if (s === null || e === null) return [];

    if (s === e) {
        return [{ start: 0, end: 1440 }];
    }

    if (s < e) {
        return [{ start: s, end: e }];
    }

    return [
        { start: s, end: 1440 },
        { start: 0, end: e }
    ];
}

function segmentsOverlap(leftSegments, rightSegments) {
    for (const left of leftSegments) {
        for (const right of rightSegments) {
            const overlapStart = Math.max(left.start, right.start);
            const overlapEnd = Math.min(left.end, right.end);
            if (overlapEnd > overlapStart) return true;
        }
    }
    return false;
}

function normalizeChallengeRecord(raw) {
    const challenge = (raw && typeof raw === 'object') ? { ...raw } : {};

    challenge.id = String(challenge.id || createChallengeId());
    challenge.metric = normalizeMetric(challenge.metric);
    challenge.type = ['daily', 'weekly', 'custom'].includes(challenge.type) ? challenge.type : 'custom';
    challenge.options = (challenge.options && typeof challenge.options === 'object') ? { ...challenge.options } : {};
    challenge.targetProgress = Math.max(1, Number(challenge.targetProgress ?? challenge.target ?? 1) || 1);
    challenge.currentProgress = Math.max(0, Number(challenge.currentProgress) || 0);
    challenge.currentStreak = Math.max(0, Number(challenge.currentStreak) || 0);
    challenge.bestStreak = Math.max(challenge.currentStreak, Number(challenge.bestStreak) || 0);
    challenge.status = challenge.status === 'completed' ? 'completed' : 'active';
    challenge.createdAt = typeof challenge.createdAt === 'string' ? challenge.createdAt : new Date().toISOString();
    challenge.lastProgressDate = typeof challenge.lastProgressDate === 'string' ? challenge.lastProgressDate : null;
    challenge.completedAt = typeof challenge.completedAt === 'string' ? challenge.completedAt : null;
    challenge.timesCompleted = Math.max(0, Number(challenge.timesCompleted) || 0);
    challenge.manualCheckEnabled = challenge.manualCheckEnabled === true || challenge.manualMode === true;

    const manualHistoryRaw = (challenge.manualCheckHistory && typeof challenge.manualCheckHistory === 'object')
        ? challenge.manualCheckHistory
        : ((challenge.checkedDays && typeof challenge.checkedDays === 'object') ? challenge.checkedDays : {});
    challenge.manualCheckHistory = {};

    for (const [dateIso, value] of Object.entries(manualHistoryRaw)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
        if (!value) continue;
        challenge.manualCheckHistory[dateIso] = 1;
    }

    if (challenge.metric === 'focus_sessions') {
        challenge.options.minMinutes = Math.max(0, Number(challenge.options.minMinutes) || 0);
    } else {
        challenge.options = {};
    }

    const normalizedStart = normalizeTimeOfDay(challenge.timeWindowStart || challenge.timeframeStart || challenge.startTime || '');
    const normalizedEnd = normalizeTimeOfDay(challenge.timeWindowEnd || challenge.timeframeEnd || challenge.endTime || '');
    if (challenge.type === 'daily' && isValidDailyTimeWindow(normalizedStart, normalizedEnd)) {
        challenge.timeWindowStart = normalizedStart;
        challenge.timeWindowEnd = normalizedEnd;
    } else {
        challenge.timeWindowStart = null;
        challenge.timeWindowEnd = null;
    }

    const historyRaw = (challenge.completionHistory && typeof challenge.completionHistory === 'object')
        ? challenge.completionHistory
        : {};
    challenge.completionHistory = {};

    for (const [dateIso, entry] of Object.entries(historyRaw)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
        const record = (entry && typeof entry === 'object') ? entry : {};
        let windowOutcome = 'within';
        if (record.windowOutcome === 'outside' || record.withinTimeframe === false) {
            windowOutcome = 'outside';
        }

        challenge.completionHistory[dateIso] = {
            completedAt: typeof record.completedAt === 'string' ? record.completedAt : null,
            completionTime: normalizeTimeOfDay(record.completionTime || ''),
            windowOutcome
        };
    }

    const customTitle = typeof challenge.title === 'string' && challenge.title.trim();
    challenge.title = customTitle
        ? challenge.title.trim()
        : buildChallengeTitle(challenge.metric, challenge.targetProgress, challenge.options);
    challenge.customTitle = !!customTitle;
    challenge.description = buildChallengeDescription(challenge.metric, challenge.targetProgress, challenge.options);

    return challenge;
}

function createChallengeId() {
    return 'challenge_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

function buildChallengeTitle(metric, targetCount, options) {
    const n = Number(targetCount) || 0;
    const normalized = normalizeMetric(metric);

    if (normalized === 'focus_sessions') {
        const minMinutes = Number(options?.minMinutes);
        return minMinutes > 0
            ? `Complete ${n} focus sessions (≥ ${minMinutes} min)`
            : `Complete ${n} focus sessions`;
    }
    if (normalized === 'focus_time') {
        return `Focus for ${n} minutes`;
    }
    if (normalized === 'tasks') return `Finish ${n} tasks`;
    if (normalized === 'reviews') return `Complete ${n} reviews`;

    // Fallback
    return `Complete ${n} ${normalized || 'items'}`;
}

function buildChallengeDescription(metric, targetCount, options) {
    const normalized = normalizeMetric(metric);
    if (normalized === 'focus_sessions') {
        const minMinutes = Number(options?.minMinutes);
        return minMinutes > 0
            ? `Progress updates automatically when you complete a focus session lasting at least ${minMinutes} minutes.`
            : 'Progress updates automatically when you complete a focus session.';
    }
    if (normalized === 'focus_time') {
        return 'Progress updates automatically when you complete focus sessions (minutes add up).';
    }
    if (normalized === 'tasks') return 'Progress updates automatically when you mark tasks as completed.';
    if (normalized === 'reviews') return 'Progress updates automatically when you complete a review.';
    return 'Progress updates automatically when you complete the linked action.';
}

function emitChallengeDataChanged(detail = {}) {
    window.dispatchEvent(new CustomEvent('productivity:data-changed', {
        detail: {
            source: 'challenge',
            ...detail
        }
    }));
}

const ChallengeManager = {
    _loaded: false,
    _loadingPromise: null,
    challenges: [],

    async ensureLoaded() {
        if (this._loaded) return;
        if (this._loadingPromise) {
            await this._loadingPromise;
            return;
        }

        this._loadingPromise = (async () => {
            try {
                const raw = await ProductivityData?.DataStore?.getChallenges?.();
                this.challenges = Array.isArray(raw)
                    ? raw.map(normalizeChallengeRecord)
                    : [];
            } catch (e) {
                console.warn('ChallengeManager: failed to load challenges', e);
                this.challenges = [];
            } finally {
                this._loaded = true;
                this._loadingPromise = null;
            }
        })();

        await this._loadingPromise;
    },

    async save() {
        try {
            if (typeof ProductivityData?.DataStore?.saveChallenges === 'function') {
                await ProductivityData.DataStore.saveChallenges(this.challenges);
            } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                await chrome.storage.local.set({ challenges: this.challenges });
            } else {
                localStorage.setItem('challenges', JSON.stringify(this.challenges));
            }
        } catch (e) {
            console.warn('ChallengeManager: failed to save challenges', e);
        }
    },

    /**
     * Reset daily/weekly challenges whose period has elapsed.
     * Called on load and when the challenges page is opened.
     */
    async resetExpiredChallenges() {
        await this.ensureLoaded();
        const today = getTodayYMD();
        let didChange = false;

        for (const challenge of this.challenges) {
            if (!challenge) continue;

            // Daily challenges: reset if lastProgressDate is not today
            if (challenge.type === 'daily' && challenge.lastProgressDate !== today) {
                if (challenge.currentProgress > 0 || challenge.status === 'completed') {
                    challenge.currentProgress = 0;
                    challenge.status = 'active';
                    challenge.completedAt = null;
                    didChange = true;
                }
            }

            // Weekly challenges: reset if we're in a new week (Monday-based)
            if (challenge.type === 'weekly' && challenge.lastProgressDate) {
                const lastDate = new Date(challenge.lastProgressDate + 'T00:00:00');
                const todayDate = new Date(today + 'T00:00:00');
                const getWeekStart = (d) => {
                    const day = d.getDay();
                    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                    return new Date(d.getFullYear(), d.getMonth(), diff).toISOString().split('T')[0];
                };
                if (getWeekStart(lastDate) !== getWeekStart(todayDate)) {
                    if (challenge.currentProgress > 0 || challenge.status === 'completed') {
                        challenge.currentProgress = 0;
                        challenge.status = 'active';
                        challenge.completedAt = null;
                        didChange = true;
                    }
                }
            }
        }

        if (didChange) await this.save();
        if (didChange) emitChallengeDataChanged({ immediate: true });
    },

    async create({ metric, type, targetCount, options, name, timeWindowStart, timeWindowEnd, manualCheckEnabled }) {
        await this.ensureLoaded();

        const normalizedMetric = normalizeMetric(metric);
        const target = Math.max(1, Number(targetCount) || 1);
        const safeType = ['daily', 'weekly', 'custom'].includes(type) ? type : 'custom';
        const safeOptions = (normalizedMetric === 'focus_sessions')
            ? { minMinutes: Math.max(0, Number(options?.minMinutes) || 0) }
            : {};
        const normalizedWindowStart = normalizeTimeOfDay(timeWindowStart);
        const normalizedWindowEnd = normalizeTimeOfDay(timeWindowEnd);
        const hasValidWindow = safeType === 'daily' && isValidDailyTimeWindow(normalizedWindowStart, normalizedWindowEnd);

        const customName = (typeof name === 'string' && name.trim()) ? name.trim() : '';

        const challenge = {
            id: createChallengeId(),
            metric: normalizedMetric,
            type: safeType,
            options: safeOptions,
            title: customName || buildChallengeTitle(normalizedMetric, target, safeOptions),
            customTitle: !!customName,
            description: buildChallengeDescription(normalizedMetric, target, safeOptions),
            targetProgress: target,
            currentProgress: 0,
            currentStreak: 0,
            bestStreak: 0,
            status: 'active',
            createdAt: new Date().toISOString(),
            lastProgressDate: null,
            completedAt: null,
            timesCompleted: 0,
            manualCheckEnabled: manualCheckEnabled === true,
            manualCheckHistory: {},
            timeWindowStart: hasValidWindow ? normalizedWindowStart : null,
            timeWindowEnd: hasValidWindow ? normalizedWindowEnd : null,
            completionHistory: {}
        };

        this.challenges.push(normalizeChallengeRecord(challenge));
        await this.save();
        emitChallengeDataChanged({ immediate: true });
        return this.challenges[this.challenges.length - 1];
    },

    async update(id, updates) {
        await this.ensureLoaded();
        const challenge = this.challenges.find(c => c.id === id);
        if (!challenge) return null;

        const { metric, type, targetCount, options, name, timeWindowStart, timeWindowEnd, manualCheckEnabled } = updates;

        if (metric !== undefined) challenge.metric = normalizeMetric(metric);
        if (type !== undefined) challenge.type = ['daily', 'weekly', 'custom'].includes(type) ? type : challenge.type;
        if (targetCount !== undefined) challenge.targetProgress = Math.max(1, Number(targetCount) || 1);
        if (options !== undefined) {
            challenge.options = (normalizeMetric(challenge.metric) === 'focus_sessions')
                ? { minMinutes: Math.max(0, Number(options?.minMinutes) || 0) }
                : {};
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'manualCheckEnabled')) {
            challenge.manualCheckEnabled = manualCheckEnabled === true;
        }

        const hasWindowUpdate = updates && (
            Object.prototype.hasOwnProperty.call(updates, 'timeWindowStart') ||
            Object.prototype.hasOwnProperty.call(updates, 'timeWindowEnd')
        );

        if (challenge.type !== 'daily') {
            challenge.timeWindowStart = null;
            challenge.timeWindowEnd = null;
        } else if (hasWindowUpdate) {
            const normalizedWindowStart = normalizeTimeOfDay(timeWindowStart);
            const normalizedWindowEnd = normalizeTimeOfDay(timeWindowEnd);

            if (isValidDailyTimeWindow(normalizedWindowStart, normalizedWindowEnd)) {
                challenge.timeWindowStart = normalizedWindowStart;
                challenge.timeWindowEnd = normalizedWindowEnd;
            } else {
                challenge.timeWindowStart = null;
                challenge.timeWindowEnd = null;
            }
        }

        const customName = (typeof name === 'string' && name.trim()) ? name.trim() : '';
        if (customName) {
            challenge.title = customName;
            challenge.customTitle = true;
        } else {
            challenge.title = buildChallengeTitle(challenge.metric, challenge.targetProgress, challenge.options);
            challenge.customTitle = false;
        }
        challenge.description = buildChallengeDescription(challenge.metric, challenge.targetProgress, challenge.options);
        Object.assign(challenge, normalizeChallengeRecord(challenge));

        await this.save();
        emitChallengeDataChanged({ immediate: true });
        return challenge;
    },

    async delete(id) {
        await this.ensureLoaded();
        this.challenges = this.challenges.filter(c => c.id !== id);
        await this.save();
        emitChallengeDataChanged({ immediate: true });
    },

    async checkManualProgress(id, dateYmd = getTodayYMD()) {
        await this.ensureLoaded();

        const challenge = this.challenges.find(c => c.id === id);
        if (!challenge || !challenge.manualCheckEnabled || challenge.status !== 'active') {
            return { challenge: challenge || null, didChange: false, alreadyChecked: false };
        }

        const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(String(dateYmd || '')) ? String(dateYmd) : getTodayYMD();
        if (!challenge.manualCheckHistory || typeof challenge.manualCheckHistory !== 'object') {
            challenge.manualCheckHistory = {};
        }

        if (challenge.manualCheckHistory[dateIso]) {
            return { challenge, didChange: false, alreadyChecked: true };
        }

        challenge.manualCheckHistory[dateIso] = 1;

        const last = challenge.lastProgressDate;
        if (last === dateIso) {
            // No streak change.
        } else if (isYesterdayYMD(last, dateIso) && (challenge.currentStreak || 0) > 0) {
            challenge.currentStreak = (challenge.currentStreak || 0) + 1;
        } else {
            challenge.currentStreak = 1;
        }

        challenge.bestStreak = Math.max(challenge.bestStreak || 0, challenge.currentStreak || 0);
        challenge.lastProgressDate = dateIso;
        challenge.currentProgress = (Number(challenge.currentProgress) || 0) + 1;

        if (challenge.type === 'daily') {
            const completionTime = getLocalTimeHHMM();
            const hasWindow = isValidDailyTimeWindow(challenge.timeWindowStart, challenge.timeWindowEnd);
            const windowOutcome = hasWindow
                ? (isTimeWithinWindow(completionTime, challenge.timeWindowStart, challenge.timeWindowEnd)
                    ? 'within'
                    : 'outside')
                : 'within';

            if (!challenge.completionHistory || typeof challenge.completionHistory !== 'object') {
                challenge.completionHistory = {};
            }

            challenge.completionHistory[dateIso] = {
                completedAt: new Date().toISOString(),
                completionTime,
                windowOutcome
            };
        }

        if ((Number(challenge.currentProgress) || 0) >= (Number(challenge.targetProgress) || 0) && challenge.status !== 'completed') {
            challenge.status = 'completed';
            challenge.completedAt = new Date().toISOString();
            challenge.timesCompleted = (Number(challenge.timesCompleted) || 0) + 1;

            try {
                showToast?.('success', 'Challenge Complete!', `You completed: ${challenge.title}`);
            } catch {
                // ignore
            }
        }

        Object.assign(challenge, normalizeChallengeRecord(challenge));
        await this.save();
        emitChallengeDataChanged({ immediate: true });

        if (window.habitTrackerInstance?.syncExternalDailyItems) {
            window.habitTrackerInstance.syncExternalDailyItems();
        }

        try {
            if (document.getElementById('challenges-grid')) {
                ChallengeState.challenges = this.challenges;
                renderChallenges();
                updateChallengeStats();
            }
        } catch {
            // ignore
        }

        return { challenge, didChange: true, alreadyChecked: false };
    },

    async recordProgress(metric, amount = 1, meta = {}) {
        await this.ensureLoaded();

        const normalizedMetric = normalizeMetric(metric);
        const inc = Number(amount) || 0;
        if (!normalizedMetric || inc <= 0) return;

        let didChange = false;
        const today = getTodayYMD();

        for (const challenge of this.challenges) {
            if (!challenge || challenge.status !== 'active') continue;
            if (normalizeMetric(challenge.metric) !== normalizedMetric) continue;
            if (challenge.manualCheckEnabled) continue;

            // Constraints
            if (normalizedMetric === 'focus_sessions') {
                const minMinutes = Number(challenge.options?.minMinutes) || 0;
                const duration = Number(meta?.duration);
                if (minMinutes > 0 && !(Number.isFinite(duration) && duration >= minMinutes)) {
                    continue;
                }
            }

            const last = challenge.lastProgressDate;
            if (last === today) {
                // No streak change
            } else if (isYesterdayYMD(last, today) && (challenge.currentStreak || 0) > 0) {
                challenge.currentStreak = (challenge.currentStreak || 0) + 1;
            } else {
                challenge.currentStreak = 1;
            }
            challenge.bestStreak = Math.max(challenge.bestStreak || 0, challenge.currentStreak || 0);
            challenge.lastProgressDate = today;

            challenge.currentProgress = (Number(challenge.currentProgress) || 0) + inc;

            if ((Number(challenge.currentProgress) || 0) >= (Number(challenge.targetProgress) || 0)) {
                challenge.status = 'completed';
                challenge.completedAt = new Date().toISOString();
                challenge.timesCompleted = (Number(challenge.timesCompleted) || 0) + 1;

                if (challenge.type === 'daily') {
                    const completionTime = getLocalTimeHHMM();
                    const hasWindow = isValidDailyTimeWindow(challenge.timeWindowStart, challenge.timeWindowEnd);
                    const windowOutcome = hasWindow
                        ? (isTimeWithinWindow(completionTime, challenge.timeWindowStart, challenge.timeWindowEnd)
                            ? 'within'
                            : 'outside')
                        : 'within';

                    if (!challenge.completionHistory || typeof challenge.completionHistory !== 'object') {
                        challenge.completionHistory = {};
                    }

                    challenge.completionHistory[today] = {
                        completedAt: challenge.completedAt,
                        completionTime,
                        windowOutcome
                    };
                }

                try {
                    showToast?.('success', 'Challenge Complete!', `You completed: ${challenge.title}`);
                } catch {
                    // ignore
                }
            }

            didChange = true;
        }

        if (!didChange) return;
        await this.save();
        emitChallengeDataChanged({ immediate: true });

        // Sync daily challenge state with habit tracker
        if (window.habitTrackerInstance?.syncExternalDailyItems) {
            window.habitTrackerInstance.syncExternalDailyItems();
        }

        // If challenges page is mounted, refresh visuals.
        try {
            if (document.getElementById('challenges-grid')) {
                ChallengeState.challenges = this.challenges;
                renderChallenges();
                updateChallengeStats();
            }
        } catch {
            // ignore
        }
    }
};

window.ChallengeManager = ChallengeManager;

// ============================================================================
// INITIALIZATION
// ============================================================================

async function loadChallengesPage() {
    try {
        await window.ChallengeManager?.ensureLoaded?.();
        await window.ChallengeManager?.resetExpiredChallenges?.();
        ChallengeState.challenges = window.ChallengeManager?.challenges || [];
        setupChallengeListeners();
        renderChallenges();
        updateChallengeStats();
    } catch (error) {
        console.error('Failed to load challenges:', error);
        showToast?.('error', 'Error', 'Failed to load challenges');
    }
}

function setupChallengeListeners() {
    // Create challenge button
    document.getElementById('create-challenge-btn')?.addEventListener('click', () => {
        openChallengeModal();
    });

    // Delegate clicks for empty-state "Create Challenge" button (no inline onclick; CSP-safe)
    document.getElementById('challenges-grid')?.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('[data-action="create-challenge"]');
        if (btn) {
            e.preventDefault?.();
            openChallengeModal();
        }
    });

    // Category filter buttons
    document.querySelectorAll('.challenge-categories .category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.challenge-categories .category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            ChallengeState.filter = btn.dataset.filter;
            renderChallenges();
        });
    });
}

// ============================================================================
// RENDERING
// ============================================================================

function renderChallenges() {
    const grid = document.getElementById('challenges-grid');
    if (!grid) return;

    let challenges = [...ChallengeState.challenges];

    // Apply filter
    if (ChallengeState.filter !== 'all') {
        if (ChallengeState.filter === 'active') {
            challenges = challenges.filter(c => c.status === 'active');
        } else if (ChallengeState.filter === 'completed') {
            challenges = challenges.filter(c => c.status === 'completed');
        } else if (ChallengeState.filter === 'daily') {
            challenges = challenges.filter(c => c.type === 'daily');
        } else if (ChallengeState.filter === 'weekly') {
            challenges = challenges.filter(c => c.type === 'weekly');
        }
    }

    if (challenges.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-trophy"></i>
                <h3>No challenges yet</h3>
                <p>Create your first challenge to start tracking progress!</p>
                <button class="btn-primary" type="button" data-action="create-challenge">
                    <i class="fas fa-plus"></i> Create Challenge
                </button>
            </div>
        `;
        renderChallengeScheduleTimeline(ChallengeState.challenges);
        return;
    }

    grid.innerHTML = challenges.map(challenge => renderChallengeCard(challenge)).join('');

    // Add event listeners for challenge actions
    grid.querySelectorAll('.challenge-card').forEach(card => {
        const id = card.dataset.challengeId;

        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteChallenge(id);
        });

        card.querySelector('.edit-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const challenge = ChallengeState.challenges.find(c => c.id === id);
            if (challenge) openChallengeModal(challenge);
        });

        card.querySelector('[data-action="manual-check"]')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            await checkChallengeForToday(id);
        });
    });

    renderChallengeScheduleTimeline(ChallengeState.challenges);
}

function renderChallengeScheduleTimeline(challenges) {
    const grid = document.getElementById('challenges-grid');
    if (!grid) return;

    const host = grid.parentElement;
    if (!host) return;

    let timeline = host.querySelector('#challenge-schedule-timeline');
    if (!timeline) {
        timeline = document.createElement('section');
        timeline.id = 'challenge-schedule-timeline';
        timeline.className = 'challenge-schedule-timeline';
        host.appendChild(timeline);
    }

    const allChallenges = Array.isArray(challenges) ? challenges : [];
    const daily = allChallenges.filter((challenge) => challenge?.type === 'daily');
    const scheduled = daily
        .map((challenge) => {
            const start = normalizeTimeOfDay(challenge.timeWindowStart);
            const end = normalizeTimeOfDay(challenge.timeWindowEnd);
            return {
                challenge,
                start,
                end,
                segments: isValidDailyTimeWindow(start, end) ? challengeWindowSegments(start, end) : []
            };
        })
        .filter((entry) => entry.segments.length > 0);
    const unscheduled = daily.filter((challenge) => !isValidDailyTimeWindow(challenge.timeWindowStart, challenge.timeWindowEnd));

    if (daily.length === 0) {
        timeline.innerHTML = '';
        timeline.style.display = 'none';
        return;
    }

    timeline.style.display = '';

    if (scheduled.length === 0) {
        timeline.innerHTML = `
            <div class="challenge-schedule-header">
                <h4><i class="fas fa-stream"></i> Daily Challenge Timeline</h4>
                <p>Add a time frame to your daily challenges to see overlap planning.</p>
            </div>
        `;
        return;
    }

    const withOverlap = scheduled.map((entry, index) => {
        const overlaps = [];
        for (let i = 0; i < scheduled.length; i++) {
            if (i === index) continue;
            if (segmentsOverlap(entry.segments, scheduled[i].segments)) {
                overlaps.push(scheduled[i].challenge.id);
            }
        }

        return {
            ...entry,
            overlaps
        };
    });

    const overlapCount = withOverlap.filter((entry) => entry.overlaps.length > 0).length;

    const rowsHtml = withOverlap.map((entry) => {
        const challenge = entry.challenge;
        const title = escapeHtml(challenge.title || 'Daily Challenge');
        const rangeLabel = formatTimeWindow(entry.start, entry.end);
        const bars = entry.segments.map((segment) => {
            const leftPct = (segment.start / 1440) * 100;
            const widthPct = ((segment.end - segment.start) / 1440) * 100;
            return `<span class="challenge-schedule-bar" style="left:${leftPct}%;width:${widthPct}%;"></span>`;
        }).join('');
        const overlapLabel = entry.overlaps.length > 0
            ? `<span class="challenge-schedule-overlap has-overlap"><i class="fas fa-exclamation-circle"></i> Overlaps with ${entry.overlaps.length} challenge${entry.overlaps.length === 1 ? '' : 's'}</span>`
            : '<span class="challenge-schedule-overlap"><i class="fas fa-check-circle"></i> No overlap</span>';

        return `
            <div class="challenge-schedule-row ${entry.overlaps.length > 0 ? 'has-overlap' : ''}">
                <div class="challenge-schedule-meta">
                    <div class="challenge-schedule-name">${title}</div>
                    <div class="challenge-schedule-range">${rangeLabel}</div>
                </div>
                <div class="challenge-schedule-track">${bars}</div>
                ${overlapLabel}
            </div>
        `;
    }).join('');

    const unscheduledHtml = unscheduled.length > 0
        ? `<div class="challenge-schedule-unscheduled"><strong>Unscheduled daily challenges:</strong> ${unscheduled.map((challenge) => escapeHtml(challenge.title || 'Daily Challenge')).join(', ')}</div>`
        : '';

    timeline.innerHTML = `
        <div class="challenge-schedule-header">
            <h4><i class="fas fa-stream"></i> Daily Challenge Timeline</h4>
            <p>${scheduled.length} scheduled challenge${scheduled.length === 1 ? '' : 's'}${overlapCount > 0 ? `, ${overlapCount} with overlap` : ', no overlaps detected'}.</p>
        </div>
        <div class="challenge-schedule-axis" aria-hidden="true">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
        </div>
        <div class="challenge-schedule-list">${rowsHtml}</div>
        ${unscheduledHtml}
    `;
}

function renderChallengeCard(challenge) {
    const current = Number(challenge.currentProgress) || 0;
    const target = Math.max(1, Number(challenge.targetProgress) || 1);
    const progress = Math.min(100, Math.round((current / target) * 100));
    const isCompleted = challenge.status === 'completed';
    const isManualCheck = challenge.manualCheckEnabled === true;
    const todayChecked = !!challenge.manualCheckHistory?.[getTodayYMD()];
    const typeIcon = challenge.type === 'daily' ? 'fa-calendar-day' :
        challenge.type === 'weekly' ? 'fa-calendar-week' : 'fa-calendar-alt';
    const timeWindowLabel = formatTimeWindow(challenge.timeWindowStart, challenge.timeWindowEnd);
    const timeWindowBadge = challenge.type === 'daily' && timeWindowLabel
        ? `<span class="challenge-time-window-badge"><i class="fas fa-clock"></i> ${timeWindowLabel}</span>`
        : '';
    const manualCheckButton = isManualCheck && !isCompleted
        ? `<button type="button" class="challenge-check-btn ${todayChecked ? 'is-checked' : ''}" data-action="manual-check" ${todayChecked ? 'disabled' : ''} aria-label="${todayChecked ? 'Already checked today' : 'Check challenge for today'}" title="${todayChecked ? 'Already checked today' : 'Mark today as done'}"><i class="fas fa-check"></i></button>`
        : '';
    const progressBadge = isCompleted
        ? `<span class="completed-badge"><i class="fas fa-check-circle"></i> Completed!</span>`
        : (isManualCheck
            ? `<span class="completed-badge"><i class="fas fa-circle-check"></i> Task-style check</span>`
            : `<span class="completed-badge"><i class="fas fa-bolt"></i> Auto-tracked</span>`);

    const streakBadge = challenge.currentStreak > 0 ?
        `<span class="streak-badge"><i class="fas fa-fire"></i> ${challenge.currentStreak}</span>` : '';

    return `
        <div class="challenge-card ${isCompleted ? 'completed' : ''}" data-challenge-id="${challenge.id}">
            <div class="challenge-header">
                <div class="challenge-type">
                    <i class="fas ${typeIcon}"></i>
                    <span>${challenge.type}</span>
                </div>
                ${timeWindowBadge}
                ${streakBadge}
                <div class="challenge-actions">
                    ${!isCompleted ? `<button class="btn-icon tiny edit-btn" title="Edit">
                        <i class="fas fa-pencil-alt"></i>
                    </button>` : ''}
                    <button class="btn-icon tiny delete-btn" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="challenge-body">
                <h3 class="challenge-title">${escapeHtml(challenge.title)}</h3>
                <p class="challenge-description">${escapeHtml(challenge.description || '')}</p>
                <div class="challenge-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <span class="progress-text">${current} / ${target}</span>
                </div>
            </div>
            <div class="challenge-footer">
                ${manualCheckButton}
                ${progressBadge}
            </div>
        </div>
    `;
}

function updateChallengeStats() {
    const active = ChallengeState.challenges.filter(c => c.status === 'active').length;
    const completed = ChallengeState.challenges.filter(c => c.status === 'completed').length;
    const bestStreak = Math.max(0, ...ChallengeState.challenges.map(c => c.bestStreak || 0));

    const activeEl = document.getElementById('active-challenges-count');
    const completedEl = document.getElementById('completed-challenges-count');
    const streakEl = document.getElementById('best-streak-count');

    if (activeEl) activeEl.textContent = active;
    if (completedEl) completedEl.textContent = completed;
    if (streakEl) streakEl.textContent = bestStreak;
}

// ============================================================================
// CHALLENGE ACTIONS
// ============================================================================

async function deleteChallenge(challengeId) {
    const confirmed = await showConfirmModal('Delete this challenge?');
    if (!confirmed) return;

    await window.ChallengeManager?.delete?.(challengeId);
    ChallengeState.challenges = window.ChallengeManager?.challenges || [];
    renderChallenges();
    updateChallengeStats();

    // Also remove the synced habit for this challenge
    _removeSyncedHabitForChallenge(challengeId);

    showToast?.('success', 'Deleted', 'Challenge removed');
}

async function checkChallengeForToday(challengeId) {
    const result = await window.ChallengeManager?.checkManualProgress?.(challengeId);
    if (!result?.didChange && result?.alreadyChecked) {
        showToast?.('info', 'Already Checked', 'You already checked this challenge for today.');
    }
}

/** Remove the daily-challenge habit entry for a deleted challenge */
function _removeSyncedHabitForChallenge(challengeId) {
    try {
        const ht = window.habitTrackerInstance;
        if (!ht?.state?.data) return;
        const habitId = `daily-challenge--${challengeId}`;
        const goals = ht.state.data.goalsMeta || [];
        if (!goals.some(g => g.id === habitId)) return;

        ht.state.data.goalsMeta = goals.filter(g => g.id !== habitId);
        delete ht.state.data.goals[habitId];
        if (!Array.isArray(ht.state.data.dismissedSyncIds)) ht.state.data.dismissedSyncIds = [];
        if (!ht.state.data.dismissedSyncIds.includes(habitId)) {
            ht.state.data.dismissedSyncIds.push(habitId);
        }
        ht._save?.();
        ht.render?.();
    } catch (e) {
        console.warn('[Challenges] Failed to remove synced habit:', e);
    }
}

// ============================================================================
// CHALLENGE MODAL
// ============================================================================

function openChallengeModal(existingChallenge) {
    const isEdit = !!existingChallenge;

    // Check if modal exists, create if not
    let modal = document.getElementById('challenge-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'challenge-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2><i class="fas fa-trophy"></i> ${isEdit ? 'Edit Challenge' : 'Create Challenge'}</h2>
                <button class="close-modal-btn">&times;</button>
            </div>
            <form id="challenge-form" class="modal-body challenge-form">
                <div class="form-group">
                    <label>Challenge Name <span style="opacity:0.6;font-weight:normal;">(optional)</span></label>
                    <input type="text" id="challenge-name" placeholder="e.g. Morning Focus Sprint" maxlength="80">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Goal</label>
                        <select id="challenge-metric">
                            <option value="focus_sessions">Focus sessions</option>
                            <option value="focus_time">Focus minutes</option>
                            <option value="tasks">Tasks completed</option>
                            <option value="reviews">Reviews completed</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Target</label>
                        <input type="number" id="challenge-target" value="5" min="1" required>
                    </div>
                </div>
                <div class="form-row" id="challenge-focus-opts" style="display:none;">
                    <div class="form-group">
                        <label>Min minutes per session (optional)</label>
                        <input type="number" id="challenge-min-minutes" value="0" min="0" step="5">
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <select id="challenge-type">
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="custom" selected>Custom</option>
                        </select>
                    </div>
                </div>
                <div class="form-group" id="challenge-type-row">
                    <label>Type</label>
                    <select id="challenge-type-simple">
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="custom" selected>Custom</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="challenge-manual-toggle">
                        <input type="checkbox" id="challenge-manual-check">
                        <span>Track this challenge like a task checkbox</span>
                    </label>
                    <div class="challenge-manual-hint">One check adds <strong>1</strong> count for today. You can only check once per day.</div>
                </div>
                <div class="form-row" id="challenge-time-window-row" style="display:none;">
                    <div class="form-group">
                        <label>Timeframe Start</label>
                        <input type="time" id="challenge-time-start" step="300">
                    </div>
                    <div class="form-group">
                        <label>Timeframe End</label>
                        <input type="time" id="challenge-time-end" step="300">
                    </div>
                </div>
                <div class="form-group" id="challenge-time-window-note" style="display:none;opacity:0.85;">
                    <label>Daily timeframe requirement</label>
                    <div style="font-size:12px;color:var(--text-secondary);">Daily challenges are counted as <strong>within window</strong> or <strong>outside window</strong> based on this timeframe.</div>
                </div>
                <div class="form-group" style="opacity:0.9;">
                    <label>Preview</label>
                    <div id="challenge-preview" style="line-height:1.4"></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary close-modal-btn">Cancel</button>
                    <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Create Challenge'}</button>
                </div>
            </form>
        </div>
    `;

    modal.classList.add('active');

    if (modal.dataset.keydownIsolationBound !== 'true') {
        modal.addEventListener('keydown', (e) => {
            if (!modal.classList.contains('active')) return;

            // Keep Escape behavior local to this modal and stop global shortcut handlers.
            if (e.key === 'Escape') {
                e.preventDefault();
                modal.classList.remove('active');
                return;
            }

            e.stopPropagation();
        }, true);
        modal.dataset.keydownIsolationBound = 'true';
    }

    // Setup modal event listeners
    modal.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.remove('active'));
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    const form = document.getElementById('challenge-form');
    const nameEl = document.getElementById('challenge-name');
    const metricEl = document.getElementById('challenge-metric');
    const targetEl = document.getElementById('challenge-target');
    const focusOpts = document.getElementById('challenge-focus-opts');
    const minMinutesEl = document.getElementById('challenge-min-minutes');
    const previewEl = document.getElementById('challenge-preview');
    const typeRow = document.getElementById('challenge-type-row');
    const typeSimpleEl = document.getElementById('challenge-type-simple');
    const typeFocusEl = document.getElementById('challenge-type');
    const timeWindowRow = document.getElementById('challenge-time-window-row');
    const timeWindowNote = document.getElementById('challenge-time-window-note');
    const timeStartEl = document.getElementById('challenge-time-start');
    const timeEndEl = document.getElementById('challenge-time-end');
    const manualCheckEl = document.getElementById('challenge-manual-check');

    // Pre-populate for edit mode
    if (isEdit) {
        if (nameEl) nameEl.value = existingChallenge.customTitle ? existingChallenge.title : '';
        if (metricEl) metricEl.value = existingChallenge.metric || 'focus_sessions';
        if (targetEl) targetEl.value = existingChallenge.targetProgress || 5;
        if (minMinutesEl) minMinutesEl.value = existingChallenge.options?.minMinutes || 0;
        const curType = existingChallenge.type || 'custom';
        if (typeSimpleEl) typeSimpleEl.value = curType;
        if (typeFocusEl) typeFocusEl.value = curType;
        if (timeStartEl) timeStartEl.value = normalizeTimeOfDay(existingChallenge.timeWindowStart || '') || '';
        if (timeEndEl) timeEndEl.value = normalizeTimeOfDay(existingChallenge.timeWindowEnd || '') || '';
        if (manualCheckEl) manualCheckEl.checked = existingChallenge.manualCheckEnabled === true;
    }

    // Store editing challenge ID for the submit handler
    form.dataset.editId = isEdit ? existingChallenge.id : '';

    form.onsubmit = async (e) => {
        e.preventDefault();
        const editId = form.dataset.editId;
        let ok = false;
        if (editId) {
            ok = await updateChallenge(editId);
        } else {
            ok = await createChallenge();
        }
        if (ok) {
            modal.classList.remove('active');
        }
    };

    const getSelectedType = () => {
        const metric = normalizeMetric(metricEl?.value);
        if (metric === 'focus_sessions') {
            return typeFocusEl?.value || 'custom';
        }
        return typeSimpleEl?.value || 'custom';
    };

    const syncMetricUi = () => {
        const metric = normalizeMetric(metricEl?.value);
        const showFocus = metric === 'focus_sessions';
        if (focusOpts) focusOpts.style.display = showFocus ? '' : 'none';
        if (typeRow) typeRow.style.display = showFocus ? 'none' : '';
        const isDaily = getSelectedType() === 'daily';
        if (timeWindowRow) timeWindowRow.style.display = isDaily ? '' : 'none';
        if (timeWindowNote) timeWindowNote.style.display = isDaily ? '' : 'none';
        syncPreview();
    };

    const syncPreview = () => {
        if (!previewEl) return;
        const customName = (nameEl?.value || '').trim();
        const metric = normalizeMetric(metricEl?.value);
        const target = Math.max(1, Number(targetEl?.value) || 1);
        const minMinutes = Math.max(0, Number(minMinutesEl?.value) || 0);
        const options = metric === 'focus_sessions' ? { minMinutes } : {};
        const title = customName || buildChallengeTitle(metric, target, options);
        const desc = buildChallengeDescription(metric, target, options);
        const selectedType = getSelectedType();
        const manualSummary = manualCheckEl?.checked
            ? `<div style="opacity:0.9;margin-top:6px;"><i class="fas fa-circle-check"></i> Task-style check mode: one check adds one count for today.</div>`
            : `<div style="opacity:0.9;margin-top:6px;"><i class="fas fa-bolt"></i> Auto-tracked from your activity.</div>`;
        const start = normalizeTimeOfDay(timeStartEl?.value || '');
        const end = normalizeTimeOfDay(timeEndEl?.value || '');
        const hasWindow = selectedType === 'daily' && isValidDailyTimeWindow(start, end);
        const windowSummary = hasWindow
            ? `<div style="opacity:0.9;margin-top:6px;"><i class="fas fa-clock"></i> Required timeframe: ${escapeHtml(formatTimeWindow(start, end))}</div>`
            : '';

        previewEl.innerHTML = `<strong>${escapeHtml(title)}</strong><div style="opacity:0.85;margin-top:4px;">${escapeHtml(desc)}</div>${manualSummary}${windowSummary}`;
    };

    metricEl?.addEventListener('change', syncMetricUi);
    targetEl?.addEventListener('input', syncPreview);
    minMinutesEl?.addEventListener('input', syncPreview);
    typeSimpleEl?.addEventListener('change', syncPreview);
    typeFocusEl?.addEventListener('change', syncPreview);
    nameEl?.addEventListener('input', syncPreview);
    timeStartEl?.addEventListener('input', syncPreview);
    timeEndEl?.addEventListener('input', syncPreview);
    manualCheckEl?.addEventListener('change', syncPreview);
    typeSimpleEl?.addEventListener('change', syncMetricUi);
    typeFocusEl?.addEventListener('change', syncMetricUi);

    syncMetricUi();

    // Ensure keyboard typing works immediately when the modal opens.
    setTimeout(() => {
        try {
            nameEl?.focus();
            if (nameEl && !nameEl.value) {
                nameEl.select();
            }
        } catch (_) {
            // Ignore focus failures.
        }
    }, 0);
}

async function createChallenge() {
    const name = (document.getElementById('challenge-name')?.value || '').trim();
    const metric = normalizeMetric(document.getElementById('challenge-metric')?.value);
    const target = Math.max(1, parseInt(document.getElementById('challenge-target')?.value) || 1);
    const minMinutes = Math.max(0, parseInt(document.getElementById('challenge-min-minutes')?.value) || 0);
    const timeStart = normalizeTimeOfDay(document.getElementById('challenge-time-start')?.value || '');
    const timeEnd = normalizeTimeOfDay(document.getElementById('challenge-time-end')?.value || '');
    const manualCheckEnabled = !!document.getElementById('challenge-manual-check')?.checked;

    const isFocus = metric === 'focus_sessions';
    const type = isFocus
        ? (document.getElementById('challenge-type')?.value || 'custom')
        : (document.getElementById('challenge-type-simple')?.value || 'custom');

    if (!metric) return false;

    if (type === 'daily' && !isValidDailyTimeWindow(timeStart, timeEnd)) {
        showToast?.('warning', 'Timeframe Required', 'Daily challenges need a valid start and end time.');
        return false;
    }

    await window.ChallengeManager?.create?.({
        metric,
        type,
        targetCount: target,
        options: isFocus ? { minMinutes } : {},
        name,
        manualCheckEnabled,
        timeWindowStart: type === 'daily' ? timeStart : null,
        timeWindowEnd: type === 'daily' ? timeEnd : null
    });

    ChallengeState.challenges = window.ChallengeManager?.challenges || [];
    renderChallenges();
    updateChallengeStats();

    // Sync new daily challenge to habit tracker immediately
    if (type === 'daily' && window.habitTrackerInstance?.syncExternalDailyItems) {
        window.habitTrackerInstance.syncExternalDailyItems();
    }

    showToast?.('success', 'Challenge Created', manualCheckEnabled
        ? 'Challenge is now active. Use the check circle to add one count each day.'
        : 'Challenge is now active and will update automatically.');
    return true;
}

async function updateChallenge(challengeId) {
    const name = (document.getElementById('challenge-name')?.value || '').trim();
    const metric = normalizeMetric(document.getElementById('challenge-metric')?.value);
    const target = Math.max(1, parseInt(document.getElementById('challenge-target')?.value) || 1);
    const minMinutes = Math.max(0, parseInt(document.getElementById('challenge-min-minutes')?.value) || 0);
    const rawTimeStart = document.getElementById('challenge-time-start')?.value || '';
    const rawTimeEnd = document.getElementById('challenge-time-end')?.value || '';
    const timeStart = normalizeTimeOfDay(rawTimeStart);
    const timeEnd = normalizeTimeOfDay(rawTimeEnd);
    const manualCheckEnabled = !!document.getElementById('challenge-manual-check')?.checked;

    const isFocus = metric === 'focus_sessions';
    const type = isFocus
        ? (document.getElementById('challenge-type')?.value || 'custom')
        : (document.getElementById('challenge-type-simple')?.value || 'custom');
    const existingChallenge = ChallengeState.challenges.find((challenge) => challenge.id === challengeId);
    const existingHasWindow = isValidDailyTimeWindow(existingChallenge?.timeWindowStart, existingChallenge?.timeWindowEnd);
    const transitioningToDaily = type === 'daily' && existingChallenge?.type !== 'daily';
    const requiresWindow = transitioningToDaily || existingHasWindow;
    const hasWindowInput = !!rawTimeStart || !!rawTimeEnd;

    if (!metric) return false;

    if (type === 'daily' && (requiresWindow || hasWindowInput) && !isValidDailyTimeWindow(timeStart, timeEnd)) {
        showToast?.('warning', 'Timeframe Required', 'Daily challenges need a valid start and end time.');
        return false;
    }

    const payload = {
        metric,
        type,
        targetCount: target,
        options: isFocus ? { minMinutes } : {},
        name,
        manualCheckEnabled
    };

    if (type === 'daily') {
        if (isValidDailyTimeWindow(timeStart, timeEnd)) {
            payload.timeWindowStart = timeStart;
            payload.timeWindowEnd = timeEnd;
        } else if (requiresWindow) {
            payload.timeWindowStart = null;
            payload.timeWindowEnd = null;
        }
    } else {
        payload.timeWindowStart = null;
        payload.timeWindowEnd = null;
    }

    await window.ChallengeManager?.update?.(challengeId, payload);

    ChallengeState.challenges = window.ChallengeManager?.challenges || [];
    renderChallenges();
    updateChallengeStats();

    // Re-sync habits to pick up updated label
    if (window.habitTrackerInstance?.syncExternalDailyItems) {
        window.habitTrackerInstance.syncExternalDailyItems();
    }

    showToast?.('success', 'Challenge Updated', 'Your changes have been saved.');
    return true;
}

// Escape HTML helper
function escapeHtml(text) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(text);
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// ============================================================================
// SHARED CONFIRM MODAL (replaces native confirm() for Electron compatibility)
// ============================================================================

function showConfirmModal(message) {
    return new Promise((resolve) => {
        let overlay = document.getElementById('confirm-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'confirm-modal-overlay';
            overlay.className = 'modal';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
            <div class="modal-content" style="max-width:380px;">
                <div class="modal-header">
                    <h2><i class="fas fa-exclamation-triangle"></i> Confirm</h2>
                </div>
                <div class="modal-body" style="padding:16px 20px;">
                    <p style="margin:0 0 16px;">${escapeHtml(message)}</p>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary" data-confirm="cancel">Cancel</button>
                        <button type="button" class="btn-primary btn-danger" data-confirm="ok">Delete</button>
                    </div>
                </div>
            </div>
        `;
        overlay.classList.add('active');

        const cleanup = (result) => {
            overlay.classList.remove('active');
            resolve(result);
        };

        overlay.querySelector('[data-confirm="ok"]').addEventListener('click', () => cleanup(true));
        overlay.querySelector('[data-confirm="cancel"]').addEventListener('click', () => cleanup(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    });
}
window.showConfirmModal = showConfirmModal;

// Export for global access
window.loadChallengesPage = loadChallengesPage;
window.openChallengeModal = openChallengeModal;
window.updateChallenge = updateChallenge;
window._removeSyncedHabitForChallenge = _removeSyncedHabitForChallenge;

// Best-effort background init so recordProgress works immediately.
window.ChallengeManager?.ensureLoaded?.();
