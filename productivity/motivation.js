/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - MOTIVATION & GAMIFICATION SYSTEM
 * ============================================================================
 * 
 * Features:
 * - Study Streaks (daily streak tracking)
 * - Achievement System (badges & milestones)
 * - XP & Levels
 * - Activity Heatmap
 * - Ambient Sounds
 */

// ============================================================================
// MOTIVATION STATE
// ============================================================================
const MotivationState = {
    // Streak data
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
    streakFreezeAvailable: true,

    // XP & Levels
    totalXP: 0,
    level: 1,

    // Activity tracking (for heatmap)
    activityLog: {}, // { 'YYYY-MM-DD': { tasks: 0, focusSessions: 0, minutes: 0 } }

    // Achievements
    unlockedAchievements: [],

    // Settings
    settings: {
        soundEnabled: true,
        notificationsEnabled: true,
        ambientSound: null
    }
};

// XP rewards for different actions
const XP_REWARDS = {
    completeTask: 10,
    completeFocusSession: 25,
    completeGoal: 50,
    dailyLogin: 5,
    streakBonus: (days) => Math.min(days * 2, 20), // 2 XP per streak day, max 20
    achievementUnlock: 100
};

// Level thresholds
const LEVEL_THRESHOLDS = [
    0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000,
    17000, 24000, 33000, 45000, 60000, 80000, 105000, 140000, 185000, 250000
];

// Achievement definitions
const ACHIEVEMENTS = {
    // Streak achievements
    streak_3: { id: 'streak_3', name: 'Getting Started', description: 'Maintain a 3-day streak', icon: '🔥', xp: 50, category: 'streak' },
    streak_7: { id: 'streak_7', name: 'Week Warrior', description: 'Maintain a 7-day streak', icon: '🔥', xp: 100, category: 'streak' },
    streak_14: { id: 'streak_14', name: 'Two Weeks Strong', description: 'Maintain a 14-day streak', icon: '💪', xp: 200, category: 'streak' },
    streak_30: { id: 'streak_30', name: 'Monthly Master', description: 'Maintain a 30-day streak', icon: '🏆', xp: 500, category: 'streak' },
    streak_100: { id: 'streak_100', name: 'Century Club', description: 'Maintain a 100-day streak', icon: '👑', xp: 1000, category: 'streak' },

    // Focus achievements
    focus_first: { id: 'focus_first', name: 'First Focus', description: 'Complete your first focus session', icon: '🎯', xp: 25, category: 'focus' },
    focus_10: { id: 'focus_10', name: 'Focus Finder', description: 'Complete 10 focus sessions', icon: '🧘', xp: 100, category: 'focus' },
    focus_50: { id: 'focus_50', name: 'Deep Worker', description: 'Complete 50 focus sessions', icon: '🧠', xp: 300, category: 'focus' },
    focus_long: { id: 'focus_long', name: 'Marathon Mind', description: 'Complete a 90+ minute focus session', icon: '⏱️', xp: 150, category: 'focus' },

    // Task achievements
    tasks_first: { id: 'tasks_first', name: 'Task Tackler', description: 'Complete your first task', icon: '✅', xp: 10, category: 'tasks' },
    tasks_10: { id: 'tasks_10', name: 'Getting Things Done', description: 'Complete 10 tasks', icon: '📋', xp: 75, category: 'tasks' },
    tasks_50: { id: 'tasks_50', name: 'Productivity Pro', description: 'Complete 50 tasks', icon: '🚀', xp: 250, category: 'tasks' },
    tasks_100: { id: 'tasks_100', name: 'Task Master', description: 'Complete 100 tasks', icon: '🎖️', xp: 500, category: 'tasks' },

    // Time achievements
    early_bird: { id: 'early_bird', name: 'Early Bird', description: 'Start a focus session before 7 AM', icon: '🌅', xp: 50, category: 'time' },
    night_owl: { id: 'night_owl', name: 'Night Owl', description: 'Complete tasks after 10 PM', icon: '🦉', xp: 50, category: 'time' },
    weekend_warrior: { id: 'weekend_warrior', name: 'Weekend Warrior', description: 'Be productive on a weekend', icon: '📅', xp: 75, category: 'time' },

    // Level achievements
    level_5: { id: 'level_5', name: 'Rising Star', description: 'Reach level 5', icon: '⭐', xp: 100, category: 'level' },
    level_10: { id: 'level_10', name: 'Dedicated Learner', description: 'Reach level 10', icon: '🌟', xp: 250, category: 'level' },
    level_20: { id: 'level_20', name: 'Productivity Legend', description: 'Reach level 20', icon: '💫', xp: 500, category: 'level' }
};

// Ambient sounds
const AMBIENT_SOUNDS = {
    rain: { name: 'Gentle Rain', icon: '🌧️', file: 'rain.mp3' },
    cafe: { name: 'Coffee Shop', icon: '☕', file: 'cafe.mp3' },
    forest: { name: 'Forest', icon: '🌲', file: 'forest.mp3' },
    fireplace: { name: 'Fireplace', icon: '🔥', file: 'fireplace.mp3' },
    ocean: { name: 'Ocean Waves', icon: '🌊', file: 'ocean.mp3' },
    library: { name: 'Library', icon: '📚', file: 'library.mp3' }
};

// ============================================================================
// INITIALIZATION
// ============================================================================
async function initMotivationSystem() {
    await loadMotivationData();
    checkDailyStreak();
    renderStreakWidget();
    renderXPBar(); // Render XP bar with loaded data
    renderAchievementsPreview();

    // Set up daily check at midnight
    scheduleMidnightCheck();
}

async function loadMotivationData() {
    try {
        const stored = await chrome.storage.local.get([
            'motivationStreak',
            'motivationXP',
            'motivationAchievements',
            'motivationActivityLog',
            'motivationSettings'
        ]);

        if (stored.motivationStreak) {
            MotivationState.currentStreak = stored.motivationStreak.current || 0;
            MotivationState.longestStreak = stored.motivationStreak.longest || 0;
            MotivationState.lastActiveDate = stored.motivationStreak.lastActive || null;
            MotivationState.streakFreezeAvailable = stored.motivationStreak.freezeAvailable !== false;
        }

        if (stored.motivationXP) {
            MotivationState.totalXP = stored.motivationXP.total || 0;
            MotivationState.level = calculateLevel(MotivationState.totalXP);
        }

        if (stored.motivationAchievements) {
            MotivationState.unlockedAchievements = stored.motivationAchievements || [];
        }

        if (stored.motivationActivityLog) {
            MotivationState.activityLog = stored.motivationActivityLog || {};
        }

        if (stored.motivationSettings) {
            MotivationState.settings = { ...MotivationState.settings, ...stored.motivationSettings };
        }
    } catch (error) {
        console.error('Failed to load motivation data:', error);
    }
}

async function saveMotivationData() {
    try {
        await chrome.storage.local.set({
            motivationStreak: {
                current: MotivationState.currentStreak,
                longest: MotivationState.longestStreak,
                lastActive: MotivationState.lastActiveDate,
                freezeAvailable: MotivationState.streakFreezeAvailable
            },
            motivationXP: {
                total: MotivationState.totalXP,
                level: MotivationState.level
            },
            motivationAchievements: MotivationState.unlockedAchievements,
            motivationActivityLog: MotivationState.activityLog,
            motivationSettings: MotivationState.settings
        });
    } catch (error) {
        console.error('Failed to save motivation data:', error);
    }
}

// ============================================================================
// STREAK SYSTEM
// ============================================================================
function checkDailyStreak() {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (MotivationState.lastActiveDate === today) {
        // Already logged in today, streak is maintained
        return;
    }

    if (MotivationState.lastActiveDate === yesterday) {
        // Last active yesterday, continue streak
        MotivationState.currentStreak++;
        MotivationState.lastActiveDate = today;

        // Award streak bonus XP
        const bonusXP = XP_REWARDS.streakBonus(MotivationState.currentStreak);
        awardXP(bonusXP, `🔥 ${MotivationState.currentStreak}-day streak bonus!`);

        // Check for streak achievements
        checkStreakAchievements();

        // Update longest streak
        if (MotivationState.currentStreak > MotivationState.longestStreak) {
            MotivationState.longestStreak = MotivationState.currentStreak;
        }

        // Show streak celebration for milestones
        if ([3, 7, 14, 30, 50, 100].includes(MotivationState.currentStreak)) {
            showStreakCelebration(MotivationState.currentStreak);
        }
    } else if (MotivationState.lastActiveDate) {
        // Streak broken - check for freeze
        if (MotivationState.streakFreezeAvailable) {
            // Use freeze to save streak
            MotivationState.streakFreezeAvailable = false;
            MotivationState.lastActiveDate = today;
            showToast('info', 'Streak Saved!', '❄️ Your streak freeze was used to save your streak!');
        } else {
            // Reset streak
            MotivationState.currentStreak = 1;
            MotivationState.lastActiveDate = today;
            showToast('info', 'New Streak Started', '🔥 Start a new streak today!');
        }
    } else {
        // First time user
        MotivationState.currentStreak = 1;
        MotivationState.lastActiveDate = today;
        awardXP(XP_REWARDS.dailyLogin, 'Welcome! First day bonus!');
    }

    // Reset freeze at start of each week (Sunday)
    if (new Date().getDay() === 0) {
        MotivationState.streakFreezeAvailable = true;
    }

    saveMotivationData();
}

function checkStreakAchievements() {
    const streak = MotivationState.currentStreak;

    if (streak >= 3 && !hasAchievement('streak_3')) unlockAchievement('streak_3');
    if (streak >= 7 && !hasAchievement('streak_7')) unlockAchievement('streak_7');
    if (streak >= 14 && !hasAchievement('streak_14')) unlockAchievement('streak_14');
    if (streak >= 30 && !hasAchievement('streak_30')) unlockAchievement('streak_30');
    if (streak >= 100 && !hasAchievement('streak_100')) unlockAchievement('streak_100');
}

function scheduleMidnightCheck() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight - now;

    setTimeout(() => {
        checkDailyStreak();
        renderStreakWidget();
        // Schedule next check
        scheduleMidnightCheck();
    }, msUntilMidnight);
}

// ============================================================================
// XP & LEVEL SYSTEM
// ============================================================================
function awardXP(amount, reason = '') {
    const previousLevel = MotivationState.level;
    MotivationState.totalXP += amount;
    MotivationState.level = calculateLevel(MotivationState.totalXP);

    // Show XP notification
    showXPNotification(amount, reason);

    // Check for level up
    if (MotivationState.level > previousLevel) {
        showLevelUpCelebration(MotivationState.level);
        checkLevelAchievements();
    }

    // Update UI
    renderXPBar();
    saveMotivationData();
}

function calculateLevel(xp) {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
        if (xp >= LEVEL_THRESHOLDS[i]) {
            return i + 1;
        }
    }
    return 1;
}

function getXPForNextLevel() {
    const currentLevelIndex = MotivationState.level - 1;
    if (currentLevelIndex >= LEVEL_THRESHOLDS.length - 1) {
        return null; // Max level
    }
    return LEVEL_THRESHOLDS[currentLevelIndex + 1];
}

function getCurrentLevelProgress() {
    const currentLevelXP = LEVEL_THRESHOLDS[MotivationState.level - 1] || 0;
    const nextLevelXP = LEVEL_THRESHOLDS[MotivationState.level] || currentLevelXP;
    const xpInCurrentLevel = MotivationState.totalXP - currentLevelXP;
    const xpNeededForLevel = nextLevelXP - currentLevelXP;
    return {
        current: xpInCurrentLevel,
        needed: xpNeededForLevel,
        percentage: Math.min(100, (xpInCurrentLevel / xpNeededForLevel) * 100)
    };
}

function checkLevelAchievements() {
    const level = MotivationState.level;
    if (level >= 5 && !hasAchievement('level_5')) unlockAchievement('level_5');
    if (level >= 10 && !hasAchievement('level_10')) unlockAchievement('level_10');
    if (level >= 20 && !hasAchievement('level_20')) unlockAchievement('level_20');
}

// ============================================================================
// XP PENALTY & DECAY SYSTEM
// ============================================================================

/**
 * Apply XP penalty (loss) - used for stake losses, goal abandonment, etc.
 */
function applyXPPenalty(amount, reason = '') {
    if (amount <= 0) return 0;

    const previousLevel = MotivationState.level;
    MotivationState.totalXP = Math.max(0, MotivationState.totalXP - amount);
    MotivationState.level = calculateLevel(MotivationState.totalXP);

    // Show penalty notification
    showXPPenaltyNotification(amount, reason);

    // Check for level down
    if (MotivationState.level < previousLevel) {
        showLevelDownNotification(previousLevel, MotivationState.level);
    }

    // Update UI
    renderXPBar();
    saveMotivationData();

    return amount;
}

function showXPPenaltyNotification(amount, reason) {
    const notification = document.createElement('div');
    notification.className = 'xp-popup penalty';
    notification.innerHTML = `
        <div class="xp-penalty-content">
            <span class="xp-amount">-${amount} XP</span>
            ${reason ? `<span class="xp-reason">${reason}</span>` : ''}
        </div>
    `;
    notification.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 20px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        font-weight: bold;
        z-index: 10000;
        animation: xpPenaltyPop 3s ease-out forwards;
        box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function showLevelDownNotification(oldLevel, newLevel) {
    if (typeof showToast === 'function') {
        showToast('warning', 'Level Down', `You dropped from Level ${oldLevel} to Level ${newLevel}. Stay active to rebuild!`);
    }
}

/**
 * XP Decay System - applies daily XP decay during inactivity
 */
async function checkXPDecay() {
    try {
        const settings = await ProductivityData.DataStore.getSettings();

        if (!settings.xpDecayEnabled) return;

        const stats = await ProductivityData.DataStore.getCommitmentStats();
        const today = new Date().toISOString().split('T')[0];

        // Check if user was active today
        const todayActivity = MotivationState.activityLog[today];
        const wasActiveToday = todayActivity &&
            (todayActivity.tasks > 0 || todayActivity.focusSessions > 0 || todayActivity.minutes > 30);

        if (wasActiveToday) {
            stats.consecutiveInactiveDays = 0;
            stats.lastActivityDate = today;
            await ProductivityData.DataStore.saveCommitmentStats(stats);
            return;
        }

        // Check if decay was already applied today
        const lastDecayCheck = await ProductivityData.DataStore.get(
            ProductivityData.STORAGE_KEYS.XP_DECAY_LAST_CHECK, null
        );
        if (lastDecayCheck === today) return;

        // Calculate days since last activity
        if (stats.lastActivityDate) {
            const lastActive = new Date(stats.lastActivityDate);
            const now = new Date();
            const daysDiff = Math.floor((now - lastActive) / (1000 * 60 * 60 * 24));

            if (daysDiff > 1) {
                // Apply decay
                const decayPercent = settings.xpDecayDailyPercent || 1;
                const maxDecay = settings.xpDecayMaxDaily || 50;
                const decayAmount = Math.min(
                    Math.floor(MotivationState.totalXP * (decayPercent / 100)),
                    maxDecay
                );

                if (decayAmount > 0) {
                    applyXPPenalty(decayAmount, `Inactivity decay (${daysDiff} days)`);
                    stats.totalXPLostToDecay += decayAmount;
                    stats.consecutiveInactiveDays = daysDiff;
                }
            }
        }

        await ProductivityData.DataStore.set(ProductivityData.STORAGE_KEYS.XP_DECAY_LAST_CHECK, today);
        await ProductivityData.DataStore.saveCommitmentStats(stats);
    } catch (error) {
        console.error('XP decay check failed:', error);
    }
}

/**
 * Calculate the cost of breaking current streak
 */
function getStreakBreakCost() {
    const currentStreak = MotivationState.currentStreak;

    if (currentStreak <= 0) {
        return { daysLost: 0, xpLost: 0, message: '' };
    }

    // Calculate cumulative XP from streak bonuses
    let totalStreakXP = 0;
    for (let day = 1; day <= currentStreak; day++) {
        totalStreakXP += XP_REWARDS.streakBonus(day);
    }

    // Calculate next milestone
    const milestones = [3, 7, 14, 30, 50, 100];
    const nextMilestone = milestones.find(m => m > currentStreak) || 100;
    const daysToMilestone = nextMilestone - currentStreak;

    return {
        daysLost: currentStreak,
        xpLost: totalStreakXP,
        nextMilestone,
        daysToMilestone,
        message: `Breaking your streak will lose ${currentStreak} days of progress and ~${totalStreakXP} XP in bonuses.`
    };
}

/**
 * Show streak warning when user might break streak
 */
function showStreakWarning() {
    const cost = getStreakBreakCost();

    if (cost.daysLost >= 3) {
        if (typeof showToast === 'function') {
            showToast('warning', 'Streak at Risk!', cost.message, {
                duration: 8000,
                actions: [
                    {
                        label: 'Start Focus Session',
                        primary: true,
                        callback: () => {
                            document.querySelector('[data-page="focus"]')?.click();
                        }
                    }
                ]
            });
        }
    }
}

// ============================================================================
// ACHIEVEMENT SYSTEM
// ============================================================================
function hasAchievement(achievementId) {
    return MotivationState.unlockedAchievements.includes(achievementId);
}

function unlockAchievement(achievementId) {
    if (hasAchievement(achievementId)) return;

    const achievement = ACHIEVEMENTS[achievementId];
    if (!achievement) return;

    MotivationState.unlockedAchievements.push(achievementId);

    // Award XP for achievement
    awardXP(achievement.xp, `Achievement: ${achievement.name}`);

    // Show achievement notification
    showAchievementUnlock(achievement);

    // Play sound
    if (MotivationState.settings.soundEnabled) {
        playAchievementSound();
    }

    saveMotivationData();
}

function getAchievementProgress() {
    return {
        unlocked: MotivationState.unlockedAchievements.length,
        total: Object.keys(ACHIEVEMENTS).length,
        percentage: (MotivationState.unlockedAchievements.length / Object.keys(ACHIEVEMENTS).length) * 100
    };
}

// ============================================================================
// ACTIVITY TRACKING (for heatmap)
// ============================================================================
function logActivity(type, amount = 1) {
    const today = new Date().toISOString().split('T')[0];

    if (!MotivationState.activityLog[today]) {
        MotivationState.activityLog[today] = { tasks: 0, focusSessions: 0, minutes: 0 };
    }

    switch (type) {
        case 'task':
            MotivationState.activityLog[today].tasks += amount;
            break;
        case 'focus':
            MotivationState.activityLog[today].focusSessions += amount;
            break;
        case 'minutes':
            MotivationState.activityLog[today].minutes += amount;
            break;
    }

    saveMotivationData();
}

function getActivityForDate(dateStr) {
    return MotivationState.activityLog[dateStr] || { tasks: 0, focusSessions: 0, minutes: 0 };
}

function getActivityLevel(dateStr) {
    const activity = getActivityForDate(dateStr);
    const score = activity.tasks + (activity.focusSessions * 2) + (activity.minutes / 30);

    if (score === 0) return 0;
    if (score < 3) return 1;
    if (score < 6) return 2;
    if (score < 10) return 3;
    return 4; // Highly active
}

// ============================================================================
// UI RENDERING
// ============================================================================
function renderStreakWidget() {
    const container = document.getElementById('streak-widget');
    if (!container) return;

    container.innerHTML = `
        <div class="streak-display">
            <div class="streak-flame ${MotivationState.currentStreak > 0 ? 'active' : ''}">🔥</div>
            <div class="streak-count">${MotivationState.currentStreak}</div>
            <div class="streak-label">day streak</div>
        </div>
        <div class="streak-info">
            <span class="streak-best">Best: ${MotivationState.longestStreak} days</span>
            ${MotivationState.streakFreezeAvailable ? '<span class="streak-freeze">❄️ Freeze ready</span>' : ''}
        </div>
    `;
}

function renderXPBar() {
    const container = document.getElementById('xp-bar-widget');
    if (!container) return;

    const progress = getCurrentLevelProgress();

    container.innerHTML = `
        <div class="xp-level-badge">Lvl ${MotivationState.level}</div>
        <div class="xp-bar-container">
            <div class="xp-bar-fill" style="width: ${progress.percentage}%"></div>
        </div>
        <div class="xp-info">
            <span class="xp-current">${progress.current.toLocaleString()} XP</span>
            <span class="xp-next">${progress.needed.toLocaleString()} XP to level ${MotivationState.level + 1}</span>
        </div>
    `;
}

function renderAchievementsPreview() {
    const container = document.getElementById('achievements-preview');
    if (!container) return;

    const recentAchievements = MotivationState.unlockedAchievements
        .slice(-3)
        .map(id => ACHIEVEMENTS[id])
        .filter(Boolean);

    const progress = getAchievementProgress();

    container.innerHTML = `
        <div class="achievements-header">
            <span>🏆 Achievements</span>
            <span class="achievements-count">${progress.unlocked}/${progress.total}</span>
        </div>
        <div class="achievements-badges">
            ${recentAchievements.map(a => `
                <div class="achievement-badge" title="${a.name}: ${a.description}">
                    ${a.icon}
                </div>
            `).join('') || '<span class="no-achievements">Complete tasks to earn badges!</span>'}
        </div>
    `;
}

function renderActivityHeatmap(containerId, weeks = 12) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (weeks * 7));

    let html = '<div class="heatmap-grid">';

    // Generate cells for each day
    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const level = getActivityLevel(dateStr);
        const activity = getActivityForDate(dateStr);
        const tooltip = `${dateStr}: ${activity.tasks} tasks, ${activity.focusSessions} focus sessions`;

        html += `<div class="heatmap-cell level-${level}" title="${tooltip}" data-date="${dateStr}"></div>`;
    }

    html += '</div>';
    html += `
        <div class="heatmap-legend">
            <span>Less</span>
            <div class="heatmap-cell level-0"></div>
            <div class="heatmap-cell level-1"></div>
            <div class="heatmap-cell level-2"></div>
            <div class="heatmap-cell level-3"></div>
            <div class="heatmap-cell level-4"></div>
            <span>More</span>
        </div>
    `;

    container.innerHTML = html;
}

// ============================================================================
// NOTIFICATIONS & CELEBRATIONS
// ============================================================================
function showXPNotification(amount, reason) {
    // Create floating XP indicator
    const notification = document.createElement('div');
    notification.className = 'xp-popup';
    notification.innerHTML = `+${amount} XP${reason ? `<br><small>${reason}</small>` : ''}`;
    notification.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 20px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        font-weight: bold;
        z-index: 10000;
        animation: xpPopup 2s ease-out forwards;
        box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4);
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
}

function showStreakCelebration(days) {
    const messages = {
        3: "You're on fire! 🔥",
        7: "One week strong! 💪",
        14: "Two weeks of dedication! 🌟",
        30: "A whole month! You're amazing! 🏆",
        50: "50 days! Incredible discipline! 🎯",
        100: "LEGENDARY! 100 days! 👑"
    };

    if (typeof showToast === 'function') {
        showToast('success', `${days}-Day Streak! 🔥`, messages[days] || `Keep going!`);
    }

    // Play celebration sound
    if (MotivationState.settings.soundEnabled) {
        playStreakSound();
    }
}

function showLevelUpCelebration(newLevel) {
    if (typeof showToast === 'function') {
        showToast('success', '🎉 Level Up!', `You've reached Level ${newLevel}!`);
    }

    // Create level up overlay
    const overlay = document.createElement('div');
    overlay.className = 'level-up-overlay';
    overlay.innerHTML = `
        <div class="level-up-content">
            <div class="level-up-badge">⬆️</div>
            <div class="level-up-text">LEVEL UP!</div>
            <div class="level-up-number">${newLevel}</div>
        </div>
    `;
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease-out;
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', () => overlay.remove());
    setTimeout(() => overlay.remove(), 3000);
}

function showAchievementUnlock(achievement) {
    if (typeof showToast === 'function') {
        showToast('success', `🏆 Achievement Unlocked!`, `${achievement.icon} ${achievement.name}`);
    }
}

// ============================================================================
// SOUND EFFECTS
// ============================================================================
function playAchievementSound() {
    // Use a simple beep or load a sound file
    try {
        const audio = new Audio();
        audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQQBMIzD8fC+dAI7k7zw7cFuCB9vlI+EmpqSkJeYmA==';
        audio.volume = 0.3;
        audio.play().catch(() => { });
    } catch (e) { }
}

function playStreakSound() {
    try {
        const audio = new Audio();
        audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQQBMIzD8fC+dAI7k7zw7cFuCB9vlI+EmpqSkJeYmA==';
        audio.volume = 0.3;
        audio.play().catch(() => { });
    } catch (e) { }
}

// ============================================================================
// INTEGRATION HOOKS
// ============================================================================

// Call these from other modules when actions happen:

function onTaskComplete() {
    awardXP(XP_REWARDS.completeTask, 'Task completed');
    logActivity('task', 1);

    // Check task achievements
    const totalTasks = Object.values(MotivationState.activityLog)
        .reduce((sum, day) => sum + day.tasks, 0);

    if (totalTasks === 1 && !hasAchievement('tasks_first')) unlockAchievement('tasks_first');
    if (totalTasks >= 10 && !hasAchievement('tasks_10')) unlockAchievement('tasks_10');
    if (totalTasks >= 50 && !hasAchievement('tasks_50')) unlockAchievement('tasks_50');
    if (totalTasks >= 100 && !hasAchievement('tasks_100')) unlockAchievement('tasks_100');

    // Check time-based achievements
    const hour = new Date().getHours();
    if (hour >= 22 && !hasAchievement('night_owl')) unlockAchievement('night_owl');
    if (new Date().getDay() === 0 || new Date().getDay() === 6) {
        if (!hasAchievement('weekend_warrior')) unlockAchievement('weekend_warrior');
    }
}

function onFocusSessionComplete(minutes) {
    awardXP(XP_REWARDS.completeFocusSession, 'Focus session complete');
    logActivity('focus', 1);
    logActivity('minutes', minutes);

    // Check focus achievements
    const totalSessions = Object.values(MotivationState.activityLog)
        .reduce((sum, day) => sum + day.focusSessions, 0);

    if (totalSessions === 1 && !hasAchievement('focus_first')) unlockAchievement('focus_first');
    if (totalSessions >= 10 && !hasAchievement('focus_10')) unlockAchievement('focus_10');
    if (totalSessions >= 50 && !hasAchievement('focus_50')) unlockAchievement('focus_50');
    if (minutes >= 90 && !hasAchievement('focus_long')) unlockAchievement('focus_long');

    // Check early bird
    const hour = new Date().getHours();
    if (hour < 7 && !hasAchievement('early_bird')) unlockAchievement('early_bird');
}

function onGoalComplete() {
    awardXP(XP_REWARDS.completeGoal, 'Goal achieved!');
}

// ============================================================================
// EXPORTS
// ============================================================================
window.MotivationSystem = {
    init: initMotivationSystem,
    state: MotivationState,
    awardXP,
    unlockAchievement,
    hasAchievement,
    onTaskComplete,
    onFocusSessionComplete,
    onGoalComplete,
    renderStreakWidget,
    renderXPBar,
    renderActivityHeatmap,
    ACHIEVEMENTS,
    getCurrentLevelProgress,
    getAchievementProgress,
    // Commitment & accountability
    applyXPPenalty,
    checkXPDecay,
    getStreakBreakCost,
    showStreakWarning
};
