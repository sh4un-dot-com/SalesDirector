# SalesDirector Onboarding Guide

This is the fastest path to get a new user productive in SalesDirector.

If you are running a live onboarding session, use [TEAM_TRAINING_SOP.md](TEAM_TRAINING_SOP.md) as the one-page trainer script.

If the new user is nontechnical and installing on a MacBook, give them [MACBOOK_HANDOFF.md](MACBOOK_HANDOFF.md) first.

## Release Update: Local Storage Model

- Local data persistence now uses desktop-only encrypted storage in Electron runtime.
- Browser preview is still useful for UI checks, but encrypted local DB controls are disabled there.
- On first desktop unlock, legacy browser-encrypted local payloads are migrated automatically when decrypted with the correct passphrase.

## Who Should Use This

- New Sales Reps starting outreach
- Sales Managers standardizing team workflow
- RevOps and Admin users owning setup and reliability

## 5-Minute Environment Preflight

1. Install dependencies.

```powershell
npm install
```

2. Start app in desktop mode (recommended).

```powershell
npm run dev:desktop
```

3. Optional: start web preview mode for UI-only checks.

```powershell
npm run dev
```

4. Open Settings and unlock Encrypted Local Database with passphrase.

5. Confirm System Health indicators for:

- Auth Session
- Local Encrypted DB
- Gemini AI Access or Proxy Mode
- HubSpot Integration
- SMTP and IMAP readiness (if required for your workflow)

## Role Paths

### Sales Rep Path (15 Minutes)

1. Settings
- Set sender name, reply-to, and signature.
- Confirm AI access (key or proxy).

2. Contacts
- Sync from HubSpot or import CSV.
- Open one contact dossier.

3. Outreach
- Click Draft Outreach from dossier.
- Generate draft and subject options.
- Send and verify thread history updated.

4. Inbox
- Run Analyze and Score Inbox.
- Prioritize top-scoring replies.

Success criteria:
- You can send one complete outbound thread with saved history.

### Sales Manager Path (20 Minutes)

1. Review rep setup
- Confirm sender profile and safety limits are configured.
- Confirm consistent tone and length defaults.

2. Pipeline discipline
- Ensure reps launch drafting from contact dossiers.
- Ensure Smart Inbox scoring is used for daily prioritization.

3. Documentation handoff
- Share [USER_MANUAL.md](USER_MANUAL.md) with team.
- Share [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md) for self-service support.

Success criteria:
- Team can run a repeatable daily outreach cycle with consistent quality.

### RevOps and Admin Path (30 Minutes)

1. Choose credential strategy
- Direct mode for fast local use, or
- Proxy mode for better secret control.

2. Integrations
- Configure HubSpot private app token and scopes.
- Validate one successful contact sync and one logged outbound interaction.

3. Security and release readiness
- Confirm sensitive secrets are not committed.
- Run through [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

4. Packaging (if desktop distribution needed)
- Follow [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md).

Success criteria:
- Integration, security, and release controls are validated for production usage.

## Common First-Day Problems

- HubSpot sync fails: verify token and scopes in [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md).
- AI generation fails: verify Gemini key or proxy configuration.
- Proxy 401: verify shared secret match.

Use [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md) for full symptom-to-fix mapping.

## Next Reading

- Full setup: [SETUP.md](SETUP.md)
- Daily usage: [USER_MANUAL.md](USER_MANUAL.md)
- HubSpot details: [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md)
- Proxy hardening: [PROXY_SETUP.md](PROXY_SETUP.md)
- Release gates: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
