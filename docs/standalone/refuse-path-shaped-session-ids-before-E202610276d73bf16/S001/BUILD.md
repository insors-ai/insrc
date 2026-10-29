<!-- insrc:artifact BUILD-6d73bf1602816c8f-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-29T14:10:58.594Z  ·  **Updated:** 2026-10-29T14:13:15.670Z

**Commit:** 922f9eaa7

## Scope

ISSUE-6d73bf1602816c8f (small bugfix): a session id that is not a single path segment (empty, '.', '..', or containing '/', '\\' or NUL) is refused by session.delete with its existing invalid-input answer before anything is purged, and purgeSession (src/daemon/handler-runtime.ts), on every path that reaches it (session.delete, session.deleteBulk, agent.discard, expiry/cap purge), removes a tmp directory only when it is a direct child of PATHS.tmp, logging and skipping otherwise. Single-segment ids keep today's behaviour.

## Triage rationale

Small bugfix routed issue -> build (no LLD): one guard function plus two checks in src/daemon/handler-runtime.ts and a test.

## Summary

Re-applied the session-id path guard taken out of s2 (41ba9df6f): session.delete refuses an id that is not a single path segment with invalid-input before anything is purged, and the shared purge removes a tmp directory only when the new sessionTmpDir finds it a direct child of the tmp root (logs and skips otherwise), covering deleteBulk, agent.discard and expiry. Tests cover the refusal (with every dependency untouchable) and sessionTmpDir; the session-source inventory digest for handler-runtime.ts is refreshed.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-29T14:13:15.670Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-29T14:13:15.670Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-29T14:13:15.670Z)
