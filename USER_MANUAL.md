# SalesDirector User Manual

Complete day-to-day guide for SalesDirector — AI outreach, CRM, Smart Inbox, tasks, settings, and AI providers (cloud, OpenRouter, and local LLMs).

> **Installing?** Start with [SETUP.md](SETUP.md).  
> **First day on the team?** Use [ONBOARDING.md](ONBOARDING.md).  
> **Feature inventory:** [FEATURES.md](FEATURES.md).  
> **Something broken?** [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Role-Based Quickstarts](#2-role-based-quickstarts)
3. [Interface Tour](#3-interface-tour)
4. [Daily Operating Rhythm](#4-daily-operating-rhythm)
5. [Dashboard](#5-dashboard)
6. [Smart Inbox](#6-smart-inbox)
7. [Tasks & Calendar](#7-tasks--calendar)
8. [CRM & Contacts](#8-crm--contacts)
9. [AI Outreach](#9-ai-outreach)
10. [Settings](#10-settings)
11. [AI Providers In Depth](#11-ai-providers-in-depth)
12. [About & Diagnostics](#12-about--diagnostics)
13. [Data, Security & Privacy](#13-data-security--privacy)
14. [Keyboard & Interaction Tips](#14-keyboard--interaction-tips)
15. [Common Issues](#15-common-issues)

---

## 1. Product Overview

SalesDirector is a **desktop-first sales command center** that keeps CRM context, AI drafting, inbox prioritization, and task planning in one place so reps spend less time switching tools.

| You want to… | Go here |
|---|---|
| See pipeline pulse and AI partner actions | **Dashboard** |
| Prioritize inbound replies | **Smart Inbox** |
| Plan the day and book follow-ups | **Tasks & Calendar** |
| Manage accounts and dossiers | **CRM & Contacts** |
| Write and send AI-assisted email | **AI Outreach** |
| Keys, mail, proxy, database | **Settings** |
| Version / runtime info | **About** |

Built by **Akita Engineering** (Niagara Falls, Canada) · [www.akitaengineering.com](https://www.akitaengineering.com) · [support@akitaengineering.com](mailto:support@akitaengineering.com)

---

## 2. Role-Based Quickstarts

### Sales Rep (first 10–15 minutes)

1. **Settings** → unlock encrypted local database.
2. Set **name**, **reply-to**, and **signature**.
3. Connect **AI** (Gemini key, OpenRouter, or local Ollama/LM Studio — see [§11](#11-ai-providers-in-depth)).
4. Click **Test Active Provider** until it passes.
5. **CRM & Contacts** → HubSpot sync, CSV import, or add a contact.
6. Open a dossier → **Draft Outreach**.
7. Generate draft + subjects → review → send (or copy to your mail client if SMTP is not configured).
8. **Smart Inbox** → Analyze & Score → reply to the hottest threads first.

**Success:** One outbound draft saved to thread history with CRM context.

### Sales Manager

1. Standardize **tone/length defaults** and **sending limits** for the team.
2. Require drafting from **contact dossiers** so history and HubSpot logging stay clean.
3. Use **Dashboard → Revenue Brief / Rescue At-Risk Deals** in standups.
4. Review **Smart Inbox** scoring discipline in 1:1s.
5. Share this manual + [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).

### RevOps / Admin

1. Choose **direct** vs **proxy** credential model ([SETUP.md](SETUP.md), [PROXY_SETUP.md](PROXY_SETUP.md)).
2. Provision HubSpot private app scopes ([HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md)).
3. Decide cloud AI vs OpenRouter vs local LLM policy.
4. Validate System Health green path on a golden workstation.
5. Gate releases with [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

---

## 3. Interface Tour

### Sidebar navigation

| Tab | Purpose |
|---|---|
| **Dashboard** | KPIs, AI operating partner, closing queue, recent outbound |
| **Smart Inbox** | AI-scored inbound mail, bulk prioritization actions |
| **Tasks & Calendar** | Planner, templates, meeting prep, schedule conflict checks |
| **CRM & Contacts** | Pipeline board/table, CSV, HubSpot, dossiers |
| **AI Outreach** | Resizable split workspace: strategy context + composer |
| **Settings** | Database, AI, proxy, mail, safety limits, diagnostics |
| **About** | Runtime facts and Akita credits |

On smaller screens, open the sidebar with the **menu** button; close with **X**, backdrop click, or **Escape**.

### Header

| Control | Behavior |
|---|---|
| **Page title** | Friendly name of the active tab (e.g. “AI Outreach”) |
| **Dark mode** | Sun/moon toggle; preference persists |
| **Search leads…** | Live contact search (name, email, company); click result → dossier; **Escape** clears |
| **Avatar** | Initials from sender name (fallback `SD`) |

### Notifications

- Success toasts: dark/light high-contrast chips, auto-dismiss ~3s.
- Error toasts: red styling, longer duration (~5s), dismiss with **X**.
- Only one toast at a time; new messages replace the previous.

### Modals

Contact editor, task editor, delete confirm, and dossiers support:

- **Escape** to close (top-most layer first)
- **Click backdrop** to dismiss
- Scroll lock on the body while open
- Destructive delete confirm uses a red **Delete** button

---

## 4. Daily Operating Rhythm

Recommended sequence for a sales day:

1. **Unlock database** (Settings) if you restarted the app.
2. **Dashboard** — skim KPIs; run **Revenue Brief** or **Rescue At-Risk Deals** if pipeline is heavy.
3. **Smart Inbox** — sync IMAP/HubSpot if configured; **Analyze & Score**; clear hot replies first.
4. **Tasks & Calendar** — apply a day template or **Plan Focus Day**; resolve conflict/buffer warnings.
5. **CRM** — work attention queue / stage board; open dossiers for research.
6. **AI Outreach** — draft from dossier or inbox; pre-send check; send or schedule tasks from sequences.
7. **Lock database** if leaving a shared machine.

---

## 5. Dashboard

### KPI strip

| Metric | Meaning |
|---|---|
| Contacts | Total CRM records |
| Pending Tasks | Open work |
| Needs Response | Inbox items flagged for reply |
| Sent Today | Outbound messages dated today (planning timezone) |
| Meetings Booked | Completed tasks typed as meeting/call/demo |

### AI Operating Partner

| Action | Purpose |
|---|---|
| **Revenue Brief** | Commercial daily brief across CRM, inbox, tasks, outreach |
| **Rescue At-Risk Deals** | Playbook for Opportunity/Proposal accounts at risk (disabled if none) |
| **Win/Loss Tracker** | Pattern summary from outbound + stage transitions |

### Closing queue

Shows up to three at-risk accounts with value, open tasks, **AI Plan**, and **Open** dossier.

### Idea organizer

Paste a raw idea → AI turns it into tasks, CRM note, and outreach angle (when AI is ready).

### Smart Action Plan & Recent Activity

- Top pending tasks with **Execute** (jumps into the right workflow).
- Last outbound emails with timestamps.

---

## 6. Smart Inbox

### Getting mail in

| Source | How |
|---|---|
| **IMAP Sync** | Settings mail config → **Sync IMAP** (desktop) |
| **HubSpot emails** | HubSpot token → **Sync HubSpot** inbox action |
| Manual / prior sessions | Restored from encrypted local DB after unlock |

### Filters & search

- Tabs: **All**, **Unread**, **Needs Response**, **Archived**
- Search: sender, subject, company
- Empty states explain next steps (sync, clear filters, etc.)

### Analyze & Score

**Analyze & Score Inbox** runs AI (or heuristics when offline) to attach:

- Score **1–100**
- Badges: **Hot** (70+), **Warm** (40–69), **Cold** (&lt;40)
- One-sentence summary
- CRM-linked next best action (reply, task, proposal follow-up, review CRM)

### Bulk helpers

| Control | Effect |
|---|---|
| Open top urgent replies | Queues hottest actionable threads into Outreach flow |
| Create tasks from hottest | Follow-up tasks from urgent emails |
| Mark low-priority handled | Clears noise from the working set |

### Per-email actions

| Action | Effect |
|---|---|
| Primary action (Reply / Use in Outreach) | Loads composer with reply metadata |
| AI Reply | Generates reply draft into Outreach |
| Open / Review CRM | Dossier or guided contact draft |
| Add Task | Follow-up task linked to sender/CRM |
| Read / Unread | Visual priority |
| Flag | Needs-response toggle |
| Archive / Unarchive | Moves between working set and archive |
| Delete | Removes from local inbox |

### Urgent reply queue

When processing a multi-email urgent queue, the composer shows queue position (e.g. `2/5`) so you can work through the set without losing place.

---

## 7. Tasks & Calendar

### Create work

- **Quick-add** field — type title, Enter.
- **Generate Tasks from CRM** — AI proposes prioritized daily actions.
- **Prioritize with AI** — scores, time blocks, written rationale.
- **Plan Focus Day** — packs the selected calendar day.
- **Day templates** — inject proven operating rhythms for the selected date.
- **Meeting Prep Pack** — contact-specific prep bundle as tasks/notes.

### Filters

Active, focus-day, overdue, unscheduled, completed, waiting — plus free-text search.

### Calendar

- Month navigator
- Day selection drives the task list and template materialization
- Timeline respects **active hours** and **timezone** from Settings
- **Conflict** and **buffer** badges when bookings overlap or violate minimum spacing

### Task status lifecycle

Typical flow: `pending` → `in progress` → `completed` (or `waiting`).

Edit modal fields: title, type, priority, date, time, duration, contact, notes, rationale, status. Save is blocked when time is invalid or conflicts exist.

### Meetings queue

Upcoming meetings surface call-prep AI and prep-pack shortcuts.

---

## 8. CRM & Contacts

### Ingest paths

| Method | Notes |
|---|---|
| **Add Contact** | Operator guidance applies stage defaults, next step, follow-up date |
| **Import CSV** | See column map below |
| **Sync HubSpot** | Pulls private-app contacts |
| **Inbox → Review CRM** | Guided create/update for unknown senders |
| **Outreach → create contact** | From a draft recipient |

Duplicate emails open the **existing** record instead of creating a second one.

### CSV columns

| Header | Required | Aliases |
|---|---|---|
| `email` | **Yes** | `e-mail` |
| `name` | No | `firstname` + `lastname` |
| `company` | No | `organization` |
| `jobtitle` | No | `title` |
| `phone` | No | — |
| `stage` | No | `lifecyclestage` |
| `linkedin` | No | — |
| `notes` | No | — |

### Stages

`Lead` → `Contact` → `Opportunity` → `Proposal` → `Customer` → `Churned`

Filter bar + pipeline board (drag-and-drop where enabled) keep stage hygiene visible.

### Attention / overview

CRM workspace surfaces:

- Due follow-ups
- Stale accounts
- Pipeline value / forecast helpers
- Next best action cards
- Optional **AI CRM Guidance** insight panel

### Contact dossier

| Section | Contents |
|---|---|
| Header | Name, stage/status badge, title, company |
| Contact info | Email, phone, LinkedIn, website, owner, value, follow-up, priority |
| Next best action | Label, detail, reason chips |
| Quick actions | Draft Outreach, Add Task, Meeting Prep Pack, Log Call, stage-aware primary action |
| AI Intelligence | Call prep, research, follow-up strategy, AI action plan, reactivation / check-in / proposal drafts |
| Relationship pulse | Timeline summary + refresh |
| Interaction timeline | Expandable messages; delete individual entries |

---

## 9. AI Outreach

Split workspace: **strategy / context (left)** and **composer (right)**. Drag the divider to resize; double-click handle to reset. Width preference is saved.

### Strategy / context pane

- Tone: Professional, Persuasive, Friendly, Direct & Urgent, Consultative  
- Length: Concise, Standard, Detailed  
- Outreach **play** (recommended from CRM stage / relationship)  
- Sequence **cadence** and **step count** (2–5)  
- Thread history  
- **Ask Director for Strategy**, **Objection Crusher**, **Summarize Context**  
- Director’s Insight surface  
- Large **AI Context** editor (research, instructions, proposal notes)  
- Linked CRM card (open contact, task, load CRM snapshot)

### Composer

| Field | Notes |
|---|---|
| Recipient name / title / company | Personalization |
| To | Validated email |
| Subject | Manual or AI suggestions |
| Body | Main draft |

**AI actions**

| Button | Result |
|---|---|
| Draft | Full email from context |
| Polish | Improve existing body |
| Suggest Subjects | Up to 3 clickable subjects |
| Pitch Meeting | Meeting-request style CTA |
| Sequence | Multi-step drip with delay/goal metadata |
| Analyze | Improvement bullets |
| Pre-Send Check | Multi-dimension QA before send |

**Sequence workspace**

- Step cards with subject / delay / goal  
- **Load Into Composer**  
- **Create Follow-Up Tasks** (dated planner tasks)

**Merge tags:** `[First Name]`, `[Company Name]`, `[Meeting Link]` via toolbar.

**Send:** Validates recipient + body; respects loading/error state. On success, message is written to local/Firebase thread history and optionally HubSpot email engagement when `hubspotId` is present.

**Best practice:** Always open Outreach from a **dossier** or **inbox** row so association and history stay correct.

---

## 10. Settings

Settings **auto-save** to device local storage. A short “saved” confirmation appears after edits.

### First-run checklist

The Settings page includes a guided first-run list (database, sender profile, AI, contacts, optional mail). Complete the first four for a production-ready workstation.

### System Health / diagnostics

Readiness chips for auth, encrypted DB, proxy, **selected AI provider**, HubSpot, SMTP, IMAP. Treat yellow/red as blockers before a campaign day.

### Encrypted Local Database

Create/unlock/lock/reset — see [SETUP.md §8](SETUP.md#8-encrypted-local-database).

### Secure proxy routing

- Proxy Base URL (no trailing slash required; app normalizes)
- Proxy Shared Secret (must match server)

### Company & sender

Company URL, name, reply-to, auto-BCC, multi-line signature.

### HubSpot

Private app token field (or leave empty in pure proxy mode).

### Email servers

SMTP + IMAP fields, auth method (password vs OAuth2), Graph API toggle for Microsoft, lookback/sync options, auto-sync interval.

### Sending safety

| Control | Range / notes |
|---|---|
| Max daily emails | 1–5,000 |
| Send delay | 0–3,600 seconds |
| Active hours | Start / end |
| Schedule buffer | Minimum minutes between timed tasks |
| Timezone | System or named presets |

### AI defaults & provider keys

See the full chapter below.

### Clear saved local settings

Wipes **settings** from this device (keys, mail, proxy URL). Does **not** by itself wipe encrypted CRM payloads — use database **Reset** for that.

---

## 11. AI Providers In Depth

### Choosing a provider

| Situation | Recommendation |
|---|---|
| Fastest cloud setup | **Gemini** |
| Prefer GPT / Claude / Grok brand models | **OpenAI / Anthropic / xAI** |
| One bill, many models, free-tier experiments | **OpenRouter** |
| Offline, private data, zero cloud | **Local / OpenAI-compatible** (Ollama or LM Studio) |
| Keys must never sit on laptops | **Proxy mode** with server env keys |

### Active provider

The **Active AI Provider** dropdown is the single switch for all AI buttons (Draft, Score Inbox, Research, etc.). Only **supported** options are enabled for the current runtime.

### OpenRouter

1. Select OpenRouter.  
2. Paste `sk-or-...` key.  
3. Set model id (examples: `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`, free Llama variants).  
4. Test Active Provider.

### Local / OpenAI-compatible

1. Prefer **desktop app** (localhost CORS blocks most browsers).  
2. Click **Ollama**, **LM Studio**, or **Custom** preset.  
3. Confirm base URL ends with `/v1`.  
4. Set **exact** model id your server exposes.  
5. API key optional (Ollama usually blank).  
6. Test Active Provider.

**Ollama defaults**

- Base: `http://127.0.0.1:11434/v1`  
- Model: e.g. `llama3.2` after `ollama pull llama3.2`

**LM Studio defaults**

- Base: often `http://127.0.0.1:1234/v1`  
- Model: copy from LM Studio UI

### Health checks

- **Test Active Provider** — transport + auth + minimal completion  
- **Test All Providers** — parity board  
- Cards show Ready / Needs setup / Unsupported / Passed / Failed  
- Failed checks use the readiness message and toast errors

### Generation profile

Temperature, top-p, and max tokens apply across providers. Lower temperature for compliant corporate tone; higher for creative first drafts. Raise max tokens for long sequences and research dossiers.

### Queueing

If you spam AI buttons, jobs **queue**. Wait for the active label to clear before assuming failure.

### Failure modes (user-facing)

| Message theme | What to do |
|---|---|
| Key missing | Paste key for that provider |
| Model id required | Fill OpenRouter or local model field |
| Base URL missing | Set local endpoint |
| Localhost needs desktop | Launch `dev:desktop` or installer build |
| Timed out | Check network, proxy, or local server load |
| Provider returned no usable text | Safety filter, empty model, or token limit — retry / change model |

---

## 12. About & Diagnostics

| Fact | Source |
|---|---|
| Application / version | Packaged Electron app info |
| Platform / arch | OS |
| Runtime | Electron / Node / Chrome versions |
| Storage backend | Firebase vs encrypted Electron file |
| Operating mode | Local fallback vs cloud-backed |

Credits and support links for Akita Engineering appear in About and the sidebar footer.

---

## 13. Data, Security & Privacy

| Layer | Behavior |
|---|---|
| Settings | Device localStorage; survive restart until cleared |
| CRM / tasks / inbox / threads | Encrypted desktop DB after unlock |
| Passphrase | Never written to disk |
| AI keys | Device settings or proxy env — not committed to git |
| Electron | Context isolation, no node integration, IPC bridge only |
| Proxy | Optional server-side secret vault for vendor APIs |
| Auto-BCC | Optional silent compliance copy on send |

---

## 14. Keyboard & Interaction Tips

| Input | Effect |
|---|---|
| **Escape** | Close top modal, then sidebar, then clear global search |
| **Enter** in task quick-add | Create task |
| Click modal **backdrop** | Close that modal |
| Drag outreach **split handle** | Resize context vs draft |
| Double-click split handle | Reset default widths |
| Global search **Escape** | Clear query / hide dropdown |

---

## 15. Common Issues

| Problem | Fix |
|---|---|
| Invalid email warnings | Fix To / reply-to format |
| HubSpot errors | Token/scopes — [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md) |
| Proxy 401 | Shared secret mismatch — [PROXY_SETUP.md](PROXY_SETUP.md) |
| Encrypted DB disabled | Use desktop runtime |
| AI fails in browser with Ollama | Use desktop app |
| OpenRouter errors | Key + model id + credits on OpenRouter |
| Local model 404 | Model name must match server exactly |
| Email local but not HubSpot | Start from synced contact (hubspotId) |
| White screen packaged | `base: './'` in Vite config |

Full matrix: [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).

---

## Related Guides

| Guide | Use when |
|---|---|
| [SETUP.md](SETUP.md) | Install, first run, packaging |
| [ONBOARDING.md](ONBOARDING.md) | Timed role paths |
| [TEAM_TRAINING_SOP.md](TEAM_TRAINING_SOP.md) | Live training session |
| [PROXY_SETUP.md](PROXY_SETUP.md) | Server-side keys |
| [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md) | CRM token scopes |
| [FEATURES.md](FEATURES.md) | Exhaustive capability list |
| [MACBOOK_HANDOFF.md](MACBOOK_HANDOFF.md) | Nontechnical Mac install |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Ship readiness |
