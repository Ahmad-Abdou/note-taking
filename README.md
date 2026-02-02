# Edge Note Taker Extension

A browser extension for Microsoft Edge (and Chrome) that allows you to highlight text on any webpage or local PDF and save it to a notebook. You can manage your notebooks and export them as PDF or DOC files.

## Features

-   **Highlight & Add**: Select text on any page, and a floating "+" button will appear. Click it to save the text.
-   **Context Menu**: Right-click selected text and choose "Add to Notebook".
-   **Notebook Management**: Create multiple notebooks to organize your research.
-   **Export**: Export your notes to PDF or Word Document (.doc).
-   **Local PDF Support**: Works on local PDF files opened in the browser (requires permission).
-   **Examination Center**: Generate comprehensive exams based on PDF content with 6 exam types
-   **Vocabulary Builder**: Build your vocabulary with English/Arabic translations and practice modes

## Examination Center (New!)

The Examination Center provides 6 different types of advanced examinations to test your knowledge:

1. **Multiple Choice (MCQ)**: Classic 4-option questions testing recall and understanding
2. **True/False**: Evaluate statements for accuracy - quick comprehension check
3. **Fill in the Blank**: Complete sentences with missing keywords - tests precise knowledge
4. **Matching**: Match terms with definitions - tests associations and connections
5. **Short Answer**: Write brief answers - tests deeper understanding and expression
6. **Comprehensive**: Mix of all types - ultimate knowledge assessment

### Features:
- AI-powered question generation (uses Gemini API if configured)
- Adjustable difficulty levels (Easy, Medium, Hard)
- Timer to track exam duration
- Detailed results with mistake review
- Explanations for each incorrect answer to help you learn
- Select specific pages or page ranges for exam content

## Vocabulary Builder (New!)

Build and maintain your personal vocabulary with:

### Add Words
- Enter words with English definitions
- Add Arabic translations (الترجمة العربية)
- Include example sentences
- Categorize words (Academic, Technical, Medical, Legal, Business, etc.)
- **AI Translate**: Auto-fill translations using Gemini AI

### Practice Modes
- **Flashcards**: Flip cards to test recall with self-rating
- **Quiz**: Multiple choice questions from your word list
- **Write Mode**: Type answers to test spelling and recall

### Practice Directions
- Word → Meaning
- Meaning → Word
- English → Arabic
- Arabic → English

### Word Management
- Search and filter words by category
- Track mastery level for each word
- Import/Export vocabulary as JSON
- Edit or delete saved words

## Installation

1.  Open Microsoft Edge.
2.  Navigate to `edge://extensions`.
3.  Enable **Developer mode** (toggle in the bottom left or top right depending on version).
4.  Click **Load unpacked**.
5.  Select the folder containing this extension (the folder with `manifest.json`).

## Enabling Local File Access

To use this extension on local PDF files:

1.  Go to `edge://extensions`.
2.  Find "Edge Note Taker".
3.  Click **Details**.
4.  Toggle on **Allow access to file URLs**.

## Usage

1.  **Select Text**: Highlight any text on a webpage.
2.  **Floating Menu**: A menu will appear with three options:
    *   **+ (Add Text)**: Adds the selected text to your notebook.
    *   **H (Highlight)**: Highlights the text on the page (HTML pages only).
    *   **📷 (Capture)**: Takes a screenshot of the selected area and adds it to your notebook.
3.  **View Notes**: Click the extension icon in the browser toolbar to open the popup.
4.  **Full Screen Dashboard**: Click the expand icon (⤢) in the popup to open the full-screen dashboard.
5.  **Notion-like Editor**:
    *   **Slash Commands**: Type `/` in any block to change its type (Heading, To-do, Bullet List, etc.).
    *   **Blocks**: Each paragraph is a block. Press Enter to create a new one.
    *   **Images**: Images captured from PDFs or pages appear as blocks.
6.  **Manage**: Use the sidebar to switch notebooks or create new ones.
7.  **Export**: Use the buttons at the top right to export your notes.
8.  **Examination Center**: Click the ✓ button in PDF viewer to open the exam center
9.  **Vocabulary Builder**: Click the 📚 button in PDF viewer to manage vocabulary

## Testing

This repo has two complementary test layers:

1) In-extension test runner (fast regression suite)
- Load the extension (unpacked) in Chrome/Edge.
- Open: `chrome-extension://<extension-id>/tests/test_runner.html`
- Click “Run All Tests”.

2) Playwright E2E (automation, pre-deployment smoke)
- Install deps: `npm install`
- Fast smoke run (recommended before publishing): `npm run test:smoke`
- Full E2E run (includes coverage-driving specs): `npm test`

Pre-publish (recommended)
- Run: `npm run validate:release`

3) Coverage report (what’s covered vs not)
- Run: `npm run test:coverage`
- Open: `test-results/coverage/index.html`

What `npm test` does:
- Launches Chromium with the extension loaded.
- Runs Chromium in headed mode (extensions are unreliable in headless).
- Runs basic UI smoke flows in the Productivity Hub (tasks / focus / notifications).
