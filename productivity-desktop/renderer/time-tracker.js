/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - WEBSITE TIME TRACKER MODULE
 * ============================================================================
 * 
 * This module tracks time spent on websites and enforces daily limits.
 * When a limit is exceeded, the website is blocked for the rest of the day.
 */

// Time tracker state
let timeLimitsData = {
    limits: [],  // WebsiteTimeLimit objects
    usage: null  // WebsiteTimeUsage object for today
};

// Track currently active domain and timing
let activeTracking = {
    domain: null,
    startTime: null,
    intervalId: null
};

// ============================================================================
// INITIALIZATION
// ============================================================================

async function initTimeTracker() {
    await loadTimeLimits();
    await loadTodayUsage();

    // Check if it's a new day and reset if needed
    await checkAndResetDailyUsage();

    console.log('[TimeTracker] Initialized with', timeLimitsData.limits.length, 'limits');
}

// ============================================================================
// DATA LOADING & SAVING
// ============================================================================

async function loadTimeLimits() {
    const stored = await DataStore.get(STORAGE_KEYS.WEBSITE_TIME_LIMITS, []);
    timeLimitsData.limits = stored.map(data => new WebsiteTimeLimit(data));
}

async function saveTimeLimits() {
    await DataStore.set(
        STORAGE_KEYS.WEBSITE_TIME_LIMITS,
        timeLimitsData.limits.map(l => l.toJSON())
    );
}

async function loadTodayUsage() {
    const today = new Date().toISOString().split('T')[0];
    const stored = await DataStore.get(STORAGE_KEYS.WEBSITE_DAILY_USAGE, null);

    if (stored && stored.date === today) {
        timeLimitsData.usage = new WebsiteTimeUsage(stored);
    } else {
        // New day, create fresh usage
        timeLimitsData.usage = new WebsiteTimeUsage({ date: today });
        await saveTodayUsage();
    }
}

async function saveTodayUsage() {
    if (timeLimitsData.usage) {
        await DataStore.set(
            STORAGE_KEYS.WEBSITE_DAILY_USAGE,
            timeLimitsData.usage.toJSON()
        );
    }
}

async function checkAndResetDailyUsage() {
    const today = new Date().toISOString().split('T')[0];
    if (timeLimitsData.usage && timeLimitsData.usage.date !== today) {
        // It's a new day, reset usage
        timeLimitsData.usage = new WebsiteTimeUsage({ date: today });
        await saveTodayUsage();
        console.log('[TimeTracker] Daily usage reset for new day');
    }
}

// ============================================================================
// TIME LIMIT MANAGEMENT
// ============================================================================

async function addTimeLimit(domain, dailyLimitMinutes) {
    // Normalize domain
    domain = normalizeDomain(domain);

    // Check if limit already exists for this domain
    const existing = timeLimitsData.limits.find(l => l.domain === domain);
    if (existing) {
        existing.dailyLimitMinutes = dailyLimitMinutes;
        existing.isEnabled = true;
    } else {
        const newLimit = new WebsiteTimeLimit({
            domain: domain,
            dailyLimitMinutes: dailyLimitMinutes
        });
        timeLimitsData.limits.push(newLimit);
    }

    await saveTimeLimits();
    return true;
}

async function updateTimeLimit(id, dailyLimitMinutes) {
    const limit = timeLimitsData.limits.find(l => l.id === id);
    if (limit) {
        limit.dailyLimitMinutes = dailyLimitMinutes;
        await saveTimeLimits();
        return true;
    }
    return false;
}

async function removeTimeLimit(id) {
    const index = timeLimitsData.limits.findIndex(l => l.id === id);
    if (index >= 0) {
        timeLimitsData.limits.splice(index, 1);
        await saveTimeLimits();
        return true;
    }
    return false;
}

async function toggleTimeLimit(id, isEnabled) {
    const limit = timeLimitsData.limits.find(l => l.id === id);
    if (limit) {
        limit.isEnabled = isEnabled;
        await saveTimeLimits();
        return true;
    }
    return false;
}

function getTimeLimit(domain) {
    domain = normalizeDomain(domain);
    return timeLimitsData.limits.find(l => l.domain === domain && l.isEnabled);
}

function getAllTimeLimits() {
    return timeLimitsData.limits;
}

// ============================================================================
// TIME TRACKING
// ============================================================================

function getTimeSpent(domain) {
    domain = normalizeDomain(domain);
    return timeLimitsData.usage ? timeLimitsData.usage.getTimeSpent(domain) : 0;
}

function getTimeRemaining(domain) {
    domain = normalizeDomain(domain);
    const limit = getTimeLimit(domain);
    if (!limit) return null;

    const spent = getTimeSpent(domain);
    return Math.max(0, limit.dailyLimitMinutes - spent);
}

async function addTimeSpent(domain, minutes) {
    domain = normalizeDomain(domain);

    if (!timeLimitsData.usage) {
        await loadTodayUsage();
    }

    timeLimitsData.usage.addTime(domain, minutes);
    await saveTodayUsage();

    // Check if limit exceeded
    const limit = getTimeLimit(domain);
    if (limit && timeLimitsData.usage.getTimeSpent(domain) >= limit.dailyLimitMinutes) {
        await blockDomainForToday(domain);
        return true; // Limit exceeded
    }

    return false;
}

async function blockDomainForToday(domain) {
    domain = normalizeDomain(domain);
    if (timeLimitsData.usage) {
        timeLimitsData.usage.blockForToday(domain);
        await saveTodayUsage();
        console.log('[TimeTracker] Blocked', domain, 'for rest of day');
    }
}

function isBlockedForToday(domain) {
    domain = normalizeDomain(domain);
    return timeLimitsData.usage ? timeLimitsData.usage.isBlockedForToday(domain) : false;
}

function getTodayUsage() {
    return timeLimitsData.usage;
}

// Get usage stats for display - always reload from storage for fresh data
async function getUsageStats() {
    // Reload from storage to get latest data from background script
    await loadTimeLimits();
    await loadTodayUsage();

    const stats = [];

    for (const limit of timeLimitsData.limits) {
        const spent = getTimeSpent(limit.domain);
        const remaining = Math.max(0, limit.dailyLimitMinutes - spent);
        const percentage = Math.min(100, (spent / limit.dailyLimitMinutes) * 100);
        const isBlocked = isBlockedForToday(limit.domain);

        stats.push({
            id: limit.id,
            domain: limit.domain,
            dailyLimitMinutes: limit.dailyLimitMinutes,
            timeSpentMinutes: Math.round(spent * 10) / 10, // Round to 1 decimal
            timeRemainingMinutes: Math.round(remaining * 10) / 10,
            percentageUsed: percentage,
            isBlocked: isBlocked,
            isEnabled: limit.isEnabled
        });
    }

    return stats;
}

// ============================================================================
// DOMAIN UTILITIES
// ============================================================================

function normalizeDomain(domain) {
    if (!domain) return '';

    // Remove protocol
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/i, '');

    // Remove path
    domain = domain.split('/')[0];

    // Remove port
    domain = domain.split(':')[0];

    return domain.toLowerCase();
}

function matchesDomain(url, targetDomain) {
    const urlDomain = normalizeDomain(url);
    targetDomain = normalizeDomain(targetDomain);

    // Exact match or subdomain match
    return urlDomain === targetDomain || urlDomain.endsWith('.' + targetDomain);
}

// ============================================================================
// BLOCKING INTEGRATION
// ============================================================================

// Check if a URL should be blocked due to time limit
async function shouldBlockDueToTimeLimit(url) {
    await checkAndResetDailyUsage();

    const domain = normalizeDomain(url);

    // Check if already blocked for today
    if (isBlockedForToday(domain)) {
        return { blocked: true, reason: 'time_limit_exceeded', domain };
    }

    // Check against all time limits
    for (const limit of timeLimitsData.limits) {
        if (!limit.isEnabled) continue;

        if (matchesDomain(url, limit.domain)) {
            if (isBlockedForToday(limit.domain)) {
                return { blocked: true, reason: 'time_limit_exceeded', domain: limit.domain };
            }

            const spent = getTimeSpent(limit.domain);
            if (spent >= limit.dailyLimitMinutes) {
                await blockDomainForToday(limit.domain);
                return { blocked: true, reason: 'time_limit_exceeded', domain: limit.domain };
            }
        }
    }

    return { blocked: false };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Make functions available globally
window.TimeTracker = {
    init: initTimeTracker,
    addTimeLimit,
    updateTimeLimit,
    removeTimeLimit,
    toggleTimeLimit,
    getTimeLimit,
    getAllTimeLimits,
    getTimeSpent,
    getTimeRemaining,
    addTimeSpent,
    isBlockedForToday,
    getTodayUsage,
    getUsageStats,
    shouldBlockDueToTimeLimit,
    normalizeDomain,
    matchesDomain
};

// Initialize when DOM is ready (if in main page context)
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // Will be initialized by the main app
    });
}
