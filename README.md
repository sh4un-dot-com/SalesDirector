# SalesDirector

SalesDirector is an AI-assisted outbound sales workspace built with React, Firebase, and optional HubSpot + proxy integrations. It helps teams manage contacts, generate outreach drafts, prioritize tasks, and track thread history from one interface.

## What It Includes

- AI outreach drafting, polishing, analysis, objection handling, and sequence generation
- Smart Inbox scoring with AI summaries
- Contact management with Firestore-backed storage
- HubSpot contact sync and email engagement logging
- CSV contact import with parsing and deduplication
- Optional secure proxy to keep API keys and tokens off the frontend
- Electron desktop packaging and macOS DMG workflows

## Quick Start

1. Install dependencies.

```powershell
npm install
```

2. Run web mode.

```powershell
npm run dev
```

3. Open the app and complete initial settings in the Settings tab.

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
- Do not commit real tokens, SMTP passwords, or signing material.

## Current Functional Boundaries

- Outbound send currently saves to Firestore thread history and can log to HubSpot when a HubSpot contact ID is present.
- SMTP and IMAP settings are captured and validated in the UI for readiness status.

## Testing

```powershell
npm test
```

Tests cover:

- CSV and AI parsing helpers
- Proxy validation, auth, CORS, body limits, and rate limits
