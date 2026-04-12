# SalesDirector — Complete Feature List

> **Version 1.0.0** · Built by Akita Engineering in Niagara Falls, Canada

---

## Platform & Deployment

- **Native desktop app** for Windows (NSIS installer) and macOS (DMG)
- **Custom app icon** — rose/maroon gradient briefcase with gold AI sparkle across all platform surfaces (taskbar, title bar, installer, dock, browser favicon)
- **Web preview mode** for quick browser-based development and demos
- **Offline-capable** — works fully offline after initial setup (Tailwind CSS bundled locally)
- **Automated CI/CD** — GitHub Actions builds both platforms and publishes GitHub Releases on version tags
- **Electron 32** with sandboxed preload, context isolation, and no node integration

---

## 1. Dashboard — Sales Command Center

The home screen gives you an at-a-glance view of your pipeline and next actions.

- **Contact count** — total contacts in your CRM
- **Pending tasks** — open action items awaiting completion
- **Emails needing response** — inbox messages flagged for follow-up
- **Emails sent today** — daily outbound counter
- **Meetings booked** — scheduled meeting tally
- **Smart Action Plan** — top 4 pending tasks with one-click "Execute" buttons
- **Recent Activity** — last 3 outbound emails with timestamps

---

## 2. Smart Inbox — AI-Scored Email Prioritization

Never wonder which email to answer first again.

- **AI lead scoring** — every inbound email scored 1–100 (100 = hottest lead)
- **Lead quality badges** — Hot, Warm, Cold visual indicators
- **One-sentence AI summaries** — instant context without opening the email
- **Filter tabs** — All, Unread, Needs Response, Archived — view exactly the slice you need
- **Inline search** — search by sender, subject, or company across all inbox emails
- **Mark Read / Unread** — toggle read status per email
- **Flag for response** — mark or unmark emails as needing a response
- **Archive** — archive emails to declutter without deleting
- **Delete** — permanently remove emails from inbox
- **Draft Reply** quick action — jump straight to the composer with context pre-loaded
- **Bulk inbox analysis** — score and summarize your entire inbox in one click
- **Email preview** — sender, subject, body snippet visible inline

---

## 3. Tasks & Calendar — AI-Powered Smart Agenda

Your AI sales assistant builds your daily schedule.

- **Quick-add task input** — add tasks manually in seconds
- **AI task generation** — analyzes your CRM contacts and generates prioritized daily actions
- **AI prioritization** — assigns priority scores (1–100) with color-coded urgency
- **Smart scheduling** — suggests time blocks with written rationale for each task
- **Mini calendar widget** — monthly view with date selection
- **Daily timeline** — hourly breakdown of your scheduled day
- **Contact & company association** — every task linked to a CRM record
- **One-click "Execute"** — jump from task to composer with contact context loaded
- **Task completion toggle** and deletion
- **Task edit modal** — full edit with type (follow-up, call, meeting, proposal, research, admin), priority (1–100), due date picker, contact association, rationale/notes, and status fields
- **Due date badges** — visual indicator on tasks with a scheduled due date

---

## 4. CRM & Contacts — Full Contact Lifecycle Management

Your single source of truth for every prospect and customer.

### Contact Management
- **Sortable contact table** — Name, Title/Company, Contact Info, Stage, Actions
- **Stage filter bar** — filter contacts by stage: All, Lead, Contact, Opportunity, Customer, Cold, Warm, Hot — with live result count
- **Contact stages** — Lead → Opportunity → Customer → Churned
- **Full contact records** — email, phone, name, company, job title, LinkedIn URL, notes
- **Edit and delete** — inline contact management

### Contact Dossier View
- **Full interaction timeline** — every thread message with timestamps
- **Quick actions** — Draft Outreach, Add Task, Log Call (persists to timeline with timestamp)
- **AI Intelligence panel** — Research Contact (B2B sales intelligence dossier), Follow-Up Strategy (urgency/timing/action recommendations), Call Prep Brief (routes to Tasks), Proposal Follow-Up Draft (routes to Outreach), and AI Action Plan generation
- **Action routing** — dossier AI buttons now close the modal and open the exact workspace where the output lands
- **Timeline message management** — delete individual timeline messages
- **Contact detail card** — clickable email, phone, LinkedIn links
- **Stage badge** and notes display
- **Expandable message details**
- **Call activity display** — logged calls shown with green badge in timeline

### Import & Sync
- **CSV import** — header auto-detection, email column validation, bulk creation
- **Automatic deduplication** — by email address on import
- **HubSpot sync** — pull contacts with field mapping (name, company, email, job title, phone, lifecycle stage)
- **Upsert logic** — updates existing contacts, adds new ones

---

## 5. AI Outreach — Email Composer & Strategy Engine

The core of SalesDirector. A full AI-powered email composition workspace.

### Composer Features
- **Personalization fields** — Recipient Name, Job Title, Company Name
- **Recipient validation** — real-time email format checking
- **Merge tags toolbar** — `[First Name]`, `[Company Name]`, `[Meeting Link]`
- **Auto-signature insertion** — appends your configured signature to every send
- **SMTP status indicator** — know if sending is ready before you hit Send
- **Draft auto-save** — composer content automatically saved to localStorage every 2 seconds; recovered on next visit
- **Draft auto-save indicator** — shows "Draft auto-saved" status in the composer footer
- **AI context workspace** — dedicated multi-line context pane for CRM research, follow-up strategy, and AI instructions
- **Resizable split-view drafting** — on wide screens the AI context stays visible beside the email body, and reps can drag the divider to rebalance both panes
- **Step loader** — navigate through multi-step sequence emails

### AI Writing Actions
| Action | What It Does |
|---|---|
| **Draft** | AI writes a complete email from scratch using contact context, thread history, company profile, and tone/length preferences |
| **Polish** | Improves your existing draft — enhances clarity, tone, and persuasion |
| **Suggest Subjects** | Generates 3 clickable subject line options based on the email body |
| **Pitch Meeting** | Generates a specialized meeting-request email with a 15-minute CTA |
| **Sequence** | Creates a full 3-step drip campaign: Initial Hook → Value-Add Follow-up → Breakup/Final Attempt (each with custom subject and body) |
| **Analyze Draft** | Returns 3-bullet improvement suggestions for conversion optimization |
| **Pre-Send Check** | AI analyzes your email across 6 dimensions (tone, clarity, personalization, CTA strength, length, professionalism) before sending |
| **Research Contact** | Generates a B2B sales intelligence dossier with role analysis, pain points, conversation starters, and deal potential (from dossier) |
| **Follow-Up Strategy** | AI recommends follow-up urgency, timing, channel, opening line, and strategic approach (from dossier), then loads it into the Outreach context workspace |

### Strategy Sidebar
- **Tone selector** — Professional, Persuasive, Friendly, Direct & Urgent, Consultative
- **Length selector** — Concise, Standard, Detailed
- **Thread history context** — feed prior conversation into AI for continuity
- **Ask Director for Strategy** — get psychological sales strategies and prospect-specific playbooks
- **Objection Crusher** — AI generates psychology-backed rebuttals and persuasive scripts
- **Summarize Context** — condense conversation history for quick context
- **Director's Insight** — persistent strategy display box mirrored by the larger composer context workspace

---

## 6. Settings — Configuration & Integration Hub

### System Health Dashboard
Eight real-time status indicators for instant diagnostics:
- Auth Session · Local Encrypted DB · Proxy Mode · Gemini AI Access · HubSpot Integration · SMTP Readiness · IMAP Readiness
- **Clear Saved Settings** button for factory reset
- **"Settings saved" confirmation** — visible checkmark + message appears whenever a setting is changed, auto-dismisses after 2.5 seconds

### Encrypted Local Database (Desktop Only)
- **Create & Unlock** — set a passphrase (min 8 characters) to create database
- **Lock / Unlock** — protect data when stepping away
- **Reset** — wipe encrypted database on this device
- **Auto-save** — contacts, threads, tasks, and inbox data saved automatically
- **Legacy migration** — one-time automatic migration from browser-encrypted storage on first unlock

### Secure Proxy Routing
- **Proxy Base URL** configuration
- **Proxy Shared Secret** — persists locally on-device until cleared

### Company & Sender Profile
- Company Website URL (enriches AI context)
- Sender Name, Reply-To Address, Auto-BCC (for CRM logging)
- Multi-line Email Signature (auto-appended to outbound emails)

### HubSpot CRM Integration
- Private App Access Token configuration (persists locally on-device until cleared)
- Contact sync and email engagement logging

### Email Server Configuration
- **SMTP** — Host, Port, Security (None / STARTTLS / SSL-TLS), Username, Password
- **IMAP** — Host, Port

### Sending Safety & Limits
- Max Daily Emails (1–5,000)
- Send Delay between messages (0–3,600 seconds)
- Active Hours — start time, end time, timezone (System default plus EST/CST/MST/PST overrides)

### AI Defaults & Provider Keys
- Default Tone and Length preferences
- **Multi-provider support** (settings persist locally on-device; use proxy mode if you do not want provider keys stored on the client):
  - Google Gemini (default)
  - OpenAI (ChatGPT)
  - Anthropic (Claude)
  - xAI (Grok)
  - Meta (Llama)

---

## 7. About — Diagnostics & Credits

- **Runtime diagnostics** — Application name, version, platform, architecture, Electron/Node/Chrome versions
- **Storage backend** — shows active persistence layer
- **Operating mode** — Firebase-backed vs. Local
- **Credits** — Akita Engineering branding, support email, website link

---

## 8. Cross-Cutting Features

### Dark Mode
- Full dark mode with one-click toggle in the header
- Preference persisted across app restarts
- Smooth theme transitions

### Global Search
- **Header search bar** — search contacts by name, email, or company from any tab
- **Live dropdown results** — shows up to 8 matching contacts with avatar initials, name, and company
- **Click-to-open** — select a result to open the contact dossier instantly

### Dynamic Avatar
- **Header avatar** — displays user initials computed from the configured sender name in Settings
- Falls back to "SD" when no sender name is configured

### Email Thread Tracking
- Email thread storage per contact
- Outbound message tracking with timestamps
- Thread context pull-in for AI composer
- HubSpot email engagement logging (when configured)

### Data Encryption & Security
- **AES-256-GCM** encryption for all local data at rest
- **PBKDF2** key derivation with 250,000 iterations
- **Passphrase never stored** — not in memory after lock, not on disk ever
- **Settings persist locally on-device** — provider keys, HubSpot token, mail credentials, and proxy settings survive restarts until cleared
- **Sandboxed Electron** — context isolation, no node integration, IPC-only bridge
- **Proxy mode** — preferred path when teams want vendor API keys kept server-side

### HubSpot Integration
- Two-way contact sync with field mapping
- Automatic email engagement logging on send
- Lifecycle stage mapping
- Contact ID association for thread linking

### CSV Contact Import
Supported column headers:
- `email` or `e-mail` (required)
- `name` or `firstname` + `lastname`
- `company` or `organization`
- `jobtitle` or `title`
- `phone`
- `stage` or `lifecyclestage`
- `linkedin`
- `notes`

---

## Technical Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Tailwind CSS 3 (bundled), Lucide React icons |
| Desktop | Electron 32, electron-builder 25 |
| Build | Vite 5 with `base: './'` for file:// compatibility |
| Encryption | Web Crypto API (AES-256-GCM, PBKDF2) |
| AI | Google Gemini API (default), multi-provider ready |
| CRM | HubSpot private app API |
| Proxy | Node.js Express-based secure proxy server |
| CI/CD | GitHub Actions matrix build (Windows + macOS) |
| Testing | Node.js built-in test runner |
