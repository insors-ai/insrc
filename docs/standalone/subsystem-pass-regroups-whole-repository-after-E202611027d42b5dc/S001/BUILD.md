<!-- insrc:artifact BUILD-7d42b5dceb62afec-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-11-03T14:34:09.725Z  ·  **Updated:** 2026-11-03T14:55:18.938Z

**Commit:** 577df4ff8

## Summary

@714c4480e, @aa233ec49 and the log fix: three-mode runSubsystemPass over per-file contribution rows; the result carries mode, filesRead, elapsedMs and startedAt, and the 'subsystem pass: done' log line now carries all four (plus generation, subsystems and the summary counts). Tests unchanged from the previous turn: the settle scenario completes an unsaved caller's waiting call; every step matches a forced full pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/db/__tests__/subsystem-changes.test.ts` — **insrc-build** (2026-11-03T14:55:18.938Z)
- `src/db/entities.ts` — **insrc-build** (2026-11-03T14:55:18.938Z)
- `src/db/subsystems.ts` — **insrc-build** (2026-11-03T14:55:18.938Z)
- `src/indexer/__tests__/subsystem-incremental.test.ts` — **insrc-build** (2026-11-03T14:55:18.938Z)
- `src/indexer/subsystem-pass.ts` — **insrc-build** (2026-11-03T14:55:18.938Z)
