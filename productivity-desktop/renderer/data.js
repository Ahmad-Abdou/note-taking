/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - CORE DATA MODELS & STORAGE LAYER
 * ============================================================================
 * 
 * This module contains all data schemas, storage operations, and state management
 * for the comprehensive student productivity system.
 * 
 * Features:
 * - Tasks with priorities, deadlines, categories, recurring support
 * - School & Personal schedules with conflict detection
 * - Goals with milestones and progress tracking
 * - Focus sessions with Pomodoro timer
 * - Analytics and productivity scoring
 * - Distraction blocker configuration
 * - Achievement system
 * - Settings and user preferences
 */

// ============================================================================
// STORAGE KEYS
// ============================================================================
const STORAGE_KEYS = {
    TASKS: 'productivity_tasks',
    TASK_LISTS: 'productivity_task_lists',
    SCHEDULE_SCHOOL: 'productivity_schedule_school',
    SCHEDULE_PERSONAL: 'productivity_schedule_personal',
    GOALS: 'productivity_goals',
    FOCUS_SESSIONS: 'productivity_focus_sessions',
    ANALYTICS: 'productivity_analytics',
    BLOCKED_SITES: 'productivity_blocked_sites',
    BLOCKED_ATTEMPTS: 'productivity_blocked_attempts',
    ACHIEVEMENTS: 'productivity_achievements',
    SETTINGS: 'productivity_settings',
    STREAKS: 'productivity_streaks',
    DAILY_STATS: 'productivity_daily_stats',
    IDLE_RECORDS: 'productivity_idle_records',
    IDLE_CATEGORIES: 'productivity_idle_categories',
    REVISIONS: 'productivity_revisions',
    WEBSITE_TIME_LIMITS: 'productivity_website_time_limits',
    WEBSITE_DAILY_USAGE: 'productivity_website_daily_usage',
    DAY_REVIEW: 'productivity_day_review',
    DAY_REVIEW_CLOCK_FORMAT: 'productivity_day_review_clock_format',
    // Commitment & Accountability
    ACCOUNTABILITY_CHECKINS: 'productivity_accountability_checkins',
    COMMITMENT_STATS: 'productivity_commitment_stats',
    XP_DECAY_LAST_CHECK: 'productivity_xp_decay_last_check'
};

// ============================================================================
// DATA SCHEMAS / MODELS
// ============================================================================

/**
 * StudyMaterial Model
 * Represents a study material/resource attached to a task (PDF, notes, links, etc.)
 */
class StudyMaterial {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.name = data.name || 'Untitled';
        this.type = data.type || 'file'; // 'file', 'url', 'note'
        this.mimeType = data.mimeType || ''; // e.g., 'application/pdf', 'image/png'
        this.dataUrl = data.dataUrl || null; // For small files (<5MB) stored as data URL
        this.externalUrl = data.externalUrl || null; // For URLs or references to external files
        this.size = data.size || 0; // File size in bytes
        this.addedAt = data.addedAt || new Date().toISOString();
    }

    // Get appropriate icon based on file type
    get icon() {
        if (this.type === 'url') return 'fa-link';
        if (this.type === 'note') return 'fa-sticky-note';

        // File types based on mimeType
        if (this.mimeType.startsWith('image/')) return 'fa-image';
        if (this.mimeType === 'application/pdf') return 'fa-file-pdf';
        if (this.mimeType.includes('word') || this.mimeType.includes('document')) return 'fa-file-word';
        if (this.mimeType.includes('spreadsheet') || this.mimeType.includes('excel')) return 'fa-file-excel';
        if (this.mimeType.includes('presentation') || this.mimeType.includes('powerpoint')) return 'fa-file-powerpoint';
        if (this.mimeType.startsWith('text/')) return 'fa-file-alt';
        if (this.mimeType.startsWith('video/')) return 'fa-file-video';
        if (this.mimeType.startsWith('audio/')) return 'fa-file-audio';

        return 'fa-file';
    }

    // Format file size for display
    get formattedSize() {
        if (!this.size) return '';
        if (this.size < 1024) return `${this.size} B`;
        if (this.size < 1024 * 1024) return `${(this.size / 1024).toFixed(1)} KB`;
        return `${(this.size / (1024 * 1024)).toFixed(1)} MB`;
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Task Model
 * Represents a task/assignment/homework with full tracking
 */
class Task {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.title = data.title || '';
        this.description = data.description || '';
        // Optional hyperlink associated with the task (e.g., docs, meeting link)
        // Accept a few legacy aliases for backward compatibility.
        this.linkUrl = data.linkUrl || data.url || data.link || null;
        this.startDate = data.startDate || null; // ISO date string for when task starts
        this.startTime = data.startTime || null; // HH:MM format for when task starts
        this.dueDate = data.dueDate || null; // ISO date string
        this.dueTime = data.dueTime || null; // HH:MM format
        this.reminderMinutes = data.reminderMinutes !== undefined ? data.reminderMinutes : 15; // Minutes before due time to remind (-1 = no reminder)
        this.priority = data.priority || 'medium'; // low, medium, high, urgent
        this.category = data.category || 'homework'; // homework, assignment, exam, project, reading, personal
        this.subject = data.subject || '';
        this.status = data.status || 'not-started'; // not-started, in-progress, completed
        this.estimatedMinutes = data.estimatedMinutes || 30;
        this.actualMinutes = data.actualMinutes || 0;
        // Recurrence (tasks module uses isRecurring + repeatType/repeatEnd*)
        this.isRecurring = (data.isRecurring ?? data.recurring) || false;
        // Alias used by some UI code; keep in sync
        this.recurring = this.isRecurring;

        // Preferred fields
        this.repeatType = data.repeatType || data.recurrence || null; // daily, weekly, biweekly, monthly
        this.repeatEndType = data.repeatEndType || (data.repeatEndDate || data.repeatUntil || data.recurrenceEndDate ? 'date' : null); // never, date, count
        this.repeatEndDate = data.repeatEndDate || data.repeatUntil || data.recurrenceEndDate || null;
        this.repeatCount = (data.repeatCount ?? null);
        this.repeatRemaining = (data.repeatRemaining ?? null);

        // Legacy fields (kept for backward compatibility)
        this.recurrence = data.recurrence || this.repeatType || null;
        this.recurrenceEndDate = data.recurrenceEndDate || this.repeatEndDate || null;
        this.parentTaskId = data.parentTaskId || null; // For recurring task instances
        this.subtasks = data.subtasks || []; // Array of subtask objects
        this.tags = data.tags || [];
        this.notes = data.notes || '';
        this.attachments = data.attachments || [];
        this.completedAt = data.completedAt || null;
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
        this.reminders = data.reminders || []; // Array of reminder timestamps
        this.lastRemindedAt = data.lastRemindedAt || null; // Track when last reminded
        this.linkedGoalId = data.linkedGoalId || null;
        this.focusSessionIds = data.focusSessionIds || []; // Sessions spent on this task
        this.listId = data.listId || null; // Custom list parent
        this.color = data.color || null; // Custom task color for calendar
        // Study Materials - files/resources attached to this task
        this.materials = (data.materials || []).map(m => new StudyMaterial(m));
    }

    // Calculate if task is overdue
    get isOverdue() {
        if (this.status === 'completed') return false;
        if (!this.dueDate) return false;
        const dueDateTime = this.dueTime
            ? new Date(`${this.dueDate}T${this.dueTime}`)
            : new Date(`${this.dueDate}T23:59:59`);
        return new Date() > dueDateTime;
    }

    // Calculate days until due
    get daysUntilDue() {
        if (!this.dueDate) return null;
        const due = new Date(this.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        due.setHours(0, 0, 0, 0);
        return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    }

    // Get priority weight for sorting
    get priorityWeight() {
        const weights = { urgent: 4, high: 3, medium: 2, low: 1 };
        return weights[this.priority] || 2;
    }

    toJSON() {
        return {
            ...this,
            materials: (this.materials || []).map(m => m.toJSON ? m.toJSON() : m)
        };
    }
}

// ============================================================================
// RECURRING TASK ROLLOVER (ensure recurring tasks reappear)
// ============================================================================

function parseLocalYMD(ymd) {
    if (!ymd || typeof ymd !== 'string') return null;
    const parts = ymd.split('-').map(n => parseInt(n, 10));
    if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
    const [year, month, day] = parts;
    return new Date(year, month - 1, day);
}

function formatLocalYMD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function coerceLocalYMD(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);

        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) return formatLocalYMD(parsed);
        return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return formatLocalYMD(value);
    }

    return null;
}

function normalizeRepeatType(type) {
    if (!type) return null;
    const t = String(type).toLowerCase();
    if (t === 'daily' || t === 'weekly' || t === 'monthly' || t === 'biweekly') return t;
    return null;
}

function nextDueYMD(currentDueYMD, repeatType) {
    const base = parseLocalYMD(currentDueYMD);
    if (!base) return null;
    const rt = normalizeRepeatType(repeatType);
    if (!rt) return null;

    const next = new Date(base.getTime());
    if (rt === 'daily') next.setDate(next.getDate() + 1);
    else if (rt === 'weekly') next.setDate(next.getDate() + 7);
    else if (rt === 'biweekly') next.setDate(next.getDate() + 14);
    else if (rt === 'monthly') next.setMonth(next.getMonth() + 1);

    return formatLocalYMD(next);
}

function rolloverRecurringTasks(tasks, now = new Date()) {
    const todayYMD = formatLocalYMD(now);
    let didChange = false;

    for (const task of tasks) {
        const isRecurring = !!(task.isRecurring ?? task.recurring);
        const repeatType = normalizeRepeatType(task.repeatType || task.recurrence);
        if (!isRecurring || !repeatType) continue;
        if (task.status !== 'completed') continue;

        // Use the task's occurrence date (dueDate) for rollover decisions.
        // This prevents a completed-after-midnight edge case where completedAt is "today"
        // even though the task occurrence was "yesterday".
        const dueYMD = coerceLocalYMD(task.dueDate);
        const completedYMD = coerceLocalYMD(task.completedAt);
        const occurrenceYMD = dueYMD || completedYMD;
        if (!occurrenceYMD) continue;
        if (occurrenceYMD >= todayYMD) continue;

        // Advance due date until it reaches today (or later), counting how many occurrences we skipped.
        let advances = 0;
        let candidate = occurrenceYMD;
        while (true) {
            const next = nextDueYMD(candidate, repeatType);
            if (!next) break;
            advances += 1;
            candidate = next;
            if (candidate >= todayYMD) break;
            // Safety valve (should never loop this far in normal usage)
            if (advances > 400) break;
        }

        if (!candidate || candidate < todayYMD) continue;

        // End rules
        const endType = task.repeatEndType || null;
        const endDate = task.repeatEndDate || task.recurrenceEndDate || null;
        if (endType === 'date' && endDate && candidate > endDate) {
            task.isRecurring = false;
            task.recurring = false;
            task.repeatType = null;
            task.repeatEndType = null;
            task.repeatEndDate = null;
            task.repeatCount = null;
            task.repeatRemaining = null;
            didChange = true;
            continue;
        }

        if (endType === 'count') {
            const initialRemaining = (typeof task.repeatRemaining === 'number')
                ? task.repeatRemaining
                : (typeof task.repeatCount === 'number' ? Math.max(0, task.repeatCount - 1) : 0);

            const newRemaining = initialRemaining - advances;
            if (newRemaining <= 0) {
                task.isRecurring = false;
                task.recurring = false;
                task.repeatType = null;
                task.repeatEndType = null;
                task.repeatEndDate = null;
                task.repeatCount = null;
                task.repeatRemaining = null;
                didChange = true;
                continue;
            }

            task.repeatRemaining = newRemaining;
        }

        // Rollover: make the task active again for its next occurrence
        task.dueDate = candidate;
        task.status = 'not-started';
        task.completedAt = null;
        task.updatedAt = new Date().toISOString();
        didChange = true;
    }

    return { tasks, didChange };
}

/**
 * TaskList Model
 * Represents a custom task list/folder (e.g., "Maths Tasks", "Work Projects")
 */
class TaskList {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.name = data.name || 'New List';
        this.color = data.color || '#6366f1';
        this.icon = data.icon || 'fa-folder';
        this.isVisible = data.isVisible !== false; // Show/hide in calendar
        this.createdAt = data.createdAt || new Date().toISOString();
        this.order = data.order || 0;
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Schedule Event Model
 * Represents a scheduled event (class, lab, exam, study session, etc.)
 */
class ScheduleEvent {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.title = data.title || '';
        this.type = data.type || 'class'; // class, lab, exam, study, meeting, deadline, personal
        this.date = data.date || null; // ISO date string (for one-time events)
        this.startTime = data.startTime || '09:00'; // HH:MM
        this.endTime = data.endTime || '10:00'; // HH:MM
        this.location = data.location || '';
        this.scheduleType = data.scheduleType || 'school'; // school, personal
        this.isRecurring = data.isRecurring || false;
        this.recurrence = data.recurrence || null; // daily, weekly, monthly
        this.weekdays = data.weekdays || []; // [0-6] for Sunday-Saturday
        this.recurrenceEndDate = data.recurrenceEndDate || null;
        this.color = data.color || '#6366f1';
        this.description = data.description || '';
        this.instructor = data.instructor || '';
        this.reminders = data.reminders || [15]; // Minutes before event
        this.linkedTaskIds = data.linkedTaskIds || [];
        this.isAllDay = data.isAllDay || false;
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
        // Imported calendar support
        this.isImported = data.isImported || false;
        this.importedCalendarId = data.importedCalendarId || null;
        this.importedAt = data.importedAt || null;
    }

    // Calculate duration in minutes
    get durationMinutes() {
        const [startH, startM] = this.startTime.split(':').map(Number);
        const [endH, endM] = this.endTime.split(':').map(Number);
        return (endH * 60 + endM) - (startH * 60 + startM);
    }

    // Check if event occurs on a specific date
    occursOn(dateStr) {
        if (!this.isRecurring) {
            return this.date === dateStr;
        }

        const checkDate = new Date(dateStr);
        const dayOfWeek = checkDate.getDay();

        if (this.recurrence === 'weekly' && this.weekdays.length > 0) {
            return this.weekdays.includes(dayOfWeek);
        }

        if (this.recurrence === 'daily') {
            return true;
        }

        return false;
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Goal Model
 * Represents a long-term goal with milestones
 */
class Goal {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.title = data.title || '';
        this.description = data.description || '';
        this.category = data.category || 'academic'; // academic, skill, project, career
        this.targetDate = data.targetDate || null;
        this.status = data.status || 'active'; // active, completed, paused, abandoned
        this.progress = data.progress || 0; // 0-100
        this.milestones = (data.milestones || []).map(m => new Milestone(m));
        this.linkedTaskIds = data.linkedTaskIds || [];
        this.priority = data.priority || 'medium';
        this.reflection = data.reflection || ''; // Notes on progress/learnings
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
        this.completedAt = data.completedAt || null;

        // Commitment & Accountability Fields
        this.why = data.why || ''; // Why this goal matters
        this.consequences = data.consequences || ''; // What happens if failed
        this.visionImageUrl = data.visionImageUrl || null; // Visualization image
        this.stakes = data.stakes || {
            enabled: false,
            xpAtStake: 0,
            description: ''
        };
        this.abandonmentRequest = data.abandonmentRequest || null; // { requestedAt, cooldownEndsAt, reason }
        this.hoursInvested = data.hoursInvested || 0;
    }

    // Get total invested time from linked focus sessions
    getInvestedTime() {
        // This would be calculated from focus sessions linked to this goal
        return this.hoursInvested;
    }

    // Calculate progress based on milestones
    calculateProgress() {
        if (this.milestones.length === 0) return this.progress;
        const completedMilestones = this.milestones.filter(m => m.isCompleted).length;
        return Math.round((completedMilestones / this.milestones.length) * 100);
    }

    // Get days remaining
    get daysRemaining() {
        if (!this.targetDate) return null;
        const target = new Date(this.targetDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    }

    toJSON() {
        return {
            id: this.id,
            title: this.title,
            description: this.description,
            category: this.category,
            targetDate: this.targetDate,
            status: this.status,
            progress: this.progress,
            milestones: this.milestones.map(m => m.toJSON()),
            linkedTaskIds: this.linkedTaskIds,
            priority: this.priority,
            reflection: this.reflection,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            completedAt: this.completedAt,
            // Commitment fields
            why: this.why,
            consequences: this.consequences,
            visionImageUrl: this.visionImageUrl,
            stakes: this.stakes,
            abandonmentRequest: this.abandonmentRequest,
            hoursInvested: this.hoursInvested
        };
    }
}

/**
 * Milestone Model
 * Sub-goals within a main goal
 */
class Milestone {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.title = data.title || '';
        this.description = data.description || '';
        this.targetDate = data.targetDate || null;
        this.isCompleted = data.isCompleted || false;
        this.completedAt = data.completedAt || null;
        this.order = data.order || 0;
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Accountability Check-in Model
 * Daily reflection and accountability tracking
 */
class AccountabilityCheckin {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.date = data.date || new Date().toISOString().split('T')[0];
        this.mood = data.mood || 3; // 1-5 scale
        this.reflection = data.reflection || '';
        this.tomorrowCommitment = data.tomorrowCommitment || '';
        this.goalsWorkedOn = data.goalsWorkedOn || []; // Array of goal IDs
        this.tasksCompleted = data.tasksCompleted || 0;
        this.focusMinutes = data.focusMinutes || 0;
        this.createdAt = data.createdAt || new Date().toISOString();
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Commitment Statistics Model
 * Tracks overall commitment and accountability metrics
 */
class CommitmentStats {
    constructor(data = {}) {
        this.goalsCompleted = data.goalsCompleted || 0;
        this.goalsAbandoned = data.goalsAbandoned || 0;
        this.goalsCreated = data.goalsCreated || 0;
        this.totalXPLost = data.totalXPLost || 0;
        this.xpLostToDecay = data.xpLostToDecay || 0;
        this.xpLostToPenalties = data.xpLostToPenalties || 0;
        this.checkinStreak = data.checkinStreak || 0;
        this.longestCheckinStreak = data.longestCheckinStreak || 0;
        this.lastUpdated = data.lastUpdated || new Date().toISOString();
    }

    get commitmentScore() {
        const total = this.goalsCompleted + this.goalsAbandoned;
        if (total === 0) return 100;
        return Math.round((this.goalsCompleted / total) * 100);
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Focus Session Model
 * Represents a Pomodoro/focus work session
 */
class FocusSession {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.startTime = data.startTime || new Date().toISOString();
        this.endTime = data.endTime || null;
        this.plannedDurationMinutes = data.plannedDurationMinutes || 25;
        this.actualDurationMinutes = data.actualDurationMinutes || 0;
        this.type = data.type || 'pomodoro'; // pomodoro, deep-work, flow
        this.status = data.status || 'active'; // active, completed, interrupted, paused
        // Boredom level at session start (1-5). Used for mood-aware analytics.
        this.boredomLevel = Number.isFinite(data.boredomLevel) ? data.boredomLevel : (data.boredomLevel ?? null);
        this.linkedTaskId = data.linkedTaskId || null;
        this.linkedTaskTitle = data.linkedTaskTitle || '';
        this.subject = data.subject || '';
        this.notes = data.notes || '';
        this.interruptionCount = data.interruptionCount || 0;
        this.breaksTaken = data.breaksTaken || 0;
        this.distractionsBlocked = data.distractionsBlocked || 0;
        this.productivityRating = data.productivityRating || null; // 1-5 self-rating after session
        // If date isn't provided, derive it from startTime (prevents older sessions
        // from being mis-attributed to today when hydrating from storage).
        this.date = data.date || (typeof data.startTime === 'string' ? data.startTime.split('T')[0] : new Date().toISOString().split('T')[0]);
    }

    // Calculate actual duration if session is complete
    calculateDuration() {
        if (!this.endTime) return 0;
        const start = new Date(this.startTime);
        const end = new Date(this.endTime);
        return Math.round((end - start) / (1000 * 60));
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Daily Stats Model
 * Tracks daily productivity metrics
 */
class DailyStats {
    constructor(data = {}) {
        this.date = data.date || new Date().toISOString().split('T')[0];
        this.tasksCompleted = data.tasksCompleted || 0;
        this.tasksCreated = data.tasksCreated || 0;
        this.focusMinutes = data.focusMinutes || 0;
        this.focusSessions = data.focusSessions || 0;
        this.goalsProgress = data.goalsProgress || 0; // Average progress made
        this.productivityScore = data.productivityScore || 0; // 0-100
        this.streakMaintained = data.streakMaintained || false;
        this.distractionsBlocked = data.distractionsBlocked || 0;
        this.eventsAttended = data.eventsAttended || 0;
        this.studyBySubject = data.studyBySubject || {}; // { subject: minutes }
        this.peakProductivityHour = data.peakProductivityHour || null;
        this.notes = data.notes || '';
    }

    // Calculate productivity score based on various factors
    calculateProductivityScore(settings) {
        const targetMinutes = (settings?.dailyStudyTarget || 8) * 60;
        const targetTasks = settings?.dailyTaskTarget || 5;

        let score = 0;

        // Focus time contribution (40%)
        const focusScore = Math.min((this.focusMinutes / targetMinutes) * 40, 40);
        score += focusScore;

        // Tasks completion contribution (35%)
        const taskScore = Math.min((this.tasksCompleted / targetTasks) * 35, 35);
        score += taskScore;

        // Sessions completed contribution (15%)
        const sessionScore = Math.min((this.focusSessions / 8) * 15, 15);
        score += sessionScore;

        // Low distractions bonus (10%) - only apply if user has done something productive
        const hasActivity = this.focusMinutes > 0 || this.tasksCompleted > 0 || this.focusSessions > 0;
        if (hasActivity) {
            const distractionPenalty = Math.min(this.distractionsBlocked * 0.5, 10);
            score += (10 - distractionPenalty);
        }

        this.productivityScore = Math.round(Math.min(score, 100));
        return this.productivityScore;
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Streak Data Model
 * Tracks productivity streaks
 */
class StreakData {
    constructor(data = {}) {
        this.currentStreak = data.currentStreak || 0;
        this.longestStreak = data.longestStreak || 0;
        this.lastActiveDate = data.lastActiveDate || null;
        this.streakHistory = data.streakHistory || []; // Array of { startDate, endDate, length }
        this.totalActiveDays = data.totalActiveDays || 0;
    }

    // Update streak based on activity
    updateStreak(date, wasProductive) {
        const today = date || new Date().toISOString().split('T')[0];

        if (!wasProductive) {
            // Check if streak is broken
            if (this.lastActiveDate) {
                const lastDate = new Date(this.lastActiveDate);
                const currentDate = new Date(today);
                const daysDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));

                if (daysDiff > 1) {
                    // Streak broken
                    if (this.currentStreak > 0) {
                        this.streakHistory.push({
                            endDate: this.lastActiveDate,
                            length: this.currentStreak
                        });
                    }
                    this.currentStreak = 0;
                }
            }
            return;
        }

        // Was productive
        if (this.lastActiveDate === today) {
            // Already counted today
            return;
        }

        if (this.lastActiveDate) {
            const lastDate = new Date(this.lastActiveDate);
            const currentDate = new Date(today);
            const daysDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));

            if (daysDiff === 1) {
                // Consecutive day
                this.currentStreak++;
            } else if (daysDiff > 1) {
                // Streak was broken, start new
                if (this.currentStreak > 0) {
                    this.streakHistory.push({
                        endDate: this.lastActiveDate,
                        length: this.currentStreak
                    });
                }
                this.currentStreak = 1;
            }
        } else {
            // First active day
            this.currentStreak = 1;
        }

        this.lastActiveDate = today;
        this.totalActiveDays++;

        if (this.currentStreak > this.longestStreak) {
            this.longestStreak = this.currentStreak;
        }
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Achievement Model
 * Represents unlockable achievements
 */
class Achievement {
    constructor(data = {}) {
        this.id = data.id || '';
        this.title = data.title || '';
        this.description = data.description || '';
        this.icon = data.icon || 'fas fa-trophy';
        this.category = data.category || 'general'; // general, focus, tasks, goals, streaks
        this.requirement = data.requirement || {}; // { type: 'streak', value: 7 }
        this.isUnlocked = data.isUnlocked || false;
        this.unlockedAt = data.unlockedAt || null;
        this.progress = data.progress || 0; // Current progress toward achievement
        this.rarity = data.rarity || 'common'; // common, rare, epic, legendary
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Blocked Site Model
 */
class BlockedSite {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        // Support both 'url' and 'domain' for compatibility
        this.url = data.url || data.domain || '';
        this.domain = this.url; // Alias for backwards compatibility
        this.addedAt = data.addedAt || new Date().toISOString();
        this.category = data.category || 'custom'; // social, entertainment, forums, chat, custom
        // Support both 'isEnabled' and 'isActive' for compatibility
        this.isEnabled = data.isEnabled !== undefined ? data.isEnabled : (data.isActive !== false);
        this.isActive = this.isEnabled; // Alias for backwards compatibility
    }

    toJSON() {
        return {
            id: this.id,
            url: this.url,
            domain: this.url, // Keep both for compatibility
            addedAt: this.addedAt,
            category: this.category,
            isEnabled: this.isEnabled,
            isActive: this.isEnabled // Keep both for compatibility
        };
    }
}

/**
 * Website Time Limit Model
 * Represents a daily time limit for a specific website
 */
class WebsiteTimeLimit {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.domain = data.domain || '';           // e.g., "youtube.com"
        this.dailyLimitMinutes = data.dailyLimitMinutes || 60;
        this.isEnabled = data.isEnabled !== false;
        this.createdAt = data.createdAt || new Date().toISOString();
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Website Time Usage Model
 * Tracks daily usage per website and blocked status
 */
class WebsiteTimeUsage {
    constructor(data = {}) {
        this.date = data.date || new Date().toISOString().split('T')[0];
        this.sites = data.sites || {}; // { "youtube.com": 45 } minutes
        this.blockedUntilNextDay = data.blockedUntilNextDay || []; // domains blocked for rest of day
    }

    // Get time spent on a domain
    getTimeSpent(domain) {
        return this.sites[domain] || 0;
    }

    // Add time to a domain
    addTime(domain, minutes) {
        this.sites[domain] = (this.sites[domain] || 0) + minutes;
    }

    // Check if domain is blocked for today
    isBlockedForToday(domain) {
        return this.blockedUntilNextDay.includes(domain);
    }

    // Block domain for rest of day
    blockForToday(domain) {
        if (!this.blockedUntilNextDay.includes(domain)) {
            this.blockedUntilNextDay.push(domain);
        }
    }

    toJSON() {
        return { ...this };
    }
}


/**
 * User Settings Model
 */
class UserSettings {
    constructor(data = {}) {
        // Profile
        this.userName = data.userName || 'Student';
        this.school = data.school || '';
        this.semester = data.semester || '';

        // Daily Goals
        this.dailyStudyTarget = data.dailyStudyTarget || 8; // hours
        this.dailyTaskTarget = data.dailyTaskTarget || 5;
        this.weeklyStudyTarget = data.weeklyStudyTarget || 40; // hours

        // Notifications
        this.notifyBreaks = data.notifyBreaks !== false;
        this.notifyDeadlines = data.notifyDeadlines !== false;
        this.notifySummary = data.notifySummary !== false;
        this.notifyAchievements = data.notifyAchievements !== false;
        this.deadlineReminderMinutes = data.deadlineReminderMinutes || 60;

        // Focus Settings
        this.defaultFocusDuration = data.defaultFocusDuration || 25;
        this.defaultBreakDuration = data.defaultBreakDuration || 5;
        this.longBreakDuration = data.longBreakDuration || 15;
        this.longBreakInterval = data.longBreakInterval || 4; // After X sessions
        this.autoStartBreaks = data.autoStartBreaks || false;
        this.autoStartFocus = data.autoStartFocus || false;

        // Blocker Settings
        this.autoBlockDuringFocus = data.autoBlockDuringFocus !== false;
        this.autoBlockDuringSchedule = data.autoBlockDuringSchedule || false;
        this.blockStartTime = data.blockStartTime || '08:00';
        this.blockEndTime = data.blockEndTime || '17:00';

        // Appearance
        this.theme = data.theme || 'dark';
        this.accentColor = data.accentColor || '#6366f1';

        // Productivity Thresholds
        this.minProductiveMinutes = data.minProductiveMinutes || 30; // Min minutes to count as productive day
        this.minTasksForStreak = data.minTasksForStreak || 1; // Min tasks to maintain streak

        // Sound Settings
        this.enableSounds = data.enableSounds !== false;
        this.timerEndSound = data.timerEndSound || 'bell';
        this.breakEndSound = data.breakEndSound || 'chime';

        // Preserve any additional fields stored in settings.
        // This prevents newer settings (e.g., notificationPreferences, DND, feature flags)
        // from being dropped when loading/saving across restarts.
        for (const [key, value] of Object.entries(data || {})) {
            if (value === undefined) continue;
            if (key in this) continue;
            this[key] = value;
        }
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Idle Category Model
 * User-defined category for classifying idle time periods
 */
class IdleCategory {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.name = data.name || 'Uncategorized';
        this.color = data.color || '#6b7280';
        this.icon = data.icon || 'fa-clock';
        this.createdAt = data.createdAt || new Date().toISOString();
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * Idle Record Model
 * Represents a period when the user was idle
 */
class IdleRecord {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.date = data.date || new Date().toISOString().split('T')[0];
        this.startTime = data.startTime || new Date().toISOString();
        this.endTime = data.endTime || null;
        this.durationMinutes = data.durationMinutes || 0;
        this.categoryId = data.categoryId || null;
        this.notes = data.notes || '';
        this.createdAt = data.createdAt || new Date().toISOString();
    }

    // Calculate duration if end time is set
    calculateDuration() {
        if (!this.endTime) return 0;
        const start = new Date(this.startTime);
        const end = new Date(this.endTime);
        return Math.round((end - start) / (1000 * 60));
    }

    toJSON() {
        return { ...this };
    }
}

/**
 * RevisionItem Model
 * Represents an item for spaced repetition review (memorization tracking)
 */
class RevisionItem {
    constructor(data = {}) {
        this.id = data.id || generateUUID();
        this.title = data.title || '';
        this.content = data.content || '';      // The text/content to revise
        this.source = data.source || null;      // { type: 'page'|'document'|'manual', docName, pageNumber }
        this.category = data.category || 'tomorrow';  // 'tomorrow'|'3days'|'week'
        this.dueDate = data.dueDate || this.calculateDueDate(data.category || 'tomorrow');
        this.createdAt = data.createdAt || new Date().toISOString();
        this.lastReviewed = data.lastReviewed || null;
        this.reviewCount = data.reviewCount || 0;
        this.notes = data.notes || '';          // User's personal notes
        this.color = data.color || '#8b5cf6';   // Visual identifier color
    }

    // Calculate due date based on category
    calculateDueDate(category) {
        const now = new Date();
        switch (category) {
            case 'tomorrow':
                now.setDate(now.getDate() + 1);
                break;
            case '3days':
                now.setDate(now.getDate() + 3);
                break;
            case 'week':
                now.setDate(now.getDate() + 7);
                break;
            default:
                now.setDate(now.getDate() + 1);
        }
        return now.toISOString().split('T')[0];
    }

    // Mark as reviewed and calculate next review date
    markReviewed(nextCategory = null) {
        this.lastReviewed = new Date().toISOString();
        this.reviewCount++;

        // Auto-progression if no category specified
        if (!nextCategory) {
            if (this.category === 'tomorrow') {
                nextCategory = '3days';
            } else if (this.category === '3days') {
                nextCategory = 'week';
            } else {
                nextCategory = 'completed';
            }
        }

        if (nextCategory !== 'completed') {
            this.category = nextCategory;
            this.dueDate = this.calculateDueDate(nextCategory);
        }

        return nextCategory;
    }

    // Check if review is due
    isDue() {
        const today = new Date().toISOString().split('T')[0];
        return this.dueDate <= today;
    }

    toJSON() {
        return { ...this };
    }
}

// ============================================================================
// PREDEFINED ACHIEVEMENTS
// ============================================================================
const ACHIEVEMENT_DEFINITIONS = [
    // Streak Achievements
    { id: 'streak_3', title: 'Getting Started', description: 'Maintain a 3-day productivity streak', icon: 'fas fa-fire', category: 'streaks', requirement: { type: 'streak', value: 3 }, rarity: 'common' },
    { id: 'streak_7', title: 'Week Warrior', description: 'Maintain a 7-day productivity streak', icon: 'fas fa-fire', category: 'streaks', requirement: { type: 'streak', value: 7 }, rarity: 'common' },
    { id: 'streak_14', title: 'Fortnight Fighter', description: 'Maintain a 14-day productivity streak', icon: 'fas fa-fire-alt', category: 'streaks', requirement: { type: 'streak', value: 14 }, rarity: 'rare' },
    { id: 'streak_30', title: 'Monthly Master', description: 'Maintain a 30-day productivity streak', icon: 'fas fa-medal', category: 'streaks', requirement: { type: 'streak', value: 30 }, rarity: 'epic' },
    { id: 'streak_100', title: 'Century Legend', description: 'Maintain a 100-day productivity streak', icon: 'fas fa-crown', category: 'streaks', requirement: { type: 'streak', value: 100 }, rarity: 'legendary' },

    // Focus Achievements
    { id: 'focus_10', title: 'Focus Beginner', description: 'Complete 10 focus sessions', icon: 'fas fa-brain', category: 'focus', requirement: { type: 'focus_sessions', value: 10 }, rarity: 'common' },
    { id: 'focus_50', title: 'Focus Enthusiast', description: 'Complete 50 focus sessions', icon: 'fas fa-brain', category: 'focus', requirement: { type: 'focus_sessions', value: 50 }, rarity: 'rare' },
    { id: 'focus_100', title: 'Focus Master', description: 'Complete 100 focus sessions', icon: 'fas fa-brain', category: 'focus', requirement: { type: 'focus_sessions', value: 100 }, rarity: 'epic' },
    { id: 'focus_8h', title: 'Full Day Focus', description: 'Focus for 8 hours in a single day', icon: 'fas fa-clock', category: 'focus', requirement: { type: 'daily_focus_hours', value: 8 }, rarity: 'rare' },
    { id: 'focus_marathon', title: 'Focus Marathon', description: 'Complete a 90-minute focus session', icon: 'fas fa-running', category: 'focus', requirement: { type: 'session_duration', value: 90 }, rarity: 'rare' },

    // Task Achievements
    { id: 'tasks_10', title: 'Task Tackler', description: 'Complete 10 tasks', icon: 'fas fa-check-circle', category: 'tasks', requirement: { type: 'tasks_completed', value: 10 }, rarity: 'common' },
    { id: 'tasks_50', title: 'Task Terminator', description: 'Complete 50 tasks', icon: 'fas fa-check-double', category: 'tasks', requirement: { type: 'tasks_completed', value: 50 }, rarity: 'rare' },
    { id: 'tasks_100', title: 'Task Titan', description: 'Complete 100 tasks', icon: 'fas fa-trophy', category: 'tasks', requirement: { type: 'tasks_completed', value: 100 }, rarity: 'epic' },
    { id: 'tasks_daily_10', title: 'Super Productive', description: 'Complete 10 tasks in a single day', icon: 'fas fa-bolt', category: 'tasks', requirement: { type: 'daily_tasks', value: 10 }, rarity: 'rare' },
    { id: 'zero_overdue', title: 'Deadline Champion', description: 'Complete 30 days without overdue tasks', icon: 'fas fa-calendar-check', category: 'tasks', requirement: { type: 'no_overdue_days', value: 30 }, rarity: 'epic' },

    // Goal Achievements
    { id: 'goal_first', title: 'Goal Setter', description: 'Create your first goal', icon: 'fas fa-bullseye', category: 'goals', requirement: { type: 'goals_created', value: 1 }, rarity: 'common' },
    { id: 'goal_complete_1', title: 'Goal Achiever', description: 'Complete your first goal', icon: 'fas fa-flag-checkered', category: 'goals', requirement: { type: 'goals_completed', value: 1 }, rarity: 'common' },
    { id: 'goal_complete_5', title: 'Goal Crusher', description: 'Complete 5 goals', icon: 'fas fa-mountain', category: 'goals', requirement: { type: 'goals_completed', value: 5 }, rarity: 'rare' },
    { id: 'milestone_10', title: 'Milestone Maker', description: 'Complete 10 milestones', icon: 'fas fa-map-marker-alt', category: 'goals', requirement: { type: 'milestones_completed', value: 10 }, rarity: 'rare' },

    // Study Time Achievements
    { id: 'study_100h', title: 'Dedicated Learner', description: 'Accumulate 100 hours of study time', icon: 'fas fa-book', category: 'general', requirement: { type: 'total_study_hours', value: 100 }, rarity: 'rare' },
    { id: 'study_500h', title: 'Knowledge Seeker', description: 'Accumulate 500 hours of study time', icon: 'fas fa-graduation-cap', category: 'general', requirement: { type: 'total_study_hours', value: 500 }, rarity: 'epic' },
    { id: 'study_1000h', title: 'Scholar Supreme', description: 'Accumulate 1000 hours of study time', icon: 'fas fa-user-graduate', category: 'general', requirement: { type: 'total_study_hours', value: 1000 }, rarity: 'legendary' },

    // Productivity Score Achievements
    { id: 'perfect_day', title: 'Perfect Day', description: 'Achieve 100% productivity score', icon: 'fas fa-star', category: 'general', requirement: { type: 'productivity_score', value: 100 }, rarity: 'rare' },
    { id: 'perfect_week', title: 'Perfect Week', description: 'Achieve 100% productivity for 7 consecutive days', icon: 'fas fa-crown', category: 'general', requirement: { type: 'perfect_days_streak', value: 7 }, rarity: 'legendary' },

    // Blocker Achievements
    { id: 'blocker_100', title: 'Distraction Destroyer', description: 'Block 100 distraction attempts', icon: 'fas fa-shield-alt', category: 'general', requirement: { type: 'distractions_blocked', value: 100 }, rarity: 'rare' },
    { id: 'blocker_clean_day', title: 'Zero Distractions', description: 'Complete a day with no blocked attempts', icon: 'fas fa-shield-virus', category: 'general', requirement: { type: 'clean_days', value: 1 }, rarity: 'common' }
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a unique UUID
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Get today's date as ISO string (YYYY-MM-DD)
 */
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Format minutes to readable time string
 */
function formatMinutes(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
}

/**
 * Parse date string to Date object with time set to midnight
 */
function parseDate(dateStr) {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    return date;
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.toISOString().split('T')[0] === d2.toISOString().split('T')[0];
}

/**
 * Get the start of the week (Sunday)
 */
function getWeekStart(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Get an array of dates for the current week
 */
function getWeekDates(startDate = getWeekStart()) {
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
}

// ============================================================================
// DATA ACCESS LAYER (STORAGE OPERATIONS)
// ============================================================================

const DataStore = {
    // Generic storage operations
    async get(key, defaultValue = null) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.get([key], (result) => {
                    resolve(result[key] !== undefined ? result[key] : defaultValue);
                });
            } else {
                // Fallback to localStorage for testing
                const stored = localStorage.getItem(key);
                resolve(stored ? JSON.parse(stored) : defaultValue);
            }
        });
    },

    async set(key, value) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.set({ [key]: value }, resolve);
            } else {
                localStorage.setItem(key, JSON.stringify(value));
                resolve();
            }
        });
    },

    async remove(key) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.local.remove([key], resolve);
            } else {
                localStorage.removeItem(key);
                resolve();
            }
        });
    },

    // ========== DAY REVIEW (24h time blocks) ==========
    async getDayReviewMap() {
        return await this.get(STORAGE_KEYS.DAY_REVIEW, {});
    },

    async getDayReviewForDate(dateYMD) {
        const map = await this.getDayReviewMap();
        const key = String(dateYMD || '').trim();
        const entries = key && Array.isArray(map[key]) ? map[key] : [];
        return entries;
    },

    async saveDayReviewForDate(dateYMD, entries) {
        const map = await this.getDayReviewMap();
        const key = String(dateYMD || '').trim();
        if (!key) return [];
        map[key] = Array.isArray(entries) ? entries : [];
        await this.set(STORAGE_KEYS.DAY_REVIEW, map);
        return map[key];
    },

    // ========== TASK LISTS ==========
    async getTaskLists() {
        const lists = await this.get(STORAGE_KEYS.TASK_LISTS, []);
        return lists.map(l => new TaskList(l));
    },

    async saveTaskList(list) {
        const lists = await this.getTaskLists();
        const index = lists.findIndex(l => l.id === list.id);

        if (index >= 0) {
            lists[index] = list;
        } else {
            list.order = lists.length;
            lists.push(list);
        }

        // Handle both class instances with toJSON() and plain objects
        await this.set(STORAGE_KEYS.TASK_LISTS, lists.map(l =>
            typeof l.toJSON === 'function' ? l.toJSON() : l
        ));
        return list;
    },

    async deleteTaskList(listId) {
        const lists = await this.getTaskLists();
        const targetId = String(listId);
        const filtered = lists.filter(l => String(l.id) !== targetId);
        // Handle both class instances with toJSON() and plain objects
        await this.set(STORAGE_KEYS.TASK_LISTS, filtered.map(l =>
            typeof l.toJSON === 'function' ? l.toJSON() : l
        ));

        // Also remove listId from tasks that had this list
        const tasks = await this.getTasks();
        for (const task of tasks) {
            if (task.listId != null && String(task.listId) === targetId) {
                task.listId = null;
                await this.saveTask(task);
            }
        }
    },

    async toggleTaskListVisibility(listId) {
        const lists = await this.getTaskLists();
        const targetId = String(listId);
        const list = lists.find(l => String(l.id) === targetId);
        if (list) {
            list.isVisible = !list.isVisible;
            // Handle both class instances with toJSON() and plain objects
            await this.set(STORAGE_KEYS.TASK_LISTS, lists.map(l =>
                typeof l.toJSON === 'function' ? l.toJSON() : l
            ));
        }
        return list;
    },

    // ========== TASKS ==========
    async getTasks() {
        const stored = await this.get(STORAGE_KEYS.TASKS, []);
        const tasks = stored.map(t => new Task(t));

        // Ensure recurring tasks reappear when a new day starts
        const { tasks: rolled, didChange } = rolloverRecurringTasks(tasks);
        if (didChange) {
            await this.set(STORAGE_KEYS.TASKS, rolled.map(t => t.toJSON()));
        }

        return rolled;
    },

    async saveTask(task) {
        const tasks = await this.getTasks();
        const index = tasks.findIndex(t => t.id === task.id);

        task.updatedAt = new Date().toISOString();

        if (index >= 0) {
            tasks[index] = task;
        } else {
            tasks.push(task);
        }

        await this.set(STORAGE_KEYS.TASKS, tasks.map(t => t.toJSON()));
        return task;
    },

    async deleteTask(taskId) {
        const tasks = await this.getTasks();
        const filtered = tasks.filter(t => t.id !== taskId);
        await this.set(STORAGE_KEYS.TASKS, filtered.map(t => t.toJSON()));
    },

    async getTasksByStatus(status) {
        const tasks = await this.getTasks();
        return tasks.filter(t => t.status === status);
    },

    async getTasksByDate(date) {
        const tasks = await this.getTasks();
        return tasks.filter(t => t.dueDate === date);
    },

    async getOverdueTasks() {
        const tasks = await this.getTasks();
        return tasks.filter(t => t.isOverdue);
    },

    async getPriorityTasks(limit = 5) {
        const tasks = await this.getTasks();
        return tasks
            .filter(t => t.status !== 'completed')
            .sort((a, b) => {
                // Sort by priority weight, then by due date
                if (b.priorityWeight !== a.priorityWeight) {
                    return b.priorityWeight - a.priorityWeight;
                }
                if (a.dueDate && b.dueDate) {
                    return new Date(a.dueDate) - new Date(b.dueDate);
                }
                return a.dueDate ? -1 : 1;
            })
            .slice(0, limit);
    },

    // ========== SCHEDULE EVENTS ==========
    async getScheduleEvents(scheduleType = null) {
        const schoolEvents = await this.get(STORAGE_KEYS.SCHEDULE_SCHOOL, []);
        const personalEvents = await this.get(STORAGE_KEYS.SCHEDULE_PERSONAL, []);

        let events = [];
        if (!scheduleType || scheduleType === 'school') {
            events = events.concat(schoolEvents.map(e => new ScheduleEvent({ ...e, scheduleType: 'school' })));
        }
        if (!scheduleType || scheduleType === 'personal') {
            events = events.concat(personalEvents.map(e => new ScheduleEvent({ ...e, scheduleType: 'personal' })));
        }

        return events;
    },

    async saveScheduleEvent(event) {
        const key = event.scheduleType === 'school'
            ? STORAGE_KEYS.SCHEDULE_SCHOOL
            : STORAGE_KEYS.SCHEDULE_PERSONAL;

        const events = await this.get(key, []);
        const index = events.findIndex(e => e.id === event.id);

        event.updatedAt = new Date().toISOString();

        if (index >= 0) {
            events[index] = event.toJSON();
        } else {
            events.push(event.toJSON());
        }

        await this.set(key, events);
        return event;
    },

    async deleteScheduleEvent(eventId, scheduleType) {
        const key = scheduleType === 'school'
            ? STORAGE_KEYS.SCHEDULE_SCHOOL
            : STORAGE_KEYS.SCHEDULE_PERSONAL;

        const events = await this.get(key, []);
        const filtered = events.filter(e => e.id !== eventId);
        await this.set(key, filtered);
    },

    async getEventsForDate(date) {
        const allEvents = await this.getScheduleEvents();
        return allEvents.filter(e => e.occursOn(date));
    },

    async getEventsForWeek(weekStartDate) {
        const dates = getWeekDates(weekStartDate);
        const allEvents = await this.getScheduleEvents();

        const weekEvents = {};
        dates.forEach(date => {
            weekEvents[date] = allEvents.filter(e => e.occursOn(date));
        });

        return weekEvents;
    },

    // ========== GOALS ==========
    async getGoals() {
        const goals = await this.get(STORAGE_KEYS.GOALS, []);
        return goals.map(g => new Goal(g));
    },

    async saveGoal(goal) {
        const goals = await this.getGoals();
        const index = goals.findIndex(g => g.id === goal.id);

        goal.updatedAt = new Date().toISOString();
        goal.progress = goal.calculateProgress();

        if (index >= 0) {
            goals[index] = goal;
        } else {
            goals.push(goal);
        }

        await this.set(STORAGE_KEYS.GOALS, goals.map(g => g.toJSON()));
        return goal;
    },

    async deleteGoal(goalId) {
        const goals = await this.getGoals();
        const filtered = goals.filter(g => g.id !== goalId);
        await this.set(STORAGE_KEYS.GOALS, filtered.map(g => g.toJSON()));
    },

    async getActiveGoals() {
        const goals = await this.getGoals();
        return goals.filter(g => g.status === 'active');
    },

    // ========== ACCOUNTABILITY CHECK-INS ==========
    async getAccountabilityCheckins() {
        return await this.get(STORAGE_KEYS.ACCOUNTABILITY_CHECKINS, {});
    },

    async saveAccountabilityCheckin(checkin) {
        const checkins = await this.getAccountabilityCheckins();
        checkins[checkin.date] = checkin.toJSON ? checkin.toJSON() : checkin;
        await this.set(STORAGE_KEYS.ACCOUNTABILITY_CHECKINS, checkins);
        return checkin;
    },

    async getCheckinForDate(date) {
        const checkins = await this.getAccountabilityCheckins();
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        return checkins[dateStr] ? new AccountabilityCheckin(checkins[dateStr]) : null;
    },

    async getCheckinStreak() {
        const checkins = await this.getAccountabilityCheckins();
        const dates = Object.keys(checkins).sort().reverse();
        if (dates.length === 0) return 0;

        let streak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < dates.length; i++) {
            const checkDate = new Date(dates[i]);
            checkDate.setHours(0, 0, 0, 0);
            const expectedDate = new Date(today);
            expectedDate.setDate(expectedDate.getDate() - i);

            if (checkDate.getTime() === expectedDate.getTime()) {
                streak++;
            } else if (i === 0 && checkDate.getTime() === expectedDate.getTime() - 86400000) {
                // Yesterday is OK for first check
                continue;
            } else {
                break;
            }
        }
        return streak;
    },

    // ========== COMMITMENT STATS ==========
    async getCommitmentStats() {
        const data = await this.get(STORAGE_KEYS.COMMITMENT_STATS, {});
        return new CommitmentStats(data);
    },

    async saveCommitmentStats(stats) {
        stats.lastUpdated = new Date().toISOString();
        await this.set(STORAGE_KEYS.COMMITMENT_STATS, stats.toJSON ? stats.toJSON() : stats);
        return stats;
    },

    async incrementGoalStat(statName, amount = 1) {
        const stats = await this.getCommitmentStats();
        if (statName in stats) {
            stats[statName] += amount;
        }
        if (statName === 'xpLostToDecay' || statName === 'xpLostToPenalties') {
            stats.totalXPLost += amount;
        }
        await this.saveCommitmentStats(stats);
        return stats;
    },

    // ========== FOCUS SESSIONS ==========
    async getFocusSessions() {
        const sessions = await this.get(STORAGE_KEYS.FOCUS_SESSIONS, []);
        return sessions.map(s => new FocusSession(s));
    },

    async saveFocusSession(session) {
        const sessions = await this.getFocusSessions();
        const index = sessions.findIndex(s => s.id === session.id);

        if (index >= 0) {
            sessions[index] = session;
        } else {
            sessions.push(session);
        }

        // Handle both class instances with toJSON() and plain objects
        await this.set(STORAGE_KEYS.FOCUS_SESSIONS, sessions.map(s =>
            typeof s.toJSON === 'function' ? s.toJSON() : s
        ));
        return session;
    },

    async getTodaySessions() {
        const sessions = await this.getFocusSessions();
        const today = getTodayDate();
        return sessions.filter(s => s.date === today);
    },

    async getSessionsByDateRange(startDate, endDate) {
        const sessions = await this.getFocusSessions();
        return sessions.filter(s => s.date >= startDate && s.date <= endDate);
    },

    // ========== DAILY STATS ==========
    async getDailyStats(date = getTodayDate()) {
        const allStats = await this.get(STORAGE_KEYS.DAILY_STATS, {});
        return allStats[date] ? new DailyStats(allStats[date]) : new DailyStats({ date });
    },

    async saveDailyStats(stats) {
        const allStats = await this.get(STORAGE_KEYS.DAILY_STATS, {});
        // Handle both class instances with toJSON() and plain objects
        allStats[stats.date] = typeof stats.toJSON === 'function' ? stats.toJSON() : stats;
        await this.set(STORAGE_KEYS.DAILY_STATS, allStats);
        return stats;
    },

    async getStatsForDateRange(startDate, endDate) {
        const allStats = await this.get(STORAGE_KEYS.DAILY_STATS, {});
        const result = {};

        let current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            result[dateStr] = allStats[dateStr]
                ? new DailyStats(allStats[dateStr])
                : new DailyStats({ date: dateStr });
            current.setDate(current.getDate() + 1);
        }

        return result;
    },

    // ========== STREAKS ==========
    async getStreakData() {
        const data = await this.get(STORAGE_KEYS.STREAKS, {});
        return new StreakData(data);
    },

    async saveStreakData(streakData) {
        await this.set(STORAGE_KEYS.STREAKS, streakData.toJSON());
        return streakData;
    },

    // ========== BLOCKED SITES ==========
    async getBlockedSites() {
        const sites = await this.get(STORAGE_KEYS.BLOCKED_SITES, []);
        return sites.map(s => new BlockedSite(s));
    },

    async saveBlockedSite(site) {
        const sites = await this.getBlockedSites();
        const index = sites.findIndex(s => s.id === site.id);

        if (index >= 0) {
            sites[index] = site;
        } else {
            sites.push(site);
        }

        await this.set(STORAGE_KEYS.BLOCKED_SITES, sites.map(s => s.toJSON()));
        return site;
    },

    async deleteBlockedSite(siteId) {
        const sites = await this.getBlockedSites();
        const filtered = sites.filter(s => s.id !== siteId);
        await this.set(STORAGE_KEYS.BLOCKED_SITES, filtered.map(s => s.toJSON()));
    },

    async addBlockedSiteByDomain(domain, category = 'custom') {
        const site = new BlockedSite({ domain, category });
        return this.saveBlockedSite(site);
    },

    // ========== BLOCKED ATTEMPTS ==========
    async logBlockedAttempt(domain) {
        const attempts = await this.get(STORAGE_KEYS.BLOCKED_ATTEMPTS, []);
        attempts.push({
            domain,
            timestamp: new Date().toISOString(),
            date: getTodayDate()
        });

        // Keep only last 1000 attempts
        if (attempts.length > 1000) {
            attempts.splice(0, attempts.length - 1000);
        }

        await this.set(STORAGE_KEYS.BLOCKED_ATTEMPTS, attempts);
    },

    async getTodayBlockedAttempts() {
        const attempts = await this.get(STORAGE_KEYS.BLOCKED_ATTEMPTS, []);
        const today = getTodayDate();
        return attempts.filter(a => a.date === today);
    },

    // ========== IDLE CATEGORIES ==========
    async getIdleCategories() {
        const categories = await this.get(STORAGE_KEYS.IDLE_CATEGORIES, []);
        return categories.map(c => new IdleCategory(c));
    },

    async saveIdleCategory(category) {
        const categories = await this.getIdleCategories();
        const index = categories.findIndex(c => c.id === category.id);

        if (index >= 0) {
            categories[index] = category;
        } else {
            categories.push(category);
        }

        await this.set(STORAGE_KEYS.IDLE_CATEGORIES, categories.map(c => c.toJSON()));
        return category;
    },

    async deleteIdleCategory(categoryId) {
        const categories = await this.getIdleCategories();
        const filtered = categories.filter(c => c.id !== categoryId);
        await this.set(STORAGE_KEYS.IDLE_CATEGORIES, filtered.map(c => c.toJSON()));

        // Remove category from records that used it
        const records = await this.getIdleRecords();
        for (const record of records) {
            if (record.categoryId === categoryId) {
                record.categoryId = null;
                await this.saveIdleRecord(record);
            }
        }
    },

    // ========== IDLE RECORDS ==========
    async getIdleRecords(dateRange = null) {
        let records = await this.get(STORAGE_KEYS.IDLE_RECORDS, []);

        // Deduplicate records based on startTime
        const seen = new Map();
        const deduped = [];
        records.forEach(r => {
            if (!seen.has(r.startTime)) {
                seen.set(r.startTime, true);
                deduped.push(r);
            }
        });

        // If duplicates were found, save the cleaned list
        if (deduped.length < records.length) {
            await this.set(STORAGE_KEYS.IDLE_RECORDS, deduped);
            records = deduped;
        }

        let result = records.map(r => new IdleRecord(r));

        if (dateRange && dateRange.startDate && dateRange.endDate) {
            result = result.filter(r => r.date >= dateRange.startDate && r.date <= dateRange.endDate);
        }

        return result.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    },

    async saveIdleRecord(record) {
        const records = await this.get(STORAGE_KEYS.IDLE_RECORDS, []);
        const index = records.findIndex(r => r.id === record.id);

        if (index >= 0) {
            records[index] = typeof record.toJSON === 'function' ? record.toJSON() : record;
        } else {
            records.push(typeof record.toJSON === 'function' ? record.toJSON() : record);
        }

        await this.set(STORAGE_KEYS.IDLE_RECORDS, records);
        return record;
    },

    async deleteIdleRecord(recordId) {
        const records = await this.get(STORAGE_KEYS.IDLE_RECORDS, []);
        const filtered = records.filter(r => r.id !== recordId);
        await this.set(STORAGE_KEYS.IDLE_RECORDS, filtered);
    },

    async getIdleAnalytics(dateRange = null) {
        const records = await this.getIdleRecords(dateRange);
        const categories = await this.getIdleCategories();

        // Total idle time
        const totalIdleMinutes = records.reduce((sum, r) => sum + r.durationMinutes, 0);

        // Records by category
        const categoryStats = {};
        for (const record of records) {
            const catId = record.categoryId || 'uncategorized';
            if (!categoryStats[catId]) {
                categoryStats[catId] = {
                    categoryId: catId,
                    categoryName: catId === 'uncategorized' ? 'Uncategorized' :
                        (categories.find(c => c.id === catId)?.name || 'Unknown'),
                    color: catId === 'uncategorized' ? '#6b7280' :
                        (categories.find(c => c.id === catId)?.color || '#6b7280'),
                    totalMinutes: 0,
                    recordCount: 0
                };
            }
            categoryStats[catId].totalMinutes += record.durationMinutes;
            categoryStats[catId].recordCount++;
        }

        // Calculate percentages
        const categoryBreakdown = Object.values(categoryStats).map(stat => ({
            ...stat,
            percentage: totalIdleMinutes > 0 ? Math.round((stat.totalMinutes / totalIdleMinutes) * 100) : 0
        })).sort((a, b) => b.totalMinutes - a.totalMinutes);

        // Idle by day of week
        const dayStats = {};
        for (let i = 0; i < 7; i++) dayStats[i] = 0;
        for (const record of records) {
            const day = new Date(record.date).getDay();
            dayStats[day] += record.durationMinutes;
        }

        // Idle by hour of day
        const hourStats = {};
        for (let i = 0; i < 24; i++) hourStats[i] = 0;
        for (const record of records) {
            const hour = new Date(record.startTime).getHours();
            hourStats[hour] += record.durationMinutes;
        }

        // Find peak idle hour
        let peakHour = 0;
        let peakMinutes = 0;
        for (const [hour, minutes] of Object.entries(hourStats)) {
            if (minutes > peakMinutes) {
                peakHour = parseInt(hour);
                peakMinutes = minutes;
            }
        }

        return {
            totalIdleMinutes,
            totalRecords: records.length,
            categoryBreakdown,
            dayStats,
            hourStats,
            peakIdleHour: peakHour,
            averageIdleMinutes: records.length > 0 ? Math.round(totalIdleMinutes / records.length) : 0
        };
    },

    // ========== ACHIEVEMENTS ==========
    async getAchievements() {
        const unlocked = await this.get(STORAGE_KEYS.ACHIEVEMENTS, {});

        return ACHIEVEMENT_DEFINITIONS.map(def => {
            const achievement = new Achievement(def);
            if (unlocked[def.id]) {
                achievement.isUnlocked = true;
                achievement.unlockedAt = unlocked[def.id].unlockedAt;
                achievement.progress = unlocked[def.id].progress || 0;
            }
            return achievement;
        });
    },

    async unlockAchievement(achievementId) {
        const unlocked = await this.get(STORAGE_KEYS.ACHIEVEMENTS, {});

        if (!unlocked[achievementId]) {
            unlocked[achievementId] = {
                isUnlocked: true,
                unlockedAt: new Date().toISOString()
            };
            await this.set(STORAGE_KEYS.ACHIEVEMENTS, unlocked);
            return true;
        }
        return false;
    },

    async updateAchievementProgress(achievementId, progress) {
        const unlocked = await this.get(STORAGE_KEYS.ACHIEVEMENTS, {});

        if (!unlocked[achievementId]) {
            unlocked[achievementId] = { progress };
        } else {
            unlocked[achievementId].progress = progress;
        }

        await this.set(STORAGE_KEYS.ACHIEVEMENTS, unlocked);
    },

    // ========== SETTINGS ==========
    async getSettings() {
        const settings = await this.get(STORAGE_KEYS.SETTINGS, {});
        return new UserSettings(settings);
    },

    async saveSettings(settings) {
        // Handle both class instances with toJSON() and plain objects
        const dataToSave = typeof settings.toJSON === 'function' ? settings.toJSON() : settings;

        // Merge with existing settings to preserve other fields
        const existing = await this.get(STORAGE_KEYS.SETTINGS, {});
        const merged = { ...existing, ...dataToSave };

        await this.set(STORAGE_KEYS.SETTINGS, merged);
        return settings;
    },

    // ========== REVISIONS (SPACED REPETITION) ==========
    async getRevisions() {
        const revisions = await this.get(STORAGE_KEYS.REVISIONS, []);
        return revisions.map(r => new RevisionItem(r));
    },

    async getRevisionsByCategory(category) {
        const revisions = await this.getRevisions();
        return revisions.filter(r => r.category === category);
    },

    async getDueRevisions() {
        const revisions = await this.getRevisions();
        const today = new Date().toISOString().split('T')[0];
        return revisions.filter(r => r.dueDate <= today);
    },

    async saveRevision(revision) {
        const revisions = await this.getRevisions();
        const index = revisions.findIndex(r => r.id === revision.id);

        if (index >= 0) {
            revisions[index] = revision;
        } else {
            revisions.push(revision);
        }

        await this.set(STORAGE_KEYS.REVISIONS, revisions.map(r =>
            typeof r.toJSON === 'function' ? r.toJSON() : r
        ));
        return revision;
    },

    async updateRevision(revisionId, updates) {
        const revisions = await this.getRevisions();
        const revision = revisions.find(r => r.id === revisionId);

        if (revision) {
            Object.assign(revision, updates);
            await this.set(STORAGE_KEYS.REVISIONS, revisions.map(r =>
                typeof r.toJSON === 'function' ? r.toJSON() : r
            ));
            return revision;
        }
        return null;
    },

    async deleteRevision(revisionId) {
        const revisions = await this.getRevisions();
        const filtered = revisions.filter(r => r.id !== revisionId);
        await this.set(STORAGE_KEYS.REVISIONS, filtered.map(r =>
            typeof r.toJSON === 'function' ? r.toJSON() : r
        ));
    },

    async markRevisionReviewed(revisionId, nextCategory = null) {
        const revisions = await this.getRevisions();
        const revision = revisions.find(r => r.id === revisionId);

        if (revision) {
            const result = revision.markReviewed(nextCategory);

            if (result === 'completed') {
                // Remove from active revisions
                await this.deleteRevision(revisionId);
                return { status: 'completed', revision };
            } else {
                await this.set(STORAGE_KEYS.REVISIONS, revisions.map(r =>
                    typeof r.toJSON === 'function' ? r.toJSON() : r
                ));
                return { status: 'moved', category: result, revision };
            }
        }
        return null;
    },

    async getRevisionStats() {
        const revisions = await this.getRevisions();
        const today = new Date().toISOString().split('T')[0];

        // Calculate one week from now
        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
        const oneWeekDate = oneWeekFromNow.toISOString().split('T')[0];

        // Count reviews done today
        const reviewsDoneToday = revisions.filter(r =>
            r.lastReviewed && r.lastReviewed.startsWith(today)
        ).length;

        // Count finished items (reviewed and due after more than a week)
        const finished = revisions.filter(r =>
            r.reviewCount > 0 && r.dueDate && r.dueDate > oneWeekDate
        ).length;

        return {
            total: revisions.length,
            tomorrow: revisions.filter(r => r.category === 'tomorrow').length,
            threeDays: revisions.filter(r => r.category === '3days').length,
            week: revisions.filter(r => r.category === 'week').length,
            due: revisions.filter(r => r.dueDate <= today).length,
            finished: finished,
            totalReviews: revisions.reduce((acc, r) => acc + r.reviewCount, 0),
            reviewsDoneToday
        };
    },

    // ========== ANALYTICS HELPERS ==========
    async reconcileDailyStatsRange(startDate, endDate) {
        const tasks = await this.getTasks();
        const sessions = await this.getSessionsByDateRange(startDate, endDate);
        const settings = await this.getSettings();

        const allStats = await this.get(STORAGE_KEYS.DAILY_STATS, {});

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return;
        }

        let changed = false;
        const current = new Date(start);
        while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            const stats = allStats[dateStr] ? new DailyStats(allStats[dateStr]) : new DailyStats({ date: dateStr });

            const computedTasksCompleted = tasks.filter(t =>
                t.status === 'completed' && typeof t.completedAt === 'string' && t.completedAt.startsWith(dateStr)
            ).length;

            const daySessions = sessions.filter(s => s.date === dateStr);
            const computedFocusMinutes = daySessions
                .filter(s => s.status !== 'active' && s.endTime)
                .reduce((acc, s) => acc + (s.actualDurationMinutes || 0), 0);

            const computedFocusSessions = daySessions.filter(s => s.status === 'completed').length;

            const nextTasks = Math.max(stats.tasksCompleted || 0, computedTasksCompleted);
            const nextMinutes = Math.max(stats.focusMinutes || 0, computedFocusMinutes);
            const nextSessions = Math.max(stats.focusSessions || 0, computedFocusSessions);

            if (nextTasks !== stats.tasksCompleted || nextMinutes !== stats.focusMinutes || nextSessions !== stats.focusSessions) {
                stats.tasksCompleted = nextTasks;
                stats.focusMinutes = nextMinutes;
                stats.focusSessions = nextSessions;
                stats.calculateProductivityScore(settings);
                allStats[dateStr] = stats.toJSON();
                changed = true;
            }

            current.setDate(current.getDate() + 1);
        }

        if (changed) {
            await this.set(STORAGE_KEYS.DAILY_STATS, allStats);
        }
    },

    async calculateWeeklyStats() {
        const weekStart = getWeekStart();
        const weekDates = getWeekDates(weekStart);

        // Repair stats if some actions didn't update DAILY_STATS (e.g., task board drag/drop).
        await this.reconcileDailyStatsRange(weekDates[0], weekDates[6]);

        const statsMap = await this.getStatsForDateRange(weekDates[0], weekDates[6]);

        let totalMinutes = 0;
        let totalTasks = 0;
        let totalSessions = 0;

        weekDates.forEach(date => {
            const stats = statsMap[date];
            totalMinutes += stats.focusMinutes;
            totalTasks += stats.tasksCompleted;
            totalSessions += stats.focusSessions;
        });

        return {
            totalHours: Math.round(totalMinutes / 60 * 10) / 10,
            avgHours: Math.round(totalMinutes / 7 / 60 * 10) / 10,
            totalTasks,
            totalSessions,
            dailyStats: statsMap
        };
    },

    async getSubjectBreakdown(startDate, endDate) {
        const sessions = await this.getSessionsByDateRange(startDate, endDate);
        const breakdown = {};

        sessions.forEach(session => {
            const subject = session.subject || 'General';
            if (!breakdown[subject]) {
                breakdown[subject] = 0;
            }
            breakdown[subject] += session.actualDurationMinutes;
        });

        return breakdown;
    },

    // ========== DATA EXPORT/IMPORT ==========
    async exportAllData() {
        const data = {
            version: '2.0',
            exportDate: new Date().toISOString(),
            source: typeof window !== 'undefined' && window.electron ? 'desktop' : 'extension',
            tasks: await this.get(STORAGE_KEYS.TASKS, []),
            taskLists: await this.get(STORAGE_KEYS.TASK_LISTS, []),
            scheduleSchool: await this.get(STORAGE_KEYS.SCHEDULE_SCHOOL, []),
            schedulePersonal: await this.get(STORAGE_KEYS.SCHEDULE_PERSONAL, []),
            goals: await this.get(STORAGE_KEYS.GOALS, []),
            focusSessions: await this.get(STORAGE_KEYS.FOCUS_SESSIONS, []),
            dailyStats: await this.get(STORAGE_KEYS.DAILY_STATS, {}),
            streaks: await this.get(STORAGE_KEYS.STREAKS, {}),
            blockedSites: await this.get(STORAGE_KEYS.BLOCKED_SITES, []),
            blockedAttempts: await this.get(STORAGE_KEYS.BLOCKED_ATTEMPTS, []),
            achievements: await this.get(STORAGE_KEYS.ACHIEVEMENTS, {}),
            settings: await this.get(STORAGE_KEYS.SETTINGS, {}),
            revisions: await this.get(STORAGE_KEYS.REVISIONS, []),
            idleRecords: await this.get(STORAGE_KEYS.IDLE_RECORDS, []),
            idleCategories: await this.get(STORAGE_KEYS.IDLE_CATEGORIES, []),
            websiteTimeLimits: await this.get(STORAGE_KEYS.WEBSITE_TIME_LIMITS, []),
            websiteDailyUsage: await this.get(STORAGE_KEYS.WEBSITE_DAILY_USAGE, {})
        };

        return JSON.stringify(data, null, 2);
    },

    async importAllData(jsonString, options = { merge: false }) {
        try {
            const data = JSON.parse(jsonString);
            const merge = options.merge;

            // Helper to merge arrays by ID or replace
            const mergeOrReplace = async (key, newData) => {
                if (!newData) return;
                if (merge && Array.isArray(newData)) {
                    const existing = await this.get(key, []);
                    const merged = [...existing];
                    for (const item of newData) {
                        const idx = merged.findIndex(e => e.id === item.id);
                        if (idx >= 0) {
                            // Update existing - prefer newer data
                            if (item.updatedAt > (merged[idx].updatedAt || '')) {
                                merged[idx] = item;
                            }
                        } else {
                            merged.push(item);
                        }
                    }
                    await this.set(key, merged);
                } else {
                    await this.set(key, newData);
                }
            };

            // Helper to merge objects
            const mergeOrReplaceObj = async (key, newData) => {
                if (!newData) return;
                if (merge) {
                    const existing = await this.get(key, {});
                    await this.set(key, { ...existing, ...newData });
                } else {
                    await this.set(key, newData);
                }
            };

            // Import all data
            await mergeOrReplace(STORAGE_KEYS.TASKS, data.tasks);
            await mergeOrReplace(STORAGE_KEYS.TASK_LISTS, data.taskLists);
            await mergeOrReplace(STORAGE_KEYS.SCHEDULE_SCHOOL, data.scheduleSchool);
            await mergeOrReplace(STORAGE_KEYS.SCHEDULE_PERSONAL, data.schedulePersonal);
            await mergeOrReplace(STORAGE_KEYS.GOALS, data.goals);
            await mergeOrReplace(STORAGE_KEYS.FOCUS_SESSIONS, data.focusSessions);
            await mergeOrReplaceObj(STORAGE_KEYS.DAILY_STATS, data.dailyStats);
            await mergeOrReplaceObj(STORAGE_KEYS.STREAKS, data.streaks);
            await mergeOrReplace(STORAGE_KEYS.BLOCKED_SITES, data.blockedSites);
            await mergeOrReplace(STORAGE_KEYS.BLOCKED_ATTEMPTS, data.blockedAttempts);
            await mergeOrReplaceObj(STORAGE_KEYS.ACHIEVEMENTS, data.achievements);
            await mergeOrReplaceObj(STORAGE_KEYS.SETTINGS, data.settings);
            await mergeOrReplace(STORAGE_KEYS.REVISIONS, data.revisions);
            await mergeOrReplace(STORAGE_KEYS.IDLE_RECORDS, data.idleRecords);
            await mergeOrReplace(STORAGE_KEYS.IDLE_CATEGORIES, data.idleCategories);
            await mergeOrReplace(STORAGE_KEYS.WEBSITE_TIME_LIMITS, data.websiteTimeLimits);
            await mergeOrReplaceObj(STORAGE_KEYS.WEBSITE_DAILY_USAGE, data.websiteDailyUsage);

            return { success: true, version: data.version, source: data.source, exportDate: data.exportDate };
        } catch (error) {
            console.error('Import failed:', error);
            return { success: false, error: error.message };
        }
    },

    // Export to file (triggers download)
    async exportToFile() {
        const data = await this.exportAllData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `productivity-hub-sync-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    },

    // Import from file (opens file picker)
    async importFromFile(options = { merge: false }) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    resolve({ success: false, error: 'No file selected' });
                    return;
                }
                try {
                    const text = await file.text();
                    const result = await this.importAllData(text, options);
                    resolve(result);
                } catch (error) {
                    resolve({ success: false, error: error.message });
                }
            };
            input.click();
        });
    },

    async clearAllData() {
        const keys = Object.values(STORAGE_KEYS);
        for (const key of keys) {
            await this.remove(key);
        }
    }
};

// ============================================================================
// PRODUCTIVITY CALCULATOR
// ============================================================================

const ProductivityCalculator = {
    /**
     * Calculate today's productivity score
     */
    async calculateTodayScore() {
        const settings = await DataStore.getSettings();
        const stats = await DataStore.getDailyStats();
        return stats.calculateProductivityScore(settings);
    },

    /**
     * Check and update achievements
     */
    async checkAchievements() {
        const newlyUnlocked = [];

        // Get all required data
        const streakData = await DataStore.getStreakData();
        const sessions = await DataStore.getFocusSessions();
        const tasks = await DataStore.getTasks();
        const goals = await DataStore.getGoals();
        const todayStats = await DataStore.getDailyStats();
        const blockedAttempts = await DataStore.getTodayBlockedAttempts();

        // Calculate totals
        const totalSessions = sessions.filter(s => s.status === 'completed').length;
        const totalTasksCompleted = tasks.filter(t => t.status === 'completed').length;
        const totalGoalsCompleted = goals.filter(g => g.status === 'completed').length;
        const totalStudyMinutes = sessions.reduce((acc, s) => acc + s.actualDurationMinutes, 0);
        const totalStudyHours = Math.floor(totalStudyMinutes / 60);
        const totalMilestones = goals.reduce((acc, g) =>
            acc + g.milestones.filter(m => m.isCompleted).length, 0);

        // Get achievements
        const achievements = await DataStore.getAchievements();

        for (const achievement of achievements) {
            if (achievement.isUnlocked) continue;

            let shouldUnlock = false;
            let progress = 0;

            switch (achievement.requirement.type) {
                case 'streak':
                    progress = streakData.currentStreak;
                    shouldUnlock = streakData.currentStreak >= achievement.requirement.value;
                    break;

                case 'focus_sessions':
                    progress = totalSessions;
                    shouldUnlock = totalSessions >= achievement.requirement.value;
                    break;

                case 'tasks_completed':
                    progress = totalTasksCompleted;
                    shouldUnlock = totalTasksCompleted >= achievement.requirement.value;
                    break;

                case 'goals_completed':
                    progress = totalGoalsCompleted;
                    shouldUnlock = totalGoalsCompleted >= achievement.requirement.value;
                    break;

                case 'goals_created':
                    progress = goals.length;
                    shouldUnlock = goals.length >= achievement.requirement.value;
                    break;

                case 'milestones_completed':
                    progress = totalMilestones;
                    shouldUnlock = totalMilestones >= achievement.requirement.value;
                    break;

                case 'total_study_hours':
                    progress = totalStudyHours;
                    shouldUnlock = totalStudyHours >= achievement.requirement.value;
                    break;

                case 'daily_focus_hours':
                    progress = Math.floor(todayStats.focusMinutes / 60);
                    shouldUnlock = todayStats.focusMinutes >= achievement.requirement.value * 60;
                    break;

                case 'daily_tasks':
                    progress = todayStats.tasksCompleted;
                    shouldUnlock = todayStats.tasksCompleted >= achievement.requirement.value;
                    break;

                case 'productivity_score':
                    progress = todayStats.productivityScore;
                    shouldUnlock = todayStats.productivityScore >= achievement.requirement.value;
                    break;

                case 'distractions_blocked':
                    const allAttempts = await DataStore.get(STORAGE_KEYS.BLOCKED_ATTEMPTS, []);
                    progress = allAttempts.length;
                    shouldUnlock = allAttempts.length >= achievement.requirement.value;
                    break;

                case 'clean_days':
                    progress = blockedAttempts.length === 0 ? 1 : 0;
                    shouldUnlock = blockedAttempts.length === 0 && todayStats.focusSessions > 0;
                    break;

                case 'session_duration':
                    const longestSession = Math.max(...sessions.map(s => s.actualDurationMinutes), 0);
                    progress = longestSession;
                    shouldUnlock = longestSession >= achievement.requirement.value;
                    break;
            }

            // Update progress
            await DataStore.updateAchievementProgress(achievement.id, progress);

            // Unlock if requirements met
            if (shouldUnlock) {
                const unlocked = await DataStore.unlockAchievement(achievement.id);
                if (unlocked) {
                    newlyUnlocked.push(achievement);
                }
            }
        }

        return newlyUnlocked;
    },

    /**
     * Update daily stats after an action
     */
    async updateDailyStats(action, data = {}) {
        const stats = await DataStore.getDailyStats();
        const settings = await DataStore.getSettings();

        switch (action) {
            case 'task_completed':
                stats.tasksCompleted++;
                break;
            case 'task_created':
                stats.tasksCreated++;
                break;
            case 'focus_session_completed':
                stats.focusSessions++;
                stats.focusMinutes += data.minutes || 0;
                if (data.subject) {
                    stats.studyBySubject[data.subject] =
                        (stats.studyBySubject[data.subject] || 0) + data.minutes;
                }
                break;
            case 'distraction_blocked':
                stats.distractionsBlocked++;
                break;
            case 'event_attended':
                stats.eventsAttended++;
                break;
        }

        // Recalculate productivity score
        stats.calculateProductivityScore(settings);

        // Check if day is productive enough for streak
        const isProductive =
            stats.focusMinutes >= settings.minProductiveMinutes ||
            stats.tasksCompleted >= settings.minTasksForStreak;

        stats.streakMaintained = isProductive;

        // Update streak
        if (isProductive) {
            const streakData = await DataStore.getStreakData();
            streakData.updateStreak(stats.date, true);
            await DataStore.saveStreakData(streakData);
        }

        await DataStore.saveDailyStats(stats);

        // Check achievements
        await this.checkAchievements();

        return stats;
    },

    /**
     * Generate insights based on data
     */
    async generateInsights() {
        const insights = [];
        const settings = await DataStore.getSettings();
        const weekStats = await DataStore.calculateWeeklyStats();
        const streakData = await DataStore.getStreakData();
        const todayStats = await DataStore.getDailyStats();

        // Streak insights
        if (streakData.currentStreak >= 7) {
            insights.push({
                type: 'positive',
                icon: 'fas fa-fire',
                message: `Amazing! You're on a ${streakData.currentStreak}-day streak! Keep it up!`
            });
        } else if (streakData.currentStreak === 0 && streakData.longestStreak > 0) {
            insights.push({
                type: 'warning',
                icon: 'fas fa-exclamation-triangle',
                message: `Your streak was broken. Your best was ${streakData.longestStreak} days. Start fresh today!`
            });
        }

        // Weekly progress insights
        const targetWeeklyHours = settings.weeklyStudyTarget;
        const percentComplete = Math.round((weekStats.totalHours / targetWeeklyHours) * 100);

        if (percentComplete >= 100) {
            insights.push({
                type: 'positive',
                icon: 'fas fa-trophy',
                message: `You've exceeded your weekly goal of ${targetWeeklyHours}h! Great work!`
            });
        } else if (percentComplete >= 70) {
            insights.push({
                type: 'info',
                icon: 'fas fa-chart-line',
                message: `You're ${percentComplete}% to your weekly goal. ${(targetWeeklyHours - weekStats.totalHours).toFixed(1)}h to go!`
            });
        } else {
            const daysLeft = 7 - new Date().getDay();
            const hoursNeeded = targetWeeklyHours - weekStats.totalHours;
            const dailyNeeded = (hoursNeeded / daysLeft).toFixed(1);
            insights.push({
                type: 'warning',
                icon: 'fas fa-clock',
                message: `Study ${dailyNeeded}h/day for the remaining ${daysLeft} days to reach your weekly goal.`
            });
        }

        // Productivity score insights
        if (todayStats.productivityScore >= 90) {
            insights.push({
                type: 'positive',
                icon: 'fas fa-star',
                message: 'Exceptional productivity today! You\'re in the top tier!'
            });
        } else if (todayStats.productivityScore < 50 && todayStats.focusMinutes > 0) {
            insights.push({
                type: 'info',
                icon: 'fas fa-lightbulb',
                message: 'Try completing more tasks to boost your productivity score.'
            });
        }

        // Peak productivity time
        // (This would require more detailed hourly tracking)

        return insights;
    }
};

// ============================================================================
// EXPORT FOR USE IN OTHER MODULES
// ============================================================================

// Make classes and utilities available globally
window.ProductivityData = {
    // Models
    Task,
    TaskList,
    StudyMaterial,
    ScheduleEvent,
    Goal,
    Milestone,
    AccountabilityCheckin,
    CommitmentStats,
    FocusSession,
    DailyStats,
    StreakData,
    Achievement,
    BlockedSite,
    UserSettings,
    IdleCategory,
    IdleRecord,
    RevisionItem,

    // Storage
    DataStore,
    STORAGE_KEYS,

    // Calculator
    ProductivityCalculator,

    // Utilities
    generateUUID,
    getTodayDate,
    formatMinutes,
    parseDate,
    isSameDay,
    getWeekStart,
    getWeekDates,

    // Achievement definitions
    ACHIEVEMENT_DEFINITIONS
};

// Data models loaded
