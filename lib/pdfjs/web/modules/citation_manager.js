/**
 * Citation Manager - Google Scholar style citation generator
 * Generates citations in APA, MLA, Chicago, Harvard, and BibTeX formats
 */

class CitationManager {
    constructor() {
        this.pdfDocument = null;
        this.pdfUrl = '';
        this.actualPdfUrl = ''; // The real PDF URL, not the extension URL
        this.metadata = {};
        this.initialized = false;
        this.citationPanel = null;

        // Auto-initialize when constructed
        this.autoInit();
    }

    async autoInit() {
        // Get PDF URL from query string - this is the actual PDF URL
        const urlParams = new URLSearchParams(window.location.search);
        let fileParam = urlParams.get('file');
        const source = urlParams.get('source');
        const libraryId = urlParams.get('id');

        // Check if this is a library document
        this.isLibraryDocument = source === 'library' && libraryId;
        this.libraryId = libraryId;

        // For library documents, try to get the original source URL from storage
        if (this.isLibraryDocument) {
            try {
                const result = await new Promise(resolve => {
                    chrome.storage.local.get(['researchLibraryPapers'], resolve);
                });
                const papers = result.researchLibraryPapers || [];
                const paper = papers.find(p => p.id === libraryId);
                if (paper && paper.sourceUrl && !paper.sourceUrl.startsWith('chrome-extension://') && !paper.sourceUrl.startsWith('blob:')) {
                    this.actualPdfUrl = paper.sourceUrl;
                    this.pdfUrl = paper.sourceUrl;
                } else {
                    // No valid external URL - set to null to indicate citation shouldn't include URL
                    this.actualPdfUrl = null;
                    this.pdfUrl = null;
                }
            } catch (e) {
                this.actualPdfUrl = null;
                this.pdfUrl = null;
            }
        }
        // Decode the URL if it's encoded (may be double-encoded)
        else if (fileParam) {
            // Try to decode multiple times in case of double encoding
            try {
                let decoded = fileParam;
                let attempts = 0;
                while (decoded.includes('%') && attempts < 5) {
                    const newDecoded = decodeURIComponent(decoded);
                    if (newDecoded === decoded) break;
                    decoded = newDecoded;
                    attempts++;
                }
                // Check if it's a valid external URL (not extension URL)
                if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
                    this.actualPdfUrl = decoded;
                    this.pdfUrl = decoded;
                } else {
                    this.actualPdfUrl = null;
                    this.pdfUrl = null;
                }
            } catch (e) {
                this.actualPdfUrl = null;
                this.pdfUrl = null;
            }
        } else {
            // Fallback: check if current URL has the PDF path embedded
            const currentUrl = window.location.href;
            // Check for common patterns like extension://...?file=URL or extension://.../viewer.html?file=URL
            const fileMatch = currentUrl.match(/[?&]file=([^&]+)/);
            if (fileMatch) {
                try {
                    let decoded = fileMatch[1];
                    let attempts = 0;
                    while (decoded.includes('%') && attempts < 5) {
                        const newDecoded = decodeURIComponent(decoded);
                        if (newDecoded === decoded) break;
                        decoded = newDecoded;
                        attempts++;
                    }
                    // Check if it's a valid external URL
                    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
                        this.actualPdfUrl = decoded;
                        this.pdfUrl = decoded;
                    } else {
                        this.actualPdfUrl = null;
                        this.pdfUrl = null;
                    }
                } catch (e) {
                    this.actualPdfUrl = null;
                    this.pdfUrl = null;
                }
            } else {
                // No external URL available
                this.pdfUrl = null;
                this.actualPdfUrl = null;
            }
        }

        // Wait for PDF viewer to be ready
        // Note: This viewer uses window.pdfDoc, not PDFViewerApplication.pdfDocument
        const waitForPdf = () => {
            return new Promise((resolve) => {
                let attempts = 0;
                const check = () => {
                    attempts++;
                    // Check for window.pdfDoc (custom viewer) or PDFViewerApplication.pdfDocument (standard viewer)
                    const pdfDoc = window.pdfDoc || (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument);
                    if (pdfDoc) {
                        resolve(pdfDoc);
                    } else {
                        if (attempts < 100) { // 10 seconds max
                            setTimeout(check, 100);
                        } else {
                            resolve(null);
                        }
                    }
                };
                check();
            });
        };

        this.pdfDocument = await waitForPdf();

        if (this.pdfDocument) {
            await this.extractMetadata();
        } else {
            // Set default metadata based on URL
            this.metadata = {
                title: this.extractTitleFromUrl(),
                author: ['Unknown Author'],
                year: new Date().getFullYear().toString(),
                subject: '',
                keywords: '',
                creator: '',
                producer: '',
                creationDate: null,
                modDate: null
            };
        }

        this.initialized = true;

        // Set up a listener for when PDF document becomes available later
        if (!this.pdfDocument) {
            this.setupDocumentListener();
        }
    }

    setupDocumentListener() {
        // Check periodically if PDF document becomes available
        // Note: This viewer uses window.pdfDoc, not PDFViewerApplication.pdfDocument
        const checkInterval = setInterval(() => {
            const pdfDoc = window.pdfDoc || (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument);
            if (pdfDoc) {
                this.pdfDocument = pdfDoc;
                this.extractMetadata();
                clearInterval(checkInterval);
            }
        }, 1000);

        // Stop checking after 60 seconds
        setTimeout(() => clearInterval(checkInterval), 60000);
    }

    async init(pdfDocument, pdfUrl) {
        this.pdfDocument = pdfDocument;
        this.pdfUrl = pdfUrl;
        this.actualPdfUrl = pdfUrl;
        await this.extractMetadata();
        this.initialized = true;
    }

    async extractMetadata() {
        if (!this.pdfDocument) return;

        try {
            const metadata = await this.pdfDocument.getMetadata();
            const info = metadata.info || {};

            // First, try to get info from PDF metadata
            let title = info.Title;
            let authors = this.parseAuthors(info.Author || '');
            let year = this.extractYear(info.CreationDate || info.ModDate);

            // If metadata is sparse, extract from first pages
            const extractedInfo = await this.extractFromContent();

            // Use extracted info if PDF metadata is missing or unreliable
            if (!title || title === 'Unknown Document' || title === 'Untitled Document' || /^[A-Z]{2}\d+$/.test(title)) {
                title = extractedInfo.title || this.extractTitleFromUrl();
            }

            // Use extracted authors if:
            // 1. PDF metadata authors is "Unknown Author"
            // 2. PDF metadata looks like software-generated or computer name
            // 3. Extracted authors are available and look more valid
            const metadataAuthorLower = authors.join(' ').toLowerCase();
            const invalidAuthorPatterns = [
                'pdf', 'acrobat', 'microsoft', 'adobe', 'libreoffice', 'word', 'creator',
                'lenovo', 'dell', 'hp', 'asus', 'acer', 'samsung', 'apple', 'thinkpad',
                'windows', 'user', 'admin', 'administrator', 'owner', 'home', 'pc',
                'laptop', 'desktop', 'computer', 'macbook', 'imac'
            ];
            const shouldUseExtractedAuthors =
                (authors.length === 1 && authors[0] === 'Unknown Author') ||
                invalidAuthorPatterns.some(pattern => metadataAuthorLower.includes(pattern)) ||
                /^\d+$/.test(metadataAuthorLower.trim()) || // Just numbers
                metadataAuthorLower.length < 3 || // Too short
                !/[a-z]/.test(metadataAuthorLower); // No letters

            if (shouldUseExtractedAuthors && extractedInfo.authors.length > 0) {
                authors = extractedInfo.authors;
            }

            if (extractedInfo.year) {
                year = extractedInfo.year;
            }

            this.metadata = {
                title: title,
                author: authors,
                year: year,
                subject: info.Subject || extractedInfo.subject || '',
                keywords: info.Keywords || '',
                creator: info.Creator || '',
                producer: info.Producer || '',
                journal: extractedInfo.journal || '',
                volume: extractedInfo.volume || '',
                issue: extractedInfo.issue || '',
                pages: extractedInfo.pages || '',
                publisher: extractedInfo.publisher || '',
                doi: extractedInfo.doi || '',
                creationDate: info.CreationDate,
                modDate: info.ModDate
            };

            // If DOI was found, automatically fetch accurate metadata from CrossRef
            if (this.metadata.doi) {
                // Fetch in background - don't block initialization
                this.fetchMetadataFromDOI(this.metadata.doi).catch(() => {
                    // Silently fail - we already have PDF-extracted metadata as fallback
                });
            }

        } catch (e) {
            this.metadata = {
                title: this.extractTitleFromUrl(),
                author: ['Unknown Author'],
                year: new Date().getFullYear().toString()
            };
        }
    }

    extractTitleFromUrl() {
        try {
            // Use the actual PDF URL, not the extension URL
            const url = this.actualPdfUrl || this.pdfUrl || window.location.href;
            let filename = decodeURIComponent(url.split('/').pop().split('?')[0]);
            filename = filename.replace('.pdf', '').replace(/[-_]/g, ' ');

            // Clean up common patterns like EJ1288746
            if (/^[A-Z]{2}\d+$/.test(filename)) {
                return 'Untitled Document';
            }

            return filename || 'Unknown Document';
        } catch (e) {
            return 'Unknown Document';
        }
    }

    parseAuthors(authorString) {
        if (!authorString) return ['Unknown Author'];

        // Split by common delimiters
        const authors = authorString
            .split(/[,;&]|\band\b/i)
            .map(a => a.trim())
            .filter(a => a.length > 0 && a !== 'Unknown Author');

        return authors.length > 0 ? authors : ['Unknown Author'];
    }

    extractYear(dateString) {
        if (!dateString) return new Date().getFullYear().toString();

        // PDF date format: D:YYYYMMDDHHmmss
        const match = dateString.match(/D:(\d{4})/);
        if (match) return match[1];

        // Try to find any 4-digit year
        const yearMatch = dateString.match(/\d{4}/);
        return yearMatch ? yearMatch[0] : new Date().getFullYear().toString();
    }

    async extractFromContent() {
        const result = {
            title: null,
            authors: [],
            year: null,
            journal: null,
            volume: null,
            issue: null,
            pages: null,
            publisher: null,
            doi: null,
            subject: null
        };

        try {
            // Extract text from first 2 pages
            let fullText = '';
            const pagesToCheck = Math.min(2, this.pdfDocument.numPages);

            for (let i = 1; i <= pagesToCheck; i++) {
                const page = await this.pdfDocument.getPage(i);
                const textContent = await page.getTextContent();

                // Get text items with their positions for better parsing
                const items = textContent.items;
                let pageText = '';
                let lastY = null;

                for (const item of items) {
                    // Add newline when Y position changes significantly (new line)
                    if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                        pageText += '\n';
                    }
                    pageText += item.str;
                    lastY = item.transform[5];
                }

                fullText += pageText + '\n\n';
            }

            // Try to extract DOI
            const doiMatch = fullText.match(/(?:doi[:\s]*)?10\.\d{4,}\/[^\s]+/i);
            if (doiMatch) {
                result.doi = doiMatch[0].replace(/^doi[:\s]*/i, '').trim();
            }

            // Parse all lines for structured analysis
            const allLines = fullText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);

            // Try to extract year from content - prioritize explicit publication dates
            const yearPatterns = [
                /(?:Online Published|Published)[:\s]*[A-Za-z]+\s+\d{1,2},?\s+(\d{4})/i,
                /(?:Accepted|Received)[:\s]*[A-Za-z]+\s+\d{1,2},?\s+(\d{4})/i,
                /Vol\.?\s*\d+[^;]*;\s*(\d{4})/i,  // Volume; Year pattern
                /;\s*(\d{4})\b/,  // Year after semicolon
                /©\s*(\d{4})/i,
                /\b(20[12]\d)\b/  // Year 2010-2029
            ];
            for (const pattern of yearPatterns) {
                const match = fullText.match(pattern);
                if (match) {
                    const year = match[1];
                    if (parseInt(year) >= 2000 && parseInt(year) <= 2030) {
                        result.year = year;
                        break;
                    }
                }
            }

            // Skip patterns for non-title lines
            const skipPatterns = [
                /^page\s+\d+/i,
                /^\d+$/,
                /^vol\.?\s*\d+/i,
                /^issue/i,
                /^copyright/i,
                /^ISSN/i,
                /^E-ISSN/i,
                /^P-ISSN/i,
                /ISSN[\s:]+\d{4}/i,  // Matches "ISSN: 1234" anywhere
                /E-ISSN[\s:]+\d{4}/i,
                /P-ISSN[\s:]+\d{4}/i,
                /^\d{4}-\d{4}$/,  // Just ISSN number pattern
                /^published by/i,
                /^\d{4}$/,
                /^http/i,
                /^doi:/i,
                /correspondence:/i,
                /received:|accepted:|online published:/i,
                /^abstract$/i,
                /^review\s+paper$/i,
                /^original\s+(research\s+)?paper$/i,
                /^research\s+article$/i,
                /^open\s+access$/i
            ];

            // Find the actual paper title
            // Title is usually a substantial line after journal header, before author names
            // Titles may span multiple lines, so we need to combine consecutive title-like lines
            let potentialTitles = [];
            let titleStartIndex = -1;

            for (let i = 0; i < Math.min(allLines.length, 30); i++) {
                const line = allLines[i];
                const shouldSkip = skipPatterns.some(p => p.test(line));

                // Title characteristics: reasonable length, not metadata
                if (!shouldSkip && line.length >= 15 && line.length <= 300) {
                    // Skip lines with email, URLs, or that look like journal headers
                    if (line.includes('@') || line.includes('http') || line.includes('.com') || line.includes('.edu')) continue;
                    if (/^[\d\s.;,:-]+$/.test(line)) continue;
                    // Skip lines that contain ISSN anywhere (E-ISSN, P-ISSN, etc.)
                    if (line.match(/[EP]-?ISSN|ISSN\s*:/i)) continue;
                    // Skip lines that contain both Vol. and ISSN (journal header)
                    if (line.match(/Vol\..*ISSN|ISSN.*Vol\./i)) continue;
                    // Skip lines that are just journal name + issue info
                    if (line.match(/;\s*Vol\.\s*\d+/i)) continue;
                    // Skip page numbers
                    if (/^\d+$/.test(line.trim())) continue;
                    // Skip if it's just "Review Paper" or similar article type headers
                    if (line.match(/^(review|research|original|case)\s*(paper|article|study)$/i)) continue;
                    // Skip lines that are mostly numbers with dashes (like ISSN patterns)
                    if (line.match(/^\d{4}[-–]\d{3,4}/)) continue;

                    potentialTitles.push({ line, index: i, length: line.length });
                }
            }

            // Choose title: skip journal header lines, pick first substantive line
            // Also combine consecutive lines if they look like a multi-line title
            if (potentialTitles.length > 0) {
                for (let j = 0; j < potentialTitles.length; j++) {
                    const pt = potentialTitles[j];
                    // Skip if looks like journal header (contains semicolon with volume/issue)
                    if (pt.line.match(/;\s*(?:Vol|No|Issue|\d{4})/i)) continue;
                    // Skip if it's just a journal name pattern
                    if (pt.line.match(/^[A-Z][a-z]+\s+(?:Studies|Journal|Review|Quarterly)/)) continue;
                    // Skip if contains ISSN anywhere
                    if (pt.line.match(/[EP]-?ISSN|ISSN/i)) continue;
                    // Skip if it's mostly metadata (contains "Review Paper" followed by ISSN-like content)
                    if (pt.line.match(/^Review\s+Paper.*\d{4}/i)) continue;
                    // Skip if it contains "International Journal" as start
                    if (pt.line.match(/^International\s+Journal/i)) continue;

                    // Check if next line continues the title (doesn't start with author name pattern)
                    let fullTitle = pt.line;
                    if (j + 1 < potentialTitles.length) {
                        const nextPt = potentialTitles[j + 1];
                        // If next line index is consecutive and doesn't look like an author name
                        if (nextPt.index === pt.index + 1 &&
                            !nextPt.line.match(/^[A-Z][a-z]+\s+[A-Z][a-z]+\s*\d*$/) &&
                            !nextPt.line.match(/^\d+\s+/) &&
                            nextPt.line.length < 100) {
                            // Combine the lines as a multi-line title
                            fullTitle = pt.line + ' ' + nextPt.line;
                        }
                    }

                    result.title = fullTitle.trim();
                    titleStartIndex = pt.index;
                    break;
                }
                // Fallback to second option if still no title
                if (!result.title && potentialTitles.length > 1) {
                    result.title = potentialTitles[1].line;
                }
            }

            // Find author names - look between title and Abstract
            const abstractIndex = fullText.toLowerCase().indexOf('abstract');
            const textBeforeAbstract = abstractIndex > 0 ? fullText.substring(0, abstractIndex) : fullText.substring(0, 2000);

            // Find lines that look like author names
            const authorCandidates = [];
            for (let i = titleStartIndex + 1; i < Math.min(allLines.length, 20); i++) {
                const line = allLines[i];
                // Stop if we hit Abstract
                if (line.toLowerCase() === 'abstract') break;
                // Skip if this is the title we found
                if (result.title && (line === result.title || result.title.includes(line))) continue;
                // Skip metadata lines
                if (skipPatterns.some(p => p.test(line))) continue;
                // Skip lines with common non-author content
                if (line.match(/^(received|accepted|published|online|doi|http|@|copyright)/i)) continue;

                // Author line patterns:
                // 1. "First Last" or "First Middle Last"
                // 2. May have affiliation numbers like "First Last1,2"
                // 3. May have superscript markers
                const authorPatterns = [
                    /^([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+(?:\s*[\d,*]+)?)\s*$/,  // Simple name with optional numbers
                    /^([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s*[,;]|\s+and\s+|\s+&\s+)/,  // Name before comma/and/&
                    /^([A-Z][a-z]+\s+[A-Z](?:\.|[a-z]+)\s+[A-Z][a-z]+)/  // First Middle/Initial Last
                ];

                // Words that indicate this is NOT a valid author name
                const invalidAuthorWords = [
                    'abstract', 'faculty', 'department', 'university', 'correspondence',
                    'received', 'accepted', 'international', 'journal', 'review', 'research',
                    'paper', 'article', 'school', 'student', 'elementary', 'secondary',
                    'college', 'institute', 'published', 'volume', 'issue', 'keywords',
                    'introduction', 'conclusion', 'references', 'bibliography'
                ];

                // Try each pattern
                for (const pattern of authorPatterns) {
                    const nameMatch = line.match(pattern);
                    if (nameMatch &&
                        nameMatch[1].length >= 5 &&
                        nameMatch[1].length < 50) {

                        const nameLower = nameMatch[1].toLowerCase();
                        const hasInvalidWord = invalidAuthorWords.some(word => nameLower.includes(word));

                        if (!hasInvalidWord) {
                            // Clean up the name (remove trailing numbers, asterisks)
                            const cleanName = nameMatch[1].replace(/[\d,*]+$/, '').trim();
                            if (cleanName.split(/\s+/).length >= 2) {
                                authorCandidates.push(cleanName);
                            }
                        }
                        break;  // Move to next line after finding a match
                    }
                }

                // Also check for multiple authors on one line separated by comma or "and"
                if (authorCandidates.length === 0 && line.match(/^[A-Z][a-z]+\s+[A-Z][a-z]+.*(?:,|and|&)/i)) {
                    const multiAuthorPattern = /([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)/g;
                    let match;
                    while ((match = multiAuthorPattern.exec(line)) !== null) {
                        const name = match[1].trim();
                        const nameLower = name.toLowerCase();
                        const hasInvalidWord = invalidAuthorWords.some(word => nameLower.includes(word));

                        if (!hasInvalidWord && name.split(/\s+/).length >= 2 && name.length < 50) {
                            authorCandidates.push(name);
                        }
                    }
                }
            }

            if (authorCandidates.length > 0) {
                result.authors = authorCandidates;
            }

            // Try to find journal name - look in first few lines
            const journalPatterns = [
                /^([A-Z][A-Za-z\s]+(?:Studies|Journal|Review|Quarterly|Proceedings|Technology|Research|Science|Education)[^;]*)/i,
                /(?:published\s+(?:in|by))[:\s]+([A-Z][^,\n]+)/i
            ];

            for (const line of allLines.slice(0, 10)) {
                for (const pattern of journalPatterns) {
                    const match = line.match(pattern);
                    if (match) {
                        result.journal = match[1].trim().replace(/;.*$/, '').replace(/,\s*\d+.*$/, '').trim();
                        break;
                    }
                }
                if (result.journal) break;
            }

            // Extract volume, issue, and pages from text
            // Common patterns: "Vol. 30", "Volume 30", "30(2)", "pp. 239-254", "30, 239–254"
            const volumePatterns = [
                /Vol(?:ume)?\.?\s*(\d+)/i,
                /(\d+)\s*\(\d+\)/,  // 30(2) format - volume before parenthesis
                /,\s*(\d+)\s*,\s*\d+[-–]\d+/  // , 30, 239-254 format
            ];

            for (const pattern of volumePatterns) {
                const match = fullText.match(pattern);
                if (match && parseInt(match[1]) < 1000) {  // Reasonable volume number
                    result.volume = match[1];
                    break;
                }
            }

            // Extract issue number
            const issuePatterns = [
                /(?:No|Issue|Iss)\.?\s*(\d+)/i,
                /\d+\s*\((\d+)\)/  // 30(2) format - issue in parenthesis
            ];

            for (const pattern of issuePatterns) {
                const match = fullText.match(pattern);
                if (match && parseInt(match[1]) < 100) {  // Reasonable issue number
                    result.issue = match[1];
                    break;
                }
            }

            // Extract page numbers
            const pagePatterns = [
                /pp?\.?\s*(\d+)\s*[-–]\s*(\d+)/i,  // pp. 239-254 or p. 239-254
                /pages?\s*(\d+)\s*[-–]\s*(\d+)/i,  // pages 239-254
                /,\s*(\d+)\s*[-–]\s*(\d+)\s*\./,   // , 239-254.
                /(\d{1,4})\s*[-–]\s*(\d{1,4})(?:\s*\.|$)/  // 239-254. or 239-254 at end
            ];

            for (const pattern of pagePatterns) {
                const match = fullText.match(pattern);
                if (match) {
                    const startPage = parseInt(match[1]);
                    const endPage = parseInt(match[2]);
                    // Validate: pages should be reasonable (not years, not very large)
                    if (startPage < endPage && startPage < 10000 && endPage < 10000 &&
                        (endPage - startPage) < 500) {  // Page range < 500
                        result.pages = `${match[1]}–${match[2]}`;
                        break;
                    }
                }
            }

            // Extract publisher
            const publisherPatterns = [
                /(?:published\s+by|publisher)[:\s]+([A-Z][A-Za-z\s]+(?:Press|Publishing|Publishers|Publications)?)/i,
                /©\s*\d{4}\s+([A-Z][A-Za-z\s]+(?:Inc|Ltd|LLC|Press)?)/i,
                /(?:Springer|Elsevier|Wiley|Taylor\s*&?\s*Francis|Sage|Oxford|Cambridge|IEEE|ACM)/i
            ];

            for (const pattern of publisherPatterns) {
                const match = fullText.match(pattern);
                if (match) {
                    result.publisher = match[1] ? match[1].trim() : match[0].trim();
                    break;
                }
            }

        } catch (e) {
            // Silent error - use default metadata
        }

        return result;
    }

    // Format author name for different citation styles
    formatAuthorAPA(author) {
        const parts = author.trim().split(/\s+/);
        if (parts.length === 1) return parts[0];
        const lastName = parts.pop();
        const initials = parts.map(n => n[0].toUpperCase() + '.').join(' ');
        return `${lastName}, ${initials}`;
    }

    formatAuthorMLA(author) {
        const parts = author.trim().split(/\s+/);
        if (parts.length === 1) return parts[0];
        const lastName = parts.pop();
        const firstName = parts.join(' ');
        return `${lastName}, ${firstName}`;
    }

    formatAuthorChicago(author) {
        const parts = author.trim().split(/\s+/);
        if (parts.length === 1) return parts[0];
        const lastName = parts.pop();
        const firstName = parts.join(' ');
        return `${lastName}, ${firstName}`;
    }

    // Generate APA format citation
    // Format: Author, A. A., Author, B. B., & Author, C. C. (Year). Title. Journal Name, Volume(Issue), Pages. DOI
    generateAPA() {
        const authors = this.metadata.author;
        const year = this.metadata.year;
        const title = this.metadata.title;
        const journal = this.metadata.journal;
        const volume = this.metadata.volume;
        const issue = this.metadata.issue;
        const pages = this.metadata.pages;
        const doi = this.metadata.doi;

        // Format all authors in APA style
        let authorStr;
        if (authors.length === 1) {
            authorStr = this.formatAuthorAPA(authors[0]);
        } else if (authors.length === 2) {
            authorStr = `${this.formatAuthorAPA(authors[0])}, & ${this.formatAuthorAPA(authors[1])}`;
        } else if (authors.length <= 7) {
            // For 3-7 authors, list all with & before last
            const formattedAuthors = authors.map(a => this.formatAuthorAPA(a));
            const lastAuthor = formattedAuthors.pop();
            authorStr = formattedAuthors.join(', ') + ', & ' + lastAuthor;
        } else {
            // For 8+ authors, list first 6, ..., then last author
            const first6 = authors.slice(0, 6).map(a => this.formatAuthorAPA(a));
            const lastAuthor = this.formatAuthorAPA(authors[authors.length - 1]);
            authorStr = first6.join(', ') + ', ... ' + lastAuthor;
        }

        // Build citation
        let citation = `${authorStr} (${year}). ${title}.`;

        // Add journal info if available
        if (journal) {
            citation += ` ${journal}`;

            // Add volume and issue
            if (volume) {
                citation += `, ${volume}`;
                if (issue) {
                    citation += `(${issue})`;
                }
            }

            // Add pages
            if (pages) {
                citation += `, ${pages}`;
            }

            citation += '.';
        }

        // Add DOI or URL
        if (doi) {
            // Clean up DOI - remove any trailing punctuation
            const cleanDoi = doi.replace(/[.,;]$/, '').trim();
            citation += ` https://doi.org/${cleanDoi}`;
        } else if (this.actualPdfUrl &&
            !this.actualPdfUrl.startsWith('chrome-extension://') &&
            !this.actualPdfUrl.startsWith('blob:')) {
            citation += ` Retrieved from ${this.actualPdfUrl}`;
        }

        return citation;
    }

    // Generate MLA format citation
    // Format: Author. "Title." Journal Name, vol. Volume, no. Issue, Year, pp. Pages. DOI
    generateMLA() {
        const authors = this.metadata.author;
        const year = this.metadata.year;
        const title = this.metadata.title;
        const journal = this.metadata.journal;
        const volume = this.metadata.volume;
        const issue = this.metadata.issue;
        const pages = this.metadata.pages;
        const doi = this.metadata.doi;

        let authorStr;
        if (authors.length === 1) {
            authorStr = this.formatAuthorMLA(authors[0]);
        } else if (authors.length === 2) {
            authorStr = `${this.formatAuthorMLA(authors[0])}, and ${authors[1]}`;
        } else if (authors.length > 2) {
            authorStr = `${this.formatAuthorMLA(authors[0])}, et al.`;
        }

        let citation = `${authorStr}. "${title}."`;

        if (journal) {
            citation += ` ${journal}`;

            if (volume) {
                citation += `, vol. ${volume}`;
            }
            if (issue) {
                citation += `, no. ${issue}`;
            }
            citation += `, ${year}`;
            if (pages) {
                citation += `, pp. ${pages}`;
            }
            citation += '.';
        } else {
            citation += ` ${year}.`;
        }

        if (doi) {
            const cleanDoi = doi.replace(/[.,;]$/, '').trim();
            citation += ` doi:${cleanDoi}`;
        }

        return citation;
    }

    // Generate Chicago format citation
    generateChicago() {
        const authors = this.metadata.author;
        const year = this.metadata.year;
        const title = this.metadata.title;

        let authorStr;
        if (authors.length === 1) {
            authorStr = this.formatAuthorChicago(authors[0]);
        } else if (authors.length === 2) {
            authorStr = `${this.formatAuthorChicago(authors[0])} and ${authors[1]}`;
        } else if (authors.length > 2) {
            authorStr = `${this.formatAuthorChicago(authors[0])} et al.`;
        }

        return `${authorStr}. "${title}." ${year}.`;
    }

    // Generate Harvard format citation
    generateHarvard() {
        const authors = this.metadata.author;
        const year = this.metadata.year;
        const title = this.metadata.title;

        let authorStr;
        if (authors.length === 1) {
            const parts = authors[0].split(/\s+/);
            authorStr = parts.pop() + ', ' + parts.map(n => n[0] + '.').join('');
        } else if (authors.length === 2) {
            const a1 = authors[0].split(/\s+/);
            const a2 = authors[1].split(/\s+/);
            authorStr = `${a1.pop()}, ${a1.map(n => n[0] + '.').join('')} and ${a2.pop()}, ${a2.map(n => n[0] + '.').join('')}`;
        } else {
            const a1 = authors[0].split(/\s+/);
            authorStr = `${a1.pop()}, ${a1.map(n => n[0] + '.').join('')} et al.`;
        }

        return `${authorStr} (${year}) '${title}', PDF document.`;
    }

    // Generate BibTeX format citation
    generateBibTeX() {
        const authors = this.metadata.author.join(' and ');
        const year = this.metadata.year;
        const title = this.metadata.title;
        const key = this.metadata.author[0].split(/\s+/).pop().toLowerCase() + year;

        return `@misc{${key},
  author = {${authors}},
  title = {${title}},
  year = {${year}},
  note = {PDF document}
}`;
    }

    // Generate in-text citation format based on style
    generateInTextCitation(format, citationNumber = 1) {
        const authors = this.metadata.author;
        const year = this.metadata.year || 'n.d.';

        // Get last name of first author
        const getLastName = (author) => {
            const parts = author.trim().split(/\s+/);
            return parts.length > 0 ? parts[parts.length - 1] : author;
        };

        const lastName = getLastName(authors[0] || 'Unknown');

        switch (format) {
            case 'apa':
                // APA: (Author, Year) or (Author et al., Year)
                if (authors.length === 1) {
                    return `(${lastName}, ${year})`;
                } else if (authors.length === 2) {
                    return `(${lastName} & ${getLastName(authors[1])}, ${year})`;
                } else {
                    return `(${lastName} et al., ${year})`;
                }

            case 'mla':
                // MLA: (Author Page) or (Author et al. Page)
                if (authors.length === 1) {
                    return `(${lastName} #)`;
                } else if (authors.length === 2) {
                    return `(${lastName} and ${getLastName(authors[1])} #)`;
                } else {
                    return `(${lastName} et al. #)`;
                }

            case 'chicago':
                // Chicago Author-Date: (Author Year, Page)
                if (authors.length === 1) {
                    return `(${lastName} ${year}, #)`;
                } else if (authors.length === 2) {
                    return `(${lastName} and ${getLastName(authors[1])} ${year}, #)`;
                } else {
                    return `(${lastName} et al. ${year}, #)`;
                }

            case 'harvard':
                // Harvard: (Author Year)
                if (authors.length === 1) {
                    return `(${lastName} ${year})`;
                } else if (authors.length === 2) {
                    return `(${lastName} and ${getLastName(authors[1])} ${year})`;
                } else {
                    return `(${lastName} et al. ${year})`;
                }

            case 'ieee':
                // IEEE: [Number]
                return `[${citationNumber}]`;

            case 'bibtex':
                // BibTeX key reference
                return `\\cite{${lastName.toLowerCase()}${year}}`;

            default:
                return `(${lastName}, ${year})`;
        }
    }

    // Generate all formats
    generateAllFormats() {
        return {
            apa: this.generateAPA(),
            mla: this.generateMLA(),
            chicago: this.generateChicago(),
            harvard: this.generateHarvard(),
            bibtex: this.generateBibTeX()
        };
    }

    // Show citation side panel
    async showCitationModal() {
        // If metadata wasn't loaded yet, try to get it now
        if (!this.pdfDocument || this.metadata.title === 'Untitled Document') {
            // Check for window.pdfDoc (custom viewer) or PDFViewerApplication.pdfDocument (standard viewer)
            const pdfDoc = window.pdfDoc || (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument);
            if (pdfDoc) {
                this.pdfDocument = pdfDoc;
                await this.extractMetadata();
            }
        }

        if (!this.initialized) {
            if (window.notificationManager) {
                window.notificationManager.warning('Please wait for document to load', 'citation');
            }
            return;
        }

        // Ensure panel is created and registered before trying to open
        this.ensurePanelRegistered();

        // Use overlay manager to handle panel visibility
        if (window.overlayManager) {
            window.overlayManager.open('citation');
            return;
        }

        // Fallback if overlay manager not available
        this.openPanel();
    }

    // Ensure the panel is created and registered with overlay manager
    ensurePanelRegistered() {
        if (!document.getElementById('citationPanel')) {
            this.createPanel();
        }
    }

    openPanel() {
        let panel = document.getElementById('citationPanel');

        if (!panel) {
            this.createPanel();
            panel = document.getElementById('citationPanel');
        }

        // Update content
        this.updatePanelContent();

        // Show panel
        panel.classList.add('visible');
    }

    closePanel() {
        const panel = document.getElementById('citationPanel');
        if (panel) {
            panel.classList.remove('visible');
        }
    }

    createPanel() {
        const panel = document.createElement('div');
        panel.id = 'citationPanel';
        panel.className = 'citation-side-panel';
        panel.innerHTML = `
            <div class="citation-header">
                <h2>📚 Cite This Document</h2>
                <button class="citation-close">&times;</button>
            </div>
            <div class="citation-body">
                <div class="citation-metadata">
                    <div class="meta-item">
                        <span class="meta-label">Title:</span>
                        <input type="text" id="cite-title" value="">
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Author(s):</span>
                        <input type="text" id="cite-author" value="">
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Year:</span>
                        <input type="text" id="cite-year" value="">
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Journal:</span>
                        <input type="text" id="cite-journal" value="" placeholder="Journal or Conference name">
                    </div>
                    <div class="meta-item journal-level-section">
                        <span class="meta-label">Level:</span>
                        <span id="journal-level-badge" class="level-badge level-unknown">Unknown</span>
                    </div>
                    <div class="meta-item meta-row">
                        <div class="meta-half">
                            <span class="meta-label">Volume:</span>
                            <input type="text" id="cite-volume" value="" placeholder="e.g., 30">
                        </div>
                        <div class="meta-half">
                            <span class="meta-label">Issue:</span>
                            <input type="text" id="cite-issue" value="" placeholder="e.g., 2">
                        </div>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Pages:</span>
                        <input type="text" id="cite-pages" value="" placeholder="e.g., 239-254">
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">DOI:</span>
                        <input type="text" id="cite-doi" value="" placeholder="e.g., 10.1007/s10956-020-09895-9">
                    </div>
                    <div class="meta-item in-text-citation">
                        <span class="meta-label">In-text:</span>
                        <span class="in-text-value" id="in-text-format"></span>
                    </div>
                </div>
                <button id="regenerate-citation" class="regenerate-btn">🔄 Regenerate Citations</button>
                
                <div class="citation-formats">
                    <div class="format-tabs">
                        <button class="format-tab active" data-format="apa">APA</button>
                        <button class="format-tab" data-format="mla">MLA</button>
                        <button class="format-tab" data-format="chicago">Chicago</button>
                        <button class="format-tab" data-format="harvard">Harvard</button>
                        <button class="format-tab" data-format="bibtex">BibTeX</button>
                    </div>
                    <div class="citation-output">
                        <div class="citation-text" id="citation-apa"></div>
                        <div class="citation-text hidden" id="citation-mla"></div>
                        <div class="citation-text hidden" id="citation-chicago"></div>
                        <div class="citation-text hidden" id="citation-harvard"></div>
                        <div class="citation-text hidden" id="citation-bibtex"><pre></pre></div>
                    </div>
                    <button class="copy-citation-btn" id="copy-citation">📋 Copy Citation</button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        // Event listeners
        panel.querySelector('.citation-close').addEventListener('click', () => {
            if (window.overlayManager) {
                window.overlayManager.close('citation');
            } else {
                this.closePanel();
            }
        });

        // Tab switching
        panel.querySelectorAll('.format-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                panel.querySelectorAll('.format-tab').forEach(t => t.classList.remove('active'));
                panel.querySelectorAll('.citation-text').forEach(c => c.classList.add('hidden'));
                tab.classList.add('active');
                panel.querySelector(`#citation-${tab.dataset.format}`).classList.remove('hidden');
                // Update in-text citation format
                panel.querySelector('#in-text-format').textContent = this.generateInTextCitation(tab.dataset.format);
            });
        });

        // Copy button
        panel.querySelector('#copy-citation').addEventListener('click', () => {
            const activeFormat = panel.querySelector('.format-tab.active').dataset.format;
            const text = panel.querySelector(`#citation-${activeFormat}`).textContent;
            navigator.clipboard.writeText(text).then(() => {
                if (window.notificationManager) {
                    window.notificationManager.success('Citation copied to clipboard!', 'citation');
                }
            });
        });

        // Regenerate button
        panel.querySelector('#regenerate-citation').addEventListener('click', () => {
            // Read all metadata fields
            this.metadata.title = panel.querySelector('#cite-title').value;
            this.metadata.author = panel.querySelector('#cite-author').value.split(',').map(a => a.trim());
            this.metadata.year = panel.querySelector('#cite-year').value;
            this.metadata.journal = panel.querySelector('#cite-journal').value;
            this.metadata.volume = panel.querySelector('#cite-volume').value;
            this.metadata.issue = panel.querySelector('#cite-issue').value;
            this.metadata.pages = panel.querySelector('#cite-pages').value;
            this.metadata.doi = panel.querySelector('#cite-doi').value;

            this.updatePanelContent();

            if (window.notificationManager) {
                window.notificationManager.success('Citations regenerated!', 'citation');
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel.classList.contains('visible')) {
                if (window.overlayManager) {
                    window.overlayManager.close('citation');
                } else {
                    this.closePanel();
                }
            }
        });

        // Register with overlay manager
        if (window.overlayManager) {
            window.overlayManager.register('citation',
                () => this.openPanel(),
                () => this.closePanel()
            );
        }
    }

    // Fetch accurate metadata from CrossRef API using DOI
    async fetchMetadataFromDOI(doi) {
        // Clean up DOI - extract just the DOI part
        let cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, '').trim();
        cleanDoi = cleanDoi.replace(/^doi:\s*/i, '').trim();

        const fetchBtn = document.getElementById('fetch-from-doi');
        if (fetchBtn) {
            fetchBtn.textContent = '⏳ Fetching...';
            fetchBtn.disabled = true;
        }

        try {
            // Query CrossRef API
            const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('DOI not found');
            }

            const data = await response.json();
            const work = data.message;

            // Extract metadata
            if (work) {
                // Title
                if (work.title && work.title.length > 0) {
                    this.metadata.title = work.title[0];
                }

                // Authors
                if (work.author && work.author.length > 0) {
                    this.metadata.author = work.author.map(a => {
                        if (a.given && a.family) {
                            return `${a.given} ${a.family}`;
                        } else if (a.name) {
                            return a.name;
                        }
                        return a.family || '';
                    }).filter(n => n.length > 0);
                }

                // Year
                if (work.published && work.published['date-parts']) {
                    const dateParts = work.published['date-parts'][0];
                    if (dateParts && dateParts[0]) {
                        this.metadata.year = dateParts[0].toString();
                    }
                } else if (work['published-online'] && work['published-online']['date-parts']) {
                    const dateParts = work['published-online']['date-parts'][0];
                    if (dateParts && dateParts[0]) {
                        this.metadata.year = dateParts[0].toString();
                    }
                }

                // Journal
                if (work['container-title'] && work['container-title'].length > 0) {
                    this.metadata.journal = work['container-title'][0];
                }

                // Volume
                if (work.volume) {
                    this.metadata.volume = work.volume;
                }

                // Issue
                if (work.issue) {
                    this.metadata.issue = work.issue;
                }

                // Pages
                if (work.page) {
                    this.metadata.pages = work.page.replace('-', '–');
                }

                // DOI
                this.metadata.doi = cleanDoi;

                // Publisher
                if (work.publisher) {
                    this.metadata.publisher = work.publisher;
                }

                // Update panel
                this.updatePanelContent();
            }
        } catch (error) {
            // Silently fail - we already have PDF-extracted metadata as fallback
            console.log('DOI fetch failed, using PDF-extracted metadata');
        }
    }

    // Check journal level from Norwegian Scientific Journals Registry
    // Note: The API has CORS restrictions, so we provide a direct link to the registry
    async checkJournalLevel(journalName) {
        const badge = document.getElementById('journal-level-badge');
        if (!badge) return;

        // Since the API has CORS restrictions from browser extensions,
        // we directly show the manual lookup option
        this.showManualLookupOption(journalName);
    }

    showManualLookupOption(journalName) {
        const badge = document.getElementById('journal-level-badge');

        if (badge) {
            badge.className = 'level-badge level-manual';
            badge.innerHTML = `<a href="https://kanalregister.hkdir.no/sok?input=${encodeURIComponent(journalName)}&page=1" target="_blank" style="color: white; text-decoration: none;">🔗 Check Level</a>`;
            badge.title = 'Click to check journal level on the official registry';
        }
    }

    updateJournalLevelBadge(levelClass, text, tooltip = '') {
        const badge = document.getElementById('journal-level-badge');
        if (!badge) return;

        // Remove all level classes
        badge.className = 'level-badge';
        badge.classList.add(`level-${levelClass}`);
        badge.textContent = text;
        badge.title = tooltip;
    }

    updatePanelContent() {
        const panel = document.getElementById('citationPanel');
        if (!panel) return;

        const citations = this.generateAllFormats();

        // Update metadata inputs
        panel.querySelector('#cite-title').value = this.metadata.title || '';
        panel.querySelector('#cite-author').value = (this.metadata.author || []).join(', ');
        panel.querySelector('#cite-year').value = this.metadata.year || '';
        panel.querySelector('#cite-journal').value = this.metadata.journal || '';
        panel.querySelector('#cite-volume').value = this.metadata.volume || '';
        panel.querySelector('#cite-issue').value = this.metadata.issue || '';
        panel.querySelector('#cite-pages').value = this.metadata.pages || '';
        panel.querySelector('#cite-doi').value = this.metadata.doi || '';

        // Update in-text citation
        const activeFormat = panel.querySelector('.format-tab.active')?.dataset.format || 'apa';
        panel.querySelector('#in-text-format').textContent = this.generateInTextCitation(activeFormat);

        // Update citation texts
        panel.querySelector('#citation-apa').textContent = citations.apa;
        panel.querySelector('#citation-mla').textContent = citations.mla;
        panel.querySelector('#citation-chicago').textContent = citations.chicago;
        panel.querySelector('#citation-harvard').textContent = citations.harvard;
        panel.querySelector('#citation-bibtex pre').textContent = citations.bibtex;

        // Automatically check journal level if journal name exists
        const journalName = this.metadata.journal;
        if (journalName && journalName.trim()) {
            // Check if we haven't already fetched the level for this journal
            if (!this._lastCheckedJournal || this._lastCheckedJournal !== journalName) {
                this._lastCheckedJournal = journalName;
                this.checkJournalLevel(journalName);
            }
        } else {
            // No journal - reset badge
            this.updateJournalLevelBadge('unknown', 'Unknown');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message) {
        // Use notification manager if available
        if (window.notificationManager) {
            window.notificationManager.info(message, 'citation');
            return;
        }

        const existing = document.querySelector('.citation-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'citation-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
}

// Export for use
window.CitationManager = CitationManager;
