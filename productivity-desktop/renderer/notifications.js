/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - NOTIFICATION SYSTEM (FULL IMPLEMENTATION)
 * ============================================================================
 * 
 * Complete Notification System with:
 * - Desktop notifications (Chrome API)
 * - In-app toast notifications
 * - Notification preferences
 * - Scheduled reminders
 * - Focus session notifications
 * - Goal deadline alerts
 * - Task due date reminders
 * - Streak maintenance reminders
 * - Custom notification sounds
 * - Notification history
 * - Do Not Disturb mode
 */

// ============================================================================
// NOTIFICATION STATE
// ============================================================================
const NotificationState = {
    isSupported: 'Notification' in window,
    permission: 'default',
    preferences: {
        enabled: true,
        sound: true,
        soundType: 'reminder',
        volume: 0.7,
        desktop: true,
        focusAlerts: true,
        taskReminders: true,
        goalDeadlines: true,
        streakReminders: true,
        breakReminders: true,
        achievements: true,
        dailySummary: true
    },
    dndEnabled: false,
    dndEndTime: null,
    history: [],
    scheduledNotifications: [],
    dailyReminderTime: '20:30', // Default 8:30 PM
    dailyReminderEnabled: true,
    dailyReminderRepeat: 'once',
    dailyReminderDays: [0, 1, 2, 3, 4, 5, 6],
    dailyReminderInterval: null,
    habitReminderTime: '09:00', // Default 9:00 AM
    habitReminderEnabled: true,
    habitReminderRepeat: 'once', // 'once' | 'hourly' | 'until-done'
    habitReminderDays: [0, 1, 2, 3, 4, 5, 6],
    habitReminderInterval: null,
    taskReminderModalOpen: false,
    activeNotifications: [] // Track active sliding notifications
};

// ============================================================================
// SLIDING NOTIFICATION SYSTEM
// ============================================================================

/**
 * Show a simple, clean sliding notification
 * Clicking the notification navigates to the relevant page
 */
function showSlidingNotification(options = {}) {
    const {
        type = 'info',
        title = 'Notification',
        message = '',
        icon = null,
        duration = 5000,
        persistent = false,
        soundType = null,
        navigateTo = null,  // Page to navigate to on click (e.g., 'tasks', 'focus', 'goals')
        onClose = null,
        actions = null,
        silent = false
    } = options;

    // Check if notifications are enabled
    if (!NotificationState.preferences.enabled) return null;

    // Check DND mode
    if (isDNDActive()) return null;

    const mappedType = type === 'task' || type === 'reminder' ? 'info' : type;

    const mergedActions = [];
    if (Array.isArray(actions)) {
        mergedActions.push(...actions);
    }

    if (navigateTo) {
        mergedActions.push({
            label: 'Open',
            primary: mergedActions.length === 0,
            callback: () => {
                const navItem = document.querySelector(`.nav-item[data-page="${navigateTo}"]`);
                navItem?.click?.();
            }
        });
    }

    // Delegate to the unified toast system (single style)
    return showToast(mappedType, title, message, {
        icon,
        duration,
        persistent,
        actions: mergedActions.length ? mergedActions : undefined,
        soundType: soundType || NotificationState.preferences.soundType || mappedType,
        silent,
        onClose
    });
}

function closeNotification(notification, onClose) {
    if (!notification || notification.classList.contains('exiting')) return;

    notification.classList.add('exiting');

    // Remove from tracking
    const idx = NotificationState.activeNotifications.indexOf(notification.dataset.id);
    if (idx > -1) NotificationState.activeNotifications.splice(idx, 1);

    // Call onClose callback
    if (typeof onClose === 'function') {
        onClose();
    }

    // Remove after animation
    setTimeout(() => {
        notification.remove();
    }, 400);
}

// Professional notification sounds (bell/chime sounds)
const NOTIFICATION_SOUNDS = {
    // Professional bell chime sound
    default: createBellSound(440, 0.48),
    success: createBellSound(523, 0.42),
    warning: createBellSound(392, 0.55),
    achievement: createBellSound(659, 0.60),
    reminder: createBellSound(494, 0.68)
};

// Create a professional bell/chime sound using Web Audio API
function createBellSound(frequency, duration) {
    return { frequency, duration, type: 'bell' };
}

// Play notification sound - uses NotificationSounds from notification-sounds.js if available
function playNotificationSound(soundType = 'default') {
    if (!NotificationState.preferences.sound) return;

    const volume = NotificationState.preferences.volume || 0.7;

    try {
        // Try using the advanced NotificationSounds system first
        if (window.NotificationSounds && typeof window.NotificationSounds.play === 'function') {
            window.NotificationSounds.play(soundType, volume);
            return;
        }

        // Fallback to built-in simple sounds
        const sound = NOTIFICATION_SOUNDS[soundType] || NOTIFICATION_SOUNDS.default;
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create oscillator for the main tone
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        // Bell-like sound using sine wave
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(sound.frequency, audioContext.currentTime);

        // Add harmonics for richer bell sound
        const oscillator2 = audioContext.createOscillator();
        oscillator2.type = 'sine';
        oscillator2.frequency.setValueAtTime(sound.frequency * 2, audioContext.currentTime);

        const gainNode2 = audioContext.createGain();
        gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime);

        // Bell-like envelope (gentle attack, gradual decay)
        const t0 = audioContext.currentTime;
        const attack = 0.02;
        gainNode.gain.setValueAtTime(0.0001, t0);
        gainNode.gain.exponentialRampToValueAtTime(0.45, t0 + attack);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + sound.duration);

        gainNode2.gain.setValueAtTime(0.0001, t0);
        gainNode2.gain.exponentialRampToValueAtTime(0.22, t0 + attack);
        gainNode2.gain.exponentialRampToValueAtTime(0.0001, t0 + sound.duration * 0.92);

        // Connect nodes
        oscillator.connect(gainNode);
        oscillator2.connect(gainNode2);
        gainNode.connect(audioContext.destination);
        gainNode2.connect(audioContext.destination);

        // Play
        oscillator.start(audioContext.currentTime);
        oscillator2.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + sound.duration);
        oscillator2.stop(audioContext.currentTime + sound.duration);

        // Cleanup
        setTimeout(() => {
            audioContext.close();
        }, sound.duration * 1000 + 100);
    } catch (e) {
        console.error('Failed to play notification sound:', e);
    }
}

// Notification icons
const NOTIFICATION_ICONS = {
    focus: '⏱️',
    task: '✅',
    goal: '🎯',
    break: '☕',
    streak: '🔥',
    achievement: '🏆',
    warning: '⚠️',
    info: 'ℹ️',
    success: '✨'
};

// ============================================================================
// NOTIFICATION INITIALIZATION
// ============================================================================
async function initNotificationSystem() {
    // Check browser support
    if (!NotificationState.isSupported) {
        return;
    }

    // Check permission status
    NotificationState.permission = Notification.permission;

    // Load preferences
    await loadNotificationPreferences();

    // If the global task reminder toggle (stored in chrome.storage.local) is set,
    // honor it here too so the productivity hub doesn't re-enable reminders.
    try {
        const stored = await chrome.storage.local.get(['taskRemindersEnabled']);
        if (stored?.taskRemindersEnabled === false) {
            NotificationState.preferences.taskReminders = false;
        } else if (stored?.taskRemindersEnabled === true) {
            NotificationState.preferences.taskReminders = true;
        }
    } catch (e) {
        // ignore
    }

    // Mirror the task reminder preference into chrome.storage.local so the
    // background/content scripts can honor it.
    try {
        const enabled = (NotificationState.preferences.enabled !== false) && (NotificationState.preferences.taskReminders !== false);
        await chrome.storage.local.set({ taskRemindersEnabled: enabled });
    } catch (e) {
        // ignore
    }

    // Keep in sync if the user flips the toggle from the extension options page.
    try {
        if (chrome.storage?.onChanged && !NotificationState._taskReminderStorageListenerInstalled) {
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName !== 'local') return;
                if (!changes?.taskRemindersEnabled) return;

                const newValue = changes.taskRemindersEnabled.newValue;
                if (newValue === false) {
                    NotificationState.preferences.taskReminders = false;
                } else if (newValue === true) {
                    NotificationState.preferences.taskReminders = true;
                }
            });
            NotificationState._taskReminderStorageListenerInstalled = true;
        }
    } catch (e) {
        // ignore
    }

    // Load notification history
    await loadNotificationHistory();

    // Setup scheduled notification checker
    setupNotificationScheduler();

    // Setup Chrome notification click handler
    if (chrome.notifications && chrome.notifications.onClicked) {
        chrome.notifications.onClicked.addListener((notificationId) => {
            // Clear the badge when notification is clicked
            markNotificationAsRead(notificationId);
            // Focus the productivity hub window
            chrome.notifications.clear(notificationId);
        });
    }

    // Request permission if needed
    if (NotificationState.permission === 'default') {
        requestNotificationPermission();
    }
}

async function loadNotificationPreferences() {
    try {
        const settings = await ProductivityData.DataStore.getSettings();
        if (settings.notificationPreferences) {
            NotificationState.preferences = {
                ...NotificationState.preferences,
                ...settings.notificationPreferences
            };
        }
        NotificationState.dndEnabled = settings.dndEnabled || false;
        NotificationState.dndEndTime = settings.dndEndTime || null;
    } catch (e) {
        // Debug removed
    }
}

async function saveNotificationPreferences() {
    try {
        const settings = await ProductivityData.DataStore.getSettings();
        settings.notificationPreferences = NotificationState.preferences;
        settings.dndEnabled = NotificationState.dndEnabled;
        settings.dndEndTime = NotificationState.dndEndTime;
        await ProductivityData.DataStore.saveSettings(settings);
    } catch (e) {
        console.error('Failed to save notification preferences:', e);
    }
}

async function loadNotificationHistory() {
    try {
        const stored = await chrome.storage.local.get('notificationHistory');
        NotificationState.history = stored.notificationHistory || [];

        // Keep only last 50 notifications
        if (NotificationState.history.length > 50) {
            NotificationState.history = NotificationState.history.slice(-50);
            await saveNotificationHistory();
        }
    } catch (e) {
        NotificationState.history = [];
    }
}

async function saveNotificationHistory() {
    try {
        await chrome.storage.local.set({
            notificationHistory: NotificationState.history
        });
    } catch (e) {
        console.error('Failed to save notification history:', e);
    }
}

// ============================================================================
// PERMISSION HANDLING
// ============================================================================
async function requestNotificationPermission() {
    if (!NotificationState.isSupported) return false;

    try {
        const permission = await Notification.requestPermission();
        NotificationState.permission = permission;
        return permission === 'granted';
    } catch (e) {
        console.error('Failed to request notification permission:', e);
        return false;
    }
}

function hasNotificationPermission() {
    return NotificationState.isSupported && NotificationState.permission === 'granted';
}
function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
        try {
            if (!chrome?.runtime?.sendMessage) return resolve(null);
            chrome.runtime.sendMessage(message, (response) => {
                // Swallow errors (e.g., if runtime is unavailable)
                resolve(response || null);
            });
        } catch (e) {
            resolve(null);
        }
    });
}

// ============================================================================
// CORE NOTIFICATION FUNCTIONS
// ============================================================================

/**
 * Show a toast notification (in-app)
 */
function showToast(type, title, message, options = {}) {
    const container = document.getElementById('toast-container') || createToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast ${type} ${options.persistent ? 'persistent' : ''}`;

    const icon = options.icon || getToastIcon(type);
    const duration = options.duration || (type === 'error' ? 5000 : 3000);

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas ${icon}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
        </div>
        ${options.actions ? `
            <div class="toast-actions">
                ${options.actions.map((action, i) => `
                    <button class="toast-btn ${action.primary ? 'primary' : ''}" data-action-index="${i}">
                        ${escapeHtml(action.label || 'Action')}
                    </button>
                `).join('')}
            </div>
        ` : ''}
        <button class="toast-close" type="button" data-close-toast>
            <i class="fas fa-times"></i>
        </button>
        ${options.persistent ? '' : `<div class="toast-progress" style="animation-duration: ${duration}ms"></div>`}
    `;

    container.appendChild(toast);

    const removeToast = () => {
        try {
            if (typeof options.onClose === 'function') {
                options.onClose();
            }
        } catch {
            // ignore
        }
        toast.remove();
    };

    // Setup toast listeners
    toast.querySelector('[data-close-toast]')?.addEventListener('click', () => {
        removeToast();
    });

    // Setup action button listeners
    if (options.actions) {
        toast.querySelectorAll('[data-action-index]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-action-index'), 10);
                const action = options.actions[idx];
                if (action && typeof action.callback === 'function') {
                    action.callback();
                }
                removeToast();
            });
        });
    }

    // Play sound if enabled
    if (NotificationState.preferences.sound && !options.silent) {
        playNotificationSound(options.soundType || type);
    }

    // Auto remove
    if (!options.persistent) {
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => removeToast(), 260);
        }, duration);
    }

    // Add to history
    addToHistory(type, title, message);

    return toast;
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

function getToastIcon(type) {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle',
        focus: 'fa-brain',
        achievement: 'fa-trophy',
        streak: 'fa-fire',
        break: 'fa-coffee'
    };
    return icons[type] || icons.info;
}

/**
 * Show a desktop notification (Chrome API)
 */
async function showDesktopNotification(title, options = {}) {
    // Check if allowed
    if (!NotificationState.preferences.enabled || !NotificationState.preferences.desktop) {
        return null;
    }

    // Check DND mode
    if (isDNDActive()) {
        return null;
    }

    // Play custom notification sound if sound is enabled
    if (NotificationState.preferences.sound && window.NotificationSounds) {
        const soundType = options.soundType || 'default';
        window.NotificationSounds.play(soundType);
    }

    try {
        // Prefer delegating desktop notifications to the background service worker.
        // This prevents duplicates when the Productivity page is open in multiple tabs.
        if (chrome?.runtime?.id) {
            const notificationId = options.id || options.tag || `productivity_${Date.now()}`;
            const resp = await sendRuntimeMessage({
                action: 'PRODUCTIVITY_CREATE_DESKTOP_NOTIFICATION',
                data: {
                    notificationId,
                    title,
                    message: options.body || '',
                    requireInteraction: !!options.requireInteraction,
                    dedupeKey: options.dedupeKey || null,
                    dedupeTtlMs: options.dedupeTtlMs || null,
                    dedupeOnce: options.dedupeOnce !== false
                }
            });

            if (resp?.ok && resp?.shown) {
                addToHistory('desktop', title, options.body);
            }
            return notificationId;
        }

        // Fallback to Web Notification API
        {
            // Fallback to Web Notification API
            if (!hasNotificationPermission()) {
                const granted = await requestNotificationPermission();
                if (!granted) return null;
            }
            const notification = new Notification('📌 ' + title, {
                body: options.body,
                icon: options.icon || '/icons/icon48.png',
                badge: options.badge,
                tag: options.tag,
                requireInteraction: options.requireInteraction,
                silent: true // Always silent - we play our own custom sound
            });

            notification.onclick = () => {
                // Clear badge when notification is clicked
                window.focus();
                if (options.onClick) {
                    options.onClick();
                }
                // Mark notification as read
                markNotificationAsRead(options.tag || options.id);
                notification.close();
            };

            if (options.timeout) {
                setTimeout(() => notification.close(), options.timeout);
            }

            addToHistory('desktop', title, options.body);
            return notification;
        }
    } catch (e) {
        console.error('Failed to show desktop notification:', e);
        return null;
    }
}

// ============================================================================
// SPECIALIZED NOTIFICATIONS
// ============================================================================

/**
 * Focus session notifications
 */
function notifyFocusStart(duration, preset) {
    if (!NotificationState.preferences.focusAlerts) return;

    showToast('focus', 'Focus Session Started! 🎯',
        `${duration} minute ${preset} session. Stay focused!`);

    showDesktopNotification('Focus Session Started', {
        body: `Your ${duration} minute ${preset} session has begun. Let's be productive!`,
        tag: 'focus-start',
        timeout: 5000,
        soundType: 'focusStart'
    });
}

function notifyFocusEnd(duration, completed) {
    if (!NotificationState.preferences.focusAlerts) return;

    const title = completed ? 'Session Complete! 🎉' : 'Session Ended';
    const message = completed
        ? `Great job! You focused for ${duration} minutes.`
        : 'Your focus session has ended.';

    showToast(completed ? 'success' : 'info', title, message);

    showDesktopNotification(title, {
        body: message,
        tag: 'focus-end',
        requireInteraction: true,
        soundType: 'focusEnd'
    });
}

function notifyFocusWarning(minutesLeft) {
    if (!NotificationState.preferences.focusAlerts) return;

    showToast('warning', `${minutesLeft} Minutes Left`,
        'Keep going, you\'re doing great!', { duration: 2000 });
}

/**
 * Break notifications
 */
function notifyBreakStart(duration, isLong) {
    if (!NotificationState.preferences.breakReminders) return;

    const title = isLong ? '☕ Long Break Time!' : '☕ Break Time!';
    const message = `Take a ${duration} minute break. You've earned it!`;

    showToast('break', title, message);

    showDesktopNotification(title, {
        body: message,
        tag: 'break-start',
        soundType: 'break'
    });
}

function notifyBreakEnd() {
    if (!NotificationState.preferences.breakReminders) return;

    showToast('info', 'Break Over', 'Ready to get back to work?', {
        actions: [
            { label: 'Start Focus', primary: true, onClick: 'startFocusSession()' },
            { label: 'Skip', onClick: '' }
        ]
    });

    showDesktopNotification('Break Over', {
        body: 'Time to get back to work!',
        tag: 'break-end',
        requireInteraction: true,
        soundType: 'warning'
    });
}

/**
 * Task notifications
 */
function notifyTaskDue(task, minutesUntilDue, meta = {}) {
    if (!NotificationState.preferences.taskReminders) return;

    let urgency, timeText;

    if (minutesUntilDue === 0) {
        urgency = 'error';
        timeText = 'NOW';
    } else if (minutesUntilDue <= 15) {
        urgency = 'error';
        timeText = `${minutesUntilDue} minutes`;
    } else if (minutesUntilDue <= 30) {
        urgency = 'warning';
        timeText = `${minutesUntilDue} minutes`;
    } else if (minutesUntilDue <= 60) {
        urgency = 'info';
        timeText = `${minutesUntilDue} minutes`;
    } else {
        urgency = 'info';
        timeText = `${Math.round(minutesUntilDue / 60)} hours`;
    }

    const toastMessage = minutesUntilDue === 0
        ? `"${task.title}" is due NOW!`
        : `"${task.title}" is due in ${timeText}`;

    // Show fancy sliding notification
    showSlidingNotification({
        type: minutesUntilDue === 0 ? 'error' : (minutesUntilDue <= 15 ? 'warning' : 'task'),
        title: minutesUntilDue === 0 ? '🚨 Task Due NOW!' : '⏰ Task Due Soon',
        message: toastMessage,
        badge: task.priority?.toUpperCase(),
        urgent: minutesUntilDue === 0,
        duration: minutesUntilDue === 0 ? 15000 : 10000,
        soundType: minutesUntilDue === 0 ? 'warning' : 'reminder',
        actions: [
            {
                label: 'View Task',
                primary: true,
                icon: 'fa-eye',
                callback: () => {
                    if (typeof viewTask === 'function') viewTask(task.id);
                }
            },
            {
                label: 'Snooze',
                icon: 'fa-clock',
                callback: () => {
                    if (typeof snoozeTaskReminder === 'function') snoozeTaskReminder(task.id);
                }
            }
        ]
    });

    // Also show desktop notification for other tabs
    // Also show a single desktop notification (de-duped globally via background)
    showDesktopNotification(minutesUntilDue === 0 ? '🚨 Task Due NOW!' : '⏰ Task Due Soon', {
        body: toastMessage,
        id: meta.notificationId || `task-due-${task.id}`,
        dedupeKey: meta.dedupeKey || null,
        requireInteraction: true,
        soundType: minutesUntilDue === 0 ? 'warning' : 'reminder'
    });
}

function notifyTaskComplete(task) {
    showSlidingNotification({
        type: 'success',
        title: 'Task Completed! ✓',
        message: task.title,
        duration: 3000,
        soundType: 'success'
    });
}

/**
 * Goal notifications
 */
function notifyGoalDeadline(goal, daysLeft, meta = {}) {
    if (!NotificationState.preferences.goalDeadlines) return;

    const urgency = daysLeft <= 3 ? 'warning' : 'info';
    const progress = goal.calculateProgress();

    showToast(urgency, `Goal Deadline Approaching`,
        `"${goal.title}" is due in ${daysLeft} days (${progress}% complete)`, {
        duration: 5000,
        actions: [
            { label: 'View Goal', primary: true, onClick: `viewGoalDetails('${goal.id}')` }
        ]
    });

    showDesktopNotification('🎯 Goal Deadline', {
        body: `"${goal.title}" is due in ${daysLeft} days`,
        id: meta.notificationId || `goal-deadline-${goal.id}-${daysLeft}`,
        dedupeKey: meta.dedupeKey || null,
        soundType: 'reminder'
    });
}

function notifyGoalComplete(goal) {
    showToast('achievement', '🎉 Goal Achieved!',
        `Congratulations on completing "${goal.title}"!`, {
        duration: 6000
    });

    showDesktopNotification('🏆 Goal Achieved!', {
        body: `You completed "${goal.title}"! Amazing work!`,
        tag: `goal-complete-${goal.id}`,
        requireInteraction: true,
        soundType: 'achievement'
    });
}

function notifyMilestoneComplete(goalTitle, milestoneTitle) {
    showToast('success', 'Milestone Complete! 🚩',
        `${milestoneTitle} in "${goalTitle}"`, { duration: 3000 });
}

/**
 * Streak notifications
 */
function notifyStreakMaintenance(currentStreak, meta = {}) {
    if (!NotificationState.preferences.streakReminders) return;

    showToast('streak', `Keep Your Streak Alive! 🔥`,
        `You have a ${currentStreak}-day streak. Don't break it!`, {
        duration: 5000,
        actions: [
            { label: 'Start Focus', primary: true, onClick: 'openFocusPage()' }
        ]
    });

    showDesktopNotification('🔥 Streak Reminder', {
        body: `You have a ${currentStreak}-day streak! Complete a focus session to maintain it.`,
        id: meta.notificationId || 'streak-reminder',
        dedupeKey: meta.dedupeKey || null,
        requireInteraction: true,
        soundType: 'streak'
    });
}

function notifyStreakAchievement(streakDays) {
    const milestones = [3, 7, 14, 21, 30, 60, 90, 100, 365];

    if (milestones.includes(streakDays)) {
        showToast('achievement', `🔥 ${streakDays}-Day Streak!`,
            'Incredible consistency! Keep it up!', { duration: 5000 });

        showDesktopNotification(`🔥 ${streakDays}-Day Streak!`, {
            body: 'Your dedication is paying off!',
            tag: `streak-${streakDays}`,
            soundType: 'streak'
        });
    }
}

/**
 * Achievement notifications
 */
function notifyAchievementUnlocked(achievement) {
    showToast('achievement', '🏆 Achievement Unlocked!',
        achievement.title, { duration: 5000 });

    showDesktopNotification('🏆 Achievement Unlocked!', {
        body: `${achievement.title}\n${achievement.description}`,
        tag: `achievement-${achievement.id}`,
        requireInteraction: true,
        soundType: 'achievement'
    });
}

// ============================================================================
// SCHEDULED NOTIFICATIONS
// ============================================================================
function setupNotificationScheduler() {
    // Prevent stacking intervals - clear existing ones first
    if (NotificationState.scheduledNotificationInterval) {
        clearInterval(NotificationState.scheduledNotificationInterval);
    }
    if (NotificationState.reminderCheckInterval) {
        clearInterval(NotificationState.reminderCheckInterval);
    }

    // Check every minute for scheduled notifications
    NotificationState.scheduledNotificationInterval = setInterval(checkScheduledNotifications, 60000);

    // Check task due dates every 30 seconds for better precision
    NotificationState.reminderCheckInterval = setInterval(checkReminders, 30000);

    // Setup daily task planning reminder
    setupDailyTaskReminder();

    // Setup daily habits reminder
    setupDailyHabitReminder();

    // Also run immediately on setup
    setTimeout(checkReminders, 1000);
}

// ============================================================================
// DAILY HABITS REMINDER
// ============================================================================
async function setupDailyHabitReminder() {
    const stored = await chrome.storage.local.get([
        'habitReminderTime',
        'habitReminderEnabled',
        'habitReminderRepeat',
        'habitReminderDays'
    ]);

    NotificationState.habitReminderTime = stored.habitReminderTime || '09:00';
    NotificationState.habitReminderRepeat = stored.habitReminderRepeat || 'once';
    NotificationState.habitReminderDays = stored.habitReminderDays || [0, 1, 2, 3, 4, 5, 6];
    const enabled = stored.habitReminderEnabled !== false;
    NotificationState.habitReminderEnabled = enabled;

    if (!enabled) {
        if (NotificationState.habitReminderInterval) {
            clearInterval(NotificationState.habitReminderInterval);
            NotificationState.habitReminderInterval = null;
        }
        return;
    }

    if (NotificationState.habitReminderInterval) {
        clearInterval(NotificationState.habitReminderInterval);
    }

    NotificationState.habitReminderInterval = setInterval(checkDailyHabitReminder, 60000);
    setTimeout(checkDailyHabitReminder, 2500);
}

async function checkDailyHabitReminder() {
    if (!NotificationState.habitReminderEnabled) return;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dayOfWeek = now.getDay();
    if (!NotificationState.habitReminderDays.includes(dayOfWeek)) return;

    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const [reminderH, reminderM] = String(NotificationState.habitReminderTime || '09:00').split(':').map(Number);
    const reminderMinutes = reminderH * 60 + reminderM;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const stored = await chrome.storage.local.get([
        'lastHabitReminderDate',
        'lastHabitRepeatReminderTime',
        'habitReminderDismissed',
        'habitTrackerCalendar'
    ]);

    if (stored.habitReminderDismissed === today) return;

    const habitData = stored.habitTrackerCalendar;
    if (!habitData || typeof habitData !== 'object') return;

    const goals = habitData.goals && typeof habitData.goals === 'object' ? habitData.goals : {};
    const goalIdsFromMeta = Array.isArray(habitData.goalsMeta)
        ? habitData.goalsMeta.map(g => g?.id).filter(id => typeof id === 'string')
        : [];
    const habitIds = goalIdsFromMeta.length ? goalIdsFromMeta : Object.keys(goals);
    if (!habitIds.length) return;

    let pendingCount = 0;
    for (const id of habitIds) {
        const completed = goals?.[id]?.completed && typeof goals[id].completed === 'object' ? goals[id].completed : {};
        if (!completed[today]) pendingCount++;
    }

    if (pendingCount <= 0) return;

    // For "once" mode, only show at exact time.
    if ((NotificationState.habitReminderRepeat || 'once') === 'once') {
        if (currentTime !== NotificationState.habitReminderTime) return;
        if (stored.lastHabitReminderDate === today) return;
    } else {
        // Repeat modes: only after initial time
        if (currentMinutes < reminderMinutes) return;

        const repeatMode = NotificationState.habitReminderRepeat;
        const repeatInterval = repeatMode === 'until-done' ? 30 : 60;
        const lastRepeatTime = stored.lastHabitRepeatReminderTime || 0;
        const minutesSinceLastRepeat = Math.floor((Date.now() - lastRepeatTime) / 60000);

        if (minutesSinceLastRepeat < repeatInterval && stored.lastHabitReminderDate === today) return;
        await chrome.storage.local.set({ lastHabitRepeatReminderTime: Date.now() });
    }

    await chrome.storage.local.set({ lastHabitReminderDate: today });

    showSlidingNotification({
        type: 'reminder',
        title: 'Daily Habits',
        message: `You still have ${pendingCount} habit${pendingCount === 1 ? '' : 's'} to complete today.`,
        actions: [
            {
                label: 'Dismiss Today',
                callback: async () => {
                    try {
                        await chrome.storage.local.set({ habitReminderDismissed: today });
                    } catch (e) {
                        // ignore
                    }
                }
            },
            {
                label: 'Jump to Habits',
                primary: true,
                callback: () => {
                    const navItem = document.querySelector(`.nav-item[data-page="dashboard"]`);
                    navItem?.click?.();
                    setTimeout(() => {
                        document.getElementById('habit-tracker-root')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                    }, 250);
                }
            }
        ]
    });
}

// ============================================================================
// DAILY TASK PLANNING REMINDER
// ============================================================================
async function setupDailyTaskReminder() {
    // Load saved settings
    const stored = await chrome.storage.local.get([
        'dailyReminderTime',
        'dailyReminderEnabled',
        'dailyReminderRepeat',
        'dailyReminderDays'
    ]);

    NotificationState.dailyReminderTime = stored.dailyReminderTime || '20:30';
    NotificationState.dailyReminderRepeat = stored.dailyReminderRepeat || 'once';
    NotificationState.dailyReminderDays = stored.dailyReminderDays || [0, 1, 2, 3, 4, 5, 6];
    const reminderEnabled = stored.dailyReminderEnabled !== false; // Default enabled
    NotificationState.dailyReminderEnabled = reminderEnabled;

    if (!reminderEnabled) {
        // Clear any existing intervals
        if (NotificationState.dailyReminderInterval) {
            clearInterval(NotificationState.dailyReminderInterval);
            NotificationState.dailyReminderInterval = null;
        }
        if (NotificationState.repeatReminderInterval) {
            clearInterval(NotificationState.repeatReminderInterval);
            NotificationState.repeatReminderInterval = null;
        }
        return;
    }

    // Clear existing interval
    if (NotificationState.dailyReminderInterval) {
        clearInterval(NotificationState.dailyReminderInterval);
    }

    // Check every minute if it's time for the daily reminder
    NotificationState.dailyReminderInterval = setInterval(checkDailyTaskReminder, 60000);

    // Also check immediately
    setTimeout(checkDailyTaskReminder, 2000);
}

async function checkDailyTaskReminder() {
    if (!NotificationState.dailyReminderEnabled) return;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = now.toISOString().split('T')[0];
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Check if today is an active day for reminders
    if (!NotificationState.dailyReminderDays.includes(dayOfWeek)) return;

    // Check if it's past the reminder time and we need to show it
    const [reminderH, reminderM] = NotificationState.dailyReminderTime.split(':').map(Number);
    const reminderMinutes = reminderH * 60 + reminderM;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // For repeat modes, check if reminder should be shown again
    const stored = await chrome.storage.local.get(['lastDailyReminderDate', 'lastRepeatReminderTime', 'reminderDismissed']);

    // If reminder is already open, don't show again
    if (NotificationState.taskReminderModalOpen) return;

    // Check if reminder was dismissed today
    if (stored.reminderDismissed === today) return;

    // For "once" mode, only show at exact time
    if (NotificationState.dailyReminderRepeat === 'once') {
        if (currentTime !== NotificationState.dailyReminderTime) return;
        if (stored.lastDailyReminderDate === today) return;
    } else {
        // For repeat modes, check if it's past the initial time
        if (currentMinutes < reminderMinutes) return;

        const repeatInterval = NotificationState.dailyReminderRepeat === 'until-dismissed' ? 30 : 60;
        const lastRepeatTime = stored.lastRepeatReminderTime || 0;
        const minutesSinceLastRepeat = Math.floor((Date.now() - lastRepeatTime) / 60000);

        if (minutesSinceLastRepeat < repeatInterval && stored.lastDailyReminderDate === today) return;

        // Update last repeat time
        await chrome.storage.local.set({ lastRepeatReminderTime: Date.now() });
    }

    // Mark as shown for today
    await chrome.storage.local.set({ lastDailyReminderDate: today });

    // Get tomorrow's date
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Check if user has tasks for tomorrow
    const tasks = await ProductivityData.DataStore.getTasks();
    const tomorrowTasks = tasks.filter(t => t.dueDate === tomorrowStr && t.status !== 'completed');

    // Also check today's remaining tasks
    const todayTasks = tasks.filter(t => t.dueDate === today && t.status !== 'completed');

    // Show the persistent reminder modal
    showDailyTaskReminderModal(tomorrowTasks, todayTasks, tomorrowStr);
}

function showDailyTaskReminderModal(tomorrowTasks, todayTasks, tomorrowDate) {
    if (!NotificationState.dailyReminderEnabled) return;
    // Don't show if already open
    if (NotificationState.taskReminderModalOpen) return;
    NotificationState.taskReminderModalOpen = true;

    // Remove any existing modal
    const existingModal = document.getElementById('daily-task-reminder-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'daily-task-reminder-modal';
    modal.className = 'modal active persistent-modal';
    modal.style.zIndex = '10000';

    const hasTomorrowTasks = tomorrowTasks.length > 0;
    const hasTodayTasks = todayTasks.length > 0;

    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header" style="background: linear-gradient(135deg, var(--primary), var(--info)); color: white;">
                <h3><i class="fas fa-bell"></i> Daily Task Planning</h3>
            </div>
            <div class="modal-body">
                ${hasTodayTasks ? `
                    <div class="reminder-section today-tasks-section" style="margin-bottom: 20px; padding: 16px; background: var(--warning-light); border-radius: 12px; border-left: 4px solid var(--warning);">
                        <h4 style="margin: 0 0 12px 0; color: var(--warning); display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-exclamation-triangle"></i> 
                            ${todayTasks.length} Task${todayTasks.length > 1 ? 's' : ''} Left Today
                        </h4>
                        <div class="today-task-list" style="max-height: 150px; overflow-y: auto;">
                            ${todayTasks.map(task => `
                                <div class="reminder-task-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px; background: var(--bg-card); border-radius: 8px; margin-bottom: 8px;">
                                    <span style="flex: 1; font-size: 0.9rem;">${escapeHtml(task.title)}</span>
                                    <button class="btn-sm postpone-task-btn" data-task-id="${task.id}" style="padding: 4px 12px; background: var(--warning); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">
                                        <i class="fas fa-arrow-right"></i> Tomorrow
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                        <button id="postpone-all-today-btn" class="btn-secondary" style="width: 100%; margin-top: 12px;">
                            <i class="fas fa-forward"></i> Postpone All to Tomorrow
                        </button>
                    </div>
                ` : ''}
                
                <div class="reminder-section tomorrow-tasks-section" style="padding: 16px; background: var(--primary-light); border-radius: 12px; border-left: 4px solid var(--primary);">
                    <h4 style="margin: 0 0 12px 0; color: var(--primary); display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-calendar-day"></i> 
                        Tomorrow's Tasks
                    </h4>
                    ${hasTomorrowTasks ? `
                        <div class="tomorrow-task-list" style="max-height: 150px; overflow-y: auto; margin-bottom: 12px;">
                            ${tomorrowTasks.map(task => `
                                <div style="padding: 8px; background: var(--bg-card); border-radius: 8px; margin-bottom: 8px; font-size: 0.9rem;">
                                    <i class="fas fa-check-circle" style="color: var(--primary); margin-right: 8px;"></i>
                                    ${escapeHtml(task.title)}
                                </div>
                            `).join('')}
                        </div>
                        <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">
                            You have ${tomorrowTasks.length} task${tomorrowTasks.length > 1 ? 's' : ''} planned for tomorrow.
                        </p>
                    ` : `
                        <div style="text-align: center; padding: 20px;">
                            <i class="fas fa-inbox" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 12px;"></i>
                            <p style="color: var(--text-muted); margin: 0;">No tasks planned for tomorrow yet.</p>
                            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 8px;">Add some tasks to stay productive!</p>
                        </div>
                    `}
                </div>
            </div>
            <div class="modal-footer" style="flex-direction: column; gap: 12px;">
                <button id="add-tomorrow-task-btn" class="btn-primary" style="width: 100%;">
                    <i class="fas fa-plus"></i> Add Task for Tomorrow
                </button>
                ${hasTomorrowTasks ? `
                    <button id="close-daily-reminder-btn" class="btn-secondary" style="width: 100%;">
                        <i class="fas fa-check"></i> I'm All Set
                    </button>
                ` : `
                    <p style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin: 0;">
                        <i class="fas fa-info-circle"></i> Add at least one task to close this reminder
                    </p>
                `}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Play reminder sound ONLY if the page is visible (user is actually seeing the modal)
    if (document.visibilityState === 'visible') {
        playNotificationSound('reminder');
    }

    // Setup event listeners
    const addTaskBtn = modal.querySelector('#add-tomorrow-task-btn');

    addTaskBtn?.addEventListener('click', async () => {
        // Open task modal with tomorrow's date pre-filled
        if (typeof openTaskModal === 'function') {
            // Mark as handled to prevent reopening
            const today = new Date().toISOString().split('T')[0];
            await chrome.storage.local.set({ reminderDismissed: today });
            NotificationState.taskReminderModalOpen = false;
            modal.remove();
            await openTaskModal({ prefillDate: tomorrowDate });
        }
    });

    const closeBtn = modal.querySelector('#close-daily-reminder-btn');
    closeBtn?.addEventListener('click', async () => {
        // Mark as dismissed for today (won't repeat even in repeat modes)
        const today = new Date().toISOString().split('T')[0];
        await chrome.storage.local.set({ reminderDismissed: today });

        modal.remove();
        NotificationState.taskReminderModalOpen = false;
    });

    // Postpone all button
    const postponeAllBtn = modal.querySelector('#postpone-all-today-btn');
    postponeAllBtn?.addEventListener('click', async () => {
        await postponeAllTodayTasks(tomorrowDate);

        // Mark as dismissed
        const today = new Date().toISOString().split('T')[0];
        await chrome.storage.local.set({ reminderDismissed: today });

        modal.remove();
        NotificationState.taskReminderModalOpen = false;
        showToast('success', 'Tasks Postponed', 'All remaining tasks moved to tomorrow');
    });

    // Individual postpone buttons
    modal.querySelectorAll('.postpone-task-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const taskId = e.currentTarget.dataset.taskId;
            await postponeTaskToTomorrow(taskId, tomorrowDate);
            e.currentTarget.closest('.reminder-task-item').remove();

            // Check if all tasks are postponed
            const remainingTasks = modal.querySelectorAll('.reminder-task-item');
            if (remainingTasks.length === 0) {
                modal.querySelector('.today-tasks-section')?.remove();
            }
        });
    });
}

async function checkAndUpdateDailyReminder(modal, tomorrowDate) {
    if (!modal || !document.body.contains(modal)) return;

    // Check if there are now tasks for tomorrow
    const tasks = await ProductivityData.DataStore.getTasks();
    const tomorrowTasks = tasks.filter(t => t.dueDate === tomorrowDate && t.status !== 'completed');

    if (tomorrowTasks.length > 0) {
        // Show close button
        const footer = modal.querySelector('.modal-footer');
        if (footer && !footer.querySelector('#close-daily-reminder-btn')) {
            const closeBtn = document.createElement('button');
            closeBtn.id = 'close-daily-reminder-btn';
            closeBtn.className = 'btn-secondary';
            closeBtn.style.width = '100%';
            closeBtn.innerHTML = '<i class="fas fa-check"></i> I\'m All Set';
            closeBtn.addEventListener('click', () => {
                modal.remove();
                NotificationState.taskReminderModalOpen = false;
            });
            footer.appendChild(closeBtn);

            // Remove the info message
            const infoP = footer.querySelector('p');
            if (infoP) infoP.remove();
        }

        // Update the tomorrow tasks section
        const tomorrowSection = modal.querySelector('.tomorrow-task-list');
        if (tomorrowSection) {
            tomorrowSection.innerHTML = tomorrowTasks.map(task => `
                <div style="padding: 8px; background: var(--bg-card); border-radius: 8px; margin-bottom: 8px; font-size: 0.9rem;">
                    <i class="fas fa-check-circle" style="color: var(--primary); margin-right: 8px;"></i>
                    ${escapeHtml(task.title)}
                </div>
            `).join('');
        }
    }

    modal.style.display = 'flex';
}

async function postponeTaskToTomorrow(taskId, tomorrowDate) {
    try {
        const tasks = await ProductivityData.DataStore.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            task.dueDate = tomorrowDate;
            await ProductivityData.DataStore.saveTask(task);
            showToast('success', 'Task Postponed', `"${task.title}" moved to tomorrow`);
        }
    } catch (e) {
        console.error('Failed to postpone task:', e);
    }
}

async function postponeAllTodayTasks(tomorrowDate) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const tasks = await ProductivityData.DataStore.getTasks();
        const todayTasks = tasks.filter(t => t.dueDate === today && t.status !== 'completed');

        for (const task of todayTasks) {
            task.dueDate = tomorrowDate;
            await ProductivityData.DataStore.saveTask(task);
        }

        // Reload tasks if on tasks page
        if (typeof loadTasks === 'function' && document.getElementById('page-tasks')?.classList.contains('active')) {
            loadTasks();
        }
    } catch (e) {
        console.error('Failed to postpone all tasks:', e);
    }
}

// Function to manually trigger the daily reminder (for testing or settings)
async function triggerDailyTaskReminder() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const tasks = await ProductivityData.DataStore.getTasks();
    const tomorrowTasks = tasks.filter(t => t.dueDate === tomorrowStr && t.status !== 'completed');
    const todayTasks = tasks.filter(t => t.dueDate === today && t.status !== 'completed');

    showDailyTaskReminderModal(tomorrowTasks, todayTasks, tomorrowStr);
}

// Function to manually trigger the habit reminder (for testing)
async function triggerHabitReminder() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const stored = await chrome.storage.local.get(['habitTrackerCalendar']);
    const habitData = stored.habitTrackerCalendar;
    if (!habitData || typeof habitData !== 'object') {
        showSlidingNotification({
            type: 'info',
            title: 'Daily Habits',
            message: 'No habits found yet. Add a habit in the Habit Tracker.'
        });
        return;
    }

    const goals = habitData.goals && typeof habitData.goals === 'object' ? habitData.goals : {};
    const goalIdsFromMeta = Array.isArray(habitData.goalsMeta)
        ? habitData.goalsMeta.map(g => g?.id).filter(id => typeof id === 'string')
        : [];
    const habitIds = goalIdsFromMeta.length ? goalIdsFromMeta : Object.keys(goals);
    if (!habitIds.length) {
        showSlidingNotification({
            type: 'info',
            title: 'Daily Habits',
            message: 'No habits found yet. Add a habit in the Habit Tracker.'
        });
        return;
    }

    let pendingCount = 0;
    for (const id of habitIds) {
        const completed = goals?.[id]?.completed && typeof goals[id].completed === 'object' ? goals[id].completed : {};
        if (!completed[today]) pendingCount++;
    }

    if (pendingCount <= 0) {
        showSlidingNotification({
            type: 'success',
            title: 'Daily Habits',
            message: 'All habits are complete for today. Nice work!'
        });
        return;
    }

    showSlidingNotification({
        type: 'reminder',
        title: 'Daily Habits',
        message: `You still have ${pendingCount} habit${pendingCount === 1 ? '' : 's'} to complete today.`,
        navigateTo: 'dashboard'
    });
}

// Save habit reminder time setting
async function setHabitReminderTime(time) {
    NotificationState.habitReminderTime = time;
    await chrome.storage.local.set({ habitReminderTime: time });
    setupDailyHabitReminder();
}

async function setHabitReminderEnabled(enabled) {
    NotificationState.habitReminderEnabled = !!enabled;
    try {
        await chrome.storage.local.set({ habitReminderEnabled: !!enabled });
    } catch (e) {
        // ignore
    }

    try {
        await setupDailyHabitReminder();
    } catch (e) {
        // ignore
    }
}

// Save daily reminder time setting
async function setDailyReminderTime(time) {
    NotificationState.dailyReminderTime = time;
    await chrome.storage.local.set({ dailyReminderTime: time });
    setupDailyTaskReminder(); // Restart the scheduler
}

async function checkScheduledNotifications() {
    const now = new Date();

    // Check for streak reminder (evening if no focus today)
    const hour = now.getHours();
    if (hour === 20) { // 8 PM
        const today = now.toISOString().split('T')[0];
        const stats = await ProductivityData.DataStore.getDailyStats(today);

        if (stats.focusMinutes < 15) {
            const streak = await ProductivityData.DataStore.getStreakData();
            if (streak?.currentStreak > 0) {
                notifyStreakMaintenance(streak.currentStreak, {
                    notificationId: `streak-reminder-${today}`,
                    dedupeKey: `streak_reminder_${today}`
                });
            }
        }
    }
}

async function checkReminders() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();


    // Check task reminders
    if (NotificationState.preferences.taskReminders) {
        const tasks = await ProductivityData.DataStore.getTasks();

        // Get all pending tasks with due dates
        const pendingTasks = tasks.filter(t => t.status !== 'completed' && t.dueDate);

        for (const task of pendingTasks) {
            // Skip if user disabled reminders for this task
            if (task.reminderMinutes === -1) continue;

            // Get user's preferred reminder time (default to settings or 15 minutes if not set)
            const defaultReminderMinutes = Number.isFinite(window.App?.settings?.deadlineReminderMinutes)
                ? window.App.settings.deadlineReminderMinutes
                : 15;
            const userReminderMinutes = task.reminderMinutes !== undefined ? task.reminderMinutes : defaultReminderMinutes;

            let dueDateTime;

            if (task.dueTime) {
                // Task has a specific time
                dueDateTime = new Date(`${task.dueDate}T${task.dueTime}`);
            } else {
                // Task only has a date - use end of day (11:59 PM) for consistent reminders
                dueDateTime = new Date(`${task.dueDate}T23:59`);
            }

            const minutesUntilDue = (dueDateTime - now) / (1000 * 60);

            // Calculate when to remind based on user preference
            // Reminder should trigger when minutesUntilDue is within a 2-minute window of userReminderMinutes
            const shouldRemind = minutesUntilDue <= (userReminderMinutes + 1) && minutesUntilDue > (userReminderMinutes - 1);

            // Also trigger if task is overdue (negative minutes) and hasn't been reminded
            const isOverdue = minutesUntilDue < 0 && minutesUntilDue > -60; // Within last hour

            if (shouldRemind || isOverdue) {
                // Check if we already notified for this task's reminder
                const reminderKey = `task_reminder_${task.id}_${userReminderMinutes}_${today}`;
                const overdueKey = `task_overdue_${task.id}_${today}`;
                const key = isOverdue ? overdueKey : reminderKey;
                const alreadyNotified = sessionStorage.getItem(key);

                if (!alreadyNotified) {
                    sessionStorage.setItem(key, 'true');

                    const desktopDedupeKey = isOverdue
                        ? `task_overdue_${task.id}_${today}`
                        : `task_due_${task.id}_${userReminderMinutes}_${today}`;

                    // Show local notification (desktop notification is de-duped globally via background)
                    notifyTaskDue(task, Math.round(minutesUntilDue), {
                        notificationId: isOverdue ? `task-overdue-${task.id}` : `task-due-${task.id}`,
                        dedupeKey: desktopDedupeKey
                    });

                    // Broadcast to all tabs
                    await broadcastTaskReminder(task, Math.round(minutesUntilDue));
                }
            }
        }
    }

    // Check goal deadlines
    if (NotificationState.preferences.goalDeadlines) {
        const goals = await ProductivityData.DataStore.getGoals();
        goals.filter(g => g.status === 'active' && g.targetDate).forEach(goal => {
            const daysLeft = goal.daysRemaining;

            // Notify at 7, 3, and 1 day before
            if (daysLeft !== null && [7, 3, 1].includes(daysLeft)) {
                const reminderKey = `goal_reminder_${goal.id}_${daysLeft}`;
                const alreadyNotified = sessionStorage.getItem(reminderKey);

                if (!alreadyNotified) {
                    sessionStorage.setItem(reminderKey, 'true');
                    notifyGoalDeadline(goal, daysLeft);
                    notifyGoalDeadline(goal, daysLeft, {
                        notificationId: `goal-deadline-${goal.id}-${daysLeft}`,
                        dedupeKey: `goal_deadline_${goal.id}_${daysLeft}`
                    });
                }
            }
        });
    }
}

// ============================================================================
// DO NOT DISTURB
// ============================================================================
function enableDND(durationMinutes = null) {
    NotificationState.dndEnabled = true;

    if (durationMinutes) {
        NotificationState.dndEndTime = new Date(Date.now() + durationMinutes * 60000).toISOString();
    } else {
        NotificationState.dndEndTime = null; // Indefinite
    }

    saveNotificationPreferences();
    updateDNDUI();

    showToast('info', 'Do Not Disturb Enabled',
        durationMinutes ? `For ${durationMinutes} minutes` : 'Until manually disabled');
}

function disableDND() {
    NotificationState.dndEnabled = false;
    NotificationState.dndEndTime = null;
    saveNotificationPreferences();
    updateDNDUI();

    showToast('info', 'Do Not Disturb Disabled', 'Notifications are now enabled');
}

function isDNDActive() {
    if (!NotificationState.dndEnabled) return false;

    if (NotificationState.dndEndTime) {
        const endTime = new Date(NotificationState.dndEndTime);
        if (new Date() > endTime) {
            disableDND();
            return false;
        }
    }

    return true;
}

function updateDNDUI() {
    const toggle = document.getElementById('dnd-toggle');
    if (toggle) {
        toggle.checked = NotificationState.dndEnabled;
    }

    const status = document.getElementById('dnd-status');
    if (status) {
        if (NotificationState.dndEnabled) {
            const remaining = NotificationState.dndEndTime
                ? Math.max(0, Math.round((new Date(NotificationState.dndEndTime) - new Date()) / 60000))
                : null;
            status.textContent = remaining
                ? `${remaining} min remaining`
                : 'On until disabled';
        } else {
            status.textContent = 'Off';
        }
    }
}

// ============================================================================
// NOTIFICATION PREFERENCES UI
// ============================================================================
function renderNotificationSettings() {
    const container = document.getElementById('notification-settings');
    if (!container) return;

    container.innerHTML = `
        <div class="settings-section">
            <h4><i class="fas fa-bell"></i> Notification Settings</h4>
            
            <div class="setting-row">
                <div class="setting-info">
                    <label>Enable Notifications</label>
                    <span class="setting-desc">Master toggle for all notifications</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="notifications-enabled" 
                           ${NotificationState.preferences.enabled ? 'checked' : ''}
                           data-pref="enabled">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="setting-row">
                <div class="setting-info">
                    <label>Sound Effects</label>
                    <span class="setting-desc">Play sounds for notifications</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="notifications-sound" 
                           ${NotificationState.preferences.sound ? 'checked' : ''}
                           data-pref="sound">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="setting-row">
                <div class="setting-info">
                    <label>Desktop Notifications</label>
                    <span class="setting-desc">Show system notifications</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="notifications-desktop" 
                           ${NotificationState.preferences.desktop ? 'checked' : ''}
                           data-pref="desktop">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h4><i class="fas fa-sliders-h"></i> Notification Types</h4>
            
            <div class="setting-row">
                <div class="setting-info">
                    <label>Focus Alerts</label>
                    <span class="setting-desc">Session start, end, and warnings</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" 
                           ${NotificationState.preferences.focusAlerts ? 'checked' : ''}
                           data-pref="focusAlerts">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="setting-row">
                <div class="setting-info">
                    <label>Break Reminders</label>
                    <span class="setting-desc">Break start and end notifications</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" 
                           ${NotificationState.preferences.breakReminders ? 'checked' : ''}
                           data-pref="breakReminders">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="setting-row">
                <div class="setting-info">
                    <label>Task Reminders</label>
                    <span class="setting-desc">Due date and deadline alerts</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" 
                           ${NotificationState.preferences.taskReminders ? 'checked' : ''}
                           data-pref="taskReminders">
                    <span class="toggle-slider"></span>
                </label>
            </div>

            <div class="setting-row">
                <div class="setting-info">
                    <label>Daily Planning Reminder</label>
                    <span class="setting-desc">Daily task planning popup (can be persistent)</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" 
                           ${NotificationState.dailyReminderEnabled ? 'checked' : ''}
                           data-action="toggle-daily-reminder">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="setting-row">
                <div class="setting-info">
                    <label>Goal Deadlines</label>
                    <span class="setting-desc">Goal and milestone reminders</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" 
                           ${NotificationState.preferences.goalDeadlines ? 'checked' : ''}
                           data-pref="goalDeadlines">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="setting-row">
                <div class="setting-info">
                    <label>Streak Reminders</label>
                    <span class="setting-desc">Keep your streak alive</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" 
                           ${NotificationState.preferences.streakReminders ? 'checked' : ''}
                           data-pref="streakReminders">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h4><i class="fas fa-moon"></i> Do Not Disturb</h4>
            
            <div class="setting-row">
                <div class="setting-info">
                    <label>Do Not Disturb</label>
                    <span class="setting-desc" id="dnd-status">${NotificationState.dndEnabled ? 'On' : 'Off'}</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="dnd-toggle" 
                           ${NotificationState.dndEnabled ? 'checked' : ''}
                           data-action="toggle-dnd">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="dnd-quick-options">
                <button class="btn-small" data-action="dnd-30">30 min</button>
                <button class="btn-small" data-action="dnd-60">1 hour</button>
                <button class="btn-small" data-action="dnd-120">2 hours</button>
                <button class="btn-small" data-action="dnd-indefinite">Indefinite</button>
            </div>
        </div>
        
        ${NotificationState.permission !== 'granted' ? `
            <div class="permission-banner">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Desktop notifications are not enabled.</span>
                <button class="btn-primary small" data-action="request-permission">
                    Enable
                </button>
            </div>
        ` : ''}
    `;

    // Setup settings listeners
    setupNotificationSettingsListeners();
}

function setupNotificationSettingsListeners() {
    // Preference toggles
    document.querySelectorAll('[data-pref]').forEach(el => {
        el.addEventListener('change', () => {
            updateNotificationPref(el.dataset.pref, el.checked);
        });
    });

    // Daily planning reminder toggle
    document.querySelector('[data-action="toggle-daily-reminder"]')?.addEventListener('change', function () {
        setDailyReminderEnabled(!!this.checked);
    });

    // DND toggle
    document.querySelector('[data-action="toggle-dnd"]')?.addEventListener('change', function () {
        if (this.checked) {
            enableDND();
        } else {
            disableDND();
        }
    });

    // DND quick options
    document.querySelector('[data-action="dnd-30"]')?.addEventListener('click', () => enableDND(30));
    document.querySelector('[data-action="dnd-60"]')?.addEventListener('click', () => enableDND(60));
    document.querySelector('[data-action="dnd-120"]')?.addEventListener('click', () => enableDND(120));
    document.querySelector('[data-action="dnd-indefinite"]')?.addEventListener('click', () => enableDND());

    // Permission request
    document.querySelector('[data-action="request-permission"]')?.addEventListener('click', requestNotificationPermission);
}

async function updateNotificationPref(key, value) {
    NotificationState.preferences[key] = value;
    await saveNotificationPreferences();

    // Keep background/content reminder behavior in sync.
    if (key === 'taskReminders' || key === 'enabled') {
        try {
            const enabled = (NotificationState.preferences.enabled !== false) && (NotificationState.preferences.taskReminders !== false);
            await chrome.storage.local.set({ taskRemindersEnabled: enabled });
        } catch (e) {
            // ignore
        }
    }
}

// Enable/disable the daily planning reminder (persistent modal)
async function setDailyReminderEnabled(enabled) {
    NotificationState.dailyReminderEnabled = !!enabled;
    try {
        await chrome.storage.local.set({ dailyReminderEnabled: !!enabled });
    } catch (e) {
        // ignore
    }

    if (!enabled) {
        document.getElementById('daily-task-reminder-modal')?.remove();
        NotificationState.taskReminderModalOpen = false;
    }

    // Restart scheduler so the change takes effect immediately.
    try {
        await setupDailyTaskReminder();
    } catch (e) {
        // ignore
    }

    // If disabled, close any open modal right away.
    if (!enabled) {
        const existingModal = document.getElementById('daily-task-reminder-modal');
        if (existingModal) {
            existingModal.remove();
            NotificationState.taskReminderModalOpen = false;
        }
    }
}

// ============================================================================
// NOTIFICATION HISTORY
// ============================================================================
function addToHistory(type, title, message) {
    NotificationState.history.push({
        id: Date.now(),
        type,
        title,
        message,
        timestamp: new Date().toISOString(),
        read: false
    });

    // Keep last 50
    if (NotificationState.history.length > 50) {
        NotificationState.history = NotificationState.history.slice(-50);
    }

    saveNotificationHistory();
    updateNotificationBadge();
}

function updateNotificationBadge() {
    const unreadCount = NotificationState.history.filter(n => !n.read).length;
    const badge = document.getElementById('notification-badge');

    if (badge) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }
}

function markNotificationAsRead(notificationId) {
    // Find notification in history by tag/id
    const notification = NotificationState.history.find(n =>
        n.id === notificationId || n.tag === notificationId
    );

    if (notification) {
        notification.read = true;
        saveNotificationHistory();
    }

    // Update the badge count
    updateNotificationBadge();

    // Also clear the tasks/schedule badge if relevant
    if (notificationId && (notificationId.includes('task') || notificationId.includes('due'))) {
        const tasksBadge = document.getElementById('tasks-badge');
        if (tasksBadge) {
            const current = parseInt(tasksBadge.textContent) || 0;
            if (current > 0) {
                tasksBadge.textContent = current - 1;
                if (current - 1 <= 0) {
                    tasksBadge.style.display = 'none';
                }
            }
        }
    }
}

function markAllNotificationsRead() {
    NotificationState.history.forEach(n => n.read = true);
    saveNotificationHistory();
    updateNotificationBadge();
}

function renderNotificationHistory() {
    const container = document.getElementById('notification-history');
    if (!container) return;

    if (NotificationState.history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bell-slash"></i>
                <p>No notifications yet</p>
            </div>
        `;
        return;
    }

    const sortedHistory = [...NotificationState.history].reverse();

    container.innerHTML = `
        <div class="notification-list">
            ${sortedHistory.map(n => `
                <div class="notification-item ${n.read ? 'read' : 'unread'}" data-id="${n.id}">
                    <div class="notification-icon ${n.type}">
                        <i class="fas ${getToastIcon(n.type)}"></i>
                    </div>
                    <div class="notification-content">
                        <div class="notification-title">${escapeHtml(n.title)}</div>
                        ${n.message ? `<div class="notification-message">${escapeHtml(n.message)}</div>` : ''}
                        <div class="notification-time">${formatNotificationTime(n.timestamp)}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function formatNotificationTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
}

// Note: playNotificationSound is defined at the top of this file using Web Audio API
// The function at line ~61 creates professional bell sounds

// ============================================================================
// CROSS-TAB NOTIFICATION BROADCASTING
// ============================================================================

/**
 * Broadcast a task reminder to all open tabs
 * This sends a message to the background script which then broadcasts to all tabs
 */
async function broadcastTaskReminder(task, minutesUntilDue) {
    if (!task) return;

    try {
        // Build message based on how soon the task is due
        let message;
        if (minutesUntilDue === 0) {
            message = `🚨 "${task.title}" is due NOW!`;
        } else if (minutesUntilDue <= 15) {
            message = `⚠️ "${task.title}" is due in ${minutesUntilDue} minutes!`;
        } else {
            message = `📋 "${task.title}" is due in ${minutesUntilDue} minutes`;
        }

        // Send message to background script to broadcast
        await chrome.runtime.sendMessage({
            action: 'BROADCAST_REMINDER',
            data: {
                type: 'task',
                taskId: task.id,
                taskTitle: task.title,
                taskPriority: task.priority || 'medium',
                taskDue: task.dueDate,
                taskDueTime: task.dueTime,
                minutesUntilDue: minutesUntilDue,
                message: message,
                taskCount: 1
            }
        });

    } catch (e) {
        console.error('[Notifications] Failed to broadcast reminder:', e);
    }
}

/**
 * Broadcast a custom reminder message to all tabs
 */
async function broadcastCustomReminder(title, message, options = {}) {
    try {
        await chrome.runtime.sendMessage({
            action: 'BROADCAST_REMINDER',
            data: {
                type: options.type || 'reminder',
                title: title,
                message: message,
                priority: options.priority || 'medium',
                actionUrl: options.actionUrl
            }
        });

    } catch (e) {
        console.error('[Notifications] Failed to broadcast reminder:', e);
    }
}

/**
 * Check for pending task reminders and broadcast them
 * This should be called periodically
 */
async function checkAndBroadcastReminders() {
    if (!NotificationState.preferences.taskReminders) return;

    try {
        const tasks = await ProductivityData.DataStore.getTasks();
        const now = new Date();

        // Find tasks due soon (within 30 minutes)
        const dueSoonTasks = tasks.filter(task => {
            if (task.completed) return false;
            if (!task.dueDate) return false;

            const dueDate = new Date(task.dueDate);
            const timeDiff = dueDate - now;

            // Due within 30 minutes but not past due by more than 1 hour
            return timeDiff > -3600000 && timeDiff < 1800000;
        });

        for (const task of dueSoonTasks) {
            // Check if we already reminded about this task recently
            const reminderKey = `reminder_${task.id}`;
            const lastReminder = sessionStorage.getItem(reminderKey);

            if (!lastReminder || (now - new Date(lastReminder)) > 900000) { // 15 minutes
                await broadcastTaskReminder(task);
                sessionStorage.setItem(reminderKey, now.toISOString());
            }
        }
    } catch (e) {
        console.error('[Notifications] Error checking reminders:', e);
    }
}

// Start periodic reminder check (every 5 minutes) - only if not already running
if (!NotificationState.broadcastReminderInterval) {
    NotificationState.broadcastReminderInterval = setInterval(checkAndBroadcastReminders, 300000);
}

// ============================================================================
// DAILY ACCOUNTABILITY CHECK-IN SYSTEM
// ============================================================================

let accountabilityCheckinInterval = null;

async function initAccountabilityCheckin() {
    try {
        const settings = await ProductivityData.DataStore.getSettings();
        if (!settings.dailyCheckinEnabled) return;

        // Schedule daily check-in
        scheduleAccountabilityCheckin(settings.dailyCheckinTime);
    } catch (error) {
        console.error('Failed to init accountability check-in:', error);
    }
}

function scheduleAccountabilityCheckin(time = '21:00') {
    if (accountabilityCheckinInterval) {
        clearInterval(accountabilityCheckinInterval);
    }

    const checkTime = async () => {
        const now = new Date();
        const [hours, minutes] = time.split(':').map(Number);

        if (now.getHours() === hours && now.getMinutes() === minutes) {
            await showAccountabilityCheckinModal();
        }
    };

    // Check every minute
    accountabilityCheckinInterval = setInterval(checkTime, 60000);

    // Also check immediately
    checkTime();
}

async function showAccountabilityCheckinModal() {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Check if already completed today
        const existingCheckin = await ProductivityData.DataStore.getCheckinForDate(today);
        if (existingCheckin) return;

        // Check DND mode
        if (isDNDActive()) return;

        // Gather today's data
        const goals = await ProductivityData.DataStore.getGoals();
        const activeGoals = goals.filter(g => g.status === 'active');
        const tasks = await ProductivityData.DataStore.getTasks();
        const todaysTasks = tasks.filter(t =>
            t.completedAt && t.completedAt.startsWith(today)
        );

        // Get today's activity from motivation system
        const todaysActivity = window.MotivationSystem?.state?.activityLog?.[today] ||
            { tasks: 0, focusSessions: 0, minutes: 0 };

        // Get overdue tasks for "blockers" prompt
        const overdueTasks = tasks.filter(t => t.isOverdue && t.status !== 'completed');

        // Create modal if doesn't exist
        let modal = document.getElementById('accountability-checkin-modal');
        if (modal) modal.remove();

        modal = createAccountabilityCheckinModal();

        // Populate modal
        populateCheckinModal(modal, {
            activeGoals,
            todaysTasks,
            todaysActivity,
            overdueTasks
        });

        modal.classList.add('active');

        // Play notification sound
        if (NotificationState.preferences.sound) {
            playNotificationSound('reminder');
        }
    } catch (error) {
        console.error('Failed to show accountability check-in:', error);
    }
}

function createAccountabilityCheckinModal() {
    const modal = document.createElement('div');
    modal.id = 'accountability-checkin-modal';
    modal.className = 'modal persistent';

    modal.innerHTML = `
        <div class="modal-content large checkin-content">
            <div class="modal-header checkin-header">
                <div class="checkin-header-content">
                    <h2><i class="fas fa-clipboard-check"></i> Daily Check-in</h2>
                    <span class="checkin-date" id="checkin-date"></span>
                </div>
            </div>
            <div class="modal-body checkin-body">
                <!-- Today's Summary -->
                <div class="checkin-section">
                    <h3><i class="fas fa-chart-line"></i> Today's Summary</h3>
                    <div class="checkin-stats-grid">
                        <div class="checkin-stat">
                            <span class="stat-value" id="checkin-tasks-count">0</span>
                            <span class="stat-label">Tasks Completed</span>
                        </div>
                        <div class="checkin-stat">
                            <span class="stat-value" id="checkin-focus-count">0</span>
                            <span class="stat-label">Focus Sessions</span>
                        </div>
                        <div class="checkin-stat">
                            <span class="stat-value" id="checkin-minutes-count">0</span>
                            <span class="stat-label">Minutes Focused</span>
                        </div>
                    </div>
                </div>

                <!-- Goals Progress -->
                <div class="checkin-section">
                    <h3><i class="fas fa-bullseye"></i> Goals I Worked On Today</h3>
                    <div class="checkin-goals-list" id="checkin-goals-list">
                        <!-- Populated dynamically -->
                    </div>
                </div>

                <!-- Blockers Section (if overdue tasks) -->
                <div class="checkin-section" id="blockers-section" hidden>
                    <h3><i class="fas fa-exclamation-triangle"></i> What's Blocking You?</h3>
                    <div class="overdue-tasks-list" id="overdue-tasks-list"></div>
                    <div class="form-group">
                        <textarea id="checkin-blockers" rows="2"
                                  placeholder="What's preventing you from completing these tasks?"></textarea>
                    </div>
                </div>

                <!-- Reflection -->
                <div class="checkin-section">
                    <h3><i class="fas fa-lightbulb"></i> Reflection</h3>
                    <div class="form-group">
                        <label>How do you feel about today's progress?</label>
                        <div class="mood-rating" id="mood-rating">
                            <button type="button" class="mood-btn" data-mood="1" title="Very Unproductive">
                                <i class="fas fa-frown"></i>
                            </button>
                            <button type="button" class="mood-btn" data-mood="2" title="Could Be Better">
                                <i class="fas fa-meh"></i>
                            </button>
                            <button type="button" class="mood-btn selected" data-mood="3" title="Okay">
                                <i class="fas fa-smile"></i>
                            </button>
                            <button type="button" class="mood-btn" data-mood="4" title="Good">
                                <i class="fas fa-grin"></i>
                            </button>
                            <button type="button" class="mood-btn" data-mood="5" title="Excellent!">
                                <i class="fas fa-grin-stars"></i>
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Any thoughts or reflections?</label>
                        <textarea id="checkin-reflection" rows="3"
                                  placeholder="What went well? What could be improved?"></textarea>
                    </div>
                </div>

                <!-- Tomorrow's Commitment -->
                <div class="checkin-section">
                    <h3><i class="fas fa-calendar-day"></i> Tomorrow's Commitment</h3>
                    <div class="form-group">
                        <label>What will you focus on tomorrow?</label>
                        <input type="text" id="checkin-tomorrow"
                               placeholder="I will focus on...">
                    </div>
                </div>
            </div>
            <div class="modal-footer checkin-footer">
                <button class="btn-secondary" id="skip-checkin-btn">
                    <i class="fas fa-forward"></i> Skip Today
                </button>
                <button class="btn-primary" id="submit-checkin-btn">
                    <i class="fas fa-check"></i> Complete Check-in
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    setupCheckinModalListeners(modal);
    return modal;
}

function populateCheckinModal(modal, data) {
    const { activeGoals, todaysTasks, todaysActivity, overdueTasks } = data;

    // Set date
    const today = new Date();
    document.getElementById('checkin-date').textContent =
        today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    // Set stats
    document.getElementById('checkin-tasks-count').textContent = todaysTasks.length;
    document.getElementById('checkin-focus-count').textContent = todaysActivity.focusSessions || 0;
    document.getElementById('checkin-minutes-count').textContent = todaysActivity.minutes || 0;

    // Render goals
    const goalsList = document.getElementById('checkin-goals-list');
    if (activeGoals.length > 0) {
        goalsList.innerHTML = activeGoals.map(goal => `
            <div class="checkin-goal-item">
                <label class="checkin-goal-checkbox">
                    <input type="checkbox" data-goal-id="${goal.id}">
                    <span class="checkmark"></span>
                </label>
                <div class="checkin-goal-info">
                    <span class="goal-title">${typeof escapeHtml === 'function' ? escapeHtml(goal.title) : goal.title}</span>
                    <div class="goal-progress-mini">
                        <div class="progress-bar-mini">
                            <div class="progress-fill" style="width: ${goal.progress}%"></div>
                        </div>
                        <span>${goal.progress}%</span>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        goalsList.innerHTML = '<p class="no-goals">No active goals. Consider setting a goal!</p>';
    }

    // Render blockers section if there are overdue tasks
    const blockersSection = document.getElementById('blockers-section');
    const overdueList = document.getElementById('overdue-tasks-list');

    if (overdueTasks.length > 0) {
        blockersSection.hidden = false;
        overdueList.innerHTML = overdueTasks.slice(0, 5).map(task => `
            <div class="overdue-task-item">
                <i class="fas fa-exclamation-circle"></i>
                <span>${typeof escapeHtml === 'function' ? escapeHtml(task.title) : task.title}</span>
                <span class="overdue-days">${Math.abs(task.daysUntilDue || 0)} days overdue</span>
            </div>
        `).join('');
    } else {
        blockersSection.hidden = true;
    }
}

function setupCheckinModalListeners(modal) {
    // Mood rating
    modal.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    // Skip button
    document.getElementById('skip-checkin-btn')?.addEventListener('click', () => {
        modal.classList.remove('active');
        modal.remove();
    });

    // Submit button
    document.getElementById('submit-checkin-btn')?.addEventListener('click', async () => {
        await submitAccountabilityCheckin(modal);
    });
}

async function submitAccountabilityCheckin(modal) {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Gather checked goals
        const checkedGoals = Array.from(modal.querySelectorAll('.checkin-goal-checkbox input:checked'))
            .map(input => input.dataset.goalId);

        // Get mood
        const selectedMood = modal.querySelector('.mood-btn.selected');
        const moodRating = parseInt(selectedMood?.dataset.mood) || 3;

        // Get text inputs
        const reflection = document.getElementById('checkin-reflection')?.value.trim() || '';
        const blockers = document.getElementById('checkin-blockers')?.value.trim() || '';
        const tomorrow = document.getElementById('checkin-tomorrow')?.value.trim() || '';

        // Get today's stats
        const todaysActivity = window.MotivationSystem?.state?.activityLog?.[today] ||
            { tasks: 0, focusSessions: 0, minutes: 0 };

        // Create checkin record
        const checkin = new ProductivityData.AccountabilityCheckin({
            date: today,
            goalsWorkedOn: checkedGoals,
            tasksCompleted: todaysActivity.tasks || 0,
            focusMinutes: todaysActivity.minutes || 0,
            reflection: reflection,
            blockers: blockers,
            mood: moodRating,
            tomorrowCommitment: tomorrow
        });

        await ProductivityData.DataStore.saveAccountabilityCheckin(checkin);

        // Update check-in streak
        const stats = await ProductivityData.DataStore.getCommitmentStats();
        stats.checkinStreak = (stats.checkinStreak || 0) + 1;
        if (stats.checkinStreak > (stats.longestCheckinStreak || 0)) {
            stats.longestCheckinStreak = stats.checkinStreak;
        }
        stats.lastUpdated = today;
        await ProductivityData.DataStore.saveCommitmentStats(stats);

        // Award XP for completing check-in
        if (typeof window.MotivationSystem?.awardXP === 'function') {
            window.MotivationSystem.awardXP(15, 'Daily check-in completed');
        }

        modal.classList.remove('active');
        modal.remove();

        showToast('success', 'Check-in Complete', 'Great job reflecting on your day! +15 XP');
    } catch (error) {
        console.error('Failed to submit check-in:', error);
        showToast('error', 'Check-in Failed', 'Could not save your check-in. Please try again.');
    }
}

// Trigger check-in manually (for testing or settings)
async function triggerAccountabilityCheckin() {
    await showAccountabilityCheckinModal();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
// escapeHtml is now provided by utils.js

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================
window.initNotificationSystem = initNotificationSystem;
window.showToast = showToast;
window.showSlidingNotification = showSlidingNotification;
window.showDesktopNotification = showDesktopNotification;
window.requestNotificationPermission = requestNotificationPermission;
window.broadcastTaskReminder = broadcastTaskReminder;
window.broadcastCustomReminder = broadcastCustomReminder;
window.checkAndBroadcastReminders = checkAndBroadcastReminders;
window.notifyFocusStart = notifyFocusStart;
window.notifyFocusEnd = notifyFocusEnd;
window.notifyFocusWarning = notifyFocusWarning;
window.notifyBreakStart = notifyBreakStart;
window.notifyBreakEnd = notifyBreakEnd;
window.notifyTaskDue = notifyTaskDue;
window.notifyTaskComplete = notifyTaskComplete;
window.notifyGoalDeadline = notifyGoalDeadline;
window.notifyGoalComplete = notifyGoalComplete;
window.notifyMilestoneComplete = notifyMilestoneComplete;
window.notifyStreakMaintenance = notifyStreakMaintenance;
window.notifyStreakAchievement = notifyStreakAchievement;
window.notifyAchievementUnlocked = notifyAchievementUnlocked;
window.enableDND = enableDND;
window.disableDND = disableDND;
window.updateNotificationPref = updateNotificationPref;
window.renderNotificationSettings = renderNotificationSettings;
window.renderNotificationHistory = renderNotificationHistory;
window.markAllNotificationsRead = markAllNotificationsRead;
window.markNotificationAsRead = markNotificationAsRead;
window.setupDailyTaskReminder = setupDailyTaskReminder;
window.triggerDailyTaskReminder = triggerDailyTaskReminder;
window.setDailyReminderTime = setDailyReminderTime;
window.playNotificationSound = playNotificationSound;
window.NotificationState = NotificationState;

// ============================================================================
// AUTO-INITIALIZATION
// ============================================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotificationSystem);
} else {
    initNotificationSystem();
}

// Notification system loaded