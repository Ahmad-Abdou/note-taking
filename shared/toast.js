/* Shared toast helper (global window.showToast) */

(function () {
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function ensureToastContainer() {
        let container = document.getElementById('toast-container');
        if (!container || !document.body.contains(container)) {
            if (container) container.remove();
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        if (!container.classList.contains('toast-container')) {
            container.classList.add('toast-container');
        }
        return container;
    }

    function getToastIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle',
            focus: 'fa-brain',
            achievement: 'fa-trophy',
            streak: 'fa-fire',
            break: 'fa-coffee'
        };
        return icons[type] || icons.info;
    }

    function safeInvokeAction(action) {
        if (!action) return;
        if (typeof action.callback === 'function') {
            action.callback();
            return;
        }

        // Back-compat: some callers pass { onClick: 'someFunction()' }
        if (typeof action.onClick === 'string' && action.onClick.trim()) {
            const m = action.onClick.trim().match(/^([a-zA-Z_$][\w$]*)\s*\(\s*\)\s*;?$/);
            if (m && typeof window[m[1]] === 'function') {
                try { window[m[1]](); } catch (_) { }
            }
        }
    }

    function showToast(type, title, message, options = {}) {
        const container = ensureToastContainer();

        const toast = document.createElement('div');
        toast.className = `toast ${type} ${options.persistent ? 'persistent' : ''}`;

        const icon = options.icon || getToastIcon(type);
        const duration = options.duration || (type === 'error' ? 5000 : 3000);

        toast.innerHTML = `
            <div class="toast-icon"><i class="fas ${icon}"></i></div>
            <div class="toast-content">
                <div class="toast-title">${escapeHtml(title || '')}</div>
                ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
            </div>
            ${Array.isArray(options.actions) && options.actions.length ? `
                <div class="toast-actions">
                    ${options.actions.map((action, i) => `
                        <button class="toast-btn ${action.primary ? 'primary' : ''}" data-action-index="${i}">
                            ${escapeHtml(action.label || 'Action')}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
            <button class="toast-close" type="button" data-close-toast>
                <i class="fas fa-times"></i>
            </button>
            ${options.persistent ? '' : `<div class="toast-progress" style="animation-duration: ${duration}ms"></div>`}
        `;

        container.appendChild(toast);

        toast.querySelector('[data-close-toast]')?.addEventListener('click', () => {
            toast.remove();
        });

        if (Array.isArray(options.actions) && options.actions.length) {
            toast.querySelectorAll('[data-action-index]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.getAttribute('data-action-index'), 10);
                    safeInvokeAction(options.actions[idx]);
                    toast.remove();
                });
            });
        }

        if (!options.persistent) {
            setTimeout(() => {
                toast.classList.add('toast-exit');
                setTimeout(() => toast.remove(), 260);
            }, duration);
        }

        return toast;
    }

    window.showToast = window.showToast || showToast;
})();
