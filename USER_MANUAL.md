# SalesDirector User Manual

Your complete guide to day-to-day usage of SalesDirector.

> **First time?** Start with [ONBOARDING.md](ONBOARDING.md) for a role-based 15–30 minute setup path.
> **Need the full feature list?** See [FEATURES.md](FEATURES.md).

---

## Role-Based Quickstart

### Sales Rep (First 10 Minutes)

1. Open **Settings** → add your sender name, reply-to address, and email signature.
2. Add your AI provider key (or confirm proxy routing is configured).
3. Go to **CRM & Contacts** → sync HubSpot or import a CSV.
4. Click any contact → open their dossier → click **Draft Outreach**.
5. In **AI Outreach**, generate a draft + subject lines, then send.

### Sales Manager (Pipeline & Team Hygiene)

1. Verify every rep has sender profile and safety limits configured.
2. Standardize tone/length defaults in Settings before campaigns launch.
3. Ensure reps use contact dossiers so outbound sends stay linked to thread history.
4. Review **Smart Inbox** scores daily to prioritize team follow-up order.

### RevOps or Admin (System Owner)

1. Decide direct mode vs. proxy mode for credential handling.
2. Configure HubSpot private app token and scopes per [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md).
3. Confirm all 7 readiness indicators show green under **Settings → System Health**.
4. Run release validation using [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
5. Manage incident triage with [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).

---

## Main Navigation

SalesDirector has seven tabs accessible from the left sidebar:

| Tab | Icon | Purpose |
|---|---|---|
| **Dashboard** | LayoutDashboard | KPI snapshot, action plan, recent activity |
| **Smart Inbox** | Mail | AI-scored inbound emails with one-sentence summaries |
| **Tasks & Calendar** | CalendarDays | AI-generated daily tasks with priority scoring and time blocks |
| **CRM & Contacts** | Users | Contact management, CSV import, HubSpot sync, dossiers |
| **AI Outreach** | Send | AI email composer with strategy sidebar |
| **Settings** | Settings | Integrations, safety controls, provider keys, system health |
| **About** | FileText | Runtime diagnostics, version info, and Akita Engineering credits |

**Header controls:**
- **Dark mode toggle** — top-right header, preference persists across restarts.
- **Global search** — search contacts by name, email, or company from any tab. Results appear in a live dropdown; click to open the contact dossier.
- **User avatar** — displays your initials from the sender name configured in Settings (falls back to "SD").

---

## Daily Workflow

A recommended daily flow for sales reps:

1. **Unlock your database** — Settings → Encrypted Local Database → enter passphrase → Unlock.
2. **Check Smart Inbox** — see which inbound emails scored highest. Prioritize your replies.
3. **Review Tasks** — check AI-generated tasks or add manual ones. Follow the priority schedule.
4. **Work contacts** — open CRM dossiers, review interaction timelines, draft outreach.
5. **Compose & send** — use AI Outreach to draft, polish, and send emails with full context.
6. **Log activity** — outbound messages auto-save to thread history and HubSpot (if configured).
7. **Plan ahead** — use Tasks & Calendar to schedule tomorrow's actions.

---

## Dashboard

Your sales command center shows:

- **Contact count** — total contacts in your CRM
- **Pending tasks** — open tasks awaiting completion
- **Emails needing response** — inbox messages flagged for follow-up
- **Emails sent today** — your daily outbound counter
- **Meetings booked** — scheduled meeting tally
- **Smart Action Plan** — top 4 pending tasks with "Execute" buttons to jump to the composer
- **Recent Activity** — last 3 outbound emails with timestamps

---

## Smart Inbox

### Filtering & Search

- **Filter tabs** — toggle between All, Unread, Needs Response, and Archived emails
- **Search bar** — search by sender, subject, or company across all inbox emails
- Filters and search work together to narrow your view

### Scoring & Prioritization

Click **Analyze & Score Inbox** to run AI scoring across all inbound emails:

- Each email gets a **lead score from 1 to 100** (100 = hottest lead)
- Visual badges: **Hot** (70+), **Warm** (40–69), **Cold** (below 40)
- **One-sentence AI summary** per email for instant context

### Per-Email Actions

| Action | What It Does |
|---|---|
| **Draft Reply** | Opens the AI Outreach composer with contact and thread context pre-loaded |
| **Read / Unread** | Toggle read status — unread emails appear bold with a rose dot |
| **Flag** | Mark or unmark an email as needing a response |
| **Archive** | Archive an email to remove it from the default view (viewable in Archived tab) |
| **Delete** | Permanently remove an email from the inbox |

---

## Tasks & Calendar

### Creating Tasks

- **Quick-add** — type a task and press Enter
- **AI Generate** — click "Generate Tasks from CRM" to have AI analyze your contacts and create 3 prioritized daily actions

### AI Prioritization

Click **Prioritize with AI** to:
- Assign priority scores (1–100) with color-coded urgency
- Suggest time blocks for your active hours
- Provide written rationale for each scheduling decision

### Calendar View

- **Mini calendar** with monthly navigation and date selection
- **Daily timeline** — hourly breakdown from your active hours start to end
- **Execute buttons** — jump from any task directly to the AI composer with context

### Editing Tasks

Click the **edit icon** (pencil) on any task to open the task edit modal:

- **Task text** — rename the task
- **Type** — follow-up, call, meeting, proposal, research, admin
- **Priority** — manual 1–100 score
- **Due date** — date picker for scheduling
- **Contact** — associate a contact name
- **Rationale / Notes** — free-text reason or notes
- **Status** — set to pending or completed

Click **Save Changes** to persist. Tasks with due dates show a date badge in the task list.

---

## CRM & Contacts

### Adding Contacts

- **Manual entry** — click "Add Contact" and fill in the form
- **CSV import** — click "Import CSV" to bulk-import contacts
- **HubSpot sync** — click "Sync HubSpot" to pull contacts from your CRM

### Filtering Contacts

Use the **stage filter bar** above the contacts table to filter by stage:

- **All Stages** — show every contact
- **Lead, Contact, Opportunity, Customer, Cold, Warm, Hot** — filter to a specific stage
- A live count shows how many contacts match when a filter is active

### CSV Import

Upload a CSV file with these supported column headers:

| Header | Required | Aliases |
|---|---|---|
| `email` | Yes | `e-mail` |
| `name` | No | `firstname` + `lastname` |
| `company` | No | `organization` |
| `jobtitle` | No | `title` |
| `phone` | No | — |
| `stage` | No | `lifecyclestage` |
| `linkedin` | No | — |
| `notes` | No | — |

Duplicate emails are automatically skipped during import.

### Contact Stages

Contacts progress through four lifecycle stages:
- **Lead** → **Opportunity** → **Customer** → **Churned**

### Contact Dossier

Click any contact to open their full dossier:

- **Detail card** — name, title, company, email, phone, LinkedIn (all clickable)
- **Interaction timeline** — every thread message with direction arrows and timestamps
- **Delete messages** — remove individual timeline messages via the trash icon
- **Quick actions:**
  - **Draft Outreach** — opens AI Outreach with this contact pre-loaded
  - **Add Task** — create a task linked to this contact
  - **Log Call** — record a call interaction (persists to timeline with timestamp)
- **AI Intelligence panel:**
  - **Research Contact** — generates a B2B sales intelligence dossier (role analysis, pain points, conversation starters, approach, deal potential)
  - **Follow-Up Strategy** — AI recommends follow-up urgency, timing, channel, opening line, and strategic approach

---

## AI Outreach

The AI-powered email composition workspace. Split into two panels:

### Strategy Sidebar (left)

- **Tone selector** — Professional, Persuasive, Friendly, Direct & Urgent, Consultative
- **Length selector** — Concise, Standard, Detailed
- **Thread history** — paste or auto-load conversation context
- **Ask Director for Strategy** — get prospect-specific sales playbooks and psychological approaches
- **Objection Crusher** — input a prospect objection, get psychology-backed rebuttals
- **Summarize Context** — condense long thread history into a quick summary
- **Director's Insight** — persistent display of the AI's latest strategic recommendation

### Composer Area (right)

- **Personalization** — Recipient Name, Job Title, Company Name fields
- **To field** — recipient email with real-time validation
- **Subject line** — manual entry or AI suggestions

**AI Actions:**

| Button | What It Does |
|---|---|
| **Draft** | Generates a complete email from scratch using all available context |
| **Polish** | Improves your existing draft's tone, clarity, and persuasiveness |
| **Suggest Subjects** | Generates 3 subject line options — click to apply |
| **Pitch Meeting** | Creates a meeting-request email with 15-minute CTA |
| **Sequence** | Builds a 3-step drip campaign (Hook → Value-Add → Breakup) |
| **Analyze** | Returns 3 bullet points of improvement suggestions |
| **Pre-Send Check** | AI analyzes your email across 6 dimensions before sending (tone, clarity, personalization, CTA, length, professionalism) |

**Merge tags:** Insert `[First Name]`, `[Company Name]`, or `[Meeting Link]` placeholders via toolbar buttons.

**Draft auto-save:** Your composer content (to, subject, body, settings) is automatically saved to local storage every 2 seconds. If you close the app or navigate away, your draft will be recovered when you return. A "Draft auto-saved" indicator appears in the composer footer.

**Sending:** Click **Send Email** to dispatch. The message is:
- Saved to encrypted local thread history (desktop mode)
- Saved to Firestore thread history (Firebase mode)
- Logged as an email engagement to HubSpot (when configured)

---

## Settings

### System Health

Eight status indicators at the top of Settings.
All settings auto-save as you type. A **✅ Settings saved** confirmation appears in the page heading whenever a change is persisted, and dismisses after a few seconds.

| Indicator | What It Checks |
|---|---|
| Auth Session | Firebase auth state |
| Local Encrypted DB | Desktop database locked/unlocked |
| Proxy Mode | Proxy URL configured |
| Gemini AI Access | Gemini API key available |
| HubSpot Integration | HubSpot token present |
| SMTP Readiness | SMTP credentials configured |
| IMAP Readiness | IMAP settings configured |

### Encrypted Local Database

- **Create & Unlock** — first-time setup with passphrase
- **Unlock Database** — returning user with existing data
- **Lock Database** — protect data when stepping away
- **Reset** — wipe encrypted database on this device
- Status display shows active backend and lock state

### Secure Proxy Routing

- **Proxy Base URL** — server address for API forwarding
- **Proxy Shared Secret** — session-only, never persisted

### Company & Sender Profile

- Company Website URL (enriches AI outreach context)
- Your Name, Reply-To Address, Auto-BCC Address
- Email Signature (multi-line, auto-appended to every outbound email)

### HubSpot CRM

- Private App Access Token

### Email Server Configuration

- **SMTP:** Host, Port, Security (None / STARTTLS / SSL-TLS), Username, Password
- **IMAP:** Host, Port

### Sending Safety & Limits

- Max Daily Emails (1–5,000)
- Send Delay between messages (0–3,600 seconds)
- Active Hours Start / End Time
- Timezone (EST / CST / MST / PST)

### AI Defaults & Provider Keys

- Default Tone and Length preferences
- Provider keys (session-only, never saved to disk):
  - Google Gemini · OpenAI · Anthropic · xAI · Meta

---

## About

The About tab shows:

- **Runtime Diagnostics** — app name, version, platform, architecture, Electron/Node/Chrome versions, storage backend, operating mode
- **Credits** — Akita Engineering, support contact, website, "Made in Niagara Falls, Canada"

---

## Data & Security

- **API keys never persisted** — all provider keys are session-only React state
- **Encrypted at rest** — local data uses AES-256-GCM with PBKDF2 (250,000 iterations)
- **Passphrase never stored** — not in memory after lock, never written to disk
- **Proxy mode** — keeps all secrets server-side
- **Auto-BCC** — silently copy outbound emails to a logging address

---

## Common Issues

| Problem | Fix |
|---|---|
| Invalid email warnings | Check recipient or reply-to format |
| HubSpot errors | Verify token/scopes or proxy setup — see [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md) |
| Proxy auth errors | Shared secret mismatch between app and server |
| Encrypted DB controls disabled | Expected in browser preview — use `npm run dev:desktop` |
| White screen in packaged app | Verify `base: './'` in vite.config.mjs |

For deeper triage, see [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).
