// Drawing and Free-form Highlight Manager
// Provides canvas-based drawing and free-form highlighting on PDF pages

class DrawingManager {
    constructor() {
        this.isDrawingMode = false;
        this.isFreeHighlightMode = false;
        this.currentTool = 'draw'; // 'draw' | 'freeHighlight' | 'eraser'
        this.currentColor = '#FF0000';
        this.currentHighlightColor = '#FFEB3B';
        this.lineWidth = 2;
        this.highlightWidth = 20;
        this.opacity = 1;
        this.highlightOpacity = 0.4;
        this.drawings = {}; // pageNumber -> array of strokes
        this.currentStroke = null;
        this.canvases = {}; // pageNumber -> canvas element
        this.isDrawing = false;
        this.lastPoint = null;
        this.startPoint = null; // Starting point for straight line mode
        this.isShiftPressed = false; // Track shift key for straight line drawing
        this.pdfUrl = '';

        this.init();
    }

    init() {
        this.pdfUrl = this.getPdfUrl();
        this.loadDrawings();
        this.createToolbar();
        this.setupPageObserver();
        this.setupKeyboardListeners();
    }

    setupKeyboardListeners() {
        // Track Shift key for straight line drawing
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Shift' && !this.isShiftPressed) {
                this.isShiftPressed = true;
                // If currently drawing, redraw from start point to current point as straight line
                if (this.isDrawing && this.currentStroke && this.startPoint) {
                    this.redrawCurrentStrokeStraight();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                this.isShiftPressed = false;
            }
        });
    }

    redrawCurrentStrokeStraight() {
        // Find the page being drawn on and redraw the current stroke as a straight line
        if (!this.currentStroke || !this.startPoint) return;

        // Find canvas for current stroke
        const pageNum = this.currentDrawingPage;
        if (!pageNum) return;

        const canvas = this.canvases[pageNum];
        if (!canvas) return;

        // Redraw everything including the current stroke as a straight line
        this.redrawPage(pageNum);

        // Draw the current stroke as a straight line from start to last point
        const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
        if (lastPoint) {
            const ctx = canvas.getContext('2d');
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = this.currentStroke.opacity;
            ctx.strokeStyle = this.currentStroke.color;
            ctx.lineWidth = this.currentStroke.width;

            if (this.currentStroke.tool === 'freeHighlight') {
                ctx.globalCompositeOperation = 'multiply';
            }

            ctx.beginPath();
            ctx.moveTo(this.startPoint.x, this.startPoint.y);
            ctx.lineTo(lastPoint.x, lastPoint.y);
            ctx.stroke();
            ctx.restore();
        }
    }

    getPdfUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('file') || urlParams.get('id') || window.location.href;
    }

    getStorageKey() {
        return `pdf_drawings_${encodeURIComponent(this.pdfUrl)}`;
    }

    async loadDrawings() {
        return new Promise((resolve) => {
            const key = this.getStorageKey();
            chrome.storage.local.get([key], (result) => {
                this.drawings = result[key] || {};
                this.redrawAllPages();
                resolve();
            });
        });
    }

    async saveDrawings() {
        const key = this.getStorageKey();
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: this.drawings }, resolve);
        });
    }

    createToolbar() {
        // Check if toolbar already exists
        if (document.getElementById('drawingToolbar')) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'drawingToolbar';
        toolbar.className = 'drawing-toolbar hidden';
        toolbar.innerHTML = `
            <div class="drawing-toolbar-content">
                <div class="tool-section">
                    <span class="section-label">Tool</span>
                    <div class="tool-buttons">
                        <button class="tool-btn active" data-tool="draw" title="Draw">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                                <path d="M2 2l7.586 7.586"></path>
                            </svg>
                        </button>
                        <button class="tool-btn" data-tool="freeHighlight" title="Free Highlight">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="14" width="18" height="6" rx="2" fill="currentColor" opacity="0.4"></rect>
                                <path d="M12 2v10"></path>
                                <path d="M5 8l7 4 7-4"></path>
                            </svg>
                        </button>
                        <button class="tool-btn" data-tool="eraser" title="Eraser">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 20H7L3 16C2.5 15.5 2.5 14.5 3 14L13 4C13.5 3.5 14.5 3.5 15 4L21 10C21.5 10.5 21.5 11.5 21 12L13 20"></path>
                                <line x1="18" y1="11" x2="11" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="tool-section color-section">
                    <span class="section-label">Color</span>
                    <div class="color-picker-row">
                        <input type="color" id="drawingColorPicker" value="#FF0000" title="Pick Color">
                        <div class="color-presets">
                            <button class="color-preset" data-color="#FF0000" style="background:#FF0000" title="Red"></button>
                            <button class="color-preset" data-color="#0066FF" style="background:#0066FF" title="Blue"></button>
                            <button class="color-preset" data-color="#00CC00" style="background:#00CC00" title="Green"></button>
                            <button class="color-preset" data-color="#000000" style="background:#000000" title="Black"></button>
                        </div>
                    </div>
                </div>
                
                <div class="tool-section highlight-color-section hidden">
                    <span class="section-label">Highlight</span>
                    <div class="color-picker-row">
                        <div class="color-presets">
                            <button class="highlight-preset" data-color="#FFEB3B" style="background:#FFEB3B" title="Yellow"></button>
                            <button class="highlight-preset" data-color="#4CAF50" style="background:#4CAF50" title="Green"></button>
                            <button class="highlight-preset" data-color="#2196F3" style="background:#2196F3" title="Blue"></button>
                            <button class="highlight-preset" data-color="#FF5722" style="background:#FF5722" title="Orange"></button>
                            <button class="highlight-preset" data-color="#E91E63" style="background:#E91E63" title="Pink"></button>
                        </div>
                    </div>
                </div>
                
                <div class="tool-section size-section">
                    <span class="section-label">Size</span>
                    <input type="range" id="drawingSizeSlider" min="1" max="20" value="2" title="Line Width">
                    <span id="sizeValue">2px</span>
                </div>
                
                <div class="tool-section actions-section">
                    <button class="action-btn" id="undoDrawingBtn" title="Undo Last Stroke">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 10h10a5 5 0 0 1 5 5v2"></path>
                            <path d="M3 10l5 5"></path>
                            <path d="M3 10l5-5"></path>
                        </svg>
                    </button>
                    <button class="action-btn" id="clearPageDrawingsBtn" title="Clear Page Drawings">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                    <button class="action-btn close-btn" id="closeDrawingToolbar" title="Close Drawing Mode">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(toolbar);
        this.setupToolbarEvents();
        this.addToolbarStyles();
        this.addToolbarButton();
    }

    addToolbarButton() {
        // Add button to main toolbar
        const autoScrollWrapper = document.getElementById('autoScrollWrapper');
        if (!autoScrollWrapper) return;

        // Check if button already exists
        if (document.getElementById('drawingModeToggle')) return;

        const btn = document.createElement('button');
        btn.id = 'drawingModeToggle';
        btn.className = 'toolbarButton';
        btn.title = 'Drawing & Free Highlight Mode';
        btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                <path d="M2 2l7.586 7.586"></path>
                <circle cx="11" cy="11" r="2"></circle>
            </svg>
        `;

        autoScrollWrapper.parentNode.insertBefore(btn, autoScrollWrapper.nextSibling);

        btn.addEventListener('click', () => this.toggleDrawingMode());
    }


    setupToolbarEvents() {
        const toolbar = document.getElementById('drawingToolbar');
        if (!toolbar) return;

        // Tool selection
        toolbar.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                toolbar.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
                this.updateToolbarForTool();
                // Update cursor on all active canvases
                this.updateCanvasCursors();
            });
        });

        // Draw color picker
        const colorPicker = toolbar.querySelector('#drawingColorPicker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.currentColor = e.target.value;
            });
        }

        // Color presets for drawing
        toolbar.querySelectorAll('.color-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentColor = btn.dataset.color;
                const colorPicker = document.getElementById('drawingColorPicker');
                if (colorPicker) colorPicker.value = btn.dataset.color;
            });
        });

        // Highlight color presets
        toolbar.querySelectorAll('.highlight-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentHighlightColor = btn.dataset.color;
                toolbar.querySelectorAll('.highlight-preset').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Size slider
        const sizeSlider = toolbar.querySelector('#drawingSizeSlider');
        const sizeValue = toolbar.querySelector('#sizeValue');
        if (sizeSlider) {
            sizeSlider.addEventListener('input', (e) => {
                const val = e.target.value;
                this.lineWidth = parseInt(val);
                if (this.currentTool === 'freeHighlight') {
                    this.highlightWidth = this.lineWidth * 10;
                }
                if (sizeValue) sizeValue.textContent = `${val}px`;
            });
        }

        // Undo button
        const undoBtn = toolbar.querySelector('#undoDrawingBtn');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => this.undoLastStroke());
        }

        // Clear page button
        const clearBtn = toolbar.querySelector('#clearPageDrawingsBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearCurrentPage());
        }

        // Close button
        const closeBtn = toolbar.querySelector('#closeDrawingToolbar');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggleDrawingMode(false));
        }
    }

    updateToolbarForTool() {
        const toolbar = document.getElementById('drawingToolbar');
        if (!toolbar) return;

        const colorSection = toolbar.querySelector('.color-section');
        const highlightSection = toolbar.querySelector('.highlight-color-section');
        const sizeSlider = document.getElementById('drawingSizeSlider');

        if (this.currentTool === 'draw') {
            colorSection?.classList.remove('hidden');
            highlightSection?.classList.add('hidden');
            if (sizeSlider) {
                sizeSlider.max = '20';
                sizeSlider.value = this.lineWidth;
            }
        } else if (this.currentTool === 'freeHighlight') {
            colorSection?.classList.add('hidden');
            highlightSection?.classList.remove('hidden');
            if (sizeSlider) {
                sizeSlider.max = '40';
                sizeSlider.value = this.highlightWidth / 10 * 2;
            }
        } else if (this.currentTool === 'eraser') {
            colorSection?.classList.add('hidden');
            highlightSection?.classList.add('hidden');
        }
    }

    addToolbarStyles() {
        if (document.getElementById('drawingToolbarStyles')) return;

        const style = document.createElement('style');
        style.id = 'drawingToolbarStyles';
        style.textContent = `
            .drawing-toolbar {
                position: fixed;
                top: 60px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--toolbar-bg, #2a2a2e);
                border: 1px solid var(--toolbar-border, #444);
                border-radius: 8px;
                padding: 8px 12px;
                z-index: 10000;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                display: flex;
                align-items: center;
                gap: 16px;
            }
            
            .drawing-toolbar.hidden {
                display: none;
            }
            
            .drawing-toolbar-content {
                display: flex;
                align-items: center;
                gap: 16px;
            }
            
            .drawing-toolbar .tool-section {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .drawing-toolbar .section-label {
                font-size: 11px;
                color: #999;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .drawing-toolbar .tool-buttons {
                display: flex;
                gap: 4px;
            }
            
            .drawing-toolbar .tool-btn,
            .drawing-toolbar .action-btn {
                width: 32px;
                height: 32px;
                border: 1px solid transparent;
                border-radius: 6px;
                background: transparent;
                color: #ccc;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }
            
            .drawing-toolbar .tool-btn:hover,
            .drawing-toolbar .action-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                color: white;
            }
            
            .drawing-toolbar .tool-btn.active {
                background: var(--primary, #667eea);
                color: white;
                border-color: var(--primary, #667eea);
            }
            
            .drawing-toolbar .color-picker-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .drawing-toolbar input[type="color"] {
                width: 28px;
                height: 28px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                padding: 0;
            }
            
            .drawing-toolbar .color-presets {
                display: flex;
                gap: 4px;
            }
            
            .drawing-toolbar .color-preset,
            .drawing-toolbar .highlight-preset {
                width: 22px;
                height: 22px;
                border: 2px solid transparent;
                border-radius: 4px;
                cursor: pointer;
                transition: transform 0.2s, border-color 0.2s;
            }
            
            .drawing-toolbar .color-preset:hover,
            .drawing-toolbar .highlight-preset:hover {
                transform: scale(1.1);
            }
            
            .drawing-toolbar .highlight-preset.active {
                border-color: white;
            }
            
            .drawing-toolbar input[type="range"] {
                width: 60px;
                height: 4px;
                -webkit-appearance: none;
                background: #444;
                border-radius: 2px;
                outline: none;
            }
            
            .drawing-toolbar input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 14px;
                height: 14px;
                background: var(--primary, #667eea);
                border-radius: 50%;
                cursor: pointer;
            }
            
            .drawing-toolbar #sizeValue {
                font-size: 11px;
                color: #999;
                min-width: 30px;
            }
            
            .drawing-toolbar .actions-section {
                border-left: 1px solid #444;
                padding-left: 12px;
            }
            
            .drawing-toolbar .close-btn {
                color: #ff6b6b;
            }
            
            .drawing-toolbar .close-btn:hover {
                background: rgba(255, 107, 107, 0.2);
                color: #ff6b6b;
            }
            
            .drawing-toolbar .tool-section.hidden {
                display: none;
            }
            
            /* Drawing canvas overlay */
            .drawing-canvas-overlay {
                position: absolute;
                top: 0;
                left: 0;
                pointer-events: none;
                z-index: 100;
            }
            
            .drawing-canvas-overlay.active {
                pointer-events: auto !important;
                cursor: crosshair !important;
                z-index: 1000;
            }
            
            .drawing-canvas-overlay.eraser {
                cursor: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="white" stroke="black" stroke-width="1"/></svg>') 10 10, auto;
            }
            
            /* Toolbar button active state */
            #drawingModeToggle.active {
                background: var(--primary, #667eea) !important;
                color: white !important;
            }
        `;
        document.head.appendChild(style);
    }

    toggleDrawingMode(force = null) {
        const newState = force !== null ? force : !this.isDrawingMode;
        this.isDrawingMode = newState;


        const toolbar = document.getElementById('drawingToolbar');
        const toggleBtn = document.getElementById('drawingModeToggle');

        if (newState) {
            toolbar?.classList.remove('hidden');
            toggleBtn?.classList.add('active');
            this.updateToolbarForTool(); // Ensure correct color section is shown
            this.enableDrawingOnPages();
        } else {
            toolbar?.classList.add('hidden');
            toggleBtn?.classList.remove('active');
            this.disableDrawingOnPages();
        }
    }

    setupPageObserver() {
        // Observe for new pages being added
        const viewer = document.getElementById('viewer');
        if (!viewer) {
            setTimeout(() => this.setupPageObserver(), 1000);
            return;
        }

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.classList?.contains('page')) {
                        this.setupPageCanvas(node);
                    }
                });
            });
        });

        observer.observe(viewer, { childList: true, subtree: true });

        // Setup existing pages
        viewer.querySelectorAll('.page').forEach(page => {
            this.setupPageCanvas(page);
        });
    }

    setupPageCanvas(pageElement) {
        const pageNum = parseInt(pageElement.dataset.pageNumber);
        if (!pageNum || this.canvases[pageNum]) return;

        // Wait for page to be rendered
        const canvasWrapper = pageElement.querySelector('.canvasWrapper');
        if (!canvasWrapper) {
            setTimeout(() => this.setupPageCanvas(pageElement), 500);
            return;
        }

        const pdfCanvas = canvasWrapper.querySelector('canvas');
        if (!pdfCanvas) {
            setTimeout(() => this.setupPageCanvas(pageElement), 500);
            return;
        }

        // Make sure pdfCanvas has dimensions
        if (!pdfCanvas.width || !pdfCanvas.height) {
            setTimeout(() => this.setupPageCanvas(pageElement), 500);
            return;
        }

        // Create drawing canvas
        const drawingCanvas = document.createElement('canvas');
        drawingCanvas.className = 'drawing-canvas-overlay';
        drawingCanvas.width = pdfCanvas.width;
        drawingCanvas.height = pdfCanvas.height;

        // Match the display size of the PDF canvas
        const pdfRect = pdfCanvas.getBoundingClientRect();
        const pageRect = pageElement.getBoundingClientRect();
        drawingCanvas.style.width = pdfRect.width + 'px';
        drawingCanvas.style.height = pdfRect.height + 'px';
        // Position relative to page element (accounting for any offset)
        drawingCanvas.style.left = (pdfRect.left - pageRect.left) + 'px';
        drawingCanvas.style.top = (pdfRect.top - pageRect.top) + 'px';
        drawingCanvas.dataset.pageNumber = pageNum;

        // Append to page element directly (not canvasWrapper) to be above textLayer and annotationLayer
        pageElement.appendChild(drawingCanvas);
        this.canvases[pageNum] = drawingCanvas;


        // Setup drawing events
        this.setupCanvasEvents(drawingCanvas, pageNum);

        // If drawing mode is already active, enable this canvas
        if (this.isDrawingMode) {
            drawingCanvas.classList.add('active');
            if (this.currentTool === 'eraser') {
                drawingCanvas.classList.add('eraser');
            }
        }

        // Redraw existing strokes
        this.redrawPage(pageNum);
    }

    setupCanvasEvents(canvas, pageNum) {
        const getPoint = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            if (e.touches) {
                return {
                    x: (e.touches[0].clientX - rect.left) * scaleX,
                    y: (e.touches[0].clientY - rect.top) * scaleY
                };
            }
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        };

        const startDrawing = (e) => {
            if (!this.isDrawingMode) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();

            this.isDrawing = true;
            const point = getPoint(e);
            this.lastPoint = point;
            this.startPoint = point; // Save start point for straight line mode
            this.currentDrawingPage = pageNum; // Track which page we're drawing on


            if (this.currentTool === 'eraser') {
                this.eraseAt(pageNum, point);
            } else {
                this.currentStroke = {
                    id: Date.now().toString(),
                    tool: this.currentTool,
                    color: this.currentTool === 'freeHighlight' ? this.currentHighlightColor : this.currentColor,
                    width: this.currentTool === 'freeHighlight' ? this.highlightWidth : this.lineWidth,
                    opacity: this.currentTool === 'freeHighlight' ? this.highlightOpacity : this.opacity,
                    points: [point]
                };
            }
        };

        const draw = (e) => {
            if (!this.isDrawing || !this.isDrawingMode) return;
            e.preventDefault();
            e.stopPropagation();

            const point = getPoint(e);

            if (this.currentTool === 'eraser') {
                this.eraseAt(pageNum, point);
            } else if (this.currentStroke) {
                this.currentStroke.points.push(point);

                // If Shift is pressed, draw as straight line from start to current point
                if (this.isShiftPressed && this.startPoint) {
                    // Clear and redraw existing strokes, then draw straight line
                    this.redrawPage(pageNum);
                    const ctx = canvas.getContext('2d');
                    ctx.save();
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.globalAlpha = this.currentStroke.opacity;
                    ctx.strokeStyle = this.currentStroke.color;
                    ctx.lineWidth = this.currentStroke.width;

                    if (this.currentStroke.tool === 'freeHighlight') {
                        ctx.globalCompositeOperation = 'multiply';
                    }

                    ctx.beginPath();
                    ctx.moveTo(this.startPoint.x, this.startPoint.y);
                    ctx.lineTo(point.x, point.y);
                    ctx.stroke();
                    ctx.restore();
                } else {
                    // Normal freehand drawing
                    this.drawStroke(canvas, this.currentStroke, true);
                }
            }

            this.lastPoint = point;
        };

        const stopDrawing = (e) => {
            if (!this.isDrawing) return;
            this.isDrawing = false;


            if (this.currentStroke && this.currentStroke.points.length > 1) {
                // If Shift is pressed, convert to straight line (only keep start and end points)
                if (this.isShiftPressed && this.startPoint) {
                    const endPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
                    this.currentStroke.points = [this.startPoint, endPoint];
                }

                if (!this.drawings[pageNum]) {
                    this.drawings[pageNum] = [];
                }
                this.drawings[pageNum].push(this.currentStroke);
                this.saveDrawings();
                // Redraw the full stroke (not live)
                this.redrawPage(pageNum);
            }

            this.currentStroke = null;
            this.lastPoint = null;
            this.startPoint = null;
            this.currentDrawingPage = null;
        };

        // Mouse events
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);

        // Touch events
        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stopDrawing);
    }

    drawStroke(canvas, stroke, isLive = false) {
        const ctx = canvas.getContext('2d');
        if (!ctx || stroke.points.length < 2) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = stroke.opacity;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;

        if (stroke.tool === 'freeHighlight') {
            ctx.globalCompositeOperation = 'multiply';
        }

        if (isLive && stroke.points.length >= 2) {
            // Just draw the last segment for performance
            const last = stroke.points[stroke.points.length - 1];
            const prev = stroke.points[stroke.points.length - 2];
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(last.x, last.y);
            ctx.stroke();
        } else {
            // Draw the full stroke
            ctx.beginPath();
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

            for (let i = 1; i < stroke.points.length; i++) {
                const p0 = stroke.points[i - 1];
                const p1 = stroke.points[i];
                const midX = (p0.x + p1.x) / 2;
                const midY = (p0.y + p1.y) / 2;
                ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
            }

            // Connect to last point
            const lastPoint = stroke.points[stroke.points.length - 1];
            ctx.lineTo(lastPoint.x, lastPoint.y);
            ctx.stroke();
        }

        ctx.restore();
    }

    redrawPage(pageNum) {
        const canvas = this.canvases[pageNum];
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const pageDrawings = this.drawings[pageNum] || [];
        pageDrawings.forEach(stroke => {
            this.drawStroke(canvas, stroke);
        });
    }

    redrawAllPages() {
        Object.keys(this.canvases).forEach(pageNum => {
            this.redrawPage(parseInt(pageNum));
        });
    }

    updateCanvasCursors() {
        if (!this.isDrawingMode) return;

        Object.values(this.canvases).forEach(canvas => {
            if (this.currentTool === 'eraser') {
                canvas.classList.add('eraser');
            } else {
                canvas.classList.remove('eraser');
            }
        });
    }

    enableDrawingOnPages() {
        // Also setup any pages that don't have canvases yet
        const viewer = document.getElementById('viewer');
        if (viewer) {
            viewer.querySelectorAll('.page').forEach(page => {
                const pageNum = parseInt(page.dataset.pageNumber);
                if (pageNum && !this.canvases[pageNum]) {
                    this.setupPageCanvas(page);
                }
            });
        }

        Object.values(this.canvases).forEach(canvas => {
            canvas.classList.add('active');
            if (this.currentTool === 'eraser') {
                canvas.classList.add('eraser');
            } else {
                canvas.classList.remove('eraser');
            }
        });
    }

    disableDrawingOnPages() {
        Object.values(this.canvases).forEach(canvas => {
            canvas.classList.remove('active', 'eraser');
        });
    }

    eraseAt(pageNum, point) {
        const pageDrawings = this.drawings[pageNum];
        if (!pageDrawings || pageDrawings.length === 0) return;

        const eraserRadius = 20;
        let changed = false;

        // Find strokes that intersect with the eraser
        this.drawings[pageNum] = pageDrawings.filter(stroke => {
            const intersects = stroke.points.some(p => {
                const dx = p.x - point.x;
                const dy = p.y - point.y;
                return Math.sqrt(dx * dx + dy * dy) < eraserRadius;
            });

            if (intersects) changed = true;
            return !intersects;
        });

        if (changed) {
            this.redrawPage(pageNum);
            this.saveDrawings();
        }
    }

    undoLastStroke() {
        // Find the current visible page
        const viewer = document.getElementById('viewer');
        const pages = viewer?.querySelectorAll('.page');
        let currentPage = 1;

        pages?.forEach(page => {
            const rect = page.getBoundingClientRect();
            if (rect.top < window.innerHeight / 2 && rect.bottom > 0) {
                currentPage = parseInt(page.dataset.pageNumber);
            }
        });

        if (this.drawings[currentPage] && this.drawings[currentPage].length > 0) {
            this.drawings[currentPage].pop();
            this.redrawPage(currentPage);
            this.saveDrawings();
        }
    }

    clearCurrentPage() {
        // Find the current visible page
        const viewer = document.getElementById('viewer');
        const pages = viewer?.querySelectorAll('.page');
        let currentPage = 1;

        pages?.forEach(page => {
            const rect = page.getBoundingClientRect();
            if (rect.top < window.innerHeight / 2 && rect.bottom > 0) {
                currentPage = parseInt(page.dataset.pageNumber);
            }
        });

        if (confirm('Clear all drawings on this page?')) {
            this.drawings[currentPage] = [];
            this.redrawPage(currentPage);
            this.saveDrawings();
        }
    }

    /**
     * Clear all canvas references so they can be recreated after zoom change
     * Called by reRenderAll before pages are cleared
     */
    clearCanvasReferences() {
        // Store whether drawing mode was active
        const wasDrawingMode = this.isDrawingMode;

        // Clear canvas references - the canvases will be removed when pages are cleared
        this.canvases = {};

        // If drawing mode was active, we'll need to re-enable it after pages are re-rendered
        if (wasDrawingMode) {
            setTimeout(() => {
                // Re-setup canvases for existing pages
                const viewer = document.getElementById('viewer');
                if (viewer) {
                    viewer.querySelectorAll('.page').forEach(page => {
                        this.setupPageCanvas(page);
                    });
                }
                // Re-enable drawing mode on the new canvases
                this.enableDrawingOnPages();
            }, 500);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.drawingManager = new DrawingManager();
    });
} else {
    window.drawingManager = new DrawingManager();
}
