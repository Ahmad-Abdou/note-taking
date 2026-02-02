// Tooltip Management

let commentTooltip = null;
let stickyTooltipId = null; // ID of highlight with sticky tooltip

// Show comment tooltip above the highlighted text (Edge-style)
// highlightRect: optional bounding rect of the highlight element
// If highlightRect is provided, positions above the text. Otherwise uses x/y coordinates.
function showCommentTooltip(highlight, xOrRect, y, isSticky = false) {
    hideCommentTooltip();

    commentTooltip = document.createElement('div');
    commentTooltip.className = 'comment-tooltip';
    if (isSticky) {
        commentTooltip.classList.add('sticky');
        commentTooltip.style.border = '2px solid #9c27b0';
    }

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        return date.toLocaleString();
    };

    commentTooltip.innerHTML = `
        <div class="comment-tooltip-header">
            <span>💬 Comment</span>
            ${isSticky ? '<span style="margin-left:auto; cursor:pointer;" class="close-tooltip">×</span>' : ''}
        </div>
        <div class="comment-tooltip-comment">${highlight.comment}</div>
        ${isSticky ? `<div class="comment-tooltip-text">"${highlight.text.substring(0, 100)}${highlight.text.length > 100 ? '...' : ''}"</div>` : ''}
        ${isSticky ? `<div class="comment-tooltip-footer">
            <span>${formatDate(highlight.timestamp)}</span>
            <a href="#" class="comment-tooltip-edit" data-highlight-id="${highlight.id}">Edit</a>
        </div>` : ''}
        <div class="comment-tooltip-arrow"></div>
    `;

    document.body.appendChild(commentTooltip);

    // Position tooltip above the highlighted text
    const tooltipRect = commentTooltip.getBoundingClientRect();
    let left, top;
    let showBelow = false;

    // Check if we got a rect object or x coordinate
    if (typeof xOrRect === 'object' && xOrRect.left !== undefined) {
        // Position centered above the highlight
        left = xOrRect.left + (xOrRect.width / 2) - (tooltipRect.width / 2);
        top = xOrRect.top - tooltipRect.height - 12;

        // If no space above, show below
        if (top < 10) {
            top = xOrRect.bottom + 12;
            showBelow = true;
        }
    } else {
        // Legacy: use x/y coordinates
        left = xOrRect;
        top = y - tooltipRect.height - 15;
        if (top < 10) {
            top = y + 15;
            showBelow = true;
        }
    }

    // Keep within horizontal viewport bounds
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }

    commentTooltip.style.left = `${left}px`;
    commentTooltip.style.top = `${top}px`;

    // Update arrow position based on tooltip placement
    if (showBelow) {
        commentTooltip.classList.add('arrow-top');
    }

    // Show with animation
    setTimeout(() => commentTooltip.classList.add('show'), 10);

    // Handle close button
    const closeBtn = commentTooltip.querySelector('.close-tooltip');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            stickyTooltipId = null;
            hideCommentTooltip();
        });
    }

    // Handle edit click
    const editBtn = commentTooltip.querySelector('.comment-tooltip-edit');
    if (editBtn) {
        editBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const newComment = await showInputModal('Edit your comment:', highlight.comment);
            if (newComment !== null && newComment !== highlight.comment) {
                const h = highlights.find(h => h.id === highlight.id);
                if (h) {
                    h.comment = newComment;
                    saveHighlights();
                    hideCommentTooltip();
                    stickyTooltipId = null;
                }
            }
        });
    }
}

// Hide comment tooltip
function hideCommentTooltip() {
    if (commentTooltip) {
        commentTooltip.remove();
        commentTooltip = null;
    }
}

// Close sticky tooltip when clicking elsewhere
document.addEventListener('click', (e) => {
    if (stickyTooltipId && commentTooltip && !commentTooltip.contains(e.target)) {
        stickyTooltipId = null;
        hideCommentTooltip();
    }
});
