# SalesDirector

SalesDirector is an AI-assisted outbound sales workspace built with React, optional Firebase, and optional HubSpot + proxy integrations. It helps teams manage contacts, generate outreach drafts, prioritize tasks, and track thread history from one interface.

## What It Includes

- AI outreach drafting, polishing, analysis, objection handling, and sequence generation
- Smart Inbox scoring with AI summaries
- Contact management with encrypted desktop local storage (and optional Firebase-backed mode)
- Desktop-only encrypted local database (AES-256-GCM) with passphrase unlock
- One-time migration of legacy browser-encrypted local data into desktop encrypted storage
- HubSpot contact sync and email engagement logging
- CSV contact import with parsing and deduplication
- Optional secure proxy to keep API keys and tokens off the frontend
- Electron desktop packaging and macOS DMG workflows

## Quick Start

1. Install dependencies.

```powershell
npm install
```

2. Run desktop mode (recommended for encrypted local storage).

```powershell
npm run dev:desktop
```

3. Optional web preview mode.

```powershell
npm run dev
```

4. Open the app and complete initial settings in the Settings tab.

## Desktop Encrypted Local Database

- Encrypted local storage is available in desktop runtime only.
- In browser preview, encrypted DB controls are intentionally disabled.
- In Settings, open Encrypted Local Database and enter a passphrase to Create and Unlock.
- Passphrase is never stored by the app.
- If legacy browser-encrypted data exists, the first successful desktop unlock will migrate it into the desktop encrypted database and remove the legacy browser payload.

## Scripts

- npm run dev: Start Vite dev server
- npm run build:web: Build production web bundle
- npm run preview: Preview production web build locally
- npm run test: Run parser and proxy tests
- npm run dev:desktop: Run Electron desktop app in dev mode
- npm run start:desktop: Build web assets and launch Electron
- npm run dist:mac: Build macOS DMG (local)
- npm run dist:mac:ci: Build unsigned macOS DMG (CI-safe)
- npm run dist:mac:signed: Build signed/notarized macOS DMG (requires signing env)

## GitHub CI DMG

- Unsigned DMG workflow: [.github/workflows/build-macos-dmg.yml](.github/workflows/build-macos-dmg.yml)
- Triggers: push to main, pull request to main, v* tags, and manual dispatch
- Output artifact: macos-dmg
- Signed/notarized workflow: [.github/workflows/release-macos-signed.yml](.github/workflows/release-macos-signed.yml)

## Documentation Map

- New user onboarding in 15-30 minutes: [ONBOARDING.md](ONBOARDING.md)
- Printable trainer handout and onboarding runbook: [TEAM_TRAINING_SOP.md](TEAM_TRAINING_SOP.md)
- Setup and environment: [SETUP.md](SETUP.md)
- User workflows and feature usage: [USER_MANUAL.md](USER_MANUAL.md)
- HubSpot token, scopes, and troubleshooting: [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md)
- Production launch and release gates: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- Error matrix and issue triage: [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md)
- Optional secure proxy setup: [PROXY_SETUP.md](PROXY_SETUP.md)
- macOS signing and notarization setup: [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md)

## Core Architecture

- Frontend app: [salesdirector.jsx](salesdirector.jsx)
- Shared parsing utilities: [utils/dataParsers.mjs](utils/dataParsers.mjs)
- Proxy server: [proxy-server.mjs](proxy-server.mjs)
- Desktop wrapper: [electron/main.cjs](electron/main.cjs)

## Security Notes

- Sensitive values like API keys and tokens are intentionally not persisted to local storage.
- In proxy mode, keep credentials on the server and configure only proxy URL and optional shared secret in the client.
- Local CRM/task/thread/inbox data in desktop mode is encrypted at rest and protected by a user passphrase.
- Do not commit real tokens, SMTP passwords, or signing material.

## Current Functional Boundaries

- Outbound send saves to encrypted desktop local history in local mode, or Firestore in Firebase-backed mode.
- HubSpot logging occurs when a HubSpot contact ID is present and integration is configured.
- SMTP and IMAP settings are captured and validated in the UI for readiness status.

## Testing

```powershell
npm test
```

Tests cover:

- CSV and AI parsing helpers
- Proxy validation, auth, CORS, body limits, and rate limits
