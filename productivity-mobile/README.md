# Productivity Hub Mobile

Expo React Native mobile client for Android/iOS.

## What You Can Test Right Now

- Email/password sign in with Firebase Auth
- Pull data from cloud snapshot (`syncSnapshots/{uid}`)
- Push data back to cloud snapshot
- Today tab that combines daily tasks, schedules, and challenges in one mobile-first view
- Create, complete, and delete tasks
- Create and update challenge progress
- Send a "today summary" notification and schedule a daily local reminder notification

## Install And Run On Samsung Android

1. Install **Expo Go** from Google Play.
2. On your computer, open a terminal in this folder:

```bash
cd productivity-mobile
npm install
npx expo start --lan
```

3. Scan the QR code with Expo Go.
4. Sign in with the same account used in desktop/extension Account Sync.

If LAN mode cannot connect because of local network restrictions, try:

```bash
npx expo start --tunnel
```

## Windows OneDrive Build Lock Workaround (Recommended)

If your project is inside OneDrive, Gradle may fail with "Unable to delete directory ..." during Android builds.

`npm run android:dev` now auto-detects OneDrive paths on Windows and automatically uses the local mirror workflow below.

Use the local runner command from this folder:

```bash
npm run android:dev:local
```

What this does:

- Mirrors your latest project files to `C:\dev\productivity-mobile-local`
- Runs `npm install` there
- Runs `npm run android:dev` there

Faster subsequent runs (skip install if dependencies did not change):

```bash
npm run android:dev:local:fast
```

## Sync Workflow

1. On desktop/extension: open Productivity Hub -> Settings -> Data Management -> Account Sync -> Sync Now.
2. On mobile: open **Sync** tab -> **Pull From Cloud**.
3. Make task/challenge changes on mobile.
4. Tap **Push To Cloud** to send updates.
5. Back on desktop/extension, click **Sync Now** to pull mobile changes.

## Notifications

- Open **Notifications** tab in mobile app.
- Review the preview text (daily summary generated from your current tasks/schedule/challenges).
- Set hour/minute.
- Tap **Schedule Reminder** for a daily Android reminder.
- Tap **Send today's summary now** to test immediately.
- In **Custom reminders by type**:
	- Toggle **Tasks**, **Schedules**, and **Challenges** independently.
	- Pick a lead time for each type (for example: `1h before`).
	- Tap **Apply custom reminders**.
	- Use **Clear** to remove all custom scheduled reminders.

This is local device notification scheduling from the app.

### Important (Android + Expo Go)

`expo-notifications` is limited in Expo Go on Android (SDK 53+). For reliable notifications, use a development build:

```bash
cd productivity-mobile
npm install
npm run android:dev
npm run start:dev
```

Then open the installed development client app on your phone (not Expo Go).

## Legacy Architecture Warning

This project is configured for React Native New Architecture:

- `app.json` -> `expo.newArchEnabled: true`
- `android/gradle.properties` -> `newArchEnabled=true`

If you still see a Legacy Architecture warning, rebuild the Android client so the installed app matches current config:

```bash
cd productivity-mobile
npm run android:dev
```

If `npm run android:dev` prints `No Android connected device found`, use one of these:

1. Physical phone (USB debugging)

```bash
adb devices
```

If your phone is not listed:
- Enable Developer Options and USB Debugging on the phone.
- Accept the RSA prompt on the phone when connected.
- Install the correct USB driver on Windows (Samsung USB driver if needed).

Then run:

```bash
npm run android:dev
npm run start:dev
```

2. No USB / no emulator fallback (build APK only)

```bash
npm run android:build
```

This builds a debug APK locally and does not require a connected device.

Then install the generated APK from:

`android/app/build/outputs/apk/debug/app-debug.apk`

After installing, run:

```bash
npm run start:dev
```

If Gradle says `SDK location not found`, ensure Android SDK exists and create `android/local.properties` with:

`sdk.dir=C:\\Users\\<your-user>\\AppData\\Local\\Android\\Sdk`

## Firebase Notes

- Uses the same Firebase project config as the existing Productivity Hub.
- Requires Email/Password auth enabled in Firebase Authentication.
- Firestore rules must allow users to read/write their own `syncSnapshots/{uid}` document.

