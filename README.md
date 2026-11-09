# Smart Greenhouse

An ESP32 reads air temperature and humidity, light and soil moisture, and controls a 12 V fan. A Node.js backend on the laptop stores the data and raises alerts. An **Android** app is the dashboard.

```
ESP32 / simulator ──MQTT──► Mosquitto (laptop :1883) ◄──► backend (laptop :4000) ◄──REST + Socket.IO──► Android app
```

| Folder | What |
|---|---|
| `backend/` | Node.js + TypeScript: MQTT ingest, rules engine, REST, Socket.IO, dev simulator |
| `mobile/` | Expo (React Native) Android app |
| `firmware/` | ESP32 firmware (PlatformIO), later phase |
| `docs/` | [API contract](docs/api-contract.md) (single source of truth), [Mosquitto setup](docs/setup-mosquitto.md) |

## Prerequisites

1. **Node.js LTS** (v22 or v24) from <https://nodejs.org>. Check with `node -v`.
2. **Mosquitto**, set up as described in [docs/setup-mosquitto.md](docs/setup-mosquitto.md), including the Windows Firewall rules for ports 1883 and 4000 and a **Private** Wi-Fi profile.
3. **Expo Go** on your Android phone, from the Google Play Store.
4. The phone and the laptop on the **same Wi-Fi**.

### Find your laptop's LAN IP

```powershell
ipconfig
```

Look under **Wireless LAN adapter Wi-Fi** for `IPv4 Address`, e.g. `192.168.254.117`. The backend also prints it at startup (`LAN: http://192.168.x.x:4000`). Reserve this IP in your router so it doesn't change (see the Mosquitto guide, step 6).

### Optional: Developer options + USB debugging (Android)

Expo Go over Wi-Fi doesn't need this. You need it to run the app over a USB cable (`npm run android` with `adb`) and for development builds later.

1. Open **Settings → About phone** (on some phones: **About phone → Software information**).
2. Tap **Build number** 7 times until it says "You are now a developer". Enter your PIN if asked.
3. Go to **Settings → System → Developer options** (or search "Developer options") and turn on **USB debugging**.
4. Connect the phone by USB and accept the **"Allow USB debugging?"** prompt on the phone.
5. To check the connection: `adb devices` should list the phone. `adb` comes with Android Studio's platform-tools, which a later phase sets up.

## First-time install

```powershell
cd backend
npm install                 # installs packages and generates the Prisma client
copy .env.example .env      # adjust if needed
npx prisma migrate deploy   # creates backend/dev.db

cd ..\mobile
npm install
copy .env.example .env      # then edit: EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:4000
```

## Run everything (4 terminals)

Each terminal starts in the repo folder. In VS Code: Terminal → New Terminal, or the `+` in the terminal panel.

| # | Folder | Command | What it does |
|---|---|---|---|
| 1 | `backend` | `npm run dev` | Backend on port 4000; restarts on code changes |
| 2 | `backend` | `npm run sim` | Simulated ESP32 `gh-01` (add `-- --hot` or `-- --dry` to trigger alerts) |
| 3 | `backend` | `npm run socket:watch` | Optional: prints live Socket.IO events |
| 4 | `mobile` | `npx expo start` | Starts the app dev server and shows a QR code |

Then open **Expo Go** on the phone and scan the QR code (Expo Go → "Scan QR code"). The app loads over Wi-Fi.

If the phone can't load the app, check that both devices are on the same Wi-Fi and that the laptop's network profile is Private. The Expo dev server uses port 8081, and Windows usually asks to allow Node.js the first time; allow it for **Private** networks. As a fallback, start with `npx expo start --tunnel`, which is slower but doesn't depend on the LAN.

## Useful commands

| Folder | Command | Purpose |
|---|---|---|
| backend | `npm run typecheck` / `npm run lint` / `npm test` | Checks |
| backend | `npm run sim -- --help` | Simulator options |
| backend | `npm run db:studio` | Browse the database |
| mobile | `npm run typecheck` / `npm run lint` / `npm run format` | Checks / formatting |
| mobile | `npm run doctor` | Expo project health check |

## Security note

This is a LAN-only development setup: Mosquitto allows anonymous clients, and the backend uses plain HTTP with no login. Don't expose ports 1883 or 4000 to the internet.
