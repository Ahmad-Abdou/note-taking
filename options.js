// options.js - Handle API key settings

const apiKeyInput = document.getElementById('api-key');
const saveBtn = document.getElementById('save-btn');
const defaultPdfReaderCheckbox = document.getElementById('default-pdf-reader');
const taskRemindersEnabledCheckbox = document.getElementById('task-reminders-enabled');

// Load existing settings on page load
chrome.storage.local.get([
    'geminiApiKey', 
    'useAsDefaultPdfReader',
    'taskRemindersEnabled'
], (result) => {
    if (result.geminiApiKey) {
        apiKeyInput.value = result.geminiApiKey;
    }
    if (defaultPdfReaderCheckbox) {
        // Default to true if not set
        defaultPdfReaderCheckbox.checked = result.useAsDefaultPdfReader !== false;
    }
    if (taskRemindersEnabledCheckbox) {
        // Default to true if not set
        taskRemindersEnabledCheckbox.checked = result.taskRemindersEnabled !== false;
    }
});

// Save settings
saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const useAsDefaultPdfReader = defaultPdfReaderCheckbox ? defaultPdfReaderCheckbox.checked : true;
    const taskRemindersEnabled = taskRemindersEnabledCheckbox ? taskRemindersEnabledCheckbox.checked : true;

    /** @type {Record<string, any>} */
    const toSave = {
        useAsDefaultPdfReader,
        taskRemindersEnabled
    };

    // Only update the stored API key if the user provided one.
    if (apiKey) {
        toSave.geminiApiKey = apiKey;
    }

    chrome.storage.local.set(toSave, () => {
        window.showToast?.('success', 'Settings Saved', '✓ Settings saved successfully!');
    });
});

// Handle Enter key
apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        saveBtn.click();
    }
});

// NOTE: shared/toast.js defines window.showToast.
