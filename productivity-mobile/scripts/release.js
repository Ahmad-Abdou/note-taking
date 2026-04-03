/**
 * Release script for productivity-mobile
 * Bumps version in package.json + app.json, commits, tags mobile-vX.Y.Z, pushes.
 * GitHub Actions picks up the tag and builds + publishes the APK automatically.
 *
 * Usage:
 *   node scripts/release.js          # patch bump (1.0.0 -> 1.0.1)
 *   node scripts/release.js minor    # minor bump (1.0.0 -> 1.1.0)
 *   node scripts/release.js major    # major bump (1.0.0 -> 2.0.0)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const bumpType = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error('Usage: node scripts/release.js [patch|minor|major]');
    process.exit(1);
}

const packagePath = path.join(__dirname, '..', 'package.json');
const appJsonPath = path.join(__dirname, '..', 'app.json');
const repoRoot = path.join(__dirname, '..', '..');

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const currentVersion = pkg.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

let newVersion;
switch (bumpType) {
    case 'major': newVersion = `${major + 1}.0.0`; break;
    case 'minor': newVersion = `${major}.${minor + 1}.0`; break;
    case 'patch':
    default:      newVersion = `${major}.${minor}.${patch + 1}`; break;
}

// Derive a numeric versionCode from the version (e.g. 1.2.3 -> 10203)
const [mj, mn, pt] = newVersion.split('.').map(Number);
const newVersionCode = mj * 10000 + mn * 100 + pt;

console.log(`\n=== Mobile Release Script ===`);
console.log(`Bumping version: ${currentVersion} -> ${newVersion} (versionCode: ${newVersionCode})`);

// Update package.json
pkg.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
console.log('✓ Updated package.json');

// Update app.json version + android versionCode
appJson.expo.version = newVersion;
if (!appJson.expo.android) appJson.expo.android = {};
appJson.expo.android.versionCode = newVersionCode;
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
console.log('✓ Updated app.json');

const run = (cmd) => {
    console.log(`> ${cmd}`);
    try {
        execSync(cmd, { cwd: repoRoot, stdio: 'inherit' });
    } catch {
        console.error(`Command failed: ${cmd}`);
        process.exit(1);
    }
};

const tag = `mobile-v${newVersion}`;

run('git add .');
run(`git commit -m "Release mobile v${newVersion}"`);
run(`git tag ${tag}`);
run('git push');
run('git push --tags');

console.log(`\n✓ Released ${tag} successfully!`);
console.log(`GitHub Actions will now build and publish the APK.`);
console.log(`Watch: https://github.com/Ahmad-Abdou/note-taking/actions`);
console.log(`==============================\n`);
