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
- [ ] AI generation works in selected mode (direct key or proxy).

## 5. Security and Compliance

- [ ] Confirm sensitive settings are not persisted locally.
- [ ] Confirm proxy shared secret behavior (if configured) rejects mismatched requests.
- [ ] Confirm rate-limiting and request-size constraints are active in proxy mode.
- [ ] Confirm CORS origin policy is appropriate for deployment.

## 6. Observability and Supportability

- [ ] Proxy logs include request IDs and useful error context.
- [ ] Support team has current troubleshooting guide: [TROUBLESHOOTING_FAQ.md](TROUBLESHOOTING_FAQ.md).
- [ ] User-facing docs are current: [USER_MANUAL.md](USER_MANUAL.md), [HUBSPOT_GUIDE.md](HUBSPOT_GUIDE.md), [SETUP.md](SETUP.md).

## 7. macOS Artifact and Signing (If Shipping Desktop)

- [ ] Unsigned artifact workflow passes: [.github/workflows/build-macos-dmg.yml](.github/workflows/build-macos-dmg.yml).
- [ ] Signed workflow secrets are configured in GitHub.
- [ ] Signed artifact workflow passes: [.github/workflows/release-macos-signed.yml](.github/workflows/release-macos-signed.yml).
- [ ] Codesign verification and Gatekeeper checks pass in workflow logs.
- [ ] Generated DMG is downloadable and install-tested.

## 8. Release Execution

- [ ] Version/tag is created using agreed naming convention.
- [ ] Release notes include user-facing changes and known limitations.
- [ ] Rollback plan is documented and owner assigned.

## 9. Post-Release Verification

- [ ] Smoke test core flows: contact sync, draft generation, send and save, inbox analysis.
- [ ] Monitor for error spikes in first 30 to 60 minutes.
- [ ] Capture post-release findings and update docs if needed.
