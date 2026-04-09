# HubSpot Integration Guide

This guide explains how to connect HubSpot, grant the right scopes, sync contacts, and log outbound email activity.

## What SalesDirector Uses in HubSpot

SalesDirector currently calls:

- GET /crm/v3/objects/contacts
- POST /crm/v3/objects/emails

These are implemented in [salesdirector.jsx](salesdirector.jsx#L347) and [proxy-server.mjs](proxy-server.mjs#L318).

## 1. Create a HubSpot Private App

1. In HubSpot, open Settings.
2. Go to Integrations, then Private Apps.
3. Create a new private app for SalesDirector.
4. Assign required scopes.
5. Create app and copy the access token.

## 2. Required Scopes

Minimum recommended scopes:

- crm.objects.contacts.read
- crm.objects.emails.write

Useful optional scopes:

- crm.objects.contacts.write
- crm.objects.emails.read

If you run through the proxy, the same scopes are still required on the HubSpot token used by the proxy.

## 3. Configure SalesDirector

Choose one mode:

### Direct mode

- Open Settings in the app.
- Set HubSpot CRM Private App Access Token.

### Proxy mode

- Put HUBSPOT_TOKEN on the proxy server.
- In app settings, set Proxy Base URL and optional shared secret.
- Leave HubSpot token empty in the app.

See [PROXY_SETUP.md](PROXY_SETUP.md) for proxy commands.

## 4. Sync Contacts

From CRM and Contacts tab, click Sync from HubSpot.

SalesDirector requests these contact properties:

- firstname
- lastname
- company
- email
- hs_lead_status
- jobtitle
- phone
- lifecyclestage

Contacts without an email are skipped.

## 5. Log Outbound Emails to HubSpot

HubSpot logging occurs only when:

- HubSpot integration is configured, and
- The active composer has a HubSpot contact ID.

Best practice:

1. Sync contacts from HubSpot.
2. Open contact dossier.
3. Click Draft Outreach from that dossier.
4. Send email from AI Outreach.

That flow preserves the HubSpot contact ID required for association.

## 6. Troubleshooting

### 401 Unauthorized

- Token is invalid, revoked, or malformed.
- Regenerate private app token and retry.

### 403 Forbidden or scope errors

- Private app is missing required scopes.
- Update scopes, then generate a new token.

### Sync returns no contacts

- Contacts may be missing email values.
- Check HubSpot filters and property availability.

### Email saved locally but not logged to HubSpot

- Composer likely has no hubspotId.
- Start outreach from a synced contact dossier.

### Proxy mode still fails

- Verify HUBSPOT_TOKEN on server.
- Verify app Proxy Base URL and shared secret match server values.

## 7. Security Practices

- Do not commit HubSpot tokens.
- Prefer proxy mode in shared or production environments.
- Rotate private app tokens periodically.
