<!-- insrc:artifact BUILD-dc0bd8089ce15fcd-S001 -->

# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-10-31T13:16:01.626Z  ·  **Updated:** 2026-10-31T13:16:01.626Z

**Commit:** 387ca945e

## Triage rationale

Filed bugfix ISSUE, magnitude small.

## Summary

Removed the redundant created()===live.length count term from MaintenanceController's beforeRename check, leaving the identity-based live.every(...) check; added a test proving a released-but-acknowledged worker no longer abandons compaction while created() still lags.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/threads/__tests__/maintenance.test.ts` — **insrc-build** (2026-10-31T13:16:01.626Z)
- `src/daemon/threads/maintenance.ts` — **insrc-build** (2026-10-31T13:16:01.626Z)
