# SalesDirector Setup Guide

This guide walks through local setup, environment requirements, and first-run configuration.

## 1. Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- A Firebase project (for Auth and Firestore)
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

They are referenced in [salesdirector.jsx](salesdirector.jsx#L25).

### Recommended approach

Run in the same host/runtime that injects those globals.

### Local standalone development fallback

If you are running standalone and no host injects globals, update [salesdirector.jsx](salesdirector.jsx#L26) to provide your Firebase config directly for local testing.

## 4. Start the App

Web mode:

```powershell
npm run dev
```

Desktop mode:

```powershell
npm run dev:desktop
```

## 5. First-Run Settings Checklist

Open the Settings tab and configure:

- Company Website URL
- Sender details and signature
- AI provider key (Gemini key for direct mode)
- HubSpot private app token (direct mode) or proxy URL
- Sending safety defaults

For team onboarding sessions, use [TEAM_TRAINING_SOP.md](TEAM_TRAINING_SOP.md).

Validation rules are implemented in [salesdirector.jsx](salesdirector.jsx#L255).

## 6. Direct Mode vs Proxy Mode

### Direct mode

- Enter Gemini and HubSpot credentials directly in app settings.
- Quick to start, but frontend handles credentials in memory.

### Proxy mode

- Run [proxy-server.mjs](proxy-server.mjs) with server-side secrets.
- In app settings, set Proxy Base URL and optional Proxy Shared Secret.
- Leave direct AI/HubSpot secrets empty in the frontend.

Detailed proxy steps are in [PROXY_SETUP.md](PROXY_SETUP.md).

## 7. Testing and Build

Run tests:

```powershell
npm test
```

Build web:

```powershell
npm run build:web
```

## 8. macOS Packaging

Unsigned DMG workflow is available in CI.

For signed and notarized releases, follow [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md).

Before publishing a production build, run through [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## 9. Troubleshooting

### HubSpot sync fails

- Verify token and scopes in [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md).
- Check whether you are in direct mode or proxy mode.

### AI features fail with key errors

- Direct mode: verify Gemini key is set.
- Proxy mode: verify proxy env has GEMINI_API_KEY and app points to proxy URL.

### 401 from proxy

- Ensure Proxy Shared Secret in app matches PROXY_SHARED_SECRET on server.

### Firestore/auth errors

- Confirm Firebase runtime config is provided and project rules permit access.

For expanded issue mapping and faster diagnosis, see [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).
