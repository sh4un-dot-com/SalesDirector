# SalesDirector Setup Guide

Complete local setup, environment configuration, and first-run walkthrough.

> For day-to-day usage after setup, see [USER_MANUAL.md](USER_MANUAL.md).
> For the full feature list, see [FEATURES.md](FEATURES.md).
> For a nontechnical Mac handoff, start with [MACBOOK_HANDOFF.md](MACBOOK_HANDOFF.md).

---

## 1. Prerequisites

- **Node.js 20** or newer
- **npm 10** or newer
- Desktop runtime via **Electron** (for encrypted local database — included as a dev dependency)
- Optional: Firebase project (only if you want cloud-backed auth/storage)
- Optional: Gemini API key and/or other AI provider key
- Optional: HubSpot private app token

## 2. Install Dependencies

```powershell
npm install
```

## 3. Start the App

### Desktop mode (recommended)

Full feature access including encrypted local database:

```powershell
npm run dev:desktop
```

### Web preview mode

Quick browser-based development — no encrypted DB access:

```powershell
npm run dev
```

### Production desktop launch

Build web assets and launch Electron:

```powershell
npm run start:desktop
```

## 4. First-Run Settings Checklist

Open the **Settings** tab and configure these in order:

1. **Encrypted Local Database** — enter a passphrase (min 8 characters) and click "Create and Unlock"
2. **Company Website URL** — helps AI generate contextual outreach
3. **Sender Profile** — your name, reply-to address, and email signature
4. **AI Provider Key** — Gemini key for direct mode (or configure proxy)
5. **HubSpot Token** — private app access token (optional)
6. **Sending Limits** — max daily emails, send delay, active hours

Check the **System Health** panel at the top of Settings — all configured integrations should show green status.

For team-wide onboarding sessions, use [TEAM_TRAINING_SOP.md](TEAM_TRAINING_SOP.md).

## 5. Encrypted Local Database (Desktop Only)

In desktop runtime, all CRM data is stored in an encrypted local database:

1. Open **Settings** → **Encrypted Local Database**
2. Enter a passphrase (minimum 8 characters)
3. Click **Create and Unlock** (first time) or **Unlock Database** (returning user)
4. Work normally — contacts, threads, tasks, and inbox data auto-save encrypted

**Important:**
- Passphrase is **never stored** — if lost, data cannot be recovered
- Browser preview mode intentionally cannot access desktop encrypted storage
- One-time migration from legacy browser-encrypted data occurs automatically on first desktop unlock

## 6. Direct Mode vs Proxy Mode

### Direct mode (fastest setup)

Enter API keys directly in app Settings. Quick to start, and the app persists those settings locally on the device so the same workstation is ready after restart. Use proxy mode instead if you do not want vendor credentials stored on the client.

### Proxy mode (production recommended)

Run the secure proxy server with server-side secrets:

```powershell
GEMINI_API_KEY=your-key HUBSPOT_TOKEN=your-token node proxy-server.mjs
```

In app settings, set **Proxy Base URL** and optional **Proxy Shared Secret**. Leave direct AI/HubSpot key fields empty in the frontend.

Detailed proxy configuration: [PROXY_SETUP.md](PROXY_SETUP.md).

## 7. Firebase Configuration (Optional)

The app can run in Firebase-backed mode for cloud auth/storage. The runtime reads these globals:

- `__firebase_config`
- `__initial_auth_token`
- `__app_id`

If running standalone desktop mode with local encrypted storage, Firebase is **not required**.

## 8. Testing

```powershell
npm test
```

Tests cover CSV/AI parsing helpers, proxy validation, auth, CORS, body limits, and rate limits.

## 9. Desktop Packaging

### Windows installer

```powershell
npm run dist:win
```

Produces `release/SalesDirector-1.0.0-Setup.exe` (NSIS installer with custom install directory).

### macOS DMG

```powershell
npm run dist:mac
```

Produces a DMG in `release/`.

For signed and notarized macOS releases, follow [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md).

### GitHub CI Builds

The unified [desktop-build.yml](.github/workflows/desktop-build.yml) workflow builds both platforms:

- **Triggers:** push to main, pull request to main, v* tags, manual dispatch
- **Outputs:** Windows NSIS installer + macOS DMG as artifacts
- **Releases:** pushing a `v*` tag (e.g., `v1.0.0`) automatically creates a GitHub Release with both installers attached

For signed/notarized macOS DMGs, use [release-macos-signed.yml](.github/workflows/release-macos-signed.yml) (manual dispatch, requires signing secrets).

Before publishing a production build, run through [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## 10. Troubleshooting

### Encrypted local DB controls are disabled
- Expected in browser preview mode. Launch with `npm run dev:desktop` or `npm run start:desktop`.

### White screen in packaged app
- Verify `base: './'` is set in [vite.config.mjs](vite.config.mjs). Absolute asset paths break under Electron's `file://` protocol.

### HubSpot sync fails
- Verify token and scopes in [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md).
- Check whether you're in direct mode or proxy mode.

### AI features fail with key errors
- Direct mode: verify provider key is set in Settings.
- Proxy mode: verify proxy env has the key and app points to proxy URL.

### 401 from proxy
- Ensure Proxy Shared Secret in app matches `PROXY_SHARED_SECRET` on server.

### Firestore/auth errors
- If running local-only desktop mode, Firebase is not required — these can be ignored.
- If using Firebase-backed mode, confirm runtime config and project rules.

For expanded troubleshooting, see [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).
