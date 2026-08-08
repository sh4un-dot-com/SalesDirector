# SalesDirector Onboarding Guide

Timed paths to get a new user productive. Pair this with the trainer script [TEAM_TRAINING_SOP.md](TEAM_TRAINING_SOP.md).

> **Install first:** [SETUP.md](SETUP.md)  
> **Nontechnical Mac user:** [MACBOOK_HANDOFF.md](MACBOOK_HANDOFF.md)  
> **Daily reference:** [USER_MANUAL.md](USER_MANUAL.md)

---

## Storage Model (read this once)

- **Desktop runtime** owns encrypted local CRM/inbox/task storage.  
- **Browser preview** is UI-only; encrypted DB controls are disabled.  
- Legacy browser-encrypted payloads migrate on first successful desktop unlock with the correct passphrase.  
- Settings (AI keys, mail, proxy URL) persist on-device via local storage until cleared.

---

## Who This Is For

| Role | Goal |
|---|---|
| Sales Rep | Send one high-quality outbound with history |
| Sales Manager | Standardize daily rhythm and quality |
| RevOps / Admin | Credential strategy, integrations, ship readiness |

---

## 5-Minute Environment Preflight

### Developers / technical setup

```powershell
npm install
npm run dev:desktop
```

Optional UI-only:

```powershell
npm run dev
```

### Packaged app users

Install the OS-specific package from Releases ([SETUP.md §4](SETUP.md#4-install-from-prebuilt-packages)), launch SalesDirector, continue below.

### Preflight checks in Settings

1. Unlock **Encrypted Local Database** (passphrase ≥ 8 characters).  
2. Confirm System Health for:
   - Auth Session  
   - Local Encrypted DB (unlocked)  
   - **AI Access** (selected provider ready — Gemini, OpenRouter, local LLM, etc.)  
   - HubSpot (if used)  
   - SMTP / IMAP (if used)  
3. Click **Test Active Provider** once.

---

## Choose an AI Path (2 minutes)

| Path | Configure | Best for |
|---|---|---|
| **Gemini** | Gemini API key | Fastest cloud start |
| **OpenRouter** | OpenRouter key + model id | Many models, one key |
| **Local (Ollama/LM Studio)** | Base URL + model (desktop) | Private / offline |
| **Proxy** | Proxy Base URL (+ secret) | Keys stay on server |

Full matrix: [USER_MANUAL.md §11](USER_MANUAL.md#11-ai-providers-in-depth) and [SETUP.md §6](SETUP.md#6-ai-provider-setup-cloud-openrouter-local-llms).

---

## Sales Rep Path (15–20 minutes)

### 1. Identity (3 min)

Settings:

- Your Name  
- Reply-To  
- Signature  
- Company Website URL  

### 2. AI (3 min)

- Select provider and complete key/model/base URL.  
- **Test Active Provider** → Passed.  

### 3. Contacts (4 min)

CRM & Contacts:

- Sync HubSpot **or** Import CSV **or** Add Contact.  
- Open one dossier; confirm timeline area loads.  

### 4. Outreach (5 min)

From dossier → **Draft Outreach**:

- Generate **Draft** + **Suggest Subjects**.  
- Optionally **Pre-Send Check**.  
- Send (or copy body if SMTP not ready).  
- Confirm thread history updated on the dossier.  

### 5. Inbox (3 min)

Smart Inbox:

- Sync if configured.  
- **Analyze & Score**.  
- Open top warm/hot item → reply path.  

### Success criteria

- [ ] Database unlocks every launch  
- [ ] AI test passes  
- [ ] One contact exists  
- [ ] One outbound draft/history entry exists  
- [ ] You know where Tasks & Calendar lives for follow-ups  

---

## Sales Manager Path (20–25 minutes)

1. **Rep readiness** — every rep has sender profile, safety limits, and a working AI path.  
2. **Tone defaults** — set Default Tone / Length before a campaign.  
3. **Pipeline discipline** — drafts start from dossiers, not blank To fields.  
4. **Dashboard ritual** — show Revenue Brief + Rescue At-Risk Deals in standup.  
5. **Inbox ritual** — score-first triage.  
6. **Docs** — hand out USER_MANUAL + TROUBLESHOOTING_FAQ.  

### Success criteria

- [ ] Team can run a repeatable daily cycle without admin help  
- [ ] At-risk deals have next steps or tasks  

---

## RevOps / Admin Path (30–45 minutes)

### 1. Credential strategy

| Mode | Action |
|---|---|
| Direct | Keys on device; acceptable for trusted laptops |
| Proxy | Deploy `proxy-server.mjs` — [PROXY_SETUP.md](PROXY_SETUP.md) |

### 2. Integrations

- HubSpot private app + scopes — [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md)  
- One successful contact sync  
- One outbound with HubSpot log (from synced contact)  

### 3. AI policy

Document allowed providers:

- Cloud only / OpenRouter allowed / local only  
- Approved model ids  
- Whether proxy must be used  

### 4. Mail policy

SMTP/IMAP/OAuth ownership, app passwords vs OAuth apps.

### 5. Release readiness

- No secrets in git  
- [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)  
- Packaging notes [SETUP.md §12](SETUP.md#12-desktop-packaging)  
- macOS signing if needed [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md)  

### Success criteria

- [ ] Golden workstation checklist green  
- [ ] Incident path known (TROUBLESHOOTING + support email)  
- [ ] Backup/export plan for contacts (HubSpot or CSV) understood  

---

## Trainer Session

For a live 30-minute classroom, use [TEAM_TRAINING_SOP.md](TEAM_TRAINING_SOP.md) as the script. This onboarding doc is the self-serve version of the same outcomes.

---

## Common First-Day Problems

| Problem | Jump to |
|---|---|
| HubSpot sync fails | [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md) |
| AI generation fails | [TROUBLESHOOTING_FAQ.md — AI Providers](TROUBLESHOOTING_FAQ.md#ai-providers) |
| Local LLM in browser | Use desktop mode |
| Proxy 401 | Shared secret — [PROXY_SETUP.md](PROXY_SETUP.md) |
| Encrypted DB disabled | Desktop only — [SETUP.md](SETUP.md) |

---

## Next Reading

| Doc | Why |
|---|---|
| [SETUP.md](SETUP.md) | Full install depth |
| [USER_MANUAL.md](USER_MANUAL.md) | Every tab and workflow |
| [FEATURES.md](FEATURES.md) | Capability inventory |
| [PROXY_SETUP.md](PROXY_SETUP.md) | Server-side keys |
| [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md) | Symptom matrix |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Ship gates |
