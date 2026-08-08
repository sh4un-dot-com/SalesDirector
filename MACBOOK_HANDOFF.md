# SalesDirector MacBook Handoff Guide

Use this guide when you are sending SalesDirector to someone who is not technical and needs to get it running on a MacBook without developer setup.

---

## Best Delivery Method

The best handoff is a **signed and notarized macOS DMG**.

Why this matters:

- A signed DMG opens like a normal Mac app.
- An unsigned DMG can trigger scary security warnings that confuse nontechnical users.
- If you want the smoothest handoff, publish the signed DMG path described in [MAC_SIGNING_SETUP.md](MAC_SIGNING_SETUP.md).

If you are only sharing an internal test build, the app can still work, but the user may need the one-time Mac security bypass shown below.

---

## What You Should Send Them

Send these items together:

1. The `SalesDirector` macOS DMG.
2. This guide.
3. Their sender name and reply email address.
4. One AI setup method (pick exactly one and write it on a sticky note for them):
   - **Gemini / OpenAI / Anthropic / xAI:** provider name + API key, or
   - **OpenRouter:** API key + model id (example `openai/gpt-4o-mini`), or
   - **Local (advanced):** only if you already installed Ollama or LM Studio for them — base URL + model name, or
   - **Proxy mode:** proxy URL and proxy secret if your server uses one.
5. One contact source:
   A CSV file to import, or
   HubSpot access details if you want them to sync HubSpot.

---

## What The User Does

### 1. Install the app

1. Open the DMG.
2. Drag `SalesDirector` into the `Applications` folder.
3. Open `Applications` and launch `SalesDirector`.

### 2. If Mac blocks the app on first open

If the DMG is signed, the user should usually only need to click `Open`.

If the DMG is unsigned, use this exact fallback:

1. Close the warning.
2. Open `System Settings`.
3. Go to `Privacy & Security`.
4. Scroll down until you see the blocked app warning.
5. Click `Open Anyway`.
6. Launch `SalesDirector` again.

Alternate one-time method:

1. In `Applications`, right-click `SalesDirector`.
2. Click `Open`.
3. Click `Open` again in the confirmation prompt.

### 3. Complete the first four setup steps inside the app

When the app opens, go to `Settings` and complete these four required steps:

1. `Create or unlock your local database`
   Enter a passphrase and click `Create and Unlock`.
2. `Add your name and reply email`
   Fill in `Your Name` and `Reply-To Email Address`.
3. `Connect AI`
   - Open **Settings → AI Routing & Provider Keys**.
   - Choose the Active AI Provider from the sticky note you were given.
   - Paste the API key (and model id for OpenRouter, or base URL + model for local tools).
   - Or enter the proxy URL if your team uses proxy mode.
   - Click **Test Active Provider** and wait until it says Passed.
4. `Load contacts`
   Import a CSV or click `Sync HubSpot`.

Mailbox setup is optional. It is only needed if the user will use Smart Inbox, IMAP, SMTP, or Graph mail features.

If someone told you to use a “local” AI (Ollama / LM Studio), that only works in the desktop app with that program already running in the background. If Test fails, ask your admin — do not keep guessing URLs.

### 4. First success test

After the first four steps are green:

1. Open `CRM & Contacts`.
2. Select one contact.
3. Click `Draft Outreach`.
4. In `AI Outreach`, click `Draft`.

If that works, the app is ready for normal use.

---

## Simplest Recommended Setup

If the goal is the easiest possible handoff, use this path:

1. Send a signed and notarized DMG.
2. Use one AI provider only.
3. Give the user one API key or one proxy URL.
4. Start with CSV import instead of HubSpot.
5. Leave mailbox sync for later unless they truly need it on day one.

That avoids most first-day confusion.

---

## What To Tell The User Not To Worry About

They do **not** need to understand any of this to use the app:

- Node.js
- npm
- Electron
- Firebase
- GitHub Actions
- Proxy server internals
- macOS signing details

They only need the app, their login details, one AI connection method, and some contacts.

---

## If Something Goes Wrong

### The AI buttons do nothing or fail

- Check that the correct AI provider is selected.
- Check that the API key or proxy URL is entered correctly.
- In `Settings`, use `Test Active Provider` or `Test All Providers`.

### The app opens but there are no contacts

- Import the CSV again, or
- Go to `Settings` and confirm the HubSpot token or proxy is configured, then sync again.

### The mailbox features are not ready

- This is optional for day one.
- The user can still use CRM, AI Outreach, tasks, and contacts without mailbox sync.

### They forget the local database passphrase

- The encrypted local data cannot be recovered without the passphrase.
- If needed, reset the local encrypted database and start fresh.

### Mac says the app cannot be opened

- Use the `Open Anyway` or right-click `Open` steps above.
- For future handoffs, ship a signed and notarized DMG.

---

## Internal Note For You

If you want a truly zero-friction handoff, the technical work is not inside the app anymore. The remaining friction is distribution:

1. Ship a signed and notarized DMG.
2. Pre-decide the AI provider.
3. Keep day-one setup to the first four checklist items only.

For deeper setup details, use [SETUP.md](SETUP.md).
