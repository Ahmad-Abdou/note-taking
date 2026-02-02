# Desktop in-app updates

The desktop app supports an in-app **Check for Updates / Download / Install & Restart** flow.

## Where the button is

- Settings → Data → **App Updates**

## Important notes

- Updates work only in **packaged builds** (installed/portable builds created by electron-builder). In development (`npm start`), the updater will show a message that updates aren’t available.
- On Windows, auto-updates are best supported with the **NSIS installer** target. Portable builds may not update reliably depending on how/where they are run.

## How updates are delivered

This project uses `electron-updater`, which expects you to **publish release artifacts**.

The simplest setup is GitHub Releases:

1. Ensure the repo has a GitHub remote (or add a `repository` field in `productivity-desktop/package.json`).
2. Build the installer artifacts.
3. Publish them to a GitHub Release (so the app can discover and download the latest version).

### Publishing

- Recommended for auto-update: build NSIS + publish
- You’ll need an environment variable `GH_TOKEN` with permission to create releases / upload assets.

Common commands (run inside `productivity-desktop/`):

- `npm run build:installer`

Recommended release flow (from the repo root):

1. Bump `productivity-desktop/package.json` version (e.g. `1.0.1`)
2. Commit
3. Tag: `v1.0.1`
4. Push tag to GitHub

The GitHub Actions workflow will build the NSIS installer and publish a GitHub Release for that tag.

To publish automatically via electron-builder, you typically run electron-builder with `--publish always` after setting `GH_TOKEN`.

## Faster local rebuilds (no manual dist deletion)

The desktop package scripts include a clean step:

- `npm run build`
- `npm run build:installer`

If Windows says dist is locked, close the running EXE (or run the clean with auto-kill):

- PowerShell: `setx CLEAN_KILL_PROCESS 1` (or set it only for one command)
