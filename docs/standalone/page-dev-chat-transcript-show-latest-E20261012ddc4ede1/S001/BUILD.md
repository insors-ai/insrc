<!-- insrc:artifact BUILD-ddc4ede1dbf84626-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T07:35:29.855Z  ·  **Updated:** 2026-10-12T07:55:35.663Z

**Commit:** 72fc12d2

## Summary

appendEvent now returns the index of the row it wrote; both sinks, the two outcome recorders and the user-row write first and post with rowIndex. A load-older handler answers one transcript-page for the active session and ignores stale or malformed requests. session-restored goes through one helper and carries firstIndex 0 and total; the whole transcript is still sent. Re-validated against the amended plan: a followed row is written before it is posted, and after a chat switch the follow stops, posting and writing nothing more, as before this change.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-ddc4ede1dbf84626-S001.json` — **insrc-build** (2026-10-12T07:55:35.663Z)
