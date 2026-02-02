/**
 * PDF Storage using IndexedDB
 * Stores actual PDF files persistently with much larger storage limits than chrome.storage.local
 * IndexedDB typically allows 50MB-500MB+ depending on available disk space
 */

class PdfStorage {
    constructor() {
        this.dbName = 'NoteTakingPdfStorage';
        this.dbVersion = 1;
        this.storeName = 'pdfs';
        this.db = null;
    }

    /**
     * Initialize the IndexedDB database
     */
    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object store for PDFs
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('addedAt', 'addedAt', { unique: false });
                }
            };
        });
    }

    /**
     * Store a PDF file
     * @param {string} id - Unique identifier for the PDF
     * @param {ArrayBuffer} data - The PDF file data
     * @param {object} metadata - Additional metadata (title, author, etc.)
     */
    async storePdf(id, data, metadata = {}) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const record = {
                id: id,
                data: data, // ArrayBuffer of PDF
                title: metadata.title || 'Untitled',
                author: metadata.author || '',
                fileName: metadata.fileName || '',
                fileSize: metadata.fileSize || data.byteLength,
                pageCount: metadata.pageCount || 0,
                addedAt: metadata.addedAt || new Date().toISOString(),
                lastAccessed: new Date().toISOString()
            };

            const request = store.put(record);

            request.onsuccess = () => resolve({ success: true, id: id });
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a PDF by ID
     * @param {string} id - The PDF identifier
     * @returns {Promise<{id, data, title, ...} | null>}
     */
    async getPdf(id) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);

            request.onsuccess = () => {
                if (request.result) {
                    // Update last accessed time
                    this.updateLastAccessed(id);
                    resolve(request.result);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update last accessed time for a PDF
     */
    async updateLastAccessed(id) {
        await this.init();

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(id);

        request.onsuccess = () => {
            if (request.result) {
                const record = request.result;
                record.lastAccessed = new Date().toISOString();
                store.put(record);
            }
        };
    }

    /**
     * Delete a PDF by ID
     */
    async deletePdf(id) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve({ success: true });
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Check if a PDF exists
     */
    async hasPdf(id) {
        await this.init();

        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getKey(id);

            request.onsuccess = () => resolve(request.result !== undefined);
            request.onerror = () => resolve(false);
        });
    }

    /**
     * Get all stored PDFs (metadata only, not the data)
     */
    async getAllPdfMetadata() {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                // Return metadata without the actual PDF data
                const results = request.result.map(record => ({
                    id: record.id,
                    title: record.title,
                    author: record.author,
                    fileName: record.fileName,
                    fileSize: record.fileSize,
                    pageCount: record.pageCount,
                    addedAt: record.addedAt,
                    lastAccessed: record.lastAccessed
                }));
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get storage usage info
     */
    async getStorageInfo() {
        await this.init();

        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                let totalSize = 0;
                const count = request.result.length;

                request.result.forEach(record => {
                    if (record.data) {
                        totalSize += record.data.byteLength;
                    }
                });

                resolve({
                    count: count,
                    totalBytes: totalSize,
                    totalMb: (totalSize / 1024 / 1024).toFixed(2)
                });
            };
            request.onerror = () => resolve({ count: 0, totalBytes: 0, totalMb: '0' });
        });
    }

    /**
     * Clear all stored PDFs
     */
    async clearAll() {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve({ success: true });
            request.onerror = () => reject(request.error);
        });
    }
}

// Create global instance
window.pdfStorage = new PdfStorage();
