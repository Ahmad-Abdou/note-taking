# Release Checklist (Public Deployment)

This checklist is aimed at preventing embarrassing production bugs and store rejections.

## 1) Automated checks (required)

- Install deps: `npm install`
- Run release validation: `npm run validate:release`
  - This runs a fast E2E smoke suite (excluding coverage-only specs)
  - Then runs the full suite + regenerates coverage artifacts
- Open the E2E HTML report if something fails:
  - `npx playwright show-report test-results/playwright-report`
- Open coverage report (optional):
  - `test-results/coverage/index.html`

## 2) Manual smoke (required, ~5–10 minutes)

### Core note-taking
- On a normal webpage:
  - Select text → right click → “Add to Notebook” → confirm it saves
  - Select text → right click → “Capture selection” (if present) → confirm image note saves
  - Verify the “Note saved successfully!” toast appears
- Open the extension popup:
  - Verify notes appear in the current notebook
  - Create a new notebook and verify switching works
- Open the dashboard:
  - Verify notes render correctly (text + images)
  - Verify editing blocks works (Notion-like editor)
  - Verify export works:
    - Export PDF
    - Export DOC

### Local PDF support
- In extension details, ensure **Allow access to file URLs** is enabled
- Open a local PDF in the browser
  - Verify selection → context menu “Add to Notebook” works
  - Verify screenshot capture works (if enabled)

### PDF reader extras
- Open the PDF reader UI
  - Examination Center: open and generate an exam (with/without Gemini configured)
  - Vocabulary Builder: add/edit a word, practice mode works

### Productivity Hub (if you ship it)
- Tasks:
  - Create a task (due today + recurring daily) → complete it → verify it rolls over next day
  - Filters/search/views work (list/grid/board/calendar)
- Focus:
  - Start a session, pause/resume, stop
  - Reload the page mid-session → restore prompt appears and both buttons work
  - Focus overlay appears on normal webpages (content script overlay)
- Notifications:
  - Test sound button works
  - Reminder banner appears when triggered
- Blocker:
  - Enable blocker, add a blocked site, verify blocking page renders

## 3) Store-readiness checks (highly recommended)

- Verify `manifest.json` version is correct and matches your release notes
- Verify all permissions are actually needed (remove unused ones)
- Verify icons exist and look correct at all sizes
- Verify you have a privacy policy if you collect any user data (even locally)
- Verify Gemini API key handling:
  - Not hard-coded
  - Stored locally and never logged

## 4) Final sanity

- Re-launch the browser and repeat the quick popup/dashboard check
- If you support Edge + Chrome: test both (some APIs behave slightly differently)
