# Push notifications setup (Android development build)

Closed-app alerts take this route: **backend → Expo Push Service → Firebase Cloud Messaging (FCM) → your phone**. Expo Go can't receive pushes (since SDK 53), so from now on you use a **development build**: your own installable APK of this app that still loads JavaScript live from your laptop, like Expo Go did.

You do this setup once. After that, you only rebuild when native code or config changes (new native packages, `app.config.ts` plugins, `google-services.json`). Normal code changes reload instantly as before.

> **This is only for push notifications.** SMS alerts ([setup-sms.md](setup-sms.md)) are sent by the backend on your laptop, so they work with Expo Go too. You don't need a development build for them.

What you need:

- A free **Expo account**: <https://expo.dev/signup>
- A **Google account** for Firebase.
- About 30–45 min. Most of that is waiting for the cloud build.
- **Internet on the laptop** while the backend runs (it sends pushes through Expo's servers).

All commands are for **PowerShell**, run from the `mobile` folder unless a step says otherwise:

```powershell
cd C:\Users\RIO\Desktop\smart-greenhouse\mobile
```

`cd` ("change directory") moves the terminal into the app folder, so the commands below act on the app.

---

## 1. Install EAS CLI and log in

EAS ("Expo Application Services") builds the APK in Expo's cloud, so you don't need Android Studio.

```powershell
npm install -g eas-cli
```

- `npm install` downloads a package.
- `-g` (global) installs it for your whole user account, not only this project, so the `eas` command works in any folder.

```powershell
eas --version
```

This prints the installed version (27.x or newer). It just confirms the install worked.

> If PowerShell says *"running scripts is disabled on this system"*, either run `eas.cmd` instead of `eas`, or put `npx eas-cli@latest` in front of every command (for example `npx eas-cli@latest login`). `npx` downloads and runs the tool without the global install.

```powershell
eas login
```

This asks for your Expo username/e-mail and password and remembers the session on this laptop.

```powershell
eas whoami
```

This prints the account you're logged in as. Check it's the right one.

## 2. Create the EAS project (`eas init`)

```powershell
eas init
```

- This creates a project called `smart-greenhouse` on expo.dev under your account and gives it a **project ID** (a UUID like `1a2b3c4d-…`).
- The push token is tied to this ID.
- Answer **Yes** if it asks to create the project.

Our config is `app.config.ts` (TypeScript), which `eas init` can't edit by itself. It prints a message like *"add `extra.eas.projectId` … to your app config"* with the ID. Paste that ID into `mobile/app.config.ts`:

```ts
const EAS_PROJECT_ID: string | undefined = '1a2b3c4d-....'; // your ID from eas init
```

The ID is not secret; commit it. If you missed it, find it on <https://expo.dev> → your project → **Project ID**.

Check that the config picks it up:

```powershell
npx expo config --type public | Select-String projectId
```

- `npx expo config` prints the final app configuration Expo will use.
- `Select-String` filters the output for the line containing `projectId`.
- You should see your ID.

### The `eas.json` build profiles (already in the repo)

`mobile/eas.json` defines how EAS builds. The `development` profile is the one you use:

```json
"development": {
  "developmentClient": true,
  "distribution": "internal",
  "android": { "buildType": "apk" }
}
```

| Setting | Meaning |
|---|---|
| `developmentClient: true` | Includes `expo-dev-client`: the app opens a launcher and loads JS from `npx expo start` on your laptop (like Expo Go, but it's your app) |
| `distribution: "internal"` | For your own devices, not the Play Store. EAS gives you a download link |
| `buildType: "apk"` | An `.apk` you can install directly. The default `.aab` only works through the Play Store |

`preview` builds a standalone APK without the dev launcher, for later. `production` is for the Play Store; not used now.

## 3. Firebase project and Android app

FCM is Google's push delivery service for Android. Expo Push Service hands each notification to FCM, and FCM delivers it to the phone.

1. Open <https://console.firebase.google.com> → **Create a project** → name it, e.g. `smart-greenhouse` → you can turn **Google Analytics off** → **Create project**.
2. On the project home page, click the **Android** icon (**Add app**).
   - **Android package name:** `com.riopana.greenhouse`. It must match `android.package` in `app.config.ts` exactly.
   - App nickname: optional (e.g. `ETanim`). SHA-1: leave empty.
   - Click **Register app**.
3. **Download `google-services.json`** and save it as `mobile/google-services.json`, next to `app.config.ts`.
   - `app.config.ts` already points to this path (`android.googleServicesFile`).
   - It identifies your Firebase project to the app. It is **not a secret**: commit it. EAS Build only uploads files that git doesn't ignore.
4. Skip the remaining "Add Firebase SDK" steps (Next → Next → Continue to console). The Expo packages already handle that.

## 4. FCM V1 service account key → EAS

The *service account key* lets Expo's servers send through **your** Firebase project. This one **is a secret**: never commit it.

1. In the Firebase console: **⚙ Project settings** → **Service accounts** tab → **Generate new private key** → **Generate key**. A `.json` file downloads.
2. Move it **outside the project**, e.g. to `C:\Users\RIO\keys\greenhouse-fcm.json`. The `.gitignore` also blocks `*firebase-adminsdk*.json`, just in case.
3. Upload it to EAS:

```powershell
eas credentials -p android
```

- This opens an interactive menu for the app's Android credentials. `-p android` (platform) skips the iOS/Android question.
- Choose:
  1. **Which build profile?** → `development`. The key belongs to the app (`com.riopana.greenhouse`), so it's shared by all profiles.
  2. **Google Service Account**
  3. **Manage your Google Service Account Key for Push Notifications (FCM V1)**
  4. **Set up a Google Service Account Key for Push Notifications (FCM V1)** → **Upload a new service account key**
  5. Enter the path to the file, e.g. `C:\Users\RIO\keys\greenhouse-fcm.json`.
- Exit the menu. On <https://expo.dev> → project → **Credentials** → Android → `com.riopana.greenhouse`, you should now see an *FCM V1 service account key*.

## 5. Build and install the development APK

Check before building: `EAS_PROJECT_ID` is set (step 2), `google-services.json` is in `mobile/` (step 3), and the FCM key is uploaded (step 4). The first two are baked into the build.

```powershell
eas build -p android --profile development
```

- Uploads the `mobile` project to Expo and builds the APK in the cloud.
- `-p android` builds for Android only. `--profile development` uses the profile from `eas.json`.
- On the first build it asks **"Generate a new Android Keystore?"** → **Yes**. EAS creates and stores the signing key; Android requires every APK to be signed.
- The free tier may queue for a while. The build itself takes ~10–20 min. You can close the terminal: the build continues, and the link is also on expo.dev → **Builds**.
- At the end it prints a **URL and a QR code** for the APK.

Install on the phone:

1. Open the URL on the phone, or scan the QR code with the camera → **Install** / download the `.apk`.
2. Android asks to allow installs from this source (Chrome/Files) → **Settings** → enable **Allow from this source** → back → **Install**.
3. Play Protect may warn about an unknown app → **More details** → **Install anyway**. That's normal for apps you build yourself.

The new app is called **ETanim** and has its own icon. You can keep Expo Go installed; just don't use it for this project anymore.

## 6. Run the app with the development build

From now on, start Metro like this instead of `npx expo start`:

```powershell
npx expo start --dev-client
```

- Starts the Metro bundler (it serves your JavaScript) in dev-client mode.
- The QR code now opens **your** app instead of Expo Go.

On the phone (same Wi-Fi as the laptop):

1. Open **ETanim**. The dev launcher lists the servers it finds on the network. Tap the one with your laptop's IP (`http://192.168.50.69:8081`).
2. Or scan the QR code from the terminal with the phone camera.
3. The app loads. It's a new app with its own storage, so check **Settings** → backend address. It's pre-filled from `mobile/.env` (`EXPO_PUBLIC_API_URL`) if you set that; otherwise enter `http://192.168.50.69:4000` and tap **Save**.

When do you need `eas build` again? Only after adding a native package, changing plugins or Android settings in `app.config.ts`, or replacing `google-services.json`. JavaScript/TypeScript changes reload live.

## 7. Turn on notifications in the app

1. **Alerts** tab → the card *"Get alerts when the app is closed"* → **Turn on notifications**. Android 13+ shows the system dialog → **Allow**.
   - Android 12 and older don't ask: notifications are allowed by default.
2. **Settings** → **Notifications** → the **Push notifications** switch should be **on** (it turns on once Android's permission is granted and the phone is registered).
   - The backend terminal doesn't log the registration. To check, run `curl.exe -X POST http://localhost:4000/api/notifications/test` in another PowerShell window. It sends the same test as the button below.
   - `curl.exe` is the real curl program. Plain `curl` in PowerShell is a different command.
   - The answer `{"tokens":1,"sent":1,…}` means the server knows your phone and Expo accepted the message.
3. Tap **Send test notification**. A notification *"ETanim – Test notification…"* should appear within seconds.
4. Choose what to be notified about: **All / Warnings / Critical**. The default is Warnings, which covers warnings and critical alerts.

## 8. Android gotchas: battery savers delay or block pushes

The backend sends alerts as **high-priority** FCM messages, which Android delivers even in Doze. Many phone makers add their own "battery optimization" on top, which can delay or drop pushes for apps you haven't opened in a while. For a greenhouse alarm, exempt the app.

**Every phone (Android 12+):** Settings → **Apps** → **ETanim**:

- **Notifications** → allowed, and the category **Greenhouse alerts** is on. Leave its importance at the default, so it can pop up on screen.
- **App battery usage** (or *Battery*) → **Unrestricted**.
- Settings → Notifications → **Do Not Disturb**: if you use it, add ETanim as an exception.

The **Android app settings** button in the app's Settings → Notifications opens the app's page directly.

**Samsung (One UI):**

- Settings → **Battery** → **Background usage limits** → make sure ETanim is **not** in *Sleeping apps* or *Deep sleeping apps*, and add it to **Never sleeping apps**.
- Turn off **Put unused apps to sleep** if you want to be safe.
- Settings → Apps → ETanim → **Battery** → **Unrestricted**.

**Xiaomi / Redmi / POCO (MIUI / HyperOS):**

- Settings → **Apps** → **Manage apps** → ETanim → **Autostart: on**.
- Same page → **Battery saver** → **No restrictions**.
- Recent apps screen: long-press the app's card → **lock** (padlock icon), so "clear all" doesn't kill it.

**vivo / iQOO (Funtouch OS / OriginOS):**

- Settings → **Battery** → **Background power consumption management** → ETanim → **Allow high background power consumption**. On some versions this is called *Don't restrict*.
- Settings → **Apps** → **Autostart** (or i Manager → App manager → Autostart) → ETanim **on**.
- Lock the app in recent apps (pull the card down or tap the lock).

**OPPO / realme (ColorOS / realme UI):**

- Settings → **Battery** → **More settings** / **App battery management** → ETanim → **Allow background activity** and **Allow auto launch**.
- Lock the app in recent apps.

**OnePlus (OxygenOS):** Settings → **Battery** → **Battery optimization** → ETanim → **Don't optimize**.

**Huawei / Honor (EMUI / MagicOS):** Settings → **Battery** → **App launch** → ETanim → switch to **Manage manually** and turn on *Auto-launch*, *Secondary launch* and *Run in background*. Huawei phones without Google services can't receive FCM pushes at all.

Good to know:

- **Swiping the app away** from recent apps is fine: FCM still delivers. **Force stop** (in app info) is different. Android then blocks all pushes until you open the app again.
- **Data saver** and **Battery saver** modes can delay pushes as well.
- More per-brand help: <https://dontkillmyapp.com>.

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| Settings says *Unavailable: Expo Go cannot receive push notifications* | You opened the project in Expo Go. Open the **ETanim** app instead |
| *EAS project id missing* | Step 2: set `EAS_PROJECT_ID`, then restart `npx expo start --dev-client` |
| *Not registered* + an error message | Backend address wrong or backend not running. Settings → Test connection |
| Test returns `"tokens": 0` | The phone never registered: allow notifications (step 7) and reopen the app |
| Test returns `"failed": 1` | No internet on the laptop, or credentials problem. The backend log shows the reason |
| Backend log `InvalidCredentials` / `MismatchSenderId` | The FCM V1 key (step 4) and `google-services.json` (step 3) must come from the **same** Firebase project. Fix it, then rebuild (step 5) |
| Test `sent: 1` but nothing on the phone | Battery settings (step 8). Check the *Greenhouse alerts* category is on and the phone has internet |
| Backend log *removed … unregistered push token(s)* | The app was uninstalled or its data cleared. Normal clean-up; reopening the app registers again |

## 10. Try the demo notification

With a development build, the dev-only **Demo** sheet's **Trigger push notification** button sends a *real* push through this whole route ("Greenhouse alert / Air temperature 33.1 °C — fan turned on"). Press Home right after tapping it, and tap the notification to open the Alerts tab. In Expo Go, the same button shows an equivalent local notification instead.
