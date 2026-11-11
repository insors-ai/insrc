<!-- insrc:artifact BUILD-4d6b9af722585010-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-10T19:05:52.393Z  ·  **Updated:** 2026-11-10T19:12:24.882Z

**Commit:** eac117220

## Scope

Restore the connection-manager privacy source inventory

Run the source inventory suite at src/daemon/db/__tests__/session-source-inventory.test.ts. The temporary-session inventory rejects the candidate file set, and the removal-source check rejects a stale digest. A read-only scan of the current checkout found 57 unlisted production files, 122 existing entries with source or site drift, no removed entries, and one stale removal-source digest. The counts include active working-tree changes and must be refreshed against the source selected for the fix. The macOS restart story T13 sweep first recorded this failure in the rollout evidence. [[c1]]

The checked-in test manifest has fallen behind production changes across the restart, review, analyzer and task-progress code. The compiler-backed audit compares candidate file membership, reviewed operation sites and source digests. The removal-source gate separately pins reviewed source digests. Added files and changed sites need review before those records can be updated. [[c1]]

Reconcile the entire temporary-session and removal-source inventory against a pinned source revision. Inspect each new or changed boundary and its data flow, record specific classifications and rationale, retain the exact file/site, digest, design-source and readiness checks, and verify with the focused source inventory and connection privacy regressions. Track any runtime data-flow defect found during classification separately. Record the result as a dependency of macOS restart story T13. [[c1]]

## Summary

Reconciled all candidate and removal-routing inventory drift against source 5c2931360. Classified 57 new files, reviewed 37 changes to detected sites and 81 source-only changes, and preserved the existing checks. Focused tests passed 12/12 and TypeScript passed on the pinned snapshot.

## Tasks validated

- ✗ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-08427e19db14ae7b.json` — **insrc-build** (2026-11-10T19:12:24.882Z)
- `.insrc/artifacts/ISSUE-08427e19db14ae7b.log.jsonl` — **insrc-build** (2026-11-10T19:12:24.882Z)
- `docs/standalone/restore-connection-manager-privacy-source-inventory-E2026111008427e19/ISSUE.md` — **insrc-build** (2026-11-10T19:12:24.882Z)
- `docs/standalone/restore-reliable-daemon-restart-macos-E202611103992d2e1/S001/test-evidence/t13-backend-sweep.md` — **insrc-build** (2026-11-10T19:12:24.882Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-10T19:12:24.882Z)
