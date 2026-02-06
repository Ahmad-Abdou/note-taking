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
                this.challenges = Array.isArray(raw) ? raw : [];
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

    async create({ metric, type, targetCount, options }) {
        await this.ensureLoaded();

        const normalizedMetric = normalizeMetric(metric);
        const target = Math.max(1, Number(targetCount) || 1);
        const safeType = ['daily', 'weekly', 'custom'].includes(type) ? type : 'custom';
        const safeOptions = (normalizedMetric === 'focus_sessions')
            ? { minMinutes: Math.max(0, Number(options?.minMinutes) || 0) }
            : {};

        const challenge = {
            id: createChallengeId(),
            metric: normalizedMetric,
            type: safeType,
            options: safeOptions,
            title: buildChallengeTitle(normalizedMetric, target, safeOptions),
            description: buildChallengeDescription(normalizedMetric, target, safeOptions),
            targetProgress: target,
            currentProgress: 0,
            currentStreak: 0,
            bestStreak: 0,
            status: 'active',
            createdAt: new Date().toISOString(),
            lastProgressDate: null,
            completedAt: null
        };

        this.challenges.push(challenge);
        await this.save();
        return challenge;
    },

    async delete(id) {
        await this.ensureLoaded();
        this.challenges = this.challenges.filter(c => c.id !== id);
        await this.save();
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
    });
}

function renderChallengeCard(challenge) {
    const current = Number(challenge.currentProgress) || 0;
    const target = Math.max(1, Number(challenge.targetProgress) || 1);
    const progress = Math.min(100, Math.round((current / target) * 100));
    const isCompleted = challenge.status === 'completed';
    const typeIcon = challenge.type === 'daily' ? 'fa-calendar-day' :
        challenge.type === 'weekly' ? 'fa-calendar-week' : 'fa-calendar-alt';

    const streakBadge = challenge.currentStreak > 0 ?
        `<span class="streak-badge"><i class="fas fa-fire"></i> ${challenge.currentStreak}</span>` : '';

    return `
        <div class="challenge-card ${isCompleted ? 'completed' : ''}" data-challenge-id="${challenge.id}">
            <div class="challenge-header">
                <div class="challenge-type">
                    <i class="fas ${typeIcon}"></i>
                    <span>${challenge.type}</span>
                </div>
                ${streakBadge}
                <button class="btn-icon tiny delete-btn" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
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
                ${isCompleted
            ? `<span class="completed-badge"><i class="fas fa-check-circle"></i> Completed!</span>`
            : (challenge.metric
                ? `<span class="completed-badge"><i class="fas fa-bolt"></i> Auto-tracked</span>`
                : `<span class="completed-badge"><i class="fas fa-pen"></i> Manual</span>`
            )}
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
    if (!confirm('Delete this challenge?')) return;

    await window.ChallengeManager?.delete?.(challengeId);
    ChallengeState.challenges = window.ChallengeManager?.challenges || [];
    renderChallenges();
    updateChallengeStats();
    showToast?.('success', 'Deleted', 'Challenge removed');
}

// ============================================================================
// CHALLENGE MODAL
// ============================================================================

function openChallengeModal() {
    // Check if modal exists, create if not
    let modal = document.getElementById('challenge-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'challenge-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-trophy"></i> Create Challenge</h2>
                    <button class="close-modal-btn">&times;</button>
                </div>
                <form id="challenge-form" class="modal-body">
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
                    <div class="form-group" style="opacity:0.9;">
                        <label>Preview</label>
                        <div id="challenge-preview" style="line-height:1.4"></div>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary close-modal-btn">Cancel</button>
                        <button type="submit" class="btn-primary">Create Challenge</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.classList.add('active');

    // Setup modal event listeners
    modal.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.remove('active'));
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    const form = document.getElementById('challenge-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        await createChallenge();
        modal.classList.remove('active');
    };

    const metricEl = document.getElementById('challenge-metric');
    const targetEl = document.getElementById('challenge-target');
    const focusOpts = document.getElementById('challenge-focus-opts');
    const minMinutesEl = document.getElementById('challenge-min-minutes');
    const previewEl = document.getElementById('challenge-preview');
    const typeRow = document.getElementById('challenge-type-row');
    const typeSimpleEl = document.getElementById('challenge-type-simple');
    const typeFocusEl = document.getElementById('challenge-type');

    const syncMetricUi = () => {
        const metric = normalizeMetric(metricEl?.value);
        const showFocus = metric === 'focus_sessions';
        if (focusOpts) focusOpts.style.display = showFocus ? '' : 'none';
        if (typeRow) typeRow.style.display = showFocus ? 'none' : '';
        syncPreview();
    };

    const syncPreview = () => {
        if (!previewEl) return;
        const metric = normalizeMetric(metricEl?.value);
        const target = Math.max(1, Number(targetEl?.value) || 1);
        const minMinutes = Math.max(0, Number(minMinutesEl?.value) || 0);
        const options = metric === 'focus_sessions' ? { minMinutes } : {};
        const title = buildChallengeTitle(metric, target, options);
        const desc = buildChallengeDescription(metric, target, options);
        previewEl.innerHTML = `<strong>${escapeHtml(title)}</strong><div style="opacity:0.85;margin-top:4px;">${escapeHtml(desc)}</div>`;
    };

    metricEl?.addEventListener('change', syncMetricUi);
    targetEl?.addEventListener('input', syncPreview);
    minMinutesEl?.addEventListener('input', syncPreview);
    typeSimpleEl?.addEventListener('change', syncPreview);
    typeFocusEl?.addEventListener('change', syncPreview);

    syncMetricUi();
}

async function createChallenge() {
    const metric = normalizeMetric(document.getElementById('challenge-metric')?.value);
    const target = Math.max(1, parseInt(document.getElementById('challenge-target')?.value) || 1);
    const minMinutes = Math.max(0, parseInt(document.getElementById('challenge-min-minutes')?.value) || 0);

    const isFocus = metric === 'focus_sessions';
    const type = isFocus
        ? (document.getElementById('challenge-type')?.value || 'custom')
        : (document.getElementById('challenge-type-simple')?.value || 'custom');

    if (!metric) return;

    await window.ChallengeManager?.create?.({
        metric,
        type,
        targetCount: target,
        options: isFocus ? { minMinutes } : {}
    });

    ChallengeState.challenges = window.ChallengeManager?.challenges || [];
    renderChallenges();
    updateChallengeStats();
    showToast?.('success', 'Challenge Created', 'Challenge is now active and will update automatically.');
}

// Escape HTML helper
function escapeHtml(text) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(text);
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Export for global access
window.loadChallengesPage = loadChallengesPage;
window.openChallengeModal = openChallengeModal;

// Best-effort background init so recordProgress works immediately.
window.ChallengeManager?.ensureLoaded?.();
