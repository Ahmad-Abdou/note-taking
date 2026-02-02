// Vocabulary Builder - Word Learning System with multi-language translations

class VocabularyBuilder {
    constructor() {
        this.vocabulary = [];
        this.practiceWords = [];
        this.currentPracticeIndex = 0;
        this.practiceMode = 'flashcard';
        this.practiceDirection = 'word-to-meaning';
        this.practiceScore = { correct: 0, total: 0 };
        this.apiKey = null;
        this.targetLanguage = 'ar'; // Default to Arabic
        this.previousTab = 'add';
        
        // Language names for display
        this.languageNames = {
            'ar': { name: 'Arabic', native: 'العربية', dir: 'rtl' },
            'es': { name: 'Spanish', native: 'Español', dir: 'ltr' },
            'fr': { name: 'French', native: 'Français', dir: 'ltr' },
            'de': { name: 'German', native: 'Deutsch', dir: 'ltr' },
            'zh': { name: 'Chinese', native: '中文', dir: 'ltr' },
            'ja': { name: 'Japanese', native: '日本語', dir: 'ltr' },
            'ko': { name: 'Korean', native: '한국어', dir: 'ltr' },
            'pt': { name: 'Portuguese', native: 'Português', dir: 'ltr' },
            'ru': { name: 'Russian', native: 'Русский', dir: 'ltr' },
            'it': { name: 'Italian', native: 'Italiano', dir: 'ltr' },
            'tr': { name: 'Turkish', native: 'Türkçe', dir: 'ltr' },
            'hi': { name: 'Hindi', native: 'हिन्दी', dir: 'ltr' },
            'ur': { name: 'Urdu', native: 'اردو', dir: 'rtl' },
            'fa': { name: 'Persian', native: 'فارسی', dir: 'rtl' },
            'nl': { name: 'Dutch', native: 'Nederlands', dir: 'ltr' },
            'pl': { name: 'Polish', native: 'Polski', dir: 'ltr' }
        };
        
        this.init();
    }
    
    init() {
        // Get API key and settings from storage
        chrome.storage.local.get([
            'geminiApiKey', 
            'vocabularyList', 
            'vocabTargetLanguage',
            'highlightVocabInPdf',
            'vocabHighlightColor',
            'vocabHighlightOpacity',
            'vocabTooltipColor',
            'vocabTooltipTextColor',
            'vocabTooltipOpacity'
        ], (result) => {
            this.apiKey = result.geminiApiKey;
            this.vocabulary = result.vocabularyList || [];
            this.targetLanguage = result.vocabTargetLanguage || 'ar';
            
            this.updateWordList();
            this.updateCategoryFilter();
            this.updateLanguageUI();
            this.loadSettingsValues(result);
        });
        
        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.geminiApiKey) {
                this.apiKey = changes.geminiApiKey.newValue;
            }
        });
        
        this.bindEvents();
    }
    
    loadSettingsValues(result) {
        // Language
        const langSelect = document.getElementById('vocabTargetLanguage');
        if (langSelect) {
            langSelect.value = this.targetLanguage;
        }
        
        // Highlight enabled
        const highlightEnabled = document.getElementById('vocabHighlightEnabled');
        if (highlightEnabled) {
            highlightEnabled.checked = result.highlightVocabInPdf !== false;
        }
        
        // Color
        const colorPicker = document.getElementById('vocabHighlightColor');
        const colorHex = document.getElementById('vocabColorHex');
        if (colorPicker) {
            const color = result.vocabHighlightColor || '#667eea';
            colorPicker.value = color;
            if (colorHex) colorHex.textContent = color;
        }
        
        // Opacity
        const opacitySlider = document.getElementById('vocabHighlightOpacity');
        const opacityVal = document.getElementById('vocabOpacityVal');
        if (opacitySlider) {
            const opacity = result.vocabHighlightOpacity !== undefined ? result.vocabHighlightOpacity : 40;
            opacitySlider.value = opacity;
            if (opacityVal) opacityVal.textContent = opacity;
        }
        
        // Tooltip Color
        const tooltipColorPicker = document.getElementById('vocabTooltipColor');
        const tooltipColorHex = document.getElementById('vocabTooltipColorHex');
        if (tooltipColorPicker) {
            const tooltipColor = result.vocabTooltipColor || '#667eea';
            tooltipColorPicker.value = tooltipColor;
            if (tooltipColorHex) tooltipColorHex.textContent = tooltipColor;
        }
        
        // Tooltip Text Color
        const tooltipTextColorPicker = document.getElementById('vocabTooltipTextColor');
        const tooltipTextColorHex = document.getElementById('vocabTooltipTextColorHex');
        if (tooltipTextColorPicker) {
            const tooltipTextColor = result.vocabTooltipTextColor || '#ffffff';
            tooltipTextColorPicker.value = tooltipTextColor;
            if (tooltipTextColorHex) tooltipTextColorHex.textContent = tooltipTextColor;
        }
        
        // Tooltip Opacity
        const tooltipOpacitySlider = document.getElementById('vocabTooltipOpacity');
        const tooltipOpacityVal = document.getElementById('vocabTooltipOpacityVal');
        if (tooltipOpacitySlider) {
            const tooltipOpacity = result.vocabTooltipOpacity !== undefined ? result.vocabTooltipOpacity : 100;
            tooltipOpacitySlider.value = tooltipOpacity;
            if (tooltipOpacityVal) tooltipOpacityVal.textContent = tooltipOpacity;
        }
        
        this.updateSettingsPreview();
        this.updateTooltipPreview();
    }
    
    updateLanguageUI() {
        const langInfo = this.languageNames[this.targetLanguage];
        const label = document.getElementById('vocabTranslationLabel');
        const textarea = document.getElementById('vocabArabic');
        const exampleTranslation = document.getElementById('vocabExampleTranslation');
        
        if (label && langInfo) {
            label.textContent = `${langInfo.name} Translation (${langInfo.native})`;
        }
        
        if (textarea && langInfo) {
            textarea.dir = langInfo.dir;
            textarea.placeholder = `Enter ${langInfo.name} translation`;
        }
        
        if (exampleTranslation && langInfo) {
            exampleTranslation.dir = langInfo.dir;
            exampleTranslation.placeholder = `${langInfo.name} translation of the example`;
        }
    }
    
    bindEvents() {
        // Panel controls
        const closeBtn = document.getElementById('vocabClose');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        // Tab navigation
        document.querySelectorAll('.vocab-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });
        
        // Settings button
        const settingsBtn = document.getElementById('vocabSettingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }
        
        // Add Word Form
        const saveBtn = document.getElementById('saveVocabBtn');
        const clearFormBtn = document.getElementById('clearVocabFormBtn');
        
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveWord());
        if (clearFormBtn) clearFormBtn.addEventListener('click', () => this.clearForm());
        
        // Category custom input toggle
        const categorySelect = document.getElementById('vocabCategory');
        if (categorySelect) {
            categorySelect.addEventListener('change', () => {
                const customInput = document.getElementById('vocabCustomCategory');
                if (categorySelect.value === 'custom') {
                    customInput.classList.remove('hidden');
                } else {
                    customInput.classList.add('hidden');
                }
            });
        }
        
        // Search and filter
        const searchInput = document.getElementById('vocabSearch');
        const filterCategory = document.getElementById('vocabFilterCategory');
        
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterWords());
        }
        if (filterCategory) {
            filterCategory.addEventListener('change', () => this.filterWords());
        }
        
        // Import/Export
        const exportBtn = document.getElementById('exportVocabBtn');
        const importBtn = document.getElementById('importVocabBtn');
        const importInput = document.getElementById('vocabImportInput');
        
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportVocabulary());
        if (importBtn) importBtn.addEventListener('click', () => importInput.click());
        if (importInput) {
            importInput.addEventListener('change', (e) => this.importVocabulary(e));
        }
        
        // Settings controls
        this.bindSettingsEvents();
        
        // Practice
        const startPracticeBtn = document.getElementById('startPracticeBtn');
        const endPracticeBtn = document.getElementById('endPracticeBtn');
        
        if (startPracticeBtn) {
            startPracticeBtn.addEventListener('click', () => this.startPractice());
        }
        if (endPracticeBtn) {
            endPracticeBtn.addEventListener('click', () => this.endPractice());
        }
        
        // Flashcard controls
        const flashcard = document.getElementById('flashcard');
        const fcPrev = document.getElementById('flashcardPrev');
        const fcNext = document.getElementById('flashcardNext');
        
        if (flashcard) {
            flashcard.addEventListener('click', () => this.flipCard());
        }
        if (fcPrev) fcPrev.addEventListener('click', () => this.previousCard());
        if (fcNext) fcNext.addEventListener('click', () => this.nextCard());
        
        // Rating buttons
        document.querySelectorAll('.rating-btn').forEach(btn => {
            btn.addEventListener('click', () => this.rateCard(parseInt(btn.dataset.rating)));
        });
        
        // Write mode
        const checkWriteBtn = document.getElementById('checkWriteBtn');
        if (checkWriteBtn) {
            checkWriteBtn.addEventListener('click', () => this.checkWriteAnswer());
        }
        
        const writeAnswer = document.getElementById('writeAnswer');
        if (writeAnswer) {
            writeAnswer.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.checkWriteAnswer();
            });
        }
        
        // Register with overlay manager
        if (window.overlayManager) {
            window.overlayManager.register('vocabulary', 
                () => this._showPanel(),
                () => this._hidePanel()
            );
        }
    }
    
    _showPanel() {
        const panel = document.getElementById('vocabularyPanel');
        if (panel) {
            panel.classList.add('visible');
            this.loadVocabulary();
        }
    }
    
    _hidePanel() {
        const panel = document.getElementById('vocabularyPanel');
        if (panel) {
            panel.classList.remove('visible');
        }
    }
    
    open() {
        // Use overlay manager to ensure only one panel is open
        if (window.overlayManager) {
            window.overlayManager.open('vocabulary');
        } else {
            this._showPanel();
        }
    }
    
    close() {
        if (window.overlayManager) {
            window.overlayManager.close('vocabulary');
        } else {
            this._hidePanel();
        }
    }
    
    bindSettingsEvents() {
        // Color picker
        const colorPicker = document.getElementById('vocabHighlightColor');
        const colorHex = document.getElementById('vocabColorHex');
        if (colorPicker) {
            colorPicker.addEventListener('input', () => {
                if (colorHex) colorHex.textContent = colorPicker.value;
                this.updateSettingsPreview();
            });
        }
        
        // Opacity slider
        const opacitySlider = document.getElementById('vocabHighlightOpacity');
        const opacityVal = document.getElementById('vocabOpacityVal');
        if (opacitySlider) {
            opacitySlider.addEventListener('input', () => {
                if (opacityVal) opacityVal.textContent = opacitySlider.value;
                this.updateSettingsPreview();
            });
        }
        
        // Tooltip Color picker
        const tooltipColorPicker = document.getElementById('vocabTooltipColor');
        const tooltipColorHex = document.getElementById('vocabTooltipColorHex');
        if (tooltipColorPicker) {
            tooltipColorPicker.addEventListener('input', () => {
                if (tooltipColorHex) tooltipColorHex.textContent = tooltipColorPicker.value;
                this.updateTooltipPreview();
            });
        }
        
        // Tooltip Text Color picker
        const tooltipTextColorPicker = document.getElementById('vocabTooltipTextColor');
        const tooltipTextColorHex = document.getElementById('vocabTooltipTextColorHex');
        if (tooltipTextColorPicker) {
            tooltipTextColorPicker.addEventListener('input', () => {
                if (tooltipTextColorHex) tooltipTextColorHex.textContent = tooltipTextColorPicker.value;
                this.updateTooltipPreview();
            });
        }
        
        // Tooltip Opacity slider
        const tooltipOpacitySlider = document.getElementById('vocabTooltipOpacity');
        const tooltipOpacityVal = document.getElementById('vocabTooltipOpacityVal');
        if (tooltipOpacitySlider) {
            tooltipOpacitySlider.addEventListener('input', () => {
                if (tooltipOpacityVal) tooltipOpacityVal.textContent = tooltipOpacitySlider.value;
                this.updateTooltipPreview();
            });
        }
        
        // Language change
        const langSelect = document.getElementById('vocabTargetLanguage');
        if (langSelect) {
            langSelect.addEventListener('change', () => {
                this.targetLanguage = langSelect.value;
            });
        }
        
        // Save settings
        const saveSettingsBtn = document.getElementById('saveVocabSettingsBtn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        }
        
        // Cancel settings
        const cancelSettingsBtn = document.getElementById('cancelVocabSettingsBtn');
        if (cancelSettingsBtn) {
            cancelSettingsBtn.addEventListener('click', () => this.closeSettings());
        }
    }
    
    openSettings() {
        // Remember current tab
        const activeTab = document.querySelector('.vocab-tab.active');
        if (activeTab) {
            this.previousTab = activeTab.dataset.tab;
        }
        
        // Hide all panels and tabs
        document.querySelectorAll('.vocab-panel').forEach(panel => {
            panel.classList.add('hidden');
        });
        document.querySelectorAll('.vocab-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Show settings panel
        const settingsPanel = document.getElementById('vocabSettingsTab');
        if (settingsPanel) {
            settingsPanel.classList.remove('hidden');
        }
        
        // Reload settings values
        chrome.storage.local.get([
            'vocabTargetLanguage',
            'highlightVocabInPdf',
            'vocabHighlightColor',
            'vocabHighlightOpacity',
            'vocabTooltipColor',
            'vocabTooltipTextColor',
            'vocabTooltipOpacity'
        ], (result) => {
            this.loadSettingsValues(result);
        });
    }
    
    closeSettings() {
        // Hide settings panel
        const settingsPanel = document.getElementById('vocabSettingsTab');
        if (settingsPanel) {
            settingsPanel.classList.add('hidden');
        }
        
        // Restore previous tab
        this.switchTab(this.previousTab || 'add');
    }
    
    updateSettingsPreview() {
        const colorPicker = document.getElementById('vocabHighlightColor');
        const opacitySlider = document.getElementById('vocabHighlightOpacity');
        const preview = document.getElementById('vocabSettingsPreview');
        
        if (!colorPicker || !opacitySlider || !preview) return;
        
        const hex = colorPicker.value;
        const opacity = parseInt(opacitySlider.value) / 100;
        
        // Convert hex to RGB
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        
        preview.style.background = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    
    updateTooltipPreview() {
        const tooltipColorPicker = document.getElementById('vocabTooltipColor');
        const tooltipTextColorPicker = document.getElementById('vocabTooltipTextColor');
        const tooltipOpacitySlider = document.getElementById('vocabTooltipOpacity');
        const preview = document.getElementById('vocabTooltipPreview');
        
        if (!tooltipColorPicker || !preview) return;
        
        const bgColor = tooltipColorPicker.value;
        const textColor = tooltipTextColorPicker ? tooltipTextColorPicker.value : '#ffffff';
        const opacity = tooltipOpacitySlider ? parseInt(tooltipOpacitySlider.value) / 100 : 1;
        
        // Create darker shade for gradient
        const darkerColor = this.adjustColorBrightness(bgColor, -30);
        
        preview.style.background = `linear-gradient(135deg, ${bgColor} 0%, ${darkerColor} 100%)`;
        preview.style.color = textColor;
        preview.style.opacity = opacity;
    }
    
    adjustColorBrightness(hex, amount) {
        const num = parseInt(hex.slice(1), 16);
        const r = Math.max(0, Math.min(255, (num >> 16) + amount));
        const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
        const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
        return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    
    saveSettings() {
        const langSelect = document.getElementById('vocabTargetLanguage');
        const setDefault = document.getElementById('vocabSetDefaultLang');
        const highlightEnabled = document.getElementById('vocabHighlightEnabled');
        const colorPicker = document.getElementById('vocabHighlightColor');
        const opacitySlider = document.getElementById('vocabHighlightOpacity');
        const tooltipColorPicker = document.getElementById('vocabTooltipColor');
        const tooltipTextColorPicker = document.getElementById('vocabTooltipTextColor');
        const tooltipOpacitySlider = document.getElementById('vocabTooltipOpacity');
        
        const settings = {
            highlightVocabInPdf: highlightEnabled ? highlightEnabled.checked : true,
            vocabHighlightColor: colorPicker ? colorPicker.value : '#667eea',
            vocabHighlightOpacity: opacitySlider ? parseInt(opacitySlider.value) : 40,
            vocabTooltipColor: tooltipColorPicker ? tooltipColorPicker.value : '#667eea',
            vocabTooltipTextColor: tooltipTextColorPicker ? tooltipTextColorPicker.value : '#ffffff',
            vocabTooltipOpacity: tooltipOpacitySlider ? parseInt(tooltipOpacitySlider.value) : 100
        };
        
        // Save target language if set as default
        if (langSelect) {
            this.targetLanguage = langSelect.value;
            if (setDefault && setDefault.checked) {
                settings.vocabTargetLanguage = langSelect.value;
            }
        }
        
        chrome.storage.local.set(settings, () => {
            // Update UI
            this.updateLanguageUI();
            
            // Show success
            const saveBtn = document.getElementById('saveVocabSettingsBtn');
            if (saveBtn) {
                const originalText = saveBtn.textContent;
                saveBtn.textContent = '✓ Saved!';
                saveBtn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
                
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.style.background = '';
                    this.closeSettings();
                }, 1000);
            }
        });
    }
    
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.vocab-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update panels
        document.querySelectorAll('.vocab-panel').forEach(panel => {
            panel.classList.add('hidden');
        });
        
        const targetPanel = document.getElementById(`vocab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`);
        if (targetPanel) {
            targetPanel.classList.remove('hidden');
        }
        
        // Refresh data when switching to list
        if (tabName === 'list') {
            this.updateWordList();
        }
    }
    
    loadVocabulary() {
        chrome.storage.local.get(['vocabularyList'], (result) => {
            this.vocabulary = result.vocabularyList || [];
            this.updateWordList();
            this.updateCategoryFilter();
        });
    }
    
    saveWord() {
        const word = document.getElementById('vocabWord').value.trim();
        const english = document.getElementById('vocabEnglish').value.trim();
        const arabic = document.getElementById('vocabArabic').value.trim();
        const example = document.getElementById('vocabExample').value.trim();
        const exampleTranslation = document.getElementById('vocabExampleTranslation')?.value.trim() || '';
        const categorySelect = document.getElementById('vocabCategory');
        const customCategory = document.getElementById('vocabCustomCategory').value.trim();
        
        if (!word) {
            alert('Please enter a word or term.');
            return;
        }
        
        if (!english && !arabic) {
            alert('Please enter at least one translation.');
            return;
        }
        
        let category = categorySelect.value;
        if (category === 'custom' && customCategory) {
            category = customCategory;
        }
        
        const newWord = {
            id: Date.now(),
            word: word,
            english: english,
            arabic: arabic,
            example: example,
            exampleTranslation: exampleTranslation,
            targetLanguage: this.targetLanguage,
            category: category || 'general',
            dateAdded: new Date().toISOString(),
            mastery: 0, // 0-100 mastery level
            lastPracticed: null,
            practiceCount: 0
        };
        
        // Check for duplicates
        const existing = this.vocabulary.find(v => v.word.toLowerCase() === word.toLowerCase());
        if (existing) {
            if (!confirm('This word already exists. Do you want to update it?')) {
                return;
            }
            // Update existing word
            Object.assign(existing, newWord, { id: existing.id, dateAdded: existing.dateAdded });
        } else {
            this.vocabulary.push(newWord);
        }
        
        this.saveVocabulary();
        this.clearForm();
        this.showNotification('Word saved successfully!');
    }
    
    saveVocabulary() {
        chrome.storage.local.set({ vocabularyList: this.vocabulary }, () => {
            this.updateWordList();
            this.updateCategoryFilter();
        });
    }
    
    clearForm() {
        document.getElementById('vocabWord').value = '';
        document.getElementById('vocabEnglish').value = '';
        document.getElementById('vocabArabic').value = '';
        document.getElementById('vocabExample').value = '';
        const exampleTranslation = document.getElementById('vocabExampleTranslation');
        if (exampleTranslation) exampleTranslation.value = '';
        document.getElementById('vocabCategory').value = '';
        document.getElementById('vocabCustomCategory').value = '';
        document.getElementById('vocabCustomCategory').classList.add('hidden');
    }
    
    updateWordList() {
        const container = document.getElementById('vocabList');
        const totalSpan = document.getElementById('totalWords');
        
        if (!container) return;
        
        if (totalSpan) {
            totalSpan.textContent = `${this.vocabulary.length} words`;
        }
        
        if (this.vocabulary.length === 0) {
            container.innerHTML = '<div class="empty-state">No words saved yet. Start adding words!</div>';
            return;
        }
        
        // Apply filters
        const searchTerm = document.getElementById('vocabSearch')?.value.toLowerCase() || '';
        const categoryFilter = document.getElementById('vocabFilterCategory')?.value || '';
        
        let filtered = this.vocabulary.filter(word => {
            const matchesSearch = !searchTerm || 
                word.word.toLowerCase().includes(searchTerm) ||
                word.english.toLowerCase().includes(searchTerm) ||
                word.arabic.includes(searchTerm);
            
            const matchesCategory = !categoryFilter || word.category === categoryFilter;
            
            return matchesSearch && matchesCategory;
        });
        
        // Sort by date added (newest first)
        filtered.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
        
        container.innerHTML = filtered.map(word => {
            // Get language label for translation
            const langInfo = this.languageNames[word.targetLanguage || 'ar'] || { name: 'Translation' };
            const langLabel = word.targetLanguage ? word.targetLanguage.toUpperCase() : 'TR';
            const langDir = langInfo.dir || 'ltr';
            
            return `
            <div class="vocab-card" data-id="${word.id}">
                <div class="vocab-card-header">
                    <span class="vocab-word">${word.word}</span>
                    <span class="vocab-category">${word.category}</span>
                </div>
                <div class="vocab-translations">
                    ${word.english ? `<div class="translation english">
                        <span class="lang-label">EN</span>
                        <span>${word.english}</span>
                    </div>` : ''}
                    ${word.arabic ? `<div class="translation" dir="${langDir}">
                        <span class="lang-label">${langLabel}</span>
                        <span>${word.arabic}</span>
                    </div>` : ''}
                </div>
                ${word.example ? `<div class="vocab-example">
                    <span class="example-label">Example:</span>
                    <span>"${word.example}"</span>
                    ${word.exampleTranslation ? `<div class="example-translation" dir="${langDir}">"${word.exampleTranslation}"</div>` : ''}
                </div>` : ''}
                <div class="vocab-card-footer">
                    <div class="mastery-bar">
                        <div class="mastery-fill" style="width: ${word.mastery}%"></div>
                    </div>
                    <span class="mastery-text">${word.mastery}% mastery</span>
                    <div class="vocab-actions">
                        <button class="edit-word-btn" title="Edit">✏️</button>
                        <button class="delete-word-btn" title="Delete">🗑️</button>
                    </div>
                </div>
            </div>
        `}).join('');
        
        // Bind card actions
        container.querySelectorAll('.edit-word-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('.vocab-card');
                this.editWord(parseInt(card.dataset.id));
            });
        });
        
        container.querySelectorAll('.delete-word-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('.vocab-card');
                this.deleteWord(parseInt(card.dataset.id));
            });
        });
    }
    
    filterWords() {
        this.updateWordList();
    }
    
    updateCategoryFilter() {
        const select = document.getElementById('vocabFilterCategory');
        if (!select) return;
        
        const categories = [...new Set(this.vocabulary.map(w => w.category))].filter(c => c);
        
        select.innerHTML = '<option value="">All Categories</option>' +
            categories.map(c => `<option value="${c}">${c}</option>`).join('');
    }
    
    editWord(id) {
        const word = this.vocabulary.find(w => w.id === id);
        if (!word) return;
        
        // Switch to add tab and populate form
        this.switchTab('add');
        
        // Update target language for this word
        if (word.targetLanguage) {
            this.targetLanguage = word.targetLanguage;
            const langSelect = document.getElementById('vocabTargetLanguage');
            if (langSelect) langSelect.value = word.targetLanguage;
            this.updateLanguageUI();
        }
        
        document.getElementById('vocabWord').value = word.word;
        document.getElementById('vocabEnglish').value = word.english || '';
        document.getElementById('vocabArabic').value = word.arabic || '';
        document.getElementById('vocabExample').value = word.example || '';
        
        const exampleTranslation = document.getElementById('vocabExampleTranslation');
        if (exampleTranslation) exampleTranslation.value = word.exampleTranslation || '';
        
        const categorySelect = document.getElementById('vocabCategory');
        const customInput = document.getElementById('vocabCustomCategory');
        
        // Check if category is a predefined one
        const predefinedCategories = ['general', 'academic', 'technical', 'medical', 'legal', 'business'];
        if (predefinedCategories.includes(word.category)) {
            categorySelect.value = word.category;
            customInput.classList.add('hidden');
        } else if (word.category) {
            categorySelect.value = 'custom';
            customInput.value = word.category;
            customInput.classList.remove('hidden');
        }
    }
    
    deleteWord(id) {
        if (!confirm('Are you sure you want to delete this word?')) return;
        
        this.vocabulary = this.vocabulary.filter(w => w.id !== id);
        this.saveVocabulary();
        this.showNotification('Word deleted.');
    }
    
    exportVocabulary() {
        const data = JSON.stringify(this.vocabulary, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `vocabulary_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('Vocabulary exported!');
    }
    
    importVocabulary(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                
                if (!Array.isArray(imported)) {
                    throw new Error('Invalid format');
                }
                
                // Merge with existing vocabulary
                let added = 0;
                let updated = 0;
                
                imported.forEach(word => {
                    if (!word.word) return;
                    
                    const existing = this.vocabulary.find(v => v.word.toLowerCase() === word.word.toLowerCase());
                    if (existing) {
                        Object.assign(existing, word, { id: existing.id });
                        updated++;
                    } else {
                        word.id = Date.now() + Math.random();
                        this.vocabulary.push(word);
                        added++;
                    }
                });
                
                this.saveVocabulary();
                this.showNotification(`Imported: ${added} new, ${updated} updated`);
                
            } catch (error) {
                alert('Failed to import vocabulary. Please check the file format.');
            }
        };
        
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    }
    
    // Practice Mode Methods
    startPractice() {
        if (this.vocabulary.length === 0) {
            alert('Please add some words first before practicing.');
            return;
        }
        
        this.practiceMode = document.getElementById('practiceMode').value;
        this.practiceDirection = document.getElementById('practiceDirection').value;
        const count = document.getElementById('practiceCount').value;
        
        // Select words for practice
        let words = [...this.vocabulary];
        
        // Prioritize words with lower mastery
        words.sort((a, b) => a.mastery - b.mastery);
        
        if (count !== 'all') {
            words = words.slice(0, parseInt(count));
        }
        
        // Shuffle
        this.practiceWords = words.sort(() => Math.random() - 0.5);
        this.currentPracticeIndex = 0;
        this.practiceScore = { correct: 0, total: this.practiceWords.length };
        
        // Show practice area
        document.getElementById('practiceSetup').classList.add('hidden');
        document.getElementById('practiceArea').classList.remove('hidden');
        document.getElementById('practiceResults').classList.add('hidden');
        
        // Show appropriate container
        document.getElementById('flashcardContainer').classList.add('hidden');
        document.getElementById('quizContainer2').classList.add('hidden');
        document.getElementById('writeContainer').classList.add('hidden');
        
        if (this.practiceMode === 'flashcard') {
            document.getElementById('flashcardContainer').classList.remove('hidden');
            this.showFlashcard();
        } else if (this.practiceMode === 'quiz') {
            document.getElementById('quizContainer2').classList.remove('hidden');
            this.generateVocabQuiz();
        } else if (this.practiceMode === 'write') {
            document.getElementById('writeContainer').classList.remove('hidden');
            this.showWritePrompt();
        }
    }
    
    showFlashcard() {
        const word = this.practiceWords[this.currentPracticeIndex];
        if (!word) return;
        
        const front = document.getElementById('flashcardFront');
        const back = document.getElementById('flashcardBack');
        const progress = document.getElementById('flashcardProgress');
        const flashcard = document.getElementById('flashcard');
        
        // Reset flip state
        flashcard.classList.remove('flipped');
        
        // Set content based on direction
        switch (this.practiceDirection) {
            case 'word-to-meaning':
                front.textContent = word.word;
                back.innerHTML = `
                    <div class="fc-meaning">${word.english || ''}</div>
                    ${word.arabic ? `<div class="fc-arabic" dir="rtl">${word.arabic}</div>` : ''}
                    ${word.example ? `<div class="fc-example">"${word.example}"</div>` : ''}
                `;
                break;
            case 'meaning-to-word':
                front.textContent = word.english || word.arabic;
                back.textContent = word.word;
                break;
            case 'english-to-arabic':
                front.textContent = word.english || word.word;
                back.innerHTML = `<div dir="rtl">${word.arabic || 'No Arabic translation'}</div>`;
                break;
            case 'arabic-to-english':
                front.innerHTML = `<div dir="rtl">${word.arabic || word.word}</div>`;
                back.textContent = word.english || word.word;
                break;
        }
        
        progress.textContent = `${this.currentPracticeIndex + 1} / ${this.practiceWords.length}`;
    }
    
    flipCard() {
        const flashcard = document.getElementById('flashcard');
        flashcard.classList.toggle('flipped');
    }
    
    previousCard() {
        if (this.currentPracticeIndex > 0) {
            this.currentPracticeIndex--;
            this.showFlashcard();
        }
    }
    
    nextCard() {
        if (this.currentPracticeIndex < this.practiceWords.length - 1) {
            this.currentPracticeIndex++;
            this.showFlashcard();
        } else {
            this.showPracticeResults();
        }
    }
    
    rateCard(rating) {
        const word = this.practiceWords[this.currentPracticeIndex];
        if (!word) return;
        
        // Update mastery based on rating (1-4)
        const masteryChange = (rating - 2) * 10; // -10, 0, +10, +20
        word.mastery = Math.max(0, Math.min(100, word.mastery + masteryChange));
        word.lastPracticed = new Date().toISOString();
        word.practiceCount = (word.practiceCount || 0) + 1;
        
        // Update in main vocabulary
        const mainWord = this.vocabulary.find(w => w.id === word.id);
        if (mainWord) {
            Object.assign(mainWord, { mastery: word.mastery, lastPracticed: word.lastPracticed, practiceCount: word.practiceCount });
        }
        
        this.saveVocabulary();
        
        if (rating >= 3) {
            this.practiceScore.correct++;
        }
        
        // Move to next card
        this.nextCard();
    }
    
    generateVocabQuiz() {
        const container = document.getElementById('quizContainer2');
        if (!container) return;
        
        container.innerHTML = this.practiceWords.map((word, i) => {
            const options = this.generateQuizOptions(word);
            
            return `
                <div class="vocab-quiz-question" data-index="${i}">
                    <p class="quiz-prompt">${this.getQuizPrompt(word)}</p>
                    <div class="quiz-options">
                        ${options.map((opt, oi) => `
                            <label class="quiz-option">
                                <input type="radio" name="vq${i}" value="${oi}">
                                <span>${opt.text}</span>
                            </label>
                        `).join('')}
                    </div>
                    <div class="quiz-feedback hidden"></div>
                </div>
            `;
        }).join('');
        
        container.innerHTML += `
            <button id="checkVocabQuiz" class="vocab-btn primary">Check Answers</button>
        `;
        
        document.getElementById('checkVocabQuiz').addEventListener('click', () => this.checkVocabQuiz());
    }
    
    getQuizPrompt(word) {
        switch (this.practiceDirection) {
            case 'word-to-meaning':
                return `What is the meaning of "<strong>${word.word}</strong>"?`;
            case 'meaning-to-word':
                return `Which word means: "${word.english || word.arabic}"?`;
            case 'english-to-arabic':
                return `What is the Arabic translation of "${word.english || word.word}"?`;
            case 'arabic-to-english':
                return `What is the English translation of: <span dir="rtl">${word.arabic || word.word}</span>?`;
            default:
                return `What is "${word.word}"?`;
        }
    }
    
    generateQuizOptions(word) {
        const correct = this.getCorrectOption(word);
        const options = [{ text: correct, isCorrect: true }];
        
        // Get wrong options from other words
        const otherWords = this.vocabulary.filter(w => w.id !== word.id);
        const shuffledOthers = otherWords.sort(() => Math.random() - 0.5).slice(0, 3);
        
        shuffledOthers.forEach(w => {
            options.push({ text: this.getCorrectOption(w), isCorrect: false });
        });
        
        // Fill with dummy options if not enough words
        while (options.length < 4) {
            options.push({ text: 'N/A', isCorrect: false });
        }
        
        // Shuffle options
        return options.sort(() => Math.random() - 0.5);
    }
    
    getCorrectOption(word) {
        switch (this.practiceDirection) {
            case 'word-to-meaning':
                return word.english || word.arabic || word.word;
            case 'meaning-to-word':
                return word.word;
            case 'english-to-arabic':
                return word.arabic || 'No translation';
            case 'arabic-to-english':
                return word.english || word.word;
            default:
                return word.english || word.word;
        }
    }
    
    checkVocabQuiz() {
        let correct = 0;
        
        this.practiceWords.forEach((word, i) => {
            const question = document.querySelector(`.vocab-quiz-question[data-index="${i}"]`);
            const selected = question.querySelector(`input[name="vq${i}"]:checked`);
            const feedback = question.querySelector('.quiz-feedback');
            const options = question.querySelectorAll('.quiz-option');
            
            const correctAnswer = this.getCorrectOption(word);
            let isCorrect = false;
            
            options.forEach((opt, oi) => {
                const optText = opt.querySelector('span').textContent;
                if (optText === correctAnswer) {
                    opt.classList.add('correct');
                }
            });
            
            if (selected) {
                const selectedOption = selected.closest('.quiz-option');
                const selectedText = selectedOption.querySelector('span').textContent;
                
                if (selectedText === correctAnswer) {
                    isCorrect = true;
                    correct++;
                    feedback.innerHTML = '✅ Correct!';
                    feedback.className = 'quiz-feedback correct';
                } else {
                    selectedOption.classList.add('incorrect');
                    feedback.innerHTML = `❌ Incorrect. The answer is: ${correctAnswer}`;
                    feedback.className = 'quiz-feedback incorrect';
                }
            } else {
                feedback.innerHTML = `⚠️ Not answered. The answer is: ${correctAnswer}`;
                feedback.className = 'quiz-feedback incorrect';
            }
            
            feedback.classList.remove('hidden');
            
            // Update word mastery
            const mainWord = this.vocabulary.find(w => w.id === word.id);
            if (mainWord) {
                mainWord.mastery = Math.max(0, Math.min(100, mainWord.mastery + (isCorrect ? 10 : -5)));
                mainWord.lastPracticed = new Date().toISOString();
                mainWord.practiceCount = (mainWord.practiceCount || 0) + 1;
            }
        });
        
        this.practiceScore.correct = correct;
        this.saveVocabulary();
        
        // Replace check button with results button
        const checkBtn = document.getElementById('checkVocabQuiz');
        if (checkBtn) {
            checkBtn.textContent = 'See Results';
            checkBtn.onclick = () => this.showPracticeResults();
        }
    }
    
    showWritePrompt() {
        const word = this.practiceWords[this.currentPracticeIndex];
        if (!word) return;
        
        const prompt = document.getElementById('writePrompt');
        const definition = document.getElementById('writeDefinition');
        const input = document.getElementById('writeAnswer');
        const feedback = document.getElementById('writeFeedback');
        
        feedback.classList.add('hidden');
        input.value = '';
        
        switch (this.practiceDirection) {
            case 'word-to-meaning':
                prompt.textContent = 'Write the definition of:';
                definition.textContent = word.word;
                break;
            case 'meaning-to-word':
                prompt.textContent = 'Write the word for:';
                definition.textContent = word.english || word.arabic;
                break;
            case 'english-to-arabic':
                prompt.textContent = 'Write the Arabic translation of:';
                definition.textContent = word.english || word.word;
                break;
            case 'arabic-to-english':
                prompt.textContent = 'Write the English translation of:';
                definition.innerHTML = `<span dir="rtl">${word.arabic || word.word}</span>`;
                break;
        }
    }
    
    checkWriteAnswer() {
        const word = this.practiceWords[this.currentPracticeIndex];
        if (!word) return;
        
        const input = document.getElementById('writeAnswer');
        const feedback = document.getElementById('writeFeedback');
        const userAnswer = input.value.trim().toLowerCase();
        
        let correctAnswer = '';
        switch (this.practiceDirection) {
            case 'word-to-meaning':
                correctAnswer = word.english || word.arabic || '';
                break;
            case 'meaning-to-word':
                correctAnswer = word.word;
                break;
            case 'english-to-arabic':
                correctAnswer = word.arabic || '';
                break;
            case 'arabic-to-english':
                correctAnswer = word.english || word.word;
                break;
        }
        
        // Check similarity
        const isCorrect = this.checkAnswerSimilarity(userAnswer, correctAnswer);
        
        if (isCorrect) {
            feedback.innerHTML = '✅ Correct!';
            feedback.className = 'write-feedback correct';
            this.practiceScore.correct++;
        } else {
            feedback.innerHTML = `❌ The correct answer is: <strong>${correctAnswer}</strong>`;
            feedback.className = 'write-feedback incorrect';
        }
        
        feedback.classList.remove('hidden');
        
        // Update mastery
        const mainWord = this.vocabulary.find(w => w.id === word.id);
        if (mainWord) {
            mainWord.mastery = Math.max(0, Math.min(100, mainWord.mastery + (isCorrect ? 15 : -5)));
            mainWord.lastPracticed = new Date().toISOString();
            mainWord.practiceCount = (mainWord.practiceCount || 0) + 1;
        }
        this.saveVocabulary();
        
        // Show next button
        setTimeout(() => {
            if (this.currentPracticeIndex < this.practiceWords.length - 1) {
                this.currentPracticeIndex++;
                this.showWritePrompt();
            } else {
                this.showPracticeResults();
            }
        }, 1500);
    }
    
    checkAnswerSimilarity(userAnswer, correctAnswer) {
        const user = userAnswer.toLowerCase().trim();
        const correct = correctAnswer.toLowerCase().trim();
        
        // Exact match
        if (user === correct) return true;
        
        // Contains main keywords (at least 60%)
        const userWords = user.split(/\s+/);
        const correctWords = correct.split(/\s+/);
        
        const matchedWords = userWords.filter(w => correctWords.some(cw => cw.includes(w) || w.includes(cw)));
        return matchedWords.length >= Math.ceil(correctWords.length * 0.6);
    }
    
    showPracticeResults() {
        document.getElementById('practiceArea').classList.add('hidden');
        document.getElementById('practiceResults').classList.remove('hidden');
        
        const percent = Math.round((this.practiceScore.correct / this.practiceScore.total) * 100);
        
        document.getElementById('practiceScore').innerHTML = `
            <div class="result-circle" style="--percent: ${percent}">
                <span>${percent}%</span>
            </div>
            <p>You got <strong>${this.practiceScore.correct}</strong> out of <strong>${this.practiceScore.total}</strong> correct!</p>
            <p class="result-message">${this.getResultMessage(percent)}</p>
        `;
    }
    
    getResultMessage(percent) {
        if (percent >= 90) return '🏆 Excellent! You\'ve mastered these words!';
        if (percent >= 80) return '🌟 Great job! Keep practicing!';
        if (percent >= 70) return '👍 Good work! Almost there!';
        if (percent >= 60) return '📚 Not bad! Keep studying!';
        return '💪 Keep practicing! You\'ll get better!';
    }
    
    endPractice() {
        document.getElementById('practiceResults').classList.add('hidden');
        document.getElementById('practiceArea').classList.add('hidden');
        document.getElementById('practiceSetup').classList.remove('hidden');
    }
    
    showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'vocab-notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }
}

// Initialize when DOM is ready
window.vocabularyBuilder = null;
document.addEventListener('DOMContentLoaded', () => {
    window.vocabularyBuilder = new VocabularyBuilder();
    
    // Bind to toolbar button
    const vocabBtn = document.getElementById('vocabularyBtn');
    if (vocabBtn) {
        vocabBtn.addEventListener('click', () => {
            if (window.vocabularyBuilder) {
                window.vocabularyBuilder.open();
            }
        });
    }
});
