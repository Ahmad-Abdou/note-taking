const path = require('path');
const fs = require('fs');
const { rimraf } = require('rimraf');
const { execFileSync } = require('child_process');

function tryTaskKillByImageName(imageName) {
    try {
        execFileSync('taskkill', ['/F', '/IM', imageName], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

async function main() {
    const projectRoot = path.resolve(__dirname, '..');
    const distPath = path.join(projectRoot, 'dist');

    if (!fs.existsSync(distPath)) {
        process.exit(0);
    }

    try {
        await rimraf(distPath, { maxRetries: 5, retryDelay: 200 });
        process.exit(0);
    } catch (err) {
        const message = err?.message || String(err);
        const isWindows = process.platform === 'win32';
        const isBusy = err?.code === 'EBUSY' || err?.code === 'EPERM';

        if (isWindows && isBusy && process.env.CLEAN_KILL_PROCESS === '1') {
            // Best-effort: kill the packaged exe if it's running from dist.
            try {
                const files = fs.readdirSync(distPath).filter((f) => f.toLowerCase().endsWith('.exe'));
                let killedAny = false;
                for (const f of files) {
                    killedAny = tryTaskKillByImageName(f) || killedAny;
                }

                // Retry cleanup after killing.
                await rimraf(distPath, { maxRetries: 5, retryDelay: 200 });
                process.exit(0);
            } catch (err2) {
                const msg2 = err2?.message || String(err2);
                console.error('Failed to clean dist even after attempting to stop running EXE.');
                console.error('Error:', msg2);
                process.exit(1);
            }
        }

        console.error('Failed to clean dist folder.');
        console.error('Error:', message);
        if (isWindows && isBusy) {
            console.error('It looks like a file in dist is still running or locked.');
            console.error('Close the desktop app built from dist (or stop it in Task Manager), then re-run the build.');
            console.error('Optional: set CLEAN_KILL_PROCESS=1 to auto-kill the dist EXE before cleaning.');
        }
        process.exit(1);
    }
}

main();
