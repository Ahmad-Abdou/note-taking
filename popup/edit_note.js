document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const initialText = urlParams.get('text') || '';
    const pdfTitle = urlParams.get('pdfTitle') || 'External Source';
    const textarea = document.getElementById('note-text');

    textarea.value = initialText;
    textarea.focus();

    document.getElementById('cancel-btn').addEventListener('click', () => {
        window.close();
    });

    document.getElementById('save-btn').addEventListener('click', () => {
        const content = textarea.value;
        if (content.trim()) {
            // Save to notebooks (legacy format)
            chrome.storage.local.get(['notebooks', 'currentNotebook', 'globalNotes'], (result) => {
                const notebooks = result.notebooks || { 'default': [] };
                const current = result.currentNotebook || 'default';

                if (!notebooks[current]) {
                    // Initialize as array if new
                    notebooks[current] = [];
                }

                if (Array.isArray(notebooks[current])) {
                    // It's an array (Blocks format)
                    notebooks[current].push({
                        type: 'text',
                        content: content,
                        url: pdfTitle,
                        date: new Date().toISOString()
                    });
                } else {
                    // It's a string (HTML format)
                    // Append as HTML
                    const dateStr = new Date().toLocaleDateString();
                    const newEntry = `
                        <div class="note-entry" style="margin-bottom: 15px; border-left: 3px solid #0078d4; padding-left: 10px;">
                            <p>${content.replace(/\n/g, '<br>')}</p>
                            <small style="color: #888;">Added from PDF on ${dateStr}</small>
                        </div>
                    `;
                    notebooks[current] += newEntry;
                }

                // Also save to globalNotes for the Global Notes Manager
                const globalNotes = result.globalNotes || [];
                const note = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    title: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
                    content: content,
                    color: '#667eea',
                    pdfUrl: null,
                    libraryId: null,
                    pdfTitle: pdfTitle,
                    page: null,
                    folderId: null,
                    isStarred: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                globalNotes.push(note);

                chrome.storage.local.set({ 
                    notebooks: notebooks,
                    globalNotes: globalNotes
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("Storage error:", chrome.runtime.lastError);
                        alert("Failed to save note: " + chrome.runtime.lastError.message);
                    } else {
                        window.close();
                    }
                });
            });
        } else {
            window.close();
        }
    });
});