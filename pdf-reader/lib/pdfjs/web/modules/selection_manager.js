// Text Selection Listener
// Highlight mode state
let highlightModeEnabled = false;
let currentHighlightColor = '#FFEB3B';
let selectionTooltip = null;

// Expose functions globally
window.isHighlightModeEnabled = () => highlightModeEnabled;
window.getCurrentHighlightColor = () => currentHighlightColor;
window.setCurrentHighlightColor = (color) => { currentHighlightColor = color; };

// Helper function to merge overlapping rectangles on the same line
function mergeRectsOnSameLine(rects) {
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
            current.top = Math.min(current.top, rect.top);
        } else {
            merged.push(current);
            current = { ...rect };
        }
    }
    merged.push(current);

    return merged;
}

function createSelectionTooltip() {
    if (selectionTooltip) return selectionTooltip;

    selectionTooltip = document.createElement('div');
    selectionTooltip.className = 'selection-tooltip';
    selectionTooltip.innerHTML = `
        <div class="tooltip-btn-group highlight-group">
            <button class="tooltip-btn highlight-btn" title="Highlight">Highlight</button>
            <div class="highlight-colors" style="display: none;">
                <button class="color-option" data-color="#FFEB3B" style="background: #FFEB3B;" title="Yellow"></button>
                <button class="color-option" data-color="#4CAF50" style="background: #4CAF50;" title="Green"></button>
                <button class="color-option" data-color="#2196F3" style="background: #2196F3;" title="Blue"></button>
                <button class="color-option" data-color="#FF9800" style="background: #FF9800;" title="Orange"></button>
                <button class="color-option" data-color="#E91E63" style="background: #E91E63;" title="Pink"></button>
                <button class="color-option" data-color="#9C27B0" style="background: #9C27B0;" title="Purple"></button>
            </div>
        </div>
        <button class="tooltip-btn comment-btn" title="Add Comment">Comment</button>
        <button class="tooltip-btn note-btn" title="Add as Note">Add Note</button>
        <button class="tooltip-btn copy-btn" title="Copy">Copy</button>
        <button class="tooltip-btn synonyms-btn" title="Synonyms">Synonyms</button>
        <button class="tooltip-btn review-btn" title="Add to Review Queue">📚 Review</button>
    `;
    selectionTooltip.style.cssText = `
        position: fixed;
        display: none;
        background: #333;
        border-radius: 8px;
        padding: 4px 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        z-index: 10000;
        gap: 4px;
    `;

    document.body.appendChild(selectionTooltip);

    // Style the buttons
    selectionTooltip.querySelectorAll('.tooltip-btn').forEach(btn => {
        btn.style.cssText = `
            background: none;
            border: none;
            font-size: 12px;
            padding: 6px 10px;
            cursor: pointer;
            border-radius: 4px;
            transition: background 0.2s;
            color: #fff;
            white-space: nowrap;
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'rgba(255,255,255,0.2)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'none';
        });
    });

    // Style the highlight group
    const highlightGroup = selectionTooltip.querySelector('.highlight-group');
    if (highlightGroup) {
        highlightGroup.style.cssText = `
            position: relative;
            display: flex;
            align-items: center;
        `;
    }

    // Style the highlight colors dropdown
    const colorsDropdown = selectionTooltip.querySelector('.highlight-colors');
    if (colorsDropdown) {
        colorsDropdown.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            background: #444;
            border-radius: 6px;
            padding: 6px;
            display: none;
            gap: 4px;
            flex-wrap: wrap;
            width: 100px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            margin-top: 4px;
        `;
    }

    // Style color option buttons
    selectionTooltip.querySelectorAll('.color-option').forEach(btn => {
        btn.style.cssText = `
            width: 24px;
            height: 24px;
            border: 2px solid transparent;
            border-radius: 50%;
            cursor: pointer;
            transition: transform 0.2s, border-color 0.2s;
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.15)';
            btn.style.borderColor = '#fff';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.borderColor = 'transparent';
        });

        // Color selection handler
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const color = btn.dataset.color;
            currentHighlightColor = color;

            // Visual feedback on selected color
            selectionTooltip.querySelectorAll('.color-option').forEach(b => {
                b.style.borderColor = 'transparent';
            });
            btn.style.borderColor = '#fff';

            // Hide dropdown after selection
            if (colorsDropdown) {
                colorsDropdown.style.display = 'none';
            }
        });
    });

    // Toggle colors dropdown on highlight button right-click or long press
    const highlightBtn = selectionTooltip.querySelector('.highlight-btn');
    if (highlightBtn && colorsDropdown) {
        highlightBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            colorsDropdown.style.display = colorsDropdown.style.display === 'flex' ? 'none' : 'flex';
        });

        // Add visual indicator that right-click shows colors
        highlightBtn.title = 'Highlight (Right-click for colors)';
    }

    return selectionTooltip;
}

function showSelectionTooltip(selection) {
    const tooltip = createSelectionTooltip();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    tooltip.style.display = 'flex';
    tooltip.style.left = `${rect.left + rect.width / 2 - 80}px`;
    tooltip.style.top = `${rect.top - 45}px`;

    // Ensure tooltip stays in viewport
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.left < 5) {
        tooltip.style.left = '5px';
    }
    if (tooltipRect.right > window.innerWidth - 5) {
        tooltip.style.left = `${window.innerWidth - tooltipRect.width - 5}px`;
    }
    if (tooltipRect.top < 5) {
        tooltip.style.top = `${rect.bottom + 5}px`;
    }

    const selectedText = selection.toString().trim();

    // Highlight button
    const highlightBtn = tooltip.querySelector('.highlight-btn');
    highlightBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (typeof createHighlight === 'function') {
            createHighlight(selection, 'highlight', null, currentHighlightColor);
        }
        hideSelectionTooltip();
        selection.removeAllRanges();
    };

    // Comment button (Edge/Google Docs style)
    const commentBtn = tooltip.querySelector('.comment-btn');
    commentBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Get selection rects before dialog opens
        const range = selection.getRangeAt(0);
        const clientRects = range.getClientRects();

        // Find page element
        let pageElement = range.commonAncestorContainer;
        while (pageElement && !pageElement.classList?.contains('page')) {
            pageElement = pageElement.parentElement;
        }

        if (pageElement) {
            const pageNumber = parseInt(pageElement.dataset.pageNumber) || 1;

            // Use content area (canvas) for accurate positioning like highlight_manager
            const canvasWrapper = pageElement.querySelector('.canvasWrapper');
            const canvas = pageElement.querySelector('canvas');
            const contentElement = canvasWrapper || canvas || pageElement;
            const contentRect = contentElement.getBoundingClientRect();

            // Filter and convert to page-relative coordinates
            const rects = [];
            for (let i = 0; i < clientRects.length; i++) {
                const rect = clientRects[i];
                // Filter out too small or too tall rects
                if (rect.width < 2 || rect.height < 2 || rect.height > 80) continue;

                rects.push({
                    left: rect.left - contentRect.left,
                    top: rect.top - contentRect.top,
                    width: rect.width,
                    height: rect.height
                });
            }

            // Show the add comment dialog
            if (rects.length > 0) {
                if (typeof showAddCommentDialog === 'function') {
                    showAddCommentDialog(selectedText, rects, pageNumber);
                } else if (window.showAddCommentDialog) {
                    window.showAddCommentDialog(selectedText, rects, pageNumber);
                } else {
                    console.error('Comment manager not loaded');
                }
            }
        }

        hideSelectionTooltip();
        selection.removeAllRanges();
    };

    // Note button
    const noteBtn = tooltip.querySelector('.note-btn');
    noteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        showAddNoteFromSelectionDialog(selectedText, selection);
        hideSelectionTooltip();
    };

    // Copy button  
    const copyBtn = tooltip.querySelector('.copy-btn');
    copyBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        navigator.clipboard.writeText(selectedText).then(() => {
            copyBtn.textContent = '✓';
            setTimeout(() => {
                copyBtn.textContent = 'Copy';
            }, 1500);
        });
        hideSelectionTooltip();
        selection.removeAllRanges();
    };

    // Synonyms button
    const synonymsBtn = tooltip.querySelector('.synonyms-btn');
    synonymsBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        showSynonymsModal(selectedText);
        hideSelectionTooltip();
        selection.removeAllRanges();
    };

    // Review button - Add to Spaced Repetition queue
    const reviewBtn = tooltip.querySelector('.review-btn');
    if (reviewBtn) {
        reviewBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Use SpacedRepetitionManager to show the add modal
            if (window.SpacedRepetitionManager && typeof window.SpacedRepetitionManager.showAddModalForText === 'function') {
                window.SpacedRepetitionManager.showAddModalForText(selectedText);
            } else {
                console.warn('SpacedRepetitionManager not available');
            }
            hideSelectionTooltip();
            selection.removeAllRanges();
        };
    }
}

function hideSelectionTooltip() {
    if (selectionTooltip) {
        selectionTooltip.style.display = 'none';
    }
}

// Synonyms Side Panel
let synonymsPanel = null;

function createSynonymsPanel() {
    if (synonymsPanel) return synonymsPanel;

    synonymsPanel = document.createElement('div');
    synonymsPanel.className = 'synonyms-side-panel';
    synonymsPanel.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        width: 300px;
        max-height: calc(100vh - 100px);
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        z-index: 9990;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: none;
        flex-direction: column;
        overflow: hidden;
    `;

    synonymsPanel.innerHTML = `
        <div class="synonyms-header" style="
            padding: 12px 16px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            cursor: grab;
            user-select: none;
        ">
            <h3 style="margin: 0; font-size: 15px; font-weight: 600;">📖 Synonyms</h3>
            <button id="close-synonyms-panel" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                font-size: 16px;
                cursor: pointer;
                padding: 2px 8px;
                border-radius: 6px;
                transition: background 0.2s;
            ">×</button>
        </div>
        <div id="synonyms-word-display" style="
            padding: 10px 16px;
            background: #f8f9fa;
            border-bottom: 1px solid #eee;
            font-size: 15px;
            font-weight: 600;
            color: #333;
            text-align: center;
        "></div>
        <div style="flex: 1; overflow-y: auto; padding: 10px;">
            <div id="synonyms-list" style="
                display: flex;
                flex-direction: column;
                gap: 8px;
            "></div>
            <div id="synonyms-error" style="
                text-align: center;
                padding: 20px;
                display: none;
                color: #d32f2f;
            "></div>
        </div>
    `;

    document.body.appendChild(synonymsPanel);

    // Make panel draggable
    if (window.makeDraggable) {
        window.makeDraggable(synonymsPanel, '.synonyms-header');
    }

    // Close button hover effect
    const closeBtn = synonymsPanel.querySelector('#close-synonyms-panel');
    closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = 'rgba(255,255,255,0.3)';
    });
    closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = 'rgba(255,255,255,0.2)';
    });
    closeBtn.addEventListener('click', () => {
        closeSynonymsPanel();
    });

    return synonymsPanel;
}

function showSynonymsModal(word) {
    const panel = createSynonymsPanel();
    const wordDisplay = panel.querySelector('#synonyms-word-display');
    const listEl = panel.querySelector('#synonyms-list');
    const errorEl = panel.querySelector('#synonyms-error');

    const normalizedWord = normalizeSynonymsQuery(word);
    if (!normalizedWord) {
        wordDisplay.textContent = `"${word}"`;
        listEl.innerHTML = '';
        errorEl.textContent = 'Select a single word to find synonyms.';
        errorEl.style.display = 'block';
        panel.style.display = 'flex';
        return;
    }

    // Reset state
    wordDisplay.textContent = `"${normalizedWord}"`;
    listEl.innerHTML = '';
    errorEl.style.display = 'none';

    // Show panel
    panel.style.display = 'flex';

    // Show global loading indicator
    if (window.showGlobalLoading) {
        window.showGlobalLoading();
    }

    // Fetch synonyms
    fetchSynonyms(normalizedWord).then(synonyms => {
        // Hide global loading
        if (window.hideGlobalLoading) {
            window.hideGlobalLoading();
        }

        if (synonyms && synonyms.length > 0) {
            synonyms.forEach(syn => {
                const card = document.createElement('div');
                card.style.cssText = `
                    background: #f8f9fa;
                    padding: 10px 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: 1px solid #e9ecef;
                `;
                card.innerHTML = `
                    <div style="font-weight: 600; font-size: 13px; color: #333;">${syn.word}</div>
                    ${syn.definition ? `<div style="font-size: 11px; color: #666; margin-top: 3px; line-height: 1.4;">${syn.definition}</div>` : ''}
                `;
                card.addEventListener('mouseenter', () => {
                    card.style.background = '#e9ecef';
                    card.style.borderColor = '#667eea';
                    card.style.transform = 'translateX(-3px)';
                });
                card.addEventListener('mouseleave', () => {
                    card.style.background = '#f8f9fa';
                    card.style.borderColor = '#e9ecef';
                    card.style.transform = 'translateX(0)';
                });
                card.addEventListener('click', () => {
                    navigator.clipboard.writeText(syn.word);
                    const originalHTML = card.innerHTML;
                    card.innerHTML = `<div style="text-align: center; color: #28a745; font-weight: 600;">✓ Copied!</div>`;
                    card.style.background = '#d4edda';
                    card.style.borderColor = '#28a745';
                    setTimeout(() => {
                        card.innerHTML = originalHTML;
                        card.style.background = '#f8f9fa';
                        card.style.borderColor = '#e9ecef';
                    }, 1000);
                });
                listEl.appendChild(card);
            });
        } else {
            errorEl.textContent = 'No synonyms found for this word.';
            errorEl.style.display = 'block';
        }
    }).catch(err => {
        // Hide global loading
        if (window.hideGlobalLoading) {
            window.hideGlobalLoading();
        }

        // Show specific error message based on error type
        if (err.message === 'No API key configured') {
            errorEl.innerHTML = `
                <div style="color: #f59e0b; margin-bottom: 8px;">⚠️ API Key Required</div>
                <div style="font-size: 12px; color: #666;">
                    Please configure your Gemini API key in settings to use the synonyms feature.
                </div>
            `;
        } else {
            errorEl.textContent = 'Error fetching synonyms. Please try again.';
        }
        errorEl.style.display = 'block';
        console.error('Synonyms error:', err);
    });
}

function closeSynonymsPanel() {
    if (synonymsPanel) {
        synonymsPanel.style.display = 'none';
    }
}

// Keep old function name for compatibility
function closeSynonymsModal() {
    closeSynonymsPanel();
}

async function fetchSynonyms(word) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['geminiApiKey'], async (result) => {
            const query = normalizeSynonymsQuery(word);
            if (!query) {
                resolve([]);
                return;
            }

            const apiKey = result.geminiApiKey;

            // Models to try in order (primary, then fallbacks)
            const models = [
                'gemini-2.0-flash',
                'gemini-2.0-flash-lite',
                'gemini-1.5-flash-latest',
                'gemini-1.5-pro'
            ];

            const prompt = `Give me 6-8 synonyms for the word "${query}". For each synonym, provide a brief definition.
                                    
Return ONLY a JSON array in this exact format, no other text:
[{"word": "synonym1", "definition": "brief definition"}, {"word": "synonym2", "definition": "brief definition"}]`;

            // If no API key, fall back to public API.
            if (!apiKey) {
                try {
                    resolve(await fetchSynonymsFromDatamuse(query));
                } catch (e) {
                    resolve([]);
                }
                return;
            }

            for (const model of models) {
                try {
                    const response = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [{ text: prompt }]
                                }],
                                generationConfig: {
                                    temperature: 0.3,
                                    maxOutputTokens: 500,
                                    responseMimeType: 'application/json'
                                }
                            })
                        }
                    );

                    // Check for rate limiting or not found - try next model
                    if (response.status === 429 || response.status === 404) {
                        continue;
                    }

                    const data = await response.json();

                    if (data.error) {
                        continue;
                    }

                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

                    // Parse JSON from response (handle raw JSON or JSON inside code fences)
                    const jsonCandidate = (text || '').trim();
                    const bracketMatch = jsonCandidate.match(/\[[\s\S]*\]/);
                    const payload = bracketMatch ? bracketMatch[0] : jsonCandidate;

                    try {
                        const parsed = JSON.parse(payload);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            resolve(parsed);
                            return;
                        }
                    } catch (e) {
                        // try next model
                    }
                } catch (error) {
                    continue;
                }
            }

            // All models failed; fall back to a public synonyms API.
            try {
                resolve(await fetchSynonymsFromDatamuse(query));
            } catch (e) {
                resolve([]);
            }
        });
    });
}

function normalizeSynonymsQuery(input) {
    if (!input) return '';
    const str = String(input).trim();
    // Prefer the first "word-like" token.
    const token = (str.match(/[A-Za-z][A-Za-z\-']{0,63}/) || [])[0] || '';
    return token.toLowerCase();
}

async function fetchSynonymsFromDatamuse(word) {
    const url = `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=10`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    if (!Array.isArray(data)) return [];
    return data
        .filter(x => x && typeof x.word === 'string')
        .slice(0, 10)
        .map(x => ({ word: x.word, definition: '' }));
}

function showAddNoteFromSelectionDialog(selectedText, selection) {
    // IMPORTANT: Store all selection data immediately before the dialog is created
    // The selection will be lost when the dialog opens and receives focus
    let storedRange = null;
    let storedRects = [];
    let pageElement = null;
    let storedPageNumber = 1;

    if (selection && selection.rangeCount > 0) {
        storedRange = selection.getRangeAt(0).cloneRange();

        // Get rects immediately while selection is still valid
        const clientRects = storedRange.getClientRects();

        // Find page element
        pageElement = storedRange.commonAncestorContainer;
        while (pageElement && !pageElement.classList?.contains('page')) {
            pageElement = pageElement.parentElement;
        }

        if (pageElement) {
            storedPageNumber = parseInt(pageElement.dataset.pageNumber) || 1;
            const pageRect = pageElement.getBoundingClientRect();
            const pageStyle = window.getComputedStyle(pageElement);
            const borderLeft = parseFloat(pageStyle.borderLeftWidth) || 0;
            const borderTop = parseFloat(pageStyle.borderTopWidth) || 0;
            const pageWidth = pageRect.width;
            const pageHeight = pageRect.height;

            // First, collect ALL rects without filtering
            const allRects = [];
            for (let i = 0; i < clientRects.length; i++) {
                const rect = clientRects[i];
                allRects.push({
                    left: rect.left - pageRect.left - borderLeft,
                    top: rect.top - pageRect.top - borderTop,
                    width: rect.width,
                    height: rect.height
                });
            }

            // Filter out invalid rects
            for (const relativeRect of allRects) {
                // Filter out invalid rects:
                // - Too small (width < 2 or height < 2)
                // - Too tall (height > 80, likely spanning multiple lines incorrectly)
                // - Full page selections (width > 90% of page and height > 30% of page)
                const isTooSmall = relativeRect.width < 2 || relativeRect.height < 2;
                const isTooTall = relativeRect.height > 80;
                const isFullPage = relativeRect.width > pageWidth * 0.9 && relativeRect.height > pageHeight * 0.3;

                if (!isTooSmall && !isTooTall && !isFullPage) {
                    storedRects.push(relativeRect);
                }
            }

            // If filtering removed all rects, use original rects with only basic size filter
            if (storedRects.length === 0 && allRects.length > 0) {
                storedRects = allRects.filter(r => r.width >= 2 && r.height >= 2);
            }

            // Merge overlapping rects on the same line
            storedRects = mergeRectsOnSameLine(storedRects);

        }
    }

    // Get page number from selection before it's lost (backup)
    let pageNumber = storedPageNumber;
    const pageEl = selection?.anchorNode?.parentElement?.closest('.page');
    if (pageEl) {
        pageNumber = parseInt(pageEl.dataset.pageNumber) || pageNumber;
    }

    // Load folders and default settings
    chrome.storage.local.get(['noteFolders', 'noteSettings'], (result) => {
        const folders = result.noteFolders || [];
        const settings = result.noteSettings || {};
        const defaultFolderId = settings.defaultFolderId || '';
        const useDefaultFolder = settings.useDefaultFolder || false;

        // Define colors for picker
        const colors = ['#667eea', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        let selectedColor = '#90CAF9'; // Default light blue for note highlights

        // If using default folder, get folder's color
        if (useDefaultFolder && defaultFolderId) {
            const folder = folders.find(f => f.id === defaultFolderId);
            if (folder && folder.color) {
                selectedColor = folder.color;
            }
        }

        // Create dialog overlay
        const overlay = document.createElement('div');
        overlay.className = 'note-dialog-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const dialog = document.createElement('div');
        dialog.className = 'note-dialog';
        dialog.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 20px;
            width: 480px;
            max-width: 90vw;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">📝 Add Note from Selection</h3>
            <div style="background: #f5f5f5; padding: 10px; border-radius: 8px; margin-bottom: 15px; max-height: 100px; overflow-y: auto;">
                <small style="color: #666;">Selected text:</small>
                <p style="margin: 5px 0 0 0; font-style: italic; color: #333; font-size: 13px;">"${selectedText.substring(0, 300)}${selectedText.length > 300 ? '...' : ''}"</p>
            </div>
            <textarea id="noteContent" placeholder="Add your thoughts, comments, or analysis..." style="
                width: 100%;
                height: 100px;
                padding: 12px;
                border: 1px solid #ddd;
                border-radius: 8px;
                resize: none;
                font-size: 14px;
                box-sizing: border-box;
                margin-bottom: 12px;
            "></textarea>
            
            <!-- Folder Selection -->
            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 13px; color: #666; margin-bottom: 6px;">📁 Save to folder:</label>
                <select id="noteFolderSelect" style="
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 14px;
                    background: white;
                    cursor: pointer;
                ">
                    <option value="">No folder (All Notes)</option>
                    ${folders.map(f => `<option value="${f.id}" data-color="${f.color || '#667eea'}" ${(useDefaultFolder && f.id === defaultFolderId) ? 'selected' : ''}>${f.name}</option>`).join('')}
                </select>
            </div>
            
            <!-- Default Folder Setting -->
            <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="setDefaultFolder" ${useDefaultFolder ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">
                <label for="setDefaultFolder" style="font-size: 13px; color: #666; cursor: pointer;">Always use selected folder as default</label>
            </div>
            
            <!-- Highlight Color -->
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-size: 13px; color: #666; margin-bottom: 6px;">🎨 Highlight color:</label>
                <div id="colorPicker" style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${colors.map(c => `
                        <div class="color-opt" data-color="${c}" style="
                            width: 28px;
                            height: 28px;
                            border-radius: 50%;
                            background: ${c};
                            cursor: pointer;
                            border: 2px solid ${c === selectedColor ? '#333' : 'transparent'};
                            transition: all 0.2s;
                        "></div>
                    `).join('')}
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="cancelNoteBtn" style="
                    padding: 8px 16px;
                    border: 1px solid #ddd;
                    background: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                ">Cancel</button>
                <button id="saveNoteBtn" style="
                    padding: 8px 16px;
                    border: none;
                    background: #4CAF50;
                    color: white;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 14px;
                ">Save Note</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const textarea = dialog.querySelector('#noteContent');
        // Auto-fill with the selected text (user can edit before saving)
        textarea.value = selectedText || '';
        textarea.focus();
        try {
            // Place cursor at the end for easy appending.
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        } catch (e) {
        }

        // Color picker handler
        const colorPicker = dialog.querySelector('#colorPicker');
        colorPicker.querySelectorAll('.color-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                colorPicker.querySelectorAll('.color-opt').forEach(o => o.style.border = '2px solid transparent');
                opt.style.border = '2px solid #333';
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
                    o.style.border = o.dataset.color === selectedColor ? '2px solid #333' : '2px solid transparent';
                });
            }
        });

        // Cancel button
        dialog.querySelector('#cancelNoteBtn').onclick = () => {
            overlay.remove();
            selection.removeAllRanges();
        };

        // Save button
        dialog.querySelector('#saveNoteBtn').onclick = async () => {
            const noteContent = textarea.value.trim();
            const folderId = folderSelect.value || null;
            const setAsDefault = dialog.querySelector('#setDefaultFolder').checked;

            // Save default folder preference
            if (setAsDefault && folderId) {
                chrome.storage.local.set({
                    noteSettings: {
                        defaultFolderId: folderId,
                        useDefaultFolder: true
                    }
                });
            } else if (!setAsDefault) {
                chrome.storage.local.set({
                    noteSettings: {
                        defaultFolderId: '',
                        useDefaultFolder: false
                    }
                });
            }

            // Create a highlight for the selection using the stored rects
            let highlightId = null;
            if (window.createHighlightFromRects && storedRects.length > 0) {
                try {
                    const highlight = window.createHighlightFromRects(
                        selectedText,
                        storedRects,
                        storedPageNumber,
                        'highlight',
                        noteContent,
                        selectedColor // Use user-selected color
                    );
                    if (highlight) {
                        highlightId = highlight.id;
                    }
                } catch (e) {
                    console.error('SelectionManager: Error creating highlight:', e);
                }
            } else if (window.createHighlight && storedRange) {
                // Fallback to original method
                try {
                    const highlight = window.createHighlight(storedRange, 'highlight', noteContent, selectedColor);
                    if (highlight) {
                        highlightId = highlight.id;
                    }
                } catch (e) {
                    console.error('SelectionManager: Error creating highlight from range:', e);
                }
            } else {
                console.warn('SelectionManager: No highlight methods available or no stored data', {
                    hasCreateHighlightFromRects: !!window.createHighlightFromRects,
                    storedRectsCount: storedRects.length,
                    hasCreateHighlight: !!window.createHighlight,
                    hasStoredRange: !!storedRange
                });
            }

            // Save to GlobalNotesManager (the unified notes system)
            if (window.globalNotesManager) {
                // Get current PDF info
                const urlParams = new URLSearchParams(window.location.search);
                const pdfUrl = urlParams.get('file') || window.location.href;
                const pdfTitle = document.title?.replace(' - PDF Viewer', '').replace('.pdf', '') || 'Unknown PDF';

                const note = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    title: (noteContent || selectedText).substring(0, 50) + ((noteContent || selectedText).length > 50 ? '...' : ''),
                    content: noteContent || selectedText,
                    selectedText: selectedText,
                    color: selectedColor,
                    pdfUrl: pdfUrl,
                    pdfTitle: pdfTitle,
                    page: pageNumber,
                    folderId: folderId,
                    highlightId: highlightId,
                    isStarred: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                // Add to global notes
                window.globalNotesManager.notes.push(note);
                await window.globalNotesManager.saveNotes();

                if (window.globalNotesManager.isOpen) {
                    window.globalNotesManager.renderNotes();
                }

                showNoteSavedToast(folderId, folders);
            } else if (window.pdfNotesManager) {
                // Fallback: Use pdfNotesManager
                window.pdfNotesManager.addNote(noteContent || selectedText, pageNumber, selectedText);
            } else {
                // Fallback: save to localStorage
                const note = {
                    id: 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    selectedText: selectedText,
                    content: noteContent,
                    pageNumber: pageNumber,
                    createdAt: new Date().toISOString(),
                    type: 'selection',
                    highlightId: highlightId
                };
                saveNoteToStorage(note);
            }

            overlay.remove();
        };

        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
                selection.removeAllRanges();
            }
        };

        // Close on Escape
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                selection.removeAllRanges();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

function showNoteSavedToast(folderId, folders) {
    let message = '✓ Note saved';
    if (folderId) {
        const folder = folders.find(f => f.id === folderId);
        if (folder) {
            message = `✓ Note saved to "${folder.name}"`;
        }
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10002;
        animation: fadeIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

function saveNoteToStorage(note) {
    // Get PDF ID
    const urlParams = new URLSearchParams(window.location.search);
    const pdfUrl = urlParams.get('file') || window.location.href;
    let hash = 0;
    for (let i = 0; i < pdfUrl.length; i++) {
        const char = pdfUrl.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const pdfId = 'pdf_' + Math.abs(hash).toString(16);
    const storageKey = `pdfNotes_${pdfId}`;

    try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get([storageKey], (result) => {
                const notes = result[storageKey] || [];
                notes.unshift(note);
                chrome.storage.local.set({ [storageKey]: notes });
            });
        } else {
            const notes = JSON.parse(localStorage.getItem(storageKey) || '[]');
            notes.unshift(note);
            localStorage.setItem(storageKey, JSON.stringify(notes));
        }
    } catch (e) {
        console.error('Error saving note:', e);
    }
}

function setupTextSelectionListener() {
    // Setup highlight mode toggle
    const highlightToggle = document.getElementById('highlightModeToggle');
    const colorPicker = document.getElementById('highlightColorPicker');

    if (highlightToggle) {
        highlightToggle.addEventListener('click', () => {
            highlightModeEnabled = !highlightModeEnabled;
            highlightToggle.classList.toggle('active', highlightModeEnabled);

            // Show/hide color picker
            if (colorPicker) {
                colorPicker.classList.toggle('hidden', !highlightModeEnabled);
            }

            // Change cursor
            document.body.style.cursor = highlightModeEnabled ? 'text' : '';
        });
    }

    // Setup color picker
    if (colorPicker) {
        colorPicker.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const color = btn.dataset.color;
                currentHighlightColor = color;

                // Update active state
                colorPicker.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Set default active color
        const defaultBtn = colorPicker.querySelector('[data-color="#FFEB3B"]');
        if (defaultBtn) defaultBtn.classList.add('active');
    }

    // Handle text selection - show tooltip
    document.addEventListener('mouseup', (e) => {
        // Small delay to let selection complete
        setTimeout(() => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            if (selectedText && selectedText.length > 0) {
                // Check if selection is within viewer
                const viewerContainer = document.getElementById('viewerContainer');
                if (viewerContainer && viewerContainer.contains(selection.anchorNode)) {
                    if (highlightModeEnabled) {
                        // Auto-highlight in highlight mode
                        const highlight = createHighlight(selection, 'highlight', null, currentHighlightColor);
                        if (highlight) {
                            selection.removeAllRanges();
                        }
                    } else {
                        // Show tooltip for selection actions
                        showSelectionTooltip(selection);
                    }
                } else {
                    hideSelectionTooltip();
                }
            } else {
                hideSelectionTooltip();
            }
        }, 10);
    });

    // Hide tooltip on scroll or click elsewhere
    document.addEventListener('mousedown', (e) => {
        if (selectionTooltip && !selectionTooltip.contains(e.target)) {
            hideSelectionTooltip();
        }
    });

    document.addEventListener('scroll', hideSelectionTooltip, true);

    // Keep browser context menu (remove the override)
    // The old contextmenu listener is removed
}
