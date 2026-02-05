/**
 * Challenges System
 * Structured, trackable challenges tied to app features like focus sessions, tasks, reviews.
 */

// ============================================================================
// CHALLENGE CLASS
// ============================================================================

class Challenge {
    constructor(data = {}) {
        this.id = data.id || `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.title = data.title || '';
        this.type = data.type || 'focus_sessions'; // focus_sessions, focus_time, tasks, reviews, habits
        this.target = data.target || 1;
        this.current = data.current || 0;
        this.config = data.config || {};
        this.frequency = data.frequency || 'daily'; // once, daily, weekly
        this.status = data.status || 'active'; // active, completed, failed, expired
        this.createdAt = data.createdAt || new Date().toISOString();
        this.completedAt = data.completedAt || null;
        this.expiresAt = data.expiresAt || this.calculateExpiry();
        this.lastResetAt = data.lastResetAt || null;
        this.streak = data.streak || 0;
        this.totalWins = data.totalWins || 0;
        this.totalFails = data.totalFails || 0;
    }

    calculateExpiry() {
        const now = new Date();
        if (this.frequency === 'daily') {
            // Expires at midnight tonight
            const midnight = new Date(now);
            midnight.setHours(23, 59, 59, 999);
            return midnight.toISOString();
        } else if (this.frequency === 'weekly') {
            // Expires at end of week (Sunday midnight)
            const endOfWeek = new Date(now);
            const daysUntilSunday = 7 - now.getDay();
            endOfWeek.setDate(now.getDate() + daysUntilSunday);
            endOfWeek.setHours(23, 59, 59, 999);
            return endOfWeek.toISOString();
        }
        return null; // One-time challenges don't expire
    }

    get progress() {
        return Math.min(100, Math.round((this.current / this.target) * 100));
    }

    get isComplete() {
        return this.current >= this.target;
    }

    get isExpired() {
        if (!this.expiresAt) return false;
        return new Date() > new Date(this.expiresAt);
    }

    get timeRemaining() {
        if (!this.expiresAt) return null;
        const diff = new Date(this.expiresAt) - new Date();
        if (diff <= 0) return 'Expired';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) return `${hours}h ${minutes}m left`;
        return `${minutes}m left`;
    }

    recordProgress(amount = 1) {
        if (this.status !== 'active') return false;

        this.current += amount;

        if (this.isComplete && this.status === 'active') {
            this.status = 'completed';
            this.completedAt = new Date().toISOString();
            this.totalWins++;
            this.streak++;
            return 'completed';
        }

        return 'progress';
    }

    reset() {
        // For recurring challenges
        if (this.frequency === 'once') return;

        // Check if completed before reset
        if (this.status === 'active' && !this.isComplete) {
            this.totalFails++;
            this.streak = 0;
        }

        this.current = 0;
        this.status = 'active';
        this.completedAt = null;
        this.lastResetAt = new Date().toISOString();
        this.expiresAt = this.calculateExpiry();
    }

    toJSON() {
        return {
            id: this.id,
            title: this.title,
            type: this.type,
            target: this.target,
            current: this.current,
            config: this.config,
            frequency: this.frequency,
            status: this.status,
            createdAt: this.createdAt,
            completedAt: this.completedAt,
            expiresAt: this.expiresAt,
            lastResetAt: this.lastResetAt,
            streak: this.streak,
            totalWins: this.totalWins,
            totalFails: this.totalFails
        };
    }
}

// ============================================================================
// CHALLENGE MANAGER
// ============================================================================

const ChallengeManager = {
    challenges: [],
    history: [],
    initialized: false,

    // Challenge type definitions
    TYPES: {
        focus_sessions: {
            name: 'Focus Sessions',
            icon: 'fa-brain',
            unit: 'sessions',
            description: 'Complete focus sessions'
        },
        focus_time: {
            name: 'Focus Time',
            icon: 'fa-clock',
            unit: 'minutes',
            description: 'Accumulate focus time'
        },
        tasks: {
            name: 'Tasks',
            icon: 'fa-check-circle',
            unit: 'tasks',
            description: 'Complete tasks'
        },
        reviews: {
            name: 'Reviews',
            icon: 'fa-book-reader',
            unit: 'items',
            description: 'Complete spaced repetition reviews'
        },
        habits: {
            name: 'Habits',
            icon: 'fa-calendar-check',
            unit: 'habits',
            description: 'Check off habits'
        }
    },

    async init() {
        if (this.initialized) return;

        await this.load();
        this.checkForResets();
        this.setupMidnightReset();
        this.initialized = true;

        console.log('[Challenges] Initialized with', this.challenges.length, 'challenges');
    },

    async load() {
        try {
            const data = await storageAdapter.get(['challenges', 'challengeHistory']);

            if (data.challenges) {
                this.challenges = data.challenges.map(c => new Challenge(c));
            }

            if (data.challengeHistory) {
                this.history = data.challengeHistory;
            }
        } catch (error) {
            console.error('[Challenges] Error loading:', error);
        }
    },

    async save() {
        try {
            await storageAdapter.set({
                challenges: this.challenges.map(c => c.toJSON()),
                challengeHistory: this.history.slice(-100) // Keep last 100 history entries
            });
        } catch (error) {
            console.error('[Challenges] Error saving:', error);
        }
    },

    // Check if any challenges need to be reset (daily/weekly)
    checkForResets() {
        const now = new Date();
        const today = now.toDateString();

        this.challenges.forEach(challenge => {
            if (challenge.frequency === 'once') return;

            const lastReset = challenge.lastResetAt ? new Date(challenge.lastResetAt) : null;
            const shouldReset = !lastReset || lastReset.toDateString() !== today;

            if (shouldReset && challenge.isExpired) {
                // Archive to history before reset
                this.archiveChallenge(challenge);
                challenge.reset();
            }
        });

        this.save();
    },

    setupMidnightReset() {
        // Calculate time until midnight
        const now = new Date();
        const midnight = new Date(now);
        midnight.setDate(midnight.getDate() + 1);
        midnight.setHours(0, 0, 0, 0);

        const msUntilMidnight = midnight - now;

        setTimeout(() => {
            this.checkForResets();
            this.renderChallenges();
            // Setup next midnight reset
            this.setupMidnightReset();
        }, msUntilMidnight);
    },

    archiveChallenge(challenge) {
        this.history.push({
            id: challenge.id,
            title: challenge.title,
            type: challenge.type,
            target: challenge.target,
            current: challenge.current,
            status: challenge.isComplete ? 'completed' : 'failed',
            date: new Date().toISOString()
        });
    },

    // Record progress from app features
    async recordProgress(type, amount = 1, config = {}) {
        let updated = false;

        this.challenges.forEach(challenge => {
            if (challenge.type !== type) return;
            if (challenge.status !== 'active') return;

            // Check config constraints
            if (type === 'focus_sessions' && challenge.config.minDuration) {
                if (config.duration && config.duration < challenge.config.minDuration) {
                    return; // Session too short
                }
            }

            const result = challenge.recordProgress(amount);
            if (result) {
                updated = true;

                if (result === 'completed') {
                    this.onChallengeCompleted(challenge);
                }
            }
        });

        if (updated) {
            await this.save();
            this.renderChallenges();
        }

        return updated;
    },

    onChallengeCompleted(challenge) {
        // Play celebration sound
        if (window.NotificationSounds) {
            window.NotificationSounds.achievement();
        }

        // Show notification
        if (window.showNotification) {
            window.showNotification(
                `🎯 Challenge Complete: ${challenge.title}`,
                `You completed ${challenge.target} ${this.TYPES[challenge.type]?.unit || 'items'}!`,
                'achievement'
            );
        }

        // Archive
        this.archiveChallenge(challenge);
    },

    // CRUD Operations
    async createChallenge(data) {
        const challenge = new Challenge(data);
        this.challenges.push(challenge);
        await this.save();
        this.renderChallenges();
        return challenge;
    },

    async deleteChallenge(id) {
        const index = this.challenges.findIndex(c => c.id === id);
        if (index !== -1) {
            this.challenges.splice(index, 1);
            await this.save();
            this.renderChallenges();
            return true;
        }
        return false;
    },

    getActiveChallenge() {
        return this.challenges.filter(c => c.status === 'active');
    },

    getCompletedToday() {
        const today = new Date().toDateString();
        return this.challenges.filter(c =>
            c.status === 'completed' &&
            c.completedAt &&
            new Date(c.completedAt).toDateString() === today
        );
    },

    // Rendering
    renderChallenges() {
        const container = document.getElementById('challenges-container');
        if (!container) return;

        const activeChallenges = this.challenges.filter(c => c.status === 'active');
        const completedToday = this.getCompletedToday();

        if (activeChallenges.length === 0 && completedToday.length === 0) {
            container.innerHTML = `
                <div class="challenges-empty">
                    <i class="fas fa-trophy"></i>
                    <p>No active challenges</p>
                    <button class="btn-primary" onclick="ChallengeManager.openCreateModal()">
                        <i class="fas fa-plus"></i> Create Challenge
                    </button>
                </div>
            `;
            return;
        }

        let html = '';

        // Active challenges
        if (activeChallenges.length > 0) {
            html += activeChallenges.map(c => this.renderChallengeCard(c)).join('');
        }

        // Completed today
        if (completedToday.length > 0) {
            html += `<div class="challenges-completed-section">
                <h4><i class="fas fa-check-circle"></i> Completed Today</h4>
                ${completedToday.map(c => this.renderChallengeCard(c, true)).join('')}
            </div>`;
        }

        container.innerHTML = html;
    },

    renderChallengeCard(challenge, isCompleted = false) {
        const typeInfo = this.TYPES[challenge.type] || {};
        const progress = challenge.progress;
        const circumference = 2 * Math.PI * 36; // radius = 36
        const offset = circumference - (progress / 100) * circumference;

        return `
            <div class="challenge-card ${isCompleted ? 'completed' : ''}" data-challenge-id="${challenge.id}">
                <div class="challenge-progress-ring">
                    <svg viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="36" class="progress-bg"></circle>
                        <circle cx="40" cy="40" r="36" class="progress-fill" 
                            style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset};">
                        </circle>
                    </svg>
                    <div class="progress-text">
                        <span class="progress-current">${challenge.current}</span>
                        <span class="progress-divider">/</span>
                        <span class="progress-target">${challenge.target}</span>
                    </div>
                </div>
                <div class="challenge-info">
                    <div class="challenge-header">
                        <span class="challenge-icon"><i class="fas ${typeInfo.icon || 'fa-trophy'}"></i></span>
                        <h4 class="challenge-title">${challenge.title || typeInfo.name}</h4>
                        ${!isCompleted ? `<button class="btn-icon-sm challenge-delete" onclick="ChallengeManager.confirmDelete('${challenge.id}')" title="Delete">
                            <i class="fas fa-times"></i>
                        </button>` : ''}
                    </div>
                    <div class="challenge-meta">
                        <span class="challenge-type">${typeInfo.unit || 'items'}</span>
                        ${challenge.frequency !== 'once' ? `<span class="challenge-frequency">${challenge.frequency}</span>` : ''}
                        ${challenge.timeRemaining && !isCompleted ? `<span class="challenge-time">${challenge.timeRemaining}</span>` : ''}
                    </div>
                    ${challenge.streak > 0 ? `<div class="challenge-streak"><i class="fas fa-fire"></i> ${challenge.streak} day streak</div>` : ''}
                </div>
                ${isCompleted ? '<div class="challenge-complete-badge"><i class="fas fa-check"></i></div>' : ''}
            </div>
        `;
    },

    // Modal operations
    openCreateModal() {
        const modal = document.getElementById('create-challenge-modal');
        if (!modal) return;

        // Reset form
        document.getElementById('challenge-title').value = '';
        document.getElementById('challenge-type').value = 'focus_sessions';
        document.getElementById('challenge-target').value = 5;
        document.getElementById('challenge-frequency').value = 'daily';
        document.getElementById('challenge-min-duration').value = '';

        this.updateConfigFields();
        modal.classList.add('active');
    },

    closeCreateModal() {
        const modal = document.getElementById('create-challenge-modal');
        if (modal) modal.classList.remove('active');
    },

    updateConfigFields() {
        const type = document.getElementById('challenge-type').value;
        const durationField = document.getElementById('challenge-duration-config');

        if (durationField) {
            durationField.style.display = type === 'focus_sessions' ? 'block' : 'none';
        }
    },

    async submitCreateForm() {
        const title = document.getElementById('challenge-title').value.trim();
        const type = document.getElementById('challenge-type').value;
        const target = parseInt(document.getElementById('challenge-target').value) || 1;
        const frequency = document.getElementById('challenge-frequency').value;
        const minDuration = parseInt(document.getElementById('challenge-min-duration').value) || 0;

        const config = {};
        if (type === 'focus_sessions' && minDuration > 0) {
            config.minDuration = minDuration;
        }

        const typeInfo = this.TYPES[type];
        const defaultTitle = `${target} ${typeInfo?.unit || 'items'}${frequency === 'daily' ? ' today' : ''}`;

        await this.createChallenge({
            title: title || defaultTitle,
            type,
            target,
            frequency,
            config
        });

        this.closeCreateModal();
    },

    async confirmDelete(id) {
        const challenge = this.challenges.find(c => c.id === id);
        if (!challenge) return;

        if (window.confirmDialog) {
            const confirmed = await window.confirmDialog(
                'Delete Challenge',
                `Are you sure you want to delete "${challenge.title}"?`
            );
            if (confirmed) {
                await this.deleteChallenge(id);
            }
        } else if (confirm(`Delete challenge "${challenge.title}"?`)) {
            await this.deleteChallenge(id);
        }
    },

    // History view
    renderHistory() {
        const container = document.getElementById('challenges-history');
        if (!container) return;

        if (this.history.length === 0) {
            container.innerHTML = `
                <div class="challenges-empty">
                    <i class="fas fa-history"></i>
                    <p>No challenge history yet</p>
                </div>
            `;
            return;
        }

        // Group by date
        const grouped = {};
        this.history.slice().reverse().forEach(entry => {
            const date = new Date(entry.date).toLocaleDateString();
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(entry);
        });

        let html = '';
        Object.keys(grouped).forEach(date => {
            html += `<div class="history-date-group">
                <h4>${date}</h4>
                ${grouped[date].map(entry => `
                    <div class="history-item ${entry.status}">
                        <i class="fas ${entry.status === 'completed' ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        <span class="history-title">${entry.title}</span>
                        <span class="history-progress">${entry.current}/${entry.target}</span>
                    </div>
                `).join('')}
            </div>`;
        });

        container.innerHTML = html;
    }
};

// Make globally available
window.Challenge = Challenge;
window.ChallengeManager = ChallengeManager;

// Setup Goals/Challenges tab switching
function setupGoalsTabs() {
    const tabs = document.querySelectorAll('.goals-tab');
    const tabContents = document.querySelectorAll('.goals-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;

            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update active content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetId) {
                    content.classList.add('active');
                }
            });

            // Render challenges when switching to that tab
            if (targetId === 'challenges-content') {
                ChallengeManager.renderChallenges();
                ChallengeManager.renderHistory();
            }
        });
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    ChallengeManager.init().then(() => {
        ChallengeManager.renderChallenges();
        ChallengeManager.renderHistory();
    });
    setupGoalsTabs();
});
