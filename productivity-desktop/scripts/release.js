/**
 * Release script for productivity-desktop
 * Bumps version, creates git tag, commits and pushes everything
 * 
 * Usage: node scripts/release.js [patch|minor|major]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get bump type from args (default: patch)
const bumpType = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error('Usage: node scripts/release.js [patch|minor|major]');
    process.exit(1);
}

// Paths
const packagePath = path.join(__dirname, '..', 'package.json');
const repoRoot = path.join(__dirname, '..', '..');

// Read package.json
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const currentVersion = pkg.version;

// Parse and bump version
const [major, minor, patch] = currentVersion.split('.').map(Number);
let newVersion;
switch (bumpType) {
    case 'major':
        newVersion = `${major + 1}.0.0`;
        break;
    case 'minor':
        newVersion = `${major}.${minor + 1}.0`;
        break;
    case 'patch':
    default:
        newVersion = `${major}.${minor}.${patch + 1}`;
}

console.log(`\n=== Release Script ===`);
console.log(`Bumping version: ${currentVersion} -> ${newVersion}`);

// Update package.json
pkg.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 4) + '\n');
console.log(`✓ Updated package.json`);

// Run git commands from repo root
const run = (cmd) => {
    console.log(`> ${cmd}`);
    try {
        execSync(cmd, { cwd: repoRoot, stdio: 'inherit' });
    } catch (err) {
        console.error(`Command failed: ${cmd}`);
        process.exit(1);
    }
};

// Stage all changes
run('git add .');

// Commit
run(`git commit -m "Release v${newVersion}"`);

// Create tag
run(`git tag v${newVersion}`);

// Push commits
run('git push');

// Push tags
run('git push --tags');

console.log(`\n✓ Released v${newVersion} successfully!`);
console.log(`======================\n`);
