<!-- insrc:artifact BUILD-c32aa60534232f36-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-29T09:21:26.771Z  ·  **Updated:** 2026-10-29T09:59:10.827Z

**Commit:** 279ead05f

## Summary

Implemented daemon-owned durable per-block review recovery with hash-chained journal replay, lease/generation fencing, uncertain attempt reservations, pending usage outbox and private-runtime exclusions. Deterministic process-crash integration preserves accepted evidence/findings and resumes unresolved work; production engine routing remains deferred to s6.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/workflow/code-review/investigation/__tests__/recovery-fixtures.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/__tests__/recovery-types.test.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/__tests__/recovery-worker.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/recovery-types.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/__tests__/recovery-journal.test.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/recovery-journal.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/__tests__/recovery-replay.test.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/recovery-replay.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/recovery-store.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/__tests__/recovery-owner.test.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/recovery-lifecycle.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/__tests__/recovery-attempts.test.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/recovery-attempts.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/__tests__/recovery-usage.test.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/recovery-usage.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `.gitignore` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/shared/review-runtime-paths.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/__tests__/recovery-exclusions.test.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/git-packets.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/source.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/runners/build/changed-files.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/__tests__/recovery-crash-worker.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/__tests__/recovery-integration.test.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/index.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
- `src/workflow/code-review/investigation/recovery-session.ts` — **insrc-build** (2026-10-29T10:15:53.302Z)
