# SalesDirector Setup Guide

This guide walks through local setup, environment requirements, and first-run configuration.

## 1. Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- Desktop runtime via Electron (for encrypted local database)
- Optional Firebase project (only if you want Firebase-backed auth/storage)
- Optional: Gemini API key and HubSpot private app token
- Optional: Node runtime for proxy mode

## 2. Install Dependencies

```powershell
npm install
```

## 3. Firebase Runtime Configuration

The app currently reads these runtime globals:

- __firebase_config
- __initial_auth_token
- __app_id

They are referenced in [salesdirector.jsx](salesdirector.jsx).

### Recommended approach

Run in the same host/runtime that injects those globals.

### Local standalone development fallback

If you are running standalone and no host injects globals, update [salesdirector.jsx](salesdirector.jsx) to provide your Firebase config directly for local testing.

## 4. Start the App

Desktop mode (recommended):

```powershell
npm run dev:desktop
```

Web preview mode (no desktop encrypted DB access):

```powershell
npm run dev
```

Production desktop launch:

```powershell
npm run start:desktop
```

## 5. Encrypted Local Database (Desktop Runtime)

In local mode, data persistence is handled by an encrypted desktop database.

1. Open Settings.
2. In Encrypted Local Database, enter a passphrase (minimum 8 chars).
3. Click Create and Unlock (first time) or Unlock Database (existing data).
4. Keep working normally. Contacts, threads, tasks, and inbox data are autosaved encrypted.

Important notes:

- Passphrase is never stored.
- Browser preview intentionally cannot access desktop encrypted storage.
- One-time migration is supported from legacy browser-encrypted local payloads when you first unlock in desktop mode with the correct passphrase.

## 6. First-Run Settings Checklist

Open the Settings tab and configure:

- Company Website URL
- Sender details and signature
- AI provider key (Gemini key for direct mode)
- HubSpot private app token (direct mode) or proxy URL
- Sending safety defaults

For team onboarding sessions, use [TEAM_TRAINING_SOP.md](TEAM_TRAINING_SOP.md).

Validation rules are implemented in [salesdirector.jsx](salesdirector.jsx).

## 7. Direct Mode vs Proxy Mode

### Direct mode

- Enter Gemini and HubSpot credentials directly in app settings.
- Quick to start, but frontend handles credentials in memory.

### Proxy mode

- Run [proxy-server.mjs](proxy-server.mjs) with server-side secrets.
- In app settings, set Proxy Base URL and optional Proxy Shared Secret.
- Leave direct AI/HubSpot secrets empty in the frontend.

Detailed proxy steps are in [PROXY_SETUP.md](PROXY_SETUP.md).

## 8. Testing and Build

Run tests:

```powershell
npm test
```

Build web:

```powershell
npm run build:web
```

## 9. macOS Packaging

Unsigned DMG workflow is available in CI.

For signed and notarized releases, follow [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md).

Before publishing a production build, run through [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

### GitHub CI DMG Build (Recommended)

Unsigned DMG builds run via [build-macos-dmg.yml](.github/workflows/build-macos-dmg.yml) on:

- Push to main
- Pull request targeting main
- Push tag matching v*
- Manual workflow_dispatch

After completion, download the DMG from the workflow artifact named macos-dmg.

For signed/notarized DMG, use [release-macos-signed.yml](.github/workflows/release-macos-signed.yml) with required secrets configured.

## 10. Troubleshooting

### HubSpot sync fails

- Verify token and scopes in [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md).
- Check whether you are in direct mode or proxy mode.

### AI features fail with key errors

- Direct mode: verify Gemini key is set.
- Proxy mode: verify proxy env has GEMINI_API_KEY and app points to proxy URL.

### 401 from proxy

- Ensure Proxy Shared Secret in app matches PROXY_SHARED_SECRET on server.

### Firestore/auth errors

- If you are intentionally running local-only desktop mode, Firebase is not required.
- If using Firebase-backed mode, confirm runtime config is provided and project rules permit access.

### Encrypted local DB controls are disabled

- This is expected in browser preview mode.
- Launch desktop runtime using npm run dev:desktop or npm run start:desktop.

For expanded issue mapping and faster diagnosis, see [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).
