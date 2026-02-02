// Firebase config for cloud sync.
// You MUST paste your web app config from Firebase Console:
// Project Settings -> Your apps -> Web app -> Firebase SDK snippet (config)
//
// Example:
// window.FIREBASE_CONFIG = {
//   apiKey: "...",
//   authDomain: "....firebaseapp.com",
//   projectId: "...",
//   storageBucket: "...",
//   messagingSenderId: "...",
//   appId: "..."
// };

// NOTE: This repo does not ship with a working Firebase project.
// Paste YOUR Firebase Web config below (Firebase Console -> Project settings -> Your apps -> Web app).
// If you see permission errors, ensure your Firestore rules allow the signed-in user to write.

window.FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
  apiKey: "__FILL_ME__",
  authDomain: "__FILL_ME__",
  projectId: "__FILL_ME__",
  storageBucket: "__FILL_ME__",
  messagingSenderId: "__FILL_ME__",
  appId: "__FILL_ME__",
  measurementId: "__OPTIONAL__"
};
