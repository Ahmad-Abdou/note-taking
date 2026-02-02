/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - IDLE TRACKING MODULE
 * ============================================================================
 * 
 * Tracks user idle time to help identify patterns and wasted time.
 * Features:
 * - 10-minute idle threshold detection
 * - Timer counts up once idle
 * - Record categorization
 * - Analytics and insights
 */

// ============================================================================
// IDLE STATE
// ============================================================================

const IdleState = {
    isIdle: false,
    lastActivity: Date.now(),
    idleThresholdMs: 10 * 60 * 1000, // 10 minutes
    currentIdleStart: null,
    checkInterval: null,
    idleTimerInterval: null,
    isTracking: false
};

// ============================================================================
// IDLE DETECTION
// ============================================================================

function initIdleTracking() {
    // Set up activity listeners
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    activityEvents.forEach(event => {
        document.addEventListener(event, handleActivity, { passive: true });
    });

    // Start periodic idle check
    IdleState.checkInterval = setInterval(checkIdleStatus, 5000); // Check every 5 seconds
    IdleState.isTracking = true;

    // Initial check
    IdleState.lastActivity = Date.now();
}

function handleActivity() {
    IdleState.lastActivity = Date.now();

    if (IdleState.isIdle) {
        endIdlePeriod();
    }
}

function checkIdleStatus() {
    if (!IdleState.isTracking) return;

    const now = Date.now();
    const timeSinceActivity = now - IdleState.lastActivity;

    if (!IdleState.isIdle && timeSinceActivity >= IdleState.idleThresholdMs) {
        startIdlePeriod();
    }
}

async function startIdlePeriod() {
    if (IdleState.isIdle) return;

    IdleState.isIdle = true;
    IdleState.currentIdleStart = new Date(Date.now() - IdleState.idleThresholdMs); // Started 10 mins ago

    // Start counting up timer
    IdleState.idleTimerInterval = setInterval(updateIdleTimerDisplay, 1000);

    // Update UI
    updateIdleStatusUI(true);
    updateIdleTimerDisplay();
}

async function endIdlePeriod() {
    if (!IdleState.isIdle || !IdleState.currentIdleStart) return;

    // Capture values immediately and reset state to prevent race conditions
    const startTime = IdleState.currentIdleStart;
    const endTime = new Date();
    const durationMs = endTime - startTime;
    const durationMinutes = Math.round(durationMs / (1000 * 60));

    // Reset state FIRST to prevent duplicate calls
    IdleState.isIdle = false;
    IdleState.currentIdleStart = null;

    if (IdleState.idleTimerInterval) {
        clearInterval(IdleState.idleTimerInterval);
        IdleState.idleTimerInterval = null;
    }

    // Update UI
    updateIdleStatusUI(false);

    // Only save if idle for at least 10 minutes (threshold)
    if (durationMinutes >= 10) {
        const startTimeStr = startTime.toISOString();

        // Check for existing record with same start time to avoid duplicates
        const existingRecords = await ProductivityData.DataStore.getIdleRecords();
        const existingRecord = existingRecords.find(r => r.startTime === startTimeStr);

        if (!existingRecord) {
            const record = new ProductivityData.IdleRecord({
                date: startTime.toISOString().split('T')[0],
                startTime: startTimeStr,
                endTime: endTime.toISOString(),
                durationMinutes: durationMinutes
            });

            await ProductivityData.DataStore.saveIdleRecord(record);

            // Refresh UI if on idle page
            if (document.getElementById('page-idle')?.classList.contains('active')) {
                await loadIdlePage();
            }

            showToast('info', 'Idle Period Recorded', `You were idle for ${formatDuration(durationMinutes)}`);
        }
    }
}

function updateIdleTimerDisplay() {
    const display = document.getElementById('idle-timer-display');
    if (!display || !IdleState.currentIdleStart) return;

    const now = Date.now();
    const elapsed = Math.floor((now - IdleState.currentIdleStart) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    display.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateIdleStatusUI(isIdle) {
    const statusIndicator = document.getElementById('idle-status-indicator');
    const statusText = document.getElementById('idle-status-text');
    const timerContainer = document.getElementById('idle-timer-container');

    if (statusIndicator) {
        statusIndicator.className = `idle-status-indicator ${isIdle ? 'idle' : 'active'}`;
    }

    if (statusText) {
        statusText.textContent = isIdle ? 'Currently Idle' : 'Active';
    }

    if (timerContainer) {
        timerContainer.style.display = isIdle ? 'flex' : 'none';
    }
}

// ============================================================================
// IDLE PAGE UI
// ============================================================================

async function loadIdlePage() {
    await renderIdleStatus();
    await renderIdleRecords();
    await renderIdleCategories();
    await renderIdleSummary();
    // Set up event delegation for dynamically created elements
    setupIdleEventListeners();
}

async function renderIdleStatus() {
    const container = document.getElementById('idle-status-card');
    if (!container) return;

    const isIdle = IdleState.isIdle;

    container.innerHTML = `
        <div class="idle-status-content">
            <div class="idle-status-indicator ${isIdle ? 'idle' : 'active'}" id="idle-status-indicator">
                <i class="fas ${isIdle ? 'fa-hourglass-half' : 'fa-user-check'}"></i>
            </div>
            <div class="idle-status-info">
                <h3 id="idle-status-text">${isIdle ? 'Currently Idle' : 'Active'}</h3>
                <p>Idle tracking is ${IdleState.isTracking ? 'active' : 'paused'}</p>
            </div>
            <div class="idle-timer-container" id="idle-timer-container" style="display: ${isIdle ? 'flex' : 'none'}">
                <span class="idle-timer-label">Idle for</span>
                <span class="idle-timer-display" id="idle-timer-display">0:00</span>
            </div>
        </div>
    `;

    if (isIdle) {
        updateIdleTimerDisplay();
    }
}

async function renderIdleRecords() {
    const container = document.getElementById('idle-records-list');
    if (!container) return;

    const records = await ProductivityData.DataStore.getIdleRecords();
    const categories = await ProductivityData.DataStore.getIdleCategories();

    if (records.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-clock"></i></div>
                <h3>No Idle Records Yet</h3>
                <p>Idle periods will be recorded when you're inactive for 10+ minutes</p>
            </div>
        `;
        return;
    }

    // Group by date
    const groupedByDate = {};
    records.forEach(record => {
        if (!groupedByDate[record.date]) {
            groupedByDate[record.date] = [];
        }
        groupedByDate[record.date].push(record);
    });

    let html = '';
    for (const [date, dayRecords] of Object.entries(groupedByDate)) {
        const dateObj = new Date(date + 'T12:00:00');
        const dateLabel = formatDateLabel(dateObj);
        const totalMinutes = dayRecords.reduce((sum, r) => sum + r.durationMinutes, 0);

        html += `
            <div class="idle-record-group">
                <div class="idle-record-date">
                    <span class="date-label">${dateLabel}</span>
                    <span class="date-total">${formatDuration(totalMinutes)} total</span>
                </div>
                <div class="idle-record-items">
                    ${dayRecords.map(record => {
            const category = categories.find(c => c.id === record.categoryId);
            const startTime = new Date(record.startTime);
            const endTime = record.endTime ? new Date(record.endTime) : null;

            return `
                            <div class="idle-record-item" data-id="${record.id}">
                                <div class="record-time">
                                    <span class="start">${formatIdleTime(startTime)}</span>
                                    <span class="separator">→</span>
                                    <span class="end">${endTime ? formatIdleTime(endTime) : 'ongoing'}</span>
                                </div>
                                <div class="record-duration">${formatDuration(record.durationMinutes)}</div>
                                <div class="record-category">
                                    <button class="category-badge" data-action="category-picker" data-record-id="${record.id}" 
                                            style="background: ${category?.color || '#6b7280'}20; color: ${category?.color || '#6b7280'}; border-color: ${category?.color || '#6b7280'}">
                                        <i class="fas ${category?.icon || 'fa-tag'}"></i>
                                        ${category?.name || 'Uncategorized'}
                                    </button>
                                </div>
                                <div class="record-actions">
                                    <button class="btn-icon-sm" data-action="delete-record" data-record-id="${record.id}" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

async function renderIdleCategories() {
    const container = document.getElementById('idle-categories-list');
    if (!container) return;

    const categories = await ProductivityData.DataStore.getIdleCategories();

    let html = `
        <div class="category-header">
            <h4>Categories</h4>
            <button class="btn-secondary btn-sm" id="add-category-btn">
                <i class="fas fa-plus"></i> Add Category
            </button>
        </div>
    `;

    if (categories.length === 0) {
        html += `<p class="empty-hint">Create categories to organize your idle time</p>`;
    } else {
        html += `<div class="category-list">`;
        categories.forEach(cat => {
            html += `
                <div class="category-item" data-id="${cat.id}">
                    <span class="category-dot" style="background: ${cat.color}"></span>
                    <span class="category-name">${cat.name}</span>
                    <button class="btn-icon-sm" data-action="delete-category" data-category-id="${cat.id}" title="Delete">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });
        html += `</div>`;
    }

    container.innerHTML = html;
}

async function renderIdleSummary() {
    const container = document.getElementById('idle-summary');
    if (!container) return;

    const records = await ProductivityData.DataStore.getIdleRecords();
    const categories = await ProductivityData.DataStore.getIdleCategories();

    if (records.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Calculate totals by category
    const categoryStats = {};
    let totalMinutes = 0;

    // Initialize with "Uncategorized"
    categoryStats['uncategorized'] = {
        name: 'Uncategorized',
        color: '#6b7280',
        minutes: 0
    };

    // Add user categories
    categories.forEach(cat => {
        categoryStats[cat.id] = {
            name: cat.name,
            color: cat.color,
            minutes: 0
        };
    });

    // Tally up minutes
    records.forEach(record => {
        const catId = record.categoryId || 'uncategorized';
        const minutes = record.durationMinutes || 0;
        totalMinutes += minutes;

        if (categoryStats[catId]) {
            categoryStats[catId].minutes += minutes;
        } else {
            categoryStats['uncategorized'].minutes += minutes;
        }
    });

    // Filter out zero-minute categories and calculate percentages
    const breakdown = Object.values(categoryStats)
        .filter(cat => cat.minutes > 0)
        .map(cat => ({
            ...cat,
            percentage: Math.round((cat.minutes / totalMinutes) * 100)
        }))
        .sort((a, b) => b.minutes - a.minutes);

    if (breakdown.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = `
        <div class="summary-header">
            <h4><i class="fas fa-chart-pie"></i> Where You Waste Time</h4>
            <span class="summary-total">${formatDuration(totalMinutes)} total</span>
        </div>
        <div class="summary-pie-container">
            <svg viewBox="0 0 100 100" class="summary-pie">
                ${createPieChartPaths(breakdown)}
            </svg>
        </div>
        <div class="summary-legend">
            ${breakdown.map(cat => `
                <div class="legend-row">
                    <span class="legend-dot" style="background: ${cat.color}"></span>
                    <span class="legend-name">${cat.name}</span>
                    <span class="legend-stats">${cat.percentage}% (${formatDuration(cat.minutes)})</span>
                </div>
            `).join('')}
        </div>
    `;

    container.innerHTML = html;
}

// ============================================================================
// CATEGORY MANAGEMENT
// ============================================================================

function showAddCategoryModal() {
    const modal = document.getElementById('idle-category-modal');
    if (!modal) return;

    const colorInput = document.getElementById('category-color');
    const colorOptions = document.getElementById('category-color-options');

    if (colorOptions && colorInput && typeof createFixedColorPicker === 'function') {
        if (!colorOptions.__fixedColorPickerBound) {
            createFixedColorPicker(colorOptions, colorInput, { defaultColor: '#6366f1' });
            colorOptions.__fixedColorPickerBound = true;
        }
    }

    document.getElementById('category-id').value = '';
    document.getElementById('category-name').value = '';
    if (colorInput) colorInput.value = '#6366f1';
    if (colorOptions && typeof colorOptions.__setFixedColor === 'function') {
        colorOptions.__setFixedColor('#6366f1');
    }

    modal.classList.add('active');
}

async function saveIdleCategory() {
    const id = document.getElementById('category-id')?.value || '';
    const name = document.getElementById('category-name').value.trim();
    const rawColor = document.getElementById('category-color')?.value || '#6366f1';
    const color = (typeof normalizePaletteColor === 'function')
        ? normalizePaletteColor(rawColor, '#6366f1')
        : rawColor;

    if (!name) {
        showToast('error', 'Error', 'Category name is required');
        return;
    }

    const category = new ProductivityData.IdleCategory({
        id: id || undefined,
        name,
        color
    });

    await ProductivityData.DataStore.saveIdleCategory(category);

    closeIdleCategoryModal();
    await renderIdleCategories();
    showToast('success', 'Category Saved', `Category "${name}" has been saved`);
}

function closeIdleCategoryModal() {
    const modal = document.getElementById('idle-category-modal');
    if (modal) modal.classList.remove('active');
}

async function deleteIdleCategory(categoryId) {
    if (!confirm('Delete this category? Records using it will become uncategorized.')) return;

    await ProductivityData.DataStore.deleteIdleCategory(categoryId);
    await renderIdleCategories();
    await renderIdleRecords();
    showToast('success', 'Category Deleted', 'Category has been removed');
}

// ============================================================================
// RECORD MANAGEMENT
// ============================================================================

async function deleteIdleRecord(recordId) {
    if (!confirm('Delete this idle record?')) return;

    await ProductivityData.DataStore.deleteIdleRecord(recordId);
    await loadIdlePage();
    showToast('success', 'Record Deleted', 'Idle record has been removed');
}

async function showCategoryPicker(recordId) {
    const categories = await ProductivityData.DataStore.getIdleCategories();

    // Create popup for category selection
    const existingPopup = document.querySelector('.category-picker-popup');
    if (existingPopup) existingPopup.remove();

    const popup = document.createElement('div');
    popup.className = 'category-picker-popup';
    popup.innerHTML = `
        <div class="category-picker-header">
            <span>Assign Category</span>
            <button class="close-picker-btn"><i class="fas fa-times"></i></button>
        </div>
        <div class="category-picker-options">
            <div class="category-option" data-action="assign-category" data-record-id="${recordId}" data-category-id="">
                <span class="category-dot" style="background: #6b7280"></span>
                Uncategorized
            </div>
            ${categories.map(cat => `
                <div class="category-option" data-action="assign-category" data-record-id="${recordId}" data-category-id="${cat.id}">
                    <span class="category-dot" style="background: ${cat.color}"></span>
                    ${cat.name}
                </div>
            `).join('')}
        </div>
    `;

    document.body.appendChild(popup);

    // Position near clicked element
    const recordEl = document.querySelector(`.idle-record-item[data-id="${recordId}"]`);
    if (recordEl) {
        const rect = recordEl.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.top = `${Math.min(rect.bottom + 5, window.innerHeight - 200)}px`;
        popup.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
    }

    // Add click handlers
    popup.querySelector('.close-picker-btn').addEventListener('click', () => popup.remove());

    popup.querySelectorAll('[data-action="assign-category"]').forEach(el => {
        el.addEventListener('click', async () => {
            const catId = el.dataset.categoryId || null;
            await assignCategory(recordId, catId);
            popup.remove();
        });
    });

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closePopup(e) {
            if (!popup.contains(e.target)) {
                popup.remove();
                document.removeEventListener('click', closePopup);
            }
        });
    }, 100);
}

async function assignCategory(recordId, categoryId) {
    const records = await ProductivityData.DataStore.getIdleRecords();
    const record = records.find(r => r.id === recordId);

    if (record) {
        record.categoryId = categoryId;
        await ProductivityData.DataStore.saveIdleRecord(record);
        await renderIdleRecords();
        await renderIdleSummary();
    }

    const popup = document.querySelector('.category-picker-popup');
    if (popup) popup.remove();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDuration(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatIdleTime(date) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatHour(hour) {
    if (hour === 0) return '12am';
    if (hour < 12) return `${hour}am`;
    if (hour === 12) return '12pm';
    return `${hour - 12}pm`;
}

function formatDateLabel(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function createPieChartPaths(data) {
    if (data.length === 0) return '';

    let paths = '';
    let startAngle = 0;
    const cx = 50, cy = 50, r = 40;

    data.forEach(item => {
        const angle = (item.percentage / 100) * 360;
        if (angle === 0) return;

        const endAngle = startAngle + angle;
        const largeArc = angle > 180 ? 1 : 0;

        const startRad = (startAngle - 90) * Math.PI / 180;
        const endRad = (endAngle - 90) * Math.PI / 180;

        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);

        if (angle >= 359.9) {
            // Full circle
            paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${item.color}" />`;
        } else {
            paths += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${item.color}" />`;
        }

        startAngle = endAngle;
    });

    return paths;
}

// ============================================================================
// EVENT DELEGATION SETUP
// ============================================================================

function setupIdleEventListeners() {
    const idlePage = document.getElementById('page-idle');
    if (!idlePage) return;

    // Event delegation for idle page elements
    idlePage.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;

        switch (action) {
            case 'category-picker':
                await showCategoryPicker(target.dataset.recordId);
                break;
            case 'delete-record':
                await deleteIdleRecord(target.dataset.recordId);
                break;
            case 'delete-category':
                await deleteIdleCategory(target.dataset.categoryId);
                break;
        }
    });

    // Add category button
    const addCategoryBtn = document.getElementById('add-category-btn');
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', showAddCategoryModal);
    }
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================

window.IdleTracking = {
    init: initIdleTracking,
    load: loadIdlePage,
    showAddCategoryModal,
    saveIdleCategory,
    closeIdleCategoryModal,
    deleteIdleCategory,
    deleteIdleRecord,
    showCategoryPicker,
    assignCategory
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Idle tracking disabled - uncomment to re-enable
    // initIdleTracking();

    // Set up modal button listeners
    document.getElementById('close-idle-category-btn')?.addEventListener('click', closeIdleCategoryModal);
    document.getElementById('cancel-idle-category-btn')?.addEventListener('click', closeIdleCategoryModal);
    document.getElementById('save-idle-category-btn')?.addEventListener('click', saveIdleCategory);
});
