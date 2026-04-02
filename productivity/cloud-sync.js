(function () {
    'use strict';

    const CLOUD_SYNC_KEY = 'productivity_cloud_sync';
    const CLOUD_SYNC_STATE_KEY = 'productivity_cloud_sync_state_v2';
    const GIST_FILENAME = 'productivity-hub-sync.json';

    function $(id) {
        return document.getElementById(id);
    }

    function setStatus(message, type = 'info') {
        const el = $('cloud-sync-status');
        if (el) {
            el.textContent = message || '';
            el.dataset.type = type;
        }

        if (typeof window.showToast === 'function' && message) {
            const toastType = type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info');
            window.showToast(toastType, 'Sync', message, { silent: toastType === 'info' });
        }
    }

    function getMergeOption() {
        const mergeCheckbox = $('sync-merge-option');
        return !!(mergeCheckbox && mergeCheckbox.checked);
    }

    function stableSerialize(value) {
        if (Array.isArray(value)) {
            return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
        }

        if (value && typeof value === 'object') {
            const keys = Object.keys(value).sort();
            return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
        }

        return JSON.stringify(value);
    }

    function computePayloadChecksum(payload) {
        const text = typeof payload === 'string' ? payload : '';
        let normalized = text;

        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const clone = { ...parsed };
                delete clone.exportDate;
                delete clone.source;
                normalized = stableSerialize(clone);
            }
        } catch (_) {
            normalized = text;
        }

        let hash = 2166136261;

        for (let i = 0; i < normalized.length; i += 1) {
            hash ^= normalized.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }

        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function getGistStateKey(gistId) {
        return gistId || '__default__';
    }

    function hasSyncState(state) {
        if (!state || typeof state !== 'object') return false;
        if (typeof state.lastPayloadChecksum === 'string' && state.lastPayloadChecksum) return true;
        if (typeof state.lastRemoteChecksum === 'string' && state.lastRemoteChecksum) return true;
        const remoteVersion = Number(state.lastRemoteVersion || 0);
        return Number.isFinite(remoteVersion) && remoteVersion > 0;
    }

    function getGistVersion(gistJson) {
        const ts = Date.parse(gistJson?.updated_at || '');
        return Number.isFinite(ts) ? ts : 0;
    }

    async function readSyncState(gistId) {
        if (!window.ProductivityData?.DataStore?.get) return {};

        const allState = await window.ProductivityData.DataStore.get(CLOUD_SYNC_STATE_KEY, {});
        if (!allState || typeof allState !== 'object' || Array.isArray(allState)) {
            return {};
        }

        const key = getGistStateKey(gistId);
        const state = allState[key];
        return state && typeof state === 'object' ? state : {};
    }

    async function writeSyncState(gistId, statePatch) {
        if (!window.ProductivityData?.DataStore?.get || !window.ProductivityData?.DataStore?.set) return;

        const key = getGistStateKey(gistId);
        const allState = await window.ProductivityData.DataStore.get(CLOUD_SYNC_STATE_KEY, {});
        const safeAllState = allState && typeof allState === 'object' && !Array.isArray(allState)
            ? allState
            : {};

        safeAllState[key] = {
            ...(safeAllState[key] && typeof safeAllState[key] === 'object' ? safeAllState[key] : {}),
            ...statePatch
        };

        await window.ProductivityData.DataStore.set(CLOUD_SYNC_STATE_KEY, safeAllState);
    }

    function redactToken(token) {
        if (!token) return '';
        if (token.length <= 8) return '********';
        return `${token.slice(0, 4)}...${token.slice(-4)}`;
    }

    async function storageGet() {
        if (!window.ProductivityData?.DataStore?.get) return { token: '', gistId: '' };
        const existing = await window.ProductivityData.DataStore.get(CLOUD_SYNC_KEY, {});
        return {
            token: typeof existing.token === 'string' ? existing.token : '',
            gistId: typeof existing.gistId === 'string' ? existing.gistId : ''
        };
    }

    async function storageSet(values) {
        if (!window.ProductivityData?.DataStore?.set) return;
        await window.ProductivityData.DataStore.set(CLOUD_SYNC_KEY, values);
    }

    async function storageClear() {
        if (!window.ProductivityData?.DataStore?.remove) return;
        await window.ProductivityData.DataStore.remove(CLOUD_SYNC_KEY);
    }

    async function httpRequest({ method, url, headers, body }) {
        // Desktop renderer may not have CORS access; if an Electron bridge exists, use it.
        if (window.electronAPI?.net?.request) {
            const res = await window.electronAPI.net.request({ method, url, headers, body });
            return {
                ok: !!res.ok,
                status: res.status,
                body: res.body
            };
        }

        const res = await fetch(url, {
            method,
            headers,
            body,
            redirect: 'follow'
        });
        const text = await res.text();
        return { ok: res.ok, status: res.status, body: text };
    }

    function githubHeaders(token) {
        return {
            'Accept': 'application/vnd.github+json',
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
        };
    }

    async function githubGetUser(token) {
        const res = await httpRequest({
            method: 'GET',
            url: 'https://api.github.com/user',
            headers: githubHeaders(token)
        });
        if (!res.ok) {
            throw new Error(`GitHub auth failed (HTTP ${res.status}). Check your token + scopes.`);
        }
        return JSON.parse(res.body);
    }

    async function githubGetGist(token, gistId) {
        const res = await httpRequest({
            method: 'GET',
            url: `https://api.github.com/gists/${encodeURIComponent(gistId)}`,
            headers: githubHeaders(token)
        });
        if (!res.ok) {
            if (res.status === 404) return null;
            throw new Error(`Failed to load gist (HTTP ${res.status}).`);
        }
        return JSON.parse(res.body);
    }

    async function githubCreateGist(token, content) {
        const payload = {
            description: 'Student Productivity Hub Sync Data',
            public: false,
            files: {
                [GIST_FILENAME]: { content }
            }
        };

        const res = await httpRequest({
            method: 'POST',
            url: 'https://api.github.com/gists',
            headers: githubHeaders(token),
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            throw new Error(`Failed to create gist (HTTP ${res.status}).`);
        }
        return JSON.parse(res.body);
    }

    async function githubUpdateGist(token, gistId, content) {
        const payload = {
            files: {
                [GIST_FILENAME]: { content }
            }
        };

        const res = await httpRequest({
            method: 'PATCH',
            url: `https://api.github.com/gists/${encodeURIComponent(gistId)}`,
            headers: githubHeaders(token),
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            throw new Error(`Failed to update gist (HTTP ${res.status}).`);
        }
        return JSON.parse(res.body);
    }

    function extractSyncFileFromGist(gistJson) {
        if (!gistJson?.files) return null;
        const byName = gistJson.files[GIST_FILENAME];
        if (byName && typeof byName.content === 'string') return byName.content;

        // Fallback: first file content
        const first = Object.values(gistJson.files)[0];
        if (first && typeof first.content === 'string') return first.content;
        return null;
    }

    async function doSyncNow() {
        const tokenInput = $('cloud-sync-token');
        const gistInput = $('cloud-sync-gist-id');
        const token = (tokenInput?.value || '').trim();
        let gistId = (gistInput?.value || '').trim();

        if (!token) {
            setStatus('Enter your GitHub token first.', 'error');
            return;
        }

        const merge = getMergeOption();
        const previousState = await readSyncState(gistId);
        const hasPriorState = hasSyncState(previousState);

        setStatus('Syncing… downloading cloud data', 'info');

        // 1) Download from cloud (if exists)
        let remoteJsonString = null;
        let remoteVersion = 0;
        if (gistId) {
            const gist = await githubGetGist(token, gistId);
            if (gist) {
                remoteJsonString = extractSyncFileFromGist(gist);
                remoteVersion = getGistVersion(gist);
            }
        }

        const hasRemotePayload = typeof remoteJsonString === 'string' && !!remoteJsonString.trim();
        const remoteChecksum = hasRemotePayload ? computePayloadChecksum(remoteJsonString) : '';

        let localJsonString = await window.ProductivityData.DataStore.exportAllData();
        let localChecksum = computePayloadChecksum(localJsonString);

        const localChangedSinceLastSync = !hasPriorState || localChecksum !== previousState.lastPayloadChecksum;
        const remoteChangedSinceLastSync = hasRemotePayload && (
            !hasPriorState
            || remoteChecksum !== previousState.lastRemoteChecksum
            || remoteVersion > Number(previousState.lastRemoteVersion || 0)
        );

        let didImport = false;
        let didUpload = false;
        let latestRemoteChecksum = remoteChecksum;
        let latestRemoteVersion = remoteVersion;

        const importRemote = async (shouldMerge) => {
            const result = await window.ProductivityData.DataStore.importAllData(remoteJsonString, { merge: shouldMerge });
            if (!result?.success) {
                throw new Error(result?.error || 'Import failed');
            }
            didImport = true;
            localJsonString = await window.ProductivityData.DataStore.exportAllData();
            localChecksum = computePayloadChecksum(localJsonString);
        };

        const uploadLocal = async (statusMessage) => {
            setStatus(statusMessage, 'info');
            let gistJson;
            if (!gistId) {
                gistJson = await githubCreateGist(token, localJsonString);
                gistId = gistJson.id;
            } else {
                gistJson = await githubUpdateGist(token, gistId, localJsonString);
            }

            didUpload = true;
            latestRemoteChecksum = computePayloadChecksum(localJsonString);
            latestRemoteVersion = getGistVersion(gistJson) || Date.now();
        };

        if (hasRemotePayload && !hasPriorState) {
            setStatus('Syncing… initializing from cloud snapshot', 'info');
            await importRemote(merge);
            if (localChecksum !== remoteChecksum) {
                await uploadLocal('Syncing… uploading merged local data');
            }
        } else if (hasRemotePayload && remoteChangedSinceLastSync && !localChangedSinceLastSync) {
            setStatus('Syncing… applying cloud changes', 'info');
            await importRemote(merge);
        } else if (hasRemotePayload && remoteChangedSinceLastSync && localChangedSinceLastSync) {
            if (merge) {
                setStatus('Syncing… merging local and cloud changes', 'info');
                await importRemote(true);
                await uploadLocal('Syncing… uploading merged local data');
            } else {
                await uploadLocal('Syncing… conflict detected, keeping local changes');
            }
        } else if (!hasRemotePayload || localChangedSinceLastSync) {
            await uploadLocal('Syncing… uploading local data');
        }

        await storageSet({ token, gistId });
        if (gistInput) gistInput.value = gistId;

        await writeSyncState(gistId, {
            lastPayloadChecksum: localChecksum,
            lastRemoteChecksum: latestRemoteChecksum || localChecksum,
            lastRemoteVersion: latestRemoteVersion || Date.now(),
            lastSyncAt: new Date().toISOString()
        });

        if (!didImport && !didUpload) {
            setStatus('Already up to date.', 'success');
        } else {
            setStatus(`Synced successfully. Gist: ${gistId}`, 'success');
        }
        updateUiState(true, { token, gistId });
    }

    function updateUiState(isSignedIn, state = { token: '', gistId: '' }) {
        const signInBtn = $('cloud-sync-signin-btn');
        const syncBtn = $('cloud-sync-sync-btn');
        const signOutBtn = $('cloud-sync-signout-btn');

        if (signInBtn) signInBtn.disabled = false;
        if (syncBtn) syncBtn.disabled = !isSignedIn;
        if (signOutBtn) signOutBtn.disabled = !isSignedIn;

        const tokenInput = $('cloud-sync-token');
        const gistInput = $('cloud-sync-gist-id');

        if (gistInput && typeof state.gistId === 'string') gistInput.value = state.gistId;
        if (tokenInput && typeof state.token === 'string' && state.token) tokenInput.value = state.token;

        if (isSignedIn) {
            setStatus(`Signed in (${redactToken(state.token)}).`, 'info');
        } else {
            setStatus('Not signed in.', 'info');
        }
    }

    async function onSignIn() {
        const token = ($('cloud-sync-token')?.value || '').trim();
        const gistId = ($('cloud-sync-gist-id')?.value || '').trim();

        if (!token) {
            setStatus('Enter your GitHub token first.', 'error');
            return;
        }

        setStatus('Signing in…', 'info');
        await githubGetUser(token);
        await storageSet({ token, gistId });
        updateUiState(true, { token, gistId });
        setStatus('Signed in. Click Sync Now to sync.', 'success');
    }

    async function onSignOut() {
        await storageClear();
        updateUiState(false, { token: '', gistId: '' });
        const tokenInput = $('cloud-sync-token');
        if (tokenInput) tokenInput.value = '';
        setStatus('Signed out.', 'success');
    }

    function wire() {
        const signInBtn = $('cloud-sync-signin-btn');
        const syncBtn = $('cloud-sync-sync-btn');
        const signOutBtn = $('cloud-sync-signout-btn');

        if (!signInBtn || !syncBtn || !signOutBtn) return;
        if (!window.ProductivityData?.DataStore?.exportAllData) return;

        signInBtn.addEventListener('click', () => {
            onSignIn().catch(err => {
                console.error(err);
                setStatus(err.message || 'Sign in failed.', 'error');
            });
        });

        syncBtn.addEventListener('click', () => {
            doSyncNow().catch(err => {
                console.error(err);
                setStatus(err.message || 'Sync failed.', 'error');
            });
        });

        signOutBtn.addEventListener('click', () => {
            onSignOut().catch(err => {
                console.error(err);
                setStatus(err.message || 'Sign out failed.', 'error');
            });
        });

        storageGet()
            .then(state => {
                const signedIn = !!state.token;
                updateUiState(signedIn, state);
            })
            .catch(() => updateUiState(false, { token: '', gistId: '' }));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire);
    } else {
        wire();
    }
})();
