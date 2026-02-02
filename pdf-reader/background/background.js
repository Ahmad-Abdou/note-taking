// ============================================================================
// PDF READER PRO - BACKGROUND SERVICE WORKER
// ============================================================================

// Setup context menus
function setupContextMenus() {
    chrome.contextMenus.removeAll(() => {
        // Create parent menu
        chrome.contextMenus.create({
            id: "pdf-reader-pro-parent",
            title: "PDF Reader Pro",
            contexts: ["selection"]
        });

        chrome.contextMenus.create({
            id: "add-to-vocabulary",
            parentId: "pdf-reader-pro-parent",
            title: "Add to Vocabulary",
            contexts: ["selection"]
        });
    });
}

// Run on install, startup, and immediately when script loads
chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);
setupContextMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "add-to-vocabulary" && info.selectionText) {
        const text = info.selectionText.trim();
        autoAddToVocabulary(text);
    }
});

// Show toast notification on the active tab
async function showToast(title, message, type = 'success') {
    const fullMessage = `${title}: ${message}`;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab && tab.id) {
            chrome.tabs.sendMessage(tab.id, {
                action: 'show_toast',
                message: fullMessage,
                type: type
            }, (response) => {
                if (chrome.runtime.lastError) {
                    // Content script not available
                }
            });
        }
    } catch (err) {
        // Silently fail
    }
}

// Auto-translate and add word to vocabulary
async function autoAddToVocabulary(word) {
    try {
        const result = await chrome.storage.local.get(['geminiApiKey', 'vocabularyList']);
        const apiKey = result.geminiApiKey;
        const vocabulary = result.vocabularyList || [];

        console.log('[Vocabulary] API Key present:', !!apiKey);
        console.log('[Vocabulary] API Key length:', apiKey ? apiKey.length : 0);
        console.log('[Vocabulary] API Key starts with:', apiKey ? apiKey.substring(0, 8) + '...' : 'N/A');

        // Check if word already exists
        if (vocabulary.some(v => v.word.toLowerCase() === word.toLowerCase())) {
            showToast('Already Exists', `"${word}" is already in your vocabulary list.`, 'warning');
            return;
        }

        if (!apiKey) {
            showToast('API Key Required', 'Set your Gemini API key in extension options.', 'error');
            return;
        }

        // First, list available models
        try {
            const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const listData = await listResponse.json();
            console.log('[Vocabulary] Available models:', listData);
            if (listData.models) {
                console.log('[Vocabulary] Model names:', listData.models.map(m => m.name));
            }
        } catch (e) {
            console.log('[Vocabulary] Failed to list models:', e);
        }

        // AI translate
        const prompt = `For the word/phrase "${word}", provide:
1. A clear English definition (1-2 sentences)
2. Arabic translation (الترجمة العربية)
3. An example sentence using the word

Format your response EXACTLY as JSON:
{
    "definition": "English definition here",
    "arabic": "الترجمة العربية هنا",
    "example": "Example sentence here"
}

Only respond with the JSON, no other text.`;

        // Models to try in order (prioritizing reliable ones)
        const models = [
            'gemini-flash-latest',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-pro-latest'
        ];

        let lastError = null;
        let success = false;

        for (const model of models) {
            try {
                console.log(`[Vocabulary] Trying model: ${model}`);
                // Using v1beta endpoint
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.3,
                            maxOutputTokens: 500
                        }
                    })
                });

                console.log(`[Vocabulary] Model ${model} response status: ${response.status}`);

                // Log response body for errors
                if (!response.ok) {
                    const errorBody = await response.text();
                    console.log(`[Vocabulary] Error response:`, errorBody);
                }

                if (response.status === 429 || response.status === 404 || response.status === 503) {
                    console.log(`[Vocabulary] Model ${model} unavailable (${response.status}), trying next...`);
                    continue;
                }

                const data = await response.json();

                if (data.error) {
                    console.log(`[Vocabulary] Model ${model} error:`, data.error.message);
                    lastError = data.error;
                    continue;
                }

                if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                    let text = data.candidates[0].content.parts[0].text.trim();

                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);

                        const newWord = {
                            id: Date.now(),
                            word: word,
                            definition: parsed.definition || '',
                            arabic: parsed.arabic || '',
                            example: parsed.example || '',
                            category: 'general',
                            mastery: 0,
                            dateAdded: new Date().toISOString()
                        };

                        vocabulary.push(newWord);
                        await chrome.storage.local.set({ vocabularyList: vocabulary });

                        console.log(`[Vocabulary] Successfully added word using ${model}`);
                        showToast('Word Added!', `"${word}" added with translation.`, 'success');
                        success = true;
                        return;
                    } else {
                        console.error('[Vocabulary] Could not parse JSON from response');
                        continue;
                    }
                }
            } catch (error) {
                console.log(`[Vocabulary] Model ${model} failed:`, error.message);
                lastError = error;
                continue;
            }
        }

        if (!success) {
            if (lastError?.message) {
                showToast('API Error', lastError.message, 'error');
            } else {
                showToast('Error', 'All translation models are currently unavailable. Please try again later.', 'error');
            }
        }
    } catch (error) {
        console.error('[Vocabulary] Auto vocabulary error:', error);
        showToast('Error', 'Failed to add word. Please try again.', 'error');
    }
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle area capture for screenshots
    if (request.action === 'capture_selection') {
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) {
                sendResponse({ status: 'error', message: 'Capture failed' });
                return;
            }

            cropImage(dataUrl, request.area, (croppedDataUrl) => {
                sendResponse({ status: 'success', imageData: croppedDataUrl });
            });
        });
        return true;
    }
});

function cropImage(dataUrl, area, callback) {
    createImageBitmap(fetch(dataUrl).then(r => r.blob())).then(bitmap => {
        const canvas = new OffscreenCanvas(area.width, area.height);
        const ctx = canvas.getContext('2d');

        const ratio = area.devicePixelRatio || 1;

        ctx.drawImage(bitmap,
            area.x * ratio, area.y * ratio, area.width * ratio, area.height * ratio,
            0, 0, area.width, area.height
        );

        canvas.convertToBlob({ type: 'image/png' }).then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => callback(reader.result);
            reader.readAsDataURL(blob);
        });
    }).catch(err => {
        console.error('Crop failed:', err);
        callback(dataUrl);
    });
}

// ============================================================================
// PDF REDIRECT - Open PDFs in our viewer
// ============================================================================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Check if it's a PDF and NOT already in our viewer
        if (tab.url.toLowerCase().endsWith('.pdf') &&
            !tab.url.includes('lib/pdfjs/web/viewer.html') &&
            !tab.url.includes('native_view=true')) {

            chrome.storage.local.get(['useAsDefaultPdfReader'], (result) => {
                const useAsDefault = result.useAsDefaultPdfReader !== false;

                if (useAsDefault) {
                    const viewerUrl = chrome.runtime.getURL('lib/pdfjs/web/viewer.html');
                    if (tab.url.startsWith('file://') || tab.url.startsWith('http')) {
                        const newUrl = `${viewerUrl}?file=${encodeURIComponent(tab.url)}`;
                        chrome.tabs.update(tabId, { url: newUrl });
                    }
                }
            });
        }
    }
});

// ============================================================================
// KEYBOARD COMMANDS
// ============================================================================

chrome.commands.onCommand.addListener((command) => {
    if (command === 'capture_selection') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'trigger_capture' });
            }
        });
    }
});
