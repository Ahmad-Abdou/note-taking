// Viewer Utilities

let currentPdfUrl = '';

// Expose function to update URL from viewer.js
window.setCurrentPdfUrl = function (url) {
    currentPdfUrl = url;
};

// Set PDF URL from the current URL or file
function initializePdfUrl() {
    const params = new URLSearchParams(window.location.search);
    let url = params.get('file') || window.location.href;

    // Normalize URL: decode and handle file protocol consistency
    try {
        url = decodeURIComponent(url);
        // On Windows, file paths might be case-insensitive but strings aren't. 
        // We'll lowercase the protocol and drive letter if possible, but full lowercase might be too aggressive.
        // Let's just ensure it doesn't have the viewer query params if we fell back to window.location.href
        if (url.includes('viewer.html?file=')) {
            url = new URLSearchParams(new URL(url).search).get('file');
        }
    } catch (e) {
        console.error('Error normalizing URL:', e);
    }

    window.setCurrentPdfUrl(url);

    // Fallback: Check if we have a stored lastPdfState that matches
    if (!currentPdfUrl || currentPdfUrl === 'about:blank') {
        chrome.storage.local.get(['lastPdfState'], (result) => {
            if (result.lastPdfState && result.lastPdfState.url) {
                window.setCurrentPdfUrl(result.lastPdfState.url);
            }
        });
    }
}

// Handle page navigation from hash (for bookmarks)
function handlePageNavigation() {
    const hash = window.location.hash;
    if (hash.startsWith('#page=')) {
        const pageNum = parseInt(hash.split('=')[1]);
        if (pageNum && !isNaN(pageNum)) {
            // Wait for PDF to be loaded
            const checkDoc = setInterval(() => {
                if (window.pdfDoc && window.pdfDoc.numPages >= pageNum) {
                    clearInterval(checkDoc);
                    jumpToPage(pageNum);
                }
            }, 100);

            // Stop checking after 10 seconds to avoid infinite loop
            setTimeout(() => clearInterval(checkDoc), 10000);
        }
    }
}

// Global scroll to page function (renamed to avoid conflict with viewer.js)
window.jumpToPage = function (pageNum) {
    if (!window.pdfDoc) return;
    if (pageNum < 1 || pageNum > window.pdfDoc.numPages) return;

    // Update input
    const pageNumberInput = document.getElementById('pageNumber');
    if (pageNumberInput) {
        pageNumberInput.value = pageNum;
        // This triggers the viewer's internal navigation (viewer.js listener)
        pageNumberInput.dispatchEvent(new Event('change'));
    }

    // Also try PDFViewerApplication if available (more reliable)
    if (window.PDFViewerApplication) {
        window.PDFViewerApplication.page = pageNum;
    }
};

// Re-render highlights when pages are rendered (zoom, scroll, etc.)
function setupHighlightRerendering() {
    // Watch for page rendering
    const observer = new MutationObserver((mutations) => {
        let shouldRerender = false;
        mutations.forEach(mutation => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-loaded') {
                shouldRerender = true;
            }
            mutation.addedNodes.forEach(node => {
                if (node.classList && node.classList.contains('page')) {
                    shouldRerender = true;
                }
            });
        });

        if (shouldRerender) {
            setTimeout(renderAllHighlights, 100);
        }
    });

    const viewerEl = document.getElementById('viewer');
    if (viewerEl) {
        observer.observe(viewerEl, {
            childList: true,
            subtree: true,
            attributeFilter: ['data-loaded']
        });
    }
}

// Listen for bookmark requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'NAVIGATE_TO_PAGE') {
        if (request.page) {
            jumpToPage(request.page);
        } else if (request.scrollY !== undefined) {
            window.scrollTo(0, request.scrollY);
        }
        sendResponse({ status: 'success' });
    }
});
