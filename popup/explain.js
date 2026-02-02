document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const text = urlParams.get('text') || '';
    const mode = urlParams.get('mode') || 'explain';

    document.getElementById('selected-text').textContent = `"${text}"`;

    if (mode === 'question') {
        document.title = "Generate Question";
        document.querySelector('h2').textContent = "Generated Question";
    }

    const explanationBox = document.getElementById('explanation-box');

    setTimeout(() => {
        processExplanation(text, mode);
    }, 1000);

    document.getElementById('close-btn').addEventListener('click', () => {
        window.close();
    });

    document.getElementById('save-note-btn').addEventListener('click', () => {
        const explanation = explanationBox.innerText;
        saveToNotebook(text, explanation, mode);
    });

    document.getElementById('settings-btn').addEventListener('click', () => {
        showSettings(explanationBox, text);
    });
});

async function processExplanation(text, mode) {
    const box = document.getElementById('explanation-box');

    // Check for API Key first
    chrome.storage.local.get(['geminiApiKey'], async (result) => {
        if (result.geminiApiKey) {
            try {
                const explanation = await fetchGeminiExplanation(text, result.geminiApiKey, mode);
                // Use simple local parser instead of marked library to avoid CSP issues
                box.innerHTML = `<div class="result-content">${parseMarkdown(explanation)}</div>`;
            } catch (e) {
                box.innerHTML = `<div class="result-content" style="color:red;">Error: ${e.message}</div>`;
                // Increase timeout to let user read error
                setTimeout(() => showSettings(box, text), 4000);
            }
            return;
        }


        // Fallback to Dictionary for single words if no key
        if (text.trim().split(/\s+/).length < 3) {
            try {
                const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${text.trim()}`);
                const data = await res.json();

                if (Array.isArray(data)) {
                    let html = `<h3>Definition of <b>${data[0].word}</b></h3>`;
                    data[0].meanings.forEach(m => {
                        html += `<p><i>${m.partOfSpeech}</i></p><ul>`;
                        m.definitions.slice(0, 2).forEach(d => {
                            html += `<li>${d.definition}</li>`;
                        });
                        html += `</ul>`;
                    });
                    box.innerHTML = `<div class="result-content">${html}</div>`;
                } else {
                    throw new Error('No definition found');
                }
            } catch (e) {
                // Show informative error before settings
                showErrorThenSettings(box, text, 'Could not find definition in dictionary. Set up AI for better explanations.');
            }
        } else {
            // Text is too long for dictionary fallback
            showErrorThenSettings(box, text, 'AI key required for explaining longer text. Set up your free API key below.');
        }
    });
}

/**
 * Show an error message briefly, then transition to settings
 */
function showErrorThenSettings(box, text, errorMessage) {
    box.innerHTML = `
        <div class="result-content" style="text-align: center; padding: 20px;">
            <div style="font-size: 2rem; margin-bottom: 10px;">🔍</div>
            <p style="color: #e74c3c; margin-bottom: 15px;">${errorMessage}</p>
            <div class="loading-hint" style="color: #666; font-size: 12px;">Loading setup options...</div>
        </div>
    `;
    setTimeout(() => showSettings(box, text), 2500);
}

async function fetchGeminiExplanation(text, apiKey, mode) {
    const candidateModels = [
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro'
    ];

    let lastError = null;

    for (const model of candidateModels) {
        try {
            return await fetchFromModel(model, text, apiKey, mode);
        } catch (error) {
            console.warn(`Failed to fetch from ${model}:`, error);
            lastError = error;

            // Check if we should continue to the next model
            const isModelError = error.message.includes('not found') ||
                error.message.includes('not supported') ||
                error.message.includes('404') ||
                error.message.includes('400');

            if (!isModelError) {
                // If it's a different error (like 401 Unauthorized), stop trying.
                throw error;
            }
        }
    }

    // If all models failed, try to list available models to give a helpful error message
    try {
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const listRes = await fetch(listUrl);
        const listData = await listRes.json();

        if (listData.models) {
            const availableModels = listData.models.map(m => m.name.replace('models/', '')).join(', ');
            throw new Error(`All tried models failed. Your API key has access to: ${availableModels}. Please update the code or check your API key permissions.`);
        }
    } catch (listError) {
        console.error("Failed to list models", listError);
    }

    throw new Error(`All models failed. Last error: ${lastError?.message}`);
}

async function fetchFromModel(model, text, apiKey, mode) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    let prompt = `Explain this text simply and concisely: "${text}"`;
    if (mode === 'question') {
        prompt = `Generate a single, concise question based on this text: "${text}"`;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('No explanation returned from AI.');
    }
    return data.candidates[0].content.parts[0].text;
}

function showSettings(box, text) {
    box.innerHTML = `
        <div class="api-key-section">
            <h3>Setup Free AI</h3>
            <p style="font-size:13px; color:#666;">To get automatic explanations, you need a free Google Gemini API Key.</p>
            <input type="password" id="api-key-input" class="api-key-input" placeholder="Paste Gemini API Key here">
            <div style="margin-bottom:10px;">
                <a href="https://aistudio.google.com/app/apikey" target="_blank" class="link">Get a Free Key here</a>
            </div>
            <button id="save-key-btn" class="primary" style="width:100%;">Save & Explain</button>
            <div style="margin-top:15px; border-top:1px solid #eee; padding-top:10px;">
                <p style="font-size:12px; color:#888;">Or use Edge Copilot externally:</p>
                <button id="open-copilot-btn" style="width:100%;">Open in Edge Copilot</button>
            </div>
        </div>
    `;

    document.getElementById('save-key-btn').addEventListener('click', () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (key) {
            chrome.storage.local.set({ geminiApiKey: key }, () => {
                box.innerHTML = '<div class="loading"><div class="spinner"></div><div>Processing...</div></div>';
                processExplanation(text);
            });
        }
    });

    document.getElementById('open-copilot-btn').addEventListener('click', () => {
        const query = encodeURIComponent("Explain this text: " + text);
        chrome.tabs.create({ url: `https://www.bing.com/search?q=${query}&showconv=1` });
        window.close();
    });
}

function saveToNotebook(original, explanation, mode) {
    chrome.storage.local.get(['notebooks', 'currentNotebook'], (result) => {
        const notebooks = result.notebooks || { 'default': '' };
        const current = result.currentNotebook || 'default';

        // Ensure we are working with a string (HTML) for the new format
        let currentContent = notebooks[current];
        if (Array.isArray(currentContent)) {
            currentContent = currentContent.map(b => `<p>${b.content}</p>`).join('');
        } else if (!currentContent) {
            currentContent = '';
        }

        let newEntry = '';
        if (mode === 'question') {
            // Save Question and Answer (Original Text)
            newEntry = `<p><b>Q:</b> ${explanation}</p><p><b>A:</b> ${original}</p><p><br></p>`;
        } else {
            // Save Explanation only
            newEntry = `<p>${explanation}</p><p><br></p>`;
        }

        notebooks[current] = currentContent + newEntry;

        chrome.storage.local.set({ notebooks: notebooks }, () => {
            const btn = document.getElementById('save-note-btn');
            btn.textContent = 'Saved!';
            btn.disabled = true;
            setTimeout(() => window.close(), 1000);
        });
    });
}

// Simple Markdown-like parser for local use
function parseMarkdown(text) {
    // Convert bold (**text** or __text__) to <b>text</b>
    text = text.replace(/(\*\*|__)(.*?)\1/g, '<b>$2</b>');
    // Convert italic (*text* or _text_) to <i>text</i>
    text = text.replace(/(\*|_)(.*?)\1/g, '<i>$2</i>');
    // Convert inline code (`code`) to <code>code</code>
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Convert links ([text](url)) to <a href="url">text</a>
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/g, '<a href="$2">$1</a>');
    // Convert line breaks to <br>
    text = text.replace(/\n/g, '<br>');
    return text;
}