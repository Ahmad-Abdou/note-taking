// Highlight Management System

let highlights = [];
let hasUnsavedChanges = false;

// Expose state for other modules
window.hasUnsavedChanges = false;

// Create highlightManager object for external access
window.highlightManager = {
    get highlights() { return highlights; },
    updateHighlightColor: function (id, color) { return window.updateHighlightColor(id, color); },
    saveHighlights: function () { autoSaveHighlights(); }
};

// Helper function to convert hex color to rgba
function hexToRgba(hex, alpha = 1) {
    // Remove # if present
    hex = hex.replace('#', '');

    // Handle shorthand hex (e.g., #FFF)
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Check if a rect overlaps with any existing highlight rects
function rectsOverlap(rect1, rect2, tolerance = 5) {
    return !(rect1.left > rect2.left + rect2.width + tolerance ||
        rect1.left + rect1.width < rect2.left - tolerance ||
        rect1.top > rect2.top + rect2.height + tolerance ||
        rect1.top + rect1.height < rect2.top - tolerance);
}

// Merge overlapping rectangles to prevent duplicate highlights
function mergeOverlappingRects(rects) {
    if (!rects || rects.length <= 1) return rects;

    // Sort by top then left
    const sorted = [...rects].sort((a, b) => {
        if (Math.abs(a.top - b.top) < 3) return a.left - b.left;
        return a.top - b.top;
    });

    const merged = [];
    let current = { ...sorted[0] };

    for (let i = 1; i < sorted.length; i++) {
        const rect = sorted[i];

        // Check if rects are on the same line (similar top position)
        const sameLine = Math.abs(current.top - rect.top) < 5;

        // Check if rects overlap or are adjacent horizontally
        const overlapsHorizontally = rect.left <= current.left + current.width + 2;

        if (sameLine && overlapsHorizontally) {
            // Merge the rectangles
            const newRight = Math.max(current.left + current.width, rect.left + rect.width);
            const newBottom = Math.max(current.top + current.height, rect.top + rect.height);
            current.width = newRight - current.left;
            current.height = Math.max(current.height, rect.height, newBottom - current.top);
            // Keep the minimum top
            current.top = Math.min(current.top, rect.top);
        } else {
            // No overlap, push current and start new
            merged.push(current);
            current = { ...rect };
        }
    }
    merged.push(current);

    return merged;
}

// Filter out rects that are too large (likely full page selections by mistake)
function filterValidRects(rects, pageElement) {
    if (!rects || rects.length === 0) return rects;

    // Get page dimensions
    const pageRect = pageElement?.getBoundingClientRect();
    const pageWidth = pageRect?.width || 800;
    const pageHeight = pageRect?.height || 1000;

    const filtered = rects.filter(rect => {
        // Filter out rects that span almost the entire page width AND height
        const isFullPage = rect.width > pageWidth * 0.9 && rect.height > pageHeight * 0.3;
        // Filter out rects that are too tall (likely spanning multiple lines incorrectly)
        // Increased from 40 to 80 to allow for larger fonts and line spacing
        const isTooTall = rect.height > 80;
        // Filter out tiny rects
        const isTooSmall = rect.width < 2 || rect.height < 2;

        return !isFullPage && !isTooTall && !isTooSmall;
    });

    // If filtering removed everything, return original rects with only basic size filter
    if (filtered.length === 0 && rects.length > 0) {
        return rects.filter(r => r.width >= 2 && r.height >= 2);
    }

    return filtered;
}

// Check if selection overlaps with existing highlights on the same page
function isAlreadyHighlighted(rects, pageNumber) {
    const pageHighlights = highlights.filter(h => h.page === pageNumber);

    for (const highlight of pageHighlights) {
        for (const existingRect of highlight.rects) {
            for (const newRect of rects) {
                if (rectsOverlap(existingRect, newRect)) {
                    return highlight; // Return the existing highlight
                }
            }
        }
    }
    return null;
}

// Check if text is already highlighted (by text content and page)
function isTextAlreadyHighlighted(text, pageNumber) {
    return highlights.find(h =>
        h.page === pageNumber &&
        h.text.trim().toLowerCase() === text.trim().toLowerCase()
    );
}

// Get storage key for current PDF
function getHighlightStorageKey() {
    // Use currentPdfUrl from viewer_utils.js or our own initialization
    const url = (typeof currentPdfUrl !== 'undefined' ? currentPdfUrl : null) ||
        window.currentPdfUrl ||
        new URLSearchParams(window.location.search).get('file') ||
        window.location.href;
    return `pdf_highlights_${encodeURIComponent(url)}`;
}

// Update a highlight's color
window.updateHighlightColor = function (highlightId, newColor) {
    const highlight = highlights.find(h => h.id === highlightId);
    if (!highlight) {
        return false;
    }

    // Update the stored highlight
    highlight.color = newColor;

    // Update DOM elements
    const elements = document.querySelectorAll(`[data-highlight-id="${highlightId}"]`);
    elements.forEach(el => {
        el.style.backgroundColor = hexToRgba(newColor, 0.35);
    });

    // Save changes
    autoSaveHighlights();
    return true;
};

// Auto-save highlights to storage (silent, no alert)
function autoSaveHighlights() {
    const key = getHighlightStorageKey();
    chrome.storage.local.set({ [key]: highlights }, () => {
        hasUnsavedChanges = false;
        window.hasUnsavedChanges = false;
    });
}

// Save highlights to storage (with confirmation)
window.saveHighlights = function () {
    const key = getHighlightStorageKey();
    chrome.storage.local.set({ [key]: highlights }, () => {
        hasUnsavedChanges = false;
        window.hasUnsavedChanges = false;
        alert('Highlights and comments saved successfully!');
    });
};

// Load highlights from storage
function loadHighlights() {
    const key = getHighlightStorageKey();

    chrome.storage.local.get([key], (result) => {
        let rawHighlights = result[key] || [];

        // Auto-cleanup: Filter out corrupt highlights
        // For percentage-based highlights, check if percentages are valid (0-100 range with some tolerance)
        // For legacy pixel-based highlights, check for insane values
        const cleanHighlights = rawHighlights.filter(h => {
            if (!h.rects || h.rects.length === 0) return false;

            // Check if it's a percentage-based highlight
            const hasPercentages = h.rects[0].leftPercent !== undefined;

            if (hasPercentages) {
                // Percentage-based: values should be roughly 0-100
                const isCorrupt = h.rects.some(r =>
                    r.leftPercent < -10 || r.leftPercent > 110 ||
                    r.topPercent < -10 || r.topPercent > 110
                );
                return !isCorrupt;
            } else {
                // Legacy pixel-based: check for insane values
                const isCorrupt = h.rects.some(r => r.top > 3000 || r.left > 3000 || r.top < -100 || r.left < -100);
                return !isCorrupt;
            }
        });

        highlights = cleanHighlights;
        renderAllHighlights();
    });
}

// Expose loadHighlights globally
window.loadHighlights = loadHighlights;

// Create a new highlight
// Options: { silent: boolean } - if silent is true, don't show notification
function createHighlight(source, type, comment = null, color = null, options = {}) {
    let range;
    let text;

    if (source instanceof Range) {
        range = source;
        text = range.toString().trim();
    } else if (source && source.getRangeAt && source.rangeCount > 0) {
        range = source.getRangeAt(0);
        text = source.toString().trim();
    } else {
        return null;
    }

    if (!text) {
        return null;
    }

    // Get all rects for the selection
    const clientRects = range.getClientRects();

    if (clientRects.length === 0) {
        return null;
    }

    const rects = [];

    // Find the page element
    let pageElement = range.commonAncestorContainer;
    while (pageElement && !pageElement.classList?.contains('page')) {
        pageElement = pageElement.parentElement;
    }

    if (!pageElement) {
        return null;
    }

    const pageNumber = parseInt(pageElement.getAttribute('data-page-number')) || 1;

    // Get the canvas or canvasWrapper for accurate content dimensions
    // The page element has borders, so we need the inner content area
    const canvasWrapper = pageElement.querySelector('.canvasWrapper');
    const canvas = pageElement.querySelector('canvas');
    const contentElement = canvasWrapper || canvas || pageElement;
    const contentRect = contentElement.getBoundingClientRect();

    // Ensure page has relative positioning
    const pageStyle = window.getComputedStyle(pageElement);
    if (pageStyle.position === 'static') {
        pageElement.style.position = 'relative';
    }

    // Use the rendered dimensions from the canvas/page style for consistency
    // This matches how renderHighlight calculates dimensions
    const pageWidth = canvas ? parseFloat(canvas.style.width) || contentRect.width : contentRect.width;
    const pageHeight = canvas ? parseFloat(canvas.style.height) || contentRect.height : contentRect.height;

    // Convert client rects to page-relative positions (as percentages for zoom independence)
    for (let i = 0; i < clientRects.length; i++) {
        const rect = clientRects[i];

        // Calculate relative coordinates as percentages of content dimensions
        // Use contentRect for offset to account for page borders
        const relativeRect = {
            // Store as percentages (0-100) for zoom-independent positioning
            leftPercent: ((rect.left - contentRect.left) / pageWidth) * 100,
            topPercent: ((rect.top - contentRect.top) / pageHeight) * 100,
            widthPercent: (rect.width / pageWidth) * 100,
            heightPercent: (rect.height / pageHeight) * 100,
            // Also store pixel values for backward compatibility
            left: rect.left - contentRect.left,
            top: rect.top - contentRect.top,
            width: rect.width,
            height: rect.height
        };

        rects.push(relativeRect);
    }

    // Filter out invalid rects (too large, too small, or spanning entire page)
    let filteredRects = filterValidRects(rects, pageElement);

    // If filtering removed all rects, use original but with size limits
    if (filteredRects.length === 0) {
        filteredRects = rects.filter(r => r.width >= 3 && r.height >= 3 && r.height <= 40);
    }

    // Merge overlapping rectangles to prevent duplicate highlight areas
    const mergedRects = mergeOverlappingRects(filteredRects);

    if (mergedRects.length === 0) {
        return null;
    }

    // Check if this text/area is already highlighted - TOGGLE: delete if exists
    const existingHighlight = isAlreadyHighlighted(mergedRects, pageNumber);
    if (existingHighlight) {
        // Toggle behavior: delete the existing highlight
        deleteHighlight(existingHighlight.id);
        // Clear selection
        if (source.removeAllRanges) {
            source.removeAllRanges();
        }
        // Return null to indicate highlight was removed
        return null;
    }

    // Also check by text content - TOGGLE: delete if exists
    const existingByText = isTextAlreadyHighlighted(text, pageNumber);
    if (existingByText) {
        // Toggle behavior: delete the existing highlight
        deleteHighlight(existingByText.id);
        if (source.removeAllRanges) {
            source.removeAllRanges();
        }
        return null;
    }

    // Determine highlight color - use provided color, or get from global function if available
    let highlightColor = color;
    if (!highlightColor && window.getCurrentHighlightColor) {
        highlightColor = window.getCurrentHighlightColor();
    }
    if (!highlightColor) {
        highlightColor = type === 'highlight' ? '#FFEB3B' : '#E1BEE7';
    }

    const highlight = {
        id: `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        page: pageNumber,
        text: text,
        type: type, // 'highlight' or 'comment'
        color: highlightColor,
        comment: comment,
        rects: mergedRects, // Use merged rects instead of raw rects
        timestamp: new Date().toISOString()
    };

    highlights.push(highlight);

    // Mark as unsaved and auto-save
    hasUnsavedChanges = true;
    window.hasUnsavedChanges = true;
    autoSaveHighlights();

    renderHighlight(highlight, true);

    // Clear selection if it was a Selection object
    if (source.removeAllRanges) {
        source.removeAllRanges();
    }

    return highlight;
}

// Create highlight from pre-computed rects (used when selection info is stored before dialog opens)
function createHighlightFromRects(text, rects, pageNumber, type = 'highlight', comment = null, color = null, options = {}) {
    if (!text || !rects || rects.length === 0) {
        return null;
    }

    // Get page element for filtering and dimensions
    const pageElement = document.querySelector(`.page[data-page-number="${pageNumber}"]`);
    if (!pageElement) {
        return null;
    }

    // Get page dimensions for percentage calculation
    const pageWidth = parseFloat(pageElement.style.width) || pageElement.offsetWidth;
    const pageHeight = parseFloat(pageElement.style.height) || pageElement.offsetHeight;

    // Filter out invalid rects
    let filteredRects = filterValidRects(rects, pageElement);
    if (filteredRects.length === 0) {
        filteredRects = rects.filter(r => r.width >= 3 && r.height >= 3 && r.height <= 40);
    }

    // Merge overlapping rectangles
    const mergedRects = mergeOverlappingRects(filteredRects);

    if (mergedRects.length === 0) {
        return null;
    }

    // Convert pixel-based rects to include percentage values for zoom independence
    const rectsWithPercent = mergedRects.map(rect => ({
        ...rect,
        leftPercent: (rect.left / pageWidth) * 100,
        topPercent: (rect.top / pageHeight) * 100,
        widthPercent: (rect.width / pageWidth) * 100,
        heightPercent: (rect.height / pageHeight) * 100
    }));

    // Check if this text/area is already highlighted - TOGGLE: delete if exists
    const existingHighlight = isAlreadyHighlighted(rectsWithPercent, pageNumber);
    if (existingHighlight) {
        // Toggle behavior: delete the existing highlight
        deleteHighlight(existingHighlight.id);
        return null;
    }

    // Also check by text content - TOGGLE: delete if exists
    const existingByText = isTextAlreadyHighlighted(text, pageNumber);
    if (existingByText) {
        // Toggle behavior: delete the existing highlight
        deleteHighlight(existingByText.id);
        return null;
    }

    // Determine highlight color
    let highlightColor = color;
    if (!highlightColor && window.getCurrentHighlightColor) {
        highlightColor = window.getCurrentHighlightColor();
    }
    if (!highlightColor) {
        highlightColor = type === 'highlight' ? '#FFEB3B' : '#E1BEE7';
    }

    const highlight = {
        id: `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        page: pageNumber,
        text: text,
        type: type,
        color: highlightColor,
        comment: comment,
        rects: rectsWithPercent, // Use rects with percentage values
        timestamp: new Date().toISOString()
    };

    highlights.push(highlight);

    // Mark as unsaved and auto-save
    hasUnsavedChanges = true;
    window.hasUnsavedChanges = true;
    autoSaveHighlights();

    renderHighlight(highlight, true);

    // Show notification (unless silent mode)
    if (!options.silent && window.notificationManager) {
        window.notificationManager.success('Text highlighted', 'highlight');
    }

    return highlight;
}

// Expose createHighlight globally
window.createHighlight = createHighlight;
window.createHighlightFromRects = createHighlightFromRects;

// Get all highlights (for notes feature)
window.getHighlights = function () {
    return highlights;
};

// Get a specific highlight by ID
window.getHighlightById = function (highlightId) {
    return highlights.find(h => h.id === highlightId);
};

// Add note to a highlight
window.addNoteToHighlight = function (highlightId, note) {
    const highlight = highlights.find(h => h.id === highlightId);
    if (highlight) {
        highlight.note = note;
        highlight.noteTimestamp = new Date().toISOString();
        hasUnsavedChanges = true;
        window.hasUnsavedChanges = true;
        autoSaveHighlights();
        return true;
    }
    return false;
};

// Render a single highlight
function renderHighlight(highlight, isNew = false, retryCount = 0) {
    const pageElement = document.querySelector(`.page[data-page-number="${highlight.page}"]`);
    if (!pageElement) {
        // Page not in DOM yet - will be handled by MutationObserver
        return;
    }

    // Find or create highlight container for this page
    let container = pageElement.querySelector('.highlight-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'highlight-container';
        // Insert AFTER text layer - uses mix-blend-mode multiply for visibility
        const textLayer = pageElement.querySelector('.textLayer');
        if (textLayer && textLayer.nextSibling) {
            pageElement.insertBefore(container, textLayer.nextSibling);
        } else if (textLayer) {
            textLayer.after(container);
        } else {
            pageElement.appendChild(container);
        }
    }

    // Get the canvas or canvasWrapper for accurate content dimensions
    // The page element has borders, so we need the inner content area
    const canvasWrapper = pageElement.querySelector('.canvasWrapper');
    const canvas = pageElement.querySelector('canvas');
    const contentElement = canvasWrapper || canvas || pageElement;
    const contentRect = contentElement.getBoundingClientRect();

    // Calculate page dimensions with multiple fallbacks
    // Priority: canvas.style > pageElement.style > offsetDimensions > contentRect
    let pageWidth = 0;
    let pageHeight = 0;

    if (canvas && canvas.style.width) {
        pageWidth = parseFloat(canvas.style.width);
    }
    if (!pageWidth && pageElement.style.width) {
        pageWidth = parseFloat(pageElement.style.width);
    }
    if (!pageWidth) {
        pageWidth = pageElement.offsetWidth || contentRect.width;
    }

    if (canvas && canvas.style.height) {
        pageHeight = parseFloat(canvas.style.height);
    }
    if (!pageHeight && pageElement.style.height) {
        pageHeight = parseFloat(pageElement.style.height);
    }
    if (!pageHeight) {
        pageHeight = pageElement.offsetHeight || contentRect.height;
    }

    // Retry mechanism: If dimensions are invalid, retry after a delay (max 5 retries)
    if ((pageWidth <= 0 || pageHeight <= 0) && retryCount < 5) {
        setTimeout(() => renderHighlight(highlight, isNew, retryCount + 1), 200 + (retryCount * 100));
        return;
    }

    // Skip rendering if page dimensions are still invalid after retries
    if (pageWidth <= 0 || pageHeight <= 0) return;

    // Create highlight elements for each rect
    highlight.rects.forEach((rect, index) => {
        const highlightEl = document.createElement('div');
        highlightEl.className = `pdf-highlight ${highlight.type}-type`;
        if (isNew) highlightEl.classList.add('newly-created');
        highlightEl.dataset.highlightId = highlight.id;
        highlightEl.dataset.rectIndex = index;

        // Use percentage-based positioning if available, otherwise fall back to pixel values
        if (rect.leftPercent !== undefined) {
            const left = (rect.leftPercent / 100) * pageWidth;
            const top = (rect.topPercent / 100) * pageHeight;
            const width = (rect.widthPercent / 100) * pageWidth;
            const height = (rect.heightPercent / 100) * pageHeight;

            highlightEl.style.left = `${left}px`;
            highlightEl.style.top = `${top}px`;
            highlightEl.style.width = `${width}px`;
            highlightEl.style.height = `${height}px`;
        } else {
            // Fallback for old highlights without percentage values
            highlightEl.style.left = `${rect.left}px`;
            highlightEl.style.top = `${rect.top}px`;
            highlightEl.style.width = `${rect.width}px`;
            highlightEl.style.height = `${rect.height}px`;
        }

        // Use semi-transparent background color for readable text
        // Don't use opacity on the element itself to keep delete button fully visible
        const hexColor = highlight.color || '#FFEB3B';
        const rgbaColor = hexToRgba(hexColor, 0.35);
        highlightEl.style.backgroundColor = rgbaColor;
        if (index === 0) {
            const deleteBtn = document.createElement('div');
            deleteBtn.className = 'highlight-delete-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = 'Remove highlight';

            // Inline styles for reliable visibility (bypasses CSS conflicts)
            deleteBtn.style.cssText = `
                position: absolute;
                top: -10px;
                right: -10px;
                width: 22px;
                height: 22px;
                background-color: #d32f2f;
                color: white;
                border: 2px solid white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease;
                box-shadow: 0 2px 6px rgba(0,0,0,0.4);
                z-index: 99999;
                pointer-events: auto;
            `;

            // Add hover effect to button itself
            deleteBtn.addEventListener('mouseenter', () => {
                deleteBtn.style.transform = 'scale(1.2)';
                deleteBtn.style.backgroundColor = '#b71c1c';
            });
            deleteBtn.addEventListener('mouseleave', () => {
                deleteBtn.style.transform = 'scale(1)';
                deleteBtn.style.backgroundColor = '#d32f2f';
            });

            // Show/hide on parent hover (these won't fire due to text layer, but keeping for fallback)
            highlightEl.addEventListener('mouseenter', () => {
                deleteBtn.style.opacity = '1';
                deleteBtn.style.visibility = 'visible';
            });
            highlightEl.addEventListener('mouseleave', () => {
                deleteBtn.style.opacity = '0';
                deleteBtn.style.visibility = 'hidden';
            });

            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteHighlight(highlight.id);
            });

            highlightEl.appendChild(deleteBtn);
        }

        // Add hover/click event for comments
        if (highlight.type === 'comment' && highlight.comment) {
            highlightEl.addEventListener('mouseenter', (e) => {
                if (!stickyTooltipId) {
                    // Pass the element's bounding rect for proper positioning above the text
                    const rect = highlightEl.getBoundingClientRect();
                    showCommentTooltip(highlight, rect, null, false);
                }
            });

            highlightEl.addEventListener('mouseleave', () => {
                if (!stickyTooltipId) {
                    hideCommentTooltip();
                }
            });

            // Click to make sticky
            highlightEl.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent document click from closing
                if (stickyTooltipId === highlight.id) {
                    // Toggle off if already sticky
                    stickyTooltipId = null;
                    hideCommentTooltip();
                } else {
                    stickyTooltipId = highlight.id;
                    // Pass the element's bounding rect for proper positioning above the text
                    const rect = highlightEl.getBoundingClientRect();
                    showCommentTooltip(highlight, rect, null, true);
                }
            });

        } else {
            // For regular highlights, click opens note dialog
            highlightEl.addEventListener('click', (e) => {
                // Only trigger if not clicking on buttons
                if (!e.target.classList.contains('highlight-delete-btn') &&
                    !e.target.classList.contains('highlight-note-btn')) {
                    e.stopPropagation();
                    showNoteDialog(highlight);
                }
            });
        }

        container.appendChild(highlightEl);
    });

    // Remove newly-created animation after it completes
    if (isNew) {
        setTimeout(() => {
            const els = container.querySelectorAll(`[data-highlight-id="${highlight.id}"]`);
            els.forEach(el => el.classList.remove('newly-created'));
        }, 600);
    }
}

// Show comprehensive note dialog for a highlight (same as selection dialog)
function showNoteDialog(highlight) {
    // Remove existing dialog
    const existingDialog = document.querySelector('.highlight-note-dialog');
    if (existingDialog) existingDialog.remove();

    // Load folders and settings
    chrome.storage.local.get(['noteFolders', 'noteSettings', 'globalNotes'], (result) => {
        const folders = result.noteFolders || [];
        const settings = result.noteSettings || {};
        const globalNotes = result.globalNotes || [];
        const defaultFolderId = settings.defaultFolderId || '';
        const useDefaultFolder = settings.useDefaultFolder || false;

        // Define colors for picker
        const colors = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        let selectedColor = highlight.color || '#90CAF9';

        // Find existing global note linked to this highlight
        const existingNote = globalNotes.find(n => n.highlightId === highlight.id);
        const currentFolderId = existingNote?.folderId || (useDefaultFolder ? defaultFolderId : '');
        const currentNoteContent = existingNote?.content || highlight.note || '';

        // If folder has color, use it
        if (currentFolderId) {
            const folder = folders.find(f => f.id === currentFolderId);
            if (folder?.color) {
                selectedColor = folder.color;
            }
        }

        const dialog = document.createElement('div');
        dialog.className = 'highlight-note-dialog';
        dialog.innerHTML = `
            <div class="note-dialog-content" style="width: 480px; max-width: 90vw;">
                <div class="note-dialog-header">
                    <h3>📝 ${existingNote ? 'Edit Note' : (highlight.note ? 'Edit Note' : 'Add Note')}</h3>
                    <button class="note-dialog-close">&times;</button>
                </div>
                <div class="note-dialog-highlight-text">
                    <strong>Highlighted text:</strong>
                    <p>"${escapeHtml(highlight.text.substring(0, 200))}${highlight.text.length > 200 ? '...' : ''}"</p>
                </div>
                <textarea class="note-dialog-input" placeholder="Write your note about this highlight..." style="height: 100px;">${escapeHtml(currentNoteContent)}</textarea>
                
                <!-- Folder Selection -->
                <div style="margin: 12px 0;">
                    <label style="display: block; font-size: 13px; color: #888; margin-bottom: 6px;">📁 Save to folder:</label>
                    <select id="noteFolderSelect" style="
                        width: 100%;
                        padding: 8px 12px;
                        border: 1px solid #444;
                        border-radius: 6px;
                        font-size: 14px;
                        background: #2a2a2a;
                        color: #fff;
                        cursor: pointer;
                    ">
                        <option value="">No folder (All Notes)</option>
                        ${folders.map(f => `<option value="${f.id}" data-color="${f.color || '#667eea'}" ${f.id === currentFolderId ? 'selected' : ''}>${f.name}</option>`).join('')}
                    </select>
                </div>
                
                <!-- Default Folder Setting -->
                <div style="margin: 12px 0; display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="setDefaultFolder" ${useDefaultFolder ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">
                    <label for="setDefaultFolder" style="font-size: 13px; color: #888; cursor: pointer;">Always use selected folder as default</label>
                </div>
                
                <!-- Highlight Color -->
                <div style="margin: 12px 0;">
                    <label style="display: block; font-size: 13px; color: #888; margin-bottom: 6px;">🎨 Highlight color:</label>
                    <div id="colorPicker" style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${colors.map(c => `
                            <div class="color-opt" data-color="${c}" style="
                                width: 28px;
                                height: 28px;
                                border-radius: 50%;
                                background: ${c};
                                cursor: pointer;
                                border: 2px solid ${c === selectedColor ? '#fff' : 'transparent'};
                                transition: all 0.2s;
                            "></div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="note-dialog-actions">
                    <button class="note-dialog-cancel">Cancel</button>
                    <button class="note-dialog-save" style="background: #4CAF50;">Save Note</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        const textarea = dialog.querySelector('.note-dialog-input');
        textarea.focus();

        // Color picker handler
        const colorPicker = dialog.querySelector('#colorPicker');
        colorPicker.querySelectorAll('.color-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                colorPicker.querySelectorAll('.color-opt').forEach(o => o.style.border = '2px solid transparent');
                opt.style.border = '2px solid #fff';
                selectedColor = opt.dataset.color;
            });
        });

        // Folder selection changes color
        const folderSelect = dialog.querySelector('#noteFolderSelect');
        folderSelect.addEventListener('change', () => {
            const selectedOption = folderSelect.options[folderSelect.selectedIndex];
            if (selectedOption.dataset.color) {
                selectedColor = selectedOption.dataset.color;
                // Update color picker UI
                colorPicker.querySelectorAll('.color-opt').forEach(o => {
                    o.style.border = o.dataset.color === selectedColor ? '2px solid #fff' : '2px solid transparent';
                });
            }
        });

        // Event listeners
        dialog.querySelector('.note-dialog-close').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.note-dialog-cancel').addEventListener('click', () => dialog.remove());

        dialog.querySelector('.note-dialog-save').addEventListener('click', async () => {
            const noteText = textarea.value.trim();
            const folderId = folderSelect.value || null;
            const setAsDefault = dialog.querySelector('#setDefaultFolder').checked;

            // Save default folder preference
            chrome.storage.local.set({
                noteSettings: {
                    defaultFolderId: folderId || '',
                    useDefaultFolder: setAsDefault && !!folderId
                }
            });

            // Update highlight color
            highlight.color = selectedColor;

            // Update DOM elements
            document.querySelectorAll(`[data-highlight-id="${highlight.id}"]`).forEach(el => {
                el.style.backgroundColor = hexToRgba(selectedColor, 0.35);
            });

            if (noteText) {
                highlight.note = noteText;
                highlight.noteTimestamp = new Date().toISOString();
                hasUnsavedChanges = true;
                window.hasUnsavedChanges = true;

                // Update note button appearance
                document.querySelectorAll(`[data-highlight-id="${highlight.id}"] .highlight-note-btn`).forEach(btn => {
                    btn.classList.add('has-note');
                    btn.title = 'Edit note';
                });

                // Save/Update to GlobalNotesManager
                const urlParams = new URLSearchParams(window.location.search);
                const pdfUrl = urlParams.get('file') || window.location.href;
                const pdfTitle = document.title?.replace(' - PDF Viewer', '').replace('.pdf', '') || 'Unknown PDF';

                if (existingNote) {
                    // Update existing note
                    existingNote.content = noteText;
                    existingNote.folderId = folderId;
                    existingNote.color = selectedColor;
                    existingNote.updatedAt = new Date().toISOString();
                } else {
                    // Create new global note
                    const newNote = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        title: noteText.substring(0, 50) + (noteText.length > 50 ? '...' : ''),
                        content: noteText,
                        selectedText: highlight.text,
                        color: selectedColor,
                        pdfUrl: pdfUrl,
                        pdfTitle: pdfTitle,
                        page: highlight.page,
                        folderId: folderId,
                        highlightId: highlight.id,
                        isStarred: false,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    globalNotes.push(newNote);
                }

                // Save to storage
                chrome.storage.local.set({ globalNotes: globalNotes });

                // Update GlobalNotesManager if it's open
                if (window.globalNotesManager) {
                    window.globalNotesManager.notes = globalNotes;
                    if (window.globalNotesManager.isOpen) {
                        window.globalNotesManager.renderNotes();
                    }
                }

                // Show notification
                if (window.notificationManager) {
                    window.notificationManager.success(folderId ? 'Note saved to folder' : 'Note saved!', 'note');
                }
            } else {
                // Remove note
                delete highlight.note;
                delete highlight.noteTimestamp;

                document.querySelectorAll(`[data-highlight-id="${highlight.id}"] .highlight-note-btn`).forEach(btn => {
                    btn.classList.remove('has-note');
                    btn.title = 'Add note';
                });

                // Remove from global notes if exists
                if (existingNote) {
                    const idx = globalNotes.findIndex(n => n.id === existingNote.id);
                    if (idx !== -1) {
                        globalNotes.splice(idx, 1);
                        chrome.storage.local.set({ globalNotes: globalNotes });

                        if (window.globalNotesManager) {
                            window.globalNotesManager.notes = globalNotes;
                            if (window.globalNotesManager.isOpen) {
                                window.globalNotesManager.renderNotes();
                            }
                        }
                    }
                }
            }

            // Auto-save highlights
            autoSaveHighlights();
            dialog.remove();
        });

        // Click outside to close
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });

        // Escape key to close
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') dialog.remove();
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Render all highlights
function renderAllHighlights() {
    // Clear existing highlights from all pages
    document.querySelectorAll('.highlight-container').forEach(container => {
        container.remove();
    });

    // Render each highlight only if its page exists
    highlights.forEach(highlight => {
        const pageElement = document.querySelector(`.page[data-page-number="${highlight.page}"]`);
        if (pageElement) {
            renderHighlight(highlight);
        }
    });
}

// Delete a highlight
function deleteHighlight(highlightId) {
    highlights = highlights.filter(h => h.id !== highlightId);

    // Mark as unsaved and auto-save
    hasUnsavedChanges = true;
    window.hasUnsavedChanges = true;
    autoSaveHighlights();

    // Remove from DOM
    document.querySelectorAll(`[data-highlight-id="${highlightId}"]`).forEach(el => {
        el.remove();
    });

    if (stickyTooltipId === highlightId) {
        stickyTooltipId = null;
    }
    hideCommentTooltip();

    // Also delete any associated note from globalNotes
    chrome.storage.local.get(['globalNotes'], (result) => {
        const globalNotes = result.globalNotes || [];
        const noteIndex = globalNotes.findIndex(n => n.highlightId === highlightId);
        if (noteIndex !== -1) {
            globalNotes.splice(noteIndex, 1);
            chrome.storage.local.set({ globalNotes: globalNotes });

            // Update GlobalNotesManager if it's open
            if (window.globalNotesManager) {
                window.globalNotesManager.notes = globalNotes;
                if (window.globalNotesManager.isOpen) {
                    window.globalNotesManager.renderNotes();
                }
            }
        }
    });

    // Show notification
    if (window.notificationManager) {
        window.notificationManager.success('Highlight deleted', 'highlight');
    }
}

// Expose deleteHighlight globally
window.deleteHighlight = deleteHighlight;

// Expose renderAllHighlights globally for zoom handling
window.renderAllHighlights = renderAllHighlights;

// Clear all highlights
function clearAllHighlights() {
    if (confirm('Are you sure you want to delete ALL highlights and comments?')) {
        highlights = [];

        // Mark as unsaved and auto-save
        hasUnsavedChanges = true;
        window.hasUnsavedChanges = true;
        autoSaveHighlights();

        renderAllHighlights();
    }
}

// ============================================
// AUTO-INITIALIZATION
// ============================================

// Initialize the highlight system when the page loads
function initHighlightSystem() {
    // Get PDF URL from query parameters
    const params = new URLSearchParams(window.location.search);
    let url = params.get('file');

    // Handle library PDFs
    const libraryId = params.get('id');
    if (libraryId) {
        url = `library://${libraryId}`;
    }

    // Fallback to current URL
    if (!url) {
        url = window.location.href;
    }

    // Decode URL
    try {
        url = decodeURIComponent(url);
    } catch (e) {
        console.error('Error decoding URL:', e);
    }

    // Set the currentPdfUrl (used by getHighlightStorageKey)
    if (window.setCurrentPdfUrl) {
        window.setCurrentPdfUrl(url);
    } else {
        // If viewer_utils.js hasn't loaded yet, set it directly
        window.currentPdfUrl = url;
    }


    // Wait for pages to render with retries
    const loadWithRetry = (retries = 0) => {
        const pages = document.querySelectorAll('.page');
        if (pages.length === 0 && retries < 10) {
            // No pages yet, retry
            setTimeout(() => loadWithRetry(retries + 1), 300 + (retries * 100));
            return;
        }
        loadHighlights();
    };
    setTimeout(() => loadWithRetry(), 500);

    // Also watch for page additions and re-render highlights
    const viewer = document.getElementById('viewer');
    if (viewer) {
        const observer = new MutationObserver((mutations) => {
            let hasNewPages = false;
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.classList && node.classList.contains('page')) {
                        hasNewPages = true;
                    }
                });
            });
            if (hasNewPages) {
                setTimeout(() => renderAllHighlights(), 200);
            }
        });
        observer.observe(viewer, { childList: true });
    }

    // Re-render highlights when document becomes visible (tab focus)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && highlights.length > 0) {
            setTimeout(() => renderAllHighlights(), 100);
        }
    });

    // Listen for PDF.js page render complete event
    document.addEventListener('pagerendered', (e) => {
        if (e.detail && e.detail.pageNumber) {
            const pageNum = e.detail.pageNumber;
            const pageHighlights = highlights.filter(h => h.page === pageNum);
            pageHighlights.forEach(h => renderHighlight(h));
        }
    });

    // Setup hover detection for delete buttons
    setupHighlightHoverDetection();
}

// Global mousemove-based hover detection for highlights
// (CSS hover doesn't work because text layer blocks events)
let currentHoveredHighlight = null;

function setupHighlightHoverDetection() {
    document.addEventListener('mousemove', (e) => {
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // Find all highlight elements
        const highlights = document.querySelectorAll('.pdf-highlight');
        let foundHighlight = null;

        highlights.forEach(highlightEl => {
            const rect = highlightEl.getBoundingClientRect();
            // Expand detection area by 15px to include delete button area
            const padding = 15;
            if (mouseX >= rect.left - padding && mouseX <= rect.right + padding &&
                mouseY >= rect.top - padding && mouseY <= rect.bottom + padding) {
                foundHighlight = highlightEl;
            }
        });

        // Show/hide delete buttons based on hover
        if (foundHighlight !== currentHoveredHighlight) {
            // Hide previous
            if (currentHoveredHighlight) {
                const prevBtn = currentHoveredHighlight.querySelector('.highlight-delete-btn');
                if (prevBtn) {
                    prevBtn.style.opacity = '0';
                    prevBtn.style.visibility = 'hidden';
                }
            }

            // Show current
            if (foundHighlight) {
                const btn = foundHighlight.querySelector('.highlight-delete-btn');
                if (btn) {
                    btn.style.opacity = '1';
                    btn.style.visibility = 'visible';
                }
            }

            currentHoveredHighlight = foundHighlight;
        }
    });

    // Document-level click handler for delete buttons
    // (because text layer may block direct clicks on buttons)
    document.addEventListener('click', (e) => {
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // Check if click is on any visible delete button
        const buttons = document.querySelectorAll('.highlight-delete-btn');
        buttons.forEach(btn => {
            if (btn.style.visibility === 'visible' && btn.style.opacity === '1') {
                const rect = btn.getBoundingClientRect();
                if (mouseX >= rect.left && mouseX <= rect.right &&
                    mouseY >= rect.top && mouseY <= rect.bottom) {
                    const highlightEl = btn.parentElement;
                    if (highlightEl && highlightEl.dataset.highlightId) {
                        deleteHighlight(highlightEl.dataset.highlightId);
                    }
                }
            }
        });
    }, true); // Use capture phase to get event before text layer
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHighlightSystem);
} else {
    // DOM already loaded
    initHighlightSystem();
}
