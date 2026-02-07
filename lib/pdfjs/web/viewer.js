// PDF.js is loaded globally via script tag
// import * as pdfjsLib from '../build/pdf.js';

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '../build/pdf.worker.js';

// Toast notification function for this page
function showViewerToast(message, type = 'success') {
    // Remove existing toast
    const existing = document.getElementById('edge-note-toast');
    if (existing) existing.remove();

    const colors = {
        success: { bg: '#4CAF50', icon: '✓' },
        error: { bg: '#f44336', icon: '✗' },
        warning: { bg: '#ff9800', icon: '!' },
        info: { bg: '#2196F3', icon: 'ℹ' }
    };
    const color = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.id = 'edge-note-toast';
    toast.innerHTML = `<span style="margin-right:8px;font-size:18px;">${color.icon}</span>${message}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${color.bg};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        animation: toastSlideIn 0.3s ease;
    `;

    // Add animation style if not exists
    if (!document.getElementById('toast-animation-style')) {
        const style = document.createElement('style');
        style.id = 'toast-animation-style';
        style.textContent = `
            @keyframes toastSlideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Listen for messages from popup and background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'show_toast') {
        showViewerToast(request.message, request.type);
        sendResponse({ success: true });
    } else if (request.action === 'GET_PDF_INFO') {
        // Return current PDF info for bookmarking
        const urlParams = new URLSearchParams(window.location.search);
        const libraryId = urlParams.get('id');
        const fileUrl = urlParams.get('file');

        // Determine the original URL
        let originalUrl;
        if (libraryId) {
            originalUrl = `library://${libraryId}`;
        } else if (fileUrl) {
            originalUrl = decodeURIComponent(fileUrl);
        } else {
            originalUrl = window.location.href;
        }

        sendResponse({
            isPdf: true,
            url: originalUrl,
            originalUrl: originalUrl,
            page: pageNum,
            currentPage: pageNum,
            title: document.title || 'PDF Document',
            pdfTitle: document.title || 'PDF Document',
            scrollY: viewerContainer ? viewerContainer.scrollTop : 0
        });
    }
    return true;
});

let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 2.0; // Default zoom 200%

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

function normalizeScale(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 1.0;
    return Math.min(Math.max(numeric, MIN_SCALE), MAX_SCALE);
}

// Update currentPDF in storage (for bookmarks)
function updateCurrentPdfStorage(page) {
    chrome.storage.local.get(['currentPDF'], (result) => {
        if (result.currentPDF) {
            result.currentPDF.page = page;
            result.currentPDF.scrollY = viewerContainer ? viewerContainer.scrollTop : 0;
            chrome.storage.local.set({ currentPDF: result.currentPDF });
        }
    });
}

const viewerContainer = document.getElementById('viewerContainer');
const viewer = document.getElementById('viewer');
const pageNumInput = document.getElementById('pageNumber');
const numPagesSpan = document.getElementById('numPages');
const scaleSelect = document.getElementById('scaleSelect');

function syncScaleSelectWithScale() {
    if (!scaleSelect) return;

    scale = normalizeScale(scale);
    const scalePercent = Math.round(scale * 100);

    let foundMatch = false;
    for (const option of scaleSelect.options) {
        const optionScale = parseFloat(option.value);
        if (Number.isFinite(optionScale) && Math.abs(optionScale - scale) < 1e-9) {
            scaleSelect.value = option.value;
            foundMatch = true;
            break;
        }
    }

    if (!foundMatch) {
        let customOption = scaleSelect.querySelector('option[data-custom="true"]');
        if (!customOption) {
            customOption = document.createElement('option');
            customOption.setAttribute('data-custom', 'true');
            scaleSelect.insertBefore(customOption, scaleSelect.firstChild);
        }
        customOption.value = scale.toString();
        customOption.textContent = `${scalePercent}%`;
        scaleSelect.value = customOption.value;
    } else {
        const customOption = scaleSelect.querySelector('option[data-custom="true"]');
        if (customOption) customOption.remove();
    }
}

async function computePresetScale(mode) {
    if (!pdfDoc) return 1.0;

    const targetPage = Math.min(Math.max(pageNum || 1, 1), pdfDoc.numPages || 1);
    const page = await pdfDoc.getPage(targetPage);
    const viewport = page.getViewport({ scale: 1.0 });

    // Account for page margins (10px auto) and some breathing room.
    const availableWidth = Math.max(0, viewerContainer.clientWidth - 40);
    const availableHeight = Math.max(0, viewerContainer.clientHeight - 20);

    const widthScale = availableWidth > 0 ? (availableWidth / viewport.width) : 1.0;
    const heightScale = availableHeight > 0 ? (availableHeight / viewport.height) : 1.0;

    if (mode === 'page-fit') return normalizeScale(Math.min(widthScale, heightScale));
    // Treat 'auto' as page-width for now.
    return normalizeScale(widthScale);
}

// Get PDF URL from query parameter
const urlParams = new URLSearchParams(window.location.search);
let pdfUrl = urlParams.get('file');
const librarySource = urlParams.get('source');
const libraryItemId = urlParams.get('id');

// Check if loading from library (base64 stored PDF)
if (librarySource === 'library' && libraryItemId) {
    // First check if sessionStorage has the data (from library panel click)
    if (sessionStorage.getItem('pendingPdfData')) {
        try {
            const base64Data = sessionStorage.getItem('pendingPdfData');
            const pdfTitle = sessionStorage.getItem('pendingPdfTitle') || 'PDF Document';

            // Clear the session storage
            sessionStorage.removeItem('pendingPdfData');
            sessionStorage.removeItem('pendingPdfTitle');

            // Convert base64 to Uint8Array
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Save currentPDF info for bookmarks (use library item ID as reference)
            chrome.storage.local.set({
                currentPDF: {
                    isPdf: true,
                    url: `library://${libraryItemId}`, // Special URL scheme for library items
                    libraryId: libraryItemId,
                    title: pdfTitle,
                    page: 1,
                    scrollY: 0
                }
            });

            // Load PDF from binary data
            document.title = pdfTitle;
            loadPDFFromData(bytes);
        } catch (error) {
            console.error('Error loading library PDF from session:', error);
            viewer.innerHTML = `<div style="padding: 20px; color: red;">Error loading PDF from library: ${error.message}</div>`;
        }
    } else {
        // Load from IndexedDB (bookmark case or page reload - sessionStorage not available)
        loadFromIndexedDB();

        async function loadFromIndexedDB() {
            // First check if PdfStorage is available
            if (typeof PdfStorage !== 'undefined') {
                try {
                    const pdfStorage = new PdfStorage();
                    await pdfStorage.init();

                    const pdfRecord = await pdfStorage.getPdf(libraryItemId);
                    if (pdfRecord && pdfRecord.data) {
                        const bytes = new Uint8Array(pdfRecord.data);

                        // Save currentPDF info for bookmarks
                        chrome.storage.local.set({
                            currentPDF: {
                                isPdf: true,
                                url: `library://${libraryItemId}`,
                                libraryId: libraryItemId,
                                title: pdfRecord.title || 'PDF Document',
                                page: 1,
                                scrollY: 0
                            }
                        });

                        document.title = pdfRecord.title || 'PDF Document';
                        loadPDFFromData(bytes);
                        return; // Success - exit
                    }
                } catch (error) {
                    console.error('Error loading from IndexedDB:', error);
                }
            }

            // If IndexedDB failed, try legacy storage
            loadFromLegacyStorage();
        }

        function loadFromLegacyStorage() {
            chrome.storage.local.get(['researchLibrary'], (result) => {
                const library = result.researchLibrary || [];
                const item = library.find(i => i.id === libraryItemId);

                if (item && item.url) {
                    if (item.url.startsWith('data:application/pdf;base64,')) {
                        try {
                            const base64Data = item.url.split(',')[1];
                            const binaryString = atob(base64Data);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }

                            chrome.storage.local.set({
                                currentPDF: {
                                    isPdf: true,
                                    url: `library://${libraryItemId}`,
                                    libraryId: libraryItemId,
                                    title: item.title || 'PDF Document',
                                    page: 1,
                                    scrollY: 0
                                }
                            });

                            document.title = item.title || 'PDF Document';
                            loadPDFFromData(bytes);
                        } catch (error) {
                            console.error('Error loading library PDF from storage:', error);
                            viewer.innerHTML = `<div style="padding: 20px; color: red;">Error loading PDF: ${error.message}</div>`;
                        }
                    } else {
                        // Regular URL, load normally
                        loadPDF(item.url);
                    }
                } else if (item && item.hasStoredData) {
                    // Item exists but data is in IndexedDB - retry IndexedDB after a delay
                    // This handles cases where IndexedDB wasn't ready on first try
                    setTimeout(async () => {
                        if (typeof PdfStorage !== 'undefined') {
                            try {
                                const pdfStorage = new PdfStorage();
                                await pdfStorage.init();
                                const pdfRecord = await pdfStorage.getPdf(libraryItemId);
                                if (pdfRecord && pdfRecord.data) {
                                    const bytes = new Uint8Array(pdfRecord.data);
                                    document.title = pdfRecord.title || item.title || 'PDF Document';
                                    loadPDFFromData(bytes);
                                    return;
                                }
                            } catch (e) {
                                console.error('Retry IndexedDB failed:', e);
                            }
                        }
                        // Still failed - show helpful message with retry button
                        viewer.innerHTML = `
                            <div style="padding: 40px; text-align: center;">
                                <div style="font-size: 48px; margin-bottom: 20px;">📄</div>
                                <h2 style="color: #333; margin-bottom: 10px;">PDF Loading Issue</h2>
                                <p style="color: #666; margin-bottom: 20px;">The PDF data couldn't be loaded. This may happen after a browser restart.</p>
                                <button onclick="location.reload()" style="
                                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                    color: white;
                                    border: none;
                                    padding: 12px 24px;
                                    border-radius: 8px;
                                    font-size: 14px;
                                    cursor: pointer;
                                    margin-right: 10px;
                                ">
                                    <i class="fas fa-redo"></i> Try Again
                                </button>
                                <button onclick="window.close()" style="
                                    background: #f0f0f0;
                                    color: #333;
                                    border: none;
                                    padding: 12px 24px;
                                    border-radius: 8px;
                                    font-size: 14px;
                                    cursor: pointer;
                                ">
                                    Close & Reopen from Library
                                </button>
                            </div>
                        `;
                    }, 500);
                } else {
                    viewer.innerHTML = `<div style="padding: 20px; color: red;">PDF not found in library. It may have been removed.</div>`;
                }
            });
        }
    }
} else if (pdfUrl) {
    // Decode the URL
    pdfUrl = decodeURIComponent(pdfUrl);
    loadPDF(pdfUrl);
} else {
    // Check for last opened PDF
    chrome.storage.local.get(['lastPdfState'], (result) => {
        if (result.lastPdfState && result.lastPdfState.url) {
            pdfUrl = result.lastPdfState.url;
            // If there's a saved page, we'll handle it after load
            if (result.lastPdfState.page) {
                pageNum = result.lastPdfState.page;
                // We'll scroll to it in loadPDF or after render
            }
            loadPDF(pdfUrl);
        } else {
            viewer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666;">
                    <div style="font-size: 18px; margin-bottom: 10px;">No PDF file loaded</div>
                    <div style="font-size: 14px; color: #888;">Click on a PDF link or open a PDF file to view it here</div>
                </div>
            `;
        }
    });
}

// Load PDF from binary data (Uint8Array)
async function loadPDFFromData(data) {
    try {
        const loadingTask = pdfjsLib.getDocument({ data: data });
        pdfDoc = await loadingTask.promise;
        window.pdfDoc = pdfDoc;

        numPagesSpan.textContent = `/ ${pdfDoc.numPages}`;
        pageNumInput.max = pdfDoc.numPages;

        // Create placeholder containers for all pages
        viewer.innerHTML = '';
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.dataset.pageNumber = i;
            pageDiv.dataset.rendered = 'false';
            pageDiv.style.setProperty('--scale-factor', scale);
            pageDiv.style.minHeight = '1000px';
            pageDiv.style.margin = '10px auto';
            pageDiv.style.backgroundColor = '#fff';
            pageDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            viewer.appendChild(pageDiv);
        }

        renderVisiblePages();
        syncScaleSelectWithScale();
    } catch (error) {
        console.error('Error loading PDF from data:', error);
        viewer.innerHTML = `<div style="padding: 20px; color: red;">Error loading PDF: ${error.message}</div>`;
    }
}

async function loadPDF(url) {
    try {
        const loadingTask = pdfjsLib.getDocument(url);
        pdfDoc = await loadingTask.promise;
        window.pdfDoc = pdfDoc; // Expose globally for sidebar

        // Update URL in utils
        if (window.setCurrentPdfUrl) {
            window.setCurrentPdfUrl(url);
        }

        // Fetch metadata and update document title, then save to currentPDF
        let pdfTitle = '';
        pdfDoc.getMetadata().then((data) => {
            if (data.info && data.info.Title) {
                document.title = data.info.Title;
                pdfTitle = data.info.Title;
            } else {
                // Fallback to filename
                const filename = url.split('/').pop().split('?')[0];
                pdfTitle = decodeURIComponent(filename);
                document.title = pdfTitle;
            }

            // Save currentPDF info for bookmarks
            chrome.storage.local.set({
                currentPDF: {
                    isPdf: true,
                    url: url,
                    title: pdfTitle,
                    page: 1,
                    scrollY: 0
                }
            });
        }).catch(err => console.error('Error fetching metadata:', err));

        numPagesSpan.textContent = `/ ${pdfDoc.numPages}`;
        pageNumInput.max = pdfDoc.numPages;

        // Create placeholder containers for all pages (lightweight)
        viewer.innerHTML = '';
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.dataset.pageNumber = i;
            pageDiv.dataset.rendered = 'false';

            // Set the required --scale-factor CSS variable
            pageDiv.style.setProperty('--scale-factor', scale);

            // Estimate page height (will be updated after first render)
            pageDiv.style.minHeight = '1000px';
            pageDiv.style.margin = '10px auto';
            pageDiv.style.backgroundColor = '#fff';
            pageDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';

            viewer.appendChild(pageDiv);
        }

        // Render initial visible pages
        renderVisiblePages();
        syncScaleSelectWithScale();

        // Check for page hash
        if (window.location.hash) {
            const match = window.location.hash.match(/page=(\d+)/);
            if (match) {
                const targetPage = parseInt(match[1]);
                scrollToPage(targetPage);
            }
        } else if (pageNum > 1) {
            // Restore saved page
            scrollToPage(pageNum);
        }
    } catch (error) {
        console.error('Error loading PDF:', error);
        viewer.innerHTML = `<div style="padding: 20px; color: red;">Error loading PDF: ${error.message}</div>`;
    }
}

// Render pages that are currently visible or near visible
let renderQueue = new Set();
let isRendering = false;

async function renderVisiblePages() {
    if (!pdfDoc) return;

    const pages = viewer.querySelectorAll('.page');
    const containerRect = viewerContainer.getBoundingClientRect();
    const buffer = window.innerHeight; // Render pages within 1 screen height

    // Find visible pages
    const pagesToRender = [];
    for (let i = 0; i < pages.length; i++) {
        const pageDiv = pages[i];
        const rect = pageDiv.getBoundingClientRect();

        // Check if page is visible or within buffer zone
        if (rect.bottom >= containerRect.top - buffer &&
            rect.top <= containerRect.bottom + buffer) {

            if (pageDiv.dataset.rendered !== 'true') {
                pagesToRender.push(i + 1);
            }
        }
    }

    // Add to render queue
    pagesToRender.forEach(num => renderQueue.add(num));

    // Process render queue
    if (!isRendering) {
        processRenderQueue();
    }
}

async function processRenderQueue() {
    if (renderQueue.size === 0) {
        isRendering = false;
        return;
    }

    isRendering = true;
    const pageNum = Array.from(renderQueue)[0];
    renderQueue.delete(pageNum);

    await renderPage(pageNum);

    // Continue processing
    processRenderQueue();
}

// ============================================================================
// LINK ANNOTATIONS (INTERNAL/EXTERNAL PDF LINKS)
// ============================================================================

async function resolvePdfDestToPageNumber(dest) {
    try {
        if (!pdfDoc || !dest) return null;

        const destArray = (typeof dest === 'string') ? await pdfDoc.getDestination(dest) : dest;
        if (!Array.isArray(destArray) || destArray.length === 0) return null;

        const destRef = destArray[0];
        if (typeof destRef === 'number' && Number.isFinite(destRef)) {
            // In many PDFs this is a zero-based page index.
            return destRef + 1;
        }

        if (destRef && typeof destRef === 'object' && typeof pdfDoc.getPageIndex === 'function') {
            const pageIndex = await pdfDoc.getPageIndex(destRef);
            if (Number.isFinite(pageIndex)) return pageIndex + 1;
        }

        return null;
    } catch (e) {
        console.warn('[Links] Failed to resolve dest:', e);
        return null;
    }
}

async function renderLinkAnnotations(page, viewport, annotationLayerDiv) {
    if (!page || !viewport || !annotationLayerDiv || typeof page.getAnnotations !== 'function') return;

    // Clear existing annotations in this layer.
    annotationLayerDiv.innerHTML = '';

    let annotations = [];
    try {
        annotations = await page.getAnnotations({ intent: 'display' });
    } catch (e) {
        console.warn('[Links] getAnnotations failed:', e);
        return;
    }

    for (const a of annotations) {
        if (!a || a.subtype !== 'Link' || !Array.isArray(a.rect)) continue;

        const rect = viewport.convertToViewportRectangle(a.rect);
        const left = Math.min(rect[0], rect[2]);
        const top = Math.min(rect[1], rect[3]);
        const width = Math.abs(rect[0] - rect[2]);
        const height = Math.abs(rect[1] - rect[3]);

        if (width < 1 || height < 1) continue;

        const section = document.createElement('section');
        section.className = 'linkAnnotation';
        section.style.left = `${left}px`;
        section.style.top = `${top}px`;
        section.style.width = `${width}px`;
        section.style.height = `${height}px`;

        const link = document.createElement('a');
        link.href = '#';
        link.setAttribute('role', 'link');

        const url = a.url || a.unsafeUrl;
        if (url) {
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        } else if (a.dest || a.action) {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Prefer explicit destinations when present.
                const targetPage = await resolvePdfDestToPageNumber(a.dest);
                if (targetPage) {
                    scrollToPage(targetPage);
                }
            });
        } else {
            // Nothing actionable.
            continue;
        }

        section.appendChild(link);
        annotationLayerDiv.appendChild(section);
    }
}

async function renderPage(num) {
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: scale });

    // Get the existing page container
    const pageDiv = viewer.querySelector(`[data-page-number="${num}"]`);

    // Set the required --scale-factor CSS variable
    if (pageDiv) {
        pageDiv.style.setProperty('--scale-factor', scale);
    }
    if (!pageDiv || pageDiv.dataset.rendered === 'true') return;

    // Clear any existing content
    pageDiv.innerHTML = '';
    pageDiv.style.width = viewport.width + 'px';
    pageDiv.style.height = viewport.height + 'px';
    pageDiv.style.minHeight = 'auto';

    // Canvas for rendering
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

    const canvasWrapper = document.createElement('div');
    canvasWrapper.className = 'canvasWrapper';
    canvasWrapper.appendChild(canvas);
    pageDiv.appendChild(canvasWrapper);

    // Text layer
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    pageDiv.appendChild(textLayerDiv);

    // Annotation layer for internal links
    const annotationLayerDiv = document.createElement('div');
    annotationLayerDiv.className = 'annotationLayer';
    annotationLayerDiv.style.width = `${viewport.width}px`;
    annotationLayerDiv.style.height = `${viewport.height}px`;
    pageDiv.appendChild(annotationLayerDiv);

    // Render PDF page
    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };
    await page.render(renderContext).promise;

    // Render text layer
    const textContent = await page.getTextContent();
    await pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: []
    }).promise;

    // NOTE: AnnotationLayer for internal PDF links is not available in this PDF.js build
    // Implement a minimal link overlay so embedded PDF links work.
    await renderLinkAnnotations(page, viewport, annotationLayerDiv);

    // Mark as rendered
    pageDiv.dataset.rendered = 'true';
}


function scrollToPage(pageNumber) {
    const pageDiv = viewer.querySelector(`[data-page-number="${pageNumber}"]`);
    if (pageDiv) {
        // First, immediately render the target page if not rendered
        if (pageDiv.dataset.rendered !== 'true') {
            renderPageImmediate(pageNumber);
        }

        // Use instant scroll for TOC navigation
        pageDiv.scrollIntoView({ behavior: 'auto', block: 'start' });
        pageNumInput.value = pageNumber;
        pageNum = pageNumber;

        // Update currentPDF storage for bookmarks
        updateCurrentPdfStorage(pageNumber);

        // Render surrounding pages after a short delay
        setTimeout(() => {
            renderVisiblePages();
        }, 50);
    }
}

// Immediate synchronous-style page render for navigation
async function renderPageImmediate(num) {
    try {
        const page = await pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale: scale });
        const pageDiv = viewer.querySelector(`[data-page-number="${num}"]`);

        if (!pageDiv || pageDiv.dataset.rendered === 'true') return;

        // Set the required --scale-factor CSS variable
        pageDiv.style.setProperty('--scale-factor', scale);
        pageDiv.style.width = `${viewport.width}px`;
        pageDiv.style.height = `${viewport.height}px`;
        pageDiv.style.minHeight = 'unset';
        pageDiv.innerHTML = '';

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width * window.devicePixelRatio;
        canvas.height = viewport.height * window.devicePixelRatio;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        // Wrap canvas in canvasWrapper for consistent z-index layering
        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'canvasWrapper';
        canvasWrapper.appendChild(canvas);
        pageDiv.appendChild(canvasWrapper);

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        // Add text layer with proper --scale-factor for alignment
        const textContent = await page.getTextContent();
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        pageDiv.appendChild(textLayerDiv);

        pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
            textDivs: []
        });

        // Annotation layer for internal/external links
        const annotationLayerDiv = document.createElement('div');
        annotationLayerDiv.className = 'annotationLayer';
        pageDiv.appendChild(annotationLayerDiv);
        await renderLinkAnnotations(page, viewport, annotationLayerDiv);

        pageDiv.dataset.rendered = 'true';
    } catch (e) {
        console.error('Immediate render error:', e);
    }
}

// Navigation controls
document.getElementById('previous').addEventListener('click', () => {
    if (pageNum <= 1) return;
    pageNum--;
    scrollToPage(pageNum);
});

document.getElementById('next').addEventListener('click', () => {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    scrollToPage(pageNum);
});

pageNumInput.addEventListener('change', () => {
    const num = parseInt(pageNumInput.value);
    if (num >= 1 && num <= pdfDoc.numPages) {
        pageNum = num;
        scrollToPage(pageNum);
    }
});

// Zoom controls
document.getElementById('zoomIn').addEventListener('click', () => {
    scale = normalizeScale(scale * 1.25);
    reRenderAll();
});

document.getElementById('zoomOut').addEventListener('click', () => {
    scale = normalizeScale(scale / 1.25);
    reRenderAll();
});

scaleSelect.addEventListener('change', async () => {
    const value = scaleSelect.value;
    if (value === 'auto' || value === 'page-fit' || value === 'page-width') {
        scale = await computePresetScale(value);
    } else if (value === 'page-actual') {
        scale = 1.0;
    } else {
        const numeric = parseFloat(value);
        if (Number.isFinite(numeric)) {
            scale = numeric;
        }
    }
    scale = normalizeScale(scale);
    await reRenderAll();
});

async function reRenderAll({ preserveScroll = true } = {}) {
    if (!pdfDoc) return;

    console.log('reRenderAll: Starting re-render due to zoom change');

    // Preserve scroll position relative to the current page.
    const anchorPageNumber = pageNum;
    const anchorDiv = preserveScroll ? viewer.querySelector(`[data-page-number="${anchorPageNumber}"]`) : null;
    const anchorOffset = (preserveScroll && anchorDiv) ? (anchorDiv.offsetTop - viewerContainer.scrollTop) : 0;

    syncScaleSelectWithScale();

    // Notify drawing manager to clear canvas references before pages are cleared
    if (window.drawingManager && typeof window.drawingManager.clearCanvasReferences === 'function') {
        window.drawingManager.clearCanvasReferences();
    }

    // Mark all pages as not rendered
    const pages = viewer.querySelectorAll('.page');
    pages.forEach(page => {
        page.style.setProperty('--scale-factor', scale);
        page.dataset.rendered = 'false';
        page.innerHTML = '';
        page.style.minHeight = '1000px';
    });

    // Clear render queue
    renderQueue.clear();

    // Re-render visible pages
    await renderVisiblePages();

    if (preserveScroll) {
        const newAnchorDiv = viewer.querySelector(`[data-page-number="${anchorPageNumber}"]`);
        if (newAnchorDiv) {
            viewerContainer.scrollTop = Math.max(0, newAnchorDiv.offsetTop - anchorOffset);
            renderVisiblePages();
        }
    }

    // Notify zoom-dependent overlays (e.g., comments) after pages re-render.
    // comment_manager listens to the `scalechange` event.
    const dispatchScaleChange = () => {
        try {
            window.dispatchEvent(new CustomEvent('scalechange', { detail: { scale } }));
        } catch (e) {
            // Fallback for environments without CustomEvent constructor
            const evt = document.createEvent('Event');
            evt.initEvent('scalechange', true, true);
            window.dispatchEvent(evt);
        }
    };

    // Re-render highlights after pages are fully rendered
    // Use multiple attempts to ensure pages have updated dimensions
    const reRenderHighlights = () => {
        if (window.renderAllHighlights) {
            console.log('reRenderAll: Calling renderAllHighlights after zoom');
            window.renderAllHighlights();
        }
    };

    setTimeout(reRenderHighlights, 150);
    setTimeout(reRenderHighlights, 400);

    setTimeout(dispatchScaleChange, 150);
    setTimeout(dispatchScaleChange, 400);
}

document.getElementById('print').addEventListener('click', () => {
    window.print();
});

document.getElementById('download').addEventListener('click', () => {
    if (pdfUrl && pdfUrl.startsWith('file://')) {
        alert('Cannot download local files from file:// URLs');
    } else if (pdfUrl) {
        const a = document.createElement('a');
        a.href = pdfUrl;
        a.download = 'document.pdf';
        a.click();
    }
});


// Update current page on scroll (with debouncing and lazy rendering)
let scrollTimeout;
let renderTimeout = null;
let lastRenderTime = 0;
const RENDER_THROTTLE_MS = 100; // Only render at most every 100ms during scroll

viewerContainer.addEventListener('scroll', () => {
    // Throttle lazy rendering to avoid excessive calls
    const now = Date.now();
    if (now - lastRenderTime >= RENDER_THROTTLE_MS) {
        lastRenderTime = now;
        renderVisiblePages();
    } else if (!renderTimeout) {
        // Schedule a render after throttle period if not already scheduled
        renderTimeout = setTimeout(() => {
            lastRenderTime = Date.now();
            renderVisiblePages();
            renderTimeout = null;
        }, RENDER_THROTTLE_MS - (now - lastRenderTime));
    }

    // Clear the previous timeout for page number update
    clearTimeout(scrollTimeout);

    // Set a new timeout to update page number after scrolling stops
    scrollTimeout = setTimeout(() => {
        const pages = viewer.querySelectorAll('.page');
        if (!pages || pages.length === 0) return;

        let currentPage = pageNum; // Start with current page to avoid unnecessary updates
        const containerTop = viewerContainer.scrollTop;
        const containerHeight = viewerContainer.clientHeight;
        const threshold = containerHeight / 3; // Page is "current" if it's in the top third

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const rect = page.getBoundingClientRect();
            const containerRect = viewerContainer.getBoundingClientRect();

            // Calculate the page's position relative to the container
            const pageTop = rect.top - containerRect.top;

            // Page is current if its top is visible in the upper portion of the viewport
            if (pageTop >= -threshold && pageTop < threshold) {
                currentPage = i + 1;
                break;
            }
        }

        // Only update if the page actually changed
        if (currentPage !== pageNum) {
            pageNum = currentPage;
            pageNumInput.value = pageNum;

            // Save state for lastPdfState
            if (pdfUrl) {
                chrome.storage.local.set({
                    lastPdfState: {
                        url: pdfUrl,
                        page: pageNum,
                        timestamp: Date.now()
                    }
                });
            }

            // Also update currentPDF for bookmarks
            updateCurrentPdfStorage(pageNum);
        }
    }, 100); // 100ms debounce delay
});

// Helper function for debouncing
function debounce(func, wait) {
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

// Expose jumpToPage function globally for sidebar navigation
window.jumpToPage = function (pageNumber) {
    if (pageNumber >= 1 && pageNumber <= (pdfDoc ? pdfDoc.numPages : 1)) {
        pageNum = pageNumber;
        scrollToPage(pageNum);
    }
};

// ============================================================================
// VOCABULARY HIGHLIGHTING SYSTEM
// ============================================================================

let vocabularyWords = [];
let highlightVocabEnabled = true;
let vocabularyTooltip = null;
let vocabHighlightColor = '#667eea';
let vocabHighlightOpacity = 40;
let vocabStyleElement = null;
// Tooltip customization settings
let vocabTooltipColor = '#667eea';
let vocabTooltipTextColor = '#ffffff';
let vocabTooltipOpacity = 100;
let currentTooltipWord = null; // Track current word for delete functionality
let tooltipHideTimeout = null; // For delayed hiding
let isTooltipHovered = false; // Track if tooltip is being hovered

// Initialize vocabulary highlighting system
async function initVocabularyHighlighting() {
    // Load settings and vocabulary
    chrome.storage.local.get([
        'highlightVocabInPdf',
        'vocabularyList',
        'vocabHighlightColor',
        'vocabHighlightOpacity',
        'vocabTooltipColor',
        'vocabTooltipTextColor',
        'vocabTooltipOpacity'
    ], (result) => {
        highlightVocabEnabled = result.highlightVocabInPdf !== false; // Default to true
        vocabularyWords = result.vocabularyList || [];
        vocabHighlightColor = result.vocabHighlightColor || '#667eea';
        vocabHighlightOpacity = result.vocabHighlightOpacity !== undefined ? result.vocabHighlightOpacity : 40;
        // Load tooltip customization
        vocabTooltipColor = result.vocabTooltipColor || '#667eea';
        vocabTooltipTextColor = result.vocabTooltipTextColor || '#ffffff';
        vocabTooltipOpacity = result.vocabTooltipOpacity !== undefined ? result.vocabTooltipOpacity : 100;

        // Apply custom vocab highlight styles
        updateVocabHighlightStyles();

        if (highlightVocabEnabled && vocabularyWords.length > 0) {
            // Apply highlighting after a delay to ensure pages are rendered
            setTimeout(() => highlightVocabularyWords(), 1000);
        }
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.highlightVocabInPdf) {
                highlightVocabEnabled = changes.highlightVocabInPdf.newValue !== false;
                if (highlightVocabEnabled) {
                    highlightVocabularyWords();
                } else {
                    removeVocabularyHighlights();
                }
            }
            if (changes.vocabularyList) {
                vocabularyWords = changes.vocabularyList.newValue || [];
                if (highlightVocabEnabled) {
                    removeVocabularyHighlights();
                    highlightVocabularyWords();
                }
            }
            // Handle color changes
            if (changes.vocabHighlightColor) {
                vocabHighlightColor = changes.vocabHighlightColor.newValue || '#667eea';
                updateVocabHighlightStyles();
            }
            // Handle opacity changes
            if (changes.vocabHighlightOpacity) {
                vocabHighlightOpacity = changes.vocabHighlightOpacity.newValue !== undefined
                    ? changes.vocabHighlightOpacity.newValue : 40;
                updateVocabHighlightStyles();
            }
            // Handle tooltip customization changes
            if (changes.vocabTooltipColor) {
                vocabTooltipColor = changes.vocabTooltipColor.newValue || '#667eea';
            }
            if (changes.vocabTooltipTextColor) {
                vocabTooltipTextColor = changes.vocabTooltipTextColor.newValue || '#ffffff';
            }
            if (changes.vocabTooltipOpacity) {
                vocabTooltipOpacity = changes.vocabTooltipOpacity.newValue !== undefined
                    ? changes.vocabTooltipOpacity.newValue : 100;
            }
        }
    });

    // Create tooltip element
    createVocabularyTooltip();
}

// Update vocabulary highlight styles dynamically
function updateVocabHighlightStyles() {
    // Create or get the style element
    if (!vocabStyleElement) {
        vocabStyleElement = document.createElement('style');
        vocabStyleElement.id = 'vocab-highlight-custom-styles';
        document.head.appendChild(vocabStyleElement);
    }

    // Convert hex to RGB
    const hex = vocabHighlightColor;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const opacity = vocabHighlightOpacity / 100;

    // Create a slightly darker version for the gradient
    const darkerR = Math.max(0, r - 30);
    const darkerG = Math.max(0, g - 30);
    const darkerB = Math.max(0, b - 30);

    vocabStyleElement.textContent = `
        .vocab-word-highlight {
            background: linear-gradient(to bottom, 
                rgba(${r}, ${g}, ${b}, ${opacity}) 0%, 
                rgba(${darkerR}, ${darkerG}, ${darkerB}, ${opacity}) 100%) !important;
            padding: 1px 3px !important;
            border-radius: 3px !important;
            cursor: pointer !important;
            transition: background 0.2s ease !important;
        }
        .vocab-word-highlight:hover {
            background: linear-gradient(to bottom, 
                rgba(${r}, ${g}, ${b}, ${Math.min(1, opacity + 0.2)}) 0%, 
                rgba(${darkerR}, ${darkerG}, ${darkerB}, ${Math.min(1, opacity + 0.2)}) 100%) !important;
        }
    `;
}

// Create the tooltip element for showing translations
function createVocabularyTooltip() {
    if (vocabularyTooltip) return;

    vocabularyTooltip = document.createElement('div');
    vocabularyTooltip.id = 'vocabulary-tooltip';
    vocabularyTooltip.className = 'vocabulary-tooltip';
    vocabularyTooltip.style.cssText = `
        position: fixed;
        background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%);
        color: #ffffff;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        z-index: 99999;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s, visibility 0.2s, transform 0.2s;
        transform: translateY(5px);
        max-width: 300px;
        pointer-events: auto;
        direction: rtl;
        text-align: right;
    `;
    document.body.appendChild(vocabularyTooltip);

    // Add hover tracking for tooltip
    vocabularyTooltip.addEventListener('mouseenter', () => {
        isTooltipHovered = true;
        if (tooltipHideTimeout) {
            clearTimeout(tooltipHideTimeout);
            tooltipHideTimeout = null;
        }
    });

    vocabularyTooltip.addEventListener('mouseleave', () => {
        isTooltipHovered = false;
        hideVocabularyTooltip();
    });
}

// Helper function to adjust color brightness
function adjustColor(hex, amount) {
    if (!hex || hex.length !== 7) return '#5a67d8';
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
    return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Show tooltip with Arabic translation
function showVocabularyTooltip(word, arabic, x, y) {
    if (!vocabularyTooltip || !arabic) return;

    // Store current word for delete functionality
    currentTooltipWord = word;

    // Apply custom tooltip colors
    const tooltipOpacityValue = vocabTooltipOpacity / 100;
    vocabularyTooltip.style.background = `linear-gradient(135deg, ${vocabTooltipColor} 0%, ${adjustColor(vocabTooltipColor, -30)} 100%)`;
    vocabularyTooltip.style.color = vocabTooltipTextColor;
    vocabularyTooltip.style.opacity = tooltipOpacityValue.toString();

    vocabularyTooltip.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div style="font-size: 12px; opacity: 0.8; direction: ltr; text-align: left;">📚 ${word}</div>
            <button id="vocab-delete-btn" style="
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: ${vocabTooltipTextColor};
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                margin-left: 8px;
                transition: background 0.2s;
            " title="Delete from vocabulary">🗑️</button>
        </div>
        <div style="font-size: 18px; font-weight: 600;">${arabic}</div>
    `;

    // Add delete button event listener
    const deleteBtn = vocabularyTooltip.querySelector('#vocab-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteWordFromVocab(word);
        });
        deleteBtn.addEventListener('mouseenter', () => {
            deleteBtn.style.background = 'rgba(255, 100, 100, 0.6)';
        });
        deleteBtn.addEventListener('mouseleave', () => {
            deleteBtn.style.background = 'rgba(255, 255, 255, 0.2)';
        });
    }

    // Position tooltip
    const tooltipRect = vocabularyTooltip.getBoundingClientRect();
    let posX = x + 10;
    let posY = y - 70;

    // Keep tooltip in viewport
    if (posX + 300 > window.innerWidth) {
        posX = x - 310;
    }
    if (posY < 10) {
        posY = y + 20;
    }

    vocabularyTooltip.style.left = posX + 'px';
    vocabularyTooltip.style.top = posY + 'px';
    vocabularyTooltip.style.visibility = 'visible';
    vocabularyTooltip.style.transform = 'translateY(0)';
    vocabularyTooltip.style.pointerEvents = 'auto';
}

// Delete word from vocabulary
function deleteWordFromVocab(word) {
    // Find and remove the word from vocabulary
    const wordIndex = vocabularyWords.findIndex(w =>
        w.word.toLowerCase() === word.toLowerCase()
    );

    if (wordIndex !== -1) {
        vocabularyWords.splice(wordIndex, 1);

        // Update storage
        chrome.storage.local.set({ vocabularyList: vocabularyWords }, () => {
            // Hide tooltip
            hideVocabularyTooltip();

            // Remove highlights for this word
            removeVocabularyHighlights();

            // Re-apply highlights for remaining words
            if (highlightVocabEnabled && vocabularyWords.length > 0) {
                highlightVocabularyWords();
            }

            console.log(`Deleted "${word}" from vocabulary`);
        });
    }
}

// Hide tooltip
function hideVocabularyTooltip() {
    if (!vocabularyTooltip) return;
    vocabularyTooltip.style.opacity = '0';
    vocabularyTooltip.style.visibility = 'hidden';
    vocabularyTooltip.style.transform = 'translateY(5px)';
    currentTooltipWord = null;
    isTooltipHovered = false;
}

// Highlight vocabulary words in all rendered text layers
function highlightVocabularyWords() {
    if (!highlightVocabEnabled || vocabularyWords.length === 0) return;


    const textLayers = document.querySelectorAll('.textLayer');
    textLayers.forEach(textLayer => {
        highlightWordsInTextLayer(textLayer);
    });
}

// Highlight words in a specific text layer
function highlightWordsInTextLayer(textLayer) {
    if (!textLayer || textLayer.dataset.vocabHighlighted === 'true') return;

    const spans = textLayer.querySelectorAll('span');

    spans.forEach(span => {
        // Skip if already processed or has highlight marks
        if (span.querySelector('.vocab-word-highlight')) return;

        const originalText = span.textContent;
        if (!originalText || originalText.trim().length === 0) return;

        let newHTML = originalText;
        let hasMatch = false;

        // Check each vocabulary word
        vocabularyWords.forEach(vocabItem => {
            const word = vocabItem.word;
            const arabic = vocabItem.arabic;

            if (!word || !arabic) return;

            // Case-insensitive match for whole words
            const regex = new RegExp(`\\b(${escapeRegExp(word)})\\b`, 'gi');

            if (regex.test(newHTML)) {
                hasMatch = true;
                // Wrap only the matched word with a highlight span
                newHTML = newHTML.replace(regex, `<mark class="vocab-word-highlight" data-vocab-word="${escapeHTML(word)}" data-vocab-arabic="${escapeHTML(arabic)}">$1</mark>`);
            }
        });

        // Only modify DOM if we found matches
        if (hasMatch) {
            span.innerHTML = newHTML;

            // Add event listeners to the highlight marks
            span.querySelectorAll('.vocab-word-highlight').forEach(mark => {
                mark.addEventListener('mouseenter', handleVocabHover);
                mark.addEventListener('mouseleave', handleVocabLeave);
            });
        }
    });

    textLayer.dataset.vocabHighlighted = 'true';
}

// Escape HTML special characters
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Handle hover on vocabulary word
function handleVocabHover(e) {
    const el = e.target;
    const word = el.dataset.vocabWord;
    const arabic = el.dataset.vocabArabic;

    // Clear any pending hide timeout
    if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout);
        tooltipHideTimeout = null;
    }

    if (word && arabic) {
        const rect = el.getBoundingClientRect();
        showVocabularyTooltip(word, arabic, rect.left, rect.top);
    }
}

// Handle mouse leave on vocabulary word
function handleVocabLeave() {
    // Delay hiding to allow mouse to move to tooltip
    tooltipHideTimeout = setTimeout(() => {
        if (!isTooltipHovered) {
            hideVocabularyTooltip();
        }
    }, 150);
}

// Remove all vocabulary highlights
function removeVocabularyHighlights() {
    const highlights = document.querySelectorAll('.vocab-word-highlight');
    highlights.forEach(mark => {
        // Replace the mark element with its text content
        const text = document.createTextNode(mark.textContent);
        mark.parentNode.replaceChild(text, mark);
    });

    // Reset highlighted flag on text layers
    const textLayers = document.querySelectorAll('.textLayer');
    textLayers.forEach(layer => {
        layer.dataset.vocabHighlighted = 'false';
    });
}

// Escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Re-highlight after new pages are rendered
const originalRenderPage = renderPage;
renderPage = async function (num) {
    await originalRenderPage(num);

    // Highlight vocabulary words in newly rendered pages
    if (highlightVocabEnabled && vocabularyWords.length > 0) {
        setTimeout(() => {
            const pageDiv = viewer.querySelector(`[data-page-number="${num}"]`);
            if (pageDiv) {
                const textLayer = pageDiv.querySelector('.textLayer');
                if (textLayer) {
                    highlightWordsInTextLayer(textLayer);
                }
            }
        }, 100);
    }
};

// Initialize vocabulary highlighting when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initVocabularyHighlighting, 500);
});

// Also re-highlight when navigating to new pages
const originalScrollToPage = scrollToPage;
scrollToPage = function (pageNumber) {
    originalScrollToPage(pageNumber);

    // Re-apply highlights after scrolling (for newly rendered pages)
    if (highlightVocabEnabled && vocabularyWords.length > 0) {
        setTimeout(highlightVocabularyWords, 300);
    }
};
