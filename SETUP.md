# SalesDirector Setup & Installation Guide

Complete installation, first-run configuration, AI routing, packaging, and environment reference for SalesDirector.

> **Day-to-day usage:** [USER_MANUAL.md](USER_MANUAL.md)  
> **Full feature list:** [FEATURES.md](FEATURES.md)  
> **Nontechnical Mac user:** [MACBOOK_HANDOFF.md](MACBOOK_HANDOFF.md)  
> **Proxy secrets:** [PROXY_SETUP.md](PROXY_SETUP.md)  
> **HubSpot tokens:** [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md)  
> **Problems:** [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md)

---

## Table of Contents

1. [What You Are Installing](#1-what-you-are-installing)
2. [Prerequisites](#2-prerequisites)
3. [Install From Source (Developers)](#3-install-from-source-developers)
4. [Install From Prebuilt Packages](#4-install-from-prebuilt-packages)
5. [First-Run Walkthrough](#5-first-run-walkthrough)
6. [AI Provider Setup (Cloud, OpenRouter, Local LLMs)](#6-ai-provider-setup-cloud-openrouter-local-llms)
7. [Direct Mode vs Proxy Mode](#7-direct-mode-vs-proxy-mode)
8. [Encrypted Local Database](#8-encrypted-local-database)
9. [Mail (SMTP / IMAP / OAuth)](#9-mail-smtp--imap--oauth)
10. [HubSpot](#10-hubspot)
11. [Firebase (Optional)](#11-firebase-optional)
12. [Desktop Packaging](#12-desktop-packaging)
13. [Verification Checklist](#13-verification-checklist)
14. [Troubleshooting During Setup](#14-troubleshooting-during-setup)

---

## 1. What You Are Installing

SalesDirector is an **AI-assisted sales command center** that runs as:

| Mode | Command / Artifact | Encrypted local DB | Mail IPC | Best for |
|---|---|---|---|---|
| **Desktop (dev)** | `npm run dev:desktop` | Yes | Yes | Daily work, full features |
| **Desktop (prod launch)** | `npm run start:desktop` | Yes | Yes | Local production smoke test |
| **Packaged installer** | `dist:win` / `dist:mac` / `dist:linux*` | Yes | Yes | End-user distribution |
| **Web preview** | `npm run dev` | No | No | UI-only development |

**Always use desktop mode for real work.** Browser preview cannot unlock the encrypted local database or talk to localhost LLMs without CORS friction.

---

## 2. Prerequisites

### Required

| Tool | Minimum | Notes |
|---|---|---|
| **Node.js** | 20+ | 22 LTS recommended |
| **npm** | 10+ | Ships with Node |
| **OS** | Windows 10+, macOS 12+, or modern Linux | Electron 32 runtime |

### Optional (by feature)

| Feature | You need |
|---|---|
| Cloud AI (Gemini / OpenAI / Anthropic / xAI) | Provider API key |
| OpenRouter | OpenRouter API key + model id |
| Local AI (Ollama / LM Studio) | Local server running + model loaded |
| HubSpot CRM sync | Private app token with contact/email scopes |
| Smart Inbox (IMAP) | IMAP host + credentials or OAuth |
| Outbound SMTP send | SMTP host + credentials or OAuth |
| Proxy-managed secrets | Running `proxy-server.mjs` with env vars |
| Signed macOS builds | Apple Developer certs — [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md) |

### Linux packaging extras (only if building packages)

On Ubuntu/Debian build hosts for full Linux matrix:

```bash
sudo apt-get update
sudo apt-get install -y flatpak flatpak-builder rpm libarchive-tools xz-utils
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

---

## 3. Install From Source (Developers)

### 3.1 Clone and install

```powershell
git clone https://github.com/sh4un-dot-com/SalesDirector.git
cd SalesDirector
npm install
```

If `npm run build:web` fails with a missing `@rollup/rollup-linux-x64-gnu` (or similar platform optional dependency), reinstall:

```powershell
npm install
# or specifically:
npm install @rollup/rollup-linux-x64-gnu --no-save
```

### 3.2 Start the app

**Desktop with hot reload (recommended):**

```powershell
npm run dev:desktop
```

This starts Vite on `http://127.0.0.1:5173` and launches Electron against it.

**Web preview only:**

```powershell
npm run dev
```

**Production assets + Electron:**

```powershell
npm run start:desktop
```

### 3.3 Run tests

```powershell
npm test
```

Tests cover CSV/AI parsing, CRM/inbox workflow helpers, proxy validation, CORS, body limits, rate limits, and OpenRouter / OpenAI-compatible provider validation.

---

## 4. Install From Prebuilt Packages

### 4.1 GitHub Releases

1. Open the project Releases page on GitHub.
2. Download the artifact for your OS:

| Platform | Artifact pattern |
|---|---|
| Windows | `SalesDirector-*-Setup.exe` |
| macOS | `SalesDirector-*-*.dmg` |
| Linux AppImage | `SalesDirector-*-*.AppImage` |
| Linux RPM | `SalesDirector-*-*.rpm` |
| Linux Pacman | `SalesDirector-*-*.pacman` / Arch package |
| Linux Flatpak | `SalesDirector-*-*.flatpak` |

### 4.2 Windows

1. Run the NSIS installer.
2. Choose install directory if prompted (`allowToChangeInstallationDirectory` is enabled).
3. Launch **SalesDirector** from the Start Menu.
4. Complete [First-Run Walkthrough](#5-first-run-walkthrough).

### 4.3 macOS

1. Open the DMG.
2. Drag SalesDirector into Applications.
3. First launch may require **System Settings → Privacy & Security → Open Anyway** if the build is unsigned.
4. For notarized builds, use the signed release workflow — [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md).

### 4.4 Linux

**AppImage (easiest):**

```bash
chmod +x SalesDirector-*.AppImage
./SalesDirector-*.AppImage
```

**RPM (Fedora / RHEL family):**

```bash
sudo rpm -i SalesDirector-*.rpm
# or
sudo dnf install ./SalesDirector-*.rpm
```

**Pacman (Arch):**

```bash
sudo pacman -U SalesDirector-*.pacman
```

**Flatpak:**

```bash
flatpak install --user ./SalesDirector-*.flatpak
flatpak run com.akitaengineering.salesdirector
```

(Exact Flatpak app id may match `appId` in `package.json`: `com.akitaengineering.salesdirector`.)

---

## 5. First-Run Walkthrough

Open **Settings** and complete these steps **in order**. The page auto-saves as you type.

### Step 1 — Encrypted local database

1. Find **Encrypted Local Database**.
2. Enter a passphrase (**minimum 8 characters**).
3. Click **Create and Unlock** (first time) or **Unlock Database** (returning).
4. Confirm the status shows unlocked and autosaving.

**Critical:** The passphrase is **never stored**. If you lose it, local CRM/inbox/task data cannot be recovered.

### Step 2 — Sender profile

1. Set **Your Name** (drives header avatar initials and signature context).
2. Set **Reply-To Email Address** (must be a valid email).
3. Optionally set **Auto-BCC** for a logging mailbox.
4. Customize **Email Signature** (appended to outbound sends).

### Step 3 — Company context

Set **Company Website URL** (e.g. `https://www.akitaengineering.com`). AI uses this for product-aware outreach.

### Step 4 — Connect AI

Pick one path:

| Path | When to use | What to configure |
|---|---|---|
| **Gemini (default)** | Fastest cloud start | Gemini API key |
| **OpenAI / Anthropic / xAI** | Prefer those models | Matching API key |
| **OpenRouter** | One key, many models | OpenRouter key + model id |
| **Local / OpenAI-compatible** | Privacy, offline, Ollama/LM Studio | Base URL + model id (desktop) |
| **Proxy mode** | Keys must stay server-side | Proxy Base URL (+ secret) |

Details: [§6 AI Provider Setup](#6-ai-provider-setup-cloud-openrouter-local-llms).

Click **Test Active Provider** and confirm status **Passed**.

### Step 5 — Load contacts

In **CRM & Contacts**:

- **Sync HubSpot**, or
- **Import CSV**, or
- **Add Contact** manually.

### Step 6 — Optional mailbox

Configure SMTP/IMAP only if you need Smart Inbox sync and/or real outbound send. See [§9](#9-mail-smtp--imap--oauth).

### Step 7 — Confirm System Health

At the top of Settings, verify readiness indicators for:

- Auth Session
- Local Encrypted DB (unlocked)
- AI Access (selected provider ready)
- HubSpot (if using)
- SMTP / IMAP (if using)

---

## 6. AI Provider Setup (Cloud, OpenRouter, Local LLMs)

SalesDirector supports multiple AI backends. Settings → **AI Routing & Provider Keys**.

### 6.1 Provider matrix

| Provider | Auth | Model field | Default endpoint | Browser direct | Desktop |
|---|---|---|---|---|---|
| **Gemini** | API key | Fixed (`gemini-2.5-flash`) | Google AI | Yes | Yes |
| **OpenAI** | API key | Fixed (`gpt-4.1-mini`) | `api.openai.com/v1` | Yes | Yes |
| **Anthropic** | API key | Fixed (`claude-3-5-sonnet-latest`) | Anthropic API | Yes | Yes |
| **xAI** | API key | Fixed (`grok-2-latest`) | `api.x.ai/v1` | Yes | Yes |
| **OpenRouter** | API key | **User-set model id** | `openrouter.ai/api/v1` | Yes | Yes |
| **Local / OpenAI-compatible** | Optional key | **User-set model id** | User base URL | Localhost often blocked (CORS) | **Yes (recommended)** |

### 6.2 Shared generation profile

Under AI defaults (temperature, top-p, max output tokens):

| Setting | Range | Default | Purpose |
|---|---|---|---|
| Temperature | 0–1.5 | 0.7 | Creativity vs consistency |
| Top-p | 0–1 | 0.9 | Nucleus sampling |
| Max output tokens | 256–8192 | 8192 | Long drafts / continuations |

These apply to all providers when the backend supports them.

### 6.3 Gemini / OpenAI / Anthropic / xAI

1. Select the provider in **Active AI Provider**.
2. Paste the matching API key.
3. Click **Test Active Provider**.

### 6.4 OpenRouter

1. Create a key at [openrouter.ai](https://openrouter.ai).
2. Select **OpenRouter**.
3. Paste **OpenRouter API Key**.
4. Set **OpenRouter Model** to any OpenRouter model id, for example:
   - `openai/gpt-4o-mini`
   - `anthropic/claude-3.5-sonnet`
   - `meta-llama/llama-3.1-8b-instruct:free`
5. Test the provider.

### 6.5 Local LLMs (Ollama)

1. Install [Ollama](https://ollama.com) and pull a model:

```bash
ollama pull llama3.2
ollama serve   # if not already running
```

2. In SalesDirector (desktop):
   - Active provider → **Local / OpenAI-compatible**
   - Click **Ollama** preset (or set base URL `http://127.0.0.1:11434/v1`)
   - Model ID → `llama3.2` (must match a pulled model)
   - API key → leave blank
3. **Test Active Provider**.

### 6.6 Local LLMs (LM Studio)

1. Open LM Studio → load a model → start the local server (OpenAI-compatible).
2. Default is often `http://127.0.0.1:1234/v1`.
3. In SalesDirector:
   - Click **LM Studio** preset
   - Set **Model ID** to the exact model name shown in LM Studio
   - API key optional (some builds accept any string)
4. Test the provider.

### 6.7 Custom OpenAI-compatible servers

Works with vLLM, LocalAI, text-generation-webui (OpenAI mode), cloud gateways, etc.

1. Base URL must be the OpenAI root, usually ending in `/v1`.
2. SalesDirector calls `{baseUrl}/chat/completions`.
3. If you paste a host without a path (`http://127.0.0.1:8000`), the app normalizes to `.../v1`.

### 6.8 AI readiness tools

- **AI Readiness Report** — ready / supported / keys / live check counts
- **Test Active Provider** — single health check
- **Test All Providers** — parity check across supported backends
- Toasts and status badges show pass/fail with response preview

### 6.9 AI queue behavior

AI actions run **one at a time**. Extra clicks queue instead of cancelling the active job. Watch the queue status indicator while long generations run.

---

## 7. Direct Mode vs Proxy Mode

### Direct mode (default for individuals)

- Keys and local endpoint settings live **on this device** in localStorage (settings) and encrypted DB (CRM data).
- Fastest setup.
- Use when you control the workstation.

### Proxy mode (teams / secret control)

1. Run the proxy with server-side env vars — full guide: [PROXY_SETUP.md](PROXY_SETUP.md).

```powershell
$env:GEMINI_API_KEY="..."
$env:OPENROUTER_API_KEY="..."
$env:OPENAI_COMPATIBLE_BASE_URL="http://127.0.0.1:11434/v1"
$env:OPENAI_COMPATIBLE_MODEL="llama3.2"
$env:HUBSPOT_TOKEN="..."
$env:PROXY_SHARED_SECRET="optional-strong-secret"
node proxy-server.mjs
```

2. In app Settings:
   - **Proxy Base URL** → e.g. `http://localhost:8787`
   - **Proxy Shared Secret** → same as server (if set)
3. Leave vendor API keys empty in the client when the proxy owns them.
4. Local Ollama via proxy only works if the **proxy host** can reach that Ollama URL.

---

## 8. Encrypted Local Database

| Action | When |
|---|---|
| **Create and Unlock** | First desktop session |
| **Unlock Database** | Every cold start (passphrase re-entry) |
| **Lock Database** | Step away from a shared machine |
| **Reset** | Wipe local encrypted CRM data on this device |

**Details:**

- Algorithm: AES-256-GCM
- Key derivation: PBKDF2, 250,000 iterations
- Autosave of contacts, threads, tasks, inbox after unlock
- Legacy browser-encrypted payloads migrate on first successful desktop unlock
- Browser preview: controls disabled by design

---

## 9. Mail (SMTP / IMAP / OAuth)

### Basic SMTP (outbound)

| Field | Example |
|---|---|
| Host | `smtp.office365.com` / `smtp.gmail.com` |
| Port | `587` (STARTTLS) or `465` (SSL) |
| Security | TLS / SSL / None |
| User | Full email address |
| Pass | App password or account password |

### IMAP (Smart Inbox)

| Field | Example |
|---|---|
| Host | `outlook.office365.com` / `imap.gmail.com` |
| Port | `993` |
| Folder | `INBOX` |
| Lookback days / sync limit | Tune volume |
| Auto-sync | Optional interval |

### OAuth2 (Microsoft / Google)

Configure OAuth client IDs in Settings when using modern mailbox auth. Desktop runtime is required for the OAuth device/browser flow. Use **Test IMAP** / **Test SMTP** where available after configuration.

---

## 10. HubSpot

1. Create a HubSpot private app with at least:
   - `crm.objects.contacts.read`
   - `crm.objects.emails.write` (for engagement logging)
2. Paste token in Settings **or** set `HUBSPOT_TOKEN` on the proxy.
3. In **CRM & Contacts**, click **Sync HubSpot**.
4. Prefer **Draft Outreach** from a synced contact so HubSpot logging receives a contact association id.

Full scope notes: [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md).

---

## 11. Firebase (Optional)

Standalone desktop use with encrypted local storage **does not require Firebase**.

If you inject cloud config, the runtime reads:

- `__firebase_config`
- `__initial_auth_token`
- `__app_id`

Without valid Firebase config, the app runs in **local development fallback** with a local user id.

---

## 12. Desktop Packaging

### Build commands

```powershell
npm run build:web          # web assets only
npm run dist:win           # Windows NSIS installer
npm run dist:mac           # macOS DMG
npm run dist:linux         # AppImage + Flatpak + RPM + Pacman
npm run dist:appimage      # AppImage only
npm run dist:flatpak       # Flatpak only
npm run dist:rpm           # RPM only
npm run dist:pacman        # Pacman only
```

Artifacts land in `release/`.

### CI

- Push tag `v1.0.0` → [desktop-build.yml](.github/workflows/desktop-build.yml) publishes multi-platform GitHub Release assets.
- Signed macOS: [release-macos-signed.yml](.github/workflows/release-macos-signed.yml) + [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md).
- Before shipping: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

---

## 13. Verification Checklist

Use this after any fresh install:

- [ ] App launches in desktop mode without a white screen
- [ ] Encrypted DB unlocks with passphrase
- [ ] Settings auto-save indicator appears after an edit
- [ ] Active AI provider **Test** returns Passed
- [ ] At least one contact exists (CSV / HubSpot / manual)
- [ ] AI Outreach **Draft** produces a body
- [ ] Dark mode toggle persists after restart
- [ ] (Optional) HubSpot sync returns contacts
- [ ] (Optional) IMAP sync pulls inbox rows
- [ ] (Optional) SMTP test succeeds
- [ ] `npm test` is green on developer machines

---

## 14. Troubleshooting During Setup

| Symptom | Fix |
|---|---|
| Encrypted DB controls disabled | Use desktop mode, not browser preview |
| White screen in packaged app | Confirm `vite.config.mjs` has `base: './'` |
| AI key errors | Key for active provider, or proxy env + Proxy Base URL |
| Local LLM fails in browser | Use desktop app; localhost CORS blocks browser |
| Local LLM fails in desktop | Confirm Ollama/LM Studio running; model name exact; base URL ends with `/v1` |
| OpenRouter 401 | Invalid or missing OpenRouter key |
| Proxy 401 | Shared secret mismatch |
| HubSpot sync fails | Token + scopes — [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md) |
| Rollup native module missing | Re-run `npm install` for your platform |
| Firestore/auth noise in console | Normal in local-only mode without Firebase |

Expanded matrix: [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).

---

## Related Documentation

| Doc | Purpose |
|---|---|
| [USER_MANUAL.md](USER_MANUAL.md) | Full product usage guide |
| [ONBOARDING.md](ONBOARDING.md) | Role-based first day |
| [TEAM_TRAINING_SOP.md](TEAM_TRAINING_SOP.md) | 30-minute trainer script |
| [PROXY_SETUP.md](PROXY_SETUP.md) | Server-side secrets proxy |
| [FEATURES.md](FEATURES.md) | Capability inventory |
| [README.md](README.md) | Project overview |
