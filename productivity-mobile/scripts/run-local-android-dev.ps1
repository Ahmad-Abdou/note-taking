param(
    [string]$Destination = 'C:\dev\productivity-mobile-local',
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

Write-Host "Source: $source"
Write-Host "Destination: $Destination"
Write-Host 'Syncing project to local non-OneDrive workspace...'

New-Item -ItemType Directory -Path $Destination -Force | Out-Null

$excludePaths = @(
    (Join-Path $source 'node_modules'),
    (Join-Path $source '.expo'),
    (Join-Path $source 'dist'),
    (Join-Path $source 'test-results'),
    (Join-Path $source 'android\.gradle'),
    (Join-Path $source 'android\build'),
    (Join-Path $source 'android\app\build')
)

$robocopyArgs = @(
    $source,
    $Destination,
    '/MIR',
    '/R:2',
    '/W:1',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NP',
    '/XD'
) + $excludePaths

& robocopy @robocopyArgs
$robocopyExit = $LASTEXITCODE

if ($robocopyExit -ge 8) {
    throw "Robocopy failed with exit code $robocopyExit"
}

Push-Location $Destination
try {
    if (-not $SkipInstall) {
        Write-Host 'Installing dependencies in local workspace...'
        npm install
    } else {
        Write-Host 'Skipping npm install as requested.'
    }

    Write-Host 'Running android development build with latest updates...'
    npm run android:dev
}
finally {
    Pop-Location
}
