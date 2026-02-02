(function () {
    'use strict';

    const CLOUD_SYNC_KEY = 'productivity_cloud_sync';
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

        setStatus('Syncing… downloading cloud data', 'info');

        // 1) Download from cloud (if exists)
        let remoteJsonString = null;
        if (gistId) {
            const gist = await githubGetGist(token, gistId);
            if (gist) {
                remoteJsonString = extractSyncFileFromGist(gist);
            }
        }

        if (remoteJsonString) {
            const result = await window.ProductivityData.DataStore.importAllData(remoteJsonString, { merge });
            if (!result?.success) {
                throw new Error(result?.error || 'Import failed');
            }
        }

        // 2) Upload local (post-merge)
        setStatus('Syncing… uploading local data', 'info');
        const localJsonString = await window.ProductivityData.DataStore.exportAllData();

        let gistJson;
        if (!gistId) {
            gistJson = await githubCreateGist(token, localJsonString);
            gistId = gistJson.id;
        } else {
            gistJson = await githubUpdateGist(token, gistId, localJsonString);
        }

        await storageSet({ token, gistId });
        if (gistInput) gistInput.value = gistId;

        setStatus(`Synced successfully. Gist: ${gistId}`, 'success');
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
