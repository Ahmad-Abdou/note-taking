const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'node_modules', 'metro', 'src', 'HmrServer.js');
const markerConst = 'const HMR_FALLBACK_ORIGIN = "http://localhost";';
const markerGuard = 'requestUrl = new URL(requestUrl, HMR_FALLBACK_ORIGIN).toString();';

function patchMetroHmrUrl() {
  if (!fs.existsSync(targetFile)) {
    console.log('[metro-hmr-patch] metro HmrServer.js not found. Skipping.');
    return;
  }

  let source = fs.readFileSync(targetFile, 'utf8');
  let changed = false;

  if (!source.includes(markerConst)) {
    const loggerLine = 'const { createActionStartEntry, createActionEndEntry, log } = _metroCore.Logger;';
    if (source.includes(loggerLine)) {
      source = source.replace(
        loggerLine,
        loggerLine + '\nconst HMR_FALLBACK_ORIGIN = "http://localhost";',
      );
      changed = true;
    } else {
      console.warn('[metro-hmr-patch] Could not find logger anchor line.');
    }
  }

  if (!source.includes(markerGuard)) {
    const rewriteLine = '    requestUrl = this._config.server.rewriteRequestUrl(requestUrl);';
    const guardBlock = [
      '    if (!URL.canParse(requestUrl)) {',
      '      try {',
      '        requestUrl = new URL(requestUrl, HMR_FALLBACK_ORIGIN).toString();',
      '      } catch {',
      '        // Keep the original request URL so the normal parser error path is preserved.',
      '      }',
      '    }',
    ].join('\n');

    if (source.includes(rewriteLine)) {
      source = source.replace(rewriteLine, rewriteLine + '\n' + guardBlock);
      changed = true;
    } else {
      console.warn('[metro-hmr-patch] Could not find rewrite anchor line.');
    }
  }

  if (changed) {
    fs.writeFileSync(targetFile, source, 'utf8');
    console.log('[metro-hmr-patch] Applied Metro HMR URL compatibility patch.');
  } else {
    console.log('[metro-hmr-patch] Patch already present.');
  }
}

patchMetroHmrUrl();
