const { spawn } = require('child_process');
const path = require('path');

function isOneDrivePath(dir) {
  return /[\\/]OneDrive([\\/]|$)/i.test(dir);
}

function run(command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('error', (error) => {
    console.error(`[android:dev] Failed to start '${command}':`, error.message);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

const extraArgs = process.argv.slice(2);
const cwd = process.cwd();
const isWindows = process.platform === 'win32';

if (isWindows && isOneDrivePath(cwd)) {
  const scriptPath = path.join('scripts', 'run-local-android-dev.ps1');
  console.log('[android:dev] OneDrive path detected. Running local mirror Android build to avoid Gradle lock errors.');
  run('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...extraArgs]);
} else {
  run('npx', ['expo', 'run:android', ...extraArgs]);
}
