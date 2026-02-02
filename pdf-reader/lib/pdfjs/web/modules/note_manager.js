// Note Management

let notesList, clearNotesBtn;

function handleAddNoteRequest(data) {
    const notesTab = document.querySelector('.tab[data-tab="notes"]');
    if (notesTab) notesTab.click();

    // data can be just text (string) or an object { text, page, highlightId }
    if (typeof data === 'string') {
        saveNote({ content: data });
    } else {
        saveNote({
            content: data.text,
            page: data.page,
            highlightId: data.highlightId
        });
    }
}

function saveNote(noteData) {
    chrome.storage.local.get(['notebooks', 'currentNotebook'], (result) => {
        const notebooks = result.notebooks || { 'default': [] };
        const current = result.currentNotebook || 'default';

        if (!Array.isArray(notebooks[current])) {
            notebooks[current] = [];
        }

        notebooks[current].push({
            type: 'text',
            content: noteData.content,
            page: noteData.page,
            highlightId: noteData.highlightId,
            url: 'PDF Viewer', // Context
            date: new Date().toISOString()
        });

        chrome.storage.local.set({ notebooks: notebooks }, () => {
            loadNotes();
        });
    });
}

function loadNotes() {
    if (!notesList) return;

    chrome.storage.local.get(['notebooks', 'currentNotebook'], (result) => {
        const notebooks = result.notebooks || { 'default': [] };
        const current = result.currentNotebook || 'default';
        let notes = notebooks[current];
        if (!Array.isArray(notes)) {
            notes = [];
        }

        notesList.innerHTML = '';

        if (notes.length === 0) {
            notesList.innerHTML = '<div style="text-align: center; color: #888; margin-top: 20px;">No notes yet. Select text and click "Add to Notes".</div>';
            return;
        }

        // Show newest first
        notes.slice().reverse().forEach((note, index) => {
            // Calculate original index for deletion
            const originalIndex = notes.length - 1 - index;

            const noteDiv = document.createElement('div');
            noteDiv.style.backgroundColor = '#fff';
            noteDiv.style.border = '1px solid #e0e0e0';
            noteDiv.style.borderRadius = '4px';
            noteDiv.style.padding = '10px';
            noteDiv.style.marginBottom = '10px';
            noteDiv.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
            noteDiv.style.position = 'relative';

            // Make note clickable if it has page info
            if (note.page) {
                noteDiv.style.cursor = 'pointer';
                noteDiv.title = `Go to page ${note.page}`;
                noteDiv.addEventListener('click', (e) => {
                    // Don't trigger if clicking delete button
                    if (e.target.tagName === 'BUTTON') return;

                    window.parent.postMessage({
                        type: 'SCROLL_TO_HIGHLIGHT',
                        page: note.page,
                        highlightId: note.highlightId
                    }, '*');
                });
            }

            const contentP = document.createElement('p');
            contentP.style.margin = '0 0 8px 0';
            contentP.style.fontSize = '13px';
            contentP.style.lineHeight = '1.4';
            contentP.style.whiteSpace = 'pre-wrap';
            contentP.textContent = note.content;

            const metaDiv = document.createElement('div');
            metaDiv.style.display = 'flex';
            metaDiv.style.justifyContent = 'space-between';
            metaDiv.style.alignItems = 'center';
            metaDiv.style.fontSize = '11px';
            metaDiv.style.color = '#888';

            const dateSpan = document.createElement('span');
            try {
                let dateText = new Date(note.date).toLocaleString();
                if (note.page) dateText += ` • Page ${note.page}`;
                dateSpan.textContent = dateText;
            } catch (e) {
                dateSpan.textContent = 'Unknown date';
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Delete Note';
            deleteBtn.style.background = 'none';
            deleteBtn.style.border = 'none';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.style.opacity = '0.6';
            deleteBtn.style.padding = '2px';

            deleteBtn.addEventListener('mouseenter', () => deleteBtn.style.opacity = '1');
            deleteBtn.addEventListener('mouseleave', () => deleteBtn.style.opacity = '0.6');

            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent scroll click
                if (confirm('Delete this note?')) {
                    deleteNote(originalIndex);
                }
            });

            metaDiv.appendChild(dateSpan);
            metaDiv.appendChild(deleteBtn);

            noteDiv.appendChild(contentP);
            noteDiv.appendChild(metaDiv);
            notesList.appendChild(noteDiv);
        });
    });
}

function deleteNote(index) {
    chrome.storage.local.get(['notebooks', 'currentNotebook'], (result) => {
        const notebooks = result.notebooks || { 'default': [] };
        const current = result.currentNotebook || 'default';

        if (notebooks[current]) {
            const noteToDelete = notebooks[current][index];

            // If note has a highlightId, request deletion of the highlight too
            if (noteToDelete && noteToDelete.highlightId) {
                window.parent.postMessage({
                    type: 'DELETE_HIGHLIGHT',
                    highlightId: noteToDelete.highlightId
                }, '*');
            }

            notebooks[current].splice(index, 1);
            chrome.storage.local.set({ notebooks: notebooks }, () => {
                loadNotes();
            });
        }
    });
}
