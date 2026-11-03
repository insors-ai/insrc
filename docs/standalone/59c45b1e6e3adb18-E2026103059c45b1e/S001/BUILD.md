<!-- insrc:artifact BUILD-59c45b1e6e3adb18-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-30T19:03:58.570Z  ·  **Updated:** 2026-10-30T19:07:41.273Z

**Commit:** 66b504e49

## Scope

Default the Connections repository dropdown to the opened repository

Open a VS Code workspace in a registered repository (or a subdirectory of one), then open Connections for the first time. Observed: the repository dropdown has no selection and connections require manually choosing the already-open repository. Expected: preselect the registered repository containing the opened path. [[c1]] [[c3]]

ConnectionsManagerHost.open loads and dispatches registered-roots but receives no opened-path context and only refreshes an existing model.repoRoot. createConnectionManager initializes repoRoot to null, while registered-roots retains existing selection without choosing an initial one. Thus the first open remains unselected. Grounding: analyze located the host/reducer; direct source inspection confirmed this behavior and activation wiring. [[c1]] [[c2]]

Use VS Code's opened path to preselect the deepest containing registered repository when there is no prior manager selection or retained draft. Prefer a local active file's containing workspace; otherwise use the opened workspace folder. Keep manual selection and unsaved draft ownership on reopen, preserve registered-root admission and path boundaries, and leave selection empty if there is no registered match. Never register a repository implicitly. Verify initial selection, nested paths, sibling-prefix rejection, multi-root context, no-match and manual/draft retention. [[c1]] [[c2]] [[c3]]

## Summary

Default the Connections dropdown to the deepest registered repository containing the opened local workspace/current file, preserving manual selection and unsaved drafts. Added the user-requested SQLite sample before advancing the issue; root/extension typechecks and all 36 connection tests passed.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-eda948eef958a33d.json` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/consumer-inventory.json` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `docs/standalone/59c45b1e6e3adb18-E2026103059c45b1e/S001/IMPLEMENTATION.md` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `docs/standalone/59c45b1e6e3adb18-E2026103059c45b1e/S001/evidence/connections.txt` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `docs/standalone/59c45b1e6e3adb18-E2026103059c45b1e/S001/evidence/host.txt` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `docs/standalone/default-connections-repository-dropdown-opened-repository-E20261030eda948ee/ISSUE.md` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `test-fixtures/connection-management/v1/MANUAL-FIXTURES.md` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `test-fixtures/connection-management/v1/manual-orders.sqlite` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `vscode-plugin/package.json` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `vscode-plugin/src/connections/__tests__/host.test.ts` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `vscode-plugin/src/connections/host.ts` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `vscode-plugin/src/extension.ts` — **insrc-build** (2026-10-30T19:07:41.273Z)
- `vscode-plugin/src/vscode.d.ts` — **insrc-build** (2026-10-30T19:07:41.273Z)
