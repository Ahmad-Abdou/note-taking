/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - FOCUS MODE MODULE (FULL IMPLEMENTATION)
 * ============================================================================
 * 
 * Complete Pomodoro/Focus timer with:
 * - Multiple timer presets (Pomodoro, Deep Work, Flow State)
 * - Custom timer durations
 * - Ambient sounds (rain, lo-fi, nature, white noise)
 * - Break reminders and auto-breaks
 * - Session tracking and history
 * - Task linking
 * - Distraction blocking integration
 * - Statistics and streaks
 * - Keyboard shortcuts
 * - Desktop notifications
 */

// ============================================================================
// FOCUS STATE
// ============================================================================
const FocusState = {
    isActive: false,
    isPaused: false,
    isBreak: false,
    isOpenEnded: false,  // New: for count-up timer mode
    isStopping: false,
    elapsedSeconds: 0,   // New: tracks elapsed time for open-ended mode
    currentSession: null,
    timerInterval: null,
    remainingSeconds: 0,
    selectedMinutes: 25,
    startTimestamp: null,
    endTimestamp: null,
    pausedRemainingSeconds: null,
    pausedElapsedSeconds: null,
    pendingLinkedTaskId: null,
    pendingLinkedTaskTitle: null,
    breakMinutes: 5,
    completedPomodoros: 0,


    // Settings
    settings: {
        autoStartBreaks: false,
        autoStartNextSession: false,
        longBreakInterval: 4,
        longBreakMinutes: 15,
        shortBreakMinutes: 5,
        soundEnabled: true,
        notificationsEnabled: true,
        blockingEnabled: true
    },

    // Overlay settings
    overlaySettings: {
        enabled: true,
        color: '#8b5cf6',
        opacity: 0.4,
        width: 3,
        style: 'solid'
    },

    // Ambient sounds
    ambientSound: null,
    currentSoundType: null,
    soundVolume: 0.5
};

// Ambient sound URLs (using free sounds)
const AmbientSounds = {
    rain: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==', // Placeholder - would use actual audio
    lofi: null,
    nature: null,
    whitenoise: null,
    cafe: null
};

// ============================================================================
// BOREDOM (MOOD) TAGGING
// ============================================================================
const BOREDOM_LEVELS = [
    { value: 1, label: 'Locked in', hint: 'Great — ride the momentum.' },
    { value: 2, label: 'Okay', hint: 'Warm up with a tiny first step.' },
    { value: 3, label: 'Bored', hint: 'Add challenge: race a 10-min micro-goal.' },
    { value: 4, label: 'Very bored', hint: 'Make it a game: “just 5 minutes”.' },
    { value: 5, label: 'Restless', hint: 'Channel it: sprint + short break.' }
];

function clampBoredomLevel(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 3;
    return Math.max(1, Math.min(5, Math.round(n)));
}

function getBoredomMeta(level) {
    const safe = clampBoredomLevel(level);
    return BOREDOM_LEVELS.find(l => l.value === safe) || BOREDOM_LEVELS[2];
}

function promptBoredomLevelModal(initialLevel = 3) {
    return new Promise((resolve) => {
        let level = clampBoredomLevel(initialLevel);

        const modal = document.createElement('div');
        modal.id = 'boredom-level-modal';
        modal.className = 'modal active';

        const meta = getBoredomMeta(level);

        modal.innerHTML = `
            <div class="modal-backdrop" data-action="cancel-boredom"></div>
            <div class="modal-content" style="max-width: 520px; padding: 0; overflow: hidden; border-radius: 16px;">
                <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 20px 24px; color: white;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-face-meh" style="font-size: 1.25rem;"></i>
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">How bored are you right now?</h3>
                            <p style="margin: 4px 0 0 0; font-size: 0.85rem; opacity: 0.9;">Tag this session — we’ll show time spent by mood later.</p>
                        </div>
                    </div>
                </div>

                <div style="padding: 20px 24px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px;">
                        <div>
                            <div style="font-size: 0.85rem; color: var(--text-tertiary);">Boredom level</div>
                            <div style="display: flex; align-items: baseline; gap: 10px;">
                                <div style="font-size: 1.6rem; font-weight: 700; color: var(--text-primary);" data-boredom-value>${level}</div>
                                <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-secondary);" data-boredom-label>${meta.label}</div>
                            </div>
                            <div style="margin-top: 4px; font-size: 0.85rem; color: var(--text-tertiary);" data-boredom-hint>${meta.hint}</div>
                        </div>

                        <div style="display: flex; gap: 10px;">
                            <button class="btn-secondary" type="button" data-action="boredom-minus" style="width: 44px; height: 44px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center;">
                                <i class="fas fa-minus"></i>
                            </button>
                            <button class="btn-secondary" type="button" data-action="boredom-plus" style="width: 44px; height: 44px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center;">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>

                    <input type="range" min="1" max="5" value="${level}" data-boredom-range style="width: 100%;" />

                    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px; gap: 12px;">
                        <label style="display: flex; align-items: center; gap: 10px; color: var(--text-secondary); font-size: 0.9rem;">
                            <input type="checkbox" data-boredom-remember checked style="width: 16px; height: 16px; accent-color: var(--primary);" />
                            Remember for next time
                        </label>
                        <div style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button class="btn-secondary" type="button" data-action="cancel-boredom" style="padding: 10px 16px; border-radius: 8px; font-weight: 500;">Cancel</button>
                            <button type="button" data-action="confirm-boredom" style="padding: 10px 16px; border-radius: 8px; font-weight: 600; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; border: none; cursor: pointer;">Start Session</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const valueEl = modal.querySelector('[data-boredom-value]');
        const labelEl = modal.querySelector('[data-boredom-label]');
        const hintEl = modal.querySelector('[data-boredom-hint]');
        const rangeEl = modal.querySelector('[data-boredom-range]');

        const applyLevel = (next) => {
            level = clampBoredomLevel(next);
            const m = getBoredomMeta(level);
            if (valueEl) valueEl.textContent = String(level);
            if (labelEl) labelEl.textContent = m.label;
            if (hintEl) hintEl.textContent = m.hint;
            if (rangeEl) rangeEl.value = String(level);
        };

        const cleanup = () => {
            modal.remove();
        };

        modal.querySelectorAll('[data-action="cancel-boredom"]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                cleanup();
                resolve({ confirmed: false, boredomLevel: null });
            });
        });

        modal.querySelector('[data-action="boredom-minus"]').addEventListener('click', (e) => {
            e.preventDefault();
            applyLevel(level - 1);
        });

        modal.querySelector('[data-action="boredom-plus"]').addEventListener('click', (e) => {
            e.preventDefault();
            applyLevel(level + 1);
        });

        rangeEl.addEventListener('input', (e) => {
            applyLevel(e.target.value);
        });

        modal.querySelector('[data-action="confirm-boredom"]').addEventListener('click', (e) => {
            e.preventDefault();
            const remember = !!modal.querySelector('[data-boredom-remember]')?.checked;
            cleanup();
            if (remember) {
                try {
                    chrome.storage.local.set({ lastBoredomLevel: level });
                } catch (e) {
                    // Ignore storage errors
                }
            }
            resolve({ confirmed: true, boredomLevel: level });
        });

        document.body.appendChild(modal);
    });
}

async function maybeGetBoredomLevel(options = {}) {
    const skipPrompt = options?.skipBoredomPrompt === true;
    let initial = 3;

    try {
        const stored = await new Promise(resolve => chrome.storage.local.get(['lastBoredomLevel'], resolve));
        if (stored?.lastBoredomLevel != null) {
            initial = clampBoredomLevel(stored.lastBoredomLevel);
        }
    } catch (e) {
        // Ignore
    }

    if (skipPrompt) {
        return { confirmed: true, boredomLevel: initial, skipped: true };
    }

    return promptBoredomLevelModal(initial);
}

// ============================================================================
// FOCUS PAGE INITIALIZATION
// ============================================================================
async function loadFocusPage() {
    // Debug removed

    // Load settings
    await loadFocusSettings();

    // Load today's stats
    const todayStats = await ProductivityData.DataStore.getDailyStats();
    const streakData = await ProductivityData.DataStore.getStreakData();
    const recentSessions = await ProductivityData.DataStore.getTodaySessions();

    // Update stats display
    updateFocusStats(todayStats, streakData);

    // Update session counts (today, week, total)
    await updateSessionCounts();

    // Load tasks for linking
    await loadTaskOptions();

    // Load subjects for selection
    await loadSubjectOptions();

    // Render recent sessions
    renderRecentSessions(recentSessions);

    // Render boredom breakdown (last 7 days)
    renderBoredomBreakdownFocus({ days: 7 }).catch(() => void 0);

    // Update timer presets UI
    updateTimerPresetsUI();

    // Setup keyboard shortcuts
    setupFocusKeyboardShortcuts();

    // Check if there's an active session (page refresh or restore from storage)
    await checkActiveSession();

    // Check if we should auto-start with a linked task (from task page)
    checkAutoStartFromTask();
}

async function renderBoredomBreakdownFocus({ days = 7 } = {}) {
    const container = document.getElementById('boredom-breakdown-focus');
    if (!container) return;

    const safeDays = Math.max(1, Number.isFinite(days) ? Math.floor(days) : 7);
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (safeDays - 1));

    const startDate = start.toISOString().split('T')[0];
    const endDate = end.toISOString().split('T')[0];

    const sessions = await ProductivityData.DataStore.getSessionsByDateRange(startDate, endDate);
    const totals = new Map(BOREDOM_LEVELS.map(l => [l.value, 0]));
    let unknown = 0;

    (sessions || []).forEach(s => {
        if (!s) return;
        const minutes = Number(s.actualDurationMinutes || 0);
        if (!Number.isFinite(minutes) || minutes <= 0) return;
        const lvl = Number(s.boredomLevel);
        if (Number.isFinite(lvl) && lvl >= 1 && lvl <= 5) {
            const rounded = clampBoredomLevel(lvl);
            totals.set(rounded, (totals.get(rounded) || 0) + minutes);
        } else {
            unknown += minutes;
        }
    });

    const totalMinutes = [...totals.values()].reduce((a, b) => a + b, 0) + unknown;
    if (totalMinutes <= 0) {
        container.innerHTML = `
            <div class="empty-state small">
                <i class="fas fa-face-meh"></i>
                <p>No mood data yet</p>
                <p class="sub">Start a focus session to begin tracking.</p>
            </div>
        `;
        return;
    }

    const colors = ['#10b981', '#22c55e', '#f59e0b', '#f97316', '#ef4444'];
    const rows = BOREDOM_LEVELS.map((l, idx) => {
        const minutes = totals.get(l.value) || 0;
        const percent = (minutes / totalMinutes) * 100;
        return { ...l, minutes, percent, color: colors[idx] || '#6366f1' };
    });

    container.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 10px;">
            <div style="font-weight: 600; color: var(--text-primary);">Last ${safeDays} days</div>
            <div style="color: var(--text-tertiary); font-size: 0.9rem;">${formatFocusTime(Math.round(totalMinutes))} total</div>
        </div>
        <div style="display:flex; flex-direction:column; gap: 10px;">
            ${rows.map(r => `
                <div style="display:flex; align-items:center; gap: 12px;">
                    <div style="width: 120px; min-width: 120px; color: var(--text-secondary); font-size: 0.9rem;">
                        ${r.value} - ${r.label}
                    </div>
                    <div style="flex: 1; height: 10px; background: var(--bg-secondary); border-radius: 999px; overflow: hidden; border: 1px solid var(--border-color);">
                        <div style="height: 100%; width: ${Math.max(0, r.percent)}%; background: ${r.color};"></div>
                    </div>
                    <div style="width: 90px; text-align: right; color: var(--text-tertiary); font-size: 0.9rem;">
                        ${formatFocusTime(Math.round(r.minutes))}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Check for and restore any active RUNNING focus session from storage
 * Paused sessions are NOT auto-restored - user will see resume prompt when starting new focus
 * This allows users to use the app normally while a session is paused
 */
async function checkActiveSession() {
    try {
        const stored = await chrome.storage.local.get('focusState');

        if (stored.focusState && stored.focusState.isActive) {
            const savedState = stored.focusState;

            const now = Date.now();

            const effectiveStartTimestamp = savedState.startTimestamp
                ?? (savedState.isOpenEnded
                    ? (now - ((savedState.elapsedSeconds || 0) * 1000))
                    : (now - (((savedState.selectedMinutes || 0) * 60 - (savedState.remainingSeconds || 0)) * 1000)));

            // Check if session is less than 24 hours old
            const hoursSinceSaved = (now - effectiveStartTimestamp) / (1000 * 60 * 60);

            if (hoursSinceSaved >= 24) {
                // Session too old - clear it
                chrome.storage.local.remove('focusState');
                return;
            }

            // If session was paused, DON'T auto-restore - let user browse app freely
            // They will see resume options when they try to start a new focus session
            if (savedState.isPaused) {
                // Just restore the in-memory state but don't show overlay
                FocusState.isActive = true;
                FocusState.isPaused = true;
                FocusState.isOpenEnded = savedState.isOpenEnded || false;
                FocusState.isBreak = savedState.isBreak || false;
                FocusState.startTimestamp = effectiveStartTimestamp;
                FocusState.selectedMinutes = savedState.selectedMinutes || 0;

                if (savedState.isOpenEnded) {
                    FocusState.pausedElapsedSeconds = savedState.pausedElapsedSeconds ?? savedState.elapsedSeconds ?? 0;
                    FocusState.elapsedSeconds = FocusState.pausedElapsedSeconds;
                } else {
                    FocusState.pausedRemainingSeconds = savedState.pausedRemainingSeconds ?? savedState.remainingSeconds;
                    FocusState.remainingSeconds = FocusState.pausedRemainingSeconds;
                }

                FocusState.currentSession = {
                    id: `restored_${Date.now()}`,
                    type: savedState.isOpenEnded ? 'open-ended' : getSessionType(savedState.selectedMinutes),
                    durationMinutes: savedState.selectedMinutes || 0,
                    linkedTaskTitle: savedState.taskTitle,
                    startTime: new Date(effectiveStartTimestamp).toISOString(),
                    status: 'in-progress'
                };

                // Show a subtle indicator that there's a paused session
                showToast('info', 'Paused Session', 'You have a paused focus session. Start focus to resume or start fresh.');
                return;
            }

            // Handle open-ended (count-up) mode - RUNNING session
            if (savedState.isOpenEnded) {
                const elapsedSeconds = Math.max(0, Math.floor((now - effectiveStartTimestamp) / 1000));

                // Restore state directly for open-ended mode
                FocusState.isActive = true;
                FocusState.isPaused = false;
                FocusState.isBreak = false;
                FocusState.isOpenEnded = true;
                FocusState.elapsedSeconds = elapsedSeconds;
                FocusState.remainingSeconds = 0;
                FocusState.selectedMinutes = 0;
                FocusState.startTimestamp = effectiveStartTimestamp;
                FocusState.endTimestamp = null;
                FocusState.pausedElapsedSeconds = null;
                FocusState.pausedRemainingSeconds = null;

                // Create session object
                FocusState.currentSession = {
                    id: `restored_${Date.now()}`,
                    type: 'open-ended',
                    durationMinutes: 0,
                    linkedTaskTitle: savedState.taskTitle,
                    startTime: new Date(effectiveStartTimestamp).toISOString(),
                    status: 'in-progress'
                };

                // Show overlay for RUNNING session
                showFocusOverlay();
                updateTimerDisplay();

                // Start timer
                if (FocusState.timerInterval) {
                    clearInterval(FocusState.timerInterval);
                }
                FocusState.timerInterval = setInterval(timerTick, 1000);

                syncFocusStateToStorage();
                showToast('success', 'Free Focus Restored!', `You've been focusing for ${Math.floor(elapsedSeconds / 60)} minutes.`);
                return;
            }

            // Standard countdown mode - calculate remaining time for RUNNING session
            const selectedMinutes = savedState.selectedMinutes || FocusState.selectedMinutes || 25;
            const newRemaining = typeof savedState.endTimestamp === 'number'
                ? Math.ceil((savedState.endTimestamp - now) / 1000)
                : Math.ceil((selectedMinutes * 60) - Math.floor((now - effectiveStartTimestamp) / 1000));

            // Only restore if there's still time left
            if (newRemaining > 0) {
                // Show restore prompt for running countdown session
                showRestoreSessionPrompt({
                    ...savedState,
                    selectedMinutes,
                    startTimestamp: effectiveStartTimestamp
                }, newRemaining);
            } else {
                // Session expired or completed - clear it
                chrome.storage.local.remove('focusState');
            }
        }
    } catch (error) {
        console.error('Failed to check active session:', error);
    }
}

/**
 * Check if there's a paused session and show options modal
 * Returns: { action: 'resume' | 'start-fresh-add-time' | 'start-fresh-discard' | 'cancelled' }
 */
async function checkPausedSessionBeforeStart() {
    return new Promise((resolve) => {
        // Only proceed if there's a paused session
        if (!FocusState.isActive || !FocusState.isPaused) {
            resolve({ action: 'no-paused-session' });
            return;
        }

        // Calculate elapsed time from paused session
        let elapsedMinutes = 0;
        let remainingMinutes = 0;
        const taskName = FocusState.currentSession?.linkedTaskTitle || 'Focus Session';

        if (FocusState.isOpenEnded) {
            elapsedMinutes = Math.floor((FocusState.pausedElapsedSeconds || FocusState.elapsedSeconds || 0) / 60);
        } else {
            const totalMinutes = FocusState.selectedMinutes || 25;
            remainingMinutes = Math.ceil((FocusState.pausedRemainingSeconds || FocusState.remainingSeconds || 0) / 60);
            elapsedMinutes = totalMinutes - remainingMinutes;
        }

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'paused-session-modal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-backdrop" data-action="cancel"></div>
            <div class="modal-content" style="max-width: 450px; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">⏸️</div>
                <h3 style="margin-bottom: 0.5rem;">Paused Focus Session Found</h3>
                <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                    You have a paused ${FocusState.isOpenEnded ? 'free focus' : 'focus'} session:<br>
                    <strong>${taskName}</strong><br>
                    <span style="font-size: 0.9rem; color: var(--primary);">
                        ${elapsedMinutes} minute${elapsedMinutes !== 1 ? 's' : ''} focused
                        ${!FocusState.isOpenEnded ? `, ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''} remaining` : ''}
                    </span>
                </p>
                
                <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.5rem;">
                    <button class="btn-primary" data-action="resume" style="width: 100%; padding: 0.75rem;">
                        <i class="fas fa-play"></i> Resume Session
                    </button>
                    ${elapsedMinutes >= 1 ? `
                        <button class="btn-secondary" data-action="start-fresh-add-time" style="width: 100%; padding: 0.75rem;">
                            <i class="fas fa-plus"></i> Start Fresh (Add ${elapsedMinutes}m to Stats)
                        </button>
                    ` : ''}
                    <button class="btn-secondary" data-action="start-fresh-discard" style="width: 100%; padding: 0.75rem; opacity: 0.8;">
                        <i class="fas fa-trash-alt"></i> Start Fresh (Discard Session)
                    </button>
                </div>
                
                <button class="btn-text" data-action="cancel" style="margin-top: 1rem; color: var(--text-muted);">
                    Cancel
                </button>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle actions
        const cleanup = (action) => {
            modal.remove();
            resolve({ action, elapsedMinutes });
        };

        modal.querySelector('[data-action="resume"]')?.addEventListener('click', () => cleanup('resume'));
        modal.querySelector('[data-action="start-fresh-add-time"]')?.addEventListener('click', () => cleanup('start-fresh-add-time'));
        modal.querySelector('[data-action="start-fresh-discard"]')?.addEventListener('click', () => cleanup('start-fresh-discard'));
        modal.querySelectorAll('[data-action="cancel"]').forEach(el => {
            el.addEventListener('click', () => cleanup('cancelled'));
        });
    });
}

/**
 * End the paused session and optionally add elapsed time to stats
 */
async function endPausedSessionForFreshStart(addTimeToStats) {
    if (!FocusState.isActive || !FocusState.isPaused) return;

    // Calculate elapsed time
    let elapsedMinutes = 0;
    if (FocusState.isOpenEnded) {
        elapsedMinutes = Math.floor((FocusState.pausedElapsedSeconds || FocusState.elapsedSeconds || 0) / 60);
    } else {
        const totalMinutes = FocusState.selectedMinutes || 25;
        const remainingMinutes = Math.ceil((FocusState.pausedRemainingSeconds || FocusState.remainingSeconds || 0) / 60);
        elapsedMinutes = totalMinutes - remainingMinutes;
    }

    // If adding time to stats, save the session as interrupted
    if (addTimeToStats && elapsedMinutes >= 1 && FocusState.currentSession) {
        FocusState.currentSession.endTime = new Date().toISOString();
        FocusState.currentSession.actualDurationMinutes = elapsedMinutes;
        FocusState.currentSession.status = 'interrupted';

        try {
            await ProductivityData.DataStore.saveFocusSession(FocusState.currentSession);
        } catch (e) {
            console.error('Failed to save interrupted session:', e);
        }
    }

    // Clear state
    if (FocusState.timerInterval) {
        clearInterval(FocusState.timerInterval);
        FocusState.timerInterval = null;
    }

    FocusState.isActive = false;
    FocusState.isPaused = false;
    FocusState.isOpenEnded = false;
    FocusState.currentSession = null;
    FocusState.startTimestamp = null;
    FocusState.endTimestamp = null;
    FocusState.pausedRemainingSeconds = null;
    FocusState.pausedElapsedSeconds = null;
    FocusState.remainingSeconds = 0;
    FocusState.elapsedSeconds = 0;

    // Clear storage
    chrome.storage.local.remove('focusState');
}


/**
 * Show prompt to restore a previous focus session
 */
function showRestoreSessionPrompt(savedState, remainingSeconds) {
    const elapsedMinutes = savedState.selectedMinutes - Math.ceil(remainingSeconds / 60);
    const taskName = savedState.taskTitle || 'Focus Session';

    // Create restore modal
    const modal = document.createElement('div');
    modal.id = 'restore-session-modal';
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-backdrop" data-action="dismiss-restore"></div>
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">⏸️</div>
            <h3 style="margin-bottom: 0.5rem;">Resume Previous Session?</h3>
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
                You had a ${savedState.isPaused ? 'paused' : 'running'} focus session:<br>
                <strong>${taskName}</strong><br>
                <span style="font-size: 0.9rem;">${elapsedMinutes} minutes completed, ${Math.ceil(remainingSeconds / 60)} minutes remaining</span>
            </p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button class="btn-secondary" data-action="dismiss-restore">Start Fresh</button>
                <button class="btn-primary" data-action="restore-session">
                    <i class="fas fa-play"></i> Resume Session
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event handlers
    modal.querySelectorAll('[data-action="dismiss-restore"]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.storage.local.remove('focusState');
            modal.remove();
        });
    });

    modal.querySelector('[data-action="restore-session"]').addEventListener('click', () => {
        modal.remove();
        restoreFocusSession(savedState, remainingSeconds);
    });
}

/**
 * Restore a focus session from saved state
 */
function restoreFocusSession(savedState, remainingSeconds) {
    // Set state
    FocusState.isActive = true;
    FocusState.isPaused = true; // Always start paused so user can review
    FocusState.isBreak = savedState.isBreak || false;
    FocusState.isOpenEnded = false;
    FocusState.remainingSeconds = remainingSeconds;
    FocusState.selectedMinutes = savedState.selectedMinutes;
    FocusState.startTimestamp = savedState.startTimestamp || Date.now();
    FocusState.endTimestamp = null;
    FocusState.pausedRemainingSeconds = remainingSeconds;
    FocusState.pausedElapsedSeconds = null;

    // Create session object
    FocusState.currentSession = {
        id: `restored_${Date.now()}`,
        type: getSessionType(savedState.selectedMinutes),
        durationMinutes: savedState.selectedMinutes,
        linkedTaskTitle: savedState.taskTitle,
        startTime: new Date(FocusState.startTimestamp).toISOString(),
        status: 'in-progress'
    };

    // Show overlay
    showFocusOverlay();

    // Update display
    updateTimerDisplay();
    updateProgressRing();
    updatePauseButton();

    // Start timer (paused)
    FocusState.timerInterval = setInterval(timerTick, 1000);

    // Sync state
    syncFocusStateToStorage();

    showToast('success', 'Session Restored!', 'Press play to continue your focus session.');
}

function setFocusPaused(paused) {
    if (!FocusState.isActive) return;
    if (FocusState.isPaused === paused) return;

    const now = Date.now();

    // Snapshot right before pausing
    if (paused) {
        if (FocusState.isOpenEnded) {
            const start = FocusState.startTimestamp ?? now;
            FocusState.elapsedSeconds = Math.max(0, Math.floor((now - start) / 1000));
            FocusState.pausedElapsedSeconds = FocusState.elapsedSeconds;
        } else {
            if (typeof FocusState.endTimestamp === 'number') {
                FocusState.remainingSeconds = Math.max(0, Math.ceil((FocusState.endTimestamp - now) / 1000));
            }
            FocusState.pausedRemainingSeconds = FocusState.remainingSeconds;
            FocusState.endTimestamp = null;
        }

        // Keep overlay visible when paused so the user can easily resume.
    }

    FocusState.isPaused = paused;
    updatePauseButton();

    // Update overlay state
    const overlay = document.getElementById('focus-overlay');
    overlay?.classList.toggle('paused', FocusState.isPaused);

    // Pause/resume ambient sound
    if (FocusState.ambientSound) {
        if (FocusState.isPaused) {
            FocusState.ambientSound.pause();
        } else {
            FocusState.ambientSound.play();
        }
    }

    // On resume, rebuild timestamps and show overlay
    if (!paused) {
        if (FocusState.isOpenEnded) {
            const elapsed = FocusState.pausedElapsedSeconds ?? FocusState.elapsedSeconds ?? 0;
            FocusState.startTimestamp = now - (elapsed * 1000);
            FocusState.pausedElapsedSeconds = null;
        } else {
            const remaining = FocusState.pausedRemainingSeconds ?? FocusState.remainingSeconds;
            FocusState.remainingSeconds = remaining;
            FocusState.endTimestamp = now + (remaining * 1000);
            FocusState.startTimestamp = now - ((FocusState.selectedMinutes * 60 - remaining) * 1000);
            FocusState.pausedRemainingSeconds = null;
        }

        // Show overlay when resuming
        showFocusOverlay();

        // Ensure timer interval is running
        if (!FocusState.timerInterval) {
            FocusState.timerInterval = setInterval(timerTick, 1000);
        }

        // Pre-initialize audio context for completion sound
        try {
            window.NotificationSounds?.init?.();
        } catch (e) {
            // Ignore audio init errors
        }
    }

    syncFocusStateToStorage();

    showToast(FocusState.isPaused ? 'info' : 'success',
        FocusState.isPaused ? 'Session Paused' : 'Session Resumed',
        FocusState.isPaused ? 'Take a moment, then continue!' : 'Let\'s keep going!');
}

async function loadFocusSettings() {
    try {
        // First, load last used duration from storage
        const stored = await new Promise(resolve => {
            chrome.storage.local.get(['lastFocusDuration'], result => resolve(result));
        });

        if (stored.lastFocusDuration) {
            FocusState.selectedMinutes = stored.lastFocusDuration;
        }

        const settings = await ProductivityData.DataStore.getSettings();

        // DataStore.getSettings() returns a UserSettings model.
        // Map it into this module's FocusState.settings shape.
        if (settings) {
            FocusState.settings.autoStartBreaks = settings.autoStartBreaks === true;
            FocusState.settings.autoStartNextSession = settings.autoStartFocus === true;
            FocusState.settings.longBreakInterval = settings.longBreakInterval || FocusState.settings.longBreakInterval;
            FocusState.settings.longBreakMinutes = settings.longBreakDuration || FocusState.settings.longBreakMinutes;
            FocusState.settings.shortBreakMinutes = settings.defaultBreakDuration || FocusState.settings.shortBreakMinutes;
            FocusState.settings.soundEnabled = settings.enableSounds !== false;
            FocusState.settings.notificationsEnabled = settings.notifyBreaks !== false;
            FocusState.settings.blockingEnabled = settings.autoBlockDuringFocus !== false;

            // Only apply default duration if no last selection saved
            if (!stored.lastFocusDuration && settings.defaultFocusDuration) {
                FocusState.selectedMinutes = settings.defaultFocusDuration;
            }

            FocusState.breakMinutes = FocusState.settings.shortBreakMinutes;
        }

        // Load overlay settings
        const overlayStored = await new Promise(resolve => {
            chrome.storage.local.get(['focusOverlaySettings'], result => resolve(result));
        });
        if (overlayStored.focusOverlaySettings) {
            Object.assign(FocusState.overlaySettings, overlayStored.focusOverlaySettings);
        }

        // Initialize overlay settings UI
        initOverlaySettingsUI();

        // Update the timer display with the correct duration
        const timerEl = document.getElementById('focus-time');
        if (timerEl && !FocusState.isActive) {
            timerEl.textContent = `${String(FocusState.selectedMinutes).padStart(2, '0')}:00`;
        }
    } catch (e) {
        // Debug removed
    }
}

function updateFocusStats(todayStats, streakData) {
    // Total focus time today
    const totalFocusEl = document.getElementById('total-focus-today');
    if (totalFocusEl) {
        totalFocusEl.textContent = formatFocusTime(todayStats.focusMinutes || 0);
    }

    // Sessions completed
    const sessionsEl = document.getElementById('sessions-today');
    if (sessionsEl) {
        sessionsEl.textContent = todayStats.focusSessions || 0;
    }

    // Current streak
    const streakEl = document.getElementById('focus-streak');
    if (streakEl) {
        streakEl.textContent = streakData.currentStreak || 0;
    }

    // Best streak
    const bestStreakEl = document.getElementById('best-streak');
    if (bestStreakEl) {
        bestStreakEl.textContent = streakData.longestStreak || 0;
    }

    // Weekly goal progress
    updateWeeklyGoalProgress(todayStats.focusMinutes || 0);
}

function formatFocusTime(minutes) {
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function updateWeeklyGoalProgress(todayMinutes) {
    const progressEl = document.getElementById('weekly-focus-progress');
    const weeklyGoal = (FocusState.settings.dailyGoalHours || 8) * 60; // Daily goal in minutes
    const progress = Math.min((todayMinutes / weeklyGoal) * 100, 100);

    if (progressEl) {
        progressEl.style.width = `${progress}%`;
        progressEl.setAttribute('data-progress', `${Math.round(progress)}%`);
    }
}

/**
 * Calculate and display session counts (today, this week, total)
 */
async function updateSessionCounts() {
    try {
        const sessions = await ProductivityData.DataStore.getFocusSessions();

        // These counters are meant to represent completed sessions, not active/paused/interrupted.
        const completed = sessions.filter(s => s && s.status === 'completed');

        const now = new Date();
        const today = now.toISOString().split('T')[0];

        // Calculate start of week (Sunday) in UTC to match stored ISO dates.
        const startOfWeek = new Date(now);
        startOfWeek.setUTCDate(now.getUTCDate() - now.getUTCDay());
        startOfWeek.setUTCHours(0, 0, 0, 0);
        const startOfWeekStr = startOfWeek.toISOString().split('T')[0];

        const todayCount = completed.filter(s => s.date === today).length;
        const weekCount = completed.filter(s => s.date >= startOfWeekStr && s.date <= today).length;
        const totalCount = completed.length;

        // Update focus page stats
        const todayEl = document.getElementById('sessions-today-count');
        const weekEl = document.getElementById('sessions-week-count');
        const totalEl = document.getElementById('sessions-total-count');

        if (todayEl) todayEl.textContent = todayCount;
        if (weekEl) weekEl.textContent = weekCount;
        if (totalEl) totalEl.textContent = totalCount;

        // Update overlay stats (Sessions Today)
        const overlayTodayEl = document.getElementById('focus-sessions-today');
        if (overlayTodayEl) overlayTodayEl.textContent = todayCount;

    } catch (error) {
        console.error('Failed to update session counts:', error);
    }
}

async function loadTaskOptions() {
    const select = document.getElementById('focus-task-select');
    if (!select) return;

    const tasks = await ProductivityData.DataStore.getTasks();
    const pendingTasks = tasks.filter(t => t.status !== 'completed');

    // Group by priority
    const urgent = pendingTasks.filter(t => t.priority === 'urgent');
    const high = pendingTasks.filter(t => t.priority === 'high');
    const other = pendingTasks.filter(t => !['urgent', 'high'].includes(t.priority));

    let html = '<option value="">No specific task</option>';

    if (urgent.length > 0) {
        html += '<optgroup label="🔴 Urgent">';
        html += urgent.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
        html += '</optgroup>';
    }

    if (high.length > 0) {
        html += '<optgroup label="🟠 High Priority">';
        html += high.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
        html += '</optgroup>';
    }

    if (other.length > 0) {
        html += '<optgroup label="📋 Other Tasks">';
        html += other.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
        html += '</optgroup>';
    }

    select.innerHTML = html;
}

async function loadSubjectOptions() {
    const select = document.getElementById('focus-subject-select');
    if (!select) return;

    // Get subjects from tasks and sessions
    const subjects = new Set();

    const tasks = await ProductivityData.DataStore.getTasks();
    tasks.forEach(t => {
        if (t.subject) subjects.add(t.subject);
    });

    // Add common subjects
    ['Math', 'Science', 'English', 'History', 'Programming', 'Reading', 'Writing', 'Research', 'Other']
        .forEach(s => subjects.add(s));

    select.innerHTML = '<option value="">General Focus</option>' +
        Array.from(subjects).sort().map(s => `<option value="${s}">${s}</option>`).join('');
}

function updateTimerPresetsUI() {
    // Update preset buttons with current settings
    const presets = [
        { minutes: 25, label: 'Pomodoro', icon: 'fa-stopwatch' },
        { minutes: 50, label: 'Deep Work', icon: 'fa-brain' },
        { minutes: 90, label: 'Flow State', icon: 'fa-fire' }
    ];

    // Clear all selections first (both old and new design)
    document.querySelectorAll('.timer-option, .timer-option-card').forEach(btn => {
        btn.classList.remove('selected');
        btn.classList.remove('active');
    });

    // Highlight the selected/default option
    const selectedMinutes = FocusState.selectedMinutes;
    // Try new design first, then old
    let defaultBtn = document.querySelector(`.timer-option-card[data-minutes="${selectedMinutes}"]`);
    if (!defaultBtn) {
        defaultBtn = document.querySelector(`.timer-option[data-minutes="${selectedMinutes}"]`);
    }

    if (defaultBtn) {
        defaultBtn.classList.add('selected');
    } else if (selectedMinutes && selectedMinutes !== 25 && selectedMinutes !== 50 && selectedMinutes !== 90) {
        // Custom time is selected
        const customBtn = document.getElementById('custom-timer-btn');
        if (customBtn) {
            customBtn.classList.add('selected');
            // Update the custom button text if old design
            const timeSpan = customBtn.querySelector('.time');
            if (timeSpan) {
                timeSpan.textContent = `${selectedMinutes} min`;
            }
            // Update for new design
            const optionTime = customBtn.querySelector('.option-time');
            if (optionTime) {
                optionTime.textContent = `${selectedMinutes} min`;
            }
        }
    }
}

// ============================================================================
// RECENT SESSIONS
// ============================================================================
function renderRecentSessions(sessions) {
    const container = document.getElementById('recent-sessions-list');
    if (!container) return;

    if (!sessions || sessions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-hourglass-start"></i>
                <p>No focus sessions today</p>
                <p class="sub">Start your first session to build momentum!</p>
            </div>
        `;
        return;
    }

    // Sort by most recent
    sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    container.innerHTML = sessions.slice(0, 8).map(session => {
        const startTime = new Date(session.startTime);
        const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const isCompleted = session.status === 'completed';
        const typeIcon = getSessionTypeIcon(session.type);

        return `
            <div class="session-item ${session.status}" data-action="show-session" data-session-id="${session.id}">
                <div class="session-icon" style="background: ${isCompleted ? '#10b981' : '#f59e0b'}20">
                    <i class="fas ${typeIcon}" style="color: ${isCompleted ? '#10b981' : '#f59e0b'}"></i>
                </div>
                <div class="session-details">
                    <div class="session-main">
                        <span class="session-title">${session.linkedTaskTitle || session.subject || 'Focus Session'}</span>
                        <span class="session-time">${timeStr}</span>
                    </div>
                    <div class="session-meta">
                        <span class="session-duration">
                            <i class="fas fa-clock"></i> ${formatFocusTime(session.actualDurationMinutes)}
                        </span>
                        ${session.boredomLevel ? `
                            <span class="session-status-badge" style="background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border-color);">
                                <i class="fas fa-face-meh" style="margin-right: 6px;"></i>
                                ${clampBoredomLevel(session.boredomLevel)}
                            </span>
                        ` : ''}
                        <span class="session-status-badge ${session.status}">
                            ${isCompleted ? '✓ Completed' : '◐ Interrupted'}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Setup session click listeners
    document.querySelectorAll('.session-item[data-action="show-session"]').forEach(el => {
        el.addEventListener('click', () => {
            showSessionDetails(el.dataset.sessionId);
        });
    });
}

function getSessionTypeIcon(type) {
    const icons = {
        'pomodoro': 'fa-stopwatch',
        'deep-work': 'fa-brain',
        'flow': 'fa-fire',
        'custom': 'fa-clock'
    };
    return icons[type] || 'fa-clock';
}

async function showSessionDetails(sessionId) {
    // TODO: Show detailed session view
    // Debug removed
}

// ============================================================================
// TIMER FUNCTIONS
// ============================================================================
function selectTimerPreset(minutes) {
    FocusState.selectedMinutes = minutes;

    // Save selected duration to storage so it persists
    chrome.storage.local.set({ lastFocusDuration: minutes });

    updateTimerPresetsUI();

    // Update main display preview
    const previewEl = document.getElementById('timer-preview');
    if (previewEl) {
        previewEl.textContent = `${minutes}:00`;
    }

    // Also update the main timer display
    const timerEl = document.getElementById('focus-time');
    if (timerEl && !FocusState.isActive) {
        timerEl.textContent = `${String(minutes).padStart(2, '0')}:00`;
    }
}

async function startFocusSession(minutes = null, options = {}) {

    // Check if there's a paused session - show options modal
    const pausedCheck = await checkPausedSessionBeforeStart();
    if (pausedCheck.action === 'cancelled') {
        return; // User cancelled
    }
    if (pausedCheck.action === 'resume') {
        // Resume the paused session
        resumeFocusSession();
        return;
    }
    if (pausedCheck.action === 'start-fresh-add-time') {
        // End paused session, add time to stats, then start fresh
        await endPausedSessionForFreshStart(true);
    } else if (pausedCheck.action === 'start-fresh-discard') {
        // End paused session without adding time
        await endPausedSessionForFreshStart(false);
    }
    // If 'no-paused-session', just continue normally

    // Fix: Prioritize passed minutes, then selected, then load from storage if needed
    let duration = minutes;
    if (!duration) {
        duration = FocusState.selectedMinutes;
    }

    // If still no duration, try loading from storage as final fallback
    if (!duration || duration === 25) {
        try {
            const result = await new Promise(resolve =>
                chrome.storage.local.get(['lastFocusDuration'], resolve)
            );
            if (result.lastFocusDuration && result.lastFocusDuration !== 25) {
                duration = result.lastFocusDuration;
            }
        } catch (e) {
            console.error('Storage fallback failed:', e);
        }
    }

    // Default to 25 if nothing else worked
    duration = duration || 25;

    // Ask boredom level before starting (unless auto-starting)
    const boredom = await maybeGetBoredomLevel(options);
    if (!boredom.confirmed) {
        showToast('info', 'Start canceled', 'No session started.');
        return;
    }

    // Update state
    FocusState.selectedMinutes = duration;
    FocusState.remainingSeconds = duration * 60;

    const now = Date.now();
    FocusState.startTimestamp = now;
    FocusState.endTimestamp = now + (duration * 60 * 1000);
    FocusState.pausedRemainingSeconds = null;
    FocusState.pausedElapsedSeconds = null;
    FocusState.isOpenEnded = false;

    FocusState.isActive = true;
    FocusState.isPaused = false;
    FocusState.isBreak = false;

    // Save selected duration
    chrome.storage.local.set({ lastFocusDuration: duration });

    // Get linked task info
    const taskSelect = document.getElementById('focus-task-select');
    let linkedTaskId = FocusState.pendingLinkedTaskId || taskSelect?.value || null;
    let linkedTaskTitle = FocusState.pendingLinkedTaskTitle || (linkedTaskId ? taskSelect?.selectedOptions[0]?.text : '') || '';

    // If we have a pending linked task, try to reflect it in the UI dropdown too
    if (FocusState.pendingLinkedTaskId && taskSelect) {
        const option = taskSelect.querySelector(`option[value="${FocusState.pendingLinkedTaskId}"]`);
        if (option) {
            taskSelect.value = FocusState.pendingLinkedTaskId;
            linkedTaskTitle = FocusState.pendingLinkedTaskTitle || option.text;
        }
    }

    // Get subject
    const subjectSelect = document.getElementById('focus-subject-select');
    const subject = subjectSelect?.value || '';

    // Create session object
    FocusState.currentSession = new ProductivityData.FocusSession({
        plannedDurationMinutes: duration,
        linkedTaskId,
        linkedTaskTitle,
        subject,
        type: getSessionType(duration),
        startTime: new Date().toISOString(),
        boredomLevel: boredom.boredomLevel
    });

    FocusState.pendingLinkedTaskId = null;
    FocusState.pendingLinkedTaskTitle = null;

    // Save session start (non-blocking for faster UI)
    ProductivityData.DataStore.saveFocusSession(FocusState.currentSession).catch(e =>
        console.error('Failed to save focus session:', e)
    );

    // Show focus overlay immediately
    showFocusOverlay();

    // Enable distraction blocking if enabled (non-blocking)
    if (FocusState.settings.blockingEnabled) {
        enableDistractionBlocking().catch(e =>
            console.error('Failed to enable distraction blocking:', e)
        );
    }

    // Start ambient sound if selected
    const soundSelect = document.getElementById('ambient-sound-select');
    if (soundSelect?.value && FocusState.settings.soundEnabled) {
        startAmbientSound(soundSelect.value);
    }

    // Start timer
    updateTimerDisplay();
    updateProgressRing();

    // Clear any existing interval before starting new one
    if (FocusState.timerInterval) {
        clearInterval(FocusState.timerInterval);
    }
    FocusState.timerInterval = setInterval(timerTick, 1000);

    // Sync state immediately so popup can show it
    syncFocusStateToStorage();

    // Show notification
    if (FocusState.settings.notificationsEnabled) {
        showNotification('Focus Session Started', `${duration} minutes - Let's get productive!`);
    }
}

function getSessionType(minutes) {
    if (minutes <= 25) return 'pomodoro';
    if (minutes <= 50) return 'deep-work';
    if (minutes <= 90) return 'flow';
    return 'custom';
}

/**
 * Start an open-ended focus session (count-up timer)
 * Timer runs until manually stopped by user
 */
async function startOpenEndedSession() {
    // Check if there's a paused session - show options modal
    const pausedCheck = await checkPausedSessionBeforeStart();
    if (pausedCheck.action === 'cancelled') {
        return; // User cancelled
    }
    if (pausedCheck.action === 'resume') {
        // Resume the paused session
        resumeFocusSession();
        return;
    }
    if (pausedCheck.action === 'start-fresh-add-time') {
        // End paused session, add time to stats, then start fresh
        await endPausedSessionForFreshStart(true);
    } else if (pausedCheck.action === 'start-fresh-discard') {
        // End paused session without adding time
        await endPausedSessionForFreshStart(false);
    }
    // If 'no-paused-session', just continue normally

    // Ask boredom level before starting
    const boredom = await maybeGetBoredomLevel({});
    if (!boredom.confirmed) {
        showToast('info', 'Start canceled', 'No session started.');
        return;
    }

    // Reset state for open-ended mode
    FocusState.isActive = true;
    FocusState.isPaused = false;
    FocusState.isBreak = false;
    FocusState.isOpenEnded = true;
    FocusState.elapsedSeconds = 0;
    FocusState.remainingSeconds = 0; // Not used in open-ended mode
    FocusState.selectedMinutes = 0;  // Will be calculated at end

    const now = Date.now();
    FocusState.startTimestamp = now;
    FocusState.endTimestamp = null;
    FocusState.pausedElapsedSeconds = null;
    FocusState.pausedRemainingSeconds = null;

    // Get linked task info
    const taskSelect = document.getElementById('focus-task-select');
    const linkedTaskId = taskSelect?.value || null;
    const linkedTaskTitle = linkedTaskId ? taskSelect?.selectedOptions[0]?.text : '';

    // Get subject
    const subjectSelect = document.getElementById('focus-subject-select');
    const subject = subjectSelect?.value || '';

    // Create session object
    FocusState.currentSession = new ProductivityData.FocusSession({
        plannedDurationMinutes: 0, // Open-ended
        linkedTaskId,
        linkedTaskTitle,
        subject,
        type: 'open-ended',
        startTime: new Date().toISOString(),
        boredomLevel: boredom.boredomLevel
    });

    // Save session start
    ProductivityData.DataStore.saveFocusSession(FocusState.currentSession).catch(e =>
        console.error('Failed to save focus session:', e)
    );

    // Show focus overlay
    showFocusOverlay();

    // Enable distraction blocking if enabled
    if (FocusState.settings.blockingEnabled) {
        enableDistractionBlocking().catch(e =>
            console.error('Failed to enable distraction blocking:', e)
        );
    }

    // Start ambient sound if selected
    const soundSelect = document.getElementById('ambient-sound-select');
    if (soundSelect?.value && FocusState.settings.soundEnabled) {
        startAmbientSound(soundSelect.value);
    }

    // Start timer (counts up)
    updateTimerDisplay();

    // Clear any existing interval
    if (FocusState.timerInterval) {
        clearInterval(FocusState.timerInterval);
    }
    FocusState.timerInterval = setInterval(timerTick, 1000);

    // Sync state to storage
    syncFocusStateToStorage();

    // Show notification
    if (FocusState.settings.notificationsEnabled) {
        showNotification('Free Focus Started', 'Timer is counting up. Stop when ready!');
    }
}


// Check if we should auto-start a focus session from task page
function checkAutoStartFromTask() {
    const focusTaskId = localStorage.getItem('focusTaskId');
    const focusTaskTitle = localStorage.getItem('focusTaskTitle');

    if (focusTaskId && focusTaskTitle) {
        // Clear the localStorage items so we don't auto-start again
        localStorage.removeItem('focusTaskId');
        localStorage.removeItem('focusTaskTitle');

        // Set the task in the dropdown if it exists
        const taskSelect = document.getElementById('focus-task-select');
        if (taskSelect) {
            // Try to find and select the task
            const option = taskSelect.querySelector(`option[value="${focusTaskId}"]`);
            if (option) {
                taskSelect.value = focusTaskId;
            }
        }

        // Let the user choose duration (reuse the custom timer modal)
        FocusState.pendingLinkedTaskId = focusTaskId;
        FocusState.pendingLinkedTaskTitle = focusTaskTitle;
        setTimeout(() => {
            if (typeof openModal === 'function') {
                openModal('custom-timer-modal');
                showToast('info', 'Focus Mode', `Choose duration for: ${focusTaskTitle}`);
            }
        }, 200);
    }
}

function showFocusOverlay() {
    const overlay = document.getElementById('focus-overlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');

    // Set task name
    const taskNameEl = document.getElementById('focus-task-name');
    if (taskNameEl) {
        taskNameEl.textContent = FocusState.currentSession?.linkedTaskTitle ||
            FocusState.currentSession?.subject ||
            'Focus Session';
    }

    // Set session type badge
    const typeBadge = document.getElementById('focus-type-badge');
    if (typeBadge) {
        const type = FocusState.currentSession?.type || 'pomodoro';
        typeBadge.className = `focus-type-badge ${type}`;
        typeBadge.innerHTML = `<i class="fas ${getSessionTypeIcon(type)}"></i> ${formatSessionType(type)}`;
    }

    // Set random motivational quote
    setRandomQuote();

    // Update break indicator
    updateBreakIndicator();

    // Update session counts on overlay
    updateSessionCounts();
}

function formatSessionType(type) {
    const names = {
        'pomodoro': 'Pomodoro',
        'deep-work': 'Deep Work',
        'flow': 'Flow State',
        'custom': 'Custom'
    };
    return names[type] || 'Focus';
}

function setRandomQuote() {
    const quotes = [
        { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
        { text: "Concentrate all your thoughts upon the work at hand.", author: "Alexander Graham Bell" },
        { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
        { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
        { text: "The key to success is to focus on goals, not obstacles.", author: "Unknown" },
        { text: "Where focus goes, energy flows.", author: "Tony Robbins" },
        { text: "Starve your distractions, feed your focus.", author: "Unknown" },
        { text: "Deep work is the ability to focus without distraction.", author: "Cal Newport" },
        { text: "Your focus determines your reality.", author: "Qui-Gon Jinn" },
        { text: "The main thing is to keep the main thing the main thing.", author: "Stephen Covey" }
    ];

    const quoteEl = document.getElementById('focus-quote');
    if (quoteEl) {
        const quote = quotes[Math.floor(Math.random() * quotes.length)];
        quoteEl.innerHTML = `<span class="quote-text">"${quote.text}"</span><span class="quote-author">— ${quote.author}</span>`;
    }
}

function updateBreakIndicator() {
    const indicator = document.getElementById('pomodoro-indicator');
    if (!indicator) return;

    const completed = FocusState.completedPomodoros;
    const longBreakAt = FocusState.settings.longBreakInterval;

    let dots = '';
    for (let i = 0; i < longBreakAt; i++) {
        const filled = i < (completed % longBreakAt);
        dots += `<span class="pomodoro-dot ${filled ? 'filled' : ''}"></span>`;
    }

    indicator.innerHTML = dots;
}

// ============================================================================
// TIMER TICK & DISPLAY
// ============================================================================

// Sync focus state with chrome.storage for popup menu
function syncFocusStateToStorage() {
    if (FocusState.isActive) {
        chrome.storage.local.set({
            focusState: {
                isActive: FocusState.isActive,
                isPaused: FocusState.isPaused,
                isBreak: FocusState.isBreak,
                isOpenEnded: FocusState.isOpenEnded,
                elapsedSeconds: FocusState.elapsedSeconds,
                remainingSeconds: FocusState.remainingSeconds,
                selectedMinutes: FocusState.selectedMinutes,
                taskTitle: FocusState.currentSession?.linkedTaskTitle || null,
                boredomLevel: FocusState.currentSession?.boredomLevel ?? null,
                startTimestamp: FocusState.startTimestamp,
                endTimestamp: FocusState.endTimestamp,
                pausedRemainingSeconds: FocusState.pausedRemainingSeconds,
                pausedElapsedSeconds: FocusState.pausedElapsedSeconds
            }
        });
    } else {
        chrome.storage.local.remove('focusState');
    }
}


function timerTick() {
    if (FocusState.isPaused) return;

    const now = Date.now();

    // Handle open-ended (count-up) mode
    if (FocusState.isOpenEnded) {
        const start = FocusState.startTimestamp ?? now;
        FocusState.elapsedSeconds = Math.max(0, Math.floor((now - start) / 1000));
        updateTimerDisplay();
        // No progress ring update for open-ended mode (or could show infinite animation)

        // Sync state to storage for popup menu
        syncFocusStateToStorage();

        // Update session with current progress
        if (FocusState.currentSession) {
            FocusState.currentSession.actualDurationMinutes = Math.floor(FocusState.elapsedSeconds / 60);
        }

        // Milestone notifications (every 30 minutes)
        if (FocusState.elapsedSeconds > 0 && FocusState.elapsedSeconds % 1800 === 0) {
            const mins = FocusState.elapsedSeconds / 60;
            showNotification(`${mins} Minutes Focused!`, 'Great progress! Keep going or stop when ready.');
        }
        return;
    }

    // Standard countdown mode
    if (typeof FocusState.endTimestamp === 'number') {
        FocusState.remainingSeconds = Math.max(0, Math.ceil((FocusState.endTimestamp - now) / 1000));
    } else {
        FocusState.remainingSeconds = Math.max(0, FocusState.remainingSeconds - 1);
    }
    updateTimerDisplay();
    updateProgressRing();

    // Sync state to storage for popup menu
    syncFocusStateToStorage();

    // Update session with current progress
    if (FocusState.currentSession) {
        FocusState.currentSession.actualDurationMinutes =
            FocusState.selectedMinutes - Math.ceil(FocusState.remainingSeconds / 60);
    }

    // Check for completion
    if (FocusState.remainingSeconds <= 0) {
        if (FocusState.isBreak) {
            completeBreak();
        } else {
            completeFocusSession();
        }
    }

    // 5-minute warning
    if (FocusState.remainingSeconds === 300 && !FocusState.isBreak) {
        showNotification('5 Minutes Left', 'Keep pushing! Almost there!');
    }

    // 1-minute warning
    if (FocusState.remainingSeconds === 60 && !FocusState.isBreak) {
        showNotification('1 Minute Left', 'Final stretch!');
    }
}


function updateTimerDisplay() {
    let display;
    let timeSeconds;

    // Handle open-ended (count-up) mode
    if (FocusState.isOpenEnded) {
        timeSeconds = FocusState.elapsedSeconds;
        const hours = Math.floor(timeSeconds / 3600);
        const minutes = Math.floor((timeSeconds % 3600) / 60);
        const seconds = timeSeconds % 60;

        if (hours > 0) {
            display = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    } else {
        // Standard countdown mode
        timeSeconds = typeof FocusState.remainingSeconds === 'number' ? FocusState.remainingSeconds : 0;
        const minutes = Math.floor(timeSeconds / 60);
        const seconds = timeSeconds % 60;
        display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    const timerEl = document.getElementById('focus-time');
    if (timerEl) timerEl.textContent = display;

    // Update page title
    const prefix = FocusState.isBreak ? '☕ ' : (FocusState.isOpenEnded ? '⏱️ ' : '🎯 ');
    document.title = `${prefix}${display} - Focus Mode`;

    // Update timer color based on time remaining (only for countdown mode)
    if (!FocusState.isOpenEnded && !FocusState.isBreak && FocusState.remainingSeconds <= 60) {
        timerEl?.classList.add('ending-soon');
    } else {
        timerEl?.classList.remove('ending-soon');
    }

    // Update focus time stats in overlay
    updateFocusTimeStats();
}


/**
 * Update the elapsed time and total focus time displays in the overlay
 */
async function updateFocusTimeStats() {
    // Calculate elapsed time for current session
    let elapsedSeconds;
    if (FocusState.isOpenEnded) {
        elapsedSeconds = Math.max(0, FocusState.elapsedSeconds || 0);
    } else {
        const totalSessionSeconds = (FocusState.selectedMinutes || 0) * 60;
        const remainingSeconds = typeof FocusState.remainingSeconds === 'number' ? FocusState.remainingSeconds : 0;
        elapsedSeconds = Math.max(0, totalSessionSeconds - remainingSeconds);
    }

    // Format elapsed time
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const elapsedSecs = elapsedSeconds % 60;
    const elapsedDisplay = `${elapsedMinutes.toString().padStart(2, '0')}:${elapsedSecs.toString().padStart(2, '0')}`;

    // Update elapsed time display
    const elapsedEl = document.getElementById('focus-elapsed-time');
    if (elapsedEl) {
        elapsedEl.textContent = elapsedDisplay;
    }

    // Get total focus time for today from storage
    try {
        const todaySessions = await ProductivityData.DataStore.getTodaySessions();
        let totalTodayMinutes = 0;

        if (todaySessions && todaySessions.length > 0) {
            todaySessions.forEach(session => {
                if (!session.isBreak) {
                    totalTodayMinutes += session.actualDurationMinutes || 0;
                }
            });
        }

        // Add current session's elapsed time (not yet saved)
        if (!FocusState.isBreak && FocusState.isActive) {
            totalTodayMinutes += elapsedMinutes;
        }

        // Format total time (hours and minutes)
        const hours = Math.floor(totalTodayMinutes / 60);
        const mins = totalTodayMinutes % 60;
        let totalDisplay;
        if (hours > 0) {
            totalDisplay = `${hours}h ${mins}m`;
        } else {
            totalDisplay = `${mins}m`;
        }

        // Update total time display
        const totalEl = document.getElementById('focus-total-today');
        if (totalEl) {
            totalEl.textContent = totalDisplay;
        }
    } catch (error) {
        // Silently fail - stats are nice to have but not critical
    }
}

function updateProgressRing() {
    const circle = document.getElementById('progress-ring-circle');
    if (!circle) return;

    const totalSeconds = FocusState.selectedMinutes * 60;
    const progress = (totalSeconds - FocusState.remainingSeconds) / totalSeconds;

    const circumference = 2 * Math.PI * 120; // radius = 120
    const offset = circumference * (1 - progress);

    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = offset;

    // Change color based on progress
    if (FocusState.isBreak) {
        circle.style.stroke = '#10b981'; // Green for break
    } else if (progress > 0.9) {
        circle.style.stroke = '#ef4444'; // Red for almost done
    } else if (progress > 0.75) {
        circle.style.stroke = '#f59e0b'; // Orange
    } else {
        circle.style.stroke = '#6366f1'; // Primary color
    }
}

// ============================================================================
// TIMER CONTROLS
// ============================================================================
function pauseFocusSession() {
    setFocusPaused(!FocusState.isPaused);

    showToast(FocusState.isPaused ? 'info' : 'success',
        FocusState.isPaused ? 'Session Paused' : 'Session Resumed',
        FocusState.isPaused ? 'Take a moment, then continue!' : 'Let\'s keep going!');
}

function updatePauseButton() {
    const pauseBtn = document.getElementById('focus-pause-btn');
    if (pauseBtn) {
        pauseBtn.innerHTML = FocusState.isPaused ?
            '<i class="fas fa-play"></i>' :
            '<i class="fas fa-pause"></i>';
        pauseBtn.title = FocusState.isPaused ? 'Resume (Space)' : 'Pause (Space)';
    }
}

async function stopFocusSession() {
    if (FocusState.isStopping) return;
    FocusState.isStopping = true;

    if (!FocusState.isActive) {
        hideFocusOverlay();
        FocusState.isStopping = false;
        return;
    }

    // Stop should always stop focus mode (even during breaks).
    if (FocusState.isBreak) {
        if (FocusState.timerInterval) {
            clearInterval(FocusState.timerInterval);
            FocusState.timerInterval = null;
        }

        FocusState.isBreak = false;
        await endFocusMode();
        showToast('info', 'Focus Stopped', 'Break stopped.');
        loadFocusPage().catch(e => console.error('Failed to reload focus page:', e));
        FocusState.isStopping = false;
        return;
    }

    // Calculate elapsed time - different for open-ended mode
    let elapsedSeconds;
    let remainingSeconds = 0;
    if (FocusState.isOpenEnded) {
        if (typeof FocusState.startTimestamp === 'number') {
            elapsedSeconds = Math.max(0, Math.floor((Date.now() - FocusState.startTimestamp) / 1000));
        } else {
            elapsedSeconds = FocusState.elapsedSeconds;
        }
    } else {
        if (typeof FocusState.endTimestamp === 'number') {
            const plannedSeconds = FocusState.selectedMinutes * 60;
            remainingSeconds = Math.max(0, Math.ceil((FocusState.endTimestamp - Date.now()) / 1000));
            elapsedSeconds = plannedSeconds - remainingSeconds;
        } else {
            remainingSeconds = typeof FocusState.remainingSeconds === 'number' ? FocusState.remainingSeconds : 0;
            elapsedSeconds = (FocusState.selectedMinutes * 60) - remainingSeconds;
        }
    }
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);

    const endedEarly = !FocusState.isOpenEnded && remainingSeconds > 0;

    let addTime = true;
    let countPomodoro = false;

    // If user ends a countdown Pomodoro early, ask what to do with stats.
    if (endedEarly && elapsedMinutes >= 1) {
        // Important: hide overlay so the modal is clickable (prevents overlay intercepting clicks).
        hideFocusOverlay();
        const opts = await promptEndEarlyPomodoroOptions({
            elapsedMinutes,
            remainingMinutes: Math.ceil(remainingSeconds / 60),
            taskTitle: FocusState.currentSession?.linkedTaskTitle || FocusState.pendingLinkedTaskTitle || ''
        });
        if (!opts.confirmed) {
            // User canceled; restore overlay so they can continue.
            showFocusOverlay();
            FocusState.isStopping = false;
            return;
        }
        addTime = opts.addTime;
        countPomodoro = opts.countPomodoro;
    } else if (elapsedMinutes >= 5) {
        // Fallback confirmation for other cases where meaningful progress exists.
        if (!confirm(`You've focused for ${elapsedMinutes} minutes. End session now?`)) {
            FocusState.isStopping = false;
            return;
        }
    }

    if (FocusState.timerInterval) {
        clearInterval(FocusState.timerInterval);
        FocusState.timerInterval = null;
    }

    const shouldCountSession = FocusState.isOpenEnded ? true : countPomodoro;
    const shouldSaveAnything = (addTime && elapsedMinutes > 0) || shouldCountSession;

    // Save session (completed for open-ended, completed/interrupted for countdown based on user choice)
    if (FocusState.currentSession && elapsedMinutes > 0 && shouldSaveAnything) {
        FocusState.currentSession.status = FocusState.isOpenEnded
            ? 'completed'
            : (shouldCountSession ? 'completed' : 'interrupted');
        FocusState.currentSession.endTime = new Date().toISOString();
        FocusState.currentSession.actualDurationMinutes = elapsedMinutes;

        // Non-blocking save for faster UI response
        ProductivityData.DataStore.saveFocusSession(FocusState.currentSession).catch(e =>
            console.error('Failed to save focus session:', e)
        );

        // Update daily stats based on user choice
        if (addTime || shouldCountSession) {
            updateFocusStats_Internal(addTime ? elapsedMinutes : 0, shouldCountSession).catch(e =>
                console.error('Failed to update focus stats:', e)
            );
        }
    }

    // Cleanup (make non-blocking)
    endFocusMode().catch(e => console.error('Failed to end focus mode:', e));

    if (!shouldSaveAnything && elapsedMinutes > 0 && endedEarly) {
        showToast('info', 'Session Ended', `Not counted. (${elapsedMinutes} minutes discarded)`);
    } else {
        showToast('info', 'Session Ended', `You focused for ${elapsedMinutes} minutes.`);
    }
    loadFocusPage().catch(e => console.error('Failed to reload focus page:', e));

    FocusState.isStopping = false;
}

function promptEndEarlyPomodoroOptions({ elapsedMinutes, remainingMinutes, taskTitle }) {
    return new Promise((resolve) => {
        const safeElapsed = Math.max(1, Number.isFinite(elapsedMinutes) ? elapsedMinutes : 1);
        const safeRemaining = Math.max(1, Number.isFinite(remainingMinutes) ? remainingMinutes : 1);
        const title = taskTitle ? `“${taskTitle}”` : 'this session';

        const modal = document.createElement('div');
        modal.id = 'end-early-session-modal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-backdrop" data-action="cancel-end-early"></div>
            <div class="modal-content" style="max-width: 480px; padding: 24px;">
                <h3 style="margin-bottom: 0.5rem;">End session early?</h3>
                <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                    You’ve focused for <strong>${safeElapsed} minute${safeElapsed === 1 ? '' : 's'}</strong> on ${title}.<br>
                    <span style="font-size: 0.9rem;">${safeRemaining} minute${safeRemaining === 1 ? '' : 's'} remaining.</span>
                </p>

                <div style="display: grid; gap: 1rem; margin-bottom: 1.5rem;">
                    <label style="display:flex; gap:0.8rem; align-items:center; cursor:pointer;">
                        <input type="checkbox" id="end-early-add-time" checked />
                        <span>Add the time I spent to today’s focus time</span>
                    </label>
                    <label style="display:flex; gap:0.8rem; align-items:center; cursor:pointer;">
                        <input type="checkbox" id="end-early-count-pomo" />
                        <span>Count this Pomodoro as completed</span>
                    </label>
                </div>

                <div style="display:flex; gap: 0.75rem; justify-content:flex-end;">
                    <button class="btn-secondary" data-action="cancel-end-early">Cancel</button>
                    <button class="btn-primary" data-action="confirm-end-early">End Session</button>
                </div>
            </div>
        `;

        function cleanup() {
            modal.remove();
        }

        modal.querySelectorAll('[data-action="cancel-end-early"]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                cleanup();
                resolve({ confirmed: false, addTime: true, countPomodoro: false });
            });
        });

        modal.querySelector('[data-action="confirm-end-early"]').addEventListener('click', (e) => {
            e.preventDefault();
            const addTime = !!modal.querySelector('#end-early-add-time')?.checked;
            const countPomodoro = !!modal.querySelector('#end-early-count-pomo')?.checked;
            cleanup();
            resolve({ confirmed: true, addTime, countPomodoro });
        });

        document.body.appendChild(modal);
    });
}

window.openFocusDurationForTask = function openFocusDurationForTask(taskId, taskTitle) {
    FocusState.pendingLinkedTaskId = taskId;
    FocusState.pendingLinkedTaskTitle = taskTitle;

    const taskSelect = document.getElementById('focus-task-select');
    if (taskSelect) {
        const option = taskSelect.querySelector(`option[value="${taskId}"]`);
        if (option) taskSelect.value = taskId;
    }

    const customMinutesInput = document.getElementById('custom-focus-minutes');
    if (customMinutesInput && FocusState.selectedMinutes) {
        customMinutesInput.value = String(FocusState.selectedMinutes);
    }

    if (typeof openModal === 'function') {
        openModal('custom-timer-modal');
    }
};


async function completeFocusSession() {
    clearInterval(FocusState.timerInterval);

    // Ensure audio context is ready (may have been suspended during pause)
    try {
        window.NotificationSounds?.init?.();
    } catch (e) {
        // Ignore audio init errors
    }

    // Play completion sound
    playSound('complete');

    // Vibrate if supported
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }

    // Save completed session
    if (FocusState.currentSession) {
        FocusState.currentSession.status = 'completed';
        FocusState.currentSession.endTime = new Date().toISOString();
        FocusState.currentSession.actualDurationMinutes = FocusState.selectedMinutes;

        await ProductivityData.DataStore.saveFocusSession(FocusState.currentSession);

        // Update stats
        await updateFocusStats_Internal(FocusState.selectedMinutes, true);

        // Check for achievements
        await checkFocusAchievements();
    }

    FocusState.completedPomodoros++;

    // Award XP via motivation system
    if (window.MotivationSystem?.onFocusSessionComplete) {
        window.MotivationSystem.onFocusSessionComplete(FocusState.selectedMinutes);
    }

    // Show prominent in-app notification (appears above focus overlay)
    showFocusCompleteNotification(
        'Session Complete!',
        `Great job! You focused for ${FocusState.selectedMinutes} minutes. Time for a break!`
    );

    // Also show toast notification for visibility
    const boredomLevel = FocusState.currentSession?.boredomLevel;
    const moodNudge = (Number(boredomLevel) >= 4)
        ? ' You finished even while bored — that’s discipline.'
        : (Number(boredomLevel) <= 2 ? ' Nice — keep that rhythm going.' : ' Keep stacking wins.');

    showToast('success', '🎉 Session Complete!', `Great job! You focused for ${FocusState.selectedMinutes} minutes.${moodNudge}`);

    // Also try desktop notification
    showNotification('🎉 Session Complete!', `Great job! You focused for ${FocusState.selectedMinutes} minutes.${moodNudge}`);

    // Determine break type
    const isLongBreak = FocusState.completedPomodoros % FocusState.settings.longBreakInterval === 0;

    // Read break duration from UI select (if available) or use settings
    const breakDurationSelect = document.getElementById('break-duration');
    const userBreakDuration = breakDurationSelect ? parseInt(breakDurationSelect.value) : null;

    const breakMinutes = isLongBreak ?
        FocusState.settings.longBreakMinutes :
        (userBreakDuration || FocusState.settings.shortBreakMinutes);


    // Always prompt: break vs another session.
    // If auto-start breaks is enabled, we still show the prompt with a short countdown.
    showSessionCompleteModal(breakMinutes, isLongBreak, {
        autoStartBreak: !!FocusState.settings.autoStartBreaks,
        autoStartDelayMs: 3000
    });
}

function showBreakTransition(breakMinutes, isLongBreak) {
    // Immediately switch to break mode in state so timers remain consistent.
    FocusState.isBreak = true;
    FocusState.isPaused = true;
    FocusState.isOpenEnded = false;
    FocusState.remainingSeconds = breakMinutes * 60;
    FocusState.selectedMinutes = breakMinutes;
    FocusState.startTimestamp = Date.now();
    FocusState.endTimestamp = FocusState.startTimestamp + (breakMinutes * 60 * 1000);
    FocusState.pausedRemainingSeconds = FocusState.remainingSeconds;
    FocusState.pausedElapsedSeconds = null;

    // Sync immediately so UI/state stay aligned.
    syncFocusStateToStorage();

    // Update overlay for break mode
    const overlay = document.getElementById('focus-overlay');
    overlay?.classList.add('break-mode');

    const timerDisplay = document.getElementById('focus-time');
    if (timerDisplay) {
        timerDisplay.innerHTML = '🎉';
    }

    const taskName = document.getElementById('focus-task-name');
    if (taskName) {
        taskName.textContent = isLongBreak ? 'Long Break Time!' : 'Short Break Time!';
    }

    const quote = document.getElementById('focus-quote');
    if (quote) {
        quote.innerHTML = `<span class="quote-text">Take a ${breakMinutes}-minute break. You've earned it!</span>`;
    }

    // Auto-start break after 3 seconds
    setTimeout(() => {
        startBreak(breakMinutes);
    }, 3000);
}

function showSessionCompleteModal(breakMinutes, isLongBreak, options = {}) {
    // Hide focus overlay
    hideFocusOverlay();

    const autoStartBreak = !!options.autoStartBreak;
    const autoStartDelayMs = typeof options.autoStartDelayMs === 'number' ? options.autoStartDelayMs : 3000;
    const autoStartDelaySeconds = Math.max(1, Math.ceil(autoStartDelayMs / 1000));

    const sessionsToday = FocusState.completedPomodoros || 0;
    const sessionsTodayLabel = `${sessionsToday} session${sessionsToday === 1 ? '' : 's'} completed today`;

    // Show completion modal with options
    const modal = createModal('session-complete-modal', `
        <div class="session-complete">
            <div class="session-complete-header">
                <div class="complete-icon" aria-hidden="true">🎉</div>
                <div class="session-complete-titles">
                    <h2>Session complete</h2>
                    <p class="session-complete-meta">You focused for <strong>${FocusState.selectedMinutes} minutes</strong></p>
                </div>
            </div>

            <div class="pomodoro-count">${sessionsTodayLabel}</div>

            ${autoStartBreak ? `
                <div class="pomodoro-count" style="margin-top: 8px; opacity: 0.9;">
                    Auto-starting break in <strong><span data-break-countdown>${autoStartDelaySeconds}</span>s</strong>
                </div>
            ` : ''}
            
            <div class="break-options">
                <button class="btn-primary" data-action="take-break" data-minutes="${breakMinutes}">
                    <i class="fas fa-coffee"></i> Take ${breakMinutes}min ${isLongBreak ? 'Long' : 'Short'} Break
                </button>
                <button class="btn-secondary" data-action="start-another">
                    <i class="fas fa-play"></i> Start Another Session
                </button>
                <button class="btn-ghost" data-action="done-session">
                    <i class="fas fa-stop"></i> I'm Done for Now
                </button>
            </div>
        </div>
    `);

    let autoStartTimeout = null;
    let autoStartInterval = null;

    function clearAutoStart() {
        if (autoStartTimeout) {
            clearTimeout(autoStartTimeout);
            autoStartTimeout = null;
        }
        if (autoStartInterval) {
            clearInterval(autoStartInterval);
            autoStartInterval = null;
        }
    }

    if (autoStartBreak) {
        const countdownEl = modal.querySelector('[data-break-countdown]');
        if (countdownEl) {
            let remaining = autoStartDelaySeconds;
            autoStartInterval = setInterval(() => {
                remaining = Math.max(0, remaining - 1);
                countdownEl.textContent = String(remaining);
                if (remaining <= 0) {
                    if (autoStartInterval) {
                        clearInterval(autoStartInterval);
                        autoStartInterval = null;
                    }
                }
            }, 1000);
        }

        autoStartTimeout = setTimeout(() => {
            if (document.getElementById('session-complete-modal')) {
                startBreak(breakMinutes);
                closeModal('session-complete-modal');
            }
        }, autoStartDelayMs);
    }

    // Setup listeners
    modal.querySelector('[data-action="take-break"]')?.addEventListener('click', (e) => {
        clearAutoStart();
        const minutes = parseInt(e.currentTarget?.dataset?.minutes || breakMinutes, 10);
        startBreak(minutes);
        closeModal('session-complete-modal');
    });

    modal.querySelector('[data-action="start-another"]')?.addEventListener('click', () => {
        clearAutoStart();
        startFocusSession();
        closeModal('session-complete-modal');
    });

    modal.querySelector('[data-action="done-session"]')?.addEventListener('click', () => {
        clearAutoStart();
        closeModal('session-complete-modal');
        loadFocusPage();
    });

    openModal('session-complete-modal');
}

// ============================================================================
// BREAK FUNCTIONS
// ============================================================================
function startBreak(minutes) {
    FocusState.isBreak = true;
    FocusState.remainingSeconds = minutes * 60;
    FocusState.selectedMinutes = minutes;
    FocusState.isPaused = false;
    FocusState.isOpenEnded = false;
    FocusState.elapsedSeconds = 0;
    FocusState.startTimestamp = Date.now();
    FocusState.endTimestamp = FocusState.startTimestamp + (minutes * 60 * 1000);
    FocusState.pausedRemainingSeconds = null;
    FocusState.pausedElapsedSeconds = null;

    // Update overlay for break
    const overlay = document.getElementById('focus-overlay');
    overlay?.classList.remove('hidden');
    overlay?.classList.add('break-mode');

    const taskName = document.getElementById('focus-task-name');
    if (taskName) {
        taskName.textContent = minutes >= 15 ? '🧘 Long Break' : '☕ Short Break';
    }

    const quote = document.getElementById('focus-quote');
    if (quote) {
        const breakTips = [
            "Stand up and stretch your body",
            "Get some water and stay hydrated",
            "Look at something 20 feet away for 20 seconds",
            "Take a short walk",
            "Do some deep breathing exercises",
            "Rest your eyes - look away from screens"
        ];
        quote.innerHTML = `<span class="quote-text">${breakTips[Math.floor(Math.random() * breakTips.length)]}</span>`;
    }

    // Start break timer
    updateTimerDisplay();
    updateProgressRing();

    // Clear any existing interval before starting new one
    if (FocusState.timerInterval) {
        clearInterval(FocusState.timerInterval);
    }
    FocusState.timerInterval = setInterval(timerTick, 1000);

    // Sync state for popup menu
    syncFocusStateToStorage();

    // Play break start sound
    playSound('break-start');
}

async function completeBreak() {
    clearInterval(FocusState.timerInterval);

    // Play break end sound
    playSound('break-end');

    // Show notification
    showNotification('Break Over!', 'Ready to focus again?');

    FocusState.isBreak = false;

    // Auto-start next session or show options
    if (FocusState.settings.autoStartNextSession) {
        chrome.storage.local.get(['lastFocusDuration'], (result) => {
            const duration = result.lastFocusDuration || FocusState.selectedMinutes || 25;
            startFocusSession(duration, { skipBoredomPrompt: true });
        });
    } else {
        // Non-blocking cleanup for faster UI response
        endFocusMode().catch(e => console.error('Failed to end focus mode:', e));
        loadFocusPage().catch(e => console.error('Failed to reload focus page:', e));
        showToast('info', 'Break Complete', 'Ready for another focus session?');
    }
}

function skipBreak() {
    if (!FocusState.isBreak) return;

    clearInterval(FocusState.timerInterval);
    FocusState.isBreak = false;

    // Remove break-mode class immediately for visual feedback
    const overlay = document.getElementById('focus-overlay');
    if (overlay) {
        overlay.classList.remove('break-mode');
    }

    // Start new focus session with previously selected duration
    // Load from storage for the last used duration
    chrome.storage.local.get(['lastFocusDuration'], (result) => {
        const duration = result.lastFocusDuration || FocusState.selectedMinutes || 25;
        startFocusSession(duration, { skipBoredomPrompt: true });
    });
}

// ============================================================================
// FOCUS MODE END
// ============================================================================
async function endFocusMode() {
    // Stop timer
    if (FocusState.timerInterval) {
        clearInterval(FocusState.timerInterval);
        FocusState.timerInterval = null;
    }

    // Stop ambient sound
    stopAmbientSound();

    // Disable blocking (non-blocking; never let stop/get-stuck depend on this)
    if (FocusState.settings.blockingEnabled) {
        disableDistractionBlocking().catch(() => void 0);
    }

    // Hide overlay
    hideFocusOverlay();

    // Reset state
    FocusState.isActive = false;
    FocusState.isPaused = false;
    FocusState.isBreak = false;
    FocusState.isOpenEnded = false;
    FocusState.elapsedSeconds = 0;
    FocusState.remainingSeconds = 0;
    FocusState.startTimestamp = null;
    FocusState.endTimestamp = null;
    FocusState.pausedRemainingSeconds = null;
    FocusState.pausedElapsedSeconds = null;
    FocusState.currentSession = null;

    // Clear focus state from storage so popup knows session ended
    chrome.storage.local.remove(['focusState', 'focusSession']);

    // Reset page title
    document.title = 'Student Productivity Hub';
}

function hideFocusOverlay() {
    const overlay = document.getElementById('focus-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('break-mode', 'paused');
    }
}

// ============================================================================
// AMBIENT SOUNDS
// ============================================================================
function startAmbientSound(type) {
    stopAmbientSound();

    FocusState.currentSoundType = type;

    // Create audio context for generating ambient sounds
    if (!FocusState.audioContext) {
        FocusState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // For demo, using oscillator-based sounds
    // In production, would load actual audio files
    switch (type) {
        case 'rain':
            createRainSound();
            break;
        case 'whitenoise':
            createWhiteNoiseSound();
            break;
        case 'lofi':
            // Would load actual lo-fi music
            showToast('info', 'Sound', 'Lo-fi music would play here');
            break;
        case 'nature':
            createNatureSound();
            break;
        case 'cafe':
            // Would load actual cafe ambience
            showToast('info', 'Sound', 'Cafe ambience would play here');
            break;
    }
}

function createWhiteNoiseSound() {
    const ctx = FocusState.audioContext;
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const gainNode = ctx.createGain();
    gainNode.gain.value = FocusState.soundVolume * 0.1;

    whiteNoise.connect(gainNode);
    gainNode.connect(ctx.destination);
    whiteNoise.start();

    FocusState.ambientSound = whiteNoise;
    FocusState.gainNode = gainNode;
}

function createRainSound() {
    // Simplified rain sound using filtered noise
    createWhiteNoiseSound();
    // In production, would use actual rain audio
}

function createNatureSound() {
    // Simplified nature sound
    createWhiteNoiseSound();
    // In production, would use actual nature audio
}

function stopAmbientSound() {
    if (FocusState.ambientSound) {
        try {
            FocusState.ambientSound.stop();
        } catch (e) {
            // Already stopped
        }
        FocusState.ambientSound = null;
    }
    FocusState.currentSoundType = null;
}

function setAmbientVolume(volume) {
    FocusState.soundVolume = volume;
    if (FocusState.gainNode) {
        FocusState.gainNode.gain.value = volume * 0.1;
    }
}

// ============================================================================
// SOUNDS
// ============================================================================
function playSound(type) {
    if (!FocusState.settings.soundEnabled) return;

    const sounds = {
        'complete': [523.25, 659.25, 783.99], // C5, E5, G5 - triumphant chord
        'break-start': [440, 554.37], // A4, C#5
        'break-end': [523.25, 392], // C5, G4
        'tick': [800],
        'warning': [440, 440]
    };

    const frequencies = sounds[type];
    if (!frequencies) return;

    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();

        frequencies.forEach((freq, i) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.frequency.value = freq;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

            oscillator.start(ctx.currentTime + i * 0.15);
            oscillator.stop(ctx.currentTime + 0.5 + i * 0.15);
        });
    } catch (e) {
        // Debug removed
    }
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================
function showNotification(title, body) {
    if (!FocusState.settings.notificationsEnabled) return;

    // Try chrome.notifications first (works better in extension context)
    if (chrome?.notifications?.create) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon48.png'),
            title: title,
            message: body,
            priority: 2,
            requireInteraction: false
        }).catch(() => {
            // Fallback to web Notification API
            showWebNotification(title, body);
        });
    } else {
        showWebNotification(title, body);
    }
}

/**
 * Show a forced notification for focus session completion
 * This appears ON TOP of everything including the focus overlay
 */
function showFocusCompleteNotification(title, message) {
    // Remove any existing notification
    const existingNotif = document.getElementById('focus-complete-notification');
    if (existingNotif) existingNotif.remove();

    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'focus-complete-notification';
    notification.innerHTML = `
        <div class="focus-complete-icon">🎉</div>
        <div class="focus-complete-content">
            <div class="focus-complete-title">${title}</div>
            <div class="focus-complete-message">${message}</div>
        </div>
        <button class="focus-complete-close">&times;</button>
    `;

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        border-radius: 16px;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 10px 40px rgba(16, 185, 129, 0.4), 0 0 0 4px rgba(16, 185, 129, 0.2);
        max-width: 400px;
        animation: focusNotifSlideIn 0.5s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Add animation keyframes if not exists
    if (!document.getElementById('focus-notif-styles')) {
        const style = document.createElement('style');
        style.id = 'focus-notif-styles';
        style.textContent = `
            @keyframes focusNotifSlideIn {
                from { transform: translateX(120%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes focusNotifSlideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(120%); opacity: 0; }
            }
            #focus-complete-notification .focus-complete-icon {
                font-size: 2rem;
                flex-shrink: 0;
            }
            #focus-complete-notification .focus-complete-content {
                flex: 1;
            }
            #focus-complete-notification .focus-complete-title {
                font-weight: 700;
                font-size: 1.1rem;
                margin-bottom: 4px;
            }
            #focus-complete-notification .focus-complete-message {
                font-size: 0.9rem;
                opacity: 0.9;
            }
            #focus-complete-notification .focus-complete-close {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 1.2rem;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            }
            #focus-complete-notification .focus-complete-close:hover {
                background: rgba(255,255,255,0.3);
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Close button handler
    const closeBtn = notification.querySelector('.focus-complete-close');
    closeBtn.addEventListener('click', () => {
        notification.style.animation = 'focusNotifSlideOut 0.3s ease-in forwards';
        setTimeout(() => notification.remove(), 300);
    });

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.style.animation = 'focusNotifSlideOut 0.3s ease-in forwards';
            setTimeout(() => notification.remove(), 300);
        }
    }, 8000);
}

function showWebNotification(title, body) {
    // Fallback: use standard web Notification API
    if (Notification.permission === 'granted') {
        new Notification(title, {
            body,
            icon: '/icons/icon48.png',
            badge: '/icons/icon48.png',
            silent: false
        });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showWebNotification(title, body);
            }
        });
    }
}

async function requestNotificationPermission() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        FocusState.settings.notificationsEnabled = permission === 'granted';
        return permission === 'granted';
    }
    return false;
}

// ============================================================================
// DISTRACTION BLOCKING
// ============================================================================
async function enableDistractionBlocking() {
    try {
        await chrome.runtime.sendMessage({
            type: 'ENABLE_FOCUS_BLOCKING',
            duration: FocusState.selectedMinutes
        });
    } catch (e) {
        // Debug removed
    }
}

async function disableDistractionBlocking() {
    try {
        await chrome.runtime.sendMessage({
            type: 'DISABLE_FOCUS_BLOCKING'
        });
    } catch (e) {
        // Debug removed
    }
}

// ============================================================================
// STATS & ACHIEVEMENTS
// ============================================================================
async function updateFocusStats_Internal(minutes, completed) {
    try {
        const stats = await ProductivityData.DataStore.getDailyStats();
        stats.focusMinutes = (stats.focusMinutes || 0) + minutes;
        if (completed) {
            stats.focusSessions = (stats.focusSessions || 0) + 1;
        }
        await ProductivityData.DataStore.saveDailyStats(stats);

        // Update streak - getStreakData returns a StreakData object with updateStreak method
        const streakData = await ProductivityData.DataStore.getStreakData();
        if (streakData && typeof streakData.updateStreak === 'function') {
            streakData.updateStreak(null, true); // true = was productive
            await ProductivityData.DataStore.saveStreakData(streakData);
        }
    } catch (e) {
        console.error('Failed to update focus stats:', e);
    }
}

async function checkFocusAchievements() {
    const stats = await ProductivityData.DataStore.getDailyStats();
    const streakData = await ProductivityData.DataStore.getStreakData();

    const achievements = [];

    // First session
    if (stats.focusSessions === 1) {
        achievements.push('first_focus');
    }

    // 4 sessions (full pomodoro cycle)
    if (stats.focusSessions === 4) {
        achievements.push('pomodoro_master');
    }

    // 8 hours in a day
    if (stats.focusMinutes >= 480) {
        achievements.push('marathon_focus');
    }

    // 7-day streak
    if (streakData.currentStreak === 7) {
        achievements.push('week_warrior');
    }

    // 30-day streak
    if (streakData.currentStreak === 30) {
        achievements.push('consistency_king');
    }

    // Unlock achievements
    for (const achievement of achievements) {
        await ProductivityData.DataStore.unlockAchievement(achievement);
        // Show achievement notification
        showToast('success', '🏆 Achievement Unlocked!', `You earned: ${achievement.replace(/_/g, ' ')}`);
    }
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================
function setupFocusKeyboardShortcuts() {
    document.addEventListener('keydown', handleFocusKeypress);
}

function handleFocusKeypress(e) {
    // Only handle if focus overlay is visible
    const overlay = document.getElementById('focus-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            pauseFocusSession();
            break;
        case 'Escape':
            e.preventDefault();
            if (confirm('End focus session?')) {
                stopFocusSession();
            }
            break;
        case 'KeyM':
            e.preventDefault();
            FocusState.settings.soundEnabled = !FocusState.settings.soundEnabled;
            showToast('info', 'Sound', FocusState.settings.soundEnabled ? 'Enabled' : 'Muted');
            break;
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
// escapeHtml is now provided by utils.js

function createModal(id, content) {
    let modal = document.getElementById(id);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-backdrop" data-modal-close="${id}"></div>
        <div class="modal-content">
            ${content}
        </div>
    `;

    // Add backdrop click listener
    modal.querySelector(`[data-modal-close="${id}"]`)?.addEventListener('click', () => {
        closeModal(id);
    });

    return modal;
}

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Load last used duration FIRST before setting up any listeners
    if (chrome.storage && chrome.storage.local) {
        try {
            const result = await new Promise(resolve =>
                chrome.storage.local.get(['lastFocusDuration'], resolve)
            );
            if (result.lastFocusDuration) {
                FocusState.selectedMinutes = result.lastFocusDuration;
            }
        } catch (e) {
            console.error('Failed to load focus duration:', e);
        }
    }

    // Update UI with loaded value
    updateTimerPresetsUI();
    const previewEl = document.getElementById('timer-preview');
    if (previewEl) previewEl.textContent = `${FocusState.selectedMinutes}:00`;
    const timerEl = document.getElementById('focus-time');
    if (timerEl && !FocusState.isActive) {
        timerEl.textContent = `${String(FocusState.selectedMinutes).padStart(2, '0')}:00`;
    }

    // Timer preset buttons (both old and new design)
    document.querySelectorAll('.timer-option:not(.custom), .timer-option-card:not(.custom)').forEach(btn => {
        btn.addEventListener('click', () => {
            const minutes = parseInt(btn.dataset.minutes);
            selectTimerPreset(minutes);
        });

        // Double-click to start
        btn.addEventListener('dblclick', () => {
            const minutes = parseInt(btn.dataset.minutes);
            startFocusSession(minutes);
        });
    });

    // Custom timer button
    document.getElementById('custom-timer-btn')?.addEventListener('click', () => {
        openModal('custom-timer-modal');
    });

    document.getElementById('start-custom-timer-btn')?.addEventListener('click', () => {
        const minutes = parseInt(document.getElementById('custom-focus-minutes')?.value) || 25;
        closeAllModals();
        startFocusSession(minutes);
    });

    // Free Focus button (open-ended timer)
    const freeFocusBtn = document.getElementById('free-focus-btn');
    if (freeFocusBtn) {
        freeFocusBtn.addEventListener('click', () => {
            // Clear all other selections
            document.querySelectorAll('.timer-option-card').forEach(b => {
                b.classList.remove('selected', 'active');
            });
            freeFocusBtn.classList.add('selected');
        });

        freeFocusBtn.addEventListener('dblclick', () => {
            startOpenEndedSession();
        });
    }

    // Start focus button
    document.getElementById('start-focus-btn')?.addEventListener('click', () => {
        // Check if Free Focus is selected
        if (document.getElementById('free-focus-btn')?.classList.contains('selected')) {
            startOpenEndedSession();
        } else {
            startFocusSession();
        }
    });


    // Focus overlay controls
    document.getElementById('focus-pause-btn')?.addEventListener('click', pauseFocusSession);
    document.getElementById('focus-stop-btn')?.addEventListener('click', stopFocusSession);
    document.getElementById('focus-skip-break-btn')?.addEventListener('click', skipBreak);
    document.getElementById('focus-overlay-toggle-btn')?.addEventListener('click', toggleFocusBorderDirectly);

    // Ambient sound selector
    document.getElementById('ambient-sound-select')?.addEventListener('change', (e) => {
        if (FocusState.isActive) {
            if (e.target.value) {
                startAmbientSound(e.target.value);
            } else {
                stopAmbientSound();
            }
        }
    });

    // Volume control
    document.getElementById('ambient-volume')?.addEventListener('input', (e) => {
        setAmbientVolume(parseFloat(e.target.value));
    });

    // Request notification permission on first interaction
    document.body.addEventListener('click', () => {
        if ('Notification' in window && Notification.permission === 'default') {
            requestNotificationPermission();
        }
    }, { once: true });

    // ========================================================================
    // Focus Settings (In Session Settings)
    // ========================================================================
    const breakDurationSelect = document.getElementById('break-duration');
    const autoStartBreaksCheckbox = document.getElementById('focus-auto-breaks');
    const autoStartNextCheckbox = document.getElementById('focus-auto-next');

    // Load current settings
    let settings;
    try {
        settings = await window.ProductivityData?.DataStore?.getSettings();
    } catch (e) {
        settings = null;
    }

    if (breakDurationSelect) {
        breakDurationSelect.value = String(settings?.defaultBreakDuration || FocusState.settings.shortBreakMinutes || 5);
    }
    if (autoStartBreaksCheckbox) {
        autoStartBreaksCheckbox.checked = settings?.autoStartBreaks === true;
    }
    if (autoStartNextCheckbox) {
        autoStartNextCheckbox.checked = settings?.autoStartFocus === true;
    }

    // Auto-save on change
    const saveFocusSettings = async () => {
        const defaultBreakDuration = parseInt(breakDurationSelect?.value, 10) || 5;
        const autoStartBreaks = autoStartBreaksCheckbox?.checked === true;
        const autoStartFocus = autoStartNextCheckbox?.checked === true;

        // Update live FocusState so behavior changes immediately
        FocusState.settings.shortBreakMinutes = defaultBreakDuration;
        FocusState.settings.autoStartBreaks = autoStartBreaks;
        FocusState.settings.autoStartNextSession = autoStartFocus;
        FocusState.breakMinutes = defaultBreakDuration;

        // Persist into UserSettings
        try {
            const current = await window.ProductivityData?.DataStore?.getSettings();
            if (current) {
                current.defaultBreakDuration = defaultBreakDuration;
                current.autoStartBreaks = autoStartBreaks;
                current.autoStartFocus = autoStartFocus;
                await window.ProductivityData?.DataStore?.saveSettings(current);
            }
        } catch (e) {
            console.warn('Failed to save focus settings:', e);
        }
    };

    // Add change listeners for auto-save
    breakDurationSelect?.addEventListener('change', saveFocusSettings);
    autoStartBreaksCheckbox?.addEventListener('change', saveFocusSettings);
    autoStartNextCheckbox?.addEventListener('change', saveFocusSettings);
});

// Toggle overlay settings panel from the focus overlay button
function toggleOverlaySettings() {
    const customization = document.getElementById('overlay-customization');
    const focusSection = document.querySelector('[data-section="focus"]');

    if (customization) {
        const isCurrentlyVisible = customization.style.display === 'block';
        customization.style.display = isCurrentlyVisible ? 'none' : 'block';

        // Scroll to the customization panel if opening it
        if (!isCurrentlyVisible) {
            customization.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

    }
}

// Direct toggle for the border visibility without opening settings
function toggleFocusBorderDirectly() {
    FocusState.overlaySettings.enabled = !FocusState.overlaySettings.enabled;

    // Update local state and save
    saveOverlaySettings();

    // Update UI immediately
    const overlay = document.getElementById('focus-overlay');
    if (overlay) {
        if (FocusState.overlaySettings.enabled) {
            overlay.style.border = `${FocusState.overlaySettings.width}px ${FocusState.overlaySettings.style} ${FocusState.overlaySettings.color}`;
        } else {
            overlay.style.border = 'none';
        }

        showToast('info', 'Screen Border', FocusState.overlaySettings.enabled ? 'Enabled' : 'Disabled');
    }
}

function saveOverlaySettings() {
    chrome.storage.local.set({ focusOverlaySettings: FocusState.overlaySettings });
    // Also notify content script if needed
    try {
        chrome.runtime.sendMessage({
            type: 'UPDATE_FOCUS_OVERLAY',
            settings: FocusState.overlaySettings
        });
    } catch (e) {
        // Content script might not be listening
    }
}

// ============================================================================
// FOCUS OVERLAY SETTINGS
// ============================================================================

function initOverlaySettingsUI() {
    const settings = FocusState.overlaySettings;

    // Normalize any legacy custom color to the fixed palette
    try {
        if (typeof normalizePaletteColor === 'function') {
            const normalized = normalizePaletteColor(settings.color || '#6366f1');
            if (normalized !== settings.color) {
                FocusState.overlaySettings.color = normalized;
                saveOverlaySettings();
            }
        }
    } catch (e) {
        // non-fatal
    }

    // Set initial toggle state
    const enabledToggle = document.getElementById('focus-overlay-enabled');
    if (enabledToggle) {
        enabledToggle.checked = settings.enabled;
    }

    // Settings toggle button
    const settingsToggle = document.getElementById('overlay-settings-toggle');
    const customization = document.getElementById('overlay-customization');

    if (settingsToggle && customization) {
        // Ensure initial state is hidden
        customization.style.display = 'none';

        // Remove any existing onclick handler and set new one
        settingsToggle.onclick = null;
        settingsToggle.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            const isCurrentlyVisible = customization.style.display === 'block';
            customization.style.display = isCurrentlyVisible ? 'none' : 'block';
            this.classList.toggle('active', !isCurrentlyVisible);
        };
    }

    // Color presets
    document.querySelectorAll('.color-preset:not(.custom)').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            FocusState.overlaySettings.color = btn.dataset.color;
            updateOverlayPreview();
            saveOverlaySettings();
        });

        // Set active state if matches current color
        if (btn.dataset.color === settings.color) {
            document.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
    });

    // No native custom color picker (palette-only)

    // Style options
    document.querySelectorAll('.style-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.style-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            FocusState.overlaySettings.style = btn.dataset.style;
            updateOverlayPreview();
            saveOverlaySettings();
        });

        if (btn.dataset.style === settings.style) {
            document.querySelectorAll('.style-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
    });

    // Width slider
    const widthSlider = document.getElementById('overlay-width');
    const widthValue = document.getElementById('overlay-width-value');
    if (widthSlider && widthValue) {
        widthSlider.value = settings.width;
        widthValue.textContent = settings.width;
        widthSlider.addEventListener('input', () => {
            widthValue.textContent = widthSlider.value;
            FocusState.overlaySettings.width = parseInt(widthSlider.value);
            updateOverlayPreview();
            saveOverlaySettings();
        });
    }

    // Opacity slider
    const opacitySlider = document.getElementById('overlay-opacity');
    const opacityValue = document.getElementById('overlay-opacity-value');
    if (opacitySlider && opacityValue) {
        opacitySlider.value = Math.round(settings.opacity * 100);
        opacityValue.textContent = Math.round(settings.opacity * 100);
        opacitySlider.addEventListener('input', () => {
            opacityValue.textContent = opacitySlider.value;
            FocusState.overlaySettings.opacity = parseInt(opacitySlider.value) / 100;
            updateOverlayPreview();
            saveOverlaySettings();
        });
    }

    // Enable toggle
    if (enabledToggle) {
        enabledToggle.addEventListener('change', () => {
            FocusState.overlaySettings.enabled = enabledToggle.checked;
            saveOverlaySettings();
        });
    }

    // Initial preview
    updateOverlayPreview();
}

function updateOverlayPreview() {
    const previewBox = document.getElementById('overlay-preview-box');
    if (!previewBox) return;

    const { color, opacity, width, style } = FocusState.overlaySettings;
    const rgba = hexToRgba(color, opacity);

    if (style === 'glow') {
        previewBox.style.border = 'none';
        previewBox.style.boxShadow = `
            inset 0 0 ${width * 2}px ${rgba},
            inset 0 0 ${width * 4}px ${hexToRgba(color, opacity * 0.5)}
        `;
    } else {
        const borderStyle = style === 'dashed' ? 'dashed' : 'solid';
        previewBox.style.border = `${width}px ${borderStyle} ${rgba}`;
        previewBox.style.boxShadow = 'none';
    }
}

function hexToRgba(hex, opacity) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

async function saveOverlaySettings() {
    await chrome.storage.local.set({
        focusOverlaySettings: FocusState.overlaySettings
    });
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================
window.loadFocusPage = loadFocusPage;
window.startFocusSession = startFocusSession;
window.pauseFocusSession = pauseFocusSession;
window.resumeFocusSession = typeof resumeFocusSession !== 'undefined' ? resumeFocusSession : pauseFocusSession;
window.stopFocusSession = stopFocusSession;
window.skipBreak = skipBreak;
window.checkAutoStartFromTask = checkAutoStartFromTask;
window.openFocusSettings = typeof openFocusSettings !== 'undefined' ? openFocusSettings : function () { };
window.closeFocusSettings = typeof closeFocusSettings !== 'undefined' ? closeFocusSettings : function () { };
window.saveFocusSettings = typeof saveFocusSettings !== 'undefined' ? saveFocusSettings : function () { };
window.openFocusHistory = typeof openFocusHistory !== 'undefined' ? openFocusHistory : function () { };
window.closeFocusHistory = typeof closeFocusHistory !== 'undefined' ? closeFocusHistory : function () { };
window.startAmbientSound = startAmbientSound;
window.stopAmbientSound = stopAmbientSound;
window.setAmbientVolume = setAmbientVolume;

// ============================================================================
// RESTORE ON APP LOAD
// ============================================================================
// Previously, active-session restore only ran when navigating to the Focus page.
// Run it once on app load so the overlay/restore prompt works from any page.
(function restoreFocusSessionOnLoad() {
    const run = () => {
        try {
            if (typeof checkActiveSession === 'function') {
                checkActiveSession();
            }
        } catch (e) {
            // Ignore restore errors
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();

// ============================================================================
// POPUP MENU MESSAGE HANDLING
// ============================================================================
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'FOCUS_PAUSE_TOGGLE') {
            if (FocusState.isActive) {
                if (request.isPaused) {
                    pauseFocusSession();
                } else {
                    resumeFocusSession();
                }
            }
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'FOCUS_STOP') {
            if (FocusState.isActive) {
                stopFocusSession();
            }
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'FOCUS_STARTED') {
            // Popup started a quick focus - sync the hub UI to show the active session
            if (!FocusState.isActive && request.duration) {
                // Update local state to reflect the popup-started session
                FocusState.isActive = true;
                FocusState.isPaused = false;
                FocusState.selectedMinutes = request.duration;
                FocusState.remainingSeconds = request.duration * 60;

                if (request.taskTitle) {
                    FocusState.currentSession = {
                        linkedTaskTitle: request.taskTitle,
                        linkedTaskId: request.taskId
                    };
                }

                // Update UI to show active session
                showFocusOverlay();
                updateTimerDisplay();

                // Start timer interval if not already running
                if (!FocusState.timerInterval) {
                    FocusState.timerInterval = setInterval(timerTick, 1000);
                }
            }
            sendResponse({ success: true });
            return true;
        }
    });
}

// Listen for storage changes to sync focus state from popup
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        // If focusState changed and we're not the one who changed it
        if (changes.focusState) {
            const newState = changes.focusState.newValue;

            // If a session was started elsewhere and we're not active
            if (newState && newState.isActive && !FocusState.isActive) {
                FocusState.isActive = true;
                FocusState.isPaused = newState.isPaused || false;
                FocusState.selectedMinutes = newState.selectedMinutes;
                FocusState.remainingSeconds = newState.remainingSeconds;

                showFocusOverlay();
                updateTimerDisplay();

                if (!FocusState.timerInterval) {
                    FocusState.timerInterval = setInterval(timerTick, 1000);
                }
            }
            // If session was stopped elsewhere
            else if (!newState && FocusState.isActive) {
                hideFocusOverlay();
                if (FocusState.timerInterval) {
                    clearInterval(FocusState.timerInterval);
                    FocusState.timerInterval = null;
                }
                FocusState.isActive = false;
            }
            // If pause state changed
            else if (newState && newState.isPaused !== FocusState.isPaused) {
                FocusState.isPaused = newState.isPaused;
                updatePauseButton();
            }
        }
    });
}

// ============================================================================
// PAGE CLEANUP - Prevent memory leaks
// ============================================================================
window.addEventListener('beforeunload', () => {
    // Clear timer interval when navigating away
    if (FocusState.timerInterval) {
        clearInterval(FocusState.timerInterval);
        FocusState.timerInterval = null;
    }

    // Stop ambient sounds
    if (FocusState.ambientSound) {
        FocusState.ambientSound.pause();
        FocusState.ambientSound = null;
    }
});

// Also handle visibility change to pause/resume efficiently
document.addEventListener('visibilitychange', () => {
    if (document.hidden && FocusState.isActive) {
        // Page is hidden - the background timer will continue managing state
        // We can optionally stop our local interval since background handles it
    }
});
