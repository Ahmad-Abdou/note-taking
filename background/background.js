// ============================================================================
// SITE BLOCKER FUNCTIONALITY
// ============================================================================
let blockerState = {
    enabled: false,
    blockedSites: [],
    whitelist: []
};

// ============================================================================
// WEBSITE TIME TRACKING
// ============================================================================
let timeTrackingState = {
    timeLimits: [],           // Array of time limit objects
    dailyUsage: null,         // Today's usage data
    currentDomain: null,      // Currently active domain
    trackingInterval: null,   // Interval ID for tracking
    lastUpdateTime: null      // Last time we updated usage
};

// ============================================================================
// PRODUCTIVITY NOTIFICATIONS (BACKGROUND)
// ============================================================================
const PROD_STORAGE_KEYS = {
    TASKS: 'productivity_tasks',
    GOALS: 'productivity_goals',
    SETTINGS: 'productivity_settings',
    DAILY_STATS: 'productivity_daily_stats',
    STREAKS: 'productivity_streaks'
};

const PROD_NOTIF_ALARM_NAME = 'productivity_notifications_tick';
const PROD_NOTIF_DEDUPE_KEY = 'productivity_notification_dedupe';

function getTodayDateStr() {
    return new Date().toISOString().split('T')[0];
}

async function getNotificationRuntimeState() {
    const result = await chrome.storage.local.get([PROD_STORAGE_KEYS.SETTINGS]);
    const settings = result[PROD_STORAGE_KEYS.SETTINGS] || {};

    const defaults = {
        enabled: true,
        desktop: true,
        focusAlerts: true,
        taskReminders: true,
        goalDeadlines: true,
        streakReminders: true
    };

    const prefs = {
        ...defaults,
        ...(settings.notificationPreferences || {})
    };

    const dndEnabled = settings.dndEnabled || false;
    const dndEndTime = settings.dndEndTime || null;
    return { prefs, dndEnabled, dndEndTime };
}

function isDndActive(dndEnabled, dndEndTime) {
    if (!dndEnabled) return false;
    if (!dndEndTime) return true;
    const end = new Date(dndEndTime);
    if (Number.isNaN(end.getTime())) return false;
    return new Date() < end;
}

async function getNotifDedupeMap() {
    const result = await chrome.storage.local.get([PROD_NOTIF_DEDUPE_KEY]);
    return result[PROD_NOTIF_DEDUPE_KEY] || {};
}

async function markNotifSentOnce(key) {
    const dedupe = await getNotifDedupeMap();
    if (dedupe[key]) return false;
    dedupe[key] = Date.now();
    await chrome.storage.local.set({ [PROD_NOTIF_DEDUPE_KEY]: dedupe });
    return true;
}

async function markNotifSentWithTtl(key, ttlMs) {
    const now = Date.now();
    const dedupe = await getNotifDedupeMap();
    const last = dedupe[key];
    if (last && (now - last) < ttlMs) return false;
    dedupe[key] = now;
    await chrome.storage.local.set({ [PROD_NOTIF_DEDUPE_KEY]: dedupe });
    return true;
}

const __productivityNotifKeyLocks = new Map();

function withNotifKeyLock(key, fn) {
    if (!key) return fn();
    const prev = __productivityNotifKeyLocks.get(key) || Promise.resolve();
    const next = prev
        .catch(() => { })
        .then(fn)
        .finally(() => {
            if (__productivityNotifKeyLocks.get(key) === next) {
                __productivityNotifKeyLocks.delete(key);
            }
        });
    __productivityNotifKeyLocks.set(key, next);
    return next;
}

function createDesktopNotification(notificationId, title, message, requireInteraction = false) {
    if (!chrome.notifications?.create) return;
    try {
        chrome.notifications.create(notificationId, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon48.png'),
            title,
            message,
            priority: 2,
            requireInteraction
        });
    } catch (e) {
        // Ignore
    }
}

function parseLocalDateTime(dateStr, timeStr) {
    // dateStr: YYYY-MM-DD, timeStr: HH:MM
    if (!dateStr) return null;
    try {
        return new Date(timeStr ? `${dateStr}T${timeStr}` : `${dateStr}T00:00:00`);
    } catch (e) {
        return null;
    }
}

async function checkTaskDeadlineNotifications() {
    const result = await chrome.storage.local.get([PROD_STORAGE_KEYS.TASKS]);
    const tasks = result[PROD_STORAGE_KEYS.TASKS] || [];
    if (!Array.isArray(tasks) || tasks.length === 0) return;

    const now = new Date();
    const today = getTodayDateStr();
    const hour = now.getHours();

    for (const task of tasks) {
        if (!task || task.status === 'completed') continue;
        if (!task.dueDate) continue;
        if (task.reminderMinutes === -1) continue;

        // Tasks with explicit due time: reminderMinutes before due time
        if (task.dueTime) {
            const due = parseLocalDateTime(task.dueDate, task.dueTime);
            if (!due) continue;

            const reminderMinutes = (task.reminderMinutes !== undefined && task.reminderMinutes !== null)
                ? Number(task.reminderMinutes)
                : 15;
            const minutesUntilDue = Math.round((due - now) / 60000);

            const shouldRemindWindow = minutesUntilDue <= reminderMinutes && minutesUntilDue > (reminderMinutes - 1);
            const isOverdueRecent = minutesUntilDue < 0 && minutesUntilDue >= -60;

            if (shouldRemindWindow) {
                const key = `task_due_${task.id}_${reminderMinutes}_${today}`;
                if (await markNotifSentOnce(key)) {
                    const msg = `"${task.title || 'Task'}" is due in ${reminderMinutes} minutes.`;
                    createDesktopNotification(`task-due-${task.id}`, '⏰ Task Due Soon', msg, true);
                }
            }

            if (isOverdueRecent) {
                const key = `task_overdue_${task.id}_${today}`;
                if (await markNotifSentOnce(key)) {
                    const msg = `"${task.title || 'Task'}" is overdue.`;
                    createDesktopNotification(`task-overdue-${task.id}`, '🚨 Task Overdue', msg, true);
                }
            }

            continue;
        }

        // Tasks without due time: morning reminder on due date (8–10 AM)
        if (task.dueDate === today && hour >= 8 && hour < 10) {
            const key = `task_due_today_${task.id}_${today}`;
            if (await markNotifSentOnce(key)) {
                const msg = `"${task.title || 'Task'}" is due today.`;
                createDesktopNotification(`task-due-today-${task.id}`, '📋 Task Due Today', msg, false);
            }
        }
    }
}

async function checkGoalDeadlineNotifications() {
    const result = await chrome.storage.local.get([PROD_STORAGE_KEYS.GOALS]);
    const goals = result[PROD_STORAGE_KEYS.GOALS] || [];
    if (!Array.isArray(goals) || goals.length === 0) return;

    const now = new Date();
    const thresholds = new Set([7, 3, 1, 0]);

    for (const goal of goals) {
        if (!goal || goal.status !== 'active') continue;
        if (!goal.targetDate) continue;

        const due = parseLocalDateTime(goal.targetDate, '23:59');
        if (!due) continue;
        const daysLeft = Math.ceil((due - now) / 86400000);

        if (!thresholds.has(daysLeft)) continue;
        const key = `goal_deadline_${goal.id}_${daysLeft}`;
        if (!(await markNotifSentOnce(key))) continue;

        const msg = daysLeft === 0
            ? `"${goal.title || 'Goal'}" is due today.`
            : `"${goal.title || 'Goal'}" is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`;
        createDesktopNotification(`goal-deadline-${goal.id}-${daysLeft}`, '🎯 Goal Deadline', msg, false);
    }
}

async function checkStreakReminderNotification() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    if (hour !== 20) return;
    // Allow a small window in case the worker wakes slightly late
    if (minute > 5) return;

    const today = getTodayDateStr();
    const key = `streak_reminder_${today}`;
    if (!(await markNotifSentOnce(key))) return;

    const result = await chrome.storage.local.get([PROD_STORAGE_KEYS.DAILY_STATS, PROD_STORAGE_KEYS.STREAKS]);
    const allStats = result[PROD_STORAGE_KEYS.DAILY_STATS] || {};
    const todayStats = allStats[today] || {};
    const focusMinutes = Number(todayStats.focusMinutes || 0);

    const streakData = result[PROD_STORAGE_KEYS.STREAKS] || {};
    const currentStreak = Number(streakData.currentStreak || 0);

    if (currentStreak <= 0) return;
    if (focusMinutes >= 15) return;

    createDesktopNotification(
        `streak-reminder-${today}`,
        '🔥 Streak Reminder',
        `You have a ${currentStreak}-day streak. Do a quick focus session to keep it alive!`,
        true
    );
}

async function runProductivityNotificationTick() {
    try {
        const { prefs, dndEnabled, dndEndTime } = await getNotificationRuntimeState();
        if (!prefs.enabled || !prefs.desktop) return;
        if (isDndActive(dndEnabled, dndEndTime)) return;

        if (prefs.taskReminders) {
            await checkTaskDeadlineNotifications();
        }
        if (prefs.goalDeadlines) {
            await checkGoalDeadlineNotifications();
        }
        if (prefs.streakReminders) {
            await checkStreakReminderNotification();
        }
    } catch (e) {
        // Ignore
    }
}

async function initProductivityNotificationAlarms() {
    if (!chrome.alarms?.create) return;
    try {
        chrome.alarms.create(PROD_NOTIF_ALARM_NAME, { periodInMinutes: 1 });
    } catch (e) {
        // Ignore
    }

    // Run once on init for responsiveness
    runProductivityNotificationTick();
}

chrome.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm?.name === PROD_NOTIF_ALARM_NAME) {
        runProductivityNotificationTick();
    }
});

// Initialize time tracking on startup
async function initTimeTracking() {
    console.log('[TimeTracker] Initializing...');
    await loadTimeLimits();
    await loadDailyUsage();
    startTimeTracking();
}

// Load time limits from storage
async function loadTimeLimits() {
    try {
        const result = await chrome.storage.local.get(['productivity_website_time_limits']);
        timeTrackingState.timeLimits = result.productivity_website_time_limits || [];
        console.log('[TimeTracker] Loaded', timeTrackingState.timeLimits.length, 'time limits');
    } catch (e) {
        console.error('[TimeTracker] Error loading time limits:', e);
    }
}

// Load daily usage from storage
async function loadDailyUsage() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const result = await chrome.storage.local.get(['productivity_website_daily_usage']);
        const stored = result.productivity_website_daily_usage;

        if (stored && stored.date === today) {
            timeTrackingState.dailyUsage = stored;
        } else {
            // New day - reset usage
            timeTrackingState.dailyUsage = {
                date: today,
                sites: {},
                blockedUntilNextDay: []
            };
            await saveDailyUsage();
        }
        console.log('[TimeTracker] Loaded daily usage for', today);
    } catch (e) {
        console.error('[TimeTracker] Error loading daily usage:', e);
    }
}

// Save daily usage to storage
async function saveDailyUsage() {
    try {
        await chrome.storage.local.set({
            productivity_website_daily_usage: timeTrackingState.dailyUsage
        });
    } catch (e) {
        console.error('[TimeTracker] Error saving daily usage:', e);
    }
}

// Normalize domain for matching
function normalizeDomain(url) {
    if (!url) return '';
    try {
        // Handle full URLs
        if (url.startsWith('http://') || url.startsWith('https://')) {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '').toLowerCase();
        }
        // Handle domain strings
        return url.replace(/^(https?:\/\/)?(www\.)?/i, '').split('/')[0].split(':')[0].toLowerCase();
    } catch (e) {
        return url.replace(/^(https?:\/\/)?(www\.)?/i, '').split('/')[0].toLowerCase();
    }
}

// Check if a domain matches any time limit
function getTimeLimitForDomain(domain) {
    domain = normalizeDomain(domain);
    return timeTrackingState.timeLimits.find(limit => {
        const limitDomain = normalizeDomain(limit.domain);
        return limit.isEnabled !== false && (domain === limitDomain || domain.endsWith('.' + limitDomain));
    });
}

// Check if domain is blocked for today
function isDomainBlockedForToday(domain) {
    domain = normalizeDomain(domain);
    return timeTrackingState.dailyUsage?.blockedUntilNextDay?.includes(domain) || false;
}

// Get time spent on domain today
function getTimeSpentOnDomain(domain) {
    domain = normalizeDomain(domain);
    return timeTrackingState.dailyUsage?.sites?.[domain] || 0;
}

// Add time to domain and check limit
async function addTimeToCurrentDomain(minutes) {
    if (!timeTrackingState.currentDomain) return;

    const domain = normalizeDomain(timeTrackingState.currentDomain);
    const limit = getTimeLimitForDomain(domain);

    if (!limit) return; // Only track domains with limits

    // Initialize if needed
    if (!timeTrackingState.dailyUsage.sites) {
        timeTrackingState.dailyUsage.sites = {};
    }

    // Add time
    const currentTime = timeTrackingState.dailyUsage.sites[domain] || 0;
    const newTime = currentTime + minutes;
    timeTrackingState.dailyUsage.sites[domain] = newTime;

    console.log(`[TimeTracker] ${domain}: ${newTime}/${limit.dailyLimitMinutes} minutes`);

    // Check if limit exceeded
    if (newTime >= limit.dailyLimitMinutes && !isDomainBlockedForToday(domain)) {
        console.log(`[TimeTracker] Time limit exceeded for ${domain}!`);

        // Add to blocked list
        if (!timeTrackingState.dailyUsage.blockedUntilNextDay) {
            timeTrackingState.dailyUsage.blockedUntilNextDay = [];
        }
        if (!timeTrackingState.dailyUsage.blockedUntilNextDay.includes(domain)) {
            timeTrackingState.dailyUsage.blockedUntilNextDay.push(domain);
        }

        // Apply block rule for this domain
        await applyTimeLimitBlockRule(domain, newTime, limit.dailyLimitMinutes);
    }

    // Save to storage
    await saveDailyUsage();
}

// Apply a blocking rule for a time-limited domain
async function applyTimeLimitBlockRule(domain, usedMinutes, limitMinutes) {
    try {
        const ruleId = 10000 + Math.abs(hashCode(domain) % 10000); // Unique ID based on domain

        // Remove existing rule if any
        try {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [ruleId]
            });
        } catch (e) { }

        // Add blocking rule
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [{
                id: ruleId,
                priority: 2, // Higher priority than regular blocks
                action: {
                    type: 'redirect',
                    redirect: {
                        extensionPath: `/productivity/blocked.html?site=${encodeURIComponent(domain)}&reason=time_limit&usage=${usedMinutes}&limit=${limitMinutes}`
                    }
                },
                condition: {
                    urlFilter: `||${domain}`,
                    resourceTypes: ['main_frame']
                }
            }]
        });

        console.log(`[TimeTracker] Blocking rule applied for ${domain}`);
    } catch (error) {
        console.error('[TimeTracker] Error applying block rule:', error);
    }
}

// Simple hash function for domain-based rule IDs
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

// Start tracking time on active tab
function startTimeTracking() {
    // Track every 30 seconds (0.5 minutes)
    if (timeTrackingState.trackingInterval) {
        clearInterval(timeTrackingState.trackingInterval);
    }

    timeTrackingState.trackingInterval = setInterval(async () => {
        await trackCurrentTab();
    }, 30000); // 30 seconds

    // Also track on tab changes
    chrome.tabs.onActivated.addListener(handleTabChange);
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    chrome.windows.onFocusChanged.addListener(handleWindowFocus);

    console.log('[TimeTracker] Time tracking started');
}

// Handle tracking the current tab
async function trackCurrentTab() {
    try {
        // Check for new day and reset if needed
        const today = new Date().toISOString().split('T')[0];
        if (timeTrackingState.dailyUsage?.date !== today) {
            console.log('[TimeTracker] New day detected, resetting usage');
            await loadDailyUsage();
            await clearTimeLimitBlockRules();
        }

        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) return;

        const domain = normalizeDomain(tab.url);
        if (!domain || domain.startsWith('chrome') || domain.startsWith('edge')) return;

        // Check if this domain has a time limit
        const limit = getTimeLimitForDomain(domain);
        if (!limit) {
            timeTrackingState.currentDomain = null;
            return;
        }

        // Check if already blocked
        if (isDomainBlockedForToday(domain)) {
            return;
        }

        // Track time - add 0.5 minutes (30 seconds)
        timeTrackingState.currentDomain = domain;
        await addTimeToCurrentDomain(0.5);

    } catch (error) {
        console.error('[TimeTracker] Track error:', error);
    }
}

// Handle tab activation
async function handleTabChange(activeInfo) {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab?.url) {
            const domain = normalizeDomain(tab.url);
            timeTrackingState.currentDomain = domain;
            timeTrackingState.lastUpdateTime = Date.now();
        }
    } catch (e) { }
}

// Handle tab URL updates
function handleTabUpdate(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.active && tab.url) {
        const domain = normalizeDomain(tab.url);
        timeTrackingState.currentDomain = domain;
        timeTrackingState.lastUpdateTime = Date.now();
    }
}

// Handle window focus changes
async function handleWindowFocus(windowId) {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        // Browser lost focus
        timeTrackingState.currentDomain = null;
    } else {
        // Browser got focus - get active tab
        try {
            const [tab] = await chrome.tabs.query({ active: true, windowId: windowId });
            if (tab?.url) {
                timeTrackingState.currentDomain = normalizeDomain(tab.url);
            }
        } catch (e) { }
    }
}

// Clear all time limit block rules (called on new day)
async function clearTimeLimitBlockRules() {
    try {
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const timeLimitRuleIds = existingRules
            .filter(rule => rule.id >= 10000 && rule.id < 20000)
            .map(rule => rule.id);

        if (timeLimitRuleIds.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: timeLimitRuleIds
            });
            console.log('[TimeTracker] Cleared', timeLimitRuleIds.length, 'time limit block rules');
        }
    } catch (e) {
        console.error('[TimeTracker] Error clearing rules:', e);
    }
}

// Listen for time limit updates from the productivity app
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;

    if (changes.productivity_website_time_limits) {
        timeTrackingState.timeLimits = changes.productivity_website_time_limits.newValue || [];
        console.log('[TimeTracker] Time limits updated:', timeTrackingState.timeLimits.length);
    }

    if (changes.productivity_website_daily_usage) {
        timeTrackingState.dailyUsage = changes.productivity_website_daily_usage.newValue;
    }
});

// Initialize time tracking
initTimeTracking();

// Load blocker state on startup

chrome.storage.local.get(['blockerEnabled', 'blockedSites', 'blockerWhitelist'], (result) => {
    blockerState.enabled = result.blockerEnabled || false;
    blockerState.blockedSites = result.blockedSites || [];
    blockerState.whitelist = result.blockerWhitelist || [];
    if (blockerState.enabled) {
        applyBlockRules();
    }
});

// Apply blocking rules using declarativeNetRequest
async function applyBlockRules() {
    try {
        // Get existing rules
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const existingRuleIds = existingRules.map(rule => rule.id);

        // Remove existing rules
        if (existingRuleIds.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: existingRuleIds
            });
        }

        if (!blockerState.enabled || blockerState.blockedSites.length === 0) {
            return;
        }

        // Filter and extract valid URLs
        const validSites = blockerState.blockedSites
            .map(site => typeof site === 'string' ? site : (site.url || ''))
            .filter(url => url && url.length > 0)
            .map(url => url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '')); // Clean URLs

        if (validSites.length === 0) {
            return;
        }

        const rules = [];
        let ruleId = 1;

        validSites.forEach((url) => {
            // Rule for *.domain.com/*
            rules.push({
                id: ruleId++,
                priority: 1,
                action: {
                    type: 'redirect',
                    redirect: {
                        extensionPath: '/productivity/blocked.html?site=' + encodeURIComponent(url)
                    }
                },
                condition: {
                    urlFilter: `||${url}`,
                    resourceTypes: ['main_frame']
                }
            });
        });

        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: rules
        });

    } catch (error) {
        console.error('[Blocker] Error applying rules:', error);
    }
}

// Clear all blocking rules
async function clearBlockRules() {
    try {
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const existingRuleIds = existingRules.map(rule => rule.id);

        if (existingRuleIds.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: existingRuleIds
            });
        }
    } catch (error) {
        console.error('[Blocker] Error clearing rules:', error);
    }
}

// Setup context menus - Productivity Hub only features
function setupContextMenus() {
    chrome.contextMenus.removeAll(() => {
        // Create parent menu - placeholder for future productivity context menu items
        chrome.contextMenus.create({
            id: "productivity-hub-parent",
            title: "Productivity Hub",
            contexts: ["selection"]
        });
    });
}

// Run on install, startup, and immediately when script loads
chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);
setupContextMenus();

// Start background notification alarms on install/startup and immediately
chrome.runtime.onInstalled.addListener(() => initProductivityNotificationAlarms());
chrome.runtime.onStartup.addListener(() => initProductivityNotificationAlarms());
initProductivityNotificationAlarms();

chrome.contextMenus.onClicked.addListener((info, tab) => {
    // Productivity-specific context menu handlers can be added here
});

// Show toast notification on the active tab
async function showToast(title, message, type = 'success') {
    const fullMessage = `${title}: ${message}`;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, {
                action: 'show_toast',
                message: fullMessage,
                type: type
            }, (response) => {
                if (chrome.runtime.lastError) {
                }
            });
        }
    } catch (err) {

    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.action === 'CONTENT_SCRIPT_HELLO') {
        const response = {
            ok: true,
            backgroundBuild: 'background@2026-01-12.1',
            receivedBuild: request.build,
            tabId: sender?.tab?.id,
            frameId: sender?.frameId,
            url: sender?.tab?.url
        };

        try {
            console.log('[EdgeNoteTaker][BG] CONTENT_SCRIPT_HELLO', response);
        } catch (e) {
            // ignore
        }

        sendResponse(response);
        return true;
    }

    // Handle blocker sync from productivity app
    if (request.type === 'BLOCKER_SYNC') {

        blockerState.enabled = request.enabled;
        blockerState.blockedSites = request.blockedSites || [];
        blockerState.whitelist = request.whitelist || [];

        // Save to storage
        chrome.storage.local.set({
            blockerEnabled: blockerState.enabled,
            blockedSites: blockerState.blockedSites,
            blockerWhitelist: blockerState.whitelist
        });

        // Apply or clear rules
        if (blockerState.enabled) {
            applyBlockRules();
        } else {
            clearBlockRules();
        }

        sendResponse({ success: true });
        return true;
    }

    // Handle get blocker status
    if (request.type === 'GET_BLOCKER_STATUS') {
        sendResponse({
            enabled: blockerState.enabled,
            blockedCount: blockerState.blockedSites.length
        });
        return true;
    }

    // Handle temporary unblock
    if (request.type === 'TEMP_UNBLOCK') {

        // Remove the site from blocking temporarily
        const siteToUnblock = request.site;
        blockerState.blockedSites = blockerState.blockedSites.filter(s => {
            const url = typeof s === 'string' ? s : s.url;
            return !url.includes(siteToUnblock);
        });

        // Reapply rules without the unblocked site
        applyBlockRules();

        // Re-add after the timeout
        setTimeout(async () => {
            // Reload blocked sites from storage
            const result = await chrome.storage.local.get(['blockedSites']);
            blockerState.blockedSites = result.blockedSites || [];
            if (blockerState.enabled) {
                applyBlockRules();
            }
        }, request.minutes * 60 * 1000);

        sendResponse({ success: true });
        return true;
    }

    // Handle broadcast reminder to all tabs
    if (request.type === 'BROADCAST_REMINDER' || request.action === 'BROADCAST_REMINDER') {
        const data = request.data || request;

        // Get all tabs and send the reminder
        chrome.tabs.query({}, async (tabs) => {
            try {
                const stored = await chrome.storage.local.get(['taskRemindersEnabled']);
                if (stored.taskRemindersEnabled === false) return;
            } catch (e) {
                // ignore
            }

            let successCount = 0;
            let failCount = 0;

            for (const tab of tabs) {
                // Skip chrome:// and edge:// internal pages, but allow regular web pages
                if (tab.id && tab.url &&
                    !tab.url.startsWith('chrome://') &&
                    !tab.url.startsWith('chrome-extension://') &&
                    !tab.url.startsWith('edge://') &&
                    !tab.url.startsWith('about:') &&
                    (tab.url.startsWith('http://') || tab.url.startsWith('https://') || tab.url.startsWith('file://'))) {

                    try {
                        // First try to send message directly
                        await chrome.tabs.sendMessage(tab.id, {
                            action: 'show_task_reminder',
                            taskCount: data.taskCount || 1,
                            message: data.message || `Task "${data.taskTitle}" is due soon!`,
                            timestamp: Date.now()
                        });
                        successCount++;
                    } catch (err) {
                        // Content script not loaded, try to inject it first
                        if (err.message?.includes('Receiving end does not exist') ||
                            err.message?.includes('Could not establish connection')) {
                            try {
                                // Inject content script
                                try {
                                    console.log('[EdgeNoteTaker][BG] Injecting content script for reminder', {
                                        tabId: tab.id,
                                        url: tab.url,
                                        world: 'ISOLATED'
                                    });
                                } catch (e) {
                                    // ignore
                                }

                                await chrome.scripting.executeScript({
                                    target: { tabId: tab.id },
                                    files: ['content/content.js'],
                                    world: 'ISOLATED'
                                });
                                await chrome.scripting.insertCSS({
                                    target: { tabId: tab.id },
                                    files: ['content/content.css']
                                });

                                // Now send the message
                                await chrome.tabs.sendMessage(tab.id, {
                                    action: 'show_task_reminder',
                                    taskCount: data.taskCount || 1,
                                    message: data.message || `Task "${data.taskTitle}" is due soon!`,
                                    timestamp: Date.now()
                                });
                                successCount++;
                            } catch (injectErr) {
                                try {
                                    console.log('[EdgeNoteTaker][BG] Injection failed (reminder)', {
                                        tabId: tab.id,
                                        url: tab.url,
                                        message: injectErr?.message
                                    });
                                } catch (e) {
                                    // ignore
                                }
                                failCount++;
                            }
                        } else {
                            failCount++;
                        }
                    }
                }
            }

        });

        sendResponse({ success: true });
        return true;
    }

    // Create a single, globally de-duped desktop notification (used by Productivity pages).
    if (request?.action === 'PRODUCTIVITY_CREATE_DESKTOP_NOTIFICATION') {
        (async () => {
            try {
                const data = request.data || {};
                const notificationId = String(data.notificationId || `productivity-${Date.now()}`);
                const title = String(data.title || 'Productivity');
                const message = String(data.message || '');
                const requireInteraction = !!data.requireInteraction;
                const dedupeKey = data.dedupeKey ? String(data.dedupeKey) : null;
                const dedupeTtlMs = (data.dedupeTtlMs !== null && data.dedupeTtlMs !== undefined)
                    ? Number(data.dedupeTtlMs)
                    : null;
                const dedupeOnce = data.dedupeOnce !== false;

                const { prefs, dndEnabled, dndEndTime } = await getNotificationRuntimeState();
                if (!prefs.enabled || !prefs.desktop) {
                    sendResponse({ ok: true, shown: false, reason: 'disabled' });
                    return;
                }
                if (isDndActive(dndEnabled, dndEndTime)) {
                    sendResponse({ ok: true, shown: false, reason: 'dnd' });
                    return;
                }

                let allowed = true;
                if (dedupeKey) {
                    allowed = await withNotifKeyLock(dedupeKey, async () => {
                        if (dedupeTtlMs && Number.isFinite(dedupeTtlMs) && dedupeTtlMs > 0) {
                            return await markNotifSentWithTtl(dedupeKey, dedupeTtlMs);
                        }
                        if (dedupeOnce) {
                            return await markNotifSentOnce(dedupeKey);
                        }
                        // If dedupeOnce=false and no TTL, allow.
                        return true;
                    });
                }

                if (!allowed) {
                    sendResponse({ ok: true, shown: false, reason: 'deduped' });
                    return;
                }

                createDesktopNotification(notificationId, title, message, requireInteraction);
                sendResponse({ ok: true, shown: true });
            } catch (e) {
                sendResponse({ ok: false, shown: false, error: e?.message || String(e) });
            }
        })();
        return true;
    }

    // Handle opening productivity hub from reminder
    if (request.action === 'openProductivityHub') {
        chrome.tabs.create({ url: chrome.runtime.getURL('productivity/index.html') });
        sendResponse({ success: true });
        return true;
    }
});

// Inject focus overlay into extension pages (content scripts can't run there)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        if (tab.url.startsWith('chrome-extension://')) {
            injectFocusOverlayIfNeeded(tabId);
        }
    }
});

// ============================================================================
// FOCUS OVERLAY FOR EXTENSION PAGES
// ============================================================================

async function injectFocusOverlayIfNeeded(tabId) {
    try {
        const result = await chrome.storage.local.get(['focusSession', 'focusState', 'focusOverlaySettings']);
        const isActive = (result.focusSession?.isActive) || (result.focusState?.isActive);

        if (!isActive) return;

        const settings = result.focusOverlaySettings || {
            enabled: true,
            color: '#8b5cf6',
            opacity: 0.6,
            width: 5,
            style: 'solid'
        };

        if (!settings.enabled) return;

        // Inject CSS for the overlay
        const rgba = hexToRgba(settings.color, settings.opacity);
        let borderCSS = '';
        let boxShadowCSS = '';

        if (settings.style === 'glow') {
            boxShadowCSS = `inset 0 0 ${settings.width * 3}px ${rgba}, inset 0 0 ${settings.width * 6}px ${hexToRgba(settings.color, settings.opacity * 0.5)}`;
        } else {
            const borderStyle = settings.style === 'dashed' ? 'dashed' : 'solid';
            borderCSS = `border: ${settings.width}px ${borderStyle} ${rgba} !important;`;
        }

        const cssCode = `
            #focus-session-overlay-injected {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                pointer-events: none !important;
                z-index: 2147483646 !important;
                box-sizing: border-box !important;
                ${borderCSS}
                ${boxShadowCSS ? `box-shadow: ${boxShadowCSS} !important;` : ''}
            }
        `;

        const jsCode = `
            (function() {
                if (!document.getElementById('focus-session-overlay-injected')) {
                    const overlay = document.createElement('div');
                    overlay.id = 'focus-session-overlay-injected';
                    (document.body || document.documentElement).appendChild(overlay);
                }
            })();
        `;

        await chrome.scripting.insertCSS({
            target: { tabId: tabId },
            css: cssCode
        });

        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                if (!document.getElementById('focus-session-overlay-injected')) {
                    const overlay = document.createElement('div');
                    overlay.id = 'focus-session-overlay-injected';
                    (document.body || document.documentElement).appendChild(overlay);
                }
            }
        });

    } catch (error) {
    }
}

function hexToRgba(hex, opacity) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Listen for focus state changes and update all extension tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;

    if (changes.focusSession || changes.focusState) {
        const focusSession = changes.focusSession?.newValue;
        const focusState = changes.focusState?.newValue;
        const isActive = (focusSession?.isActive) || (focusState?.isActive);

        // Schedule or clear completion alarm based on focus state
        if (isActive && focusState && !focusState.isPaused) {
            scheduleFocusCompletionAlarm(focusState);
        } else if (!isActive || focusState?.isPaused) {
            clearFocusCompletionAlarm();
        }

        // Update all extension tabs
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.url?.startsWith('chrome-extension://')) {
                    if (isActive) {
                        injectFocusOverlayIfNeeded(tab.id);
                    } else {
                        // Remove overlay from extension pages
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: () => {
                                const overlay = document.getElementById('focus-session-overlay-injected');
                                if (overlay) overlay.remove();
                            }
                        }).catch(() => { });
                    }
                }
            });
        });
    }
});

// ============================================================================
// FOCUS SESSION BACKGROUND COMPLETION (MV3-safe)
// ============================================================================
// MV3 service workers can be suspended; setInterval-based ticking is unreliable.
// Instead, we schedule a one-shot alarm for the session endTimestamp.

const FOCUS_COMPLETE_ALARM = 'focus-session-complete';

function sanitizeBoredomLevel(value) {
    const num = typeof value === 'string' ? Number(value) : value;
    if (Number.isFinite(num) && num >= 1 && num <= 5) return Math.round(num);
    return null;
}

function clearFocusCompletionAlarm() {
    chrome.alarms.clear(FOCUS_COMPLETE_ALARM).catch(() => { });
}

function scheduleFocusCompletionAlarm(focusState) {
    clearFocusCompletionAlarm();

    if (!focusState?.isActive) return;
    if (focusState.isPaused || focusState.isBreak) return;
    if (focusState.isOpenEnded) return;

    const endTimestamp = focusState.endTimestamp;
    if (typeof endTimestamp !== 'number') return;

    const when = Math.max(Date.now() + 500, endTimestamp);
    chrome.alarms.create(FOCUS_COMPLETE_ALARM, { when });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== FOCUS_COMPLETE_ALARM) return;

    try {
        const result = await chrome.storage.local.get(['focusSession', 'focusState']);
        const focusState = result.focusState;
        const focusSession = result.focusSession;

        if (!focusState?.isActive || focusState.isPaused || focusState.isBreak) {
            clearFocusCompletionAlarm();
            return;
        }

        if (focusState.isOpenEnded) {
            // No auto-completion for open-ended sessions
            clearFocusCompletionAlarm();
            return;
        }

        const endTimestamp = focusState.endTimestamp;
        if (typeof endTimestamp !== 'number') {
            clearFocusCompletionAlarm();
            return;
        }

        // If fired early for any reason, reschedule
        if (Date.now() + 250 < endTimestamp) {
            scheduleFocusCompletionAlarm(focusState);
            return;
        }

        console.log('[Focus Timer] Session complete (alarm)!');
        clearFocusCompletionAlarm();

        const completionMessage = focusState.taskTitle
            ? `Great job! You completed your focus session for "${focusState.taskTitle}"`
            : `Great job! You completed your ${focusState.selectedMinutes} minute focus session!`;

        // Notify first (so a persistence error can't suppress the user-visible alert).
        try {
            await chrome.notifications.create('focus-complete-' + Date.now(), {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                title: 'Focus Session Complete! 🎉',
                message: completionMessage,
                priority: 2,
                requireInteraction: true,
                silent: false
            });
        } catch (notifError) {
            console.log('[Focus Timer] Notification error:', notifError);
        }

        // Persist best-effort; do not block alerts/cleanup.
        try {
            await saveCompletedFocusSession(focusState, focusSession);
        } catch (saveError) {
            console.error('[Focus Timer] Error saving session:', saveError);
        }

        try {
            broadcastFocusComplete(completionMessage);
        } catch (broadcastError) {
            console.error('[Focus Timer] Broadcast error:', broadcastError);
        }

        await chrome.storage.local.remove(['focusSession', 'focusState']);
    } catch (error) {
        console.error('[Focus Timer] Alarm handler error:', error);
    }
});


// Save completed focus session to the data store (so it appears in dashboard)
async function saveCompletedFocusSession(focusState, focusSession) {
    try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        // Preserve boredom level so mood analytics stays accurate.
        const boredomLevel = sanitizeBoredomLevel(focusState?.boredomLevel ?? focusSession?.boredomLevel);

        // Create the completed session object
        const completedSession = {
            id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: getSessionTypeFromMinutes(focusState.selectedMinutes),
            plannedDurationMinutes: focusState.selectedMinutes,
            actualDurationMinutes: focusState.selectedMinutes,
            boredomLevel,
            linkedTaskId: focusSession?.taskId || null,
            linkedTaskTitle: focusState.taskTitle || focusSession?.taskTitle || '',
            subject: '',
            startTime: focusSession?.startTime
                ? new Date(focusSession.startTime).toISOString()
                : new Date(Date.now() - focusState.selectedMinutes * 60 * 1000).toISOString(),
            endTime: now.toISOString(),
            date: today,
            status: 'completed',
            notes: ''
        };

        // Get existing sessions and add the new one
        const result = await chrome.storage.local.get(['productivity_focus_sessions']);
        const sessions = result.productivity_focus_sessions || [];
        sessions.push(completedSession);
        await chrome.storage.local.set({ productivity_focus_sessions: sessions });

        console.log('[Focus Timer] Session saved to database:', completedSession.id);

        // Update daily stats
        const statsResult = await chrome.storage.local.get(['productivity_daily_stats']);
        const dailyStats = statsResult.productivity_daily_stats || {};

        if (!dailyStats[today]) {
            dailyStats[today] = {
                date: today,
                focusMinutes: 0,
                focusSessions: 0,
                tasksCompleted: 0,
                goalsUpdated: 0,
                distractionsBlocked: 0,
                productivityScore: 0
            };
        }

        dailyStats[today].focusMinutes += focusState.selectedMinutes;
        dailyStats[today].focusSessions += 1;

        await chrome.storage.local.set({ productivity_daily_stats: dailyStats });

        console.log('[Focus Timer] Daily stats updated for', today);
    } catch (error) {
        console.error('[Focus Timer] Error saving session:', error);
    }
}

// Get session type based on duration
function getSessionTypeFromMinutes(minutes) {
    if (minutes <= 25) return 'pomodoro';
    if (minutes <= 50) return 'deep-work';
    if (minutes <= 90) return 'flow';
    return 'custom';
}


// Broadcast focus session completion to all tabs (for toast and sound)
async function broadcastFocusComplete(message) {
    try {
        const tabs = await chrome.tabs.query({});

        for (const tab of tabs) {
            // Skip chrome:// and edge:// internal pages
            if (tab.id && tab.url &&
                !tab.url.startsWith('chrome://') &&
                !tab.url.startsWith('edge://') &&
                !tab.url.startsWith('about:')) {

                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        action: 'show_focus_complete',
                        message: message,
                        playSound: true,
                        timestamp: Date.now()
                    });
                } catch (err) {
                    // Content script not loaded, try to inject and send
                    if (err.message?.includes('Receiving end does not exist') ||
                        err.message?.includes('Could not establish connection')) {
                        try {
                            // Only inject for http/https/file pages
                            if (tab.url.startsWith('http://') || tab.url.startsWith('https://') || tab.url.startsWith('file://')) {
                                try {
                                    console.log('[EdgeNoteTaker][BG] Injecting content script for focus-complete', {
                                        tabId: tab.id,
                                        url: tab.url,
                                        world: 'ISOLATED'
                                    });
                                } catch (e) {
                                    // ignore
                                }

                                await chrome.scripting.executeScript({
                                    target: { tabId: tab.id },
                                    files: ['content/content.js'],
                                    world: 'ISOLATED'
                                });
                                await chrome.scripting.insertCSS({
                                    target: { tabId: tab.id },
                                    files: ['content/content.css']
                                });

                                // Now send the message
                                await chrome.tabs.sendMessage(tab.id, {
                                    action: 'show_focus_complete',
                                    message: message,
                                    playSound: true,
                                    timestamp: Date.now()
                                });
                            }
                        } catch (injectErr) {
                            try {
                                console.log('[EdgeNoteTaker][BG] Injection failed (focus-complete)', {
                                    tabId: tab.id,
                                    url: tab.url,
                                    message: injectErr?.message
                                });
                            } catch (e) {
                                // ignore
                            }
                            // Silently fail for pages we can't inject into
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('[Focus Timer] Broadcast error:', error);
    }
}

// Check if there's an active focus session on startup and resume it
async function checkAndResumeActiveFocusSession() {
    try {
        const result = await chrome.storage.local.get(['focusSession', 'focusState']);
        const focusState = result.focusState;

        if (focusState?.isActive && !focusState?.isPaused && !focusState?.isBreak) {
            console.log('[Focus Timer] Resuming active focus session');
            scheduleFocusCompletionAlarm(focusState);
        }
    } catch (error) {
        console.error('[Focus Timer] Resume check error:', error);
    }
}

// Check on service worker startup
checkAndResumeActiveFocusSession();

// Handle messages for focus control
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'FOCUS_STARTED') {
        console.log('[Focus Timer] Focus started message received');
        chrome.storage.local.get(['focusState'], (result) => {
            if (result.focusState) scheduleFocusCompletionAlarm(result.focusState);
        });
        sendResponse({ success: true });
        return true;
    }

    // Handle saving session stats when user manually stops (from popup or elsewhere)
    if (request.action === 'FOCUS_STOP_WITH_SAVE') {
        console.log('[Focus Timer] Focus stop with save message received');

        // Options for early-stopped Pomodoro sessions (count + time)
        const addTime = request.addTime !== undefined ? !!request.addTime : true;
        const countPomodoro = !!request.countPomodoro;

        // Get current state to calculate accumulated time
        chrome.storage.local.get(['focusSession', 'focusState'], async (result) => {
            const focusState = result.focusState;
            const focusSession = result.focusSession;

            if (focusState && focusState.isActive) {
                let elapsedMinutes = 0;

                // Calculate elapsed time based on session type
                if (focusState.isOpenEnded) {
                    // Open-ended: derive from timestamps when possible
                    const elapsedSeconds = focusState.isPaused
                        ? (focusState.pausedElapsedSeconds ?? focusState.elapsedSeconds ?? 0)
                        : (typeof focusState.startTimestamp === 'number'
                            ? Math.max(0, Math.floor((Date.now() - focusState.startTimestamp) / 1000))
                            : (focusState.elapsedSeconds || 0));
                    elapsedMinutes = Math.floor(elapsedSeconds / 60);
                } else {
                    // Countdown: calculate from total - remaining, preferring timestamp fields
                    const totalSeconds = (focusState.selectedMinutes || 0) * 60;
                    let remaining = focusState.remainingSeconds || 0;
                    if (focusState.isPaused) {
                        if (typeof focusState.pausedRemainingSeconds === 'number') {
                            remaining = focusState.pausedRemainingSeconds;
                        }
                    } else if (typeof focusState.endTimestamp === 'number') {
                        remaining = Math.max(0, Math.ceil((focusState.endTimestamp - Date.now()) / 1000));
                    }
                    elapsedMinutes = Math.floor(Math.max(0, totalSeconds - remaining) / 60);
                }

                const shouldCountSession = focusState.isOpenEnded ? true : countPomodoro;
                const shouldSaveAnything = (addTime && elapsedMinutes >= 1) || shouldCountSession;

                // Only save if user wants to add time and/or count the session
                if (elapsedMinutes >= 1 && shouldSaveAnything) {
                    console.log(`[Focus Timer] Saving ${elapsedMinutes} minutes of focus time (addTime=${addTime}, countSession=${shouldCountSession})`);

                    // Create completed session record
                    const now = new Date();
                    const today = now.toISOString().split('T')[0];

                    const boredomLevel = sanitizeBoredomLevel(focusState?.boredomLevel ?? focusSession?.boredomLevel);

                    const completedSession = {
                        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        type: focusState.isOpenEnded ? 'open-ended' : getSessionTypeFromMinutes(focusState.selectedMinutes || 25),
                        plannedDurationMinutes: focusState.isOpenEnded ? 0 : (focusState.selectedMinutes || 25),
                        actualDurationMinutes: elapsedMinutes,
                        boredomLevel,
                        linkedTaskId: focusSession?.taskId || null,
                        linkedTaskTitle: focusState.taskTitle || focusSession?.taskTitle || '',
                        subject: '',
                        startTime: focusSession?.startTime
                            ? new Date(focusSession.startTime).toISOString()
                            : new Date(Date.now() - elapsedMinutes * 60 * 1000).toISOString(),
                        endTime: now.toISOString(),
                        date: today,
                        status: focusState.isOpenEnded ? 'completed' : (shouldCountSession ? 'completed' : 'interrupted'),
                        notes: ''
                    };

                    try {
                        // Save session to focus sessions list
                        const sessionsResult = await chrome.storage.local.get(['productivity_focus_sessions']);
                        const sessions = sessionsResult.productivity_focus_sessions || [];
                        sessions.push(completedSession);
                        await chrome.storage.local.set({ productivity_focus_sessions: sessions });

                        console.log('[Focus Timer] Session saved:', completedSession.id);

                        // Update daily stats
                        const statsResult = await chrome.storage.local.get(['productivity_daily_stats']);
                        const dailyStats = statsResult.productivity_daily_stats || {};

                        if (!dailyStats[today]) {
                            dailyStats[today] = {
                                date: today,
                                focusMinutes: 0,
                                focusSessions: 0,
                                tasksCompleted: 0,
                                goalsUpdated: 0,
                                distractionsBlocked: 0,
                                productivityScore: 0
                            };
                        }

                        if (addTime) {
                            dailyStats[today].focusMinutes += elapsedMinutes;
                        }
                        if (shouldCountSession) {
                            dailyStats[today].focusSessions += 1;
                        }

                        await chrome.storage.local.set({ productivity_daily_stats: dailyStats });
                        console.log('[Focus Timer] Daily stats updated:', today, dailyStats[today]);
                    } catch (error) {
                        console.error('[Focus Timer] Error saving session stats:', error);
                    }
                }
            }

            // Now clear alarm and clear state
            clearFocusCompletionAlarm();
            await chrome.storage.local.remove(['focusSession', 'focusState']);
        });

        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'FOCUS_STOP') {
        console.log('[Focus Timer] Focus stopped message received');
        clearFocusCompletionAlarm();
        sendResponse({ success: true });
        return true;
    }

    if (request.action === 'FOCUS_PAUSE_TOGGLE') {
        if (request.isPaused) {
            console.log('[Focus Timer] Focus paused');
            clearFocusCompletionAlarm();
        } else {
            console.log('[Focus Timer] Focus resumed');
            chrome.storage.local.get(['focusState'], (result) => {
                if (result.focusState) scheduleFocusCompletionAlarm(result.focusState);
            });
        }
        sendResponse({ success: true });
        return true;
    }

    return false;
});
