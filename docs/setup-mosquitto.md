# Mosquitto setup (Windows laptop)

Mosquitto is the MQTT broker. The ESP32 (and the dev simulator) publish to it, and the backend subscribes to it. It runs on the same laptop as the backend.

```
ESP32 ──Wi-Fi──► laptop:1883 (Mosquitto) ◄── backend (localhost)
Phone ──Wi-Fi──► laptop:4000 (backend REST + Socket.IO)
```

## 1. Install

1. Download the 64-bit Windows installer from <https://mosquitto.org/download/> (`mosquitto-x.y.z-install-windows-x64.exe`).
2. Run it with the defaults. It installs to `C:\Program Files\mosquitto\` and registers a Windows service named **Mosquitto Broker**.
3. Optional: add `C:\Program Files\mosquitto` to your user `PATH` so that `mosquitto_sub` and `mosquitto_pub` work from any folder.
   - Start menu → "Edit environment variables for your account" → `Path` → Edit → New → `C:\Program Files\mosquitto` → OK.
   - Open a **new** terminal afterwards.
   - Without this step, call the tools with their full path: `& "C:\Program Files\mosquitto\mosquitto_sub.exe" ...`

Check the installation:

```powershell
mosquitto -h | Select-Object -First 1   # prints "mosquitto version x.y.z"
```

## 2. Configuration

Since Mosquitto 2.0 the broker only listens on `localhost` unless a listener is configured, so the ESP32 can't reach it. Open `C:\Program Files\mosquitto\mosquitto.conf` **as Administrator** (Notepad → Run as administrator → File → Open). Add this at the end:

```conf
# --- Smart Greenhouse (LAN-only development) ---
listener 1883 0.0.0.0
allow_anonymous true

# Keep retained messages (device status) across broker restarts
persistence true
persistence_location C:\Program Files\mosquitto\data\

log_type error
log_type warning
log_type notice
```

Create the data folder once, in an **Administrator** PowerShell:

```powershell
New-Item -ItemType Directory -Force "C:\Program Files\mosquitto\data"
```

> ⚠️ **Security trade-off.** `allow_anonymous true` on `0.0.0.0` means **any device on your Wi-Fi** can read all greenhouse data, publish fake telemetry and send fan commands. Nothing is encrypted. That's acceptable on a trusted home network during development. Never forward port 1883 on your router, and don't use this setup on public or shared Wi-Fi. To harden it later, add a password file (`password_file` + `allow_anonymous false`, created with `mosquitto_passwd`) and TLS on port 8883.

## 3. Run it

**As a Windows service (recommended).** It starts automatically with Windows. In an **Administrator** PowerShell:

```powershell
Restart-Service mosquitto      # apply the new config
Get-Service mosquitto          # Status should be "Running"
```

**In the foreground (for debugging).** Stop the service first, because both can't use port 1883:

```powershell
Stop-Service mosquitto                                   # Administrator
& "C:\Program Files\mosquitto\mosquitto.exe" -c "C:\Program Files\mosquitto\mosquitto.conf" -v
```

`-c` loads the config file, and `-v` prints every connection and message. Press Ctrl+C to stop. Run `Start-Service mosquitto` afterwards to go back to the service.

Check that it listens on all interfaces:

```powershell
Get-NetTCPConnection -LocalPort 1883 -State Listen
# LocalAddress should be 0.0.0.0 (not 127.0.0.1)
```

## 4. Test with mosquitto_sub / mosquitto_pub

Terminal 1 subscribes to everything under `greenhouse/` and prints topics (`-v`):

```powershell
mosquitto_sub -h localhost -t "greenhouse/#" -v
```

Terminal 2 publishes a test message:

```powershell
mosquitto_pub -h localhost -t "greenhouse/test/status" -m "online"
```

Terminal 1 should print `greenhouse/test/status online`.

To test from another machine on the LAN, use the laptop IP instead of `localhost` (e.g. `-h 192.168.1.50`). If this fails while `localhost` works, the firewall is blocking it (step 5).

> **JSON in PowerShell:** quoting JSON for native programs is fragile in Windows PowerShell 5.1. Put the payload in a file and send it with `-f`:
>
> ```powershell
> '{"airTemp":27.4,"humidity":61,"soilMoisture":43,"soilRaw":2310,"lux":812,"fanOn":false,"fanMode":"auto","rssi":-61}' | Out-File -Encoding ascii telemetry.json
> mosquitto_pub -h localhost -t "greenhouse/gh-01/telemetry" -f telemetry.json
> ```

## 5. Windows Firewall

Inbound connections from the ESP32 and the phone must be allowed on **1883** (MQTT) and **4000** (backend API + Socket.IO; change it if you change `PORT` in `backend/.env`). Run in an **Administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Greenhouse MQTT 1883" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Greenhouse API 4000"  -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private
```

- `-Profile Private` limits the rules to networks Windows considers **Private**. Make sure your home Wi-Fi is set to Private: Settings → Network & internet → Wi-Fi → (your network) → Network profile type → **Private network**.
- Check them: `Get-NetFirewallRule -DisplayName "Greenhouse*" | Format-Table DisplayName, Enabled, Profile`
- Remove them: `Remove-NetFirewallRule -DisplayName "Greenhouse*"`
- The first time Node.js starts listening, Windows may show its own "Allow access" pop-up. Allow it for **Private** networks only.

## 6. Give the laptop a fixed IP (router DHCP reservation)

The ESP32 and the app store the laptop's IP. If the router hands the laptop a new IP, both lose the connection. Reserve the address in the router:

1. Find the laptop's current IP and Wi-Fi MAC address:

   ```powershell
   Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Format-List InterfaceAlias, IPv4Address, IPv4DefaultGateway
   Get-NetAdapter -Name "Wi-Fi" | Format-List Name, MacAddress
   ```

   The `IPv4DefaultGateway` is usually the router's admin page (e.g. `192.168.1.1`).

2. Turn off **Random hardware addresses** for this network (Settings → Network & internet → Wi-Fi → your network). Otherwise the MAC address, and with it the reservation, may change.
3. Open the router admin page in a browser and log in. The credentials are often on a sticker on the router.
4. Find **DHCP reservation**, **Address reservation** or **Static lease**. It's usually under LAN, DHCP or Advanced. The name varies by brand.
5. Add a reservation for the laptop's MAC with its current IP (or another IP outside the dynamic pool). Save.
6. Reconnect Wi-Fi on the laptop (or reboot) and check the IP with `ipconfig`.

The backend prints its LAN address at startup (`LAN: http://192.168.x.y:4000`). Use that IP in the app Settings and in the ESP32 WiFiManager portal.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Connection refused` on localhost | Service not running: `Get-Service mosquitto` |
| Works on localhost, not from the ESP32/phone | Firewall rule missing, Wi-Fi profile is Public, or the `listener 1883 0.0.0.0` line is missing |
| `Only one usage of each socket address` | Foreground Mosquitto and the service both running; stop one |
| Service won't start after editing conf | Syntax error; run in the foreground with `-v` to see the error |
| ESP32 connects then drops repeatedly | Two devices using the same MQTT client id |
