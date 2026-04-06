/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB — SCREEN TIME TRACKER
 * ============================================================================
 * Tracks time spent on every website.
 * Lets users set daily limits; sites are auto-blocked once the limit is hit.
 * Resets at midnight; keeps 30 days of history.
 */

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let screentimeState = {
    todayUsage: null,   // { date, sites: {domain: minutes}, blockedUntilNextDay: [] }
    limits: [],         // [{ id, domain, dailyLimitMinutes, isEnabled }]
    history: [],        // [{ date, sites: {domain: minutes} }, …] last 30 days
    view: 'today',      // 'today' | 'history'
    refreshInterval: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Load / Save helpers
// ─────────────────────────────────────────────────────────────────────────────
async function screentimeLoad() {
    const keys = [
        STORAGE_KEYS.WEBSITE_DAILY_USAGE,
        STORAGE_KEYS.WEBSITE_TIME_LIMITS,
        STORAGE_KEYS.WEBSITE_USAGE_HISTORY,
    ];
    const result = await DataStore.getMultiple(keys);
    const today = getTodayYMD();

    const rawUsage = result[STORAGE_KEYS.WEBSITE_DAILY_USAGE];
    if (rawUsage && rawUsage.date === today) {
        screentimeState.todayUsage = rawUsage;
    } else {
        screentimeState.todayUsage = { date: today, sites: {}, blockedUntilNextDay: [] };
    }

    screentimeState.limits = result[STORAGE_KEYS.WEBSITE_TIME_LIMITS] || [];
    screentimeState.history = result[STORAGE_KEYS.WEBSITE_USAGE_HISTORY] || [];
}

async function screentimeSaveLimits() {
    await DataStore.set(STORAGE_KEYS.WEBSITE_TIME_LIMITS, screentimeState.limits);
}

function getTodayYMD() {
    return new Date().toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain helpers
// ─────────────────────────────────────────────────────────────────────────────
function stNormalizeDomain(input) {
    if (!input) return '';
    try {
        if (input.startsWith('http://') || input.startsWith('https://')) {
            return new URL(input).hostname.replace(/^www\./, '').toLowerCase();
        }
    } catch (_) { /* fall through */ }
    return input.replace(/^(https?:\/\/)?(www\.)?/i, '').split('/')[0].split(':')[0].toLowerCase();
}

function getLimitForDomain(domain) {
    domain = stNormalizeDomain(domain);
    return screentimeState.limits.find(l =>
        l.isEnabled !== false && (l.domain === domain || domain.endsWith('.' + l.domain))
    ) || null;
}

function isBlockedToday(domain) {
    return (screentimeState.todayUsage?.blockedUntilNextDay || []).includes(stNormalizeDomain(domain));
}

function getMinutesSpent(domain) {
    return screentimeState.todayUsage?.sites?.[stNormalizeDomain(domain)] || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────
function fmtMinutes(min) {
    min = Math.round(min);
    if (min < 1) return '< 1m';
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtDate(ymd) {
    const d = new Date(ymd + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Limit CRUD
// ─────────────────────────────────────────────────────────────────────────────
async function screentimeAddOrUpdateLimit(domain, dailyLimitMinutes) {
    domain = stNormalizeDomain(domain);
    if (!domain) return;
    const existing = screentimeState.limits.find(l => l.domain === domain);
    if (existing) {
        existing.dailyLimitMinutes = dailyLimitMinutes;
        existing.isEnabled = true;
    } else {
        screentimeState.limits.push({
            id: `limit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            domain,
            dailyLimitMinutes,
            isEnabled: true,
        });
    }
    await screentimeSaveLimits();
    // If limit is already exceeded, block immediately
    const spent = getMinutesSpent(domain);
    if (spent >= dailyLimitMinutes) {
        const usage = screentimeState.todayUsage;
        if (usage && !isBlockedToday(domain)) {
            usage.blockedUntilNextDay = usage.blockedUntilNextDay || [];
            usage.blockedUntilNextDay.push(domain);
            await DataStore.set(STORAGE_KEYS.WEBSITE_DAILY_USAGE, usage);
        }
    }
}

async function screentimeRemoveLimit(id) {
    screentimeState.limits = screentimeState.limits.filter(l => l.id !== id);
    await screentimeSaveLimits();
}

async function screentimeToggleLimit(id, enabled) {
    const l = screentimeState.limits.find(l => l.id === id);
    if (l) { l.isEnabled = enabled; await screentimeSaveLimits(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Render helpers
// ─────────────────────────────────────────────────────────────────────────────
function makeBar(pct, color = '#6366f1') {
    const clamped = Math.min(100, Math.max(0, pct));
    return `<div class="st-bar-track"><div class="st-bar-fill" style="width:${clamped}%;background:${color}"></div></div>`;
}

function domainFavicon(domain) {
    return `<img class="st-favicon" src="https://www.google.com/s2/favicons?sz=16&domain=${encodeURIComponent(domain)}" onerror="this.style.display='none'" alt="">`;
}

function barColor(pct, blocked) {
    if (blocked) return '#ef4444';
    if (pct >= 90) return '#f97316';
    if (pct >= 70) return '#eab308';
    return '#6366f1';
}

// ─────────────────────────────────────────────────────────────────────────────
// Today's usage section
// ─────────────────────────────────────────────────────────────────────────────
function renderTodaySection() {
    const sites = screentimeState.todayUsage?.sites || {};
    const entries = Object.entries(sites)
        .map(([domain, min]) => ({ domain, min }))
        .filter(e => e.min >= 0.1)
        .sort((a, b) => b.min - a.min);

    const totalMin = entries.reduce((s, e) => s + e.min, 0);

    if (entries.length === 0) {
        return `
            <div class="st-empty">
                <i class="fas fa-clock" style="font-size:2rem;opacity:0.3;margin-bottom:8px"></i>
                <p>No browsing tracked today yet.</p>
                <p class="st-hint">Time starts accumulating as you browse.</p>
            </div>`;
    }

    const rows = entries.slice(0, 50).map(({ domain, min }) => {
        const limit = getLimitForDomain(domain);
        const blocked = isBlockedToday(domain);
        const limitMin = limit ? limit.dailyLimitMinutes : null;
        const pct = limitMin ? (min / limitMin) * 100 : (min / totalMin) * 100;
        const color = barColor(pct, blocked);
        const limitLabel = limitMin
            ? `<span class="st-limit-badge ${blocked ? 'st-blocked' : ''}">${blocked ? '🚫 Blocked' : fmtMinutes(min) + ' / ' + fmtMinutes(limitMin)}</span>`
            : '';

        return `
            <div class="st-site-row">
                <div class="st-site-left">
                    ${domainFavicon(domain)}
                    <span class="st-site-name">${domain}</span>
                    ${limitLabel}
                </div>
                <span class="st-site-time">${fmtMinutes(min)}</span>
                <button class="st-icon-btn st-add-limit-btn" data-domain="${domain}" data-spent="${Math.round(min)}" title="Set time limit">
                    <i class="fas fa-stopwatch"></i>
                </button>
            </div>
            ${makeBar(pct, color)}`;
    }).join('');

    return `
        <div class="st-total-row">
            <span class="st-total-label">Total today</span>
            <span class="st-total-time">${fmtMinutes(totalMin)}</span>
        </div>
        <div class="st-site-list">${rows}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Time limits section
// ─────────────────────────────────────────────────────────────────────────────
function renderLimitsSection() {
    const limits = screentimeState.limits;

    const rows = limits.length === 0
        ? `<p class="st-hint" style="margin:12px 0">No limits set. Click "+ Add Limit" to restrict a site.</p>`
        : limits.map(limit => {
            const spent = getMinutesSpent(limit.domain);
            const blocked = isBlockedToday(limit.domain);
            const pct = Math.min(100, (spent / limit.dailyLimitMinutes) * 100);
            const color = barColor(pct, blocked);
            const statusLabel = blocked
                ? `<span class="st-limit-badge st-blocked">🚫 Blocked for today</span>`
                : `<span class="st-limit-badge">${fmtMinutes(spent)} / ${fmtMinutes(limit.dailyLimitMinutes)}</span>`;

            return `
                <div class="st-limit-row">
                    <div class="st-site-left">
                        ${domainFavicon(limit.domain)}
                        <span class="st-site-name">${limit.domain}</span>
                        ${statusLabel}
                    </div>
                    <div class="st-limit-actions">
                        <button class="st-icon-btn st-edit-limit-btn" data-id="${limit.id}" data-domain="${limit.domain}" data-minutes="${limit.dailyLimitMinutes}" title="Edit limit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="st-icon-btn st-remove-limit-btn" data-id="${limit.id}" title="Remove limit">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                ${makeBar(pct, color)}`;
        }).join('');

    return `
        <div class="st-section-header">
            <h3 class="st-section-title"><i class="fas fa-stopwatch"></i> Time Limits</h3>
            <button class="btn-secondary st-add-limit-open" id="st-add-limit-open-btn">
                <i class="fas fa-plus"></i> Add Limit
            </button>
        </div>
        <div class="st-limits-list">${rows}</div>

        <div class="st-add-limit-form" id="st-add-limit-form" style="display:none">
            <h4 class="st-form-title">Set a daily time limit</h4>
            <input class="st-input" id="st-limit-domain" type="text" placeholder="e.g. youtube.com" autocomplete="off">
            <div class="st-limit-presets">
                <button class="st-preset-btn" data-minutes="30">30 min</button>
                <button class="st-preset-btn" data-minutes="60">1 hour</button>
                <button class="st-preset-btn" data-minutes="90">1.5 h</button>
                <button class="st-preset-btn" data-minutes="120">2 hours</button>
                <button class="st-preset-btn" data-minutes="180">3 hours</button>
            </div>
            <div class="st-limit-custom-row">
                <input class="st-input st-limit-minutes-input" id="st-limit-minutes" type="number" min="1" max="1440" placeholder="Custom minutes">
                <span class="st-hint">minutes</span>
            </div>
            <div class="st-form-buttons">
                <button class="btn-primary" id="st-save-limit-btn">Save Limit</button>
                <button class="btn-secondary" id="st-cancel-limit-btn">Cancel</button>
            </div>
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// History section
// ─────────────────────────────────────────────────────────────────────────────
function renderHistorySection() {
    const history = screentimeState.history.slice(0, 14); // last 14 days

    if (history.length === 0) {
        return `<p class="st-hint" style="margin:12px 0">No history yet — data accumulates each day.</p>`;
    }

    // Collect all domains across all days
    const allDomains = new Set();
    for (const day of history) {
        Object.keys(day.sites || {}).forEach(d => allDomains.add(d));
    }

    // Top 5 domains by total time across history
    const domainTotals = {};
    for (const d of allDomains) {
        domainTotals[d] = history.reduce((s, day) => s + (day.sites?.[d] || 0), 0);
    }
    const topDomains = Object.entries(domainTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([d]) => d);

    const rows = history.map(day => {
        const total = Object.values(day.sites || {}).reduce((s, m) => s + m, 0);
        const topForDay = Object.entries(day.sites || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([d, m]) => `<span class="st-hist-site">${domainFavicon(d)}<span>${d} ${fmtMinutes(m)}</span></span>`)
            .join('');

        return `
            <div class="st-hist-row">
                <div class="st-hist-date">${fmtDate(day.date)}</div>
                <div class="st-hist-total">${fmtMinutes(total)}</div>
                <div class="st-hist-sites">${topForDay || '<span class="st-hint">No data</span>'}</div>
            </div>`;
    }).join('');

    return `
        <div class="st-hist-table">
            <div class="st-hist-header">
                <span>Date</span><span>Total</span><span>Top Sites</span>
            </div>
            ${rows}
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main render
// ─────────────────────────────────────────────────────────────────────────────
function renderScreentime() {
    const container = document.getElementById('screentime-content');
    if (!container) return;

    const viewToday = screentimeState.view === 'today';

    container.innerHTML = `
        <div class="st-tabs">
            <button class="st-tab ${viewToday ? 'active' : ''}" data-view="today">
                <i class="fas fa-calendar-day"></i> Today
            </button>
            <button class="st-tab ${!viewToday ? 'active' : ''}" data-view="history">
                <i class="fas fa-history"></i> History
            </button>
        </div>

        ${viewToday ? `
        <div class="st-panel">
            <h3 class="st-section-title"><i class="fas fa-chart-bar"></i> Today's Usage</h3>
            ${renderTodaySection()}
        </div>

        <div class="st-panel st-limits-panel">
            ${renderLimitsSection()}
        </div>
        ` : `
        <div class="st-panel">
            <h3 class="st-section-title"><i class="fas fa-history"></i> Usage History</h3>
            ${renderHistorySection()}
        </div>
        `}
    `;

    attachScreentimeListeners();
}

// ─────────────────────────────────────────────────────────────────────────────
// Event listeners
// ─────────────────────────────────────────────────────────────────────────────
function attachScreentimeListeners() {
    const container = document.getElementById('screentime-content');
    if (!container) return;

    // Tab switches
    container.querySelectorAll('.st-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            screentimeState.view = btn.dataset.view;
            renderScreentime();
        });
    });

    // Quick "add limit" button on site rows
    container.querySelectorAll('.st-add-limit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const domain = btn.dataset.domain;
            openAddLimitForm(domain);
        });
    });

    // Open add-limit form
    const openBtn = container.querySelector('#st-add-limit-open-btn');
    if (openBtn) {
        openBtn.addEventListener('click', () => openAddLimitForm());
    }

    // Edit limit
    container.querySelectorAll('.st-edit-limit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openAddLimitForm(btn.dataset.domain, parseInt(btn.dataset.minutes, 10));
        });
    });

    // Remove limit
    container.querySelectorAll('.st-remove-limit-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            await screentimeRemoveLimit(btn.dataset.id);
            await screentimeLoad();
            renderScreentime();
        });
    });

    // Preset buttons
    container.querySelectorAll('.st-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('st-limit-minutes');
            if (input) { input.value = btn.dataset.minutes; }
            container.querySelectorAll('.st-preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Save limit
    const saveBtn = container.querySelector('#st-save-limit-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const domainInput = document.getElementById('st-limit-domain');
            const minutesInput = document.getElementById('st-limit-minutes');
            const domain = stNormalizeDomain(domainInput?.value?.trim() || '');
            const minutes = parseInt(minutesInput?.value || '0', 10);
            if (!domain) { showToast?.('error', 'Invalid domain', 'Enter a valid domain name.'); return; }
            if (!minutes || minutes < 1) { showToast?.('error', 'Invalid limit', 'Enter a number of minutes ≥ 1.'); return; }
            await screentimeAddOrUpdateLimit(domain, minutes);
            await screentimeLoad();
            renderScreentime();
            showToast?.('success', 'Limit saved', `${domain} limited to ${fmtMinutes(minutes)} per day.`);
        });
    }

    // Cancel
    const cancelBtn = container.querySelector('#st-cancel-limit-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            const form = document.getElementById('st-add-limit-form');
            if (form) form.style.display = 'none';
        });
    }
}

function openAddLimitForm(domain = '', minutes = null) {
    const form = document.getElementById('st-add-limit-form');
    if (!form) return;
    form.style.display = 'block';
    const domainInput = document.getElementById('st-limit-domain');
    const minutesInput = document.getElementById('st-limit-minutes');
    if (domainInput) domainInput.value = domain;
    if (minutesInput) minutesInput.value = minutes || '';
    // Highlight preset if it matches
    if (minutes) {
        document.querySelectorAll('.st-preset-btn').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.minutes, 10) === minutes);
        });
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    domainInput?.focus();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────
async function loadScreentime() {
    await screentimeLoad();
    renderScreentime();

    // Live-refresh every 30s while page is open
    if (screentimeState.refreshInterval) clearInterval(screentimeState.refreshInterval);
    screentimeState.refreshInterval = setInterval(async () => {
        if (document.getElementById('page-screentime')?.classList.contains('active')) {
            await screentimeLoad();
            renderScreentime();
        } else {
            clearInterval(screentimeState.refreshInterval);
            screentimeState.refreshInterval = null;
        }
    }, 30000);
}

