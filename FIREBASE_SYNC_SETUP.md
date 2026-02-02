# Firebase Account Sync Setup (Desktop + Extension)

This repo supports **Account Sync** using **Firebase Auth + Firestore**.

## 1) Firebase Console setup

1. Create (or open) your Firebase project.
2. **Authentication** → **Sign-in method**:
   - Enable **Email/Password** (recommended; works everywhere)
   - Enable **Google** (works in desktop; extension may require extra setup)
3. **Firestore Database** → **Create database**.

## 2) Firestore security rules (required)

In **Firestore** → **Rules**, use rules like:

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /syncSnapshots/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

This ensures each user can only read/write their own sync document.

## 3) Paste your Firebase Web config into the app

Firebase Console → **Project settings** → **Your apps** → **Web app** → copy the **config** object.

Paste it into both:
- [productivity/firebase-config.js](productivity/firebase-config.js)
- [productivity-desktop/renderer/firebase-config.js](productivity-desktop/renderer/firebase-config.js)

## 4) Use it

In the app go to **Settings → Data Management → Account Sync**:
- Sign in (Google or email/password)
- Click **Sync Now**

Do the same on desktop + extension and your data will merge (based on the merge checkbox).

## Note about Google sign-in in the extension

Email/password auth works reliably in extension pages.

Google sign-in in a Chrome/Edge extension requires **Chrome Identity OAuth** setup:

1. In Google Cloud Console (same project used by Firebase), go to **APIs & Services → Credentials**.
2. Create **OAuth client ID** → Application type **Chrome Extension**.
3. Extension ID: `fcicdfhaggemckbblfjghappdhcghghg`
4. Copy the generated **client ID** and paste it into the root [manifest.json](manifest.json) under `oauth2.client_id`.

If Google sign-in still fails in the extension, use **Email/Password** for now (desktop Google sign-in will still work).

### Edge note

Microsoft Edge does **not** support `chrome.identity.getAuthToken`. In Edge, the extension falls back to Firebase's popup-based Google sign-in; if that’s blocked in your environment, use **Email/Password**.
