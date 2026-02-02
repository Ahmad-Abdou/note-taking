// Track the selected quick focus duration (default 25 min)
let selectedQuickFocusDuration = 25;

document.addEventListener('DOMContentLoaded', () => {
    loadFocusStatus();
    loadTodaysTasks();
    loadOverdueTasks();
    setupQuickAddTask();

    document.getElementById('open-productivity-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: 'productivity/index.html' });
    });

    // Extension Settings Button
    document.getElementById('open-settings-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Quick Focus buttons (mini version in fallback)
    document.querySelectorAll('.focus-time-btn-mini:not(#start-custom-focus):not(.free-focus-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            const minutes = parseInt(btn.dataset.minutes);
            if (minutes) {
                // Store the selected duration for task focus
                selectedQuickFocusDuration = minutes;
                // Update UI to show selected state
                updateQuickFocusSelection(btn);
                // Show task selector modal instead of starting immediately
                showTaskSelectorModal(minutes);
            }
        });
    });

    // Free Focus button (open-ended timer)
    document.getElementById('free-focus-popup-btn')?.addEventListener('click', () => {
        startFreeFocus();
    });

    // Custom focus timer input
    document.getElementById('start-custom-focus')?.addEventListener('click', () => {
        const input = document.getElementById('custom-focus-minutes');
        const minutes = parseInt(input?.value);
        if (minutes && minutes > 0 && minutes <= 180) {
            // Store the selected duration
            selectedQuickFocusDuration = minutes;
            // Show task selector modal
            showTaskSelectorModal(minutes);
        } else {
            input.style.borderColor = '#ef4444';
            setTimeout(() => input.style.borderColor = '', 1000);
        }
    });

    // Allow Enter key to start custom focus
    document.getElementById('custom-focus-minutes')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('start-custom-focus')?.click();
        }
    });

    // Pause focus button - handle both popup and hub sessions
    document.getElementById('pause-focus-btn')?.addEventListener('click', () => {
        chrome.storage.local.get(['focusSession', 'focusState'], (result) => {
            // If hub session is active, toggle its pause state
            if (result.focusState && result.focusState.isActive) {
                const state = result.focusState;
                state.isPaused = !state.isPaused;

                const now = Date.now();
                if (state.isOpenEnded) {
                    if (state.isPaused) {
                        state.pausedElapsedSeconds = typeof state.startTimestamp === 'number'
                            ? Math.max(0, Math.floor((now - state.startTimestamp) / 1000))
                            : (state.elapsedSeconds || 0);
                    } else {
                        const elapsed = state.pausedElapsedSeconds ?? state.elapsedSeconds ?? 0;
                        state.startTimestamp = now - (elapsed * 1000);
                        state.pausedElapsedSeconds = null;
                    }
                } else {
                    if (state.isPaused) {
                        const remaining = (typeof state.endTimestamp === 'number')
                            ? Math.max(0, Math.ceil((state.endTimestamp - now) / 1000))
                            : (state.remainingSeconds || 0);
                        state.remainingSeconds = remaining;
                        state.pausedRemainingSeconds = remaining;
                        state.endTimestamp = null;
                    } else {
                        const remaining = typeof state.pausedRemainingSeconds === 'number'
                            ? state.pausedRemainingSeconds
                            : (state.remainingSeconds || 0);
                        state.remainingSeconds = remaining;
                        state.endTimestamp = now + (remaining * 1000);
                        state.startTimestamp = now - (((state.selectedMinutes || 0) * 60 - remaining) * 1000);
                        state.pausedRemainingSeconds = null;
                    }
                }

                // Also update focusSession if it exists
                const session = result.focusSession || {};
                session.isPaused = state.isPaused;
                if (state.isPaused) {
                    session.pausedAt = Date.now();
                } else if (session.pausedAt) {
                    session.pausedTime = (session.pausedTime || 0) + (Date.now() - session.pausedAt);
                    delete session.pausedAt;
                }

                chrome.storage.local.set({ focusState: state, focusSession: session });

                // Also notify productivity hub if open
                chrome.runtime.sendMessage({
                    action: 'FOCUS_PAUSE_TOGGLE',
                    isPaused: state.isPaused
                }).catch(() => { });

                updateFocusUI({
                    isActive: true,
                    isPaused: state.isPaused,
                    remainingSeconds: state.remainingSeconds,
                    taskTitle: state.taskTitle,
                    isOpenEnded: state.isOpenEnded || false,
                    elapsedSeconds: state.elapsedSeconds || 0,
                    startTimestamp: state.startTimestamp,
                    endTimestamp: state.endTimestamp,
                    pausedRemainingSeconds: state.pausedRemainingSeconds,
                    pausedElapsedSeconds: state.pausedElapsedSeconds
                });
            }
            // Otherwise handle popup-created session
            else if (result.focusSession) {
                const session = result.focusSession;
                session.isPaused = !session.isPaused;
                if (session.isPaused) {
                    session.pausedAt = Date.now();
                } else if (session.pausedAt) {
                    session.pausedTime = (session.pausedTime || 0) + (Date.now() - session.pausedAt);
                    delete session.pausedAt;
                }

                // Also update focusState for content script overlay
                const focusState = result.focusState || {
                    isActive: true,
                    remainingSeconds: session.duration * 60,
                    selectedMinutes: session.duration,
                    taskTitle: session.taskTitle
                };
                focusState.isPaused = session.isPaused;

                const now = Date.now();
                if (typeof focusState.startTimestamp !== 'number') {
                    focusState.startTimestamp = session.startTime || now;
                }

                if (session.isOpenEnded || focusState.isOpenEnded) {
                    focusState.isOpenEnded = true;
                    if (focusState.isPaused) {
                        focusState.pausedElapsedSeconds = Math.max(0, Math.floor((now - focusState.startTimestamp) / 1000));
                    } else {
                        const elapsed = focusState.pausedElapsedSeconds ?? focusState.elapsedSeconds ?? 0;
                        focusState.startTimestamp = now - (elapsed * 1000);
                        focusState.pausedElapsedSeconds = null;
                    }
                } else {
                    focusState.isOpenEnded = false;

                    if (typeof focusState.endTimestamp !== 'number') {
                        focusState.endTimestamp = focusState.startTimestamp + (session.duration * 60 * 1000);
                    }

                    if (focusState.isPaused) {
                        const remaining = Math.max(0, Math.ceil((focusState.endTimestamp - now) / 1000));
                        focusState.remainingSeconds = remaining;
                        focusState.pausedRemainingSeconds = remaining;
                        focusState.endTimestamp = null;
                    } else {
                        const remaining = typeof focusState.pausedRemainingSeconds === 'number'
                            ? focusState.pausedRemainingSeconds
                            : (focusState.remainingSeconds || session.duration * 60);
                        focusState.remainingSeconds = remaining;
                        focusState.endTimestamp = now + (remaining * 1000);
                        focusState.startTimestamp = now - ((session.duration * 60 - remaining) * 1000);
                        focusState.pausedRemainingSeconds = null;
                    }
                }

                chrome.storage.local.set({ focusSession: session, focusState: focusState });
                updateFocusUI({
                    isActive: true,
                    isPaused: focusState.isPaused || false,
                    duration: focusState.selectedMinutes || session.duration,
                    remainingSeconds: focusState.remainingSeconds,
                    taskTitle: focusState.taskTitle || session.taskTitle || null,
                    isOpenEnded: focusState.isOpenEnded || false,
                    elapsedSeconds: focusState.elapsedSeconds || 0,
                    startTimestamp: focusState.startTimestamp,
                    endTimestamp: focusState.endTimestamp,
                    pausedRemainingSeconds: focusState.pausedRemainingSeconds,
                    pausedElapsedSeconds: focusState.pausedElapsedSeconds
                });
            }
        });
    });

    // Stop focus button - handle both popup and hub sessions
    document.getElementById('stop-focus-btn')?.addEventListener('click', () => {
        chrome.storage.local.get(['focusSession', 'focusState'], (result) => {
            const state = result.focusState;

            // Always confirm the end.
            if (!confirm('End this focus session?')) return;

            let countPomodoro = false;
            let addTime = true;

            // If it's a countdown Pomodoro ended early, ask whether to count it and whether to add elapsed time.
            if (state?.isActive && !state.isOpenEnded) {
                const totalSeconds = (state.selectedMinutes || 0) * 60;
                let remainingSeconds = state.remainingSeconds || 0;
                const now = Date.now();

                if (state.isPaused) {
                    if (typeof state.pausedRemainingSeconds === 'number') {
                        remainingSeconds = state.pausedRemainingSeconds;
                    }
                } else if (typeof state.endTimestamp === 'number') {
                    remainingSeconds = Math.max(0, Math.ceil((state.endTimestamp - now) / 1000));
                }

                const elapsedSeconds = Math.max(0, totalSeconds - remainingSeconds);
                const elapsedMinutes = Math.floor(elapsedSeconds / 60);
                const endedEarly = remainingSeconds > 0;

                if (endedEarly && elapsedMinutes >= 1) {
                    countPomodoro = confirm('Count this Pomodoro as completed?');
                    addTime = confirm(`Add ${elapsedMinutes} minute${elapsedMinutes === 1 ? '' : 's'} to today's focus time?`);
                }
            }

            // Use FOCUS_STOP_WITH_SAVE to save session stats before clearing.
            chrome.runtime.sendMessage({ action: 'FOCUS_STOP_WITH_SAVE', countPomodoro, addTime }).catch(() => {
                // Fallback: if message fails, clear storage manually
                chrome.storage.local.remove(['focusSession', 'focusState']);
            });

            document.getElementById('focus-status').style.display = 'none';
            document.getElementById('todays-tasks').style.display = 'block';
        });
    });
});

// Focus Session Functions
function loadFocusStatus() {
    // Check both popup's focusSession and productivity hub's focusState
    chrome.storage.local.get(['focusSession', 'focusState', 'productivity_daily_stats'], (result) => {
        const popupSession = result.focusSession;
        const hubState = result.focusState;

        // Load and display today's sessions count
        loadTodaysSessionsCount(result.productivity_daily_stats);

        // Check if either has an active session
        if ((popupSession && popupSession.isActive) || (hubState && hubState.isActive)) {
            // Prefer hub state if available and active
            if (hubState && hubState.isActive) {
                // Convert hub state to popup format for display
                const displaySession = {
                    isActive: true,
                    isPaused: hubState.isPaused || false,
                    duration: hubState.selectedMinutes,
                    startTime: hubState.startTimestamp || Date.now(),
                    pausedTime: 0,
                    taskTitle: hubState.taskTitle || null,
                    remainingSeconds: hubState.remainingSeconds,
                    isOpenEnded: hubState.isOpenEnded || false,
                    elapsedSeconds: hubState.elapsedSeconds || 0,
                    startTimestamp: hubState.startTimestamp,
                    endTimestamp: hubState.endTimestamp,
                    pausedRemainingSeconds: hubState.pausedRemainingSeconds,
                    pausedElapsedSeconds: hubState.pausedElapsedSeconds
                };
                updateFocusUI(displaySession);
            } else if (popupSession && popupSession.isActive) {
                updateFocusUI(popupSession);
            }
            document.getElementById('focus-status').style.display = 'block';
            document.getElementById('todays-tasks').style.display = 'none';
            startFocusTimer();
        } else {
            document.getElementById('focus-status').style.display = 'none';
            document.getElementById('todays-tasks').style.display = 'block';
        }
    });
}

// Load and display today's completed focus sessions count
function loadTodaysSessionsCount(dailyStats) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const todayStats = dailyStats?.[today] || {};
    const sessionsCount = todayStats.focusSessions || 0;

    const sessionsEl = document.getElementById('popup-sessions-today');
    if (sessionsEl) {
        sessionsEl.textContent = sessionsCount;
    }
}

function updateFocusUI(session) {
    const timerDisplay = document.getElementById('focus-timer-display');
    const taskDisplay = document.getElementById('focus-task-display');
    const pauseBtn = document.getElementById('pause-focus-btn');

    if (!session) return;

    let displayTime;

    // Handle open-ended (count-up) mode
    if (session.isOpenEnded) {
        // Get elapsed seconds from the session
        let elapsedSeconds = session.elapsedSeconds || 0;

        if (session.isPaused && session.pausedElapsedSeconds !== undefined && session.pausedElapsedSeconds !== null) {
            elapsedSeconds = session.pausedElapsedSeconds;
        }

        // If not available, calculate from start time
        if ((!Number.isFinite(elapsedSeconds) || elapsedSeconds === 0) && typeof session.startTimestamp === 'number') {
            elapsedSeconds = Math.floor((Date.now() - session.startTimestamp) / 1000);
        }

        if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) elapsedSeconds = 0;

        const hours = Math.floor(elapsedSeconds / 3600);
        const mins = Math.floor((elapsedSeconds % 3600) / 60);
        const secs = elapsedSeconds % 60;

        if (hours > 0) {
            displayTime = `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        } else {
            displayTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }

        timerDisplay.textContent = displayTime;
    } else {
        // Standard countdown mode
        let remainingSeconds;

        // Preferred: compute from endTimestamp so it's accurate even without background ticking
        if (session.isPaused && typeof session.pausedRemainingSeconds === 'number') {
            remainingSeconds = session.pausedRemainingSeconds;
        } else if (typeof session.endTimestamp === 'number') {
            remainingSeconds = Math.max(0, Math.ceil((session.endTimestamp - Date.now()) / 1000));
        }

        // If still undefined, fall back to stored remainingSeconds (hub) or compute from popup fields.
        if (remainingSeconds === undefined) {
            if (typeof session.remainingSeconds === 'number') {
                remainingSeconds = session.remainingSeconds;
            } else if (typeof session.duration === 'number' && typeof session.startTime === 'number') {
                // Calculate remaining time from popup format
                let elapsed = Date.now() - session.startTime;
                if (session.pausedTime) elapsed -= session.pausedTime;
                if (session.isPaused && session.pausedAt) {
                    elapsed -= (Date.now() - session.pausedAt);
                }

                const totalMs = session.duration * 60 * 1000;
                const remainingMs = Math.max(0, totalMs - elapsed);
                remainingSeconds = Math.ceil(remainingMs / 1000);
            }
        }

        if (!Number.isFinite(remainingSeconds) || remainingSeconds < 0) remainingSeconds = 0;

        const mins = Math.floor(remainingSeconds / 60);
        const secs = remainingSeconds % 60;
        timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        // Check if timer is done (only for countdown)
        if (remainingSeconds <= 0) {
            document.getElementById('focus-status').style.display = 'none';
            document.getElementById('todays-tasks').style.display = 'block';
            return;
        }
    }

    if (session.taskTitle) {
        taskDisplay.textContent = `📋 ${session.taskTitle}`;
        taskDisplay.style.display = 'block';
    } else {
        taskDisplay.style.display = 'none';
    }

    // Update pause button
    if (pauseBtn) {
        pauseBtn.innerHTML = session.isPaused
            ? '<i class="fas fa-play"></i>'
            : '<i class="fas fa-pause"></i>';
    }
}


let focusTimerInterval = null;

// Start listening for focus state updates from background
function startFocusTimer() {
    // Clear any existing interval first
    if (focusTimerInterval) {
        clearInterval(focusTimerInterval);
    }

    // Just poll storage periodically to update the display
    // The actual countdown is managed by background.js
    focusTimerInterval = setInterval(() => {
        chrome.storage.local.get(['focusSession', 'focusState'], (result) => {
            const popupSession = result.focusSession;
            const hubState = result.focusState;

            if ((popupSession && popupSession.isActive) || (hubState && hubState.isActive)) {
                let displaySession;

                // Prefer hub state if available
                if (hubState && hubState.isActive) {
                    displaySession = {
                        isActive: true,
                        isPaused: hubState.isPaused || false,
                        duration: hubState.selectedMinutes,
                        remainingSeconds: hubState.remainingSeconds,
                        taskTitle: hubState.taskTitle || null,
                        isOpenEnded: hubState.isOpenEnded || false,
                        elapsedSeconds: hubState.elapsedSeconds || 0,
                        startTimestamp: hubState.startTimestamp,
                        endTimestamp: hubState.endTimestamp,
                        pausedRemainingSeconds: hubState.pausedRemainingSeconds,
                        pausedElapsedSeconds: hubState.pausedElapsedSeconds
                    };

                    // Check if timer finished - but NOT for open-ended mode
                    if (!hubState.isOpenEnded) {
                        const computedRemaining = (typeof hubState.endTimestamp === 'number' && !hubState.isPaused)
                            ? Math.max(0, Math.ceil((hubState.endTimestamp - Date.now()) / 1000))
                            : (typeof hubState.pausedRemainingSeconds === 'number'
                                ? hubState.pausedRemainingSeconds
                                : hubState.remainingSeconds);

                        if (computedRemaining <= 0) {
                            clearInterval(focusTimerInterval);
                            focusTimerInterval = null;
                            document.getElementById('focus-status').style.display = 'none';
                            document.getElementById('todays-tasks').style.display = 'block';
                            return;
                        }
                    }

                    // (remainingSeconds may be stale if not updated elsewhere; updateFocusUI will compute)
                } else if (popupSession && popupSession.isActive) {
                    displaySession = popupSession;
                }

                if (displaySession) {
                    updateFocusUI(displaySession);
                }

            } else {
                // No active session - clear interval and reset UI
                clearInterval(focusTimerInterval);
                focusTimerInterval = null;
                document.getElementById('focus-status').style.display = 'none';
                document.getElementById('todays-tasks').style.display = 'block';
            }
        });
    }, 500); // Poll every 500ms for smoother updates
}

// Also listen for storage changes to update UI in real-time
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;

    if (changes.focusState || changes.focusSession) {
        const focusState = changes.focusState?.newValue;
        const focusSession = changes.focusSession?.newValue;

        if (focusState?.isActive || focusSession?.isActive) {
            // Show focus status and update UI
            document.getElementById('focus-status').style.display = 'block';
            document.getElementById('todays-tasks').style.display = 'none';

            if (focusState?.isActive) {
                updateFocusUI({
                    isActive: true,
                    isPaused: focusState.isPaused || false,
                    duration: focusState.selectedMinutes,
                    remainingSeconds: focusState.remainingSeconds,
                    taskTitle: focusState.taskTitle || null,
                    isOpenEnded: focusState.isOpenEnded || false,
                    elapsedSeconds: focusState.elapsedSeconds || 0,
                    startTimestamp: focusState.startTimestamp,
                    endTimestamp: focusState.endTimestamp,
                    pausedRemainingSeconds: focusState.pausedRemainingSeconds,
                    pausedElapsedSeconds: focusState.pausedElapsedSeconds
                });
            }

            // Start polling if not already
            if (!focusTimerInterval) {
                startFocusTimer();
            }
        } else if (focusState === undefined && focusSession === undefined) {
            // Session cleared - reset UI
            document.getElementById('focus-status').style.display = 'none';
            document.getElementById('todays-tasks').style.display = 'block';
            if (focusTimerInterval) {
                clearInterval(focusTimerInterval);
                focusTimerInterval = null;
            }
        }
    }

    // Update sessions count when daily stats change
    if (changes.productivity_daily_stats) {
        loadTodaysSessionsCount(changes.productivity_daily_stats.newValue);
    }
});

function startQuickFocus(minutes) {
    const session = {
        isActive: true,
        isPaused: false,
        duration: minutes,
        startTime: Date.now(),
        pausedTime: 0,
        taskTitle: null
    };

    // Also create focusState for content script overlay compatibility
    const focusState = {
        isActive: true,
        isPaused: false,
        isBreak: false,
        remainingSeconds: minutes * 60,
        selectedMinutes: minutes,
        taskTitle: null,
        startTimestamp: Date.now(),
        endTimestamp: Date.now() + (minutes * 60 * 1000),
        pausedRemainingSeconds: null,
        pausedElapsedSeconds: null
    };

    chrome.storage.local.set({ focusSession: session, focusState: focusState }, () => {
        document.getElementById('focus-status').style.display = 'block';
        document.getElementById('todays-tasks').style.display = 'none';
        updateFocusUI(session);
        startFocusTimer();

        // Notify productivity hub if open
        chrome.runtime.sendMessage({
            action: 'FOCUS_STARTED',
            duration: minutes
        }).catch(() => { });
    });
}

/**
 * Start an open-ended focus session (count-up timer)
 * No time limit - runs until manually stopped
 */
function startFreeFocus() {
    const session = {
        isActive: true,
        isPaused: false,
        duration: 0, // Open-ended
        startTime: Date.now(),
        pausedTime: 0,
        taskTitle: null,
        isOpenEnded: true
    };

    // Create focusState for content script overlay compatibility
    const focusState = {
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOpenEnded: true,
        elapsedSeconds: 0,
        remainingSeconds: 0,
        selectedMinutes: 0,
        taskTitle: null,
        startTimestamp: Date.now(),
        endTimestamp: null,
        pausedRemainingSeconds: null,
        pausedElapsedSeconds: null
    };

    chrome.storage.local.set({ focusSession: session, focusState: focusState }, () => {
        document.getElementById('focus-status').style.display = 'block';
        document.getElementById('todays-tasks').style.display = 'none';
        updateFocusUI(session);
        startFocusTimer();

        // Notify productivity hub if open
        chrome.runtime.sendMessage({
            action: 'FOCUS_STARTED',
            duration: 0,
            isOpenEnded: true
        }).catch(() => { });
    });
}

// Today's Tasks Functions
function loadTodaysTasks() {
    // Use 'productivity_tasks' key - same as the Productivity Hub uses
    chrome.storage.local.get(['productivity_tasks'], (result) => {
        const tasks = result.productivity_tasks || [];
        const today = new Date().toISOString().split('T')[0];

        // Filter tasks for today (by due date) that are not completed
        const todaysTasks = tasks.filter(task => {
            // Check if task is completed (status === 'completed' OR completed === true for backwards compatibility)
            if (task.status === 'completed' || task.completed) return false;
            // Check dueDate
            if (task.dueDate === today) return true;
            // Check startDate
            if (task.startDate === today) return true;
            return false;
        });

        // Sort by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        todaysTasks.sort((a, b) => {
            return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
        });

        renderTodaysTasks(todaysTasks);
    });
}

function renderTodaysTasks(tasks) {
    const container = document.getElementById('todays-tasks-list');
    const countBadge = document.getElementById('today-task-count');
    const fallback = document.getElementById('quick-focus-fallback');

    countBadge.textContent = tasks.length;

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="no-tasks-message">
                <i class="fas fa-check-circle"></i>
                <span>No tasks for today!</span>
            </div>
        `;
        fallback.style.display = 'block';
        return;
    }

    fallback.style.display = 'block'; // Always show quick focus as alternative

    container.innerHTML = tasks.slice(0, 5).map(task => `
        <div class="today-task-item" data-task-id="${task.id}">
            <div class="today-task-check">
                <button class="task-complete-btn" data-task-id="${task.id}" title="Mark Complete">
                    <i class="far fa-circle"></i>
                </button>
            </div>
            <div class="today-task-info">
                <span class="today-task-title">${escapeHtml(task.title)}</span>
                ${task.dueTime ? `<span class="today-task-time"><i class="fas fa-clock"></i> ${formatTime12(task.dueTime)}</span>` : ''}
            </div>
            <div class="today-task-actions">
                <span class="today-task-priority priority-${task.priority || 'medium'}"></span>
                <button class="task-focus-btn" data-task-id="${task.id}" data-task-title="${escapeHtml(task.title)}" title="Start Focus">
                    <i class="fas fa-play"></i>
                </button>
            </div>
        </div>
    `).join('');

    if (tasks.length > 5) {
        container.innerHTML += `
            <div class="more-tasks-link">
                <a href="#" id="view-all-tasks">+${tasks.length - 5} more tasks</a>
            </div>
        `;

        document.getElementById('view-all-tasks')?.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: 'productivity/index.html#tasks' });
        });
    }

    // Add event listeners for task actions
    container.querySelectorAll('.task-complete-btn').forEach(btn => {
        btn.addEventListener('click', () => completeTask(btn.dataset.taskId));
    });

    container.querySelectorAll('.task-focus-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            startFocusOnTask(btn.dataset.taskId, btn.dataset.taskTitle);
        });
    });
}

function completeTask(taskId) {
    chrome.storage.local.get(['productivity_tasks'], (result) => {
        const tasks = result.productivity_tasks || [];
        const taskIndex = tasks.findIndex(t => t.id === taskId);

        if (taskIndex !== -1) {
            // Use status = 'completed' to match the Productivity Hub format
            tasks[taskIndex].status = 'completed';
            tasks[taskIndex].completed = true;
            tasks[taskIndex].completedAt = new Date().toISOString();

            chrome.storage.local.set({ productivity_tasks: tasks }, () => {
                // Animate the task out
                const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
                if (taskElement) {
                    taskElement.classList.add('completing');
                    setTimeout(() => loadTodaysTasks(), 300);
                } else {
                    loadTodaysTasks();
                }

                // Show quick feedback
                showQuickToast('Task completed!');
            });
        }
    });
}

function startFocusOnTask(taskId, taskTitle, customDuration = null) {
    // Use custom duration, or selected quick focus duration, or default 25 minutes
    const duration = customDuration || selectedQuickFocusDuration || 25;

    const session = {
        isActive: true,
        isPaused: false,
        duration: duration,
        startTime: Date.now(),
        pausedTime: 0,
        taskTitle: taskTitle,
        taskId: taskId
    };

    // Also create focusState for content script overlay compatibility
    const focusState = {
        isActive: true,
        isPaused: false,
        isBreak: false,
        isOpenEnded: false,
        remainingSeconds: duration * 60,
        selectedMinutes: duration,
        taskTitle: taskTitle,
        startTimestamp: Date.now(),
        endTimestamp: Date.now() + (duration * 60 * 1000),
        pausedRemainingSeconds: null,
        pausedElapsedSeconds: null
    };

    chrome.storage.local.set({ focusSession: session, focusState: focusState }, () => {
        document.getElementById('focus-status').style.display = 'block';
        document.getElementById('todays-tasks').style.display = 'none';
        // Close task selector modal if open
        closeTaskSelectorModal();
        updateFocusUI(session);
        startFocusTimer();

        // Notify productivity hub if open
        chrome.runtime.sendMessage({
            action: 'FOCUS_STARTED',
            duration: duration,
            taskId: taskId,
            taskTitle: taskTitle
        }).catch(() => { });
    });
}

function formatTime12(time24) {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showQuickToast(message) {
    if (typeof window.showToast === 'function') {
        window.showToast('success', message, '');
        return;
    }

    // Fallback (should be rare if shared/toast.js is loaded)
    alert(message);
}

// ============================================
// QUICK ADD TASK FUNCTIONALITY
// ============================================
function setupQuickAddTask() {
    const titleInput = document.getElementById('quick-task-title');
    const prioritySelect = document.getElementById('quick-task-priority');
    const addBtn = document.getElementById('quick-add-btn');

    if (!titleInput || !addBtn) return;

    // Add button click
    addBtn.addEventListener('click', () => {
        const title = titleInput.value.trim();
        const priority = prioritySelect?.value || 'medium';
        if (title) {
            quickAddTask(title, priority);
            titleInput.value = '';
        }
    });

    // Enter key to submit
    titleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const title = titleInput.value.trim();
            const priority = prioritySelect?.value || 'medium';
            if (title) {
                quickAddTask(title, priority);
                titleInput.value = '';
            }
        }
    });
}

function quickAddTask(title, priority = 'medium') {
    const today = new Date().toISOString().split('T')[0];

    const newTask = {
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        title: title,
        description: '',
        priority: priority,
        category: 'other',
        status: 'not-started',
        dueDate: today,
        dueTime: null,
        startDate: null,
        estimatedTime: null,
        subtasks: [],
        tags: [],
        recurring: false,
        reminderSet: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    chrome.storage.local.get(['productivity_tasks'], (result) => {
        const tasks = result.productivity_tasks || [];
        tasks.push(newTask);

        chrome.storage.local.set({ productivity_tasks: tasks }, () => {
            showQuickToast('Task added!');
            loadTodaysTasks();
        });
    });
}

// ============================================
// OVERDUE TASKS & POSTPONE FUNCTIONALITY
// ============================================
function loadOverdueTasks() {
    chrome.storage.local.get(['productivity_tasks'], (result) => {
        const tasks = result.productivity_tasks || [];
        const today = new Date().toISOString().split('T')[0];

        // Filter overdue tasks (due before today, not completed)
        const overdueTasks = tasks.filter(task => {
            if (task.status === 'completed' || task.completed) return false;
            if (task.dueDate && task.dueDate < today) return true;
            return false;
        });

        // Sort by due date (most recent first)
        overdueTasks.sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));

        renderOverdueTasks(overdueTasks);
    });
}

function renderOverdueTasks(tasks) {
    const section = document.getElementById('overdue-tasks-section');
    const container = document.getElementById('overdue-tasks-list');
    const countBadge = document.getElementById('overdue-task-count');

    if (!section || !container) return;

    if (tasks.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    countBadge.textContent = tasks.length;

    container.innerHTML = tasks.slice(0, 5).map(task => `
        <div class="overdue-task-item" data-task-id="${task.id}">
            <div class="overdue-task-info">
                <div class="overdue-task-title">${escapeHtml(task.title)}</div>
                <div class="overdue-task-date">Due: ${formatDueDate(task.dueDate)}</div>
            </div>
            <div class="overdue-task-actions">
                <button class="task-postpone-btn" data-task-id="${task.id}" title="Postpone to Today">
                    <i class="fas fa-calendar-plus"></i>
                </button>
                <button class="task-complete-btn" data-task-id="${task.id}" title="Mark Complete">
                    <i class="far fa-circle"></i>
                </button>
            </div>
        </div>
    `).join('');

    if (tasks.length > 5) {
        container.innerHTML += `
            <div class="more-tasks-link">
                <a href="#" id="view-overdue-tasks">+${tasks.length - 5} more overdue</a>
            </div>
        `;

        document.getElementById('view-overdue-tasks')?.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: 'productivity/index.html#tasks' });
        });
    }

    // Add event listeners
    container.querySelectorAll('.task-postpone-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            postponeTaskToToday(btn.dataset.taskId);
        });
    });

    container.querySelectorAll('.task-complete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            completeTask(btn.dataset.taskId);
            loadOverdueTasks(); // Refresh overdue list
        });
    });
}

function postponeTaskToToday(taskId) {
    const today = new Date().toISOString().split('T')[0];

    chrome.storage.local.get(['productivity_tasks'], (result) => {
        const tasks = result.productivity_tasks || [];
        const taskIndex = tasks.findIndex(t => t.id === taskId);

        if (taskIndex !== -1) {
            tasks[taskIndex].dueDate = today;
            tasks[taskIndex].updatedAt = new Date().toISOString();

            chrome.storage.local.set({ productivity_tasks: tasks }, () => {
                showQuickToast('Task moved to today!');
                loadTodaysTasks();
                loadOverdueTasks();
            });
        }
    });
}

function formatDueDate(dateStr) {
    if (!dateStr) return 'No date';
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================
// QUICK FOCUS + TASK SELECTOR FUNCTIONALITY
// ============================================

// Update visual selection for quick focus buttons
function updateQuickFocusSelection(selectedBtn) {
    // Remove selected class from all buttons
    document.querySelectorAll('.focus-time-btn-mini').forEach(btn => {
        btn.classList.remove('selected');
    });
    // Add selected class to clicked button
    if (selectedBtn) {
        selectedBtn.classList.add('selected');
    }
}

// Show task selector modal when quick focus is clicked
function showTaskSelectorModal(minutes) {
    // Remove existing modal if any
    closeTaskSelectorModal();

    // Get today's tasks
    chrome.storage.local.get(['productivity_tasks'], (result) => {
        const tasks = result.productivity_tasks || [];
        const today = new Date().toISOString().split('T')[0];

        // Filter tasks for today that are not completed
        const todaysTasks = tasks.filter(task => {
            if (task.status === 'completed' || task.completed) return false;
            if (task.dueDate === today) return true;
            if (task.startDate === today) return true;
            return false;
        });

        // Sort by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        todaysTasks.sort((a, b) => {
            return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
        });

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'task-selector-modal';
        modal.id = 'task-selector-modal';
        modal.innerHTML = `
            <div class="task-selector-content">
                <div class="task-selector-header">
                    <h3><i class="fas fa-clock"></i> ${minutes} min Focus Session</h3>
                    <button class="close-task-selector"><i class="fas fa-times"></i></button>
                </div>
                <div class="task-selector-body">
                    ${todaysTasks.length > 0 ? `
                        <div class="task-selector-section">
                            <div class="task-selector-label">Focus on a task:</div>
                            <div class="task-selector-list">
                                ${todaysTasks.slice(0, 5).map(task => `
                                    <button class="task-option-btn" data-task-id="${task.id}" data-task-title="${escapeHtml(task.title)}">
                                        <span class="task-option-priority priority-${task.priority || 'medium'}"></span>
                                        <span class="task-option-title">${escapeHtml(task.title)}</span>
                                        <i class="fas fa-play task-option-icon"></i>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        <div class="task-selector-divider">
                            <span>or</span>
                        </div>
                    ` : ''}
                    <button class="start-focus-no-task-btn">
                        <i class="fas fa-brain"></i>
                        <span>Start Focus Without Task</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Animate in
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });

        // Event listeners
        modal.querySelector('.close-task-selector').addEventListener('click', closeTaskSelectorModal);

        // Task selection
        modal.querySelectorAll('.task-option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const taskId = btn.dataset.taskId;
                const taskTitle = btn.dataset.taskTitle;
                startFocusOnTask(taskId, taskTitle, minutes);
            });
        });

        // Start without task
        modal.querySelector('.start-focus-no-task-btn').addEventListener('click', () => {
            closeTaskSelectorModal();
            startQuickFocus(minutes);
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeTaskSelectorModal();
            }
        });
    });
}

// Close task selector modal
function closeTaskSelectorModal() {
    const modal = document.getElementById('task-selector-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
    }
}