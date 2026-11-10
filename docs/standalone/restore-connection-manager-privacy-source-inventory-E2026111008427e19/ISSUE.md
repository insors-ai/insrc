<!-- insrc:artifact ISSUE-08427e19db14ae7b -->

# Restore the connection-manager privacy source inventory

## Reproduction

Run the source inventory suite at src/daemon/db/__tests__/session-source-inventory.test.ts. The temporary-session inventory rejects the candidate file set, and the removal-source check rejects a stale digest. A read-only scan of the current checkout found 57 unlisted production files, 122 existing entries with source or site drift, no removed entries, and one stale removal-source digest. The counts include active working-tree changes and must be refreshed against the source selected for the fix. The macOS restart story T13 sweep first recorded this failure in the rollout evidence. [[c1]]

## Root cause

The checked-in test manifest has fallen behind production changes across the restart, review, analyzer and task-progress code. The compiler-backed audit compares candidate file membership, reviewed operation sites and source digests. The removal-source gate separately pins reviewed source digests. Added files and changed sites need review before those records can be updated. [[c1]]

## Fix intent

Reconcile the entire temporary-session and removal-source inventory against a pinned source revision. Inspect each new or changed boundary and its data flow, record specific classifications and rationale, retain the exact file/site, digest, design-source and readiness checks, and verify with the focused source inventory and connection privacy regressions. Track any runtime data-flow defect found during classification separately. Record the result as a dependency of macOS restart story T13. [[c1]]

## Citations

- **[[c1]]** `doc` `docs/standalone/restore-reliable-daemon-restart-macos-E202611103992d2e1/S001/test-evidence/t13-backend-sweep.md`
