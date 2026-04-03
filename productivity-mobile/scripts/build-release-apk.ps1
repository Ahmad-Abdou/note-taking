param(
    [switch]$UseLocal,
    [string]$LocalPath = 'C:\dev\productivity-mobile-local'
)

$ErrorActionPreference = 'Stop'

# Determine the project root to build from
if ($UseLocal) {
    if (-not (Test-Path $LocalPath)) {
        Write-Error "Local workspace '$LocalPath' does not exist. Run android:dev:local first to sync it."
        exit 1
    }
    $projectRoot = $LocalPath
    Write-Host "Building from local workspace: $projectRoot"
} else {
    $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    Write-Host "Building from source: $projectRoot"
}

Push-Location $projectRoot
try {
    Write-Host ''
    Write-Host '=== Productivity Hub Mobile - Release APK Build ==='
    Write-Host ''

    # Ensure node_modules exist
    if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
        Write-Host 'Installing dependencies...'
        npm install
    }

    # Run the gradle release build.
    # The react {} block in build.gradle uses bundleCommand = "export:embed" which
    # automatically bundles JavaScript into the APK for release builds.
    # No Metro / dev server is needed for the resulting APK.
    Write-Host 'Building release APK (this bundles JS and compiles native code)...'
    Push-Location (Join-Path $projectRoot 'android')
    try {
        & .\gradlew.bat assembleRelease
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle assembleRelease failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }

    # Locate the APK
    $apkPath = Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
    if (Test-Path $apkPath) {
        Write-Host ''
        Write-Host '=== BUILD SUCCESSFUL ==='
        Write-Host "APK: $apkPath"
        Write-Host ''
        Write-Host 'To install on your phone:'
        Write-Host '  1. Copy the APK to your phone (USB, OneDrive, email, etc.)'
        Write-Host '  2. On your phone: Settings > Install unknown apps > allow your file manager'
        Write-Host '  3. Open the APK file on your phone to install'
        Write-Host '  OR'
        Write-Host '  Run: adb install "' + $apkPath + '"'
        Write-Host ''

        # Open the output folder in Explorer
        explorer.exe (Split-Path $apkPath)
    } else {
        Write-Host "APK not found at expected path. Check android\app\build\outputs\apk\release\"
    }
} finally {
    Pop-Location
}
