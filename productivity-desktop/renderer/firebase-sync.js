(function () {
    'use strict';

    const FIREBASE_SYNC_STATE_KEY = 'productivity_firebase_sync_state_v2';
    const AUTO_SYNC_MIN_INTERVAL_MS = 5000;
    const AUTO_SYNC_POLL_INTERVAL_MS = 20000;
    const AUTO_SYNC_MUTE_WINDOW_MS = 3000;
    const SYNC_RELEVANT_STORAGE_KEYS = new Set([
        'tasks',
        'taskLists',
        'scheduleSchool',
        'schedulePersonal',
        'goals',
        'challenges',
        'focusSessions',
        'focusState',
        'dailyStats',
        'streaks',
        'achievements',
        'settings',
        'revisions',
        'blockedSites',
        'blockedAttempts',
        'idleRecords',
        'idleCategories',
        'websiteTimeLimits',
        'websiteDailyUsage',
        'importedCalendarsMeta'
    ]);

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

    function hasRelevantDataStorageChange(changes) {
        if (!changes || typeof changes !== 'object') return false;
        return Object.keys(changes).some((key) => SYNC_RELEVANT_STORAGE_KEYS.has(key));
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

    function getRemoteVersion(remoteData) {
        if (!remoteData || typeof remoteData !== 'object') return 0;

        const explicitMs = Number(remoteData.updatedAtMs);
        if (Number.isFinite(explicitMs) && explicitMs > 0) {
            return Math.floor(explicitMs);
        }

        const ts = remoteData.updatedAt;
        if (ts && typeof ts.toMillis === 'function') {
            const millis = Number(ts.toMillis());
            if (Number.isFinite(millis) && millis > 0) {
                return Math.floor(millis);
            }
        }

        const seconds = Number(ts?.seconds);
        if (Number.isFinite(seconds) && seconds > 0) {
            return Math.floor(seconds * 1000);
        }

        return 0;
    }

    function hasSyncState(state) {
        if (!state || typeof state !== 'object') return false;
        if (typeof state.lastPayloadChecksum === 'string' && state.lastPayloadChecksum) return true;
        if (typeof state.lastRemoteChecksum === 'string' && state.lastRemoteChecksum) return true;
        const remoteVersion = Number(state.lastRemoteVersion || 0);
        return Number.isFinite(remoteVersion) && remoteVersion > 0;
    }

    async function readSyncState(uid) {
        if (!uid || !window.ProductivityData?.DataStore?.get) return {};

        const allState = await window.ProductivityData.DataStore.get(FIREBASE_SYNC_STATE_KEY, {});
        if (!allState || typeof allState !== 'object' || Array.isArray(allState)) {
            return {};
        }

        const stateForUser = allState[uid];
        return stateForUser && typeof stateForUser === 'object' ? stateForUser : {};
    }

    async function writeSyncState(uid, statePatch) {
        if (!uid || !window.ProductivityData?.DataStore?.get || !window.ProductivityData?.DataStore?.set) return;

        const allState = await window.ProductivityData.DataStore.get(FIREBASE_SYNC_STATE_KEY, {});
        const safeAllState = allState && typeof allState === 'object' && !Array.isArray(allState)
            ? allState
            : {};

        safeAllState[uid] = {
            ...(safeAllState[uid] && typeof safeAllState[uid] === 'object' ? safeAllState[uid] : {}),
            ...statePatch
        };

        await window.ProductivityData.DataStore.set(FIREBASE_SYNC_STATE_KEY, safeAllState);
    }

    async function uploadPayload(docRef, payload, updatedBy) {
        const updatedAtMs = Date.now();
        const payloadChecksum = computePayloadChecksum(payload);

        await docRef.set({
            payload,
            payloadChecksum,
            schemaVersion: 2,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAtMs,
            updatedBy
        }, { merge: true });

        return { updatedAtMs, payloadChecksum };
    }

    function getEmailPassword() {
        const email = ($('firebase-sync-email')?.value || '').trim();
        const password = ($('firebase-sync-password')?.value || '').trim();
        return { email, password };
    }

    function ensureFirebaseInitialized() {
        if (typeof window.firebase === 'undefined') {
            throw new Error('Firebase SDK not loaded.');
        }
        const cfg = window.FIREBASE_CONFIG;
        if (!cfg || !cfg.apiKey || cfg.apiKey === '__FILL_ME__') {
            throw new Error('Firebase is not configured. Open productivity-desktop/renderer/firebase-config.js and paste your Firebase web config.');
        }
        if (!firebase.apps || firebase.apps.length === 0) {
            firebase.initializeApp(cfg);
        }
        return {
            auth: firebase.auth(),
            db: firebase.firestore()
        };
    }

    function updateUiState(user) {
        const userEl = $('firebase-sync-user');
        const syncBtn = $('firebase-sync-sync-btn');
        const signOutBtn = $('firebase-sync-signout-btn');

        // Profile card elements
        const profileCard = $('firebase-user-profile');
        const avatarEl = $('firebase-user-avatar');
        const nameEl = $('firebase-user-name');
        const emailEl = $('firebase-user-email');

        const signedIn = !!user;
        if (syncBtn) syncBtn.disabled = !signedIn;
        if (signOutBtn) signOutBtn.disabled = !signedIn;

        if (userEl) {
            if (!signedIn) {
                userEl.textContent = 'Not signed in.';
                userEl.dataset.state = 'signed-out';
            } else {
                // Hide the simple text status when profile card is shown
                userEl.textContent = '';
                userEl.dataset.state = 'signed-in';
            }
        }

        // Update profile card
        if (profileCard) {
            if (!signedIn) {
                profileCard.classList.add('hidden');
            } else {
                profileCard.classList.remove('hidden');

                // Set avatar (use default if no photo)
                if (avatarEl) {
                    if (user.photoURL) {
                        avatarEl.src = user.photoURL;
                        avatarEl.alt = user.displayName || 'Profile';
                    } else {
                        // Default avatar using first letter of name/email
                        const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
                        avatarEl.src = `https://ui-avatars.com/api/?name=${initial}&background=6366f1&color=fff&size=96`;
                        avatarEl.alt = 'Profile';
                    }
                }

                // Set name and email
                if (nameEl) {
                    nameEl.textContent = user.displayName || 'User';
                }
                if (emailEl) {
                    emailEl.textContent = user.email || '';
                }
            }
        }
    }

    async function signInWithGoogle() {
        const { auth } = ensureFirebaseInitialized();

        // Use Electron's IPC-based OAuth flow
        if (window.electronAPI && window.electronAPI.googleOAuth) {
            // Use Firebase project's Web client ID
            const clientId = '660869268366-3l6rjdn7k9a8a95uld4pf1qrjpvcks9r.apps.googleusercontent.com';

            const result = await window.electronAPI.googleOAuth(clientId);

            if (!result.success) {
                throw new Error(result.error || 'Google sign-in was cancelled.');
            }

            // Use the access token to sign in with Firebase
            const credential = firebase.auth.GoogleAuthProvider.credential(null, result.accessToken);
            await auth.signInWithCredential(credential);
            return;
        }

        // Fallback for non-Electron environments (web)
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
    }

    async function signInWithEmail() {
        const { auth } = ensureFirebaseInitialized();
        const { email, password } = getEmailPassword();
        if (!email || !password) throw new Error('Enter email + password.');
        await auth.signInWithEmailAndPassword(email, password);
    }

    async function createAccount() {
        const { auth } = ensureFirebaseInitialized();
        const { email, password } = getEmailPassword();
        if (!email || !password) throw new Error('Enter email + password.');
        await auth.createUserWithEmailAndPassword(email, password);
    }

    async function signOut() {
        const { auth } = ensureFirebaseInitialized();
        await auth.signOut();
    }

    async function syncNow(options = {}) {
        const silent = options.silent === true;
        const reloadOnImport = options.reloadOnImport !== false;
        const { auth, db } = ensureFirebaseInitialized();
        const user = auth.currentUser;
        if (!user) throw new Error('Sign in first.');
        if (!window.ProductivityData?.DataStore?.exportAllData || !window.ProductivityData?.DataStore?.importAllData) {
            throw new Error('DataStore not available.');
        }

        // Strict replace mode prevents deleted items from being resurrected by merge semantics.
        const merge = false;
        const docRef = db.collection('syncSnapshots').doc(user.uid);
        const previousState = await readSyncState(user.uid);
        const hasPriorState = hasSyncState(previousState);

        let didImport = false;
        let didUpload = false;

        if (!silent) setStatus('Syncing… downloading cloud data', 'info');
        const snap = await docRef.get();
        const remoteData = snap.exists ? (snap.data() || {}) : {};
        const remotePayload = typeof remoteData.payload === 'string' ? remoteData.payload : '';
        const hasRemotePayload = !!remotePayload.trim();
        const remoteChecksum = hasRemotePayload
            ? (typeof remoteData.payloadChecksum === 'string' && remoteData.payloadChecksum
                ? remoteData.payloadChecksum
                : computePayloadChecksum(remotePayload))
            : '';
        const remoteVersion = hasRemotePayload ? getRemoteVersion(remoteData) : 0;

        let localPayload = await window.ProductivityData.DataStore.exportAllData();
        let localChecksum = computePayloadChecksum(localPayload);

        const localChangedSinceLastSync = !hasPriorState || localChecksum !== previousState.lastPayloadChecksum;
        const remoteChangedSinceLastSync = hasRemotePayload && (
            !hasPriorState
            || remoteChecksum !== previousState.lastRemoteChecksum
            || remoteVersion > Number(previousState.lastRemoteVersion || 0)
        );
        const staleStateMismatch = hasRemotePayload
            && !localChangedSinceLastSync
            && !remoteChangedSinceLastSync
            && localChecksum !== remoteChecksum;

        let latestRemoteChecksum = remoteChecksum;
        let latestRemoteVersion = remoteVersion;

        const importRemote = async () => {
            const result = await window.ProductivityData.DataStore.importAllData(remotePayload, { merge });
            if (!result?.success) throw new Error(result?.error || 'Import failed');
            didImport = true;
            localPayload = await window.ProductivityData.DataStore.exportAllData();
            localChecksum = computePayloadChecksum(localPayload);
        };

        if (staleStateMismatch) {
            if (!silent) setStatus('Syncing… repairing stale local snapshot', 'info');
            await importRemote();
        } else if (hasRemotePayload && !hasPriorState) {
            if (!silent) setStatus('Syncing… initializing from cloud snapshot', 'info');
            await importRemote();

            if (localChecksum !== remoteChecksum) {
                if (!silent) setStatus('Syncing… uploading merged local data', 'info');
                const uploadMeta = await uploadPayload(docRef, localPayload, 'desktop');
                latestRemoteChecksum = uploadMeta.payloadChecksum;
                latestRemoteVersion = uploadMeta.updatedAtMs;
                didUpload = true;
            }
        } else if (hasRemotePayload && remoteChangedSinceLastSync && !localChangedSinceLastSync) {
            if (!silent) setStatus('Syncing… applying cloud changes', 'info');
            await importRemote();
        } else if (hasRemotePayload && remoteChangedSinceLastSync && localChangedSinceLastSync) {
            if (!silent) setStatus('Syncing… conflict detected, keeping local changes', 'info');
            const uploadMeta = await uploadPayload(docRef, localPayload, 'desktop');
            latestRemoteChecksum = uploadMeta.payloadChecksum;
            latestRemoteVersion = uploadMeta.updatedAtMs;
            didUpload = true;
        } else if (!hasRemotePayload || localChangedSinceLastSync) {
            if (!silent) setStatus('Syncing… uploading local data', 'info');
            const uploadMeta = await uploadPayload(docRef, localPayload, 'desktop');
            latestRemoteChecksum = uploadMeta.payloadChecksum;
            latestRemoteVersion = uploadMeta.updatedAtMs;
            didUpload = true;
        }

        await writeSyncState(user.uid, {
            lastPayloadChecksum: localChecksum,
            lastRemoteChecksum: latestRemoteChecksum || localChecksum,
            lastRemoteVersion: latestRemoteVersion || Date.now(),
            lastSyncAt: new Date().toISOString()
        });

        autoSyncMutedUntil = Date.now() + AUTO_SYNC_MUTE_WINDOW_MS;

        if (didImport) {
            if (!silent) setStatus('Synced successfully. Reloading to show updated data…', 'success');
            if (reloadOnImport) {
                setTimeout(() => {
                    try { window.location.reload(); } catch (_) { /* ignore */ }
                }, 700);
            } else {
                // Silent background import: notify the app to refresh in-memory state
                // without a full page reload (avoids disrupting active editing).
                try {
                    window.dispatchEvent(new CustomEvent('productivity:data-synced', {
                        detail: { source: 'cloud', silent: true }
                    }));
                } catch (_) { /* ignore */ }
            }
        } else if (didUpload) {
            if (!silent) setStatus('Synced successfully.', 'success');
        } else {
            if (!silent) setStatus('Already up to date.', 'success');
        }
    }

    let autoSyncTimer = null;
    let autoSyncInFlight = false;
    let autoSyncPollTimer = null;
    let remoteSnapshotUnsubscribe = null;
    let autoSyncMutedUntil = 0;
    let lastAutoSyncAt = 0;

    function scheduleAutoSync() {
        if (Date.now() < autoSyncMutedUntil) return;

        const now = Date.now();
        const waitMs = Math.max(0, AUTO_SYNC_MIN_INTERVAL_MS - (now - lastAutoSyncAt));

        if (autoSyncTimer) {
            clearTimeout(autoSyncTimer);
        }

        autoSyncTimer = setTimeout(async () => {
            autoSyncTimer = null;
            if (autoSyncInFlight) return;

            autoSyncInFlight = true;
            try {
                await syncNow({ silent: true, reloadOnImport: false });
                lastAutoSyncAt = Date.now();
            } catch (_) {
                // Keep background auto-sync best-effort.
            } finally {
                autoSyncInFlight = false;
            }
        }, waitMs);
    }

    function startAutoSyncPolling() {
        if (autoSyncPollTimer) {
            clearInterval(autoSyncPollTimer);
        }

        autoSyncPollTimer = setInterval(() => {
            scheduleAutoSync();
        }, AUTO_SYNC_POLL_INTERVAL_MS);

        scheduleAutoSync();
    }

    function stopAutoSyncPolling() {
        if (autoSyncTimer) {
            clearTimeout(autoSyncTimer);
            autoSyncTimer = null;
        }
        if (autoSyncPollTimer) {
            clearInterval(autoSyncPollTimer);
            autoSyncPollTimer = null;
        }
    }

    function startRemoteSnapshotListener(db, user) {
        if (remoteSnapshotUnsubscribe) {
            remoteSnapshotUnsubscribe();
            remoteSnapshotUnsubscribe = null;
        }

        if (!db || !user?.uid) return;

        const docRef = db.collection('syncSnapshots').doc(user.uid);
        remoteSnapshotUnsubscribe = docRef.onSnapshot(
            () => {
                if (Date.now() < autoSyncMutedUntil) return;
                scheduleAutoSync();
            },
            () => {
                // Keep live-listener best-effort.
            }
        );
    }

    function stopRemoteSnapshotListener() {
        if (!remoteSnapshotUnsubscribe) return;
        remoteSnapshotUnsubscribe();
        remoteSnapshotUnsubscribe = null;
    }

    function wire() {
        const googleBtn = $('firebase-sync-google-btn');
        const emailSignInBtn = $('firebase-sync-email-signin-btn');
        const signupBtn = $('firebase-sync-signup-btn');
        const syncBtn = $('firebase-sync-sync-btn');
        const signOutBtn = $('firebase-sync-signout-btn');

        if (!googleBtn || !emailSignInBtn || !signupBtn || !syncBtn || !signOutBtn) return;

        if (window.chrome?.storage?.onChanged?.addListener) {
            chrome.storage.onChanged.addListener((changes, namespace) => {
                if (namespace !== 'local') return;
                if (Object.prototype.hasOwnProperty.call(changes, FIREBASE_SYNC_STATE_KEY)) return;
                if (!hasRelevantDataStorageChange(changes)) return;
                scheduleAutoSync();
            });
        }

        try {
            const { auth, db } = ensureFirebaseInitialized();
            auth.onAuthStateChanged((user) => {
                updateUiState(user);
                if (user) {
                    startAutoSyncPolling();
                    startRemoteSnapshotListener(db, user);
                } else {
                    stopAutoSyncPolling();
                    stopRemoteSnapshotListener();
                }
            });
        } catch (e) {
            console.warn(e);
            setStatus(e.message || 'Firebase not ready.', 'error');
            updateUiState(null);
            stopAutoSyncPolling();
            stopRemoteSnapshotListener();
        }

        googleBtn.addEventListener('click', () => {
            setStatus('Signing in with Google…', 'info');
            signInWithGoogle()
                .then(() => {
                    setStatus('Signed in. Syncing…', 'info');
                    syncNow({ silent: false, reloadOnImport: true }).catch(() => {});
                })
                .catch((err) => {
                    console.error(err);
                    setStatus(err.message || 'Google sign-in failed.', 'error');
                });
        });

        emailSignInBtn.addEventListener('click', () => {
            setStatus('Signing in…', 'info');
            signInWithEmail()
                .then(() => {
                    setStatus('Signed in. Syncing…', 'info');
                    syncNow({ silent: false, reloadOnImport: true }).catch(() => {});
                })
                .catch((err) => {
                    console.error(err);
                    setStatus(err.message || 'Email sign-in failed.', 'error');
                });
        });

        signupBtn.addEventListener('click', () => {
            setStatus('Creating account…', 'info');
            createAccount()
                .then(() => {
                    setStatus('Account created. Syncing…', 'info');
                    syncNow({ silent: false, reloadOnImport: true }).catch(() => {});
                })
                .catch((err) => {
                    console.error(err);
                    setStatus(err.message || 'Create account failed.', 'error');
                });
        });

        syncBtn.addEventListener('click', () => {
            syncNow().catch((err) => {
                console.error(err);
                // Provide more helpful error messages
                let message = err.message || 'Sync failed.';
                const errCode = err?.code || '';
                if (errCode === 'unauthenticated') {
                    message = 'You are not signed in. Sign in first, then click Sync Now.';
                } else if (errCode === 'permission-denied' || /permission/i.test(message)) {
                    let debug = '';
                    try {
                        const { auth } = ensureFirebaseInitialized();
                        const projectId = window.FIREBASE_CONFIG?.projectId || '(unknown project)';
                        const user = auth.currentUser;
                        const who = user?.email || user?.uid || 'not signed in';
                        debug = `\n\nDebug:\n- Project: ${projectId}\n- User: ${who}\n- Path: syncSnapshots/${user?.uid || '(no uid)'}`;
                    } catch (_) {
                        // ignore
                    }

                    message =
                        'Permission denied by Firestore rules.\n\n' +
                        'Fix checklist:\n' +
                        '1) Confirm you are signed in\n' +
                        '2) In Firebase Console -> Firestore -> Rules, allow users to read/write their own doc\n' +
                        '3) Confirm you pasted YOUR Firebase config (not placeholders)\n\n' +
                        'Expected rules (example):\n' +
                        'rules_version = \'2\';\n' +
                        'service cloud.firestore {\n' +
                        '  match /databases/{database}/documents {\n' +
                        '    match /syncSnapshots/{uid} {\n' +
                        '      allow read, write: if request.auth != null && request.auth.uid == uid;\n' +
                        '    }\n' +
                        '  }\n' +
                        '}\n' +
                        debug;
                }
                setStatus(message, 'error');
            });
        });

        signOutBtn.addEventListener('click', () => {
            signOut().catch((err) => {
                console.error(err);
                setStatus(err.message || 'Sign out failed.', 'error');
            });
        });

        updateUiState(null);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire);
    } else {
        wire();
    }
})();
