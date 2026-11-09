# SMS alerts

The backend sends **one SMS to the owner's phone** when something needs action: a critical reading (air temperature, humidity, soil moisture, light), or the greenhouse being offline for more than N minutes. For air temperature it also says what the fan is doing, and it sends a closing SMS when the temperature has stabilized and the fan switched off. The exact rules and texts are in [api-contract.md §7](api-contract.md).

Push notifications ([setup-push.md](setup-push.md)) stay the everyday alert. SMS is for emergencies.

> **Limits to know about**
> - The SMS is sent by the **backend on your laptop**, through an SMS service on the internet. If the laptop is off, asleep, or has no internet, **no SMS (and no push) is sent**. The ESP32 itself keeps the fan running.
> - Every message costs credit with the SMS provider. A daily cap (default 10) protects you from a surprise bill.

## 1. Try it first in test mode (free)

Nothing to set up. By default `SMS_PROVIDER=console`: the backend **writes the SMS to its own log instead of sending them**.

1. Start the backend (`npm run dev` in `backend/`). It prints `SMS provider: console (test mode, messages are only logged)`.
2. In the app: **Settings → SMS alerts**. Enter the owner's number, switch **SMS alerts** on, tap **Save**.
3. Tap **Send test SMS**. In the backend window you see:
   `[test mode, not sent] SMS to +63••••••4567: "ETanim test: SMS alerts are working."`
4. Check the real situations with the simulator (`npm run sim -- --hot` in `backend/`). When the temperature becomes critical, the log shows the critical SMS with the fan state, and later the closing one.

## 2. Send real SMS with Semaphore

[Semaphore](https://semaphore.co) is a Philippine SMS service with a simple API. (The code is built so another provider can be added; ask if you prefer another one.)

1. **Create an account** at semaphore.co and **add credit**. Check their current pricing and sender-name rules there. Their documentation says one credit equals one SMS (a message over 160 characters is split in several; ours stay under 160).
2. **Get your API key** from your Semaphore account.
3. **Sender name.** Semaphore sends from a *registered* sender name. If your account has none, sending fails ("error will be thrown" in their docs). Register one in your Semaphore account, then put it in `.env` (max 11 characters). If your account already has a default one, you can leave it out.
4. **Edit `backend/.env`:**
   ```
   SMS_PROVIDER=semaphore
   SEMAPHORE_API_KEY=your-key-here
   SEMAPHORE_SENDER_NAME=ETANIM
   SMS_DAILY_CAP=10
   ```
   The backend refuses to start with `SMS_PROVIDER=semaphore` and no key, with a clear message.
5. **Check your setup without sending anything.** In `backend/`:
   ```powershell
   npm run sms:check
   ```
   This asks Semaphore whether your key is accepted, how much credit is left and which sender names are registered, and compares them with your `.env`. It sends **no SMS** and costs nothing. Fix anything marked `FAIL`. (Semaphore limits these questions to 2 per minute: don't run it in a loop.)
6. **Restart the backend** (`Ctrl+C`, then `npm run dev`). It prints `SMS provider: semaphore`.
7. In the app (Settings → SMS alerts) tap **Send test SMS**. The phone should receive it within seconds.
8. To go back to test mode at any time, set `SMS_PROVIDER=console` and restart.

**The API key is a secret.** It lives only in `backend/.env`, which git ignores. It is never sent to the app, never returned by the API, and never written to logs or error messages. Don't paste it in chats or commit it.

## What you set where

| Setting | Where | Why |
|---|---|---|
| Provider, API key, sender name, daily cap | `backend/.env` | Secrets and server settings |
| Owner's number, on/off, "offline after N minutes" | App: Settings → SMS alerts | Easy to change; stored in the backend database |

The number must be in international format: `+639171234567`. The app converts `0917 123 4567` for you.

## Troubleshooting

The app shows the last result under **Last SMS**, and the backend log has the full reason.

| Message | Meaning / fix |
|---|---|
| `npm run sms:check` says `FAIL` | It names the problem: key not accepted, no credit, or a sender name that isn't registered. Fix it in `.env` or your Semaphore account |
| `Semaphore answered HTTP 401` / `rejected the message` | Wrong or missing API key, or the sender name isn't registered/active. Check `SEMAPHORE_API_KEY` and `SEMAPHORE_SENDER_NAME` |
| `Could not reach Semaphore` | The laptop has no internet, or Semaphore is down |
| `Semaphore reports the message as failed` / `refunded` | Their network could not deliver it (wrong number, phone off for too long). Check the number and your credit |
| `daily limit of N SMS reached` | The safety cap was hit. Raise `SMS_DAILY_CAP` and restart, or wait (it is a rolling 24 hours) |
| Test SMS: "Save the owner's phone number first" | Enter and save the number first |
| Test SMS: "Too many test messages" | At most 5 per hour |
| Nothing arrives, no error | You are still in test mode (`SMS_PROVIDER=console`): look at the backend log |
| Message arrives late | Provider/network delay. SMS is not instant; the push notification usually is |

## How it behaves (short version)

- **Once per situation:** a critical reading is announced once, not every few seconds. When it's over, one closing SMS follows.
- **Air temperature:** critical → "Fan ON (auto)" (or "Fan is OFF … Turn it on in the app!" if the fan isn't running). When the temperature is back in range **and the fan switches OFF**, you get "Air temp back to 28 C. Fan turned OFF."
- **Offline:** after N minutes without data (default 10). The SMS says the fan keeps running on its own. One more SMS when it's back.
- **A backend restart** doesn't repeat messages or lose the closing one.
