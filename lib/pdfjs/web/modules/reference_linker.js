/**
 * Reference Linker - Makes in-text citations clickable and links to references
 * Also makes URLs, DOIs, and links in the references section clickable
 */

class ReferenceLinker {
    constructor() {
        this.references = [];
        this.inTextCitations = [];
        this.initialized = false;
        this.referenceSectionPage = null;
    }

    async init() {
        // Try to get PDF document from custom viewer first, then fall back to PDFViewerApplication
        const pdfDoc = window.pdfDoc || 
                      (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument);
        
        if (!pdfDoc) {
            return;
        }

        this.pdfDocument = pdfDoc;
        
        // Add CSS for citation styling
        this.injectStyles();
        
        await this.findReferences();
        this.initialized = true;
        
        // Process visible pages
        this.processVisiblePages();
        
        // Listen for page renders using MutationObserver for custom viewer
        this.observePageRenders();
        

    }
    
    injectStyles() {
        if (document.getElementById('reference-linker-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'reference-linker-styles';
        style.textContent = `
            /* Animation for reference highlight flash */
            @keyframes referenceFlash {
                0% {
                    background: rgba(255, 235, 59, 0.9);
                    transform: scale(1.05);
                }
                30% {
                    background: rgba(255, 235, 59, 0.8);
                    transform: scale(1);
                }
                100% {
                    background: rgba(255, 235, 59, 0);
                    transform: scale(1);
                }
            }
            
            .reference-highlight-flash {
                transition: all 0.3s ease;
            }
            
            /* Citation links - invisible, just clickable */
            .citation-link {
                cursor: pointer;
            }
            .reference-url, .reference-doi {
                color: #2563eb !important;
                cursor: pointer !important;
                text-decoration: underline !important;
                word-break: break-all !important;
                display: inline !important;
            }
            .reference-url:hover, .reference-doi:hover {
                color: #1d4ed8 !important;
                background-color: rgba(37, 99, 235, 0.1) !important;
            }
            .reference-popup {
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                padding: 16px;
                max-width: 500px;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .ref-popup-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            .ref-number {
                font-weight: bold;
                color: #2563eb;
            }
            .ref-popup-close {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: #666;
            }
            .ref-popup-close:hover {
                color: #000;
            }
            .ref-popup-text {
                font-size: 13px;
                line-height: 1.5;
                color: #333;
                margin-bottom: 12px;
                max-height: 150px;
                overflow-y: auto;
            }
            .ref-popup-links {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 12px;
            }
            .ref-link {
                font-size: 12px;
                padding: 4px 8px;
                background: #f0f4ff;
                color: #2563eb;
                text-decoration: none;
                border-radius: 4px;
            }
            .ref-link:hover {
                background: #dbeafe;
            }
            .ref-goto-btn {
                width: 100%;
                padding: 8px;
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
            }
            .ref-goto-btn:hover {
                background: #1d4ed8;
            }
        `;
        document.head.appendChild(style);
    }
    
    observePageRenders() {
        const viewer = document.getElementById('viewer');
        if (!viewer) return;
        
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        // Check if it's a text layer
                        if (node.classList && node.classList.contains('textLayer')) {
                            const page = node.closest('.page');
                            if (page) {
                                const pageNum = parseInt(page.dataset.pageNumber);
                                if (pageNum) {
                                    setTimeout(() => this.processPage(pageNum), 100);
                                }
                            }
                        }
                        // Check for text layers inside added nodes
                        const textLayers = node.querySelectorAll ? node.querySelectorAll('.textLayer') : [];
                        textLayers.forEach(tl => {
                            const page = tl.closest('.page');
                            if (page) {
                                const pageNum = parseInt(page.dataset.pageNumber);
                                if (pageNum) {
                                    setTimeout(() => this.processPage(pageNum), 100);
                                }
                            }
                        });
                    }
                });
            });
        });
        
        observer.observe(viewer, { childList: true, subtree: true });
    }

    async findReferences() {
        const numPages = this.pdfDocument.numPages;
        
        // Search from the end of the document for references section
        for (let i = numPages; i >= Math.max(1, numPages - 10); i--) {
            try {
                const page = await this.pdfDocument.getPage(i);
                const textContent = await page.getTextContent();
                const text = textContent.items.map(item => item.str).join(' ');
                
                // Check if this page contains a References section
                if (/\b(References|Bibliography|Works\s+Cited|Literature\s+Cited)\b/i.test(text)) {
                    this.referenceSectionPage = i;
                    await this.extractReferences(i);
                    break;
                }
            } catch (e) {
                console.error('ReferenceLinker: Error scanning page', i, e);
            }
        }
    }

    async extractReferences(startPage) {
        const numPages = this.pdfDocument.numPages;
        
        for (let i = startPage; i <= numPages; i++) {
            try {
                const page = await this.pdfDocument.getPage(i);
                const textContent = await page.getTextContent();
                
                let currentRef = '';
                let refNumber = this.references.length + 1;
                
                for (const item of textContent.items) {
                    const text = item.str;
                    
                    // Check for new reference (numbered or bracketed)
                    const refMatch = text.match(/^\s*\[?(\d+)\]?\.?\s*/);
                    if (refMatch) {
                        if (currentRef) {
                            this.references.push(this.parseReference(currentRef, refNumber));
                            refNumber++;
                        }
                        currentRef = text;
                    } else {
                        currentRef += ' ' + text;
                    }
                }
                
                // Don't forget the last reference
                if (currentRef) {
                    this.references.push(this.parseReference(currentRef, refNumber));
                }
                
            } catch (e) {
                console.error('ReferenceLinker: Error extracting references from page', i, e);
            }
        }
        

    }

    parseReference(text, number) {
        // Extract URL
        const urlMatch = text.match(/(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/i);
        
        // Extract DOI
        const doiMatch = text.match(/(?:doi[:\s]*)?10\.\d{4,}\/[^\s]+/i);
        
        // Extract arXiv ID
        const arxivMatch = text.match(/arXiv:\s*(\d+\.\d+)/i);
        
        return {
            number: number,
            text: text.trim(),
            url: urlMatch ? urlMatch[1] : null,
            doi: doiMatch ? doiMatch[0].replace(/^doi[:\s]*/i, '') : null,
            arxiv: arxivMatch ? arxivMatch[1] : null
        };
    }

    processVisiblePages() {
        const viewer = document.getElementById('viewer');
        if (!viewer) return;
        
        const pages = viewer.querySelectorAll('.page');
        pages.forEach(page => {
            const pageNum = parseInt(page.getAttribute('data-page-number'));
            if (pageNum) {
                this.processPage(pageNum);
            }
        });
    }

    processPage(pageNumber) {
        const pageEl = document.querySelector(`.page[data-page-number="${pageNumber}"]`);
        if (!pageEl) return;
        
        const textLayer = pageEl.querySelector('.textLayer');
        if (!textLayer) return;
        
        // Skip if already processed
        if (textLayer.dataset.referencesProcessed) return;
        textLayer.dataset.referencesProcessed = 'true';
        
        // Process in-text citations
        this.processInTextCitations(textLayer, pageNumber);
        
        // If this is a references page, make links clickable
        if (pageNumber >= this.referenceSectionPage) {
            this.processReferenceLinks(textLayer);
        }
    }

    processInTextCitations(textLayer, pageNumber) {
        const spans = textLayer.querySelectorAll('span');
        
        spans.forEach(span => {
            const text = span.textContent;
            
            // Citation pattern matching strategy:
            // Use a simple, inclusive pattern that matches parentheses containing:
            // - Author name(s) starting with capital letter
            // - Optional "et al."
            // - A 4-digit year (1900-2099)
            // - Optional year suffix (a, b, c...)
            
            const citationPatterns = [
                // Numeric citations: [1], [1,2], [1-3], [1, 2, 3]
                /\[(\d+(?:[,\s\-–—]+\d+)*)\]/g,
                
                // APA-style parenthetical citations - comprehensive pattern
                // Matches anything in parentheses that ends with a 4-digit year
                // Examples matched:
                // (Smith, 2020)
                // (Smith & Jones, 2020)  
                // (Smith et al., 2020)
                // (Van Der Berg et al., 2020)
                // (Hani Brdesee et al., 2022)
                // (Shuvankar Madhu & Bhattacharyya, 2023)
                // (Smith, 2020; Jones, 2021)
                // (see Smith, 2020)
                // (e.g., Smith, 2020)
                /\((?:[^()]*?[A-Z][a-zA-ZÀ-ÿ''\-\s&,\.]+)(?:19|20)\d{2}[a-z]?(?:\s*[;,]\s*(?:[^()]*?[A-Z][a-zA-ZÀ-ÿ''\-\s&,\.]+)(?:19|20)\d{2}[a-z]?)*\)/g
            ];
            
            let hasMatches = false;
            let newHtml = text;
            
            citationPatterns.forEach((pattern) => {
                newHtml = newHtml.replace(pattern, (match) => {
                    // Validate it looks like a citation (has author-like text + year)
                    // Avoid matching things like (page 2020) or pure numbers
                    if (/[A-Z][a-zA-Z]/.test(match) && /(?:19|20)\d{2}/.test(match)) {
                        hasMatches = true;
                        return `<span class="citation-link" data-citation="${match}">${match}</span>`;
                    }
                    return match;
                });
            });
            
            if (hasMatches && newHtml !== text) {
                // Create a wrapper to replace the span content
                const wrapper = document.createElement('span');
                wrapper.innerHTML = newHtml;
                wrapper.style.cssText = span.style.cssText;
                
                // Add click handlers
                wrapper.querySelectorAll('.citation-link').forEach(link => {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleCitationClick(link.dataset.citation);
                    });
                });
                
                // Replace span content
                span.innerHTML = '';
                while (wrapper.firstChild) {
                    span.appendChild(wrapper.firstChild);
                }
            }
        });
    }

    processReferenceLinks(textLayer) {
        // Disabled: PDF URLs are already clickable via annotation layer
        // Modifying spans breaks the text layout
        // The native PDF links work better
        return;
    }

    handleCitationClick(citationText) {
        
        // Extract reference numbers from citation (for numeric citations like [1])
        const numbers = citationText.match(/^\[(\d+)/);
        
        if (numbers && numbers.length > 1 && this.referenceSectionPage) {
            // Numeric citation - find by number
            const refNum = parseInt(numbers[1]);
            const ref = this.references.find(r => r.number === refNum);
            if (ref) {
                this.showReferencePopup(ref);
                return;
            }
        }
        
        // For author-year citations like (Dewan, 2015) or (Nelson, Reed, & Walling, 1976)
        // Extract the first author's last name and year
        const authorYearMatch = citationText.match(/\(([A-Z][a-zA-Z''-]+).*?(\d{4})/);
        if (authorYearMatch) {
            const authorName = authorYearMatch[1].toLowerCase();
            const year = authorYearMatch[2];
            
            // Find reference that contains both the author name and year
            const ref = this.references.find(r => {
                const refLower = r.text.toLowerCase();
                return refLower.includes(authorName) && refLower.includes(year);
            });
            
            if (ref) {
                this.showReferencePopup(ref);
                return;
            }
            
            // If no exact match, try just the author name
            const refByAuthor = this.references.find(r => 
                r.text.toLowerCase().includes(authorName)
            );
            
            if (refByAuthor) {
                this.showReferencePopup(refByAuthor);
                return;
            }
        }
        
        // Fallback: navigate to references section
        this.navigateToReferences();
    }

    navigateToReferences() {
        if (this.referenceSectionPage) {
            // Try custom viewer navigation functions
            if (window.jumpToPage && typeof window.jumpToPage === 'function') {
                window.jumpToPage(this.referenceSectionPage);
            } else if (window.scrollToPage && typeof window.scrollToPage === 'function') {
                window.scrollToPage(this.referenceSectionPage);
            } else if (window.renderPage && typeof window.renderPage === 'function') {
                window.renderPage(this.referenceSectionPage);
            } else if (window.PDFViewerApplication) {
                window.PDFViewerApplication.page = this.referenceSectionPage;
            } else {
                // Last resort: scroll to page element directly
                const pageEl = document.querySelector(`.page[data-page-number="${this.referenceSectionPage}"]`);
                if (pageEl) {
                    pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        }
    }

    showReferencePopup(ref) {
        // Remove existing popup
        const existing = document.querySelector('.reference-popup');
        if (existing) existing.remove();
        
        const popup = document.createElement('div');
        popup.className = 'reference-popup';
        
        let linksHtml = '';
        if (ref.url) {
            linksHtml += `<a href="${ref.url}" target="_blank" class="ref-link">🔗 Open URL</a>`;
        }
        if (ref.doi) {
            linksHtml += `<a href="https://doi.org/${ref.doi}" target="_blank" class="ref-link">📄 Open DOI</a>`;
        }
        if (ref.arxiv) {
            linksHtml += `<a href="https://arxiv.org/abs/${ref.arxiv}" target="_blank" class="ref-link">📚 arXiv</a>`;
        }
        
        // Google Scholar search link
        const searchQuery = encodeURIComponent(ref.text.substring(0, 100));
        linksHtml += `<a href="https://scholar.google.com/scholar?q=${searchQuery}" target="_blank" class="ref-link">🎓 Google Scholar</a>`;
        
        popup.innerHTML = `
            <div class="ref-popup-header">
                <span class="ref-number">[${ref.number}]</span>
                <button class="ref-popup-close">&times;</button>
            </div>
            <div class="ref-popup-text">${this.escapeHtml(ref.text)}</div>
            <div class="ref-popup-links">${linksHtml}</div>
            <button class="ref-goto-btn">📍 Go to Reference in Document</button>
        `;
        
        document.body.appendChild(popup);
        
        // Position in center of screen
        popup.style.position = 'fixed';
        popup.style.top = '50%';
        popup.style.left = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        
        // Event listeners
        popup.querySelector('.ref-popup-close').addEventListener('click', () => popup.remove());
        popup.querySelector('.ref-goto-btn').addEventListener('click', () => {
            this.navigateToSpecificReference(ref);
            popup.remove();
        });
        
        // Click outside to close
        setTimeout(() => {
            document.addEventListener('click', function closePopup(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', closePopup);
                }
            });
        }, 100);
    }
    
    async navigateToSpecificReference(ref) {
        // First navigate to the references page
        if (this.referenceSectionPage) {
            if (window.jumpToPage) {
                window.jumpToPage(this.referenceSectionPage);
            } else if (window.scrollToPage) {
                window.scrollToPage(this.referenceSectionPage);
            }
        }
        
        // Wait for page to render, then find and highlight the reference
        setTimeout(() => {
            this.findAndHighlightReference(ref);
        }, 500);
    }
    
    findAndHighlightReference(ref) {
        // Extract the reference number for matching
        const numMatch = ref.text.match(/^\[?(\d+)\]?/);
        const refNum = numMatch ? numMatch[1] : null;
        
        // Get multiple search terms for better matching
        const refStart = ref.text.substring(0, 50).trim();
        // Extract author name from the reference (usually first word after any number)
        const authorMatch = ref.text.match(/(?:\[\d+\]\.?\s*)?([A-Z][a-zA-Z'-]+)/);
        const authorName = authorMatch ? authorMatch[1] : null;
        
        // Search through all visible text layers in reference pages
        const pages = document.querySelectorAll('.page');
        let found = false;
        
        for (const page of pages) {
            const pageNum = parseInt(page.dataset.pageNumber);
            if (pageNum < this.referenceSectionPage) continue;
            
            const textLayer = page.querySelector('.textLayer');
            if (!textLayer) continue;
            
            // Get all text content of this page
            const allText = textLayer.textContent || '';
            
            // Try to find the reference number in brackets [N]
            const spans = textLayer.querySelectorAll('span');
            for (const span of spans) {
                const text = span.textContent;
                
                // Method 1: Look for the reference number pattern [N]
                if (refNum && /^\[?\d+\]?\.?$/.test(text.trim()) && text.includes(refNum)) {
                    span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    this.highlightElement(span);
                    found = true;
                    return;
                }
                
                // Method 2: Look for author name at start of line
                if (authorName && text.includes(authorName)) {
                    span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    this.highlightElement(span);
                    found = true;
                    return;
                }
            }
        }
        
        if (!found) {
            // Just scroll to the references page
            const pageEl = document.querySelector(`.page[data-page-number="${this.referenceSectionPage}"]`);
            if (pageEl) {
                pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }
    
    highlightElement(element) {
        // Create a highlight overlay on the element
        const rect = element.getBoundingClientRect();
        const page = element.closest('.page');
        if (!page) return;
        
        const pageRect = page.getBoundingClientRect();
        
        const highlight = document.createElement('div');
        highlight.className = 'reference-highlight-flash';
        highlight.style.cssText = `
            position: absolute;
            left: ${rect.left - pageRect.left - 5}px;
            top: ${rect.top - pageRect.top - 2}px;
            width: ${rect.width + 10}px;
            height: ${rect.height + 4}px;
            background: rgba(255, 235, 59, 0.8);
            border-radius: 3px;
            pointer-events: none;
            z-index: 1000;
            animation: referenceFlash 2s ease-out forwards;
        `;
        
        page.appendChild(highlight);
        
        // Remove after animation
        setTimeout(() => {
            highlight.remove();
        }, 2500);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Auto-initialize when PDF is ready
window.ReferenceLinker = ReferenceLinker;

// Initialize after PDF loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait for PDF to be ready (check for custom viewer's pdfDoc or PDFViewerApplication)
    const checkPdf = setInterval(() => {
        const pdfDoc = window.pdfDoc || 
                      (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument);
        
        if (pdfDoc) {
            clearInterval(checkPdf);
            window.referenceLinker = new ReferenceLinker();
            window.referenceLinker.init();
        }
    }, 500);
    
    // Stop checking after 30 seconds
    setTimeout(() => clearInterval(checkPdf), 30000);
});
