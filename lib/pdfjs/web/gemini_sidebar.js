// Gemini Sidebar Entry Point

let userInput, sendBtn;
let sourceText, translatedText, targetLanguage, translationLabel, clearBtn;
let tabs, tabPanels;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM element references
    chatContainer = document.getElementById('chat-container');
    userInput = document.getElementById('user-input');
    sendBtn = document.getElementById('send-btn');
    sourceText = document.getElementById('source-text');
    translatedText = document.getElementById('translated-text');
    targetLanguage = document.getElementById('target-language');
    translationLabel = document.getElementById('translation-label');
    clearBtn = document.getElementById('clear-translation');
    tabs = document.querySelectorAll('.tab');
    tabPanels = document.querySelectorAll('.tab-panel');
    notesList = document.getElementById('notes-list');
    clearNotesBtn = document.getElementById('clear-notes-btn');

    initializeEventListeners();

    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            apiKey = result.geminiApiKey;
        } else {
            // Prompt for API Key
            showApiKeyPrompt();
        }
    });

    // Load notes initially
    loadNotes();
});

function showApiKeyPrompt() {
    const container = document.getElementById('chat-container');
    const promptDiv = document.createElement('div');
    promptDiv.className = 'message ai-message';
    promptDiv.innerHTML = `
        <p>⚠️ API Key missing.</p>
        <input type="password" id="api-key-input" placeholder="Enter Gemini API Key" style="width: 100%; margin-top: 5px; padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
        <button id="save-api-key-btn" style="margin-top: 5px; padding: 5px 10px; background: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer;">Save Key</button>
    `;
    container.appendChild(promptDiv);

    setTimeout(() => {
        document.getElementById('save-api-key-btn').addEventListener('click', () => {
            const input = document.getElementById('api-key-input');
            const key = input.value.trim();
            if (key) {
                chrome.storage.local.set({ geminiApiKey: key }, () => {
                    apiKey = key;
                    promptDiv.innerHTML = '✅ API Key saved! You can now use the AI features.';
                    setTimeout(() => promptDiv.remove(), 2000);
                });
            }
        });
    }, 100);
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.geminiApiKey) {
            apiKey = changes.geminiApiKey.newValue;
        }
        if (changes.notebooks || changes.currentNotebook) {
            loadNotes();
        }
    }
});

function initializeEventListeners() {
    userInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') this.style.height = '44px';
    });

    sendBtn.addEventListener('click', () => {
        const text = userInput.value.trim();
        if (text) {
            addUserMessage(text);
            callGeminiAPI(text);
            userInput.value = '';
            userInput.style.height = '44px';
        }
    });

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabPanels.forEach(panel => panel.classList.remove('active'));
            const targetPanel = document.getElementById(`${targetTab}-tab`);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });

    clearBtn.addEventListener('click', () => {
        sourceText.value = '';
        translatedText.value = '';
    });

    targetLanguage.addEventListener('change', () => {
        const langName = targetLanguage.options[targetLanguage.selectedIndex].text;
        translationLabel.textContent = `Translation (${langName})`;
        if (sourceText.value.trim()) performTranslation();
    });

    if (clearNotesBtn) {
        clearNotesBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete all notes?')) {
                chrome.storage.local.get(['notebooks', 'currentNotebook'], (result) => {
                    const notebooks = result.notebooks || { 'default': [] };
                    const current = result.currentNotebook || 'default';
                    notebooks[current] = [];
                    chrome.storage.local.set({ notebooks: notebooks }, () => {
                        loadNotes();
                    });
                });
            }
        });
    }
}

window.addEventListener('message', (event) => {
    if (event.data.type === 'TRANSLATE_REQUEST') {
        handleTranslationRequest(event.data.text);
    } else if (event.data.type === 'EXPLAIN_REQUEST') {
        handleExplanationRequest(event.data.text);
    } else if (event.data.type === 'ADD_NOTE_REQUEST') {
        // Pass the whole data object which might contain page/highlightId
        handleAddNoteRequest(event.data);
    }
});

async function handleTranslationRequest(text) {
    const translateTab = document.querySelector('.tab[data-tab="translate"]');
    if (translateTab) translateTab.click();

    // REPLACE with new text (not cumulative)
    sourceText.value = text;

    await performTranslation();
}

async function performTranslation() {
    if (!apiKey) {
        translatedText.value = "⚠️ No API key";
        return;
    }

    const text = sourceText.value.trim();
    if (!text) {
        translatedText.value = '';
        return;
    }

    const langName = targetLanguage.options[targetLanguage.selectedIndex].text;

    translatedText.value = '🔄 Translating...';

    const prompt = `Translate the following text to ${langName}. Provide ONLY the translation:\n\n${text}`;

    try {
        const { text } = await callGeminiAPIDirect(prompt);
        let cleaned = text.trim();
        if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
            (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
            cleaned = cleaned.slice(1, -1);
        }
        translatedText.value = cleaned;
    } catch (e) {
        translatedText.value = `❌ ${e.message}`;
    }
}

async function handleExplanationRequest(text) {
    if (!apiKey) {
        addAiMessage("⚠️ No API key");
        return;
    }
    const chatTab = document.querySelector('.tab[data-tab="chat"]');
    if (chatTab) chatTab.click();

    addUserMessage(`Explain: "${text.substring(0, 50)}..."`);
    await callGeminiAPI(`Explain:\n\n"${text}"`);
}
