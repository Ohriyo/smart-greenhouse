# Smart Greenhouse

An ESP32 reads air temperature and humidity, light and soil moisture, and controls a 12 V fan. A Node.js backend on the laptop stores the data and raises alerts. An **Android** app is the dashboard.

```
ESP32 / simulator ──MQTT──► Mosquitto (laptop :1883) ◄──► backend (laptop :4000) ◄──REST + Socket.IO──► Android app
```

| Folder | What |
|---|---|
| `backend/` | Node.js + TypeScript: MQTT ingest, rules engine, REST, Socket.IO, dev simulator |
| `mobile/` | Expo (React Native) Android app |
| `firmware/` | ESP32 firmware (PlatformIO): see [docs/firmware.md](docs/firmware.md) |
| `docs/` | [API contract](docs/api-contract.md) (single source of truth), [Mosquitto setup](docs/setup-mosquitto.md), [Push notifications setup](docs/setup-push.md), [SMS alerts setup](docs/setup-sms.md) |

## Prerequisites

1. **Node.js LTS** (v22 or v24) from <https://nodejs.org>. Check with `node -v`.
2. **Mosquitto**, set up as described in [docs/setup-mosquitto.md](docs/setup-mosquitto.md), including the Windows Firewall rules for ports 1883 and 4000 and a **Private** Wi-Fi profile.
3. The **ETanim development build** on your Android phone. See [docs/setup-push.md](docs/setup-push.md); it's needed for push notifications. Expo Go still runs the app, but without push.
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
| 4 | `mobile` | `npx expo start --dev-client` | Starts the app dev server for the development build and shows a QR code |

Then open the **Smart Greenhouse** app on the phone and pick your laptop's server in its launcher, or scan the QR code with the camera. The app loads over Wi-Fi. (With Expo Go, run `npx expo start` without `--dev-client` and scan the QR code in Expo Go. Push notifications won't work there.)

If the phone can't load the app, check that both devices are on the same Wi-Fi and that the laptop's network profile is Private. The Expo dev server uses port 8081, and Windows usually asks to allow Node.js the first time; allow it for **Private** networks. As a fallback, start with `npx expo start --tunnel`, which is slower but doesn't depend on the LAN.

## Useful commands

| Folder | Command | Purpose |
|---|---|---|
| backend | `npm run typecheck` / `npm run lint` / `npm test` | Checks |
| backend | `npm run sim -- --help` | Simulator options |
| backend | `npm run seed:history` | Fill 30 days of sample readings (only before existing data; safe to re-run) |
| backend | `npm run db:studio` | Browse the database |
| mobile | `npm run typecheck` / `npm run lint` / `npm run format` | Checks / formatting |
| mobile | `npm run doctor` | Expo project health check |
| backend | `npm run sms:check` | Checks your Semaphore key, credit and sender name without sending an SMS ([docs/setup-sms.md](docs/setup-sms.md)) |
| mobile | `npm run check:buttons` | Button rule check (below); exits with an error on violations |
| mobile | `npm run check:contrast` | WCAG AA contrast check of every text/background pair in both themes |

## App UI (ETanim)

The app's look follows the approved prototype (`docs/ui-reference/`, frames in `docs/ui-reference/frames/`). Design tokens (colors, Inter typography, spacing, radii; light + dark) live in `mobile/src/theme`. Settings → Appearance switches Light / Dark / System.

**Button rule.** Every button is a **pill** (stadium shape, radius = height / 2), made only with the shared `<Button>` from `mobile/src/components/ui/Button.tsx`: sizes large 52 / medium 46 / small 36, variants primary / secondary / tonal / destructive (+ ghost for link-style actions). Icon-only buttons (refresh, ±, close, ⋯) are perfect circles via `<IconButton>`. Cards, inputs, sheets and preview cards are not buttons and keep rounded rectangles. `npm run check:buttons` (in `mobile/`) fails if code outside `src/components/ui` builds its own button-like touchable. A pressable *card* or *row* opts out with a one-line `// button-check-ignore: <reason>` comment.

**Component gallery (dev only).** Settings → *Component gallery (dev)* shows every reusable component with sample data, including dark mode. It doesn't exist in release builds.

## Demo tools (development only)

For presenting the app. A dark **Demo** pill at the top right of every screen opens "Presentation tools":

| Control | What it does |
|---|---|
| Simulate heat wave / dry soil / back to normal | Drives the **simulator** through the backend, so the app shows a real alert, fan change and push |
| Device offline, Server unreachable, Pause live updates, Dark mode | Overrides **only what this app shows**: they reset when the app restarts |
| Trigger push notification | The prototype's sample alert, "Greenhouse alert / Air temperature 33.1 °C — fan turned on". Tapping it opens the Alerts tab. Without a push-registered phone (Expo Go) the same notification is shown locally after 5 s |

**To use the scenarios:**
1. In `backend/.env` set `DEV_TOOLS=true` and restart the backend (default is `false`: then the scenario endpoints don't exist).
2. Run the simulator (`npm run sim` in `backend/`) and keep the real ESP32 off. The rows are disabled, with a reason, whenever the device is real hardware: **scenarios never touch the real greenhouse or your history.**

**Where it exists.** The Demo button is in development builds, and in a build made with `EXPO_PUBLIC_DEMO=1` (to present from an installed build). A normal release build doesn't contain it: the code is removed at build time (checked by searching a production bundle for its texts). The component gallery (Settings → *Component gallery (dev)*) is development-only in the same way.

## Security note

This is a LAN-only development setup: Mosquitto allows anonymous clients, and the backend uses plain HTTP with no login. Don't expose ports 1883 or 4000 to the internet.
