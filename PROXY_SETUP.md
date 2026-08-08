# SalesDirector Proxy Setup Guide

Run a small Node HTTP proxy so **vendor API keys and HubSpot tokens stay on the server**. The desktop/web client only needs the proxy base URL and optional shared secret.

> App setup: [SETUP.md](SETUP.md) · Usage: [USER_MANUAL.md](USER_MANUAL.md) · Failures: [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md)

---

## Table of Contents

1. [When to Use Proxy Mode](#1-when-to-use-proxy-mode)
2. [Architecture](#2-architecture)
3. [Environment Variables](#3-environment-variables)
4. [Start the Proxy](#4-start-the-proxy)
5. [Configure the App](#5-configure-the-app)
6. [Routes Reference](#6-routes-reference)
7. [OpenRouter & Local LLMs Through the Proxy](#7-openrouter--local-llms-through-the-proxy)
8. [Security Hardening](#8-security-hardening)
9. [Operations & Logging](#9-operations--logging)
10. [Verification](#10-verification)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. When to Use Proxy Mode

| Use proxy when… | Prefer direct mode when… |
|---|---|
| Laptops must not store vendor API keys | Solo operator on a trusted machine |
| One shared Gemini/OpenRouter bill | Rapid prototyping |
| HubSpot token should not sit in client localStorage | No server available |
| You need centralized rate limits / request logs | Local-only Ollama on the same desktop (direct desktop path is simpler) |

You can still set **Proxy Base URL** and keep some client fields empty. The client will route AI and HubSpot calls through `/api/*` on the proxy.

---

## 2. Architecture

```
┌─────────────────────┐     HTTPS/HTTP      ┌──────────────────┐     Provider APIs
│  SalesDirector app  │ ──────────────────► │ proxy-server.mjs │ ──────────────────►
│  (Electron/browser) │  x-proxy-secret     │  :8787 default   │  Gemini/OpenAI/...
└─────────────────────┘                     └──────────────────┘  OpenRouter/Ollama
                                                                   HubSpot
```

- Client sends `provider`, `promptText`, optional `model` / `baseUrl`, generation profile.
- Proxy attaches **server-side** API keys and forwards.
- Rate limits and body size caps apply per route and client IP.

---

## 3. Environment Variables

### Core

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | No | `8787` | Listen port |
| `PROXY_SHARED_SECRET` | Recommended | empty | If set, clients must send matching `x-proxy-secret` |
| `CORS_ORIGIN` | No | `*` | Allowed browser origin |
| `LOG_LEVEL` | No | `info` | `debug` / `info` / `warn` / `error` / `silent` |

### AI providers

| Variable | Provider | Notes |
|---|---|---|
| `GEMINI_API_KEY` | gemini | Default cloud path |
| `OPENAI_API_KEY` | openai | |
| `ANTHROPIC_API_KEY` | anthropic | |
| `XAI_API_KEY` | xai | |
| `OPENROUTER_API_KEY` | openrouter | Required for OpenRouter via proxy |
| `OPENROUTER_MODEL` | openrouter | Default model if client omits `model` |
| `OPENROUTER_BASE_URL` | openrouter | Default `https://openrouter.ai/api/v1` |
| `OPENAI_COMPATIBLE_BASE_URL` | openai_compatible | e.g. Ollama `http://127.0.0.1:11434/v1` |
| `OPENAI_COMPATIBLE_MODEL` | openai_compatible | Required unless client sends `model` |
| `OPENAI_COMPATIBLE_API_KEY` | openai_compatible | Optional for local servers |
| `META_API_KEY` | meta | Reserved; routing not available yet |

### HubSpot

| Variable | Purpose |
|---|---|
| `HUBSPOT_TOKEN` | Private app token for contacts + email routes |

### Limits

| Variable | Default | Purpose |
|---|---|---|
| `MAX_BODY_BYTES` | `1048576` (1 MB) | Request body cap |
| `MAX_PROMPT_CHARS` | `25000` | AI prompt cap |
| `MAX_CONTACT_PROPERTIES` | `50` | HubSpot property query cap |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window for rate limits |
| `RATE_LIMIT_GEMINI` | `20` | Also applied to `POST /api/ai` |
| `RATE_LIMIT_HUBSPOT_CONTACTS` | `40` | |
| `RATE_LIMIT_HUBSPOT_EMAILS` | `30` | |

### Example (PowerShell)

```powershell
$env:PORT="8787"
$env:PROXY_SHARED_SECRET="replace-with-long-random-string"
$env:GEMINI_API_KEY="your_gemini_key"
$env:OPENAI_API_KEY="your_openai_key"
$env:ANTHROPIC_API_KEY="your_anthropic_key"
$env:XAI_API_KEY="your_xai_key"
$env:OPENROUTER_API_KEY="sk-or-..."
$env:OPENROUTER_MODEL="openai/gpt-4o-mini"
$env:OPENAI_COMPATIBLE_BASE_URL="http://127.0.0.1:11434/v1"
$env:OPENAI_COMPATIBLE_MODEL="llama3.2"
$env:HUBSPOT_TOKEN="your_hubspot_token"
$env:LOG_LEVEL="info"
$env:CORS_ORIGIN="http://127.0.0.1:5173"
```

### Example (bash)

```bash
export PORT=8787
export PROXY_SHARED_SECRET='replace-with-long-random-string'
export GEMINI_API_KEY='...'
export OPENROUTER_API_KEY='...'
export OPENROUTER_MODEL='openai/gpt-4o-mini'
export OPENAI_COMPATIBLE_BASE_URL='http://127.0.0.1:11434/v1'
export OPENAI_COMPATIBLE_MODEL='llama3.2'
export HUBSPOT_TOKEN='...'
node proxy-server.mjs
```

---

## 4. Start the Proxy

From the repo root:

```powershell
node proxy-server.mjs
```

You should see structured JSON logs for requests when `LOG_LEVEL` allows it. Keep the process running (systemd, Docker, PM2, or a terminal session).

**Do not commit** real keys. Prefer environment injection or a secret manager.

---

## 5. Configure the App

In **Settings → Secure Proxy Routing**:

1. **Proxy Base URL** → `http://localhost:8787` (or your public reverse-proxy URL).
2. **Proxy Shared Secret** → same value as `PROXY_SHARED_SECRET` (if used).
3. Select the **Active AI Provider** that the proxy has keys for.
4. For OpenRouter / local compatible, you may still send **model** (and local **baseUrl**) from the client; keys remain server-side when env is set.
5. Leave client vendor key fields empty when the proxy owns secrets.
6. Click **Test Active Provider**.

When Proxy Base URL is set, the app treats AI as **proxy-managed** for readiness (server will still error if the matching env key is missing).

---

## 6. Routes Reference

| Method | Path | Purpose |
|---|---|---|
| `OPTIONS` | any API route | CORS preflight |
| `POST` | `/api/ai` | Multi-provider generation (`provider` in body) |
| `POST` | `/api/gemini` | Legacy Gemini-oriented path (still validated) |
| `GET` | `/api/hubspot/contacts?properties=...` | Contact list |
| `GET` | `/api/hubspot/emails?...` | Email engagement list |
| `POST` | `/api/hubspot/emails` | Log outbound email engagement |

### `POST /api/ai` body (JSON)

| Field | Type | Notes |
|---|---|---|
| `provider` | string | `gemini`, `openai`, `anthropic`, `xai`, `openrouter`, `openai_compatible` |
| `promptText` | string | Required, non-empty, max `MAX_PROMPT_CHARS` |
| `systemInstruction` | object | Optional `{ parts: [{ text }] }` |
| `generationProfile` | object | Optional `{ temperature, topP, maxOutputTokens }` |
| `model` | string | Optional override (OpenRouter / compatible / others when allowed) |
| `baseUrl` | string | Optional OpenAI-compatible base (`http://` or `https://`) |

**Success:** `{ "provider": "...", "text": "..." }`  
**Errors:** `{ "error": "..." }` with appropriate HTTP status.

### Auth header

```
x-proxy-secret: <PROXY_SHARED_SECRET>
```

Only required when the server has `PROXY_SHARED_SECRET` set.

### Rate-limit response headers

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After` (when limited)
- `X-Request-Id` (correlation)

---

## 7. OpenRouter & Local LLMs Through the Proxy

### OpenRouter

```powershell
$env:OPENROUTER_API_KEY="sk-or-..."
$env:OPENROUTER_MODEL="openai/gpt-4o-mini"
```

Client selects provider `openrouter` and may pass a different `model` per request.

### Ollama / LM Studio via proxy

The **proxy host** must reach the model server:

```powershell
$env:OPENAI_COMPATIBLE_BASE_URL="http://127.0.0.1:11434/v1"
$env:OPENAI_COMPATIBLE_MODEL="llama3.2"
```

If Ollama runs on another machine:

```powershell
$env:OPENAI_COMPATIBLE_BASE_URL="http://192.168.1.50:11434/v1"
```

**Note:** For a single user with Ollama on the same laptop, **desktop direct mode** (no proxy) is usually simpler. Use proxy when many clients share one gateway.

---

## 8. Security Hardening

1. **Always set `PROXY_SHARED_SECRET`** in production.  
2. Terminate TLS at a reverse proxy (Caddy, nginx, Cloudflare).  
3. Restrict `CORS_ORIGIN` to your app origin.  
4. Do not expose the proxy to the open internet without auth + TLS.  
5. Rotate HubSpot and AI keys if a laptop is lost even in proxy mode (revoke server env).  
6. Keep body/prompt limits conservative.  
7. Run as a non-root service user.

Included defenses:

- Body size limit  
- Prompt length limit  
- HubSpot property allowlist-style validation  
- HubSpot email payload schema validation  
- Per-route rate limiting  
- Structured request logging with request IDs  

---

## 9. Operations & Logging

Logs are JSON lines:

```json
{"ts":"...","level":"info","event":"request.completed","requestId":"...","method":"POST","path":"/api/ai","statusCode":200,"durationMs":412,"clientId":"..."}
```

Capture `X-Request-Id` from responses when filing incidents.

---

## 10. Verification

```powershell
# Health-ish: empty prompt should 400
curl -s -X POST http://localhost:8787/api/ai `
  -H "Content-Type: application/json" `
  -H "x-proxy-secret: YOUR_SECRET" `
  -d "{\"provider\":\"gemini\",\"promptText\":\"\"}"
```

Expect HTTP 400 with `promptText is required`.

Missing key example:

```powershell
curl -s -X POST http://localhost:8787/api/ai `
  -H "Content-Type: application/json" `
  -d "{\"provider\":\"openrouter\",\"promptText\":\"hello\",\"model\":\"openai/gpt-4o-mini\"}"
```

Expect HTTP 500 mentioning `OPENROUTER_API_KEY` if unset.

From the app: Settings → **Test Active Provider** with Proxy Base URL filled.

Automated: `npm test` includes proxy CORS, secret, validation, rate limit, and provider config tests.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 401 Unauthorized | Secret mismatch or missing header | Align app secret with `PROXY_SHARED_SECRET` |
| 500 `*_API_KEY is not configured` | Env not set for selected provider | Export the correct key and restart proxy |
| 400 model required | OpenRouter/compatible without model | Set client model or `OPENROUTER_MODEL` / `OPENAI_COMPATIBLE_MODEL` |
| 400 baseUrl | Invalid local URL | Must start with `http://` or `https://` |
| 429 | Rate limit | Back off or raise `RATE_LIMIT_*` |
| 413 | Body too large | Raise `MAX_BODY_BYTES` carefully |
| Local model connection errors | Proxy cannot reach Ollama host | Fix URL, firewall, or run proxy co-located |
| CORS errors in browser | Origin blocked | Set `CORS_ORIGIN` or use desktop app |

---

## Related

- [SETUP.md](SETUP.md) — install and first run  
- [USER_MANUAL.md](USER_MANUAL.md) — AI provider UX  
- [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md) — token scopes  
- [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md) — full symptom matrix  
