// Custom Viewer Entry Point

// ============ NOTIFICATION MANAGER ============
window.notificationManager = {
    settings: {
        enabled: true,
        features: {
            bookmark: true,
            highlight: true,
            notes: true,
            vocabulary: true,
            examination: true,
            citation: true,
            export: true,
            general: true
        }
    },

    init() {
        // Load notification settings
        chrome.storage.local.get(['notificationSettings'], (result) => {
            if (result.notificationSettings) {
                this.settings = { ...this.settings, ...result.notificationSettings };
            }
        });
    },

    saveSettings() {
        chrome.storage.local.set({ notificationSettings: this.settings });
    },

    isEnabled(feature = 'general') {
        if (!this.settings.enabled) return false;
        return this.settings.features[feature] !== false;
    },

    show(message, type = 'success', feature = 'general') {
        // Check if notifications are enabled for this feature
        if (!this.isEnabled(feature)) return;

        // Remove existing notification
        const existing = document.querySelector('.viewer-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `viewer-notification notification-${type}`;

        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };

        notification.innerHTML = `
            <span class="notification-icon">${icons[type] || icons.info}</span>
            <span class="notification-message">${message}</span>
        `;

        document.body.appendChild(notification);

        // Trigger animation
        requestAnimationFrame(() => {
            notification.classList.add('visible');
        });

        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    success(message, feature = 'general') {
        this.show(message, 'success', feature);
    },

    error(message, feature = 'general') {
        this.show(message, 'error', feature);
    },

    warning(message, feature = 'general') {
        this.show(message, 'warning', feature);
    },

    info(message, feature = 'general') {
        this.show(message, 'info', feature);
    }
};

// ============ SETTINGS MANAGER ============
window.settingsManager = {
    panel: null,
    currentTheme: 'light',

    init() {
        this.panel = document.getElementById('settingsPanel');
        if (!this.panel) return;

        // Setup event listeners
        this.setupEventListeners();

        // Load settings
        this.loadSettings();

        // Register with overlay manager
        if (window.overlayManager) {
            window.overlayManager.register('settings',
                () => this.open(),
                () => this.close()
            );
        }
    },

    setupEventListeners() {
        // Settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                if (window.overlayManager) {
                    window.overlayManager.open('settings');
                } else {
                    this.toggle();
                }
            });
        }

        // Close button
        const closeBtn = this.panel.querySelector('.settings-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (window.overlayManager) {
                    window.overlayManager.close('settings');
                } else {
                    this.close();
                }
            });
        }

        // Theme buttons
        const themeOptions = document.getElementById('themeOptions');
        if (themeOptions) {
            themeOptions.querySelectorAll('.theme-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const theme = btn.dataset.theme;
                    this.applyTheme(theme);
                    this.saveTheme(theme);
                    this.updateThemeButtons(theme);
                });
            });
        }

        // Global notification toggle
        const globalToggle = document.getElementById('notif-global');
        if (globalToggle) {
            globalToggle.addEventListener('change', () => {
                const enabled = globalToggle.checked;
                const subsection = document.getElementById('notif-features');
                if (subsection) {
                    subsection.classList.toggle('disabled', !enabled);
                }
                this.updateNotificationSetting('enabled', enabled);
            });
        }

        // Feature toggles
        const features = ['bookmark', 'highlight', 'notes', 'vocabulary', 'examination', 'citation', 'export'];
        features.forEach(feature => {
            const toggle = document.getElementById(`notif-${feature}`);
            if (toggle) {
                toggle.addEventListener('change', () => {
                    this.updateNotificationSetting(`features.${feature}`, toggle.checked);
                });
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.panel.classList.contains('visible')) {
                if (window.overlayManager) {
                    window.overlayManager.close('settings');
                } else {
                    this.close();
                }
            }
        });
    },

    loadSettings() {
        // Load theme setting
        chrome.storage.local.get(['pdfViewerTheme', 'notificationSettings'], (result) => {
            // Apply saved theme
            const savedTheme = result.pdfViewerTheme || 'light';
            this.applyTheme(savedTheme);
            this.updateThemeButtons(savedTheme);

            // Load notification settings
            const settings = result.notificationSettings || window.notificationManager?.settings || {
                enabled: true,
                features: {
                    bookmark: true,
                    highlight: true,
                    notes: true,
                    vocabulary: true,
                    examination: true,
                    citation: true,
                    export: true,
                    general: true
                }
            };

            // Update global toggle
            const globalToggle = document.getElementById('notif-global');
            if (globalToggle) {
                globalToggle.checked = settings.enabled;
                const subsection = document.getElementById('notif-features');
                if (subsection) {
                    subsection.classList.toggle('disabled', !settings.enabled);
                }
            }

            // Update feature toggles
            const features = ['bookmark', 'highlight', 'notes', 'vocabulary', 'examination', 'citation', 'export'];
            features.forEach(feature => {
                const toggle = document.getElementById(`notif-${feature}`);
                if (toggle && settings.features) {
                    toggle.checked = settings.features[feature] !== false;
                }
            });
        });
    },

    applyTheme(theme) {
        this.currentTheme = theme;
        const viewerContainer = document.getElementById('viewerContainer');
        const viewer = document.getElementById('viewer');

        // Remove all theme classes
        document.body.classList.remove('theme-light', 'theme-dark', 'theme-sepia');
        if (viewerContainer) viewerContainer.classList.remove('theme-light', 'theme-dark', 'theme-sepia');
        if (viewer) viewer.classList.remove('theme-light', 'theme-dark', 'theme-sepia');

        // Add new theme class
        document.body.classList.add(`theme-${theme}`);
        if (viewerContainer) viewerContainer.classList.add(`theme-${theme}`);
        if (viewer) viewer.classList.add(`theme-${theme}`);

        // Apply CSS filter to PDF pages for visual theme effect
        const pages = document.querySelectorAll('.page');
        pages.forEach(page => {
            const canvas = page.querySelector('canvas');
            if (canvas) {
                if (theme === 'dark') {
                    canvas.style.filter = 'invert(0.85) hue-rotate(180deg)';
                } else if (theme === 'sepia') {
                    canvas.style.filter = 'sepia(0.3) brightness(0.95)';
                } else {
                    canvas.style.filter = 'none';
                }
            }
        });
    },

    updateThemeButtons(activeTheme) {
        const themeOptions = document.getElementById('themeOptions');
        if (!themeOptions) return;

        themeOptions.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === activeTheme);
        });
    },

    saveTheme(theme) {
        chrome.storage.local.set({ pdfViewerTheme: theme });
    },

    updateNotificationSetting(path, value) {
        if (window.notificationManager) {
            if (path === 'enabled') {
                window.notificationManager.settings.enabled = value;
            } else if (path.startsWith('features.')) {
                const feature = path.split('.')[1];
                window.notificationManager.settings.features[feature] = value;
            }
            window.notificationManager.saveSettings();
        }
    },

    open() {
        this.panel.classList.add('visible');
    },

    close() {
        this.panel.classList.remove('visible');
    },

    toggle() {
        this.panel.classList.toggle('visible');
    }
};

// ============ OVERLAY MANAGER - Only one overlay at a time ============
window.overlayManager = {
    currentOverlay: null,
    overlays: {},

    register(name, openFn, closeFn) {
        this.overlays[name] = { open: openFn, close: closeFn };
    },

    open(name) {
        // Close any currently open overlay
        if (this.currentOverlay && this.currentOverlay !== name) {
            this.close(this.currentOverlay);
        }

        // Open the new overlay
        if (this.overlays[name]) {
            this.overlays[name].open();
            this.currentOverlay = name;
        }
    },

    close(name) {
        if (this.overlays[name]) {
            this.overlays[name].close();
            if (this.currentOverlay === name) {
                this.currentOverlay = null;
            }
        }
    },

    closeAll() {
        if (this.currentOverlay) {
            this.close(this.currentOverlay);
        }
    }
};

// ============ GLOBAL LOADING INDICATOR ============
let globalLoadingIndicator = null;

function createGlobalLoadingIndicator() {
    if (globalLoadingIndicator) return globalLoadingIndicator;

    globalLoadingIndicator = document.createElement('div');
    globalLoadingIndicator.id = 'global-loading-indicator';
    globalLoadingIndicator.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        width: 50px;
        height: 50px;
        background: white;
        border-radius: 50%;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 9990;
        transition: opacity 0.3s, transform 0.3s;
    `;

    globalLoadingIndicator.innerHTML = `
        <div style="
            width: 28px;
            height: 28px;
            border: 3px solid #e0e0e0;
            border-top-color: #667eea;
            border-radius: 50%;
            animation: globalSpin 0.8s linear infinite;
        "></div>
    `;

    // Add animation keyframes
    if (!document.getElementById('global-loading-styles')) {
        const style = document.createElement('style');
        style.id = 'global-loading-styles';
        style.textContent = `
            @keyframes globalSpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(globalLoadingIndicator);
    return globalLoadingIndicator;
}

window.showGlobalLoading = function () {
    const indicator = createGlobalLoadingIndicator();
    indicator.style.display = 'flex';
    indicator.style.opacity = '1';
    indicator.style.transform = 'scale(1)';
};

window.hideGlobalLoading = function () {
    if (globalLoadingIndicator) {
        globalLoadingIndicator.style.opacity = '0';
        globalLoadingIndicator.style.transform = 'scale(0.8)';
        setTimeout(() => {
            globalLoadingIndicator.style.display = 'none';
        }, 300);
    }
};

// ============ DRAGGABLE WINDOWS UTILITY ============
window.makeDraggable = function (element, handleSelector) {
    const handle = handleSelector ? element.querySelector(handleSelector) : element;
    if (!handle) return;

    let isDragging = false;
    let startX, startY, initialX, initialY;

    handle.style.cursor = 'grab';

    handle.addEventListener('mousedown', (e) => {
        // Don't drag if clicking on buttons
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

        isDragging = true;
        handle.style.cursor = 'grabbing';

        startX = e.clientX;
        startY = e.clientY;

        const rect = element.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;

        // Prevent text selection while dragging
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        let newX = initialX + deltaX;
        let newY = initialY + deltaY;

        // Keep within viewport
        const rect = element.getBoundingClientRect();
        newX = Math.max(0, Math.min(newX, window.innerWidth - rect.width));
        newY = Math.max(40, Math.min(newY, window.innerHeight - rect.height)); // Keep below toolbar

        element.style.left = newX + 'px';
        element.style.top = newY + 'px';
        element.style.right = 'auto';
        element.style.bottom = 'auto';
        element.style.transform = 'none';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            handle.style.cursor = 'grab';
        }
    });
};

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Create global loading indicator
    createGlobalLoadingIndicator();

    // Initialize notification manager
    if (window.notificationManager) {
        window.notificationManager.init();
    }

    // Initialize settings manager
    if (window.settingsManager) {
        window.settingsManager.init();
    }

    initializePdfUrl();
    handlePageNavigation();
    injectAnnotationTools();
    injectSidebarToggle(); // Initialize Sidebar Panel
    setupTextSelectionListener();
    setupHighlightRerendering();
    initImmersiveReader();
    initToolbarActions(); // Initialize bookmark and native viewer buttons

    // Load highlights after a short delay to ensure PDF is loaded
    setTimeout(() => {
        loadHighlights();
    }, 1000);

    // Check if vocabulary builder should be opened from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('openVocabulary') === 'true') {
        // Open vocabulary builder after a short delay to ensure it's loaded
        setTimeout(() => {
            if (window.vocabularyBuilder) {
                window.vocabularyBuilder.open();
            }
        }, 500);
    }

    // Make vocabulary modal draggable after it's created
    setTimeout(() => {
        const vocabModal = document.querySelector('.vocabulary-content');
        if (vocabModal) {
            window.makeDraggable(vocabModal, '.vocab-header');
        }
    }, 1000);

    // Note: Zoom handling is done in viewer.js reRenderAll() function
    // which calls window.renderAllHighlights() after page re-renders

    // Save Button Listener
    const saveBtn = document.getElementById('saveHighlightsBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (window.saveHighlights) {
                window.saveHighlights();
            } else {
                alert('Save function not ready yet.');
            }
        });
    }

    // Unsaved changes prompt
    window.addEventListener('beforeunload', (e) => {
        if (window.hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = ''; // Standard for Chrome
        }
    });
});

// Listen for messages from sidebar
window.addEventListener('message', (event) => {
    if (event.data.type === 'SCROLL_TO_HIGHLIGHT') {
        const { page, highlightId } = event.data;
        if (page) {
            // Use PDF.js API to scroll to page if available
            if (window.PDFViewerApplication && window.PDFViewerApplication.pdfViewer) {
                window.PDFViewerApplication.page = page;
            } else {
                // Fallback: use page number input
                const pageInput = document.getElementById('pageNumber');
                if (pageInput) {
                    pageInput.value = page;
                    pageInput.dispatchEvent(new Event('change'));
                }
            }

            // Function to find and highlight the element with retry
            const findAndHighlightElement = (retries = 0) => {
                // First try to find by highlightId
                if (highlightId) {
                    const highlightEl = document.querySelector(`[data-highlight-id="${highlightId}"]`);
                    if (highlightEl) {
                        highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        highlightEl.style.boxShadow = '0 0 15px 8px rgba(255, 235, 59, 0.9)';
                        highlightEl.style.transition = 'box-shadow 0.3s ease';
                        setTimeout(() => {
                            highlightEl.style.boxShadow = '';
                        }, 2500);
                        return;
                    }
                }

                // If no highlight found and we have retries left, try again
                if (retries < 5) {
                    setTimeout(() => findAndHighlightElement(retries + 1), 300);
                } else {
                    // Fallback: just scroll to page element
                    const pageEl = document.querySelector(`.page[data-page-number="${page}"]`);
                    if (pageEl) {
                        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            };

            // Start looking for the highlight after a short delay for page render
            setTimeout(() => findAndHighlightElement(0), 200);
        }
    } else if (event.data.type === 'DELETE_HIGHLIGHT') {
        const { highlightId } = event.data;
        if (highlightId) {
            deleteHighlight(highlightId);
        }
    }
});

// ============ LINE FOCUS (IMMERSIVE READER) ============
let lineFocusActive = false;
let focusLinePosition = 50; // percentage from top
let focusLineHeight = 80; // pixels
let focusBlurAmount = 3; // pixels
let focusShadeOpacity = 70; // percentage

function initImmersiveReader() {
    const btn = document.getElementById('immersiveReader');
    const overlay = document.getElementById('lineFocusOverlay');
    const control = document.getElementById('lineFocusControl');
    const closeBtn = document.getElementById('lineFocusClose');

    // New controls
    const linesSlider = document.getElementById('lineFocusLines');
    const linesValue = document.getElementById('lineFocusLinesValue');
    const blurSlider = document.getElementById('lineFocusBlur');
    const blurValue = document.getElementById('lineFocusBlurValue');
    const shadeSlider = document.getElementById('lineFocusShade');
    const shadeValue = document.getElementById('lineFocusShadeValue');

    if (!btn || !overlay || !control) return;

    // Toggle line focus mode
    btn.addEventListener('click', () => {
        lineFocusActive = !lineFocusActive;

        if (lineFocusActive) {
            overlay.classList.remove('hidden');
            control.classList.remove('hidden');
            btn.classList.add('active');
            updateLineFocusPosition();
            document.addEventListener('mousemove', handleLineFocusMove);
            document.addEventListener('wheel', handleLineFocusWheel, { passive: false });
        } else {
            deactivateLineFocus();
        }
    });

    // Close button
    closeBtn.addEventListener('click', () => {
        lineFocusActive = false;
        deactivateLineFocus();
    });

    // Lines slider - controls how many lines visible (height)
    if (linesSlider) {
        linesSlider.addEventListener('input', () => {
            const lines = parseInt(linesSlider.value);
            focusLineHeight = lines * 28; // ~28px per line
            if (linesValue) linesValue.textContent = lines;
            updateLineFocusPosition();
        });
        // Initialize
        focusLineHeight = parseInt(linesSlider.value) * 28;
    }

    // Blur slider
    if (blurSlider) {
        blurSlider.addEventListener('input', () => {
            focusBlurAmount = parseInt(blurSlider.value);
            if (blurValue) blurValue.textContent = focusBlurAmount;
            updateLineFocusStyles();
        });
    }

    // Shade opacity slider
    if (shadeSlider) {
        shadeSlider.addEventListener('input', () => {
            focusShadeOpacity = parseInt(shadeSlider.value);
            if (shadeValue) shadeValue.textContent = focusShadeOpacity + '%';
            updateLineFocusStyles();
        });
    }

    // Escape key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lineFocusActive) {
            lineFocusActive = false;
            deactivateLineFocus();
        }
    });
}

function updateLineFocusStyles() {
    const overlay = document.getElementById('lineFocusOverlay');
    if (!overlay) return;

    const shadeTop = overlay.querySelector('.focus-shade-top');
    const shadeBottom = overlay.querySelector('.focus-shade-bottom');

    if (shadeTop && shadeBottom) {
        const bgColor = `rgba(0, 0, 0, ${focusShadeOpacity / 100})`;
        const blurFilter = focusBlurAmount > 0 ? `blur(${focusBlurAmount}px)` : 'none';

        shadeTop.style.backgroundColor = bgColor;
        shadeTop.style.backdropFilter = blurFilter;
        shadeTop.style.webkitBackdropFilter = blurFilter;

        shadeBottom.style.backgroundColor = bgColor;
        shadeBottom.style.backdropFilter = blurFilter;
        shadeBottom.style.webkitBackdropFilter = blurFilter;
    }
}

function handleLineFocusMove(e) {
    if (!lineFocusActive) return;

    // Use viewport-relative position directly - follows mouse instantly
    const viewerContainer = document.getElementById('viewerContainer');
    const rect = viewerContainer.getBoundingClientRect();

    // Calculate position as percentage of viewport height
    focusLinePosition = ((e.clientY - rect.top) / rect.height) * 100;
    focusLinePosition = Math.max(5, Math.min(95, focusLinePosition));

    // Update immediately
    updateLineFocusPosition();
}

function handleLineFocusWheel(e) {
    if (!lineFocusActive) return;

    // Check if we're over the viewer
    const viewerContainer = document.getElementById('viewerContainer');
    const rect = viewerContainer.getBoundingClientRect();

    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
        // Allow normal scrolling but also move the focus line
        const delta = e.deltaY > 0 ? 2 : -2;
        focusLinePosition = Math.max(5, Math.min(95, focusLinePosition + delta));
        updateLineFocusPosition();
    }
}

function updateLineFocusPosition() {
    const overlay = document.getElementById('lineFocusOverlay');
    if (!overlay) return;

    const viewerContainer = document.getElementById('viewerContainer');
    const rect = viewerContainer.getBoundingClientRect();

    // Calculate the focus line center position in viewport coordinates
    const centerY = rect.top + (focusLinePosition / 100) * rect.height;
    const halfHeight = focusLineHeight / 2;

    // Calculate positions
    const focusTop = centerY - halfHeight;
    const focusBottom = centerY + halfHeight;

    const shadeTop = overlay.querySelector('.focus-shade-top');
    const focusLine = overlay.querySelector('.focus-line');
    const shadeBottom = overlay.querySelector('.focus-shade-bottom');

    // Top shade: from top of screen to top of focus area
    shadeTop.style.top = '0';
    shadeTop.style.left = '0';
    shadeTop.style.width = '100%';
    shadeTop.style.height = `${Math.max(0, focusTop)}px`;

    // Focus line: the clear reading area
    focusLine.style.top = `${focusTop}px`;
    focusLine.style.left = `${rect.left}px`;
    focusLine.style.width = `${rect.width}px`;
    focusLine.style.height = `${focusLineHeight}px`;

    // Bottom shade: from bottom of focus area to bottom of screen
    shadeBottom.style.top = `${focusBottom}px`;
    shadeBottom.style.left = '0';
    shadeBottom.style.width = '100%';
    shadeBottom.style.height = `${Math.max(0, window.innerHeight - focusBottom)}px`;

    // Also update styles (blur, opacity)
    updateLineFocusStyles();
}

function deactivateLineFocus() {
    const overlay = document.getElementById('lineFocusOverlay');
    const control = document.getElementById('lineFocusControl');
    const btn = document.getElementById('immersiveReader');

    if (overlay) overlay.classList.add('hidden');
    if (control) control.classList.add('hidden');
    if (btn) btn.classList.remove('active');

    document.removeEventListener('mousemove', handleLineFocusMove);
    document.removeEventListener('wheel', handleLineFocusWheel);
}

// ============ QUIZ GENERATOR (DEPRECATED - Moved to examination_manager.js) ============
// The quiz functionality has been enhanced and moved to modules/examination_manager.js
// with 6 different exam types: MCQ, True/False, Fill in Blank, Matching, Short Answer, and Comprehensive
// The old initQuizGenerator function is no longer called from DOMContentLoaded

// =====================
// TOOLBAR ACTIONS (Bookmark & Native Viewer)
// =====================

function initToolbarActions() {
    const bookmarkBtn = document.getElementById('addBookmarkBtn');
    const nativeBtn = document.getElementById('switchToNativeBtn');
    const citationBtn = document.getElementById('citationBtn');
    const pdfNotesBtn = document.getElementById('pdfNotesBtn');
    const researchLibraryBtn = document.getElementById('researchLibraryBtn');

    // Add Bookmark Button
    if (bookmarkBtn) {
        bookmarkBtn.addEventListener('click', () => {
            // Get current PDF info
            const urlParams = new URLSearchParams(window.location.search);
            const pdfUrl = urlParams.get('file');
            const pageNumber = parseInt(document.getElementById('pageNumber')?.value) || 1;

            // Get PDF title
            let title = 'Untitled PDF';
            if (pdfUrl) {
                const urlParts = decodeURIComponent(pdfUrl).split('/');
                title = urlParts[urlParts.length - 1].replace('.pdf', '');
            }

            // Save bookmark
            chrome.storage.local.get(['bookmarks'], (result) => {
                const bookmarks = result.bookmarks || [];
                const newBookmark = {
                    id: Date.now(),
                    title: title,
                    url: pdfUrl || window.location.href,
                    page: pageNumber,
                    scrollY: 0,
                    date: new Date().toISOString()
                };

                bookmarks.push(newBookmark);
                chrome.storage.local.set({ bookmarks: bookmarks }, () => {
                    // Show success feedback
                    bookmarkBtn.classList.add('active');
                    bookmarkBtn.title = 'Bookmarked!';

                    // Show notification
                    if (window.notificationManager) {
                        window.notificationManager.success(`Page ${pageNumber} bookmarked!`, 'bookmark');
                    }

                    setTimeout(() => {
                        bookmarkBtn.classList.remove('active');
                        bookmarkBtn.title = 'Bookmark This Page';
                    }, 2000);
                });
            });
        });
    }

    // Switch to Native Viewer Button
    if (nativeBtn) {
        nativeBtn.addEventListener('click', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const pdfUrl = urlParams.get('file');

            if (pdfUrl) {
                // Open in native browser viewer
                const decodedUrl = decodeURIComponent(pdfUrl);
                // Add native_view=true to prevent auto-redirect back
                const nativeUrl = decodedUrl + (decodedUrl.includes('?') ? '&' : '?') + 'native_view=true';
                window.location.href = nativeUrl;
            } else {
                alert('No PDF file loaded');
            }
        });
    }

    // Citation Button - Initialize CitationManager
    if (citationBtn && typeof CitationManager !== 'undefined') {
        window.citationManager = new CitationManager();
        citationBtn.addEventListener('click', () => {
            window.citationManager.showCitationModal();
        });
    }

    // PDF Notes Button - Initialize PDFNotesManager
    if (pdfNotesBtn && typeof PDFNotesManager !== 'undefined') {
        window.pdfNotesManager = new PDFNotesManager();
        pdfNotesBtn.addEventListener('click', () => {
            window.pdfNotesManager.togglePanel();
        });
    }

    // Research Library Button - Initialize ResearchLibraryManager
    if (researchLibraryBtn && typeof ResearchLibraryManager !== 'undefined') {
        // Only create instance if it doesn't exist
        if (!window.researchLibraryManager) {
            window.researchLibraryManager = new ResearchLibraryManager();
        }
        researchLibraryBtn.addEventListener('click', () => {
            if (window.researchLibraryManager) {
                window.researchLibraryManager.togglePanel();
            }
        });
    }
}

// ============ AUTO-SCROLL MANAGER ============
window.autoScrollManager = {
    isActive: false,
    speed: 50, // pixels per second
    animationId: null,
    lastTimestamp: null,

    init() {
        const toggle = document.getElementById('autoScrollToggle');
        const dropdown = document.getElementById('autoScrollDropdown');
        const slider = document.getElementById('scrollSpeedSlider');
        const speedValue = document.getElementById('scrollSpeedValue');
        const presetBtns = document.querySelectorAll('.speed-preset-btn');
        const viewerContainer = document.getElementById('viewerContainer');

        if (!toggle || !viewerContainer) return;

        // Load saved speed
        chrome.storage.local.get(['autoScrollSpeed'], (result) => {
            if (result.autoScrollSpeed) {
                this.speed = result.autoScrollSpeed;
                if (slider) slider.value = this.speed;
                if (speedValue) speedValue.textContent = this.speed;
                this.updatePresetActive();
            }
        });

        // Toggle dropdown on right-click
        toggle.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            dropdown?.classList.toggle('hidden');
        });

        // Toggle auto-scroll on click
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggle();
        });

        // Speed slider
        if (slider && speedValue) {
            slider.addEventListener('input', () => {
                this.speed = parseInt(slider.value);
                speedValue.textContent = this.speed;
                this.updatePresetActive();
                this.saveSpeed();
            });
        }

        // Speed presets
        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.speed = parseInt(btn.dataset.speed);
                if (slider) slider.value = this.speed;
                if (speedValue) speedValue.textContent = this.speed;
                this.updatePresetActive();
                this.saveSpeed();
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!toggle.contains(e.target) && !dropdown?.contains(e.target)) {
                dropdown?.classList.add('hidden');
            }
        });

        // Stop on manual scroll
        viewerContainer.addEventListener('wheel', () => {
            if (this.isActive) {
                this.stop();
            }
        });

        // Keyboard shortcut Alt+S
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.toggle();
            }
        });

    },

    updatePresetActive() {
        document.querySelectorAll('.speed-preset-btn').forEach(btn => {
            const presetSpeed = parseInt(btn.dataset.speed);
            btn.classList.toggle('active', presetSpeed === this.speed);
        });
    },

    saveSpeed() {
        chrome.storage.local.set({ autoScrollSpeed: this.speed });
    },

    toggle() {
        if (this.isActive) {
            this.stop();
        } else {
            this.start();
        }
    },

    start() {
        const toggle = document.getElementById('autoScrollToggle');
        const viewerContainer = document.getElementById('viewerContainer');

        if (!viewerContainer) return;

        this.isActive = true;
        this.lastTimestamp = null;
        toggle?.classList.add('active');

        const scroll = (timestamp) => {
            if (!this.isActive) return;

            if (this.lastTimestamp === null) {
                this.lastTimestamp = timestamp;
            }

            const elapsed = timestamp - this.lastTimestamp;
            this.lastTimestamp = timestamp;

            // Calculate scroll amount based on speed and elapsed time
            // Use a separate high-precision tracker if it doesn't exist to avoid floating point truncation by the DOM
            if (this.preciseScrollTop === undefined || Math.abs(this.preciseScrollTop - viewerContainer.scrollTop) > 1) {
                this.preciseScrollTop = viewerContainer.scrollTop;
            }

            const scrollAmount = (this.speed * elapsed) / 1000;
            this.preciseScrollTop += scrollAmount;

            // Check if we've reached the bottom
            const maxScroll = viewerContainer.scrollHeight - viewerContainer.clientHeight;
            if (this.preciseScrollTop >= maxScroll - 1) {
                this.stop();
                if (window.notificationManager) {
                    window.notificationManager.info('Reached end of document', 'general');
                }
                return;
            }

            viewerContainer.scrollTop = this.preciseScrollTop;
            this.animationId = requestAnimationFrame(scroll);
        };

        this.animationId = requestAnimationFrame(scroll);

        if (window.notificationManager) {
            window.notificationManager.success(`Auto-scroll started (${this.speed}px/s)`, 'general');
        }
    },

    stop() {
        const toggle = document.getElementById('autoScrollToggle');

        this.isActive = false;
        this.lastTimestamp = null;
        toggle?.classList.remove('active');

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
};

// Initialize auto-scroll when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.autoScrollManager.init();
});
