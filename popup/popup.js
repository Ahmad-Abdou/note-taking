// document.addEventListener('DOMContentLoaded', () => {
//     const notebookSelect = document.getElementById('notebook-select');
//     const notesContainer = document.getElementById('notes-container');
//     const newNotebookBtn = document.getElementById('new-notebook-btn');
//     const modal = document.getElementById('modal');
//     const saveNotebookBtn = document.getElementById('save-notebook-btn');
//     const cancelModalBtn = document.getElementById('cancel-modal');
//     const newNotebookNameInput = document.getElementById('new-notebook-name');
//     const exportPdfBtn = document.getElementById('export-pdf-btn');
//     const exportDocBtn = document.getElementById('export-doc-btn');
//     const clearNotesBtn = document.getElementById('clear-notes-btn');
//     const openDashboardBtn = document.getElementById('open-dashboard-btn');

//     // Open Dashboard
//     openDashboardBtn.addEventListener('click', () => {
//         chrome.tabs.create({ url: 'dashboard/index.html' });
//     });

//     // Initialize storage if empty
//     chrome.storage.local.get(['notebooks', 'currentNotebook'], (result) => {
//         if (!result.notebooks) {
//             chrome.storage.local.set({
//                 notebooks: { 'default': [] },
//                 currentNotebook: 'default'
//             }, loadNotebooks);
//         } else {
//             loadNotebooks();
//         }
//     });

//     function loadNotebooks() {
//         chrome.storage.local.get(['notebooks', 'currentNotebook'], (result) => {
//             const notebooks = result.notebooks || { 'default': [] };
//             const current = result.currentNotebook || 'default';

//             notebookSelect.innerHTML = '';
//             for (const name in notebooks) {
//                 const option = document.createElement('option');
//                 option.value = name;
//                 option.textContent = name;
//                 if (name === current) option.selected = true;
//                 notebookSelect.appendChild(option);
//             }

//             renderNotes(notebooks[current]);
//         });
//     }

//     function renderNotes(notes) {
//         notesContainer.innerHTML = '';
//         if (!notes || notes.length === 0) {
//             notesContainer.innerHTML = '<div class="empty-state">No notes yet. Highlight text on a page to add!</div>';
//             return;
//         }

//         notes.forEach(note => {
//             const card = document.createElement('div');
//             card.className = 'note-card';
            
//             const text = document.createElement('div');
//             text.className = 'note-text';
//             text.textContent = note.text;

//             const meta = document.createElement('div');
//             meta.className = 'note-meta';
            
//             const dateSpan = document.createElement('span');
//             dateSpan.textContent = new Date(note.date).toLocaleDateString();
            
//             const sourceLink = document.createElement('a');
//             sourceLink.href = '#';
//             sourceLink.textContent = 'Source';
//             sourceLink.addEventListener('click', (e) => {
//                 e.preventDefault();
//                 chrome.tabs.create({ url: note.url });
//             });

//             meta.appendChild(dateSpan);
//             meta.appendChild(sourceLink);

//             card.appendChild(text);
//             card.appendChild(meta);
//             notesContainer.appendChild(card);
//         });
//     }

//     // Event Listeners
//     notebookSelect.addEventListener('change', (e) => {
//         const selected = e.target.value;
//         chrome.storage.local.set({ currentNotebook: selected }, loadNotebooks);
//     });

//     newNotebookBtn.addEventListener('click', () => {
//         modal.classList.remove('hidden');
//     });

//     cancelModalBtn.addEventListener('click', () => {
//         modal.classList.add('hidden');
//     });

//     saveNotebookBtn.addEventListener('click', () => {
//         const name = newNotebookNameInput.value.trim();
//         if (name) {
//             chrome.storage.local.get(['notebooks'], (result) => {
//                 const notebooks = result.notebooks || {};
//                 if (!notebooks[name]) {
//                     notebooks[name] = [];
//                     chrome.storage.local.set({ notebooks: notebooks, currentNotebook: name }, () => {
//                         modal.classList.add('hidden');
//                         newNotebookNameInput.value = '';
//                         loadNotebooks();
//                     });
//                 } else {
//                     alert('Notebook already exists!');
//                 }
//             });
//         }
//     });

//     clearNotesBtn.addEventListener('click', () => {
//         if (confirm('Are you sure you want to clear all notes in this notebook?')) {
//             chrome.storage.local.get(['notebooks', 'currentNotebook'], (result) => {
//                 const notebooks = result.notebooks;
//                 const current = result.currentNotebook;
//                 notebooks[current] = [];
//                 chrome.storage.local.set({ notebooks: notebooks }, loadNotebooks);
//             });
//         }
//     });

//     // Export PDF
//     exportPdfBtn.addEventListener('click', () => {
//         chrome.storage.local.get(['notebooks', 'currentNotebook'], (result) => {
//             const current = result.currentNotebook;
//             const notes = result.notebooks[current];
//             if (!notes || notes.length === 0) return alert('No notes to export');

//             const printWindow = window.open('', '_blank');
//             let html = `
//                 <html>
//                 <head>
//                     <title>${current} - Notes Export</title>
//                     <style>
//                         body { font-family: sans-serif; padding: 20px; }
//                         .note { border-bottom: 1px solid #ccc; padding: 10px 0; margin-bottom: 10px; }
//                         .meta { color: #666; font-size: 0.9em; }
//                         h1 { color: #0078d4; }
//                     </style>
//                 </head>
//                 <body>
//                     <h1>Notebook: ${current}</h1>
//             `;

//             notes.forEach(note => {
//                 html += `
//                     <div class="note">
//                         <p>${note.text}</p>
//                         <div class="meta">Source: ${note.url} | Date: ${new Date(note.date).toLocaleString()}</div>
//                     </div>
//                 `;
//             });

//             html += '</body></html>';
//             printWindow.document.write(html);
//             printWindow.document.close();
//             printWindow.print();
//         });
//     });

//     // Export DOC
//     exportDocBtn.addEventListener('click', () => {
//         chrome.storage.local.get(['notebooks', 'currentNotebook'], (result) => {
//             const current = result.currentNotebook;
//             const notes = result.notebooks[current];
//             if (!notes || notes.length === 0) return alert('No notes to export');

//             let html = `
//                 <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
//                 <head><meta charset='utf-8'><title>${current}</title></head>
//                 <body>
//                     <h1>Notebook: ${current}</h1>
//             `;

//             notes.forEach(note => {
//                 html += `
//                     <p><strong>Note:</strong> ${note.text}</p>
//                     <p style="color: #666; font-size: 10pt;">Source: <a href="${note.url}">${note.url}</a> | Date: ${new Date(note.date).toLocaleString()}</p>
//                     <hr>
//                 `;
//             });

//             html += '</body></html>';

//             const blob = new Blob(['\ufeff', html], {
//                 type: 'application/msword'
//             });
            
//             const url = URL.createObjectURL(blob);
//             const link = document.createElement('a');
//             link.href = url;
//             link.download = `${current}_notes.doc`;
//             document.body.appendChild(link);
//             link.click();
//             document.body.removeChild(link);
//         });
//     });
// });
