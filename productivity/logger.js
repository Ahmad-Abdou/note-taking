/**
 * ============================================================================
 * PRODUCTION LOGGING UTILITY
 * ============================================================================
 * 
 * A simple logging utility that can be toggled between production and debug modes.
 * In production mode, only errors and warnings are logged.
 * In debug mode, all logs including info and debug messages are shown.
 * 
 * Usage:
 *   AppLogger.debug('Debug message');
 *   AppLogger.info('Info message');
 *   AppLogger.warn('Warning message');
 *   AppLogger.error('Error message', errorObj);
 */

const AppLogger = (function () {
    // Default to production mode (less verbose)
    let isDebugMode = false;

    // Check localStorage for debug mode setting
    try {
        isDebugMode = localStorage.getItem('appDebugMode') === 'true';
    } catch (e) {
        // localStorage not available
    }

    return {
        /**
         * Enable or disable debug mode
         */
        setDebugMode(enabled) {
            isDebugMode = enabled;
            try {
                localStorage.setItem('appDebugMode', enabled ? 'true' : 'false');
            } catch (e) {
                // localStorage not available
            }
        },

        /**
         * Check if debug mode is enabled
         */
        isDebug() {
            return isDebugMode;
        },

        /**
         * Log debug messages (only in debug mode)
         */
        debug(...args) {
            if (isDebugMode) {
            }
        },

        /**
         * Log info messages (only in debug mode)
         */
        info(...args) {
            if (isDebugMode) {
                console.info('[INFO]', ...args);
            }
        },

        /**
         * Log warnings (always shown)
         */
        warn(...args) {
            console.warn('[WARN]', ...args);
        },

        /**
         * Log errors (always shown)
         */
        error(...args) {
            console.error('[ERROR]', ...args);
        },

        /**
         * Log with custom level
         */
        log(level, ...args) {
            switch (level) {
                case 'debug':
                    this.debug(...args);
                    break;
                case 'info':
                    this.info(...args);
                    break;
                case 'warn':
                    this.warn(...args);
                    break;
                case 'error':
                    this.error(...args);
                    break;
                default:
                    if (isDebugMode) {
                    }
            }
        },

        /**
         * Group logs (only in debug mode)
         */
        group(label) {
            if (isDebugMode) {
                console.group(label);
            }
        },

        /**
         * End log group
         */
        groupEnd() {
            if (isDebugMode) {
                console.groupEnd();
            }
        },

        /**
         * Log time (only in debug mode)
         */
        time(label) {
            if (isDebugMode) {
                console.time(label);
            }
        },

        /**
         * End log time
         */
        timeEnd(label) {
            if (isDebugMode) {
                console.timeEnd(label);
            }
        }
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.AppLogger = AppLogger;
}
