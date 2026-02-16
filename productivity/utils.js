/**
 * ============================================================================
 * STUDENT PRODUCTIVITY HUB - SHARED UTILITIES
 * ============================================================================
 * 
 * Centralized utility functions used across all modules.
 * This eliminates code duplication and improves maintainability.
 */

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escape HTML and convert URLs in text to clickable links
 */
function linkifyText(text) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    return escaped.replace(
        /(?:https?:\/\/|www\.)[^\s<>&"']+/gi,
        function(url) {
            const href = url.startsWith('www.') ? 'https://' + url : url;
            return '<a href="' + href + '" class="task-inline-link" target="_blank" rel="noopener noreferrer" title="' + url + '">' + url + '</a>';
        }
    );
}

/**
 * Truncate text to specified length with ellipsis
 */
function truncate(str, length = 50) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
}

/**
 * Capitalize first letter of string
 */
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

const FIXED_COLOR_PALETTE = [
    '#6366f1', // Indigo
    '#8b5cf6', // Purple
    '#3b82f6', // Blue
    '#06b6d4', // Cyan
    '#10b981', // Green
    '#14b8a6', // Teal
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#ec4899', // Pink
    '#64748b'  // Slate
];

function getFixedColorPalette() {
    return [...FIXED_COLOR_PALETTE];
}

function normalizePaletteColor(color, fallback = '#6366f1') {
    if (!color || typeof color !== 'string') return fallback;
    const normalized = color.trim().toLowerCase();
    const match = FIXED_COLOR_PALETTE.find(c => c.toLowerCase() === normalized);
    return match || fallback;
}

/**
 * Render a fixed color palette into a container, bound to a hidden/regular input.
 * Adds a helper function on the container: container.__setFixedColor(color)
 */
function createFixedColorPicker(containerEl, valueInputEl, options = {}) {
    if (!containerEl || !valueInputEl) return null;

    const colors = Array.isArray(options.colors) && options.colors.length ? options.colors : FIXED_COLOR_PALETTE;
    const buttonClass = options.buttonClass || 'color-btn';
    const activeClass = options.activeClass || 'active';
    const ariaLabel = options.ariaLabel || 'Color';

    function setColor(nextColor) {
        const color = normalizePaletteColor(nextColor, normalizePaletteColor(valueInputEl.value || colors[0]));
        valueInputEl.value = color;
        containerEl.querySelectorAll('button[data-color]').forEach(btn => {
            btn.classList.toggle(activeClass, btn.dataset.color === color);
            btn.setAttribute('aria-pressed', btn.dataset.color === color ? 'true' : 'false');
        });
        if (typeof options.onChange === 'function') {
            options.onChange(color);
        }
    }

    containerEl.innerHTML = colors.map(color => {
        const isActive = normalizePaletteColor(valueInputEl.value || colors[0]) === color;
        return `
            <button type="button" class="${buttonClass}${isActive ? ` ${activeClass}` : ''}" data-color="${color}" style="background: ${color}" aria-label="${ariaLabel}: ${color}" aria-pressed="${isActive ? 'true' : 'false'}"></button>
        `;
    }).join('');

    containerEl.querySelectorAll('button[data-color]').forEach(btn => {
        btn.addEventListener('click', () => setColor(btn.dataset.color));
    });

    // expose setter for external sync (e.g., when list selection changes)
    containerEl.__setFixedColor = setColor;
    setColor(valueInputEl.value || colors[0]);
    return { setColor };
}

// ============================================================================
// DATE/TIME UTILITIES
// ============================================================================

/**
 * Format time string (HH:MM) to 12-hour format
 */
function formatTime(time) {
    if (!time) return '';
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

/**
 * Format date string to readable format
 */
function formatDate(dateStr, options = {}) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const defaultOptions = { month: 'short', day: 'numeric', ...options };
    return date.toLocaleDateString('en-US', defaultOptions);
}

/**
 * Format date relative to today (Today, Tomorrow, Yesterday, or date)
 */
function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dateOnly = dateStr.split('T')[0];
    const todayOnly = today.toISOString().split('T')[0];
    const tomorrowOnly = tomorrow.toISOString().split('T')[0];
    const yesterdayOnly = yesterday.toISOString().split('T')[0];
    
    if (dateOnly === todayOnly) return 'Today';
    if (dateOnly === tomorrowOnly) return 'Tomorrow';
    if (dateOnly === yesterdayOnly) return 'Yesterday';
    
    return formatDate(dateStr);
}

/**
 * Format minutes to readable duration (e.g., "2h 30m")
 */
function formatMinutesLong(minutes) {
    if (!minutes || minutes === 0) return '0m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
}

/**
 * Get today's date as ISO string (YYYY-MM-DD)
 */
function getTodayDateStr() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Check if a date string is today
 */
function isToday(dateStr) {
    return dateStr === getTodayDateStr();
}

/**
 * Check if a date string is in the past
 */
function isPastDate(dateStr) {
    return dateStr < getTodayDateStr();
}

// ============================================================================
// FUNCTION UTILITIES
// ============================================================================

/**
 * Debounce function calls
 */
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function calls
 */
function throttle(func, limit = 100) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ============================================================================
// DOM UTILITIES
// ============================================================================

/**
 * Animate a number from start to end
 */
function animateNumber(element, start, end, duration = 1000) {
    if (!element) return;
    const startTime = performance.now();
    const diff = end - start;
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease out cubic
        element.textContent = Math.round(start + diff * easeProgress);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    requestAnimationFrame(update);
}

/**
 * Create toast container if it doesn't exist
 */
function createToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Get element by ID with optional error logging
 */
function $(id) {
    return document.getElementById(id);
}

/**
 * Query selector shorthand
 */
function $$(selector, parent = document) {
    return parent.querySelector(selector);
}

/**
 * Query selector all shorthand
 */
function $$$(selector, parent = document) {
    return parent.querySelectorAll(selector);
}

// ============================================================================
// DIALOG UTILITIES
// ============================================================================

let __confirmDialogChain = Promise.resolve();
let __confirmModalEl = null;

function __ensureConfirmModal() {
    if (__confirmModalEl) return __confirmModalEl;

    const modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.className = 'modal';
    // Ensure this is above focus overlay (which is higher than the default modal z-index).
    modal.style.zIndex = '3000';
    modal.innerHTML = `
        <div class="modal-content small">
            <div class="modal-header-minimal">
                <h2 id="confirm-modal-title"><i class="fas fa-circle-question"></i> Confirm</h2>
                <button class="close-modal-btn" type="button" data-confirm-close>&times;</button>
            </div>
            <div class="modal-body-streamlined">
                <div id="confirm-modal-message" style="line-height: 1.5;"></div>
            </div>
            <div class="modal-footer-streamlined">
                <button type="button" class="btn-ghost" data-confirm-cancel>Cancel</button>
                <button type="button" class="btn-primary" data-confirm-ok>OK</button>
            </div>
        </div>
    `;

    // Click outside closes (cancel)
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.dispatchEvent(new CustomEvent('confirm:cancel'));
        }
    });

    document.body.appendChild(modal);
    __confirmModalEl = modal;
    return modal;
}

/**
 * In-page confirmation dialog to avoid native window.confirm suppression.
 *
 * @param {string} message
 * @param {{title?: string, confirmText?: string, cancelText?: string, danger?: boolean}} options
 * @returns {Promise<boolean>}
 */
function confirmDialog(message, options = {}) {
    const opts = {
        title: typeof options.title === 'string' ? options.title : 'Confirm',
        confirmText: typeof options.confirmText === 'string' ? options.confirmText : 'OK',
        cancelText: typeof options.cancelText === 'string' ? options.cancelText : 'Cancel',
        danger: Boolean(options.danger)
    };

    __confirmDialogChain = __confirmDialogChain.then(() => new Promise((resolve) => {
        const modal = __ensureConfirmModal();
        const titleEl = modal.querySelector('#confirm-modal-title');
        const messageEl = modal.querySelector('#confirm-modal-message');
        const okBtn = modal.querySelector('[data-confirm-ok]');
        const cancelBtn = modal.querySelector('[data-confirm-cancel]');
        const closeBtn = modal.querySelector('[data-confirm-close]');

        if (titleEl) {
            titleEl.innerHTML = `<i class="fas fa-circle-question"></i> ${escapeHtml(opts.title)}`;
        }
        if (messageEl) {
            messageEl.textContent = message || '';
        }
        if (okBtn) {
            okBtn.textContent = opts.confirmText;
            okBtn.className = opts.danger ? 'btn-danger' : 'btn-primary';
            okBtn.setAttribute('type', 'button');
        }
        if (cancelBtn) {
            cancelBtn.textContent = opts.cancelText;
            cancelBtn.setAttribute('type', 'button');
        }

        let finished = false;
        const finish = (value) => {
            if (finished) return;
            finished = true;
            cleanup();
            modal.classList.remove('active');
            resolve(Boolean(value));
        };

        const onOk = () => finish(true);
        const onCancel = () => finish(false);
        const onClose = () => finish(false);
        const onCancelEvent = () => finish(false);
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
            }
        };

        const cleanup = () => {
            okBtn?.removeEventListener('click', onOk);
            cancelBtn?.removeEventListener('click', onCancel);
            closeBtn?.removeEventListener('click', onClose);
            modal.removeEventListener('confirm:cancel', onCancelEvent);
            document.removeEventListener('keydown', onKeyDown, true);
        };

        okBtn?.addEventListener('click', onOk);
        cancelBtn?.addEventListener('click', onCancel);
        closeBtn?.addEventListener('click', onClose);
        modal.addEventListener('confirm:cancel', onCancelEvent);
        document.addEventListener('keydown', onKeyDown, true);

        modal.classList.add('active');

        // Focus confirm by default for keyboard flow
        setTimeout(() => {
            try { okBtn?.focus(); } catch { /* ignore */ }
        }, 0);
    }));

    return __confirmDialogChain;
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Check if value is empty (null, undefined, empty string, empty array)
 */
function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

/**
 * Ensure time format is HH:mm (add leading zero if needed)
 */
function ensureTimeFormat(time) {
    if (!time) return null;
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
        return `${match[1].padStart(2, '0')}:${match[2]}`;
    }
    return '09:00'; // Default fallback
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Add alpha to hex color
 */
function hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Lighten a hex color
 */
function lightenColor(hex, percent = 20) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

/**
 * Safe localStorage get with JSON parse
 */
function getLocalStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch {
        return defaultValue;
    }
}

/**
 * Safe localStorage set with JSON stringify
 */
function setLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

// ============================================================================
// EXPORT UTILITIES GLOBALLY
// ============================================================================
window.Utils = {
    // String
    escapeHtml,
    linkifyText,
    truncate,
    capitalizeFirst,
    
    // Date/Time
    formatTime,
    formatDate,
    formatRelativeDate,
    formatMinutesLong,
    getTodayDateStr,
    isToday,
    isPastDate,
    ensureTimeFormat,
    
    // Functions
    debounce,
    throttle,
    
    // DOM
    animateNumber,
    createToastContainer,
    $,
    $$,
    $$$,
    
    // Validation
    isEmpty,
    
    // Colors
    hexToRgba,
    lightenColor,
    
    // Storage
    getLocalStorage,
    setLocalStorage
};

// Also expose common functions globally for backward compatibility
window.escapeHtml = escapeHtml;
window.linkifyText = linkifyText;
window.truncate = truncate;
window.capitalizeFirst = capitalizeFirst;
window.formatTime = formatTime;
window.formatDate = formatDate;
window.formatRelativeDate = formatRelativeDate;
window.formatMinutesLong = formatMinutesLong;
window.debounce = debounce;
window.throttle = throttle;
window.animateNumber = animateNumber;
window.createToastContainer = createToastContainer;
