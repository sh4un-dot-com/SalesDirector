# SalesDirector

**AI-powered outbound sales command center for Windows and macOS.**

SalesDirector is a desktop application that combines AI email drafting, CRM contact management, smart inbox scoring, intelligent task scheduling, and encrypted local storage into a single workspace. Built for sales teams that want to close more deals with less context switching.

> Built by **Akita Engineering** in Niagara Falls, Canada.
> [www.akitaengineering.com](https://www.akitaengineering.com) · [support@akitaengineering.com](mailto:support@akitaengineering.com)

---

## Highlights

| Capability | What It Does |
|---|---|
| **AI Outreach Engine** | Draft, polish, analyze, and sequence outbound emails from one composer. Reps can apply outreach plays, cadence presets, and turn sequence steps into planner tasks. |
| **Smart Inbox** | AI scores every inbound email 1–100, summarizes intent, and surfaces a CRM-linked next best action so the rep knows whether to reply, create a task, or review the account. |
| **CRM & Contacts** | Import CSV, sync HubSpot, or review guided contact drafts manually. Full dossiers, attention queues, duplicate-aware editing, and stage tracking keep account data clean. |
| **Tasks & Calendar** | AI generates and prioritizes your daily sales actions with time blocks, rationale, minimum booking buffers, and one-click execution. |
| **AI Context Workspace** | CRM research, follow-up strategy, and proposal guidance stay visible in a dedicated, user-resizable context pane while reps write outbound emails. |
| **Encrypted Local Database** | AES-256-GCM encryption with PBKDF2 key derivation. Your data stays on your machine, protected by your passphrase. |
| **HubSpot Integration** | Two-way contact sync and automatic email engagement logging. |
| **Persistent Settings** | AI provider keys, HubSpot token, SMTP/IMAP credentials, and proxy settings persist locally on-device until cleared. |
| **Multi-Provider AI** | Gemini (default), OpenAI, Anthropic, xAI, and Meta provider slots, with optional proxy mode when teams want vendor secrets kept server-side. |
| **Desktop-First** | Native installers for Windows (NSIS) and macOS (DMG). Works fully offline after setup. |

For the complete feature list, see [FEATURES.md](FEATURES.md).

---

## Quick Start

```powershell
# 1. Install dependencies
npm install

# 2. Launch desktop mode (recommended)
npm run dev:desktop

# 3. Or web preview for quick iteration
npm run dev
```

Open the app → go to **Settings** → configure sender profile, AI provider key, and optionally HubSpot or mail credentials. Those settings persist locally on the device until cleared, so you're ready to restart and keep working.

For full setup including proxy mode, environment configuration, and packaging, see [SETUP.md](SETUP.md).

---

## Desktop Installers

### Build locally

```powershell
# Linux AppImage + Flatpak + RPM + Pacman bundles
npm run dist:linux

# Linux AppImage only
npm run dist:appimage

# Linux Flatpak bundle only
npm run dist:flatpak

# Linux RPM package only
npm run dist:rpm

# Linux Pacman package only
npm run dist:pacman

# Windows installer (.exe)
npm run dist:win

# macOS DMG
npm run dist:mac
```

Installers are written to the `release/` directory.

On Ubuntu or Debian build hosts, install `flatpak flatpak-builder rpm libarchive-tools xz-utils` and add the Flathub remote before running `npm run dist:linux`.

### GitHub Releases (CI)

Push a version tag to trigger automatic builds for all desktop platforms:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

The unified [desktop-build.yml](.github/workflows/desktop-build.yml) workflow builds Linux AppImage, Flatpak, RPM, and Pacman artifacts alongside Windows installers and macOS DMGs, then publishes them as a GitHub Release with auto-generated release notes.

The Linux AppImage remains the easiest direct download. The RPM artifact is the native installer path for Fedora, the Pacman artifact is the native installer path for Arch, and the Flatpak artifact is useful for Fedora and Arch systems already standardized on Flatpak.

For signed/notarized macOS DMGs, use [release-macos-signed.yml](.github/workflows/release-macos-signed.yml) (manual dispatch).

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server (web preview) |
| `npm run dev:desktop` | Electron desktop app with hot reload |
| `npm run build:web` | Production web build |
| `npm run preview` | Preview production build locally |
| `npm run start:desktop` | Build + launch Electron |
| `npm run dist:linux` | Build Linux AppImage, Flatpak, RPM, and Pacman artifacts |
| `npm run dist:appimage` | Build Linux AppImage |
| `npm run dist:flatpak` | Build Linux Flatpak bundle |
| `npm run dist:rpm` | Build Linux RPM package |
| `npm run dist:pacman` | Build Linux Pacman package |
| `npm run dist:win` | Build Windows NSIS installer |
| `npm run dist:mac` | Build macOS DMG |
| `npm run dist:mac:ci` | Build unsigned macOS DMG (CI) |
| `npm run dist:mac:signed` | Build signed/notarized macOS DMG |
| `npm test` | Run all tests |

---

## Architecture

```
salesdirector.jsx          → Main React application (single-file app)
electron/main.cjs          → Electron main process, IPC handlers
electron/preload.cjs       → Secure bridge (contextIsolation + sandbox)
utils/dataParsers.mjs      → CSV/AI parsing utilities
proxy-server.mjs           → Optional secure proxy server
src/main.jsx               → React entry point
src/App.jsx                → App wrapper
vite.config.mjs            → Vite build config (base: './' for Electron)
```

**IPC Bridge Pattern:** `main.cjs` registers handlers via `ipcMain.handle` → `preload.cjs` exposes via `contextBridge.exposeInMainWorld` → renderer accesses via `window.salesDirectorDesktop`.

---

## Security

- **Settings persist locally on-device.** AI provider keys, HubSpot token, mail credentials, and proxy settings survive restarts until you clear saved settings.
- **Encrypted at rest.** Local CRM data uses AES-256-GCM with a PBKDF2-derived key (250,000 iterations).
- **Passphrase never stored.** The app never saves your database passphrase.
- **Proxy mode available.** Keep vendor API keys server-side and use the client only for the proxy URL plus optional shared secret.
- **Sandboxed Electron.** Context isolation enabled, node integration disabled.

---

## Documentation

| Guide | Description |
|---|---|
| [FEATURES.md](FEATURES.md) | Complete feature list and capabilities |
| [SETUP.md](SETUP.md) | Installation, environment, and first-run configuration |
| [USER_MANUAL.md](USER_MANUAL.md) | Day-to-day workflows and feature usage |
| [ONBOARDING.md](ONBOARDING.md) | 15–30 minute new user onboarding |
| [TEAM_TRAINING_SOP.md](TEAM_TRAINING_SOP.md) | Trainer handout and onboarding runbook |
| [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md) | HubSpot token setup, scopes, and troubleshooting |
| [PROXY_SETUP.md](PROXY_SETUP.md) | Secure proxy server configuration |
| [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md) | Error matrix and issue triage |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Production launch and release gates |
| [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md) | macOS code signing and notarization |
| [SALES_FLYER_PROMPTS.md](SALES_FLYER_PROMPTS.md) | AI prompt outlines for generating sales collateral |

---

## Testing

```powershell
npm test
```

Tests cover CSV/AI parsing helpers, proxy validation, auth, CORS, body limits, and rate limits. The CI pipeline also runs a packaged Electron smoke test on Windows to verify the IPC bridge and renderer mounting.

---

## License

Copyright © 2026 Akita Engineering. All rights reserved.
