# SalesDirector User Manual

This manual explains day-to-day usage of SalesDirector.

If this is your first day using the app, start with [ONBOARDING.md](ONBOARDING.md) for a role-based 15-30 minute setup path.

## Role-Based Quickstart

### Sales Rep (First 10 Minutes)

1. Open Settings and add your sender name, reply-to address, and signature.
2. Add your AI key or configure proxy routing.
3. Go to CRM and Contacts, then sync HubSpot or import CSV.
4. Open a contact dossier and click Draft Outreach.
5. In AI Outreach, generate draft plus subject options, then send.

### Sales Manager (Pipeline and Team Hygiene)

1. Verify every rep has sender profile and safety limits configured.
2. Standardize tone/length defaults in Settings before campaigns.
3. Ensure reps use contact dossiers so outbound sends stay linked to thread history.
4. Review Smart Inbox scores daily to prioritize follow-up order.

### RevOps or Admin (System Owner)

1. Decide direct mode versus proxy mode for credentials.
2. Configure HubSpot private app token and scopes.
3. Confirm auth, HubSpot, AI, SMTP, and IMAP readiness under System Health.
4. Run release validation using [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
5. Use [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md) for incident triage.

## Main Navigation

- Dashboard: KPI snapshot and action planning
- Smart Inbox: AI scoring and summary of inbound messages
- Tasks and Calendar: Generate and prioritize work
- CRM and Contacts: Sync, import, and manage leads
- AI Outreach: Build and refine outbound emails
- Settings: Integrations, safety controls, and provider keys

## Daily Workflow

1. Configure integrations in Settings.
2. In CRM and Contacts, sync HubSpot contacts or import CSV.
3. Open a contact dossier and click Draft Outreach.
4. In AI Outreach, generate subject and body using AI actions.
5. Send and save thread history.
6. Review Smart Inbox and prioritize replies.
7. Use Tasks and Calendar to schedule next actions.

## Contacts and CRM

From the CRM and Contacts tab you can:

- Add contacts manually
- Import CSV files
- Sync contacts from HubSpot
- Open contact dossiers with interaction timeline

CSV import supports headers including:

- email or e-mail (required)
- name or firstname and lastname
- company or organization
- jobtitle or title
- phone
- stage or lifecyclestage
- linkedin
- notes

Parsing behavior is defined in [utils/dataParsers.mjs](utils/dataParsers.mjs).

## AI Outreach

AI Outreach supports:

- Draft
- Meeting invite generation
- Subject line suggestions
- Polish
- Analyze
- Objection response strategy
- 3-step sequence generation

Drafts use context from:

- Company profile URL
- Sender profile
- Contact details
- Thread history
- Custom instructions

Tone and length defaults are configurable in Settings.

## Smart Inbox

Use Analyze and Score Inbox to:

- Assign lead score from 1 to 100
- Generate a one-sentence AI summary
- Prioritize follow-up actions

Parsing is handled by [utils/dataParsers.mjs](utils/dataParsers.mjs#L121).

## Sending Behavior

When you click Send Email:

- The outbound message is saved to Firestore thread history.
- If a HubSpot contact ID is present and HubSpot is configured, the app also logs an email engagement to HubSpot.

HubSpot logging details are in [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md).

## Settings Overview

### System Health

Shows readiness for:

- Auth session
- Proxy mode
- Gemini access
- HubSpot integration
- SMTP readiness
- IMAP readiness

### Secure Proxy Routing

- Proxy Base URL
- Proxy Shared Secret (optional)

### Company and Sender Profile

- Company website URL
- Sender name
- Reply-to and auto-BCC
- Signature block

### HubSpot CRM

- Private app access token

### Email Server and Security

- SMTP host, port, security, username, password
- IMAP host and port

### Safety and Limits

- Max daily emails
- Delay between sends
- Active hours and timezone

### AI Defaults and Provider Keys

- Default tone and length
- Provider key fields (Gemini active by default)

## Data and Security

- Sensitive secrets are not persisted to local storage.
- Non-sensitive preferences are persisted for convenience.
- You can clear saved local settings from Settings.

## Common Issues

- Invalid email warnings: check recipient or reply-to format.
- HubSpot errors: verify token/scopes or proxy setup.
- Proxy auth errors: shared secret mismatch.

For deeper issue-by-issue triage, use [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).
