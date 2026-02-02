// Sidebar Panel Manager (Outline Only)

let sidebarOpen = false;
let outlineRendered = false;

function injectSidebarToggle() {
    const toolbarLeft = document.getElementById('toolbarViewerLeft');
    if (!toolbarLeft) return;

    // Create Toggle Button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'sidebarToggle';
    toggleBtn.className = 'toolbarButton';
    toggleBtn.title = 'Toggle Table of Contents';
    toggleBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="15" y2="12"></line>
            <line x1="3" y1="18" x2="18" y2="18"></line>
        </svg>
    `;

    toggleBtn.addEventListener('click', toggleSidebar);

    // Insert as first item
    toolbarLeft.insertBefore(toggleBtn, toolbarLeft.firstChild);

    // Add separator after toggle button
    const separator = document.createElement('div');
    separator.className = 'verticalToolbarSeparator';
    toolbarLeft.insertBefore(separator, toggleBtn.nextSibling);
}

function toggleSidebar() {
    const mainContainer = document.getElementById('mainContainer');
    const sidebarContainer = document.getElementById('sidebarContainer');
    sidebarOpen = !sidebarOpen;

    if (sidebarOpen) {
        mainContainer.classList.add('sidebarOpen');
        sidebarContainer.classList.remove('hidden');
        if (!outlineRendered) {
            renderOutline();
        }
    } else {
        mainContainer.classList.remove('sidebarOpen');
        sidebarContainer.classList.add('hidden');
    }
}

async function renderOutline() {
    const container = document.getElementById('outlineView');
    if (!container) {
        return;
    }
    container.innerHTML = '<div class="outline-loading">Loading outline...</div>';

    // Wait for PDF to be ready
    let attempts = 0;
    const maxAttempts = 20;

    const waitForPdf = () => {
        return new Promise((resolve) => {
            const check = () => {
                if (window.pdfDoc) {
                    resolve(window.pdfDoc);
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(check, 250);
                } else {
                    resolve(null);
                }
            };
            check();
        });
    };

    try {
        const doc = await waitForPdf();

        if (!doc) {
            container.innerHTML = '<div class="outline-empty">No PDF loaded</div>';
            return;
        }

        // First try to get the built-in outline
        let outline = await doc.getOutline();
        outlineRendered = true;

        // If no built-in outline, generate one from content
        if (!outline || outline.length === 0) {
            outline = await generateOutlineFromContent(doc);
        }

        if (!outline || outline.length === 0) {
            container.innerHTML = '<div class="outline-empty">No table of contents available for this document.</div>';
            return;
        }

        container.innerHTML = '';
        const ul = document.createElement('ul');
        ul.className = 'outlineList';

        async function processItems(items, parent, level = 0) {
            for (const item of items) {
                const li = document.createElement('li');
                li.dataset.level = level;

                const div = document.createElement('div');
                div.className = 'outline-item-container';

                const a = document.createElement('a');
                a.textContent = item.title;
                a.href = '#';
                a.title = item.title;

                // Click handler for navigation
                a.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    try {
                        let pageNum = item.pageNum; // For generated outlines

                        // For built-in outlines, use dest
                        if (item.dest && !pageNum) {
                            let dest = item.dest;
                            if (typeof dest === 'string') {
                                dest = await doc.getDestination(dest);
                            }

                            if (dest && dest[0]) {
                                const pageRef = dest[0];
                                const pageIndex = await doc.getPageIndex(pageRef);
                                pageNum = pageIndex + 1;
                            }
                        }

                        if (pageNum) {
                            // Use global jumpToPage if available
                            if (window.jumpToPage) {
                                window.jumpToPage(pageNum);
                            } else {
                                // Fallback: scroll to page directly
                                const pageDiv = document.querySelector(`[data-page-number="${pageNum}"]`);
                                if (pageDiv) {
                                    pageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                                const pageInput = document.getElementById('pageNumber');
                                if (pageInput) {
                                    pageInput.value = pageNum;
                                }
                            }

                            // Highlight the clicked item
                            document.querySelectorAll('.outline-item-container.active').forEach(el => {
                                el.classList.remove('active');
                            });
                            div.classList.add('active');
                        }
                    } catch (err) {
                        console.warn('Navigation error:', err);
                    }
                });

                // Check for children
                if (item.items && item.items.length > 0) {
                    const toggle = document.createElement('span');
                    toggle.className = 'outline-toggle';
                    toggle.innerHTML = '▶';
                    li.classList.add('collapsed');

                    toggle.onclick = (e) => {
                        e.stopPropagation();
                        li.classList.toggle('collapsed');
                    };
                    div.appendChild(toggle);
                } else {
                    const spacer = document.createElement('span');
                    spacer.className = 'outline-toggle spacer';
                    div.appendChild(spacer);
                }

                div.appendChild(a);
                li.appendChild(div);

                if (item.items && item.items.length > 0) {
                    const subUl = document.createElement('ul');
                    await processItems(item.items, subUl, level + 1);
                    li.appendChild(subUl);
                }

                parent.appendChild(li);
            }
        }

        await processItems(outline, ul);
        container.appendChild(ul);

    } catch (e) {
        console.error("Error getting outline", e);
        container.innerHTML = '<div class="outline-empty">Error loading table of contents</div>';
    }
}

/**
 * Generate table of contents from PDF content by detecting section headings
 * This is used when the PDF doesn't have a built-in outline
 */
async function generateOutlineFromContent(doc) {
    const outline = [];
    const pagesToScan = Math.min(doc.numPages, 30); // Scan first 30 pages max

    // Common section heading patterns for academic papers
    const sectionPatterns = [
        // Numbered sections: 1. Introduction, 1.1 Background, etc.
        /^(\d+\.?\d*\.?\d*)\s+([A-Z][A-Za-z\s,]+)$/,
        // Roman numerals: I. Introduction, II. Methods
        /^([IVX]+\.?)\s+([A-Z][A-Za-z\s,]+)$/,
        // Letter sections: A. Introduction, B. Methods  
        /^([A-Z]\.)\s+([A-Z][A-Za-z\s,]+)$/,
        // Common standalone headings
        /^(Abstract|Introduction|Background|Literature Review|Methodology|Methods|Materials and Methods|Results|Discussion|Conclusions?|References|Acknowledgements?|Appendix|Bibliography)$/i
    ];

    // Keywords that indicate section headings
    const sectionKeywords = [
        'abstract', 'introduction', 'background', 'literature review', 'related work',
        'methodology', 'methods', 'materials and methods', 'experimental', 'experiment',
        'results', 'findings', 'analysis', 'discussion', 'conclusion', 'conclusions',
        'summary', 'references', 'bibliography', 'acknowledgement', 'acknowledgments',
        'appendix', 'supplementary', 'future work', 'limitations'
    ];

    for (let pageNum = 1; pageNum <= pagesToScan; pageNum++) {
        try {
            const page = await doc.getPage(pageNum);
            const textContent = await page.getTextContent();
            const items = textContent.items;

            // Group items by their Y position to identify lines
            const lines = [];
            let currentLine = { text: '', items: [], y: null, height: 0 };

            for (const item of items) {
                const y = Math.round(item.transform[5]);
                const height = item.height || Math.abs(item.transform[0]) || 12;

                if (currentLine.y === null) {
                    currentLine.y = y;
                    currentLine.height = height;
                }

                // New line if Y position differs significantly
                if (Math.abs(y - currentLine.y) > 5) {
                    if (currentLine.text.trim()) {
                        lines.push({ ...currentLine });
                    }
                    currentLine = { text: item.str, items: [item], y: y, height: height };
                } else {
                    currentLine.text += item.str;
                    currentLine.items.push(item);
                    currentLine.height = Math.max(currentLine.height, height);
                }
            }
            if (currentLine.text.trim()) {
                lines.push(currentLine);
            }

            // Analyze lines to find headings
            for (const line of lines) {
                const text = line.text.trim();
                if (!text || text.length < 3 || text.length > 100) continue;

                let isHeading = false;
                let level = 1;
                let title = text;

                // Check against section patterns
                for (const pattern of sectionPatterns) {
                    const match = text.match(pattern);
                    if (match) {
                        isHeading = true;
                        if (match[2]) {
                            // Has number/letter prefix
                            const prefix = match[1];
                            title = match[2];
                            // Determine level from numbering
                            if (prefix.includes('.')) {
                                level = prefix.split('.').filter(p => p).length;
                            } else if (/^[IVX]+/.test(prefix)) {
                                level = 1;
                            } else if (/^[A-Z]\./.test(prefix)) {
                                level = 2;
                            }
                        } else {
                            title = match[1];
                        }
                        break;
                    }
                }

                // Check if it's a known section keyword
                if (!isHeading) {
                    const lowerText = text.toLowerCase();
                    for (const keyword of sectionKeywords) {
                        if (lowerText === keyword ||
                            lowerText.startsWith(keyword + ' ') ||
                            lowerText.match(new RegExp(`^\\d+\\.?\\s*${keyword}`, 'i'))) {
                            isHeading = true;
                            title = text;
                            // References and Appendix are lower level
                            if (keyword === 'references' || keyword === 'appendix' || keyword === 'acknowledgement') {
                                level = 1;
                            }
                            break;
                        }
                    }
                }

                // Heuristics for heading detection based on text properties
                if (!isHeading && line.height > 13) {
                    // Larger font might indicate heading
                    // Check if text is mostly capitalized or title case
                    const words = text.split(/\s+/);
                    const capitalizedWords = words.filter(w => /^[A-Z]/.test(w)).length;
                    if (capitalizedWords / words.length > 0.6 && text.length < 60) {
                        // Avoid picking up author names or affiliations
                        if (!text.includes('@') && !text.includes('University') &&
                            !text.includes('Department') && !text.includes('Faculty')) {
                            isHeading = true;
                            level = 2;
                        }
                    }
                }

                if (isHeading) {
                    // Clean up the title
                    title = title.replace(/^\d+\.?\d*\.?\s*/, '').trim();
                    title = title.charAt(0).toUpperCase() + title.slice(1);

                    // Avoid duplicates
                    const existingTitles = outline.map(o => o.title.toLowerCase());
                    if (!existingTitles.includes(title.toLowerCase())) {
                        outline.push({
                            title: title,
                            pageNum: pageNum,
                            level: level,
                            items: [] // For subsections
                        });
                    }
                }
            }
        } catch (e) {
            console.warn(`SidebarManager: Error scanning page ${pageNum}:`, e);
        }
    }

    // Convert to the format expected by processItems (with dest instead of pageNum)
    // and organize into hierarchy
    return organizeOutlineHierarchy(outline);
}

/**
 * Organize flat outline items into a hierarchy based on levels
 */
function organizeOutlineHierarchy(flatOutline) {
    const result = [];
    const stack = [{ level: 0, items: result }];

    for (const item of flatOutline) {
        // Create outline entry in PDF.js format
        const entry = {
            title: item.title,
            dest: null, // Will use pageNum for navigation
            pageNum: item.pageNum,
            items: []
        };

        // Find the right parent based on level
        while (stack.length > 1 && stack[stack.length - 1].level >= item.level) {
            stack.pop();
        }

        stack[stack.length - 1].items.push(entry);
        stack.push({ level: item.level, items: entry.items });
    }

    return result;
}
