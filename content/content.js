(() => {
    const __EDGE_NOTE_TAKER_BUILD__ = 'content@2026-01-14.1';

    const chrome = globalThis.chrome || globalThis.browser;
    if (!chrome?.runtime?.onMessage) {
        // Likely a sandboxed frame (e.g., ads/embeds) where extension APIs aren't available.
        return;
    }

    // This content script can be injected more than once (MV3 + fallback injection).
    // Key the guard by runtime id so multiple installed variants/extensions don't block each other.
    const __edgeNoteTakerGuardKey__ = `__edgeNoteTakerContentScriptLoaded_${chrome.runtime.id || 'unknown'}`;
    if (globalThis[__edgeNoteTakerGuardKey__]) return;
    globalThis[__edgeNoteTakerGuardKey__] = true;

    function cleanupLegacyReminderUI() {
        try {
            document.getElementById('edge-note-taker-reminder')?.remove();
            document.getElementById('edge-note-taker-reminder-styles')?.remove();
            document.getElementById('edge-note-taker-focus-complete')?.remove();
            document.getElementById('edge-note-taker-focus-complete-styles')?.remove();
        } catch (e) {
            // ignore
        }
    }

    // Remove any lingering legacy banners immediately.
    cleanupLegacyReminderUI();

    // If another (old) script tries to inject the legacy banner later, remove it.
    try {
        const legacyObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (!node || node.nodeType !== 1) continue;
                    const el = /** @type {HTMLElement} */ (node);
                    const id = el.id;
                    if (id === 'edge-note-taker-reminder' || id === 'edge-note-taker-focus-complete') {
                        el.remove();
                        continue;
                    }
                    const legacy = el.querySelector?.('#edge-note-taker-reminder, #edge-note-taker-focus-complete');
                    if (legacy) legacy.remove();
                }
            }
        });
        legacyObserver.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {
        // ignore
    }

    try {
        const runtimeId = chrome?.runtime?.id;
        console.log('[EdgeNoteTaker][Content] build:', __EDGE_NOTE_TAKER_BUILD__, {
            runtimeId,
            href: location.href,
            top: window === window.top,
            frameId: runtimeId ? 'isolated/extension' : 'page'
        });
        chrome.runtime.sendMessage({
            action: 'CONTENT_SCRIPT_HELLO',
            build: __EDGE_NOTE_TAKER_BUILD__,
            href: location.href,
            top: window === window.top,
            ts: Date.now()
        }, (resp) => {
            const err = chrome.runtime.lastError;
            if (err) {
                console.log('[EdgeNoteTaker][Content] hello failed:', err.message);
                return;
            }
            console.log('[EdgeNoteTaker][Content] hello ok:', resp);
        });
    } catch (e) {
        // ignore
    }

    let iconContainer = null;
    let focusOverlayElement = null;

    // Some sites (e.g., YouTube) block AudioContext until a user gesture.
    // Track whether we've seen a gesture to avoid noisy console errors.
    let __edgeNoteTakerUserGestureSeen = false;
    let __edgeNoteTakerPendingChimeUntil = 0;
    const __edgeNoteTakerMarkGesture = () => {
        __edgeNoteTakerUserGestureSeen = true;
    };
    ['pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach((evt) => {
        window.addEventListener(evt, __edgeNoteTakerMarkGesture, { capture: true, passive: true });
    });

    console.log('Edge Note Taker Content Script Loaded');

// Initialize focus overlay monitoring after a short delay to ensure DOM is ready
setTimeout(() => {
    initFocusOverlayMonitor();
}, 100);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Content] Received message:', request.action);

    if (request.action === 'trigger_capture') {
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            captureSelection(rect);
        } else {
            alert("Please select an area first to capture.");
        }
    } else if (request.action === 'show_edit_modal_with_text') {
        // Center the modal if we don't have a specific click location
        const x = window.innerWidth / 2 + window.scrollX;
        const y = window.innerHeight / 2 + window.scrollY;
        showEditModal(request.text, x, y);
        sendResponse({ status: 'success' });
    } else if (request.action === 'GET_PDF_INFO') {
        // Detect if we're viewing a PDF in native viewer
        const pdfInfo = getPdfInfo();
        sendResponse(pdfInfo);
    } else if (request.action === 'show_toast') {
        // Show toast notification on the page
        showToast(request.message, request.type || 'success');
        sendResponse({ status: 'success' });
    } else if (request.action === 'show_task_reminder') {
        // Show task reminder notification banner
        chrome.storage.local.get(['taskRemindersEnabled'], (stored) => {
            if (stored?.taskRemindersEnabled === false) {
                sendResponse({ status: 'disabled' });
                return;
            }
            console.log('[Content] Task reminder request received:', request.message);
            showTaskReminderBanner(request.taskCount, request.message);
            sendResponse({ status: 'success' });
        });
        return true;
    } else if (request.action === 'show_focus_complete') {
        // Show focus session complete notification with sound
        console.log('[Content] Focus complete notification:', request.message);
        showFocusCompleteBanner(request.message, request.playSound);
        sendResponse({ status: 'success' });
    } else if (request.action === 'FOCUS_SESSION_START') {
        // Show focus overlay
        showFocusOverlay(request.settings);
        sendResponse({ status: 'success' });
    } else if (request.action === 'FOCUS_SESSION_END') {
        // Hide focus overlay
        hideFocusOverlay();
        sendResponse({ status: 'success' });
    } else if (request.action === 'UPDATE_FOCUS_OVERLAY') {
        // Update focus overlay settings
        updateFocusOverlay(request.settings);
        sendResponse({ status: 'success' });
    }
    return true; // Keep message channel open for async response
});

// ============================================
// FOCUS SESSION OVERLAY
// ============================================

function initFocusOverlayMonitor() {
    console.log('[FocusOverlay] Initializing focus overlay monitor');

    // Check if there's an active focus session on page load
    chrome.storage.local.get(['focusSession', 'focusState', 'focusOverlaySettings'], (result) => {
        console.log('[FocusOverlay] Initial check:', {
            focusSession: result.focusSession?.isActive,
            focusState: result.focusState?.isActive
        });

        const isActive = (result.focusSession && result.focusSession.isActive) ||
            (result.focusState && result.focusState.isActive);

        if (isActive) {
            const settings = result.focusOverlaySettings || getDefaultOverlaySettings();
            console.log('[FocusOverlay] Active session found, showing overlay with settings:', settings);
            if (settings.enabled) {
                showFocusOverlay(settings);
            }
        }
    });

    // Listen for storage changes (to react to focus session start/end)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        console.log('[FocusOverlay] Storage changed:', Object.keys(changes));

        if (changes.focusSession || changes.focusState) {
            const focusSession = changes.focusSession?.newValue;
            const focusState = changes.focusState?.newValue;

            const isActive = (focusSession && focusSession.isActive) ||
                (focusState && focusState.isActive);

            console.log('[FocusOverlay] Focus state changed, isActive:', isActive);

            if (isActive) {
                chrome.storage.local.get(['focusOverlaySettings'], (result) => {
                    const settings = result.focusOverlaySettings || getDefaultOverlaySettings();
                    if (settings.enabled) {
                        console.log('[FocusOverlay] Showing overlay');
                        showFocusOverlay(settings);
                    }
                });
            } else {
                console.log('[FocusOverlay] Hiding overlay');
                hideFocusOverlay();
            }
        }

        if (changes.focusOverlaySettings) {
            const settings = changes.focusOverlaySettings.newValue;
            updateFocusOverlay(settings);
        }
    });
}

function getDefaultOverlaySettings() {
    return {
        enabled: true,
        color: '#8b5cf6',  // Purple by default
        opacity: 0.6,      // Increased from 0.4 for more visibility
        width: 5,          // Increased from 3 for more visibility
        style: 'solid',    // solid, dashed, glow
        position: 'all'    // all, top, sides
    };
}

function showFocusOverlay(settings = {}) {
    settings = { ...getDefaultOverlaySettings(), ...settings };

    console.log('[FocusOverlay] showFocusOverlay called with:', settings);

    if (!settings.enabled) {
        console.log('[FocusOverlay] Overlay disabled, hiding');
        hideFocusOverlay();
        return;
    }

    // Remove existing overlay
    hideFocusOverlay();

    focusOverlayElement = document.createElement('div');
    focusOverlayElement.id = 'focus-session-overlay';

    const { color, opacity, width, style, position } = settings;
    const rgba = hexToRgba(color, opacity);

    let borderCSS = '';
    let boxShadowCSS = '';

    if (style === 'glow') {
        boxShadowCSS = `inset 0 0 ${width * 3}px ${rgba}, inset 0 0 ${width * 6}px ${hexToRgba(color, opacity * 0.5)}, inset 0 0 ${width * 9}px ${hexToRgba(color, opacity * 0.25)}`;
    } else {
        const borderStyle = style === 'dashed' ? 'dashed' : 'solid';
        // Build border CSS properly - use individual border properties
        if (position === 'all') {
            borderCSS = `border: ${width}px ${borderStyle} ${rgba} !important;`;
        } else if (position === 'top') {
            borderCSS = `border-top: ${width}px ${borderStyle} ${rgba} !important; border-left: 0 !important; border-right: 0 !important; border-bottom: 0 !important;`;
        } else if (position === 'sides') {
            borderCSS = `border-left: ${width}px ${borderStyle} ${rgba} !important; border-right: ${width}px ${borderStyle} ${rgba} !important; border-top: 0 !important; border-bottom: 0 !important;`;
        }
    }

    focusOverlayElement.style.cssText = `
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
    `;

    console.log('[FocusOverlay] Created overlay element with styles:', focusOverlayElement.style.cssText);

    // No animation - just static overlay

    // Append to body or document element
    const targetElement = document.body || document.documentElement;
    if (targetElement) {
        targetElement.appendChild(focusOverlayElement);
        console.log('[FocusOverlay] Overlay appended to:', targetElement.tagName);
    } else {
        console.error('[FocusOverlay] No body or documentElement found!');
    }
}

function hideFocusOverlay() {
    if (focusOverlayElement) {
        focusOverlayElement.remove();
        focusOverlayElement = null;
    }
    const existing = document.getElementById('focus-session-overlay');
    if (existing) existing.remove();
}

function updateFocusOverlay(settings) {
    if (!settings) return;

    if (settings.enabled === false) {
        hideFocusOverlay();
        return;
    }

    // Check if focus session is active before showing overlay
    chrome.storage.local.get(['focusSession', 'focusState'], (result) => {
        const isActive = (result.focusSession && result.focusSession.isActive) ||
            (result.focusState && result.focusState.isActive);

        if (isActive && settings.enabled) {
            showFocusOverlay(settings);
        } else {
            hideFocusOverlay();
        }
    });
}

function hexToRgba(hex, opacity) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Toast notification function
function ensureUnifiedToastSupport() {
    if (document.getElementById('edge-note-taker-toast-styles')) return;

    const style = document.createElement('style');
    style.id = 'edge-note-taker-toast-styles';
    style.textContent = `
        #edge-note-taker-toast-container.toast-container {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: none;
        }

        #edge-note-taker-toast-container .toast {
            pointer-events: auto;
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px 24px;
            background: #1e1e3f;
            border: 1px solid #2a2a4a;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            min-width: 280px;
            max-width: 420px;
            animation: edgeToastSlideIn 0.3s ease;
            position: relative;
            overflow: hidden;
            font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        }

        @keyframes edgeToastSlideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        #edge-note-taker-toast-container .toast.success { border-left: 4px solid #10b981; }
        #edge-note-taker-toast-container .toast.warning { border-left: 4px solid #f59e0b; }
        #edge-note-taker-toast-container .toast.error { border-left: 4px solid #ef4444; }
        #edge-note-taker-toast-container .toast.info { border-left: 4px solid #06b6d4; }
        #edge-note-taker-toast-container .toast.focus { border-left: 4px solid #6366f1; }
        #edge-note-taker-toast-container .toast.achievement { border-left: 4px solid #10b981; }
        #edge-note-taker-toast-container .toast.streak { border-left: 4px solid #f59e0b; }
        #edge-note-taker-toast-container .toast.break { border-left: 4px solid #6366f1; }

        #edge-note-taker-toast-container .toast-icon {
            font-size: 1.25rem;
            line-height: 1;
            color: #fff;
        }

        #edge-note-taker-toast-container .toast.success .toast-icon { color: #10b981; }
        #edge-note-taker-toast-container .toast.warning .toast-icon { color: #f59e0b; }
        #edge-note-taker-toast-container .toast.error .toast-icon { color: #ef4444; }
        #edge-note-taker-toast-container .toast.info .toast-icon { color: #06b6d4; }
        #edge-note-taker-toast-container .toast.focus .toast-icon { color: #6366f1; }
        #edge-note-taker-toast-container .toast.break .toast-icon { color: #6366f1; }
        #edge-note-taker-toast-container .toast.achievement .toast-icon { color: #10b981; }
        #edge-note-taker-toast-container .toast.streak .toast-icon { color: #f59e0b; }

        #edge-note-taker-toast-container .toast-content {
            flex: 1;
            min-width: 0;
        }

        #edge-note-taker-toast-container .toast-title {
            font-weight: 600;
            font-size: 0.95rem;
            color: #ffffff;
        }

        #edge-note-taker-toast-container .toast-message {
            font-size: 0.85rem;
            color: #a0a0b8;
            margin-top: 2px;
            word-break: break-word;
        }

        #edge-note-taker-toast-container .toast-actions {
            display: flex;
            gap: 4px;
            margin-left: 8px;
        }

        #edge-note-taker-toast-container .toast-btn {
            border: 1px solid #2a2a4a;
            background: transparent;
            color: #a0a0b8;
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 0.8rem;
            cursor: pointer;
            transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
        }

        #edge-note-taker-toast-container .toast-btn:hover {
            border-color: #3a3a5a;
            color: #ffffff;
            background: rgba(255, 255, 255, 0.06);
        }

        #edge-note-taker-toast-container .toast-btn.primary {
            background: #6366f1;
            border-color: #6366f1;
            color: #fff;
        }

        #edge-note-taker-toast-container .toast-btn.primary:hover {
            background: #4f46e5;
            border-color: #4f46e5;
        }

        #edge-note-taker-toast-container .toast-close {
            color: #6b6b80;
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        }

        #edge-note-taker-toast-container .toast-close:hover {
            color: #ffffff;
        }

        #edge-note-taker-toast-container .toast-progress {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            width: 100%;
            background: rgba(255, 255, 255, 0.08);
        }

        #edge-note-taker-toast-container .toast-progress::before {
            content: '';
            position: absolute;
            inset: 0;
            transform-origin: left;
            transform: scaleX(1);
            background: currentColor;
            animation: edgeToastProgress linear forwards;
            animation-duration: inherit;
        }

        #edge-note-taker-toast-container .toast.success { color: #10b981; }
        #edge-note-taker-toast-container .toast.warning { color: #f59e0b; }
        #edge-note-taker-toast-container .toast.error { color: #ef4444; }
        #edge-note-taker-toast-container .toast.info { color: #06b6d4; }
        #edge-note-taker-toast-container .toast.focus,
        #edge-note-taker-toast-container .toast.break { color: #6366f1; }
        #edge-note-taker-toast-container .toast.achievement { color: #10b981; }
        #edge-note-taker-toast-container .toast.streak { color: #f59e0b; }

        @keyframes edgeToastProgress {
            from { transform: scaleX(1); }
            to { transform: scaleX(0); }
        }

        #edge-note-taker-toast-container .toast.persistent .toast-progress { display: none; }

        #edge-note-taker-toast-container .toast.toast-exit {
            opacity: 0;
            transform: translateX(100%);
            transition: opacity 0.25s ease, transform 0.25s ease;
        }
    `;
    document.documentElement.appendChild(style);
}

function ensureToastContainer() {
    ensureUnifiedToastSupport();
    let container = document.getElementById('edge-note-taker-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'edge-note-taker-toast-container';
        container.className = 'toast-container';
        document.documentElement.appendChild(container);
    } else if (!container.classList.contains('toast-container')) {
        container.classList.add('toast-container');
    }
    return container;
}

function showUnifiedToast(type, title, message, options = {}) {
    const safeType = ['success', 'error', 'warning', 'info', 'focus', 'achievement', 'streak', 'break'].includes(type)
        ? type
        : 'info';

    const container = ensureToastContainer();

    // Keep content toasts non-spammy (one at a time)
    container.querySelectorAll('.toast').forEach(t => t.remove());

    const iconTextByType = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ',
        focus: '🎯',
        break: '☕',
        achievement: '🏆',
        streak: '🔥'
    };

    const duration = typeof options.duration === 'number'
        ? options.duration
        : (safeType === 'error' ? 5000 : 3000);

    const toast = document.createElement('div');
    toast.className = `toast ${safeType} ${options.persistent ? 'persistent' : ''}`;

    const iconText = typeof options.iconText === 'string'
        ? options.iconText
        : (iconTextByType[safeType] || iconTextByType.info);

    toast.innerHTML = `
        <div class="toast-icon">${iconText}</div>
        <div class="toast-content">
            <div class="toast-title"></div>
            ${message ? `<div class="toast-message"></div>` : ''}
        </div>
        ${Array.isArray(options.actions) && options.actions.length ? `
            <div class="toast-actions">
                ${options.actions.map((action, i) => `
                    <button class="toast-btn ${action.primary ? 'primary' : ''}" data-action-index="${i}">
                        ${String(action.label || 'Action')}
                    </button>
                `).join('')}
            </div>
        ` : ''}
        <button class="toast-close" type="button" data-close-toast>×</button>
        ${options.persistent ? '' : `<div class="toast-progress" style="animation-duration: ${duration}ms"></div>`}
    `;

    toast.querySelector('.toast-title').textContent = String(title || '');
    if (message) {
        const msgEl = toast.querySelector('.toast-message');
        if (msgEl) msgEl.textContent = String(message || '');
    }

    container.appendChild(toast);

    const removeToast = () => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 260);
    };

    toast.querySelector('[data-close-toast]')?.addEventListener('click', removeToast);

    if (Array.isArray(options.actions) && options.actions.length) {
        toast.querySelectorAll('[data-action-index]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-action-index'), 10);
                const action = options.actions[idx];
                if (action && typeof action.callback === 'function') {
                    try { action.callback(); } catch (_) { }
                }
                removeToast();
            });
        });
    }

    if (!options.persistent) {
        setTimeout(removeToast, duration);
    }

    return toast;
}

// Back-compat for existing callers: showToast(message, type)
function showToast(message, type = 'success') {
    return showUnifiedToast(type, String(message || ''), '', { duration: 3000 });
}

// Task Reminder Banner
function showTaskReminderBanner(taskCount, message) {
    console.log('[Content] showTaskReminderBanner called:', { taskCount, message });

    // Remove any legacy banners if present
    document.getElementById('edge-note-taker-reminder')?.remove();
    document.getElementById('edge-note-taker-focus-complete')?.remove();

    const isUrgent = message.includes('NOW') || message.includes('🚨');
    const isWarning = message.includes('⚠️');
    const type = isUrgent ? 'error' : (isWarning ? 'warning' : 'info');
    const title = isUrgent ? 'Task Due NOW!' : 'Task Reminder';
    const cleanMessage = String(message || '').replace(/^[🚨⚠️📋]\s*/, '').trim();

    showUnifiedToast(type, title, cleanMessage, {
        duration: 15000,
        iconText: isUrgent ? '🚨' : (isWarning ? '⚠️' : '📋'),
        actions: [
            {
                label: 'View Tasks',
                primary: true,
                callback: () => chrome.runtime.sendMessage({ action: 'openProductivityHub' })
            },
            {
                label: 'Dismiss',
                callback: () => { }
            }
        ]
    });
}

// Focus Complete Banner (shown when focus session ends)
function showFocusCompleteBanner(message, playSound = true) {
    console.log('[Content] showFocusCompleteBanner called:', { message, playSound });

    document.getElementById('edge-note-taker-focus-complete')?.remove();
    document.getElementById('edge-note-taker-reminder')?.remove();

    hideFocusOverlay();
    if (playSound) playFocusCompleteSound();

    showUnifiedToast('success', 'Focus Session Complete!', String(message || ''), {
        duration: 8000,
        iconText: '🎉'
    });
}

// Play focus complete celebration sound
function playFocusCompleteSound() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    // If the page hasn't seen a gesture, do not create AudioContext (avoids console errors).
    if (!__edgeNoteTakerUserGestureSeen) {
        __edgeNoteTakerPendingChimeUntil = Date.now() + 10_000;
        const onGesture = () => {
            if (Date.now() <= __edgeNoteTakerPendingChimeUntil) {
                try {
                    playFocusCompleteSound();
                } catch (e) {
                    // ignore
                }
            }
            window.removeEventListener('pointerdown', onGesture, true);
            window.removeEventListener('keydown', onGesture, true);
            window.removeEventListener('mousedown', onGesture, true);
            window.removeEventListener('touchstart', onGesture, true);
        };
        window.addEventListener('pointerdown', onGesture, { capture: true, passive: true, once: true });
        window.addEventListener('keydown', onGesture, { capture: true, passive: true, once: true });
        window.addEventListener('mousedown', onGesture, { capture: true, passive: true, once: true });
        window.addEventListener('touchstart', onGesture, { capture: true, passive: true, once: true });
        return;
    }

    try {
        const audioContext = new AudioContextCtor();

        const startChime = () => {
            const now = audioContext.currentTime;

            // Create a pleasant completion chime
            const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            const durations = [0.15, 0.15, 0.15, 0.3];
            let startTime = now;

            frequencies.forEach((freq, i) => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(freq, startTime);

                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + durations[i] + 0.1);

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.start(startTime);
                oscillator.stop(startTime + durations[i] + 0.15);

                startTime += durations[i];
            });

            // Close context to avoid piling up contexts on some sites.
            setTimeout(() => {
                try { audioContext.close?.(); } catch (e) { }
            }, 1500);
        };

        if (audioContext.state === 'suspended') {
            Promise.resolve(audioContext.resume())
                .then(startChime)
                .catch(() => {
                    try { audioContext.close?.(); } catch (e) { }
                });
        } else {
            startChime();
        }
    } catch (e) {
        // ignore: sites can still block audio APIs
    }
}

// Note: Text selection icon (edge-note-taker-icon) has been removed.
// Users can use the right-click context menu to add text or capture selections.

function removeIcon() {
    if (iconContainer) {
        iconContainer.remove();
        iconContainer = null;
    }
}

function highlightSelection() {
    try {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const span = document.createElement('span');
        span.style.backgroundColor = 'yellow';
        span.style.color = 'black';

        range.surroundContents(span);
        selection.removeAllRanges();
        removeIcon();
    } catch (e) {
        console.error('Highlight failed (likely due to complex selection or PDF):', e);
        alert('Cannot highlight this selection directly. Try adding it as a note instead.');
    }
}

function captureSelection(rect) {
    // Send coordinates to background script to capture visible tab and crop
    chrome.runtime.sendMessage({
        action: 'capture_selection',
        area: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            devicePixelRatio: window.devicePixelRatio
        }
    }, (response) => {
        if (response && response.status === 'success') {
            saveNote(response.imageData, 'image');
        }
    });
}

function saveNote(content, type) {
    chrome.storage.local.get(['notebooks', 'currentNotebook'], (result) => {
        const notebooks = result.notebooks || { 'default': [] };
        const current = result.currentNotebook || 'default';

        if (!notebooks[current]) notebooks[current] = [];

        notebooks[current].push({
            type: type, // 'text' or 'image'
            content: content,
            url: window.location.href,
            date: new Date().toISOString()
        });

        chrome.storage.local.set({ notebooks: notebooks }, () => {
            // Show toast notification
            showToast('Note saved successfully!', 'success');
        });
    });
}

// Show edit modal for context menu actions
function showEditModal(initialText, x, y) {
    const modal = document.createElement('div');
    Object.assign(modal.style, {
        position: 'fixed',
        left: '50%',
        top: '50%',
        zIndex: '1000000',
        backgroundColor: '#1e1e1e',
        padding: '15px',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        width: '350px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        transform: 'translate(-50%, -50%)',
        fontFamily: 'Segoe UI, sans-serif',
        border: '1px solid #333'
    });

    const title = document.createElement('div');
    title.textContent = 'Add Note';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '5px';
    title.style.color = '#e0e0e0';
    title.style.fontSize = '14px';

    const textarea = document.createElement('textarea');
    textarea.value = initialText;
    Object.assign(textarea.style, {
        width: '100%',
        height: '100px',
        padding: '8px',
        border: '1px solid #444',
        borderRadius: '4px',
        resize: 'vertical',
        fontFamily: 'inherit',
        fontSize: '14px',
        boxSizing: 'border-box',
        backgroundColor: '#2d2d2d',
        color: '#e0e0e0'
    });

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.justifyContent = 'flex-end';
    btnContainer.style.gap = '8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    Object.assign(cancelBtn.style, {
        padding: '6px 12px',
        border: '1px solid #444',
        background: '#2d2d2d',
        color: '#e0e0e0',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '13px'
    });
    cancelBtn.onclick = () => modal.remove();

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Add to Notebook';
    Object.assign(saveBtn.style, {
        padding: '6px 12px',
        border: 'none',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: '500'
    });
    saveBtn.onclick = () => {
        saveNote(textarea.value, 'text');
        modal.remove();
    };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(saveBtn);

    modal.appendChild(title);
    modal.appendChild(textarea);
    modal.appendChild(btnContainer);

    document.body.appendChild(modal);

    // Focus textarea
    setTimeout(() => textarea.focus(), 0);

    // Close on click outside
    const closeHandler = (e) => {
        if (!modal.contains(e.target)) {
            modal.remove();
            document.removeEventListener('mousedown', closeHandler);
        }
    };
    // Delay adding listener to avoid immediate close from the click that opened it
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 100);
}

// Get PDF information for bookmarking in native viewer
function getPdfInfo() {
    const url = window.location.href;

    // Check if URL is a PDF file
    const isPdfUrl = url.toLowerCase().endsWith('.pdf') || url.includes('.pdf?') || url.includes('.pdf#');

    // Check for PDF embed
    const pdfEmbed = document.querySelector('embed[type="application/pdf"]');

    if (!isPdfUrl && !pdfEmbed) {
        return { isPdf: false };
    }

    // Extract page number from hash
    let page = 1;
    const hashMatch = url.match(/#page=(\d+)/);
    if (hashMatch) {
        page = parseInt(hashMatch[1]);
    }

    // Get PDF URL (either from embed src or current URL)
    let pdfUrl = url;
    if (pdfEmbed && pdfEmbed.src) {
        pdfUrl = pdfEmbed.src;
    }

    // Extract title from URL (filename without extension)
    let title = document.title || 'PDF Document';
    if (!document.title || document.title === '') {
        const urlParts = pdfUrl.split('/');
        const filename = urlParts[urlParts.length - 1].split('#')[0].split('?')[0];
        title = filename.replace('.pdf', '');
    }

    return {
        isPdf: true,
        url: pdfUrl.split('#')[0].split('?native_view')[0], // Remove hash and native_view param
        page: page,
        title: title,
        scrollY: window.scrollY || 0
    };
}

})();
