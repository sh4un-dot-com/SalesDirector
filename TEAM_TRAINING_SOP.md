# SalesDirector Team Training SOP (One-Page)

Purpose: Run a repeatable 30-minute onboarding session for Sales Reps, Managers, and RevOps/Admin.

## Release Update: Trainer Notes

- Encrypted local data storage is desktop-only and requires Electron runtime.
- Launch training in desktop mode for all storage and migration validation steps.
- Browser preview does not expose encrypted DB controls and should be treated as UI-only.

## Session Prep (Trainer)

- Confirm app starts locally.
- Launch app in desktop mode (npm run dev:desktop).
- Confirm demo user can access Settings, Contacts, Outreach, and Inbox.
- Prepare one valid HubSpot contact or a CSV sample with email column.
- Decide whether demo uses direct mode or proxy mode.

## 30-Minute Agenda

### 0 to 5 minutes: Environment and Access

- Launch app.
- Show Settings and System Health indicators.
- Confirm Auth, AI access, and HubSpot readiness state.

Pass criteria:
- User can open app and view all main tabs.

### 5 to 12 minutes: Configuration Basics

- Configure sender name, reply-to, and signature.
- Set AI access (Gemini key or proxy base URL).
- Explain security rule: settings persist locally on the device until cleared; use proxy mode when vendor API keys must stay server-side.

Pass criteria:
- User can save valid sender profile and AI access path.

### 12 to 20 minutes: Contacts and Outreach Workflow

- Sync from HubSpot or import CSV.
- Open a contact dossier.
- Click Draft Outreach.
- Generate subject and draft, then send.

Pass criteria:
- Outbound thread is saved to history.
- If contact has hubspotId and integration is active, logging reaches HubSpot.

### 20 to 25 minutes: Smart Inbox and Prioritization

- Run Analyze and Score Inbox.
- Review top scores and pick first follow-up actions.

Pass criteria:
- User can explain how scores change follow-up priority.

### 25 to 30 minutes: Handoff and Support

- Share where to find setup and troubleshooting docs.
- Assign owner for release checklist on production changes.

Pass criteria:
- User knows where to get help and what to do next.

## Role Checklists

### Sales Rep Checklist

- [ ] Sender profile configured
- [ ] Contact synced/imported
- [ ] One outbound draft sent and saved
- [ ] Inbox analyzed and prioritized

### Sales Manager Checklist

- [ ] Team defaults aligned (tone, length, limits)
- [ ] Reps trained to start outreach from dossiers
- [ ] Daily inbox triage cadence established

### RevOps/Admin Checklist

- [ ] Direct or proxy mode decision documented
- [ ] HubSpot scopes validated
- [ ] Release checklist ownership assigned

## Quick Escalation Rules

- If HubSpot sync fails, verify token and scopes first.
- If AI generation fails, verify selected credential mode.
- If proxy fails with 401, verify shared secret mismatch.

Detailed troubleshooting: [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md)

## Doc Handout Pack

- Onboarding path: [ONBOARDING.md](ONBOARDING.md)
- Setup guide: [SETUP.md](SETUP.md)
- User manual: [USER_MANUAL.md](USER_MANUAL.md)
- HubSpot guide: [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md)
- Release checklist: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
- Troubleshooting FAQ: [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md)
