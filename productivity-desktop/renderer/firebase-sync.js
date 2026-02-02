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

    async function syncNow() {
        const { auth, db } = ensureFirebaseInitialized();
        const user = auth.currentUser;
        if (!user) throw new Error('Sign in first.');
        if (!window.ProductivityData?.DataStore?.exportAllData || !window.ProductivityData?.DataStore?.importAllData) {
            throw new Error('DataStore not available.');
        }

        const merge = getMergeOption();
        const docRef = db.collection('syncSnapshots').doc(user.uid);

        setStatus('Syncing… downloading cloud data', 'info');
        const snap = await docRef.get();
        const remotePayload = snap.exists ? snap.data()?.payload : null;

        if (typeof remotePayload === 'string' && remotePayload.trim()) {
            const result = await window.ProductivityData.DataStore.importAllData(remotePayload, { merge });
            if (!result?.success) throw new Error(result?.error || 'Import failed');
        }

        setStatus('Syncing… uploading local data', 'info');
        const localPayload = await window.ProductivityData.DataStore.exportAllData();

        await docRef.set({
            payload: localPayload,
            schemaVersion: 2,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'desktop'
        }, { merge: true });

        setStatus('Synced successfully.', 'success');
    }

    function wire() {
        const googleBtn = $('firebase-sync-google-btn');
        const emailSignInBtn = $('firebase-sync-email-signin-btn');
        const signupBtn = $('firebase-sync-signup-btn');
        const syncBtn = $('firebase-sync-sync-btn');
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
                // Provide more helpful error messages
                let message = err.message || 'Sync failed.';
                if (err.code === 'permission-denied' || message.includes('permission')) {
                    message = 'Permission denied. Please check that:\n1. You are signed in\n2. Firestore security rules are configured correctly\n3. Your account has write access';
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
