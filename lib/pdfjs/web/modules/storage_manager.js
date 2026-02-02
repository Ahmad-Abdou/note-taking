/**
 * Storage Manager
 * Handles chrome.storage.local limits and provides cleanup options
 * Chrome's local storage limit is ~5MB for extensions
 */

class StorageManager {
    constructor() {
        this.STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB in bytes
        this.WARNING_THRESHOLD = 0.8; // 80%
        this.CRITICAL_THRESHOLD = 0.95; // 95%
    }

    /**
     * Get current storage usage
     */
    async getStorageUsage() {
        return new Promise((resolve) => {
            chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
                resolve({
                    bytes: bytesInUse,
                    mb: (bytesInUse / 1024 / 1024).toFixed(2),
                    percent: ((bytesInUse / this.STORAGE_LIMIT) * 100).toFixed(1),
                    available: this.STORAGE_LIMIT - bytesInUse,
                    availableMb: ((this.STORAGE_LIMIT - bytesInUse) / 1024 / 1024).toFixed(2)
                });
            });
        });
    }

    /**
     * Get storage breakdown by key
     */
    async getStorageBreakdown() {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, async (allData) => {
                const breakdown = [];
                
                for (const key of Object.keys(allData)) {
                    const size = await this.getKeySize(key);
                    breakdown.push({
                        key: key,
                        bytes: size,
                        mb: (size / 1024 / 1024).toFixed(3),
                        description: this.getKeyDescription(key)
                    });
                }
                
                // Sort by size descending
                breakdown.sort((a, b) => b.bytes - a.bytes);
                resolve(breakdown);
            });
        });
    }

    /**
     * Get size of a specific storage key
     */
    async getKeySize(key) {
        return new Promise((resolve) => {
            chrome.storage.local.getBytesInUse([key], (bytes) => {
                resolve(bytes);
            });
        });
    }

    /**
     * Get human-readable description for storage keys
     */
    getKeyDescription(key) {
        const descriptions = {
            'researchLibrary': 'Research Library PDFs (may contain base64 data)',
            'researchFolders': 'Library folder structure',
            'bookmarks': 'Saved bookmarks',
            'notes': 'Your notes',
            'currentPDF': 'Current PDF info for bookmarks',
            'lastPdfState': 'Last opened PDF state',
            'highlights': 'PDF highlights',
            'vocabulary': 'Vocabulary words',
            'blockedSites': 'Blocked websites list',
            'tasks': 'Productivity tasks',
            'goals': 'Goals data',
            'focusSessions': 'Focus session history',
            'analyticsData': 'Analytics data'
        };
        
        if (key.startsWith('pdf_highlights_')) {
            return 'Highlights for a specific PDF';
        }
        
        return descriptions[key] || 'Unknown data';
    }

    /**
     * Check if storage is critical and show warning
     */
    async checkStorageStatus() {
        const usage = await this.getStorageUsage();
        const percent = parseFloat(usage.percent);
        
        if (percent >= this.CRITICAL_THRESHOLD * 100) {
            return {
                status: 'critical',
                message: `Storage is ${usage.percent}% full! You may not be able to save more data.`,
                usage: usage
            };
        } else if (percent >= this.WARNING_THRESHOLD * 100) {
            return {
                status: 'warning',
                message: `Storage is ${usage.percent}% full. Consider cleaning up.`,
                usage: usage
            };
        }
        
        return {
            status: 'ok',
            message: `Storage: ${usage.mb}MB used (${usage.percent}%)`,
            usage: usage
        };
    }

    /**
     * Get items that can be cleaned up
     */
    async getCleanupSuggestions() {
        const breakdown = await this.getStorageBreakdown();
        const suggestions = [];
        
        // Find library items with base64 data
        const libraryData = await new Promise(resolve => {
            chrome.storage.local.get(['researchLibrary'], resolve);
        });
        
        const library = libraryData.researchLibrary || [];
        const localPdfs = library.filter(item => 
            item.url && item.url.startsWith('data:application/pdf;base64,')
        );
        
        if (localPdfs.length > 0) {
            const totalSize = localPdfs.reduce((sum, item) => {
                return sum + (item.url ? item.url.length : 0);
            }, 0);
            
            suggestions.push({
                type: 'localPdfs',
                title: 'Embedded PDF data (legacy)',
                description: `${localPdfs.length} PDF(s) with embedded data (~${(totalSize / 1024 / 1024).toFixed(2)}MB). Convert to file-reference to save space.`,
                count: localPdfs.length,
                estimatedSize: totalSize,
                items: localPdfs.map(p => ({ id: p.id, title: p.title })),
                actionLabel: 'Convert All'
            });
        }
        
        // Check for old highlights
        const highlightKeys = breakdown.filter(item => 
            item.key.startsWith('pdf_highlights_') && item.bytes > 10000
        );
        
        if (highlightKeys.length > 5) {
            suggestions.push({
                type: 'highlights',
                title: 'Old PDF highlights',
                description: `${highlightKeys.length} PDFs have saved highlights. You can clean up highlights for PDFs you no longer use.`,
                count: highlightKeys.length,
                items: highlightKeys,
                actionLabel: 'Clean Up'
            });
        }
        
        return suggestions;
    }

    /**
     * Convert embedded PDF data to file-reference (removes base64, keeps metadata)
     */
    async convertEmbeddedToReference() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['researchLibrary'], (result) => {
                const library = result.researchLibrary || [];
                let converted = 0;
                let savedBytes = 0;
                
                library.forEach(item => {
                    if (item.url && item.url.startsWith('data:application/pdf;base64,')) {
                        savedBytes += item.url.length;
                        
                        // Convert to file-reference format
                        item.isLocalFile = true;
                        item.fileName = item.fileName || item.title + '.pdf';
                        item.url = null; // Remove the embedded data
                        converted++;
                    }
                });
                
                chrome.storage.local.set({ researchLibrary: library }, () => {
                    resolve({ 
                        success: true, 
                        converted: converted,
                        savedMb: (savedBytes / 1024 / 1024).toFixed(2),
                        message: `Converted ${converted} PDF(s), freed ~${(savedBytes / 1024 / 1024).toFixed(2)}MB` 
                    });
                });
            });
        });
    }

    /**
     * Remove locally stored PDF from library (convert to URL-only if possible)
     */
    async removeLocalPdfData(itemId) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['researchLibrary'], (result) => {
                const library = result.researchLibrary || [];
                const itemIndex = library.findIndex(item => item.id === itemId);
                
                if (itemIndex === -1) {
                    reject(new Error('Item not found'));
                    return;
                }
                
                // Remove the item entirely
                library.splice(itemIndex, 1);
                
                chrome.storage.local.set({ researchLibrary: library }, () => {
                    resolve({ success: true, message: 'PDF removed from library' });
                });
            });
        });
    }

    /**
     * Clear highlights for a specific PDF
     */
    async clearHighlights(pdfUrl) {
        const key = `pdf_highlights_${encodeURIComponent(pdfUrl)}`;
        return new Promise((resolve) => {
            chrome.storage.local.remove([key], () => {
                resolve({ success: true });
            });
        });
    }

    /**
     * Clear old bookmarks (older than X days)
     */
    async clearOldBookmarks(daysOld = 30) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['bookmarks'], (result) => {
                const bookmarks = result.bookmarks || [];
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - daysOld);
                
                const filtered = bookmarks.filter(bm => {
                    const bmDate = new Date(bm.date);
                    return bmDate >= cutoffDate;
                });
                
                const removed = bookmarks.length - filtered.length;
                
                chrome.storage.local.set({ bookmarks: filtered }, () => {
                    resolve({ 
                        success: true, 
                        message: `Removed ${removed} bookmarks older than ${daysOld} days` 
                    });
                });
            });
        });
    }

    /**
     * Show storage management UI
     */
    async showStorageUI() {
        const usage = await this.getStorageUsage();
        const breakdown = await this.getStorageBreakdown();
        const suggestions = await this.getCleanupSuggestions();
        
        // Create modal
        const modal = document.createElement('div');
        modal.id = 'storage-manager-modal';
        modal.innerHTML = `
            <div class="storage-modal-overlay">
                <div class="storage-modal-content">
                    <div class="storage-modal-header">
                        <h3>📊 Storage Manager</h3>
                        <button class="storage-close-btn">&times;</button>
                    </div>
                    
                    <div class="storage-usage-bar">
                        <div class="storage-usage-fill" style="width: ${usage.percent}%; background: ${parseFloat(usage.percent) > 90 ? '#ef4444' : parseFloat(usage.percent) > 70 ? '#f59e0b' : '#22c55e'}"></div>
                    </div>
                    <div class="storage-usage-text">
                        ${usage.mb}MB / 5MB used (${usage.percent}%)
                    </div>
                    
                    <h4>Storage Breakdown</h4>
                    <div class="storage-breakdown">
                        ${breakdown.slice(0, 10).map(item => `
                            <div class="storage-item">
                                <span class="storage-item-name">${item.key}</span>
                                <span class="storage-item-size">${item.mb}MB</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    ${suggestions.length > 0 ? `
                        <h4>Cleanup Suggestions</h4>
                        <div class="storage-suggestions">
                            ${suggestions.map(s => `
                                <div class="suggestion-item" data-type="${s.type}">
                                    <div class="suggestion-info">
                                        <strong>${s.title}</strong>
                                        <p>${s.description}</p>
                                    </div>
                                    <button class="suggestion-action-btn" data-type="${s.type}">
                                        Clean Up
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<p style="color:#888; text-align:center;">No cleanup suggestions available</p>'}
                    
                    <div class="storage-modal-actions">
                        <button class="storage-btn storage-btn-secondary" id="exportDataBtn">
                            📥 Export All Data
                        </button>
                        <button class="storage-btn storage-btn-primary" id="closeStorageBtn">
                            Done
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.id = 'storage-manager-styles';
        style.textContent = `
            .storage-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 999999;
            }
            .storage-modal-content {
                background: white;
                border-radius: 12px;
                padding: 24px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            .storage-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            }
            .storage-modal-header h3 {
                margin: 0;
                font-size: 18px;
            }
            .storage-close-btn {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #666;
            }
            .storage-usage-bar {
                height: 20px;
                background: #e5e7eb;
                border-radius: 10px;
                overflow: hidden;
                margin-bottom: 8px;
            }
            .storage-usage-fill {
                height: 100%;
                transition: width 0.3s;
            }
            .storage-usage-text {
                text-align: center;
                color: #666;
                font-size: 14px;
                margin-bottom: 20px;
            }
            .storage-modal-content h4 {
                margin: 16px 0 8px;
                font-size: 14px;
                color: #333;
            }
            .storage-breakdown {
                background: #f9fafb;
                border-radius: 8px;
                padding: 8px;
            }
            .storage-item {
                display: flex;
                justify-content: space-between;
                padding: 6px 8px;
                font-size: 12px;
            }
            .storage-item-name {
                color: #333;
                max-width: 70%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .storage-item-size {
                color: #666;
            }
            .storage-suggestions {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .suggestion-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px;
                background: #fef3c7;
                border-radius: 8px;
                gap: 12px;
            }
            .suggestion-info {
                flex: 1;
            }
            .suggestion-info strong {
                font-size: 13px;
            }
            .suggestion-info p {
                margin: 4px 0 0;
                font-size: 11px;
                color: #666;
            }
            .suggestion-action-btn {
                padding: 6px 12px;
                background: #f59e0b;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                white-space: nowrap;
            }
            .storage-modal-actions {
                display: flex;
                gap: 8px;
                margin-top: 20px;
                justify-content: flex-end;
            }
            .storage-btn {
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
            }
            .storage-btn-primary {
                background: #667eea;
                color: white;
            }
            .storage-btn-secondary {
                background: #e5e7eb;
                color: #333;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(modal);
        
        // Event listeners
        modal.querySelector('.storage-close-btn').onclick = () => {
            modal.remove();
            style.remove();
        };
        
        modal.querySelector('#closeStorageBtn').onclick = () => {
            modal.remove();
            style.remove();
        };
        
        modal.querySelector('.storage-modal-overlay').onclick = (e) => {
            if (e.target.classList.contains('storage-modal-overlay')) {
                modal.remove();
                style.remove();
            }
        };
        
        modal.querySelector('#exportDataBtn').onclick = async () => {
            await this.exportAllData();
        };
        
        // Cleanup action buttons
        modal.querySelectorAll('.suggestion-action-btn').forEach(btn => {
            btn.onclick = async () => {
                const type = btn.dataset.type;
                if (type === 'localPdfs') {
                    const choice = confirm(
                        'Convert embedded PDFs to file-references?\n\n' +
                        '✓ Keeps all your library entries and metadata\n' +
                        '✓ Frees up storage space\n' +
                        '✓ You\'ll need to select the file when opening\n\n' +
                        'Click OK to convert, or Cancel to abort.'
                    );
                    if (choice) {
                        const result = await this.convertEmbeddedToReference();
                        alert(result.message);
                        modal.remove();
                        style.remove();
                        this.showStorageUI(); // Refresh
                    }
                }
            };
        });
    }

    /**
     * Remove all locally stored (base64) PDFs from library
     */
    async cleanupLocalPdfs() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['researchLibrary'], (result) => {
                const library = result.researchLibrary || [];
                const filtered = library.filter(item => 
                    !item.url || !item.url.startsWith('data:application/pdf;base64,')
                );
                
                const removed = library.length - filtered.length;
                
                chrome.storage.local.set({ researchLibrary: filtered }, () => {
                    resolve({ 
                        success: true, 
                        removed: removed,
                        message: `Removed ${removed} locally stored PDF(s)` 
                    });
                });
            });
        });
    }

    /**
     * Export all data to a JSON file
     */
    async exportAllData() {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, (allData) => {
                const dataStr = JSON.stringify(allData, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `note-taker-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                resolve({ success: true });
            });
        });
    }
}

// Export for use
window.StorageManager = StorageManager;
