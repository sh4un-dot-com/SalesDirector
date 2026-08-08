# SalesDirector Troubleshooting & FAQ

Symptom → cause → fix for setup, AI providers (including OpenRouter and local LLMs), HubSpot, mail, proxy, and desktop packaging.

> Install: [SETUP.md](SETUP.md) · Usage: [USER_MANUAL.md](USER_MANUAL.md) · Proxy: [PROXY_SETUP.md](PROXY_SETUP.md) · HubSpot: [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md)

---

## Quick Triage Matrix

| Symptom | Likely cause | Fix |
|---|---|---|
| HubSpot sync fails immediately | Missing/invalid token | Recreate private app token; paste in Settings or `HUBSPOT_TOKEN` |
| HubSpot permission errors | Missing scopes | Add contact read + email write scopes; rotate token |
| AI “key missing” / not configured | Wrong provider selected or empty key | Match key field to **Active AI Provider** |
| OpenRouter fails | Bad key, model, or credits | Verify `sk-or-...`, model id, OpenRouter billing |
| Ollama/LM Studio fails in **browser** | CORS / no desktop bridge | Use `npm run dev:desktop` or packaged app |
| Ollama/LM Studio fails in **desktop** | Server down, wrong URL/model | Confirm server, `/v1` base URL, exact model name |
| Local provider “unsupported here” | Localhost without desktop | Launch desktop runtime |
| Proxy 401 | Shared secret mismatch | Align Settings secret with `PROXY_SHARED_SECRET` |
| Proxy 429 | Rate limit | Slow down or raise `RATE_LIMIT_*` |
| Proxy 500 `*_API_KEY is not configured` | Server env missing | Export key for that provider; restart proxy |
| CSV import 0 contacts | Bad/missing email column | Use `email` / `e-mail` with valid addresses |
| Email saved locally, not HubSpot | No `hubspotId` on composer | Draft from synced contact dossier |
| Encrypted DB controls disabled | Browser preview | Desktop mode only |
| Unlock fails | Wrong passphrase | Use original passphrase; no recovery if lost |
| White screen packaged app | Absolute asset paths | Ensure Vite `base: './'` |
| Build fails `@rollup/rollup-*-gnu` | Optional native dep | Re-run `npm install` on that platform |
| AI timeout toast | Slow model/network | Raise patience, switch model, check local GPU load |
| Queue stuck / buttons busy | AI queue still draining | Wait; avoid force-refresh mid-job if possible |

---

## AI Providers

### Why did AI stop working after I switched providers?

The **Active AI Provider** is global. Switching to OpenRouter or Local without filling model/base URL marks the provider not ready. Open Settings → complete fields → **Test Active Provider**.

### OpenRouter returns errors

Check:

1. Active provider is **OpenRouter**.  
2. OpenRouter API key is present (client or `OPENROUTER_API_KEY` on proxy).  
3. Model id is a valid OpenRouter slug (not an OpenAI-only id unless routed by OpenRouter).  
4. Account has credits / free model quota.  
5. Network can reach `https://openrouter.ai`.

### Ollama says connection failed

```bash
ollama list
curl http://127.0.0.1:11434/v1/models
```

If curl fails, start Ollama. In app:

- Base URL: `http://127.0.0.1:11434/v1`  
- Model: name from `ollama list`  
- Desktop app required  

### LM Studio works in its UI but not in SalesDirector

- Local server must be **started** (not only model loaded).  
- Base URL port must match LM Studio (often `1234`).  
- Model id must match the served model string exactly.  
- Use desktop app.

### Do local models need an API key?

Usually **no**. Leave the optional key blank. Some gateways require a dummy Bearer token—paste any non-empty string if the server demands `Authorization`.

### Proxy mode + local Ollama

The **proxy machine** must reach the base URL. `127.0.0.1` on the proxy means Ollama on the proxy host, not the salesperson’s laptop.

### Health check passed but Draft feels wrong

Health checks only verify transport + minimal completion. Quality depends on model, temperature, and context you paste into AI Context / dossier fields.

### AI actions seem ignored

Jobs are **queued** single-file. Watch the AI queue status; do not assume the second click cancelled the first.

---

## Encrypted Local Database

### Controls grayed out

You are in browser preview. Use:

```powershell
npm run dev:desktop
# or
npm run start:desktop
```

### Unlock fails after moving to desktop

Use the **same passphrase** as the legacy browser-encrypted payload. Successful unlock migrates data and removes the legacy payload.

### I forgot the passphrase

There is **no backdoor**. Settings keys may still exist in localStorage, but encrypted CRM/inbox/task payloads are unrecoverable. Create a new database (Reset) and re-import/sync contacts.

---

## HubSpot

### Configured but emails do not appear in HubSpot

Logging needs a contact association id (`hubspotId`). Flow:

1. Sync contacts.  
2. Open dossier.  
3. **Draft Outreach**.  
4. Send from AI Outreach.

Manual “To” addresses without a synced contact save **local** history only.

### Scope checklist

Minimum:

- `crm.objects.contacts.read`  
- `crm.objects.emails.write`  

After scope changes, **regenerate** the token. Details: [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md).

---

## Proxy

### Base URL set but calls fail

1. Process running (`node proxy-server.mjs`).  
2. URL reachable from the client machine.  
3. Shared secret match if enabled.  
4. Env has keys for the active provider.  
5. Capture `X-Request-Id` from failed responses.

Full guide: [PROXY_SETUP.md](PROXY_SETUP.md).

### CORS errors only in browser

Set `CORS_ORIGIN` to your Vite origin or use the desktop app (no browser CORS for IPC desktop AI).

---

## Mail (SMTP / IMAP)

### System Health says SMTP/IMAP not ready

SMTP readiness expects host, user, and password (or OAuth success).  
IMAP readiness expects host and port (plus auth as configured).

Fill Settings fields and re-check. Desktop required for real IMAP sync IPC.

### OAuth login fails

OAuth mail flows need the **desktop** runtime and correct client id / tenant / Google client secret fields.

---

## Packaging & Build

### White screen after install

Confirm production build uses relative base:

```js
// vite.config.mjs
base: './'
```

Rebuild installers after fixing.

### Optional dependency / Rollup errors

```powershell
npm install
```

Platform-specific Rollup native packages must match your OS/arch.

### macOS “app is damaged” / blocked

Unsigned builds need **Open Anyway** or a signed/notarized DMG — [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md).

---

## Settings & Config

### How do I wipe settings without editing project files?

Settings → **Clear Saved Local Settings**. This clears device-persisted config (keys, mail, proxy). Use encrypted DB **Reset** to wipe CRM data.

### Settings not sticking

Private browsing / locked-down storage can block localStorage. Use a normal desktop profile.

---

## Escalation Path

1. Reproduce with exact steps, active tab, and active AI provider.  
2. Note **direct vs proxy**, desktop vs browser.  
3. Copy toast error text and proxy `X-Request-Id` if any.  
4. Check [SETUP.md](SETUP.md), [PROXY_SETUP.md](PROXY_SETUP.md), [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md).  
5. Run `npm test` on a dev machine if you changed code.  
6. Open an issue with expected vs actual behavior and OS/app version (About tab).

Support: [support@akitaengineering.com](mailto:support@akitaengineering.com)
