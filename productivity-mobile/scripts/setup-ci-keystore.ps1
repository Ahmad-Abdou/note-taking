# Run this ONCE to set up the GitHub secret needed for CI signing.
# The keystore secret lets GitHub Actions sign APKs with the same key as your
# local builds, so Android accepts CI-built APKs as updates over the existing app.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/setup-ci-keystore.ps1

$keystorePath = Join-Path $PSScriptRoot "..\android\app\debug.keystore"

if (-not (Test-Path $keystorePath)) {
    Write-Host ""
    Write-Host "ERROR: debug.keystore not found at:" -ForegroundColor Red
    Write-Host "  $keystorePath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Build the app locally first (npm run android:dev) to generate it,"
    Write-Host "then run this script again."
    exit 1
}

$bytes   = [System.IO.File]::ReadAllBytes($keystorePath)
$b64     = [System.Convert]::ToBase64String($bytes)

Write-Host ""
Write-Host "=== Keystore encoded successfully ===" -ForegroundColor Green
Write-Host ""
Write-Host "Copy the entire value below (it is one long line):"
Write-Host ""
Write-Host $b64
Write-Host ""
Write-Host "Then add it as a GitHub secret:" -ForegroundColor Yellow
Write-Host "  1. Open: https://github.com/Ahmad-Abdou/note-taking/settings/secrets/actions"
Write-Host "  2. Click 'New repository secret'"
Write-Host "  3. Name:  ANDROID_DEBUG_KEYSTORE_BASE64"
Write-Host "  4. Value: (paste the long string above)"
Write-Host "  5. Click 'Add secret'"
Write-Host ""
Write-Host "After that, every 'npm run release' will trigger a CI build that"
Write-Host "signs the APK with this same keystore."
Write-Host ""
