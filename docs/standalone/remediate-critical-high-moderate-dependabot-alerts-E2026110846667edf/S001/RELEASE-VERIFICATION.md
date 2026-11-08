# Release verification

The root lockfile has zero matching resolved instances for all 110 in-scope root Dependabot alerts. The four archived qualification lockfiles match their reviewed baseline bytes. The eight low alerts are outside this story.

The combined sweep is pending completion of targeted build validation. SQL Server live verification is the outstanding driver check. The standalone package passed clean macOS arm64/APFS and Linux arm64/ext4 installs and cross-release restore tests. See DRIVER-QUALIFICATION.md and NATIVE-QUALIFICATION.md for details.

## Post-deployment GitHub reconciliation

Status is pending a deployment to the default branch and completion of its dependency scan. Run the following from a session with access to the repository's Dependabot API. The command is read-only and includes fixed and dismissed states.

```sh
gh api --paginate --slurp 'repos/insors-ai/insrc/dependabot/alerts?per_page=100' |
  jq '[.[][] | {number, state, fixed_at, dismissed_at, manifest: .dependency.manifest_path}]'
```

Match the result to the captured alert IDs in DEPENDABOT-SNAPSHOT.json. Record whether each scoped alert is fixed, remains open, or is absent from the authenticated response. Investigate missing or still-open root IDs. Keep the following cases separate:

- The 12 Sharp alerts on the four archived qualification lockfiles describe original historical evidence. The files were preserved byte-for-byte. Record any decision about those tracker entries separately from production and standalone dependency remediation.
- Alert #41 is the ZIP symlink advisory. GitHub's metadata names no first patched version, while its affected range ends at 0.6.0. The same overwrite-enabled test reproduces outside writes on 0.5.18 and verifies preserved bytes and permissions on 0.6.1. If GitHub still reports the alert after its scan, record it as a tracker metadata discrepancy pending confirmation.
- The eight low-severity alerts are outside this release acceptance gate.

Keep authenticated tracker verification pending if the endpoint is unavailable or the scan has not completed. No tracker state was changed during the build.
