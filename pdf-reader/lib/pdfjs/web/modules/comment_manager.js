// ============================================================================
// PDF COMMENT MANAGER - Edge/Google Docs Style Comments
// ============================================================================

let comments = [];
let activeCommentPanel = null;

// Expose for external access
window.commentManager = {
    get comments() { return comments; },
    addComment: showAddCommentDialog,
    loadComments: loadComments,
    saveComments: saveComments
};

// ============================================================================
// STORAGE
// ============================================================================

function getCommentStorageKey() {
    // Robust URL detection with multiple fallbacks (same as highlight_manager)
    const pdfUrl = (typeof currentPdfUrl !== 'undefined' ? currentPdfUrl : null) ||
        window.currentPdfUrl ||
        new URLSearchParams(window.location.search).get('file') ||
        window.location.href;
    return `pdf_comments_${encodeURIComponent(pdfUrl)}`;
}

function saveComments() {
    const key = getCommentStorageKey();
    chrome.storage.local.set({ [key]: comments }, () => {
    });
}

function loadComments() {
    const key = getCommentStorageKey();
    chrome.storage.local.get([key], (result) => {
        comments = result[key] || [];
        renderAllComments();
    });
}

// ============================================================================
// ADD COMMENT DIALOG
// ============================================================================

function showAddCommentDialog(selectedText, selectionRects, pageNumber) {
    // Store selection info before dialog opens
    const selectionInfo = {
        text: selectedText,
        rects: selectionRects,
        page: pageNumber
    };

    // Remove existing dialog
    const existing = document.querySelector('.add-comment-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.className = 'add-comment-dialog';
    dialog.innerHTML = `
        <div class="add-comment-dialog-content">
            <div class="add-comment-dialog-header">
                <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 8px;"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>Add Comment</h3>
                <button class="add-comment-dialog-close">&times;</button>
            </div>
            <div class="add-comment-dialog-body">
                <div class="add-comment-selected-text">
                    "${escapeHtml(selectedText.substring(0, 200))}${selectedText.length > 200 ? '...' : ''}"
                </div>
                <textarea placeholder="Write your comment..."></textarea>
            </div>
            <div class="add-comment-dialog-actions">
                <button class="cancel-btn">Cancel</button>
                <button class="save-btn">Add Comment</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const textarea = dialog.querySelector('textarea');
    textarea.focus();

    // Close handlers
    const closeDialog = () => dialog.remove();

    dialog.querySelector('.add-comment-dialog-close').onclick = closeDialog;
    dialog.querySelector('.cancel-btn').onclick = closeDialog;
    dialog.onclick = (e) => {
        if (e.target === dialog) closeDialog();
    };

    // Save handler
    dialog.querySelector('.save-btn').onclick = () => {
        const commentText = textarea.value.trim();
        if (!commentText) {
            textarea.focus();
            return;
        }

        createComment(selectionInfo, commentText);
        closeDialog();
    };

    // Keyboard handlers
    textarea.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            dialog.querySelector('.save-btn').click();
        }
        if (e.key === 'Escape') {
            closeDialog();
        }
    };
}

// ============================================================================
// CREATE COMMENT
// ============================================================================

function createComment(selectionInfo, commentText) {
    const { text, rects, page } = selectionInfo;

    // Get page element for dimensions
    const pageElement = document.querySelector(`.page[data-page-number="${page}"]`);
    if (!pageElement) {
        console.error('[Comments] Page element not found');
        return null;
    }

    // Use canvas for dimensions like highlight_manager does
    const canvasWrapper = pageElement.querySelector('.canvasWrapper');
    const canvas = pageElement.querySelector('canvas');
    const pageWidth = canvas ? parseFloat(canvas.style.width) || canvas.offsetWidth : pageElement.offsetWidth;
    const pageHeight = canvas ? parseFloat(canvas.style.height) || canvas.offsetHeight : pageElement.offsetHeight;

    // Filter and convert rects to percentages for zoom independence
    const rectsWithPercent = rects.filter(r => r.width >= 2 && r.height >= 2).map(rect => ({
        ...rect,
        leftPercent: (rect.left / pageWidth) * 100,
        topPercent: (rect.top / pageHeight) * 100,
        widthPercent: (rect.width / pageWidth) * 100,
        heightPercent: (rect.height / pageHeight) * 100
    }));

    const comment = {
        id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: text,
        comment: commentText,
        author: 'You',
        timestamp: new Date().toISOString(),
        page: page,
        rects: rectsWithPercent,
        resolved: false,
        replies: []
    };

    comments.push(comment);
    saveComments();
    renderComment(comment);

    // Show success notification
    if (window.notificationManager) {
        window.notificationManager.success('Comment added');
    }

    return comment;
}

// ============================================================================
// RENDER COMMENTS
// ============================================================================

function renderAllComments() {
    // Clear existing comment elements
    document.querySelectorAll('.comment-indicator, .comment-highlight, .comments-margin-container').forEach(el => el.remove());

    // Render each comment
    comments.forEach(comment => renderComment(comment));
}

function renderComment(comment) {
    const pageElement = document.querySelector(`.page[data-page-number="${comment.page}"]`);
    if (!pageElement) {
        return;
    }

    // Create dedicated comment container (separate from highlight-container to avoid CSS conflicts)
    let container = pageElement.querySelector('.comment-highlight-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'comment-highlight-container';
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9999;
            overflow: visible;
        `;
        // Append to page element
        pageElement.appendChild(container);
    }

    // Get page dimensions
    const canvas = pageElement.querySelector('canvas');
    const pageWidth = parseFloat(canvas?.style.width) || pageElement.offsetWidth;
    const pageHeight = parseFloat(canvas?.style.height) || pageElement.offsetHeight;

    // Create highlight elements for each rect
    comment.rects.forEach((rect, index) => {
        const highlightEl = document.createElement('div');
        highlightEl.className = 'pdf-highlight comment-type';
        highlightEl.dataset.commentId = comment.id;
        highlightEl.dataset.rectIndex = index;

        // Calculate positions
        let left, top, width, height;
        if (rect.leftPercent !== undefined) {
            left = (rect.leftPercent / 100) * pageWidth;
            top = (rect.topPercent / 100) * pageHeight;
            width = (rect.widthPercent / 100) * pageWidth;
            height = (rect.heightPercent / 100) * pageHeight;
        } else {
            left = rect.left;
            top = rect.top;
            width = rect.width;
            height = rect.height;
        }

        // Apply styles inline to avoid CSS conflicts
        highlightEl.style.cssText = `
            position: absolute;
            left: ${left}px;
            top: ${top}px;
            width: ${width}px;
            height: ${height}px;
            background-color: rgba(99, 102, 241, 0.25);
            border-bottom: 2px solid rgba(99, 102, 241, 0.8);
            z-index: 9999;
            pointer-events: auto;
            cursor: pointer;
        `;

        highlightEl.onclick = (e) => {
            e.stopPropagation();
            showCommentPanel(comment, highlightEl);
        };

        highlightEl.addEventListener('mouseenter', (e) => {
            const r = highlightEl.getBoundingClientRect();
            showCommentTooltip(comment, r);
        });
        highlightEl.addEventListener('mouseleave', () => {
            hideCommentTooltip();
        });

        // Append to highlight container
        container.appendChild(highlightEl);
    });

    // Create margin indicator
    createCommentIndicator(comment, pageElement, pageWidth, pageHeight);
}

function createCommentIndicator(comment, pageElement, pageWidth, pageHeight) {
    // Create or get margin container
    let marginContainer = pageElement.querySelector('.comments-margin-container');
    if (!marginContainer) {
        marginContainer = document.createElement('div');
        marginContainer.className = 'comments-margin-container';
        pageElement.appendChild(marginContainer);
    }

    // Calculate vertical position (center of first rect)
    const firstRect = comment.rects[0];
    let topPosition;
    if (firstRect.topPercent !== undefined) {
        topPosition = (firstRect.topPercent / 100) * pageHeight;
    } else {
        topPosition = firstRect.top;
    }

    // Create indicator
    const indicator = document.createElement('div');
    indicator.className = 'comment-indicator';
    indicator.dataset.commentId = comment.id;

    if (comment.resolved) {
        indicator.classList.add('resolved');
    }

    if (comment.replies && comment.replies.length > 0) {
        indicator.classList.add('has-replies');
        indicator.dataset.count = comment.replies.length + 1;
    }

    indicator.style.top = `${topPosition}px`;

    indicator.onclick = (e) => {
        e.stopPropagation();
        showCommentPanel(comment, indicator);
    };

    marginContainer.appendChild(indicator);
}

// ============================================================================
// COMMENT PANEL (EXPANDED VIEW)
// ============================================================================

function showCommentPanel(comment, anchorElement) {
    // Close any existing panel
    closeCommentPanel();

    // Highlight the associated text
    document.querySelectorAll(`[data-comment-id="${comment.id}"]`).forEach(el => {
        el.classList.add('active');
    });

    const panel = document.createElement('div');
    panel.className = 'comment-panel';
    panel.dataset.commentId = comment.id;

    const formattedDate = new Date(comment.timestamp).toLocaleString();

    panel.innerHTML = `
        <div class="comment-panel-header">
            <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 6px;"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>Comment</h4>
            <button class="comment-panel-close">&times;</button>
        </div>
        <div class="comment-panel-body">
            <div class="comment-selected-text">
                "${escapeHtml(comment.text.substring(0, 150))}${comment.text.length > 150 ? '...' : ''}"
            </div>
            <div class="comment-content">${escapeHtml(comment.comment)}</div>
            <div class="comment-meta">
                <span class="author">${escapeHtml(comment.author)}</span>
                <span class="timestamp">• ${formattedDate}</span>
            </div>
        </div>
        <div class="comment-panel-actions">
            <button class="comment-action-btn edit">✏️ Edit</button>
            <button class="comment-action-btn delete">🗑️</button>
            <button class="comment-action-btn resolve">${comment.resolved ? '↩️ Reopen' : '✓ Resolve'}</button>
        </div>
    `;

    // Position panel on the right side of the viewport, fixed position
    const rect = anchorElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Position vertically centered on the anchor, but within viewport bounds
    let top = rect.top;
    if (top + 350 > viewportHeight) {
        top = viewportHeight - 360;
    }
    if (top < 60) {
        top = 60;
    }

    panel.style.position = 'fixed';
    panel.style.right = '20px';
    panel.style.top = `${top}px`;
    panel.style.transform = 'none';

    document.body.appendChild(panel);
    activeCommentPanel = panel;

    // Event handlers
    panel.querySelector('.comment-panel-close').onclick = closeCommentPanel;

    panel.querySelector('.comment-action-btn.edit').onclick = () => {
        closeCommentPanel();
        showEditCommentDialog(comment);
    };

    panel.querySelector('.comment-action-btn.delete').onclick = () => {
        if (confirm('Delete this comment?')) {
            deleteComment(comment.id);
            closeCommentPanel();
        }
    };

    panel.querySelector('.comment-action-btn.resolve').onclick = () => {
        toggleResolveComment(comment.id);
        closeCommentPanel();
    };

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
    }, 100);
}

function handleOutsideClick(e) {
    if (activeCommentPanel && !activeCommentPanel.contains(e.target) &&
        !e.target.closest('.comment-indicator') && !e.target.closest('.comment-highlight')) {
        closeCommentPanel();
    }
}

function closeCommentPanel() {
    if (activeCommentPanel) {
        const commentId = activeCommentPanel.dataset.commentId;
        document.querySelectorAll(`[data-comment-id="${commentId}"]`).forEach(el => {
            el.classList.remove('active');
        });
        activeCommentPanel.remove();
        activeCommentPanel = null;
    }
    document.removeEventListener('click', handleOutsideClick);
}

// ============================================================================
// EDIT COMMENT
// ============================================================================

function showEditCommentDialog(comment) {
    const existing = document.querySelector('.add-comment-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.className = 'add-comment-dialog';
    dialog.innerHTML = `
        <div class="add-comment-dialog-content">
            <div class="add-comment-dialog-header">
                <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 8px;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>Edit Comment</h3>
                <button class="add-comment-dialog-close">&times;</button>
            </div>
            <div class="add-comment-dialog-body">
                <div class="add-comment-selected-text">
                    "${escapeHtml(comment.text.substring(0, 200))}${comment.text.length > 200 ? '...' : ''}"
                </div>
                <textarea>${escapeHtml(comment.comment)}</textarea>
            </div>
            <div class="add-comment-dialog-actions">
                <button class="cancel-btn">Cancel</button>
                <button class="save-btn">Save Changes</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const textarea = dialog.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const closeDialog = () => dialog.remove();

    dialog.querySelector('.add-comment-dialog-close').onclick = closeDialog;
    dialog.querySelector('.cancel-btn').onclick = closeDialog;
    dialog.onclick = (e) => {
        if (e.target === dialog) closeDialog();
    };

    dialog.querySelector('.save-btn').onclick = () => {
        const newText = textarea.value.trim();
        if (!newText) {
            textarea.focus();
            return;
        }

        updateComment(comment.id, { comment: newText });
        closeDialog();
    };

    textarea.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            dialog.querySelector('.save-btn').click();
        }
        if (e.key === 'Escape') {
            closeDialog();
        }
    };
}

// ============================================================================
// COMMENT OPERATIONS
// ============================================================================

function updateComment(commentId, updates) {
    const comment = comments.find(c => c.id === commentId);
    if (comment) {
        Object.assign(comment, updates, { updatedAt: new Date().toISOString() });
        saveComments();
        renderAllComments();

        if (window.notificationManager) {
            window.notificationManager.success('Comment updated');
        }
    }
}

function deleteComment(commentId) {
    const index = comments.findIndex(c => c.id === commentId);
    if (index > -1) {
        comments.splice(index, 1);
        saveComments();

        // Remove DOM elements
        document.querySelectorAll(`[data-comment-id="${commentId}"]`).forEach(el => el.remove());

        if (window.notificationManager) {
            window.notificationManager.success('Comment deleted');
        }
    }
}

function toggleResolveComment(commentId) {
    const comment = comments.find(c => c.id === commentId);
    if (comment) {
        comment.resolved = !comment.resolved;
        saveComments();
        renderAllComments();

        if (window.notificationManager) {
            window.notificationManager.success(comment.resolved ? 'Comment resolved' : 'Comment reopened');
        }
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// COMMENT HOVER TOOLTIP
// ============================================================================

let commentHoverTooltip = null;

function showCommentTooltip(comment, highlightRect) {
    hideCommentTooltip();

    commentHoverTooltip = document.createElement('div');
    commentHoverTooltip.className = 'comment-hover-tooltip';
    commentHoverTooltip.innerHTML = `
        <div class="comment-tooltip-content" style="margin-bottom: 6px;">${escapeHtml(comment.comment)}</div>
        <div class="comment-tooltip-meta" style="font-size: 11px; color: #94a3b8;">Click to expand</div>
        <div class="comment-tooltip-arrow" style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 8px solid #ffffff;"></div>
    `;

    // Style the tooltip
    commentHoverTooltip.style.cssText = `
        position: fixed;
        max-width: 280px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 12px 14px;
        box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        z-index: 10001;
        font-size: 13px;
        color: #1e293b;
        pointer-events: none;
    `;

    document.body.appendChild(commentHoverTooltip);

    // Position ABOVE the highlighted text (Edge-style)
    const tooltipRect = commentHoverTooltip.getBoundingClientRect();
    let left = highlightRect.left + (highlightRect.width / 2) - (tooltipRect.width / 2);
    let top = highlightRect.top - tooltipRect.height - 12;

    // Keep within viewport
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }

    // If no space above, show below
    if (top < 10) {
        top = highlightRect.bottom + 12;
        // Update arrow to point up instead of down
        const arrow = commentHoverTooltip.querySelector('.comment-tooltip-arrow');
        if (arrow) {
            arrow.style.cssText = 'position: absolute; top: -8px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 8px solid #ffffff;';
        }
    }

    commentHoverTooltip.style.left = `${left}px`;
    commentHoverTooltip.style.top = `${top}px`;
}

function hideCommentTooltip() {
    if (commentHoverTooltip) {
        commentHoverTooltip.remove();
        commentHoverTooltip = null;
    }
}

// Re-render comments on zoom change
window.addEventListener('scalechange', () => {
    setTimeout(renderAllComments, 100);
});

// Expose functions globally
window.showAddCommentDialog = showAddCommentDialog;
window.loadComments = loadComments;

// Create a reference to the local function for external access
const localRenderAllComments = renderAllComments;
window.renderAllComments = function () {
    localRenderAllComments();
};

// Initialize the comment system when the page loads
function initCommentSystem() {
    // Get PDF URL from query parameters (same logic as highlight_manager)
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

    // Set the currentPdfUrl (used by getCommentStorageKey)
    if (!window.currentPdfUrl) {
        window.currentPdfUrl = url;
    }

    // Wait a bit for pages to render, then load comments
    setTimeout(() => {
        loadComments();
    }, 600);

    // Also watch for page additions and re-render comments
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
                setTimeout(() => renderAllComments(), 200);
            }
        });
        observer.observe(viewer, { childList: true });
    }
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommentSystem);
} else {
    // DOM already loaded
    initCommentSystem();
}
