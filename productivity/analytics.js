/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - ANALYTICS MODULE (FULL IMPLEMENTATION)
 * ============================================================================
 * 
 * Complete Analytics & Reports with:
 * - Weekly/Monthly focus time charts
 * - Category/Subject breakdown
 * - Activity heatmap
 * - Productivity trends
 * - AI-powered insights
 * - Goal completion rates
 * - Streak tracking
 * - Data export (JSON/CSV)
 * - Comparison with previous periods
 */

// ============================================================================
// ANALYTICS STATE
// ============================================================================
const AnalyticsState = {
    currentPeriod: 'week', // 'week', 'month', 'year'
    weeklyData: [],
    monthlyData: [],
    heatmapData: {},
    comparisonMode: false
};

// Color palette for charts
const CHART_COLORS = {
    primary: '#6366f1',
    secondary: '#10b981',
    accent: '#f59e0b',
    danger: '#ef4444',
    purple: '#8b5cf6',
    cyan: '#06b6d4',
    pink: '#ec4899',
    gradient: ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef']
};

const CATEGORY_COLORS = {
    academic: '#6366f1',
    skill: '#10b981',
    project: '#f59e0b',
    career: '#8b5cf6',
    personal: '#ec4899',
    other: '#64748b'
};

// ============================================================================
// ANALYTICS INITIALIZATION
// ============================================================================
async function loadAnalyticsPage() {
    // Debug removed
    
    try {
        // Load all historical data
        AnalyticsState.weeklyData = await getWeeklyData();
        AnalyticsState.monthlyData = await getMonthlyData();
        AnalyticsState.heatmapData = await getHeatmapData();
        
        // Update all UI components that exist in index.html
        updateAnalyticsSummary();
        renderWeeklyChart(AnalyticsState.weeklyData);
        renderCategoryBreakdown(AnalyticsState.weeklyData);
        renderBoredomBreakdown(AnalyticsState.weeklyData).catch(() => void 0);
        renderWeeklyPerformanceRadar().catch(() => void 0);
        renderHeatmap(AnalyticsState.heatmapData);
        generateInsights();
        
        // Setup period selector
        setupPeriodSelector();
        
    } catch (error) {
        console.error('Failed to load analytics:', error);
        showToast('error', 'Analytics Error', 'Failed to load analytics data.');
    }
}

function showAnalyticsLoading(isLoading) {
    const container = document.getElementById('page-analytics');
    if (!container) return;
    
    if (isLoading) {
        container.classList.add('loading');
    } else {
        container.classList.remove('loading');
    }
}

function setupPeriodSelector() {
    // Use the select dropdown that exists in index.html
    const periodSelect = document.getElementById('analytics-period');
    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            const value = e.target.value;
            if (value === 'week') {
                AnalyticsState.currentPeriod = 'week';
            } else if (value === 'month' || value === 'semester' || value === 'all') {
                AnalyticsState.currentPeriod = 'month';
            }
            refreshAnalytics();
        });
    }
    
    // Also support button-style selectors if they exist
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            AnalyticsState.currentPeriod = btn.dataset.period;
            refreshAnalytics();
        });
    });
}

async function refreshAnalytics() {
    const data = AnalyticsState.currentPeriod === 'week' 
        ? AnalyticsState.weeklyData 
        : AnalyticsState.monthlyData;
    
    updateAnalyticsSummary();
    renderWeeklyChart(data);
    renderCategoryBreakdown(data);
    renderBoredomBreakdown(data).catch(() => void 0);
    renderWeeklyPerformanceRadar().catch(() => void 0);
    generateInsights();
}

// ============================================================================
// DATA LOADING
// ============================================================================
async function getWeeklyData() {
    const data = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const stats = await ProductivityData.DataStore.getDailyStats(dateStr);
        data.push({
            date: dateStr,
            day: date.toLocaleDateString('en-US', { weekday: 'short' }),
            fullDay: date.toLocaleDateString('en-US', { weekday: 'long' }),
            focusMinutes: stats.focusMinutes || 0,
            focusSessions: stats.focusSessions || 0,
            tasksCompleted: stats.tasksCompleted || 0,
            tasksCreated: stats.tasksCreated || 0,
            productivityScore: stats.productivityScore || 0,
            subjectTime: stats.subjectTime || {},
            distractionBlocks: stats.distractionBlocks || 0,
            streakDay: stats.streakDay || false
        });
    }
    
    return data;
}

async function getMonthlyData() {
    const data = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        try {
            const stats = await ProductivityData.DataStore.getDailyStats(dateStr);
            data.push({
                date: dateStr,
                day: date.getDate(),
                month: date.toLocaleDateString('en-US', { month: 'short' }),
                focusMinutes: stats.focusMinutes || 0,
                focusSessions: stats.focusSessions || 0,
                tasksCompleted: stats.tasksCompleted || 0,
                productivityScore: stats.productivityScore || 0,
                subjectTime: stats.subjectTime || {}
            });
        } catch (e) {
            // No data for this day
            data.push({
                date: dateStr,
                day: date.getDate(),
                month: date.toLocaleDateString('en-US', { month: 'short' }),
                focusMinutes: 0,
                focusSessions: 0,
                tasksCompleted: 0,
                productivityScore: 0,
                subjectTime: {}
            });
        }
    }
    
    return data;
}

async function getHeatmapData() {
    const heatmap = {};
    const today = new Date();
    
    // Get last 90 days of hourly data
    for (let i = 89; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayOfWeek = date.getDay();
        
        const stats = await ProductivityData.DataStore.getDailyStats(dateStr);
        
        // Aggregate by day of week and simulate hourly distribution
        if (stats.hourlyFocus) {
            Object.entries(stats.hourlyFocus).forEach(([hour, minutes]) => {
                const key = `${dayOfWeek}_${hour}`;
                heatmap[key] = (heatmap[key] || 0) + minutes;
            });
        }
    }
    
    return heatmap;
}

async function getPreviousPeriodData() {
    const data = [];
    const today = new Date();
    const offset = AnalyticsState.currentPeriod === 'week' ? 7 : 30;
    
    for (let i = offset * 2 - 1; i >= offset; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const stats = await ProductivityData.DataStore.getDailyStats(dateStr);
        data.push({
            date: dateStr,
            focusMinutes: stats.focusMinutes || 0,
            tasksCompleted: stats.tasksCompleted || 0,
            productivityScore: stats.productivityScore || 0
        });
    }
    
    return data;
}

// ============================================================================
// ANALYTICS SUMMARY
// ============================================================================
function updateAnalyticsSummary() {
    const data = AnalyticsState.currentPeriod === 'week' 
        ? AnalyticsState.weeklyData 
        : AnalyticsState.monthlyData;
    
    // Calculate totals
    const totalFocus = data.reduce((sum, d) => sum + d.focusMinutes, 0);
    const totalSessions = data.reduce((sum, d) => sum + d.focusSessions, 0);
    const totalTasks = data.reduce((sum, d) => sum + d.tasksCompleted, 0);
    const avgScore = Math.round(data.reduce((sum, d) => sum + d.productivityScore, 0) / (data.length || 1));
    const activeDays = data.filter(d => d.focusMinutes > 0).length;
    
    // Calculate hours from minutes
    const totalHours = (totalFocus / 60).toFixed(1);
    
    // Update the existing HTML elements (matching IDs from index.html)
    const studyHoursEl = document.getElementById('total-study-hours');
    if (studyHoursEl) {
        studyHoursEl.textContent = `${totalHours}h`;
    }
    
    const tasksCompletedEl = document.getElementById('total-tasks-completed');
    if (tasksCompletedEl) {
        tasksCompletedEl.textContent = totalTasks;
    }
    
    const avgProductivityEl = document.getElementById('avg-productivity');
    if (avgProductivityEl) {
        avgProductivityEl.textContent = `${avgScore}%`;
    }
    
    // Calculate goals achieved (count tasks completed as goals for now, or use actual goals data)
    const goalsAchievedEl = document.getElementById('goals-achieved');
    if (goalsAchievedEl) {
        // Use total tasks as a proxy for goals, or get actual goals data
        const goalsCount = activeDays; // Active days as achievement metric
        goalsAchievedEl.textContent = goalsCount;
    }
}

// ============================================================================
// WEEKLY FOCUS CHART
// ============================================================================
function renderWeeklyChart(data) {
    const container = document.getElementById('study-time-chart');
    if (!container) return;
    
    // Ensure data is an array
    if (!Array.isArray(data)) {
        console.warn('renderWeeklyChart: data is not an array', data);
        data = [];
    }
    
    if (data.length === 0) {
        container.innerHTML = `
            <div class="chart-header">
                <h4>Focus Time</h4>
            </div>
            <div class="empty-state small">
                <i class="fas fa-chart-bar"></i>
                <p>No focus data yet</p>
            </div>
        `;
        return;
    }
    
    const maxMinutes = Math.max(...data.map(d => d.focusMinutes), 60);
    const targetMinutes = 120; // 2 hour daily target
    
    container.innerHTML = `
        <div class="chart-header">
            <h4>Focus Time</h4>
            <div class="chart-legend">
                <span class="legend-item"><span class="dot focus"></span> Focus</span>
                <span class="legend-item"><span class="dot target"></span> Target (2h)</span>
            </div>
        </div>
        <div class="bar-chart-container">
            <div class="chart-y-axis">
                ${[maxMinutes, Math.round(maxMinutes * 0.75), Math.round(maxMinutes * 0.5), Math.round(maxMinutes * 0.25), 0]
                    .map(v => `<span>${Math.round(v / 60)}h</span>`).join('')}
            </div>
            <div class="chart-bars">
                ${data.map((d, i) => {
                    const height = (d.focusMinutes / maxMinutes) * 100;
                    const targetHeight = (Math.min(targetMinutes, maxMinutes) / maxMinutes) * 100;
                    const isToday = i === data.length - 1;
                    const hitTarget = d.focusMinutes >= targetMinutes;
                    const showValue = d.focusMinutes > 0 && height >= 14;
                    
                    return `
                        <div class="chart-bar-wrapper ${isToday ? 'today' : ''}" data-tooltip="${d.fullDay || d.day}: ${formatMinutesLong(d.focusMinutes)}">
                            <div class="target-line" style="bottom: ${targetHeight}%"></div>
                            <div class="chart-bar ${hitTarget ? 'hit-target' : ''}" style="height: ${Math.max(height, 2)}%">
                                ${showValue ? `<span class="bar-value">${d.focusMinutes >= 60 ? Math.round(d.focusMinutes / 60) + 'h' : d.focusMinutes + 'm'}</span>` : ''}
                            </div>
                            <span class="bar-label">${d.day}</span>
                            ${d.focusSessions > 0 ? `<span class="session-count">${d.focusSessions} sessions</span>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// ============================================================================
// CATEGORY BREAKDOWN
// ============================================================================
function renderCategoryBreakdown(data) {
    const container = document.getElementById('subject-breakdown');
    if (!container) return;
    
    // Aggregate subject time
    const subjectTotals = {};
    data.forEach(d => {
        if (d.subjectTime) {
            Object.entries(d.subjectTime).forEach(([subject, minutes]) => {
                subjectTotals[subject] = (subjectTotals[subject] || 0) + minutes;
            });
        }
    });
    
    if (Object.keys(subjectTotals).length === 0) {
        container.innerHTML = `
            <div class="chart-header">
                <h4>Time by Subject</h4>
            </div>
            <div class="empty-state small">
                <i class="fas fa-chart-pie"></i>
                <p>No category data yet</p>
                <p class="sub">Tag your focus sessions with subjects to see breakdown</p>
            </div>
        `;
        return;
    }
    
    const total = Object.values(subjectTotals).reduce((a, b) => a + b, 0);
    const sortedSubjects = Object.entries(subjectTotals).sort((a, b) => b[1] - a[1]);
    const colors = Object.values(CHART_COLORS).slice(0, sortedSubjects.length);
    
    // Create pie chart segments
    let cumulativePercent = 0;
    const segments = sortedSubjects.map(([subject, minutes], i) => {
        const percent = (minutes / total) * 100;
        const startAngle = cumulativePercent * 3.6;
        cumulativePercent += percent;
        return { subject, minutes, percent, color: colors[i % colors.length], startAngle };
    });
    
    container.innerHTML = `
        <div class="chart-header">
            <h4>Time by Subject</h4>
            <span class="total-time">${formatMinutesLong(total)} total</span>
        </div>
        <div class="category-breakdown-grid">
            <div class="pie-chart-container">
                <svg viewBox="0 0 100 100" class="pie-chart">
                    ${segments.map((seg, i) => {
                        const angle = seg.percent * 3.6;
                        return createPieSegment(50, 50, 40, seg.startAngle, angle, seg.color);
                    }).join('')}
                    <circle cx="50" cy="50" r="25" fill="var(--surface-color)"/>
                    <text x="50" y="48" text-anchor="middle" class="pie-center-text">${sortedSubjects.length}</text>
                    <text x="50" y="58" text-anchor="middle" class="pie-center-label">subjects</text>
                </svg>
            </div>
            <div class="category-list">
                ${segments.map(seg => `
                    <div class="category-item">
                        <div class="category-color" style="background: ${seg.color}"></div>
                        <div class="category-info">
                            <span class="category-name">${seg.subject}</span>
                            <span class="category-time">${formatMinutesLong(seg.minutes)}</span>
                        </div>
                        <div class="category-bar-bg">
                            <div class="category-bar" style="width: ${seg.percent}%; background: ${seg.color}"></div>
                        </div>
                        <span class="category-percent">${Math.round(seg.percent)}%</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ============================================================================
// BOREDOM LEVEL BREAKDOWN
// ============================================================================
async function renderBoredomBreakdown(data) {
    const container = document.getElementById('boredom-breakdown-analytics');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="empty-state small">
                <i class="fas fa-face-meh"></i>
                <p>No data yet</p>
            </div>
        `;
        return;
    }

    const startDate = data[0].date;
    const endDate = data[data.length - 1].date;

    let sessions = [];
    try {
        sessions = await ProductivityData.DataStore.getSessionsByDateRange(startDate, endDate);
    } catch (e) {
        sessions = [];
    }

    const levels = [
        { value: 1, label: 'Locked in', color: '#10b981' },
        { value: 2, label: 'Okay', color: '#22c55e' },
        { value: 3, label: 'Bored', color: '#f59e0b' },
        { value: 4, label: 'Very bored', color: '#f97316' },
        { value: 5, label: 'Restless', color: '#ef4444' }
    ];

    const totals = new Map(levels.map(l => [l.value, 0]));
    let unrated = 0;

    (sessions || []).forEach(s => {
        if (!s) return;
        const minutes = Number(s.actualDurationMinutes || 0);
        if (!Number.isFinite(minutes) || minutes <= 0) return;

        const lvl = Number(s.boredomLevel);
        if (Number.isFinite(lvl) && lvl >= 1 && lvl <= 5) {
            const rounded = Math.max(1, Math.min(5, Math.round(lvl)));
            totals.set(rounded, (totals.get(rounded) || 0) + minutes);
        } else {
            unrated += minutes;
        }
    });

    const total = [...totals.values()].reduce((a, b) => a + b, 0) + unrated;
    const safeTotal = total > 0 ? total : 1;
    if (total <= 0) {
        container.innerHTML = `
            <div class="empty-state small">
                <i class="fas fa-face-meh"></i>
                <p>No boredom data yet</p>
                <p class="sub">Tag sessions at start to see the breakdown.</p>
            </div>
        `;
        return;
    }

    const rows = levels
        .map(l => {
            const minutes = totals.get(l.value) || 0;
            const percent = (minutes / total) * 100;
            return { ...l, minutes, percent };
        })
        .sort((a, b) => b.minutes - a.minutes);

    container.innerHTML = `
        <div class="chart-header">
            <h4>Time by Boredom Level</h4>
            <span class="total-time">${formatMinutesLong(total)} total</span>
        </div>
        <div class="category-list">
            ${rows.map(r => `
                <div class="category-item">
                    <div class="category-color" style="background: ${r.color}"></div>
                    <div class="category-info">
                        <span class="category-name">${r.value} - ${r.label}</span>
                        <span class="category-time">${formatMinutesLong(r.minutes)}</span>
                    </div>
                    <div class="category-bar-bg">
                        <div class="category-bar" style="width: ${r.minutes > 0 ? `max(2px, ${r.percent}%)` : '0'}; background: ${r.color}"></div>
                    </div>
                    <span class="category-percent">${Math.round(r.percent)}%</span>
                </div>
            `).join('')}
            ${unrated > 0 ? (() => {
                const unratedPercent = Math.max(0, Math.min(100, (unrated / safeTotal) * 100));
                const unratedPercentLabel = Math.round(unratedPercent);
                return `
                <div class="category-item">
                    <div class="category-color" style="background: #64748b"></div>
                    <div class="category-info">
                        <span class="category-name">Unrated</span>
                        <span class="category-time">${formatMinutesLong(unrated)}</span>
                    </div>
                    <div class="category-bar-bg">
                        <div class="category-bar" style="width: ${unrated > 0 ? `max(2px, ${unratedPercent}%)` : '0'}; background: #64748b"></div>
                    </div>
                    <span class="category-percent">${unratedPercentLabel}%</span>
                </div>
                `;
            })() : ''}
        </div>
    `;
}

// ============================================================================
// WEEKLY PERFORMANCE RADAR (FIFA-STYLE)
// ============================================================================

const RADAR_AXES = [
    { key: 'discipline', label: 'Discipline' },
    { key: 'time', label: 'Time' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'consistency', label: 'Consistency' },
    { key: 'focusQuality', label: 'Focus Quality' },
    { key: 'distractionControl', label: 'Distraction Control' }
];

function clamp(min, value, max) {
    return Math.max(min, Math.min(max, value));
}

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function ymdLocal(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function dateFromYmdLocal(ymd) {
    return new Date(`${ymd}T00:00:00`);
}

function getWeekStartLocal(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getWeekRangeYmd(date = new Date()) {
    const start = getWeekStartLocal(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { startYmd: ymdLocal(start), endYmd: ymdLocal(end), start, end };
}

function computeRadarFromDailyArray(days, settings) {
    const dailyGoalHours = safeNumber(settings?.dailyStudyTarget, 8);
    const dailyGoalMinutes = dailyGoalHours * 60;
    const weeklyGoalMinutes = safeNumber(settings?.weeklyStudyTarget, 40) * 60;
    const dailyTaskTarget = safeNumber(settings?.dailyTaskTarget, 5);
    const minProductiveMinutes = safeNumber(settings?.minProductiveMinutes, 30);
    const minTasksForStreak = safeNumber(settings?.minTasksForStreak, 1);

    let totalFocusMinutes = 0;
    let totalSessions = 0;
    let totalTasks = 0;
    let totalDistractions = 0;

    let productiveDays = 0;
    let activeDays = 0;
    let disciplineSum = 0;
    let productivityScoreSum = 0;

    for (const raw of (days || [])) {
        const focusMinutes = safeNumber(raw?.focusMinutes, 0);
        const tasksCompleted = safeNumber(raw?.tasksCompleted, 0);
        const focusSessions = safeNumber(raw?.focusSessions, 0);
        const distractionsBlocked = safeNumber(raw?.distractionsBlocked ?? raw?.distractionBlocks, 0);

        totalFocusMinutes += focusMinutes;
        totalTasks += tasksCompleted;
        totalSessions += focusSessions;
        totalDistractions += distractionsBlocked;

        const hasActivity = focusMinutes > 0 || tasksCompleted > 0 || focusSessions > 0;
        if (hasActivity) activeDays += 1;

        const isProductive =
            !!raw?.streakMaintained || !!raw?.streakDay ||
            focusMinutes >= minProductiveMinutes ||
            tasksCompleted >= minTasksForStreak;

        if (isProductive) productiveDays += 1;

        const dailyRatio = dailyGoalMinutes > 0 ? clamp(0, focusMinutes / dailyGoalMinutes, 1) : 0;
        disciplineSum += dailyRatio;

        // Recompute score using current settings so historical data stays comparable when goals change
        const score = new ProductivityData.DailyStats({
            focusMinutes,
            tasksCompleted,
            focusSessions,
            distractionsBlocked
        }).calculateProductivityScore(settings);
        productivityScoreSum += safeNumber(score, 0);
    }

    const daysCount = Math.max(1, (days || []).length || 7);
    const discipline = clamp(0, (disciplineSum / daysCount) * 100, 100);
    const time = weeklyGoalMinutes > 0 ? clamp(0, (totalFocusMinutes / weeklyGoalMinutes) * 100, 100) : 0;
    const tasks = (dailyTaskTarget > 0)
        ? clamp(0, (totalTasks / (dailyTaskTarget * 7)) * 100, 100)
        : 0;
    const consistency = clamp(0, (productiveDays / 7) * 100, 100);
    const focusQuality = (activeDays > 0)
        ? clamp(0, (productivityScoreSum / daysCount), 100)
        : 0;

    // Heuristic: 0 blocks => 100, 35+ blocks/week => 0
    const maxBlocks = 35;
    const distractionControl = clamp(0, (1 - (totalDistractions / maxBlocks)) * 100, 100);

    const details = {
        discipline: `${(totalFocusMinutes / 7 / 60).toFixed(1)}h/day avg vs ${dailyGoalHours}h/day goal`,
        time: `${(totalFocusMinutes / 60).toFixed(1)}h this week vs ${(weeklyGoalMinutes / 60).toFixed(0)}h target`,
        tasks: `${totalTasks} tasks vs ${Math.round(dailyTaskTarget * 7)} target`,
        consistency: `${productiveDays}/7 productive days`,
        focusQuality: `Avg score ${Math.round(focusQuality)}%`,
        distractionControl: `${totalDistractions} blocks this week`
    };

    return {
        values: {
            discipline,
            time,
            tasks,
            consistency,
            focusQuality,
            distractionControl
        },
        details
    };
}

async function getWeekDailyStatsArray(weekStartDate) {
    const { startYmd, endYmd } = getWeekRangeYmd(weekStartDate);
    const statsMap = await ProductivityData.DataStore.getStatsForDateRange(startYmd, endYmd);
    return Object.keys(statsMap)
        .sort()
        .map(k => statsMap[k]);
}

async function computeOverallWeeklyAverage(settings) {
    const allStatsRaw = await ProductivityData.DataStore.get(ProductivityData.STORAGE_KEYS.DAILY_STATS, {});
    const weekBuckets = new Map();

    for (const [dateStr, raw] of Object.entries(allStatsRaw || {})) {
        if (!dateStr) continue;
        const d = dateFromYmdLocal(dateStr);
        if (Number.isNaN(d.getTime())) continue;
        const wkStart = getWeekStartLocal(d);
        const wkKey = ymdLocal(wkStart);
        if (!weekBuckets.has(wkKey)) weekBuckets.set(wkKey, {});
        weekBuckets.get(wkKey)[dateStr] = raw;
    }

    const axisSums = Object.fromEntries(RADAR_AXES.map(a => [a.key, 0]));
    let weekCount = 0;

    for (const [wkKey, rawByDay] of weekBuckets.entries()) {
        const wkStart = dateFromYmdLocal(wkKey);
        const { startYmd, endYmd } = getWeekRangeYmd(wkStart);
        const days = [];
        let current = dateFromYmdLocal(startYmd);
        const end = dateFromYmdLocal(endYmd);
        while (current <= end) {
            const ymd = ymdLocal(current);
            const stored = rawByDay?.[ymd];
            days.push(stored ? new ProductivityData.DailyStats(stored) : new ProductivityData.DailyStats({ date: ymd }));
            current.setDate(current.getDate() + 1);
        }

        const radar = computeRadarFromDailyArray(days, settings);
        for (const axis of RADAR_AXES) {
            axisSums[axis.key] += safeNumber(radar.values[axis.key], 0);
        }
        weekCount += 1;
    }

    if (weekCount <= 0) {
        return { values: Object.fromEntries(RADAR_AXES.map(a => [a.key, 0])), details: {} };
    }

    const avgValues = {};
    for (const axis of RADAR_AXES) {
        avgValues[axis.key] = axisSums[axis.key] / weekCount;
    }

    return { values: avgValues, details: {} };
}

function setCanvasSizeForDpr(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    return { cssWidth: rect.width, cssHeight: rect.height, dpr };
}

function wrapAxisLabel(text) {
    const label = String(text ?? '').trim();
    if (!label) return [''];
    if (label.length <= 14 || !label.includes(' ')) return [label];

    const words = label.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return [label];
    if (words.length === 2) return [words[0], words[1]];

    // Try to split into two reasonably balanced lines.
    const target = Math.ceil(label.length / 2);
    let bestIdx = 1;
    let bestDiff = Infinity;
    let running = words[0].length;
    for (let i = 1; i < words.length; i++) {
        running += 1 + words[i].length;
        const diff = Math.abs(target - running);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
        }
    }

    const line1 = words.slice(0, bestIdx).join(' ');
    const line2 = words.slice(bestIdx).join(' ');
    return [line1, line2];
}

function drawMultilineText(ctx, lines, x, y, lineHeight = 12) {
    const textLines = Array.isArray(lines) ? lines : [String(lines ?? '')];
    const count = Math.min(2, textLines.length);
    const baseline = ctx.textBaseline;

    let startY = y;
    if (count > 1) {
        if (baseline === 'bottom') {
            startY = y - (count - 1) * lineHeight;
        } else if (baseline === 'middle') {
            startY = y - ((count - 1) * lineHeight) / 2;
        }
    }

    for (let i = 0; i < count; i++) {
        ctx.fillText(textLines[i], x, startY + i * lineHeight);
    }
}

function drawRadarChart(canvas, axes, datasets) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { cssWidth, cssHeight, dpr } = setCanvasSizeForDpr(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const n = axes.length;
    const cx = cssWidth / 2;
    const cy = cssHeight / 2;
    const radius = Math.max(10, Math.min(cssWidth, cssHeight) / 2 - 56);

    const gridColor = 'rgba(148, 163, 184, 0.25)';
    const axisColor = 'rgba(148, 163, 184, 0.22)';
    const labelColor = 'rgba(148, 163, 184, 0.9)';

    // Grid rings
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 5; ring++) {
        const r = (radius * ring) / 5;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = gridColor;
        ctx.stroke();
    }

    // Axes lines + labels
    for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.strokeStyle = axisColor;
        ctx.stroke();

        const labelRadius = radius + 18;
        const lx = cx + labelRadius * Math.cos(angle);
        const ly = cy + labelRadius * Math.sin(angle);
        ctx.fillStyle = labelColor;
        ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.textAlign = Math.cos(angle) > 0.25 ? 'left' : (Math.cos(angle) < -0.25 ? 'right' : 'center');
        ctx.textBaseline = Math.sin(angle) > 0.25 ? 'top' : (Math.sin(angle) < -0.25 ? 'bottom' : 'middle');
        drawMultilineText(ctx, wrapAxisLabel(axes[i]), lx, ly, 12);
    }

    // Datasets
    for (const ds of datasets) {
        const values = ds.values || [];
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
            const v = clamp(0, safeNumber(values[i], 0), 100) / 100;
            const x = cx + radius * v * Math.cos(angle);
            const y = cy + radius * v * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = ds.fill;
        ctx.strokeStyle = ds.stroke;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
    }
}

async function renderWeeklyPerformanceRadar() {
    const canvas = document.getElementById('performance-radar');
    if (!canvas) return;

    const goalInput = document.getElementById('radar-daily-goal');
    const compareLastWeek = document.getElementById('radar-compare-last-week');
    const compareOverall = document.getElementById('radar-compare-overall');
    const legend = document.getElementById('performance-radar-legend');
    const valuesBox = document.getElementById('performance-radar-values');

    const settings = await ProductivityData.DataStore.getSettings();

    if (goalInput && !goalInput.dataset.bound) {
        goalInput.dataset.bound = '1';
        const onGoalChange = async () => {
            const next = clamp(1, safeNumber(goalInput.value, settings.dailyStudyTarget || 8), 16);
            const updated = { ...settings, dailyStudyTarget: next };
            await ProductivityData.DataStore.saveSettings(updated);
            renderWeeklyPerformanceRadar().catch(() => void 0);
        };
        goalInput.addEventListener('change', onGoalChange);
        goalInput.addEventListener('blur', onGoalChange);
    }

    if (compareLastWeek && !compareLastWeek.dataset.bound) {
        compareLastWeek.dataset.bound = '1';
        compareLastWeek.addEventListener('change', () => {
            renderWeeklyPerformanceRadar().catch(() => void 0);
        });
    }

    if (compareOverall && !compareOverall.dataset.bound) {
        compareOverall.dataset.bound = '1';
        compareOverall.addEventListener('change', () => {
            renderWeeklyPerformanceRadar().catch(() => void 0);
        });
    }

    if (!window.__radarResizeBound) {
        window.__radarResizeBound = true;
        window.addEventListener('resize', () => {
            if (document.getElementById('performance-radar')) {
                renderWeeklyPerformanceRadar().catch(() => void 0);
            }
        });
    }

    const goalHours = safeNumber(settings?.dailyStudyTarget, 8);
    if (goalInput) {
        goalInput.value = String(goalHours);
    }

    const now = new Date();
    const currentDays = await getWeekDailyStatsArray(now);
    const currentRadar = computeRadarFromDailyArray(currentDays, settings);

    const datasets = [
        {
            label: 'This week',
            stroke: CHART_COLORS.primary,
            fill: 'rgba(99, 102, 241, 0.22)',
            values: RADAR_AXES.map(a => currentRadar.values[a.key])
        }
    ];

    if (compareLastWeek?.checked) {
        const lastWeek = new Date(now);
        lastWeek.setDate(lastWeek.getDate() - 7);
        const lastDays = await getWeekDailyStatsArray(lastWeek);
        const lastRadar = computeRadarFromDailyArray(lastDays, settings);
        datasets.push({
            label: 'Last week',
            stroke: CHART_COLORS.secondary,
            fill: 'rgba(16, 185, 129, 0.14)',
            values: RADAR_AXES.map(a => lastRadar.values[a.key])
        });
    }

    if (compareOverall?.checked) {
        const overall = await computeOverallWeeklyAverage(settings);
        datasets.push({
            label: 'Overall',
            stroke: CHART_COLORS.accent,
            fill: 'rgba(245, 158, 11, 0.10)',
            values: RADAR_AXES.map(a => overall.values[a.key])
        });
    }

    drawRadarChart(canvas, RADAR_AXES.map(a => a.label), datasets);

    if (legend) {
        legend.innerHTML = datasets.map(ds => `
            <div class="radar-legend-item">
                <span class="radar-legend-swatch" style="background:${ds.fill}; border-color:${ds.stroke}"></span>
                <span>${ds.label}</span>
            </div>
        `).join('');
    }

    if (valuesBox) {
        valuesBox.innerHTML = RADAR_AXES.map(axis => {
            const v = safeNumber(currentRadar.values[axis.key], 0);
            const title = currentRadar.details?.[axis.key] || '';
            return `
                <div class="radar-value-row" title="${escapeHtml(title)}">
                    <span class="radar-value-label">${axis.label}</span>
                    <span class="radar-value-number">${Math.round(v)}%</span>
                </div>
            `;
        }).join('');
    }
}

function createPieSegment(cx, cy, r, startAngle, angle, color) {
    if (angle >= 360) {
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
    }
    
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (startAngle + angle - 90) * Math.PI / 180;
    
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    
    const largeArc = angle > 180 ? 1 : 0;
    
    return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color}"/>`;
}

// ============================================================================
// ACTIVITY HEATMAP
// ============================================================================
function renderHeatmap(heatmapData) {
    const container = document.getElementById('productivity-heatmap');
    if (!container) return;
    
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Calculate max for normalization
    const values = Object.values(heatmapData);
    const maxValue = Math.max(...values, 1);
    
    container.innerHTML = `
        <div class="chart-header">
            <h4>Activity Heatmap</h4>
            <span class="heatmap-info">Last 90 days</span>
        </div>
        <div class="heatmap-container">
            <div class="heatmap-matrix">
                <div class="heatmap-corner"></div>
                ${days.map(day => `<div class="heatmap-day-header">${day}</div>`).join('')}
                ${hours.map(h => {
                    const label = h % 3 === 0 ? `${h.toString().padStart(2, '0')}:00` : '';
                    return `
                        <div class="heatmap-hour-label">${label}</div>
                        ${days.map((day, dayIndex) => {
                            const key = `${dayIndex}_${h}`;
                            const value = heatmapData[key] || 0;
                            const intensity = value / maxValue;
                            const level = Math.min(Math.floor(intensity * 5), 4);
                            return `
                                <div class="heatmap-cell level-${level}"
                                     data-tooltip="${day} ${h.toString().padStart(2, '0')}:00 - ${formatMinutesLong(value)}"
                                     style="--intensity: ${intensity}">
                                </div>
                            `;
                        }).join('')}
                    `;
                }).join('')}
            </div>
        </div>
        <div class="heatmap-legend">
            <span>Less</span>
            <div class="legend-cells">
                ${[0, 1, 2, 3, 4].map(level => `<div class="legend-cell level-${level}"></div>`).join('')}
            </div>
            <span>More</span>
        </div>
    `;
}

// ============================================================================
// PRODUCTIVITY TREND
// ============================================================================
function renderProductivityTrend() {
    const container = document.getElementById('productivity-trend');
    if (!container) return;
    
    const data = AnalyticsState.monthlyData;
    if (data.length === 0) {
        container.innerHTML = '<div class="empty-state small"><p>No trend data yet</p></div>';
        return;
    }
    
    // Calculate moving average
    const windowSize = 7;
    const movingAvg = data.map((d, i) => {
        const start = Math.max(0, i - windowSize + 1);
        const window = data.slice(start, i + 1);
        const avg = window.reduce((sum, w) => sum + w.productivityScore, 0) / window.length;
        return Math.round(avg);
    });
    
    const maxScore = 100;
    const points = movingAvg.map((score, i) => ({
        x: (i / (data.length - 1)) * 100,
        y: 100 - (score / maxScore) * 100
    }));
    
    // Create smooth line path
    const pathD = points.length > 1 
        ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
        : '';
    
    container.innerHTML = `
        <div class="chart-header">
            <h4>Productivity Trend</h4>
            <span class="trend-period">30-day moving average</span>
        </div>
        <div class="line-chart-container">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="line-chart">
                <!-- Grid lines -->
                ${[0, 25, 50, 75, 100].map(y => `
                    <line x1="0" y1="${y}" x2="100" y2="${y}" class="grid-line"/>
                `).join('')}
                
                <!-- Area fill -->
                <path d="${pathD} L ${points[points.length - 1]?.x || 0} 100 L ${points[0]?.x || 0} 100 Z" 
                      class="trend-area" fill="url(#trend-gradient)"/>
                
                <!-- Line -->
                <path d="${pathD}" class="trend-line" stroke="${CHART_COLORS.primary}" fill="none"/>
                
                <!-- Gradient definition -->
                <defs>
                    <linearGradient id="trend-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:${CHART_COLORS.primary};stop-opacity:0.3"/>
                        <stop offset="100%" style="stop-color:${CHART_COLORS.primary};stop-opacity:0"/>
                    </linearGradient>
                </defs>
            </svg>
            <div class="trend-labels">
                <span>30 days ago</span>
                <span>Today</span>
            </div>
        </div>
    `;
}

// ============================================================================
// GOAL PROGRESS ANALYTICS
// ============================================================================
async function renderGoalProgress() {
    const container = document.getElementById('goal-progress-analytics');
    if (!container) return;
    
    const goals = await ProductivityData.DataStore.getGoals();
    
    if (goals.length === 0) {
        container.innerHTML = `
            <div class="chart-header"><h4>Goal Progress</h4></div>
            <div class="empty-state small">
                <i class="fas fa-bullseye"></i>
                <p>No goals set yet</p>
            </div>
        `;
        return;
    }
    
    const stats = {
        total: goals.length,
        completed: goals.filter(g => g.status === 'completed').length,
        active: goals.filter(g => g.status === 'active').length,
        avgProgress: Math.round(goals.reduce((sum, g) => sum + g.calculateProgress(), 0) / goals.length)
    };
    
    // Goals by category
    const byCategory = goals.reduce((acc, g) => {
        acc[g.category] = (acc[g.category] || 0) + 1;
        return acc;
    }, {});
    
    container.innerHTML = `
        <div class="chart-header">
            <h4>Goal Progress</h4>
            <span class="goal-stats">${stats.completed}/${stats.total} completed</span>
        </div>
        <div class="goal-analytics-grid">
            <div class="goal-completion-ring">
                <svg viewBox="0 0 100 100">
                    <circle class="progress-bg" cx="50" cy="50" r="40" stroke-width="8" fill="none"/>
                    <circle class="progress-fill" cx="50" cy="50" r="40" stroke-width="8" fill="none"
                            stroke="${CHART_COLORS.secondary}"
                            stroke-dasharray="${2 * Math.PI * 40}"
                            stroke-dashoffset="${2 * Math.PI * 40 * (1 - stats.completed / stats.total)}"
                            transform="rotate(-90 50 50)"/>
                </svg>
                <div class="ring-center">
                    <span class="ring-value">${Math.round((stats.completed / stats.total) * 100)}%</span>
                    <span class="ring-label">Complete</span>
                </div>
            </div>
            <div class="goal-category-breakdown">
                ${Object.entries(byCategory).map(([cat, count]) => `
                    <div class="mini-stat">
                        <span class="mini-stat-value">${count}</span>
                        <span class="mini-stat-label">${capitalizeFirst(cat)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ============================================================================
// STREAK ANALYSIS
// ============================================================================
async function renderStreakAnalysis() {
    const container = document.getElementById('streak-analysis');
    if (!container) return;
    
    const streak = await ProductivityData.DataStore.getStreak();
    const monthlyData = AnalyticsState.monthlyData;
    
    // Calculate streak calendar
    const activeDays = monthlyData.filter(d => d.focusMinutes >= 15).length;
    const longestStreak = calculateLongestStreak(monthlyData);
    
    container.innerHTML = `
        <div class="chart-header">
            <h4>Streak & Consistency</h4>
        </div>
        <div class="streak-stats-grid">
            <div class="streak-stat current">
                <div class="streak-icon">🔥</div>
                <div class="streak-value">${streak?.currentStreak || 0}</div>
                <div class="streak-label">Current Streak</div>
            </div>
            <div class="streak-stat best">
                <div class="streak-icon">🏆</div>
                <div class="streak-value">${Math.max(streak?.longestStreak || 0, longestStreak)}</div>
                <div class="streak-label">Best Streak</div>
            </div>
            <div class="streak-stat active">
                <div class="streak-icon">📅</div>
                <div class="streak-value">${activeDays}</div>
                <div class="streak-label">Active Days (30d)</div>
            </div>
            <div class="streak-stat consistency">
                <div class="streak-icon">📊</div>
                <div class="streak-value">${Math.round((activeDays / 30) * 100)}%</div>
                <div class="streak-label">Consistency</div>
            </div>
        </div>
        <div class="mini-calendar">
            ${renderMiniCalendar(monthlyData)}
        </div>
    `;
}

function calculateLongestStreak(data) {
    let longest = 0;
    let current = 0;
    
    data.forEach(d => {
        if (d.focusMinutes >= 15) {
            current++;
            longest = Math.max(longest, current);
        } else {
            current = 0;
        }
    });
    
    return longest;
}

function renderMiniCalendar(data) {
    return `
        <div class="mini-calendar-grid">
            ${data.map(d => {
                const level = d.focusMinutes >= 120 ? 4 :
                             d.focusMinutes >= 60 ? 3 :
                             d.focusMinutes >= 30 ? 2 :
                             d.focusMinutes > 0 ? 1 : 0;
                return `<div class="calendar-day level-${level}" title="${d.date}: ${formatMinutesLong(d.focusMinutes)}"></div>`;
            }).join('')}
        </div>
    `;
}

// ============================================================================
// AI-POWERED INSIGHTS
// ============================================================================
function generateInsights() {
    const container = document.getElementById('insights-list');
    if (!container) return;
    
    const weeklyData = AnalyticsState.weeklyData;
    const insights = [];

    const lastYmd = weeklyData?.[weeklyData.length - 1]?.date || ymdLocal(new Date());
    const formatInsightDate = (ymd) => {
        try {
            return dateFromYmdLocal(ymd || lastYmd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } catch {
            return String(ymd || lastYmd);
        }
    };
    
    // Trend analysis
    const firstHalf = weeklyData.slice(0, 4).reduce((s, d) => s + d.focusMinutes, 0);
    const secondHalf = weeklyData.slice(4).reduce((s, d) => s + d.focusMinutes, 0);
    const totalFocus = weeklyData.reduce((s, d) => s + d.focusMinutes, 0);
    const totalTasks = weeklyData.reduce((s, d) => s + d.tasksCompleted, 0);
    
    if (secondHalf > firstHalf * 1.3) {
        insights.push({
            icon: 'fa-arrow-trend-up',
            title: 'Momentum Building! 📈',
            text: `Your focus time increased by ${Math.round(((secondHalf - firstHalf) / firstHalf) * 100)}% compared to the start of the week.`,
            type: 'positive',
            dateYmd: lastYmd
        });
    } else if (secondHalf < firstHalf * 0.7 && firstHalf > 0) {
        insights.push({
            icon: 'fa-arrow-trend-down',
            title: 'Focus Dropping',
            text: "Your focus time decreased this week. Consider scheduling dedicated deep work blocks.",
            type: 'warning',
            dateYmd: lastYmd
        });
    }
    
    // Best day analysis
    const bestDay = weeklyData.reduce((best, d) => 
        d.focusMinutes > (best?.focusMinutes || 0) ? d : best, null);
    
    if (bestDay && bestDay.focusMinutes > 120) {
        insights.push({
            icon: 'fa-trophy',
            title: 'Peak Performance Day',
            text: `${bestDay.fullDay || bestDay.day} was your most productive day with ${formatMinutesLong(bestDay.focusMinutes)} of deep focus!`,
            type: 'positive',
            dateYmd: bestDay.date || lastYmd
        });
    }
    
    // Task efficiency
    if (totalFocus > 0 && totalTasks > 0) {
        const minutesPerTask = Math.round(totalFocus / totalTasks);
        if (minutesPerTask < 30) {
            insights.push({
                icon: 'fa-bolt',
                title: 'Task Crusher! ⚡',
                text: `You\'re completing tasks quickly (~${minutesPerTask} min each). Great efficiency!`,
                type: 'positive',
                dateYmd: lastYmd
            });
        } else if (minutesPerTask > 120) {
            insights.push({
                icon: 'fa-lightbulb',
                title: 'Break It Down',
                text: "Consider breaking large tasks into smaller subtasks for better progress tracking.",
                type: 'info',
                dateYmd: lastYmd
            });
        }
    }
    
    // Consistency check
    const activeDays = weeklyData.filter(d => d.focusMinutes > 0).length;
    if (activeDays >= 6) {
        insights.push({
            icon: 'fa-fire',
            title: 'Incredible Consistency! 🔥',
            text: `You focused ${activeDays} out of 7 days this week. Keep the streak alive!`,
            type: 'positive',
            dateYmd: lastYmd
        });
    } else if (activeDays <= 2) {
        insights.push({
            icon: 'fa-calendar-check',
            title: 'Build the Habit',
            text: "Try to focus at least a little each day. Even 15 minutes counts toward your streak!",
            type: 'info',
            dateYmd: lastYmd
        });
    }
    
    // Time of day suggestion
    const morningFocus = weeklyData.reduce((s, d) => s + (d.subjectTime?.morning || 0), 0);
    const eveningFocus = weeklyData.reduce((s, d) => s + (d.subjectTime?.evening || 0), 0);
    
    // Default insight if none
    if (insights.length === 0) {
        insights.push({
            icon: 'fa-rocket',
            title: 'Getting Started',
            text: "Complete more focus sessions to unlock personalized productivity insights!",
            type: 'info',
            dateYmd: lastYmd
        });
    }
    
    container.innerHTML = insights.map(insight => `
        <div class="insight-item ${insight.type}">
            <div class="insight-icon">
                <i class="fas ${insight.icon}"></i>
            </div>
            <div class="insight-content">
                <div class="insight-header">
                    <h5>${insight.title}</h5>
                    <span class="insight-date">${formatInsightDate(insight.dateYmd)}</span>
                </div>
                <p>${insight.text}</p>
            </div>
        </div>
    `).join('');
}

// ============================================================================
// DATA EXPORT
// ============================================================================
async function exportData(format) {
    // Ensure format is a string
    format = typeof format === 'string' ? format : 'json';
    
    try {
        const allData = await chrome.storage.local.get(null);
        
        // Filter relevant data
        const exportData = {
            exportDate: new Date().toISOString(),
            version: '1.0',
            stats: {},
            tasks: allData.tasks || [],
            goals: allData.goals || [],
            settings: allData.settings || {}
        };
        
        // Collect daily stats
        Object.entries(allData)
            .filter(([key]) => key.startsWith('stats_'))
            .forEach(([key, stats]) => {
                exportData.stats[key.replace('stats_', '')] = stats;
            });
        
        if (format === 'json') {
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            downloadBlob(blob, `productivity-export-${new Date().toISOString().split('T')[0]}.json`);
        } else if (format === 'csv') {
            const csv = convertToCSV(exportData.stats);
            const blob = new Blob([csv], { type: 'text/csv' });
            downloadBlob(blob, `productivity-export-${new Date().toISOString().split('T')[0]}.csv`);
        }
        
        showToast('success', 'Export Complete', `Your data has been exported as ${format.toUpperCase()}.`);
    } catch (error) {
        console.error('Export error:', error);
        showToast('error', 'Export Failed', error.message);
    }
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function convertToCSV(statsData) {
    const headers = ['Date', 'Focus Minutes', 'Sessions', 'Tasks Completed', 'Score'];
    const lines = [headers.join(',')];
    
    Object.entries(statsData)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([date, stats]) => {
            lines.push([
                date,
                stats.focusMinutes || 0,
                stats.focusSessions || 0,
                stats.tasksCompleted || 0,
                stats.productivityScore || 0
            ].join(','));
        });
    
    return lines.join('\n');
}

async function generatePDFReport() {
    try {
        showToast('info', 'Generating Report', 'Creating your productivity report...');
        
        const period = document.getElementById('analytics-period')?.value || 'week';
        const allData = await ProductivityData.DataStore.exportAllData();
        const data = JSON.parse(allData);
        
        // Create HTML report
        const reportContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Productivity Report</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; }
        h1 { color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
        h2 { color: #444; margin-top: 30px; }
        .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
        .stat-box { background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; }
        .stat-value { font-size: 2em; font-weight: bold; color: #6366f1; }
        .stat-label { color: #666; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f1f1f1; }
        .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; }
    </style>
</head>
<body>
    <h1>📊 Productivity Report</h1>
    <p>Generated: ${new Date().toLocaleDateString()} | Period: ${period}</p>
    
    <h2>📈 Overview Statistics</h2>
    <div class="stat-grid">
        <div class="stat-box">
            <div class="stat-value">${document.getElementById('total-study-hours')?.textContent || '0'}</div>
            <div class="stat-label">Study Hours</div>
        </div>
        <div class="stat-box">
            <div class="stat-value">${document.getElementById('total-tasks-completed')?.textContent || '0'}</div>
            <div class="stat-label">Tasks Completed</div>
        </div>
        <div class="stat-box">
            <div class="stat-value">${document.getElementById('avg-productivity')?.textContent || '0%'}</div>
            <div class="stat-label">Avg Productivity</div>
        </div>
    </div>
    
    <h2>✅ Active Tasks (${data.tasks?.filter(t => t.status !== 'completed').length || 0})</h2>
    <table>
        <tr><th>Task</th><th>Priority</th><th>Due Date</th><th>Status</th></tr>
        ${(data.tasks || []).filter(t => t.status !== 'completed').slice(0, 10).map(t => `
            <tr>
                <td>${t.title}</td>
                <td>${t.priority}</td>
                <td>${t.dueDate || 'No date'}</td>
                <td>${t.status}</td>
            </tr>
        `).join('')}
    </table>
    
    <h2>🎯 Goals Progress (${data.goals?.length || 0})</h2>
    <table>
        <tr><th>Goal</th><th>Progress</th><th>Target Date</th></tr>
        ${(data.goals || []).slice(0, 10).map(g => `
            <tr>
                <td>${g.title}</td>
                <td>${g.milestones?.filter(m => m.isCompleted).length || 0}/${g.milestones?.length || 0} milestones</td>
                <td>${g.targetDate || 'No date'}</td>
            </tr>
        `).join('')}
    </table>
    
    <div class="footer">
        Generated by Student Productivity Hub • ${new Date().toISOString()}
    </div>
</body>
</html>`;
        
        // Create download
        const blob = new Blob([reportContent], { type: 'text/html' });
        downloadBlob(blob, `productivity-report-${new Date().toISOString().split('T')[0]}.html`);
        
        showToast('success', 'Report Generated', 'Your report has been downloaded!');
    } catch (error) {
        console.error('Report generation error:', error);
        showToast('error', 'Report Failed', 'Could not generate report.');
    }
}

async function importData(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.version) {
            throw new Error('Invalid export file format');
        }
        
        // Import stats
        if (data.stats) {
            for (const [date, stats] of Object.entries(data.stats)) {
                await chrome.storage.local.set({ [`stats_${date}`]: stats });
            }
        }
        
        // Import tasks and goals
        if (data.tasks) await chrome.storage.local.set({ tasks: data.tasks });
        if (data.goals) await chrome.storage.local.set({ goals: data.goals });
        
        showToast('success', 'Import Complete', 'Your data has been imported successfully.');
        loadAnalyticsPage();
    } catch (error) {
        console.error('Import error:', error);
        showToast('error', 'Import Failed', error.message);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function formatMinutesLong(minutes) {
    if (!minutes || minutes === 0) return '0 min';
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours === 0) return `${mins} min`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
}

// capitalizeFirst is now provided by utils.js

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================
window.loadAnalyticsPage = loadAnalyticsPage;
window.loadAnalytics = loadAnalyticsPage; // Alias for app.js compatibility
window.exportData = exportData;
window.importData = importData;
window.refreshAnalytics = refreshAnalytics;

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Export buttons
    document.getElementById('export-json-btn')?.addEventListener('click', () => exportData('json'));
    document.getElementById('export-csv-btn')?.addEventListener('click', () => exportData('csv'));
    document.getElementById('export-report-btn')?.addEventListener('click', () => generatePDFReport());
    
    // Import button handled by app.js to avoid double trigger
});

// Analytics module loaded
