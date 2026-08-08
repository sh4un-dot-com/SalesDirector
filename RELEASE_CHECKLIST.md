# SalesDirector Production Release Checklist

Use this checklist before every production release.

## 1. Source Control and Branch Hygiene

- [ ] All intended changes are committed on the release branch.
- [ ] No accidental debug code, test fixtures, or placeholder secrets remain.
- [ ] Documentation updates are included for any behavior changes.

## 2. Local Validation Gates

- [ ] Dependencies install cleanly.

```powershell
npm install
```

- [ ] Tests pass.

```powershell
npm test
```

- [ ] Web production build succeeds.

```powershell
npm run build:web
```

- [ ] If shipping desktop, macOS packaging command is validated in CI or on macOS host.

## 3. Configuration and Secrets

- [ ] No API keys, SMTP passwords, HubSpot tokens, or Apple signing assets are committed.
- [ ] Proxy mode decision is explicit for this release.
- [ ] If proxy mode is enabled, server secrets are set and runtime tested.
- [ ] If direct mode is used, user setup guidance is updated and communicated.

## 4. Integration Readiness

- [ ] HubSpot private app token has required scopes.
- [ ] Contact sync succeeds for at least one real account.
- [ ] Outbound thread save works in Firestore.
- [ ] HubSpot email logging works when composer has a hubspotId.
- [ ] AI generation works for the **approved** provider path(s): Gemini / OpenAI / Anthropic / xAI / OpenRouter / local OpenAI-compatible / proxy.
- [ ] Settings → **Test Active Provider** passes on a golden workstation.
- [ ] If OpenRouter is approved, sample model id is documented for users.
- [ ] If local LLMs are approved, Ollama/LM Studio base URL + model naming is documented; desktop-only localhost note is clear.

## 5. Security and Compliance

- [ ] Confirm locally persisted settings behavior is intentional, documented, and clearable from Settings.
- [ ] Confirm proxy shared secret behavior (if configured) rejects mismatched requests.
- [ ] Confirm rate-limiting and request-size constraints are active in proxy mode.
- [ ] Confirm CORS origin policy is appropriate for deployment.

## 6. Observability and Supportability

- [ ] Proxy logs include request IDs and useful error context.
- [ ] Support team has current troubleshooting guide: [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).
- [ ] User-facing docs are current: [USER_MANUAL.md](USER_MANUAL.md), [SETUP.md](SETUP.md), [ONBOARDING.md](ONBOARDING.md), [PROXY_SETUP.md](PROXY_SETUP.md), [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md), [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md).

## 7. Desktop Artifacts and Signing (If Shipping Desktop)

- [ ] Unified desktop artifact workflow passes: [.github/workflows/desktop-build.yml](.github/workflows/desktop-build.yml).
- [ ] Linux AppImage launches on a current Fedora or Arch test machine.
- [ ] Linux Flatpak bundle installs and launches on a Flatpak-enabled Fedora or Arch test machine.
- [ ] Linux RPM package installs and launches on a current Fedora test machine.
- [ ] Linux Pacman package installs and launches on a current Arch test machine.
- [ ] Signed workflow secrets are configured in GitHub.
- [ ] Signed artifact workflow passes: [.github/workflows/release-macos-signed.yml](.github/workflows/release-macos-signed.yml).
- [ ] Codesign verification and Gatekeeper checks pass in workflow logs.
- [ ] Generated desktop artifacts are downloadable and install-tested.

## 8. Release Execution

- [ ] Version/tag is created using agreed naming convention.
- [ ] Release notes include user-facing changes and known limitations.
- [ ] Rollback plan is documented and owner assigned.

## 9. Post-Release Verification

- [ ] Smoke test core flows: contact sync, draft generation, send and save, inbox analysis.
- [ ] Monitor for error spikes in first 30 to 60 minutes.
- [ ] Capture post-release findings and update docs if needed.
