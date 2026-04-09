# macOS Signing and Notarization Setup

This document configures GitHub Actions to build a signed and notarized DMG using the workflow in .github/workflows/release-macos-signed.yml.

## Required GitHub Secrets

Set these repository secrets:

- MAC_CERTIFICATE_P12_BASE64
- MAC_CERTIFICATE_PASSWORD
- APPLE_ID
- APPLE_APP_SPECIFIC_PASSWORD
- APPLE_TEAM_ID

## How to generate MAC_CERTIFICATE_P12_BASE64

1. Export your Developer ID Application certificate as a .p12 file from Keychain Access.
2. Base64 encode it.

PowerShell example:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("DeveloperID.p12")) | Set-Content cert-base64.txt
```

macOS/Linux example:

```bash
base64 -i DeveloperID.p12 > cert-base64.txt
```

Paste the content of cert-base64.txt into the MAC_CERTIFICATE_P12_BASE64 secret.

## Apple credentials

- APPLE_ID: your Apple ID email used for notarization.
- APPLE_APP_SPECIFIC_PASSWORD: app-specific password from appleid.apple.com.
- APPLE_TEAM_ID: your Apple Developer Team ID.

## Triggering the signed release workflow

1. Push a version tag such as v1.0.0, or
2. Trigger workflow_dispatch manually in GitHub Actions.

The workflow will:

1. Install deps and run tests.
2. Build signed and notarized DMG.
3. Verify codesign and Gatekeeper assessment.
4. Upload DMG as an artifact.

## Notes

- Unsigned DMG workflow remains available for internal testing.
- Signed artifacts are built on GitHub macOS runners.
- Keep certificate and Apple credentials only in GitHub Secrets, never in repository files.
