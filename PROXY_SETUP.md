# SalesDirector Proxy Setup

This proxy keeps API keys and tokens off the frontend.

## 1) Set environment variables

PowerShell example:

```powershell
$env:GEMINI_API_KEY="your_gemini_key"
$env:OPENAI_API_KEY="your_openai_key"
$env:ANTHROPIC_API_KEY="your_anthropic_key"
$env:XAI_API_KEY="your_xai_key"
$env:HUBSPOT_TOKEN="your_hubspot_token"
$env:PROXY_SHARED_SECRET="optional_shared_secret"
$env:PORT="8787"
```

Optional:

```powershell
$env:CORS_ORIGIN="http://localhost:3000"
$env:MAX_BODY_BYTES="1048576"
$env:MAX_PROMPT_CHARS="25000"
$env:MAX_CONTACT_PROPERTIES="50"
$env:RATE_LIMIT_WINDOW_MS="60000"
$env:RATE_LIMIT_GEMINI="20"
$env:RATE_LIMIT_HUBSPOT_CONTACTS="40"
$env:RATE_LIMIT_HUBSPOT_EMAILS="30"
$env:LOG_LEVEL="info"
```

## 2) Start proxy

```powershell
node proxy-server.mjs
```

## 3) Configure frontend Settings

- Set Proxy Base URL to `http://localhost:8787`
- If using `PROXY_SHARED_SECRET`, set Proxy Shared Secret to the same value
- Pick the active AI provider in Settings
- Leave frontend provider keys empty when proxy mode is active if the proxy owns those secrets
- Leave frontend HubSpot token empty when proxy mode is active

## Routes

- `POST /api/ai`
- `POST /api/gemini`
- `GET /api/hubspot/contacts?properties=...`
- `POST /api/hubspot/emails`

## Hardening Included

- Request body size limit (default 1 MB)
- AI prompt size limit (default 25,000 chars)
- Contact properties allowlist validation
- HubSpot email payload schema validation
- Per-endpoint rate limiting with `X-RateLimit-*` and `Retry-After` headers
- Structured JSON request logging with `X-Request-Id` correlation
