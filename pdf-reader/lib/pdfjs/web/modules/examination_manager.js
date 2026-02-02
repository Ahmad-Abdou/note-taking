// Examination Manager - Advanced Exam System with 6 Types
// Types: MCQ, True/False, Fill in Blank, Matching, Short Answer, Comprehensive

class ExaminationManager {
    constructor() {
        this.currentExamType = null;
        this.examData = [];
        this.userAnswers = {};
        this.currentQuestionIndex = 0;
        this.timerInterval = null;
        this.startTime = null;
        this.pdfText = '';
        this.apiKey = null;
        this.detectedChapters = [];
        this.selectedChapters = new Set();

        this.init();
    }

    init() {
        // Get API key from storage
        chrome.storage.local.get(['geminiApiKey'], (result) => {
            this.apiKey = result.geminiApiKey;
        });

        // Initialize DOM elements - now using panel instead of modal
        this.panel = document.getElementById('examinationPanel');
        this.setupPanel = document.getElementById('examSetup');
        this.examContainer = document.getElementById('examContainer');
        this.resultsPanel = document.getElementById('examResults');
        this.loadingPanel = document.getElementById('examLoading');

        this.bindEvents();
        this.registerWithOverlayManager();
    }

    registerWithOverlayManager() {
        if (window.overlayManager) {
            window.overlayManager.register('examination',
                () => this._showPanel(),
                () => this._hidePanel()
            );
        }
    }

    _showPanel() {
        if (this.panel) {
            this.panel.classList.add('visible');
            this.resetToSetup();
        }
    }

    _hidePanel() {
        if (this.panel) {
            this.panel.classList.remove('visible');
            this.stopTimer();
        }
    }

    bindEvents() {
        // Close button
        const closeBtn = document.getElementById('examClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Exam type cards
        document.querySelectorAll('.exam-type-card').forEach(card => {
            card.addEventListener('click', () => this.selectExamType(card));
        });

        // Page/content selection toggle
        const pagesSelect = document.getElementById('examPages');
        if (pagesSelect) {
            pagesSelect.addEventListener('change', () => {
                const rangeDiv = document.getElementById('examPageRange');
                const contentSelection = document.getElementById('examContentSelection');

                // Hide all
                rangeDiv.classList.add('hidden');
                if (contentSelection) contentSelection.classList.add('hidden');

                if (pagesSelect.value === 'range') {
                    rangeDiv.classList.remove('hidden');
                } else if (pagesSelect.value === 'chapters') {
                    if (contentSelection) contentSelection.classList.remove('hidden');
                }
            });

            // Initial state - chapters is default
            const contentSelection = document.getElementById('examContentSelection');
            if (contentSelection && pagesSelect.value === 'chapters') {
                contentSelection.classList.remove('hidden');
            }
        }

        // Scan for chapters button
        const scanBtn = document.getElementById('scanContentBtn');
        if (scanBtn) {
            scanBtn.addEventListener('click', () => this.scanForChapters());
        }

        // Select/Deselect all buttons
        const selectAllBtn = document.getElementById('selectAllChapters');
        const deselectAllBtn = document.getElementById('deselectAllChapters');

        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => this.toggleAllChapters(true));
        }
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', () => this.toggleAllChapters(false));
        }

        // Start exam button
        const startBtn = document.getElementById('startExamBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startExam());
        }

        // Navigation buttons
        const prevBtn = document.getElementById('examPrevBtn');
        const nextBtn = document.getElementById('examNextBtn');
        const submitBtn = document.getElementById('submitExamBtn');

        if (prevBtn) prevBtn.addEventListener('click', () => this.previousQuestion());
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextQuestion());
        if (submitBtn) submitBtn.addEventListener('click', () => this.submitExam());

        // Results buttons
        const retakeBtn = document.getElementById('retakeExamBtn');
        const newExamBtn = document.getElementById('newExamBtn');

        if (retakeBtn) retakeBtn.addEventListener('click', () => this.retakeExam());
        if (newExamBtn) newExamBtn.addEventListener('click', () => this.resetToSetup());
    }

    async scanForChapters() {
        const doc = window.pdfDoc;
        if (!doc) {
            alert('Please load a PDF first');
            return;
        }

        const chaptersList = document.getElementById('chaptersList');
        const scanBtn = document.getElementById('scanContentBtn');

        // Show scanning animation
        chaptersList.innerHTML = `
            <div class="scanning-animation">
                <div class="spinner"></div>
                <p>Scanning PDF for chapters and sections...</p>
            </div>
        `;
        scanBtn.disabled = true;
        scanBtn.textContent = 'Scanning...';

        try {
            this.detectedChapters = await this.detectChaptersFromPDF(doc);
            this.renderChaptersList();
        } catch (error) {
            console.error('Error scanning for chapters:', error);
            chaptersList.innerHTML = `
                <div class="scanning-placeholder">
                    <p>❌ Error scanning PDF. The PDF might not have a clear chapter structure.</p>
                    <p class="hint">You can still use "All Pages" or "Custom Range" options.</p>
                </div>
            `;
        }

        scanBtn.disabled = false;
        scanBtn.textContent = '🔍 Scan PDF for Chapters';
    }

    async detectChaptersFromPDF(doc) {
        const chapters = [];
        const numPages = doc.numPages;

        // Try to get outline (table of contents) first
        try {
            const outline = await doc.getOutline();
            if (outline && outline.length > 0) {
                for (let i = 0; i < outline.length; i++) {
                    const item = outline[i];
                    let pageNum = 1;

                    // Try to resolve the destination to get page number
                    if (item.dest) {
                        try {
                            let dest = item.dest;
                            if (typeof dest === 'string') {
                                dest = await doc.getDestination(dest);
                            }
                            if (dest) {
                                const ref = dest[0];
                                pageNum = await doc.getPageIndex(ref) + 1;
                            }
                        } catch (e) {
                        }
                    }

                    // Calculate end page (next chapter start - 1, or last page)
                    let endPage = numPages;
                    if (i < outline.length - 1) {
                        const nextItem = outline[i + 1];
                        if (nextItem.dest) {
                            try {
                                let nextDest = nextItem.dest;
                                if (typeof nextDest === 'string') {
                                    nextDest = await doc.getDestination(nextDest);
                                }
                                if (nextDest) {
                                    const nextRef = nextDest[0];
                                    endPage = await doc.getPageIndex(nextRef);
                                    if (endPage < 1) endPage = numPages;
                                }
                            } catch (e) { }
                        }
                    }

                    chapters.push({
                        id: i + 1,
                        title: item.title || `Section ${i + 1}`,
                        startPage: pageNum,
                        endPage: endPage,
                        preview: ''
                    });
                }
            }
        } catch (e) {
        }

        // If no outline found, detect chapters by scanning text for patterns
        if (chapters.length === 0) {
            const chapterPatterns = [
                /^(Chapter|CHAPTER)\s+(\d+|[IVXLCDM]+)[:\s]*(.*)/i,
                /^(Section|SECTION)\s+(\d+\.?\d*)[:\s]*(.*)/i,
                /^(Unit|UNIT)\s+(\d+)[:\s]*(.*)/i,
                /^(Part|PART)\s+(\d+|[IVXLCDM]+)[:\s]*(.*)/i,
                /^(\d+)\.\s+([A-Z][A-Za-z\s]{5,50})$/,
                /^(Lesson|LESSON)\s+(\d+)[:\s]*(.*)/i,
                /^(Module|MODULE)\s+(\d+)[:\s]*(.*)/i
            ];

            for (let pageNum = 1; pageNum <= Math.min(numPages, 50); pageNum++) {
                const page = await doc.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                const lines = pageText.split(/\s{2,}|\n/).filter(l => l.trim());

                for (const line of lines.slice(0, 10)) { // Check first 10 lines of each page
                    for (const pattern of chapterPatterns) {
                        const match = line.trim().match(pattern);
                        if (match) {
                            const title = match[3] ? `${match[1]} ${match[2]}: ${match[3]}` : `${match[1]} ${match[2]}`;

                            // Avoid duplicates
                            if (!chapters.some(c => c.title.toLowerCase() === title.toLowerCase())) {
                                chapters.push({
                                    id: chapters.length + 1,
                                    title: title.trim(),
                                    startPage: pageNum,
                                    endPage: numPages, // Will be updated
                                    preview: ''
                                });
                            }
                            break;
                        }
                    }
                }
            }

            // Update end pages
            for (let i = 0; i < chapters.length - 1; i++) {
                chapters[i].endPage = chapters[i + 1].startPage - 1;
            }
        }

        // If still no chapters found, create page-based sections
        if (chapters.length === 0) {
            const pagesPerSection = Math.ceil(numPages / Math.min(10, numPages));
            for (let i = 0; i < numPages; i += pagesPerSection) {
                chapters.push({
                    id: chapters.length + 1,
                    title: `Pages ${i + 1} - ${Math.min(i + pagesPerSection, numPages)}`,
                    startPage: i + 1,
                    endPage: Math.min(i + pagesPerSection, numPages),
                    preview: ''
                });
            }
        }

        // Get preview text for each chapter
        for (const chapter of chapters) {
            try {
                const page = await doc.getPage(chapter.startPage);
                const textContent = await page.getTextContent();
                const text = textContent.items.map(item => item.str).join(' ');
                chapter.preview = text.substring(0, 150).trim() + '...';
            } catch (e) {
                chapter.preview = '';
            }
        }

        return chapters;
    }

    renderChaptersList() {
        const chaptersList = document.getElementById('chaptersList');

        if (this.detectedChapters.length === 0) {
            chaptersList.innerHTML = `
                <div class="scanning-placeholder">
                    <p>No chapters detected in this PDF.</p>
                    <p class="hint">Use "All Pages" or "Custom Range" options instead.</p>
                </div>
            `;
            return;
        }

        // Select all by default
        this.selectedChapters = new Set(this.detectedChapters.map(c => c.id));

        chaptersList.innerHTML = this.detectedChapters.map(chapter => `
            <div class="chapter-item selected" data-chapter-id="${chapter.id}">
                <input type="checkbox" checked id="chapter-${chapter.id}">
                <div class="chapter-info">
                    <div class="chapter-title">${this.escapeHtml(chapter.title)}</div>
                    <div class="chapter-meta">Pages ${chapter.startPage}${chapter.endPage !== chapter.startPage ? ' - ' + chapter.endPage : ''}</div>
                    ${chapter.preview ? `<div class="chapter-preview">${this.escapeHtml(chapter.preview)}</div>` : ''}
                </div>
            </div>
        `).join('');

        // Bind click events
        chaptersList.querySelectorAll('.chapter-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const checkbox = item.querySelector('input[type="checkbox"]');
                    checkbox.checked = !checkbox.checked;
                }
                this.handleChapterToggle(item);
            });
        });

        this.updateSelectedCount();
    }

    handleChapterToggle(item) {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const chapterId = parseInt(item.dataset.chapterId);

        if (checkbox.checked) {
            this.selectedChapters.add(chapterId);
            item.classList.add('selected');
        } else {
            this.selectedChapters.delete(chapterId);
            item.classList.remove('selected');
        }

        this.updateSelectedCount();
    }

    toggleAllChapters(select) {
        const items = document.querySelectorAll('.chapter-item');
        items.forEach(item => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const chapterId = parseInt(item.dataset.chapterId);

            checkbox.checked = select;
            if (select) {
                this.selectedChapters.add(chapterId);
                item.classList.add('selected');
            } else {
                this.selectedChapters.delete(chapterId);
                item.classList.remove('selected');
            }
        });

        this.updateSelectedCount();
    }

    updateSelectedCount() {
        const countEl = document.getElementById('selectedChaptersCount');
        if (countEl) {
            const count = this.selectedChapters.size;
            countEl.textContent = `${count} section${count !== 1 ? 's' : ''} selected`;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    open() {
        // Use overlay manager to ensure only one panel/modal is open
        if (window.overlayManager) {
            window.overlayManager.open('examination');
        } else {
            this._showPanel();
        }
    }

    close() {
        if (window.overlayManager) {
            window.overlayManager.close('examination');
        } else {
            this._hidePanel();
        }
    }

    selectExamType(card) {
        // Remove active from all cards
        document.querySelectorAll('.exam-type-card').forEach(c => c.classList.remove('active'));

        // Add active to selected
        card.classList.add('active');
        this.currentExamType = card.dataset.exam;

        // Enable start button
        const startBtn = document.getElementById('startExamBtn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = `Start ${this.getExamTypeName(this.currentExamType)} Exam`;
        }
    }

    getExamTypeName(type) {
        const names = {
            'mcq': 'Multiple Choice',
            'truefalse': 'True/False',
            'fillblank': 'Fill in the Blank',
            'matching': 'Matching',
            'shortanswer': 'Short Answer',
            'comprehensive': 'Comprehensive'
        };
        return names[type] || type;
    }

    async startExam() {
        if (!this.currentExamType) return;

        // Show loading
        this.showPanel('loading');

        try {
            // Extract PDF text
            await this.extractPdfText();

            // Generate questions
            await this.generateQuestions();

            // Initialize exam
            this.currentQuestionIndex = 0;
            this.userAnswers = {};
            this.startTimer();

            // Show exam container
            this.showPanel('exam');
            this.displayCurrentQuestion();
            this.updateProgress();

        } catch (error) {
            console.error('Error starting exam:', error);
            alert('Error generating exam. Please make sure a PDF is loaded and try again.');
            this.resetToSetup();
        }
    }

    async extractPdfText() {
        const doc = window.pdfDoc;
        if (!doc) throw new Error('No PDF loaded');

        const pagesOption = document.getElementById('examPages').value;
        const currentPage = parseInt(document.getElementById('pageNumber').value) || 1;

        let pageRange = [];

        if (pagesOption === 'current') {
            pageRange = [currentPage];
        } else if (pagesOption === 'range') {
            const start = parseInt(document.getElementById('examStartPage').value) || 1;
            const end = parseInt(document.getElementById('examEndPage').value) || doc.numPages;
            for (let i = start; i <= Math.min(end, doc.numPages); i++) {
                pageRange.push(i);
            }
        } else if (pagesOption === 'chapters') {
            // Use selected chapters
            if (this.selectedChapters.size === 0) {
                // If no chapters selected or scanned yet, scan first
                if (this.detectedChapters.length === 0) {
                    await this.scanForChapters();
                }
                // Select all if still none selected
                if (this.selectedChapters.size === 0 && this.detectedChapters.length > 0) {
                    this.detectedChapters.forEach(c => this.selectedChapters.add(c.id));
                }
            }

            // Get pages from selected chapters
            const selectedChapterData = this.detectedChapters.filter(c => this.selectedChapters.has(c.id));

            if (selectedChapterData.length === 0) {
                // Fall back to all pages
                for (let i = 1; i <= doc.numPages; i++) {
                    pageRange.push(i);
                }
            } else {
                // Collect all pages from selected chapters (avoid duplicates)
                const pageSet = new Set();
                selectedChapterData.forEach(chapter => {
                    for (let p = chapter.startPage; p <= chapter.endPage; p++) {
                        if (p >= 1 && p <= doc.numPages) {
                            pageSet.add(p);
                        }
                    }
                });
                pageRange = Array.from(pageSet).sort((a, b) => a - b);
            }
        } else {
            // All pages
            for (let i = 1; i <= doc.numPages; i++) {
                pageRange.push(i);
            }
        }

        let allText = '';
        for (const pageNum of pageRange) {
            const page = await doc.getPage(pageNum);
            const textContent = await page.getTextContent();
            textContent.items.forEach(item => {
                allText += item.str + ' ';
            });
            allText += '\n\n';
        }

        this.pdfText = allText.trim();

        if (this.pdfText.length < 100) {
            throw new Error('Not enough text content in the PDF');
        }
    }

    async generateQuestions() {
        const count = parseInt(document.getElementById('examQuestionCount').value);
        const difficulty = document.getElementById('examDifficulty').value;

        if (this.apiKey) {
            // Use AI to generate questions
            await this.generateAIQuestions(count, difficulty);
        } else {
            // Fallback to rule-based generation
            this.generateRuleBasedQuestions(count, difficulty);
        }
    }

    async generateAIQuestions(count, difficulty) {
        const loadingText = document.getElementById('examLoadingText');
        if (loadingText) {
            loadingText.textContent = 'Generating intelligent questions using AI...';
        }

        const examType = this.currentExamType;
        let prompt = this.buildAIPrompt(examType, count, difficulty);

        // Models to try in order (primary, then fallbacks)
        const models = [
            'gemini-2.0-flash',
            'gemini-2.0-flash-lite',
            'gemini-1.5-flash-latest',
            'gemini-1.5-pro'
        ];

        let lastError = null;

        for (const model of models) {
            try {
                if (loadingText && model !== models[0]) {
                    loadingText.textContent = `Trying alternative model (${model})...`;
                }

                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 4096
                        }
                    })
                });

                // Check for rate limiting - try next model
                if (response.status === 429) {
                    lastError = new Error(`${model} rate limited`);
                    continue;
                }

                // Check for model not found - try next model
                if (response.status === 404) {
                    lastError = new Error(`${model} not found`);
                    continue;
                }

                const data = await response.json();

                if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                    const text = data.candidates[0].content.parts[0].text;
                    this.examData = this.parseAIResponse(text, examType);

                    if (this.examData.length === 0) {
                        throw new Error('Failed to parse AI response');
                    }

                    return; // Success! Exit the function
                } else if (data.error) {
                    lastError = new Error(data.error.message);
                    continue;
                } else {
                    throw new Error('Invalid AI response');
                }
            } catch (error) {
                lastError = error;
                continue;
            }
        }

        // All models failed, fall back to rule-based
        console.error('All AI models failed, falling back to rule-based:', lastError);
        this.generateRuleBasedQuestions(count, difficulty);
    }

    buildAIPrompt(examType, count, difficulty) {
        const difficultyDesc = {
            'easy': 'basic recall and simple understanding',
            'medium': 'moderate analysis and application',
            'hard': 'deep analysis, synthesis, and critical thinking'
        };

        let typeInstructions = '';

        switch (examType) {
            case 'mcq':
                typeInstructions = `Generate ${count} multiple choice questions. Each question should have exactly 4 options (A, B, C, D) with only one correct answer.
Format each question as:
Q: [Question text]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
CORRECT: [A/B/C/D]
EXPLANATION: [Brief explanation of why this is correct]
---`;
                break;

            case 'truefalse':
                typeInstructions = `Generate ${count} true/false questions. Include statements that are clearly true or false based on the content.
Format each question as:
Q: [Statement]
ANSWER: [TRUE/FALSE]
EXPLANATION: [Brief explanation]
---`;
                break;

            case 'fillblank':
                typeInstructions = `Generate ${count} fill-in-the-blank questions. Remove ONE key term from each sentence.
Format each question as:
Q: [Sentence with _____ for the blank]
ANSWER: [The missing word/phrase]
EXPLANATION: [Context for the answer]
---`;
                break;

            case 'matching':
                typeInstructions = `Generate ${count} matching pairs (terms and their definitions/descriptions).
Format as:
TERMS:
1. [Term 1]
2. [Term 2]
... (continue for ${count} terms)

DEFINITIONS:
A. [Definition that matches one of the terms]
B. [Definition that matches one of the terms]
... (continue for ${count} definitions, shuffled order)

ANSWERS:
1-[letter], 2-[letter], ...
---`;
                break;

            case 'shortanswer':
                typeInstructions = `Generate ${count} short answer questions that require 1-3 sentence responses.
Format each question as:
Q: [Question]
EXPECTED_ANSWER: [Model answer - the key points that should be mentioned]
KEY_TERMS: [Comma-separated list of key terms that indicate a correct answer]
---`;
                break;

            case 'comprehensive':
                typeInstructions = `Generate a comprehensive exam with a mix of question types:
- ${Math.ceil(count * 0.3)} Multiple Choice questions
- ${Math.ceil(count * 0.2)} True/False questions  
- ${Math.ceil(count * 0.2)} Fill in the Blank questions
- ${Math.ceil(count * 0.15)} Matching pairs
- ${Math.ceil(count * 0.15)} Short Answer questions

Use the formats specified above for each type. Clearly label each section with TYPE: [type name]
---`;
                break;
        }

        return `You are an expert educator creating an examination. Based on the following content, create a ${difficulty} difficulty exam.

CONTENT:
${this.pdfText.substring(0, 8000)}

INSTRUCTIONS:
${typeInstructions}

Requirements for ${difficultyDesc[difficulty]}:
- Questions should be directly based on the content provided
- Ensure factual accuracy
- For wrong options in MCQ, make them plausible but clearly incorrect
- Explanations should help students learn from their mistakes

Generate the exam now:`;
    }

    parseAIResponse(text, examType) {
        const questions = [];

        try {
            if (examType === 'mcq' || examType === 'comprehensive') {
                const mcqMatches = text.split('---').filter(q => q.includes('Q:') && q.includes('A)'));

                for (const match of mcqMatches) {
                    const questionMatch = match.match(/Q:\s*(.+?)(?=\nA\))/s);
                    const optionA = match.match(/A\)\s*(.+?)(?=\nB\))/s);
                    const optionB = match.match(/B\)\s*(.+?)(?=\nC\))/s);
                    const optionC = match.match(/C\)\s*(.+?)(?=\nD\))/s);
                    const optionD = match.match(/D\)\s*(.+?)(?=\nCORRECT:)/s);
                    const correct = match.match(/CORRECT:\s*([A-D])/i);
                    const explanation = match.match(/EXPLANATION:\s*(.+?)(?=---|$)/s);

                    if (questionMatch && optionA && optionB && optionC && optionD && correct) {
                        questions.push({
                            type: 'mcq',
                            question: questionMatch[1].trim(),
                            options: [
                                optionA[1].trim(),
                                optionB[1].trim(),
                                optionC[1].trim(),
                                optionD[1].trim()
                            ],
                            correctAnswer: correct[1].toUpperCase(),
                            explanation: explanation ? explanation[1].trim() : ''
                        });
                    }
                }
            }

            if (examType === 'truefalse' || examType === 'comprehensive') {
                const tfMatches = text.split('---').filter(q => q.includes('ANSWER:') && (q.includes('TRUE') || q.includes('FALSE')));

                for (const match of tfMatches) {
                    const questionMatch = match.match(/Q:\s*(.+?)(?=\nANSWER:)/s);
                    const answerMatch = match.match(/ANSWER:\s*(TRUE|FALSE)/i);
                    const explanation = match.match(/EXPLANATION:\s*(.+?)(?=---|$)/s);

                    if (questionMatch && answerMatch) {
                        questions.push({
                            type: 'truefalse',
                            question: questionMatch[1].trim(),
                            correctAnswer: answerMatch[1].toUpperCase(),
                            explanation: explanation ? explanation[1].trim() : ''
                        });
                    }
                }
            }

            if (examType === 'fillblank' || examType === 'comprehensive') {
                const fbMatches = text.split('---').filter(q => q.includes('_____') || q.includes('___'));

                for (const match of fbMatches) {
                    const questionMatch = match.match(/Q:\s*(.+?)(?=\nANSWER:)/s);
                    const answerMatch = match.match(/ANSWER:\s*(.+?)(?=\nEXPLANATION:|---|$)/s);
                    const explanation = match.match(/EXPLANATION:\s*(.+?)(?=---|$)/s);

                    if (questionMatch && answerMatch) {
                        questions.push({
                            type: 'fillblank',
                            question: questionMatch[1].trim(),
                            correctAnswer: answerMatch[1].trim(),
                            explanation: explanation ? explanation[1].trim() : ''
                        });
                    }
                }
            }

            if (examType === 'matching') {
                const termsMatch = text.match(/TERMS:\s*([\s\S]+?)(?=DEFINITIONS:)/i);
                const defsMatch = text.match(/DEFINITIONS:\s*([\s\S]+?)(?=ANSWERS:)/i);
                const answersMatch = text.match(/ANSWERS:\s*([\s\S]+?)(?=---|$)/i);

                if (termsMatch && defsMatch && answersMatch) {
                    const terms = termsMatch[1].match(/\d+\.\s*(.+)/g) || [];
                    const defs = defsMatch[1].match(/[A-Z]\.\s*(.+)/g) || [];
                    const answers = answersMatch[1].match(/\d+-[A-Z]/gi) || [];

                    const answerMap = {};
                    answers.forEach(a => {
                        const [num, letter] = a.split('-');
                        answerMap[num] = letter.toUpperCase();
                    });

                    questions.push({
                        type: 'matching',
                        terms: terms.map(t => t.replace(/^\d+\.\s*/, '').trim()),
                        definitions: defs.map(d => d.replace(/^[A-Z]\.\s*/, '').trim()),
                        correctAnswers: answerMap
                    });
                }
            }

            if (examType === 'shortanswer' || examType === 'comprehensive') {
                const saMatches = text.split('---').filter(q => q.includes('EXPECTED_ANSWER:') || q.includes('KEY_TERMS:'));

                for (const match of saMatches) {
                    const questionMatch = match.match(/Q:\s*(.+?)(?=\nEXPECTED_ANSWER:)/s);
                    const answerMatch = match.match(/EXPECTED_ANSWER:\s*(.+?)(?=\nKEY_TERMS:|---|$)/s);
                    const keyTerms = match.match(/KEY_TERMS:\s*(.+?)(?=---|$)/s);

                    if (questionMatch && answerMatch) {
                        questions.push({
                            type: 'shortanswer',
                            question: questionMatch[1].trim(),
                            expectedAnswer: answerMatch[1].trim(),
                            keyTerms: keyTerms ? keyTerms[1].split(',').map(t => t.trim().toLowerCase()) : []
                        });
                    }
                }
            }

        } catch (error) {
            console.error('Error parsing AI response:', error);
        }

        return questions;
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    generateRuleBasedQuestions(count, difficulty) {
        // Fallback rule-based generation
        const sentences = this.pdfText.split(/[.!?]+/).filter(s => s.trim().length > 30);
        const shuffled = sentences.sort(() => Math.random() - 0.5);

        this.examData = [];

        for (let i = 0; i < Math.min(count, shuffled.length); i++) {
            const sentence = shuffled[i].trim();
            const words = sentence.split(/\s+/).filter(w => w.length > 4);

            if (words.length < 3) continue;

            const questionType = this.currentExamType === 'comprehensive'
                ? ['mcq', 'truefalse', 'fillblank'][i % 3]
                : this.currentExamType;

            switch (questionType) {
                case 'mcq':
                    if (words.length >= 4) {
                        const keyWordIndex = Math.floor(Math.random() * words.length);
                        const keyWord = words[keyWordIndex];
                        const blankSentence = sentence.replace(new RegExp(`\\b${this.escapeRegex(keyWord)}\\b`, 'i'), '_____');

                        const wrongOptions = words
                            .filter(w => w.toLowerCase() !== keyWord.toLowerCase())
                            .slice(0, 3)
                            .map(w => w.replace(/[^a-zA-Z0-9]/g, ''));

                        while (wrongOptions.length < 3) {
                            wrongOptions.push('N/A');
                        }

                        const options = [keyWord.replace(/[^a-zA-Z0-9]/g, ''), ...wrongOptions]
                            .sort(() => Math.random() - 0.5);

                        const correctIndex = options.findIndex(o => o.toLowerCase() === keyWord.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
                        const correctLetter = ['A', 'B', 'C', 'D'][correctIndex];

                        this.examData.push({
                            type: 'mcq',
                            question: `Complete the sentence: "${blankSentence.substring(0, 200)}${blankSentence.length > 200 ? '...' : ''}"`,
                            options: options,
                            correctAnswer: correctLetter,
                            explanation: `The correct answer is "${keyWord}" as it appears in the original text.`
                        });
                    }
                    break;

                case 'truefalse':
                    const isTrue = Math.random() > 0.5;
                    let statement = sentence;

                    if (!isTrue && words.length > 2) {
                        const randomWord = words[Math.floor(Math.random() * words.length)];
                        const replacement = words.find(w => w !== randomWord) || 'something';
                        statement = sentence.replace(new RegExp(`\\b${this.escapeRegex(randomWord)}\\b`, 'i'), replacement);
                    }

                    this.examData.push({
                        type: 'truefalse',
                        question: `"${statement.substring(0, 200)}${statement.length > 200 ? '...' : ''}"`,
                        correctAnswer: isTrue ? 'TRUE' : 'FALSE',
                        explanation: isTrue
                            ? 'This statement is directly from the text.'
                            : 'This statement has been modified from the original text.'
                    });
                    break;

                case 'fillblank':
                    if (words.length >= 2) {
                        const keyWord = words[Math.floor(Math.random() * words.length)];
                        const blankSentence = sentence.replace(new RegExp(`\\b${this.escapeRegex(keyWord)}\\b`, 'i'), '_____');

                        this.examData.push({
                            type: 'fillblank',
                            question: blankSentence.substring(0, 200) + (blankSentence.length > 200 ? '...' : ''),
                            correctAnswer: keyWord,
                            explanation: `The missing word "${keyWord}" completes this sentence from the text.`
                        });
                    }
                    break;

                case 'shortanswer':
                    this.examData.push({
                        type: 'shortanswer',
                        question: `Explain the following concept based on the text: "${sentence.substring(0, 100)}..."`,
                        expectedAnswer: sentence,
                        keyTerms: words.slice(0, 5).map(w => w.toLowerCase())
                    });
                    break;
            }
        }

        // Handle matching type
        if (this.currentExamType === 'matching') {
            this.examData = [{
                type: 'matching',
                terms: shuffled.slice(0, 5).map(s => s.split(/\s+/).slice(0, 3).join(' ')),
                definitions: shuffled.slice(0, 5).map(s => s.split(/\s+/).slice(3, 10).join(' ')),
                correctAnswers: { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E' }
            }];
        }
    }

    displayCurrentQuestion() {
        const container = document.getElementById('examQuestions');
        if (!container || this.examData.length === 0) return;

        const question = this.examData[this.currentQuestionIndex];
        let html = '';

        switch (question.type) {
            case 'mcq':
                html = this.renderMCQQuestion(question, this.currentQuestionIndex);
                break;
            case 'truefalse':
                html = this.renderTrueFalseQuestion(question, this.currentQuestionIndex);
                break;
            case 'fillblank':
                html = this.renderFillBlankQuestion(question, this.currentQuestionIndex);
                break;
            case 'matching':
                html = this.renderMatchingQuestion(question, this.currentQuestionIndex);
                break;
            case 'shortanswer':
                html = this.renderShortAnswerQuestion(question, this.currentQuestionIndex);
                break;
        }

        container.innerHTML = html;

        // Restore previous answer if exists
        this.restoreAnswer(this.currentQuestionIndex);

        // Bind answer events
        this.bindAnswerEvents();
    }

    renderMCQQuestion(q, index) {
        return `
            <div class="exam-question" data-index="${index}" data-type="mcq">
                <div class="question-number">Question ${index + 1}</div>
                <div class="question-text">${q.question}</div>
                <div class="question-options">
                    ${q.options.map((opt, i) => `
                        <label class="option-label" data-option="${['A', 'B', 'C', 'D'][i]}">
                            <input type="radio" name="q${index}" value="${['A', 'B', 'C', 'D'][i]}">
                            <span class="option-letter">${['A', 'B', 'C', 'D'][i]}</span>
                            <span class="option-text">${opt}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderTrueFalseQuestion(q, index) {
        return `
            <div class="exam-question" data-index="${index}" data-type="truefalse">
                <div class="question-number">Question ${index + 1}</div>
                <div class="question-text">${q.question}</div>
                <div class="question-options tf-options">
                    <label class="option-label tf-option" data-option="TRUE">
                        <input type="radio" name="q${index}" value="TRUE">
                        <span class="tf-icon">✓</span>
                        <span>True</span>
                    </label>
                    <label class="option-label tf-option" data-option="FALSE">
                        <input type="radio" name="q${index}" value="FALSE">
                        <span class="tf-icon">✗</span>
                        <span>False</span>
                    </label>
                </div>
            </div>
        `;
    }

    renderFillBlankQuestion(q, index) {
        return `
            <div class="exam-question" data-index="${index}" data-type="fillblank">
                <div class="question-number">Question ${index + 1}</div>
                <div class="question-text">${q.question}</div>
                <div class="fill-blank-input">
                    <input type="text" class="blank-answer" name="q${index}" placeholder="Type your answer here...">
                </div>
            </div>
        `;
    }

    renderMatchingQuestion(q, index) {
        const shuffledDefs = [...q.definitions].sort(() => Math.random() - 0.5);

        return `
            <div class="exam-question" data-index="${index}" data-type="matching">
                <div class="question-number">Question ${index + 1}</div>
                <div class="question-text">Match the terms with their correct definitions:</div>
                <div class="matching-container">
                    <div class="matching-terms">
                        ${q.terms.map((term, i) => `
                            <div class="matching-term">
                                <span class="term-number">${i + 1}.</span>
                                <span class="term-text">${term}</span>
                                <select class="matching-select" data-term="${i + 1}">
                                    <option value="">Select...</option>
                                    ${shuffledDefs.map((_, di) => `
                                        <option value="${['A', 'B', 'C', 'D', 'E'][di]}">${['A', 'B', 'C', 'D', 'E'][di]}</option>
                                    `).join('')}
                                </select>
                            </div>
                        `).join('')}
                    </div>
                    <div class="matching-definitions">
                        ${shuffledDefs.map((def, i) => `
                            <div class="matching-definition">
                                <span class="def-letter">${['A', 'B', 'C', 'D', 'E'][i]}.</span>
                                <span class="def-text">${def}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    renderShortAnswerQuestion(q, index) {
        return `
            <div class="exam-question" data-index="${index}" data-type="shortanswer">
                <div class="question-number">Question ${index + 1}</div>
                <div class="question-text">${q.question}</div>
                <div class="short-answer-input">
                    <textarea class="short-answer" name="q${index}" placeholder="Write your answer here..." rows="4"></textarea>
                </div>
            </div>
        `;
    }

    bindAnswerEvents() {
        // Radio buttons
        document.querySelectorAll('.exam-question input[type="radio"]').forEach(input => {
            input.addEventListener('change', (e) => {
                const index = this.currentQuestionIndex;
                this.userAnswers[index] = e.target.value;
            });
        });

        // Text inputs
        document.querySelectorAll('.blank-answer, .short-answer').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = this.currentQuestionIndex;
                this.userAnswers[index] = e.target.value;
            });
        });

        // Matching selects
        document.querySelectorAll('.matching-select').forEach(select => {
            select.addEventListener('change', () => {
                const index = this.currentQuestionIndex;
                const answers = {};
                document.querySelectorAll('.matching-select').forEach(s => {
                    if (s.value) {
                        answers[s.dataset.term] = s.value;
                    }
                });
                this.userAnswers[index] = answers;
            });
        });
    }

    restoreAnswer(index) {
        const answer = this.userAnswers[index];
        if (!answer) return;

        const question = this.examData[index];

        if (question.type === 'mcq' || question.type === 'truefalse') {
            const radio = document.querySelector(`input[name="q${index}"][value="${answer}"]`);
            if (radio) radio.checked = true;
        } else if (question.type === 'fillblank') {
            const input = document.querySelector(`.blank-answer[name="q${index}"]`);
            if (input) input.value = answer;
        } else if (question.type === 'shortanswer') {
            const textarea = document.querySelector(`.short-answer[name="q${index}"]`);
            if (textarea) textarea.value = answer;
        } else if (question.type === 'matching') {
            Object.keys(answer).forEach(term => {
                const select = document.querySelector(`.matching-select[data-term="${term}"]`);
                if (select) select.value = answer[term];
            });
        }
    }

    previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.displayCurrentQuestion();
            this.updateProgress();
            this.updateNavButtons();
        }
    }

    nextQuestion() {
        if (this.currentQuestionIndex < this.examData.length - 1) {
            this.currentQuestionIndex++;
            this.displayCurrentQuestion();
            this.updateProgress();
            this.updateNavButtons();
        }
    }

    updateProgress() {
        const fill = document.getElementById('examProgressFill');
        const text = document.getElementById('examProgressText');

        if (fill) {
            const progress = ((this.currentQuestionIndex + 1) / this.examData.length) * 100;
            fill.style.width = `${progress}%`;
        }

        if (text) {
            text.textContent = `Question ${this.currentQuestionIndex + 1} of ${this.examData.length}`;
        }

        this.updateNavButtons();
    }

    updateNavButtons() {
        const prevBtn = document.getElementById('examPrevBtn');
        const nextBtn = document.getElementById('examNextBtn');
        const submitBtn = document.getElementById('submitExamBtn');

        if (prevBtn) {
            prevBtn.disabled = this.currentQuestionIndex === 0;
        }

        if (nextBtn && submitBtn) {
            if (this.currentQuestionIndex === this.examData.length - 1) {
                nextBtn.classList.add('hidden');
                submitBtn.classList.remove('hidden');
            } else {
                nextBtn.classList.remove('hidden');
                submitBtn.classList.add('hidden');
            }
        }
    }

    startTimer() {
        this.startTime = Date.now();
        const timerEl = document.getElementById('examTimer');

        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            if (timerEl) {
                timerEl.textContent = `⏱️ ${minutes}:${seconds}`;
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    submitExam() {
        if (!confirm('Are you sure you want to submit your exam?')) return;

        this.stopTimer();
        this.calculateResults();
        this.showPanel('results');
    }

    calculateResults() {
        let correct = 0;
        const mistakes = [];

        this.examData.forEach((q, index) => {
            const userAnswer = this.userAnswers[index];
            let isCorrect = false;

            switch (q.type) {
                case 'mcq':
                case 'truefalse':
                    isCorrect = userAnswer === q.correctAnswer;
                    break;

                case 'fillblank':
                    isCorrect = userAnswer &&
                        userAnswer.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim();
                    break;

                case 'matching':
                    if (userAnswer) {
                        const correctCount = Object.keys(q.correctAnswers).filter(
                            key => userAnswer[key] === q.correctAnswers[key]
                        ).length;
                        isCorrect = correctCount === Object.keys(q.correctAnswers).length;
                    }
                    break;

                case 'shortanswer':
                    if (userAnswer && q.keyTerms) {
                        const answerLower = userAnswer.toLowerCase();
                        const matchedTerms = q.keyTerms.filter(term => answerLower.includes(term));
                        isCorrect = matchedTerms.length >= Math.ceil(q.keyTerms.length * 0.5);
                    }
                    break;
            }

            if (isCorrect) {
                correct++;
            } else {
                mistakes.push({
                    index: index + 1,
                    question: q,
                    userAnswer: userAnswer,
                    correctAnswer: q.correctAnswer || q.expectedAnswer || q.correctAnswers
                });
            }
        });

        // Update results UI
        const total = this.examData.length;
        const percent = Math.round((correct / total) * 100);
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');

        document.getElementById('scorePercent').textContent = `${percent}%`;
        document.getElementById('correctCount').textContent = correct;
        document.getElementById('totalCount').textContent = total;
        document.getElementById('timeSpent').textContent = `${minutes}:${seconds}`;
        document.getElementById('accuracy').textContent = `${percent}%`;

        // Update score circle color
        const scoreCircle = document.querySelector('.score-circle');
        if (scoreCircle) {
            if (percent >= 80) {
                scoreCircle.style.background = 'linear-gradient(135deg, #4CAF50, #81C784)';
            } else if (percent >= 60) {
                scoreCircle.style.background = 'linear-gradient(135deg, #FFC107, #FFD54F)';
            } else {
                scoreCircle.style.background = 'linear-gradient(135deg, #f44336, #E57373)';
            }
        }

        // Title based on score
        const title = document.getElementById('resultsTitle');
        if (percent >= 90) {
            title.textContent = '🏆 Excellent!';
        } else if (percent >= 80) {
            title.textContent = '🌟 Great Job!';
        } else if (percent >= 70) {
            title.textContent = '👍 Good Work!';
        } else if (percent >= 60) {
            title.textContent = '📚 Keep Practicing!';
        } else {
            title.textContent = '💪 Don\'t Give Up!';
        }

        // Display mistakes for review
        this.displayMistakes(mistakes);
    }

    displayMistakes(mistakes) {
        const container = document.getElementById('mistakesReview');
        if (!container) return;

        if (mistakes.length === 0) {
            container.innerHTML = '<div class="perfect-score">🎉 Perfect Score! No mistakes to review.</div>';
            return;
        }

        container.innerHTML = mistakes.map(m => `
            <div class="mistake-item">
                <div class="mistake-header">
                    <span class="mistake-number">Question ${m.index}</span>
                    <span class="mistake-type">${this.getExamTypeName(m.question.type)}</span>
                </div>
                <div class="mistake-question">${m.question.question}</div>
                <div class="mistake-answers">
                    <div class="your-answer">
                        <span class="answer-label">Your Answer:</span>
                        <span class="answer-value wrong">${this.formatAnswer(m.userAnswer) || 'Not answered'}</span>
                    </div>
                    <div class="correct-answer">
                        <span class="answer-label">Correct Answer:</span>
                        <span class="answer-value correct">${this.formatAnswer(m.correctAnswer)}</span>
                    </div>
                </div>
                ${m.question.explanation ? `
                    <div class="mistake-explanation">
                        <span class="explanation-icon">💡</span>
                        <span>${m.question.explanation}</span>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    formatAnswer(answer) {
        if (!answer) return '';
        if (typeof answer === 'object') {
            return Object.entries(answer).map(([k, v]) => `${k}→${v}`).join(', ');
        }
        return answer;
    }

    retakeExam() {
        this.currentQuestionIndex = 0;
        this.userAnswers = {};
        this.startTimer();
        this.showPanel('exam');
        this.displayCurrentQuestion();
        this.updateProgress();
    }

    resetToSetup() {
        this.stopTimer();
        this.examData = [];
        this.userAnswers = {};
        this.currentQuestionIndex = 0;
        this.currentExamType = null;

        // Reset UI
        document.querySelectorAll('.exam-type-card').forEach(c => c.classList.remove('active'));
        const startBtn = document.getElementById('startExamBtn');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = 'Select an Exam Type to Begin';
        }

        // Reset content selection visibility based on current selection
        const pagesSelect = document.getElementById('examPages');
        const contentSelection = document.getElementById('examContentSelection');
        const rangeDiv = document.getElementById('examPageRange');

        if (pagesSelect && contentSelection) {
            rangeDiv.classList.add('hidden');
            if (pagesSelect.value === 'chapters') {
                contentSelection.classList.remove('hidden');
            } else if (pagesSelect.value === 'range') {
                rangeDiv.classList.remove('hidden');
                contentSelection.classList.add('hidden');
            } else {
                contentSelection.classList.add('hidden');
            }
        }

        this.showPanel('setup');
    }

    showPanel(panel) {
        // Hide all panels
        [this.setupPanel, this.examContainer, this.resultsPanel, this.loadingPanel].forEach(p => {
            if (p) p.classList.add('hidden');
        });

        // Show requested panel
        switch (panel) {
            case 'setup':
                if (this.setupPanel) this.setupPanel.classList.remove('hidden');
                break;
            case 'exam':
                if (this.examContainer) this.examContainer.classList.remove('hidden');
                break;
            case 'results':
                if (this.resultsPanel) this.resultsPanel.classList.remove('hidden');
                break;
            case 'loading':
                if (this.loadingPanel) this.loadingPanel.classList.remove('hidden');
                break;
        }
    }
}

// Initialize when DOM is ready
window.examinationManager = null;
document.addEventListener('DOMContentLoaded', () => {
    window.examinationManager = new ExaminationManager();

    // Bind to toolbar button
    const examBtn = document.getElementById('examinationBtn');
    if (examBtn) {
        examBtn.addEventListener('click', () => {
            if (window.examinationManager) {
                window.examinationManager.open();
            }
        });
    }
});
