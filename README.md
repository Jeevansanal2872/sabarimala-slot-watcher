# Virtual Q Detector

An unobtrusive desktop monitor for **Sabarimala Online Virtual Q** booking. It watches for open darshan slots on your preferred dates and alerts you across your chosen channels (desktop, phone push, Telegram, WhatsApp, or email) the moment slots become available.

Built with an Apple-style floating glass pill that sits quietly at the top of your screen without taking up workspace, expanding into a live telemetry card on hover.

---

## Downloads & Distribution Options

| Package | Size | Best For | Location |
| :--- | :--- | :--- | :--- |
| **Virtual Q Detector (Native Launcher)** | **~72 KB** | Lightweight Windows execution without console windows. | Root folder (`Virtual Q Detector.exe`) |
| **Portable Standalone Package** | **~64 MB** | Ready-to-run on any PC without installing Node.js. | `Release/Virtual Q Detector 1.0.0.exe` |
| **Full Windows Installer** | **~65 MB** | Standard setup wizard for Windows. | `Release/Virtual Q Detector Setup 1.0.0.exe` |
| **Source Run** | **< 1 MB** | Developers and git users running directly via Node. | `npm start` or double-click `run.bat` |

---

## Features

- **Live Calendar Verification:** Inspects date cells on the official portal to ensure genuine open availability.
- **Floating Status Pill:** Floats seamlessly at the top edge of your monitor. Expands on hover to show countdowns, recent checks, and date status chips.
- **Multi-Channel Alert Dispatch:**
  - **Desktop:** High-priority system notification with alert sound.
  - **ntfy.sh:** Free instant push notifications to your phone (iOS / Android) with no account required.
  - **Telegram:** Direct bot messages to your personal chat or group.
  - **WhatsApp (via Twilio):** Mobile alerts via WhatsApp.
  - **Email (SMTP):** Direct notification via your mail server or Gmail App Password.
- **Session Auto-Refresh:** Maintains active session tokens locally and handles re-login seamlessly.
- **Resource Efficient:** CPU drops to **0.0% – 0.2%** when resting collapsed, with total memory usage capped under **60 MB**.
- **Privacy First:** Credentials and session cookies are encrypted using native OS credential storage (Windows DPAPI / macOS Keychain). No personal data leaves your computer.

---

## Quick Start

### Running from Prebuilt Executables

1. **Lightweight Launcher:** Double-click `Virtual Q Detector.exe` in the root folder.
2. **Standalone / No-Install:** Open `Release/` and double-click `Virtual Q Detector 1.0.0.exe`.
3. **Installer:** Run `Release/Virtual Q Detector Setup 1.0.0.exe` to install to your Start Menu.

### Running from Source

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/virtual-q-detector.git
cd virtual-q-detector

# 2. Install dependencies
npm install

# 3. Start the application
npm start
# (or double-click run.bat on Windows)
```

---

## Initial Setup Guide

1. **Open Settings:** On first launch, the Settings window opens automatically (or click the Settings gear icon in the floating pill / system tray).
2. **Configure Dates:** Enter your target darshan dates in `YYYY-MM-DD` format (comma-separated, e.g. `2026-12-20, 2026-12-21, 2026-12-22`).
3. **Set Alert Channels:** Configure at least one remote channel (like **ntfy** or **Telegram**) and press **Test** to confirm delivery.
4. **Log In:**
   - Click **Open Sabarimala Login Window**.
   - Complete your login (OTP / captcha work normally).
   - Once inside, close the login window. Your authentication is preserved securely inside the app partition.
   - *(Optional)* Fill in your username and password in Settings to enable automatic silent re-login if your session expires overnight.
5. **Let it Watch:** The pill will display live countdown intervals and verify slot status automatically.

---

## Alert Channel Setup Details

| Channel | Cost | Configuration |
| :--- | :--- | :--- |
| **Desktop Popup** | Free | Enabled by default; triggers native OS notification and audio alerts. |
| **ntfy (Recommended)** | Free, No account | Install the ntfy app on your phone, subscribe to a unique topic name (e.g. `sabarimala-myalert-789`), and enter that same topic in Settings. |
| **Telegram** | Free | Create a bot via `@BotFather`, message your bot once, then paste your bot token and chat ID. |
| **WhatsApp** | Free sandbox / Twilio | Enter your Twilio Account SID, Auth Token, and phone number. |
| **Email (SMTP)** | Free | Enter your SMTP host (e.g. `smtp.gmail.com`), port `465`, your email, and a Gmail App Password. |

---

## Technical Architecture & Performance

- **Display Pipeline:** Dynamic Island renderer built with hardware-accelerated CSS backdrops. When resting collapsed, rendering frame rates are dynamically throttled to conserve GPU and CPU cycles.
- **Probe Sandbox:** Automated checks run within a sandboxed background window that disposes of render buffers and flushes session memory caches immediately after each verification cycle.
- **Memory Footprint:** V8 heap allocation is strictly capped via engine switches to prevent long-term memory creep.

---

## Building from Source

To compile your own distribution binaries:

```bash
# Windows Installer & Portable EXE
npm run dist:win

# macOS DMG package
npm run dist:mac
```

Output binaries will be generated inside the `dist/` directory.

---

## Verification & Tests

To execute the slot detection test suite:

```bash
npm test
```

Verifies heuristic availability parsing, multi-format ISO date matching, false-positive exclusions, and error resilience.

---

## License

Released under the [MIT License](LICENSE).
