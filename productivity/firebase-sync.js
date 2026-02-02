(function () {
    'use strict';

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
            throw new Error('Firebase is not configured. Open productivity/firebase-config.js and paste your Firebase web config.');
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
        const linkPasswordBtn = $('firebase-sync-link-password-btn');
        const signOutBtn = $('firebase-sync-signout-btn');

        // Profile card elements
        const profileCard = $('firebase-user-profile');
        const avatarEl = $('firebase-user-avatar');
        const nameEl = $('firebase-user-name');
        const emailEl = $('firebase-user-email');

        const signedIn = !!user;
        if (syncBtn) syncBtn.disabled = !signedIn;
        if (linkPasswordBtn) linkPasswordBtn.disabled = !signedIn;
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

        // Check if we're running in an extension context
        const isExtension = !!(window.chrome?.runtime?.id);
        const isEdge = typeof navigator !== 'undefined' && /Edg\//.test(navigator.userAgent || '');

        // For Chrome extensions: use chrome.identity.getAuthToken
        if (isExtension && !isEdge && window.chrome?.identity?.getAuthToken) {
            try {
                const token = await new Promise((resolve, reject) => {
                    chrome.identity.getAuthToken({ interactive: true }, (t) => {
                        const err = chrome.runtime?.lastError;
                        if (err) return reject(new Error(err.message || 'Google sign-in failed.'));
                        if (!t) return reject(new Error('Google sign-in did not return a token.'));
                        resolve(t);
                    });
                });

                const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
                await auth.signInWithCredential(credential);
                return;
            } catch (e) {
                console.error('chrome.identity.getAuthToken failed:', e);
                throw new Error('Google sign-in failed. Please ensure you are signed into Chrome and try again. Error: ' + e.message);
            }
        }

        // For Edge extensions: use launchWebAuthFlow
        if (isExtension && isEdge && window.chrome?.identity?.launchWebAuthFlow) {
            try {
                const redirectUri = chrome.identity.getRedirectURL();
                const cfg = window.FIREBASE_CONFIG;

                // Build the OAuth2 authorization URL
                const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
                // Use Firebase project's Web client ID for Edge (must match Firebase project)
                const edgeClientId = '660869268366-3l6rjdn7k9a8a95uld4pf1qrjpvcks9r.apps.googleusercontent.com';
                authUrl.searchParams.set('client_id', edgeClientId);
                authUrl.searchParams.set('redirect_uri', redirectUri);
                authUrl.searchParams.set('response_type', 'token');
                authUrl.searchParams.set('scope', 'openid email profile');
                authUrl.searchParams.set('prompt', 'consent');

                const responseUrl = await new Promise((resolve, reject) => {
                    chrome.identity.launchWebAuthFlow(
                        { url: authUrl.toString(), interactive: true },
                        (response) => {
                            const err = chrome.runtime?.lastError;
                            if (err) return reject(new Error(err.message || 'Google sign-in failed.'));
                            if (!response) return reject(new Error('Google sign-in was cancelled.'));
                            resolve(response);
                        }
                    );
                });

                // Extract access token from response URL
                const urlParams = new URL(responseUrl.replace('#', '?')).searchParams;
                const accessToken = urlParams.get('access_token');

                if (!accessToken) {
                    throw new Error('No access token received from Google.');
                }

                const credential = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
                await auth.signInWithCredential(credential);
                return;
            } catch (e) {
                console.error('launchWebAuthFlow failed:', e);
                throw new Error('Google sign-in failed on Edge. Error: ' + e.message);
            }
        }

        // For non-extension contexts (e.g., running as a standalone web page)
        if (!isExtension) {
            const provider = new firebase.auth.GoogleAuthProvider();
            await auth.signInWithPopup(provider);
            return;
        }

        // Fallback error for unsupported extension environments
        throw new Error('Google sign-in is not supported in this browser. Please use email/password authentication, or try Chrome browser.');
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

    // Link email/password to an existing account (e.g., signed in via Google)
    async function linkPassword() {
        const { auth } = ensureFirebaseInitialized();
        const user = auth.currentUser;
        if (!user) throw new Error('Sign in first (e.g., with Google) before linking a password.');

        const { password } = getEmailPassword();
        if (!password) throw new Error('Enter a password to link.');

        // Create email/password credential using the user's current email
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
        await user.linkWithCredential(credential);
    }

    async function signOut() {
        const { auth } = ensureFirebaseInitialized();
        await auth.signOut();

        // Best-effort: clear cached Chrome Identity token so next sign-in is clean.
        if (window.chrome?.identity?.getAuthToken && window.chrome?.identity?.removeCachedAuthToken) {
            try {
                const token = await new Promise((resolve) => {
                    chrome.identity.getAuthToken({ interactive: false }, (t) => resolve(t || ''));
                });
                if (token) {
                    await new Promise((resolve) => {
                        chrome.identity.removeCachedAuthToken({ token }, () => resolve());
                    });
                }
            } catch (_) {
                // ignore
            }
        }
    }

    async function syncNow() {
        const { auth, db } = ensureFirebaseInitialized();
        const user = auth.currentUser;
        if (!user) throw new Error('Sign in first.');
        if (!window.ProductivityData?.DataStore?.exportAllData || !window.ProductivityData?.DataStore?.importAllData) {
            throw new Error('DataStore not available.');
        }

        const merge = getMergeOption();
        const docRef = db.collection('syncSnapshots').doc(user.uid);

        let didImport = false;

        setStatus('Syncing… downloading cloud data', 'info');
        const snap = await docRef.get();
        const remotePayload = snap.exists ? snap.data()?.payload : null;

        if (typeof remotePayload === 'string' && remotePayload.trim()) {
            const result = await window.ProductivityData.DataStore.importAllData(remotePayload, { merge });
            if (!result?.success) throw new Error(result?.error || 'Import failed');
            didImport = true;
        }

        setStatus('Syncing… uploading local data', 'info');
        const localPayload = await window.ProductivityData.DataStore.exportAllData();

        await docRef.set({
            payload: localPayload,
            schemaVersion: 2,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'client'
        }, { merge: true });

        if (didImport) {
            setStatus('Synced successfully. Reloading to show updated data…', 'success');
            setTimeout(() => {
                try { window.location.reload(); } catch (_) { /* ignore */ }
            }, 700);
        } else {
            setStatus('Synced successfully.', 'success');
        }
    }

    function wire() {
        const googleBtn = $('firebase-sync-google-btn');
        const emailSignInBtn = $('firebase-sync-email-signin-btn');
        const signupBtn = $('firebase-sync-signup-btn');
        const syncBtn = $('firebase-sync-sync-btn');
        const linkPasswordBtn = $('firebase-sync-link-password-btn');
        const signOutBtn = $('firebase-sync-signout-btn');

        if (!googleBtn || !emailSignInBtn || !signupBtn || !syncBtn || !signOutBtn) return;

        try {
            const { auth } = ensureFirebaseInitialized();
            auth.onAuthStateChanged((user) => {
                updateUiState(user);
            });
        } catch (e) {
            console.warn(e);
            setStatus(e.message || 'Firebase not ready.', 'error');
            updateUiState(null);
        }

        googleBtn.addEventListener('click', () => {
            setStatus('Signing in with Google…', 'info');
            signInWithGoogle()
                .then(() => setStatus('Signed in. Click Sync Now.', 'success'))
                .catch((err) => {
                    console.error(err);
                    setStatus(err.message || 'Google sign-in failed.', 'error');
                });
        });

        emailSignInBtn.addEventListener('click', () => {
            setStatus('Signing in…', 'info');
            signInWithEmail()
                .then(() => setStatus('Signed in. Click Sync Now.', 'success'))
                .catch((err) => {
                    console.error(err);
                    setStatus(err.message || 'Email sign-in failed.', 'error');
                });
        });

        signupBtn.addEventListener('click', () => {
            setStatus('Creating account…', 'info');
            createAccount()
                .then(() => setStatus('Account created. Click Sync Now.', 'success'))
                .catch((err) => {
                    console.error(err);
                    setStatus(err.message || 'Create account failed.', 'error');
                });
        });

        syncBtn.addEventListener('click', () => {
            syncNow().catch((err) => {
                console.error(err);
                let message = err?.message || 'Sync failed.';
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

        if (linkPasswordBtn) {
            linkPasswordBtn.addEventListener('click', () => {
                setStatus('Linking password…', 'info');
                linkPassword()
                    .then(() => setStatus('Password linked! You can now sign in with email/password on the desktop app.', 'success'))
                    .catch((err) => {
                        console.error(err);
                        setStatus(err.message || 'Link password failed.', 'error');
                    });
            });
        }

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
