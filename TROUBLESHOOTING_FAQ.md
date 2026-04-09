# SalesDirector Troubleshooting and FAQ

This guide maps common symptoms to likely causes and fixes.

## Quick Triage Matrix

| Symptom | Likely Cause | Fix |
|---|---|---|
| HubSpot sync fails immediately | Missing or invalid HubSpot token | Recreate token in HubSpot private app and paste in Settings or proxy env |
| HubSpot returns permission errors | Missing private app scopes | Add required scopes in HubSpot and rotate token |
| AI actions fail with key error | Gemini key missing in direct mode | Add Gemini key in Settings or switch to proxy mode |
| Proxy returns 401 Unauthorized | Shared secret mismatch | Ensure app Proxy Shared Secret matches PROXY_SHARED_SECRET |
| Proxy returns 429 | Rate limit exceeded | Reduce request burst or increase proxy rate-limit env values |
| CSV import loads 0 contacts | Missing or invalid email column | Ensure email or e-mail column has valid addresses |
| Email saved locally but not in HubSpot | No hubspotId in composer | Start draft from a synced contact dossier |
| Build warnings about large chunks | Bundle size threshold exceeded | Split heavy modules or configure chunking in build settings |

## FAQ

### Why do I see HubSpot configured but logs do not appear in HubSpot?

HubSpot logging requires a contact association ID (hubspotId) in the composer. If you type an email manually without selecting a synced contact, the app can still save thread history locally but may skip HubSpot association.

Recommended flow:

1. Sync contacts from HubSpot.
2. Open contact dossier.
3. Click Draft Outreach.
4. Send from AI Outreach.

### Why do proxy calls fail even though Proxy Base URL is set?

Check all of the following:

- The proxy process is running.
- URL is correct and reachable.
- If PROXY_SHARED_SECRET is set on server, same value is in app settings.
- Required server env values exist, such as GEMINI_API_KEY and HUBSPOT_TOKEN.

Reference: [PROXY_SETUP.md](PROXY_SETUP.md)

### How do I verify HubSpot token scopes quickly?

In HubSpot private app settings, verify at least:

- crm.objects.contacts.read
- crm.objects.emails.write

Then regenerate token if scopes changed.

Reference: [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md)

### Why does the app show SMTP or IMAP not ready?

System Health marks readiness based on required fields:

- SMTP readiness expects smtpHost, smtpUser, and smtpPass.
- IMAP readiness expects imapHost and imapPort.

Fill those fields in Settings and re-check diagnostics.

### What does "Context access might be invalid" mean in signed workflow diagnostics?

In editor diagnostics, GitHub Actions may flag custom secret names if they are not yet defined in repository secrets. Add the secrets in GitHub settings and run workflow again.

Reference: [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md)

### How can I safely reset local configuration without losing secrets in files?

Use the Clear Saved Local Settings button in Settings. This removes persisted non-sensitive local preferences and does not write secrets into project files.

## Escalation Path

1. Reproduce with exact steps and capture the action being taken.
2. Capture relevant console/proxy log snippets including request ID when available.
3. Identify mode in use: direct mode or proxy mode.
4. Validate against [SETUP.md](SETUP.md), [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md), and [PROXY_SETUP.md](PROXY_SETUP.md).
5. If unresolved, open an issue with reproduction steps and observed versus expected behavior.
